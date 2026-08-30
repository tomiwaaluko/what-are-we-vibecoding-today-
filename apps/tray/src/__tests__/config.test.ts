import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG, loadConfig, saveConfig } from "../config.js";

describe("config", () => {
  it("returns defaults when the file is missing or corrupt", () => {
    const home = mkdtempSync(join(tmpdir(), "vc-"));
    expect(loadConfig(home)).toEqual(DEFAULT_CONFIG);
    writeFileSync(join(home, "config.json"), "{not json", "utf8");
    expect(loadConfig(home)).toEqual(DEFAULT_CONFIG);
  });

  it("round-trips paused and application ids", () => {
    const home = mkdtempSync(join(tmpdir(), "vc-"));
    const cfg = { ...DEFAULT_CONFIG, paused: true, applicationIds: { ...DEFAULT_CONFIG.applicationIds, cursor: "abc" } };
    saveConfig(home, cfg);
    expect(loadConfig(home).paused).toBe(true);
    expect(loadConfig(home).applicationIds.cursor).toBe("abc");
  });
});
