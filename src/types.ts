export type DayKey = "mon" | "tue" | "wed" | "thu" | "fri";
export type WorkView = "planner" | "manager";
export type PlannerTab = "daily" | "weekly" | "review";
export type TaskStatus = "planned" | "active" | "done" | "blocked";

export interface WorkSection {
  id: string;
  name: string;
  focus: string;
  color: string;
}

export interface WorkTask {
  id: string;
  title: string;
  sectionId: string;
  days: DayKey[]; // scheduled days; empty = unscheduled. A task may span several days.
  estimateHours: number;
  planned: boolean;
  status: TaskStatus;
  actualSeconds: number;
  timerStartedAt: string | null;
  notes: string;
  createdAt: string;
}

export interface WeekPlan {
  id: string;
  ownerName: string;
  ownerRole: string;
  weekStart: string;
  weeklyCapacityHours: number;
  reviewNotes: string;
  sections: WorkSection[];
  tasks: WorkTask[];
  updatedAt: string;
}
