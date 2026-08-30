# What Are We Vibecoding Today — Discord Presence

**Date:** 2026-08-30  
**Status:** Draft, pending user review of this file  
**Repo:** personal-first, structured so it can be opened for others later  
**Intended remote:** `https://github.com/tomiwaaluko/what-are-we-vibecoding-today-.git`  
(trailing hyphen is part of the GitHub repo name as given; the local folder is `what-are-we-vibecoding-today` without it)

## Goal

Show Discord friends that you are in an agentic coding tool, the way Discord already shows games and Spotify: app name, icon, and a couple of status lines. v1 covers Cursor, Claude Code, and Codex (plus VS Code via the same extension). Friends should see the primary tool, the repo, the session, whether agents are running, and a footnote when more than one of these tools is live.

This is not Discord’s official game-detection partnership. It is local Rich Presence over Discord IPC.

## Non-goals (v1)

- macOS or Linux
- Publishing to Discord’s official detected-games list
- Showing Claude Desktop **Chat** or **Cowork**, or ChatGPT **chat** (non-Codex)
- Reading or publishing chat/transcript bodies
- A signed Windows installer or auto-update
- A settings GUI beyond the tray menu (config is a JSON file; tray can open it)
- Per-repo allowlists, hide-private-repos heuristics, or other public-launch privacy product work (the config shape must allow them later)

## Identities and surfaces

Discord’s “Playing X” label is the Developer Portal application **name**. The tray publishes through **one application ID at a time**, matching the current **identity**. Switching primary identity must **clear and disconnect** the previous Discord application connection, then connect as the new app ID, then `SET_ACTIVITY`. Never leave two application connections alive (that would show two Playing cards). `SET_ACTIVITY` `pid` is always the **tray process** PID so Discord does not auto-clear when a tool window closes or keep a zombie card tied to a dead CLI.

| Identity (Playing …) | Surfaces that count | Surfaces that do not count |
|---|---|---|
| Cursor | Cursor IDE (extension) | — |
| Visual Studio Code | VS Code (same extension, `vscode` app name) | — |
| Claude Code | `claude` CLI; Claude Desktop **Code** tab | Claude Desktop Chat, Cowork |
| Codex | `codex` CLI; ChatGPT desktop **Codex** mode | ChatGPT desktop normal chat |

CLI and desktop for the same product are **one identity**. If Claude Code CLI and the Code tab are both open, friends still see “Playing Claude Code”. Session text comes from the focused surface; agent counts from surfaces of that identity are summed.

Cursor and VS Code are **different** identities so the friends list does not call VS Code “Cursor”. One extension package (VSIX) runs in both; it sets `identity` from `vscode.env.appName` (or equivalent): Cursor vs Visual Studio Code.

**Focused (IDE and desktop apps):** the OS foreground window is that app, or (extension) `window.state.focused` is true.

**Focused (CLI on Windows):** Windows Terminal (and similar hosts) use one HWND for many tabs, so we cannot reliably know which tab is selected. Rule: if a tracked CLI `pid` is running **and** a Windows Terminal / conhost / Windows Console window is foreground, that CLI instance reports `focused: true`. False positives (another tab selected in the same WT window) are accepted. CLI still loses to an IDE/desktop surface whose window is actually foreground. If no console host is foreground, CLI `focused` is false (it can still win via agents or stick).

**Multiple instances:** one snapshot per `instanceId`. Merge per identity: prefer a focused instance’s session/repo; sum `agentCount`; `lastActivityAt` is the max.

## Presence card

**Primary** decides the Playing name, large icon, and whose session/repo occupy the two lines.

Approved rule: **current tracked focus, then active agent, then stick.** Decision table:

| Tracked window focused? | Any `agentCount > 0`? | Primary |
|---|---|---|
| Yes | either | Identity of the focused surface (focus always wins among our tools) |
| No (e.g. browser, Discord) | Yes | Identity with the highest agent count (tie: most recently focused among those) |
| No | No | Last primary, if that identity is still live |
| No live surfaces | — | Clear |

