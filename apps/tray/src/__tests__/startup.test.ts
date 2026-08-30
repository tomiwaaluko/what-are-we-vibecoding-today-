import { dirname, resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { buildLauncherScript, syncStartWithWindows } from "../startup.js";

describe("syncStartWithWindows", () => {
  it("resolves repo root from entry script directory, not the file path", () => {
    const entryScript = "C:\\what-are-we-vibecoding-today\\apps\\tray\\src\\main.ts";
    const repoRoot = resolve(dirname(entryScript), "../../..");
    expect(repoRoot).toBe("C:\\what-are-we-vibecoding-today");
    expect(repoRoot).not.toBe("C:\\what-are-we-vibecoding-today\\apps");
  });

  it("writes start-tray.cmd and registers its path when enabled", () => {
    const spawnSync = vi.fn(() => ({ status: 0 }));
    const writeLauncher = vi.fn();
    const launcherPath = "C:\\Users\\test\\AppData\\Roaming\\vibecoding\\start-tray.cmd";
    const entryScript = "C:\\repo\\apps\\tray\\src\\main.ts";
    syncStartWithWindows(true, "C:\\node.exe", entryScript, spawnSync, {
      repoRoot: "C:\\repo",
      launcherPath,
      writeLauncher,
    });
    expect(writeLauncher).toHaveBeenCalledOnce();
    const content = String(writeLauncher.mock.calls[0]![1]);
    expect(content).toContain("cd /d");
    expect(content).toContain('--import "C:\\repo\\apps\\tray\\node_modules\\tsx\\dist\\loader.mjs"');
    expect(content).toContain(entryScript);
    expect(buildLauncherScript("C:\\node.exe", entryScript, "C:\\repo")).toBe(content);
    const add = spawnSync.mock.calls[0]!;
    expect(add[0]).toBe("reg.exe");
    const dIndex = add[1].indexOf("/d");
    expect(add[1][dIndex + 1]).toBe(launcherPath);
  });

  it("deletes the Run key and launcher when disabled", () => {
    const spawnSync = vi.fn(() => ({ status: 0 }));
    const deleteLauncher = vi.fn();
    const launcherPath = "C:\\Users\\test\\AppData\\Roaming\\vibecoding\\start-tray.cmd";
    syncStartWithWindows(false, "C:\\node.exe", "C:\\tray.js", spawnSync, {
      repoRoot: "C:\\repo",
      launcherPath,
      deleteLauncher,
    });
    expect(String(spawnSync.mock.calls[0]![1].join(" "))).toMatch(/delete/i);
    expect(deleteLauncher).toHaveBeenCalledWith(launcherPath);
  });
});
