import {
  BarChart3,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  Clock,
  Eye,
  ListChecks,
  Settings2,
  User,
} from "lucide-react";
import { type User as NetlifyUser } from "@netlify/identity";
import { useEffect, useMemo, useState } from "react";
import {
  createId,
  getTodayKey,
  getWeekStartIso,
} from "./plannerData";
import type { DayKey, PlannerTab, TaskStatus, WorkSection, WorkTask, WorkView } from "./types";
import { formatHours, secondsForTask, stopRunningTask } from "./lib/planMath";
import { parseIcs, mapEventsToWeek, type ImportCandidate } from "./lib/ics";
import { ImportIcsModal } from "./components/ImportIcsModal";
import { useAuth } from "./hooks/useAuth";
import { useGraphCalendar } from "./hooks/useGraphCalendar";
import { usePlanPersistence } from "./hooks/usePlanPersistence";
import { AuthGate } from "./components/AuthGate";
import { SyncBadge } from "./components/SyncBadge";
import { PlanningBanner } from "./components/PlanningBanner";
import { SettingsModal } from "./components/SettingsModal";
import { WeekSwitcher } from "./components/WeekSwitcher";
import { NewWeekModal } from "./components/NewWeekModal";
import {
  TaskEditorModal,
  createTaskEditorState,
  editorStateFromTask,
  type TaskEditorState,
} from "./components/TaskEditorModal";
import { DailyView } from "./components/DailyView";
import { WeeklyView } from "./components/WeeklyView";
import { ReviewView } from "./components/ReviewView";
import { ManagerView } from "./components/ManagerView";

interface SummaryMetric {
  label: string;
  value: string;
  detail: string;
  tone: "blue" | "green" | "orange" | "red";
}

