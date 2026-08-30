import { describe, expect, it } from "vitest";
import { createXhayperIpc } from "../xhayper.js";

describe("createXhayperIpc", () => {
  it("maps setActivity fields onto the user client", async () => {
    const calls: unknown[] = [];
    const ipc = createXhayperIpc("app", () => {
      const user = {
        setActivity: async (a: unknown) => {
          calls.push(a);
        },
        clearActivity: async () => {
          calls.push("clear");
        },
      };
      return {
        user,
        login: async () => {},
        destroy: async () => {
          calls.push("destroy");
        },
      };
    });
    await ipc.connect();
    await ipc.setActivity({
      pid: 12,
      details: "d",
      startTimestamp: 50,
      largeImageKey: "cursor",
      largeImageText: "Cursor",
    });
    expect(calls[0]).toMatchObject({
      pid: 12,
      details: "d",
      startTimestamp: 50,
      largeImageKey: "cursor",
      largeImageText: "Cursor",
    });
    await ipc.clearActivity();
    await ipc.disconnect();
    expect(calls).toContain("clear");
    expect(calls).toContain("destroy");
  });
});
