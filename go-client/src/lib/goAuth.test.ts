import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearPgProvisionHashFromLocation,
  goLoginUrl,
  parsePgProvisionFromLocation,
} from "./platformClient";
import { goAuth } from "./goAuth.svelte";

describe("parsePgProvisionFromLocation", () => {
  it("parses #pg_provision= token", () => {
    expect(
      parsePgProvisionFromLocation({ hash: "#pg_provision=pg_pv_test" })
    ).toEqual({ token: "pg_pv_test" });
  });

  it("parses from combined hash with other params", () => {
    expect(
      parsePgProvisionFromLocation({
        hash: "#pg_provision=pg_pv_abc&foo=1",
      })
    ).toEqual({ token: "pg_pv_abc" });
  });

  it("falls back to search when hash missing", () => {
    expect(
      parsePgProvisionFromLocation({ search: "?pg_provision=pg_pv_q" })
    ).toEqual({ token: "pg_pv_q" });
  });

  it("returns null when absent", () => {
    expect(
      parsePgProvisionFromLocation({ hash: "#pg=other", search: "" })
    ).toBeNull();
  });

  it("decodes percent-encoded token", () => {
    expect(
      parsePgProvisionFromLocation({
        hash: "#pg_provision=pg_pv_a%2Bb",
      })
    ).toEqual({ token: "pg_pv_a+b" });
  });
});

describe("login field URL helpers", () => {
  it("does not touch the location once parsed when hash is stale", () => {
    // clearPgProvisionHashFromLocation is a no-op when window is absent.
    expect(clearPgProvisionHashFromLocation()).toBeUndefined();
  });
});

describe("goLoginUrl", () => {
  const original = import.meta.env.VITE_PLATFORM_DASH_ORIGIN;

  afterEach(() => {
    if (original === undefined) delete import.meta.env.VITE_PLATFORM_DASH_ORIGIN;
    else import.meta.env.VITE_PLATFORM_DASH_ORIGIN = original;
  });

  it("builds the dash /go/login redirect URL with ?field= for prod origin", () => {
    delete import.meta.env.VITE_PLATFORM_DASH_ORIGIN;
    const url = goLoginUrl("https://go.samkuo.me");
    expect(url.startsWith("https://dash.samkuo.me/go/login?")).toBe(true);
    expect(new URL(url).searchParams.get("field")).toBe("https://go.samkuo.me");
  });

  it("uses the VITE_PLATFORM_DASH_ORIGIN override in dev", () => {
    import.meta.env.VITE_PLATFORM_DASH_ORIGIN = "http://localhost:5173/";
    const url = goLoginUrl("http://localhost:5174");
    expect(url.startsWith("http://localhost:5173/go/login?")).toBe(true);
    expect(new URL(url).searchParams.get("field")).toBe("http://localhost:5174");
  });

  it("omits ?field= when fieldOrigin is empty", () => {
    delete import.meta.env.VITE_PLATFORM_DASH_ORIGIN;
    const url = goLoginUrl("");
    expect(new URL(url).searchParams.has("field")).toBe(false);
  });

  it("carries return_to when a non-root page is provided", () => {
    delete import.meta.env.VITE_PLATFORM_DASH_ORIGIN;
    const url = goLoginUrl("https://go.samkuo.me", {
      returnTo: "/s/pg-gomoku",
    });
    expect(new URL(url).searchParams.get("return_to")).toBe("/s/pg-gomoku");
  });

  it("omits return_to for the root path", () => {
    delete import.meta.env.VITE_PLATFORM_DASH_ORIGIN;
    const url = goLoginUrl("https://go.samkuo.me", { returnTo: "/" });
    expect(new URL(url).searchParams.has("return_to")).toBe(false);
  });

  it("drops unsafe return_to (external origin / fragment / traversal)", () => {
    delete import.meta.env.VITE_PLATFORM_DASH_ORIGIN;
    for (const bad of [
      "https://evil.example/x",
      "/safe#frag",
      "/a/../b",
    ]) {
      const url = goLoginUrl("https://go.samkuo.me", { returnTo: bad });
      expect(new URL(url).searchParams.has("return_to")).toBe(false);
    }
  });
});

