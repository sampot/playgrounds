/**
 * Spawn / tear down local Avatar projection SAMs (DEC-045 Phase 2.5).
 */

import type { FileMap, ProjectMeta } from "../projectTypes";
import { createProject, deleteProject } from "../sandboxAuthority";
import { createAvatarProjectionStarterFiles } from "./avatarProjectionStarter";
import { identiconDataUrl } from "./rosterIdenticon";

/** Side-meta source marker for roster projections (not a catalog open). */
export const ROSTER_AVATAR_SOURCE = "playgrounds-roster-avatar";

export type SpawnRosterAvatarInput = {
  agentId: string;
  name: string;
  /** Defaults to identicon derived from agentId. */
  identiconUrl?: string;
};

export type SpawnRosterAvatarResult = {
  sandboxId: string;
  files: FileMap;
  meta: ProjectMeta;
};

export async function spawnRosterAvatarProjection(
  peer: SpawnRosterAvatarInput
): Promise<SpawnRosterAvatarResult> {
  const name = peer.name.trim() || peer.agentId;
  const identiconUrl = peer.identiconUrl ?? identiconDataUrl(peer.agentId);
  const files = createAvatarProjectionStarterFiles({
    peerAgentId: peer.agentId,
    name,
    identiconUrl,
  });
  const meta = await createProject(`化身 · ${name}`, files, {
    agentManaged: true,
    inWorkingSet: false,
    cloneIntent: "roster_avatar",
    source: ROSTER_AVATAR_SOURCE,
  });
  return { sandboxId: meta.id, files, meta };
}

export async function teardownRosterAvatarProjection(
  sandboxId: string
): Promise<void> {
  const id = sandboxId.trim();
  if (!id) return;
  try {
    await deleteProject(id);
  } catch {
    /* already gone or OPFS race */
  }
}
