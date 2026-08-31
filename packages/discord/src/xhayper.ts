import { Client } from "@xhayper/discord-rpc";
import type { DiscordIpc, SetActivityPayload } from "./ipc.js";

export type XhayperLike = {
  user: {
    setActivity: (activity: Record<string, unknown>) => Promise<unknown>;
    clearActivity: () => Promise<unknown>;
  } | null;
  login: () => Promise<unknown>;
  destroy: () => Promise<unknown>;
};

export type XhayperIpcOptions = {
  delay?: (ms: number) => Promise<void>;
  onStatus?: (text: string) => void;
};

const backoffMs = [1000, 2000, 5000, 10000];
const defaultDelay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function createXhayperIpc(
  appId: string,
  factory: (appId: string) => XhayperLike = (id) => new Client({ clientId: id }) as unknown as XhayperLike,
  opts: XhayperIpcOptions = {},
): DiscordIpc {
  let client: XhayperLike | null = null;
  let cancelled = false;
  const delay = opts.delay ?? defaultDelay;

  async function connectWithRetry(): Promise<void> {
    let attempt = 0;
    while (!cancelled) {
      await client?.destroy().catch(() => {});
      if (cancelled) return;
      client = factory(appId);
      const active = client;
      try {
        await active.login();
        if (cancelled) {
          await active.destroy().catch(() => {});
          return;
        }
        opts.onStatus?.("");
        return;
      } catch {
        await active?.destroy().catch(() => {});
        client = null;
        if (cancelled) return;
        opts.onStatus?.("Discord not connected");
        await delay(backoffMs[Math.min(attempt, backoffMs.length - 1)]!);
        attempt += 1;
      }
    }
  }

  return {
    async connect() {
      await connectWithRetry();
    },
    async setActivity(activity: SetActivityPayload) {
      const body: Record<string, unknown> = {
        pid: activity.pid,
        details: activity.details,
        startTimestamp: activity.startTimestamp,
        largeImageKey: activity.largeImageKey,
        largeImageText: activity.largeImageText,
        instance: false,
        type: 0,
      };
      if (activity.state) body.state = activity.state;
      if (activity.smallImageKey) body.smallImageKey = activity.smallImageKey;
      if (activity.smallImageText) body.smallImageText = activity.smallImageText;
      let attempt = 0;
      while (!cancelled) {
        if (!client?.user) await connectWithRetry();
        if (cancelled || !client?.user) return;
        try {
          await client.user.setActivity(body);
          return;
        } catch {
          await client?.destroy().catch(() => {});
          client = null;
          if (cancelled) return;
          await delay(backoffMs[Math.min(attempt, backoffMs.length - 1)]!);
          attempt += 1;
        }
      }
    },
    async clearActivity() {
      await client?.user?.clearActivity();
    },
    async disconnect() {
      cancelled = true;
      try {
        await client?.user?.clearActivity();
      } finally {
        await client?.destroy();
        client = null;
      }
    },
  };
}
