import { Save, Trash2, X } from "lucide-react";
import { FormEvent, useEffect } from "react";
import { dayOptions } from "../plannerData";
import { statusLabels } from "../lib/planMath";
import type { DayKey, TaskStatus, WorkSection, WorkTask } from "../types";

export interface TaskEditorState {
  taskId: string | null; // null = creating a new task
  title: string;
  sectionId: string;
  estimateHours: string;
  day: DayKey | "backlog";
  planned: boolean;
  status: TaskStatus;
  notes: string;
}

export function createTaskEditorState(
  sectionId: string,
  day: DayKey | "backlog",
  planned = true,
): TaskEditorState {
  return {
    taskId: null,
    title: "",
    sectionId,
    estimateHours: "1",
    day,
    planned,
    status: "planned",
    notes: "",
  };
}

export function editorStateFromTask(task: WorkTask): TaskEditorState {
  return {
    taskId: task.id,
    title: task.title,
    sectionId: task.sectionId,
    estimateHours: String(task.estimateHours),
    day: task.day,
    planned: task.planned,
    status: task.status,
    notes: task.notes,
  };
}

export function TaskEditorModal({
  state,
  sections,
  onChange,
  onSave,
  onClose,
  onDelete,
}: {
  state: TaskEditorState;
  sections: WorkSection[];
  onChange: (state: TaskEditorState) => void;
  onSave: (state: TaskEditorState) => void;
  onClose: () => void;
  onDelete?: () => void;
}) {
  const isEditing = state.taskId !== null;

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function submit(event: FormEvent) {
    event.preventDefault();
    onSave(state);
  }

  return (
    <div className="modal-overlay" role="presentation" onMouseDown={onClose}>
      <form
        className="modal-panel"
        role="dialog"
        aria-modal="true"
        aria-label={isEditing ? "Edit task" : "New task"}
        onSubmit={submit}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="modal-head">
          <h2>{isEditing ? "Edit task" : "New task"}</h2>
          <button type="button" className="icon-button" title="Close" onClick={onClose}>
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <label>
          <span>Task or outcome</span>
          <input
            autoFocus
            value={state.title}
            onChange={(event) => onChange({ ...state, title: event.target.value })}
            placeholder="What needs to get done?"
          />
        </label>

        <div className="modal-row">
          <label>
            <span>Section</span>
            <select
              value={state.sectionId}
              onChange={(event) => onChange({ ...state, sectionId: event.target.value })}
            >
              {sections.map((section) => (
                <option key={section.id} value={section.id}>
                  {section.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Day</span>
            <select
              value={state.day}
              onChange={(event) =>
                onChange({ ...state, day: event.target.value as DayKey | "backlog" })
              }
            >
              <option value="backlog">Unscheduled</option>
              {dayOptions.map((day) => (
                <option key={day.key} value={day.key}>
                  {day.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="modal-row">
          <label>
            <span>Estimated hours</span>
            <input
              type="number"
              min="0"
              step="0.25"
              value={state.estimateHours}
              onChange={(event) => onChange({ ...state, estimateHours: event.target.value })}
            />
          </label>
          <label>
            <span>Status</span>
            <select
              value={state.status}
              onChange={(event) => onChange({ ...state, status: event.target.value as TaskStatus })}
            >
              {(["planned", "active", "done", "blocked"] as TaskStatus[]).map((status) => (
                <option key={status} value={status}>
                  {statusLabels[status]}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="check-label modal-check">
          <input
            type="checkbox"
            checked={!state.planned}
            onChange={(event) => onChange({ ...state, planned: !event.target.checked })}
          />
          Unplanned / interruption
        </label>

        <label>
          <span>Notes</span>
          <textarea
            rows={3}
            value={state.notes}
            onChange={(event) => onChange({ ...state, notes: event.target.value })}
          />
        </label>

        <div className="modal-foot">
          {onDelete ? (
            <button type="button" className="secondary-button danger" onClick={onDelete}>
              <Trash2 size={16} aria-hidden="true" />
              Delete
            </button>
          ) : (
            <span />
          )}
          <div className="modal-foot-actions">
            <button type="button" className="secondary-button" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="primary-button" disabled={!state.title.trim()}>
              <Save size={16} aria-hidden="true" />
              {isEditing ? "Save changes" : "Add task"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
