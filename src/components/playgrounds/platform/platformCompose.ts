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
  if (kind === "signal.handshake") return true;
  if (kind !== "invite.compose") return false;
  if (!isInviteComposeIntent(intent)) return true;
  return intent.transport?.roster?.signal !== false;
}

/** TURN is paid／privacy-sensitive transport and therefore explicit opt-in. */
export function composeWantsRelay(intent: unknown): boolean {
  return (
    isInviteComposeIntent(intent) &&
    intent.transport?.roster?.relay === true
  );
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
