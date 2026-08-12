export default {
  async onStart(env) {
    await env.KV.put("hits", "0");
    await env.KV.put("id", "hello-sdk");
  },

  async onCommand(command, env) {
    if (command?.type === "echo") {
      return {
        id: await env.KV.get("id"),
        hits: Number((await env.KV.get("hits")) || "0"),
        varsKeys: [
          // The host-installed default functions.js (PG-UI-SDK-SPEC §4) reads
          // env.vars on request — exercising that path here is left to the UI
          // side via window.PG. See tests/samHostHelloSdk.test.ts for the
          // headless round-trip.
        ],
      };
    }
    return { error: "unknown_command" };
  },
};