Alt-tabbing to Chrome while Cursor has no agents and Claude has agents **will** switch Playing to Claude Code. That is intentional: agents beat stick when nothing we track is focused. Stick only applies when nothing is focused **and** no agents are running.

**Line 1 (`details`):** never empty. Build as:

1. Session string: agent/chat title → current file name → git branch → identity display name (always exists).
2. If `agentCount > 0`, append ` · {n} agent` or ` · {n} agents`.
3. Truncate to **128 characters** (Discord’s activity field limit).

**Line 2 (`state`):**

- Repo is the workspace **folder name**, never a full path. If `repo` is null, omit it (do not emit a leading ` · `).
- If only one identity is live: `state` is the repo folder, or omit `state` entirely when repo is null. **No footnote, no small-image overlay.**
- If two identities are live: `{repo?} · + {Secondary}` (skip ` · ` if no repo). Secondary = the non-primary live identity that would win if the current primary disappeared (focus, then agents, then recency).
- If three or more: `{repo?} · + {Secondary} + {Tertiary}`; truncate to 128 characters. Overlay stays the secondary only.

Large-image hover (also ≤128 chars): primary identity name.  
Small-image hover: secondary identity, its session title, its agent count.

**Elapsed time:** `timestamps.start` is when the current primary identity became primary. Reset when primary identity changes. Do not reset when only the session title changes.

**Idle / clear:** Clear activity when:

- no surfaces are live, or
- the user hits Pause (immediate), or
- **idle:** for `idleMinutes` (default 15) there has been **no tracked focus**, **no real activity**, and **no `agentCount > 0`**.

**`lastActivityAt` is not a heartbeat.** It updates only on real activity: file/editor changes, agent/turn start or end, session title change, or a tracked window **gaining** focus. Periodic heartbeats must refresh liveness **without** touching `lastActivityAt`. Required core test: heartbeats keep arriving, `lastActivityAt` is older than `idleMinutes`, `agentCount = 0`, unfocused → clear.

## Architecture

A Windows **tray process** is the only Discord IPC client.

Connectors only emit **snapshots**. They never call Discord.

```
extension  --HTTP 127.0.0.1-->  tray broker  --IPC-->  Discord (app ID = primary identity)
hooks      --CLI--> status file -^
desktop watchers (in-process) -^
```

### Snapshot

Every connector reports this shape (TypeScript, conceptually):

```ts
type Identity = "cursor" | "vscode" | "claude-code" | "codex";
type Surface = "ide-extension" | "cli" | "desktop";

type Snapshot = {
  instanceId: string;           // stable per window/process for this session
  pid: number;                  // OS pid of the tool (not the tray)
  identity: Identity;
  surface: Surface;
  focused: boolean;
  repo: string | null;          // folder name only
  sessionTitle: string | null;  // title/summary, never message bodies
  agentCount: number;           // running agents/turns; 0 if unknown/none
  lastActivityAt: number;       // unix ms; real activity only, not heartbeats
};
```

Ingest is **upsert by `instanceId`**. Delete on explicit exit if the connector can (CLI `status --clear --instance …`, extension `deactivate`). Otherwise:

- **Extension:** heartbeat every ~10s without changing `lastActivityAt`. Drop the instance after **30 seconds** without a heartbeat.
- **CLI / desktop:** drop the instance when `pid` is no longer running. Do not use the 30s heartbeat rule for these (hooks are event-driven).

Debounce composed SET_ACTIVITY by **~3 seconds**. Pause, identity switch (clear old app), and idle-clear are immediate.

### Components (TypeScript monorepo, pnpm)

| Piece | Responsibility |
|---|---|
| `packages/core` | Snapshot types, merge, primary picker, compositor, idle/pause, stale drop. No OS, no Discord. Unit-tested. |
| `packages/discord` | IPC client wrapper: connect as an app ID, SET_ACTIVITY with tray `pid`, **clear + disconnect** before switching app IDs, reconnect. |
| `apps/tray` | Tray menu (preview, Pause, Open config, Quit), snapshot ingest, desktop watchers, Discord writer, loopback HTTP, PID liveness for CLI/desktop. |
| `apps/extension` | Cursor + VS Code. Maps workspace, git branch, editor file, best-effort chat title, agent count, focus, activity → snapshot. Does not talk to Discord. |
| `apps/cli` | `vibecoding status …` upserts a snapshot file by `instanceId`. `vibecoding status --clear` deletes it. Succeeds if the tray HTTP is down. |

