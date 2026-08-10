# Playgrounds 遊玩 analytics（純玩版）

> **狀態：** Draft（2026-08-10）— 契約／階段草案；未實作
> **權威決策：** 尚未立 DEC（草案預留 **DEC-053**：自建輕量游戲 analytics；不以第三方分析／邊緣日誌為主路徑）
> **相關：** [PG-GO-CLIENT-PLAN.md](./PG-GO-CLIENT-PLAN.md)（純玩版 `go.samkuo.me`；`/s/` 傳閱）、[PG-PLATFORM-API-PLAN.md](./PG-PLATFORM-API-PLAN.md)（`api.samkuo.me`）、[PG-PLATFORM-DASH-SPEC.md](./PG-PLATFORM-DASH-SPEC.md)（後台 UI）、DEC-050（純玩）、DEC-007（勿預設加追蹤腳本）、[DG-DASH-SPEC](./PG-PLATFORM-DASH-SPEC.md)

一句話：**go 純玩 `/s/<id>` 以客戶端事件記錄「每項小品 play 幾次、平均可見時長、DAU」；涵蓋 listed 與 unlisted 遊戲；事件先寫 IndexedDB，上線後 batch 上傳 Platform API（公開聚合，無原始 log 外洩）；dash 提供 admin「玩具分析」檢視——不用 CF Web Analytics（PWA 離線／換片不進邊緣日誌）、不引入第三方分析。**

---

## 1. 動機

- 想知道**每款遊戲（listed 與 unlisted）受歡迎程度**：**有人玩**（次數／態勢）與**平均玩多久**。
- **CF Web Analytics 不適用（已否決）：** go 是 PWA；SW 會 cache `/`／`/s/` 殼與造訪過的 SAM（DEC-050 §6.5），且 SPA **換片不重新打 HTML**。很多「再開一局／換下一顆」與**離線局**根本不會進 Cloudflare → 邊緣日誌系統性低估實際遊玩，且拿不到時長。
- 站群慣例（DEC-007）傾向不預設塞追蹤腳本；go 語意「純玩、無帳號、資料盡量本機」也與第三方 SaaS 分析衝突。
- 因此採**自建輕量**：客戶端打點 → Platform API 聚合 → dash 檢視。

## 2. 目標

- **每項遊戲**（listed `/s/<catalog_id>` **及 unlisted**）：**play 次數**、**平均遊玩時長**（Session 彙總）、**DAU**。
- PWA 離線不漏：**事件先落 IndexedDB，恢復網路批量上傳**。
- 隱私克制：**不**存原文事件（IP 等）於公開面；不傳使用者身份；`/i/` 不計「玩」。
- Dash：admin 可看**總表**（`catalog_id | plays | avg_duration_sec | 今日 DAU`，可選時間窗）與**日趨勢**（DAU 為日級）。
- 不引入第三方分析 SDK／服務。

## 3. 非目標

- 全產品行為分析（funnel、session replay、熱圖、跨裝置歸因）。
- **留存率**級別計算（DAU 算日層級，不做 cohort／留存）。
- **邊緣／CF Web Analytics 當主路徑**（硬否決：PWA 漏算）。
- 在 `/i/`（Invite，臨時局）計「玩」；把 Go `?open=`／場殼編輯面當遊玩受歡迎度。
- 公開原始 log 存取（dash 僅看聚合；原始事件不留公開）。
- 用 cookies ／跨站指紋識別使用者（可用 `sessionStorage` 隨機 ID 去重，不跨裝置）。
- 把 analytics 做成「營運計費」或與點數系統耦合。

---

## 4. 模型

