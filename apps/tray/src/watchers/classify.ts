import type { Snapshot } from "@vibecoding/core";

export function classifyDesktopWindow(input: {
  title: string;
  processName: string;
  pid: number;
  now: number;
}): Snapshot | null {
  const processName = input.processName.replace(/\.exe$/i, "");
  if (/chatgpt/i.test(processName)) {
    if (!/^\s*codex\b/i.test(input.title)) return null;
    return base("codex", input);
  }
  if (/^claude$/i.test(processName)) {
    if (/\bcowork\b/i.test(input.title)) return null;
    if (!/^\s*code\b/i.test(input.title)) return null;
    return base("claude-code", input);
  }
  return null;
}

function base(identity: "codex" | "claude-code", input: { title: string; pid: number; now: number }): Snapshot {
  return {
    instanceId: `${identity}-desktop-${input.pid}`,
    pid: input.pid,
    identity,
    surface: "desktop",
    focused: true,
    repo: null,
    sessionTitle: input.title.trim() || null,
    agentCount: 0,
    lastActivityAt: input.now,
  };
}
