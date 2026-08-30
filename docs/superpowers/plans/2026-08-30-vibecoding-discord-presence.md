# Vibecoding Discord Presence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a Windows tray app that publishes Discord Rich Presence for Cursor, VS Code, Claude Code, and Codex (CLI + desktop coding modes), with a VS Code/Cursor extension and a hook CLI as connectors.

**Architecture:** One tray process is the only Discord IPC client. Connectors upsert snapshots (HTTP or status files). `packages/core` is a pure broker (merge, pick primary, compose two lines, idle/stale). `packages/discord` connects as one application ID at a time. Desktop watchers fail closed unless the window is in Codex / Code tab.

**Tech Stack:** Node.js 22+, TypeScript 5.8 (ESM), pnpm workspaces, Vitest, `@xhayper/discord-rpc` ^1.3.4, `systray2` ^2.1.4, `active-win` ^8, VS Code Extension API.

## Global Constraints

- Windows only for v1 (do not add macOS/Linux detectors).
- Bind HTTP to `127.0.0.1` only.
- Discord activity `details` / `state` / image hover text max **128** characters.
- Asset keys: `cursor`, `vscode`, `claude-code`, `codex` (each ≤ 32 chars).
- `SET_ACTIVITY` `pid` is always the **tray** PID.
- One Discord application connection at a time: clear + disconnect before switching app IDs.
- Repo is a folder name, never a full path.
- `agentCount` unknown = `0`. Do not invent “busy” agents.
- `lastActivityAt` is real activity only; heartbeats must not update it.
- Extension heartbeat ~10s; drop extension instances after 30s without heartbeat.
- CLI/desktop instances drop when their `pid` is gone (not the 30s heartbeat rule).
- Debounce `SET_ACTIVITY` ~3s; Pause, identity switch, and idle-clear are immediate.
- Logs local only; do not send repo/session titles anywhere except Discord RPC.
- Do not show Claude Desktop Chat/Cowork or ChatGPT non-Codex chat.
- Do not scrape chat/transcript bodies.
- Default config: `paused=false`, `idleMinutes=15`, `startWithWindows=true`, display is full.

---

## File structure

| Path | Responsibility |
|---|---|
| `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json` | Monorepo root |
| `packages/core/src/types.ts` | Identities, Snapshot, PresenceCard, BrokerState |
| `packages/core/src/truncate.ts` | Discord 128-char clip |
| `packages/core/src/merge.ts` | Group instances by identity |
| `packages/core/src/picker.ts` | Primary / secondary / tertiary |
| `packages/core/src/compositor.ts` | Two-line card + overlay |
| `packages/core/src/stale.ts` | Heartbeat + pid drop |
| `packages/core/src/idle.ts` | 15-minute idle |
| `packages/core/src/tick.ts` | `upsert`, `remove`, `tick`, `isImmediatePublish` |
| `packages/core/src/index.ts` | Public exports |
| `packages/discord/src/ipc.ts` | `DiscordIpc` interface |
| `packages/discord/src/writer.ts` | `SwitchingDiscordWriter` |
| `packages/discord/src/xhayper.ts` | Real `@xhayper/discord-rpc` adapter |
| `apps/cli/src/main.ts` | `vibecoding status` argv |
| `apps/cli/src/status-file.ts` | Read/write `%APPDATA%\vibecoding\status\{instanceId}.json` |
| `apps/tray/src/paths.ts` | AppData roots |
| `apps/tray/src/config.ts` | Load/save `config.json` |
| `apps/tray/src/runtime.ts` | `runtime.json` port + token |
| `apps/tray/src/pid.ts` | `pidAlive` |
| `apps/tray/src/ingest.ts` | File poll + HTTP upsert/delete |
| `apps/tray/src/broker.ts` | Tick loop, debounce, call writer |
| `apps/tray/src/http.ts` | Loopback server |
| `apps/tray/src/menu.ts` | systray2 Pause / Open config / Quit |
| `apps/tray/src/startup.ts` | HKCU Run key |
| `apps/tray/src/watchers/classify.ts` | Title/process → snapshot or null |
| `apps/tray/src/watchers/poll.ts` | `active-win` loop |
| `apps/tray/src/main.ts` | Process entry |
| `apps/extension/src/map-snapshot.ts` | vscode state → Snapshot |
| `apps/extension/src/client.ts` | HTTP + file fallback |
| `apps/extension/src/extension.ts` | activate/deactivate |
| `docs/hooks/claude-code.md` | Copy-paste Claude Code hooks |
| `docs/hooks/codex.md` | Copy-paste Codex Windows hooks |
| `README.md` | Run, Discord apps, checklist |

---

### Task 1: Monorepo + merge by identity

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `tsconfig.base.json`
- Create: `packages/core/package.json`
- Create: `packages/core/tsconfig.json`
- Create: `packages/core/vitest.config.ts`
- Create: `packages/core/src/types.ts`
- Create: `packages/core/src/merge.ts`
- Create: `packages/core/src/index.ts`
- Test: `packages/core/src/__tests__/helpers.ts`
- Test: `packages/core/src/__tests__/merge.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `Snapshot`, `StoredInstance`, `MergedIdentity`, `mergeByIdentity(instances: StoredInstance[]): MergedIdentity[]`

- [ ] **Step 1: Write the failing test**

Create `packages/core/src/__tests__/helpers.ts`:

```ts
import type { Snapshot, StoredInstance } from "../types.js";

export function snap(partial: Partial<Snapshot> & Pick<Snapshot, "instanceId" | "identity">): Snapshot {
  return {
    pid: 100,
    surface: "ide-extension",
    focused: false,
    repo: null,
    sessionTitle: null,
    agentCount: 0,
    lastActivityAt: 0,
    ...partial,
  };
}

export function stored(snapshot: Snapshot, extra?: Partial<StoredInstance>): StoredInstance {
  return {
    snapshot,
    lastHeartbeatAt: 0,
    lastSeenFocusedAt: snapshot.focused ? 0 : null,
    ...extra,
  };
}
```

Create `packages/core/src/__tests__/merge.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { mergeByIdentity } from "../merge.js";
import { snap, stored } from "./helpers.js";

describe("mergeByIdentity", () => {
  it("sums agentCount across CLI and desktop of the same identity", () => {
    const merged = mergeByIdentity([
      stored(snap({ instanceId: "cli", identity: "claude-code", surface: "cli", pid: 1, agentCount: 2, sessionTitle: "cli session", repo: "a" })),
      stored(snap({ instanceId: "desk", identity: "claude-code", surface: "desktop", pid: 2, agentCount: 1, sessionTitle: "desk session", repo: "b", focused: true })),
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0].identity).toBe("claude-code");
    expect(merged[0].agentCount).toBe(3);
    expect(merged[0].sessionTitle).toBe("desk session");
    expect(merged[0].repo).toBe("b");
    expect(merged[0].focused).toBe(true);
  });

  it("prefers a focused instance for session and repo when both are unfocused-vs-focused", () => {
    const merged = mergeByIdentity([
      stored(snap({ instanceId: "a", identity: "cursor", sessionTitle: "old", repo: "one", lastActivityAt: 9 })),
      stored(snap({ instanceId: "b", identity: "cursor", sessionTitle: "new", repo: "two", focused: true, lastActivityAt: 1 })),
    ]);
    expect(merged[0].sessionTitle).toBe("new");
    expect(merged[0].repo).toBe("two");
  });

  it("uses max lastActivityAt and records lastSeenFocusedAt", () => {
    const merged = mergeByIdentity([
      stored(snap({ instanceId: "a", identity: "codex", lastActivityAt: 10 }), { lastSeenFocusedAt: 5 }),
      stored(snap({ instanceId: "b", identity: "codex", lastActivityAt: 3 }), { lastSeenFocusedAt: 8 }),
    ]);
    expect(merged[0].lastActivityAt).toBe(10);
    expect(merged[0].lastFocusedAt).toBe(8);
  });
});
```

Create `packages/core/src/types.ts` (types only — `merge.ts` still missing so the test fails):

```ts
export const IDENTITIES = ["cursor", "vscode", "claude-code", "codex"] as const;
export type Identity = (typeof IDENTITIES)[number];

export const SURFACES = ["ide-extension", "cli", "desktop"] as const;
export type Surface = (typeof SURFACES)[number];

export const IDENTITY_DISPLAY_NAME: Record<Identity, string> = {
  cursor: "Cursor",
  vscode: "Visual Studio Code",
  "claude-code": "Claude Code",
  codex: "Codex",
};

export const IDENTITY_ASSET_KEY: Record<Identity, string> = {
  cursor: "cursor",
  vscode: "vscode",
  "claude-code": "claude-code",
  codex: "codex",
};

export type Snapshot = {
  instanceId: string;
  pid: number;
  identity: Identity;
  surface: Surface;
  focused: boolean;
  repo: string | null;
  sessionTitle: string | null;
  agentCount: number;
  lastActivityAt: number;
};

export type StoredInstance = {
  snapshot: Snapshot;
  lastHeartbeatAt: number;
  lastSeenFocusedAt: number | null;
};

export type MergedIdentity = {
  identity: Identity;
  focused: boolean;
  focusedSurfaces: Surface[];
  repo: string | null;
  sessionTitle: string | null;
  agentCount: number;
  lastActivityAt: number;
  lastFocusedAt: number | null;
};

export type PresenceCard = {
  identity: Identity;
  details: string;
  state: string | null;
  largeImageKey: string;
  largeImageText: string;
  smallImageKey: string | null;
  smallImageText: string | null;
  startTimestamp: number;
};

