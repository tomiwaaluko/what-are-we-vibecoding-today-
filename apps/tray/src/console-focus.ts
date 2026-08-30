import activeWin from "active-win";

export type ConsoleFocusChecker = () => boolean | Promise<boolean>;

export function isConsoleHostProcess(processName: string): boolean {
  const normalized = processName.replace(/\.exe$/i, "");
  return /^(windowsterminal|conhost|openconsole|windows console)$/i.test(normalized);
}

export async function isWindowsConsoleForeground(): Promise<boolean> {
  if (process.platform !== "win32") return false;
  const win = await activeWin();
  if (!win) return false;
  return isConsoleHostProcess(win.owner.name);
}
