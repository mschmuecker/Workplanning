import { CalendarPlus, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { dayOptions } from "../plannerData";
import type { ImportCandidate } from "../lib/ics";

export function ImportIcsModal({
  candidates,
  existingSourceIds,
  skippedCount,
  onClose,
  onConfirm,
}: {
  candidates: ImportCandidate[];
  existingSourceIds: string[];
  skippedCount: number;
  onClose: () => void;
  onConfirm: (selected: ImportCandidate[]) => void;
}) {
  // Track which candidate uids are selected; default every candidate checked.
  const [selected, setSelected] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(candidates.map((candidate) => [candidate.uid, true])),
  );

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const existing = useMemo(() => new Set(existingSourceIds), [existingSourceIds]);
  const shortLabel = useMemo(
    () => new Map(dayOptions.map((day) => [day.key, day.short])),
    [],
  );

  const selectedCandidates = candidates.filter((candidate) => selected[candidate.uid]);
  const selectedCount = selectedCandidates.length;

  function toggle(uid: string) {
    setSelected((current) => ({ ...current, [uid]: !current[uid] }));
  }

  return (
    <div className="modal-overlay" role="presentation" onMouseDown={onClose}>
      <div
        className="modal-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Import calendar"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="modal-head">
          <h2>Import calendar</h2>
          <button type="button" className="icon-button" title="Close" onClick={onClose}>
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        {candidates.length === 0 ? (
          <p className="modal-note">No events found in this week.</p>
        ) : (
          <div className="ics-list">
            {candidates.map((candidate) => {
              const isUpdate = existing.has(candidate.uid);
              return (
                <label className="ics-row" key={candidate.uid}>
                  <input
                    type="checkbox"
                    className="ics-check"
                    checked={Boolean(selected[candidate.uid])}
                    onChange={() => toggle(candidate.uid)}
                  />
                  <span className="ics-row-main">
                    <span className="ics-row-title">{candidate.title}</span>
                    {candidate.categories.length > 0 && (
                      <span className="ics-row-cats">
                        {candidate.categories.map((category) => (
                          <span className="ics-cat" key={category}>
                            {category}
                          </span>
                        ))}
                      </span>
                    )}
                  </span>
                  <span className="ics-row-meta">
                    <span className="ics-row-day">
                      {shortLabel.get(candidate.day) ?? candidate.day}
                    </span>
                    <span>{candidate.estimateHours}h</span>
                    <span className={isUpdate ? "pill pill-source" : "pill"}>
                      {isUpdate ? "Update" : "New"}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
        )}

        {skippedCount > 0 && (
          <p className="modal-note">
            {skippedCount} event{skippedCount === 1 ? "" : "s"} outside this week / weekend
            / all-day were skipped.
          </p>
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
              onClick={() => onConfirm(selectedCandidates)}
              disabled={selectedCount === 0}
            >
              <CalendarPlus size={16} aria-hidden="true" />
              Import {selectedCount} event{selectedCount === 1 ? "" : "s"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
