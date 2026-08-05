/**
 * SAM catalog on `/sam/` — games, tools, and other one-page apps
 * opened into Playgrounds via `?open=`.
 * These are Playgrounds templates only (not standalone products/services).
 */

import { buildCanonicalOpenUrl } from "../utils/playgroundsUrls";

export type SamKind = "game" | "tool" | "toy" | "media" | "agent";

/** Shelf / genre within a kind (e.g. arcade under games, or a tool family). */
export type SamSeries = string;

export interface SamEntry {
  /** GitHub repo name under sampot/, e.g. `pg-pinfall`. */
  repo: string;
  /** Display name shown in UI / `?name=`. */
  title: string;
  kind: SamKind;
  series: SamSeries;
  /** One-line catalog blurb. */
  blurb: string;
}

/** Tab order on `/sam/`. */
export const SAM_KIND_ORDER: SamKind[] = [
  "tool",
  "agent",
  "game",
  "toy",
  "media",
];

export const SAM_KIND_LABEL: Record<SamKind, string> = {
  tool: "工具",
  agent: "代理",
  game: "遊戲",
  toy: "玩具",
  media: "影音繪圖",
};

/** Series order within `kind: "game"`. Unknown series append at end. */
export const SAM_GAME_SERIES_ORDER: string[] = [
  "精緻可玩",
  "街機",
  "懷舊",
  "機台",
  "桌遊",
];

/** Series order within `kind: "tool"`. Extend when shipping tool SAMs. */
export const SAM_TOOL_SERIES_ORDER: string[] = [
  "流程",
  "前端",
  "資料",
  "協定",
  "環境",
  "日常",
];

/** Series order within `kind: "toy"`. */
export const SAM_TOY_SERIES_ORDER: string[] = ["生成", "模擬"];

/** Series order within `kind: "media"`. */
export const SAM_MEDIA_SERIES_ORDER: string[] = ["繪圖", "聲音"];

/** Series order within `kind: "agent"`. */
export const SAM_AGENT_SERIES_ORDER: string[] = ["總管", "子代理", "流程"];

/**
 * Keep in sync when shipping a new `sampot/pg-*` (or other) SAM.
 * Page groups by kind → series.
 */
