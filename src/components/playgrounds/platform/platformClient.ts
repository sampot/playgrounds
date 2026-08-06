/**
 * Platform API HTTP client (DEC-047 Ticket path).
 */

export const DEFAULT_PLATFORM_API_ORIGIN = "https://api.samkuo.me";

/** SecretStore reserved name for field-held Platform API key (DEC-047／029). */
export const PLAYGROUNDS_API_KEY_SECRET = "PLAYGROUNDS_API_KEY";

export function platformApiOrigin(): string {
  const fromEnv =
    typeof import.meta !== "undefined" &&
    (import.meta as ImportMeta & { env?: Record<string, string> }).env
      ?.PUBLIC_PLATFORM_API_URL;
  if (typeof fromEnv === "string" && fromEnv.trim()) {
    return fromEnv.trim().replace(/\/$/, "");
  }
  return DEFAULT_PLATFORM_API_ORIGIN;
}

export type InviteMeta = {
  inviteId: string;
  secret: string;
  shortId: string;
  kind: string;
  intent: unknown;
  targetField: string;
  expiresAt: number;
  revoked: boolean;
  open: boolean;
  ownerUserId: string;
};

export type CreateInviteResult = {
  invite_id: string;
  kind: string;
  expires_at: number;
  short_url: string;
  deep_link: string;
  secret: string;
};

async function parseJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    const err =
      data && typeof data === "object" && "error" in data
        ? String((data as { error: unknown }).error)
        : `http_${res.status}`;
    const e = new Error(err);
    (e as Error & { status?: number; data?: unknown }).status = res.status;
    (e as Error & { data?: unknown }).data = data;
    throw e;
  }
  return data as T;
}

export async function previewInvite(
  secret: string,
  origin = platformApiOrigin()
): Promise<InviteMeta> {
  const res = await fetch(
    `${origin}/v1/invites/${encodeURIComponent(secret)}`
  );
  return parseJson<InviteMeta>(res);
}

export async function createJoin(
  secret: string,
  origin = platformApiOrigin()
): Promise<{ join_cap: string; join_id: string }> {
  const res = await fetch(
    `${origin}/v1/invites/${encodeURIComponent(secret)}/joins`,
    { method: "POST" }
  );
  return parseJson(res);
}

/**
 * Joiner: submit offer and wait for host answer (auto re-poll on 408).
 */
export async function postOfferAndWaitAnswer(opts: {
  inviteId: string;
  joinCap: string;
  offerWire: string;
  waitMs?: number;
  maxAttempts?: number;
  signal?: AbortSignal;
  origin?: string;
}): Promise<{ answer: string; join_id: string }> {
  const origin = opts.origin ?? platformApiOrigin();
  const maxAttempts = opts.maxAttempts ?? 12;
  let lastPos: number | undefined;
  for (let i = 0; i < maxAttempts; i++) {
    if (opts.signal?.aborted) throw new Error("aborted");
    const res = await fetch(
      `${origin}/v1/invites/${encodeURIComponent(opts.inviteId)}/signal/offer`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${opts.joinCap}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          offerWire: opts.offerWire,
          waitMs: opts.waitMs,
        }),
        signal: opts.signal,
      }
    );
    const text = await res.text();
    let data: {
      answer?: string;
      join_id?: string;
      error?: string;
      position?: number;
    } = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      /* ignore */
    }
    if (res.ok && data.answer) {
      return { answer: data.answer, join_id: data.join_id || "" };
    }
    if (res.status === 408) {
      lastPos = data.position;
      continue;
    }
    throw Object.assign(new Error(data.error || `http_${res.status}`), {
      status: res.status,
      data,
    });
  }
  throw Object.assign(new Error("timeout"), {
    status: 408,
    position: lastPos,
  });
}

export async function pollPendingOffer(opts: {
  inviteId: string;
  apiKey: string;
  waitMs?: number;
  signal?: AbortSignal;
  origin?: string;
}): Promise<{ join_id: string; offer: string; createdAt?: number } | null> {
  const origin = opts.origin ?? platformApiOrigin();
  const q = new URLSearchParams();
  if (opts.waitMs != null) q.set("waitMs", String(opts.waitMs));
  const res = await fetch(
    `${origin}/v1/invites/${encodeURIComponent(opts.inviteId)}/signal/pending?${q}`,
    {
      headers: { Authorization: `Bearer ${opts.apiKey}` },
      signal: opts.signal,
    }
  );
  if (res.status === 404) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    if (data.error === "empty") return null;
    throw Object.assign(new Error(data.error || "not_found"), {
      status: 404,
    });
  }
  return parseJson(res);
}

export async function putAnswer(opts: {
  inviteId: string;
  apiKey: string;
  answerWire: string;
  origin?: string;
}): Promise<{ ok: true; join_id: string }> {
  const origin = opts.origin ?? platformApiOrigin();
  const res = await fetch(
    `${origin}/v1/invites/${encodeURIComponent(opts.inviteId)}/signal/answer`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${opts.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ answerWire: opts.answerWire }),
    }
  );
  return parseJson(res);
}

export async function createPlatformInvite(opts: {
  apiKey: string;
  kind?: string;
  intent?: unknown;
  targetField?: string;
  ttlMs?: number;
  origin?: string;
}): Promise<CreateInviteResult> {
  const origin = opts.origin ?? platformApiOrigin();
  const res = await fetch(`${origin}/v1/invites`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${opts.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      kind: opts.kind,
      intent: opts.intent,
      targetField: opts.targetField,
      ttlMs: opts.ttlMs,
    }),
  });
  return parseJson(res);
}

export async function revokePlatformInvite(opts: {
  inviteId: string;
  apiKey: string;
  origin?: string;
}): Promise<void> {
  const origin = opts.origin ?? platformApiOrigin();
  const res = await fetch(
    `${origin}/v1/invites/${encodeURIComponent(opts.inviteId)}`,
    {
      method: "DELETE",
      headers: { Authorization: `Bearer ${opts.apiKey}` },
    }
  );
  await parseJson(res);
}
