/**
 * In-memory Avatar presence + projection sandbox links for the 化身 tab (DEC-045).
 */

import { identiconDataUrl } from "./rosterIdenticon";

export type RosterAvatarStub = {
  agentId: string;
  name: string;
  connectedAt: number;
  connectionState: string;
  identiconUrl: string;
  /** Local projection SAM sandbox id when Phase 2.5 spawn succeeded. */
  sandboxId?: string;
};

type Listener = () => void;

const avatars = new Map<string, RosterAvatarStub>();
const listeners = new Set<Listener>();

function emit(): void {
  for (const l of listeners) l();
}

export function subscribeRosterAvatars(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function listRosterAvatars(): RosterAvatarStub[] {
  return [...avatars.values()].sort((a, b) => a.connectedAt - b.connectedAt);
}

export function getRosterAvatar(agentId: string): RosterAvatarStub | undefined {
  return avatars.get(agentId);
}

export function upsertRosterAvatar(input: {
  agentId: string;
  name: string;
  connectionState?: string;
  sandboxId?: string | null;
}): RosterAvatarStub {
  const existing = avatars.get(input.agentId);
  const sandboxId =
    input.sandboxId === null
      ? undefined
      : (input.sandboxId ?? existing?.sandboxId);
  const stub: RosterAvatarStub = {
    agentId: input.agentId,
    name: input.name || input.agentId,
    connectedAt: existing?.connectedAt ?? Date.now(),
    connectionState:
      input.connectionState ?? existing?.connectionState ?? "connected",
    identiconUrl: existing?.identiconUrl ?? identiconDataUrl(input.agentId),
    ...(sandboxId ? { sandboxId } : {}),
  };
  avatars.set(input.agentId, stub);
  emit();
  return stub;
}

export function setRosterAvatarConnectionState(
  agentId: string,
  connectionState: string
): void {
  const existing = avatars.get(agentId);
  if (!existing) return;
  avatars.set(agentId, { ...existing, connectionState });
  emit();
}

export function setRosterAvatarSandboxId(
  agentId: string,
  sandboxId: string | undefined
): void {
  const existing = avatars.get(agentId);
  if (!existing) return;
  const next: RosterAvatarStub = { ...existing };
  if (sandboxId) next.sandboxId = sandboxId;
  else delete next.sandboxId;
  avatars.set(agentId, next);
  emit();
}

/** Remove stub; returns previous sandboxId if any (caller tears down). */
export function removeRosterAvatar(agentId: string): string | undefined {
  const prev = avatars.get(agentId);
  if (!avatars.delete(agentId)) return undefined;
  emit();
  return prev?.sandboxId;
}

/** Clear all stubs; returns sandbox ids that still need teardown. */
export function clearRosterAvatars(): string[] {
  const ids = [...avatars.values()]
    .map(a => a.sandboxId)
    .filter((id): id is string => Boolean(id));
  if (avatars.size === 0) return ids;
  avatars.clear();
  emit();
  return ids;
}
