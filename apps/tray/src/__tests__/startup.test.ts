import { describe, expect, it, vi } from "vitest";
import { syncStartWithWindows } from "../startup.js";

describe("syncStartWithWindows", () => {
  it("adds a Run key when enabled and deletes when disabled", () => {
    const spawnSync = vi.fn(() => ({ status: 0 }));
    syncStartWithWindows(true, "C:\\node.exe", "C:\\tray.js", spawnSync);
    expect(spawnSync).toHaveBeenCalled();
    const add = spawnSync.mock.calls[0]!;
    expect(add[0]).toBe("reg.exe");
    expect(String(add[1].join(" "))).toContain("Vibecoding");
    syncStartWithWindows(false, "C:\\node.exe", "C:\\tray.js", spawnSync);
    expect(String(spawnSync.mock.calls.at(-1)?.[1].join(" "))).toMatch(/delete/i);
  });
});
