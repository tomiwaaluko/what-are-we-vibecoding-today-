import { mkdtempSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { Snapshot } from "@vibecoding/core";
import { deleteStatus, writeStatus } from "../status-file.js";

const sample: Snapshot = {
  instanceId: "claude-code-cli-9",
  pid: 9,
  identity: "claude-code",
  surface: "cli",
  focused: false,
  repo: "what-are-we-vibecoding-today",
  sessionTitle: "explore detectors",
  agentCount: 0,
  lastActivityAt: 123,
};

describe("status files", () => {
  it("upserts per instanceId and delete removes the file", () => {
    const dir = mkdtempSync(join(tmpdir(), "vibecoding-"));
    writeStatus(dir, sample);
    const path = join(dir, "claude-code-cli-9.json");
    expect(JSON.parse(readFileSync(path, "utf8"))).toEqual(sample);
    deleteStatus(dir, sample.instanceId);
    expect(existsSync(path)).toBe(false);
  });
});
