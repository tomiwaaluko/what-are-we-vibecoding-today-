import { describe, expect, it } from "vitest";
import { nextLastActivityAt } from "../activity.js";

describe("nextLastActivityAt", () => {
  it("refreshes timestamp on real activity even when state key is unchanged", () => {
    expect(nextLastActivityAt("activity", 100, 200)).toBe(200);
  });

  it("preserves timestamp on heartbeat", () => {
    expect(nextLastActivityAt("heartbeat", 100, 200)).toBe(100);
  });
});
