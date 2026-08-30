import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Identity } from "@vibecoding/core";
import { IDENTITIES } from "@vibecoding/core";

export type AppConfig = {
  paused: boolean;
  idleMinutes: number;
  startWithWindows: boolean;
  applicationIds: Record<Identity, string>;
};

export const DEFAULT_CONFIG: AppConfig = {
  paused: false,
  idleMinutes: 15,
  startWithWindows: true,
  applicationIds: { cursor: "", vscode: "", "claude-code": "", codex: "" },
};

export function loadConfig(home: string): AppConfig {
  try {
    const raw = JSON.parse(readFileSync(join(home, "config.json"), "utf8")) as Partial<AppConfig>;
    const applicationIds = { ...DEFAULT_CONFIG.applicationIds };
    for (const id of IDENTITIES) {
      if (typeof raw.applicationIds?.[id] === "string") applicationIds[id] = raw.applicationIds[id];
    }
    return {
      paused: Boolean(raw.paused),
      idleMinutes: typeof raw.idleMinutes === "number" && raw.idleMinutes > 0 ? raw.idleMinutes : 15,
      startWithWindows: raw.startWithWindows ?? true,
      applicationIds,
    };
  } catch {
    return { ...DEFAULT_CONFIG, applicationIds: { ...DEFAULT_CONFIG.applicationIds } };
  }
}

export function saveConfig(home: string, config: AppConfig): void {
  mkdirSync(home, { recursive: true });
  writeFileSync(join(home, "config.json"), `${JSON.stringify(config, null, 2)}\n`, "utf8");
}
