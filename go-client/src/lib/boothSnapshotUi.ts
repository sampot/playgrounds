import type { BoothStateSnapshot } from "@pg/roster/boothChannel";
import type { RoomInviteDoor } from "./goRoom";

export type BoothSnapshotUi = {
  guestCount: number;
  inviteDoor: RoomInviteDoor;
  shortUrl: string | null;
  occupantPeers: { peerId: string; name: string }[];
  occupantNames: string[];
  tvOn: boolean;
  tvLabel: string | null;
  remoteLives: { peerId: string; camera: boolean; mic: boolean }[];
};

export function boothInviteDoor(
  gate: BoothStateSnapshot["inviteGate"]
): RoomInviteDoor {
  if (gate === "live") return "live";
  if (gate === "expired") return "expired";
  return "none";
}

export function boothCastTvLabel(
  cast: BoothStateSnapshot["cast"] | undefined
): string | null {
  if (!cast || cast.kind === "idle") return null;
  if (cast.kind === "live") {
    const label = typeof cast.label === "string" ? cast.label.trim() : "";
    return label || "在場 live";
  }
  if (cast.kind === "file") {
    const name = typeof cast.name === "string" ? cast.name.trim() : "";
    return name || "檔案";
  }
  if (cast.kind === "play") return "開局";
  return null;
}

export function boothCastTvOn(cast: BoothStateSnapshot["cast"] | undefined): boolean {
  return Boolean(cast && cast.kind !== "idle");
}

export function boothSnapshotToUi(snapshot: BoothStateSnapshot): BoothSnapshotUi {
  const occupantPeers = snapshot.members.map((m) => ({
    peerId: m.peerId,
    name: m.displayName,
  }));
  const cast = snapshot.cast;
  return {
    guestCount: snapshot.guestCount,
    inviteDoor: boothInviteDoor(snapshot.inviteGate),
    shortUrl: snapshot.inviteShortUrl ?? null,
    occupantPeers,
    occupantNames: occupantPeers.map((p) => p.name),
    tvOn: boothCastTvOn(cast),
    tvLabel: boothCastTvLabel(cast),
    remoteLives: snapshot.members
      .filter((m) => m.live?.camera || m.live?.mic)
      .map((m) => ({
        peerId: m.peerId,
        camera: Boolean(m.live?.camera),
        mic: Boolean(m.live?.mic),
      })),
  };
}
