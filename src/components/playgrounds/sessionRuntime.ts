/**
 * Multi-agent session lifecycle and seat management (DEC-023).
 */

import {
  createSessionBroadcastChannel,
  publishSessionEvent,
  sessionChannelName,
} from "./sessionBroadcast";
import { SESSION_MAX_AGENT_SEATS } from "./sessionCapabilities";
import { SessionBridgeError } from "./sessionBridge";
import { fanoutSessionEventsToMailboxes } from "./sessionMailboxFanout";
import type {
  JoinSeatOptions,
  MultiAgentSession,
  OpenSessionOptions,
  SessionJoinPolicy,
  SessionJoinVia,
  SessionProtocolMeta,
  SessionSeat,
} from "./sessionTypes";
import { DEFAULT_SESSION_JOIN_POLICY } from "./sessionTypes";

const JOIN_POLICIES = new Set<SessionJoinPolicy>([
  "invite_only",
  "apply",
  "apply_with_approval",
  "invite_or_apply",
]);

function normalizeJoinPolicy(
  value: SessionJoinPolicy | undefined
): SessionJoinPolicy {
  if (value && JOIN_POLICIES.has(value)) return value;
  return DEFAULT_SESSION_JOIN_POLICY;
}

function assertJoinViaAllowed(
  policy: SessionJoinPolicy,
  via: SessionJoinVia
): void {
  if (policy === "invite_only" && via !== "invite") {
    throw new SessionBridgeError(
      "join_forbidden",
      "此 session 僅允許邀請入座（invite_only）"
    );
  }
  if (
    (policy === "apply" || policy === "apply_with_approval") &&
    via !== "apply"
  ) {
    throw new SessionBridgeError(
      "join_forbidden",
      `此 session 入座政策為 ${policy}，不接受邀請路徑`
    );
  }
  // invite_or_apply: both ok
  // apply_with_approval: MVP joins immediately (no pending seat state yet)
}

function newId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

export class SessionRuntime {
  private session: MultiAgentSession | null = null;
  private channel: BroadcastChannel | null = null;

  getSession(): MultiAgentSession | null {
    return this.session;
  }

  getChannelName(): string | null {
    return this.session?.channelName ?? null;
  }

  open(
    hostSandboxId: string,
    protocol: SessionProtocolMeta,
    options?: OpenSessionOptions
  ): MultiAgentSession {
    if (this.session && this.session.status !== "paused") {
      this.close();
    }
    const sessionId = newId("sess");
    const channelName = sessionChannelName(sessionId);
    this.channel?.close();
    this.channel = createSessionBroadcastChannel(sessionId);
    const target =
      typeof options?.targetSandboxId === "string" &&
      options.targetSandboxId.trim()
        ? options.targetSandboxId.trim()
        : null;
    this.session = {
      sessionId,
      hostSandboxId,
      targetSandboxId: target,
      status: "open",
      protocol: {
        protocolId: protocol.protocolId,
        apiVersion: protocol.apiVersion,
        roles: [...protocol.roles],
        roleLimits: protocol.roleLimits
          ? { ...protocol.roleLimits }
          : undefined,
        capabilities: protocol.capabilities
          ? [...protocol.capabilities]
          : undefined,
        joinPolicy: normalizeJoinPolicy(protocol.joinPolicy),
      },
      seats: [],
      seq: 0,
      channelName,
    };
    return this.session;
  }

  pause(): MultiAgentSession {
    const s = this.requireOpenOrPaused();
    s.status = "paused";
    return s;
  }

  resume(): MultiAgentSession {
    const s = this.requireOpenOrPaused();
    s.status = "open";
    return s;
  }

  close(): void {
    if (this.channel) {
      try {
        this.channel.close();
      } catch {
        /* ignore */
      }
      this.channel = null;
    }
    this.session = null;
  }

  joinHuman(role: string): SessionSeat {
    const s = this.requireOpen();
    this.assertRoleAllowed(role);
    this.assertRoleCapacity(role);
    const seat: SessionSeat = {
      seatId: newId("seat"),
      role,
      kind: "human",
      sandboxId: null,
      paused: false,
    };
    s.seats = [...s.seats, seat];
    return seat;
  }

