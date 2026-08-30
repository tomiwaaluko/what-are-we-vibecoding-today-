import type { SpawnSyncReturns } from "node:child_process";
import { spawnSync as realSpawn } from "node:child_process";

const KEY = "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run";

function buildRunCommand(execPath: string, entryScript: string, cwd?: string): string {
  const node = `"${execPath}" --import tsx "${entryScript}"`;
  if (!cwd) return node;
  return `cmd /c "cd /d \\"${cwd}\\" && ${node}"`;
}

export function syncStartWithWindows(
  enabled: boolean,
  execPath: string,
  entryScript: string,
  spawnSync: typeof realSpawn = realSpawn,
  cwd?: string,
): SpawnSyncReturns<string> {
  if (enabled) {
    const command = buildRunCommand(execPath, entryScript, cwd);
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
