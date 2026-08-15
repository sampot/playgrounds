// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { createGuestRuntime } from "./guestRuntime";

describe("guestRuntime.decline", () => {
  it("sets an explicit cancelled phase instead of idle", () => {
    const runtime = createGuestRuntime();
    runtime.decline();
    const status = runtime.getStatus();
    expect(status.phase).toBe("cancelled");
    expect(status.message).toBe("已取消");
  });
});
