import { CalendarSync, Plus, Upload, X } from "lucide-react";
import { useRef } from "react";
import { TaskCard } from "./TaskCard";
import { EmptyState } from "./EmptyState";
import { secondsForTask, formatHours } from "../lib/planMath";
import type { DayKey, TaskStatus, WeekPlan, WorkSection, WorkTask } from "../types";

/** Outlook (Microsoft Graph) connection state, supplied by useGraphCalendar. */
export interface OutlookControls {
  available: boolean; // false when VITE_MS_CLIENT_ID is unset: hide the feature
  connected: boolean;
  busy: boolean;
  accountLabel: string | null;
  error: string | null;
  onImport: () => void;
  onDisconnect: () => void;
  onDismissError: () => void;
}

export function WeeklyView({
  plan,
  onNewTask,
  onEditTask,
  onImportCalendar,
  outlook,
  updateSection,
  addSection,
  newSectionName,
  setNewSectionName,
  startTimer,
  stopTimer,
  setTaskStatus,
  deleteTask,
  setPlan,
  now,
}: {
  plan: WeekPlan;
  onNewTask: () => void;
  onEditTask: (task: WorkTask) => void;
  onImportCalendar: (text: string) => void;
  outlook: OutlookControls;
  updateSection: (sectionId: string, patch: Partial<WorkSection>) => void;
  addSection: () => void;
  newSectionName: string;
  setNewSectionName: (value: string) => void;
  startTimer: (taskId: string) => void;
  stopTimer: (taskId: string) => void;
  setTaskStatus: (taskId: string, status: TaskStatus) => void;
  deleteTask: (taskId: string) => void;
  setPlan: (updater: (plan: WeekPlan) => WeekPlan) => void;
  now: number;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) {
      const text = await file.text();
      onImportCalendar(text);
    }
    // Reset so selecting the same file again still fires a change event.
    event.target.value = "";
  }
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

  return (
    <section className="workspace">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Monday setup</p>
          <h2>Weekly plan</h2>
        </div>
      </div>

      <div className="workspace-actions">
        {/* Outlook is optional: with no client id configured the button is
            absent entirely and .ics import remains the calendar path. */}
        {outlook.available && (
          <>
            <button
              type="button"
              className="secondary-button"
              onClick={outlook.onImport}
              disabled={outlook.busy}
              title={outlook.accountLabel ? `Connected as ${outlook.accountLabel}` : undefined}
            >
              <CalendarSync size={16} aria-hidden="true" />
              {outlook.busy
                ? "Reading Outlook..."
                : outlook.connected
                  ? "Import from Outlook"
                  : "Connect Outlook"}
            </button>
            {outlook.connected && !outlook.busy && (
              <button
                type="button"
                className="icon-button"
                title={`Disconnect ${outlook.accountLabel ?? "Outlook"}`}
                onClick={outlook.onDisconnect}
              >
                <X size={16} aria-hidden="true" />
              </button>
            )}
          </>
        )}
        <button
          type="button"
          className="secondary-button"
          onClick={() => fileInputRef.current?.click()}
        >
          <Upload size={16} aria-hidden="true" />
          Import .ics
        </button>
        <button type="button" className="primary-button" onClick={onNewTask}>
          <Plus size={16} aria-hidden="true" />
          Add task
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".ics,text/calendar"
          onChange={handleFileChange}
          hidden
        />
      </div>

      {outlook.error && (
        <p className="outlook-error" role="alert">
          <span>{outlook.error}</span>
          <button
            type="button"
            className="icon-button"
            title="Dismiss"
            onClick={outlook.onDismissError}
          >
            <X size={14} aria-hidden="true" />
          </button>
        </p>
      )}

      <div className="section-editor">
        {plan.sections.map((section) => (
          <div className="section-edit-row" key={section.id}>
            <input
              type="color"
              value={section.color}
              onChange={(event) => updateSection(section.id, { color: event.target.value })}
              aria-label={`${section.name} color`}
            />
            <input
              value={section.name}
              onChange={(event) => updateSection(section.id, { name: event.target.value })}
              aria-label="Section name"
            />
            <input
              value={section.focus}
              onChange={(event) => updateSection(section.id, { focus: event.target.value })}
              aria-label="Section focus"
            />
          </div>
        ))}
        <div className="section-edit-row add-section-row">
          <span />
          <input
            value={newSectionName}
            onChange={(event) => setNewSectionName(event.target.value)}
            placeholder="New section"
            aria-label="New section name"
          />
          <button type="button" className="secondary-button" onClick={addSection}>
            <Plus size={16} aria-hidden="true" />
            Add section
          </button>
        </div>
      </div>

      <div className="section-list">
        {plan.sections.map((section) => {
          const tasks = plan.tasks.filter((task) => task.sectionId === section.id);
          const estimate = tasks.reduce((sum, task) => sum + task.estimateHours, 0);
          const actual = tasks.reduce((sum, task) => sum + secondsForTask(task, now) / 3600, 0);
          return (
            <section className="work-section" key={section.id}>
              <div className="work-section-heading">
                <div className="section-color" style={{ backgroundColor: section.color }} />
                <div>
                  <h3>{section.name}</h3>
                  <p>{section.focus}</p>
                </div>
                <span>
                  {formatHours(estimate)} planned | {formatHours(actual)} actual
                </span>
              </div>

              {tasks.length ? (
                tasks.map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    section={section}
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
                <EmptyState title="No tasks in this section" detail="Add weekly work and group it here when it belongs to this area." />
              )}
            </section>
          );
        })}
      </div>
    </section>
  );
}
