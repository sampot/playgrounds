import type {
  AnchorSignalFrame,
  BoothEnvelope,
  BoothStateSnapshot,
} from "@pg/roster/boothChannel";
import { isAnchorSignalFrame, isBoothJoinOfferFrame } from "@pg/roster/boothChannel";
import { createBoothEngineOperatorRtc } from "./boothOperatorRtc";
import { platformApiOrigin } from "./platformClient";

export type RegisterBoothAnchorResult = {
  boothSessionId: string;
  anchorSecret: string;
  wsUrl: string;
};

export async function registerBoothAnchor(input: {
  apiKey: string;
  boothSessionId: string;
  deviceLabel?: string;
  force?: boolean;
}): Promise<RegisterBoothAnchorResult> {
  const origin = platformApiOrigin();
  const res = await fetch(`${origin}/v1/booth/anchors`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      boothSessionId: input.boothSessionId,
      deviceLabel: input.deviceLabel,
      force: input.force === true,
    }),
  });
  const data = (await res.json().catch(() => ({}))) as RegisterBoothAnchorResult & {
    error?: string;
  };
  if (!res.ok) {
    throw new Error(data.error ?? `anchor_register_${res.status}`);
  }
  if (!data.anchorSecret || !data.wsUrl) {
    throw new Error("anchor_register_invalid");
  }
  return data;
}

export async function registerBoothAnchorWithForceRetry(input: {
  apiKey: string;
  boothSessionId: string;
  deviceLabel?: string;
}): Promise<RegisterBoothAnchorResult> {
  try {
    return await registerBoothAnchor(input);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg !== "anchor_session_active") throw e;
    return registerBoothAnchor({ ...input, force: true });
  }
}

export async function revokeBoothAnchor(apiKey: string): Promise<void> {
  const origin = platformApiOrigin();
  const res = await fetch(`${origin}/v1/booth/anchors/active`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok && res.status !== 404) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? `anchor_revoke_${res.status}`);
  }
}

export type BoothAnchorActiveStatus = {
  online: boolean;
  presence?: string;
  boothSessionId?: string;
  snapshot?: BoothStateSnapshot;
  deviceLabel?: string;
  guestCount?: number;
};

export async function fetchBoothAnchorActive(
  bearer: string
): Promise<BoothAnchorActiveStatus> {
  const origin = platformApiOrigin();
  const res = await fetch(`${origin}/v1/booth/anchors/active`, {
    headers: { Authorization: `Bearer ${bearer}` },
    credentials: "include",
  });
  const data = (await res.json().catch(() => ({}))) as BoothAnchorActiveStatus & {
    error?: string;
  };
  if (!res.ok) {
    throw new Error(data.error ?? `anchor_status_${res.status}`);
  }
  return data;
}

export type OperatorCapResult = {
  operatorCap: string;
  expiresAt: number;
  remoteUrl: string;
};

export async function mintOperatorCap(
  accessToken: string,
  boothSessionId?: string
): Promise<OperatorCapResult> {
  const origin = platformApiOrigin();
  const res = await fetch(`${origin}/v1/booth/operator-caps`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    credentials: "include",
    body: JSON.stringify(boothSessionId ? { boothSessionId } : {}),
  });
  const data = (await res.json().catch(() => ({}))) as OperatorCapResult & {
    error?: string;
  };
  if (!res.ok) {
    throw new Error(data.error ?? `operator_cap_${res.status}`);
  }
  return data;
}

export type BoothAnchorHostHandlers = {
  getSnapshot: () => BoothStateSnapshot;
  localHostClaimsDirector: () => boolean;
  remoteOperatorEnabled?: () => boolean;
  onOperatorIntent: (frame: BoothEnvelope) => Promise<void>;
  onGuestJoinOffer: (input: {
    joinId: string;
    inviteId: string;
    offerWire: string;
  }) => Promise<string>;
  /** TV program stream for Operator WebRTC preview (§10.6). */
  getTvProgramStream?: () => MediaStream | null;
};

export type BoothAnchorHost = {
  start(): Promise<void>;
  stop(): Promise<void>;
  publishSnapshot(): void;
  refreshProgram(): void;
};

