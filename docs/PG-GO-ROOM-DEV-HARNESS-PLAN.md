# Playgrounds 純玩版：包廂 localhost 開發／Agent harness

> **狀態：** Draft（2026-08-21）— Phase **0–4 landed**（閘／`__goRoomDev`／`dev_mint`／`dev_join`／README）；orchestrator／`session_play` 劇本仍延後；**契約從屬** [PG-GO-ROOM-PLAN.md](./PG-GO-ROOM-PLAN.md)（產品路徑不放寬）；**不另開 DEC**  
> **權威決策：** 從屬 [DECISIONS.md](./DECISIONS.md) **DEC-050**（純玩版）、**DEC-047**（Platform Invite）、**DEC-052**（go 通行證／記憶體 field API key）  
> **相關：** [PG-GO-ROOM-PLAN.md](./PG-GO-ROOM-PLAN.md)、[PG-GO-ROOM-PLAY-PLAN.md](./PG-GO-ROOM-PLAY-PLAN.md)（`session_play` 驗收可建於此）、[PG-GO-AUTH-PLAN.md](./PG-GO-AUTH-PLAN.md)、[PG-GO-CLIENT-PLAN.md](./PG-GO-CLIENT-PLAN.md)、既有傳檔隔離面 `go-client/src/routes/dev/room-xfer/`（**勿混**）、`.cursor/rules/no-native-dialogs.mdc`、`.cursor/rules/mobile-first-ux.mdc`、[GLOSSARY.md](./GLOSSARY.md)

一句話：在 **`go:dev`（localhost）** 讓 AI Agent／腳本**免 SSO** 進入主持登入態、**自動鑄門牌**、並用**另一個瀏覽器 tab** 走真產品路徑 `/i/<short>` 進同一間包廂——**預設打正式 `api.samkuo.me`，不強迫開 `platform:dev`**。

---

## 1. 動機

- 包廂快樂路徑＝Host `/room` 鑄 `invite.room` → Guest 開 `/i/<short>` 同意 → WebRTC。人測要登入＋掃／貼門牌＋同意，對 **Cursor／瀏覽器 Agent** 很脆。
- SSO（dash Google／LINE）不適合當 Agent 主路徑。
- 多 tab 協調需要**可讀狀態**（門牌 URL、phase、人數）與**可選自動同意**，否則 Agent 只能猜 DOM 文案。
- 既有 [`/dev/room-xfer`](../go-client/src/routes/dev/room-xfer/) 用 BroadcastChannel **繞過** Platform——適合傳檔壓力；**不**適合驗真 mint／signaling／`session_play`。

---

## 2. 目標

- **Host 免 SSO：** localhost 可注入既有 field API key（或 `#pg_provision=`），進入與正式登入相同的 `goAuth` 態。
- **自動鑄門牌（可選）：** Host 開 `/room` 後可自動 `mintInviteAndAnswer`，露出可腳本讀取的門牌 URL。
- **Guest 自動進門（可選）：** 開門牌 URL 時可跳過同意 UI，直接 `consentAndPlay`。
- **真產品路徑：** mint／resolve／join／O／A 仍走 Platform；媒體／文字仍走 WebRTC。Guest 網址仍是 `/i/<short>`。
- **輕前置：** Agent runbook 預設只要 **`npm run go:dev`**；**不**要求 `platform:dev`。
- **完成依據（第一刀）：** 兩個 tab——Host 已登入＋門牌 live；Guest 已連線；Host 可見人數 ≥ 2（含主持）；全程無原生 dialog、無人工 SSO。

---

## 3. 非目標

- 改產品契約（兩個時鐘、第二台必須掃門牌、Guest 禁止 `replaceState` 成 `/room` 等）。
- 強迫或預設啟動 `platform:dev`；本地 Platform seed／`/v1/dev/provision`（可列為可選後段，非本刀）。
- 用 BroadcastChannel／假 PC **取代** 包廂進門 WebRTC（那是 room-xfer 的事）。
- 假 `loggedIn` 而不持真 API key（無法 mint／作答）。
- 生產 `go.samkuo.me` 啟用任何 auto-login／auto-join／dev query。
- 自動化 OAuth popup／redirect。
- 本刀實作 Playwright 套件或 CI 雲端瀏覽器（規格寫清；實作可後補）。
- 自動開相機／麥克風權限（可另段；第一刀文字／連線即可）。
- 把 raw `pg_sk_…` 放進可分享的 query／short_url。

---

## 4. 與既有通路（勿混）