export const samCatalog: SamEntry[] = [
  {
    repo: "pg-steward",
    title: "總管",
    kind: "agent",
    series: "總管",
    blurb:
      "總管遊樂場的專屬 Agent，負責執行你交辦的任務，包括開發單頁小程式。需要自備 LLM API Key。",
  },
  {
    repo: "pg-llm-agent",
    title: "Coding Agent",
    kind: "agent",
    series: "子代理",
    blurb:
      "BYOK coding agent（編排子代理）。改 .agent/system.md 調人格；密鑰走密鑰庫；可多份 clone。",
  },
  {
    repo: "pg-workflow",
    title: "工作流程",
    kind: "agent",
    series: "流程",
    blurb:
      "有狀態多步驟 workflow（workflow.v1）；狗糧為內容審核，實例活在 Agent 沙盒。",
  },
  {
    repo: "pg-wfedit",
    title: "流程視覺編輯",
    kind: "tool",
    series: "流程",
    blurb:
      "垂直主軸編輯 workflow.yaml（workflow.v1）；掛成工具寫宿主定義，不跑引擎。",
  },
  {
    repo: "pg-dbtool",
    title: "SQLite 資料庫",
    kind: "tool",
    series: "資料",
    blurb:
      "檢視與修改工作沙盒 env.DB；grant .bindings/db，表列／分頁／SQL 主控台。",
  },
  {
    repo: "pg-hashlab",
    title: "雜湊小算",
    kind: "tool",
    series: "協定",
    blurb: "SHA／MD5／可選 HMAC；文字或檔案，資料不離開瀏覽器。",
  },
  {
    repo: "pg-jwtpeek",
    title: "JWT 窺視",
    kind: "tool",
    series: "協定",
    blurb: "解碼 header／payload、過期提示；可選本機 HMAC 驗證。",
  },
  {
    repo: "pg-regexlab",
    title: "正規式試場",
    kind: "tool",
    series: "資料",
    blurb: "JavaScript RegExp：旗標、相符列表、取代。",
  },
  {
    repo: "pg-cronread",
    title: "Cron 解讀",
    kind: "tool",
    series: "環境",
    blurb: "五／六欄表達式解讀與接下來觸發時間。",
  },
  {
    repo: "pg-jsonfmt",
    title: "JSON 整形",
    kind: "tool",
    series: "資料",
    blurb: "pretty／minify、簡易路徑查詢、錯誤定位。",
  },
  {
    repo: "pg-idmint",
    title: "識別碼小造",
    kind: "tool",
    series: "環境",
    blurb: "UUID v4／NanoID 批量產生。",
  },
  {
    repo: "pg-textdiff",
    title: "文字對照",
    kind: "tool",
    series: "資料",
    blurb: "左右貼上，行級 diff。",
  },
  {
    repo: "pg-mdpreview",
    title: "Markdown 預覽",
    kind: "tool",
    series: "前端",
    blurb: "GFM、Mermaid、數學公式；可掛成工具檢視工作沙盒的 .md。",
  },
  {
    repo: "pg-htmlpreview",
    title: "HTML／CSS 預覽",
    kind: "tool",
    series: "前端",
    blurb: "片段即時預覽；可掛成工具檢視工作沙盒的 .html。",
  },
  {
    repo: "pg-svglook",
    title: "SVG 檢視",
    kind: "tool",
    series: "前端",
    blurb: "縮放、viewBox、data URL；可掛成工具檢視工作沙盒的 .svg。",
  },
  {
    repo: "pg-yamlfmt",
    title: "YAML 整形",
    kind: "tool",
    series: "資料",
    blurb: "驗證與 pretty；可掛成工具編輯工作沙盒的 .yml／.yaml。",
  },
  {
    repo: "pg-urlkit",
    title: "URL／Query 工坊",
    kind: "tool",
    series: "協定",
    blurb: "解析／組裝 URL、編輯 query、encodeURIComponent。",
  },
  {
    repo: "pg-contrast",
    title: "對比度檢查",
    kind: "tool",
    series: "前端",
    blurb: "前景／背景色票，WCAG AA／AAA（一般與大字）。",
  },
  {
    repo: "pg-cssunits",
    title: "CSS 單位小算",
    kind: "tool",
    series: "前端",
    blurb: "px↔rem、clamp() 字串與視窗寬預覽。",
  },
  {
    repo: "pg-imglook",
    title: "圖片／data URL",
    kind: "tool",
    series: "前端",
    blurb: "尺寸、MIME、複製 data URL；可掛成工具開工作沙盒圖檔。",
  },
  {
    repo: "pg-mockdata",
    title: "假資料小造",
    kind: "tool",
    series: "資料",
    blurb: "依簡易 schema 產 JSON；可選種子重現。",
  },
  {
    repo: "pg-jsondiff",
    title: "JSON 結構對照",
    kind: "tool",
    series: "資料",
    blurb: "路徑級新增／刪除／變更；可掛成工具對照工作沙盒 .json。",
  },
  {
    repo: "pg-ogpreview",
    title: "OG／meta 預覽",
    kind: "tool",
    series: "前端",
    blurb: "從 HTML head 模擬社群分享卡；可掛工具看 index.html。",
  },
  {
    repo: "pg-qrcode",
    title: "QR Code",
    kind: "tool",
    series: "前端",
    blurb: "文字／URL 產碼、下載 PNG。",
  },
  {
    repo: "pg-textkit",
    title: "文字小工",
    kind: "tool",
    series: "前端",
    blurb: "HTML entity 編解碼、slug。",
  },
  {
    repo: "pg-tomlfmt",
    title: "TOML 整形",
    kind: "tool",
    series: "資料",
    blurb: "驗證與 pretty；可掛成工具編輯工作沙盒的 .toml。",
  },
  {
    repo: "pg-csvjson",
    title: "CSV ↔ JSON",
    kind: "tool",
    series: "資料",
    blurb: "分隔符／標頭互轉；可掛成工具開 .csv。",
  },
  {
    repo: "pg-envkit",
    title: ".env 工坊",
    kind: "tool",
    series: "環境",
    blurb: "解析、遮罩、匯出；非密鑰庫。可掛工具開 .env。",
  },
  {
    repo: "pg-sqlfmt",
    title: "SQL 整形",
    kind: "tool",
    series: "資料",
    blurb: "pretty（不執行）；可掛成工具開 .sql。",
  },
  {
    repo: "pg-httpmsg",
    title: "HTTP 訊息工坊",
    kind: "tool",
    series: "協定",
    blurb: "貼 raw request／response，拆 headers 與 body。",
  },
  {
    repo: "pg-httpref",
    title: "HTTP 速查",
    kind: "tool",
    series: "協定",
    blurb: "常見狀態碼與 MIME 速查。",
  },
  {
    repo: "pg-pempeek",
    title: "PEM 窺視",
    kind: "tool",
    series: "協定",
    blurb: "憑證 subject／SAN／效期；不做信任鏈驗證。",
  },
  {
    repo: "pg-netcid",
    title: "IP／CIDR 小算",
    kind: "tool",
    series: "協定",
    blurb: "IPv4 網段、廣播、可用主機數。",
  },
  {
    repo: "pg-semver",
    title: "Semver 對照",
    kind: "tool",
    series: "環境",
    blurb: "比較與 ^／~ 範圍；可掛工具讀 package.json。",
  },
  {
    repo: "pg-chmod",
    title: "Unix 權限",
    kind: "tool",
    series: "環境",
    blurb: "rwx ↔ 八進位、umask 提示。",
  },
  {
    repo: "pg-unilook",
    title: "Unicode 檢視",
    kind: "tool",
    series: "環境",
    blurb: "code point、UTF-8 bytes、BOM／換行偵測。",
  },
  {
    repo: "pg-ignoregen",
    title: "gitignore 小造",
    kind: "tool",
    series: "環境",
    blurb: "勾選常見堆疊產 .gitignore 片段。",
  },
  {
    repo: "pg-basecodec",
    title: "Base 編解碼",
    kind: "tool",
    series: "協定",
    blurb: "Base64／URL-safe／Base32／Base58；資料不離開瀏覽器。",
  },
  {
    repo: "pg-pyrun",
    title: "瀏覽器 Python",
    kind: "tool",
    series: "環境",
    blurb: "Pyodide 執行 Python、micropip 套件、可分享連結。",
  },
  {
    repo: "pg-tzlook",
    title: "時區對照",
    kind: "tool",
    series: "日常",
    blurb: "Unix epoch／ISO 與多個 IANA 時區。",
  },
  {
    repo: "pg-colorcast",
    title: "色票互轉",
    kind: "tool",
    series: "日常",
    blurb: "hex／rgb／oklch 互轉與取色。",
  },
  {
    repo: "pg-skyburst",
    title: "蒼穹連射",
    kind: "game",
    series: "精緻可玩",
    blurb: "垂直捲軸射擊：三戰區、武裝升級、爆散與首領彈幕。",
  },
  {
    repo: "pg-breakout",
    title: "打磚塊",
    kind: "game",
    series: "街機",
    blurb: "擋板反彈清磚，過關加速；致敬打磚塊玩法類型。",
  },
  {
    repo: "pg-starshot",
    title: "星屑出擊",
    kind: "game",
    series: "街機",
    blurb: "固定畫面太空射擊，幾何機體與波次敵人。",
  },
  {
    repo: "pg-mazeglow",
    title: "迴廊拾光",
    kind: "game",
    series: "街機",
    blurb: "迷宮撿光點、躲開或反制追逐者。",
  },
  {
    repo: "pg-leaptrail",
    title: "躍階旅人",
    kind: "game",
    series: "街機",
    blurb: "短關平台跳躍：撿星、踩敵、抵達旗幟。",
  },
  {
    repo: "pg-moletap",
    title: "地洞敲敲",
    kind: "game",
    series: "懷舊",
    blurb: "夜市節奏敲擊，連擊加分；致敬打地鼠玩法類型。",
  },
  {
    repo: "pg-banqi",
    title: "暗棋對弈",
    kind: "game",
    series: "懷舊",
    blurb: "翻子吃子，簡易人機；華語圈暗棋小品。",
  },
  {
    repo: "pg-jungle",
    title: "鬥獸棋",
    kind: "game",
    series: "懷舊",
    blurb: "獸穴、陷阱、河界跳躍，簡易人機。",
  },
  {
    repo: "pg-wingrace",
    title: "翼途競飛",
    kind: "game",
    series: "懷舊",
    blurb: "簡化飛行棋：擲骰起飛、撞回、終點跑道。",
  },
  {
    repo: "pg-pinfall",
    title: "釘雨落珠",
    kind: "game",
    series: "機台",
    blurb: "發射、撞釘、入洞得分；致敬小鋼珠玩法類型。",
  },
  {
    repo: "pg-mali",
    title: "小瑪莉",
    kind: "game",
    series: "機台",
    blurb: "復古燈圈跑燈：押注、跑燈、結算；純娛樂。",
  },
  {
    repo: "pg-gomoku",
    title: "五子棋",
    kind: "game",
    series: "桌遊",
    blurb: "15×15 雙人／人機／AI 對 AI。",
  },
  {
    repo: "pg-tictactoe",
    title: "井字遊戲",
    kind: "game",
    series: "桌遊",
    blurb: "3×3 雙人、人機與 AI 對 AI（Minimax）。",
  },
  {
    repo: "pg-inkbloom",
    title: "墨暈流紋",
    kind: "toy",
    series: "生成",
    blurb: "點按拖曳留下粒子墨跡，看流紋慢慢長出來。",
  },
  {
    repo: "pg-bounceland",
    title: "彈珠沙盒",
    kind: "toy",
    series: "模擬",
    blurb: "點按加球，簡易重力與彈跳；不是物理引擎。",
  },
  {
    repo: "pg-cellife",
    title: "生命格子",
    kind: "toy",
    series: "模擬",
    blurb: "康威生命遊戲：點畫細胞、演化、隨機與清空。",
  },
  {
    repo: "pg-diginet",
    title: "數字透網",
    kind: "toy",
    series: "模擬",
    blurb: "手寫數字走小型神經網路：訊號粒子、節點呼吸、機率條與權重熱圖。",
  },
  {
    repo: "pg-logigate",
    title: "邏輯閘沙盒",
    kind: "toy",
    series: "模擬",
    blurb: "開關、AND／OR／NOT、LED 接線；半加器範例，看 0／1 沿線流動。",
  },
  {
    repo: "pg-sketchpad",
    title: "素描板",
    kind: "media",
    series: "繪圖",
    blurb: "顏色、筆粗、復原與匯出 PNG；極簡畫布。",
  },
  {
    repo: "pg-wavepad",
    title: "波形叮叮",
    kind: "media",
    series: "聲音",
    blurb: "Web Audio 振盪器與即時波形；點播放才發聲。",
  },
  {
    repo: "pg-voicelab",
    title: "聲語匣",
    kind: "media",
    series: "聲音",
    blurb: "瀏覽器 TTS／STT：念文字、聽說話、回聲一句。",
  },
];

