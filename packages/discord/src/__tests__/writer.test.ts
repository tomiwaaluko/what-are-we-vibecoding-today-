import { describe, expect, it } from "vitest";
import type { PresenceCard } from "@vibecoding/core";
import type { DiscordIpc, SetActivityPayload } from "../ipc.js";
import { SwitchingDiscordWriter } from "../writer.js";

class FakeIpc implements DiscordIpc {
  appId: string;
  connected = false;
  connectCalls = 0;
  activities: SetActivityPayload[] = [];
  cleared = 0;
  disconnected = 0;
  constructor(appId: string) {
    this.appId = appId;
  }
  async connect(): Promise<void> {
    this.connectCalls += 1;
    this.connected = true;
  }
  async setActivity(activity: SetActivityPayload): Promise<void> {
    this.activities.push(activity);
  }
  async clearActivity(): Promise<void> {
    this.cleared += 1;
  }
  async disconnect(): Promise<void> {
    await this.clearActivity();
    this.connected = false;
    this.disconnected += 1;
  }
}

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((res) => {
    resolve = res;
  });
  return { promise, resolve };
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

  it("clears current even when disconnect rejects so publish creates a new ipc", async () => {
    const created: FakeIpc[] = [];
    const writer = new SwitchingDiscordWriter(
      { cursor: "app-cursor", vscode: "v", "claude-code": "c", codex: "x" },
      (appId) => {
        const ipc = new FakeIpc(appId);
        ipc.disconnect = async () => {
          ipc.disconnected += 1;
          throw new Error("disconnect failed");
        };
        created.push(ipc);
        return ipc;
      },
    );
    await writer.publish(card("cursor"), 1);
    await expect(writer.clear()).rejects.toThrow("disconnect failed");
    await writer.publish(card("cursor"), 2);
    expect(created).toHaveLength(2);
    expect(created[1]!.connected).toBe(true);
    expect(created[1]!.activities).toHaveLength(1);
  });

  it("does not set activity on dying ipc when publish races with clear", async () => {
    const disconnectGate = deferred();
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
    const dying = created[0]!;
    const baseDisconnect = dying.disconnect.bind(dying);
    dying.disconnect = async () => {
      await disconnectGate.promise;
      await baseDisconnect();
    };

    const clearing = writer.clear();
    const publishing = writer.publish(card("cursor"), 99);

    expect(created).toHaveLength(1);

    disconnectGate.resolve();
    await Promise.all([clearing, publishing]);

    expect(dying.activities).toHaveLength(1);
    expect(dying.activities[0]!.pid).toBe(1);
    expect(created).toHaveLength(2);
    expect(created[1]!.activities).toHaveLength(1);
    expect(created[1]!.activities[0]!.pid).toBe(99);
  });

  it("serializes overlapping identity publishes while old client clear is slow", async () => {
    const disconnectGate = deferred();
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
    const dying = created[0]!;
    const baseDisconnect = dying.disconnect.bind(dying);
    dying.disconnect = async () => {
      await disconnectGate.promise;
      await baseDisconnect();
    };

    const claudePublish = writer.publish(card("claude-code"), 2);
    const cursorPublish = writer.publish(card("cursor"), 3);

    expect(created).toHaveLength(1);
    expect(dying.activities).toHaveLength(1);

    disconnectGate.resolve();
    await Promise.all([claudePublish, cursorPublish]);

    expect(created.map((ipc) => ipc.appId)).toEqual(["app-cursor", "app-claude", "app-cursor"]);
    expect(dying.activities).toHaveLength(1);
    expect(created[1]!.activities).toHaveLength(1);
    expect(created[1]!.activities[0]!.pid).toBe(2);
    expect(created[2]!.activities).toHaveLength(1);
    expect(created[2]!.activities[0]!.pid).toBe(3);
  });

  it("reuses the same ipc for overlapping publishes while connect is pending", async () => {
    const connecting = deferred();
    const created: FakeIpc[] = [];
    const writer = new SwitchingDiscordWriter(
      { cursor: "app-cursor", vscode: "v", "claude-code": "c", codex: "x" },
      (appId) => {
        const ipc = new FakeIpc(appId);
        ipc.connect = async () => {
          ipc.connectCalls += 1;
          await connecting.promise;
          ipc.connected = true;
        };
        created.push(ipc);
        return ipc;
      },
    );

    const first = writer.publish(card("cursor"), 1);
    const second = writer.publish(card("cursor"), 2);
    await Promise.resolve();

    expect(created).toHaveLength(1);
    expect(created[0]!.connectCalls).toBe(1);

    connecting.resolve();
    await Promise.all([first, second]);

    expect(created).toHaveLength(1);
    expect(created[0]!.activities).toHaveLength(2);
  });
});
