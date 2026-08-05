import { describe, expect, it } from "vitest";
import { isAvatarRelayMessage, isPresenceMessage } from "./rosterPeer";
import {
  clearRosterAvatars,
  listRosterAvatars,
  removeRosterAvatar,
  upsertRosterAvatar,
} from "./rosterStore";

describe("isAvatarRelayMessage", () => {
  it("accepts ping envelope", () => {
    expect(
      isAvatarRelayMessage({
        type: "avatar_relay",
        from: "a",
        to: "b",
        payload: { kind: "ping", at: 1 },
      })
    ).toBe(true);
  });

  it("rejects presence and malformed relay", () => {
    expect(
      isAvatarRelayMessage({
        type: "presence",
        agentId: "a",
        name: "A",
      })
    ).toBe(false);
    expect(
      isAvatarRelayMessage({
        type: "avatar_relay",
        from: "a",
        payload: {},
      })
    ).toBe(false);
    expect(isPresenceMessage({ type: "presence", agentId: "a", name: "A" })).toBe(
      true
    );
  });
});

describe("rosterStore sandboxId", () => {
  it("tracks sandboxId and returns it on clear/remove", () => {
    clearRosterAvatars();
    upsertRosterAvatar({
      agentId: "p1",
      name: "P1",
      sandboxId: "sbx-p1",
    });
    expect(listRosterAvatars()[0]?.sandboxId).toBe("sbx-p1");
    expect(removeRosterAvatar("p1")).toBe("sbx-p1");
    upsertRosterAvatar({
      agentId: "p2",
      name: "P2",
      sandboxId: "sbx-p2",
    });
    expect(clearRosterAvatars()).toEqual(["sbx-p2"]);
    expect(listRosterAvatars()).toEqual([]);
  });
});
