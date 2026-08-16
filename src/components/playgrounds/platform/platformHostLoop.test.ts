import { afterEach, describe, expect, it, vi } from "vitest";
import { acceptRosterOffer } from "../roster";
import {
  fetchHostTurnIceServers,
  pollPendingOffer,
  putAnswer,
} from "./platformClient";
import { startPlatformHostAnswerLoop } from "./platformHostLoop";

vi.mock("../roster", () => ({
  acceptRosterOffer: vi.fn(),
}));

vi.mock("./platformClient", () => ({
  fetchHostTurnIceServers: vi.fn(),
  pollPendingOffer: vi.fn(),
  putAnswer: vi.fn(),
}));

afterEach(() => {
  vi.resetAllMocks();
});

describe("startPlatformHostAnswerLoop TURN opt-in", () => {
  it("does not request TURN credentials unless relay is explicitly enabled", async () => {
    vi.mocked(pollPendingOffer).mockResolvedValue({
      join_id: "join-1",
      offer: "offer-wire",
    });
    vi.mocked(acceptRosterOffer).mockResolvedValue({
      session: { send: vi.fn() },
      wire: "answer-wire",
    } as never);
    vi.mocked(putAnswer).mockResolvedValue(undefined as never);
    const onDone = vi.fn();

    startPlatformHostAnswerLoop({
      inviteId: "inv-1",
      apiKey: "pg_sk_test",
      localPresence: { agentId: "host-1", name: "Host" },
      maxAnswers: 1,
      prepareHandlers: () => ({
        handlers: {},
        attachSession: vi.fn(),
      }),
      onDone,
    });

    await vi.waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
    expect(fetchHostTurnIceServers).not.toHaveBeenCalled();
  });

  it("requests TURN credentials when relay is explicitly enabled", async () => {
    vi.mocked(pollPendingOffer).mockResolvedValue({
      join_id: "join-relay",
      offer: "offer-wire",
    });
    vi.mocked(fetchHostTurnIceServers).mockResolvedValue([
      { urls: "turn:relay.example.test" },
    ]);
    vi.mocked(acceptRosterOffer).mockResolvedValue({
      session: { send: vi.fn() },
      wire: "answer-wire",
    } as never);
    vi.mocked(putAnswer).mockResolvedValue(undefined as never);
    const onDone = vi.fn();

    startPlatformHostAnswerLoop({
      inviteId: "inv-relay",
      apiKey: "pg_sk_test",
      useRelay: true,
      localPresence: { agentId: "host-1", name: "Host" },
      maxAnswers: 1,
      prepareHandlers: () => ({
        handlers: {},
        attachSession: vi.fn(),
      }),
      onDone,
    });

    await vi.waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
    expect(fetchHostTurnIceServers).toHaveBeenCalledWith({
      apiKey: "pg_sk_test",
      sessionId: "join-relay",
    });
    expect(acceptRosterOffer).toHaveBeenCalledWith(
      expect.objectContaining({
        iceServers: [{ urls: "turn:relay.example.test" }],
      })
    );
  });
});
