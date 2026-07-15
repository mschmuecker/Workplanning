import {
  AlertCircle,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  Clock,
  Eye,
  ListChecks,
  Pause,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  Save,
  Settings2,
  Square,
  Trash2,
  User,
  X,
} from "lucide-react";
import {
  getUser,
  handleAuthCallback,
  login,
  logout,
  signup,
  type User as NetlifyUser,
} from "@netlify/identity";
import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  createDefaultPlan,
  createId,
  dayOptions,
  getTodayKey,
  getWeekStartIso,
} from "./plannerData";
import {
  loadLocalPlan,
  loadRemotePlan,
  saveLocalPlan,
  saveRemotePlan,
  type SyncState,
} from "./storage";
import type { DayKey, PlannerTab, TaskStatus, WeekPlan, WorkSection, WorkTask, WorkView } from "./types";

interface TaskEditorState {
  taskId: string | null; // null = creating a new task
  title: string;
  sectionId: string;
  estimateHours: string;
  day: DayKey | "backlog";
  planned: boolean;
  status: TaskStatus;
  notes: string;
}

interface SummaryMetric {
  label: string;
  value: string;
  detail: string;
  tone: "blue" | "green" | "orange" | "red";
}

const statusLabels: Record<TaskStatus, string> = {
  planned: "Planned",
  active: "Active",
  done: "Done",
  blocked: "Blocked",
};

function secondsForTask(task: WorkTask, now: number) {
  const runningSeconds = task.timerStartedAt
    ? Math.max(0, Math.floor((now - new Date(task.timerStartedAt).getTime()) / 1000))
    : 0;
  return task.actualSeconds + runningSeconds;
}

function formatHours(hours: number) {
  return `${hours.toFixed(hours >= 10 ? 0 : 1)}h`;
}

