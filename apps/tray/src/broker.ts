import {
  emptyBrokerState,
  isImmediatePublish,
  removeInstance,
  tick,
  upsert,
  type PresenceCard,
  type Snapshot,
} from "@vibecoding/core";

export type PresenceWriter = {
  publish(card: PresenceCard, trayPid: number): Promise<void>;
  clear(): Promise<void>;
};

export function createBrokerController(opts: {
  writer: PresenceWriter;
  trayPid: number;
  pidAlive: (pid: number) => boolean;
  now: () => number;
  idleMinutes: number;
  debounceMs: number;
}) {
  let state = emptyBrokerState();
  let lastFlushAt = -opts.debounceMs;
  let pending = false;

  async function apply(): Promise<void> {
    const next = tick(state, opts.now(), { idleMinutes: opts.idleMinutes, pidAlive: opts.pidAlive });
    const immediate = isImmediatePublish(state.lastCard, next.card);
    const due = opts.now() - lastFlushAt >= opts.debounceMs;
    if (!immediate && !due && next.card) {
      pending = true;
      state = { ...next };
      return;
    }
    pending = false;
    lastFlushAt = opts.now();
    if (next.card) void opts.writer.publish(next.card, opts.trayPid).catch(() => {});
    else await opts.writer.clear();
    state = { ...next };
  }

  return {
    async upsert(snapshot: Snapshot) {
      state = upsert(state, snapshot, opts.now());
      await apply();
    },
    async setPaused(paused: boolean) {
      state = { ...state, paused };
      await apply();
    },
    async flush() {
      lastFlushAt = -opts.debounceMs;
      await apply();
    },
    async remove(instanceId: string) {
      state = removeInstance(state, instanceId);
      await apply();
    },
    getState() {
      return state;
    },
  };
}
