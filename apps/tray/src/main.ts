import { fileURLToPath } from "node:url";
import { appDataRoot, configPath, statusDir } from "./paths.js";
import { loadConfig, saveConfig } from "./config.js";
import { syncStartWithWindows } from "./startup.js";
import { createBrokerController } from "./broker.js";
import { pidAlive } from "./pid.js";
import { readStatusDir } from "./ingest-files.js";
import { startSnapshotServer } from "./http.js";
import { newToken, writeRuntime } from "./runtime.js";
import { startTrayMenu } from "./menu.js";
import { createDesktopPoller } from "./watchers/poll.js";
import type { Identity } from "@vibecoding/core";
import { SwitchingDiscordWriter, createXhayperIpc } from "@vibecoding/discord";

async function main(): Promise<void> {
  const home = appDataRoot(process.env);
  const config = loadConfig(home);
  saveConfig(home, config);
  syncStartWithWindows(config.startWithWindows, process.execPath, fileURLToPath(import.meta.url));
  const missingAppIdLogged = new Set<Identity>();
  let tray: ReturnType<typeof startTrayMenu> | null = null;
  const inner = new SwitchingDiscordWriter(config.applicationIds, (appId) =>
    createXhayperIpc(appId, undefined, {
      onStatus: (text) => tray?.setStatusTooltip(text),
    }),
  );
  const writer = {
    async publish(card: Parameters<typeof inner.publish>[0], trayPid: number) {
      const appId = config.applicationIds[card.identity];
      if (!appId) {
        if (!missingAppIdLogged.has(card.identity)) {
          missingAppIdLogged.add(card.identity);
          process.stderr.write(`Discord app id missing for ${card.identity}\n`);
        }
      }
      await inner.publish(card, trayPid);
    },
    clear: () => inner.clear(),
  };
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
  const desktopPoller = createDesktopPoller({
    upsert: (s) => broker.upsert(s),
    remove: (id) => broker.remove(id),
    now: () => Date.now(),
  });
  desktopPoller.start();
  tray = startTrayMenu({
    configPath: configPath(home),
    broker,
    onQuit: async () => {
      desktopPoller.stop();
      await writer.clear();
      await server.close();
    },
  });
}

void main().catch((err) => {
  process.stderr.write(`${err instanceof Error ? err.stack ?? err.message : String(err)}\n`);
  process.exit(1);
});
