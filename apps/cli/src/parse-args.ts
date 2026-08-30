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
