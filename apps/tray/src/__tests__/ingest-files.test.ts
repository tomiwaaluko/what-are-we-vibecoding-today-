import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readStatusDir } from "../ingest-files.js";

describe("readStatusDir", () => {
  it("loads snapshots and skips invalid json", () => {
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
    expect(readStatusDir(dir).map((s) => s.instanceId)).toEqual(["codex-cli-1"]);
  });
});
