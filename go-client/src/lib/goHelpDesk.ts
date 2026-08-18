export type HelpDeskLine = {
  speaker: string;
  text: string;
};

export const GO_HELP_DESK_SPEAKER = "詢問處";

/** One RPG beat per line; player advances with 下一則. */
export const GO_HELP_DESK_LINES: readonly HelpDeskLine[] = [
  {
    speaker: GO_HELP_DESK_SPEAKER,
    text: "歡迎來到詢問處。大廳怎麼走、怎麼加到主畫面，我一次講一則。",
  },
  {
    speaker: GO_HELP_DESK_SPEAKER,
    text: "點機台、櫃檯或詢問處就能互動。點地板可以走動。",
  },
  {
    speaker: GO_HELP_DESK_SPEAKER,
    text: "想玩就走向機台區；清單會蓋在大廳上，選一台就能開玩。",
  },
  {
    speaker: GO_HELP_DESK_SPEAKER,
    text: "iPhone 請用 Safari：底部分享鈕（方塊↑）→「加入主畫面」。頁頂分享沒有這一項。",
  },
  {
    speaker: GO_HELP_DESK_SPEAKER,
    text: "Android Chrome：瀏覽器選單裡的「安裝應用程式」或「加到主畫面」。",
  },
  {
    speaker: GO_HELP_DESK_SPEAKER,
    text: "連線開過一次的遊戲，之後可在「更多 → 管理已下載的遊戲」離線再玩。邀請短連結不能當離線入口。",
  },
  {
    speaker: GO_HELP_DESK_SPEAKER,
    text: "若從 LINE 等 App 內建瀏覽器打開，功能可能不完整。改用 Safari 或 Chrome 開同一網址較穩。",
  },
];

export function clampHelpDeskIndex(index: number): number {
  const last = GO_HELP_DESK_LINES.length - 1;
  if (index < 0) return 0;
  if (index > last) return last;
  return index;
}

export function helpDeskLineAt(index: number): HelpDeskLine {
  return GO_HELP_DESK_LINES[clampHelpDeskIndex(index)]!;
}

export function helpDeskIsLast(index: number): boolean {
  return clampHelpDeskIndex(index) === GO_HELP_DESK_LINES.length - 1;
}

export function nextHelpDeskIndex(index: number): number {
  if (helpDeskIsLast(index)) return clampHelpDeskIndex(index);
  return clampHelpDeskIndex(index) + 1;
}
