import { secondsForTask, formatHours, formatTimer } from "../lib/planMath";
import type { WeekPlan } from "../types";

export function ReviewView({
  plan,
  setPlan,
  now,
}: {
  plan: WeekPlan;
  setPlan: (updater: (plan: WeekPlan) => WeekPlan) => void;
  now: number;
}) {
  return (
    <section className="workspace">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Friday review</p>
          <h2>Planned vs. actual</h2>
        </div>
      </div>

      <ReviewPanels plan={plan} now={now} />

      <label className="review-notes">
        <span>Weekly summary</span>
        <textarea
          value={plan.reviewNotes}
          onChange={(event) =>
            setPlan((current) => ({ ...current, reviewNotes: event.target.value }))
          }
          rows={6}
        />
      </label>
    </section>
  );
}

export function ReviewPanels({ plan, now }: { plan: WeekPlan; now: number }) {
  const planned = plan.tasks.filter((task) => task.planned);
  const completed = planned.filter((task) => task.status === "done");
  const unplanned = plan.tasks.filter((task) => !task.planned);
  const overEstimate = plan.tasks.filter(
    (task) => secondsForTask(task, now) / 3600 > task.estimateHours + 0.25,
  );

  return (
    <div className="review-grid">
      <ReviewPanel
        title="Planned"
        value={formatHours(planned.reduce((sum, task) => sum + task.estimateHours, 0))}
        rows={planned.map((task) => `${task.title} (${formatHours(task.estimateHours)})`)}
      />
      <ReviewPanel
        title="Completed"
        value={`${completed.length}/${planned.length}`}
        rows={completed.map((task) => task.title)}
      />
      <ReviewPanel
        title="Unexpected"
        value={formatHours(unplanned.reduce((sum, task) => sum + secondsForTask(task, now) / 3600, 0))}
        rows={unplanned.map((task) => `${task.title} (${formatTimer(secondsForTask(task, now))})`)}
      />
      <ReviewPanel
        title="Time gaps"
        value={`${overEstimate.length}`}
        rows={overEstimate.map((task) => {
          const actual = secondsForTask(task, now) / 3600;
          return `${task.title}: ${formatHours(actual - task.estimateHours)} over`;
        })}
      />
    </div>
  );
}

function ReviewPanel({ title, value, rows }: { title: string; value: string; rows: string[] }) {
  return (
    <article className="review-panel">
      <span>{title}</span>
      <strong>{value}</strong>
      {rows.length ? (
        <ul>
          {rows.slice(0, 5).map((row) => (
            <li key={row}>{row}</li>
          ))}
        </ul>
      ) : (
        <p>No entries yet.</p>
      )}
    </article>
  );
}
