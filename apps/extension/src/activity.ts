export function nextLastActivityAt(
  reason: "activity" | "heartbeat",
  previous: number,
  now: number,
): number {
  return reason === "activity" ? now : previous;
}
