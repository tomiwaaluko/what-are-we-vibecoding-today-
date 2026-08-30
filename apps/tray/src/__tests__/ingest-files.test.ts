import { mkdtempSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { HEARTBEAT_TIMEOUT_MS, emptyBrokerState, tick, upsert } from "@vibecoding/core";
import { readStatusDir } from "../ingest-files.js";

describe("readStatusDir", () => {
  it("loads snapshots and skips invalid json", async () => {
    const dir = mkdtempSync(join(tmpdir(), "st-"));
    writeFileSync(
      join(dir, "codex-cli-1.json"),
      JSON.stringify({
        instanceId: "codex-cli-1",
        pid: 1,
        identity: "codex",
        surface: "cli",
        focused: false,
        repo: "r",
        sessionTitle: "s",
        agentCount: 0,
        lastActivityAt: 1,
      }),
    );
    writeFileSync(join(dir, "bad.json"), "{", "utf8");
    expect((await readStatusDir(dir)).map((s) => s.instanceId)).toEqual(["codex-cli-1"]);
  });

  it("skips unchanged files so extension snapshots can go stale", async () => {
    const dir = mkdtempSync(join(tmpdir(), "st-"));
    const path = join(dir, "cursor-extension.json");
    const snapshot = {
      instanceId: "cursor-extension",
      pid: 1,
      identity: "cursor",
      surface: "ide-extension",
      focused: false,
      repo: "r",
      sessionTitle: "s",
      agentCount: 0,
      lastActivityAt: 1,
    } as const;
    writeFileSync(path, JSON.stringify(snapshot), "utf8");
    const mtime = new Date("2026-01-01T00:00:00.000Z");
    utimesSync(path, mtime, mtime);

    const seenMtimes = new Map<string, number>();
    let state = emptyBrokerState();
    for (const loaded of await readStatusDir(dir, { seenMtimes })) {
      state = upsert(state, loaded, 0);
    }
    expect(await readStatusDir(dir, { seenMtimes })).toEqual([]);

    const gone = tick(state, HEARTBEAT_TIMEOUT_MS + 1, { idleMinutes: 15, pidAlive: () => true });
    expect(gone.instances.size).toBe(0);
  });

  it("marks CLI snapshots focused when a Windows console host is foreground", async () => {
    const dir = mkdtempSync(join(tmpdir(), "st-"));
    writeFileSync(
      join(dir, "codex-cli-1.json"),
      JSON.stringify({
        instanceId: "codex-cli-1",
        pid: 1,
        identity: "codex",
        surface: "cli",
        focused: false,
        repo: "r",
        sessionTitle: "s",
        agentCount: 0,
        lastActivityAt: 1,
      }),
    );
    const snapshots = await readStatusDir(dir, {
      platform: "win32",
      isConsoleForeground: () => true,
    });
    expect(snapshots[0]!.focused).toBe(true);
  });
});
