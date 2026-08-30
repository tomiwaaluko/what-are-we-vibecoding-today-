import { describe, expect, it } from "vitest";
import { composeCard } from "../compositor.js";
import type { MergedIdentity } from "../types.js";

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

describe("composeCard", () => {
  it("never emits empty details; falls back to identity name", () => {
    const card = composeCard([m({ identity: "cursor" })], "cursor", 1000);
    expect(card.details).toBe("Cursor");
    expect(card.state).toBeNull();
    expect(card.smallImageKey).toBeNull();
    expect(card.largeImageKey).toBe("cursor");
    expect(card.startTimestamp).toBe(1000);
  });

  it("puts session first and omits agent clause at 0", () => {
    const card = composeCard(
      [m({ identity: "cursor", sessionTitle: "fix discord presence", repo: "what-are-we-vibecoding-today" })],
      "cursor",
      1,
    );
    expect(card.details).toBe("fix discord presence");
    expect(card.state).toBe("what-are-we-vibecoding-today");
  });

  it("appends singular and plural agent counts", () => {
    expect(
      composeCard([m({ identity: "cursor", sessionTitle: "s", agentCount: 1 })], "cursor", 1).details,
    ).toBe("s · 1 agent");
    expect(
      composeCard([m({ identity: "cursor", sessionTitle: "s", agentCount: 2 })], "cursor", 1).details,
    ).toBe("s · 2 agents");
  });

  it("footnotes a second identity without a dangling separator when repo is null", () => {
    const card = composeCard(
      [
        m({ identity: "cursor", sessionTitle: "fix discord presence", agentCount: 1, focused: true, focusedSurfaces: ["ide-extension"] }),
        m({ identity: "claude-code", sessionTitle: "explore detectors", agentCount: 2 }),
      ],
      "cursor",
      1,
    );
    expect(card.details).toBe("fix discord presence · 1 agent");
    expect(card.state).toBe("+ Claude Code");
    expect(card.smallImageKey).toBe("claude-code");
    expect(card.smallImageText).toContain("Claude Code");
    expect(card.smallImageText).toContain("explore detectors");
  });

  it("joins repo and footnote for two identities", () => {
    const card = composeCard(
      [
        m({ identity: "cursor", repo: "what-are-we-vibecoding-today", focused: true, focusedSurfaces: ["ide-extension"] }),
        m({ identity: "claude-code" }),
      ],
      "cursor",
      1,
    );
    expect(card.state).toBe("what-are-we-vibecoding-today · + Claude Code");
  });

  it("lists tertiary on the state line but overlay stays secondary", () => {
    const card = composeCard(
      [
        m({ identity: "cursor", repo: "r", focused: true, focusedSurfaces: ["ide-extension"] }),
        m({ identity: "claude-code", agentCount: 2 }),
        m({ identity: "codex", agentCount: 1 }),
      ],
      "cursor",
      1,
    );
    expect(card.state).toBe("r · + Claude Code + Codex");
    expect(card.smallImageKey).toBe("claude-code");
  });

  it("truncates details to 128 characters", () => {
    const title = "x".repeat(200);
    const card = composeCard([m({ identity: "cursor", sessionTitle: title, agentCount: 1 })], "cursor", 1);
    expect(card.details.length).toBe(128);
  });
});
