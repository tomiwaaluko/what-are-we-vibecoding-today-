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
