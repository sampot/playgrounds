import { beforeEach, describe, expect, it, vi } from "vitest";

const acceptRosterOffer = vi.fn();

vi.mock("@pg/roster/rosterPeer", () => ({
  acceptRosterOffer,
}));

describe("createRoomGuestJoinAcceptor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    acceptRosterOffer.mockResolvedValue({
      session: { id: "sess-1" },
      wire: "answer-wire",
    });
  });

  it("accepts roster offer with booth media and attaches session", async () => {
    const { createRoomGuestJoinAcceptor } = await import("./roomBoothJoinHost");
    const attachSession = vi.fn();
    const accept = createRoomGuestJoinAcceptor({
      localAgentId: "host-1",
      hostName: () => "主持",
      prepareHandlers: () => ({
        handlers: { onMessage: vi.fn() },
        attachSession,
      }),
    });
    const answer = await accept("offer-wire");
    expect(answer).toBe("answer-wire");
    expect(acceptRosterOffer).toHaveBeenCalledWith(
      expect.objectContaining({
        offerWire: "offer-wire",
        media: "ready",
        localPresence: { agentId: "host-1", name: "主持" },
      })
    );
    expect(attachSession).toHaveBeenCalledWith({ id: "sess-1" });
  });
});
