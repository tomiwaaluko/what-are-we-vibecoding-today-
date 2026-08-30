import type { SpawnSyncReturns } from "node:child_process";
import { spawnSync as realSpawn } from "node:child_process";

const KEY = "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run";

export function syncStartWithWindows(
  enabled: boolean,
  execPath: string,
  entryScript: string,
  spawnSync: typeof realSpawn = realSpawn,
): SpawnSyncReturns<string> {
  if (enabled) {
    const command = `"${execPath}" "${entryScript}"`;
    return spawnSync("reg.exe", ["add", KEY, "/v", "Vibecoding", "/t", "REG_SZ", "/d", command, "/f"], {
      encoding: "utf8",
      windowsHide: true,
    });
  }
  return spawnSync("reg.exe", ["delete", KEY, "/v", "Vibecoding", "/f"], {
    encoding: "utf8",
    windowsHide: true,
  });
}
