export const BOSS_WELCOME_SESSION_KEY = "pg_go_boss_welcomed";
export const BOSS_WELCOME_RECENT_KEY = "pg_go_boss_welcome_recent";

const RECENT_LIMIT = 3;

export const GO_BOSS_WELCOMES = [
  "歡迎光臨山姆鍋遊樂場！挑一個小品就能玩。",
  "進來坐。下面隨便點，不用報到。",
  "今日營業中——純玩專區，打開就能衝。",
  "老闆在櫃檯。想試哪一款？往下挑就行。",
  "Let's dash, go, and play——先選一個再說。",
  "遊樂場開著。分數留在你這台，我不管帳。",
  "新面孔也歡迎。掃一眼推薦，點進去就對了。",
  "別客氣，這不是後台——這裡只負責玩。",
  "常玩的可以加到主畫面，下次少繞一步。",
  "造訪過的小品，斷線也能從「更多」再開。",
  "邀請短連結是臨時的，別當書籤收藏。",
  "用 LINE 內建瀏覽器怪怪的？換系統瀏覽器通常就好。",
] as const;

export const GO_BOSS_WELCOMES_OFFLINE = [
  "線路不太穩？已下載的還能從「更多」開。",
  "店裡燈還亮著。已下載的遊戲，照常玩。",
] as const;

export const GO_BOSS_WELCOMES_SIGNED_IN = [
  "通行證亮著。想找人對弈再跟我說。",
  "入座過的旅客——今天想單機還是約戰？",
] as const;

/** Flat catalog: general, then offline, then signed-in (stable index space). */
export const GO_BOSS_WELCOME_CATALOG = [
  ...GO_BOSS_WELCOMES.map((text) => ({ text, kind: "general" as const })),
  ...GO_BOSS_WELCOMES_OFFLINE.map((text) => ({
    text,
    kind: "offline" as const,
  })),
  ...GO_BOSS_WELCOMES_SIGNED_IN.map((text) => ({
    text,
    kind: "signedIn" as const,
  })),
] as const;

type PickBossWelcomeOptions = {
  random?: () => number;
  recentIndices?: readonly number[];
  offline?: boolean;
  signedIn?: boolean;
};

export type BossWelcome = {
  index: number;
  text: string;
};

function isWelcomeIndex(value: unknown): value is number {
  return (
    Number.isInteger(value) &&
    (value as number) >= 0 &&
    (value as number) < GO_BOSS_WELCOME_CATALOG.length
  );
}

function isEligible(
  kind: (typeof GO_BOSS_WELCOME_CATALOG)[number]["kind"],
  offline: boolean,
  signedIn: boolean
): boolean {
  if (kind === "general") return true;
  if (kind === "offline") return offline;
  return signedIn;
}

export function pickBossWelcome({
  random = Math.random,
  recentIndices = [],
  offline = false,
  signedIn = false,
}: PickBossWelcomeOptions = {}): BossWelcome {
  const recent = new Set(recentIndices.filter(isWelcomeIndex));
  let candidates = GO_BOSS_WELCOME_CATALOG.map((line, index) => ({
    ...line,
    index,
  })).filter(
    (line) =>
      isEligible(line.kind, offline, signedIn) && !recent.has(line.index)
  );

  if (candidates.length === 0) {
    candidates = GO_BOSS_WELCOME_CATALOG.map((line, index) => ({
      ...line,
      index,
    })).filter((line) => isEligible(line.kind, offline, signedIn));
  }

  if (candidates.length === 0) {
    // Defensive: always at least the general pool.
    candidates = GO_BOSS_WELCOMES.map((text, index) => ({
      text,
      kind: "general" as const,
      index,
    }));
  }

  const unit = Math.min(Math.max(random(), 0), 1 - Number.EPSILON);
  const chosen = candidates[Math.floor(unit * candidates.length)]!;
  return { index: chosen.index, text: chosen.text };
}

export function claimBossWelcome(
  storage: Pick<Storage, "getItem" | "setItem">
): boolean {
  try {
    if (storage.getItem(BOSS_WELCOME_SESSION_KEY)) return false;
    storage.setItem(BOSS_WELCOME_SESSION_KEY, "1");
    return true;
  } catch {
    // Without session storage there is no reliable session lifetime. Staying
    // quiet is preferable to greeting again on every SPA visit to the home page.
    return false;
  }
}

export function readRecentBossWelcomes(
  storage: Pick<Storage, "getItem">
): number[] {
  try {
    const parsed: unknown = JSON.parse(
      storage.getItem(BOSS_WELCOME_RECENT_KEY) || "[]"
    );
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isWelcomeIndex).slice(-RECENT_LIMIT);
  } catch {
    return [];
  }
}

export function rememberBossWelcome(
  storage: Pick<Storage, "getItem" | "setItem">,
  index: number
): void {
  if (!isWelcomeIndex(index)) return;
  try {
    const recent = readRecentBossWelcomes(storage).filter(
      (recentIndex) => recentIndex !== index
    );
    recent.push(index);
    storage.setItem(
      BOSS_WELCOME_RECENT_KEY,
      JSON.stringify(recent.slice(-RECENT_LIMIT))
    );
  } catch {
    // Storage can be denied in private or embedded contexts; the welcome still
    // works, only cross-session repetition avoidance is unavailable.
  }
}

/** Auth / light shell feedback in boss voice (Phase D). */
export const BOSS_FLASH = {
  loggedIn: "通行證辦好了，歡迎入座。",
  loggedOut: "通行證收起來了。隨時還能玩。",
  loginExpired: "同意入座已失效，請從後台重新登入。",
} as const;