| 概念 | 意思 |
| --- | --- |
| **play 事件** | `play_start`（畫布 boot 成功）+ `play_end`（結束／hidden／換片；可見時長）。成對計 1 次 play。 |
| **listed / unlisted** | `listed`＝該 `/s/<id>` 的 SAM 在 catalog 有 entry；unlisted 無 entry（仍公開可玩、只是不出現在型錄）。**兩者都計 plays／時長／DAU**；`listed` 旗標只用作 dash 分類與型錄對照。 |
| **session_id** | `sessionStorage` 隨機 UUID；同一次開頁的連貫「態勢」。用於粗略去重即可，不綁帳號。 |
| **total** | 彙總 `play_start` 筆數（≈ play 次數）。 |
| **態勢（unique sessions）** | 去 `session_id` 看「不同開頁」做為「有幾個人玩過」的近似。 |
| **avg_duration** | `Σ play_end.duration_ms / play_end 筆數`（可見時間）。 |
| **DAU** | 日級：當日「至少 play_start 過一次」的**去重 session**（**listed 與 unlisted 都算**）。以 `session_id` 之 hash 去重，**不跨日累積**。 |

### 4.1 事件

| 事件 | 時機（`/s/<id>` 模式 B only） | payload |
| --- | --- | --- |
| `play_start` | 畫布 **boot 成功**（`status.phase === "ready"` 且 `canvasUrl`／`canvasSrcdoc` 出現）；**listed 與 unlisted 都送** | `{ catalog_id, kind, session_id, t0, listed: bool }` |
| `play_end` | 離開頁／`visibilitychange→hidden`／換片；只計**可見**時長 | `{ catalog_id, duration_ms, session_id }` |

- **換片（§5.6）：** A 收尾（`play_end`）+ B 開始（`play_start`）。
- boot 未完成就離開 → 不計（無 `play_start` 就不發 end）。
- `/i/`、首頁 `/`、`/help` **不**打 `play_start`（非「玩」）。
- **unlisted 判定**：catalog 無 entry（`go-sdk` 查不到）仍能 boot → 以 `listed:false` 送 `play_start`；次數／時長／DAU 照計。

### 4.2 離線 queue

新模組 `goAnalytics.ts`：
- IndexedDB store **`go-analytics-v1`**（`{ id, ts, event, catalog_id, duration_ms, session_id }`）。
- 上傳 **`navigator.sendBeacon`**（`/v1/analytics/batch`，一次多筆）。
- 瀏覽器 **`online`** 事件／定時 flush；離線時留在 IDB，`sendBeacon` 失敗回填。
- 注：SW 已 cache `/s/` 首包與 SAM，**POST 不被 cache**——只有實際 `online`（fetch 成功）才 flush；弱網下不阻塞遊玩。

---

## 5. Platform API（`platform-api/`，同一 Worker）

### 5.1 資料存法（回合計，非逐筆）

仿 `credits.ts` 的 KV 聚合 pattern；**不加 D1**（維持 Platform 現狀＝KV）。

```
analytics:byGameTotal:<catalog_id>
  → { playStarts, playEnds, sessionSeconds, sessions:{ [sessionHash]: true } }

analytics:byGameDay:<YYYY-MM-DD>:<catalog_id>
  → { playStarts, playEnds, sessionSeconds, sessions:{ [sessionHash]: true } }
```

- **自己 key 連動**：`sessions` 收當日「至少 play_start 過一次」的 session（**listed 與 unlisted 都收**；跨遊戲同日重玩去重，一 session 一 key）。
- **公開寫入只 append 聚合**：不暴露原文事件給對方；批次內做 nonce╱上限防灌。
- `sessionHash`＝`session_id` 的 hash（不存原文）；一 `day` 內同 session 只留一 key（次數用 `playStarts` 計，**DAU 用日 key 的 `sessions` key 數**）。
- 寫入採 atomic-ish（KV `put` 讀－改－寫；低並發即接受；超限時丟棄最舊）。

### 5.2 Endpoint

| 方法 | 路徑 | 認證 | 用途 |
| --- | --- | --- | --- |
| `POST /v1/analytics/batch` | 公開（go）；限流 | 收 `{ events:[...] }`，累加到日／總聚合 |
| `GET /v1/analytics/games` | `requireAccessToken`，**admin** | Dash 讀總表（含 DAU 日列） |
| `GET /v1/analytics/games?days=30` | 同上 | 聚合最近 N 日（依日索引；回傳每遊戲每日的 `plays｜dauc｜avg_duration_sec`） |

