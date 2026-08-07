const ALLOWED_ORIGIN = /^(https:\/\/([a-z0-9-]+\.)*samkuo\.me|http:\/\/localhost(:\d+)?|http:\/\/127\.0\.0\.1(:\d+)?)$/i;

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
    h["Vary"] = "Origin";
  }
  return h;
}

export function withCors(req: Request, res: Response): Response {
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