| 流 | 是 | 不是 |
| --- | --- | --- |
| **本刀 room harness** | localhost 加速**真** `/room`＋`/i/`＋正式 Platform | 第二套邀請協定 |
| **`/dev/room-xfer`** | 傳檔／SW／Range 壓力；BC 信令 | 包廂產品／Invite／開局驗收 |
| **GO-INVITE** | `invite.compose` 拉遊戲 | 包廂門牌 |
| **`session_play`** | 包廂內開局（可建在本 harness 之上） | 本刀第一刀必做項 |

---

## 5. 前置與拓樸（硬）

### 5.1 Process

| 角色 | 預設 | 說明 |
| --- | --- | --- |
| **go** | **必開** `npm run go:dev` → `http://localhost:5174` | 頁 origin＝loopback；門牌經 `localizeInviteShortUrl` 改寫到本機 |
| **Platform API** | **預設正式** `https://api.samkuo.me` | 與現行 `platformApiOrigin()` 一致；CORS 已放行 localhost |
| **`platform:dev`** | **非必要** | 僅當改 Invite／signaling／DO，或要完全離線 Platform 時才開，並設 `VITE_PLATFORM_API_ORIGIN` |
| **dash** | **非必要** | 本刀跳過 SSO；人若要手動拿 key 才開 dash |

### 5.2 誰需要登入

| 角色 | 通行證 | 說明 |
| --- | --- | --- |
| **Host**（`/room`） | **需要** field API key | 才能 mint／answer loop |
| **Guest**（`/i/<short>`） | **不需要** | 包廂 Guest 本來就可不登入 |

### 5.3 多 tab 拓樸（硬）

對齊 ROOM §5.4／§6.4：

```text
Tab H  http://localhost:5174/room[?dev_…]     ← 主持；持 key；鑄門牌
Tab G  http://localhost:5174/i/<short>[?dev_…] ← 訪客；開**同一張**門牌
```

- **禁止**用第二個 `/room` 當「加入這一間」（那是另一間空包廂）。
- 門牌仍是 `invite.room`；Guest 進門後**留在** `/i/`。

---

## 6. 安全閘（硬）

下列全部為真才允許任何 harness 行為（否則當一般產品路徑；**忽略** dev query／hook）：

1. **建置：** `import.meta.env.DEV === true`（production／`go:build`／`go.samkuo.me` **編譯期不可達**或等價剔除）。
2. **執行期頁 origin：** `isLoopbackPageOrigin(location.origin)`（`localhost`／`127.0.0.1`／`*.localhost`）。
3. **不**因 query 存在就在正式 origin 啟用。
4. **`/dev/*` 路由**（若有 orchestrator）：production 建置 **404** 或不進 client bundle。
5. **產品路徑禁止**把 API key 寫進 URL query、門牌 short_url、或**正式 go** 的 `localStorage`（維持 DEC-052：產品 key＝頁／tab 記憶體＋`sessionStorage`）。**例外（僅 harness 閘）：** `localStorage.go_dev_field_api_key` 供 localhost 記住開發 key。

閘失敗＝靜默 no-op（不 flash「開發模式被拒」打擾人測正式 UX）。

---

## 7. Host 憑證（免 SSO）

### 7.1 權威儲存（已存在）

- 記憶體：`goAuth` 私有 `#apiKey`
- 同 tab 重整：`sessionStorage` key **`go_auth_api_key`**（見 `goAuth.svelte.ts`）
- 既有 redeem：`#pg_provision=<token>` → `initFromLocation`

### 7.2 提供 key（簡單路徑）

| 方式 | 作法 |
| --- | --- |
| **頁內記住（推薦）** | localhost SSO 登入一次 → Header「我的身分」→「**記住到本機**」→ 之後同瀏覽器開 `/room` 自動套用（`localStorage.go_dev_field_api_key`，**僅** harness 閘通過時） |
| **頁內貼上** | 未登入時 `/room` 頁底「開發通行證」貼 `pg_sk_…` →「套用並記住」（登入後改走「我的身分」） |
| **顯示／複製** | 已登入時：Header「我的身分」→「顯示／複製 key」 |
| **腳本** | `window.__goRoomDev.getApiKey()`／`setApiKey(key, { remember: true })` |
| **舊：sessionStorage** | 仍可用；不必再開 DevTools 當主路徑 |

**禁止** key 進 URL query／short_url／正式 go 的 localStorage。

### 7.3 `dev_login=1`

可選。閘通過且未登入時仍可走產品「登入」SSO，或腳本 `setApiKey`。

---

## 8. 自動鑄門牌與自動進門

