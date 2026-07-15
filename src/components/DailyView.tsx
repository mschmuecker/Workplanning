import { Plus } from "lucide-react";
import { TaskCard } from "./TaskCard";
import { EmptyState } from "./EmptyState";
import { dayOptions } from "../plannerData";
import { getSection, formatHours } from "../lib/planMath";
import type { DayKey, TaskStatus, WeekPlan, WorkTask } from "../types";

export function DailyView({
  plan,
  selectedDay,
  setSelectedDay,
  onNewTask,
  onEditTask,
  startTimer,
  stopTimer,
  setTaskStatus,
  deleteTask,
  setPlan,
  now,
}: {
  plan: WeekPlan;
  selectedDay: DayKey;
  setSelectedDay: (day: DayKey) => void;
  onNewTask: () => void;
  onEditTask: (task: WorkTask) => void;
  startTimer: (taskId: string) => void;
  stopTimer: (taskId: string) => void;
  setTaskStatus: (taskId: string, status: TaskStatus) => void;
  deleteTask: (taskId: string) => void;
  setPlan: (updater: (plan: WeekPlan) => WeekPlan) => void;
  now: number;
}) {
  const dayTasks = plan.tasks.filter((task) => task.days.includes(selectedDay));
  // "Available to add" = anything not already on this day and not finished, so a
  // multi-day or overrunning task stays pullable into any day until it's done.
  const availableTasks = plan.tasks.filter(
    (task) => !task.days.includes(selectedDay) && task.status !== "done",
  );
  const selectedDayLabel = dayOptions.find((day) => day.key === selectedDay)?.label ?? "Monday";

  function toggleDay(taskId: string, day: DayKey) {
    setPlan((current) => ({
      ...current,
      tasks: current.tasks.map((task) =>
        task.id === taskId
          ? {
              ...task,
              days: task.days.includes(day)
                ? task.days.filter((d) => d !== day)
                : [...task.days, day],
            }
          : task,
      ),
    }));
  }

  function addDay(taskId: string, day: DayKey) {
    setPlan((current) => ({
      ...current,
      tasks: current.tasks.map((task) =>
        task.id === taskId && !task.days.includes(day)
          ? { ...task, days: [...task.days, day] }
          : task,
      ),
    }));
  }

  return (
    <section className="workspace">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Daily execution</p>
          <h2>{selectedDayLabel}</h2>
        </div>
        <div className="day-picker" aria-label="Select day">
          {dayOptions.map((day) => (
            <button
              key={day.key}
              type="button"
              className={selectedDay === day.key ? "active" : ""}
              onClick={() => setSelectedDay(day.key)}
            >
              {day.short}
            </button>
          ))}
        </div>
      </div>

      <div className="workspace-actions">
        <button type="button" className="primary-button" onClick={onNewTask}>
          <Plus size={16} aria-hidden="true" />
          Log new work
        </button>
      </div>

      <div className="two-column">
        <div className="flow-column">
          <div className="column-heading">
            <h3>Today</h3>
            <span>{dayTasks.length} tasks</span>
          </div>
          {dayTasks.length ? (
            dayTasks.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                section={getSection(task.sectionId, plan.sections)}
                now={now}
                onEdit={() => onEditTask(task)}
                onStart={() => startTimer(task.id)}
                onStop={() => stopTimer(task.id)}
                onStatus={(status) => setTaskStatus(task.id, status)}
                onDelete={() => deleteTask(task.id)}
                onToggleDay={(day) => toggleDay(task.id, day)}
              />
            ))
          ) : (
            <EmptyState title="No tasks planned for this day" detail="Add work from the available list, or log new work above." />
          )}
        </div>

        <aside className="flow-column compact">
          <div className="column-heading">
            <h3>Available to add</h3>
            <span>{availableTasks.length} tasks</span>
          </div>
          {availableTasks.length ? (
            availableTasks.map((task) => (
              <button
                className="backlog-row"
                key={task.id}
                type="button"
                title={`Add "${task.title}" to ${selectedDayLabel}`}
                onClick={() => addDay(task.id, selectedDay)}
              >
                <span>{task.title}</span>
                <strong>{formatHours(task.estimateHours)}</strong>
              </button>
            ))
          ) : (
            <EmptyState title="Nothing left to add" detail="Every open task is already on this day. Log new work above to add more." />
          )}
        </aside>
      </div>
    </section>
  );
}
