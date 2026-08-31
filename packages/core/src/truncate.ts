export const DISCORD_TEXT_LIMIT = 128;

export function truncateDiscord(text: string): string {
  return text.length <= DISCORD_TEXT_LIMIT ? text : text.slice(0, DISCORD_TEXT_LIMIT);
}
