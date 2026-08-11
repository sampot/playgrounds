# Playgrounds 純玩版支援登入（go 與 play 相容協定）＋ Header Profile

> **狀態：** Draft（2026-08-11）— 契約／階段草案；相依 [DECISIONS.md](./DECISIONS.md) **DEC-047**（Platform Invite／後台）與 **DEC-050**（純玩版 `go.samkuo.me`）  
> **權威決策：** 建議 [DECISIONS.md](./DECISIONS.md) **DEC-052**（Proposed）  
> **相關：** [PG-GO-CLIENT-PLAN.md](./PG-GO-CLIENT-PLAN.md)（go 主計劃；**玩家主場鑄邀請**）、[PG-PLATFORM-DASH-SPEC.md](./PG-PLATFORM-DASH-SPEC.md)（dash 登入／provision）、[PG-PLATFORM-API-PLAN.md](./PG-PLATFORM-API-PLAN.md)、[GLOSSARY.md](./GLOSSARY.md)

一句話：**使用者分兩群——作者主 UI＝場 `play.samkuo.me`、玩家主 UI＝純玩版 `go.samkuo.me`，兩個 UI 共用同一份型錄。** go 支援與 play 完全相容的「通行證登入」：dash「登入我的遊樂場」可指向 go（`?field=go…`），go 以同一套 `#pg_provision=`→redeem→**頁面記憶體 API key** 接收。Header 右側新增 **profile 入口**（未登入＝icon，已登入＝avatar）。登入取得的 field API key **不只是身分**——它是**玩家側能力的憑證基礎**：go **預計支援玩家主場鑄邀請**（玩家在 go 開一局、邀請另一位玩家入座）。本刀先落地**身分＋Header profile**；玩家主場鑄邀請列為後續（見 §5.3）。

---

## 1. 動機

- 場殼「登入我的遊樂場」的既存主路徑：dash SSO → `POST /v1/field/provision` → 拿到 `field_url`（`<origin>/#pg_provision=<token>`）→ 開啟對應場（預設 `play.samkuo.me`，dash 可改 `default_field_url`）。
- **純玩版 go 目前不在這條路徑上：** `go` 在 `FIELD_RESERVED_SUBDOMAINS`（`platform-api/src/ids.ts`），`normalizeFieldOrigin("go.samkuo.me")` 回傳 null → dash 無法以 go 為 target（靜默退回 play）。
- 但 go 的定位（DEC-050）是**玩家主場**（作者主場＝場 `play.samkuo.me`；兩 UI 共用同一份型錄）——玩家以既有 Platform 身分登入 go 後能辨識身分、與場站群一致地呈現。把 go 納入既有登入協定，能：
  - 讓「登入我的遊樂場」可選 go，成為場站的**登入面延伸**，不必為 go 另造第二套身份系統。
  - Header 顯示使用者 avatar／登入態，符合站群身分（DEC-004）。
- **相容義：** go **不**另創協定；**完全複用** play 的 `#pg_provision=`→`redeem`→**記憶體 API key** 流程。差異只在「go 用這把 key 做什麼」——**本刀** go 純玩不鑄 Invite、不用 TURN，key 用於 `/v1/field/me` 身分辨識；**後續**玩家主場互邀（GO-INVITE）以**同一把 key** 走 `invite.compose`（作者面 Host 能力仍僅在場殼），見 §5／§5.3。

---

## 2. 目標

- **go 與 play 同一登入協定**：dash「登入我的遊樂場」可指向 `go.samkuo.me`（`?field=go…`），SSO 後以 `#pg_provision=` 回 go。
- **go consume `#pg_provision=`**：redeem → 頁面記憶體 field API key → 清除 hash → 頁內身分狀態。
- **Header profile**（窄屏優先）：未登入＝profile icon（點→登入）；已登入＝avatar（點→頁內身分面板，可登出）。
- **Platform 對介面**：放行 go 為 provision target；新增吃 **API key** 的身分端點 `/v1/field/me`（回傳 avatar 等），因現有 `GET /v1/me` 只吃 access token。
- **不改變** go 既有「純玩、無編輯、`/s/` 離線」定位；**不**在 go 提供作者面（我的場、密鑰庫、後台、OPFS）。
- **為玩家主場鋪路**：go 取得 field API key（＋/v1/field/me 存下 profile）＝**玩家側能力的憑證基礎**——go **預計支援玩家主場鑄邀請**（GO-INVITE；玩家在 go 開一局、邀請另一位玩家入座）。

