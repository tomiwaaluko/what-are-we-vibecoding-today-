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

let cwd = process.cwd();
try {
  const raw = require("node:fs").readFileSync(0, "utf8");
  const parsed = JSON.parse(raw);
  if (typeof parsed.cwd === "string") cwd = parsed.cwd;
} catch {
  /* no stdin payload */
}

const cli = process.env.VIBECODING_CLI;
if (cli) {
  const pid = String(process.ppid);
  spawnSync(process.execPath, [cli, "status", "--identity", "codex", "--surface", "cli", "--pid", pid, "--repo", cwd], {
    stdio: "ignore",
    windowsHide: true,
  });
  process.exit(0);
}

const pid = process.ppid;
const instanceId = `codex-cli-${pid}`;
const snapshot = {
  instanceId,
  pid,
  identity: "codex",
  surface: "cli",
  focused: false,
  repo: repoName(cwd),
  sessionTitle: null,
  agentCount: 0,
  lastActivityAt: Date.now(),
};
const dir = join(appDataRoot(), "status");
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, `${instanceId}.json`), `${JSON.stringify(snapshot)}\n`, "utf8");
