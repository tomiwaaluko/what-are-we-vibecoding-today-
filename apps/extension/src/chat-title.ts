export type ChatTabLike = { isActive: boolean; label: string };
export type ChatTabGroupLike = { isActive: boolean; tabs: readonly ChatTabLike[] };

export function chatTabTitle(groups: readonly ChatTabGroupLike[]): string | null {
  const group = groups.find((g) => g.isActive);
  if (!group) return null;
  for (const tab of group.tabs) {
    if (!tab.isActive) continue;
    if (/\.\w+$/.test(tab.label)) continue;
    if (/chat|composer/i.test(tab.label)) return tab.label;
  }
  return null;
}
