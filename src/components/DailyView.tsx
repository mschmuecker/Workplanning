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
  const dayTasks = plan.tasks.filter((task) => task.day === selectedDay);
  const backlogTasks = plan.tasks.filter((task) => task.day === "backlog");
  const selectedDayLabel = dayOptions.find((day) => day.key === selectedDay)?.label ?? "Monday";

  function assignTask(taskId: string, day: DayKey | "backlog") {
    setPlan((current) => ({
      ...current,
      tasks: current.tasks.map((task) => (task.id === taskId ? { ...task, day } : task)),
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
                onAssignDay={(day) => assignTask(task.id, day)}
              />
            ))
          ) : (
            <EmptyState title="No tasks planned for this day" detail="Pull work forward from the unscheduled list or log unplanned work above." />
          )}
        </div>

        <aside className="flow-column compact">
          <div className="column-heading">
            <h3>Unscheduled</h3>
            <span>{backlogTasks.length} tasks</span>
          </div>
          {backlogTasks.length ? (
            backlogTasks.map((task) => (
              <button
                className="backlog-row"
                key={task.id}
                type="button"
                onClick={() => assignTask(task.id, selectedDay)}
              >
                <span>{task.title}</span>
                <strong>{formatHours(task.estimateHours)}</strong>
              </button>
            ))
          ) : (
            <EmptyState title="Backlog is clear" detail="Weekly plan tasks assigned to a day will appear in the daily view." />
          )}
        </aside>
      </div>
    </section>
  );
}
