export type HelpDeskLine = {
  speaker: string;
  text: string;
};

export const GO_HELP_DESK_SPEAKER = "老闆";

/** One RPG beat per line; player advances with 下一則. Spoken at the counter. */
export const GO_HELP_DESK_LINES: readonly HelpDeskLine[] = [
  {
    speaker: GO_HELP_DESK_SPEAKER,
    text: "找我就對了。大廳怎麼走、怎麼釘主畫面，我一則一則講。",
  },
  {
    speaker: GO_HELP_DESK_SPEAKER,
    text: "點機台或櫃檯就能互動。點地板走動。右邊那桌是聊天區，後場門放已下載的。",
  },
  {
    speaker: GO_HELP_DESK_SPEAKER,
    text: "想玩就走向機台。招牌對上了，點下去就開。清單蓋在大廳上，不用往下捲。",
  },
  {
    speaker: GO_HELP_DESK_SPEAKER,
    text: "iPhone 用 Safari：底部分享鈕（方塊↑）→「加入主畫面」。頁頂那個分享沒有這一項。",
  },
  {
    speaker: GO_HELP_DESK_SPEAKER,
    text: "Android Chrome：瀏覽器選單裡的「安裝應用程式」或「加到主畫面」。",
  },
  {
    speaker: GO_HELP_DESK_SPEAKER,
    text: "連線開過一次的，之後從「更多 → 管理已下載的遊戲」離線也能再開。邀請短連結別當書籤。",
  },
  {
    speaker: GO_HELP_DESK_SPEAKER,
    text: "從 LINE 裡打開常會怪怪的。換成 Safari 或 Chrome 開同一網址比較穩。",
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
