import type { RosterPeerHandlers } from "@pg/roster/rosterPeer";

export type OperatorPeerSlot = {
  shellId: string;
  peerId: string | null;
  session: import("@pg/roster/rosterPeer").RosterPeerSession | null;
  displayName: string | null;
  lost?: boolean;
};

export function operatorPeerIdForShell(shellId: string): string {
  return `op-${shellId}`;
}

export function operatorDisplayNameForShell(shellId: string): string {
  return `遠端 (${shellId.slice(-4)})`;
}
