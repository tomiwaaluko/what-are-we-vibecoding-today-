import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import type { Snapshot } from "@vibecoding/core";

export function writeStatus(dir: string, snapshot: Snapshot): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${snapshot.instanceId}.json`), `${JSON.stringify(snapshot)}\n`, "utf8");
}

export function deleteStatus(dir: string, instanceId: string): void {
  rmSync(join(dir, `${instanceId}.json`), { force: true });
}