export type BrokerState = {
  instances: Map<string, StoredInstance>;
  lastPrimary: Identity | null;
  primarySince: number | null;
  paused: boolean;
  lastCard: PresenceCard | null;
};
```

Also create the scaffold files:

`package.json`:

```json
{
  "name": "what-are-we-vibecoding-today",
  "private": true,
  "packageManager": "pnpm@10.14.0",
  "engines": { "node": ">=22" },
  "scripts": {
    "test": "pnpm -r test",
    "build": "pnpm -r build"
  }
}
```

`pnpm-workspace.yaml`:

```yaml
packages:
  - packages/*
  - apps/*
```

`tsconfig.base.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "strict": true,
    "declaration": true,
    "skipLibCheck": true,
    "verbatimModuleSyntax": true,
    "noUncheckedIndexedAccess": true
  }
}
```

`packages/core/package.json`:

```json
{
  "name": "@vibecoding/core",
  "version": "0.0.0",
  "type": "module",
  "main": "./src/index.ts",
  "exports": { ".": "./src/index.ts" },
  "scripts": {
    "test": "vitest run",
    "build": "tsc -p tsconfig.json"
  }
}
```

`packages/core/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "outDir": "dist", "rootDir": "src" },
  "include": ["src"]
}
```

`packages/core/vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { environment: "node" },
});
```

`packages/core/src/index.ts`:

```ts
export * from "./types.js";
```

- [ ] **Step 2: Run test to verify it fails**

From repo root:

```powershell
pnpm install
pnpm --filter @vibecoding/core add -D typescript vitest
pnpm --filter @vibecoding/core test
```

Expected: FAIL — `Failed to resolve import "../merge.js"` (or equivalent cannot find module).

- [ ] **Step 3: Write minimal implementation**

Create `packages/core/src/merge.ts`:

```ts
import type { MergedIdentity, StoredInstance, Surface } from "./types.js";

export function mergeByIdentity(instances: StoredInstance[]): MergedIdentity[] {
  const groups = new Map<StoredInstance["snapshot"]["identity"], StoredInstance[]>();
  for (const inst of instances) {
    const list = groups.get(inst.snapshot.identity) ?? [];
    list.push(inst);
    groups.set(inst.snapshot.identity, list);
  }

  const result: MergedIdentity[] = [];
  for (const [identity, list] of groups) {
    const focusedOnes = list.filter((i) => i.snapshot.focused);
    const preferred =
      focusedOnes.sort((a, b) => b.snapshot.lastActivityAt - a.snapshot.lastActivityAt)[0] ??
      [...list].sort((a, b) => b.snapshot.lastActivityAt - a.snapshot.lastActivityAt)[0];
    if (!preferred) continue;

    const focusedSurfaces = [
      ...new Set(focusedOnes.map((i) => i.snapshot.surface)),
    ] as Surface[];

    result.push({
      identity,
      focused: focusedOnes.length > 0,
      focusedSurfaces,
      repo: preferred.snapshot.repo,
      sessionTitle: preferred.snapshot.sessionTitle,
      agentCount: list.reduce((n, i) => n + i.snapshot.agentCount, 0),
      lastActivityAt: Math.max(...list.map((i) => i.snapshot.lastActivityAt)),
      lastFocusedAt: list.reduce<number | null>((max, i) => {
        if (i.lastSeenFocusedAt == null) return max;
        if (max == null) return i.lastSeenFocusedAt;
        return Math.max(max, i.lastSeenFocusedAt);
      }, null),
    });
  }
  return result;
}
```

Update `packages/core/src/index.ts`:

```ts
export * from "./types.js";
export * from "./merge.js";
```

- [ ] **Step 4: Run test to verify it passes**

```powershell
pnpm --filter @vibecoding/core test
```

Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```powershell
git add package.json pnpm-workspace.yaml tsconfig.base.json pnpm-lock.yaml packages/core
git commit -m "feat: add core snapshot merge by identity"
```

---

### Task 2: Primary picker

**Files:**
- Create: `packages/core/src/picker.ts`
- Test: `packages/core/src/__tests__/picker.test.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces:**
- Consumes: `MergedIdentity` from Task 1
- Produces: `pickPrimary(merged: MergedIdentity[], lastPrimary: Identity | null): Identity | null`

- [ ] **Step 1: Write the failing test**

`packages/core/src/__tests__/picker.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { MergedIdentity } from "../types.js";
import { pickPrimary } from "../picker.js";

function m(partial: Partial<MergedIdentity> & Pick<MergedIdentity, "identity">): MergedIdentity {
  return {
    focused: false,
    focusedSurfaces: [],
    repo: null,
    sessionTitle: null,
    agentCount: 0,
    lastActivityAt: 0,
    lastFocusedAt: null,
    ...partial,
  };
}

describe("pickPrimary", () => {
  it("returns null when nothing is live", () => {
    expect(pickPrimary([], "cursor")).toBeNull();
  });

  it("focus wins even if another identity has more agents", () => {
    expect(
      pickPrimary(
        [
          m({ identity: "cursor", focused: true, focusedSurfaces: ["ide-extension"], agentCount: 0 }),
          m({ identity: "claude-code", agentCount: 3, lastFocusedAt: 99 }),
        ],
        "claude-code",
      ),
    ).toBe("cursor");
  });

  it("prefers IDE/desktop focus over CLI focus false-positive", () => {
    expect(
      pickPrimary(
        [
          m({ identity: "claude-code", focused: true, focusedSurfaces: ["cli"] }),
          m({ identity: "cursor", focused: true, focusedSurfaces: ["ide-extension"] }),
        ],
        null,
      ),
    ).toBe("cursor");
  });

  it("when nothing tracked is focused, highest agentCount wins", () => {
    expect(
      pickPrimary(
        [
          m({ identity: "cursor", agentCount: 0, lastFocusedAt: 50 }),
          m({ identity: "claude-code", agentCount: 2, lastFocusedAt: 1 }),
        ],
        "cursor",
      ),
    ).toBe("claude-code");
  });

  it("agent ties break by most recently focused", () => {
    expect(
      pickPrimary(
        [
          m({ identity: "cursor", agentCount: 1, lastFocusedAt: 10 }),
          m({ identity: "codex", agentCount: 1, lastFocusedAt: 20 }),
        ],
        null,
      ),
    ).toBe("codex");
  });

  it("sticks to last primary when unfocused and no agents", () => {
    expect(
      pickPrimary(
        [
          m({ identity: "cursor", agentCount: 0 }),
          m({ identity: "vscode", agentCount: 0 }),
        ],
        "vscode",
      ),
    ).toBe("vscode");
  });

  it("falls back to first live identity if last primary is gone and no focus/agents", () => {
    expect(pickPrimary([m({ identity: "codex" })], "cursor")).toBe("codex");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```powershell
pnpm --filter @vibecoding/core test
```

Expected: FAIL — cannot find `../picker.js`.

- [ ] **Step 3: Write minimal implementation**

`packages/core/src/picker.ts`:

```ts
import type { Identity, MergedIdentity, Surface } from "./types.js";

function focusRank(m: MergedIdentity): number {
  const s = new Set<Surface>(m.focusedSurfaces);
  if (s.has("ide-extension") || s.has("desktop")) return 2;
  if (s.has("cli")) return 1;
  return 0;
}

export function pickPrimary(merged: MergedIdentity[], lastPrimary: Identity | null): Identity | null {
  if (merged.length === 0) return null;

  const focused = merged.filter((m) => m.focused);
  if (focused.length === 1) return focused[0]!.identity;
  if (focused.length > 1) {
    const ranked = [...focused].sort((a, b) => {
      const d = focusRank(b) - focusRank(a);
      if (d !== 0) return d;
      return b.lastActivityAt - a.lastActivityAt;
    });
    return ranked[0]!.identity;
  }

  const withAgents = merged.filter((m) => m.agentCount > 0);
  if (withAgents.length === 1) return withAgents[0]!.identity;
  if (withAgents.length > 1) {
    const ranked = [...withAgents].sort((a, b) => {
      const d = b.agentCount - a.agentCount;
      if (d !== 0) return d;
      return (b.lastFocusedAt ?? 0) - (a.lastFocusedAt ?? 0);
    });
    return ranked[0]!.identity;
  }

  if (lastPrimary && merged.some((m) => m.identity === lastPrimary)) return lastPrimary;
  return merged[0]!.identity;
}
```

Export from `index.ts`: `export * from "./picker.js";`

- [ ] **Step 4: Run test to verify it passes**

```powershell
pnpm --filter @vibecoding/core test
```

Expected: PASS (previous merge tests + 7 picker tests).

- [ ] **Step 5: Commit**

```powershell
git add packages/core
git commit -m "feat: pick Discord primary identity from focus then agents"
```

---

### Task 3: Presence compositor

**Files:**
- Create: `packages/core/src/truncate.ts`
- Create: `packages/core/src/compositor.ts`
- Test: `packages/core/src/__tests__/compositor.test.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces:**
- Consumes: `pickPrimary`, `MergedIdentity`, `IDENTITY_DISPLAY_NAME`, `IDENTITY_ASSET_KEY`
- Produces: `composeCard(merged: MergedIdentity[], primary: Identity, primarySince: number): PresenceCard` and `truncateDiscord(text: string): string`

- [ ] **Step 1: Write the failing test**

`packages/core/src/__tests__/compositor.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { composeCard } from "../compositor.js";
import type { MergedIdentity } from "../types.js";

function m(partial: Partial<MergedIdentity> & Pick<MergedIdentity, "identity">): MergedIdentity {
  return {
    focused: false,
    focusedSurfaces: [],
    repo: null,
    sessionTitle: null,
    agentCount: 0,
    lastActivityAt: 0,
    lastFocusedAt: null,
    ...partial,
  };
}

describe("composeCard", () => {
  it("never emits empty details; falls back to identity name", () => {
    const card = composeCard([m({ identity: "cursor" })], "cursor", 1000);
    expect(card.details).toBe("Cursor");
    expect(card.state).toBeNull();
    expect(card.smallImageKey).toBeNull();
    expect(card.largeImageKey).toBe("cursor");
    expect(card.startTimestamp).toBe(1000);
  });

  it("puts session first and omits agent clause at 0", () => {
    const card = composeCard(
      [m({ identity: "cursor", sessionTitle: "fix discord presence", repo: "what-are-we-vibecoding-today" })],
      "cursor",
      1,
    );
    expect(card.details).toBe("fix discord presence");
    expect(card.state).toBe("what-are-we-vibecoding-today");
  });

  it("appends singular and plural agent counts", () => {
    expect(
      composeCard([m({ identity: "cursor", sessionTitle: "s", agentCount: 1 })], "cursor", 1).details,
    ).toBe("s · 1 agent");
    expect(
      composeCard([m({ identity: "cursor", sessionTitle: "s", agentCount: 2 })], "cursor", 1).details,
    ).toBe("s · 2 agents");
  });

  it("footnotes a second identity without a dangling separator when repo is null", () => {
    const card = composeCard(
      [
        m({ identity: "cursor", sessionTitle: "fix discord presence", agentCount: 1, focused: true, focusedSurfaces: ["ide-extension"] }),
        m({ identity: "claude-code", sessionTitle: "explore detectors", agentCount: 2 }),
      ],
      "cursor",
      1,
    );
    expect(card.details).toBe("fix discord presence · 1 agent");
    expect(card.state).toBe("+ Claude Code");
    expect(card.smallImageKey).toBe("claude-code");
    expect(card.smallImageText).toContain("Claude Code");
    expect(card.smallImageText).toContain("explore detectors");
  });

  it("joins repo and footnote for two identities", () => {
    const card = composeCard(
      [
        m({ identity: "cursor", repo: "what-are-we-vibecoding-today", focused: true, focusedSurfaces: ["ide-extension"] }),
        m({ identity: "claude-code" }),
      ],
      "cursor",
      1,
    );
    expect(card.state).toBe("what-are-we-vibecoding-today · + Claude Code");
  });

  it("lists tertiary on the state line but overlay stays secondary", () => {
    const card = composeCard(
      [
        m({ identity: "cursor", repo: "r", focused: true, focusedSurfaces: ["ide-extension"] }),
        m({ identity: "claude-code", agentCount: 2 }),
        m({ identity: "codex", agentCount: 1 }),
      ],
      "cursor",
      1,
    );
    expect(card.state).toBe("r · + Claude Code + Codex");
    expect(card.smallImageKey).toBe("claude-code");
  });

  it("truncates details to 128 characters", () => {
    const title = "x".repeat(200);
    const card = composeCard([m({ identity: "cursor", sessionTitle: title, agentCount: 1 })], "cursor", 1);
    expect(card.details.length).toBe(128);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```powershell
pnpm --filter @vibecoding/core test
```

Expected: FAIL — cannot find `../compositor.js`.

- [ ] **Step 3: Write minimal implementation**

`packages/core/src/truncate.ts`:

```ts
export const DISCORD_TEXT_LIMIT = 128;

export function truncateDiscord(text: string): string {
  return text.length <= DISCORD_TEXT_LIMIT ? text : text.slice(0, DISCORD_TEXT_LIMIT);
}
```

`packages/core/src/compositor.ts`:

```ts
import { pickPrimary } from "./picker.js";
import { truncateDiscord } from "./truncate.js";
import type { Identity, MergedIdentity, PresenceCard } from "./types.js";
import { IDENTITY_ASSET_KEY, IDENTITY_DISPLAY_NAME } from "./types.js";

function detailsFor(m: MergedIdentity): string {
  const title = m.sessionTitle?.trim() || IDENTITY_DISPLAY_NAME[m.identity];
  if (m.agentCount <= 0) return truncateDiscord(title);
  const noun = m.agentCount === 1 ? "agent" : "agents";
  return truncateDiscord(`${title} · ${m.agentCount} ${noun}`);
}

function joinState(repo: string | null, footnote: string | null): string | null {
  if (repo && footnote) return truncateDiscord(`${repo} · ${footnote}`);
  if (repo) return truncateDiscord(repo);
  if (footnote) return truncateDiscord(footnote);
  return null;
}

function smallHover(m: MergedIdentity): string {
  const parts = [IDENTITY_DISPLAY_NAME[m.identity]];
  const title = m.sessionTitle?.trim();
  if (title) parts.push(title);
  if (m.agentCount > 0) {
    parts.push(`${m.agentCount} ${m.agentCount === 1 ? "agent" : "agents"}`);
  }
  return truncateDiscord(parts.join(" · "));
}

export function composeCard(
  merged: MergedIdentity[],
  primary: Identity,
  primarySince: number,
): PresenceCard {
  const primaryMerged = merged.find((m) => m.identity === primary);
  if (!primaryMerged) {
    throw new Error(`composeCard: primary ${primary} is not in merged set`);
  }

  const rest = merged.filter((m) => m.identity !== primary);
  const secondary = pickPrimary(rest, null);
  const afterSecondary = rest.filter((m) => m.identity !== secondary);
  const tertiary = secondary ? pickPrimary(afterSecondary, null) : null;

  let footnote: string | null = null;
  if (secondary && tertiary) {
    footnote = `+ ${IDENTITY_DISPLAY_NAME[secondary]} + ${IDENTITY_DISPLAY_NAME[tertiary]}`;
  } else if (secondary) {
    footnote = `+ ${IDENTITY_DISPLAY_NAME[secondary]}`;
  }

  const secondaryMerged = secondary ? merged.find((m) => m.identity === secondary) : undefined;

  return {
    identity: primary,
    details: detailsFor(primaryMerged),
    state: joinState(primaryMerged.repo, footnote),
    largeImageKey: IDENTITY_ASSET_KEY[primary],
    largeImageText: truncateDiscord(IDENTITY_DISPLAY_NAME[primary]),
    smallImageKey: secondary ? IDENTITY_ASSET_KEY[secondary] : null,
    smallImageText: secondaryMerged ? smallHover(secondaryMerged) : null,
    startTimestamp: primarySince,
  };
}
```

Export `truncateDiscord` and `composeCard` from `index.ts`.

- [ ] **Step 4: Run test to verify it passes**

```powershell
pnpm --filter @vibecoding/core test
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add packages/core
git commit -m "feat: compose Discord details, state, and overlay"
```

---

### Task 4: Upsert, stale drop, idle, tick

**Files:**
- Create: `packages/core/src/stale.ts`
- Create: `packages/core/src/idle.ts`
- Create: `packages/core/src/tick.ts`
- Test: `packages/core/src/__tests__/tick.test.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces:**
- Consumes: merge, picker, compositor
- Produces:
  - `HEARTBEAT_TIMEOUT_MS = 30_000`
  - `emptyBrokerState(): BrokerState`
  - `upsert(state, snapshot, now): BrokerState`
  - `removeInstance(state, instanceId): BrokerState`
  - `tick(state, now, opts: { idleMinutes: number; pidAlive: (pid: number) => boolean }): BrokerState & { card: PresenceCard | null }`
  - `isImmediatePublish(prev: PresenceCard | null, next: PresenceCard | null): boolean`

- [ ] **Step 1: Write the failing test**

`packages/core/src/__tests__/tick.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { HEARTBEAT_TIMEOUT_MS } from "../stale.js";
import { emptyBrokerState, isImmediatePublish, removeInstance, tick, upsert } from "../tick.js";
import { snap } from "./helpers.js";

const idleMinutes = 15;
const alwaysAlive = () => true;
const neverAlive = () => false;

describe("tick", () => {
  it("clears when paused even if snapshots exist", () => {
    let state = emptyBrokerState();
    state = upsert(state, snap({ instanceId: "c", identity: "cursor", focused: true, sessionTitle: "x" }), 0);
    state = { ...state, paused: true };
    const next = tick(state, 1, { idleMinutes, pidAlive: alwaysAlive });
    expect(next.card).toBeNull();
  });

  it("does not treat heartbeats as activity for idle", () => {
    const start = 0;
    let state = emptyBrokerState();
    const base = snap({
      instanceId: "c",
      identity: "cursor",
      focused: false,
      lastActivityAt: start,
      sessionTitle: "x",
    });
    state = upsert(state, base, start);
    const fifteenMin = 15 * 60 * 1000;
    for (let t = start + 10_000; t < fifteenMin; t += 10_000) {
      state = upsert(state, { ...base, lastActivityAt: start }, t);
    }
    const stillSoon = tick(state, fifteenMin - 1, { idleMinutes, pidAlive: alwaysAlive });
    expect(stillSoon.card).not.toBeNull();
    const idle = tick(state, fifteenMin, { idleMinutes, pidAlive: alwaysAlive });
    expect(idle.card).toBeNull();
  });

  it("does not idle while focused or while agents run", () => {
    const fifteenMin = 15 * 60 * 1000;
    let focused = emptyBrokerState();
    focused = upsert(
      focused,
      snap({ instanceId: "c", identity: "cursor", focused: true, lastActivityAt: 0 }),
      0,
    );
    expect(tick(focused, fifteenMin, { idleMinutes, pidAlive: alwaysAlive }).card).not.toBeNull();

    let agents = emptyBrokerState();
    agents = upsert(
      agents,
      snap({ instanceId: "c", identity: "claude-code", agentCount: 1, lastActivityAt: 0 }),
      0,
    );
    expect(tick(agents, fifteenMin, { idleMinutes, pidAlive: alwaysAlive }).card).not.toBeNull();
  });

  it("drops extension instances after 30s without heartbeat", () => {
    let state = emptyBrokerState();
    state = upsert(state, snap({ instanceId: "c", identity: "cursor", surface: "ide-extension" }), 0);
    const gone = tick(state, HEARTBEAT_TIMEOUT_MS + 1, { idleMinutes, pidAlive: alwaysAlive });
    expect(gone.card).toBeNull();
    expect(gone.instances.size).toBe(0);
  });

  it("drops CLI when pid is dead even if recently upserted", () => {
    let state = emptyBrokerState();
    state = upsert(
      state,
      snap({ instanceId: "cli", identity: "claude-code", surface: "cli", pid: 42, sessionTitle: "s" }),
      0,
    );
    const gone = tick(state, 1, { idleMinutes, pidAlive: neverAlive });
    expect(gone.instances.size).toBe(0);
    expect(gone.card).toBeNull();
  });

  it("keeps lastPrimary timestamp until identity changes", () => {
    let state = emptyBrokerState();
    state = upsert(
      state,
      snap({ instanceId: "c", identity: "cursor", focused: true, sessionTitle: "a" }),
      5,
    );
    state = tick(state, 5, { idleMinutes, pidAlive: alwaysAlive });
    expect(state.primarySince).toBe(5);
    state = upsert(
      state,
      snap({ instanceId: "c", identity: "cursor", focused: true, sessionTitle: "b", lastActivityAt: 9 }),
      9,
    );
    state = tick(state, 9, { idleMinutes, pidAlive: alwaysAlive });
    expect(state.card?.details).toBe("b");
    expect(state.primarySince).toBe(5);
  });

  it("removeInstance deletes by instanceId", () => {
    let state = emptyBrokerState();
    state = upsert(state, snap({ instanceId: "c", identity: "cursor" }), 0);
    state = removeInstance(state, "c");
    expect(state.instances.size).toBe(0);
  });
});

describe("isImmediatePublish", () => {
  it("is immediate on clear, first card, and identity switch", () => {
    const cursor = {
      identity: "cursor" as const,
      details: "d",
      state: null,
      largeImageKey: "cursor",
      largeImageText: "Cursor",
      smallImageKey: null,
      smallImageText: null,
      startTimestamp: 1,
    };
    const claude = { ...cursor, identity: "claude-code" as const, largeImageKey: "claude-code" };
    expect(isImmediatePublish(cursor, null)).toBe(true);
    expect(isImmediatePublish(null, cursor)).toBe(true);
    expect(isImmediatePublish(cursor, claude)).toBe(true);
    expect(isImmediatePublish(cursor, { ...cursor, details: "other" })).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```powershell
pnpm --filter @vibecoding/core test
```

Expected: FAIL — cannot find `../tick.js`.

- [ ] **Step 3: Write minimal implementation**

`packages/core/src/stale.ts`:

```ts
import type { StoredInstance } from "./types.js";

export const HEARTBEAT_TIMEOUT_MS = 30_000;

export function dropStale(
  instances: StoredInstance[],
  now: number,
  pidAlive: (pid: number) => boolean,
): StoredInstance[] {
  return instances.filter((inst) => {
    if (inst.snapshot.surface === "ide-extension") {
      return now - inst.lastHeartbeatAt <= HEARTBEAT_TIMEOUT_MS;
    }
    return pidAlive(inst.snapshot.pid);
  });
}
```

`packages/core/src/idle.ts`:

```ts
import type { MergedIdentity } from "./types.js";

export function isIdle(merged: MergedIdentity[], now: number, idleMinutes: number): boolean {
  if (merged.length === 0) return false;
  if (merged.some((m) => m.focused)) return false;
  if (merged.some((m) => m.agentCount > 0)) return false;
  const latest = Math.max(...merged.map((m) => m.lastActivityAt));
  return now - latest >= idleMinutes * 60 * 1000;
}
```

`packages/core/src/tick.ts`:

```ts
import { composeCard } from "./compositor.js";
import { isIdle } from "./idle.js";
import { mergeByIdentity } from "./merge.js";
import { pickPrimary } from "./picker.js";
import { dropStale } from "./stale.js";
import type { BrokerState, PresenceCard, Snapshot } from "./types.js";

export function emptyBrokerState(): BrokerState {
  return {
    instances: new Map(),
    lastPrimary: null,
    primarySince: null,
    paused: false,
    lastCard: null,
  };
}

export function upsert(state: BrokerState, snapshot: Snapshot, now: number): BrokerState {
  const prev = state.instances.get(snapshot.instanceId);
  const instances = new Map(state.instances);
  instances.set(snapshot.instanceId, {
    snapshot,
    lastHeartbeatAt: now,
    lastSeenFocusedAt: snapshot.focused ? now : (prev?.lastSeenFocusedAt ?? null),
  });
  return { ...state, instances };
}

export function removeInstance(state: BrokerState, instanceId: string): BrokerState {
  const instances = new Map(state.instances);
  instances.delete(instanceId);
  return { ...state, instances };
}

export function tick(
  state: BrokerState,
  now: number,
  opts: { idleMinutes: number; pidAlive: (pid: number) => boolean },
): BrokerState & { card: PresenceCard | null } {
  const kept = dropStale([...state.instances.values()], now, opts.pidAlive);
  const instances = new Map(kept.map((i) => [i.snapshot.instanceId, i]));
  const merged = mergeByIdentity(kept);

  if (state.paused || merged.length === 0 || isIdle(merged, now, opts.idleMinutes)) {
    return {
      ...state,
      instances,
      lastPrimary: merged.length === 0 ? null : state.lastPrimary,
      primarySince: merged.length === 0 ? null : state.primarySince,
      lastCard: null,
      card: null,
    };
  }

  const primary = pickPrimary(merged, state.lastPrimary);
  if (!primary) {
    return { ...state, instances, lastPrimary: null, primarySince: null, lastCard: null, card: null };
  }

  const primarySince = state.lastPrimary === primary && state.primarySince != null ? state.primarySince : now;
  const card = composeCard(merged, primary, primarySince);
  return {
    ...state,
    instances,
    lastPrimary: primary,
    primarySince,
    lastCard: card,
    card,
  };
}

export function isImmediatePublish(prev: PresenceCard | null, next: PresenceCard | null): boolean {
  if (next === null && prev !== null) return true;
  if (next !== null && prev === null) return true;
  if (next !== null && prev !== null && next.identity !== prev.identity) return true;
  return false;
}
```

Export stale/idle/tick symbols from `index.ts`.

- [ ] **Step 4: Run test to verify it passes**

```powershell
pnpm --filter @vibecoding/core test
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add packages/core
git commit -m "feat: broker tick with idle, pause, and stale drop"
```

---

### Task 5: Discord writer that switches application IDs

**Files:**
- Create: `packages/discord/package.json`
- Create: `packages/discord/tsconfig.json`
- Create: `packages/discord/vitest.config.ts`
- Create: `packages/discord/src/ipc.ts`
- Create: `packages/discord/src/writer.ts`
- Create: `packages/discord/src/index.ts`
- Test: `packages/discord/src/__tests__/writer.test.ts`

**Interfaces:**
- Consumes: `PresenceCard`, `Identity` from `@vibecoding/core`
- Produces: `DiscordIpc`, `SwitchingDiscordWriter` with `publish(card, trayPid)` and `clear()`

- [ ] **Step 1: Write the failing test**

`packages/discord/package.json`:

```json
{
  "name": "@vibecoding/discord",
  "version": "0.0.0",
  "type": "module",
  "main": "./src/index.ts",
  "exports": { ".": "./src/index.ts" },
  "scripts": {
    "test": "vitest run",
    "build": "tsc -p tsconfig.json"
  },
  "dependencies": {
    "@vibecoding/core": "workspace:*"
  }
}
```

`packages/discord/tsconfig.json` and `vitest.config.ts` match core (extend `../../tsconfig.base.json`).

`packages/discord/src/__tests__/writer.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { PresenceCard } from "@vibecoding/core";
import type { DiscordIpc, SetActivityPayload } from "../ipc.js";
import { SwitchingDiscordWriter } from "../writer.js";

class FakeIpc implements DiscordIpc {
  appId: string;
  connected = false;
  activities: SetActivityPayload[] = [];
  cleared = 0;
  disconnected = 0;
  constructor(appId: string) {
    this.appId = appId;
  }
  async connect(): Promise<void> {
    this.connected = true;
  }
  async setActivity(activity: SetActivityPayload): Promise<void> {
    this.activities.push(activity);
  }
  async clearActivity(): Promise<void> {
    this.cleared += 1;
  }
  async disconnect(): Promise<void> {
    this.connected = false;
    this.disconnected += 1;
  }
}

const card = (identity: PresenceCard["identity"]): PresenceCard => ({
  identity,
  details: "fix it",
  state: "repo · + Claude Code",
  largeImageKey: identity === "cursor" ? "cursor" : "claude-code",
  largeImageText: identity === "cursor" ? "Cursor" : "Claude Code",
  smallImageKey: identity === "cursor" ? "claude-code" : null,
  smallImageText: identity === "cursor" ? "Claude Code · explore" : null,
  startTimestamp: 1_700_000_000_000,
});

describe("SwitchingDiscordWriter", () => {
  it("connects as the card identity app id and sends tray pid plus assets", async () => {
    const created: FakeIpc[] = [];
    const writer = new SwitchingDiscordWriter(
      { cursor: "app-cursor", vscode: "v", "claude-code": "c", codex: "x" },
      (appId) => {
        const ipc = new FakeIpc(appId);
        created.push(ipc);
        return ipc;
      },
    );
    await writer.publish(card("cursor"), 4321);
    expect(created).toHaveLength(1);
    expect(created[0]!.appId).toBe("app-cursor");
    expect(created[0]!.connected).toBe(true);
    expect(created[0]!.activities[0]).toEqual({
      pid: 4321,
      details: "fix it",
      state: "repo · + Claude Code",
      startTimestamp: 1_700_000_000_000,
      largeImageKey: "cursor",
      largeImageText: "Cursor",
      smallImageKey: "claude-code",
      smallImageText: "Claude Code · explore",
    });
  });

  it("clears and disconnects the old client before connecting the new app id", async () => {
    const created: FakeIpc[] = [];
    const writer = new SwitchingDiscordWriter(
      { cursor: "app-cursor", vscode: "v", "claude-code": "app-claude", codex: "x" },
      (appId) => {
        const ipc = new FakeIpc(appId);
        created.push(ipc);
        return ipc;
      },
    );
    await writer.publish(card("cursor"), 1);
    await writer.publish(card("claude-code"), 1);
    expect(created[0]!.cleared).toBe(1);
    expect(created[0]!.disconnected).toBe(1);
    expect(created[0]!.connected).toBe(false);
    expect(created[1]!.appId).toBe("app-claude");
    expect(created[1]!.connected).toBe(true);
    expect(created[1]!.activities).toHaveLength(1);
  });

  it("omits null state and small image keys", async () => {
    const created: FakeIpc[] = [];
    const writer = new SwitchingDiscordWriter(
      { cursor: "app-cursor", vscode: "v", "claude-code": "c", codex: "x" },
      (appId) => {
        const ipc = new FakeIpc(appId);
        created.push(ipc);
        return ipc;
      },
    );
    await writer.publish({ ...card("cursor"), state: null, smallImageKey: null, smallImageText: null }, 9);
    const activity = created[0]!.activities[0]!;
    expect(activity).not.toHaveProperty("state");
    expect(activity).not.toHaveProperty("smallImageKey");
    expect(activity).not.toHaveProperty("smallImageText");
  });

  it("clear disconnects without opening a new client", async () => {
    const created: FakeIpc[] = [];
    const writer = new SwitchingDiscordWriter(
      { cursor: "app-cursor", vscode: "v", "claude-code": "c", codex: "x" },
      (appId) => {
        const ipc = new FakeIpc(appId);
        created.push(ipc);
        return ipc;
      },
    );
    await writer.publish(card("cursor"), 1);
    await writer.clear();
    expect(created).toHaveLength(1);
    expect(created[0]!.cleared).toBe(1);
    expect(created[0]!.disconnected).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```powershell
pnpm --filter @vibecoding/discord add -D typescript vitest
pnpm --filter @vibecoding/discord test
```

Expected: FAIL — cannot find `../writer.js`.

- [ ] **Step 3: Write minimal implementation**

`packages/discord/src/ipc.ts`:

```ts
export type SetActivityPayload = {
  pid: number;
  details: string;
  state?: string;
  startTimestamp: number;
  largeImageKey: string;
  largeImageText: string;
  smallImageKey?: string;
  smallImageText?: string;
};

export type DiscordIpc = {
  connect(): Promise<void>;
  setActivity(activity: SetActivityPayload): Promise<void>;
  clearActivity(): Promise<void>;
  disconnect(): Promise<void>;
};
```

`packages/discord/src/writer.ts`:

```ts
import type { Identity, PresenceCard } from "@vibecoding/core";
import type { DiscordIpc, SetActivityPayload } from "./ipc.js";

export class SwitchingDiscordWriter {
  private current: { identity: Identity; ipc: DiscordIpc } | null = null;

  constructor(
    private readonly appIds: Record<Identity, string>,
    private readonly createIpc: (appId: string) => DiscordIpc,
  ) {}

  async publish(card: PresenceCard, trayPid: number): Promise<void> {
    const appId = this.appIds[card.identity];
    if (!appId) {
      await this.clear();
      return;
    }
    if (this.current && this.current.identity !== card.identity) {
      await this.clear();
    }
    if (!this.current) {
      const ipc = this.createIpc(appId);
      await ipc.connect();
      this.current = { identity: card.identity, ipc };
    }
    await this.current.ipc.setActivity(toPayload(card, trayPid));
  }

  async clear(): Promise<void> {
    if (!this.current) return;
    try {
      await this.current.ipc.clearActivity();
    } finally {
      await this.current.ipc.disconnect();
      this.current = null;
    }
  }
}

function toPayload(card: PresenceCard, trayPid: number): SetActivityPayload {
  const payload: SetActivityPayload = {
    pid: trayPid,
    details: card.details,
    startTimestamp: card.startTimestamp,
    largeImageKey: card.largeImageKey,
    largeImageText: card.largeImageText,
  };
  if (card.state) payload.state = card.state;
  if (card.smallImageKey) payload.smallImageKey = card.smallImageKey;
  if (card.smallImageText) payload.smallImageText = card.smallImageText;
  return payload;
}
```

`packages/discord/src/index.ts`:

```ts
export type { DiscordIpc, SetActivityPayload } from "./ipc.js";
export { SwitchingDiscordWriter } from "./writer.js";
```

- [ ] **Step 4: Run test to verify it passes**

```powershell
pnpm --filter @vibecoding/discord test
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add packages/discord
git commit -m "feat: switch Discord app id without overlapping presence"
```

---

### Task 6: `vibecoding` CLI status files

**Files:**
- Create: `apps/cli/package.json`
- Create: `apps/cli/tsconfig.json`
- Create: `apps/cli/vitest.config.ts`
- Create: `apps/cli/src/status-file.ts`
- Create: `apps/cli/src/parse-args.ts`
- Create: `apps/cli/src/main.ts`
- Test: `apps/cli/src/__tests__/status-file.test.ts`
- Test: `apps/cli/src/__tests__/parse-args.test.ts`

**Interfaces:**
- Consumes: `Snapshot` from `@vibecoding/core`
- Produces: `writeStatus(dir, snapshot)`, `deleteStatus(dir, instanceId)`, `parseStatusArgs(argv): { action: "upsert", snapshot: Snapshot } | { action: "clear", instanceId: string }`
- Default `instanceId` is `${identity}-${surface}-${pid}`
- Default `pid` is `process.ppid`
- `--repo` is stored as `basename` only (if a path is passed, strip it)
- Exit 0 even when the tray is not running (files only)

- [ ] **Step 1: Write the failing test**

`apps/cli/package.json`:

```json
{
  "name": "@vibecoding/cli",
  "version": "0.0.0",
  "type": "module",
  "bin": { "vibecoding": "./src/main.ts" },
  "scripts": { "test": "vitest run" },
  "dependencies": { "@vibecoding/core": "workspace:*" }
}
```

`apps/cli/src/__tests__/status-file.test.ts`:

```ts
import { mkdtempSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { Snapshot } from "@vibecoding/core";
import { deleteStatus, writeStatus } from "../status-file.js";

const sample: Snapshot = {
  instanceId: "claude-code-cli-9",
  pid: 9,
  identity: "claude-code",
  surface: "cli",
  focused: false,
  repo: "what-are-we-vibecoding-today",
  sessionTitle: "explore detectors",
  agentCount: 0,
  lastActivityAt: 123,
};

describe("status files", () => {
  it("upserts per instanceId and delete removes the file", () => {
    const dir = mkdtempSync(join(tmpdir(), "vibecoding-"));
    writeStatus(dir, sample);
    const path = join(dir, "claude-code-cli-9.json");
    expect(JSON.parse(readFileSync(path, "utf8"))).toEqual(sample);
    deleteStatus(dir, sample.instanceId);
    expect(existsSync(path)).toBe(false);
  });
});
```

`apps/cli/src/__tests__/parse-args.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseStatusArgs } from "../parse-args.js";

describe("parseStatusArgs", () => {
  it("builds an upsert snapshot and basenames repo paths", () => {
    const parsed = parseStatusArgs(
      [
        "status",
        "--identity",
        "claude-code",
        "--surface",
        "cli",
        "--pid",
        "42",
        "--repo",
        "C:\\Users\\gokug\\proj\\what-are-we-vibecoding-today",
        "--session",
        "explore detectors",
        "--agents",
        "0",
        "--activity-at",
        "99",
      ],
      1,
    );
    expect(parsed).toEqual({
      action: "upsert",
      snapshot: {
        instanceId: "claude-code-cli-42",
        pid: 42,
        identity: "claude-code",
        surface: "cli",
        focused: false,
        repo: "what-are-we-vibecoding-today",
        sessionTitle: "explore detectors",
        agentCount: 0,
        lastActivityAt: 99,
      },
    });
  });

  it("parses --clear --instance", () => {
    expect(parseStatusArgs(["status", "--clear", "--instance", "abc"], 1)).toEqual({
      action: "clear",
      instanceId: "abc",
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```powershell
pnpm --filter @vibecoding/cli add -D typescript vitest
pnpm --filter @vibecoding/cli test
```

Expected: FAIL — missing modules.

- [ ] **Step 3: Write minimal implementation**

`apps/cli/src/status-file.ts`:

```ts
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import type { Snapshot } from "@vibecoding/core";

export function writeStatus(dir: string, snapshot: Snapshot): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${snapshot.instanceId}.json`), `${JSON.stringify(snapshot)}\n`, "utf8");
}

export function deleteStatus(dir: string, instanceId: string): void {
  rmSync(join(dir, `${instanceId}.json`), { force: true });
}
```

`apps/cli/src/parse-args.ts`:

```ts
import { basename } from "node:path";
import type { Identity, Snapshot, Surface } from "@vibecoding/core";
import { IDENTITIES, SURFACES } from "@vibecoding/core";

export type ParsedArgs =
  | { action: "upsert"; snapshot: Snapshot }
  | { action: "clear"; instanceId: string };

function flag(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  if (i === -1) return undefined;
  return args[i + 1];
}

function has(args: string[], name: string): boolean {
  return args.includes(name);
}

function asIdentity(value: string | undefined): Identity {
  if (!value || !(IDENTITIES as readonly string[]).includes(value)) {
    throw new Error(`--identity must be one of ${IDENTITIES.join(", ")}`);
  }
  return value as Identity;
}

function asSurface(value: string | undefined): Surface {
  if (!value || !(SURFACES as readonly string[]).includes(value)) {
    throw new Error(`--surface must be one of ${SURFACES.join(", ")}`);
  }
  return value as Surface;
}

function repoName(raw: string | undefined): string | null {
  if (!raw) return null;
  return basename(raw.replace(/[\\/]+$/, "")) || null;
}

export function parseStatusArgs(argv: string[], now: number): ParsedArgs {
  const args = argv[0] === "status" ? argv.slice(1) : argv;
  if (has(args, "--clear")) {
    const instanceId = flag(args, "--instance");
    if (!instanceId) throw new Error("--clear requires --instance");
    return { action: "clear", instanceId };
  }
  const identity = asIdentity(flag(args, "--identity"));
  const surface = asSurface(flag(args, "--surface") ?? "cli");
  const pid = Number(flag(args, "--pid") ?? process.ppid);
  if (!Number.isInteger(pid) || pid <= 0) throw new Error("--pid must be a positive integer");
  const instanceId = flag(args, "--instance") ?? `${identity}-${surface}-${pid}`;
  const agents = Number(flag(args, "--agents") ?? "0");
  const activityAt = Number(flag(args, "--activity-at") ?? String(now));
  return {
    action: "upsert",
    snapshot: {
      instanceId,
      pid,
      identity,
      surface,
      focused: has(args, "--focused"),
      repo: repoName(flag(args, "--repo")),
      sessionTitle: flag(args, "--session") ?? null,
      agentCount: Number.isFinite(agents) ? agents : 0,
      lastActivityAt: activityAt,
    },
  };
}
```

`apps/cli/src/main.ts`:

```ts
import { parseStatusArgs } from "./parse-args.js";
import { statusDir } from "./paths.js";
import { deleteStatus, writeStatus } from "./status-file.js";

export async function runCli(argv: string[], env: NodeJS.ProcessEnv, now = Date.now()): Promise<number> {
  try {
    const parsed = parseStatusArgs(argv, now);
    const dir = statusDir(env);
    if (parsed.action === "clear") deleteStatus(dir, parsed.instanceId);
    else writeStatus(dir, parsed.snapshot);
    return 0;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(`${message}\n`);
    return 1;
  }
}

const isDirect = Boolean(process.argv[1] && /main\.(ts|js)$/i.test(process.argv[1]));
if (isDirect) {
  runCli(process.argv.slice(2), process.env).then((code) => process.exit(code));
}
```

`apps/cli/src/paths.ts`:

```ts
import { join } from "node:path";

export function appDataRoot(env: NodeJS.ProcessEnv): string {
  const override = env.VIBECODING_HOME;
  if (override) return override;
  const appdata = env.APPDATA;
  if (!appdata) throw new Error("APPDATA is not set");
  return join(appdata, "vibecoding");
}

export function statusDir(env: NodeJS.ProcessEnv): string {
  return join(appDataRoot(env), "status");
}
```

- [ ] **Step 4: Run test to verify it passes**

Add a small test that `runCli` returns 0:

```ts
import { mkdtempSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runCli } from "../main.js";

describe("runCli", () => {
  it("exits 0 after writing a status file", async () => {
    const home = mkdtempSync(join(tmpdir(), "vibecoding-home-"));
    const code = await runCli(
      ["status", "--identity", "codex", "--surface", "cli", "--pid", "7"],
      { ...process.env, VIBECODING_HOME: home },
      1,
    );
    expect(code).toBe(0);
    expect(existsSync(join(home, "status", "codex-cli-7.json"))).toBe(true);
  });
});
```

Put that in `apps/cli/src/__tests__/main.test.ts`.

```powershell
pnpm --filter @vibecoding/cli test
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add apps/cli
git commit -m "feat: add vibecoding CLI that writes per-instance status files"
```

---

### Task 7: Tray paths, config, file ingest, broker loop

**Files:**
- Create: `apps/tray/package.json`
- Create: `apps/tray/tsconfig.json`
- Create: `apps/tray/vitest.config.ts`
- Create: `apps/tray/src/paths.ts` (same `VIBECODING_HOME` / `%APPDATA%\vibecoding` rules as CLI)
- Create: `apps/tray/src/config.ts`
- Create: `apps/tray/src/pid.ts`
- Create: `apps/tray/src/ingest-files.ts`
- Create: `apps/tray/src/broker.ts`
- Test: `apps/tray/src/__tests__/config.test.ts`
- Test: `apps/tray/src/__tests__/ingest-files.test.ts`
- Test: `apps/tray/src/__tests__/broker.test.ts`

**Interfaces:**
- Consumes: `tick`, `upsert`, `emptyBrokerState`, `isImmediatePublish`, `SwitchingDiscordWriter`
- Produces: `loadConfig` / `saveConfig`, `readStatusDir`, `createBrokerController`
- Config defaults: `paused=false`, `idleMinutes=15`, `startWithWindows=true`, empty application IDs
- Corrupt JSON → defaults (do not throw)
- Debounce 3000ms unless `isImmediatePublish`

- [ ] **Step 1: Write the failing tests**

`apps/tray/src/__tests__/config.test.ts`:

```ts
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG, loadConfig, saveConfig } from "../config.js";

describe("config", () => {
  it("returns defaults when the file is missing or corrupt", () => {
    const home = mkdtempSync(join(tmpdir(), "vc-"));
    expect(loadConfig(home)).toEqual(DEFAULT_CONFIG);
    writeFileSync(join(home, "config.json"), "{not json", "utf8");
    expect(loadConfig(home)).toEqual(DEFAULT_CONFIG);
  });

  it("round-trips paused and application ids", () => {
    const home = mkdtempSync(join(tmpdir(), "vc-"));
    const cfg = { ...DEFAULT_CONFIG, paused: true, applicationIds: { ...DEFAULT_CONFIG.applicationIds, cursor: "abc" } };
    saveConfig(home, cfg);
    expect(loadConfig(home).paused).toBe(true);
    expect(loadConfig(home).applicationIds.cursor).toBe("abc");
  });
});
```

`apps/tray/src/__tests__/ingest-files.test.ts`:

```ts
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { writeStatus } from "../../../cli/src/status-file.js";
import { readStatusDir } from "../ingest-files.js";
import type { Snapshot } from "@vibecoding/core";

describe("readStatusDir", () => {
  it("loads snapshots and skips invalid json", () => {
    const dir = mkdtempSync(join(tmpdir(), "st-"));
    const snapshot: Snapshot = {
      instanceId: "codex-cli-1",
      pid: 1,
      identity: "codex",
      surface: "cli",
      focused: false,
      repo: "r",
      sessionTitle: "s",
      agentCount: 0,
      lastActivityAt: 1,
    };
    writeStatus(dir, snapshot);
    expect(readStatusDir(dir).map((s) => s.instanceId)).toEqual(["codex-cli-1"]);
  });
});
```

Avoid importing CLI via relative `apps` path. Duplicate a tiny write in the test using `writeFileSync` instead (do not couple tray tests to CLI internals):

```ts
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readStatusDir } from "../ingest-files.js";

it("loads snapshots and skips invalid json", () => {
  const dir = mkdtempSync(join(tmpdir(), "st-"));
  writeFileSync(
    join(dir, "codex-cli-1.json"),
    JSON.stringify({
      instanceId: "codex-cli-1",
      pid: 1,
      identity: "codex",
      surface: "cli",
      focused: false,
      repo: "r",
      sessionTitle: "s",
      agentCount: 0,
      lastActivityAt: 1,
    }),
  );
  writeFileSync(join(dir, "bad.json"), "{", "utf8");
  expect(readStatusDir(dir).map((s) => s.instanceId)).toEqual(["codex-cli-1"]);
});
```

`apps/tray/src/__tests__/broker.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import type { PresenceCard } from "@vibecoding/core";
import { createBrokerController } from "../broker.js";

class RecordingWriter {
  published: PresenceCard[] = [];
  clears = 0;
  async publish(card: PresenceCard): Promise<void> {
    this.published.push(card);
  }
  async clear(): Promise<void> {
    this.clears += 1;
  }
}

describe("createBrokerController", () => {
  it("publishes immediately on first card and clears immediately on pause", async () => {
    const writer = new RecordingWriter();
    const broker = createBrokerController({
      writer,
      trayPid: 7,
      pidAlive: () => true,
      now: () => 0,
      idleMinutes: 15,
      debounceMs: 3000,
    });
    await broker.upsert({
      instanceId: "c",
      pid: 1,
      identity: "cursor",
      surface: "ide-extension",
      focused: true,
      repo: "r",
      sessionTitle: "s",
      agentCount: 0,
      lastActivityAt: 0,
    });
    expect(writer.published).toHaveLength(1);
    expect(writer.published[0]!.details).toBe("s");
    await broker.setPaused(true);
    expect(writer.clears).toBe(1);
  });

  it("debounces non-identity session edits", async () => {
    vi.useFakeTimers();
    const writer = new RecordingWriter();
    let now = 0;
    const broker = createBrokerController({
      writer,
      trayPid: 7,
      pidAlive: () => true,
      now: () => now,
      idleMinutes: 15,
      debounceMs: 3000,
    });
    await broker.upsert({
      instanceId: "c",
      pid: 1,
      identity: "cursor",
      surface: "ide-extension",
      focused: true,
      repo: "r",
      sessionTitle: "a",
      agentCount: 0,
      lastActivityAt: 0,
    });
    now = 100;
    await broker.upsert({
      instanceId: "c",
      pid: 1,
      identity: "cursor",
      surface: "ide-extension",
      focused: true,
      repo: "r",
      sessionTitle: "b",
      agentCount: 0,
      lastActivityAt: 100,
    });
    expect(writer.published).toHaveLength(1);
    now = 3000;
    await vi.advanceTimersByTimeAsync(3000);
    expect(writer.published.at(-1)?.details).toBe("b");
    vi.useRealTimers();
  });
});
```

The debounce test needs the broker to schedule a timer. Implement `createBrokerController` with `setTimeout` so fake timers work. If the first implementation uses a manual `flush()` instead of timers, change the test to call `await broker.flush()` at `now = 3000` instead of `advanceTimersByTimeAsync`. **Use explicit `flush()`** so tests do not depend on fake timers:

Replace the second test with:

```ts
  it("debounces non-identity session edits until flush after 3s", async () => {
    const writer = new RecordingWriter();
    let now = 0;
    const broker = createBrokerController({
      writer,
      trayPid: 7,
      pidAlive: () => true,
      now: () => now,
      idleMinutes: 15,
      debounceMs: 3000,
    });
    await broker.upsert({
      instanceId: "c",
      pid: 1,
      identity: "cursor",
      surface: "ide-extension",
      focused: true,
      repo: "r",
      sessionTitle: "a",
      agentCount: 0,
      lastActivityAt: 0,
    });
    now = 100;
    await broker.upsert({
      instanceId: "c",
      pid: 1,
      identity: "cursor",
      surface: "ide-extension",
      focused: true,
      repo: "r",
      sessionTitle: "b",
      agentCount: 0,
      lastActivityAt: 100,
    });
    expect(writer.published).toHaveLength(1);
    now = 3000;
    await broker.flush();
    expect(writer.published.at(-1)?.details).toBe("b");
  });
```

- [ ] **Step 2: Run test to verify it fails**

```powershell
pnpm --filter @vibecoding/tray add @vibecoding/core @vibecoding/discord
pnpm --filter @vibecoding/tray add -D typescript vitest
pnpm --filter @vibecoding/tray test
```

Expected: FAIL — missing modules. (`package.json` name `@vibecoding/tray`, `"type": "module"`, vitest script like core.)

- [ ] **Step 3: Write minimal implementation**

`apps/tray/src/paths.ts` — copy `appDataRoot` / `statusDir` from CLI (`VIBECODING_HOME` override). Also:

```ts
export function configPath(home: string): string {
  return join(home, "config.json");
}
```

`apps/tray/src/config.ts`:

```ts
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Identity } from "@vibecoding/core";
import { IDENTITIES } from "@vibecoding/core";

export type AppConfig = {
  paused: boolean;
  idleMinutes: number;
  startWithWindows: boolean;
  applicationIds: Record<Identity, string>;
};

export const DEFAULT_CONFIG: AppConfig = {
  paused: false,
  idleMinutes: 15,
  startWithWindows: true,
  applicationIds: { cursor: "", vscode: "", "claude-code": "", codex: "" },
};

export function loadConfig(home: string): AppConfig {
  try {
    const raw = JSON.parse(readFileSync(join(home, "config.json"), "utf8")) as Partial<AppConfig>;
    const applicationIds = { ...DEFAULT_CONFIG.applicationIds };
    for (const id of IDENTITIES) {
      if (typeof raw.applicationIds?.[id] === "string") applicationIds[id] = raw.applicationIds[id];
    }
    return {
      paused: Boolean(raw.paused),
      idleMinutes: typeof raw.idleMinutes === "number" && raw.idleMinutes > 0 ? raw.idleMinutes : 15,
      startWithWindows: raw.startWithWindows ?? true,
      applicationIds,
    };
  } catch {
    return { ...DEFAULT_CONFIG, applicationIds: { ...DEFAULT_CONFIG.applicationIds } };
  }
}

export function saveConfig(home: string, config: AppConfig): void {
  mkdirSync(home, { recursive: true });
  writeFileSync(join(home, "config.json"), `${JSON.stringify(config, null, 2)}\n`, "utf8");
}
```

`apps/tray/src/ingest-files.ts`:

```ts
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Snapshot } from "@vibecoding/core";
import { IDENTITIES, SURFACES } from "@vibecoding/core";

export function readStatusDir(dir: string): Snapshot[] {
  let names: string[] = [];
  try {
    names = readdirSync(dir);
  } catch {
    return [];
  }
  const out: Snapshot[] = [];
  for (const name of names) {
    if (!name.endsWith(".json")) continue;
    try {
      const raw = JSON.parse(readFileSync(join(dir, name), "utf8")) as Snapshot;
      if (
        typeof raw.instanceId === "string" &&
        IDENTITIES.includes(raw.identity) &&
        SURFACES.includes(raw.surface)
      ) {
        out.push(raw);
      }
    } catch {
      /* skip */
    }
  }
  return out;
}
```

`apps/tray/src/pid.ts`:

```ts
export function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
```

`apps/tray/src/broker.ts`:

```ts
import {
  emptyBrokerState,
  isImmediatePublish,
  removeInstance,
  tick,
  upsert,
  type PresenceCard,
  type Snapshot,
} from "@vibecoding/core";

