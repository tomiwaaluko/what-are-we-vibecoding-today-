import type { SpawnSyncReturns } from "node:child_process";
import { spawnSync as realSpawn } from "node:child_process";
import { mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const KEY = "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run";

export function buildLauncherScript(execPath: string, entryScript: string, repoRoot: string): string {
  const tsxLoader = resolve(repoRoot, "apps/tray/node_modules/tsx/dist/loader.mjs");
  return `@echo off\r\ncd /d "${repoRoot}"\r\n"${execPath}" --import "${tsxLoader}" "${entryScript}"\r\n`;
}

function formatRunValue(launcherPath: string): string {
  return launcherPath.includes(" ") ? `"${launcherPath}"` : launcherPath;
}

export type SyncStartWithWindowsOptions = {
  repoRoot: string;
  launcherPath: string;
  writeLauncher?: (path: string, content: string) => void;
  deleteLauncher?: (path: string) => void;
};

export function syncStartWithWindows(
  enabled: boolean,
  execPath: string,
  entryScript: string,
  spawnSync: typeof realSpawn = realSpawn,
  options?: SyncStartWithWindowsOptions,
): SpawnSyncReturns<string> {
  const writeLauncher =
    options?.writeLauncher ??
    ((path: string, content: string) => {
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, content, "utf8");
    });
  const deleteLauncher =
    options?.deleteLauncher ??
    ((path: string) => {
      try {
        unlinkSync(path);
      } catch {
        // launcher may already be absent
      }
    });

  if (enabled) {
    if (!options?.repoRoot || !options?.launcherPath) {
      throw new Error("repoRoot and launcherPath are required when enabling start with Windows");
    }
    writeLauncher(options.launcherPath, buildLauncherScript(execPath, entryScript, options.repoRoot));
    return spawnSync(
      "reg.exe",
      ["add", KEY, "/v", "Vibecoding", "/t", "REG_SZ", "/d", formatRunValue(options.launcherPath), "/f"],
      {
        encoding: "utf8",
        windowsHide: true,
      },
    );
  }

  const result = spawnSync("reg.exe", ["delete", KEY, "/v", "Vibecoding", "/f"], {
    encoding: "utf8",
    windowsHide: true,
  });
  if (options?.launcherPath) {
    deleteLauncher(options.launcherPath);
  }
  return result;
}
