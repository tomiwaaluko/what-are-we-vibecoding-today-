import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { Snapshot } from "@vibecoding/core";
import { IDENTITIES, SURFACES } from "@vibecoding/core";
import type { ConsoleFocusChecker } from "./console-focus.js";
import { isWindowsConsoleForeground } from "./console-focus.js";

export type ReadStatusDirOptions = {
  seenMtimes?: Map<string, number>;
  isConsoleForeground?: ConsoleFocusChecker;
  platform?: NodeJS.Platform;
};

export async function readStatusDir(dir: string, opts: ReadStatusDirOptions = {}): Promise<Snapshot[]> {
  let names: string[] = [];
  try {
    names = readdirSync(dir);
  } catch {
    return [];
  }
  const out: Snapshot[] = [];
  for (const name of names) {
    if (!name.endsWith(".json")) continue;
    const path = join(dir, name);
    try {
      const mtimeMs = statSync(path).mtimeMs;
      if (opts.seenMtimes?.get(path) === mtimeMs) continue;
      opts.seenMtimes?.set(path, mtimeMs);
      const raw = JSON.parse(readFileSync(path, "utf8")) as Snapshot;
      if (
        typeof raw.instanceId === "string" &&
        IDENTITIES.includes(raw.identity) &&
        SURFACES.includes(raw.surface)
      ) {
        out.push(await applyCliFocusHeuristic(raw, opts));
      }
    } catch {
      /* skip */
    }
  }
  return out;
}

async function applyCliFocusHeuristic(snapshot: Snapshot, opts: ReadStatusDirOptions): Promise<Snapshot> {
  if ((opts.platform ?? process.platform) !== "win32" || snapshot.surface !== "cli") return snapshot;
  const isConsoleForeground = opts.isConsoleForeground ?? isWindowsConsoleForeground;
  return { ...snapshot, focused: await isConsoleForeground() };
}