export type PresenceWriter = {
  publish(card: PresenceCard, trayPid: number): Promise<void>;
  clear(): Promise<void>;
};

export function createBrokerController(opts: {
  writer: PresenceWriter;
  trayPid: number;
  pidAlive: (pid: number) => boolean;
  now: () => number;
  idleMinutes: number;
  debounceMs: number;
}) {
  let state = emptyBrokerState();
  let lastFlushAt = -opts.debounceMs;
  let pending = false;

  async function apply(): Promise<void> {
    const next = tick(state, opts.now(), { idleMinutes: opts.idleMinutes, pidAlive: opts.pidAlive });
    const immediate = isImmediatePublish(state.lastCard, next.card);
    const due = opts.now() - lastFlushAt >= opts.debounceMs;
    if (!immediate && !due && next.card) {
      pending = true;
      state = { ...next };
      return;
    }
    pending = false;
    lastFlushAt = opts.now();
    if (next.card) await opts.writer.publish(next.card, opts.trayPid);
    else await opts.writer.clear();
    state = { ...next };
  }

  return {
    async upsert(snapshot: Snapshot) {
      state = upsert(state, snapshot, opts.now());
      await apply();
    },
    async setPaused(paused: boolean) {
      state = { ...state, paused };
      await apply();
    },
    async flush() {
      if (!pending && state.lastCard !== null) {
        /* still allow forced tick for time passing */
      }
      lastFlushAt = -opts.debounceMs;
      await apply();
    },
    async remove(instanceId: string) {
      state = removeInstance(state, instanceId);
      await apply();
    },
    getState() {
      return state;
    },
  };
}
```

Import `removeInstance` from `@vibecoding/core` at the top of `broker.ts` (alongside `upsert`).

Fix `flush()` so it always ticks and publishes if due:

```ts
    async flush() {
      lastFlushAt = -opts.debounceMs;
      await apply();
    },
