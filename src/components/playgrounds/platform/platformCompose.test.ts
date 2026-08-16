import { describe, expect, it } from "vitest";
import { composeWantsRelay } from "./platformCompose";

describe("composeWantsRelay", () => {
  it("defaults to direct connectivity when relay was not selected", () => {
    expect(
      composeWantsRelay({
        version: 1,
        transport: { roster: { signal: true } },
      })
    ).toBe(false);
  });

  it("enables TURN only for an explicit relay opt-in", () => {
    expect(
      composeWantsRelay({
        version: 1,
        transport: { roster: { signal: true, relay: true } },
      })
    ).toBe(true);
  });
});
