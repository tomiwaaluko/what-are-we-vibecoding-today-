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

export function createXhayperIpc(
  appId: string,
  factory: (appId: string) => XhayperLike = (id) => new Client({ clientId: id }) as unknown as XhayperLike,
): DiscordIpc {
  let client: XhayperLike | null = null;
  return {
    async connect() {
      client = factory(appId);
      await client.login();
    },
    async setActivity(activity: SetActivityPayload) {
      if (!client?.user) throw new Error("Discord IPC is not connected");
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
      await client.user.setActivity(body);
    },
    async clearActivity() {
      await client?.user?.clearActivity();
    },
    async disconnect() {
      await client?.destroy();
      client = null;
    },
  };
}
