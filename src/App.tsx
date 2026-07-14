import {
  AlertCircle,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  Clock,
  Eye,
  ListChecks,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Save,
  Settings2,
  Square,
  Trash2,
  User,
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

interface TaskDraft {
  title: string;
  sectionId: string;
  estimateHours: string;
  day: DayKey | "backlog";
  planned: boolean;
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

function createEmptyDraft(sectionId: string, day: DayKey | "backlog", planned = true): TaskDraft {
  return {
    title: "",
    sectionId,
    estimateHours: "1",
    day,
    planned,
  };
}

function buildTask(draft: TaskDraft): WorkTask {
  return {
    id: createId("task"),
    title: draft.title.trim(),
    sectionId: draft.sectionId,
    day: draft.day,
    estimateHours: Number(draft.estimateHours) || 0,
    planned: draft.planned,
    status: "planned",
    actualSeconds: 0,
    timerStartedAt: null,
    notes: "",
    createdAt: new Date().toISOString(),
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
  const [tab, setTab] = useState<PlannerTab>("daily");
  const [selectedDay, setSelectedDay] = useState<DayKey>(() => getTodayKey());
  const [weeklyDraft, setWeeklyDraft] = useState<TaskDraft>(() =>
    createEmptyDraft(plan.sections[0]?.id ?? "", "backlog"),
  );
  const [dailyDraft, setDailyDraft] = useState<TaskDraft>(() =>
    createEmptyDraft(plan.sections[0]?.id ?? "", getTodayKey(), false),
  );
  const [showSettings, setShowSettings] = useState(false);
  const [newSectionName, setNewSectionName] = useState("");

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    setWeeklyDraft((draft) =>
      draft.sectionId ? draft : { ...draft, sectionId: plan.sections[0]?.id ?? "" },
    );
    setDailyDraft((draft) =>
      draft.sectionId ? draft : { ...draft, sectionId: plan.sections[0]?.id ?? "" },
    );
  }, [plan.sections]);

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

  function addTask(draft: TaskDraft, reset: (draft: TaskDraft) => void) {
    if (!draft.title.trim()) return;
    const task = buildTask(draft);
    setPlan((current) => ({
      ...current,
      tasks: [...current.tasks, task],
    }));
    reset(createEmptyDraft(draft.sectionId, draft.day, draft.planned));
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
            onClick={() => setShowSettings((value) => !value)}
          >
            <Settings2 size={18} aria-hidden="true" />
          </button>
        </div>
      </header>

      <main>
        {showSettings && (
          <section className="settings-band">
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
            <button className="secondary-button" type="button" onClick={startNewWeek}>
              <RefreshCw size={16} aria-hidden="true" />
              Start blank week
            </button>
          </section>
        )}

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
                draft={dailyDraft}
                setDraft={setDailyDraft}
                addTask={() => addTask(dailyDraft, setDailyDraft)}
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
                draft={weeklyDraft}
                setDraft={setWeeklyDraft}
                addTask={() => addTask(weeklyDraft, setWeeklyDraft)}
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
    </div>
  );
}

function useAuth() {
  const [user, setUser] = useState<NetlifyUser | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authError, setAuthError] = useState("");

  useEffect(() => {
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

function TaskForm({
  sections,
  draft,
  setDraft,
  onSubmit,
  submitLabel,
}: {
  sections: WorkSection[];
  draft: TaskDraft;
  setDraft: (draft: TaskDraft) => void;
  onSubmit: () => void;
  submitLabel: string;
}) {
  function submit(event: FormEvent) {
    event.preventDefault();
    onSubmit();
  }

  return (
    <form className="task-form" onSubmit={submit}>
      <input
        value={draft.title}
        onChange={(event) => setDraft({ ...draft, title: event.target.value })}
        placeholder="Task or outcome"
        aria-label="Task or outcome"
      />
      <select
        value={draft.sectionId}
        onChange={(event) => setDraft({ ...draft, sectionId: event.target.value })}
        aria-label="Section"
      >
        {sections.map((section) => (
          <option key={section.id} value={section.id}>
            {section.name}
          </option>
        ))}
      </select>
      <select
        value={draft.day}
        onChange={(event) =>
          setDraft({ ...draft, day: event.target.value as DayKey | "backlog" })
        }
        aria-label="Day"
      >
        <option value="backlog">Unscheduled</option>
        {dayOptions.map((day) => (
          <option key={day.key} value={day.key}>
            {day.label}
          </option>
        ))}
      </select>
      <input
        type="number"
        min="0"
        step="0.25"
        value={draft.estimateHours}
        onChange={(event) => setDraft({ ...draft, estimateHours: event.target.value })}
        aria-label="Estimated hours"
      />
      <label className="check-label">
        <input
          type="checkbox"
          checked={!draft.planned}
          onChange={(event) => setDraft({ ...draft, planned: !event.target.checked })}
        />
        Unplanned
      </label>
      <button type="submit" className="primary-button">
        <Plus size={16} aria-hidden="true" />
        {submitLabel}
      </button>
    </form>
  );
}

function TaskCard({
  task,
  section,
  now,
  onStart,
  onStop,
  onStatus,
  onDelete,
  onAssignDay,
}: {
  task: WorkTask;
  section: WorkSection;
  now: number;
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
  draft,
  setDraft,
  addTask,
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
  draft: TaskDraft;
  setDraft: (draft: TaskDraft) => void;
  addTask: () => void;
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
              onClick={() => {
                setSelectedDay(day.key);
                setDraft({ ...draft, day: day.key });
              }}
            >
              {day.short}
            </button>
          ))}
        </div>
      </div>

      <TaskForm
        sections={plan.sections}
        draft={{ ...draft, day: selectedDay, planned: false }}
        setDraft={(next) => setDraft({ ...next, day: selectedDay, planned: false })}
        onSubmit={addTask}
        submitLabel="Log new work"
      />

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
  draft,
  setDraft,
  addTask,
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
  draft: TaskDraft;
  setDraft: (draft: TaskDraft) => void;
  addTask: () => void;
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

      <TaskForm
        sections={plan.sections}
        draft={draft}
        setDraft={setDraft}
        onSubmit={addTask}
        submitLabel="Add task"
      />

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






