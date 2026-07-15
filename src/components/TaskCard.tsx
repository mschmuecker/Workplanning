import { CheckCircle2, Pause, Pencil, Play, Square, Trash2 } from "lucide-react";
import { dayOptions } from "../plannerData";
import { secondsForTask, formatHours, formatTimer, statusLabels } from "../lib/planMath";
import type { DayKey, TaskStatus, WorkSection, WorkTask } from "../types";

export function TaskCard({
  task,
  section,
  now,
  onEdit,
  onStart,
  onStop,
  onStatus,
  onDelete,
  onToggleDay,
}: {
  task: WorkTask;
  section: WorkSection;
  now: number;
  onEdit: () => void;
  onStart: () => void;
  onStop: () => void;
  onStatus: (status: TaskStatus) => void;
  onDelete: () => void;
  onToggleDay: (day: DayKey) => void;
}) {
  const actualSeconds = secondsForTask(task, now);
  const actualHours = actualSeconds / 3600;
  const variance = actualHours - task.estimateHours;

  return (
    <article className={`task-card ${task.status === "done" ? "is-done" : ""}`}>
      <div className="task-accent" style={{ backgroundColor: section.color }} />
      <div className="task-main">
        <div className="task-title-row">
          <div>
            <h3>{task.title}</h3>
            <p>
              {section.name} | {task.planned ? "Planned" : "Unplanned"} |{" "}
              {statusLabels[task.status]}
            </p>
          </div>
          <span className={task.planned ? "pill" : "pill pill-unplanned"}>
            {task.planned ? "Planned" : "Unplanned"}
          </span>
        </div>

        <div className="task-stats">
          <span>Est. {formatHours(task.estimateHours)}</span>
          <span>Actual {formatTimer(actualSeconds)}</span>
          <span className={variance > 0.25 ? "variance-negative" : "variance-neutral"}>
            Gap {variance >= 0 ? "+" : ""}
            {formatHours(variance)}
          </span>
        </div>

        <div className="task-days" role="group" aria-label="Scheduled days">
          {dayOptions.map((day) => {
            const active = task.days.includes(day.key);
            return (
              <button
                key={day.key}
                type="button"
                className={`day-chip ${active ? "active" : ""}`}
                aria-pressed={active}
                title={active ? `Remove from ${day.label}` : `Add to ${day.label}`}
                onClick={() => onToggleDay(day.key)}
              >
                {day.short}
              </button>
            );
          })}
        </div>
      </div>

      <div className="task-controls">
        {task.timerStartedAt ? (
          <button className="icon-button danger-soft" type="button" title="Stop timer" onClick={onStop}>
            <Square size={16} aria-hidden="true" />
          </button>
        ) : (
          <button className="icon-button" type="button" title="Start timer" onClick={onStart}>
            <Play size={16} aria-hidden="true" />
          </button>
        )}
        <button className="icon-button" type="button" title="Edit task" onClick={onEdit}>
          <Pencil size={16} aria-hidden="true" />
        </button>
        <button
          className="icon-button"
          type="button"
          title={task.status === "done" ? "Reopen task" : "Mark complete"}
          onClick={() => onStatus(task.status === "done" ? "planned" : "done")}
        >
          {task.status === "done" ? <Pause size={16} /> : <CheckCircle2 size={16} />}
        </button>
        <button className="icon-button danger" type="button" title="Delete task" onClick={onDelete}>
          <Trash2 size={16} aria-hidden="true" />
        </button>
      </div>
    </article>
  );
}
