import {
  BrowserAuthError,
  PublicClientApplication,
  type AccountInfo,
} from "@azure/msal-browser";
import { mapEventsToWeek, type IcsEvent, type ImportCandidate } from "./ics";

// The client id is public by design (PKCE public client, no secret). When it is
// absent the whole Outlook feature is simply switched off — the app stays fully
// usable on ICS import + manual entry.
const clientId = (import.meta.env.VITE_MS_CLIENT_ID ?? "").trim();
export const graphConfigured = clientId.length > 0;

// Least privilege: read-only calendar plus the basic profile used for the
// "connected as" label. Tasks.Read is intentionally NOT requested yet.
export const graphScopes = ["User.Read", "Calendars.Read"];

/** Why a Graph operation failed, so callers can pick a friendly message. */
export type GraphErrorKind =
  | "not-configured"
  | "cancelled"
  | "popup-blocked"
  | "timed-out"
  | "admin-consent"
  | "unknown";

export class GraphError extends Error {
  kind: GraphErrorKind;
  constructor(kind: GraphErrorKind, message: string) {
    super(message);
    this.name = "GraphError";
    this.kind = kind;
  }
}

// MSAL must be initialized once before any auth call; keep a single shared
// promise so concurrent callers reuse the same instance.
let msalPromise: Promise<PublicClientApplication> | null = null;

function getMsal(): Promise<PublicClientApplication> {
  if (!graphConfigured) {
    return Promise.reject(
      new GraphError("not-configured", "VITE_MS_CLIENT_ID is not set."),
    );
  }
  if (!msalPromise) {
    msalPromise = (async () => {
      const instance = new PublicClientApplication({
        auth: {
          clientId,
          // Multi-tenant + personal accounts, so external users can connect too.
          authority: "https://login.microsoftonline.com/common",
          redirectUri: window.location.origin,
        },
        // localStorage so the "connected" state survives reloads and tabs.
        cache: { cacheLocation: "localStorage" },
        system: {
          // MSAL waits 60s by default for the popup to hand back a result. When
          // the popup is stuck on an error page it never will, and a full minute
          // of "Reading Outlook..." reads as a hang. Fail fast instead.
          popupBridgeTimeout: 20000,
        },
      });
      await instance.initialize();
      return instance;
    })();
    // A failed initialize must not poison every later attempt.
    msalPromise.catch(() => {
      msalPromise = null;
    });
  }
  return msalPromise;
}

// Translate whatever MSAL/Graph threw into a GraphError with a usable kind.
function toGraphError(error: unknown): GraphError {
  if (error instanceof GraphError) return error;

  if (error instanceof BrowserAuthError) {
    if (error.errorCode === "user_cancelled") {
      return new GraphError("cancelled", "Sign-in was cancelled.");
    }
    if (
      error.errorCode === "popup_window_error" ||
      error.errorCode === "empty_window_error"
    ) {
      return new GraphError("popup-blocked", "The sign-in popup was blocked.");
    }
    if (error.errorCode === "timed_out") {
      // The popup never handed a result back. In practice that means it is
      // sitting on a Microsoft error page (usually a redirect-URI mismatch),
      // so the popup's own text is the real diagnostic.
      return new GraphError("timed-out", "The sign-in popup never completed.");
    }
  }

  const text =
    error instanceof Error ? `${error.message}` : String(error ?? "Unknown error");

  // AADSTS65001/90094 = consent not granted / admin consent required.
  // AADSTS65004 = the user themselves declined the consent prompt.
  if (/AADSTS65001|AADSTS90094|admin_consent|consent_required/i.test(text)) {
    return new GraphError("admin-consent", text);
  }
  if (/AADSTS65004|access_denied|user_cancelled/i.test(text)) {
    return new GraphError("cancelled", text);
  }

  return new GraphError("unknown", text);
}

/** User-facing copy for a failure. `null` means "dismiss silently". */
export function graphErrorMessage(error: GraphError): string | null {
  switch (error.kind) {
    case "cancelled":
      return null;
    case "popup-blocked":
      return "Your browser blocked the Microsoft sign-in popup. Allow popups for this site, then try again.";
    case "timed-out":
      return "The Microsoft sign-in window didn't finish. If it showed an error, that message is the real cause — often this app's address isn't registered as a redirect URI. Try again, or use Import .ics.";
    case "admin-consent":
      return "Your organization needs an admin to approve calendar access. Use Import .ics instead.";
    case "not-configured":
      return "Outlook import is not configured for this deployment.";
    default:
      return `Couldn't reach Outlook (${error.message}). You can use Import .ics instead.`;
  }
}

/** The signed-in Microsoft account, if a cached session already exists. */
export async function getGraphAccount(): Promise<AccountInfo | null> {
  const msal = await getMsal();
  return msal.getAllAccounts()[0] ?? null;
}

