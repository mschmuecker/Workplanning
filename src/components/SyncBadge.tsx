import { AlertCircle, Save } from "lucide-react";
import type { SyncState } from "../storage";

export function SyncBadge({ syncState }: { syncState: SyncState }) {
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
