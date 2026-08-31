import { describe, expect, it } from "vitest";
import type { PresenceCard } from "@vibecoding/core";
import { createBrokerController } from "../broker.js";

class RecordingWriter {
  published: PresenceCard[] = [];
  clears = 0;
  async publish(card: PresenceCard): Promise<void> {
    this.published.push(card);
  }
  async clear(): Promise<void> {
    this.clears += 1;
  }
}

describe("createBrokerController", () => {
  it("publishes immediately on first card and clears immediately on pause", async () => {
    const writer = new RecordingWriter();
    const broker = createBrokerController({
      writer,
      trayPid: 7,
      pidAlive: () => true,
      now: () => 0,
      idleMinutes: 15,
      debounceMs: 3000,
    });
    await broker.upsert({
      instanceId: "c",
      pid: 1,
      identity: "cursor",
      surface: "ide-extension",
      focused: true,
      repo: "r",
      sessionTitle: "s",
      agentCount: 0,
      lastActivityAt: 0,
    });
    expect(writer.published).toHaveLength(1);
    expect(writer.published[0]!.details).toBe("s");
    await broker.setPaused(true);
    expect(writer.clears).toBe(1);
  });

  it("debounces non-identity session edits until flush after 3s", async () => {
    const writer = new RecordingWriter();
    let now = 0;
    const broker = createBrokerController({
      writer,
      trayPid: 7,
      pidAlive: () => true,
      now: () => now,
      idleMinutes: 15,
      debounceMs: 3000,
    });
    await broker.upsert({
      instanceId: "c",
      pid: 1,
      identity: "cursor",
      surface: "ide-extension",
      focused: true,
      repo: "r",
      sessionTitle: "a",
      agentCount: 0,
      lastActivityAt: 0,
    });
    now = 100;
    await broker.upsert({
      instanceId: "c",
      pid: 1,
      identity: "cursor",
      surface: "ide-extension",
      focused: true,
      repo: "r",
      sessionTitle: "b",
      agentCount: 0,
      lastActivityAt: 100,
    });
    expect(writer.published).toHaveLength(1);
    now = 3000;
    await broker.flush();
    expect(writer.published.at(-1)?.details).toBe("b");
  });

  it("publishes a debounced session edit when debounceMs elapses", async () => {
    const writer = new RecordingWriter();
    const started = Date.now();
    const broker = createBrokerController({
      writer,
      trayPid: 7,
      pidAlive: () => true,
      now: () => Date.now() - started,
      idleMinutes: 15,
      debounceMs: 20,
    });
    await broker.upsert({
      instanceId: "c",
      pid: 1,
      identity: "cursor",
      surface: "ide-extension",
      focused: true,
      repo: "r",
      sessionTitle: "a",
      agentCount: 0,
      lastActivityAt: 0,
    });
    await broker.upsert({
      instanceId: "c",
      pid: 1,
      identity: "cursor",
      surface: "ide-extension",
      focused: true,
      repo: "r",
      sessionTitle: "b",
      agentCount: 0,
      lastActivityAt: 1,
    });
    expect(writer.published).toHaveLength(1);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(writer.published.at(-1)?.details).toBe("b");
  });

  it("does not block upsert on a pending Discord publish", async () => {
    const writer = {
      async publish(): Promise<void> {
        await new Promise(() => {});
      },
      async clear(): Promise<void> {},
    };
    const broker = createBrokerController({
      writer,
      trayPid: 7,
      pidAlive: () => true,
      now: () => 0,
      idleMinutes: 15,
      debounceMs: 3000,
    });
    const result = await Promise.race([
      broker
        .upsert({
          instanceId: "c",
          pid: 1,
          identity: "cursor",
          surface: "ide-extension",
          focused: true,
          repo: "r",
          sessionTitle: "s",
          agentCount: 0,
          lastActivityAt: 0,
        })
        .then(() => "resolved"),
      new Promise<string>((resolve) => setTimeout(() => resolve("blocked"), 10)),
    ]);
    expect(result).toBe("resolved");
  });
});