const KEEPALIVE_MS = 45_000;
const OPERATOR_HELLO_WAIT_MS = 20_000;

function wsUrlWithSecret(base: string, anchorSecret: string): string {
  const url = new URL(base, platformApiOrigin());
  url.searchParams.set("role", "engine");
  url.searchParams.set("anchor_secret", anchorSecret);
  const raw = url.toString();
  return raw.replace(/^https:/, "wss:").replace(/^http:/, "ws:");
}

export function createBoothAnchorHost(
  handlers: BoothAnchorHostHandlers,
  opts: {
    apiKey: string;
    boothSessionId: string;
    deviceLabel?: string;
  }
): BoothAnchorHost {
  let ws: WebSocket | null = null;
  let keepaliveTimer: ReturnType<typeof setInterval> | null = null;
  let operatorDirectorShellId: string | null = null;
  let operatorConnections = 0;
  let stopped = false;
  let engineRtc: ReturnType<typeof createBoothEngineOperatorRtc> | null = null;

  function ensureEngineRtc(): ReturnType<typeof createBoothEngineOperatorRtc> | null {
    if (!handlers.getTvProgramStream) return null;
    engineRtc ??= createBoothEngineOperatorRtc({
      sendSignal: (frame) => send(frame),
      getTvStream: handlers.getTvProgramStream!,
    });
    return engineRtc;
  }

  function send(frame: Record<string, unknown>): void {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ v: 1, ...frame }));
  }

  async function handleInboundFrame(frame: BoothEnvelope): Promise<void> {
    if (isBoothJoinOfferFrame(frame)) {
      try {
        const answerWire = await handlers.onGuestJoinOffer({
          joinId: frame.joinId,
          inviteId: frame.inviteId,
          offerWire: frame.offerWire,
        });
        send({
          type: "booth.join.answer",
          joinId: frame.joinId,
          answerWire,
        });
      } catch {
        send({
          type: "booth.join.answer",
          joinId: frame.joinId,
          answerWire: "",
          error: "join_failed",
        });
      }
      return;
    }
    await handleOperatorFrame(frame);
  }

  async function handleOperatorFrame(frame: BoothEnvelope): Promise<void> {
    if (frame.type === "booth.event.operator.left") {
      operatorConnections = Math.max(0, operatorConnections - 1);
      if (operatorConnections <= 0) {
        engineRtc?.stop();
        engineRtc = null;
      }
      return;
    }

    if (frame.type === "booth.hello") {
      if (handlers.remoteOperatorEnabled && !handlers.remoteOperatorEnabled()) {
        send({ type: "booth.event.remote.disabled", v: 1 });
        return;
      }
      operatorConnections += 1;
      const shellId =
        typeof frame.shellId === "string" ? frame.shellId : `op-${Date.now()}`;
      const role = handlers.localHostClaimsDirector()
        ? "viewer"
        : (operatorDirectorShellId = shellId, "operator");
      const snapshot = handlers.getSnapshot();
      send({
        type: "booth.hello.ok",
        sessionId: snapshot.sessionId,
        mode: "embedded",
        director:
          role === "operator" ? { shellId, role: "operator" } : undefined,
      });
      send({ type: "booth.state.snapshot", v: 1, ...snapshot });
      void ensureEngineRtc()?.refreshProgram();
      return;
    }

    if (frame.type === "booth.ping") {
      send({ type: "booth.ack", id: frame.id, ok: true });
      return;
    }

    if (isAnchorSignalFrame(frame)) {
      const rtc = ensureEngineRtc();
      if (rtc) await rtc.handleSignal(frame);
      return;
    }

    if (frame.type?.startsWith("booth.intent.")) {
      const shellId =
        typeof frame.shellId === "string" ? frame.shellId : operatorDirectorShellId;
      const canDirect =
        !handlers.localHostClaimsDirector() &&
        Boolean(shellId && operatorDirectorShellId === shellId);
      if (!canDirect) {
        send({
          type: "booth.ack",
          id: frame.id,
          ok: false,
          error: "not_director",
        });
        return;
      }
      try {
        await handlers.onOperatorIntent(frame);
        send({ type: "booth.ack", id: frame.id, ok: true });
        pushSnapshotIfOperators();
      } catch {
        send({
          type: "booth.ack",
          id: frame.id,
          ok: false,
          error: "invalid_intent",
        });
      }
    }
  }

  function onWsMessage(event: MessageEvent): void {
    const text = typeof event.data === "string" ? event.data : "";
    try {
      const frame = JSON.parse(text) as BoothEnvelope;
      if (!frame?.type) return;
      void handleInboundFrame(frame);
    } catch {
      /* ignore */
    }
  }

  function startKeepalive(): void {
    stopKeepalive();
    keepaliveTimer = setInterval(() => {
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      ws.send("ping");
    }, KEEPALIVE_MS);
  }

  function stopKeepalive(): void {
    if (keepaliveTimer) {
      clearInterval(keepaliveTimer);
      keepaliveTimer = null;
    }
  }

  function pushSnapshotIfOperators(): void {
    if (!ws || ws.readyState !== WebSocket.OPEN || operatorConnections <= 0) {
      return;
    }
    const snapshot = handlers.getSnapshot();
    send({ type: "booth.state.snapshot", v: 1, ...snapshot });
    void ensureEngineRtc()?.refreshProgram();
  }

  return {
    async start() {
      stopped = false;
      const reg = await registerBoothAnchorWithForceRetry({
        apiKey: opts.apiKey,
        boothSessionId: opts.boothSessionId,
        deviceLabel: opts.deviceLabel,
      });
      const socketUrl = wsUrlWithSecret(reg.wsUrl, reg.anchorSecret);
      ws = new WebSocket(socketUrl);
      ws.addEventListener("message", onWsMessage);
      ws.addEventListener("close", () => stopKeepalive());
      await new Promise<void>((resolve, reject) => {
        const sock = ws;
        if (!sock) return reject(new Error("ws_missing"));
        if (sock.readyState === WebSocket.OPEN) {
          startKeepalive();
          resolve();
          return;
        }
        sock.addEventListener(
          "open",
          () => {
            startKeepalive();
            sock.send("ping");
            resolve();
          },
          { once: true }
        );
        sock.addEventListener("error", () => reject(new Error("ws_failed")), {
          once: true,
        });
      });
    },
    async stop() {
      stopped = true;
      stopKeepalive();
      if (ws) {
        try {
          ws.close();
        } catch {
          /* ignore */
        }
        ws = null;
      }
      try {
        await revokeBoothAnchor(opts.apiKey);
      } catch {
        /* ignore */
      }
      operatorDirectorShellId = null;
      operatorConnections = 0;
      engineRtc?.stop();
      engineRtc = null;
    },
    publishSnapshot() {
      pushSnapshotIfOperators();
    },
    refreshProgram() {
      if (operatorConnections <= 0) return;
      void ensureEngineRtc()?.refreshProgram();
    },
  };
}

