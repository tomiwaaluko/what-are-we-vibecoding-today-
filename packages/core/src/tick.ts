import { composeCard } from "./compositor.js";
import { isIdle } from "./idle.js";
import { mergeByIdentity } from "./merge.js";
import { pickPrimary } from "./picker.js";
import { dropStale } from "./stale.js";
import type { BrokerState, PresenceCard, Snapshot } from "./types.js";

export function emptyBrokerState(): BrokerState {
  return {
    instances: new Map(),
    lastPrimary: null,
    primarySince: null,
    paused: false,
    lastCard: null,
  };
}

export function upsert(state: BrokerState, snapshot: Snapshot, now: number): BrokerState {
  const prev = state.instances.get(snapshot.instanceId);
  const instances = new Map(state.instances);
  instances.set(snapshot.instanceId, {
    snapshot,
    lastHeartbeatAt: now,
    lastSeenFocusedAt: snapshot.focused ? now : (prev?.lastSeenFocusedAt ?? null),
  });
  return { ...state, instances };
}

export function removeInstance(state: BrokerState, instanceId: string): BrokerState {
  const instances = new Map(state.instances);
  instances.delete(instanceId);
  return { ...state, instances };
}

export function tick(
  state: BrokerState,
  now: number,
  opts: { idleMinutes: number; pidAlive: (pid: number) => boolean },
): BrokerState & { card: PresenceCard | null } {
  const kept = dropStale([...state.instances.values()], now, opts.pidAlive);
  const instances = new Map(kept.map((i) => [i.snapshot.instanceId, i]));
  const merged = mergeByIdentity(kept);

  if (state.paused || merged.length === 0 || isIdle(merged, now, opts.idleMinutes)) {
    return {
      ...state,
      instances,
      lastPrimary: merged.length === 0 ? null : state.lastPrimary,
      primarySince: merged.length === 0 ? null : state.primarySince,
      lastCard: null,
      card: null,
    };
  }

  const primary = pickPrimary(merged, state.lastPrimary);
  if (!primary) {
    return { ...state, instances, lastPrimary: null, primarySince: null, lastCard: null, card: null };
  }

  const primarySince = state.lastPrimary === primary && state.primarySince != null ? state.primarySince : now;
  const card = composeCard(merged, primary, primarySince);
  return {
    ...state,
    instances,
    lastPrimary: primary,
    primarySince,
    lastCard: card,
    card,
  };
}

export function isImmediatePublish(prev: PresenceCard | null, next: PresenceCard | null): boolean {
  if (next === null && prev !== null) return true;
  if (next !== null && prev === null) return true;
  if (next !== null && prev !== null && next.identity !== prev.identity) return true;
  return false;
}
