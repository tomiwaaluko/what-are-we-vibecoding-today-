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
  let timer: ReturnType<typeof setTimeout> | null = null;
  let chain = Promise.resolve();

  function serialize(operation: () => Promise<void>): Promise<void> {
    const next = chain.then(operation, operation);
    chain = next.catch(() => {});
    return next;
  }

  function clearTimer(): void {
    if (!timer) return;
    clearTimeout(timer);
    timer = null;
  }

  function schedule(): void {
    if (timer) return;
    const wait = Math.max(0, opts.debounceMs - (opts.now() - lastFlushAt));
    timer = setTimeout(() => {
      timer = null;
      lastFlushAt = -opts.debounceMs;
      void serialize(() => apply());
    }, wait);
  }

  async function apply(): Promise<void> {
    const next = tick(state, opts.now(), { idleMinutes: opts.idleMinutes, pidAlive: opts.pidAlive });
    const immediate = isImmediatePublish(state.lastCard, next.card);
    const due = opts.now() - lastFlushAt >= opts.debounceMs;
    if (!immediate && !due && next.card) {
      state = { ...next };
      schedule();
      return;
    }
    clearTimer();
    lastFlushAt = opts.now();
    if (next.card) void opts.writer.publish(next.card, opts.trayPid).catch(() => {});
    else await opts.writer.clear();
    state = { ...next };
  }

  return {
    upsert(snapshot: Snapshot) {
      return serialize(async () => {
        state = upsert(state, snapshot, opts.now());
        await apply();
      });
    },
    setPaused(paused: boolean) {
      return serialize(async () => {
        state = { ...state, paused };
        await apply();
      });
    },
    flush() {
      return serialize(async () => {
        lastFlushAt = -opts.debounceMs;
        await apply();
      });
    },
    remove(instanceId: string) {
      return serialize(async () => {
        state = removeInstance(state, instanceId);
        await apply();
      });
    },
    getState() {
      return state;
    },
  };
}
