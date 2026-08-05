/**
 * In-memory Avatar presence stubs for the host Avatars tab (DEC-045).
 */

import { identiconDataUrl } from "./visitIdenticon";

export type VisitAvatarStub = {
  agentId: string;
  name: string;
  connectedAt: number;
  connectionState: string;
  identiconUrl: string;
};

type Listener = () => void;

const avatars = new Map<string, VisitAvatarStub>();
const listeners = new Set<Listener>();

function emit(): void {
  for (const l of listeners) l();
}

export function subscribeVisitAvatars(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function listVisitAvatars(): VisitAvatarStub[] {
  return [...avatars.values()].sort((a, b) => a.connectedAt - b.connectedAt);
}

export function upsertVisitAvatar(input: {
  agentId: string;
  name: string;
  connectionState?: string;
}): VisitAvatarStub {
  const existing = avatars.get(input.agentId);
  const stub: VisitAvatarStub = {
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

export function setVisitAvatarConnectionState(
  agentId: string,
  connectionState: string
): void {
  const existing = avatars.get(agentId);
  if (!existing) return;
  avatars.set(agentId, { ...existing, connectionState });
  emit();
}

export function removeVisitAvatar(agentId: string): void {
  if (!avatars.delete(agentId)) return;
  emit();
}

export function clearVisitAvatars(): void {
  if (avatars.size === 0) return;
  avatars.clear();
  emit();
}
