# Playgrounds 玩家主場鑄邀請（GO-INVITE）— 從遊戲中邀請對手對玩

> **狀態：** Draft（2026-08-16）— GO-INVITE 實作落地（DEC-053 `env.HOST`）；Phase 5 手測進行中  
> **權威決策：** 建議 [DECISIONS.md](./DECISIONS.md) **DEC-052**（§5.3 玩家主場互邀＝GO-INVITE；本文件實作之）  
> **相關：** [PG-GO-AUTH-PLAN.md](./PG-GO-AUTH-PLAN.md)（登入＋記憶體 field API key）、[PG-GO-CLIENT-PLAN.md](./PG-GO-CLIENT-PLAN.md)（純玩版；玩家主場）、[PG-GO-ROOM-PLAN.md](./PG-GO-ROOM-PLAN.md)（包廂＝`invite.room`，**不是**本刀 compose）、[PG-GO-ROOM-PLAY-PLAN.md](./PG-GO-ROOM-PLAY-PLAN.md)（包廂內開局＝重用 peer；**勿混**）、[PG-INVITE-E2E-MVP.md](./PG-INVITE-E2E-MVP.md)（五子棋 `gomoku.v1`；**作者面** Host 鑄邀請）、[PG-PLATFORM-API-PLAN.md](./PG-PLATFORM-API-PLAN.md)、[GLOSSARY.md](./GLOSSARY.md)  
> **載體 SAM：** 型錄 [`pg-gomoku`](../catalog/entries/pg-gomoku.yaml)（source [`sampot/pg-gomoku`](https://github.com/sampot/pg-gomoku)；`gomoku.v1`）

一句話：**登入 go 的玩家（玩家主場，DEC-050）在遊戲中開一局、對另一位玩家發出邀請；對手開 `https://go.samkuo.me/i/<short_id>` 入座對弈。** play 與 go **都可**鑄邀請；go 以玩家記憶體 field API key 走 `invite.compose`，並以 `env.HOST`（`createGoHostBinding`）主持 session。

> **產品路徑（2026-08）：** 連線對弈快樂路徑改為**包廂內** [`session_play`](./PG-GO-ROOM-PLAY-PLAN.md)（`pg_surface=room`）。go **`/s/<id>`**＝單機（`pg_surface=solo`）；`pg-gomoku` UI **不再**露出「邀請對弈」。本文件仍描述 `invite.compose`／`env.HOST` 能力（場殼／相容），**不是**五子棋玩家主場快樂路徑。

> **與作者面（場殼）的關係（不變）：** 場殼 play 仍是**作者 Host**；本刀把「Host 能力」**複製到 go 的玩家主場**——同一套 `invite.compose`＋`gomoku.v1`，但 Host＝已登入玩家、座落在 **go origin**。go **不**新增我的場／密鑰庫／後台／TURN 管理（見 §4 非目標）。

---

## 1. 動機

- **[PG-GO-AUTH-PLAN.md](./PG-GO-AUTH-PLAN.md) §5.3 把「玩家主場互邀（GO-INVITE）」列為後續**，並預告「go 會用同一把記憶體 field API key 走 `invite.compose`」。本文件把 GO-INVITE 具體化。
- **現況：** go 只能**做客**（`/i/` 入座）與**單機**（`/s/`）。玩家想「與人對戰」只能：
  1. 去場殼 play 開（但對方要作者的完整環境）；或
  2. 先 `go:dev` 之外另走一套。
  沒有「已登入玩家在 go 就能拉一位對手」的玩家對玩家路徑。
- **GO-INVITE 的價值：** 玩家主場自帶「開一局邀人來玩」——**不**要求對方有帳號、**不**要求對方進場殼。讓 go 真正成為「純玩也可與人對戰」的主場。
- **只動 go－Platform，不動場殼：** 鑄造 endpoint 已存在（`POST /v1/invites`，吃 field API key）；`gomoku.v1` 已存在；go 缺的是「用記憶體 key 代理鑄邀請＋在 go 側主持 Host session」。此為純 go-client＋極小 Platform 輔助，不該改 play 或 dash 行為。

---

## 2. 目標

- **已登入玩家在 go 的遊戲中發起邀請**：單局內「邀請對手」→ 鑄 `invite.compose` → 得 **`https://go.samkuo.me/i/<short>`** → 頁內分享面（QR／複製／系統分享，對齊 go §5.5 分享面）。
- **go 主持 Host session**：發起方＝`gomoku.v1` **host** 席；`/api/session/open` 開局 → 等待入座 → 選先手 →「開始」→ 輪流 `place` → 終局 →「再來一局」`reset`。
- **未註冊對方仍可加入**：對手開 `/i/<short>`→consent→**player** 席（既有 go Guest 主路徑，PG-GO-CLIENT-PLAN §9.2）。
- **憑證＝玩家記憶體 key**：`invite.compose` 由 go 以**玩家 A 的記憶體 field API key** 鑄造；`ownerUserId`＝玩家 A（伺服端由 key 派生）。關頁即失。
- **完成依據：** go 玩家 A（已登入、持記憶體 key）在 `pg-gomoku` 開一局 → 對玩家 A 發出邀請 → 玩家 B 開 `/i/<short>` 入座 → **雙方交替落子至終局**（`gomoku.v1` `place` 全路徑）。

---

## 3. 非目標

- **不**在 go 新增作者面：我的場／密鑰庫／後台／TURN 管理／作答獎懲（DEC-050 §6.2）。
- **不**改場殼 play / dash / Platform API 協定（鑄造、`gomoku.v1`、`/v1/field/me` 等已存在；除 §6.3 極小可選 CORS）。
- **不**為 go 另造第二套身分／第二套邀請協定；完全複用 `#pg_provision=`→記憶體 key→`invite.compose`。
- **不**把記憶體 key 持久化（維持關頁即失；對齊 DEC-052 §8）。
- **不**做「非登入玩家也能鑄邀請」——Guest（未登入）**不**能開啟 Host 席或鑄邀請（無 key）。
- **不**做多 peer／觀戰／完美斷線重連／雲存棋譜（對齊 E2E 鎖 1 Guest；go `/i/` 臨時生命週期）。
- **不**承諾 `/i/` 離線可玩（go 既有硬規則）。
- 本刀**不**改 `sampot/pg-gomoku` 的 `app.js` 流程（§7 只**補** go 畫布橋）；gomoku 的「邀請對手」CTA 已存在——它在 go 只需 `/api/shell/platform/invite` 能成功回應即可照走。
- **不**把包廂裡的開局做成 `invite.compose`（見 [PG-GO-ROOM-PLAN.md](./PG-GO-ROOM-PLAN.md) §5.9；落地 [PG-GO-ROOM-PLAY-PLAN.md](./PG-GO-ROOM-PLAY-PLAN.md)；本刀仍是「從遊戲中鑄門牌拉還沒在包廂的人」）。

---

## 4. 角色與分工（「玩家主場」的對照）

| 面 | Origin | 本刀角色 | 憑證 |
| --- | --- | --- | --- |
| **作者場** | `play.samkuo.me` | （不變）作者 Host 鑄邀請；**不**改 | 作者記憶體 API key |
| **玩家主場** | **`go.samkuo.me`** | **新增：** 已登入玩家 Host `gomoku.v1`＋**用同一把記憶體 key 鑄 Invite** | **玩家 A 記憶體 field API key**（DEC-052） |
| **受邀者** | `go.samkuo.me/i/<short>` | 既存 Guest 入座 → `player` 席 | 無帳號；僅 Invite secret＋短命 `join_cap` |
| **Platform API** | `api.samkuo.me` | 既存 `POST /v1/invites`＋`/v1/shorts`＋offer/answer | — |

**不變：** `go` 仍是純玩 origin（不是場）；登入不把 go 變「第二個場」。玩家 Host 能力**只在 go origin「玩家主場」語境**成立，完整作者面仍在場殼。

---

## 5. 流程（hard）

### 5.1 玩家 A —— in go（Host）
```text
玩家 A 登入 go（DEC-052：#pg_provision→redeem→記憶體 key；未登入→profile icon→dash /go/login）
  → 開 pg-gomoku（/s/pg-gomoku 單機或經型錄）
  → 切「邀請對弈」→ 開 session（/api/session/open；status=waiting）
  → 「邀請對手」→ go 畫布橋 POST /api/shell/platform/invite
       （goAuth 持記憶體 key → POST /v1/invites { kind:"invite.compose", intent, targetField=goOrigin }）
  → 得 { short_url: https://go.samkuo.me/i/<short>, ... }
  → go 頁內分享面呈現（QR／複製／系統分享；對齊 go §5.5）
  → 開作答循環（Platform Host answer loop；poll pending offer → accept → put answer）
  → 玩家 B 入座後 status=ready → A 選先手 →「開始」→ /api/session/act start → active
  → 輪流 place 至 ended；「再來一局」/api/session/act reset（ended→active）
  →「結束這一場」→ underground close ＋ fanout；撤 Invite（可選）
```
### 5.2 玩家 B —— in go（Guest，既有）
```text
開 https://go.samkuo.me/i/<short>（無帳號；QR 預設）
  → 純玩 SPA 解 short→secret→previewInvite（compose）
  → consent → join_cap → Guest offer → Host answer（go 側作答）→ roster
  → player 席 → ready（等待 A 開始）→ active → 輪流 place 至 ended
```
與 [PG-GO-CLIENT-PLAN.md](./PG-GO-CLIENT-PLAN.md) §9.2 / [PG-INVITE-E2E-MVP.md](./PG-INVITE-E2E-MVP.md) §6.2 **一字不差**（Guest 端零變更）。

### 5.3 `invite.compose` intent（go 側，與作者面五子棋同形）
```text
kind: invite.compose
intent:
  version: 1
  sam:
    source: sampot/pg-gomoku     # 型錄 pg-gomoku 的 source
    resolve: install_if_missing
    presentation: maximize_preview
  session:
    protocol: { …gomoku.v1 完整規格… }   # 完整 protocol 物件，非只 id
    role: player
    consent: always_ask
  transport:
    roster: { signal: true }
```
**差異僅 `targetField`：** 作者面用 `location.origin`（場）；go 用 **`goOrigin()`**（`https://go.samkuo.me` 或 local dev origin）— 使 `short_url` 固定組在 go、`deep_link` 指向 go。**其餘 intent 與 §5.3 作者面完全一致**，遂兩端邀請可互入座（相容）。

---

## 6. 變更清單

### 6.1 goAuth：對外提供「mint」能力（不暴露 raw key）
- 檔：`go-client/src/lib/goAuth.svelte.ts`。
- 現 `#apiKey` 為私有（無 getter，見探索 f5ee1a13）。**不可**直接暴露 raw `pg_sk_…` 給 SAM iframe（low-trust）。
- 新增 `goAuth.mintPlatformInvite(opts): Promise<MintResult>`：
  - 內部讀 `#apiKey`；無 key → throw `HostBridgeError("not_provisioned", …)`（配 `not_provisioned` 文案，對齊作者面）。
  - 對 `POST ${platformApiOrigin()}/v1/invites` 送 `Authorization: Bearer ${#apiKey}`，body＝`{ kind, intent, targetField: goOrigin(), ttlMs }`（`targetField` 固定 go）。
  - 回 `{ invite_id, short_url, deep_link, expires_at, secret }`。
- 兼顧「維持記憶體 only」：不進 storage；只在頁面生命週期存於 `#apiKey`；`pagehide` 清。
- **測試：** `go-client/src/lib/goAuth.test.ts` 補：有 key 的 mint 請求含正確 header／body／`targetField=goOrigin()`；無 key → `not_provisioned`；不持久化。

### 6.2 go 畫布橋：`/api/shell/platform/invite`（SAM iframe → go 代理）
go 的 `pg-gomoku` 在 iframe 內 `fetch("/api/shell/platform/invite", …)`（作者面同一形狀）。go 需在兩條畫布通道都攔下此路徑並代理到 `goAuth.mintPlatformInvite`：

- **SW 畫布**（`go-client/src/lib/goCanvas.ts` `dispatchGoCanvasApi`）：`path` 若是 `isShellPlatformApiPath`（複用 `src/components/playgrounds/shellPlatformHttp.ts` 的判斷）→ 呼叫新 `handleGoShellPlatformHttp(request, { createInvite })`（**複用** `handleShellPlatformHttp`，只是把 handler 接到 `goAuth`）。
- **Memory/srcdoc 畫布**（`go-client/src/lib/goMemoryCanvas.ts` `dispatchMemoryApi`）：同上補 `/api/shell/platform` 分支。
- **回應形狀**與作者面一致（`{ short_url, deep_link, expires_at, invite_id, secret }`），`pg-gomoku` 的 `onInviteOpponent` **讀 `created.short_url` 即可不改**；短網址呈現改由 go 頁內分享面接手（見 §6.4）。
- 目的窗口：`goCanvas`/`goMemoryCanvas` 需要拿到 goAuth 實例——`goAuth` 已是模組 singleton，直接 import 呼叫（runes 相容；`$state` 讀寫皆在 listener 內保底）。

> **為什麼不改 gomoku「呈現」：** gomoku 的 `/api/shell/platform/invite` 成功後，作者面由**殼**彈出 `PlatformInviteShareDialog`；go 側由 **go 頁**接手同樣的分享面（QR／複製／系統分享，`GoShareSheet`），**不用改 gomoku**。

### 6.3 Platform（極小，可選）
- 現況：`POST /v1/invites` 走 `requireApiKey`（field API key，`pg_sk_`）→ go 玩家 key **已可直接**用；`short_url` 組在 go（`goPublicOrigin`）；CORS `ALLOWED_ORIGIN` 已含 `*.samkuo.me`（go 在內）。
- **可選加固（非本刀必要）：** 若需「限定玩家主場鑄邀請僅在 go origin」或 per-kind 額度，可納入 DEC-051 scope 討論；本刀**不改**（維持最小、相容）。
- **驗證：** 不需改 Platform 即可走通（§10 手測）。只記錄「zero-change Platform」為驗收項。

### 6.4 go 頁內分享面（對齊 go §5.5）
- 檔：go-client 既有 `GoShareSheet.svelte`。新增「邀請對手」模式：
  - 網址＝**`https://go.samkuo.me/i/<short>`**（Invite 短鏈，**非** `/s/<id>` 型錄傳閱）。
  - 內容並列：**系統分享**（有 Web Share；`title`＝「邀請你對弈五子棋」等該 SAM title ＋ invite context）、**QR**（編碼該 `/i/<short>` HTTPS；接收端系統相機可掃）、**複製連結**。
  - title 用 `entry.title`（此處 `五子棋`）＋邀請語境；**不**用 `/s/` 同源泛稱。
  - 失敗（`not_provisioned`）→ 頁內提示「可從右上角登入後再邀請」；禁止 `alert`。
- 入口：由 gomoku /api/invite 成功事件觸發（§6.2 代理把 mint 結果回送給頁面 → 開 `GoShareSheet(invite)`），**取代** gomoku app.js 內嵌 `inviteBox`（go 側不顯示該 box，交由頁面 sheet）。

### 6.5 go 主持 Host session（玩家 A Host）
go 目前只有 Guest runtime（`guestRuntime.ts`）。玩家 A 開局須在 go 側建立 **Host session 權威**：

- **檔：** `go-client/src/lib/hostRuntime.ts`（新增；runes 對齊 `guestRuntime` 風格）。職責：
  - `/api/session/open`（經既有 `handleGoFunctionsApi`：`env.KV` 即 goWebKv，`catalog:<pg-gomoku>`）開局 → `status=waiting`；記 `channelName`。
  - 綁 Session event 通道（`/api/session/channel`）→ `onmatch.*` （`match.started`／`match.reset`／`match.status`／終局）fanout 給本頁 UI／iframed gomoku。
  - 開 Platform **Host answer loop**（複用 `startPlatformHostAnswerLoop`；`localPresence`＝玩家 A label）——抵 `guestRuntime` 的 Guest offer 側。
  - 「開始／再來一局」→ `/api/session/act`（`role:"host"`）──可經 go 頁按鈕或 gomoku UI 觸發（見 §6.6）。
  - 入座後 `ready`；玩家 A 落子視為 **host 席**（`/api/session/act place`，role=host）；Guest 落子走 Guest 既有 SessionBridge `act`。
- **關鍵差異 vs 作者面：** 作者面把 Host session 權威放**場殼 session 引擎**（`shellSessionHttp`）；go 用 **goFunctionsRuntime 的 `env.KV`（goWebKv，`catalog:<id>`）** 當 Host 權威——`pg-gomoku` 的 `functions.js` `env.KV(GOMOKU_STATE_KEY)` 已由 go 的 `env.KV` 提供（§6.5 go-web document）。**不需**場殼 session 引擎。
- **同一 `pg-gomoku`，兩個 runtime：** 玩家 A 頁＝`hostRuntime`（Host 席）；玩家 B `/i/` 頁＝`guestRuntime`（player 席）。`functions.js` 兩者共用；go 只注入不同「session bridge」與角色。

### 6.6 入口／UI（go 頁）
- `/s/pg-gomoku` 及 `/` 推薦進入 gomoku 時，若 `goAuth.isLoggedIn`：顯示「邀請對弈」入口（Chrome 或 game 內）。
- 未登入點「邀請對弈」→ `goAuth.login()`（既有整頁轉導 dash `/go/login`），返回後自動續。
- Host 後進度：`waiting`→（入座）`ready`→選先手→「開始」；「再來一局」；「結束這一場」（`/api/session/close`＋`hostRuntime` 停作答循環＋可 `revokePlatformInvite`）。全頁內、mobile-first、禁 `alert`。
- **可選（本刀手測即可）：** 若 gomoku 在 go 的「邀請對弈」CTA 已能直接作用（§6.2 橋成功），go 頁只需額外「登入才可用」閘與分享面；不強制加新遊戲內按鈕。

---

## 7. 成功準則（完成依據）

- [ ] **玩家 A（已登入）**在 `go.samkuo.me/s/pg-gomoku` 開局 → 「邀請對手」成功 → 得 `https://go.samkuo.me/i/<short>` → go 頁分享面可 QR／複製。
- [ ] **未登入玩家 A** 點「邀請對手」→ 導向登入；登入後可續（不阻擋單機 `/s/`）。
- [ ] **玩家 B**（無帳號）開 `/i/<short>` → consent → 入座 `player` 席 → `ready`。
- [ ] A 選先手 →「開始」→ `active`；**雙方輪流落子至五連終局**（`place` 全路徑，資料面走 WebRTC，**不**經 Platform 中繼）。
- [ ] 「再來一局」`reset`（ended→active，席仍在）；「結束這一場」clean close＋停作答循環。
- [ ] **記憶體 key**：重整／關頁後 key 消失；profile 依 localStorage 顯示（key 不殘留）。登出後無法再鑄（`not_provisioned`）。
- [ ] 窄屏可完成邀約／入座／落子；**無** `alert`／`confirm`／`prompt`。
- [ ] （可選）登出後 Host 席停止；`revokePlatformInvite` 令 `/i/` 失效（頁內錯誤）。

---

## 8. 端到端手測（§7 的單一腳本）

1. 兩瀏覽器（A、B）。A 先 `go:dev` 起 go、登入（LINE 或 Google）─「已登入」、avatar 顯示。
2. A 開 `go…/s/pg-gomoku` → 切「邀請對弈」→ 開 session →「邀請對手」→ go 頁彈分享面；複製 `/i/<short>`；**頁面碼**（QR 掃/或直接開）。
3. B 用同一手機/瀏覽器開 `/i/<short>` → consent → 等待 A。
4. A 見 `ready` → 選先手 →「開始」→ 雙方落子至終局。
5. A「再來一局」→ 再一局；A「結束這一場」→ 雙方回起始。
6. 關 A 頁重開 → A 未登入（memory key 已失，profile 依 localStorage 顯示）；再點「邀請對手」→ 導向登入。

---

## 9. 失敗與粗暴恢復

| 情況 | 預期 |
| --- | --- |
| 玩家 A 未登入（無記憶體 key） | 鑄邀請 `not_provisioned`；頁內文案「從右上角登入後再邀請」；導向登入；**不**教貼 key |
| Invite 過期／撤銷 | 玩家 B `/i/` 頁內錯誤；可請 A 重新邀請 |
| 玩家 A 離線（需新握手） | B 等 answer 超時；已連上 peer 不受短鏈失效影響（資料面已在 WebRTC） |
| B 拒絕 consent | 不入座；不佔用成功 handshake；A 繼續等待 |
| 斷線中局 | 提示連線中斷；可重開邀請另開一局（不做完美重連，對齊 E2E） |
| 記憶體 key 於對弈中失效（`/v1/field/me` 401） | Host 作答循環 mark 未登入、profile 回 icon；已連上 peer 可續（資料面本地）；不中斷對弈 |

---

## 10. 階段與完成定義

| Phase | 內容 | 完成定義 | 狀態 |
| --- | --- | --- | --- |
| **0. 契約** | 本文件；DEC-052 §5.3 化實 | 流程／憑證／切界清楚 | **完成** |
| **1. goAuth mint** | `mintPlatformInvite`（key 內部用；`targetField=go`；`not_provisioned`）；測試 | 有 key mint 成功回 `short_url=/i/…`；無 key `not_provisioned`；不持久化 | **完成** |
| **2. 畫布橋／env.HOST** | `createGoHostBinding`＋`/api/online/*`（DEC-053）；過渡 `/api/shell/platform` 仍保留 | gomoku 經 `env.HOST.createPlatformInvite` 取得 `short_url` | **完成** |
| **3. Host runtime** | `hostRuntime`（open／channel／answer loop／act／event fanout／close）；goWebKv 當 Host 權威 | 玩家 A Host 序：open→入座 ready→start active→place→ended→reset | **完成** |
| **4. 頁內分享面** | `GoShareSheet` 「邀請對弈」模式（QR／複製／系統分享；`/i/<short>`；title）；登入閘 | B 可掃 QR／複製入座；未登入導向登入 | **完成** |
| **5. 端到端手測** | §8 腳本；失敗態；窄屏 | A↔B 對弈完成；key 關頁即失；無 `alert` | **進行中** |

---

## 11. 文件與用語

| 用 | 不用 |
| --- | --- |
| 玩家主場（go）／作者主場（play）；「邀請對手」「加入」「入座」「開始」「再來一局」 | 把 go 叫「場」；SaaS「對戰平台／Lobby／房間」腔 |
| 登入後才能邀請（通行證＝記憶體 field API key） | 教貼 `pg_sk_`；把 key 存 localStorage |
| Invite 短鏈 `/i/<short>`（go）＝玩家主場互邀 | 與 `/s/<id>` 型錄傳閱／`#pg_provision=` 混淆 |
| 對弈（`gomoku.v1`；連上後走 WebRTC） | 對讀者說直連／TURN／relay（DEC-004／047 透明） |
| 未登入也可單機玩 | 「不能登入就不能玩」（登入是加值，不阻 `/i/`／`/s/`） |

---

## 修訂紀錄

| 日期 | 變更 |
| --- | --- |
| 2026-08-11 | 初版 Draft：GO-INVITE 化實（DEC-052 §5.3）；go 玩家以記憶體 field API key 走 `invite.compose`；go 側主持 `gomoku.v1` Host session；完成依據＝go A↔B 入座對弈至終局 |
| 2026-08-19 | 劃清：包廂內開局不走本刀 compose（見 [PG-GO-ROOM-PLAN.md](./PG-GO-ROOM-PLAN.md) §5.9） |
| 2026-08-21 | 交叉索引：包廂開局實作計劃 [PG-GO-ROOM-PLAY-PLAN.md](./PG-GO-ROOM-PLAY-PLAN.md) |
