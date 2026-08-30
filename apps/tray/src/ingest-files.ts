import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Snapshot } from "@vibecoding/core";
import { IDENTITIES, SURFACES } from "@vibecoding/core";

export function readStatusDir(dir: string): Snapshot[] {
  let names: string[] = [];
  try {
    names = readdirSync(dir);
  } catch {
    return [];
  }
  const out: Snapshot[] = [];
  for (const name of names) {
    if (!name.endsWith(".json")) continue;
    try {
      const raw = JSON.parse(readFileSync(join(dir, name), "utf8")) as Snapshot;
      if (
        typeof raw.instanceId === "string" &&
        IDENTITIES.includes(raw.identity) &&
        SURFACES.includes(raw.surface)
      ) {
        out.push(raw);
      }
    } catch {
      /* skip */
    }
  }
  return out;
}
