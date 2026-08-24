import {
  listDeviceTokens,
  mintDeviceToken,
  revokeDeviceToken,
  touchDeviceTokenLastUsed,
} from "./boothDevices.js";
import {
  anchorSecretPlaintext,
  goPublicOrigin,
  OPERATOR_CAP_TTL_MS,
  operatorCapPlaintext,
  sha256Hex,
} from "./ids.js";
import { BoothAnchorDurableObject } from "./boothAnchorDo.js";
import {
  canMintOperatorCap,
  type BoothPresence,
} from "./boothAnchorState.js";

export { BoothAnchorDurableObject };

export type BoothRouteEnv = {
  STORE: KVNamespace;
  BOOTH_ANCHORS: DurableObjectNamespace;
  GO_PUBLIC_ORIGIN?: string;
};

type BoothRouteDeps = {
  json: (data: unknown, status?: number, headers?: HeadersInit) => Response;
  requireApiKey: (
    env: BoothRouteEnv,
    req: Request
  ) => Promise<
    | { ok: true; userId: string; role: "admin" | "user" }
    | { ok: false; res: Response }
  >;
  requireHubCredential: (
    env: BoothRouteEnv,
    req: Request
  ) => Promise<
    | {
        ok: true;
        userId: string;
        role: "admin" | "user";
        kind: "api_key" | "device_token";
      }
    | { ok: false; res: Response }
  >;
  requireAccessToken: (
    env: BoothRouteEnv,
    req: Request
  ) => Promise<
    | { ok: true; userId: string; role: "admin" | "user"; bearer: string }
    | { ok: false; res: Response }
  >;
  parseBearer: (req: Request) => string | null;
  inviteStub: (inviteId: string) => DurableObjectStub;
};

function boothStub(env: BoothRouteEnv, ownerUserId: string): DurableObjectStub {
  const id = env.BOOTH_ANCHORS.idFromName(ownerUserId);
  return env.BOOTH_ANCHORS.get(id);
}

async function ensureBoothStub(
  env: BoothRouteEnv,
  ownerUserId: string
): Promise<DurableObjectStub> {
  const stub = boothStub(env, ownerUserId);
  await stub.fetch("https://booth/init", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ownerUserId }),
  });
  return stub;
}

async function hashCap(cap: string): Promise<string> {
  return sha256Hex(cap);
}

async function putAnchorSecretMapping(
  store: KVNamespace,
  anchorSecretHash: string,
  userId: string
): Promise<void> {
  await store.put(`booth:anchor:secret:${anchorSecretHash}`, userId, {
    expirationTtl: 7 * 24 * 3600,
  });
  await store.put(`booth:anchor:active:${userId}`, anchorSecretHash, {
    expirationTtl: 7 * 24 * 3600,
  });
}

async function clearAnchorSecretMapping(
  store: KVNamespace,
  userId: string
): Promise<void> {
  const hash = await store.get(`booth:anchor:active:${userId}`);
  if (hash) await store.delete(`booth:anchor:secret:${hash}`);
  await store.delete(`booth:anchor:active:${userId}`);
}

async function lookupAnchorUserBySecret(
  store: KVNamespace,
  anchorSecret: string
): Promise<string | null> {
  const hash = await hashCap(anchorSecret);
  return store.get(`booth:anchor:secret:${hash}`);
}

async function putOperatorCap(
  store: KVNamespace,
  cap: string,
  payload: { userId: string; boothSessionId: string | null }
): Promise<void> {
  const key = `booth:opcap:${await hashCap(cap)}`;
  const ttlSec = Math.ceil(OPERATOR_CAP_TTL_MS / 1000);
  await store.put(key, JSON.stringify(payload), { expirationTtl: ttlSec });
}

async function lookupOperatorCap(
  store: KVNamespace,
  cap: string
): Promise<{ userId: string; boothSessionId: string | null } | null> {
  const key = `booth:opcap:${await hashCap(cap)}`;
  const raw = await store.get(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as { userId: string; boothSessionId: string | null };
  } catch {
    return null;
  }
}

