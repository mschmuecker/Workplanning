# Handoff — Microsoft Graph (Outlook) integration, Phase 2

This doc hands off the **Graph calendar/tasks integration** to a fresh chat. Phase 1
(ICS file import) is already built. Graph is designed to **reuse Phase 1's
event→task pipeline** — it's just another *source* that produces the same
`ImportCandidate[]` and flows through the same preview modal + upsert.

## Project facts
- App: `C:\EpicSource\Class\UI Class 571\project` — React 18 + TypeScript + Vite SPA.
- Backend: Netlify Functions + Netlify Blobs + **Netlify Identity** (per-user auth + storage).
- GitHub: `https://github.com/mschmuecker/Workplanning` (public). Netlify site: `https://tiny-belekoy-824d15.netlify.app`.
- Build/verify: `npm run build` (runs `tsc -b && vite build`, strict TS). Keep it green.
- Local dev auth bypass: `useAuth` short-circuits when `import.meta.env.DEV` (a stand-in DEV_USER), so `npm run dev` skips the Netlify login. MSAL popups can still work locally if `localhost` redirect URIs are registered.

## ⚠️ Working rules on this project (carry these over)
- **Do NOT push without the user reviewing first.** The user has an explicit "don't push until we review it together" rule. Build-verify locally, summarize the diff, wait for their go.
- There is a **large UNPUSHED local batch** already in the working tree (see below). Don't be surprised by uncommitted changes; they are intentional and reviewed-but-not-yet-pushed.
- Global npm points at Epic's Artifactory (`~/.npmrc`). Any `npm install` bakes `artifactory.epic.com` URLs into `package-lock.json`, which **breaks the Netlify build**. After installing a package (e.g. `@azure/msal-browser`), rewrite the new lockfile `resolved` URLs to the public registry:
  `sed -i 's#https://artifactory.epic.com/artifactory/api/npm/npm/#https://registry.npmjs.org/#g' package-lock.json` then verify 0 `artifactory` refs remain and JSON still parses.

## Unpushed local batch (as of handoff)
All build-green, all awaiting the user's push approval:
1. Week history + carry-over (Workspace model; `usePlanPersistence`, `WeekSwitcher`, migration in `storage.ts`).
2. New-week date picker (`NewWeekModal`) with exists-check + carry-over toggle.
3. Date-jump week navigation.
4. Status-colored collapsible weekly summary (planning banner folded into it; red/yellow/green).
5. Tab reorder (Weekly Plan first).
6. **ICS calendar import** (`lib/ics.ts`, `ImportIcsModal`, WeeklyView "Import .ics" button, `App.confirmIcsImport`) + Outlook category → section mapping + smaller-checkbox modal fix.

## Decisions already locked (do not relitigate)
- **Own multi-tenant Azure app**, not Epic's single-tenant "Epic Exchange Online API" app (that one is single-tenant + PowerShell-oriented and can't back a public web SPA, and won't serve external users).
- **Works for outsiders** is a hard requirement → register app as **"Accounts in any org directory + personal Microsoft accounts"**, MSAL authority `https://login.microsoftonline.com/common`.
- **Epic accounts will likely hit the admin-consent wall** (Epic disables user consent). That's expected. Epic users (incl. the user themselves) use the **ICS fallback** — already built. So the integration must be **optional and fail-soft**.
- **Client-side MSAL (`@azure/msal-browser`), PKCE, public client, no secret.** Read-only calendar needs no Netlify Function. Client ID is public → put it in `VITE_MS_CLIENT_ID` env var (safe to bundle; NOT a secret).
- **Use a popup (`loginPopup`/`acquireTokenPopup`), NOT redirect.** The app already processes the URL hash for Netlify Identity on load (`handleAuthCallback`); a redirect flow would collide. Popup keeps the two auth systems separate.
- Scopes: least privilege — delegated `Calendars.Read` (+ `User.Read`), add `Tasks.Read` only when doing the To Do phase.
- Calendar first (meetings = biggest untracked planned time), Tasks (Microsoft To Do) as a later add.

## What the user must provide before Graph can work
They register the app (Azure Portal → Entra ID → App registrations → New registration):
- Supported account types: **any org directory + personal Microsoft accounts** (multitenant).
- Platform **Single-page application (SPA)**, redirect URIs: `https://tiny-belekoy-824d15.netlify.app`, `http://localhost:5173`, `http://localhost:8888`.
- API permissions → Microsoft Graph → Delegated → `Calendars.Read`, `User.Read`.
- Then they give you the **Application (client) ID**, set as `VITE_MS_CLIENT_ID` (Netlify env var + local `.env.local`, which is gitignored).

## The reuse seam (this is the whole point)
Phase 1 already defines the target shapes and flow. Graph must produce the same `ImportCandidate[]` and reuse the modal + upsert:

- `src/lib/ics.ts`:
  - `ImportCandidate = { uid: string; title: string; day: DayKey; estimateHours: number; categories: string[] }`
  - `mapEventsToWeek(events, weekStart)` filters to the active week (Mon–Fri), skips all-day/weekend, rounds duration→`estimateHours`, passes categories.
