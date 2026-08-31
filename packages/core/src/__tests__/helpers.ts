import type { Snapshot, StoredInstance } from "../types.js";

export function snap(partial: Partial<Snapshot> & Pick<Snapshot, "instanceId" | "identity">): Snapshot {
  return {
    pid: 100,
    surface: "ide-extension",
    focused: false,
    repo: null,
    sessionTitle: null,
    agentCount: 0,
    lastActivityAt: 0,
    ...partial,
  };
}

export function stored(snapshot: Snapshot, extra?: Partial<StoredInstance>): StoredInstance {
  return {
    snapshot,
    lastHeartbeatAt: 0,
    lastSeenFocusedAt: snapshot.focused ? 0 : null,
    ...extra,
  };
}
