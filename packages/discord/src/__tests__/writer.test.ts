import { describe, expect, it } from "vitest";
import type { PresenceCard } from "@vibecoding/core";
import type { DiscordIpc, SetActivityPayload } from "../ipc.js";
import { SwitchingDiscordWriter } from "../writer.js";

class FakeIpc implements DiscordIpc {
  appId: string;
  connected = false;
  activities: SetActivityPayload[] = [];
  cleared = 0;
  disconnected = 0;
  constructor(appId: string) {
    this.appId = appId;
  }
  async connect(): Promise<void> {
    this.connected = true;
  }
  async setActivity(activity: SetActivityPayload): Promise<void> {
    this.activities.push(activity);
  }
  async clearActivity(): Promise<void> {
    this.cleared += 1;
  }
  async disconnect(): Promise<void> {
    this.connected = false;
    this.disconnected += 1;
  }
}

const card = (identity: PresenceCard["identity"]): PresenceCard => ({
  identity,
  details: "fix it",
  state: "repo · + Claude Code",
  largeImageKey: identity === "cursor" ? "cursor" : "claude-code",
  largeImageText: identity === "cursor" ? "Cursor" : "Claude Code",
  smallImageKey: identity === "cursor" ? "claude-code" : null,
  smallImageText: identity === "cursor" ? "Claude Code · explore" : null,
  startTimestamp: 1_700_000_000_000,
});

describe("SwitchingDiscordWriter", () => {
  it("connects as the card identity app id and sends tray pid plus assets", async () => {
    const created: FakeIpc[] = [];
    const writer = new SwitchingDiscordWriter(
      { cursor: "app-cursor", vscode: "v", "claude-code": "c", codex: "x" },
      (appId) => {
        const ipc = new FakeIpc(appId);
        created.push(ipc);
        return ipc;
      },
    );
    await writer.publish(card("cursor"), 4321);
    expect(created).toHaveLength(1);
    expect(created[0]!.appId).toBe("app-cursor");
    expect(created[0]!.connected).toBe(true);
    expect(created[0]!.activities[0]).toEqual({
      pid: 4321,
      details: "fix it",
      state: "repo · + Claude Code",
      startTimestamp: 1_700_000_000_000,
      largeImageKey: "cursor",
      largeImageText: "Cursor",
      smallImageKey: "claude-code",
      smallImageText: "Claude Code · explore",
    });
  });

  it("clears and disconnects the old client before connecting the new app id", async () => {
    const created: FakeIpc[] = [];
    const writer = new SwitchingDiscordWriter(
      { cursor: "app-cursor", vscode: "v", "claude-code": "app-claude", codex: "x" },
      (appId) => {
        const ipc = new FakeIpc(appId);
        created.push(ipc);
        return ipc;
      },
    );
    await writer.publish(card("cursor"), 1);
    await writer.publish(card("claude-code"), 1);
    expect(created[0]!.cleared).toBe(1);
    expect(created[0]!.disconnected).toBe(1);
    expect(created[0]!.connected).toBe(false);
    expect(created[1]!.appId).toBe("app-claude");
    expect(created[1]!.connected).toBe(true);
    expect(created[1]!.activities).toHaveLength(1);
  });

  it("omits null state and small image keys", async () => {
    const created: FakeIpc[] = [];
    const writer = new SwitchingDiscordWriter(
      { cursor: "app-cursor", vscode: "v", "claude-code": "c", codex: "x" },
      (appId) => {
        const ipc = new FakeIpc(appId);
        created.push(ipc);
        return ipc;
      },
    );
    await writer.publish({ ...card("cursor"), state: null, smallImageKey: null, smallImageText: null }, 9);
    const activity = created[0]!.activities[0]!;
    expect(activity).not.toHaveProperty("state");
    expect(activity).not.toHaveProperty("smallImageKey");
    expect(activity).not.toHaveProperty("smallImageText");
  });

  it("clear disconnects without opening a new client", async () => {
    const created: FakeIpc[] = [];
    const writer = new SwitchingDiscordWriter(
      { cursor: "app-cursor", vscode: "v", "claude-code": "c", codex: "x" },
      (appId) => {
        const ipc = new FakeIpc(appId);
        created.push(ipc);
        return ipc;
      },
    );
    await writer.publish(card("cursor"), 1);
    await writer.clear();
    expect(created).toHaveLength(1);
    expect(created[0]!.cleared).toBe(1);
    expect(created[0]!.disconnected).toBe(1);
  });
});
