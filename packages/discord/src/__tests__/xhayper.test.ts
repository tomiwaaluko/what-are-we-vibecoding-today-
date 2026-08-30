import { describe, expect, it } from "vitest";
import { createXhayperIpc } from "../xhayper.js";

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

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

  it("stops retrying after disconnect cancels a failing login loop", async () => {
    const wait = deferred();
    let delayStarted!: () => void;
    const delayReady = new Promise<void>((resolve) => {
      delayStarted = resolve;
    });
    let loginAttempts = 0;
    let setAttempts = 0;
    const ipc = createXhayperIpc(
      "app",
      () => ({
        user: {
          setActivity: async () => {
            setAttempts += 1;
          },
          clearActivity: async () => {},
        },
        login: async () => {
          loginAttempts += 1;
          throw new Error("login failed");
        },
        destroy: async () => {},
      }),
      {
        delay: async () => {
          delayStarted();
          await wait.promise;
        },
      },
    );

    const publish = ipc.setActivity({
      pid: 12,
      details: "d",
      startTimestamp: 50,
      largeImageKey: "cursor",
      largeImageText: "Cursor",
    });
    await delayReady;
    await ipc.disconnect();
    wait.resolve();
    await publish;

    expect(loginAttempts).toBe(1);
    expect(setAttempts).toBe(0);
  });

  it("destroys the client even when clearActivity throws during disconnect", async () => {
    const calls: string[] = [];
    const ipc = createXhayperIpc("app", () => ({
      user: {
        setActivity: async () => {},
        clearActivity: async () => {
          calls.push("clear");
          throw new Error("clear failed");
        },
      },
      login: async () => {},
      destroy: async () => {
        calls.push("destroy");
      },
    }));

    await ipc.connect();
    await expect(ipc.disconnect()).rejects.toThrow("clear failed");

    expect(calls).toEqual(["clear", "destroy"]);
  });
});
