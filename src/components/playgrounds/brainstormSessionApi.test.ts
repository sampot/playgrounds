import { afterEach, describe, expect, it } from "vitest";
import {
  BRAINSTORM_PROTOCOL_ID,
  BRAINSTORM_STATE_KEY,
  brainstormSessionFetch,
} from "./brainstormSessionApi";
import { createFunctionsEnv } from "./functionsEnv";
import { clearMockKvStore } from "./mockKv";

const HOST_A = "host-kv-a";
const HOST_B = "host-kv-b";

afterEach(async () => {
  await clearMockKvStore(HOST_A);
  await clearMockKvStore(HOST_B);
});

function envFor(sandboxId: string) {
  return createFunctionsEnv(sandboxId, {}) as {
    KV: import("./mockKv").MockKvNamespace;
  };
}

describe("brainstormSessionFetch (KV-backed Host API)", () => {
  it("rejects act before open with session_inactive", async () => {
    const env = envFor(HOST_A);
    const res = await brainstormSessionFetch(
      new Request("https://h.local/api/session/act", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          role: "human",
          payload: { text: "hi" },
        }),
      }),
      env
    );
    expect(res.status).toBe(409);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("session_inactive");
  });

  it("shares state across separate env instances (shell vs canvas modules)", async () => {
    const shellEnv = envFor(HOST_A);
    const canvasEnv = envFor(HOST_A);

    const openRes = await brainstormSessionFetch(
      new Request("https://h.local/api/session/open", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sessionId: "sess-1",
          channelName: "playgrounds-session:sess-1",
        }),
      }),
      shellEnv
    );
    expect(openRes.ok).toBe(true);

    // Different createFunctionsEnv() call — same sandboxId KV backend.
    const actRes = await brainstormSessionFetch(
      new Request("https://h.local/api/session/act", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          role: "human",
          payload: { text: "hello from canvas" },
        }),
      }),
      canvasEnv
    );
    expect(actRes.status).toBe(200);
    const actBody = (await actRes.json()) as {
      ok: boolean;
      seq: number;
      events: unknown[];
    };
    expect(actBody.ok).toBe(true);
    expect(actBody.seq).toBe(1);
    expect(actBody.events).toHaveLength(1);

    const stateRes = await brainstormSessionFetch(
      new Request("https://h.local/api/session/state"),
      envFor(HOST_A)
    );
    const state = (await stateRes.json()) as {
      items: { text: string }[];
      sessionId: string;
    };
    expect(state.sessionId).toBe("sess-1");
    expect(state.items.map(i => i.text)).toEqual(["hello from canvas"]);
  });

  it("isolates KV per host project", async () => {
    await brainstormSessionFetch(
      new Request("https://h.local/api/session/open", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sessionId: "sess-a",
          channelName: "playgrounds-session:sess-a",
        }),
      }),
      envFor(HOST_A)
    );
    const resB = await brainstormSessionFetch(
      new Request("https://h.local/api/session/act", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          role: "human",
          payload: { text: "x" },
        }),
      }),
      envFor(HOST_B)
    );
    expect(resB.status).toBe(409);
  });

  it("returns meta protocol id", async () => {
    const res = await brainstormSessionFetch(
      new Request("https://h.local/api/session/meta"),
      envFor(HOST_A)
    );
    const meta = (await res.json()) as { protocolId: string };
    expect(meta.protocolId).toBe(BRAINSTORM_PROTOCOL_ID);
  });

  it("rejects forbidden roles", async () => {
    await brainstormSessionFetch(
      new Request("https://h.local/api/session/open", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sessionId: "s",
          channelName: "playgrounds-session:s",
        }),
      }),
      envFor(HOST_A)
    );
    const res = await brainstormSessionFetch(
      new Request("https://h.local/api/session/act", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          role: "hacker",
          payload: { text: "nope" },
        }),
      }),
      envFor(HOST_A)
    );
    expect(res.status).toBe(400);
    expect(((await res.json()) as { code: string }).code).toBe(
      "role_forbidden"
    );
  });

  it("persists under stable KV key", async () => {
    const env = envFor(HOST_A);
    await brainstormSessionFetch(
      new Request("https://h.local/api/session/open", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sessionId: "sess-key",
          channelName: "c",
        }),
      }),
      env
    );
    const raw = await env.KV.get(BRAINSTORM_STATE_KEY, "text");
    expect(typeof raw).toBe("string");
    expect(String(raw)).toContain("sess-key");
  });
});
