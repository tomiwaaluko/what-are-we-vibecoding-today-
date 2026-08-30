# Claude Code CLI hooks (Windows)

Wire Claude Code session events into the vibecoding tray via small Node hook scripts. These hooks write status files only — they do not read chat bodies.

**The tray does not edit your Claude Code settings.** Copy-paste the JSON below into your user-level Claude Code settings yourself.

## Setup

1. **Build the CLI** from the repo root:

   ```powershell
   pnpm --filter @vibecoding/cli build
   ```

2. **Install the hook scripts** — either:
   - Point Claude at the repo copies under `apps/cli/hooks/` after building, or
   - Copy `claude-session-start.cjs` and `claude-stop.cjs` to `%APPDATA%\vibecoding\hooks\` and point Claude at those paths.

3. **Paste the hooks JSON** into Claude Code user settings (see below). Do not let the tray rewrite this config.

## Hook events

| Event | What it does |
|-------|--------------|
| **SessionStart** | Calls `vibecoding status --identity claude-code --surface cli --pid <claude pid> --repo "$CLAUDE_PROJECT_DIR"` via a Node script that reads env and invokes the CLI (not `python3`). |
| **Agent start/stop** (if Claude exposes it) | Update `--agents N` while agents run, then `--agents 0` on Stop. |
| **Stop / session end** | Calls `vibecoding status --clear --instance claude-code-cli-<pid>`. |

Keep `--agents` at **0** unless a future Claude hook payload includes an agent count. Do **not** set `--agents 1` for the whole session lifetime.

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
    "Stop": [
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

Both scripts spawn `../dist/main.js` relative to the hook file:

- **`claude-session-start.cjs`** — reads `CLAUDE_PROJECT_DIR`, uses the parent process PID, and writes a CLI snapshot.
- **`claude-stop.cjs`** — clears the instance `claude-code-cli-<pid>`.

Rebuild the CLI after pulling changes that touch `apps/cli/src/`.
