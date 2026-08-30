import { mkdtempSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const hooksDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "hooks");

describe("Claude hook scripts", () => {
  it("session-start writes status json; stop removes it", () => {
    const home = mkdtempSync(join(tmpdir(), "vibecoding-hooks-"));
    const env = { ...process.env, VIBECODING_HOME: home, CLAUDE_PROJECT_DIR: "C:\\Users\\me\\what-are-we-vibecoding-today" };
    const start = join(hooksDir, "claude-session-start.cjs");
    const stop = join(hooksDir, "claude-stop.cjs");
    const instanceId = `claude-code-cli-${process.pid}`;
    const statusPath = join(home, "status", `${instanceId}.json`);

    expect(spawnSync(process.execPath, [start], { env, stdio: "pipe" }).status).toBe(0);
    expect(existsSync(statusPath)).toBe(true);
    const snapshot = JSON.parse(readFileSync(statusPath, "utf8"));
    expect(snapshot.instanceId).toBe(instanceId);
    expect(snapshot.pid).toBe(process.pid);
    expect(snapshot.identity).toBe("claude-code");
    expect(snapshot.surface).toBe("cli");
    expect(snapshot.focused).toBe(false);
    expect(snapshot.repo).toBe("what-are-we-vibecoding-today");
    expect(snapshot.sessionTitle).toBeNull();
    expect(snapshot.agentCount).toBe(0);
    expect(typeof snapshot.lastActivityAt).toBe("number");

    expect(spawnSync(process.execPath, [stop], { env, stdio: "pipe" }).status).toBe(0);
    expect(existsSync(statusPath)).toBe(false);
  });
});
