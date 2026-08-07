import { describe, expect, it } from "vitest";
import { mainThreadNeedsOpfsWorkerWrites } from "./opfsStore";

describe("mainThreadNeedsOpfsWorkerWrites", () => {
  it("is a boolean in this environment", () => {
    expect(typeof mainThreadNeedsOpfsWorkerWrites()).toBe("boolean");
  });
});