function operatorWsUrl(operatorCap: string): string {
  const origin = platformApiOrigin();
  const url = new URL(`${origin}/v1/booth/ws`);
  url.searchParams.set("role", "operator");
  url.searchParams.set("cap", operatorCap);
  return url.toString().replace(/^https:/, "wss:").replace(/^http:/, "ws:");
}

export type BoothOperatorClient = {
  connect(): Promise<void>;
  disconnect(): void;
  sendIntent(intent: BoothEnvelope): void;
  sendSignal(frame: AnchorSignalFrame): void;
};

export function createBoothOperatorClient(opts: {
  operatorCap: string;
  shellId: string;
  onSnapshot: (snap: BoothStateSnapshot) => void;
  onAck?: (id: string | undefined, ok: boolean, error?: string) => void;
  onHelloOk?: (hello: {
    sessionId?: string;
    director?: { shellId: string; role: string };
  }) => void;
  onDirectorChanged?: (director: { shellId: string; role: string } | null) => void;
  onEngineOffline?: () => void;
  onRemoteDisabled?: () => void;
  onSignal?: (frame: AnchorSignalFrame) => void;
}): BoothOperatorClient {
  let ws: WebSocket | null = null;
  let onMessage: ((event: MessageEvent) => void) | null = null;

  function send(frame: Record<string, unknown>): void {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ v: 1, shellId: opts.shellId, ...frame }));
  }

  function dispatchFrame(frame: BoothEnvelope): void {
    if (frame.type === "booth.state.snapshot") {
      opts.onSnapshot(frame as unknown as BoothStateSnapshot);
    }
    if (frame.type === "booth.hello.ok") {
      opts.onHelloOk?.({
        sessionId:
          typeof frame.sessionId === "string" ? frame.sessionId : undefined,
        director:
          frame.director &&
          typeof frame.director === "object" &&
          typeof (frame.director as { shellId?: string }).shellId === "string"
            ? (frame.director as { shellId: string; role: string })
            : undefined,
      });
    }
    if (frame.type === "booth.event.director.changed") {
      const d = frame.director;
      if (
        d &&
        typeof d === "object" &&
        typeof (d as { shellId?: string }).shellId === "string"
      ) {
        opts.onDirectorChanged?.(d as { shellId: string; role: string });
      } else {
        opts.onDirectorChanged?.(null);
      }
    }
    if (frame.type === "booth.ack") {
      opts.onAck?.(
        typeof frame.id === "string" ? frame.id : undefined,
        frame.ok === true,
        typeof frame.error === "string" ? frame.error : undefined
      );
    }
    if (frame.type === "booth.event.engine.offline") {
      opts.onEngineOffline?.();
    }
    if (frame.type === "booth.event.remote.disabled") {
      opts.onRemoteDisabled?.();
    }
    if (isAnchorSignalFrame(frame)) {
      opts.onSignal?.(frame);
    }
  }

  function parseFrame(event: MessageEvent): BoothEnvelope | null {
    const text = typeof event.data === "string" ? event.data : "";
    try {
      const frame = JSON.parse(text) as BoothEnvelope;
      return frame?.type ? frame : null;
    } catch {
      return null;
    }
  }

  return {
    async connect() {
      if (ws) return;
      ws = new WebSocket(operatorWsUrl(opts.operatorCap));

      let finishHello: (() => void) | null = null;
      let failHello: ((err: Error) => void) | null = null;
      const helloReady = new Promise<void>((resolve, reject) => {
        finishHello = resolve;
        failHello = reject;
      });

      const settleHello = (err?: Error) => {
        if (!finishHello && !failHello) return;
        const done = finishHello;
        const fail = failHello;
        finishHello = null;
        failHello = null;
        if (err) fail?.(err);
        else done?.();
      };

      onMessage = (event: MessageEvent) => {
        const frame = parseFrame(event);
        if (!frame) return;
        dispatchFrame(frame);
        if (frame.type === "booth.hello.ok") settleHello();
        if (frame.type === "booth.event.remote.disabled") {
          settleHello(new Error("remote_disabled"));
        }
        if (frame.type === "booth.event.engine.offline") {
          settleHello(new Error("engine_offline"));
        }
      };
      ws.addEventListener("message", onMessage);

      await new Promise<void>((resolve, reject) => {
        const sock = ws;
        if (!sock) return reject(new Error("ws_missing"));
        const onOpen = () => {
          send({
            type: "booth.hello",
            role: "operator",
            subscribe: ["members", "cast", "director", "engineHealth"],
          });
          resolve();
        };
        const onError = () => reject(new Error("ws_failed"));
        const onClose = () => reject(new Error("ws_closed"));
        sock.addEventListener("open", onOpen, { once: true });
        sock.addEventListener("error", onError, { once: true });
        sock.addEventListener("close", onClose, { once: true });
      });

      const helloTimer = setTimeout(() => {
        settleHello(new Error("operator_hello_timeout"));
      }, OPERATOR_HELLO_WAIT_MS);

      try {
        await helloReady;
      } finally {
        clearTimeout(helloTimer);
      }
    },
    disconnect() {
      if (ws && onMessage) {
        ws.removeEventListener("message", onMessage);
        onMessage = null;
      }
      if (ws) {
        try {
          ws.close();
        } catch {
          /* ignore */
        }
        ws = null;
      }
    },
    sendIntent(intent: BoothEnvelope) {
      send(intent as unknown as Record<string, unknown>);
    },
    sendSignal(frame: AnchorSignalFrame) {
      send(frame as unknown as Record<string, unknown>);
    },
  };
}
