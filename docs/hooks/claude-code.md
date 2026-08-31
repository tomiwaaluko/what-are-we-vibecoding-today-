# Claude Code CLI hooks (Windows)

Wire Claude Code session events into the vibecoding tray via small Node hook scripts. These hooks write status files only — they do not read chat bodies.

**The tray does not edit your Claude Code settings.** Copy-paste the JSON below into your user-level Claude Code settings yourself.

## Setup

1. **Install the hook scripts** — copy `claude-session-start.cjs` and `claude-stop.cjs` to `%APPDATA%\vibecoding\hooks\`, or point Claude at the repo copies under `apps/cli/hooks/`. No `dist/` folder is required beside the hooks; they write status JSON directly for the tray to poll.

2. **Paste the hooks JSON** into Claude Code user settings (see below). Do not let the tray rewrite this config.

3. **Optional:** build the CLI if you want the `vibecoding status` command for manual updates:

   ```powershell
   pnpm --filter @vibecoding/cli build
   ```

## Hook events

| Event | What it does |
|-------|--------------|
| **SessionStart** | Writes a status snapshot under `%APPDATA%\vibecoding\status\` (or `VIBECODING_HOME`) using `CLAUDE_PROJECT_DIR` and the parent process PID. |
| **Agent start/stop** (if Claude exposes it) | Update `agentCount` while agents run, then `0` on Stop. |
| **SessionEnd** | Deletes `claude-code-cli-<pid>.json` from the status directory. **Stop** is the wrong event for presence — it fires after every turn and would drop the Playing card mid-session. |

Keep `agentCount` at **0** unless a future Claude hook payload includes an agent count. Do **not** set `agentCount` to 1 for the whole session lifetime.

## Claude Code settings (copy-paste)

```json
{
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node \"%APPDATA%\\vibecoding\\hooks\\claude-session-start.cjs\""
          }
        ]
      }
    ],
    "SessionEnd": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node \"%APPDATA%\\vibecoding\\hooks\\claude-stop.cjs\""
          }
        ]
      }
    ]
  }
}
```

If you keep the scripts in the repo instead of `%APPDATA%`, replace the `command` paths with the absolute path to `apps/cli/hooks/*.cjs` on your machine.

## What the scripts do

Both scripts write or delete status files under `%APPDATA%\vibecoding\status\` (override with `VIBECODING_HOME`). The tray polls these files; no built CLI is required for hooks to work.

- **`claude-session-start.cjs`** — reads `CLAUDE_PROJECT_DIR`, uses `process.ppid`, writes `{ instanceId, pid, identity: "claude-code", surface: "cli", focused: false, repo, sessionTitle: null, agentCount: 0, lastActivityAt }`.
- **`claude-stop.cjs`** — removes `claude-code-cli-<pid>.json`.

If `VIBECODING_CLI` is set to a built `main.js` path, the scripts spawn that instead (escape hatch for manual `vibecoding status` usage).