---

## 3. 非目標

- 在 go 新建一套帳號／註冊／SSO；go 只認**既存 Platform 使用者**（DEC-047 帳號面）。
- 在 go 提供「我的場／密鑰庫／TURN／點數／後台」等**作者面 Host** 功能——go 取得 field API key 不當成「第二個場」。
- **本刀（DEC-052）**不實作 go 玩家鑄邀請（GO-INVITE）本身；它屬**後續階段**，本刀只建立身分與 pipeline（見 §5.3）。
- 在 go 提供「登入我的沙盒庫」或跨場 OPFS 搬移。
- 修改 play 的行為或 dash 的 SSO 流程本身（只加 `go` 為合法 target + 一個新端點）。
- 把 field API key 持久化到 localStorage（維持「關頁即失」安全語意，對齊 play）。
- 未登入也能玩（go 快樂路徑不因登入而封鎖：`/i/`、`/s/` 照常，登入只是加值）。

---

## 4. 角色與站群

**兩群使用者，兩座 UI，一份型錄：**

| 使用者群 | 主 UI | 做的事 |
| --- | --- | --- |
| **作者** | 場 `play.samkuo.me` | 編輯／實驗、管理我的場、鑄 author 邀請、session 權威、作答 |
| **玩家** | 純玩版 **`go.samkuo.me`** | 玩（`/i/` 入座、`/s/` 單機）、**玩家主場互邀**（GO-INVITE，後續）、身分（本次） |

**站群分工：**

| 面 | Origin | 登入角色 |
| --- | --- | --- |
| **後台 dash** | `dash.samkuo.me` | SSO；「登入我的遊樂場」→ `POST /v1/field/provision`（`target_field` 可為 play 或 **go**） |
| **Platform API** | `api.samkuo.me` | `#pg_provision` redeem（→ API key）；`/v1/field/me`（API key → 身分） |
| **場殼（作者）** | `play.samkuo.me` 等 | 既有：consume `#pg_provision`→記憶體 key；鑄 Invite／TURN |
| **純玩版（玩家）** | **`go.samkuo.me`** | **新增**：consume `#pg_provision`→記憶體 key＋/v1/field/me；**本刀**僅身分顯示；**後續**玩家主場鑄邀請（GO-INVITE） |

**不變：** `go` 仍是純玩 origin（不是場）；登入不把 go 變成「第二個場」。兩 UI 共用**同一份型錄**（go `/s/<id>` 即該 SAM）。

---

## 5. 登入協定（與 play 相容）

### 5.1 流程（同一套，go 收）

```text
dash「登入我的遊樂場」（target=go，?field=go.samkuo.me）
  → POST /v1/field/provision（target_field=go）→ { field_url: https://go.samkuo.me/#pg_provision=<token>, ... }
  → 開啟 go
  → go SPA 見 #pg_provision=
  → POST /v1/field/provision/redeem { provision_token } → { api_key }   ← 一次性
  → 存頁面記憶體（關頁即失）
  → GET /v1/field/me（Authorization: Bearer <api_key>）→ { user_id, role, avatar_url, ... }
  → 清 hash、更新 Header profile、頁內 flash「已登入」
```

與場殼 play 唯一差別：**本刀（DEC-052）**go 不把這把 API key 拿來鑄 Invite／取 TURN；key 只用於 `/v1/field/me` 身分辨識。**後續（GO-INVITE，見 §5.3）**go 會用**同一把** field API key 走 `invite.compose` 替玩家主場鑄玩家邀請。

### 5.2 失敗

| 情況 | 預期 |
| --- | --- |
| token 過期／已用／無效 | 頁內 flash「同意入座已過期，請從後台重新登入」；**禁止** `alert` |
| `/v1/field/me` 失效（key 撤銷） | 標記未登入，profile 回 icon；不阻擋玩 |

### 5.3 後續：玩家主場鑄邀請（GO-INVITE；go 玩家對玩家）

> 定位：**玩家是 go 的主場使用者，不是被動 Guest**。登入（本刀）建立的**頁面記憶體 field API key** 即為玩家側能力憑證。GO-INVITE 為**後續階段**，不在本刀 (DEC-052) 實作；本刀以「**驗證 pipeline 可承載**」收斂。

**GO-INVITE 輪廓（後續起草）：**

