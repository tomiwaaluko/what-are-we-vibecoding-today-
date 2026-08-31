import type { Identity } from "@vibecoding/core";

export function identityFromAppName(appName: string): Identity {
  return /cursor/i.test(appName) ? "cursor" : "vscode";
}
