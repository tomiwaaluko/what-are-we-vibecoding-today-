import type { Identity, MergedIdentity, Surface } from "./types.js";

function focusRank(m: MergedIdentity): number {
  const s = new Set<Surface>(m.focusedSurfaces);
  if (s.has("ide-extension") || s.has("desktop")) return 2;
  if (s.has("cli")) return 1;
  return 0;
}

export function pickPrimary(merged: MergedIdentity[], lastPrimary: Identity | null): Identity | null {
  if (merged.length === 0) return null;

  const focused = merged.filter((m) => m.focused);
  if (focused.length === 1) return focused[0]!.identity;
  if (focused.length > 1) {
    const ranked = [...focused].sort((a, b) => {
      const d = focusRank(b) - focusRank(a);
      if (d !== 0) return d;
      return b.lastActivityAt - a.lastActivityAt;
    });
    return ranked[0]!.identity;
  }

  const withAgents = merged.filter((m) => m.agentCount > 0);
  if (withAgents.length === 1) return withAgents[0]!.identity;
  if (withAgents.length > 1) {
    const ranked = [...withAgents].sort((a, b) => {
      const d = b.agentCount - a.agentCount;
      if (d !== 0) return d;
      return (b.lastFocusedAt ?? 0) - (a.lastFocusedAt ?? 0);
    });
    return ranked[0]!.identity;
  }

  if (lastPrimary && merged.some((m) => m.identity === lastPrimary)) return lastPrimary;
  return merged[0]!.identity;
}
