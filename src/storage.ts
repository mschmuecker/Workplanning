import { createDefaultWorkspace } from "./plannerData";
import type { DayKey, WeekPlan, Workspace, WorkTask } from "./types";

const STORAGE_KEY = "personal-workplanner:plan";
const API_URL = "/.netlify/functions/workplan";

export type SyncState = "local" | "loading" | "synced" | "saving" | "offline" | "error";

// Migrate older persisted tasks that used a single `day` field to the current
// multi-day `days: DayKey[]` shape, so previously-saved plans keep working.
function normalizeTask(task: WorkTask): WorkTask {
  const legacy = task as WorkTask & { day?: DayKey | "backlog" };
  if (Array.isArray(legacy.days)) return task;
  const days = legacy.day && legacy.day !== "backlog" ? [legacy.day] : [];
  const { day: _day, ...rest } = legacy;
  return { ...rest, days };
}

function normalizePlan(plan: WeekPlan): WeekPlan {
  return {
    ...plan,
    tasks: Array.isArray(plan.tasks) ? plan.tasks.map(normalizeTask) : [],
  };
}

// Accept either the current Workspace shape, a legacy single WeekPlan, or junk,
// and always return a valid Workspace with normalized (day→days) tasks.
export function normalizeWorkspace(raw: unknown): Workspace {
  if (!raw || typeof raw !== "object") return createDefaultWorkspace();

  const candidate = raw as Partial<Workspace> & Partial<WeekPlan>;

  if (candidate.weeks && typeof candidate.weeks === "object") {
    const weeks: Record<string, WeekPlan> = {};
    for (const [key, plan] of Object.entries(candidate.weeks)) {
      weeks[key] = normalizePlan(plan as WeekPlan);
    }

    const keys = Object.keys(weeks);
    if (keys.length === 0) return createDefaultWorkspace();

    const latest = keys.slice().sort()[keys.length - 1];
    const activeWeekStart =
      candidate.activeWeekStart && weeks[candidate.activeWeekStart]
        ? candidate.activeWeekStart
        : latest;

    return {
      weeks,
      activeWeekStart,
      updatedAt: candidate.updatedAt ?? new Date().toISOString(),
    };
  }

  // Legacy single WeekPlan (has tasks/weekStart but no weeks): wrap it.
  if (Array.isArray(candidate.tasks) || typeof candidate.weekStart === "string") {
    const plan = normalizePlan(raw as WeekPlan);
    return {
      weeks: { [plan.weekStart]: plan },
      activeWeekStart: plan.weekStart,
      updatedAt: plan.updatedAt ?? new Date().toISOString(),
    };
  }

  return createDefaultWorkspace();
}

export function loadLocalWorkspace(): Workspace {
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return createDefaultWorkspace();

  try {
    return normalizeWorkspace(JSON.parse(raw));
  } catch {
    return createDefaultWorkspace();
  }
}

export function saveLocalWorkspace(ws: Workspace) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(ws));
}

export async function loadRemoteWorkspace(): Promise<Workspace | null> {
  const response = await fetch(API_URL, {
    // Send the Netlify Identity `nf_jwt` cookie so the function can identify the
    // signed-in user and return that user's stored workspace.
    credentials: "include",
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error(`Remote load failed with ${response.status}`);
  }

  const payload = (await response.json()) as { plan?: unknown };
  return payload.plan ? normalizeWorkspace(payload.plan) : null;
}

export async function saveRemoteWorkspace(ws: Workspace) {
  const response = await fetch(API_URL, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ plan: ws }),
  });

  if (!response.ok) {
    throw new Error(`Remote save failed with ${response.status}`);
  }
}
