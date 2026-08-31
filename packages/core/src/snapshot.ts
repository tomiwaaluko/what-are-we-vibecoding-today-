import { IDENTITIES, SURFACES, type Snapshot } from "./types.js";

export function isSnapshot(value: unknown): value is Snapshot {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.instanceId === "string" &&
    typeof v.pid === "number" &&
    Number.isFinite(v.pid) &&
    (IDENTITIES as readonly string[]).includes(v.identity as string) &&
    (SURFACES as readonly string[]).includes(v.surface as string) &&
    typeof v.focused === "boolean" &&
    (v.repo === null || typeof v.repo === "string") &&
    (v.sessionTitle === null || typeof v.sessionTitle === "string") &&
    typeof v.agentCount === "number" &&
    Number.isFinite(v.agentCount) &&
    typeof v.lastActivityAt === "number" &&
    Number.isFinite(v.lastActivityAt)
  );
}
