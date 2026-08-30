import type { StoredInstance } from "./types.js";

export const HEARTBEAT_TIMEOUT_MS = 30_000;

export function dropStale(
  instances: StoredInstance[],
  now: number,
  pidAlive: (pid: number) => boolean,
): StoredInstance[] {
  return instances.filter((inst) => {
    if (inst.snapshot.surface === "ide-extension") {
      if (inst.snapshot.focused || inst.snapshot.agentCount > 0) return true;
      return now - inst.lastHeartbeatAt <= HEARTBEAT_TIMEOUT_MS;
    }
    return pidAlive(inst.snapshot.pid);
  });
}
