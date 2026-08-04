/**
 * Needs attention ranking for Fleet Pulse (DEC-032).
 */

import { FLEET_ATTENTION_CAP, FLEET_MAILBOX_WARN_DEPTH } from "./constants.ts";
import type {
  FleetAgentNode,
  FleetAttentionItem,
  FleetAttentionReason,
} from "./types.ts";

const REASON_RANK: Record<FleetAttentionReason, number> = {
  poison: 0,
  mailbox_pressure: 1,
  orphan: 2,
  stale_session_seat: 3,
  stuck: 4,
  app_health: 2,
};

/**
 * Build attention list. hibernated alone is never a fault.
 * `stuck` requires caller to mark via ui or future time-series; not inferred here yet.
 */
export function buildAttention(
  nodes: readonly FleetAgentNode[],
  opts?: {
    activeSessionSeatIds?: ReadonlySet<string>;
    mailboxWarnDepth?: number;
    attentionCap?: number;
  }
): FleetAttentionItem[] {
  const warnDepth = opts?.mailboxWarnDepth ?? FLEET_MAILBOX_WARN_DEPTH;
  const cap = opts?.attentionCap ?? FLEET_ATTENTION_CAP;
  const activeSeats = opts?.activeSessionSeatIds;
  const items: FleetAttentionItem[] = [];

  for (const n of nodes) {
    if (n.poisonCount > 0) {
      items.push({
        agentId: n.agentId,
        reason: "poison",
        severity: "error",
        detail: `${n.poisonCount} 則毒訊息`,
      });
    }
    if (n.mailboxDepth >= warnDepth) {
      items.push({
        agentId: n.agentId,
        reason: "mailbox_pressure",
        severity: n.mailboxDepth >= warnDepth * 1.1 ? "error" : "warn",
        detail: `佇列深度 ${n.mailboxDepth}`,
      });
    }
    if (n.ui?.health === "error") {
      items.push({
        agentId: n.agentId,
        reason: "app_health",
        severity: "error",
        detail: n.ui.healthDetail ?? n.ui.roleLabel,
      });
    } else if (n.ui?.health === "warn") {
      items.push({
        agentId: n.agentId,
        reason: "app_health",
        severity: "warn",
        detail: n.ui.healthDetail ?? n.ui.roleLabel,
      });
    }
    if (
      n.cloneIntent === "session_seat" &&
      activeSeats &&
      !activeSeats.has(n.sandboxId)
    ) {
      items.push({
        agentId: n.agentId,
        reason: "stale_session_seat",
        severity: "warn",
        detail: "session 已結束的座位分身",
      });
    }
  }

  items.sort((a, b) => {
    const ra = REASON_RANK[a.reason] - REASON_RANK[b.reason];
    if (ra !== 0) return ra;
    if (a.severity !== b.severity) {
      return a.severity === "error" ? -1 : 1;
    }
    return a.agentId.localeCompare(b.agentId);
  });

  return items.slice(0, cap);
}

/** Aggregate status counts; hibernated counted separately (not as faults). */
export function countByStatus(
  nodes: readonly FleetAgentNode[]
): Record<FleetAgentNode["status"], number> {
  const counts = {
    registered: 0,
    running: 0,
    hibernated: 0,
    stopped: 0,
  };
  for (const n of nodes) {
    counts[n.status] += 1;
  }
  return counts;
}

export function sumPressure(
  nodes: readonly FleetAgentNode[],
  mailboxWarnDepth = FLEET_MAILBOX_WARN_DEPTH
): {
  mailboxDepthTotal: number;
  nearFullCount: number;
  poisonTotal: number;
} {
  let mailboxDepthTotal = 0;
  let nearFullCount = 0;
  let poisonTotal = 0;
  for (const n of nodes) {
    mailboxDepthTotal += n.mailboxDepth;
    poisonTotal += n.poisonCount;
    if (n.mailboxDepth >= mailboxWarnDepth) nearFullCount += 1;
  }
  return { mailboxDepthTotal, nearFullCount, poisonTotal };
}
