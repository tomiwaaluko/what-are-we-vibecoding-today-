import { join } from "node:path";

export function appDataRoot(env: NodeJS.ProcessEnv): string {
  const override = env.VIBECODING_HOME;
  if (override) return override;
  const appdata = env.APPDATA;
  if (!appdata) throw new Error("APPDATA is not set");
  return join(appdata, "vibecoding");
}

export function statusDir(env: NodeJS.ProcessEnv): string {
  return join(appDataRoot(env), "status");
}

export function configPath(home: string): string {
  return join(home, "config.json");
}
