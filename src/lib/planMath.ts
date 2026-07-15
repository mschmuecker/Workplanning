import type { TaskStatus, WorkSection, WorkTask } from "../types";

export const statusLabels: Record<TaskStatus, string> = {
  planned: "Planned",
  active: "Active",
  done: "Done",
  blocked: "Blocked",
};

export function secondsForTask(task: WorkTask, now: number) {
  const runningSeconds = task.timerStartedAt
    ? Math.max(0, Math.floor((now - new Date(task.timerStartedAt).getTime()) / 1000))
    : 0;
  return task.actualSeconds + runningSeconds;
}

export function formatHours(hours: number) {
  return `${hours.toFixed(hours >= 10 ? 0 : 1)}h`;
}

export function formatTimer(totalSeconds: number) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${hours}:${minutes.toString().padStart(2, "0")}:${seconds
    .toString()
    .padStart(2, "0")}`;
}

export function formatWeekLabel(weekStart: string) {
  const start = new Date(`${weekStart}T00:00:00`);
  const end = new Date(start);
  end.setDate(start.getDate() + 4);
  const month = new Intl.DateTimeFormat("en-US", { month: "short" });
  return `${month.format(start)} ${start.getDate()} - ${month.format(end)} ${end.getDate()}`;
}

export function getSection(sectionId: string, sections: WorkSection[]) {
  return sections.find((section) => section.id === sectionId) ?? sections[0];
}

export function stopRunningTask(task: WorkTask, now: number): WorkTask {
  if (!task.timerStartedAt) return task;
  return {
    ...task,
    actualSeconds: secondsForTask(task, now),
    timerStartedAt: null,
    status: task.status === "active" ? "planned" : task.status,
  };
}
