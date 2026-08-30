import { describe, expect, it } from "vitest";
import { mergeByIdentity } from "../merge.js";
import { snap, stored } from "./helpers.js";

describe("mergeByIdentity", () => {
  it("sums agentCount across CLI and desktop of the same identity", () => {
    const merged = mergeByIdentity([
      stored(snap({ instanceId: "cli", identity: "claude-code", surface: "cli", pid: 1, agentCount: 2, sessionTitle: "cli session", repo: "a" })),
      stored(snap({ instanceId: "desk", identity: "claude-code", surface: "desktop", pid: 2, agentCount: 1, sessionTitle: "desk session", repo: "b", focused: true })),
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0].identity).toBe("claude-code");
    expect(merged[0].agentCount).toBe(3);
    expect(merged[0].sessionTitle).toBe("desk session");
    expect(merged[0].repo).toBe("b");
    expect(merged[0].focused).toBe(true);
  });

  it("prefers a focused instance for session and repo when both are unfocused-vs-focused", () => {
    const merged = mergeByIdentity([
      stored(snap({ instanceId: "a", identity: "cursor", sessionTitle: "old", repo: "one", lastActivityAt: 9 })),
      stored(snap({ instanceId: "b", identity: "cursor", sessionTitle: "new", repo: "two", focused: true, lastActivityAt: 1 })),
    ]);
    expect(merged[0].sessionTitle).toBe("new");
    expect(merged[0].repo).toBe("two");
  });

  it("uses max lastActivityAt and records lastSeenFocusedAt", () => {
    const merged = mergeByIdentity([
      stored(snap({ instanceId: "a", identity: "codex", lastActivityAt: 10 }), { lastSeenFocusedAt: 5 }),
      stored(snap({ instanceId: "b", identity: "codex", lastActivityAt: 3 }), { lastSeenFocusedAt: 8 }),
    ]);
    expect(merged[0].lastActivityAt).toBe(10);
    expect(merged[0].lastFocusedAt).toBe(8);
  });
});
