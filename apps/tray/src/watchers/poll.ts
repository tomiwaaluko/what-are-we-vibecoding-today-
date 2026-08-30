import activeWin from "active-win";
import type { Snapshot } from "@vibecoding/core";
import { classifyDesktopWindow } from "./classify.js";

export async function pollDesktopWindow(now: number): Promise<Snapshot | null> {
  const win = await activeWin();
  if (!win) return null;
  return classifyDesktopWindow({
    title: win.title,
    processName: win.owner.name,
    pid: win.owner.processId,
    now,
  });
}

export function createDesktopPoller(opts: {
  upsert: (snapshot: Snapshot) => Promise<void>;
  remove: (instanceId: string) => Promise<void>;
  now: () => number;
}): { start: () => void; stop: () => void } {
  const live = new Set<string>();
  let timer: NodeJS.Timeout | undefined;
  const tick = async () => {
    const snapshot = await pollDesktopWindow(opts.now());
    const next = new Set<string>();
    if (snapshot) {
      next.add(snapshot.instanceId);
      await opts.upsert(snapshot);
    }
    for (const id of live) {
      if (!next.has(id)) await opts.remove(id);
    }
    live.clear();
    for (const id of next) live.add(id);
  };
  return {
    start() {
      timer = setInterval(() => void tick(), 2000);
      void tick();
    },
    stop() {
      if (timer) clearInterval(timer);
    },
  };
}
