import {
  BarChart3,
  CalendarDays,
  Clock,
  Eye,
  ListChecks,
  Settings2,
  User,
} from "lucide-react";
import { type User as NetlifyUser } from "@netlify/identity";
import { useEffect, useMemo, useState } from "react";
import {
  createDefaultPlan,
  createId,
  getTodayKey,
} from "./plannerData";
import type { DayKey, PlannerTab, TaskStatus, WorkSection, WorkTask, WorkView } from "./types";
import { formatHours, formatWeekLabel, secondsForTask, stopRunningTask } from "./lib/planMath";
import { useAuth } from "./hooks/useAuth";
import { usePlanPersistence } from "./hooks/usePlanPersistence";
import { AuthGate } from "./components/AuthGate";
import { SyncBadge } from "./components/SyncBadge";
import { PlanningBanner } from "./components/PlanningBanner";
import { SettingsModal } from "./components/SettingsModal";
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
  const { plan, setPlan, syncState } = usePlanPersistence();
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
  const [newSectionName, setNewSectionName] = useState("");

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

  function updateTask(taskId: string, updater: (task: WorkTask) => WorkTask) {
    setPlan((current) => ({
      ...current,
      tasks: current.tasks.map((task) => (task.id === taskId ? updater(task) : task)),
    }));
  }

  function openCreateTask(day: DayKey | "backlog", planned: boolean) {
    setTaskEditor(createTaskEditorState(plan.sections[0]?.id ?? "", day, planned));
  }

  function openEditTask(task: WorkTask) {
    setTaskEditor(editorStateFromTask(task));
  }

  function saveTaskEditor(state: TaskEditorState) {
    const title = state.title.trim();
    if (!title) return;
    const estimateHours = Number(state.estimateHours) || 0;

    if (state.taskId) {
      updateTask(state.taskId, (task) => ({
        ...task,
        title,
        sectionId: state.sectionId,
        day: state.day,
        estimateHours,
        planned: state.planned,
        status: state.status,
        notes: state.notes,
      }));
    } else {
      const task: WorkTask = {
        id: createId("task"),
        title,
        sectionId: state.sectionId || plan.sections[0]?.id || "",
        day: state.day,
        estimateHours,
        planned: state.planned,
        status: state.status,
        actualSeconds: 0,
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

  function startNewWeek() {
    const nextPlan = createDefaultPlan();
    setPlan(() => ({
      ...nextPlan,
      ownerName: plan.ownerName,
      ownerRole: plan.ownerRole,
      weeklyCapacityHours: plan.weeklyCapacityHours,
      sections: plan.sections,
      tasks: [],
    }));
    setTab("weekly");
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
            <p className="account-line">
              {formatWeekLabel(plan.weekStart)} · {user.email}
            </p>
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
        <section className="metrics-grid" aria-label="Weekly summary">
          {metrics.map((metric) => (
            <article className={`metric metric-${metric.tone}`} key={metric.label}>
              <span>{metric.label}</span>
              <strong>{metric.value}</strong>
              <p>{metric.detail}</p>
            </article>
          ))}
        </section>

        {view === "manager" ? (
          <ManagerView plan={plan} now={now} />
        ) : (
          <>
            <PlanningBanner
              plannedEstimate={summary.plannedEstimate}
              capacityHours={plan.weeklyCapacityHours}
              onAddPlanned={() => {
                setTab("weekly");
                openCreateTask("backlog", true);
              }}
              onGoWeekly={() => setTab("weekly")}
              onStartDay={() => setTab("daily")}
            />

            <nav className="tabbar" aria-label="Planner sections">
              <button
                className={tab === "daily" ? "active" : ""}
                type="button"
                onClick={() => setTab("daily")}
              >
                <Clock size={16} aria-hidden="true" />
                Daily
              </button>
              <button
                className={tab === "weekly" ? "active" : ""}
                type="button"
                onClick={() => setTab("weekly")}
              >
                <ListChecks size={16} aria-hidden="true" />
                Weekly Plan
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
                onNewTask={() => openCreateTask(selectedDay, false)}
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
                onNewTask={() => openCreateTask("backlog", true)}
                onEditTask={openEditTask}
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
          onStartNewWeek={() => {
            startNewWeek();
            setSettingsOpen(false);
          }}
        />
      )}
    </div>
  );
}

export default App;
