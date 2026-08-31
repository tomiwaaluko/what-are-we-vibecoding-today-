import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { basename, join } from "node:path";
import type { Snapshot } from "@vibecoding/core";

export function assertSafeInstanceId(instanceId: string): void {
  if (!instanceId || instanceId !== basename(instanceId) || instanceId === "." || instanceId === "..") {
    throw new Error("instanceId must be a filename without path separators");
  }
}

export function writeStatus(dir: string, snapshot: Snapshot): void {
  assertSafeInstanceId(snapshot.instanceId);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${snapshot.instanceId}.json`), `${JSON.stringify(snapshot)}\n`, "utf8");
}

export function deleteStatus(dir: string, instanceId: string): void {
  assertSafeInstanceId(instanceId);
  rmSync(join(dir, `${instanceId}.json`), { force: true });
}
