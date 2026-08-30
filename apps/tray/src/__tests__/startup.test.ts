import { dirname, resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { syncStartWithWindows } from "../startup.js";

describe("syncStartWithWindows", () => {
  it("resolves repo root from entry script directory, not the file path", () => {
    const entryScript = "C:\\what-are-we-vibecoding-today\\apps\\tray\\src\\main.ts";
    const repoRoot = resolve(dirname(entryScript), "../../..");
    expect(repoRoot).toBe("C:\\what-are-we-vibecoding-today");
    expect(repoRoot).not.toBe("C:\\what-are-we-vibecoding-today\\apps");
  });

  it("adds a Run key when enabled and deletes when disabled", () => {
    const spawnSync = vi.fn(() => ({ status: 0 }));
    syncStartWithWindows(true, "C:\\node.exe", "C:\\tray.js", spawnSync, "C:\\repo");
    expect(spawnSync).toHaveBeenCalled();
    const add = spawnSync.mock.calls[0]!;
    expect(add[0]).toBe("reg.exe");
    const regArgs = String(add[1].join(" "));
    expect(regArgs).toContain("Vibecoding");
    expect(regArgs).toContain("--import tsx");
    expect(regArgs).toContain("cd /d");
    expect(regArgs).toContain("C:\\repo");
    syncStartWithWindows(false, "C:\\node.exe", "C:\\tray.js", spawnSync);
    expect(String(spawnSync.mock.calls.at(-1)?.[1].join(" "))).toMatch(/delete/i);
  });
});