- `src/components/ImportIcsModal.tsx`: preview/confirm modal. Props `{ candidates, existingSourceIds, skippedCount, onClose, onConfirm }`. **Rename/generalize** or reuse as-is for Graph (title says "Import calendar" — fine for both). Consider renaming to `ImportEventsModal` if you want it source-agnostic.
- `src/App.tsx`:
  - `handleImportCalendar(text)` — ICS entry point (parse → map → open modal).
  - `confirmIcsImport(selected)` — the shared **upsert**: ensures a purple `section-meetings` "Meetings" section, dedups by `sourceId` (updates title/days/estimate in place, preserves id/actuals/status/section), and for NEW tasks maps categories→section by name else Meetings; sets `source: "ics"`, `sourceId: candidate.uid`.
  - **For Graph:** add `handleImportGraph()` that fetches events, maps them to `ImportCandidate[]`, opens the SAME modal; reuse `confirmIcsImport` but set `source: "outlook-calendar"` (parameterize the source on the confirm, or add a sibling that passes source). The dedup key is `sourceId` = Graph event `id`.
- `src/types.ts`: `WorkTask.source?: "manual" | "ics" | "outlook-calendar" | "outlook-todo"`, `sourceId?: string`. `TaskCard` shows a "Calendar" pill for `ics`/`outlook-calendar`.
- `src/plannerData.ts`: `carryOverTasks` already EXCLUDES calendar-sourced tasks (they're week-specific) — Graph imports inherit this correctly.

## Graph → ImportCandidate mapping
Endpoint (delegated): `GET https://graph.microsoft.com/v1.0/me/calendarView?startDateTime=<MonISO>&endDateTime=<FriEndISO>&$select=subject,start,end,isAllDay,categories,id&$orderby=start/dateTime` with header `Prefer: outlook.timezone="<user tz>"`. Advantages over ICS: **calendarView auto-expands recurring events** into instances (no RRULE handling needed), and returns real `subject`, `categories`, and `id`.
Map each event: `uid = event.id`, `title = subject`, day from `start.dateTime` weekday (skip weekend/all-day), `estimateHours` = (end-start) rounded to 0.25 min 0.25, `categories = event.categories ?? []`. Then same week filter + upsert as ICS.

## Graceful failure states to implement (required)
The app must stay fully usable without Graph. Handle and show friendly messages for:
- **Admin approval required** (org disabled user consent) → "Your org needs an admin to approve calendar access; use ICS import instead."
- **Consent denied / popup closed** → non-error dismissal.
- **Popup blocked** → tell them to allow popups / retry.
- **No `VITE_MS_CLIENT_ID`** → hide/disable the "Connect Outlook" button entirely (feature simply absent), leaving ICS + manual entry.

## Suggested phase order
1. MSAL install (+ lockfile fix) + config (authority `common`, `VITE_MS_CLIENT_ID`, popup).
2. "Connect Outlook" button (Settings or Weekly actions), connect/disconnect state, graceful errors.
3. "Import this week" → `calendarView` → map → shared modal → shared upsert (`source: "outlook-calendar"`).
4. Later: Microsoft To Do (`/me/todo/lists/*/tasks`, `Tasks.Read`), `source: "outlook-todo"`, optional write-back.

## Phase 2 status — BUILT (steps 1-3 done, step 4 not started)
Implemented, build-green, unpushed:
- `@azure/msal-browser` added; lockfile `resolved` URLs rewritten off Artifactory (0 refs remain).
- `src/lib/graph.ts` — MSAL singleton (authority `common`, popup, `localStorage` cache,
  scopes `User.Read` + `Calendars.Read`), `GraphError`/`graphErrorMessage` classification,
  `fetchCalendarWeek()` (`/me/calendarView`, `Prefer: outlook.timezone`, follows
  `@odata.nextLink`), and `mapGraphEventsToWeek()` which reshapes Graph events into the
  ICS `IcsEvent` form and delegates to the existing `mapEventsToWeek()` — so the week
  filter, weekend/all-day skip, 0.25h rounding, and category passthrough are literally
  the same code path as ICS.
- `src/hooks/useGraphCalendar.ts` — connect / disconnect / busy / error state and
  `importWeek(weekStart)`, all fail-soft (returns `null` on failure, reason in `error`).
- `src/App.tsx` — `handleImportOutlook()`; the ICS-only `confirmIcsImport` is now
  `confirmCalendarImport(selected, source)` and the modal state carries `source`, so both
  sources share the Meetings-section / dedup-by-`sourceId` / category→section upsert.
- `src/components/WeeklyView.tsx` — "Connect Outlook" → "Import from Outlook" button plus
  a disconnect control and a dismissible error banner (`.outlook-error` in `styles.css`).
  The whole block is hidden when `VITE_MS_CLIENT_ID` is unset.
- `.env.example` documents the var. **Netlify needs `VITE_MS_CLIENT_ID` set as a build-time
  env var** — Vite inlines `VITE_*` at build time, so it will not pick it up at runtime.

Not yet verified against a live tenant (no client id at implementation time): the actual
consent flow, the exact AADSTS code Epic returns, and real `calendarView` payload shapes.

## Kickoff prompt for the new chat
> Read `docs/graph-integration-handoff.md`. Implement Phase 2 (Microsoft Graph Outlook **calendar** import) reusing the existing ICS pipeline. I'll provide the `VITE_MS_CLIENT_ID`. Build-verify with `npm run build`; do NOT push without my review.