- **入口**：已登入的玩家在單局內（`/i/<short>` 或 `/s/<catalog>`）可「對玩家發邀請」——回傳 `https://go.samkuo.me/i/<short>` 起新 session，**另一位玩家**入座。
- **API key 來源**：同本刀 pipeline（`#pg_provision=` redeem → 記憶體 field API key）——身分與能力**同一把 key**，不需第二套授權。
- **仍無「作者面」**：go 不新增我的場／密鑰庫／後台／TURN 管理；玩家邀請**不**等同 author session 權威（Host 仍在場殼）。
- **共用型錄不變**：`/s/<catalog_id>` 仍為兩 UI 同一份型錄的入場點。

**本刀切界（為 GO-INVITE 準備而不實作）：**

1. go 留下**發 API key 請求的抽象**（`platformClient.ts` 的 auth 區塊；不做 OLTP 消費）。
2. `/#pg_provision=` redeem 後**維持記憶體 key**（不因「僅身分」而棄用）——GO-INVITE 直接使用。
3. Header profile 奇數：登入為**身分**（本刀）；未來玩家入口（開一局互邀）由 GO-INVITE 計劃引入獨立階段。
| dash→provision 跳轉失敗 | dash 既有錯誤面；go 不需改 |

---

## 6. Platform API 變更（`platform-api/`）

### 6.1 放行 go 為 provision target（硬）

- 檔：`platform-api/src/ids.ts` → `normalizeFieldOrigin()`。
- `go` 目前在 `FIELD_RESERVED_SUBDOMAINS`。對 `go.samkuo.me` **特判**回傳 `https://go.samkuo.me`（仍依既有規則：僅 https、無 path、單一 sub）。其他保留名（`www/blog/api/docs/dash/old-blog`）**不變仍拒**。
- 效果：`fieldProvisionDeepLink("go.samkuo.me", token)` → `https://go.samkuo.me/#pg_provision=…`；dash `default_field_url` 可存 `https://go.samkuo.me`。
- 測試：`platform-api/src/fieldProvision.test.ts` 補 `normalizeFieldOrigin("https://go.samkuo.me")==="https://go.samkuo.me"`；確認 `api`／`dash` 等仍 `null`。

### 6.2 存 avatarUrl（硬，為 `/v1/field/me` 服務）

- 檔：`platform-api/src/auth.ts`：`PlatformUser` 加 `github.avatarUrl?`／`google.avatarUrl?`；`linkGithub`／`linkGoogle` 收並存。
- 檔：`platform-api/src/ssoFlow.ts`：`completeSsoIntent` 的 `link`／`login` 路徑把 profile 的 `avatarUrl` 傳入（OAuth profile 已有 `avatarUrl`，見 `githubOAuth.ts`／`googleOAuth.ts`）。
- 舊資料（登入早於此變更者）無 avatarUrl → `/v1/field/me` 回 `null`，go 以 profile icon fallback。

### 6.3 新增 `GET /v1/field/me`（吃 field API key；硬）

- 檔：`platform-api/src/index.ts`。用既有 `requireApiKey(env, request)`（回傳 `key.userId`）→ `getUser` → 回傳：
  `{ user_id, role, github:{login, avatar_url}, google:{email, avatar_url}, default_field_url, credits, turn_hosted, turn_prefer }`。
- **為何不吃既定 `GET /v1/me`：** `/v1/me` 走 `requireAccessToken`（`pg_at_`），go 只有 `pg_sk_` field API key，拿不到。`/v1/field/me` 走 `requireApiKey` 才好讓 go 解析身分。
- CORS：`platform-api/src/cors.ts` 的 `ALLOWED_ORIGIN` 已含 `*.samkuo.me`，go 在內，無需改。
- 授權粒度：`/v1/field/me` 暴露的是**自己的** profile（同 user 的 key），非管理面；不與 DEC-051 scopes 衝突（可納入或明確非 scope-gated 的 self-profile 面）。

### 6.4 Dash 文案（可選）

- `platform-api/dash/src/lib/components/DashField.svelte`：「官方場如 play.samkuo.me」可加註 `go.samkuo.me` 亦為合法 target（非必要，屬編輯性）。

---

## 7. go-client 變更（`go-client/`）

### 7.1 Platform client 補齊

