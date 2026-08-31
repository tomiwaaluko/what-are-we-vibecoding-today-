import { describe, expect, it } from "vitest";
import { parseStatusArgs } from "../parse-args.js";

describe("parseStatusArgs", () => {
  it("builds an upsert snapshot and basenames repo paths", () => {
    const parsed = parseStatusArgs(
      [
        "status",
        "--identity",
        "claude-code",
        "--surface",
        "cli",
        "--pid",
        "42",
        "--repo",
        "C:\\Users\\gokug\\proj\\what-are-we-vibecoding-today",
        "--session",
        "explore detectors",
        "--agents",
        "0",
        "--activity-at",
        "99",
      ],
      1,
    );
    expect(parsed).toEqual({
      action: "upsert",
      snapshot: {
        instanceId: "claude-code-cli-42",
        pid: 42,
        identity: "claude-code",
        surface: "cli",
        focused: false,
        repo: "what-are-we-vibecoding-today",
        sessionTitle: "explore detectors",
        agentCount: 0,
        lastActivityAt: 99,
      },
    });
  });

  it("parses --clear --instance", () => {
    expect(parseStatusArgs(["status", "--clear", "--instance", "abc"], 1)).toEqual({
      action: "clear",
      instanceId: "abc",
    });
  });

  it("rejects a non-finite --activity-at", () => {
    expect(() =>
      parseStatusArgs(["status", "--identity", "cursor", "--pid", "1", "--activity-at", "NaN"], 1),
    ).toThrow("--activity-at must be a finite number");
    expect(() =>
      parseStatusArgs(["status", "--identity", "cursor", "--pid", "1", "--activity-at", "Infinity"], 1),
    ).toThrow("--activity-at must be a finite number");
  });
});
