import { createDefaultPlan } from "./plannerData";
import type { WeekPlan } from "./types";

const STORAGE_KEY = "personal-workplanner:plan";
const API_URL = "/.netlify/functions/workplan";

export type SyncState = "local" | "loading" | "synced" | "saving" | "offline" | "error";

export function loadLocalPlan(): WeekPlan {
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return createDefaultPlan();

  try {
    return JSON.parse(raw) as WeekPlan;
  } catch {
    return createDefaultPlan();
  }
}

export function saveLocalPlan(plan: WeekPlan) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(plan));
}


export async function loadRemotePlan(): Promise<WeekPlan | null> {
  const response = await fetch(API_URL, {
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error(`Remote load failed with ${response.status}`);
  }

  const payload = (await response.json()) as { plan?: WeekPlan | null };
  return payload.plan ?? null;
}

export async function saveRemotePlan(plan: WeekPlan) {
  const response = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ plan }),
  });

  if (!response.ok) {
    throw new Error(`Remote save failed with ${response.status}`);
  }
}

