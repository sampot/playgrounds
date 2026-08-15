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

type PickBossWelcomeOptions = {
  random?: () => number;
  recentIndices?: readonly number[];
};

export type BossWelcome = {
  index: number;
  text: string;
};

function isWelcomeIndex(value: unknown): value is number {
  return (
    Number.isInteger(value) &&
    (value as number) >= 0 &&
    (value as number) < GO_BOSS_WELCOMES.length
  );
}

export function pickBossWelcome({
  random = Math.random,
  recentIndices = [],
}: PickBossWelcomeOptions = {}): BossWelcome {
  const recent = new Set(recentIndices.filter(isWelcomeIndex));
  let candidates = GO_BOSS_WELCOMES.map((_, index) => index).filter(
    (index) => !recent.has(index)
  );
  if (candidates.length === 0) {
    candidates = GO_BOSS_WELCOMES.map((_, index) => index);
  }

  const unit = Math.min(Math.max(random(), 0), 1 - Number.EPSILON);
  const index = candidates[Math.floor(unit * candidates.length)];
  return { index, text: GO_BOSS_WELCOMES[index] };
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