```

- [ ] **Step 4: Run test to verify it passes**

```powershell
pnpm --filter @vibecoding/tray test
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add apps/tray
git commit -m "feat: tray broker loop with config, ingest, and debounce"
```

---

### Task 8: Loopback HTTP ingest + tray menu Pause

**Files:**
- Create: `apps/tray/src/runtime.ts`
- Create: `apps/tray/src/http.ts`
- Create: `apps/tray/src/menu.ts`
- Create: `apps/tray/src/main.ts`
- Create: `apps/tray/scripts/write-icon.mjs`
- Create: `apps/tray/assets/icon.ico` (generated)
- Test: `apps/tray/src/__tests__/http.test.ts`
- Modify: `apps/tray/package.json` (add `systray2`)

**Interfaces:**
- Consumes: broker `upsert` / `setPaused`
- Produces: HTTP `PUT /snapshot` and `DELETE /snapshot/:instanceId` with `Authorization: Bearer <token>`
- Listen `127.0.0.1` ephemeral port; write `%APPDATA%\vibecoding\runtime.json` `{ port, token }`
- Wrong token → 401; non-loopback not bound
- Tray items: current details (disabled), Pause (checkbox), Open config (`cmd /c start config.json`), Quit

- [ ] **Step 1: Write the failing test**

`apps/tray/src/__tests__/http.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { startSnapshotServer } from "../http.js";

