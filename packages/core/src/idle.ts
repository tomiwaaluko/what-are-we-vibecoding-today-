import type { MergedIdentity } from "./types.js";

export function isIdle(merged: MergedIdentity[], now: number, idleMinutes: number): boolean {
  if (merged.length === 0) return false;
  if (merged.some((m) => m.focused)) return false;
  if (merged.some((m) => m.agentCount > 0)) return false;
  const latest = Math.max(...merged.map((m) => m.lastActivityAt));
  return now - latest >= idleMinutes * 60 * 1000;
}
