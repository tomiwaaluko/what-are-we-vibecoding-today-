import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { clearSnapshot, pushSnapshot } from "../client.js";

const snapshot = {
  instanceId: "test-instance",
  identity: "cursor" as const,
  repo: "my-repo",
  title: "main.ts",
  lastActivityAt: 1_700_000_000_000,
};

function setupHome(): string {
  const home = mkdtempSync(join(tmpdir(), "vibecoding-client-"));
  writeFileSync(join(home, "runtime.json"), JSON.stringify({ port: 9876, token: "secret" }));
  return home;
}

function statusPath(home: string): string {
  return join(home, "status", `${snapshot.instanceId}.json`);
}

describe("pushSnapshot", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("removes status file after HTTP succeeds following a failed push", async () => {
    const home = setupHome();
    let call = 0;
    vi.stubGlobal("fetch", vi.fn(async () => {
      call += 1;
      if (call === 1) throw new Error("network down");
      return { ok: true };
    }));

    await pushSnapshot(home, snapshot);
    expect(existsSync(statusPath(home))).toBe(true);

    await pushSnapshot(home, snapshot);
    expect(existsSync(statusPath(home))).toBe(false);
  });
});

describe("clearSnapshot", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("removes status file even when HTTP DELETE succeeds", async () => {
    const home = setupHome();
    mkdirSync(join(home, "status"), { recursive: true });
    writeFileSync(statusPath(home), `${JSON.stringify(snapshot)}\n`);
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true })));

    await clearSnapshot(home, snapshot.instanceId);
    expect(existsSync(statusPath(home))).toBe(false);
  });
});
