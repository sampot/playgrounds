/**
 * Coding orchestration Host session API (DEC-033 dogfood, no LLM).
 * Protocol: coding-orchestration.v1 — invite_only workers; host_apply patches.
 *
 * OPFS writes: act responses may include `fileWrites`; the shell persists them
 * (Host functions.js has no HOST during SESSION act forwarding).
 */

import { applyUnifiedDiff, UnifiedDiffError } from "./applyUnifiedDiff";
import type { MockKvNamespace } from "./mockKv";

export const CODING_ORCH_PROTOCOL_ID = "coding-orchestration.v1";
export const CODING_ORCH_PROTOCOL_API_VERSION = "1";
export const CODING_ORCH_STATE_KEY = "session:coding-orchestration:v1";
export const CODING_ORCH_DEMO_PATH = "src/demo.js";
export const CODING_ORCH_JOIN_POLICY = "invite_only" as const;

export const CODING_ORCH_ROLES = ["worker", "human"] as const;
export const CODING_ORCH_ROLE_LIMITS: Record<
  (typeof CODING_ORCH_ROLES)[number],
  number
> = {
  worker: 4,
  human: 1,
};

export const CODING_ORCH_CAPABILITIES = [
  "task.assign",
  "task.progress",
  "task.result",
  "task.failed",
  "task.clarify",
  "orchestration.cancel",
  "side_effects.host_apply",
  "side_effects.delegate_grant",
] as const;

const MAX_DIFF_CHARS = 20_000;
const ALLOWED_PATH_PREFIXES = ["src/", "README.md"];

export interface CodingOrchSessionEnv {
  KV: MockKvNamespace;
}

export type CodingOrchTaskStatus =
  "pending" | "assigned" | "in_progress" | "done" | "failed" | "cancelled";

export interface CodingOrchTask {
  taskId: string;
  title: string;
  brief: string;
  status: CodingOrchTaskStatus;
  assigneeSeatId: string | null;
  result?: unknown;
  error?: { code: string; message: string };
}

export interface CodingOrchStore {
  sessionId: string | null;
  channelName: string | null;
  chatSessionId: string;
  /** Sandbox that receives host_apply fileWrites (may ≠ Host). */
  targetSandboxId: string | null;
  revision: number;
  status: "planning" | "running" | "completed" | "failed" | "cancelled";
  goal: string;
  tasks: CodingOrchTask[];
  /** In-memory file bag for tests / host_apply preview before shell persist. */
  files: Record<string, string>;
}

export function codingOrchStateKey(chatSessionId?: string | null): string {
  const id = typeof chatSessionId === "string" ? chatSessionId.trim() : "";
  return id ? `${CODING_ORCH_STATE_KEY}:${id}` : CODING_ORCH_STATE_KEY;
}

