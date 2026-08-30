const { spawnSync } = require("node:child_process");
const { join } = require("node:path");
const bin = join(__dirname, "..", "dist", "main.js");
const instance = `claude-code-cli-${process.ppid}`;
spawnSync(process.execPath, [bin, "status", "--clear", "--instance", instance], {
  stdio: "ignore",
  windowsHide: true,
});
