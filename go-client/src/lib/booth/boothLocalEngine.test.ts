import { describe, expect, it, vi } from "vitest";
import {
  BOOTH_LOCAL_DEFAULT_PORT,
  buildLocalEngineEndpoints,
  controlWsUrlWithToken,
  probeLocalBoothEngine,
} from "./boothLocalEngine";

describe("boothLocalEngine", () => {
  it("builds default loopback endpoints", () => {
    const urls = buildLocalEngineEndpoints();
    expect(urls.httpOrigin).toBe(
      `http://127.0.0.1:${BOOTH_LOCAL_DEFAULT_PORT}`
    );
    expect(urls.statusUrl).toContain("/v1/booth/local/status");
    expect(urls.controlWsUrl).toContain("/booth/control");
  });

  it("appends shell token to control ws url", () => {
    expect(controlWsUrlWithToken("ws://127.0.0.1:7847/booth/control", "tok"))
      .toBe("ws://127.0.0.1:7847/booth/control?token=tok");
  });

  it("probes local status and parses online engine", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        online: true,
        sessionId: "sess-native",
        engineMode: "daemon",
        guestCount: 2,
        anchor: "online",
      }),
    });
    const out = await probeLocalBoothEngine({
      fetchImpl: fetchMock,
      shellToken: "shell-token",
    });
    expect(out.online).toBe(true);
    expect(out.sessionId).toBe("sess-native");
    expect(out.guestCount).toBe(2);
    expect(fetchMock.mock.calls[0]?.[1]?.headers?.Authorization).toBe(
      "Bearer shell-token"
    );
  });

  it("returns needsToken on 401", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 401 });
    const out = await probeLocalBoothEngine({ fetchImpl: fetchMock });
    expect(out).toEqual({ online: true, needsToken: true });
  });
});
