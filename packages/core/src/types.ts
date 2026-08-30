export const IDENTITIES = ["cursor", "vscode", "claude-code", "codex"] as const;
export type Identity = (typeof IDENTITIES)[number];

export const SURFACES = ["ide-extension", "cli", "desktop"] as const;
export type Surface = (typeof SURFACES)[number];

export const IDENTITY_DISPLAY_NAME: Record<Identity, string> = {
  cursor: "Cursor",
  vscode: "Visual Studio Code",
  "claude-code": "Claude Code",
  codex: "Codex",
};

export const IDENTITY_ASSET_KEY: Record<Identity, string> = {
  cursor: "cursor",
  vscode: "vscode",
  "claude-code": "claude-code",
  codex: "codex",
};

export type Snapshot = {
  instanceId: string;
  pid: number;
  identity: Identity;
  surface: Surface;
  focused: boolean;
  repo: string | null;
  sessionTitle: string | null;
  agentCount: number;
  lastActivityAt: number;
};

export type StoredInstance = {
  snapshot: Snapshot;
  lastHeartbeatAt: number;
  lastSeenFocusedAt: number | null;
};

export type MergedIdentity = {
  identity: Identity;
  focused: boolean;
  focusedSurfaces: Surface[];
  repo: string | null;
  sessionTitle: string | null;
  agentCount: number;
  lastActivityAt: number;
  lastFocusedAt: number | null;
};

export type PresenceCard = {
  identity: Identity;
  details: string;
  state: string | null;
  largeImageKey: string;
  largeImageText: string;
  smallImageKey: string | null;
  smallImageText: string | null;
  startTimestamp: number;
};

export type BrokerState = {
  instances: Map<string, StoredInstance>;
  lastPrimary: Identity | null;
  primarySince: number | null;
  paused: boolean;
  lastCard: PresenceCard | null;
};