describe("startSnapshotServer", () => {
  it("upserts with bearer token and rejects bad tokens", async () => {
    const upserts: unknown[] = [];
    const removed: string[] = [];
    const server = await startSnapshotServer({
      token: "secret",
      onUpsert: async (s) => {
        upserts.push(s);
      },
      onRemove: async (id) => {
        removed.push(id);
      },
    });
    const snap = {
      instanceId: "c",
      pid: 1,
      identity: "cursor",
      surface: "ide-extension",
      focused: true,
      repo: "r",
      sessionTitle: "s",
      agentCount: 0,
      lastActivityAt: 1,
    };
    const denied = await fetch(`http://127.0.0.1:${server.port}/snapshot`, {
      method: "PUT",
      headers: { Authorization: "Bearer nope", "Content-Type": "application/json" },
      body: JSON.stringify(snap),
    });
    expect(denied.status).toBe(401);
    const ok = await fetch(`http://127.0.0.1:${server.port}/snapshot`, {
      method: "PUT",
      headers: { Authorization: "Bearer secret", "Content-Type": "application/json" },
      body: JSON.stringify(snap),
    });
    expect(ok.status).toBe(204);
    expect(upserts).toHaveLength(1);
    const del = await fetch(`http://127.0.0.1:${server.port}/snapshot/c`, {
      method: "DELETE",
      headers: { Authorization: "Bearer secret" },
    });
    expect(del.status).toBe(204);
    expect(removed).toEqual(["c"]);
    await server.close();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```powershell
pnpm --filter @vibecoding/tray test
```

Expected: FAIL — cannot find `../http.js`.

- [ ] **Step 3: Write minimal implementation**

`apps/tray/src/http.ts`:

```ts
import { createServer } from "node:http";
import type { Snapshot } from "@vibecoding/core";
import { IDENTITIES, SURFACES } from "@vibecoding/core";

function authorized(req: { headers: { authorization?: string } }, token: string): boolean {
  return req.headers.authorization === `Bearer ${token}`;
}

function isSnapshot(value: unknown): value is Snapshot {
  if (!value || typeof value !== "object") return false;
  const v = value as Snapshot;
  return (
    typeof v.instanceId === "string" &&
    IDENTITIES.includes(v.identity) &&
    SURFACES.includes(v.surface)
  );
}

export async function startSnapshotServer(opts: {
  token: string;
  onUpsert: (snapshot: Snapshot) => Promise<void>;
  onRemove: (instanceId: string) => Promise<void>;
}): Promise<{ port: number; close: () => Promise<void> }> {
  const server = createServer((req, res) => {
    if (!authorized(req, opts.token)) {
      res.writeHead(401).end();
      return;
    }
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    if (req.method === "PUT" && url.pathname === "/snapshot") {
      const chunks: Buffer[] = [];
      req.on("data", (c) => chunks.push(c));
      req.on("end", () => {
        void (async () => {
          try {
            const body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
            if (!isSnapshot(body)) {
              res.writeHead(400).end();
              return;
            }
            await opts.onUpsert(body);
            res.writeHead(204).end();
          } catch {
            res.writeHead(400).end();
          }
        })();
      });
      return;
    }
    const del = /^\/snapshot\/([^/]+)$/.exec(url.pathname);
    if (req.method === "DELETE" && del) {
      void opts.onRemove(decodeURIComponent(del[1]!)).then(() => res.writeHead(204).end());
      return;
    }
    res.writeHead(404).end();
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const addr = server.address();
  if (!addr || typeof addr === "string") throw new Error("failed to bind 127.0.0.1");
  return {
    port: addr.port,
    close: () => new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve()))),
  };
}
```

`apps/tray/src/runtime.ts`:

```ts
import { randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export function newToken(): string {
  return randomBytes(32).toString("hex");
}

export function writeRuntime(home: string, port: number, token: string): void {
  mkdirSync(home, { recursive: true });
  writeFileSync(join(home, "runtime.json"), `${JSON.stringify({ port, token })}\n`, "utf8");
}
```

`apps/tray/src/menu.ts`:

```ts
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import SysTray from "systray2";

export type TrayBroker = {
  setPaused: (paused: boolean) => Promise<void>;
  getState: () => { paused: boolean; lastCard: { details: string } | null };
};

export function startTrayMenu(opts: {
  configPath: string;
  iconPath?: string;
  broker: TrayBroker;
  onQuit: () => Promise<void>;
}): SysTray {
  const icon = opts.iconPath ?? join(dirname(fileURLToPath(import.meta.url)), "..", "assets", "icon.ico");
  const preview = opts.broker.getState().lastCard?.details ?? "No presence";
  const systray = new SysTray({
    menu: {
      icon,
      title: "Vibecoding",
      tooltip: "What are we vibecoding today",
      items: [
        { title: preview, tooltip: preview, enabled: false, checked: false },
        { title: "Pause", tooltip: "Pause Discord presence", enabled: true, checked: opts.broker.getState().paused },
        { title: "Open config", tooltip: "Open config.json", enabled: true, checked: false },
        { title: "Quit", tooltip: "Quit", enabled: true, checked: false },
      ],
    },
    debug: false,
    copyDir: true,
  });
  systray.onClick((action) => {
    if (action.seq_id === 1) {
      const next = !opts.broker.getState().paused;
      void opts.broker.setPaused(next).then(() => {
        void systray.sendAction({
          type: "update-item",
          item: { ...action.item, checked: next },
          seq_id: action.seq_id,
        });
      });
    }
    if (action.seq_id === 2) {
      spawn("cmd", ["/c", "start", "", opts.configPath], { detached: true, stdio: "ignore" }).unref();
    }
    if (action.seq_id === 3) {
      void opts.onQuit().then(() => process.exit(0));
    }
  });
  return systray;
}
```

`apps/tray/scripts/write-icon.mjs` — write a minimal 16×16 ICO (solid 0x5865F2 pixels is enough). Run it once from the tray task:

```powershell
node apps/tray/scripts/write-icon.mjs
```

The script must actually write a valid ICO (ICONDIR + one 16×16 32-bit BMP). Include a complete working script in the implementation (do not leave a stub). A known-good approach: write a 16×16 PNG via no extra deps by emitting BMP-in-ICO bytes. Use this payload writer:

```js
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const size = 16;
const xor = Buffer.alloc(size * size * 4, 0);
for (let i = 0; i < size * size; i++) {
  xor[i * 4 + 0] = 0xf2;
  xor[i * 4 + 1] = 0x65;
  xor[i * 4 + 2] = 0x58;
  xor[i * 4 + 3] = 0xff;
}
const and = Buffer.alloc((size * size) / 8, 0);
const dib = Buffer.alloc(40);
dib.writeUInt32LE(40, 0);
dib.writeInt32LE(size, 4);
dib.writeInt32LE(size * 2, 8);
dib.writeUInt16LE(1, 12);
dib.writeUInt16LE(32, 14);
const image = Buffer.concat([dib, xor, and]);
const header = Buffer.alloc(22);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(1, 4);
header[6] = size;
header[7] = size;
header.writeUInt16LE(1, 10);
header.writeUInt16LE(32, 12);
header.writeUInt32LE(image.length, 14);
header.writeUInt32LE(22, 18);
const out = join(dirname(fileURLToPath(import.meta.url)), "..", "assets", "icon.ico");
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, Buffer.concat([header, image]));
```

`apps/tray/src/main.ts`:

```ts
import { SwitchingDiscordWriter } from "@vibecoding/discord";
import { appDataRoot, statusDir } from "./paths.js";
import { configPath, loadConfig, saveConfig } from "./config.js";
import { createBrokerController } from "./broker.js";
import { pidAlive } from "./pid.js";
import { readStatusDir } from "./ingest-files.js";
import { startSnapshotServer } from "./http.js";
import { newToken, writeRuntime } from "./runtime.js";
import { startTrayMenu } from "./menu.js";
import type { PresenceCard } from "@vibecoding/core";

class LogOnlyWriter {
  async publish(_card: PresenceCard, _trayPid: number): Promise<void> {}
  async clear(): Promise<void> {}
}

async function main(): Promise<void> {
  const home = appDataRoot(process.env);
  const config = loadConfig(home);
  saveConfig(home, config);
  const writer = new LogOnlyWriter();
  const broker = createBrokerController({
    writer,
    trayPid: process.pid,
    pidAlive,
    now: () => Date.now(),
    idleMinutes: config.idleMinutes,
    debounceMs: 3000,
  });
  await broker.setPaused(config.paused);
  const token = newToken();
  const server = await startSnapshotServer({
    token,
    onUpsert: (s) => broker.upsert(s),
    onRemove: (id) => broker.remove(id),
  });
  writeRuntime(home, server.port, token);
  setInterval(() => {
    for (const snapshot of readStatusDir(statusDir(process.env))) {
      void broker.upsert(snapshot);
    }
  }, 2000);
  startTrayMenu({
    configPath: configPath(home),
    broker,
    onQuit: async () => {
      await writer.clear();
      await server.close();
    },
  });
}

void main().catch((err) => {
  process.stderr.write(`${err instanceof Error ? err.stack ?? err.message : String(err)}\n`);
  process.exit(1);
});
```

Task 9 replaces `LogOnlyWriter` with `new SwitchingDiscordWriter(config.applicationIds, (appId) => createXhayperIpc(appId))`. Keep the unused import of `SwitchingDiscordWriter` out of Task 8 — remove that import from the Task 8 `main.ts` (it is unused until Task 9).

- [ ] **Step 4: Run test to verify it passes**

```powershell
pnpm --filter @vibecoding/tray add systray2
pnpm --filter @vibecoding/tray test
```

Expected: PASS including HTTP test.

- [ ] **Step 5: Commit**

```powershell
git add apps/tray
git commit -m "feat: loopback snapshot HTTP and tray pause menu"
```

---

### Task 9: Real Discord IPC adapter

**Files:**
- Create: `packages/discord/src/xhayper.ts`
- Modify: `packages/discord/package.json` (dependency `@xhayper/discord-rpc`)
- Modify: `packages/discord/src/index.ts`
- Test: `packages/discord/src/__tests__/xhayper.test.ts`
- Modify: `apps/tray/src/main.ts` to use `createXhayperIpc`

**Interfaces:**
- Consumes: `DiscordIpc`
- Produces: `createXhayperIpc(appId: string): DiscordIpc`
- `connect` uses `Client({ clientId: appId })` then `login()`
- `setActivity` maps payload fields; include `pid`
- `clearActivity` then `destroy` on disconnect
- Reconnect: `publish`/`connect` retries with backoff 1s, 2s, 5s, 10s (max 10s), keep going; tray menu tooltip `Discord not connected` when login fails (pass a callback `onStatus(text)`)

- [ ] **Step 1: Write the failing test**

Mock the Client via a factory parameter rather than mocking the npm package globally:

```ts
import { describe, expect, it } from "vitest";
import { createXhayperIpc } from "../xhayper.js";

describe("createXhayperIpc", () => {
  it("maps setActivity fields onto the user client", async () => {
    const calls: unknown[] = [];
    const ipc = createXhayperIpc("app", () => {
      const user = {
        setActivity: async (a: unknown) => {
          calls.push(a);
        },
        clearActivity: async () => {
          calls.push("clear");
        },
      };
      return {
        user,
        login: async () => {},
        destroy: async () => {
          calls.push("destroy");
        },
      };
    });
    await ipc.connect();
    await ipc.setActivity({
      pid: 12,
      details: "d",
      startTimestamp: 50,
      largeImageKey: "cursor",
      largeImageText: "Cursor",
    });
    expect(calls[0]).toMatchObject({
      pid: 12,
      details: "d",
      startTimestamp: 50,
      largeImageKey: "cursor",
      largeImageText: "Cursor",
    });
    await ipc.clearActivity();
    await ipc.disconnect();
    expect(calls).toContain("clear");
    expect(calls).toContain("destroy");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```powershell
pnpm --filter @vibecoding/discord test
```

Expected: FAIL — missing `xhayper.js`.

- [ ] **Step 3: Write minimal implementation**

```ts
import { Client } from "@xhayper/discord-rpc";
import type { DiscordIpc, SetActivityPayload } from "./ipc.js";

export type XhayperLike = {
  user: {
    setActivity: (activity: Record<string, unknown>) => Promise<unknown>;
    clearActivity: () => Promise<unknown>;
  } | null;
  login: () => Promise<unknown>;
  destroy: () => Promise<unknown>;
};

export function createXhayperIpc(
  appId: string,
  factory: (appId: string) => XhayperLike = (id) => new Client({ clientId: id }) as unknown as XhayperLike,
): DiscordIpc {
  let client: XhayperLike | null = null;
  return {
    async connect() {
      client = factory(appId);
      await client.login();
    },
    async setActivity(activity: SetActivityPayload) {
      if (!client?.user) throw new Error("Discord IPC is not connected");
      const body: Record<string, unknown> = {
        pid: activity.pid,
        details: activity.details,
        startTimestamp: activity.startTimestamp,
        largeImageKey: activity.largeImageKey,
        largeImageText: activity.largeImageText,
        instance: false,
        type: 0,
      };
      if (activity.state) body.state = activity.state;
      if (activity.smallImageKey) body.largeImageKey && (body.smallImageKey = activity.smallImageKey);
      if (activity.smallImageText) body.smallImageText = activity.smallImageText;
      await client.user.setActivity(body);
    },
    async clearActivity() {
      await client?.user?.clearActivity();
    },
    async disconnect() {
      await client?.destroy();
      client = null;
    },
  };
}
```

Fix the silly `largeImageKey &&` — set `smallImageKey` directly:

```ts
      if (activity.smallImageKey) body.smallImageKey = activity.smallImageKey;
```

Install: `pnpm --filter @vibecoding/discord add @xhayper/discord-rpc`

Wire tray `main.ts`:

```ts
new SwitchingDiscordWriter(config.applicationIds, (appId) => createXhayperIpc(appId));
```

If `applicationIds.cursor` is empty, skip connect and leave presence unpublished (still ingest snapshots). Log `Discord app id missing for {identity}` once.

- [ ] **Step 4: Run test to verify it passes**

```powershell
pnpm --filter @vibecoding/discord test
pnpm --filter @vibecoding/tray test
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add packages/discord apps/tray
git commit -m "feat: connect Discord IPC through xhayper adapter"
```

---

### Task 10: Cursor / VS Code extension

**Files:**
- Create: `apps/extension/package.json`
- Create: `apps/extension/tsconfig.json`
- Create: `apps/extension/vitest.config.ts`
- Create: `apps/extension/src/map-snapshot.ts`
- Create: `apps/extension/src/identity.ts`
- Create: `apps/extension/src/client.ts`
- Create: `apps/extension/src/extension.ts`
- Test: `apps/extension/src/__tests__/map-snapshot.test.ts`
- Test: `apps/extension/src/__tests__/identity.test.ts`

**Interfaces:**
- Consumes: `Snapshot`, tray `runtime.json` + HTTP
- Produces: `identityFromAppName(appName: string): "cursor" | "vscode"`
- `mapExtensionState(...) : Snapshot` with session fallback chat title → file name → git branch → null
- `agentCount` argument default 0 (no Cursor private API in v1)
- Heartbeat every 10s sending the same `lastActivityAt` unless a real change happened
- On HTTP failure, write the status file under `VIBECODING_HOME` / `%APPDATA%\vibecoding\status`
- No window toasts
- `deactivate` DELETE instance

- [ ] **Step 1: Write the failing test**

`apps/extension/src/__tests__/identity.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { identityFromAppName } from "../identity.js";

describe("identityFromAppName", () => {
  it("maps Cursor vs Visual Studio Code", () => {
    expect(identityFromAppName("Cursor")).toBe("cursor");
    expect(identityFromAppName("Visual Studio Code")).toBe("vscode");
  });
});
```

`apps/extension/src/__tests__/map-snapshot.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { mapExtensionState } from "../map-snapshot.js";

describe("mapExtensionState", () => {
  it("prefers chat title then file then branch and never uses a full path as repo", () => {
    const snap = mapExtensionState({
      appName: "Cursor",
      instanceId: "cursor-1",
      pid: 8,
      focused: true,
      workspaceFolderName: "what-are-we-vibecoding-today",
      chatTabTitle: "fix discord presence",
      activeFileName: "writer.ts",
      gitBranch: "main",
      agentCount: 1,
      lastActivityAt: 10,
    });
    expect(snap.identity).toBe("cursor");
    expect(snap.sessionTitle).toBe("fix discord presence");
    expect(snap.repo).toBe("what-are-we-vibecoding-today");
    expect(snap.agentCount).toBe(1);
  });

  it("falls back through file then branch", () => {
    expect(
      mapExtensionState({
        appName: "Visual Studio Code",
        instanceId: "v",
        pid: 1,
        focused: false,
        workspaceFolderName: "r",
        chatTabTitle: null,
        activeFileName: "tick.ts",
        gitBranch: "main",
        agentCount: 0,
        lastActivityAt: 1,
      }).sessionTitle,
    ).toBe("tick.ts");
    expect(
      mapExtensionState({
        appName: "Visual Studio Code",
        instanceId: "v",
        pid: 1,
        focused: false,
        workspaceFolderName: "r",
        chatTabTitle: null,
        activeFileName: null,
        gitBranch: "feat/presence",
        agentCount: 0,
        lastActivityAt: 1,
      }).sessionTitle,
    ).toBe("feat/presence");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Extension `package.json`: `"name": "vibecoding-presence"`, `"engines": { "vscode": "^1.85.0" }`, `"activationEvents": ["onStartupFinished"]`, `"main": "./src/extension.ts"`. DevDeps: `@types/vscode`, `typescript`, `vitest`. Deps: none (don't bundle core into the VSIX if it complicates packaging — **duplicate identity mapping locally**; mapper may import `@vibecoding/core` via workspace if esbuild isn't required. For v1 run as unpacked `pnpm --filter` and set `"main"` compiled later. Simplest: extension depends on `@vibecoding/core` workspace and is launched via `f5` after `tsc`. Add `"scripts": { "test": "vitest run" }`.

```powershell
pnpm --filter vibecoding-presence test
```

Expected: FAIL — missing modules.

- [ ] **Step 3: Write minimal implementation**

`apps/extension/src/identity.ts`:

```ts
import type { Identity } from "@vibecoding/core";

export function identityFromAppName(appName: string): Identity {
  return /cursor/i.test(appName) ? "cursor" : "vscode";
}
```

`apps/extension/src/map-snapshot.ts`:

```ts
import type { Snapshot } from "@vibecoding/core";
import { identityFromAppName } from "./identity.js";

export function mapExtensionState(input: {
  appName: string;
  instanceId: string;
  pid: number;
  focused: boolean;
  workspaceFolderName: string | null;
  chatTabTitle: string | null;
  activeFileName: string | null;
  gitBranch: string | null;
  agentCount: number;
  lastActivityAt: number;
}): Snapshot {
  const sessionTitle = input.chatTabTitle?.trim() || input.activeFileName?.trim() || input.gitBranch?.trim() || null;
  return {
    instanceId: input.instanceId,
    pid: input.pid,
    identity: identityFromAppName(input.appName),
    surface: "ide-extension",
    focused: input.focused,
    repo: input.workspaceFolderName,
    sessionTitle,
    agentCount: input.agentCount,
    lastActivityAt: input.lastActivityAt,
  };
}
```

`apps/extension/src/client.ts`:

```ts
import { readFileSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import type { Snapshot } from "@vibecoding/core";

export type RuntimeInfo = { port: number; token: string };

export function readRuntime(home: string): RuntimeInfo | null {
  try {
    const raw = JSON.parse(readFileSync(join(home, "runtime.json"), "utf8")) as RuntimeInfo;
    if (typeof raw.port === "number" && typeof raw.token === "string") return raw;
    return null;
  } catch {
    return null;
  }
}

export async function pushSnapshot(home: string, snapshot: Snapshot): Promise<void> {
  const runtime = readRuntime(home);
  if (runtime) {
    try {
      const res = await fetch(`http://127.0.0.1:${runtime.port}/snapshot`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${runtime.token}`, "Content-Type": "application/json" },
        body: JSON.stringify(snapshot),
      });
      if (res.ok) return;
    } catch {
      /* file fallback */
    }
  }
  const dir = join(home, "status");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${snapshot.instanceId}.json`), `${JSON.stringify(snapshot)}\n`);
}

export async function clearSnapshot(home: string, instanceId: string): Promise<void> {
  const runtime = readRuntime(home);
  if (runtime) {
    try {
      const res = await fetch(`http://127.0.0.1:${runtime.port}/snapshot/${encodeURIComponent(instanceId)}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${runtime.token}` },
      });
      if (res.ok) return;
    } catch {
      /* file fallback */
    }
  }
  rmSync(join(home, "status", `${instanceId}.json`), { force: true });
}
```

`apps/extension/src/extension.ts`:

```ts
import { basename, join } from "node:path";
import * as vscode from "vscode";
import { mapExtensionState } from "./map-snapshot.js";
import { clearSnapshot, pushSnapshot } from "./client.js";

