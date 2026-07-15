import { ReviewPanels } from "./ReviewView";
import { EmptyState } from "./EmptyState";
import { dayOptions } from "../plannerData";
import { getSection, statusLabels, secondsForTask, formatTimer } from "../lib/planMath";
import type { WeekPlan } from "../types";

export function ManagerView({ plan, now }: { plan: WeekPlan; now: number }) {
  return (
    <section className="manager-view">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Read-only status</p>
          <h2>Manager summary</h2>
        </div>
      </div>

      <ReviewPanels plan={plan} now={now} />

      <div className="manager-days">
        {dayOptions.map((day) => {
          const tasks = plan.tasks.filter((task) => task.day === day.key);
          return (
            <section className="manager-day" key={day.key}>
              <div className="column-heading">
                <h3>{day.label}</h3>
                <span>{tasks.length} tasks</span>
              </div>
              {tasks.length ? (
                tasks.map((task) => (
                  <div className="manager-task-row" key={task.id}>
                    <span className={task.planned ? "status-dot" : "status-dot unplanned"} />
                    <div>
                      <strong>{task.title}</strong>
                      <p>
                        {getSection(task.sectionId, plan.sections).name} | {statusLabels[task.status]} |{" "}
                        {formatTimer(secondsForTask(task, now))}
                      </p>
                    </div>
                  </div>
                ))
              ) : (
                <EmptyState title="No work assigned" detail="Nothing has been planned for this day yet." />
              )}
            </section>
          );
        })}
      </div>

      <article className="manager-notes">
        <h3>Weekly summary</h3>
        <p>{plan.reviewNotes}</p>
      </article>
    </section>
  );
}
