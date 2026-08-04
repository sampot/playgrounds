import { describe, expect, it } from "vitest";
import { AlarmStore } from "./alarmStore.ts";
import { createMemoryStorage } from "./storage.ts";

describe("AlarmStore.cancelById", () => {
  it("cancels a scheduled alarm by id without the handle", async () => {
    const store = new AlarmStore(createMemoryStorage());
    await store.flush();
    const { id } = store.schedule("agent-a", { delayMs: 60_000 });
    store.cancelById(id);
    await store.flush();
    const due = await store.collectDue(Date.now() + 120_000);
    expect(due).toEqual([]);
    expect(await store.listForAgent("agent-a")).toEqual([]);
  });
});
