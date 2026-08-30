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

  it("retries login with backoff and reports disconnected status", async () => {
    const delays: number[] = [];
    const statuses: string[] = [];
    let attempts = 0;
    const ipc = createXhayperIpc(
      "app",
      () => ({
        user: {
          setActivity: async () => {},
          clearActivity: async () => {},
        },
        login: async () => {
          attempts += 1;
          if (attempts < 3) throw new Error("login failed");
        },
        destroy: async () => {},
      }),
      {
        delay: async (ms) => {
          delays.push(ms);
        },
        onStatus: (text) => {
          statuses.push(text);
        },
      },
    );

    await ipc.connect();
    await ipc.setActivity({
      pid: 12,
      details: "d",
      startTimestamp: 50,
      largeImageKey: "cursor",
      largeImageText: "Cursor",
    });

    expect(attempts).toBe(3);
    expect(delays).toEqual([1000, 2000]);
    expect(statuses).toContain("Discord not connected");
    expect(statuses.at(-1)).toBe("");
  });

  it("retries setActivity with backoff until success", async () => {
    const delays: number[] = [];
    let setAttempts = 0;
    const ipc = createXhayperIpc(
      "app",
      () => ({
        user: {
          setActivity: async () => {
            setAttempts += 1;
            if (setAttempts < 3) throw new Error("setActivity failed");
          },
          clearActivity: async () => {},
        },
        login: async () => {},
        destroy: async () => {},
      }),
      {
        delay: async (ms) => {
          delays.push(ms);
        },
      },
    );

    await ipc.connect();
    await ipc.setActivity({
      pid: 12,
      details: "d",
      startTimestamp: 50,
      largeImageKey: "cursor",
      largeImageText: "Cursor",
    });

    expect(setAttempts).toBe(3);
    expect(delays).toEqual([1000, 2000]);
  });
});
