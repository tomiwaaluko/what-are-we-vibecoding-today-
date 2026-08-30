import { describe, expect, it } from "vitest";
import { HEARTBEAT_TIMEOUT_MS } from "../stale.js";
import { emptyBrokerState, isImmediatePublish, removeInstance, tick, upsert } from "../tick.js";
import { snap } from "./helpers.js";

const idleMinutes = 15;
const alwaysAlive = () => true;
const neverAlive = () => false;

describe("tick", () => {
  it("clears when paused even if snapshots exist", () => {
    let state = emptyBrokerState();
    state = upsert(state, snap({ instanceId: "c", identity: "cursor", focused: true, sessionTitle: "x" }), 0);
    state = { ...state, paused: true };
    const next = tick(state, 1, { idleMinutes, pidAlive: alwaysAlive });
    expect(next.card).toBeNull();
  });

  it("does not treat heartbeats as activity for idle", () => {
    const start = 0;
    let state = emptyBrokerState();
    const base = snap({
      instanceId: "c",
      identity: "cursor",
      focused: false,
      lastActivityAt: start,
      sessionTitle: "x",
    });
    state = upsert(state, base, start);
    const fifteenMin = 15 * 60 * 1000;
    for (let t = start + 10_000; t < fifteenMin; t += 10_000) {
      state = upsert(state, { ...base, lastActivityAt: start }, t);
    }
    const stillSoon = tick(state, fifteenMin - 1, { idleMinutes, pidAlive: alwaysAlive });
    expect(stillSoon.card).not.toBeNull();
    const idle = tick(state, fifteenMin, { idleMinutes, pidAlive: alwaysAlive });
    expect(idle.card).toBeNull();
  });

  it("does not idle while focused or while agents run", () => {
    const fifteenMin = 15 * 60 * 1000;
    let focused = emptyBrokerState();
    focused = upsert(
      focused,
      snap({ instanceId: "c", identity: "cursor", focused: true, lastActivityAt: 0 }),
      0,
    );
    expect(tick(focused, fifteenMin, { idleMinutes, pidAlive: alwaysAlive }).card).not.toBeNull();

    let agents = emptyBrokerState();
    agents = upsert(
      agents,
      snap({ instanceId: "c", identity: "claude-code", agentCount: 1, lastActivityAt: 0 }),
      0,
    );
    expect(tick(agents, fifteenMin, { idleMinutes, pidAlive: alwaysAlive }).card).not.toBeNull();
  });

  it("drops extension instances after 30s without heartbeat", () => {
    let state = emptyBrokerState();
    state = upsert(state, snap({ instanceId: "c", identity: "cursor", surface: "ide-extension" }), 0);
    const gone = tick(state, HEARTBEAT_TIMEOUT_MS + 1, { idleMinutes, pidAlive: alwaysAlive });
    expect(gone.card).toBeNull();
    expect(gone.instances.size).toBe(0);
  });

  it("drops CLI when pid is dead even if recently upserted", () => {
    let state = emptyBrokerState();
    state = upsert(
      state,
      snap({ instanceId: "cli", identity: "claude-code", surface: "cli", pid: 42, sessionTitle: "s" }),
      0,
    );
    const gone = tick(state, 1, { idleMinutes, pidAlive: neverAlive });
    expect(gone.instances.size).toBe(0);
    expect(gone.card).toBeNull();
  });

  it("keeps lastPrimary timestamp until identity changes", () => {
    let state = emptyBrokerState();
    state = upsert(
      state,
      snap({ instanceId: "c", identity: "cursor", focused: true, sessionTitle: "a" }),
      5,
    );
    state = tick(state, 5, { idleMinutes, pidAlive: alwaysAlive });
    expect(state.primarySince).toBe(5);
    state = upsert(
      state,
      snap({ instanceId: "c", identity: "cursor", focused: true, sessionTitle: "b", lastActivityAt: 9 }),
      9,
    );
    state = tick(state, 9, { idleMinutes, pidAlive: alwaysAlive });
    expect(state.card?.details).toBe("b");
    expect(state.primarySince).toBe(5);
  });

  it("removeInstance deletes by instanceId", () => {
    let state = emptyBrokerState();
    state = upsert(state, snap({ instanceId: "c", identity: "cursor" }), 0);
    state = removeInstance(state, "c");
    expect(state.instances.size).toBe(0);
  });
});

describe("isImmediatePublish", () => {
  it("is immediate on clear, first card, and identity switch", () => {
    const cursor = {
      identity: "cursor" as const,
      details: "d",
      state: null,
      largeImageKey: "cursor",
      largeImageText: "Cursor",
      smallImageKey: null,
      smallImageText: null,
      startTimestamp: 1,
    };
    const claude = { ...cursor, identity: "claude-code" as const, largeImageKey: "claude-code" };
    expect(isImmediatePublish(cursor, null)).toBe(true);
    expect(isImmediatePublish(null, cursor)).toBe(true);
    expect(isImmediatePublish(cursor, claude)).toBe(true);
    expect(isImmediatePublish(cursor, { ...cursor, details: "other" })).toBe(false);
  });
});
