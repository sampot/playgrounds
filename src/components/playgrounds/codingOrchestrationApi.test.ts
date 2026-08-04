import { afterEach, describe, expect, it } from "vitest";
import { simpleUnifiedDiff } from "./agentUx";
import {
  CODING_ORCH_DEMO_PATH,
  CODING_ORCH_JOIN_POLICY,
  CODING_ORCH_PROTOCOL_ID,
  CODING_ORCH_STATE_KEY,
  codingOrchestrationFetch,
} from "./codingOrchestrationApi";
import { createFunctionsEnv } from "./functionsEnv";
import { clearMockKvStore } from "./mockKv";

const HOST = "coding-orch-host";

afterEach(async () => {
  await clearMockKvStore(HOST);
});

function envFor(sandboxId: string) {
  return createFunctionsEnv(sandboxId, {}) as {
    KV: import("./mockKv").MockKvNamespace;
  };
}

async function openSession(env: ReturnType<typeof envFor>) {
  const res = await codingOrchestrationFetch(
    new Request("https://h.local/api/session/open", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sessionId: "sess-c1",
        channelName: "playgrounds-session:sess-c1",
        chatSessionId: "chat-1",
      }),
    }),
    env
  );
  expect(res.ok).toBe(true);
}

describe("codingOrchestrationFetch", () => {
  it("meta declares invite_only coding-orchestration.v1", async () => {
    const env = envFor(HOST);
    const res = await codingOrchestrationFetch(
      new Request("https://h.local/api/session/meta"),
      env
    );
    const body = (await res.json()) as {
      protocolId: string;
      joinPolicy: string;
    };
    expect(body.protocolId).toBe(CODING_ORCH_PROTOCOL_ID);
    expect(body.joinPolicy).toBe(CODING_ORCH_JOIN_POLICY);
  });

  it("open stores chatSessionId", async () => {
    const env = envFor(HOST);
    const res = await codingOrchestrationFetch(
      new Request("https://h.local/api/session/open", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sessionId: "sess-x",
          channelName: "ch-x",
          chatSessionId: "chat-42",
        }),
      }),
      env
    );
    expect(res.ok).toBe(true);
    const stateRes = await codingOrchestrationFetch(
      new Request("https://h.local/api/session/state"),
      env
    );
    const state = (await stateRes.json()) as { chatSessionId: string };
    expect(state.chatSessionId).toBe("chat-42");
  });

  it("C1: assign → task.result patch → fileWrites", async () => {
    const env = envFor(HOST);
    await openSession(env);

    const assignRes = await codingOrchestrationFetch(
      new Request("https://h.local/api/session/assign", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ assigneeSeatId: "seat-w1" }),
      }),
      env
    );
    expect(assignRes.ok).toBe(true);
    const assignBody = (await assignRes.json()) as {
      events: { type: string }[];
    };
    expect(assignBody.events.some(e => e.type === "task.assigned")).toBe(true);

    const before = `export function add(a, b) {\n  return a + b + 1; // bug: off-by-one\n}\n`;
    const after = `export function add(a, b) {\n  return a + b;\n}\n`;
    const unifiedDiff = simpleUnifiedDiff(before, after, CODING_ORCH_DEMO_PATH);

    const actRes = await codingOrchestrationFetch(
      new Request("https://h.local/api/session/act", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          role: "worker",
          seatId: "seat-w1",
          payload: {
            type: "task.result",
            taskId: "t1",
            result: {
              summary: "fixed off-by-one",
              edits: [
                {
                  path: CODING_ORCH_DEMO_PATH,
                  kind: "patch",
                  unifiedDiff,
                },
              ],
            },
          },
        }),
      }),
      env
    );
    expect(actRes.status).toBe(200);
    const actBody = (await actRes.json()) as {
      ok: boolean;
      fileWrites: { path: string; content: string }[];
    };
    expect(actBody.ok).toBe(true);
    expect(actBody.fileWrites).toEqual([
      { path: CODING_ORCH_DEMO_PATH, content: after },
    ]);

    const raw = await env.KV.get(CODING_ORCH_STATE_KEY, "text");
    expect(typeof raw).toBe("string");
    const store = JSON.parse(String(raw)) as {
      files: Record<string, string>;
      status: string;
    };
    expect(store.files[CODING_ORCH_DEMO_PATH]).toBe(after);
    expect(store.status).toBe("completed");
  });

  it("open with targetSandboxId skips demo seed; custom assign", async () => {
    const env = envFor(HOST);
    const openRes = await codingOrchestrationFetch(
      new Request("https://h.local/api/session/open", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sessionId: "sess-t",
          channelName: "ch-t",
          chatSessionId: "chat-t",
          targetSandboxId: "work-proj",
        }),
      }),
      env
    );
    expect(openRes.ok).toBe(true);
    const stateRes = await codingOrchestrationFetch(
      new Request("https://h.local/api/session/state"),
      env
    );
    const state = (await stateRes.json()) as {
      targetSandboxId: string | null;
      tasks: unknown[];
      files: Record<string, string>;
    };
    expect(state.targetSandboxId).toBe("work-proj");
    expect(state.tasks).toEqual([]);
    expect(state.files[CODING_ORCH_DEMO_PATH]).toBeUndefined();

    const assignRes = await codingOrchestrationFetch(
      new Request("https://h.local/api/session/assign", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          assigneeSeatId: "seat-w2",
          brief: "remove the +1 bug",
          path: CODING_ORCH_DEMO_PATH,
          content: `export function add(a, b) {\n  return a + b + 1;\n}\n`,
        }),
      }),
      env
    );
    expect(assignRes.ok).toBe(true);
    const assignBody = (await assignRes.json()) as {
      targetSandboxId: string;
      events: { type: string; brief?: string }[];
    };
    expect(assignBody.targetSandboxId).toBe("work-proj");
    expect(assignBody.events.some(e => e.type === "task.assigned")).toBe(true);
    expect(assignBody.events.find(e => e.type === "task.assigned")?.brief).toBe(
      "remove the +1 bug"
    );

    const after = `export function add(a, b) {\n  return a + b;\n}\n`;
    const resultRes = await codingOrchestrationFetch(
      new Request("https://h.local/api/session/act", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          role: "worker",
          seatId: "seat-w2",
          payload: {
            type: "task.result",
            taskId: "t1",
            result: {
              summary: "fixed",
              edits: [
                { path: CODING_ORCH_DEMO_PATH, kind: "write", content: after },
              ],
            },
          },
        }),
      }),
      env
    );
    expect(resultRes.ok).toBe(true);
    const resultBody = (await resultRes.json()) as {
      targetSandboxId: string | null;
      fileWrites: { path: string; content: string }[];
    };
    expect(resultBody.targetSandboxId).toBe("work-proj");
    expect(resultBody.fileWrites).toEqual([
      { path: CODING_ORCH_DEMO_PATH, content: after },
    ]);
  });

  it("rejects forbidden edit paths", async () => {
    const env = envFor(HOST);
    await openSession(env);
    await codingOrchestrationFetch(
      new Request("https://h.local/api/session/assign", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ assigneeSeatId: "seat-w1" }),
      }),
      env
    );
    const res = await codingOrchestrationFetch(
      new Request("https://h.local/api/session/act", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          role: "worker",
          seatId: "seat-w1",
          payload: {
            type: "task.result",
            taskId: "t1",
            result: {
              edits: [
                {
                  path: "../secrets.txt",
                  kind: "write",
                  content: "x",
                },
              ],
            },
          },
        }),
      }),
      env
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("edit_path_forbidden");
  });
});