/** `?open=` source for a catalog repo under sampot/. */
export function samOpenSource(repo: string): string {
  return `sampot/${repo}`;
}

/**
 * One-click open from the blog catalog.
 * Uses the transitional blog mount until `play.samkuo.me` is deployed
 * (Phase 4). Share/copy links use {@link buildCanonicalOpenUrl} (DEC-041／042).
 */
export function samOpenHref(entry: Pick<SamEntry, "repo" | "title">): string {
  const params = new URLSearchParams({
    open: samOpenSource(entry.repo),
    name: entry.title,
  });
  return `/playgrounds/?${params.toString()}`;
}

/** Formal-field open URL (subdomain root). Prefer after Phase 4 cutover. */
export function samOpenCanonicalHref(
  entry: Pick<SamEntry, "repo" | "title">
): string {
  return buildCanonicalOpenUrl(samOpenSource(entry.repo), {
    name: entry.title,
  });
}

export function samGithubHref(repo: string): string {
  return `https://github.com/sampot/${repo}`;
}

/**
 * Curated picks for Playgrounds「玩玩看」(display order).
 * Prefer instantly playable games; mix one toy + one tool so the shelf
 * doesn't read as arcade-only.
 */
export const SAM_PLAYGROUNDS_PICK_REPOS: readonly string[] = [
  "pg-skyburst",
  "pg-breakout",
  "pg-moletap",
  "pg-banqi",
  "pg-inkbloom",
  "pg-hashlab",
];

