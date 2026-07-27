import { CalendarPlus, X } from "lucide-react";
import { useEffect, useState } from "react";
import { addDaysToIso, getWeekStartIso } from "../plannerData";
import { formatWeekLabel } from "../lib/planMath";

export function NewWeekModal({
  weekStarts,
  onClose,
  onConfirm,
}: {
  weekStarts: string[];
  onClose: () => void;
  onConfirm: (weekStart: string, carryOver: boolean) => void;
}) {
  // Default the picker to the week after the latest existing one.
  const latest = weekStarts[weekStarts.length - 1];
  const [dateValue, setDateValue] = useState(() =>
    latest ? addDaysToIso(latest, 7) : getWeekStartIso(),
  );
  const [carryOver, setCarryOver] = useState(true);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Resolve whatever day was picked to that week's Monday.
  const targetWeekStart = dateValue
    ? getWeekStartIso(new Date(`${dateValue}T00:00:00`))
    : "";
  const exists = targetWeekStart !== "" && weekStarts.includes(targetWeekStart);
  const priorKey = targetWeekStart
    ? weekStarts.filter((key) => key < targetWeekStart).pop()
    : undefined;

  function submit() {
    if (!targetWeekStart) return;
    onConfirm(targetWeekStart, carryOver && !exists && Boolean(priorKey));
  }

  return (
    <div className="modal-overlay" role="presentation" onMouseDown={onClose}>
      <div
        className="modal-panel"
        role="dialog"
        aria-modal="true"
        aria-label="New week"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="modal-head">
          <h2>New week</h2>
          <button type="button" className="icon-button" title="Close" onClick={onClose}>
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <label>
          <span>Pick any day in the week</span>
          <input
            type="date"
            value={dateValue}
            onChange={(event) => setDateValue(event.target.value)}
          />
        </label>

        {targetWeekStart && (
          <p className="modal-note">
            {exists ? (
              <>
                <strong>{formatWeekLabel(targetWeekStart)}</strong> already exists — you'll
                switch to it.
              </>
            ) : (
              <>
                Creates <strong>{formatWeekLabel(targetWeekStart)}</strong>.
              </>
            )}
          </p>
        )}

        {!exists && priorKey && (
          <label className="check-label modal-check">
            <input
              type="checkbox"
              checked={carryOver}
              onChange={(event) => setCarryOver(event.target.checked)}
            />
            Carry over unfinished tasks from {formatWeekLabel(priorKey)}
          </label>
        )}

        <div className="modal-foot">
          <span />
          <div className="modal-foot-actions">
            <button type="button" className="secondary-button" onClick={onClose}>
              Cancel
            </button>
            <button
              type="button"
              className="primary-button"
              onClick={submit}
              disabled={!targetWeekStart}
            >
              <CalendarPlus size={16} aria-hidden="true" />
              {exists ? "Go to week" : "Create week"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
