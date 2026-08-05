/**
 * In-memory Avatar presence stubs for the host Avatars tab (DEC-045).
 */

import { identiconDataUrl } from "./rosterIdenticon";

export type RosterAvatarStub = {
  agentId: string;
  name: string;
  connectedAt: number;
  connectionState: string;
  identiconUrl: string;
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

export function upsertRosterAvatar(input: {
  agentId: string;
  name: string;
  connectionState?: string;
}): RosterAvatarStub {
  const existing = avatars.get(input.agentId);
  const stub: RosterAvatarStub = {
    agentId: input.agentId,
    name: input.name || input.agentId,
    connectedAt: existing?.connectedAt ?? Date.now(),
    connectionState: input.connectionState ?? existing?.connectionState ?? "connected",
    identiconUrl: existing?.identiconUrl ?? identiconDataUrl(input.agentId),
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

export function removeRosterAvatar(agentId: string): void {
  if (!avatars.delete(agentId)) return;
  emit();
}

export function clearRosterAvatars(): void {
  if (avatars.size === 0) return;
  avatars.clear();
  emit();
}
