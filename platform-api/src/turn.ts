/**
 * Cloudflare Realtime TURN → RTCIceServer[] for field peers.
 * @see https://developers.cloudflare.com/realtime/turn/generate-credentials/
 */

export type TurnEnv = {
  TURN_KEY_ID?: string;
  TURN_API_TOKEN?: string;
};

export type IceServerJson = {
  urls: string | string[];
  username?: string;
  credential?: string;
};

const TURN_TTL_SEC = 3600;

export function turnConfigured(env: TurnEnv): boolean {
  return Boolean(env.TURN_KEY_ID?.trim() && env.TURN_API_TOKEN?.trim());
}

/** Drop :53 URLs — often blocked in browsers. */
export function filterIceServers(servers: IceServerJson[]): IceServerJson[] {
  return servers
    .map((s) => {
      const urls = (Array.isArray(s.urls) ? s.urls : [s.urls]).filter(
        (u) => typeof u === "string" && !u.includes(":53")
      );
      if (urls.length === 0) return null;
      return {
        ...s,
        urls: urls.length === 1 ? urls[0]! : urls,
      };
    })
    .filter((s): s is IceServerJson => s !== null);
}

export async function generateCloudflareIceServers(
  env: TurnEnv,
  ttlSec = TURN_TTL_SEC
): Promise<
  | { ok: true; iceServers: IceServerJson[]; ttlSec: number }
  | { ok: false; error: string; status: number }
> {
  if (!turnConfigured(env)) {
    return { ok: false, error: "turn_unavailable", status: 503 };
  }
  const ttl = Math.min(172800, Math.max(60, Math.floor(ttlSec)));
  const keyId = env.TURN_KEY_ID!.trim();
  const token = env.TURN_API_TOKEN!.trim();
  const res = await fetch(
    `https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(keyId)}/credentials/generate-ice-servers`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ttl }),
    }
  );
  if (!res.ok) {
    return {
      ok: false,
      error: "turn_provider_error",
      status: 502,
    };
  }
  const data = (await res.json()) as { iceServers?: IceServerJson[] };
  if (!Array.isArray(data.iceServers) || data.iceServers.length === 0) {
    return { ok: false, error: "turn_provider_error", status: 502 };
  }
  return {
    ok: true,
    iceServers: filterIceServers(data.iceServers),
    ttlSec: ttl,
  };
}
