import { describe, expect, it } from "vitest";
import type { MergedIdentity } from "../types.js";
import { pickPrimary } from "../picker.js";

function m(partial: Partial<MergedIdentity> & Pick<MergedIdentity, "identity">): MergedIdentity {
  return {
    focused: false,
    focusedSurfaces: [],
    repo: null,
    sessionTitle: null,
    agentCount: 0,
    lastActivityAt: 0,
    lastFocusedAt: null,
    ...partial,
  };
}

describe("pickPrimary", () => {
  it("returns null when nothing is live", () => {
    expect(pickPrimary([], "cursor")).toBeNull();
  });

  it("focus wins even if another identity has more agents", () => {
    expect(
      pickPrimary(
        [
          m({ identity: "cursor", focused: true, focusedSurfaces: ["ide-extension"], agentCount: 0 }),
          m({ identity: "claude-code", agentCount: 3, lastFocusedAt: 99 }),
        ],
        "claude-code",
      ),
    ).toBe("cursor");
  });

  it("prefers IDE/desktop focus over CLI focus false-positive", () => {
    expect(
      pickPrimary(
        [
          m({ identity: "claude-code", focused: true, focusedSurfaces: ["cli"] }),
          m({ identity: "cursor", focused: true, focusedSurfaces: ["ide-extension"] }),
        ],
        null,
      ),
    ).toBe("cursor");
  });

  it("when nothing tracked is focused, highest agentCount wins", () => {
    expect(
      pickPrimary(
        [
          m({ identity: "cursor", agentCount: 0, lastFocusedAt: 50 }),
          m({ identity: "claude-code", agentCount: 2, lastFocusedAt: 1 }),
        ],
        "cursor",
      ),
    ).toBe("claude-code");
  });

  it("agent ties break by most recently focused", () => {
    expect(
      pickPrimary(
        [
          m({ identity: "cursor", agentCount: 1, lastFocusedAt: 10 }),
          m({ identity: "codex", agentCount: 1, lastFocusedAt: 20 }),
        ],
        null,
      ),
    ).toBe("codex");
  });

  it("sticks to last primary when unfocused and no agents", () => {
    expect(
      pickPrimary(
        [
          m({ identity: "cursor", agentCount: 0 }),
          m({ identity: "vscode", agentCount: 0 }),
        ],
        "vscode",
      ),
    ).toBe("vscode");
  });

  it("falls back to first live identity if last primary is gone and no focus/agents", () => {
    expect(pickPrimary([m({ identity: "codex" })], "cursor")).toBe("codex");
  });
});
