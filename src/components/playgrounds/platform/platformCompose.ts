/**
 * invite.compose intent (DEC-047 Phase 4).
 */

export type InviteComposeIntentV1 = {
  version?: 1;
  sam?: {
    source: string;
    resolve?: "install_if_missing" | "require_installed";
    presentation?: "maximize_preview";
  };
  session?: {
    protocol: unknown;
    role?: string;
    consent?: "always_ask";
  };
  transport?: {
    roster?: { signal?: boolean; relay?: boolean };
  };
  ux?: {
    confirmOpen?: boolean;
  };
};

export const INVITE_ROOM_KIND = "invite.room" as const;

export type InviteRoomIntentV1 = {
  version?: 1;
  surface?: "room";
  consent?: "always_ask";
  transport?: {
    roster?: { signal?: boolean; relay?: boolean };
  };
};

export function isInviteRoomKind(kind: string): boolean {
  return kind === INVITE_ROOM_KIND;
}

export function isInviteRoomIntent(
  intent: unknown
): intent is InviteRoomIntentV1 {
  if (!intent || typeof intent !== "object") return false;
  return (intent as InviteRoomIntentV1).surface === "room";
}

export function buildInviteRoomIntent(): InviteRoomIntentV1 {
  return {
    version: 1,
    surface: "room",
    consent: "always_ask",
    transport: { roster: { signal: true } },
  };
}

export function isInviteComposeIntent(
  intent: unknown
): intent is InviteComposeIntentV1 {
  if (!intent || typeof intent !== "object") return false;
  const o = intent as InviteComposeIntentV1;
  if (o.sam && typeof o.sam.source !== "string") return false;
  if (o.session && o.session.protocol == null) return false;
  return true;
}

export function wantsRosterSignal(
  kind: string,
  intent: unknown
): boolean {
  if (kind === "signal.handshake" || isInviteRoomKind(kind)) return true;
  if (kind !== "invite.compose") return false;
  if (!isInviteComposeIntent(intent)) return true;
  return intent.transport?.roster?.signal !== false;
}

/** TURN is paid／privacy-sensitive transport and therefore explicit opt-in. */
export function composeWantsRelay(intent: unknown): boolean {
  if (isInviteRoomIntent(intent)) return false;
  return (
    isInviteComposeIntent(intent) &&
    intent.transport?.roster?.relay === true
  );
}

/**
 * When Host has `turn_prefer` on, stamp `transport.roster.relay: true` so
 * Guest／Host answer loop both take official TURN＋relay-only ICE.
 * No-op when `prefer` is false.
 */
export function stampComposeRelayPrefer(
  intent: unknown,
  prefer: boolean
): unknown {
  if (!prefer) return intent;
  if (intent == null || typeof intent !== "object") {
    return {
      version: 1,
      transport: { roster: { signal: true, relay: true } },
    } satisfies InviteComposeIntentV1;
  }
  const base = intent as InviteComposeIntentV1;
  const roster = base.transport?.roster ?? {};
  return {
    ...base,
    version: base.version ?? 1,
    transport: {
      ...base.transport,
      roster: {
        signal: roster.signal !== false,
        ...roster,
        relay: true,
      },
    },
  } satisfies InviteComposeIntentV1;
}

export function composeNeedsMaximize(intent: unknown): boolean {
  if (!isInviteComposeIntent(intent)) return false;
  return intent.sam?.presentation === "maximize_preview";
}

export function composeSamSource(intent: unknown): string | null {
  if (!isInviteComposeIntent(intent)) return null;
  const s = intent.sam?.source?.trim();
  return s || null;
}

export function composeSessionProtocol(intent: unknown): unknown | null {
  if (!isInviteComposeIntent(intent) || !intent.session) return null;
  return intent.session.protocol ?? null;
}
