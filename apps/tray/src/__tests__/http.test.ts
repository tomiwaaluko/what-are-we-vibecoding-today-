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

  it("applies the Windows CLI foreground heuristic before upsert", async () => {
    const upserts: unknown[] = [];
    const server = await startSnapshotServer({
      token: "secret",
      platform: "win32",
      isConsoleForeground: () => true,
      onUpsert: async (s) => {
        upserts.push(s);
      },
      onRemove: async () => {},
    });
    const ok = await fetch(`http://127.0.0.1:${server.port}/snapshot`, {
      method: "PUT",
      headers: { Authorization: "Bearer secret", "Content-Type": "application/json" },
      body: JSON.stringify({
        instanceId: "codex-cli",
        pid: 1,
        identity: "codex",
        surface: "cli",
        focused: false,
        repo: "r",
        sessionTitle: "s",
        agentCount: 0,
        lastActivityAt: 1,
      }),
    });
    expect(ok.status).toBe(204);
    expect(upserts).toHaveLength(1);
    expect(upserts[0]).toMatchObject({ focused: true });
    await server.close();
  });

  it("rejects an incomplete snapshot and handles DELETE failures", async () => {
    const server = await startSnapshotServer({
      token: "secret",
      onUpsert: async () => {},
      onRemove: async () => {
        throw new Error("remove failed");
      },
    });
    const incomplete = await fetch(`http://127.0.0.1:${server.port}/snapshot`, {
      method: "PUT",
      headers: { Authorization: "Bearer secret", "Content-Type": "application/json" },
      body: JSON.stringify({ instanceId: "c", identity: "cursor", surface: "ide-extension" }),
    });
    expect(incomplete.status).toBe(400);
    const del = await fetch(`http://127.0.0.1:${server.port}/snapshot/%E0%`, {
      method: "DELETE",
      headers: { Authorization: "Bearer secret" },
    });
    expect(del.status).toBe(400);
    const failed = await fetch(`http://127.0.0.1:${server.port}/snapshot/c`, {
      method: "DELETE",
      headers: { Authorization: "Bearer secret" },
    });
    expect(failed.status).toBe(500);
    await server.close();
  });
});
