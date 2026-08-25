import type {
  AnchorSignalFrame,
  BoothEnvelope,
  BoothStateSnapshot,
} from "@pg/roster/boothChannel";
import { isAnchorSignalFrame, isBoothJoinOfferFrame } from "@pg/roster/boothChannel";
import type { RosterPeerHandlers } from "@pg/roster/rosterPeer";
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

/** Mint a short-lived Operator cap for the logged-in account (field API key). */
export async function mintOperatorCap(
  apiKey: string,
  boothSessionId?: string
): Promise<OperatorCapResult> {
  const origin = platformApiOrigin();
  const res = await fetch(`${origin}/v1/booth/operator-caps`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
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

export type BoothDirectorGrant = {
  shellId: string;
  role: "host" | "operator";
};

export type BoothAnchorHostHandlers = {
  getSnapshot: () => BoothStateSnapshot;
  localHostClaimsDirector: () => boolean;
  claimOperatorDirector?: (shellId: string) => {
    role: "operator" | "viewer";
    director?: BoothDirectorGrant;
  };
  operatorCanDirect?: (shellId: string) => boolean;
  remoteOperatorEnabled?: () => boolean;
  getLocalPresence: () => { agentId: string; name: string };
  prepareOperatorRoster?: (shellId: string) => RosterPeerHandlers;
  onOperatorSession?: (input: {
    shellId: string;
    session: import("@pg/roster/rosterPeer").RosterPeerSession;
  }) => void;
  onOperatorIntent: (
    frame: BoothEnvelope
  ) => Promise<Record<string, unknown> | void>;
  onGuestJoinOffer: (input: {
    joinId: string;
    inviteId: string;
    offerWire: string;
  }) => Promise<string>;
  onOperatorDisconnected?: (shellId: string) => void;
  /** TV program stream for Operator WebRTC preview (§10.6). */
  getTvProgramStream?: () => MediaStream | null;
  onOwnerDataChannel?: (dc: RTCDataChannel) => void;
};

export type BoothAnchorHost = {
  start(): Promise<void>;
  stop(): Promise<void>;
  ensureConnected(): Promise<void>;
  publishSnapshot(): void;
  refreshProgram(): void;
};

const KEEPALIVE_MS = 45_000;
const OPERATOR_HELLO_WAIT_MS = 20_000;
const RECONNECT_BASE_MS = 1_000;
const RECONNECT_MAX_MS = 30_000;

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
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let reconnectAttempt = 0;
  let connecting: Promise<void> | null = null;
  let registration: RegisterBoothAnchorResult | null = null;
  let operatorDirectorShellId: string | null = null;
  let operatorConnections = 0;
  const operatorShellIds = new Set<string>();
  let stopped = false;
  let engineRtc: ReturnType<typeof createBoothEngineOperatorRtc> | null = null;

  function clearReconnectTimer(): void {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  }

  function resetOperatorSession(): void {
    operatorDirectorShellId = null;
    operatorConnections = 0;
    operatorShellIds.clear();
    engineRtc?.stop();
    engineRtc = null;
  }

  function notifyOperatorDisconnected(shellId: string | undefined): void {
    if (!shellId) return;
    operatorShellIds.delete(shellId);
    handlers.onOperatorDisconnected?.(shellId);
  }

  function scheduleReconnect(): void {
    if (stopped || reconnectTimer) return;
    const delay = Math.min(
      RECONNECT_BASE_MS * 2 ** reconnectAttempt,
      RECONNECT_MAX_MS
    );
    reconnectAttempt += 1;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      void ensureConnected();
    }, delay);
  }

  function handleWsClose(): void {
    stopKeepalive();
    ws = null;
    resetOperatorSession();
    if (!stopped) scheduleReconnect();
  }

  function ensureEngineRtc(): ReturnType<typeof createBoothEngineOperatorRtc> | null {
    if (!handlers.getTvProgramStream || !handlers.getLocalPresence) return null;
    engineRtc ??= createBoothEngineOperatorRtc({
      sendSignal: (frame) => send(frame),
      getTvStream: handlers.getTvProgramStream!,
      onOwnerChannel: (dc) => handlers.onOwnerDataChannel?.(dc),
      localPresence: handlers.getLocalPresence(),
      getRosterHandlers: (shellId) =>
        handlers.prepareOperatorRoster?.(shellId) ?? ({} as RosterPeerHandlers),
      onSession: (session, shellId) => {
        handlers.onOperatorSession?.({ shellId, session });
      },
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
      const shellId =
        typeof frame.shellId === "string"
          ? frame.shellId
          : operatorShellIds.size === 1
            ? [...operatorShellIds][0]
            : operatorDirectorShellId ?? undefined;
      if (operatorConnections <= 0) {
        engineRtc?.stop();
        engineRtc = null;
      }
      notifyOperatorDisconnected(shellId);
      if (operatorDirectorShellId === shellId) {
        operatorDirectorShellId = null;
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
      operatorShellIds.add(shellId);
      let role: "operator" | "viewer";
      let director: BoothDirectorGrant | undefined;
      if (handlers.claimOperatorDirector) {
        const grant = handlers.claimOperatorDirector(shellId);
        role = grant.role;
        director = grant.director;
        operatorDirectorShellId =
          role === "operator" ? shellId : director?.shellId ?? null;
      } else {
        role = "operator";
        director = { shellId, role: "operator" };
        operatorDirectorShellId = shellId;
      }
      const snapshot = handlers.getSnapshot();
      send({
        type: "booth.hello.ok",
        sessionId: snapshot.sessionId,
        mode: "embedded",
        director,
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
      if (rtc) {
        const shellId =
          typeof frame.shellId === "string" ? frame.shellId : operatorDirectorShellId;
        await rtc.handleSignal(frame, shellId ?? undefined);
      }
      return;
    }

    if (frame.type?.startsWith("booth.intent.")) {
      const shellId =
        typeof frame.shellId === "string" ? frame.shellId : operatorDirectorShellId;
      const canDirect = handlers.operatorCanDirect
        ? handlers.operatorCanDirect(shellId ?? "")
        : Boolean(shellId && operatorDirectorShellId === shellId);
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
        const ackPayload = await handlers.onOperatorIntent(frame);
        send({
          type: "booth.ack",
          id: frame.id,
          ok: true,
          ...(ackPayload ? { payload: ackPayload } : {}),
        });
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

  function isWsOpen(socket: WebSocket | null): boolean {
    return socket?.readyState === WebSocket.OPEN;
  }

  function isWsConnecting(socket: WebSocket | null): boolean {
    return Boolean(socket && socket.readyState === WebSocket.CONNECTING);
  }

  async function openWebSocket(): Promise<void> {
    if (stopped) return;
    if (isWsOpen(ws)) return;
    if (isWsConnecting(ws)) return;

    if (!registration) {
      registration = await registerBoothAnchorWithForceRetry({
        apiKey: opts.apiKey,
        boothSessionId: opts.boothSessionId,
        deviceLabel: opts.deviceLabel,
      });
    }

    const socketUrl = wsUrlWithSecret(
      registration.wsUrl,
      registration.anchorSecret
    );
    const sock = new WebSocket(socketUrl);
    ws = sock;
    sock.addEventListener("message", onWsMessage);

    try {
      await new Promise<void>((resolve, reject) => {
        const onOpen = () => {
          cleanup();
          reconnectAttempt = 0;
          startKeepalive();
          sock.send("ping");
          sock.addEventListener("close", handleWsClose);
          resolve();
        };
        const onError = () => {
          cleanup();
          reject(new Error("ws_failed"));
        };
        const onCloseBeforeOpen = () => {
          cleanup();
          reject(new Error("ws_closed"));
        };
        const cleanup = () => {
          sock.removeEventListener("open", onOpen);
          sock.removeEventListener("error", onError);
          sock.removeEventListener("close", onCloseBeforeOpen);
        };
        if (sock.readyState === WebSocket.OPEN) {
          onOpen();
          return;
        }
        sock.addEventListener("open", onOpen, { once: true });
        sock.addEventListener("error", onError, { once: true });
        sock.addEventListener("close", onCloseBeforeOpen, { once: true });
      });
    } catch {
      ws = null;
      if (!stopped) scheduleReconnect();
      throw new Error("ws_failed");
    }
  }

  async function ensureConnected(): Promise<void> {
    if (stopped) return;
    if (isWsOpen(ws)) return;
    if (connecting) {
      await connecting;
      return;
    }
    connecting = openWebSocket();
    try {
      await connecting;
    } finally {
      connecting = null;
    }
  }

  return {
    async start() {
      stopped = false;
      clearReconnectTimer();
      reconnectAttempt = 0;
      registration = await registerBoothAnchorWithForceRetry({
        apiKey: opts.apiKey,
        boothSessionId: opts.boothSessionId,
        deviceLabel: opts.deviceLabel,
      });
      try {
        await ensureConnected();
      } catch {
        /* background reconnect scheduled */
      }
    },
    async stop() {
      stopped = true;
      clearReconnectTimer();
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
      registration = null;
      reconnectAttempt = 0;
      operatorDirectorShellId = null;
      operatorConnections = 0;
      engineRtc?.stop();
      engineRtc = null;
    },
    ensureConnected,
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
  onAck?: (
    id: string | undefined,
    ok: boolean,
    error?: string,
    payload?: Record<string, unknown>
  ) => void;
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
      const payload =
        frame.payload && typeof frame.payload === "object"
          ? (frame.payload as Record<string, unknown>)
          : undefined;
      opts.onAck?.(
        typeof frame.id === "string" ? frame.id : undefined,
        frame.ok === true,
        typeof frame.error === "string" ? frame.error : undefined,
        payload
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
            subscribe: [
              "members",
              "cast",
              "director",
              "engineHealth",
              "shareFiles",
              "privateFiles",
              "chatTail",
            ],
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
