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
