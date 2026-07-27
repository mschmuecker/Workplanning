import { useCallback, useEffect, useState } from "react";
import type { AccountInfo } from "@azure/msal-browser";
import {
  GraphError,
  connectGraph,
  disconnectGraph,
  fetchCalendarWeek,
  getGraphAccount,
  graphConfigured,
  graphErrorMessage,
  mapGraphEventsToWeek,
} from "../lib/graph";
import type { ImportCandidate } from "../lib/ics";

export interface GraphImportResult {
  candidates: ImportCandidate[];
  skipped: number;
}

/**
 * Outlook calendar connection state. Everything here is fail-soft: when the
 * feature is unconfigured or Microsoft refuses, the app keeps working on ICS
 * import and manual entry, and the caller just shows `error`.
 */
export function useGraphCalendar() {
  const [account, setAccount] = useState<AccountInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Pick up an existing cached session on mount so the button can render as
  // "connected" without any interaction.
  useEffect(() => {
    if (!graphConfigured) return;
    let cancelled = false;
    getGraphAccount()
      .then((existing) => {
        if (!cancelled) setAccount(existing);
      })
      .catch(() => {
        // A broken cache is not worth surfacing; the user can just connect.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleFailure = useCallback((thrown: unknown) => {
    const graphError =
      thrown instanceof GraphError ? thrown : new GraphError("unknown", String(thrown));
    // A cancelled popup maps to null — a dismissal, not an error.
    setError(graphErrorMessage(graphError));
  }, []);

  const clearError = useCallback(() => setError(null), []);

  const disconnect = useCallback(async () => {
    await disconnectGraph();
    setAccount(null);
    setError(null);
  }, []);

  /**
   * Connect if needed, then pull the active week. Resolves to null when the
   * attempt failed or was cancelled (the reason is in `error`).
   */
  const importWeek = useCallback(
    async (weekStart: string): Promise<GraphImportResult | null> => {
      if (!graphConfigured) return null;
      setBusy(true);
      setError(null);
      try {
        const connected = account ?? (await connectGraph());
        setAccount(connected);
        const events = await fetchCalendarWeek(weekStart);
        const candidates = mapGraphEventsToWeek(events, weekStart);
        // Events dropped by the week/weekend/all-day filter become user feedback.
        const skipped = Math.max(0, events.length - candidates.length);
        return { candidates, skipped };
      } catch (thrown) {
        handleFailure(thrown);
        return null;
      } finally {
        setBusy(false);
      }
    },
    [account, handleFailure],
  );

  return {
    available: graphConfigured,
    account,
    connected: Boolean(account),
    busy,
    error,
    clearError,
    importWeek,
    disconnect,
  };
}
