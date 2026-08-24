import { describe, expect, it } from "vitest";
import { isWebSocketUpgradeResponse, withCors } from "./cors.js";

describe("withCors", () => {
  it("passes through WebSocket upgrade responses unchanged", () => {
    const req = new Request("https://api.samkuo.me/v1/booth/ws");
    const res = new Response(null, { status: 200 });
    Object.defineProperty(res, "webSocket", { value: {} });
    expect(isWebSocketUpgradeResponse(res)).toBe(true);
    expect(withCors(req, res)).toBe(res);
  });

  it("adds CORS headers to normal JSON responses", () => {
    const req = new Request("https://api.samkuo.me/v1/booth/anchors", {
      headers: { Origin: "https://go.samkuo.me" },
    });
    const res = new Response('{"ok":true}', {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
    const out = withCors(req, res);
    expect(out).not.toBe(res);
    expect(out.headers.get("Access-Control-Allow-Origin")).toBe(
      "https://go.samkuo.me"
    );
  });

  it("allows pg-booth-desktop Tauri origins", () => {
    for (const origin of ["tauri://localhost", "http://tauri.localhost"]) {
      const req = new Request("https://api.samkuo.me/v1/field/provision/redeem", {
        headers: { Origin: origin },
      });
      const out = withCors(
        req,
        new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } })
      );
      expect(out.headers.get("Access-Control-Allow-Origin")).toBe(origin);
    }
  });
});
