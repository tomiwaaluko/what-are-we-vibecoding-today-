import { describe, expect, it } from "vitest";
import { isSnapshot } from "../snapshot.js";

const valid = {
  instanceId: "c",
  pid: 1,
  identity: "cursor",
  surface: "ide-extension",
  focused: true,
  repo: "r",
  sessionTitle: "s",
  agentCount: 0,
  lastActivityAt: 1,
};

describe("isSnapshot", () => {
  it("accepts a complete snapshot", () => {
    expect(isSnapshot(valid)).toBe(true);
    expect(isSnapshot({ ...valid, repo: null, sessionTitle: null })).toBe(true);
  });

  it("rejects missing or non-finite fields", () => {
    expect(isSnapshot({ instanceId: "c", identity: "cursor", surface: "cli" })).toBe(false);
    expect(isSnapshot({ ...valid, pid: Number.NaN })).toBe(false);
    expect(isSnapshot({ ...valid, lastActivityAt: Number.POSITIVE_INFINITY })).toBe(false);
    expect(isSnapshot({ ...valid, focused: "yes" })).toBe(false);
    expect(isSnapshot({ ...valid, repo: 1 })).toBe(false);
  });
});
