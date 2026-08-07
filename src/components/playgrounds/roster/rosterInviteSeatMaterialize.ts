/**
 * Materialize a homePeer seat sandbox for a Roster session invite (DEC-045 Phase 3.3).
 * Resolve via catalog／installed (DEC-046); lazy-install from GitHub when needed.
 */

import { getCatalogEntry, type InviteCandidate } from "../../../data/samCatalog";
import { resolveInviteCandidatesWithInstalled } from "../catalogInviteResolve";
import {
  fetchGithubProject,
  parseGithubUrl,
  type GithubRef,
} from "../githubProject";
import type { FileMap, ProjectMeta } from "../projectTypes";
import { cloneProject, createProject } from "../sandboxAuthority";
import { BRAINSTORM_PROTOCOL_ID } from "../brainstormSessionApi";
import {
  createSessionParticipantStarterFiles,
  SESSION_PARTICIPANT_DEFAULT_ROLE,
} from "../sessionParticipantStarter";
import {
  sessionInviteToCatalogSpec,
  type SessionInvitePayload,
} from "./rosterSessionBridge";

export type RosterSeatMaterializeVia = "installed" | "catalog" | "builtin";

export type RosterSeatMaterializeResult = {
  sandboxId: string;
  name: string;
  via: RosterSeatMaterializeVia;
};

export class RosterInviteMaterializeError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "RosterInviteMaterializeError";
    this.code = code;
  }
}

export type RosterSeatMaterializeDeps = {
  resolve: (invite: SessionInvitePayload) => Promise<InviteCandidate[]>;
  cloneProject: (
    sourceId: string,
    name?: string,
    partialMeta?: Partial<ProjectMeta>
  ) => Promise<ProjectMeta>;
  createProject: (
    name: string,
    files: FileMap,
    partialMeta?: Partial<ProjectMeta>
  ) => Promise<ProjectMeta>;
  fetchGithub: (ref: GithubRef) => Promise<FileMap>;
  parseGithub: (input: string) => GithubRef | null;
  getCatalogSource: (catalogId: string) => string | undefined;
  /**
   * Prefer seating this already-open sandbox (e.g. compose-opened work canvas)
   * instead of cloning into a hidden participant iframe — required for human
   * playable invites (PG-INVITE-E2E-MVP).
   */
  preferReuseSandboxId?: string | null;
};

const defaultDeps: RosterSeatMaterializeDeps = {
  resolve: async invite =>
    resolveInviteCandidatesWithInstalled(sessionInviteToCatalogSpec(invite)),
  cloneProject,
  createProject,
  fetchGithub: fetchGithubProject,
  parseGithub: parseGithubUrl,
  getCatalogSource: id => getCatalogEntry(id)?.source,
};

function seatName(invite: SessionInvitePayload, title?: string): string {
  const role = invite.role.trim() || SESSION_PARTICIPANT_DEFAULT_ROLE;
  if (title?.trim()) return `${title.trim()} · 對弈`;
  return `對弈 · ${role}`;
}

function resolveGithubRef(
  candidate: InviteCandidate,
  deps: RosterSeatMaterializeDeps
): GithubRef | null {
  const raw =
    candidate.source?.trim() ||
    (candidate.catalogId
      ? deps.getCatalogSource(candidate.catalogId)?.trim()
      : undefined);
  if (!raw) return null;
  return deps.parseGithub(raw);
}

/**
 * Pick／install／builtin a sandbox for the invite. Does not send accept／reject.
 */
export async function materializeRosterInviteSeat(
  invite: SessionInvitePayload,
  deps: Partial<RosterSeatMaterializeDeps> = {}
): Promise<RosterSeatMaterializeResult> {
  const d: RosterSeatMaterializeDeps = { ...defaultDeps, ...deps };
  const candidates = await d.resolve(invite);
  const role = invite.role.trim() || SESSION_PARTICIPANT_DEFAULT_ROLE;

  const preferId = d.preferReuseSandboxId?.trim();
  if (preferId) {
    const hit = candidates.find(c => c.sandboxId?.trim() === preferId);
    if (hit?.sandboxId) {
      return {
        sandboxId: hit.sandboxId,
        name: seatName(invite, hit.title),
        via: "installed",
      };
    }
    // Compose-opened work canvas: seat the visible preview even if head probe
    // has not yet declared protocols (human-playable invite path).
    if (invite.source?.trim() || invite.catalogId?.trim()) {
      return {
        sandboxId: preferId,
        name: seatName(invite),
        via: "installed",
      };
    }
  }

  const installed = candidates.find(c => c.sandboxId?.trim());
  if (installed?.sandboxId) {
    const cloned = await d.cloneProject(
      installed.sandboxId,
      seatName(invite, installed.title),
      {
        agentManaged: true,
        inWorkingSet: false,
        cloneIntent: "session_seat",
      }
    );
    return {
      sandboxId: cloned.id,
      name: cloned.name,
      via: "installed",
    };
  }

  const catalogHit = candidates.find(
    c =>
      (c.origin === "catalog" || c.origin === "both") &&
      (c.source?.trim() || c.catalogId)
  );
  if (catalogHit) {
    const ref = resolveGithubRef(catalogHit, d);
    if (!ref) {
      throw new RosterInviteMaterializeError(
        "bad_source",
        "型錄候選缺少可用的 GitHub source"
      );
    }
    let files: FileMap;
    try {
      files = await d.fetchGithub(ref);
    } catch (e) {
      throw new RosterInviteMaterializeError(
        "install_failed",
        e instanceof Error
          ? `型錄安裝失敗：${e.message}`
          : `型錄安裝失敗：${String(e)}`
      );
    }
    const source =
      catalogHit.source?.trim() ||
      `${ref.owner}/${ref.repo}` ||
      "playgrounds-roster-catalog-install";
    const created = await d.createProject(
      seatName(invite, catalogHit.title),
      files,
      {
        source,
        agentManaged: true,
        inWorkingSet: false,
        cloneIntent: "session_seat",
      }
    );
    return {
      sandboxId: created.id,
      name: created.name,
      via: "catalog",
    };
  }

  if (invite.protocol.protocolId === BRAINSTORM_PROTOCOL_ID) {
    const created = await d.createProject(
      seatName(invite),
      createSessionParticipantStarterFiles(),
      {
        source: "playgrounds-roster-session-seat",
        agentManaged: true,
        inWorkingSet: false,
        cloneIntent: "session_seat",
      }
    );
    return {
      sandboxId: created.id,
      name: created.name,
      via: "builtin",
    };
  }

  throw new RosterInviteMaterializeError(
    "no_candidate",
    `找不到相容的型錄或本機 SAM（${invite.protocol.protocolId}@${invite.protocol.apiVersion}／${role}）`
  );
}
