import { mkdtempSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runCli } from "../main.js";

describe("runCli", () => {
  it("exits 0 after writing a status file", async () => {
    const home = mkdtempSync(join(tmpdir(), "vibecoding-home-"));
    const code = await runCli(
      ["status", "--identity", "codex", "--surface", "cli", "--pid", "7"],
      { ...process.env, VIBECODING_HOME: home },
      1,
    );
    expect(code).toBe(0);
    expect(existsSync(join(home, "status", "codex-cli-7.json"))).toBe(true);
  });
});