- 檔：`go-client/src/lib/platformClient.ts`（目前僅 `platformApiOrigin`／`previewInviteBySecret`）補：
  - `platformDashOrigin()`：dev→local origin；prod→`https://dash.samkuo.me`（對齊 play 版邏輯）。
  - `platformFieldLoginUrl(fieldOrigin)`＝`dash origin + "/?field=" + encodeURIComponent(fieldOrigin)`（與 play 相同；SSO 後 dash provision 回該 origin）。
  - `redeemFieldProvision(provisionToken)` → `POST /v1/field/provision/redeem`（回 `{ api_key }`）。
  - `fetchFieldMe(apiKey)` → `GET /v1/field/me`，`Authorization: Bearer ${apiKey}`。
  - `parsePgProvisionFromLocation`／`clearPgProvisionHashFromLocation`（或複用 `@pg/platform/platformProvisionUrl`）。
- `vite.config.ts` 已 alias `@pg`/`@utils`（純 TS，無 IDE shell），可複用 play 模組；或做 go 薄封裝。

### 7.2 身分 store（runes）

- 新增 `go-client/src/lib/goAuth.svelte.ts`（runes，對齊 `chromeSession.svelte.ts` 風格）：
  - `$state`: `loggedIn`、`profile: { user_id, role, label, avatarUrl, default_field_url } | null`、`busy`。
  - `initFromLocation()`：root 載入 consume `#pg_provision`。
  - `login()`：跳 `platformFieldLoginUrl(goOrigin())`。
  - `logout()`：清**記憶體 key**＋profile → flash「已登出」。
- **Key 存記憶體（不落 localStorage），對齊 play**——關頁即失。
- **Avatar／profile 存續（建議）：** `profile`（含 avatarUrl、`user_id`、role）可存 `localStorage`，供**跨 session** 顯示 avatar；**API key 永不留存**。登出時 `localStorage` 的 profile 一併清。超時重新拉 `/v1/field/me` 驗證（失敗即視為未登入）。
- `goOrigin()` 判定：複用 `Chrome.svelte` 既有 localhost 判斷，或抽成共用 helper。

### 7.3 Root consume

- 檔：`go-client/src/routes/+layout.svelte`。在 `onMount`（`registerGoServiceWorker`）旁加 `void goAuth.initFromLocation()`：
  - 見 `#pg_provision=` → redeem → 記憶體 key → `fetchFieldMe` → 更新 `profile` → 清 hash → flash「已登入」。
  - 失敗 → flash（頁內，禁 `alert`）。

### 7.4 Header profile UI（硬）

- 檔：`go-client/src/lib/Chrome.svelte`，頂列右側（`share-btn` 旁）：
  - **未登入**：profile icon（無頭人形 SVG）；點 → `goAuth.login()`（連 dash `?field=go…`）。
  - **已登入**：`profile.avatarUrl` 有 → `<img>` avatar；無 → profile icon＋小「已登入」徽標；點 → 開 `GoProfilePanel`。
  - **窄屏：** 熱區 ≥44×44px；`flex-shrink:0`；對弈中 chrome 收合時 profile 隨頂列隱藏（不另留角標）。
  - 面板開啟期間暫停 chrome 3s 自動收合（對齊 share/more 的 `clearChromeAutoHide`）。
- 新增 `go-client/src/lib/GoProfilePanel.svelte`（比照 `GoMorePanel.svelte` bottom-sheet `<dialog>` 樣式）：
  - 身分資訊：`github.login`（`@…`）／`google.email`／`user_id`、role。
  - **登出**：`goAuth.logout()` → 關面板 → flash。登出為 non-destructive，不需多層確認（對齊 `.cursor/rules/no-native-dialogs.mdc`）。

---

## 8. 儲存與安全

| 項 | 規格 |
| --- | --- |
| **field API key** | **頁面記憶體 only**（goAuth 模組級變數）；`pagehide`／unload 清（對齊 `platformFieldCredential.ts`）。**不落** localStorage／IndexedDB／OPFS |
| **profile／avatar** | 可 `localStorage`（供跨 session 顯示）；登出清。不視為權威憑證 |
| **hash** | `#pg_provision` 一次性，consume 後 `history.replaceState` 清除（對齊 `clearPgProvisionHashFromLocation`） |
| **未登入不阻玩** | `/i/`、`/s/`、離線等快樂路徑不受登入影響 |

---

## 9. UX 硬規則

- **Mobile-first**（`.cursor/rules/mobile-first-ux.mdc`）：profile 窄屏可用，熱區 ≥44×44px。
- **禁止原生 dialog**（`.cursor/rules/no-native-dialogs.mdc`）：登入失敗／登出一律頁內 flash／面板；登出不需多層確認（非破壞性）。
- **Svelte 5 runes**（DEC-005）：`goAuth.svelte.ts`、`GoProfilePanel.svelte`、`Chrome.svelte` 皆 runes；禁止 legacy 反應性。
- 用語對齊 GLOSSARY／DEC-004：通行證、登入、登出；勿 SaaS「帳號中心」「Profile 設置」腔。

