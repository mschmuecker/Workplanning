import { useEffect, useState } from "react";
import {
  loadLocalPlan,
  loadRemotePlan,
  saveLocalPlan,
  saveRemotePlan,
  type SyncState,
} from "../storage";
import type { WeekPlan } from "../types";

export function usePlanPersistence() {
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
