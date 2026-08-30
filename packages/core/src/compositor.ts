import { pickPrimary } from "./picker.js";
import { truncateDiscord } from "./truncate.js";
import type { Identity, MergedIdentity, PresenceCard } from "./types.js";
import { IDENTITY_ASSET_KEY, IDENTITY_DISPLAY_NAME } from "./types.js";

function detailsFor(m: MergedIdentity): string {
  const title = m.sessionTitle?.trim() || IDENTITY_DISPLAY_NAME[m.identity];
  if (m.agentCount <= 0) return truncateDiscord(title);
  const noun = m.agentCount === 1 ? "agent" : "agents";
  return truncateDiscord(`${title} · ${m.agentCount} ${noun}`);
}

function joinState(repo: string | null, footnote: string | null): string | null {
  if (repo && footnote) return truncateDiscord(`${repo} · ${footnote}`);
  if (repo) return truncateDiscord(repo);
  if (footnote) return truncateDiscord(footnote);
  return null;
}

function smallHover(m: MergedIdentity): string {
  const parts = [IDENTITY_DISPLAY_NAME[m.identity]];
  const title = m.sessionTitle?.trim();
  if (title) parts.push(title);
  if (m.agentCount > 0) {
    parts.push(`${m.agentCount} ${m.agentCount === 1 ? "agent" : "agents"}`);
  }
  return truncateDiscord(parts.join(" · "));
}

export function composeCard(
  merged: MergedIdentity[],
  primary: Identity,
  primarySince: number,
): PresenceCard {
  const primaryMerged = merged.find((m) => m.identity === primary);
  if (!primaryMerged) {
    throw new Error(`composeCard: primary ${primary} is not in merged set`);
  }

  const rest = merged.filter((m) => m.identity !== primary);
  const secondary = pickPrimary(rest, null);
  const afterSecondary = rest.filter((m) => m.identity !== secondary);
  const tertiary = secondary ? pickPrimary(afterSecondary, null) : null;

  let footnote: string | null = null;
  if (secondary && tertiary) {
    footnote = `+ ${IDENTITY_DISPLAY_NAME[secondary]} + ${IDENTITY_DISPLAY_NAME[tertiary]}`;
  } else if (secondary) {
    footnote = `+ ${IDENTITY_DISPLAY_NAME[secondary]}`;
  }

  const secondaryMerged = secondary ? merged.find((m) => m.identity === secondary) : undefined;

  return {
    identity: primary,
    details: detailsFor(primaryMerged),
    state: joinState(primaryMerged.repo, footnote),
    largeImageKey: IDENTITY_ASSET_KEY[primary],
    largeImageText: truncateDiscord(IDENTITY_DISPLAY_NAME[primary]),
    smallImageKey: secondary ? IDENTITY_ASSET_KEY[secondary] : null,
    smallImageText: secondaryMerged ? smallHover(secondaryMerged) : null,
    startTimestamp: primarySince,
  };
}
