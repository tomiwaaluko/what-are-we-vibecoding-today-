import type { Identity, PresenceCard } from "@vibecoding/core";
import type { DiscordIpc, SetActivityPayload } from "./ipc.js";

export class SwitchingDiscordWriter {
  private current: { identity: Identity; ipc: DiscordIpc; connect: Promise<void> } | null = null;
  private queue: Promise<void> = Promise.resolve();

  constructor(
    private readonly appIds: Record<Identity, string>,
    private readonly createIpc: (appId: string) => DiscordIpc,
  ) {}

  publish(card: PresenceCard, trayPid: number): Promise<void> {
    return this.enqueue(() => this.publishNow(card, trayPid));
  }

  clear(): Promise<void> {
    return this.enqueue(() => this.clearNow());
  }

  private async publishNow(card: PresenceCard, trayPid: number): Promise<void> {
    const appId = this.appIds[card.identity];
    if (!appId) {
      await this.clearNow();
      return;
    }
    if (this.current && this.current.identity !== card.identity) {
      await this.clearNow();
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

  private async clearNow(): Promise<void> {
    if (!this.current) return;
    const current = this.current;
    this.current = null;
    await current.ipc.disconnect();
  }

  private enqueue(operation: () => Promise<void>): Promise<void> {
    const next = this.queue.then(operation, operation);
    this.queue = next.catch(() => {});
    return next;
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