export async function connectGraph(): Promise<AccountInfo> {
  const msal = await getMsal();
  try {
    // Popup, not redirect: the app already consumes the URL hash for Netlify
    // Identity on load, and a redirect flow would collide with it.
    //
    // prompt: "select_account" defeats browser SSO. Without it Microsoft silently
    // reuses whatever account the browser is already signed into (typically the
    // machine's work account), giving the user no way to pick a different one.
    const result = await msal.loginPopup({
      scopes: graphScopes,
      prompt: "select_account",
    });
    const account = result.account ?? msal.getAllAccounts()[0] ?? null;
    if (!account) throw new GraphError("unknown", "No account was returned.");
    msal.setActiveAccount(account);
    return account;
  } catch (error) {
    throw toGraphError(error);
  }
}

/** Drop the local token cache. Does not sign the user out of Microsoft itself. */
export async function disconnectGraph(): Promise<void> {
  if (!graphConfigured) return;
  try {
    const msal = await getMsal();
    const account = msal.getAllAccounts()[0];
    await msal.clearCache(account ? { account } : undefined);
  } catch {
    // Disconnecting is best-effort; never surface an error for it.
  }
}

async function getAccessToken(): Promise<string> {
  const msal = await getMsal();
  const account = msal.getAllAccounts()[0];
  if (!account) {
    const connected = await connectGraph();
    return getTokenForAccount(msal, connected);
  }
  return getTokenForAccount(msal, account);
}

async function getTokenForAccount(
  msal: PublicClientApplication,
  account: AccountInfo,
): Promise<string> {
  try {
    const result = await msal.acquireTokenSilent({ scopes: graphScopes, account });
    return result.accessToken;
  } catch {
    // Silent renewal failed (expired refresh token, new consent needed, ...):
    // fall back to an interactive popup.
    try {
      const result = await msal.acquireTokenPopup({ scopes: graphScopes, account });
      return result.accessToken;
    } catch (error) {
      throw toGraphError(error);
    }
  }
}

interface GraphDateTime {
  dateTime: string;
  timeZone?: string;
}

export interface GraphEvent {
  id: string;
  subject?: string | null;
  isAllDay?: boolean;
  categories?: string[] | null;
  start?: GraphDateTime | null;
  end?: GraphDateTime | null;
}

// Graph returns "2026-07-27T09:00:00.0000000" with no offset; because we send
// Prefer: outlook.timezone=<browser tz>, those wall-clock values are already in
// local time, so we build a local Date from the components.
function parseGraphDateTime(value: string | undefined): Date | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/.exec(value);
  if (!match) return null;
  return new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    Number(match[4]),
    Number(match[5]),
    Number(match[6]),
  );
}

function addDaysIso(weekStart: string, days: number): string {
  const date = new Date(`${weekStart}T00:00:00`);
  date.setDate(date.getDate() + days);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/**
 * Fetch the Mon-Sat window around `weekStart` from /me/calendarView. Unlike a
 * raw /events read, calendarView expands recurring series into instances, so no
 * RRULE handling is needed.
 */
export async function fetchCalendarWeek(weekStart: string): Promise<GraphEvent[]> {
  const token = await getAccessToken();
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

  const params = new URLSearchParams({
    startDateTime: `${weekStart}T00:00:00`,
    endDateTime: `${addDaysIso(weekStart, 5)}T00:00:00`,
    $select: "subject,start,end,isAllDay,categories,id",
    $orderby: "start/dateTime",
    $top: "200",
  });

  let url = `https://graph.microsoft.com/v1.0/me/calendarView?${params.toString()}`;
  const events: GraphEvent[] = [];

  // Follow @odata.nextLink so a busy week isn't silently truncated.
  while (url) {
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Prefer: `outlook.timezone="${timeZone}"`,
      },
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw toGraphError(
        new Error(`Graph returned ${response.status}. ${body.slice(0, 300)}`),
      );
    }

    const payload = (await response.json()) as {
      value?: GraphEvent[];
      "@odata.nextLink"?: string;
    };
    events.push(...(payload.value ?? []));
    url = payload["@odata.nextLink"] ?? "";
  }

  return events;
}

// Reshape Graph events into the shared calendar-event form so the ICS week
// filter / duration rounding / category passthrough apply unchanged.
function toCalendarEvents(events: GraphEvent[]): IcsEvent[] {
  const mapped: IcsEvent[] = [];
  for (const event of events) {
    const start = parseGraphDateTime(event.start?.dateTime);
    if (!start) continue;
    mapped.push({
      uid: event.id,
      title: (event.subject ?? "").trim() || "(untitled)",
      start,
      end: parseGraphDateTime(event.end?.dateTime),
      allDay: Boolean(event.isAllDay),
      categories: event.categories ?? [],
    });
  }
  return mapped;
}

/** Graph events -> the same ImportCandidate[] the ICS importer produces. */
export function mapGraphEventsToWeek(
  events: GraphEvent[],
  weekStart: string,
): ImportCandidate[] {
  return mapEventsToWeek(toCalendarEvents(events), weekStart);
}
