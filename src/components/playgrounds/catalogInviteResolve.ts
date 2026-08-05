/**
 * Probe installed SAMs’ index.html head for session protocols and merge with
 * catalog invite resolution (DEC-046 Phase 4). Query only — no install／join.
 */

import {
  resolveInviteCandidates,
  type InstalledSamProbe,
  type InviteCandidate,
  type SessionProtocolSpec,
} from "../../data/samCatalog";
import { parseSamHead } from "../../sam-runtime/index.ts";
import { listProjects, loadFile } from "./sandboxAuthority";
import { DEFAULT_ENTRY } from "./projectTypes";

/** Read `sam:protocol` decls from every local project that has index.html. */
export async function probeInstalledSamProtocols(): Promise<
  InstalledSamProbe[]
> {
  const metas = await listProjects();
  const out: InstalledSamProbe[] = [];
  for (const meta of metas) {
    const content = await loadFile(meta.id, DEFAULT_ENTRY);
    if (typeof content !== "string") continue;
    const head = parseSamHead(content);
    const protocols = head.sessionProtocols;
    if (!protocols?.length) continue;
    out.push({
      sandboxId: meta.id,
      name: meta.name,
      ...(meta.source ? { source: meta.source } : {}),
      protocols,
    });
  }
  return out;
}

/**
 * Catalog + local head probe for invite matching.
 * Prefer candidates with `sandboxId` (already installed); catalog-only need lazy install.
 */
export async function resolveInviteCandidatesWithInstalled(
  spec: SessionProtocolSpec
): Promise<InviteCandidate[]> {
  const installed = await probeInstalledSamProtocols();
  return resolveInviteCandidates(spec, { installed });
}
