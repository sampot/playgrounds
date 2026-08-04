export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/ping")) {
      const hits = Number((await env.KV.get("hits")) || "0");
      return Response.json({ id: "ping-a", hits });
    }
    if (url.pathname.endsWith("/hit") && request.method === "POST") {
      const hits = Number((await env.KV.get("hits")) || "0") + 1;
      await env.KV.put("hits", String(hits));
      return Response.json({ hits });
    }
    return new Response("not found", { status: 404 });
  },
};
