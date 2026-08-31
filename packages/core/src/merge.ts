import type { MergedIdentity, StoredInstance, Surface } from "./types.js";

export function mergeByIdentity(instances: StoredInstance[]): MergedIdentity[] {
  const groups = new Map<StoredInstance["snapshot"]["identity"], StoredInstance[]>();
  for (const inst of instances) {
    const list = groups.get(inst.snapshot.identity) ?? [];
    list.push(inst);
    groups.set(inst.snapshot.identity, list);
  }

  const result: MergedIdentity[] = [];
  for (const [identity, list] of groups) {
    const focusedOnes = list.filter((i) => i.snapshot.focused);
    const preferred =
      focusedOnes.sort((a, b) => b.snapshot.lastActivityAt - a.snapshot.lastActivityAt)[0] ??
      [...list].sort((a, b) => b.snapshot.lastActivityAt - a.snapshot.lastActivityAt)[0];
    if (!preferred) continue;

    const focusedSurfaces = [
      ...new Set(focusedOnes.map((i) => i.snapshot.surface)),
    ] as Surface[];

    result.push({
      identity,
      focused: focusedOnes.length > 0,
      focusedSurfaces,
      repo: preferred.snapshot.repo,
      sessionTitle: preferred.snapshot.sessionTitle,
      agentCount: list.reduce((n, i) => n + i.snapshot.agentCount, 0),
      lastActivityAt: Math.max(...list.map((i) => i.snapshot.lastActivityAt)),
      lastFocusedAt: list.reduce<number | null>((max, i) => {
        if (i.lastSeenFocusedAt == null) return max;
        if (max == null) return i.lastSeenFocusedAt;
        return Math.max(max, i.lastSeenFocusedAt);
      }, null),
    });
  }
  return result;
}
