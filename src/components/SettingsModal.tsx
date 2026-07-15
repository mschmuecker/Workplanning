import { RefreshCw, X } from "lucide-react";
import { useEffect } from "react";
import { getWeekStartIso } from "../plannerData";
import type { WeekPlan } from "../types";

export function SettingsModal({
  plan,
  setPlan,
  onClose,
  onStartNewWeek,
}: {
  plan: WeekPlan;
  setPlan: (updater: (plan: WeekPlan) => WeekPlan) => void;
  onClose: () => void;
  onStartNewWeek: () => void;
}) {
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="modal-overlay" role="presentation" onMouseDown={onClose}>
      <div
        className="modal-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Settings"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="modal-head">
          <h2>Settings</h2>
          <button type="button" className="icon-button" title="Close" onClick={onClose}>
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <div className="modal-row">
          <label>
            <span>Name</span>
            <input
              value={plan.ownerName}
              onChange={(event) =>
                setPlan((current) => ({ ...current, ownerName: event.target.value }))
              }
            />
          </label>
          <label>
            <span>Role</span>
            <input
              value={plan.ownerRole}
              onChange={(event) =>
                setPlan((current) => ({ ...current, ownerRole: event.target.value }))
              }
            />
          </label>
        </div>

        <div className="modal-row">
          <label>
            <span>Capacity</span>
            <input
              type="number"
              min="1"
              step="0.5"
              value={plan.weeklyCapacityHours}
              onChange={(event) =>
                setPlan((current) => ({
                  ...current,
                  weeklyCapacityHours: Number(event.target.value) || 0,
                }))
              }
            />
          </label>
          <label>
            <span>Week starts</span>
            <input
              type="date"
              value={plan.weekStart}
              onChange={(event) =>
                setPlan((current) => ({
                  ...current,
                  weekStart: event.target.value || getWeekStartIso(),
                }))
              }
            />
          </label>
        </div>

        <div className="modal-foot">
          <button type="button" className="secondary-button" onClick={onStartNewWeek}>
            <RefreshCw size={16} aria-hidden="true" />
            Start blank week
          </button>
          <div className="modal-foot-actions">
            <button type="button" className="primary-button" onClick={onClose}>
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