Hook **snippets** (not a long-running process): Claude Code and Codex CLI session/agent hooks invoke the CLI with title, count, `pid`, and `instanceId` only. The tray does not silently rewrite those configs. If a hook never fires, that CLI surface is simply absent.

**Claude Code hooks (v1):** document copy-paste into user-level Claude Code `hooks` for session start/end and whatever event the tool uses when an agent starts/stops. Commands call `vibecoding status` (not a Unix-only interpreter).

**Codex CLI hooks (v1):** not a Claude copy-paste. Document the Windows command field (`commandWindows` / `command_windows` as in current Codex docs), the events we actually need (`SessionStart`, `Stop` / `SessionEnd`, plus a turn/agent start-stop event if one exists — **not** `PreToolUse` as the presence signal), and that Codex may require an explicit hook trust/feature enablement on Windows. If no turn-level event exists, `agentCount` stays 0 for Codex CLI (unknown = 0).

### Tray HTTP

- Bind **127.0.0.1 only**.
- Port and a random local token written to `%APPDATA%\vibecoding\runtime.json` on start (not a secret for the internet; it only stops other local programs from casually posting status).
- Extension reads that file; if missing, retry quietly with no VS Code toasts.
- Fallback: extension may write the same per-instance status file the CLI uses.
- HTTP ingest: upsert by `instanceId`; a delete/clear endpoint (or equivalent) removes that instance.

### Status files

`%APPDATA%\vibecoding\status\{instanceId}.json`  
(not one file per identity-surface — two `claude` terminals must not overwrite each other). The tray may additionally index by identity for debugging.

### Config

`%APPDATA%\vibecoding\config.json`

v1 fields:

- `paused` (bool)
- `idleMinutes` (number, default 15)
- Discord application IDs per identity (user-created apps for now)
- `startWithWindows` (bool, default true for personal use)

Forward-compatible: later `privacy.defaultLevel` (`full` \| `tool+repo` \| `tool`) without changing the compositor’s inputs.

v1 **default display is full** (tool, repo, session, agents, multi-tool footnote).

### Discord applications and icons

Four Discord applications, created in the Developer Portal (personal apps in v1; a shared set later for public install):

1. Cursor  
2. Visual Studio Code  
3. Claude Code  
4. Codex  

Each application must upload **its own large image** and **small images for the other three identities**, because the overlay is the secondary identity while we are connected as the primary. Asset **keys ≤ 32 characters** (Discord drops longer keys). Suggested keys: `cursor`, `vscode`, `claude-code`, `codex` (large and small can share the same key names across apps).

Icons from official brand assets when license allows, otherwise extracted from the installed Windows executable, otherwise a simple monogram. Missing assets → text-only presence still publishes (footnote on line 2 still required).

### Desktop watchers (in the tray)

- **ChatGPT desktop:** process running **and** UI/window title indicates Codex mode. If the process is up but mode is unknown, **do not** emit a snapshot.
- **Claude Desktop:** process running **and** the **Code** tab is active. Chat and Cowork → no snapshot. Unknown tab → no snapshot.

These are heuristics and will break when vendors rename windows. Failure mode is silence, not a wrong “Playing ChatGPT” / “Playing Claude” while in casual chat. Implementation should spike one real title/UIA signal per surface on a Windows install before locking watcher tasks.

### Session titles (best effort)

| Surface | Preferred source | Fallback |
|---|---|---|
| Cursor / VS Code | Agent/composer/chat tab title if readable from extension APIs or documented local state | Active file name, then git branch |
| Claude Code CLI | Hook payload / session metadata the tool already exposes | cwd folder name |
| Codex CLI | Same idea | cwd folder name |
| Desktop Code / Codex | Window title or accessible UI name of the session | identity name |

Never scrape message contents. If a title cannot be obtained without that, skip to the next fallback.

### Agent count (best effort)

