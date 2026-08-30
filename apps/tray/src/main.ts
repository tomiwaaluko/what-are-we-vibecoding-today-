import { appDataRoot, statusDir } from "./paths.js";
import { configPath, loadConfig, saveConfig } from "./config.js";
import { createBrokerController } from "./broker.js";
import { pidAlive } from "./pid.js";
import { readStatusDir } from "./ingest-files.js";
import { startSnapshotServer } from "./http.js";
import { newToken, writeRuntime } from "./runtime.js";
import { startTrayMenu } from "./menu.js";
import type { PresenceCard } from "@vibecoding/core";

class LogOnlyWriter {
  async publish(_card: PresenceCard, _trayPid: number): Promise<void> {}
  async clear(): Promise<void> {}
}

async function main(): Promise<void> {
  const home = appDataRoot(process.env);
  const config = loadConfig(home);
  saveConfig(home, config);
  const writer = new LogOnlyWriter();
  const broker = createBrokerController({
    writer,
    trayPid: process.pid,
    pidAlive,
    now: () => Date.now(),
    idleMinutes: config.idleMinutes,
    debounceMs: 3000,
  });
  await broker.setPaused(config.paused);
  const token = newToken();
  const server = await startSnapshotServer({
    token,
    onUpsert: (s) => broker.upsert(s),
    onRemove: (id) => broker.remove(id),
  });
  writeRuntime(home, server.port, token);
  setInterval(() => {
    for (const snapshot of readStatusDir(statusDir(process.env))) {
      void broker.upsert(snapshot);
    }
  }, 2000);
  startTrayMenu({
    configPath: configPath(home),
    broker,
    onQuit: async () => {
      await writer.clear();
      await server.close();
    },
  });
}

void main().catch((err) => {
  process.stderr.write(`${err instanceof Error ? err.stack ?? err.message : String(err)}\n`);
  process.exit(1);
});
