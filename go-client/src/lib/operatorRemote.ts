import type { RoomUiPhase } from "./goRoom";

export const GO_ROOM_OPERATOR_GATE_TITLE = "連回包廂";
export const GO_ROOM_OPERATOR_GATE_BODY =
  "連上家裡常駐的包廂，遠端看大螢幕、導播與管理檔案。";
export const GO_ROOM_OPERATOR_GATE_BUTTON = "登入後連回包廂";
export const GO_ROOM_OPERATOR_CONNECTING_TITLE = "正在連回包廂…";
export const GO_ROOM_OPERATOR_CONNECTING_BODY =
  "連上後會看到家裡包廂的大螢幕。請留在這個畫面。";

export type OperatorMintPhase = "idle" | "minting" | "error";

export function readOperatorCapFromSearch(
  search: URLSearchParams | string
): string {
  const sp =
    typeof search === "string"
      ? new URLSearchParams(
          search.startsWith("?") || search.startsWith("#")
            ? search.slice(1)
            : search
        )
      : search;
  return sp.get("cap")?.trim() ?? "";
}

export function roomOperatorLoginGate(opts: {
  capFromUrl: boolean;
  loggedIn: boolean;
  phase: RoomUiPhase;
  clientReady: boolean;
}): boolean {
  if (opts.capFromUrl) return false;
  if (!opts.clientReady) return false;
  return !opts.loggedIn && opts.phase === "idle";
}

export function shouldMintOperatorCapOnLogin(opts: {
  capFromUrl: boolean;
  loggedIn: boolean;
  mintStarted: boolean;
}): boolean {
  if (opts.capFromUrl) return false;
  if (!opts.loggedIn) return false;
  return !opts.mintStarted;
}

export function operatorRemoteUiPhase(opts: {
  mintPhase: OperatorMintPhase;
  shellPhase: RoomUiPhase | null;
}): RoomUiPhase {
  if (opts.shellPhase) return opts.shellPhase;
  if (opts.mintPhase === "minting") return "connecting";
  if (opts.mintPhase === "error") return "error";
  return "idle";
}