### 8.1 Host：`dev_mint=1`

僅通過 §6 閘、且 Host 已持有效 key：

1. 進 `/room` 主面後呼叫既有 `mintInviteAndAnswer`（與人按「請人進來」同路徑）。
2. 成功後 `inviteDoor === "live"`，`shortUrl` 為 **localhost** 門牌（`localizeInviteShortUrl`）。
3. 若當下門牌已 live → **不**重複撤舊重鑄（對齊「同一時間最多一張有效」；回傳既有 URL）。

產品「按需鑄」契約：**人**開 `/room` 仍不自動鑄；僅 `dev_mint=1`（或 hook `mint()`）例外。

### 8.2 Guest：`dev_join=1`

僅通過 §6 閘：

| Query | 說明 |
| --- | --- |
| `dev_join=1` | resolve／preview 到 consent 後，自動 `consentAndPlay(name)` |
| `name`（可選） | 顯示名；缺省＝`Agent` 或 `Guest-<短隨機>`（穩定可測優先固定字串） |

- 失敗（過期／撤銷／連線失敗）→ 既有錯誤面；**不** retry 狂刷。
- **不**自動登入 Guest。

### 8.3 範例 Agent 劇本

```text
1. 寫入 Tab H sessionStorage.go_auth_api_key
2. 開 Tab H  → http://localhost:5174/room?dev_mint=1
3. 等 window.__goRoomDev.doorUrl（或 data-testid）
4. 開 Tab G  → {doorUrl}?dev_join=1&name=G1
5. 等 Tab H  __goRoomDev.peerCount >= 2（或 occupancy 等價）
6. （可選）再開 G2…；或主持觸發 session_play
```

---

## 9. 腳本面 API 與選擇器

### 9.1 `window.__goRoomDev`（僅 §6 閘通過時掛上）

對齊 room-xfer 的 `__roomXferHost`／`__roomXferGuest` 形狀；**不**進 SAM iframe。

```ts
type GoRoomDevApi = {
  role: "host" | "guest";
  /** roomRuntime／guestRuntime 對齊的粗 phase 字串 */
  phase: string;
  /** 主持側：localhost 門牌；Guest 側：目前 /i/ URL 或 null */
  doorUrl: string | null;
  /** 在場人數（含主持）；以既有 occupancy 為準 */
  peerCount: number;
  loggedIn: boolean;
  inviteDoor: "none" | "live" | "expired";
  mint(): Promise<{ shortUrl: string }>;
  /** Guest：若尚在 consent，觸發進門；已連線則 no-op */
  join(displayName?: string): Promise<void>;
  /** 輪詢就緒；逾時 throw */
  waitReady(opts?: { peerCount?: number; timeoutMs?: number }): Promise<void>;
  /** Host：套用 field API key（可選記住本機） */
  setApiKey(key: string, opts?: { remember?: boolean }): Promise<void>;
  /** 目前記憶體 field API key；無則 null */
  getApiKey(): string | null;
};
```

- Host／Guest **同一名稱**、依頁面 role 填欄位；避免 Agent 記兩套全域名。
- `dispose`／離頁清除 reference（防泄漏到錯誤頁）。

### 9.2 `data-testid`（穩定；少靠中文文案）

| testid | 何處 | 內容 |
| --- | --- | --- |
| `room-dev-phase` | Host／Guest 殼 | phase 字串 |
| `room-door-url` | Host（門牌 live 時） | 完整 localhost short URL |
| `room-peer-count` | Host／Guest | 數字字串 |
| `room-invite-door` | Host | `none`／`live`／`expired` |

既有產品文案 CTA 可保留；Agent **優先** testid／`__goRoomDev`。

---

## 10. 可選：`/dev/room` orchestrator

**非第一刀。** 若要單一入口：

- 路徑：`/dev/room`（僅 DEV＋loopback；production 404）。
- **只做協調**：顯示／複製 Host／Guest URL、可選 `BroadcastChannel` **只傳** `doorUrl`／`ready`（**不是**媒體／SDP）。
- **不**自己建 RTCPeerConnection；產品邏輯仍進 `/room`、`/i/`。

與 `/dev/room-xfer` 並列、勿共用 channel 名。

---

## 11. 與 Vitest／E2E 分層

| 層 | 工具 | 測什麼 |
| --- | --- | --- |
| 單元 | Vitest（既有） | `roomRuntime`／`guestRuntime`／席次／wire；**不**需真瀏覽器 |
| Harness 閘 | Vitest | `isGoRoomDevEnabled(origin, import.meta.env.DEV)`；query parse；**無** key 時 mint no-op |
| 多 tab | 本機 Agent／手測／後補 Playwright | 真 Platform＋真 PC |

