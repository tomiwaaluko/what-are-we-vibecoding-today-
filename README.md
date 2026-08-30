# What are we vibecoding today?

Windows Discord Rich Presence for Cursor, VS Code, Claude Code, and Codex.

Repo: https://github.com/tomiwaaluko/what-are-we-vibecoding-today-.git

## Requirements

- Windows
- Node.js 22+
- pnpm
- Discord desktop running

## Setup

```powershell
pnpm install
pnpm test
```

On Windows, if `active-win` fails to load after install, run `pnpm approve-builds active-win` and reinstall.

Add to the root `package.json` scripts:

- `"test": "pnpm -r test"`
- `"build": "pnpm -r build"`
- `"tray": "pnpm --filter @vibecoding/tray start"`

Tray `package.json` `"start": "node --import tsx src/main.ts"` with `tsx` as a tray devDependency.

```powershell
pnpm tray
```

## Discord applications

Create four apps at https://discord.com/developers/applications named exactly:

1. Cursor
2. Visual Studio Code
3. Claude Code
4. Codex

On **each** app, upload Rich Presence art with keys `cursor`, `vscode`, `claude-code`, and `codex` (large + small). Keys must be 32 characters or fewer.

Paste the application IDs into `%APPDATA%\vibecoding\config.json`:

```json
{
  "paused": false,
  "idleMinutes": 15,
  "startWithWindows": true,
  "applicationIds": {
    "cursor": "YOUR_CURSOR_APP_ID",
    "vscode": "YOUR_VSCODE_APP_ID",
    "claude-code": "YOUR_CLAUDE_APP_ID",
    "codex": "YOUR_CODEX_APP_ID"
  }
}
```

Disable any other Discord Rich Presence / vscode-discord extension so you do not get a second Playing card.

## Connectors

- Cursor / VS Code: open `apps/extension` and press F5 (Extension Development Host).
- Claude Code CLI: `docs/hooks/claude-code.md`
- Codex CLI: `docs/hooks/codex.md` (use `commandWindows`; approve/trust the hook on Windows)

## Manual checklist

- Cursor only
- VS Code only
- Claude CLI only
- Claude Desktop Code vs Chat (Chat must not publish)
- Codex CLI
- ChatGPT Codex on/off (plain chat must not publish)
- Cursor + Claude together (footnote + overlay)
- Primary follows focus
- Idle ~15 min with Cursor still open and no agents
- Discord quit / reopen
- Pause
- No second Playing card
