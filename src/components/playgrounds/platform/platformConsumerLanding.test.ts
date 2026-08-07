import { describe, expect, it } from "vitest";
import {
  isConsumerPlayLanding,
  isPlatformInviteLanding,
} from "./platformConsumerLanding";

describe("platformConsumerLanding", () => {
  it("detects #pg= as invite + consumer", () => {
    expect(isPlatformInviteLanding({ hash: "#pg=secret", search: "" })).toBe(
      true
    );
    expect(isConsumerPlayLanding({ hash: "#pg=secret", search: "" })).toBe(
      true
    );
  });

  it("detects view=canvas as consumer but not invite", () => {
    expect(
      isConsumerPlayLanding({ hash: "", search: "?open=x&view=canvas" })
    ).toBe(true);
    expect(
      isPlatformInviteLanding({ hash: "", search: "?open=x&view=canvas" })
    ).toBe(false);
  });

  it("plain field is not consumer landing", () => {
    expect(isConsumerPlayLanding({ hash: "", search: "" })).toBe(false);
    expect(isPlatformInviteLanding({ hash: "", search: "?open=x" })).toBe(
      false
    );
  });
});
