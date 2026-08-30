import type { Identity, PresenceCard } from "@vibecoding/core";
import type { DiscordIpc, SetActivityPayload } from "./ipc.js";

export class SwitchingDiscordWriter {
  private current: { identity: Identity; ipc: DiscordIpc; connect: Promise<void> } | null = null;

  constructor(
    private readonly appIds: Record<Identity, string>,
    private readonly createIpc: (appId: string) => DiscordIpc,
  ) {}

  async publish(card: PresenceCard, trayPid: number): Promise<void> {
    const appId = this.appIds[card.identity];
    if (!appId) {
      await this.clear();
      return;
    }
    if (this.current && this.current.identity !== card.identity) {
      await this.clear();
    }
    if (!this.current) {
      const ipc = this.createIpc(appId);
      this.current = { identity: card.identity, ipc, connect: ipc.connect() };
    }
    const current = this.current;
    await current.connect;
    if (this.current !== current) return;
    await current.ipc.setActivity(toPayload(card, trayPid));
  }

  async clear(): Promise<void> {
    if (!this.current) return;
    try {
      await this.current.ipc.clearActivity();
    } finally {
      await this.current.ipc.disconnect();
      this.current = null;
    }
  }
}

function toPayload(card: PresenceCard, trayPid: number): SetActivityPayload {
  const payload: SetActivityPayload = {
    pid: trayPid,
    details: card.details,
    startTimestamp: card.startTimestamp,
    largeImageKey: card.largeImageKey,
    largeImageText: card.largeImageText,
  };
  if (card.state) payload.state = card.state;
  if (card.smallImageKey) payload.smallImageKey = card.smallImageKey;
  if (card.smallImageText) payload.smallImageText = card.smallImageText;
  return payload;
}
