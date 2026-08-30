import { describe, expect, it } from "vitest";
import { mapExtensionState } from "../map-snapshot.js";

describe("mapExtensionState", () => {
  it("prefers chat title then file then branch and never uses a full path as repo", () => {
    const snap = mapExtensionState({
      appName: "Cursor",
      instanceId: "cursor-1",
      pid: 8,
      focused: true,
      workspaceFolderName: "what-are-we-vibecoding-today",
      chatTabTitle: "fix discord presence",
      activeFileName: "writer.ts",
      gitBranch: "main",
      agentCount: 1,
      lastActivityAt: 10,
    });
    expect(snap.identity).toBe("cursor");
    expect(snap.sessionTitle).toBe("fix discord presence");
    expect(snap.repo).toBe("what-are-we-vibecoding-today");
    expect(snap.agentCount).toBe(1);
  });

  it("falls back through file then branch", () => {
    expect(
      mapExtensionState({
        appName: "Visual Studio Code",
        instanceId: "v",
        pid: 1,
        focused: false,
        workspaceFolderName: "r",
        chatTabTitle: null,
        activeFileName: "tick.ts",
        gitBranch: "main",
        agentCount: 0,
        lastActivityAt: 1,
      }).sessionTitle,
    ).toBe("tick.ts");
    expect(
      mapExtensionState({
        appName: "Visual Studio Code",
        instanceId: "v",
        pid: 1,
        focused: false,
        workspaceFolderName: "r",
        chatTabTitle: null,
        activeFileName: null,
        gitBranch: "feat/presence",
        agentCount: 0,
        lastActivityAt: 1,
      }).sessionTitle,
    ).toBe("feat/presence");
  });
});