function App() {
  const { user, authReady, signIn, register, signOut, authError } = useAuth();

  if (!authReady) {
    return (
      <div className="auth-page">
        <div className="auth-panel">
          <div className="mark">
            <CalendarDays size={22} aria-hidden="true" />
          </div>
          <h1>Workplan Tracker</h1>
          <p>Checking your account session.</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <AuthGate signIn={signIn} register={register} authError={authError} />;
  }

  return <PlannerApp user={user} signOut={signOut} />;
}

function PlannerApp({ user, signOut }: { user: NetlifyUser; signOut: () => Promise<void> }) {
  const {
    plan,
    setPlan,
    syncState,
    weekStarts,
    activeWeekStart,
    goToWeek,
    goPrevWeek,
    goNextWeek,
    createOrGoToWeek,
  } = usePlanPersistence();
  const activeWeekIndex = weekStarts.indexOf(activeWeekStart);
  const canPrevWeek = activeWeekIndex > 0;
  const canNextWeek = activeWeekIndex > -1 && activeWeekIndex < weekStarts.length - 1;

  // Jump to the week containing any picked date. If that exact week has no data,
  // land on the nearest saved week on/before it (or the earliest week otherwise).
  function jumpToWeekForDate(dateIso: string) {
    if (!dateIso) return;
    const target = getWeekStartIso(new Date(`${dateIso}T00:00:00`));
    if (weekStarts.includes(target)) {
      goToWeek(target);
      return;
    }
    const onOrBefore = weekStarts.filter((week) => week <= target);
    const nearest = onOrBefore.length ? onOrBefore[onOrBefore.length - 1] : weekStarts[0];
    if (nearest) goToWeek(nearest);
  }
  const [now, setNow] = useState(Date.now());
  const [view, setView] = useState<WorkView>("planner");
  // Initial tab reflects weekly readiness: if the week isn't fully planned yet,
  // start on the weekly plan; otherwise drop straight into daily execution.
  // Only the initial value is derived — the tab stays user-switchable afterward.
  const [tab, setTab] = useState<PlannerTab>(() => {
    const plannedEstimate = plan.tasks
      .filter((task) => task.planned)
      .reduce((sum, task) => sum + task.estimateHours, 0);
    return plannedEstimate < plan.weeklyCapacityHours ? "weekly" : "daily";
  });
  const [selectedDay, setSelectedDay] = useState<DayKey>(() => getTodayKey());
  const [taskEditor, setTaskEditor] = useState<TaskEditorState | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [newWeekOpen, setNewWeekOpen] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [newSectionName, setNewSectionName] = useState("");
  // One preview/confirm flow shared by every calendar source; `source` is the
  // provenance stamped onto newly created tasks.
  const [calendarImport, setCalendarImport] = useState<{
    candidates: ImportCandidate[];
    skipped: number;
    source: "ics" | "outlook-calendar";
  } | null>(null);
  const graph = useGraphCalendar();

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  // Change 3: seed the owner name from the signed-in account, but never clobber
  // a name the user has deliberately set. Runs when the plan/user is ready.
  useEffect(() => {
    const needsSeed = !plan.ownerName.trim() || plan.ownerName === "Your Name";
    if (!needsSeed) return;
    // The gotrue/Netlify runtime user carries a snake_case `user_metadata`
    // (matching DEV_USER); the shipped TS type only exposes camelCase, so read
    // the real runtime field through a narrow cast.
    const fullName = (user as unknown as { user_metadata?: { full_name?: string } })
      .user_metadata?.full_name;
    const derived = fullName || user.email?.split("@")[0] || "Your Name";
    if (derived === plan.ownerName) return;
    setPlan((current) => {
      const stillNeeds = !current.ownerName.trim() || current.ownerName === "Your Name";
      return stillNeeds ? { ...current, ownerName: derived } : current;
    });
    // setPlan is stable from usePlanPersistence; guarded so it self-terminates.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan.ownerName, user]);

  const summary = useMemo(() => {
    const plannedTasks = plan.tasks.filter((task) => task.planned);
    const unplannedTasks = plan.tasks.filter((task) => !task.planned);
    const plannedEstimate = plannedTasks.reduce((sum, task) => sum + task.estimateHours, 0);
    const completedPlannedEstimate = plannedTasks
      .filter((task) => task.status === "done")
      .reduce((sum, task) => sum + task.estimateHours, 0);
    const actualHours = plan.tasks.reduce((sum, task) => sum + secondsForTask(task, now) / 3600, 0);
    const unplannedHours = unplannedTasks.reduce(
      (sum, task) => sum + secondsForTask(task, now) / 3600,
      0,
    );
    const capacityGap = plan.weeklyCapacityHours - actualHours;
    const completionRate = plannedEstimate
      ? Math.round((completedPlannedEstimate / plannedEstimate) * 100)
      : 0;

    return {
      plannedTasks,
      unplannedTasks,
      plannedEstimate,
      completedPlannedEstimate,
      actualHours,
      unplannedHours,
      capacityGap,
      completionRate,
    };
  }, [plan, now]);

  const metrics: SummaryMetric[] = [
    {
      label: "Planned load",
      value: formatHours(summary.plannedEstimate),
      detail: `${formatHours(plan.weeklyCapacityHours)} weekly capacity`,
      tone: "blue",
    },
    {
      label: "Actual tracked",
      value: formatHours(summary.actualHours),
      detail:
        summary.capacityGap >= 0
          ? `${formatHours(summary.capacityGap)} capacity remaining`
          : `${formatHours(Math.abs(summary.capacityGap))} over capacity`,
      tone: summary.capacityGap >= 0 ? "green" : "red",
    },
    {
      label: "Planned completed",
      value: `${summary.completionRate}%`,
      detail: `${formatHours(summary.completedPlannedEstimate)} of planned estimate closed`,
      tone: "green",
    },
    {
      label: "Unplanned work",
      value: formatHours(summary.unplannedHours),
      detail: `${summary.unplannedTasks.length} unexpected task${
        summary.unplannedTasks.length === 1 ? "" : "s"
      } logged`,
      tone: summary.unplannedHours > 4 ? "orange" : "blue",
    },
  ];

  // Planning readiness drives the collapsible summary's color and label.
  const plannedRatio =
    plan.weeklyCapacityHours > 0 ? summary.plannedEstimate / plan.weeklyCapacityHours : 0;
  const planningStatus = plannedRatio >= 1 ? "green" : plannedRatio >= 0.5 ? "yellow" : "red";
  const planningLabel =
    plannedRatio >= 1
      ? "Fully planned"
      : plannedRatio >= 0.5
        ? "Partially planned"
        : "Barely planned";

  function updateTask(taskId: string, updater: (task: WorkTask) => WorkTask) {
    setPlan((current) => ({
      ...current,
      tasks: current.tasks.map((task) => (task.id === taskId ? updater(task) : task)),
    }));
  }

  function openCreateTask(days: DayKey[], planned: boolean) {
    setTaskEditor(createTaskEditorState(plan.sections[0]?.id ?? "", days, planned));
  }

  function openEditTask(task: WorkTask) {
    setTaskEditor(editorStateFromTask(task));
  }

  function saveTaskEditor(state: TaskEditorState) {
    const title = state.title.trim();
    if (!title) return;
    const estimateHours = Number(state.estimateHours) || 0;
    const enteredActualSeconds = Math.max(0, Math.round((Number(state.actualHours) || 0) * 3600));

    if (state.taskId) {
      updateTask(state.taskId, (task) => {
        // Only treat time-worked as a manual override when it actually changed,
        // so editing other fields never disturbs a stored or running timer. When
        // it did change, adopt the new total and stop any running timer to avoid
        // double-counting on top of the manual value.
        const actualChanged = enteredActualSeconds !== task.actualSeconds;
        return {
          ...task,
          title,
          sectionId: state.sectionId,
          days: state.days,
          estimateHours,
          planned: state.planned,
          status: state.status,
          notes: state.notes,
          actualSeconds: actualChanged ? enteredActualSeconds : task.actualSeconds,
          timerStartedAt: actualChanged ? null : task.timerStartedAt,
        };
      });
    } else {
      const task: WorkTask = {
        id: createId("task"),
        title,
        sectionId: state.sectionId || plan.sections[0]?.id || "",
        days: state.days,
        estimateHours,
        planned: state.planned,
        status: state.status,
        actualSeconds: enteredActualSeconds,
        timerStartedAt: null,
        notes: state.notes,
        createdAt: new Date().toISOString(),
      };
      setPlan((current) => ({
        ...current,
        tasks: [...current.tasks, task],
      }));
    }

    setTaskEditor(null);
  }

  function deleteFromEditor(taskId: string) {
    deleteTask(taskId);
    setTaskEditor(null);
  }

  function startTimer(taskId: string) {
    const startedAt = new Date().toISOString();
    setPlan((current) => ({
      ...current,
      tasks: current.tasks.map((task) => {
        const stopped = stopRunningTask(task, Date.now());
        if (task.id !== taskId) return stopped;
        return {
          ...stopped,
          status: "active",
          timerStartedAt: startedAt,
        };
      }),
    }));
  }

  function stopTimer(taskId: string) {
    updateTask(taskId, (task) => stopRunningTask(task, Date.now()));
  }

  function setTaskStatus(taskId: string, status: TaskStatus) {
    updateTask(taskId, (task) => ({
      ...stopRunningTask(task, Date.now()),
      status,
    }));
  }

  function deleteTask(taskId: string) {
    setPlan((current) => ({
      ...current,
      tasks: current.tasks.filter((task) => task.id !== taskId),
    }));
  }

  function updateSection(sectionId: string, patch: Partial<WorkSection>) {
    setPlan((current) => ({
      ...current,
      sections: current.sections.map((section) =>
        section.id === sectionId ? { ...section, ...patch } : section,
      ),
    }));
  }

  function addSection() {
    if (!newSectionName.trim()) return;
    const section: WorkSection = {
      id: createId("section"),
      name: newSectionName.trim(),
      focus: "Describe the work this section groups together.",
      color: "#475569",
    };

    setPlan((current) => ({
      ...current,
      sections: [...current.sections, section],
    }));
    setNewSectionName("");
  }

  function handleImportCalendar(text: string) {
    const events = parseIcs(text);
    const candidates = mapEventsToWeek(events, plan.weekStart);
    // Every parsed event that didn't become a candidate (outside the active
    // week, on a weekend, or all-day) counts as skipped feedback for the user.
    const skipped = Math.max(0, events.length - candidates.length);
    setCalendarImport({ candidates, skipped, source: "ics" });
  }

  // Outlook path: connect (if needed), pull this week from Graph, then hand the
  // candidates to the same preview modal the ICS import uses.
  async function handleImportOutlook() {
    const result = await graph.importWeek(plan.weekStart);
    if (!result) return; // cancelled or failed; graph.error carries the reason
    setCalendarImport({ ...result, source: "outlook-calendar" });
  }

  function confirmCalendarImport(
    selected: ImportCandidate[],
    source: "ics" | "outlook-calendar",
  ) {
    const now = new Date().toISOString();
    setPlan((current) => {
      // Ensure a dedicated Meetings section exists for imported events.
      const sections = current.sections.some((s) => s.id === "section-meetings")
        ? current.sections
        : [
            ...current.sections,
            {
              id: "section-meetings",
              name: "Meetings",
              focus: "Imported calendar events.",
              color: "#7c3aed",
            },
          ];

      const bySourceId = new Map(
        current.tasks
          .filter((task) => task.sourceId)
          .map((task) => [task.sourceId as string, task]),
      );

      // Map an event's Outlook categories to an existing app section by name
      // (case-insensitive); fall back to the Meetings section when none match.
      const sectionByName = new Map(sections.map((s) => [s.name.trim().toLowerCase(), s.id]));
      function sectionForCategories(categories: string[]): string {
        for (const category of categories) {
          const match = sectionByName.get(category.trim().toLowerCase());
          if (match) return match;
        }
        return "section-meetings";
      }

      const tasks = [...current.tasks];
      for (const candidate of selected) {
        const existing = bySourceId.get(candidate.uid);
        if (existing) {
          // Update in place; keep id, actuals, status, and the user's section.
          const index = tasks.findIndex((task) => task.id === existing.id);
          if (index !== -1) {
            tasks[index] = {
              ...tasks[index],
              title: candidate.title,
              days: [candidate.day],
              estimateHours: candidate.estimateHours,
            };
          }
        } else {
          tasks.push({
            id: createId("task"),
            title: candidate.title,
            sectionId: sectionForCategories(candidate.categories),
            days: [candidate.day],
            estimateHours: candidate.estimateHours,
            planned: true,
            status: "planned",
            actualSeconds: 0,
            timerStartedAt: null,
            notes: "",
            createdAt: now,
            source,
            sourceId: candidate.uid,
          });
        }
      }

      return { ...current, sections, tasks };
    });
    setCalendarImport(null);
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="identity">
          <div className="mark">
            <CalendarDays size={22} aria-hidden="true" />
          </div>
          <div>
            <p className="eyebrow">{plan.ownerRole || "Weekly workplan"}</p>
            <h1>{plan.ownerName}</h1>
            <p className="account-line">{user.email}</p>
          </div>
        </div>

        <div className="header-actions">
          <div className="segmented" aria-label="View mode">
            <button
              className={view === "planner" ? "active" : ""}
              onClick={() => setView("planner")}
              type="button"
            >
              <ListChecks size={16} aria-hidden="true" />
              Planner
            </button>
            <button
              className={view === "manager" ? "active" : ""}
              onClick={() => setView("manager")}
              type="button"
            >
              <Eye size={16} aria-hidden="true" />
              Manager
            </button>
          </div>
          <SyncBadge syncState={syncState} />
          <button className="secondary-button" type="button" onClick={signOut}>
            <User size={16} aria-hidden="true" />
            Sign out
          </button>
          <button
            className="icon-button"
            type="button"
            title="Settings"
            onClick={() => setSettingsOpen(true)}
          >
            <Settings2 size={18} aria-hidden="true" />
          </button>
        </div>
      </header>

      <main>
        <WeekSwitcher
          activeWeekStart={activeWeekStart}
          canPrev={canPrevWeek}
          canNext={canNextWeek}
          onPrev={goPrevWeek}
          onNext={goNextWeek}
          onJumpToDate={jumpToWeekForDate}
          onNewWeek={() => setNewWeekOpen(true)}
        />

        <section className="metrics-section" aria-label="Weekly summary">
          <button
            type="button"
            className={`metrics-toggle status-${planningStatus}`}
            aria-expanded={summaryOpen}
            onClick={() => setSummaryOpen((value) => !value)}
          >
            {summaryOpen ? (
              <ChevronDown size={16} aria-hidden="true" />
            ) : (
              <ChevronRight size={16} aria-hidden="true" />
            )}
            <span className="metrics-toggle-title">Weekly summary</span>
            <span className="metrics-peek">
              {planningLabel} · {formatHours(summary.plannedEstimate)} of{" "}
              {formatHours(plan.weeklyCapacityHours)} planned
            </span>
          </button>

          {summaryOpen && (
            <div className="metrics-expanded">
              <PlanningBanner
                plannedEstimate={summary.plannedEstimate}
                capacityHours={plan.weeklyCapacityHours}
                showActions={view === "planner"}
                onAddPlanned={() => {
                  setTab("weekly");
                  openCreateTask([], true);
                }}
                onGoWeekly={() => setTab("weekly")}
                onStartDay={() => setTab("daily")}
              />

              <div className="metrics-grid">
                {metrics.map((metric) => (
                  <article className={`metric metric-${metric.tone}`} key={metric.label}>
                    <span>{metric.label}</span>
                    <strong>{metric.value}</strong>
                    <p>{metric.detail}</p>
                  </article>
                ))}
              </div>
            </div>
          )}
        </section>

        {view === "manager" ? (
          <ManagerView plan={plan} now={now} />
        ) : (
          <>
            <nav className="tabbar" aria-label="Planner sections">
              <button
                className={tab === "weekly" ? "active" : ""}
                type="button"
                onClick={() => setTab("weekly")}
              >
                <ListChecks size={16} aria-hidden="true" />
                Weekly Plan
              </button>
              <button
                className={tab === "daily" ? "active" : ""}
                type="button"
                onClick={() => setTab("daily")}
              >
                <Clock size={16} aria-hidden="true" />
                Daily
              </button>
              <button
                className={tab === "review" ? "active" : ""}
                type="button"
                onClick={() => setTab("review")}
              >
                <BarChart3 size={16} aria-hidden="true" />
                Review
              </button>
            </nav>

            {tab === "daily" && (
              <DailyView
                plan={plan}
                selectedDay={selectedDay}
                setSelectedDay={setSelectedDay}
                onNewTask={() => openCreateTask([selectedDay], false)}
                onEditTask={openEditTask}
                startTimer={startTimer}
                stopTimer={stopTimer}
                setTaskStatus={setTaskStatus}
                deleteTask={deleteTask}
                setPlan={setPlan}
                now={now}
              />
            )}

            {tab === "weekly" && (
              <WeeklyView
                plan={plan}
                onNewTask={() => openCreateTask([], true)}
                onEditTask={openEditTask}
                onImportCalendar={handleImportCalendar}
                outlook={{
                  available: graph.available,
                  connected: graph.connected,
                  busy: graph.busy,
                  accountLabel: graph.account?.username ?? null,
                  error: graph.error,
                  onImport: handleImportOutlook,
                  onDisconnect: graph.disconnect,
                  onDismissError: graph.clearError,
                }}
                updateSection={updateSection}
                addSection={addSection}
                newSectionName={newSectionName}
                setNewSectionName={setNewSectionName}
                startTimer={startTimer}
                stopTimer={stopTimer}
                setTaskStatus={setTaskStatus}
                deleteTask={deleteTask}
                setPlan={setPlan}
                now={now}
              />
            )}

            {tab === "review" && <ReviewView plan={plan} setPlan={setPlan} now={now} />}
          </>
        )}
      </main>

      {taskEditor && (
        <TaskEditorModal
          state={taskEditor}
          sections={plan.sections}
          onChange={setTaskEditor}
          onSave={saveTaskEditor}
          onClose={() => setTaskEditor(null)}
          onDelete={taskEditor.taskId ? () => deleteFromEditor(taskEditor.taskId!) : undefined}
        />
      )}

      {settingsOpen && (
        <SettingsModal
          plan={plan}
          setPlan={setPlan}
          onClose={() => setSettingsOpen(false)}
          onClearWeek={() => {
            setPlan((current) => ({ ...current, tasks: [] }));
            setSettingsOpen(false);
          }}
        />
      )}

      {calendarImport && (
        <ImportIcsModal
          candidates={calendarImport.candidates}
          existingSourceIds={plan.tasks
            .map((task) => task.sourceId)
            .filter((id): id is string => Boolean(id))}
          skippedCount={calendarImport.skipped}
          onClose={() => setCalendarImport(null)}
          onConfirm={(selected) => confirmCalendarImport(selected, calendarImport.source)}
        />
      )}

      {newWeekOpen && (
        <NewWeekModal
          weekStarts={weekStarts}
          onClose={() => setNewWeekOpen(false)}
          onConfirm={(weekStart, carryOver) => {
            createOrGoToWeek(weekStart, carryOver);
            setNewWeekOpen(false);
          }}
        />
      )}
    </div>
  );
}

export default App;
