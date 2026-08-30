# Codex CLI hooks (Windows)

Wire Codex CLI session events into the vibecoding tray via small Node hook scripts. These hooks write status files only — they do not read chat or transcript bodies.

**The tray does not edit your Codex config.** Copy-paste the TOML below into your Codex hooks config yourself.

## Setup

1. **Install the hook scripts** — copy `codex-session-start.cjs` and `codex-session-end.cjs` to `%APPDATA%\vibecoding\hooks\`, or point Codex at the repo copies under `apps/cli/hooks/`. No `dist/` folder is required beside the hooks; they write status JSON directly for the tray to poll.

2. **Paste the hooks TOML** into your Codex config (see below). Do not let the tray rewrite this config.

3. **Trust the hooks on Windows** — the first time Codex runs a hook command, Windows may prompt you to approve or trust the script. Allow it; otherwise SessionStart/SessionEnd will not fire and the tray will never see Codex CLI activity.

4. **Optional:** build the CLI if you want the `vibecoding status` command for manual updates:

   ```powershell
   pnpm --filter @vibecoding/cli build
   ```

## Hook events

| Event | What it does |
|-------|--------------|
| **SessionStart** (`startup` or `resume`) | Writes a status snapshot under `%APPDATA%\vibecoding\status\` (or `VIBECODING_HOME`) using the hook working directory and the parent process PID. |
| **SessionEnd / Stop** | Deletes `codex-cli-<pid>.json` from the status directory. |

Use **SessionStart** and **SessionEnd** (or **Stop**) as the presence signal. Do **not** wire **PreToolUse** for presence — tool calls are not a reliable session lifecycle signal.

Keep `agentCount` at **0** unless a future SubagentStart/Stop payload is wired to update it.

## Codex hooks config (copy-paste)

Replace `<you>` with your Windows username, or use the `%APPDATA%\vibecoding\hooks\` copies if you installed the scripts there.

```toml
[[hooks.SessionStart]]
matcher = "startup|resume"

[[hooks.SessionStart.hooks]]
type = "command"
command = "node ./unused-unix.js"
commandWindows = "node C:\\Users\\<you>\\Documents\\GitHub\\what-are-we-vibecoding-today\\apps\\cli\\hooks\\codex-session-start.cjs"

[[hooks.SessionEnd]]
matcher = ".*"

[[hooks.SessionEnd.hooks]]
type = "command"
command = "node ./unused-unix.js"
commandWindows = "node C:\\Users\\<you>\\Documents\\GitHub\\what-are-we-vibecoding-today\\apps\\cli\\hooks\\codex-session-end.cjs"
```

If Codex uses **Stop** instead of **SessionEnd**, point the same `codex-session-end.cjs` script at that event:

```toml
[[hooks.Stop]]
matcher = ".*"

[[hooks.Stop.hooks]]
type = "command"
command = "node ./unused-unix.js"
commandWindows = "node C:\\Users\\<you>\\Documents\\GitHub\\what-are-we-vibecoding-today\\apps\\cli\\hooks\\codex-session-end.cjs"
```

## What the scripts do

Both scripts write or delete status files under `%APPDATA%\vibecoding\status\` (override with `VIBECODING_HOME`). The tray polls these files; no built CLI is required for hooks to work.

- **`codex-session-start.cjs`** — uses `process.cwd()` (or `cwd` from stdin JSON if Codex supplies it), uses `process.ppid`, writes `{ instanceId: "codex-cli-<pid>", pid, identity: "codex", surface: "cli", focused: false, repo, sessionTitle: null, agentCount: 0, lastActivityAt }`. Stdin may include `cwd` / `session_id`; only `cwd` is used for the repo basename. Transcript files are never read.
- **`codex-session-end.cjs`** — removes `codex-cli-<pid>.json` (equivalent to `vibecoding status --clear --instance codex-cli-<ppid>`).

If `VIBECODING_CLI` is set to a built `main.js` path, the scripts spawn that instead (escape hatch for manual `vibecoding status` usage).