function home(): string {
  return process.env.VIBECODING_HOME || joinAppData();
}

function joinAppData(): string {
  const appdata = process.env.APPDATA;
  if (!appdata) throw new Error("APPDATA is not set");
  return join(appdata, "vibecoding");
}

function gitBranch(): string | null {
  const git = vscode.extensions.getExtension("vscode.git")?.exports;
  const api = git?.getAPI?.(1);
  const repo = api?.repositories?.[0];
  return repo?.state?.HEAD?.name ?? null;
}

function chatTabTitle(): string | null {
  for (const group of vscode.window.tabGroups.all) {
    for (const tab of group.tabs) {
      if (tab.isActive && /chat|composer|agent/i.test(tab.label)) return tab.label;
    }
  }
  return null;
}

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const instanceId = `ide-${process.pid}`;
  let lastActivityAt = Date.now();
  let lastKey = "";

  const send = async (reason: "activity" | "heartbeat") => {
    const folder = vscode.workspace.workspaceFolders?.[0]?.name ?? null;
    const file = vscode.window.activeTextEditor?.document.fileName;
    const fileName = file ? basename(file) : null;
    const now = Date.now();
    const key = [folder, fileName, gitBranch(), chatTabTitle(), vscode.window.state.focused].join("|");
    if (reason === "activity" && key !== lastKey) {
      lastActivityAt = now;
      lastKey = key;
    }
    const snapshot = mapExtensionState({
      appName: vscode.env.appName,
      instanceId,
      pid: process.pid,
      focused: vscode.window.state.focused,
      workspaceFolderName: folder,
      chatTabTitle: chatTabTitle(),
      activeFileName: fileName,
      gitBranch: gitBranch(),
      agentCount: 0,
      lastActivityAt,
    });
    await pushSnapshot(home(), snapshot);
  };

  await send("activity");
  context.subscriptions.push(
    vscode.window.onDidChangeWindowState(() => void send("activity")),
    vscode.window.onDidChangeActiveTextEditor(() => void send("activity")),
    vscode.workspace.onDidChangeTextDocument(() => void send("activity")),
    vscode.window.tabGroups.onDidChangeTabs(() => void send("activity")),
  );
  const interval = setInterval(() => void send("heartbeat"), 10_000);
  context.subscriptions.push({ dispose: () => clearInterval(interval) });
  context.subscriptions.push({ dispose: () => void clearSnapshot(home(), instanceId) });
}

