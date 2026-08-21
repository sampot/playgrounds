/**
 * Build `/api/session/presence` body so SAM domain can seat + name players.
 * Booth play reuses PeerConnection slots; guest `displayName` comes from presence.
 */

export type HostSessionPresenceSeat = {
  seatId?: string;
  role: string;
  peerId?: string;
  displayName?: string;
};

export function buildHostSessionPresenceBody(opts: {
  hostRole: string;
  hostDisplayName?: string | null;
  seats: readonly HostSessionPresenceSeat[];
  playerSeated?: boolean;
}): {
  playerSeated: boolean;
  seatedRoles: string[];
  seats: HostSessionPresenceSeat[];
} {
  const hostRole = opts.hostRole.trim() || "host";
  const hostName = opts.hostDisplayName?.trim() || undefined;
  const guestSeats = opts.seats
    .filter((s) => s.role.trim() && s.role.trim() !== hostRole)
    .map((s) => {
      const role = s.role.trim();
      const displayName = s.displayName?.trim() || undefined;
      return {
        ...(s.seatId ? { seatId: s.seatId } : {}),
        role,
        ...(s.peerId ? { peerId: s.peerId } : {}),
        ...(displayName ? { displayName } : {}),
      };
    });
  const seats: HostSessionPresenceSeat[] = [
    {
      role: hostRole,
      ...(hostName ? { displayName: hostName } : {}),
    },
    ...guestSeats,
  ];
  const seatedRoles = [hostRole, ...guestSeats.map((s) => s.role)];
  const playerSeated =
    opts.playerSeated ?? (guestSeats.length > 0 || seatedRoles.length > 0);
  return { playerSeated, seatedRoles, seats };
}
