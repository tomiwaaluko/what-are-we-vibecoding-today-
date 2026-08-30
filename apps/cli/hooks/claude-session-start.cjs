const { spawnSync } = require("node:child_process");
const { join } = require("node:path");
const bin = join(__dirname, "..", "dist", "main.js");
const pid = String(process.ppid);
const repo = process.env.CLAUDE_PROJECT_DIR || "";
spawnSync(process.execPath, [bin, "status", "--identity", "claude-code", "--surface", "cli", "--pid", pid, "--repo", repo], {
  stdio: "ignore",
  windowsHide: true,
});
