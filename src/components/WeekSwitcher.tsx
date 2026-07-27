import { CalendarPlus, ChevronLeft, ChevronRight } from "lucide-react";
import { getWeekStartIso } from "../plannerData";
import { formatWeekLabel } from "../lib/planMath";

export function WeekSwitcher({
  activeWeekStart,
  canPrev,
  canNext,
  onPrev,
  onNext,
  onJumpToDate,
  onNewWeek,
}: {
  activeWeekStart: string;
  canPrev: boolean;
  canNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  onJumpToDate: (dateIso: string) => void;
  onNewWeek: () => void;
}) {
  const isCurrent = activeWeekStart === getWeekStartIso();

  return (
    <div className="week-switcher">
      <div className="week-switcher-nav">
        <button
          type="button"
          className="icon-button"
          title="Previous week"
          aria-label="Previous week"
          onClick={onPrev}
          disabled={!canPrev}
        >
          <ChevronLeft size={18} aria-hidden="true" />
        </button>

        <span className="week-label">
          {formatWeekLabel(activeWeekStart)}
          {isCurrent && <span className="week-current-pill">Current</span>}
        </span>

        <button
          type="button"
          className="icon-button"
          title="Next week"
          aria-label="Next week"
          onClick={onNext}
          disabled={!canNext}
        >
          <ChevronRight size={18} aria-hidden="true" />
        </button>

        <label className="week-jump" title="Jump to any week">
          <span className="week-jump-label">Jump to</span>
          <input
            type="date"
            aria-label="Jump to week"
            value={activeWeekStart}
            onChange={(event) => onJumpToDate(event.target.value)}
          />
        </label>
      </div>

      <button type="button" className="secondary-button" onClick={onNewWeek}>
        <CalendarPlus size={16} aria-hidden="true" />
        New week
      </button>
    </div>
  );
}