  joinAgent(opts: JoinSeatOptions): SessionSeat {
    const s = this.requireOpen();
    const { sandboxId, role, protocolId, apiVersion } = opts;
    const via: SessionJoinVia = opts.via === "invite" ? "invite" : "apply";
    if (!sandboxId.trim()) {
      throw new SessionBridgeError("bad_path", "需要 sandboxId");
    }
    if (s.seats.some(x => x.sandboxId === sandboxId)) {
      throw new SessionBridgeError("forbidden", "此沙盒已入座");
    }
    assertJoinViaAllowed(
      s.protocol.joinPolicy ?? DEFAULT_SESSION_JOIN_POLICY,
      via
    );
    this.assertRoleAllowed(role);
    this.assertRoleCapacity(role);
    this.assertProtocolCompatible(protocolId, apiVersion);
    const agentCount = s.seats.filter(x => x.kind === "agent").length;
    if (agentCount >= SESSION_MAX_AGENT_SEATS) {
      throw new SessionBridgeError(
        "capacity_exceeded",
        `Agent 座位上限 ${SESSION_MAX_AGENT_SEATS}`
      );
    }
    const seat: SessionSeat = {
      seatId: newId("seat"),
      role,
      kind: "agent",
      sandboxId,
      protocolId,
      protocolApiVersion: apiVersion,
      paused: false,
      ...(opts.remote
        ? {
            remote: {
              peerAgentId: opts.remote.peerAgentId,
              inviteId: opts.remote.inviteId,
            },
          }
        : {}),
    };
    s.seats = [...s.seats, seat];
    return seat;
  }

  leaveSeat(seatId: string): void {
    const s = this.session;
    if (!s) return;
    s.seats = s.seats.filter(x => x.seatId !== seatId);
  }

  leaveBySandboxId(sandboxId: string): void {
    const s = this.session;
    if (!s) return;
    s.seats = s.seats.filter(x => x.sandboxId !== sandboxId);
  }

  setSeatPaused(seatId: string, paused: boolean): void {
    const s = this.requireOpenOrPaused();
    const seat = s.seats.find(x => x.seatId === seatId);
    if (!seat) {
      throw new SessionBridgeError("not_found", `找不到座位：${seatId}`);
    }
    seat.paused = paused;
  }

  listSeats(): SessionSeat[] {
    return this.session ? [...this.session.seats] : [];
  }

  getSeat(seatId: string): SessionSeat | null {
    return this.session?.seats.find(x => x.seatId === seatId) ?? null;
  }

  getSeatBySandboxId(sandboxId: string): SessionSeat | null {
    return this.session?.seats.find(x => x.sandboxId === sandboxId) ?? null;
  }

  /** Publish one or more events; advances seq. Returns last seq. */
  publishEvents(events: unknown[]): number {
    const s = this.requireOpenOrPaused();
    if (!this.channel) {
      this.channel = createSessionBroadcastChannel(s.sessionId);
    }
    const mailboxItems: {
      agentId: string;
      sandboxId: string;
      seq: number;
      event: unknown;
    }[] = [];
    for (const event of events) {
      s.seq += 1;
      publishSessionEvent(this.channel, {
        type: "session-event",
        sessionId: s.sessionId,
        seq: s.seq,
        event,
      });
      // Fan into each Agent seat mailbox (DEC-031); BC remains for UI.
      for (const seat of s.seats) {
        if (seat.kind !== "agent" || !seat.sandboxId) continue;
        mailboxItems.push({
          agentId: seat.sandboxId,
          sandboxId: seat.sandboxId,
          seq: s.seq,
          event,
        });
      }
    }
    void fanoutSessionEventsToMailboxes(mailboxItems);
    return s.seq;
  }

  assertCanAct(seatId: string): SessionSeat {
    const s = this.requireOpen();
    const seat = s.seats.find(x => x.seatId === seatId);
    if (!seat) {
      throw new SessionBridgeError("not_found", `找不到座位：${seatId}`);
    }
    if (seat.paused) {
      throw new SessionBridgeError("session_paused", "此座位已暫停");
    }
    return seat;
  }

  private requireOpen(): MultiAgentSession {
    const s = this.session;
    if (!s) {
      throw new SessionBridgeError("session_inactive", "目前沒有 session");
    }
    if (s.status === "paused") {
      throw new SessionBridgeError("session_paused", "session 已暫停");
    }
    return s;
  }

  private requireOpenOrPaused(): MultiAgentSession {
    const s = this.session;
    if (!s) {
      throw new SessionBridgeError("session_inactive", "目前沒有 session");
    }
    return s;
  }

  private assertRoleAllowed(role: string): void {
    const s = this.session!;
    if (!s.protocol.roles.includes(role)) {
      throw new SessionBridgeError("role_forbidden", `role 不允許：${role}`);
    }
  }

  private assertRoleCapacity(role: string): void {
    const s = this.session!;
    const limit = s.protocol.roleLimits?.[role];
    if (limit === undefined) return;
    const count = s.seats.filter(x => x.role === role).length;
    if (count >= limit) {
      throw new SessionBridgeError("seat_full", `role「${role}」座位已滿`);
    }
  }

  private assertProtocolCompatible(
    protocolId: string,
    apiVersion: string
  ): void {
    const s = this.session!;
    if (
      protocolId !== s.protocol.protocolId ||
      apiVersion !== s.protocol.apiVersion
    ) {
      throw new SessionBridgeError(
        "protocol_mismatch",
        `協定不相容：需要 ${s.protocol.protocolId}@${s.protocol.apiVersion}，得到 ${protocolId}@${apiVersion}`
      );
    }
  }
}
