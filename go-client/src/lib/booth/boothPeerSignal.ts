/**
 * Cross-tab signaling for embedded Booth Hub peer join (same origin).
 * Host `/room` registers; `/room/peer` posts offer via BroadcastChannel.
 */

export const BOOTH_PEER_SIGNAL_CHANNEL = "pg-booth-peer-signal-v1";

export type BoothPeerSignalOffer = {
  type: "peer.offer";
  requestId: string;
  hubSessionId: string;
  peerCap: string;
  offerWire: string;
  label?: string;
};

export type BoothPeerSignalAnswer = {
  type: "peer.answer";
  requestId: string;
  ok: boolean;
  answerWire?: string;
  peerId?: string;
  error?: string;
};

export type BoothPeerSignalMessage = BoothPeerSignalOffer | BoothPeerSignalAnswer;

export function registerEmbeddedPeerSignalHost(opts: {
  getHubSessionId: () => string;
  validatePeerCap: (cap: string) => boolean;
  acceptPeerOffer: (
    offerWire: string,
    label?: string
  ) => Promise<{ answerWire: string; peerId: string }>;
}): () => void {
  if (typeof BroadcastChannel === "undefined") return () => {};

  const channel = new BroadcastChannel(BOOTH_PEER_SIGNAL_CHANNEL);

  channel.onmessage = (ev: MessageEvent<BoothPeerSignalMessage>) => {
    const msg = ev.data;
    if (!msg || msg.type !== "peer.offer") return;
    if (msg.hubSessionId !== opts.getHubSessionId()) return;
    if (!opts.validatePeerCap(msg.peerCap)) {
      const answer: BoothPeerSignalAnswer = {
        type: "peer.answer",
        requestId: msg.requestId,
        ok: false,
        error: "peer_gone",
      };
      channel.postMessage(answer);
      return;
    }
    void (async () => {
      try {
        const result = await opts.acceptPeerOffer(msg.offerWire, msg.label);
        const answer: BoothPeerSignalAnswer = {
          type: "peer.answer",
          requestId: msg.requestId,
          ok: true,
          answerWire: result.answerWire,
          peerId: result.peerId,
        };
        channel.postMessage(answer);
      } catch (e) {
        const answer: BoothPeerSignalAnswer = {
          type: "peer.answer",
          requestId: msg.requestId,
          ok: false,
          error: e instanceof Error ? e.message : "peer_join_failed",
        };
        channel.postMessage(answer);
      }
    })();
  };

  return () => {
    channel.close();
  };
}

export async function joinEmbeddedHubViaSignal(opts: {
  peerCap: string;
  hubSessionId: string;
  offerWire: string;
  label?: string;
  timeoutMs?: number;
}): Promise<{ answerWire: string; peerId: string }> {
  if (typeof BroadcastChannel === "undefined") {
    throw new Error("embedded_signal_unavailable");
  }

  const channel = new BroadcastChannel(BOOTH_PEER_SIGNAL_CHANNEL);
  const requestId = crypto.randomUUID();
  const timeoutMs = opts.timeoutMs ?? 8_000;

  try {
    const answer = await new Promise<BoothPeerSignalAnswer>((resolve, reject) => {
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error("embedded_signal_timeout"));
      }, timeoutMs);

      const onMessage = (ev: MessageEvent<BoothPeerSignalMessage>) => {
        const msg = ev.data;
        if (!msg || msg.type !== "peer.answer" || msg.requestId !== requestId) {
          return;
        }
        cleanup();
        resolve(msg);
      };

      const cleanup = () => {
        clearTimeout(timer);
        channel.removeEventListener("message", onMessage);
      };

      channel.addEventListener("message", onMessage);
      const offer: BoothPeerSignalOffer = {
        type: "peer.offer",
        requestId,
        hubSessionId: opts.hubSessionId,
        peerCap: opts.peerCap.trim(),
        offerWire: opts.offerWire,
        label: opts.label,
      };
      channel.postMessage(offer);
    });

    if (!answer.ok || !answer.answerWire?.trim()) {
      throw new Error(answer.error ?? "embedded_signal_rejected");
    }
    return {
      answerWire: answer.answerWire,
      peerId: answer.peerId?.trim() || "",
    };
  } finally {
    channel.close();
  }
}