function formatTimer(totalSeconds: number) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${hours}:${minutes.toString().padStart(2, "0")}:${seconds
    .toString()
    .padStart(2, "0")}`;
}

function formatWeekLabel(weekStart: string) {
  const start = new Date(`${weekStart}T00:00:00`);
  const end = new Date(start);
  end.setDate(start.getDate() + 4);
  const month = new Intl.DateTimeFormat("en-US", { month: "short" });
  return `${month.format(start)} ${start.getDate()} - ${month.format(end)} ${end.getDate()}`;
}

function getSection(sectionId: string, sections: WorkSection[]) {
  return sections.find((section) => section.id === sectionId) ?? sections[0];
}

function createTaskEditorState(
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

function editorStateFromTask(task: WorkTask): TaskEditorState {
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

function stopRunningTask(task: WorkTask, now: number): WorkTask {
  if (!task.timerStartedAt) return task;
  return {
    ...task,
    actualSeconds: secondsForTask(task, now),
    timerStartedAt: null,
    status: task.status === "active" ? "planned" : task.status,
  };
}

function usePlanPersistence() {
  const [plan, setPlanState] = useState<WeekPlan>(() => loadLocalPlan());
  const [syncState, setSyncState] = useState<SyncState>("local");
  const [remoteAvailable, setRemoteAvailable] = useState(false);

  useEffect(() => {
    let ignore = false;
    setSyncState("loading");

    loadRemotePlan()
      .then((remotePlan) => {
        if (ignore) return;
        setRemoteAvailable(true);
        if (remotePlan) {
          setPlanState(remotePlan);
          saveLocalPlan(remotePlan);
        }
        setSyncState("synced");
      })
      .catch(() => {
        if (!ignore) setSyncState("offline");
      });

    return () => {
      ignore = true;
    };
  }, []);

  useEffect(() => {
    saveLocalPlan(plan);
  }, [plan]);

  useEffect(() => {
    if (!remoteAvailable) return;
    const handle = window.setTimeout(() => {
      setSyncState("saving");
      saveRemotePlan(plan)
        .then(() => setSyncState("synced"))
        .catch(() => setSyncState("error"));
    }, 700);

    return () => window.clearTimeout(handle);
  }, [plan, remoteAvailable]);

  function setPlan(updater: (plan: WeekPlan) => WeekPlan) {
    setPlanState((current) => ({
      ...updater(current),
      updatedAt: new Date().toISOString(),
    }));
  }


  return { plan, setPlan, syncState };
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
            <p className="eyebrow">Weekly workplan</p>
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
        <section className="week-hero">
          <div>
            <p className="eyebrow">{plan.ownerRole}</p>
            <h2>{formatWeekLabel(plan.weekStart)}</h2>
            <p className="hero-copy">
              Planned work, actual time, and unplanned interruptions are tracked in one
              place so the weekly gap stays visible.
            </p>
          </div>
          <div className="hero-stat">
            <span>Updated</span>
            <strong>{new Date(plan.updatedAt).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}</strong>
          </div>
        </section>

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

function PlanningBanner({
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

function SettingsModal({
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

// In local `vite` dev there is no Netlify Identity endpoint, so signing in is
// impossible. Bypass the auth gate with a stand-in user; production builds
// (vite build) still go through the real Identity flow.
const DEV_AUTH_BYPASS = import.meta.env.DEV;

const DEV_USER = {
  id: "local-dev-user",
  email: "local@dev.test",
  user_metadata: { full_name: "Local Dev" },
} as unknown as NetlifyUser;

function useAuth() {
  const [user, setUser] = useState<NetlifyUser | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authError, setAuthError] = useState("");

  useEffect(() => {
    if (DEV_AUTH_BYPASS) {
      setUser(DEV_USER);
      setAuthReady(true);
      return;
    }

    let ignore = false;

    async function loadUser() {
      try {
        await handleAuthCallback();
        const currentUser = await getUser();
        if (!ignore) setUser(currentUser);
      } catch (error) {
        if (!ignore) setAuthError(error instanceof Error ? error.message : "Unable to load account.");
      } finally {
        if (!ignore) setAuthReady(true);
      }
    }

    loadUser();

    return () => {
      ignore = true;
    };
  }, []);

  async function signIn(email: string, password: string) {
    setAuthError("");
    try {
      const nextUser = await login(email, password);
      setUser(nextUser);
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Unable to sign in.");
    }
  }

  async function register(email: string, password: string, fullName: string) {
    setAuthError("");
    try {
      const nextUser = await signup(email, password, {
        full_name: fullName,
      });
      setUser(nextUser);
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Unable to create account.");
    }
  }

  async function signOut() {
    setAuthError("");
    if (DEV_AUTH_BYPASS) {
      setUser(DEV_USER);
      return;
    }
    await logout();
    setUser(null);
  }

  return { user, authReady, authError, signIn, register, signOut };
}

function AuthGate({
  signIn,
  register,
  authError,
}: {
  signIn: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, fullName: string) => Promise<void>;
  authError: string;
}) {
  const [mode, setMode] = useState<"signin" | "register">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    try {
      if (mode === "signin") {
        await signIn(email, password);
      } else {
        await register(email, password, fullName);
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-page">
      <form className="auth-panel" onSubmit={submit}>
        <div className="mark">
          <CalendarDays size={22} aria-hidden="true" />
        </div>
        <p className="eyebrow">Private workplan</p>
        <h1>{mode === "signin" ? "Sign in" : "Create account"}</h1>
        <p>
          Use an account to keep your weekly plan private and sync it through the
          Netlify backend.
        </p>

        {mode === "register" && (
          <label>
            <span>Name</span>
            <input
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              autoComplete="name"
              required
            />
          </label>
        )}

        <label>
          <span>Email</span>
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
            required
          />
        </label>

        <label>
          <span>Password</span>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete={mode === "signin" ? "current-password" : "new-password"}
            minLength={8}
            required
          />
        </label>

        {authError && <p className="auth-error">{authError}</p>}

        <button className="primary-button auth-submit" type="submit" disabled={submitting}>
          {submitting ? "Working" : mode === "signin" ? "Sign in" : "Create account"}
        </button>

        <button
          className="text-button"
          type="button"
          onClick={() => setMode((current) => (current === "signin" ? "register" : "signin"))}
        >
          {mode === "signin" ? "Create an account" : "Use an existing account"}
        </button>
      </form>
    </div>
  );
}

function SyncBadge({ syncState }: { syncState: SyncState }) {
  const labels: Record<SyncState, string> = {
    local: "Local",
    loading: "Checking",
    synced: "Synced",
    saving: "Saving",
    offline: "Local only",
    error: "Sync blocked",
  };

  return (
    <span className={`sync-badge sync-${syncState}`}>
      {syncState === "error" ? <AlertCircle size={14} /> : <Save size={14} />}
      {labels[syncState]}
    </span>
  );
}

function TaskEditorModal({
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

function TaskCard({
  task,
  section,
  now,
  onEdit,
  onStart,
  onStop,
  onStatus,
  onDelete,
  onAssignDay,
}: {
  task: WorkTask;
  section: WorkSection;
  now: number;
  onEdit: () => void;
  onStart: () => void;
  onStop: () => void;
  onStatus: (status: TaskStatus) => void;
  onDelete: () => void;
  onAssignDay: (day: DayKey | "backlog") => void;
}) {
  const actualSeconds = secondsForTask(task, now);
  const actualHours = actualSeconds / 3600;
  const variance = actualHours - task.estimateHours;

  return (
    <article className={`task-card ${task.status === "done" ? "is-done" : ""}`}>
      <div className="task-accent" style={{ backgroundColor: section.color }} />
      <div className="task-main">
        <div className="task-title-row">
          <div>
            <h3>{task.title}</h3>
            <p>
              {section.name} | {task.planned ? "Planned" : "Unplanned"} |{" "}
              {statusLabels[task.status]}
            </p>
          </div>
          <span className={task.planned ? "pill" : "pill pill-unplanned"}>
            {task.planned ? "Planned" : "Unplanned"}
          </span>
        </div>

        <div className="task-stats">
          <span>Est. {formatHours(task.estimateHours)}</span>
          <span>Actual {formatTimer(actualSeconds)}</span>
          <span className={variance > 0.25 ? "variance-negative" : "variance-neutral"}>
            Gap {variance >= 0 ? "+" : ""}
            {formatHours(variance)}
          </span>
        </div>
      </div>

      <div className="task-controls">
        <select
          value={task.day}
          onChange={(event) => onAssignDay(event.target.value as DayKey | "backlog")}
          aria-label={`Assign ${task.title} to day`}
        >
          <option value="backlog">Unscheduled</option>
          {dayOptions.map((day) => (
            <option key={day.key} value={day.key}>
              {day.short}
            </option>
          ))}
        </select>
        {task.timerStartedAt ? (
          <button className="icon-button danger-soft" type="button" title="Stop timer" onClick={onStop}>
            <Square size={16} aria-hidden="true" />
          </button>
        ) : (
          <button className="icon-button" type="button" title="Start timer" onClick={onStart}>
            <Play size={16} aria-hidden="true" />
          </button>
        )}
        <button className="icon-button" type="button" title="Edit task" onClick={onEdit}>
          <Pencil size={16} aria-hidden="true" />
        </button>
        <button
          className="icon-button"
          type="button"
          title={task.status === "done" ? "Reopen task" : "Mark complete"}
          onClick={() => onStatus(task.status === "done" ? "planned" : "done")}
        >
          {task.status === "done" ? <Pause size={16} /> : <CheckCircle2 size={16} />}
        </button>
        <button className="icon-button danger" type="button" title="Delete task" onClick={onDelete}>
          <Trash2 size={16} aria-hidden="true" />
        </button>
      </div>
    </article>
  );
}

function DailyView({
  plan,
  selectedDay,
  setSelectedDay,
  onNewTask,
  onEditTask,
  startTimer,
  stopTimer,
  setTaskStatus,
  deleteTask,
  setPlan,
  now,
}: {
  plan: WeekPlan;
  selectedDay: DayKey;
  setSelectedDay: (day: DayKey) => void;
  onNewTask: () => void;
  onEditTask: (task: WorkTask) => void;
  startTimer: (taskId: string) => void;
  stopTimer: (taskId: string) => void;
  setTaskStatus: (taskId: string, status: TaskStatus) => void;
  deleteTask: (taskId: string) => void;
  setPlan: (updater: (plan: WeekPlan) => WeekPlan) => void;
  now: number;
}) {
  const dayTasks = plan.tasks.filter((task) => task.day === selectedDay);
  const backlogTasks = plan.tasks.filter((task) => task.day === "backlog");
  const selectedDayLabel = dayOptions.find((day) => day.key === selectedDay)?.label ?? "Monday";

  function assignTask(taskId: string, day: DayKey | "backlog") {
    setPlan((current) => ({
      ...current,
      tasks: current.tasks.map((task) => (task.id === taskId ? { ...task, day } : task)),
    }));
  }

  return (
    <section className="workspace">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Daily execution</p>
          <h2>{selectedDayLabel}</h2>
        </div>
        <div className="day-picker" aria-label="Select day">
          {dayOptions.map((day) => (
            <button
              key={day.key}
              type="button"
              className={selectedDay === day.key ? "active" : ""}
              onClick={() => setSelectedDay(day.key)}
            >
              {day.short}
            </button>
          ))}
        </div>
      </div>

      <div className="workspace-actions">
        <button type="button" className="primary-button" onClick={onNewTask}>
          <Plus size={16} aria-hidden="true" />
          Log new work
        </button>
      </div>

      <div className="two-column">
        <div className="flow-column">
          <div className="column-heading">
            <h3>Today</h3>
            <span>{dayTasks.length} tasks</span>
          </div>
          {dayTasks.length ? (
            dayTasks.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                section={getSection(task.sectionId, plan.sections)}
                now={now}
                onEdit={() => onEditTask(task)}
                onStart={() => startTimer(task.id)}
                onStop={() => stopTimer(task.id)}
                onStatus={(status) => setTaskStatus(task.id, status)}
                onDelete={() => deleteTask(task.id)}
                onAssignDay={(day) => assignTask(task.id, day)}
              />
            ))
          ) : (
            <EmptyState title="No tasks planned for this day" detail="Pull work forward from the unscheduled list or log unplanned work above." />
          )}
        </div>

        <aside className="flow-column compact">
          <div className="column-heading">
            <h3>Unscheduled</h3>
            <span>{backlogTasks.length} tasks</span>
          </div>
          {backlogTasks.length ? (
            backlogTasks.map((task) => (
              <button
                className="backlog-row"
                key={task.id}
                type="button"
                onClick={() => assignTask(task.id, selectedDay)}
              >
                <span>{task.title}</span>
                <strong>{formatHours(task.estimateHours)}</strong>
              </button>
            ))
          ) : (
            <EmptyState title="Backlog is clear" detail="Weekly plan tasks assigned to a day will appear in the daily view." />
          )}
        </aside>
      </div>
    </section>
  );
}

function WeeklyView({
  plan,
  onNewTask,
  onEditTask,
  updateSection,
  addSection,
  newSectionName,
  setNewSectionName,
  startTimer,
  stopTimer,
  setTaskStatus,
  deleteTask,
  setPlan,
  now,
}: {
  plan: WeekPlan;
  onNewTask: () => void;
  onEditTask: (task: WorkTask) => void;
  updateSection: (sectionId: string, patch: Partial<WorkSection>) => void;
  addSection: () => void;
  newSectionName: string;
  setNewSectionName: (value: string) => void;
  startTimer: (taskId: string) => void;
  stopTimer: (taskId: string) => void;
  setTaskStatus: (taskId: string, status: TaskStatus) => void;
  deleteTask: (taskId: string) => void;
  setPlan: (updater: (plan: WeekPlan) => WeekPlan) => void;
  now: number;
}) {
  function assignTask(taskId: string, day: DayKey | "backlog") {
    setPlan((current) => ({
      ...current,
      tasks: current.tasks.map((task) => (task.id === taskId ? { ...task, day } : task)),
    }));
  }

  return (
    <section className="workspace">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Monday setup</p>
          <h2>Weekly plan</h2>
        </div>
      </div>

      <div className="workspace-actions">
        <button type="button" className="primary-button" onClick={onNewTask}>
          <Plus size={16} aria-hidden="true" />
          Add task
        </button>
      </div>

      <div className="section-editor">
        {plan.sections.map((section) => (
          <div className="section-edit-row" key={section.id}>
            <input
              type="color"
              value={section.color}
              onChange={(event) => updateSection(section.id, { color: event.target.value })}
              aria-label={`${section.name} color`}
            />
            <input
              value={section.name}
              onChange={(event) => updateSection(section.id, { name: event.target.value })}
              aria-label="Section name"
            />
            <input
              value={section.focus}
              onChange={(event) => updateSection(section.id, { focus: event.target.value })}
              aria-label="Section focus"
            />
          </div>
        ))}
        <div className="section-edit-row add-section-row">
          <span />
          <input
            value={newSectionName}
            onChange={(event) => setNewSectionName(event.target.value)}
            placeholder="New section"
            aria-label="New section name"
          />
          <button type="button" className="secondary-button" onClick={addSection}>
            <Plus size={16} aria-hidden="true" />
            Add section
          </button>
        </div>
      </div>

      <div className="section-list">
        {plan.sections.map((section) => {
          const tasks = plan.tasks.filter((task) => task.sectionId === section.id);
          const estimate = tasks.reduce((sum, task) => sum + task.estimateHours, 0);
          const actual = tasks.reduce((sum, task) => sum + secondsForTask(task, now) / 3600, 0);
          return (
            <section className="work-section" key={section.id}>
              <div className="work-section-heading">
                <div className="section-color" style={{ backgroundColor: section.color }} />
                <div>
                  <h3>{section.name}</h3>
                  <p>{section.focus}</p>
                </div>
                <span>
                  {formatHours(estimate)} planned | {formatHours(actual)} actual
                </span>
              </div>

              {tasks.length ? (
                tasks.map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    section={section}
                    now={now}
                    onEdit={() => onEditTask(task)}
                    onStart={() => startTimer(task.id)}
                    onStop={() => stopTimer(task.id)}
                    onStatus={(status) => setTaskStatus(task.id, status)}
                    onDelete={() => deleteTask(task.id)}
                    onAssignDay={(day) => assignTask(task.id, day)}
                  />
                ))
              ) : (
                <EmptyState title="No tasks in this section" detail="Add weekly work and group it here when it belongs to this area." />
              )}
            </section>
          );
        })}
      </div>
    </section>
  );
}

function ReviewView({
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

function ReviewPanels({ plan, now }: { plan: WeekPlan; now: number }) {
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

function ManagerView({ plan, now }: { plan: WeekPlan; now: number }) {
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

function EmptyState({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="empty-state">
      <p>{title}</p>
      <span>{detail}</span>
    </div>
  );
}

export default App;






