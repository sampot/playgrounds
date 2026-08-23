import { afterEach, describe, expect, it, vi } from "vitest";
import { postBoothJoinOfferAndWaitAnswer } from "./platformClient";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("postBoothJoinOfferAndWaitAnswer", () => {
  it("returns answer on success", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ answer: "ans-wire", join_id: "j1" }), {
        status: 200,
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const out = await postBoothJoinOfferAndWaitAnswer({
      inviteId: "inv-1",
      joinCap: "join-cap",
      offerWire: "offer-wire",
      origin: "https://api.samkuo.me",
    });

    expect(out).toEqual({ answer: "ans-wire", join_id: "j1" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.samkuo.me/v1/booth/join/offer");
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({
      Authorization: "Bearer join-cap",
    });
    expect(JSON.parse(String(init.body))).toEqual({
      inviteId: "inv-1",
      offerWire: "offer-wire",
      waitMs: undefined,
    });
  });

  it("retries on 408 timeout until answer arrives", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "timeout", join_id: "j1" }), {
          status: 408,
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ answer: "ans-2", join_id: "j1" }), {
          status: 200,
        })
      );
    vi.stubGlobal("fetch", fetchMock);

    const out = await postBoothJoinOfferAndWaitAnswer({
      inviteId: "inv-1",
      joinCap: "join-cap",
      offerWire: "offer-wire",
      origin: "https://api.samkuo.me",
    });

    expect(out.answer).toBe("ans-2");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("throws anchor_offline without retry", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: "anchor_offline" }), { status: 503 })
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      postBoothJoinOfferAndWaitAnswer({
        inviteId: "inv-1",
        joinCap: "join-cap",
        offerWire: "offer-wire",
        origin: "https://api.samkuo.me",
        maxAttempts: 3,
      })
    ).rejects.toMatchObject({ message: "anchor_offline", status: 503 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
