import { createDefaultPlan } from "./plannerData";
import type { DayKey, WeekPlan, WorkTask } from "./types";

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

export function loadLocalPlan(): WeekPlan {
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return createDefaultPlan();

  try {
    return normalizePlan(JSON.parse(raw) as WeekPlan);
  } catch {
    return createDefaultPlan();
  }
}

export function saveLocalPlan(plan: WeekPlan) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(plan));
}


export async function loadRemotePlan(): Promise<WeekPlan | null> {
  const response = await fetch(API_URL, {
    // Send the Netlify Identity `nf_jwt` cookie so the function can identify the
    // signed-in user and return that user's stored plan.
    credentials: "include",
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error(`Remote load failed with ${response.status}`);
  }

  const payload = (await response.json()) as { plan?: WeekPlan | null };
  return payload.plan ? normalizePlan(payload.plan) : null;
}

export async function saveRemotePlan(plan: WeekPlan) {
  const response = await fetch(API_URL, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ plan }),
  });

  if (!response.ok) {
    throw new Error(`Remote save failed with ${response.status}`);
  }
}