---

## 10. 端到端流程（硬）

```text
dash（已 SSO）→ 使用者選 target=go（default_field 或 ?field=go.samkuo.me）
  → POST /v1/field/provision（target_field=go）→ field_url=https://go.samkuo.me/#pg_provision=<token>
  → 開 go → SPA consume → redeem → 記憶體 key → /v1/field/me → profile
  → Header 顯示 avatar；點開身分面板 → 登出 → flash「已登出」→ profile 回 icon
```

---

## 11. 階段與完成定義

| Phase | 內容 | 完成定義 | 狀態 |
| --- | --- | --- | --- |
| **0. 契約** | 本文件；DEC-052；GLOSSARY | 協定／權限／身分端點／UI 清楚 | **進行中**（本刀） |
| **1. Platform** | 放行 go；avatarUrl 持久；`/v1/field/me`；`fieldProvision.test` | `normalizeFieldOrigin("go…")` 通過；curl `/v1/field/me`（API key）回身分＋avatar | — |
| **2. go consume** | `platformClient` 補齊；`goAuth.svelte.ts`；root consume | 開 `go/#pg_provision=…` 見「已登入」、hash 清、profile 有值 | — |
| **3. Header profile** | `Chrome.svelte` profile icon/avatar；`GoProfilePanel` | 未登入 icon→登入；已登入 avatar→面板→登出；窄屏可點 | — |
| **4. E2E／manual** | dash 以 go 為 target 登入→回 go；失敗態 | 一支瀏覽器 dash→go 登入完走；關頁後 key 失效；`alert` 不存在 | — |
| **5. GO-INVITE 前導** | 確認 pipeline 保留記憶體 key、可承載 `invite.compose`（部署 to-date 不實作） | go 登入 pipeline 抽出可複用 auth 區塊；GO-INVITE 僅需在既有 key 上線 | 未排程（後續） |

---

## 12. 驗收清單（草案）

**協定／Platform**

- [ ] `normalizeFieldOrigin("https://go.samkuo.me")` 合法；`api`／`dash` 仍拒
- [ ] `POST /v1/field/provision`（`target_field=go`）回 `https://go.samkuo.me/#pg_provision=…`
- [ ] `GET /v1/field/me` 吃 `Authorization: Bearer pg_sk_…` 回 `user_id`／`avatar_url`；撤銷 key → 401
- [ ] 新使用者 SSO 後 avatarUrl 已存；舊使用者回 `null` 不 crash
- [ ] dash「預設遊樂場」可存 `https://go.samkuo.me`（若加了文案）

**go consume**

- [ ] `go/#pg_provision=<token>` → 頁內「已登入」；hash 清除；無 `alert`
- [ ] token 過期／已用 → 頁內 flash；不寫入任何持久憑證
- [ ] 重整頁面：API key 消失（記憶體），profile 依 localStorage 顯示（key 不殘留）

**Header profile**

- [ ] 未登入＝profile icon；點 → dash `?field=go…`
- [ ] 已登入＝avatar（有 avatarUrl 時）；點 → 身分面板
- [ ] 面板顯示 `@login`／email／user_id；登出→flash「已登出」→ 回 icon
- [ ] 窄屏可點；profile 開啟時 chrome 不自動收合；登出不需多層確認
- [ ] 登入不阻擋 `/i/`／`/s/`／離線玩（非目標不破）
- [ ] （界線）本刀**不**在 go 提供玩家主場鑄邀請；goAuth 記憶體 key 保留供 GO-INVITE 後續使用

---

## 13. 文件與用語

| 用 | 不用 |
| --- | --- |
| 純玩版登入；通行證（field API key，頁面記憶體）；與 play 相容協定 | 說 go「成為場」；在 go 建「帳號中心」 |
| Header profile／avatar／登入／登出 | SaaS「Profile 設置」「我的帳號」腔 |
| `#pg_provision=`→redeem→記憶體 key（同 play） | 把 key 存 localStorage；為 go 另造第二套登入 |

---

## 修訂紀錄

| 日期 | 變更 |
| --- | --- |
| 2026-08-11 | 初版 Draft：go 支援 play 相容登入；Header profile；Platform 放行 go＋`/v1/field/me`；**定位為玩家主場**（作者＝play、玩家＝go、共用型錄）並列 GO-INVITE 玩家主場互邀為後續 |
