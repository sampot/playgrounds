/**
 * Cross-tab relay: follower canvas /api → Leader functions.js (DEC-031).
 * BroadcastChannel request/response; epoch-fenced; Leader-only execute.
 */

import type { SerializedRequest, SerializedResponse } from "./canvasSwProtocol";

export const FUNCTIONS_API_CHANNEL = "playgrounds-agent-functions-api";
export const FUNCTIONS_API_FORWARD = "playgrounds-functions-api-forward";
export const FUNCTIONS_API_RESULT = "playgrounds-functions-api-result";

export type FunctionsApiRelayErrorCode =
  "no_leader" | "epoch_mismatch" | "not_leader" | "timeout" | "functions_error";

export interface FunctionsApiForwardMessage {
  type: typeof FUNCTIONS_API_FORWARD;
  requestId: string;
  fromPeerId: string;
  leaderEpoch: number;
  sandboxId: string;
  request: SerializedRequest;
}

export interface FunctionsApiResultMessage {
  type: typeof FUNCTIONS_API_RESULT;
  requestId: string;
  fromPeerId: string;
  leaderPeerId: string;
  leaderEpoch: number;
  response?: SerializedResponse;
  error?: { code: FunctionsApiRelayErrorCode; message?: string };
}

export type FunctionsApiRelayStatus = {
  epoch: number;
  canDrain: boolean;
  isLeader: boolean;
};

export type FunctionsApiExecute = (
  msg: FunctionsApiForwardMessage
) => Promise<
  | { response: SerializedResponse }
  | { error: { code: FunctionsApiRelayErrorCode; message?: string } }
>;

type BroadcastChannelFactory = (name: string) => BroadcastChannel;

let channelFactory: BroadcastChannelFactory = name =>
  new BroadcastChannel(name);

/** Test hook. */
export function setFunctionsApiChannelFactory(
  factory: BroadcastChannelFactory | null
): void {
  channelFactory = factory ?? (name => new BroadcastChannel(name));
}

function isForward(data: unknown): data is FunctionsApiForwardMessage {
  if (!data || typeof data !== "object") return false;
  const o = data as Record<string, unknown>;
  return (
    o.type === FUNCTIONS_API_FORWARD &&
    typeof o.requestId === "string" &&
    typeof o.fromPeerId === "string" &&
    typeof o.sandboxId === "string" &&
    typeof o.leaderEpoch === "number" &&
    o.request != null &&
    typeof o.request === "object"
  );
}

function isResult(data: unknown): data is FunctionsApiResultMessage {
  if (!data || typeof data !== "object") return false;
  const o = data as Record<string, unknown>;
  return (
    o.type === FUNCTIONS_API_RESULT &&
    typeof o.requestId === "string" &&
    typeof o.fromPeerId === "string"
  );
}

