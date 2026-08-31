export type SetActivityPayload = {
  pid: number;
  details: string;
  state?: string;
  startTimestamp: number;
  largeImageKey: string;
  largeImageText: string;
  smallImageKey?: string;
  smallImageText?: string;
};

export type DiscordIpc = {
  connect(): Promise<void>;
  setActivity(activity: SetActivityPayload): Promise<void>;
  clearActivity(): Promise<void>;
  disconnect(): Promise<void>;
};
