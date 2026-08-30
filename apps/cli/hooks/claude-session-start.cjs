const { spawnSync } = require("node:child_process");
const { mkdirSync, writeFileSync } = require("node:fs");
const { join, basename } = require("node:path");

function appDataRoot() {
  if (process.env.VIBECODING_HOME) return process.env.VIBECODING_HOME;
  const appdata = process.env.APPDATA;
  if (!appdata) throw new Error("APPDATA is not set");
  return join(appdata, "vibecoding");
}

function repoName(raw) {
  if (!raw) return null;
  return basename(raw.replace(/[\\/]+$/, "")) || null;
}

const cli = process.env.VIBECODING_CLI;
if (cli) {
  const pid = String(process.ppid);
  const repo = process.env.CLAUDE_PROJECT_DIR || "";
  spawnSync(process.execPath, [cli, "status", "--identity", "claude-code", "--surface", "cli", "--pid", pid, "--repo", repo], {
    stdio: "ignore",
    windowsHide: true,
  });
  process.exit(0);
}

const pid = process.ppid;
const instanceId = `claude-code-cli-${pid}`;
const snapshot = {
  instanceId,
  pid,
  identity: "claude-code",
  surface: "cli",
  focused: false,
  repo: repoName(process.env.CLAUDE_PROJECT_DIR),
  sessionTitle: null,
  agentCount: 0,
  lastActivityAt: Date.now(),
};
const dir = join(appDataRoot(), "status");
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, `${instanceId}.json`), `${JSON.stringify(snapshot)}\n`, "utf8");
