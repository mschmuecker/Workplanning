import { useEffect, useState } from "react";
import {
  loadLocalWorkspace,
  loadRemoteWorkspace,
  saveLocalWorkspace,
  saveRemoteWorkspace,
  type SyncState,
} from "../storage";
import {
  carryOverTasks,
  createDefaultPlan,
  createWeekPlan,
  getWeekStartIso,
} from "../plannerData";
import type { WeekPlan, Workspace } from "../types";

export function usePlanPersistence() {
  const [workspace, setWorkspace] = useState<Workspace>(() => loadLocalWorkspace());
  const [syncState, setSyncState] = useState<SyncState>("local");
  const [remoteAvailable, setRemoteAvailable] = useState(false);

  useEffect(() => {
    let ignore = false;
    setSyncState("loading");

    loadRemoteWorkspace()
      .then((remote) => {
        if (ignore) return;
        setRemoteAvailable(true);
        if (remote) {
          setWorkspace(remote);
          saveLocalWorkspace(remote);
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
    saveLocalWorkspace(workspace);
  }, [workspace]);

  useEffect(() => {
    if (!remoteAvailable) return;
    const handle = window.setTimeout(() => {
      setSyncState("saving");
      saveRemoteWorkspace(workspace)
        .then(() => setSyncState("synced"))
        .catch(() => setSyncState("error"));
    }, 700);

    return () => window.clearTimeout(handle);
  }, [workspace, remoteAvailable]);

  const weekStarts = Object.keys(workspace.weeks).sort();
  const activeWeekStart = workspace.activeWeekStart;

  const plan: WeekPlan =
    workspace.weeks[activeWeekStart] ??
    workspace.weeks[weekStarts[weekStarts.length - 1]] ??
    createDefaultPlan();

  function setPlan(updater: (plan: WeekPlan) => WeekPlan) {
    setWorkspace((current) => {
      const target = current.weeks[current.activeWeekStart];
      if (!target) return current;
      const now = new Date().toISOString();
      const nextPlan: WeekPlan = { ...updater(target), updatedAt: now };
      return {
        ...current,
        weeks: { ...current.weeks, [current.activeWeekStart]: nextPlan },
        updatedAt: now,
      };
    });
  }

  function goToWeek(weekStart: string) {
    setWorkspace((current) => {
      if (!current.weeks[weekStart]) return current;
      return {
        ...current,
        activeWeekStart: weekStart,
        updatedAt: new Date().toISOString(),
      };
    });
  }

  function goPrevWeek() {
    setWorkspace((current) => {
      const keys = Object.keys(current.weeks).sort();
      const index = keys.indexOf(current.activeWeekStart);
      if (index <= 0) return current;
      return {
        ...current,
        activeWeekStart: keys[index - 1],
        updatedAt: new Date().toISOString(),
      };
    });
  }

  function goNextWeek() {
    setWorkspace((current) => {
      const keys = Object.keys(current.weeks).sort();
      const index = keys.indexOf(current.activeWeekStart);
      if (index === -1 || index >= keys.length - 1) return current;
      return {
        ...current,
        activeWeekStart: keys[index + 1],
        updatedAt: new Date().toISOString(),
      };
    });
  }

  // Create (or, if it already exists, just switch to) the week that contains the
  // given date's Monday. When carrying over, unfinished tasks come from the most
  // recent existing week before the target; profile/sections are inherited from
  // that same prior week (or the latest week overall if the target precedes all).
  function createOrGoToWeek(weekStart: string, carryOver: boolean) {
    setWorkspace((current) => {
      const now = new Date().toISOString();

      if (current.weeks[weekStart]) {
        return { ...current, activeWeekStart: weekStart, updatedAt: now };
      }

      const keys = Object.keys(current.weeks).sort();
      const priorKey = keys.filter((key) => key < weekStart).pop();
      const templateSource =
        current.weeks[priorKey ?? keys[keys.length - 1]] ?? createDefaultPlan();
      const tasks =
        carryOver && priorKey ? carryOverTasks(current.weeks[priorKey].tasks) : [];

      const nextPlan = createWeekPlan(
        weekStart,
        {
          ownerName: templateSource.ownerName,
          ownerRole: templateSource.ownerRole,
          weeklyCapacityHours: templateSource.weeklyCapacityHours,
          sections: templateSource.sections,
        },
        tasks,
      );

      return {
        ...current,
        weeks: { ...current.weeks, [weekStart]: nextPlan },
        activeWeekStart: weekStart,
        updatedAt: now,
      };
    });
  }

  const isViewingCurrentWeek = activeWeekStart === getWeekStartIso();

  return {
    plan,
    setPlan,
    syncState,
    weekStarts,
    activeWeekStart,
    isViewingCurrentWeek,
    goToWeek,
    goPrevWeek,
    goNextWeek,
    createOrGoToWeek,
  };
}
