import { createServer } from "node:http";
import { isSnapshot, type Snapshot } from "@vibecoding/core";
import type { ConsoleFocusChecker } from "./console-focus.js";
import { isWindowsConsoleForeground } from "./console-focus.js";

function authorized(req: { headers: { authorization?: string } }, token: string): boolean {
  return req.headers.authorization === `Bearer ${token}`;
}

export async function startSnapshotServer(opts: {
  token: string;
  onUpsert: (snapshot: Snapshot) => Promise<void>;
  onRemove: (instanceId: string) => Promise<void>;
  isConsoleForeground?: ConsoleFocusChecker;
  platform?: NodeJS.Platform;
}): Promise<{ port: number; close: () => Promise<void> }> {
  const server = createServer((req, res) => {
    if (!authorized(req, opts.token)) {
      res.writeHead(401).end();
      return;
    }
    let url: URL;
    try {
      url = new URL(req.url ?? "/", "http://127.0.0.1");
    } catch {
      res.writeHead(400).end();
      return;
    }
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
            await opts.onUpsert(await applyCliFocusHeuristic(body, opts));
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
      void (async () => {
        let instanceId: string;
        try {
          instanceId = decodeURIComponent(del[1]!);
        } catch {
          res.writeHead(400).end();
          return;
        }
        try {
          await opts.onRemove(instanceId);
          res.writeHead(204).end();
        } catch {
          res.writeHead(500).end();
        }
      })();
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

async function applyCliFocusHeuristic(
  snapshot: Snapshot,
  opts: { isConsoleForeground?: ConsoleFocusChecker; platform?: NodeJS.Platform },
): Promise<Snapshot> {
  if ((opts.platform ?? process.platform) !== "win32" || snapshot.surface !== "cli") return snapshot;
  const isConsoleForeground = opts.isConsoleForeground ?? isWindowsConsoleForeground;
  return { ...snapshot, focused: await isConsoleForeground() };
}
