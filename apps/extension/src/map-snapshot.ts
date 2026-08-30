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
  agentCount?: number;
  lastActivityAt: number;
}): Snapshot {
  const sessionTitle =
    input.chatTabTitle?.trim() || input.activeFileName?.trim() || input.gitBranch?.trim() || null;
  return {
    instanceId: input.instanceId,
    pid: input.pid,
    identity: identityFromAppName(input.appName),
    surface: "ide-extension",
    focused: input.focused,
    repo: input.workspaceFolderName,
    sessionTitle,
    agentCount: input.agentCount ?? 0,
    lastActivityAt: input.lastActivityAt,
  };
}
