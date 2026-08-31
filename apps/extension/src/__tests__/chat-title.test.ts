import { describe, expect, it } from "vitest";
import { chatTabTitle } from "../chat-title.js";

describe("chatTabTitle", () => {
  it("returns the active chat tab in the active group", () => {
    expect(
      chatTabTitle([
        {
          isActive: true,
          tabs: [{ isActive: true, label: "Chat" }],
        },
      ]),
    ).toBe("Chat");
  });

  it("ignores a Chat tab in an inactive group", () => {
    expect(
      chatTabTitle([
        {
          isActive: false,
          tabs: [{ isActive: true, label: "Chat" }],
        },
        {
          isActive: true,
          tabs: [{ isActive: true, label: "app.ts" }],
        },
      ]),
    ).toBeNull();
  });

  it("does not treat source files as chat tabs", () => {
    expect(
      chatTabTitle([
        {
          isActive: true,
          tabs: [{ isActive: true, label: "agent.ts" }],
        },
      ]),
    ).toBeNull();
  });
});