/** Resolve curated pick repos against the catalog (skips unknown repos). */
export function samPlaygroundsPicks(
  catalog: readonly SamEntry[] = samCatalog,
  repos: readonly string[] = SAM_PLAYGROUNDS_PICK_REPOS
): SamEntry[] {
  const byRepo = new Map(catalog.map(e => [e.repo, e]));
  const out: SamEntry[] = [];
  for (const repo of repos) {
    const entry = byRepo.get(repo);
    if (entry) out.push(entry);
  }
  return out;
}

/** True when sandbox `meta.source` looks like a sampot catalog open. */
export function isSampotCatalogSource(
  source: string | null | undefined
): boolean {
  if (!source) return false;
  const s = source.trim().toLowerCase();
  return (
    s.startsWith("sampot/") ||
    s.includes("github.com/sampot/") ||
    s.includes("gitlab.com/sampot/")
  );
}

function seriesOrderFor(kind: SamKind): string[] {
  switch (kind) {
    case "tool":
      return SAM_TOOL_SERIES_ORDER;
    case "agent":
      return SAM_AGENT_SERIES_ORDER;
    case "game":
      return SAM_GAME_SERIES_ORDER;
    case "toy":
      return SAM_TOY_SERIES_ORDER;
    case "media":
      return SAM_MEDIA_SERIES_ORDER;
  }
}

export type SamSeriesBlock = {
  series: SamSeries;
  entries: SamEntry[];
};

export type SamKindBlock = {
  kind: SamKind;
  label: string;
  seriesBlocks: SamSeriesBlock[];
};

/** kind → series → entries (empty kinds omitted). */
export function samCatalogByKind(): SamKindBlock[] {
  return SAM_KIND_ORDER.map(kind => {
    const inKind = samCatalog.filter(e => e.kind === kind);
    const preferred = seriesOrderFor(kind);
    const seen = new Set<string>();
    const seriesBlocks: SamSeriesBlock[] = [];

    for (const series of preferred) {
      const entries = inKind.filter(e => e.series === series);
      if (!entries.length) continue;
      seen.add(series);
      seriesBlocks.push({ series, entries });
    }
    for (const entry of inKind) {
      if (seen.has(entry.series)) continue;
      seen.add(entry.series);
      seriesBlocks.push({
        series: entry.series,
        entries: inKind.filter(e => e.series === entry.series),
      });
    }

    return {
      kind,
      label: SAM_KIND_LABEL[kind],
      seriesBlocks,
    };
  }).filter(block => block.seriesBlocks.length > 0);
}
