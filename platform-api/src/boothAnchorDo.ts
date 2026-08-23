import { DurableObject } from "cloudflare:workers";
import {
  BOOTH_ENGINE_GRACE_MS,
  clearEngineSocket,
  createEmptyAnchorRecord,
  ensureAnchorRecord,
  enginePresence,
  markEngineSocket,
  publicAnchorStatus,
  registerAnchorSession,
  revokeAnchor,
  type BoothAnchorRecord,
} from "./boothAnchorState.js";
import {
  createEmptyBoothJoinQueue,
  enqueueBoothJoin,
  storeBoothJoinAnswer,
  takeBoothJoinAnswer,
  type BoothJoinQueueState,
} from "./boothJoinState.js";
import { handleBoothAnchorWsFrame } from "./boothAnchorWs.js";
import { HANDSHAKE_WAIT_MS, randomId } from "./ids.js";

type RegisterBody = {
  boothSessionId: string;
  anchorSecretHash: string;
  deviceLabel?: string;
  force?: boolean;
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function sleep(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

function buildJoinOfferFrame(pending: {
  joinId: string;
  inviteId: string;
  offerWire: string;
}): string {
  return JSON.stringify({
    type: "booth.join.offer",
    v: 1,
    joinId: pending.joinId,
    inviteId: pending.inviteId,
    offerWire: pending.offerWire,
  });
}
function parseBoothMessage(text: string): Record<string, unknown> | null {
  try {
    const raw = JSON.parse(text) as unknown;
    if (!raw || typeof raw !== "object") return null;
    const o = raw as Record<string, unknown>;
    if (typeof o.type !== "string") return null;
    return o;
  } catch {
    return null;
  }
}

/**
 * BoothAnchor control plane (PG-GO-ROOM-ENGINE-PLAN §10).
 *
 * WebSocket hibernation: `acceptWebSocket` + `webSocketMessage` handlers so the
 * DO can evict from memory while Engine/Operator tabs stay connected. Tags on
 * `acceptWebSocket` survive hibernation; do not store WebSocket refs on `this`.
 */
export class BoothAnchorDurableObject extends DurableObject {
  constructor(ctx: DurableObjectState, env: object) {
    super(ctx, env);
    // Application-level keepalive without waking the DO from hibernation.
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
  }

  private async load(): Promise<BoothAnchorRecord> {
    const raw = await this.ctx.storage.get<string>("record");
    if (!raw) {
      const ownerUserId =
        (await this.ctx.storage.get<string>("ownerUserId")) ?? "unknown";
      return createEmptyAnchorRecord(ownerUserId);
    }
    return JSON.parse(raw) as BoothAnchorRecord;
  }

  private async save(rec: BoothAnchorRecord): Promise<void> {
    await this.ctx.storage.put("record", JSON.stringify(rec));
  }

  private async loadJoinQueue(): Promise<BoothJoinQueueState> {
    const raw = await this.ctx.storage.get<string>("joinQueue");
    if (!raw) return createEmptyBoothJoinQueue();
    return JSON.parse(raw) as BoothJoinQueueState;
  }

  private async saveJoinQueue(state: BoothJoinQueueState): Promise<void> {
    await this.ctx.storage.put("joinQueue", JSON.stringify(state));
  }

  private async forwardJoinOffer(pending: {
    joinId: string;
    inviteId: string;
    offerWire: string;
  }): Promise<void> {
    this.forwardToEngine(buildJoinOfferFrame(pending));
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    if (request.method === "POST" && path === "/init") {
      const body = (await request.json()) as { ownerUserId: string };
      await this.ctx.storage.put("ownerUserId", body.ownerUserId);
      const raw = await this.ctx.storage.get<string>("record");
      const rec = ensureAnchorRecord(
        raw ? (JSON.parse(raw) as BoothAnchorRecord) : null,
        body.ownerUserId
      );
      if (!raw) await this.save(rec);
      return json({ ok: true });
    }

    if (request.method === "POST" && path === "/register") {
      const body = (await request.json()) as RegisterBody;
      const rec = await this.load();
      const now = Date.now();
      const out = registerAnchorSession({
        rec,
        boothSessionId: body.boothSessionId,
        anchorSecretHash: body.anchorSecretHash,
        deviceLabel: body.deviceLabel,
        now,
        force: body.force,
      });
      if (!out.ok) {
        return json({ error: out.error }, out.status);
      }
      await this.save(rec);
      return json({
        ok: true,
        boothSessionId: rec.boothSessionId,
        replaced: out.replaced,
      });
    }

    if (request.method === "GET" && path === "/status") {
      const rec = await this.load();
      return json(publicAnchorStatus(rec, Date.now(), BOOTH_ENGINE_GRACE_MS));
    }

    if (request.method === "POST" && path === "/revoke") {
      const rec = await this.load();
      revokeAnchor(rec, Date.now());
      await this.save(rec);
      await this.saveJoinQueue(createEmptyBoothJoinQueue());
      return json({ ok: true });
    }

    if (request.method === "POST" && path === "/join-offer") {
      const body = (await request.json()) as {
        inviteId?: string;
        joinId?: string;
        offerWire?: string;
        waitMs?: number;
      };
      if (!body.inviteId?.trim() || !body.joinId?.trim() || !body.offerWire?.trim()) {
        return json({ error: "bad_request" }, 400);
      }
      const rec = await this.load();
      const now = Date.now();
      const presence = enginePresence(rec, now, BOOTH_ENGINE_GRACE_MS);
      if (presence === "offline" || !this.getEngineSocket()) {
        return json({ error: "anchor_offline" }, 503);
      }
      const joinQueue = await this.loadJoinQueue();
      const pending = {
        joinId: body.joinId.trim(),
        inviteId: body.inviteId.trim(),
        offerWire: body.offerWire.trim(),
        createdAt: now,
      };
      const toOffer = enqueueBoothJoin(joinQueue, pending);
      await this.saveJoinQueue(joinQueue);
      if (toOffer) await this.forwardJoinOffer(toOffer);

      const waitMs = Math.min(body.waitMs ?? HANDSHAKE_WAIT_MS, HANDSHAKE_WAIT_MS);
      const deadline = Date.now() + waitMs;
      while (Date.now() < deadline) {
        const fresh = await this.loadJoinQueue();
        const answer = takeBoothJoinAnswer(fresh, pending.joinId);
        if (answer !== undefined) {
          await this.saveJoinQueue(fresh);
          return json({ answer, join_id: pending.joinId });
        }
        await sleep(200);
      }
      return json({ error: "timeout", join_id: pending.joinId }, 408);
    }

    const upgrade = request.headers.get("Upgrade");
    if (upgrade?.toLowerCase() === "websocket" && path === "/ws") {
      const role = url.searchParams.get("role");
      const socketId = randomId(8);
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      this.ctx.acceptWebSocket(server, [
        role === "operator" ? "operator" : "engine",
        socketId,
      ]);
      if (role !== "operator") {
        const rec = await this.load();
        markEngineSocket(rec, socketId, Date.now());
        await this.save(rec);
        wsSend(server, {
          type: "anchor.registered",
          v: 1,
          boothSessionId: rec.boothSessionId,
          ts: Date.now(),
        });
      }
      return new Response(null, { status: 101, webSocket: client });
    }

    return json({ error: "not_found" }, 404);
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    const tags = this.ctx.getTags(ws);
    const role = tags[0];
    const socketId = tags[1] ?? "";
    const text = typeof message === "string" ? message : new TextDecoder().decode(message);
    const frame = parseBoothMessage(text);
    if (!frame) return;

    const rec = await this.load();
    const out = handleBoothAnchorWsFrame({
      role,
      socketId,
      frame,
      text,
      rec,
      now: Date.now(),
    });
    if (out.needsSave) await this.save(out.rec);

    for (const effect of out.effects) {
      if (effect.type === "pong") {
        wsSend(ws, { type: "anchor.pong", v: 1, ts: Date.now() });
      } else if (effect.type === "broadcastOperators") {
        this.broadcastOperators(effect.text, effect.exceptSocketId);
      } else if (effect.type === "forwardToEngine") {
        this.forwardToEngine(effect.text);
      } else if (effect.type === "boothJoinAnswer") {
        const joinQueue = await this.loadJoinQueue();
        const next = storeBoothJoinAnswer(
          joinQueue,
          effect.joinId,
          effect.answerWire
        );
        await this.saveJoinQueue(joinQueue);
        if (next) await this.forwardJoinOffer(next);
      }
    }
  }

  async webSocketClose(
    ws: WebSocket,
    _code: number,
    _reason: string,
    _wasClean: boolean
  ): Promise<void> {
    const tags = this.ctx.getTags(ws);
    const role = tags[0];
    const socketId = tags[1] ?? "";
    const rec = await this.load();

    if (role === "engine") {
      clearEngineSocket(rec, socketId, Date.now());
      await this.save(rec);
      this.broadcastOperators(
        JSON.stringify({
          type: "booth.event.engine.offline",
          v: 1,
          ts: Date.now(),
        })
      );
      return;
    }

    if (role === "operator") {
      this.forwardToEngine(
        JSON.stringify({
          type: "booth.event.operator.left",
          v: 1,
          ts: Date.now(),
        })
      );
    }
  }

  async webSocketError(ws: WebSocket, _error: unknown): Promise<void> {
    try {
      ws.close(1011, "websocket error");
    } catch {
      /* ignore */
    }
  }

  private getEngineSocket(): WebSocket | null {
    for (const ws of this.ctx.getWebSockets()) {
      const tags = this.ctx.getTags(ws);
      if (tags[0] === "engine") return ws;
    }
    return null;
  }

  private forwardToEngine(text: string): void {
    const engine = this.getEngineSocket();
    if (!engine) return;
    try {
      engine.send(text);
    } catch {
      /* ignore */
    }
  }

  private broadcastOperators(text: string, exceptSocketId?: string): void {
    for (const ws of this.ctx.getWebSockets()) {
      const tags = this.ctx.getTags(ws);
      if (tags[0] !== "operator") continue;
      if (exceptSocketId && tags[1] === exceptSocketId) continue;
      try {
        ws.send(text);
      } catch {
        /* ignore */
      }
    }
  }
}

function wsSend(ws: WebSocket, payload: Record<string, unknown>): void {
  ws.send(JSON.stringify(payload));
}