export async function deactivate(): Promise<void> {
  await clearSnapshot(home(), `ide-${process.pid}`);
}
```

Use static `import { basename, join } from "node:path"` instead of `require`.

- [ ] **Step 4: Run test to verify it passes**

```powershell
pnpm --filter vibecoding-presence test
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add apps/extension
git commit -m "feat: report Cursor and VS Code snapshots to the tray"
```

---

### Task 11: Claude Code hook docs + focused CLI helper

**Files:**
- Create: `docs/hooks/claude-code.md`
- Create: `apps/cli/hooks/claude-session-start.cjs`
- Create: `apps/cli/hooks/claude-stop.cjs`
- Modify: `apps/cli/package.json` (`bin` + `build` script)

Hook events to document (user-level Claude Code settings, copy-paste, tray does **not** rewrite configs):

- Session start → `vibecoding status --identity claude-code --surface cli --pid <claude pid> --repo "$CLAUDE_PROJECT_DIR" --session "<optional>" --agents 0 --activity-at` (use a `node` one-liner that reads env and calls the CLI, not `python3`)
- Agent/stop if the tool exposes it → `--agents N` then `0` on Stop
- Session end → `vibecoding status --clear --instance claude-code-cli-<pid>`

Windows command example (exact block in the doc):

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

Add to `apps/cli/package.json`:

```json
"bin": { "vibecoding": "./dist/main.js" },
"scripts": { "build": "tsc -p tsconfig.json", "test": "vitest run" }
```

Users run `pnpm --filter @vibecoding/cli build`, then point Claude hooks at `apps/cli/hooks/*.cjs` (or copies under `%APPDATA%\vibecoding\hooks\`). `--agents` stays 0. Do not set 1 for the whole session.

Hook scripts:

`apps/cli/hooks/claude-session-start.cjs`:

```js
const { spawnSync } = require("node:child_process");
const { join } = require("node:path");
const bin = join(__dirname, "..", "dist", "main.js");
const pid = String(process.ppid);
const repo = process.env.CLAUDE_PROJECT_DIR || "";
spawnSync(process.execPath, [bin, "status", "--identity", "claude-code", "--surface", "cli", "--pid", pid, "--repo", repo], {
  stdio: "ignore",
  windowsHide: true,
});
```

`apps/cli/hooks/claude-stop.cjs`:

```js
const { spawnSync } = require("node:child_process");
const { join } = require("node:path");
const bin = join(__dirname, "..", "dist", "main.js");
const instance = `claude-code-cli-${process.ppid}`;
spawnSync(process.execPath, [bin, "status", "--clear", "--instance", instance], {
  stdio: "ignore",
  windowsHide: true,
});
```

Document: copy these two files, point Claude hooks at the **copied** paths or the repo paths after `pnpm --filter @vibecoding/cli build`. `--agents` stays 0 unless a future Claude hook payload includes a count (do not set 1 for session lifetime).

- [ ] **Step 1: Write `docs/hooks/claude-code.md` and the two hook scripts** (no new unit test; Task 6 already covers `--repo` basename). The doc must say: build the CLI, paste the JSON into Claude Code user settings, do not let the tray edit those settings.

- [ ] **Step 2: Run CLI tests to confirm nothing broke**

```powershell
pnpm --filter @vibecoding/cli test
```

Expected: PASS.

- [ ] **Step 3: Confirm the `.cjs` files spawn `../dist/main.js` as shown above.**

- [ ] **Step 4: `pnpm --filter @vibecoding/cli test` PASS**

- [ ] **Step 5: Commit**

```powershell
git add apps/cli docs/hooks/claude-code.md
git commit -m "docs: add Claude Code Windows hook snippets"
```

---

### Task 12: Codex CLI hook docs

**Files:**
- Create: `docs/hooks/codex.md`
- Create: `apps/cli/hooks/codex-session-start.cjs`
- Create: `apps/cli/hooks/codex-session-end.cjs`

**Interfaces:**
- Same CLI as Task 6
- Events: `SessionStart`, `SessionEnd` (and `Stop` if they use it). **Not** `PreToolUse` as the presence signal
- Windows: `commandWindows` (TOML `command_windows`)
- `agentCount` stays **0** unless a SubagentStart/Stop payload is wired later
- Mention Codex hook trust / approval on Windows so a planner does not skip it

`docs/hooks/codex.md` must include this TOML shape:

```toml
[[hooks.SessionStart]]
matcher = "startup|resume"

[[hooks.SessionStart.hooks]]
type = "command"
command = "node ./unused-unix.js"
commandWindows = "node C:\\Users\\<you>\\Documents\\GitHub\\what-are-we-vibecoding-today\\apps\\cli\\hooks\\codex-session-start.cjs"
```

And SessionEnd/Stop calling `codex-session-end.cjs` which `--clear`s `codex-cli-<ppid>`.

Scripts mirror Claude's, identity `codex`. Repo from `process.cwd()` basename (Codex hook cwd). Read stdin JSON if present for `cwd` / `session_id` without using transcript bodies:

```js
let cwd = process.cwd();
try {
  const raw = require("node:fs").readFileSync(0, "utf8");
  const parsed = JSON.parse(raw);
  if (typeof parsed.cwd === "string") cwd = parsed.cwd;
} catch {
  /* no stdin payload */
}
```

Do not parse transcript files.

- [ ] **Step 1:** Add `parse-args` test that identity `codex` is accepted (already valid). If redundant, go to docs.

- [ ] **Step 2:** `pnpm --filter @vibecoding/cli test` — PASS.

- [ ] **Step 3:** Write scripts + `docs/hooks/codex.md` including trust note.

- [ ] **Step 4:** Re-run CLI tests — PASS.

- [ ] **Step 5: Commit**

```powershell
git add apps/cli/hooks docs/hooks/codex.md
git commit -m "docs: add Codex CLI Windows hook snippets"
```

---

### Task 13: Desktop window classifiers

**Files:**
- Create: `apps/tray/src/watchers/classify.ts`
- Create: `apps/tray/src/watchers/poll.ts`
- Test: `apps/tray/src/__tests__/classify.test.ts`
- Modify: `apps/tray/src/main.ts` to start poll
- Modify: `apps/tray/package.json` add `active-win`

**Interfaces:**
- Consumes: `Snapshot`
- Produces: `classifyDesktopWindow(input: { title: string; processName: string; pid: number; now: number }): Snapshot | null`
- ChatGPT: process name matches `/chatgpt/i` AND title matches `/codex/i` → identity `codex`, surface `desktop`, `agentCount: 0`, `sessionTitle` = trimmed title or null if empty
- Claude: process name matches `/^claude(\.exe)?$/i` AND title matches `/\bcode\b/i` AND does not match `/\bcowork\b/i` → `claude-code` desktop. If title matches chat without code, return **null**. Unknown (process matches but no Code) → **null**
- `instanceId` = `${identity}-desktop-${pid}`
- After implementing fixtures, run a 30s spike: log `active-win` title/process to a local file (not committed). If real titles differ, update regexes **and** fixtures in the same commit so tests stay the source of truth. If spike cannot detect Code vs Chat, leave fail-closed (null) — do not ship Chat as Claude Code.

- [ ] **Step 1: Write the failing test**

`apps/tray/src/__tests__/classify.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { classifyDesktopWindow } from "../watchers/classify.js";