- **公開寫僅聚合**：不回傳原始事件。
- 限流／防灌：批次 size cap（例如 ≤50）、單 IP 每秒滑窗、event 結構白名單（`catalog_id` 長度、`duration_ms` 上限、`kind` 白名單）。不為 analytics 引入後台 session 邏輯。
- **認證**：讀走既有 `requireAccessToken`＋`admin`；寫為公開（與「logout 後離線 flush 仍須能上傳」矛盾最小）。
- **DAU 彙總**：`GET ?days=N` 的每行併 `{ day, dauc }`；site-wide DAU＝當日跨遊戲 `sessions` 聯集（listed＋unlisted）。僅回傳聚合，無 session 明文。

### 5.3 檔案落點

```
platform-api/src/analytics.ts   # KV 聚合（read/write/batch）
platform-api/src/analytics.test.ts
platform-api/src/index.ts        # 接兩條 route：POST /v1/analytics/batch、GET /v1/analytics/games
```

---

## 6. Dash（`platform-api/dash/src/routes/+page.svelte`）

- 新增 admin tab「**玩具分析**」（仿「營運」掛 `isAdmin`）。
- 用既有 `api()` helper → `GET /v1/analytics/games`。
- 桌面：
  `catalog_id | plays | avg_duration_sec | DAU(近日 | 今日) | unlisted 標記 | 每日趨勢(可選)`
- 行動優先：桌型、窄屏可讀；不引入 hover 圖表依賴。
- **unlisted 顯示**：首列可切「全部／listed／unlisted」filter；unlisted 列標「未列入」。

### 6.1 新 type（`dash/src/lib/api.ts`）

```ts
export type GameAnalyticsRow = {
  catalog_id: string;
  listed: boolean;
  plays: number;
  unique_sessions?: number;
  avg_duration_sec: number;
  day?: string; // when ?days= used
  dauc?: number; // DAU 當日值（?days= 時每列）
};
```

---

## 7. 驗收

- 離線開兩局（A listed、B unlisted）各自 boot → 關閉 → 回網 → 上傳 → Dash 見 **2 plays** + 平均時長 + 當日 **DAU=2**（A、B 分屬兩個 session）；同 session 連開兩局則 **DAU=1**（去重）。
- `/s/<id>` 換片 → 前一局 `play_end`、後一局 `play_start` 皆上傳。
- **unlisted**（catalog 無 entry）：照計 plays／時長／DAU；Dash 標「未列入」。
- `/s/<id>` 同 session 二次 play_start（listed／unlisted 皆同）→ 當日 DAU 仍 1（去重）。
- `/i/`、`/`、`/help` **不**產生 `play_start`。
- `GET /v1/analytics/games` 非 admin → 403；未登入 → 401。
- 不含原文 IP／session 明文到公開面。

## 8. 落地順序

1. go `goAnalytics.ts`（IDB + batch + `sendBeacon`；`listed` 判定）→ `/s/` boot／visibility 埋點。
2. Platform `analytics.ts`（KV 聚合：總＋日；`sessions` 收 listed＋unlisted）＋兩條 route＋rate-limit；DAU＝日 `sessions` key 數。
3. Dash「玩具分析」tab（`api.ts` type + 桌；listed／unlisted filter + DAU 列）。
4. 測試（單元：聚合、限流、同日同 session 去重；手測離線→上線＋unlisted）。
5. （後段）site-wide DAU、`days` 時間窗（若需要）。

## 9. 開放決策（起草時未定）

- **態勢去重是否要**（`sessions` hash 近似「有幾個人玩」）— 決定是否留 `session_id`。
- **公開寫 vs API-key 寫**：公開最簡單，但 logout 後離線 flush 是公開；若要求計費級鑑別，改掛 API key（但與「無帳號純玩」衝突）。
- **Dash 只要總表或日趨勢** — 影響是否建日索引。（本次已含日索引：DAU 需日級。）

> 本版已決定：**涵蓋 listed＋unlisted**（unlisted 計 plays／時長），並加入 **DAU**（listed＋unlisted 皆計，日級去重）。
