/**
 * Guest invite page shell routing (compose `/i/` vs booth `/i/`).
 */

/** Booth Guest must keep GoRoomSurface while play seats bind — no compose wait chrome. */
export function guestInviteShowsRoomSurface(opts: {
  isRoom: boolean;
  phase: string;
}): boolean {
  if (!opts.isRoom) return false;
  return (
    opts.phase === "connecting" ||
    opts.phase === "ready" ||
    opts.phase === "seating"
  );
}