`agentCount` is the number of agents/turns **currently running**. **Unknown is 0.** A sitting REPL, idle CLI session, or Code tab that is merely open is **not** an agent.

- Cursor/VS Code: running agents/composers if the extension can see them; else 0.
- Claude Code CLI: running agents/subagents from hook payloads if provided; after Stop/end → 0 even if the process is still up; else 0.
- Codex CLI: in-flight turns if a hook exposes that; else 0. Do **not** set 1 for the whole CLI session lifetime.
- Desktop surfaces: 0 unless we have a concrete, testable “agent running” signal (same as unknown). No “looks busy” heuristic.

Idle depends on this: a leftover `agentCount = 1` would block the 15-minute clear.

## Error handling

- Discord not running or IPC drop: reconnect with backoff; tray label “Discord not connected”; keep snapshots so the next connect is current.
- RPC rate limit / failure: extra backoff; leave last successful activity until a new compose lands or a clear is required.
- Extension cannot reach tray: silent retry; file fallback.
- CLI when tray is down: write the status file anyway.
- Watcher cannot classify mode: no snapshot for that surface; local debug log only.
- Corrupt config: built-in defaults; do not crash.
- Missing Discord image assets: publish without images.
- Logs: local only. Do not send repo names or session titles anywhere except Discord RPC.

## Testing

CI does not talk to a real Discord client.

- **core:** primary picker decision table (focus vs agents vs stick, including alt-tab to a non-tool while an agent runs); compositor (fallbacks, never-empty details, omit footnote when solo, null repo, 128-char truncate, 3+ identities); merge of CLI+desktop same identity; instance/pid merge; idle clear **while heartbeats continue**; pause; stale heartbeat drop; PID-gone drop.
- **discord package:** mocked IPC — correct app ID, details/state/assets/timestamps, `pid` = tray; **clear + disconnect then connect** on identity switch; clear on pause/idle/disconnect.
- **cli:** upserts a valid per-instance file; `--clear` deletes it; exit 0 if tray HTTP is absent.
- **watchers:** fixture titles for Code vs Chat vs Cowork; Codex vs ChatGPT chat; unknown → no snapshot.
- **extension:** unit-map from fake `vscode` workspace/git/editor into a snapshot. No full workbench E2E in v1.

**Manual checklist** before calling v1 done: Cursor only; VS Code only; Claude CLI only; Claude Desktop Code vs Chat; Codex CLI; ChatGPT Codex on/off; Cursor + Claude together (footnote + overlay); primary follows focus; alt-tab idle ~15 min with Cursor still open and no agents; Discord quit/reopen; Pause; **disable any other Discord Rich Presence / vscode-discord extension** so a second writer cannot add another Playing card.

## Packaging and run (v1)

Windows, Discord desktop must be running for presence to appear.

v1 is run from the repo (Node). The tray should be startable at login (`startWithWindows`). A future public release can add an installer and shared application IDs; v1 does not block on that.

Users must create the four Discord applications once and paste IDs into config (documented). Application IDs are not confidential, but they are **per-install** in v1 so this repo does not depend on a single shared app the author must keep alive.

## Success criteria

Friends looking at the user’s profile can tell:

1. Which identity is primary (name + icon).
2. What the session is (or a honest fallback).
3. Which repo folder (when we have one).
4. Whether agents are running (when we can count them).
5. That a second identity is also live (footnote + overlay), without a second “Playing” card.

Wrong casual-chat statuses (Claude Chat, ChatGPT chat, Cowork) must not appear.

## Implementation order (guidance, not a plan)

1. `core` + tests for picker/compositor/idle (including heartbeat vs `lastActivityAt`).  
2. Tray + mocked Discord writer + Pause + app-ID switch sequence.  
3. Real Discord IPC + one identity (Cursor) + extension heartbeat.  
4. Claude Code CLI hooks (`pid` / `instanceId`).  
5. Codex CLI hooks (Windows command field + trust).  
6. Desktop watchers (after a title/UIA spike).  
7. Multi-identity compose + VS Code identity + overlay assets on all four apps.  
8. Manual checklist.

A separate implementation plan will break this into tasks.
