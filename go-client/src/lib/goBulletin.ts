export type GoBulletinSeverity = "info" | "notice" | "critical";

export type GoBulletin = {
  id: string;
  rev: number;
  severity: GoBulletinSeverity;
  title: string;
  body?: string;
  href?: string;
  hrefLabel?: string;
  startsAt: string;
  endsAt?: string | null;
  dismissible: boolean;
  audience?: "all" | "signed_in";
};

export const GO_BULLETIN_DISMISS_KEY = "pg_go_bulletin_dismissed";

export const GO_BULLETIN_ACTIVE_CAP = 3;

/** Standing house notice until Platform bulletins are live. */
export const GO_BULLETIN_FIXTURE: readonly GoBulletin[] = [
  {
    id: "invite-play",
    rev: 1,
    severity: "info",
    title: "會員可邀請連線",
    body: "登入通行證後，可在遊戲裡邀請朋友開一場連線。未登入一樣能單機玩。",
    startsAt: "2026-01-01T00:00:00Z",
    dismissible: false,
    audience: "all",
  },
];

const SEVERITY_RANK: Record<GoBulletinSeverity, number> = {
  critical: 0,
  notice: 1,
  info: 2,
};

export function parseDismissedBulletins(
  raw: string | null
): Record<string, number> {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    const out: Record<string, number> = {};
    for (const [id, rev] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof rev === "number" && Number.isFinite(rev)) out[id] = rev;
    }
    return out;
  } catch {
    return {};
  }
}

export function readDismissedBulletins(
  storage: Pick<Storage, "getItem"> | null | undefined
): Record<string, number> {
  if (!storage) return {};
  return parseDismissedBulletins(storage.getItem(GO_BULLETIN_DISMISS_KEY));
}

export function writeDismissedBulletins(
  storage: Pick<Storage, "setItem">,
  dismissed: Record<string, number>
): void {
  storage.setItem(GO_BULLETIN_DISMISS_KEY, JSON.stringify(dismissed));
}

export function isBulletinActive(
  bulletin: GoBulletin,
  now: Date,
  dismissed: Record<string, number>
): boolean {
  const start = Date.parse(bulletin.startsAt);
  if (!Number.isFinite(start) || now.getTime() < start) return false;
  if (bulletin.endsAt != null && bulletin.endsAt !== "") {
    const end = Date.parse(bulletin.endsAt);
    if (Number.isFinite(end) && now.getTime() >= end) return false;
  }
  const seenRev = dismissed[bulletin.id];
  if (seenRev != null && seenRev >= bulletin.rev) return false;
  return true;
}

export function sortBulletins(a: GoBulletin, b: GoBulletin): number {
  const rank = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
  if (rank !== 0) return rank;
  return Date.parse(b.startsAt) - Date.parse(a.startsAt);
}

export function filterActiveBulletins(
  bulletins: readonly GoBulletin[],
  options: {
    now?: Date;
    dismissed?: Record<string, number>;
    cap?: number;
  } = {}
): GoBulletin[] {
  const now = options.now ?? new Date();
  const dismissed = options.dismissed ?? {};
  const cap = options.cap ?? GO_BULLETIN_ACTIVE_CAP;
  return bulletins
    .filter((b) => isBulletinActive(b, now, dismissed))
    .sort(sortBulletins)
    .slice(0, cap);
}

export function dismissBulletin(
  storage: Pick<Storage, "getItem" | "setItem">,
  bulletin: GoBulletin
): Record<string, number> {
  const dismissed = readDismissedBulletins(storage);
  dismissed[bulletin.id] = bulletin.rev;
  writeDismissedBulletins(storage, dismissed);
  return dismissed;
}

export type GoBulletinRoute = "/" | "/apps" | "/help" | "/s" | "/i" | string;

export function shouldShowBulletinStrip(options: {
  pathname: string;
  canvasActive: boolean;
  severity?: GoBulletinSeverity;
}): boolean {
  if (options.canvasActive) return false;
  const path = options.pathname.replace(/\/+$/, "") || "/";
  if (path.startsWith("/i/")) {
    return options.severity === "critical";
  }
  return path === "/" || path === "/apps" || path === "/help" || path === "/chat" || path === "/room" || path.startsWith("/s/");
}
