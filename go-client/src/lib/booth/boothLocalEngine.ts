/**
 * Loopback native Booth Hub discovery (pg-boothd / desktop control server).
 * Contract aligned with PG-GO-ROOM-ENGINE-PLAN §7.1, §11.2.
 */

import { boothDesktopPaths, isBoothDesktopShell } from "../boothDesktop";

export const GO_BOOTH_SHELL_TOKEN_KEY = "go_booth_shell_token_v1";
export const BOOTH_LOCAL_DEFAULT_PORT = 7847;
export const BOOTH_LOCAL_STATUS_PATH = "/v1/booth/local/status";
export const BOOTH_CONTROL_PATH = "/booth/control";
export const BOOTH_PEER_SIGNAL_PREFIX = "/v1/booth/peer";

export type BoothLocalEngineMode = "daemon" | "desktop";

export type BoothLocalEngineStatus = {
  online: boolean;
  sessionId?: string;
  engineMode?: BoothLocalEngineMode;
  controlWsUrl?: string;
  roomFileBaseUrl?: string;
  deviceLabel?: string;
  guestCount?: number;
  anchor?: "offline" | "registering" | "online" | "degraded";
  needsToken?: boolean;
};

export type BoothLocalEngineEndpoints = {
  httpOrigin: string;
  statusUrl: string;
  controlWsUrl: string;
  roomFileBaseUrl: string;
  peerSignalUrl: string;
};

export function buildLocalEngineEndpoints(
  port = BOOTH_LOCAL_DEFAULT_PORT,
  host = "127.0.0.1"
): BoothLocalEngineEndpoints {
  const httpOrigin = `http://${host}:${port}`;
  const wsHost = host.includes(":") ? `[${host}]` : host;
  return {
    httpOrigin,
    statusUrl: `${httpOrigin}${BOOTH_LOCAL_STATUS_PATH}`,
    controlWsUrl: `ws://${wsHost}:${port}${BOOTH_CONTROL_PATH}`,
    roomFileBaseUrl: `${httpOrigin}/room-file`,
    peerSignalUrl: `${httpOrigin}${BOOTH_PEER_SIGNAL_PREFIX}`,
  };
}

export function controlWsUrlWithToken(
  baseWsUrl: string,
  shellToken: string
): string {
  const url = new URL(baseWsUrl);
  url.searchParams.set("token", shellToken.trim());
  return url.toString();
}

export function readStoredShellToken(): string | null {
  if (typeof sessionStorage === "undefined") return null;
  const raw = sessionStorage.getItem(GO_BOOTH_SHELL_TOKEN_KEY)?.trim();
  return raw || null;
}

export function writeStoredShellToken(token: string): void {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.setItem(GO_BOOTH_SHELL_TOKEN_KEY, token.trim());
}

export function clearStoredShellToken(): void {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.removeItem(GO_BOOTH_SHELL_TOKEN_KEY);
}

export async function readShellTokenFromDesktop(): Promise<string | null> {
  if (!isBoothDesktopShell()) return null;
  const paths = await boothDesktopPaths();
  if (!paths?.shellTokenPath) return null;
  try {
    const fs = await import("@tauri-apps/plugin-fs");
    if (!(await fs.exists(paths.shellTokenPath))) return null;
    const bytes = await fs.readTextFile(paths.shellTokenPath);
    const token = bytes.trim();
    return token || null;
  } catch {
    return null;
  }
}

export async function resolveShellLocalToken(): Promise<string | null> {
  const stored = readStoredShellToken();
  if (stored) return stored;
  return readShellTokenFromDesktop();
}

export async function probeLocalBoothEngine(opts?: {
  port?: number;
  host?: string;
  shellToken?: string | null;
  fetchImpl?: typeof fetch;
}): Promise<BoothLocalEngineStatus> {
  const endpoints = buildLocalEngineEndpoints(opts?.port, opts?.host);
  const fetchFn = opts?.fetchImpl ?? fetch;
  const headers: Record<string, string> = { Accept: "application/json" };
  const token = opts?.shellToken?.trim();
  if (token) headers.Authorization = `Bearer ${token}`;

  try {
    const res = await fetchFn(endpoints.statusUrl, { headers });
    if (res.status === 401) {
      return { online: true, needsToken: true };
    }
    if (!res.ok) {
      return { online: false };
    }
    const data = (await res.json()) as BoothLocalEngineStatus;
    return {
      online: data.online !== false,
      sessionId: data.sessionId,
      engineMode: data.engineMode,
      controlWsUrl: data.controlWsUrl ?? endpoints.controlWsUrl,
      roomFileBaseUrl: data.roomFileBaseUrl ?? endpoints.roomFileBaseUrl,
      deviceLabel: data.deviceLabel,
      guestCount: data.guestCount,
      anchor: data.anchor,
      needsToken: data.needsToken,
    };
  } catch {
    return { online: false };
  }
}
