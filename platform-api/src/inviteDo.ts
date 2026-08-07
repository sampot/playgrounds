import { DurableObject } from "cloudflare:workers";
import {
  HANDSHAKE_WAIT_MS,
  INVITE_TTL_MS,
  joinCapPlaintext,
  randomId,
  sha256Hex,
} from "./ids.js";
import {
  createInviteRecord,
  enqueueOffer,
  getAnswer,
  inviteOpen,
  peekPending,
  putAnswer,
  registerJoin,
  revokeInvite,
  type InviteRecord,
} from "./inviteState.js";

type CreateBody = {
  inviteId: string;
  secret: string;
  shortId: string;
  ownerUserId: string;
  kind: string;
  intent: unknown;
  targetField: string;
  ttlMs?: number;
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function sleep(ms: number): Promise<void> {
  await new Promise(r => setTimeout(r, ms));
}

/** Invite mailbox + FIFO handshake queue (DEC-047 Phase 1). */
export class InviteDurableObject extends DurableObject {
  private async load(): Promise<InviteRecord | null> {
    const raw = await this.ctx.storage.get<string>("record");
    if (!raw) return null;
    return JSON.parse(raw) as InviteRecord;
  }

  private async save(rec: InviteRecord): Promise<void> {
    await this.ctx.storage.put("record", JSON.stringify(rec));
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    try {
      if (request.method === "POST" && path === "/create") {
        const body = (await request.json()) as CreateBody;
        const now = Date.now();
        const rec = createInviteRecord({
          ...body,
          now,
          ttlMs: body.ttlMs ?? INVITE_TTL_MS,
        });
        await this.save(rec);
        return json({
          ok: true,
          inviteId: rec.inviteId,
          expiresAt: rec.expiresAt,
        });
      }

      const rec = await this.load();
      if (!rec) return json({ error: "not_found" }, 404);

      if (request.method === "GET" && path === "/meta") {
        return json({
          inviteId: rec.inviteId,
          secret: rec.secret,
          shortId: rec.shortId,
          kind: rec.kind,
          intent: rec.intent,
          targetField: rec.targetField,
          expiresAt: rec.expiresAt,
          revoked: rec.revoked,
          open: inviteOpen(rec, Date.now()),
          ownerUserId: rec.ownerUserId,
        });
      }

      if (request.method === "POST" && path === "/joins") {
        const now = Date.now();
        if (!inviteOpen(rec, now)) {
          return json({ error: "invite_expired_or_revoked" }, 410);
        }
        const joinCap = joinCapPlaintext();
        const joinId = randomId(12);
        const hash = await sha256Hex(joinCap);
        const r = registerJoin(rec, hash, joinId, now);
        if (!r.ok) return json({ error: r.error }, r.status);
        await this.save(rec);
        return json({ join_cap: joinCap, join_id: joinId });
      }

      if (request.method === "POST" && path === "/validate-join") {
        const body = (await request.json()) as { joinCap: string };
        const hash = await sha256Hex(body.joinCap);
        const joinId = rec.joins[hash];
        if (!joinId) {
          return json({ error: "invalid_join_cap" }, 403);
        }
        if (!inviteOpen(rec, Date.now())) {
          return json({ error: "invite_expired_or_revoked" }, 410);
        }
        return json({
          ok: true,
          ownerUserId: rec.ownerUserId,
          joinId,
          inviteId: rec.inviteId,
        });
      }

      if (request.method === "POST" && path === "/signal/offer") {
        const body = (await request.json()) as {
          joinCap: string;
          offerWire: string;
          waitMs?: number;
        };
        const now = Date.now();
        const hash = await sha256Hex(body.joinCap);
        const enq = enqueueOffer(rec, hash, body.offerWire, now);
        if (!enq.ok) return json({ error: enq.error }, enq.status);
        await this.save(rec);

        const waitMs = Math.min(
          body.waitMs ?? HANDSHAKE_WAIT_MS,
          HANDSHAKE_WAIT_MS
        );
        const deadline = Date.now() + waitMs;
        while (Date.now() < deadline) {
          const fresh = await this.load();
          if (!fresh) return json({ error: "not_found" }, 404);
          const ans = getAnswer(fresh, enq.joinId);
          if (ans !== undefined) {
            return json({ answer: ans, join_id: enq.joinId });
          }
          await sleep(200);
        }
        return json(
          { error: "timeout", join_id: enq.joinId, position: enq.position },
          408
        );
      }

      if (request.method === "GET" && path === "/signal/pending") {
        const ownerUserId = url.searchParams.get("ownerUserId") || "";
        const waitMs = Math.min(
          Number(url.searchParams.get("waitMs") || HANDSHAKE_WAIT_MS),
          HANDSHAKE_WAIT_MS
        );
        const deadline = Date.now() + waitMs;
        while (Date.now() < deadline) {
          const fresh = await this.load();
          if (!fresh) return json({ error: "not_found" }, 404);
          const peek = peekPending(fresh, ownerUserId);
          if (peek.ok) {
            return json({
              join_id: peek.slot.joinId,
              offer: peek.slot.offerWire,
              createdAt: peek.slot.createdAt,
            });
          }
          if (!peek.empty) {
            return json({ error: peek.error }, peek.status);
          }
          await sleep(200);
        }
        return json({ error: "empty" }, 404);
      }

      if (request.method === "PUT" && path === "/signal/answer") {
        const body = (await request.json()) as {
          ownerUserId: string;
          answerWire: string;
        };
        const now = Date.now();
        const r = putAnswer(rec, body.ownerUserId, body.answerWire, now);
        if (!r.ok) return json({ error: r.error }, r.status);
        await this.save(rec);
        return json({ ok: true, join_id: r.joinId });
      }

      if (request.method === "DELETE" && path === "/") {
        const ownerUserId = url.searchParams.get("ownerUserId") || "";
        if (rec.ownerUserId !== ownerUserId) {
          return json({ error: "forbidden" }, 403);
        }
        revokeInvite(rec);
        await this.save(rec);
        return json({ ok: true });
      }

      return json({ error: "not_found" }, 404);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return json({ error: "internal", message: msg }, 500);
    }
  }
}
