const { spawnSync } = require("node:child_process");
const { rmSync } = require("node:fs");
const { join } = require("node:path");

function appDataRoot() {
  if (process.env.VIBECODING_HOME) return process.env.VIBECODING_HOME;
  const appdata = process.env.APPDATA;
  if (!appdata) throw new Error("APPDATA is not set");
  return join(appdata, "vibecoding");
}

const cli = process.env.VIBECODING_CLI;
if (cli) {
  const instance = `codex-cli-${process.ppid}`;
  const dispatched = spawnSync(process.execPath, [cli, "status", "--clear", "--instance", instance], {
    stdio: "ignore",
    windowsHide: true,
  });
  if (dispatched.status === 0) process.exit(0);
}

const instanceId = `codex-cli-${process.ppid}`;
rmSync(join(appDataRoot(), "status", `${instanceId}.json`), { force: true });
