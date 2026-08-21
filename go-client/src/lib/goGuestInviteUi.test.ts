import { describe, expect, it } from "vitest";
import { guestInviteShowsRoomSurface } from "./goGuestInviteUi";

describe("guestInviteShowsRoomSurface", () => {
  it("keeps booth chrome through seating so the TV stays the game surface", () => {
    expect(
      guestInviteShowsRoomSurface({ isRoom: true, phase: "connecting" })
    ).toBe(true);
    expect(
      guestInviteShowsRoomSurface({ isRoom: true, phase: "ready" })
    ).toBe(true);
    expect(
      guestInviteShowsRoomSurface({ isRoom: true, phase: "seating" })
    ).toBe(true);
  });

  it("does not use booth chrome for compose invite wait phases", () => {
    expect(
      guestInviteShowsRoomSurface({ isRoom: false, phase: "seating" })
    ).toBe(false);
    expect(
      guestInviteShowsRoomSurface({ isRoom: false, phase: "ready" })
    ).toBe(false);
    expect(
      guestInviteShowsRoomSurface({ isRoom: true, phase: "loading_sam" })
    ).toBe(false);
  });
});