describe("classifyDesktopWindow", () => {
  it("emits Codex only when ChatGPT title looks like Codex", () => {
    expect(
      classifyDesktopWindow({ title: "Codex — my thread", processName: "ChatGPT.exe", pid: 4, now: 9 })?.identity,
    ).toBe("codex");
    expect(classifyDesktopWindow({ title: "New chat", processName: "ChatGPT.exe", pid: 4, now: 9 })).toBeNull();
  });

  it("emits Claude Code only for the Code tab", () => {
    expect(
      classifyDesktopWindow({ title: "Code — repo", processName: "Claude.exe", pid: 5, now: 1 })?.identity,
    ).toBe("claude-code");
    expect(classifyDesktopWindow({ title: "Chat — hello", processName: "Claude.exe", pid: 5, now: 1 })).toBeNull();
    expect(classifyDesktopWindow({ title: "Cowork — inbox", processName: "Claude.exe", pid: 5, now: 1 })).toBeNull();
    expect(classifyDesktopWindow({ title: "Claude", processName: "Claude.exe", pid: 5, now: 1 })).toBeNull();
  });
});
```

- [ ] **Step 2: Run tray tests — FAIL missing classify.js**

- [ ] **Step 3: Implement**

```ts
import type { Snapshot } from "@vibecoding/core";

export function classifyDesktopWindow(input: {
  title: string;
  processName: string;
  pid: number;
  now: number;
}): Snapshot | null {
  const processName = input.processName.replace(/\.exe$/i, "");
  if (/chatgpt/i.test(processName)) {
    if (!/codex/i.test(input.title)) return null;
    return base("codex", input);
  }
  if (/^claude$/i.test(processName)) {
    if (/\bcowork\b/i.test(input.title)) return null;
    if (!/\bcode\b/i.test(input.title)) return null;
    return base("claude-code", input);
  }
  return null;
}

function base(identity: "codex" | "claude-code", input: { title: string; pid: number; now: number }): Snapshot {
  return {
    instanceId: `${identity}-desktop-${input.pid}`,
    pid: input.pid,
    identity,
    surface: "desktop",
    focused: true,
    repo: null,
    sessionTitle: input.title.trim() || null,
    agentCount: 0,
    lastActivityAt: input.now,
  };
}
```

`apps/tray/src/watchers/poll.ts`:

```ts
import activeWin from "active-win";
import type { Snapshot } from "@vibecoding/core";
import { classifyDesktopWindow } from "./classify.js";

export async function pollDesktopWindow(now: number): Promise<Snapshot | null> {
  const win = await activeWin();
  if (!win) return null;
  return classifyDesktopWindow({
    title: win.title,
    processName: win.owner.name,
    pid: win.owner.processId,
    now,
  });
}

export function createDesktopPoller(opts: {
  upsert: (snapshot: Snapshot) => Promise<void>;
  remove: (instanceId: string) => Promise<void>;
  now: () => number;
}): { start: () => void; stop: () => void } {
  const live = new Set<string>();
  let timer: NodeJS.Timeout | undefined;
  const tick = async () => {
    const snapshot = await pollDesktopWindow(opts.now());
    const next = new Set<string>();
    if (snapshot) {
      next.add(snapshot.instanceId);
      await opts.upsert(snapshot);
    }
    for (const id of live) {
      if (!next.has(id)) await opts.remove(id);
    }
    live.clear();
    for (const id of next) live.add(id);
  };
  return {
    start() {
      timer = setInterval(() => void tick(), 2000);
      void tick();
    },
    stop() {
      if (timer) clearInterval(timer);
    },
  };
}
```

- [ ] **Step 4: Run tray tests — PASS.** Then run a 30s spike that logs `active-win` title and process name. If real titles differ from the fixtures, update **both** `classify.ts` and `classify.test.ts` in the same commit. If Code vs Chat cannot be distinguished, leave fail-closed (return null).

- [ ] **Step 5: Commit**

```powershell
git add apps/tray
git commit -m "feat: classify ChatGPT Codex and Claude Code desktop windows"
```

---

### Task 14: README, login item, Discord apps, manual checklist

**Files:**
- Create: `README.md`
- Create: `apps/tray/src/startup.ts`
- Test: `apps/tray/src/__tests__/startup.test.ts`
- Modify: `apps/tray/src/main.ts` to call `syncStartWithWindows(config.startWithWindows)`
- Modify: `.gitignore` if `runtime.json` copies appear (do not ignore `%APPDATA%`)

**Interfaces:**
- `syncStartWithWindows(enabled: boolean, execPath: string, entryScript: string): void` writes/deletes HKCU `Software\Microsoft\Windows\CurrentVersion\Run` value `Vibecoding` via `reg.exe`
- Test mocks `spawnSync`

Write `README.md`:

```markdown
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
```

- [ ] **Step 1: Write startup test**

```ts
import { describe, expect, it, vi } from "vitest";
import { syncStartWithWindows } from "../startup.js";

describe("syncStartWithWindows", () => {
  it("adds a Run key when enabled and deletes when disabled", () => {
    const spawnSync = vi.fn(() => ({ status: 0 }));
    syncStartWithWindows(true, "C:\\\\node.exe", "C:\\\\tray.js", spawnSync);
    expect(spawnSync).toHaveBeenCalled();
    const add = spawnSync.mock.calls[0]!;
    expect(add[0]).toBe("reg.exe");
    expect(String(add[1].join(" "))).toContain("Vibecoding");
    syncStartWithWindows(false, "C:\\\\node.exe", "C:\\\\tray.js", spawnSync);
    expect(String(spawnSync.mock.calls.at(-1)?.[1].join(" "))).toMatch(/delete/i);
  });
});
```

- [ ] **Step 2: FAIL missing startup.js**

- [ ] **Step 3: Implement**

```ts
import type { SpawnSyncReturns } from "node:child_process";
import { spawnSync as realSpawn } from "node:child_process";

const KEY = "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run";

export function syncStartWithWindows(
  enabled: boolean,
  execPath: string,
  entryScript: string,
  spawnSync: typeof realSpawn = realSpawn,
): SpawnSyncReturns<string> {
  if (enabled) {
    const command = `"${execPath}" "${entryScript}"`;
    return spawnSync("reg.exe", ["add", KEY, "/v", "Vibecoding", "/t", "REG_SZ", "/d", command, "/f"], {
      encoding: "utf8",
      windowsHide: true,
    });
  }
  return spawnSync("reg.exe", ["delete", KEY, "/v", "Vibecoding", "/f"], {
    encoding: "utf8",
    windowsHide: true,
  });
}
```

In `main.ts`, `syncStartWithWindows(config.startWithWindows, process.execPath, fileURLToPath(import.meta.url))`.

Write `README.md` with the sections above. No placeholders. Include the intended git remote `https://github.com/tomiwaaluko/what-are-we-vibecoding-today-.git`.

- [ ] **Step 4: `pnpm test` at root PASS; `pnpm tray` starts (manual smoke: tray icon appears).**

- [ ] **Step 5: Commit**

```powershell
git add README.md apps/tray package.json
git commit -m "docs: README, Discord app setup, and Windows login item"
```

---

## Self-review (spec coverage)

| Spec requirement | Task |
|---|---|
| Tray is only Discord writer | 5, 8, 9 |
| Snapshot shape + upsert by instanceId | 4, 6, 8 |
| Primary: focus → agents → stick | 2, 4 |
| Session-first lines + footnote + overlay | 3 |
| Idle vs heartbeat | 4 |
| CLI pid/instance files | 6 |
| App ID switch clear/disconnect | 5 |
| Overlay assets on all four apps | 14 README |
| 128-char truncate | 3 |
| Pause immediate | 4, 7, 8 |
| Claude Code CLI hooks | 11 |
| Codex Windows `commandWindows` | 12 |
| ChatGPT Codex / Claude Code tab fail-closed | 13 |
| Cursor vs VS Code identity | 10 |
| Loopback HTTP + token | 8 |
| Logs local / no chat bodies | 10, 12, 13 |
| Manual checklist + disable other RPC | 14 |
| startWithWindows | 14 |
| Missing images still publish text | 5 omits null assets; README says upload but writer still sends details |

No TBD/TODO placeholders remain. Types (`Snapshot`, `PresenceCard`, `SwitchingDiscordWriter.publish(card, trayPid)`) are reused with the same names in later tasks.
