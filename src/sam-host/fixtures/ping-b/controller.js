export default {
  async onStart(env) {
    await env.KV.put("hits", "0");
    await env.KV.put("label", "B");
    await env.KV.put("id", "ping-b");
    await env.KV.put("mail", "[]");
  },
  async alarm(env) {
    const hits = Number((await env.KV.get("hits")) || "0") + 100;
    await env.KV.put("hits", String(hits));
    await env.KV.put("alarmed", "1");
  },
  async onMessage(msg, env, ctx) {
    const mail = JSON.parse((await env.KV.get("mail")) || "[]");
    mail.push({ type: msg.type, from: msg.from, payload: msg.payload });
    await env.KV.put("mail", JSON.stringify(mail));
    if (msg.type === "app.ping" && msg.payload?.replyTo) {
      await ctx.send({
        to: msg.payload.replyTo,
        type: "app.pong",
        payload: { fromLabel: await env.KV.get("label") },
      });
    }
  },
  async onCommand(command, env, ctx) {
    if (command?.type === "arm_alarm") {
      ctx.schedule({ delayMs: Number(command.delayMs) || 40 });
      return { ok: true };
    }
    // Controllers use bindings directly (no env.INFRA → functions).
    if (command?.type === "hit") {
      const hits = Number((await env.KV.get("hits")) || "0") + 1;
      await env.KV.put("hits", String(hits));
      return { hits };
    }
    if (command?.type === "ping") {
      return {
        id: await env.KV.get("id"),
        hits: Number((await env.KV.get("hits")) || "0"),
      };
    }
    if (command?.type === "mail") {
      return JSON.parse((await env.KV.get("mail")) || "[]");
    }
    if (command?.type === "tell") {
      await ctx.send({
        to: command.to,
        type: command.msgType || "app.ping",
        payload: command.payload,
      });
      return { ok: true };
    }
    return { error: "unknown_command" };
  },
};
