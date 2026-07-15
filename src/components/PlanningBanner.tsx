import { AlertCircle, CheckCircle2, Clock, ListChecks, Plus } from "lucide-react";
import { formatHours } from "../lib/planMath";

export function PlanningBanner({
  plannedEstimate,
  capacityHours,
  onAddPlanned,
  onGoWeekly,
  onStartDay,
}: {
  plannedEstimate: number;
  capacityHours: number;
  onAddPlanned: () => void;
  onGoWeekly: () => void;
  onStartDay: () => void;
}) {
  const met = plannedEstimate >= capacityHours;
  const over = plannedEstimate > capacityHours;
  const remaining = Math.max(0, capacityHours - plannedEstimate);
  const pct =
    capacityHours > 0 ? Math.min(100, Math.round((plannedEstimate / capacityHours) * 100)) : 0;
  const fillTone = over ? "over" : met ? "met" : "under";

  return (
    <section className={`planning-banner ${met ? "is-met" : "is-under"}`} aria-label="Weekly planning status">
      <div className="planning-banner-body">
        <div className="planning-banner-head">
          {met ? (
            <CheckCircle2 size={20} aria-hidden="true" />
          ) : (
            <AlertCircle size={20} aria-hidden="true" />
          )}
          <div>
            <h3>{met ? "Your week is fully planned" : "Your week isn't fully planned yet"}</h3>
            <p>
              {met
                ? `You've planned ${formatHours(plannedEstimate)} against your ${formatHours(
                    capacityHours,
                  )} capacity${over ? " (over capacity)" : ""}. Time to execute day by day.`
                : `${formatHours(plannedEstimate)} planned of ${formatHours(
                    capacityHours,
                  )} capacity — about ${formatHours(remaining)} left to plan.`}
            </p>
          </div>
        </div>

        <div
          className="capacity-meter"
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Planned load vs. capacity"
        >
          <div className={`capacity-meter-fill tone-${fillTone}`} style={{ width: `${pct}%` }} />
        </div>
        <div className="capacity-meter-label">
          <span>{formatHours(plannedEstimate)} planned</span>
          <span>{formatHours(capacityHours)} capacity</span>
        </div>
      </div>

      <div className="planning-banner-actions">
        {met ? (
          <button type="button" className="primary-button" onClick={onStartDay}>
            <Clock size={16} aria-hidden="true" />
            Start your day
          </button>
        ) : (
          <>
            <button type="button" className="primary-button" onClick={onAddPlanned}>
              <Plus size={16} aria-hidden="true" />
              Add planned work
            </button>
            <button type="button" className="secondary-button" onClick={onGoWeekly}>
              <ListChecks size={16} aria-hidden="true" />
              Go to weekly plan
            </button>
          </>
        )}
      </div>
    </section>
  );
}
