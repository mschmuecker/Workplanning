# Personal Workplanner

A single-page web app for planning your week, tracking where your time actually
goes, and seeing the gap between the two. It contrasts **planned work** against
**actual time tracked** and **unplanned interruptions**, so the weekly variance
stays visible instead of getting lost.

Built with React, TypeScript, and Vite on the front end, and Netlify
(Functions + Blobs + Identity) for authenticated, per-user persistence.

## What it does

- **Weekly plan** — group work into color-coded sections (e.g. Projects,
  Meetings, Support), add tasks with an hour estimate, and see planned vs.
  actual totals per section.
- **Daily view** — a focused list for the selected day with per-task
  start/stop timers, plus an "Unscheduled" backlog you can pull work from.
- **Live timers** — start a task and the elapsed time accrues in real time;
  starting one task automatically stops any other running task.
- **Unplanned work** — log interruptions as they happen and flag them as
  unplanned so they don't get counted against your original plan.
- **Friday review** — planned vs. completed, unexpected time, and tasks that
  ran over their estimate, plus a free-text weekly summary.
- **Manager view** — a read-only status roll-up of the week for visibility.
- **Weekly summary metrics** — planned load vs. capacity, actual tracked time,
  planned completion rate, and total unplanned hours.
- **Settings** — set your name, role, weekly capacity, and week start date, or
  start a fresh blank week.

## How it works

- **Auth gate** — the app is private. Users sign in or register through
  [Netlify Identity](https://docs.netlify.com/security/secure-access-to-sites/identity/);
  nothing is shown until a session exists.
- **Persistence** — the current week's plan is saved per user through a Netlify
  Function (`/api/workplan`, backed by `netlify/functions/workplan.ts`) that
  reads and writes [Netlify Blobs](https://docs.netlify.com/build/data-and-storage/netlify-blobs/).
  Saves are debounced (~700ms) and a sync badge shows the current state
  (Synced / Saving / Local only / Sync blocked).
- **Local fallback** — plans are always mirrored to browser `localStorage`, so
  the app still works for development or when the backend is unavailable.

## Tech stack

| Layer | Choice |
|-------|--------|
| UI | React 18 + TypeScript |
| Build | Vite 5 |
| Icons | lucide-react |
| Auth | @netlify/identity |
| Storage | Netlify Function + @netlify/blobs |
| Hosting | Netlify |

## Project layout

```text
src/
  App.tsx          Main UI: auth gate, planner, daily/weekly/review/manager views
  storage.ts       Local + remote (Netlify Function) persistence
  plannerData.ts   Default plan, week/day helpers, id generation
  types.ts         Shared types (WeekPlan, WorkTask, WorkSection, ...)
  styles.css       App styling
netlify/
  functions/
    workplan.ts    Per-user GET/PUT of the week plan via Netlify Blobs
netlify.toml       Build, dev, and /api/workplan redirect config
```

## Local development

```bash
npm install
npm run dev
```

Open http://127.0.0.1:5173/ — the UI runs with the local-storage fallback.

For full Identity + Function + Blobs testing, run through Netlify Dev:

```bash
npx netlify login
npx netlify link
npm run netlify:dev
```

Open http://127.0.0.1:8888/.

## Build

```bash
npm run build
```

Runs the TypeScript project build and produces the production bundle in `dist/`.
Preview it locally with `npm run preview`.

## Deployment (Netlify)

This app must be hosted on **Netlify** because it depends on Netlify Functions,
Blobs, and Identity — a static-only host (e.g. GitHub Pages) can't run the
backend.

1. Push this repository to GitHub.
2. In Netlify: **Add new site → Import an existing project** and select the repo.
   Build settings come from `netlify.toml`:
   - Build command: `npm run build`
   - Publish directory: `dist`
   - Functions directory: `netlify/functions`
3. Deploy the site.
4. Enable **Identity** for the site, then choose a registration model
   (open or invite-only) and create at least one user to sign in with.

Netlify Blobs requires no setup — it's available automatically once deployed.

See `docs/project-summary-and-setup.md` for full setup, demo-account, and
testing notes.
