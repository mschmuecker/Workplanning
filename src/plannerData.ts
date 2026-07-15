import type { DayKey, WeekPlan, WorkTask } from "./types";

export const dayOptions: Array<{ key: DayKey; label: string; short: string }> = [
  { key: "mon", label: "Monday", short: "Mon" },
  { key: "tue", label: "Tuesday", short: "Tue" },
  { key: "wed", label: "Wednesday", short: "Wed" },
  { key: "thu", label: "Thursday", short: "Thu" },
  { key: "fri", label: "Friday", short: "Fri" },
];

const storageWeekFormat = new Intl.DateTimeFormat("en-CA", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function createId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

export function getWeekStartIso(date = new Date()) {
  const next = new Date(date);
  const day = next.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  next.setDate(next.getDate() + diff);
  next.setHours(0, 0, 0, 0);
  return storageWeekFormat.format(next);
}

export function getTodayKey(): DayKey {
  const today = new Date().getDay();
  if (today === 2) return "tue";
  if (today === 3) return "wed";
  if (today === 4) return "thu";
  if (today === 5) return "fri";
  return "mon";
}

function task(
  title: string,
  sectionId: string,
  estimateHours: number,
  days: DayKey[],
  planned = true,
): WorkTask {
  return {
    id: createId("task"),
    title,
    sectionId,
    days,
    estimateHours,
    planned,
    status: "planned",
    actualSeconds: 0,
    timerStartedAt: null,
    notes: "",
    createdAt: new Date().toISOString(),
  };
}

export function createDefaultPlan(): WeekPlan {
  const weekStart = getWeekStartIso();
  const sections = [
    {
      id: "section-projects",
      name: "Project Work",
      focus: "Committed feature work and planned deliverables.",
      color: "#1f6feb",
    },
    {
      id: "section-support",
      name: "Support & Follow-up",
      focus: "QANs, review follow-up, and stakeholder requests.",
      color: "#c2410c",
    },
    {
      id: "section-growth",
      name: "Learning & Admin",
      focus: "Process work, documentation, and weekly planning.",
      color: "#0f766e",
    },
  ];

  return {
    id: `week-${weekStart}`,
    ownerName: "Your Name",
    ownerRole: "Application Coordinator",
    weekStart,
    weeklyCapacityHours: 40,
    reviewNotes:
      "Use the review tab on Friday to summarize delivery, blockers, and unplanned work that displaced planned priorities.",
    sections,
    tasks: [
      task("Define weekly priorities and success criteria", "section-growth", 1, ["mon"]),
      task("Build planned project deliverable", "section-projects", 6, ["mon", "tue"]),
      task("Handle support follow-ups from last week", "section-support", 2, ["tue"]),
      task("Deep work block for implementation", "section-projects", 8, ["wed", "thu"]),
      task("Document decisions and handoffs", "section-growth", 2, ["thu"]),
      task("Friday review and next-week carryover", "section-growth", 1, ["fri"]),
    ],
    updatedAt: new Date().toISOString(),
  };
}