export async function routeBooth(
  request: Request,
  env: BoothRouteEnv,
  url: URL,
  deps: BoothRouteDeps
): Promise<Response | null> {
  const { pathname } = url;
  const {
    json,
    requireApiKey,
    requireHubCredential,
    requireAccessToken,
    parseBearer,
    inviteStub,
  } = deps;

  if (request.method === "POST" && pathname === "/v1/booth/join/offer") {
    const joinCap = parseBearer(request);
    const body = (await request.json().catch(() => ({}))) as {
      inviteId?: string;
      offerWire?: string;
      offer?: string;
      waitMs?: number;
    };
    const offerWire = body.offerWire ?? body.offer;
    if (!joinCap || !body.inviteId?.trim() || !offerWire?.trim()) {
      return json({ error: "bad_request" }, 400);
    }
    const inviteId = body.inviteId.trim();
    const stub = inviteStub(inviteId);
    const validateRes = await stub.fetch("https://invite/validate-join", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ joinCap }),
    });
    if (!validateRes.ok) {
      const data = (await validateRes.json().catch(() => ({}))) as {
        error?: string;
      };
      return json({ error: data.error ?? "invalid_join_cap" }, validateRes.status);
    }
    const validated = (await validateRes.json()) as {
      ownerUserId?: string;
      joinId?: string;
      kind?: string;
    };
    if (validated.kind !== "invite.room") {
      return json({ error: "invalid_kind" }, 400);
    }
    if (!validated.ownerUserId || !validated.joinId) {
      return json({ error: "invalid_join_cap" }, 403);
    }
    const booth = boothStub(env, validated.ownerUserId);
    const joinRes = await booth.fetch("https://booth/join-offer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        inviteId,
        joinId: validated.joinId,
        offerWire: offerWire.trim(),
        waitMs: body.waitMs,
      }),
    });
    const joinData = (await joinRes.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    return json(joinData, joinRes.status);
  }

  if (request.method === "POST" && pathname === "/v1/booth/anchors") {
    const auth = await requireHubCredential(env, request);
    if (!auth.ok) return auth.res;
    const body = (await request.json().catch(() => ({}))) as {
      boothSessionId?: string;
      deviceLabel?: string;
      snapshot?: Record<string, unknown>;
      force?: boolean;
    };
    if (!body.boothSessionId?.trim()) {
      return json({ error: "bad_request" }, 400);
    }
    const anchorSecret = anchorSecretPlaintext();
    const anchorSecretHash = await hashCap(anchorSecret);
    const stub = await ensureBoothStub(env, auth.userId);
    const reg = await stub.fetch("https://booth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        boothSessionId: body.boothSessionId.trim(),
        anchorSecretHash,
        deviceLabel: body.deviceLabel,
        force: body.force === true,
      }),
    });
    const regData = (await reg.json().catch(() => ({}))) as {
      error?: string;
      boothSessionId?: string;
    };
    if (!reg.ok) {
      return json({ error: regData.error ?? "register_failed" }, reg.status);
    }
    await putAnchorSecretMapping(env.STORE, anchorSecretHash, auth.userId);
    const origin = new URL(request.url).origin;
    return json({
      boothSessionId: regData.boothSessionId ?? body.boothSessionId,
      anchorSecret,
      wsUrl: `${origin}/v1/booth/ws?role=engine`,
    });
  }

  if (request.method === "DELETE" && pathname === "/v1/booth/anchors/active") {
    let userId: string | null = null;
    const hubAuth = await requireHubCredential(env, request);
    if (hubAuth.ok) {
      userId = hubAuth.userId;
    } else {
      const atAuth = await requireAccessToken(env, request);
      if (!atAuth.ok) return atAuth.res;
      userId = atAuth.userId;
    }
    const stub = await ensureBoothStub(env, userId);
    const res = await stub.fetch("https://booth/revoke", { method: "POST" });
    if (!res.ok) return json({ error: "revoke_failed" }, res.status);
    await clearAnchorSecretMapping(env.STORE, userId);
    return json({ ok: true });
  }

  if (request.method === "POST" && pathname === "/v1/booth/devices") {
    const auth = await requireAccessToken(env, request);
    if (!auth.ok) return auth.res;
    const body = (await request.json().catch(() => ({}))) as {
      label?: string;
    };
    const { plaintext, record } = await mintDeviceToken(
      env.STORE,
      auth.userId,
      auth.role,
      body.label ?? ""
    );
    return json({
      id: record.id,
      deviceToken: plaintext,
      label: record.label,
      prefix: record.prefix,
      createdAt: record.createdAt,
      ownerUserId: auth.userId,
    });
  }

  if (request.method === "GET" && pathname === "/v1/booth/devices") {
    const auth = await requireAccessToken(env, request);
    if (!auth.ok) return auth.res;
    const devices = await listDeviceTokens(env.STORE, auth.userId);
    return json({ devices });
  }

  const deviceMatch = /^\/v1\/booth\/devices\/([^/]+)$/.exec(pathname);
  if (request.method === "DELETE" && deviceMatch) {
    const auth = await requireAccessToken(env, request);
    if (!auth.ok) return auth.res;
    const deviceId = decodeURIComponent(deviceMatch[1]!);
    const ok = await revokeDeviceToken(env.STORE, auth.userId, deviceId);
    if (!ok) return json({ error: "not_found" }, 404);
    return json({ ok: true });
  }

  if (request.method === "GET" && pathname === "/v1/booth/anchors/active") {
    let userId: string | null = null;
    const apiAuth = await requireApiKey(env, request);
    if (apiAuth.ok) {
      userId = apiAuth.userId;
    } else {
      const atAuth = await requireAccessToken(env, request);
      if (!atAuth.ok) return atAuth.res;
      userId = atAuth.userId;
    }
    const stub = boothStub(env, userId);
    const res = await stub.fetch("https://booth/status");
    const data = (await res.json()) as Record<string, unknown>;
    return json(data, res.status);
  }

  if (request.method === "POST" && pathname === "/v1/booth/operator-caps") {
    const bearer = parseBearer(request);
    const auth = bearer?.startsWith("pg_sk_")
      ? await requireApiKey(env, request)
      : await requireAccessToken(env, request);
    if (!auth.ok) return auth.res;
    const body = (await request.json().catch(() => ({}))) as {
      boothSessionId?: string;
    };
    const stub = boothStub(env, auth.userId);
    const statusRes = await stub.fetch("https://booth/status");
    const status = (await statusRes.json()) as {
      online?: boolean;
      presence?: BoothPresence;
      boothSessionId?: string;
    };
    if (
      !canMintOperatorCap({
        online: Boolean(status.online),
        presence: status.presence ?? "offline",
      })
    ) {
      if (status.presence === "degraded") {
        return json({ error: "anchor_degraded" }, 503);
      }
      return json({ error: "no_active_anchor" }, 404);
    }
    if (
      body.boothSessionId &&
      status.boothSessionId &&
      body.boothSessionId !== status.boothSessionId
    ) {
      return json({ error: "session_mismatch" }, 410);
    }
    const operatorCap = operatorCapPlaintext();
    const expiresAt = Date.now() + OPERATOR_CAP_TTL_MS;
    await putOperatorCap(env.STORE, operatorCap, {
      userId: auth.userId,
      boothSessionId: status.boothSessionId ?? null,
    });
    const goOrigin = goPublicOrigin(env);
    const remoteUrl = `${goOrigin}/room/remote?cap=${encodeURIComponent(operatorCap)}`;
    return json({ operatorCap, expiresAt, remoteUrl });
  }

  if (pathname === "/v1/booth/ws") {
    const upgrade = request.headers.get("Upgrade");
    if (!upgrade || upgrade.toLowerCase() !== "websocket") {
      return json({ error: "upgrade_required" }, 426);
    }
    const role = url.searchParams.get("role");
    const bearer =
      parseBearer(request) ??
      url.searchParams.get("cap") ??
      url.searchParams.get("anchor_secret");
    if (!bearer || (role !== "engine" && role !== "operator")) {
      return json({ error: "unauthorized" }, 401);
    }

    if (role === "engine") {
      if (!bearer.startsWith("pg_ba_")) {
        return json({ error: "unauthorized" }, 401);
      }
      const userId = await lookupAnchorUserBySecret(env.STORE, bearer);
      if (!userId) return json({ error: "unauthorized" }, 401);
      const stub = boothStub(env, userId);
      const wsUrl = new URL("https://booth/ws");
      wsUrl.searchParams.set("role", "engine");
      return stub.fetch(new Request(wsUrl.toString(), request));
    }

    if (role === "operator") {
      if (!bearer.startsWith("pg_op_")) {
        return json({ error: "unauthorized" }, 401);
      }
      const cap = await lookupOperatorCap(env.STORE, bearer);
      if (!cap) return json({ error: "unauthorized" }, 401);
      const stub = boothStub(env, cap.userId);
      const wsUrl = new URL("https://booth/ws");
      wsUrl.searchParams.set("role", "operator");
      return stub.fetch(new Request(wsUrl.toString(), request));
    }
  }

  return null;
}