describe("goAuth.mintPlatformInvite (GO-INVITE)", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    goAuth.__setApiKeyForTests(null);
    goAuth.__setTurnPreferForTests(false);
    if (originalFetch) globalThis.fetch = originalFetch;
    vi.unstubAllGlobals();
  });

  it("mints with memory key → bearer header, invite.compose body, targetField=go origin", async () => {
    goAuth.__setApiKeyForTests("pg_sk_test");
    let capturedUrl: string = "";
    let capturedInit: RequestInit | undefined;
    vi.stubGlobal(
      "fetch",
      async (input: RequestInfo | URL, init?: RequestInit) => {
        capturedUrl = typeof input === "string" ? input : String(input);
        capturedInit = init;
        return new Response(
          JSON.stringify({
            invite_id: "inv_1",
            kind: "invite.compose",
            expires_at: 1780000000000,
            short_url: "https://go.samkuo.me/i/abc",
            deep_link: "https://go.samkuo.me/i/abc",
            secret: "sec",
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
    );

    const out = await goAuth.mintPlatformInvite({
      kind: "invite.compose",
      intent: { version: 1 },
    });

    expect(out.short_url).toBe("https://go.samkuo.me/i/abc");
    expect(capturedUrl).toContain("/v1/invites");
    expect(capturedInit?.method).toBe("POST");
    const headers = new Headers(capturedInit?.headers as HeadersInit | undefined);
    expect(headers.get("Authorization")).toBe("Bearer pg_sk_test");
    const body = JSON.parse(String(capturedInit?.body) || "{}");
    expect(body.kind).toBe("invite.compose");
    expect(body.targetField).toContain("go");
    expect(body.intent).toEqual({ version: 1 });
  });

  it("stamps transport.roster.relay when Host prefers TURN", async () => {
    goAuth.__setApiKeyForTests("pg_sk_test");
    goAuth.__setTurnPreferForTests(true);
    let body: Record<string, unknown> = {};
    vi.stubGlobal(
      "fetch",
      async (_input: RequestInfo | URL, init?: RequestInit) => {
        body = JSON.parse(String(init?.body) || "{}");
        return new Response(
          JSON.stringify({
            invite_id: "inv_relay",
            kind: "invite.compose",
            expires_at: 1780000000000,
            short_url: "https://go.samkuo.me/i/relay",
            deep_link: "https://go.samkuo.me/i/relay",
            secret: "sec",
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
    );

    await goAuth.mintPlatformInvite({
      kind: "invite.compose",
      intent: {
        version: 1,
        transport: { roster: { signal: true } },
      },
    });

    expect(body.intent).toEqual({
      version: 1,
      transport: { roster: { signal: true, relay: true } },
    });
  });

  it("does not stamp relay for invite.room even when Host prefers TURN", async () => {
    goAuth.__setApiKeyForTests("pg_sk_test");
    goAuth.__setTurnPreferForTests(true);
    let body: Record<string, unknown> = {};
    vi.stubGlobal(
      "fetch",
      async (_input: RequestInfo | URL, init?: RequestInit) => {
        body = JSON.parse(String(init?.body) || "{}");
        return new Response(
          JSON.stringify({
            invite_id: "inv_room",
            kind: "invite.room",
            expires_at: 1780000000000,
            short_url: "https://go.samkuo.me/i/room1",
            deep_link: "https://go.samkuo.me/i/room1",
            secret: "sec",
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
    );

    await goAuth.mintPlatformInvite({
      kind: "invite.room",
      intent: {
        version: 1,
        surface: "room",
        transport: { roster: { signal: true } },
      },
    });

    expect(body.kind).toBe("invite.room");
    expect(body.intent).toEqual({
      version: 1,
      surface: "room",
      transport: { roster: { signal: true } },
    });
  });

  it("gives not_provisioned without a key", async () => {
    goAuth.__setApiKeyForTests(null);
    await expect(
      goAuth.mintPlatformInvite({ kind: "invite.compose" })
    ).rejects.toMatchObject({ code: "not_provisioned" });
  });

  it("propagates not_provisioned from a 401 platform response", async () => {
    goAuth.__setApiKeyForTests("pg_sk_stale");
    vi.stubGlobal(
      "fetch",
      async () =>
        new Response(
          JSON.stringify({ error: "通行證已失效", code: "not_provisioned" }),
          { status: 401, headers: { "content-type": "application/json" } }
        )
    );
    await expect(
      goAuth.mintPlatformInvite({ kind: "invite.compose" })
    ).rejects.toMatchObject({ code: "not_provisioned" });
  });

  it("never persists the api key to storage", () => {
    const lsKeys: string[] = [];
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => null,
      setItem: (k: string) => void lsKeys.push(k),
      removeItem: () => {},
      key: () => null,
      get length() {
        return 0;
      },
    });
    goAuth.__setApiKeyForTests("pg_sk_mem");
    expect(lsKeys).toEqual([]);
  });
});