export interface CodingOrchFileWrite {
  path: string;
  content: string;
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function err(code: string, error: string, status = 400): Response {
  return json({ error, code }, status);
}

function emptyStore(opts?: {
  chatSessionId?: string;
  targetSandboxId?: string | null;
  seedDemo?: boolean;
}): CodingOrchStore {
  const seedDemo = opts?.seedDemo !== false && !opts?.targetSandboxId;
  return {
    sessionId: null,
    channelName: null,
    chatSessionId: opts?.chatSessionId?.trim() || "dogfood",
    targetSandboxId: opts?.targetSandboxId?.trim() || null,
    revision: 0,
    status: "planning",
    goal: seedDemo ? "Fix off-by-one in demo.js" : "",
    tasks: [],
    files: seedDemo
      ? {
          [CODING_ORCH_DEMO_PATH]: `export function add(a, b) {\n  return a + b + 1; // bug: off-by-one\n}\n`,
        }
      : {},
  };
}

async function loadStore(
  env: CodingOrchSessionEnv,
  chatSessionId?: string | null
): Promise<CodingOrchStore> {
  const key = codingOrchStateKey(chatSessionId);
  let raw = await env.KV.get(key, "text");
  if ((typeof raw !== "string" || !raw) && key !== CODING_ORCH_STATE_KEY) {
    raw = await env.KV.get(CODING_ORCH_STATE_KEY, "text");
  }
  if (typeof raw !== "string" || !raw) {
    return emptyStore({ chatSessionId: chatSessionId || "dogfood" });
  }
  try {
    const parsed = JSON.parse(raw) as Partial<CodingOrchStore>;
    const base = emptyStore({
      chatSessionId:
        typeof parsed.chatSessionId === "string"
          ? parsed.chatSessionId
          : chatSessionId || "dogfood",
      seedDemo: false,
    });
    return {
      sessionId: parsed.sessionId || null,
      channelName: parsed.channelName || null,
      chatSessionId:
        typeof parsed.chatSessionId === "string"
          ? parsed.chatSessionId
          : base.chatSessionId,
      targetSandboxId:
        typeof parsed.targetSandboxId === "string" &&
        parsed.targetSandboxId.trim()
          ? parsed.targetSandboxId.trim()
          : null,
      revision: Number(parsed.revision) || 0,
      status: parsed.status || "planning",
      goal: typeof parsed.goal === "string" ? parsed.goal : base.goal,
      tasks: Array.isArray(parsed.tasks) ? parsed.tasks : [],
      files:
        parsed.files && typeof parsed.files === "object"
          ? { ...(parsed.files as Record<string, string>) }
          : {},
    };
  } catch {
    return emptyStore({ chatSessionId: chatSessionId || "dogfood" });
  }
}

async function saveStore(
  env: CodingOrchSessionEnv,
  store: CodingOrchStore
): Promise<void> {
  const key = codingOrchStateKey(store.chatSessionId);
  const payload = JSON.stringify(store);
  await env.KV.put(key, payload);
  if (key !== CODING_ORCH_STATE_KEY) {
    await env.KV.put(CODING_ORCH_STATE_KEY, payload);
  }
}

function pathAllowed(path: string): boolean {
  const p = path.replace(/^\/+/, "");
  if (p.includes("..") || p.startsWith(".agent/") || p.includes("\\")) {
    return false;
  }
  return ALLOWED_PATH_PREFIXES.some(
    prefix => p === prefix || p.startsWith(prefix)
  );
}

function applyEdits(
  store: CodingOrchStore,
  edits: unknown
): { fileWrites: CodingOrchFileWrite[] } | { error: Response } {
  if (!Array.isArray(edits) || edits.length === 0) {
    return { error: err("act_rejected", "result.edits 必填") };
  }
  const fileWrites: CodingOrchFileWrite[] = [];
  for (const raw of edits) {
    if (!raw || typeof raw !== "object") {
      return { error: err("act_rejected", "無效 edit") };
    }
    const edit = raw as Record<string, unknown>;
    const path = String(edit.path || "").replace(/^\/+/, "");
    if (!pathAllowed(path)) {
      return { error: err("edit_path_forbidden", `路徑不允許：${path}`) };
    }
    const kind = String(edit.kind || "");
    if (kind === "write") {
      const content = String(edit.content ?? "");
      if (content.length > MAX_DIFF_CHARS) {
        return { error: err("edit_too_large", "write 內容過大") };
      }
      store.files[path] = content;
      fileWrites.push({ path, content });
      continue;
    }
    if (kind === "patch") {
      const unifiedDiff = String(edit.unifiedDiff || "");
      if (!unifiedDiff || unifiedDiff.length > MAX_DIFF_CHARS) {
        return {
          error: err(
            unifiedDiff ? "edit_too_large" : "act_rejected",
            unifiedDiff ? "diff 過大" : "需要 unifiedDiff"
          ),
        };
      }
      const before = store.files[path] ?? "";
      try {
        const content = applyUnifiedDiff(before, unifiedDiff);
        store.files[path] = content;
        fileWrites.push({ path, content });
      } catch (e) {
        if (e instanceof UnifiedDiffError) {
          return { error: err(e.code, e.message) };
        }
        return { error: err("act_rejected", String(e)) };
      }
      continue;
    }
    if (kind === "note") continue;
    return { error: err("act_rejected", `不支援 edit.kind：${kind}`) };
  }
  return { fileWrites };
}

function publicState(store: CodingOrchStore, role?: string) {
  const tasks =
    role === "worker"
      ? store.tasks.map(t =>
          t.status === "assigned" ||
          t.status === "in_progress" ||
          t.status === "done" ||
          t.status === "failed"
            ? t
            : {
                taskId: t.taskId,
                title: t.title,
                status: t.status,
                assigneeSeatId: t.assigneeSeatId,
              }
        )
      : store.tasks;
  return {
    protocolId: CODING_ORCH_PROTOCOL_ID,
    apiVersion: CODING_ORCH_PROTOCOL_API_VERSION,
    joinPolicy: CODING_ORCH_JOIN_POLICY,
    chatSessionId: store.chatSessionId,
    targetSandboxId: store.targetSandboxId,
    sessionId: store.sessionId,
    channelName: store.channelName,
    revision: store.revision,
    status: store.status,
    goal: store.goal,
    tasks,
    files: store.files,
  };
}

/** Seed demo task + assigned event (Host UI / test helper). */
export function buildAssignTaskEvents(
  store: CodingOrchStore,
  assigneeSeatId: string
): unknown[] {
  const taskId = store.tasks[0]?.taskId || "t1";
  let task = store.tasks.find(t => t.taskId === taskId);
  if (!task) {
    task = {
      taskId: "t1",
      title: "Fix off-by-one",
      brief: `In ${CODING_ORCH_DEMO_PATH}, change add() to return a + b (remove + 1).`,
      status: "assigned",
      assigneeSeatId,
    };
    store.tasks = [task];
  } else {
    task.status = "assigned";
    task.assigneeSeatId = assigneeSeatId;
  }
  store.status = "running";
  store.revision += 1;
  return [
    {
      type: "task.assigned",
      taskId: task.taskId,
      brief: task.brief,
      assigneeSeatId,
      input: {
        path: CODING_ORCH_DEMO_PATH,
        content: store.files[CODING_ORCH_DEMO_PATH],
      },
      revision: store.revision,
    },
  ];
}

/** Workers-shaped fetch for coding-orchestration Host SAM. */
export async function codingOrchestrationFetch(
  request: Request,
  env: CodingOrchSessionEnv
): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, "") || "/";

  if (path.endsWith("/api/session/meta") && request.method === "GET") {
    return json({
      protocolId: CODING_ORCH_PROTOCOL_ID,
      apiVersion: CODING_ORCH_PROTOCOL_API_VERSION,
      roles: [...CODING_ORCH_ROLES],
      roleLimits: { ...CODING_ORCH_ROLE_LIMITS },
      joinPolicy: CODING_ORCH_JOIN_POLICY,
      capabilities: [...CODING_ORCH_CAPABILITIES],
    });
  }

  if (path.endsWith("/api/session/open") && request.method === "POST") {
    const body = (await request.json().catch(() => ({}))) as {
      sessionId?: string;
      channelName?: string;
      chatSessionId?: string;
      targetSandboxId?: string;
      seedDemo?: boolean;
    };
    const chatSessionId =
      typeof body.chatSessionId === "string" && body.chatSessionId.trim()
        ? body.chatSessionId.trim()
        : "dogfood";
    const targetSandboxId =
      typeof body.targetSandboxId === "string" && body.targetSandboxId.trim()
        ? body.targetSandboxId.trim()
        : null;
    const seedDemo = body.seedDemo === true || !targetSandboxId;
    const store = emptyStore({
      chatSessionId,
      targetSandboxId,
      seedDemo,
    });
    store.sessionId = String(body.sessionId || "");
    store.channelName = String(body.channelName || "");
    store.status = "planning";
    if (seedDemo) {
      store.tasks = [
        {
          taskId: "t1",
          title: "Fix off-by-one",
          brief: `In ${CODING_ORCH_DEMO_PATH}, change add() to return a + b (remove + 1).`,
          status: "pending",
          assigneeSeatId: null,
        },
      ];
    }
    await saveStore(env, store);
    return json({
      ok: true,
      sessionId: store.sessionId,
      channelName: store.channelName,
      chatSessionId: store.chatSessionId,
      targetSandboxId: store.targetSandboxId,
    });
  }

  if (path.endsWith("/api/session/state") && request.method === "GET") {
    const chatHint = url.searchParams.get("chatSessionId");
    const store = await loadStore(env, chatHint);
    const role = url.searchParams.get("role") || undefined;
    return json(publicState(store, role));
  }

  if (path.endsWith("/api/session/assign") && request.method === "POST") {
    const store = await loadStore(env);
    if (!store.sessionId) {
      return err("session_inactive", "通道尚未開啟", 409);
    }
    const body = (await request.json().catch(() => null)) as {
      assigneeSeatId?: string;
      brief?: string;
      title?: string;
      path?: string;
      content?: string;
      taskId?: string;
      goal?: string;
    } | null;
    const assigneeSeatId = String(body?.assigneeSeatId || "").trim();
    if (!assigneeSeatId) {
      return err("act_rejected", "需要 assigneeSeatId");
    }
    const hasCustom =
      (typeof body?.brief === "string" && body.brief.trim()) ||
      (typeof body?.path === "string" && body.path.trim()) ||
      typeof body?.content === "string";
    let events: unknown[];
    if (hasCustom) {
      const taskId = String(body?.taskId || "t1").trim() || "t1";
      const pathHint = String(body?.path || CODING_ORCH_DEMO_PATH)
        .trim()
        .replace(/^\/+/, "");
      const content =
        typeof body?.content === "string"
          ? body.content
          : (store.files[pathHint] ?? "");
      if (content) store.files[pathHint] = content;
      const brief =
        typeof body?.brief === "string" && body.brief.trim()
          ? body.brief.trim()
          : `Edit ${pathHint}`;
      const title =
        typeof body?.title === "string" && body.title.trim()
          ? body.title.trim()
          : "Coding task";
      let task = store.tasks.find(t => t.taskId === taskId);
      if (!task) {
        task = {
          taskId,
          title,
          brief,
          status: "assigned",
          assigneeSeatId,
        };
        store.tasks = [...store.tasks.filter(t => t.taskId !== taskId), task];
      } else {
        task.status = "assigned";
        task.assigneeSeatId = assigneeSeatId;
        task.brief = brief;
        task.title = title;
      }
      if (typeof body?.goal === "string" && body.goal.trim()) {
        store.goal = body.goal.trim();
      }
      store.status = "running";
      store.revision += 1;
      events = [
        {
          type: "task.assigned",
          taskId: task.taskId,
          brief: task.brief,
          assigneeSeatId,
          input: { path: pathHint, content: store.files[pathHint] ?? content },
          revision: store.revision,
        },
      ];
    } else {
      events = buildAssignTaskEvents(store, assigneeSeatId);
    }
    await saveStore(env, store);
    return json({
      ok: true,
      events,
      state: publicState(store),
      seq: store.revision,
      targetSandboxId: store.targetSandboxId,
    });
  }

  if (path.endsWith("/api/session/act") && request.method === "POST") {
    const store = await loadStore(env);
    if (!store.sessionId) {
      return err("session_inactive", "通道尚未開啟", 409);
    }
    if (store.status !== "running" && store.status !== "planning") {
      return err("orchestration_not_running", "編排未在進行中", 409);
    }
    const body = (await request.json().catch(() => null)) as {
      role?: string;
      seatId?: string;
      payload?: Record<string, unknown>;
    } | null;
    if (!body || typeof body !== "object") {
      return err("act_rejected", "無效 body");
    }
    const role = String(body.role || "");
    if (role !== "worker") {
      return err("role_forbidden", "僅 worker 可送 task.* act");
    }
    const payload =
      body.payload && typeof body.payload === "object" ? body.payload : {};
    const type = String(payload.type || "");
    const taskId = String(payload.taskId || "");
    const task = store.tasks.find(t => t.taskId === taskId);
    if (!task) {
      return err("task_not_found", `未知 taskId：${taskId}`);
    }
    if (
      task.assigneeSeatId &&
      body.seatId &&
      task.assigneeSeatId !== body.seatId
    ) {
      return err("task_not_assigned", "此座位未擁有該任務");
    }

    if (type === "task.progress") {
      task.status = "in_progress";
      store.revision += 1;
      await saveStore(env, store);
      const event = {
        type: "task.progress",
        taskId,
        note: String(payload.note || ""),
        revision: store.revision,
      };
      return json({
        ok: true,
        events: [event],
        state: publicState(store),
        seq: store.revision,
      });
    }

    if (type === "task.failed") {
      task.status = "failed";
      task.error = {
        code: String(
          (payload.error as { code?: string } | undefined)?.code || "failed"
        ),
        message: String(
          (payload.error as { message?: string } | undefined)?.message ||
            "worker failed"
        ),
      };
      store.status = "failed";
      store.revision += 1;
      await saveStore(env, store);
      return json({
        ok: true,
        events: [
          {
            type: "task.failed",
            taskId,
            error: task.error,
            revision: store.revision,
          },
        ],
        state: publicState(store),
        seq: store.revision,
      });
    }

    if (type === "task.result") {
      if (task.status !== "assigned" && task.status !== "in_progress") {
        return err("task_invalid_state", `任務狀態為 ${task.status}`);
      }
      const result = payload.result;
      if (!result || typeof result !== "object") {
        return err("act_rejected", "需要 result");
      }
      const applied = applyEdits(store, (result as { edits?: unknown }).edits);
      if ("error" in applied) return applied.error;
      task.status = "done";
      task.result = result;
      store.status = "completed";
      store.revision += 1;
      await saveStore(env, store);
      return json({
        ok: true,
        events: [
          {
            type: "task.result",
            taskId,
            revision: store.revision,
          },
          {
            type: "orchestration.completed",
            summary: String(
              (result as { summary?: string }).summary || "task done"
            ),
          },
        ],
        state: publicState(store),
        seq: store.revision,
        fileWrites: applied.fileWrites,
        targetSandboxId: store.targetSandboxId,
      });
    }

    if (type === "task.clarify") {
      store.revision += 1;
      await saveStore(env, store);
      return json({
        ok: true,
        events: [
          {
            type: "task.clarify",
            taskId,
            question: String(payload.question || ""),
            revision: store.revision,
          },
        ],
        state: publicState(store),
        seq: store.revision,
      });
    }

    return err("act_rejected", `未知 act type：${type}`);
  }

  return err("not_found", "找不到路由", 404);
}