export class FunctionsApiRelay {
  private readonly peerId: string;
  private readonly getStatus: () => FunctionsApiRelayStatus;
  private readonly execute: FunctionsApiExecute;
  private readonly timeoutMs: number;
  private channel: BroadcastChannel | null = null;
  private pending = new Map<
    string,
    {
      resolve: (msg: FunctionsApiResultMessage) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();

  constructor(opts: {
    peerId: string;
    getStatus: () => FunctionsApiRelayStatus;
    execute: FunctionsApiExecute;
    timeoutMs?: number;
  }) {
    this.peerId = opts.peerId;
    this.getStatus = opts.getStatus;
    this.execute = opts.execute;
    this.timeoutMs = opts.timeoutMs ?? 25_000;
  }

  start(): void {
    if (this.channel) return;
    if (
      typeof BroadcastChannel === "undefined" &&
      channelFactory === undefined
    ) {
      return;
    }
    try {
      this.channel = channelFactory(FUNCTIONS_API_CHANNEL);
    } catch {
      this.channel = null;
      return;
    }
    this.channel.onmessage = ev => {
      void this.onMessage(ev.data);
    };
  }

  stop(): void {
    for (const [requestId, p] of this.pending) {
      clearTimeout(p.timer);
      p.resolve({
        type: FUNCTIONS_API_RESULT,
        requestId,
        fromPeerId: this.peerId,
        leaderPeerId: "",
        leaderEpoch: 0,
        error: { code: "timeout", message: "relay stopped" },
      });
    }
    this.pending.clear();
    this.channel?.close();
    this.channel = null;
  }

  /** Follower: ask Leader to run functions.js and wait for SerializedResponse. */
  forward(input: {
    requestId: string;
    sandboxId: string;
    request: SerializedRequest;
    leaderEpoch: number;
  }): Promise<FunctionsApiResultMessage> {
    if (!this.channel) {
      return Promise.resolve({
        type: FUNCTIONS_API_RESULT,
        requestId: input.requestId,
        fromPeerId: this.peerId,
        leaderPeerId: "",
        leaderEpoch: input.leaderEpoch,
        error: { code: "no_leader", message: "BroadcastChannel unavailable" },
      });
    }

    const msg: FunctionsApiForwardMessage = {
      type: FUNCTIONS_API_FORWARD,
      requestId: input.requestId,
      fromPeerId: this.peerId,
      leaderEpoch: input.leaderEpoch,
      sandboxId: input.sandboxId,
      request: input.request,
    };

    return new Promise(resolve => {
      const timer = setTimeout(() => {
        this.pending.delete(input.requestId);
        resolve({
          type: FUNCTIONS_API_RESULT,
          requestId: input.requestId,
          fromPeerId: this.peerId,
          leaderPeerId: "",
          leaderEpoch: input.leaderEpoch,
          error: { code: "timeout", message: "Leader functions.js 逾時" },
        });
      }, this.timeoutMs);

      this.pending.set(input.requestId, { resolve, timer });
      this.channel!.postMessage(msg);
    });
  }

  private async onMessage(data: unknown): Promise<void> {
    if (isResult(data)) {
      if (data.fromPeerId !== this.peerId) return;
      const pending = this.pending.get(data.requestId);
      if (!pending) return;
      clearTimeout(pending.timer);
      this.pending.delete(data.requestId);
      pending.resolve(data);
      return;
    }

    if (!isForward(data)) return;
    if (data.fromPeerId === this.peerId) return;

    const status = this.getStatus();
    if (!status.isLeader || !status.canDrain) {
      // Only the Leader answers; silence avoids storming followers.
      return;
    }
    if (
      data.leaderEpoch !== 0 &&
      status.epoch !== 0 &&
      data.leaderEpoch !== status.epoch
    ) {
      this.replyResult({
        requestId: data.requestId,
        fromPeerId: data.fromPeerId,
        leaderPeerId: this.peerId,
        leaderEpoch: status.epoch,
        error: { code: "epoch_mismatch" },
      });
      return;
    }

    try {
      const out = await this.execute(data);
      if ("response" in out) {
        this.replyResult({
          requestId: data.requestId,
          fromPeerId: data.fromPeerId,
          leaderPeerId: this.peerId,
          leaderEpoch: status.epoch,
          response: out.response,
        });
      } else {
        this.replyResult({
          requestId: data.requestId,
          fromPeerId: data.fromPeerId,
          leaderPeerId: this.peerId,
          leaderEpoch: status.epoch,
          error: out.error,
        });
      }
    } catch (e) {
      this.replyResult({
        requestId: data.requestId,
        fromPeerId: data.fromPeerId,
        leaderPeerId: this.peerId,
        leaderEpoch: status.epoch,
        error: {
          code: "functions_error",
          message: e instanceof Error ? e.message : String(e),
        },
      });
    }
  }

  private replyResult(payload: Omit<FunctionsApiResultMessage, "type">): void {
    this.channel?.postMessage({
      type: FUNCTIONS_API_RESULT,
      ...payload,
    } satisfies FunctionsApiResultMessage);
  }
}
