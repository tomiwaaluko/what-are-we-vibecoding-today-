import { readFileSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import type { Snapshot } from "@vibecoding/core";

export type RuntimeInfo = { port: number; token: string };

export function readRuntime(home: string): RuntimeInfo | null {
  try {
    const raw = JSON.parse(readFileSync(join(home, "runtime.json"), "utf8")) as RuntimeInfo;
    if (typeof raw.port === "number" && typeof raw.token === "string") return raw;
    return null;
  } catch {
    return null;
  }
}

export async function pushSnapshot(home: string, snapshot: Snapshot): Promise<void> {
  const runtime = readRuntime(home);
  if (runtime) {
    try {
      const res = await fetch(`http://127.0.0.1:${runtime.port}/snapshot`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${runtime.token}`, "Content-Type": "application/json" },
        body: JSON.stringify(snapshot),
      });
      if (res.ok) {
        rmSync(join(home, "status", `${snapshot.instanceId}.json`), { force: true });
        return;
      }
    } catch {
      /* file fallback */
    }
  }
  const dir = join(home, "status");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${snapshot.instanceId}.json`), `${JSON.stringify(snapshot)}\n`);
}

export async function clearSnapshot(home: string, instanceId: string): Promise<void> {
  const runtime = readRuntime(home);
  if (runtime) {
    try {
      await fetch(`http://127.0.0.1:${runtime.port}/snapshot/${encodeURIComponent(instanceId)}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${runtime.token}` },
      });
    } catch {
      /* continue to local cleanup */
    }
  }
  rmSync(join(home, "status", `${instanceId}.json`), { force: true });
}
