import { describe, expect, it } from "vitest";
import { classifyDesktopWindow } from "../watchers/classify.js";

describe("classifyDesktopWindow", () => {
  it("emits Codex only when ChatGPT title looks like Codex", () => {
    expect(
      classifyDesktopWindow({ title: "Codex — my thread", processName: "ChatGPT.exe", pid: 4, now: 9 })?.identity,
    ).toBe("codex");
    expect(classifyDesktopWindow({ title: "New chat", processName: "ChatGPT.exe", pid: 4, now: 9 })).toBeNull();
  });

  it("emits Claude Code only for the Code tab", () => {
    expect(
      classifyDesktopWindow({ title: "Code — repo", processName: "Claude.exe", pid: 5, now: 1 })?.identity,
    ).toBe("claude-code");
    expect(classifyDesktopWindow({ title: "Chat — hello", processName: "Claude.exe", pid: 5, now: 1 })).toBeNull();
    expect(classifyDesktopWindow({ title: "Cowork — inbox", processName: "Claude.exe", pid: 5, now: 1 })).toBeNull();
    expect(classifyDesktopWindow({ title: "Claude", processName: "Claude.exe", pid: 5, now: 1 })).toBeNull();
  });
});