本刀**不**把「必須綠的 CI」綁在真 WebRTC 多 tab 上（除非另開 CI 計劃）。

---

## 12. UX／產品面影響

- **正式 go：** 零可見變更。
- **localhost 無 query：** 與今日相同（仍可手動登入／請人）。
- **localhost + dev query：** 可自動鑄／自動同意；可選極簡「dev」狀態列（testid 用）——**不要**做成第二套產品 chrome。
- 仍遵守：無 `alert`／`confirm`／`prompt`；窄屏可用（Agent 不依賴 hover）。

---

## 13. 模組邊界（建議）

| 模組 | 職責 |
| --- | --- |
| `goRoomDev.ts`（新） | 閘、`parseGoRoomDevQuery`、`isGoRoomDevEnabled`；**無** DOM |
| `goRoomDevBind.ts` 或頁面薄綁 | 掛 `__goRoomDev`、testid、觸發 mint／join |
| `goAuth`／`roomRuntime`／`guestRuntime` | **盡量不改契約**；只被 bind 呼叫既有 public API |
| `go-client/README.md` | Agent runbook：只要 `go:dev`；如何注入 key；範例 URL |

TDD：先寫 `goRoomDev` 閘與 query 的失敗測試，再實作；bind 可薄、以手動／Agent 劇本驗收。

---

## 14. 階段

| Phase | 交付 | 完成依據 | 狀態 |
| --- | --- | --- | --- |
| **0. 規格** | 本文件；AGENTS／GLOSSARY／ROOM 交叉索引 | 契約閘與非目標清楚 | **Draft** |
| **1. 閘＋API 形** | `goRoomDev` 單元測綠；`__goRoomDev` 型別與掛載點 | DEV＋非 loopback → 無 hook | **landed** |
| **2. Host mint** | `dev_mint=1`＋`room-door-url`＋注入 key 劇本 | 單 tab 自動 live 門牌 | **landed** |
| **3. Guest join** | `dev_join=1`＋第二 tab 進門 | `peerCount >= 2` | **landed** |
| **4. 文件** | `go-client/README.md` Agent runbook | 無需 `platform:dev` 字樣為預設 | **landed** |
| **5. （可選）orchestrator** | `/dev/room` 只協調 URL | 不自建 PC | 延後 |
| **6. （可選）`session_play` 劇本** | 建在 3 之上；對齊 ROOM-PLAY | Host＋Guest 包廂內開五子棋 | 延後 |
| **7. （可選）local Platform seed** | `platform:dev`＋dev provision | 僅離線／改 API 時 | 延後 |

建議實作順序：**0 → 1 → 2 → 3 → 4**；5–7 不阻塞第一刀。

---

## 15. 凍結摘要（本文件）

1. **預設只要 `go:dev`；正式 `api.samkuo.me`；不強迫 `platform:dev`。**
2. **Harness 僅 DEV＋loopback；正式 go 零行為。**
3. **真 mint／signaling／WebRTC；禁止用 BC 冒充包廂進門。**
4. **第二 tab 只能開同一張 `/i/<short>`，禁止第二個 `/room` 當 join。**
5. **Guest 不需登入；Host 需真 field API key（注入，非假登入）。**
6. **禁止 API key 進 URL／short_url／正式 go 的 localStorage**；localhost harness 可用 `go_dev_field_api_key` 記住。
7. **`dev_mint`／`dev_join` 為開發例外；人測無 query 仍按需鑄、仍要同意。**

---

## 16. 修訂

| 日期 | 變更 |
| --- | --- |
| 2026-08-21 | 初版 Draft：localhost Agent harness；輕前置（無 platform:dev）；與 room-xfer 切界 |
| 2026-08-21 | Phase 1–4 landed：`goRoomDev`／`__goRoomDev`／`dev_mint`／`dev_join`／probe testid／README |
| 2026-08-21 | 頁內「開發通行證」：貼上／記住／複製；`localStorage.go_dev_field_api_key`（僅 loopback＋DEV） |
| 2026-08-21 | 已登入可從 Header「我的身分」顯示／複製 key；`__goRoomDev.getApiKey()` |
| 2026-08-21 | 移除 `/room` 頁底「開發通行證」面板（全螢幕表面看不見）；改 Header 專責 |
| 2026-08-21 | `/room` 未登入再顯示頁底貼上面板；登入後僅「我的身分」 |
