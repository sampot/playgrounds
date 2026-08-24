/** First-party field origins + pg-booth-desktop Tauri shells (macOS `tauri://`, Win/Android `http://tauri.localhost`). */
const ALLOWED_ORIGIN =
  /^(https:\/\/([a-z0-9-]+\.)*samkuo\.me|http:\/\/localhost(:\d+)?|http:\/\/127\.0\.0\.1(:\d+)?|http:\/\/tauri\.localhost(:\d+)?|tauri:\/\/localhost)$/i;

export function corsHeaders(req: Request): HeadersInit {
  const origin = req.headers.get("Origin") || "";
  const allow = ALLOWED_ORIGIN.test(origin) ? origin : "";
  const h: Record<string, string> = {
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Max-Age": "86400",
  };
  if (allow) {
    h["Access-Control-Allow-Origin"] = allow;
    // First-party origins only (samkuo.me / localhost). sendBeacon and
    // cross-origin fetch always use credentials mode "include", so the
    // preflight + response must echo this or the browser blocks the request.
    h["Access-Control-Allow-Credentials"] = "true";
    h["Vary"] = "Origin";
  }
  return h;
}

/** WebSocket 101 must not be rebuilt — `new Response(...)` drops `webSocket`. */
export function isWebSocketUpgradeResponse(res: Response): boolean {
  return res.status === 101 || res.webSocket != null;
}

export function withCors(req: Request, res: Response): Response {
  if (isWebSocketUpgradeResponse(res)) {
    return res;
  }
  const headers = new Headers(res.headers);
  for (const [k, v] of Object.entries(corsHeaders(req))) {
    headers.set(k, v);
  }
  return new Response(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers,
  });
}
