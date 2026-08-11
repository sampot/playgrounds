# Playgrounds go 登入改為 dash 專用登入面（Google／LINE）規格

> **狀態：** Decision 落地（2026-08-11）— 最終採**整頁轉導**；相依 [DECISIONS.md](./DECISIONS.md) **DEC-052**（純玩版登入＋Header profile）、**DEC-053**（dash LINE SSO）、**DEC-050**（純玩版 `go.samkuo.me`）
> **權威決策：** **DEC-054**（go 登入改 dash 專用登入面；**整頁轉導，非 popup**）
> **相關：** [PG-GO-AUTH-PLAN.md](./PG-GO-AUTH-PLAN.md)（go 登入協定；`#pg_provision=`）、[PG-LINE-SSO-PLAN.md](./PG-LINE-SSO-PLAN.md)（LINE SSO）、[PG-PLATFORM-DASH-SPEC.md](./PG-PLATFORM-DASH-SPEC.md)、[GLOSSARY.md](./GLOSSARY.md)

一句話：**go 登入整頁轉導到 dash 專用登入面 `/go/login`（只提供 Google／LINE）**——go 玩家點「登入」→ 整頁跳到 dash 的 `/go/login` → 選 Google／LINE 完成 SSO → 沿用既有 `#pg_provision=` pipeline provision 回 go → go `initFromLocation()` redeem 登入。完全不再開 popup、不做 cross-window handoff。

> **為何改回整頁轉導（放棄 popup）：** 移除法已在實作後再評估。OAuth 廠商（Google／LINE）的 authorize 頁送 `Cross-Origin-Opener-Policy: same-origin`，會切斷 popup 的 `window.opener`；即使改用同 origin `BroadcastChannel`／`sessionStorage` `storage` event 等多路 handoff，實測在「popup 完成、自關、回傳主頁」的時序上仍不穩定（popup 內已登入但主頁收不到）。整頁轉導沒有跨視窗問題——登入就在玩家當前分頁完成，最可靠；代價是離開 go 再回來，但體驗可接受（go 專屬極簡登入面，非後台）。

---

## 1. 動機

- **現況 UX 差：** `goAuth.login()` 原本整頁跳去 `dash.samkuo.me` root（後台首頁），登入完再跳回 go。玩家「進 go 想登入」變成「離開 go 去後台」，體驗割裂。
- **想要專屬登入面：** go 登入不該把玩家帶進後台首頁。做一個 go 專用的極簡登入面 `/go/login`（只 Google／LINE），登入後自動回 go。
- **go 只需 Google／LINE：** 依授權，go 登入面只列這兩種身份；GitHub 是 dash 作者面的既有選項，**不**在 go 登入面出現。
- **完全複用既有 pipeline：** 整頁轉導下 `#pg_provision=`→redeem→`/v1/field/me` 一字不改，Platform API 零變更。

---

## 2. 目標

- **go 登入走整頁轉導**到 dash 專用登入面 `/go/login`，不再停留在 go 開 popup。
- **dash 專用登入面 `/go/login`：** 極簡、無後台 chrome（無 TopNav／DashboardNav／AccountBar），只顯示 Google／LINE 兩種進入；登入成功自動 provision 到 go。
- **安全一致：** field API key 仍**僅記憶體**（不落 storage）；profile 沿用 localStorage（非權威）。
- **不服務 GitHub：** go 登入面只列 Google／LINE。

---

## 3. 非目標

- 不另造第二套登入協定；`#pg_provision=`→redeem→`/v1/field/me` 原封不動。
- **不再做 popup／embedded webview／iframe 登入**（Google／LINE 封鎖，且 COOP 使跨視窗 handoff 不可靠）。
- 不改 Platform API 協定（所有端點已存在）。
- 不把 field API key 持久化（維持關頁即失）。
- 不為 go 登入面新增 GitHub 選項（作者面既有；go 只 Google／LINE）。
- 不實作 GO-INVITE（後續；DEC-052 §5.3）——本刀只改善登入 UX。

---

## 4. 既有 pipeline 覆盤（本刀重用的機制）

```text
go 主頁 login()：
  window.location.assign(goLoginUrl(goOrigin()))            // → dash /go/login?field=go.samkuo.me
dash /go/login bootstrapSession()：
  ?field= → stashReturnField(sessionStorage)                // return field 存 sessionStorage
  顯示「使用 LINE 進入」/「使用 Google 進入」
SSO（/auth/line|google?intent=login）→ access token
dashSuccessRedirect → dash root /?session=…（本刀接受短暫閃現 dash root，見 §6.2）
  bootstrapSession：已登入 + return field → provisionAndOpenField(skipConfirm)
    POST /v1/field/provision { target_field: go } → field_url = https://go.samkuo.me/#pg_provision=<token>
    window.location.assign(field_url)                       // 整頁回 go
go initFromLocation()：
  見 #pg_provision= → POST /v1/field/provision/redeem → 記憶體 api_key
  → GET /v1/field/me → profile → 清 hash → flash「已登入」
```

**關鍵不變事實**（已確認）：
- return field 走 `sessionStorage`（`RETURN_FIELD_KEY`），**不靠 URL**，故 SSO 後彈回 dash root 仍能自動 provision。
- `dashSuccessRedirect` 把 OAuth 完成面導回 **dash root `/?session=…`**，不帶 path——因此 `/go/login` 主要負責「登入前 UI」；SSO 後會落回 dash root 短暫閃現再自動跳 go（可接受，見 §6.2）。
- 所有需要端點均已存在：`/auth/google`、`/auth/line`、`/v1/field/provision`、`/v1/field/provision/redeem`、`/v1/field/me`。

---

## 5. 目標架構（整頁轉導登入）

```text
go 主頁 user 點「登入」
  → goAuth.login()：window.location.assign(goLoginUrl(goOrigin()))   // dash /go/login?field=go
dash /go/login（極簡）：
  └ bootstrapSession() 存 ?field= → 顯示「使用 LINE 進入」/「使用 Google 進入」
  └ 點選 → /auth/line|google?intent=login（整頁跳 provider）
  └ SSO callback → dashSuccessRedirect → dash root /?session=…（同分頁）
  └ bootstrapSession：已登入 + return field → provisionAndOpenField(skipConfirm)
  └ window.location.assign(field_url)  →  整頁導向 go/#pg_provision=…
go 頁：
  └ initFromLocation() redeem → 記憶體 key → /v1/field/me → profile → flash「已登入」
```

沒有跨視窗元件；最關鍵的是「SSO 後自動回 go」由 dash 的 return-field 機制負責，與 play 完全一致。

---

## 6. 變更清單

### 6.1 Platform API — 小幅變更（return path）

既有端點（`/auth/google`、`/auth/line`、`/v1/field/provision`、`/v1/field/provision/redeem`、`/v1/field/me`）皆已存在、CORS 已含 `*.samkuo.me`。

新增：OAuth `login` intent 支援 `?return=`（由 `/go/login` 的 auth 連結帶入），存在 state；`dashSuccessRedirect` 依 `return` 導回（預設 `/`）。如此 SSO 成功後回到 `/go/login?field=…&session=…`，由該頁自動 provision 直跳 go，**不閃現 dash root**。

### 6.2 dash 專用登入面（`platform-api/dash/`）

**`src/routes/go/login/+layout.svelte`（極簡 layout）：**
- 不渲染 `TopNav`／`DashboardNav`／`AccountBar`／`ConfirmDialog`。
- 仍引入 `dash` store 並在 `onMount` 調 `void dash.bootstrapSession()`（負責 `?field=` stash＋登入後自動 provision）。
- 保留 `<Flash>` 顯示「正在回到你的遊樂場」等狀態。

**`src/routes/go/login/+page.svelte`：**
- 標題「登入遊樂場」＋ledger「登入成功後自動回到純玩版，繼續遊玩」；註明「註冊帳戶為邀請制」。
- 兩個進入 CTA，**以 LINE 為主要**（go 的 provider 主順序）：
  - `<a class="btn" href="/auth/line?intent=login&return=%2Fgo%2Flogin…">使用 LINE 進入</a>`
  - `<a class="btn secondary" href="/auth/google?intent=login&return=%2Fgo%2Flogin…">使用 Google 進入</a>`
- auth 連結帶 `return=<當前 /go/login?field=…>`，使 SSO 成功後**導回 `/go/login`（非 dash root）**，由 layout 自動 provision 直接跳 go，**不閃現 dash 首頁**。
- 未登入即顯示進入列；登入後由 layout 的自動 provision 接手。

**`src/routes/+layout.svelte`：**
- `/go/login` 走 bare shell（無 dashed chrome）。

**`src/lib/dash.svelte.ts`：**
- 移除 popup 相關（`RETURN_POPUP_KEY`、`stashReturnPopup`／`peekReturnPopup`、`provisionAndOpenField` 的 `popupHandoff` 參數、`#pg_popup=1` hash 附加）。return-field 機制原樣保留。

### 6.3 go client（`go-client/`）

**`src/lib/platformClient.ts`：**
- 常數 `GO_LOGIN_PATH = "/go/login"`。
- `goLoginUrl(fieldOrigin)`＝ dash origin + `/go/login?field=`（dev→`VITE_PLATFORM_DASH_ORIGIN`；prod→`dash.samkuo.me`）。
- 移除 popup 相關（`goLoginPopupUrl`、`centeringPopupFeatures`、`GoAuthPopup*` 型別、`GO_AUTH_CHANNEL`、`GO_POPUP_HASH_KEY`、`GO_AUTH_STORAGE_KEY`、`goFieldLoginUrl`）。

**`src/lib/goAuth.svelte.ts`：**
- `login()` 改為 `window.location.assign(goLoginUrl(goOrigin()))`（移除 `window.open`、`#popupSource`、`#reapTimer`、`#channel`）。
- 移除 `bindPopupResult()` 與一切 handoff 收訊（BroadcastChannel／`storage`／`message`／`visibilitychange`）。
- `initFromLocation()` 回到純整頁 path：redeem→記憶體 key→`/v1/field/me`→profile→清 hash→flash「已登入」；移除 popup 分支與三路 broadcast。
- `profileFromFieldMe()` 改為 provider 優先序 **LINE → Google → GitHub**（`/v1/field/me` 回傳全部已連結 provider 的 avatar），修正「Line 登入但頭像仍顯示 GitHub 暫存」的問題。
- `+layout.svelte` 移除 `goAuth.bindPopupResult()` 呼叫，僅留 `initFromLocation()`。

**`src/lib/goAuth.test.ts`：**
- `goLoginUrl` 組出 `…/go/login?field=…`（dev/prod）；移除 popup 相關測試（`goLoginPopupUrl`、`centeringPopupFeatures`、`GO_AUTH_CHANNEL`、`GO_POPUP_HASH_KEY`）。

**`src/lib/Chrome.svelte`：**
- `onProfileClick` 已呼叫 `goAuth.login()`；無需改動（仍會整頁轉導）。

---

## 7. 儲存與安全

| 項 | 規格 |
| --- | --- |
| **field API key** | **頁面記憶體 only**；**不落** localStorage／IndexedDB／OPFS；`pagehide` 清 |
| **profile／avatar** | `localStorage`（跨 session 顯示，非權威）；登出清 |
| **回傳機制** | 無跨視窗元件——整頁 `window.location.assign(#pg_provision=…)`，go 同頁 redeem |
| **hash** | `#pg_provision` 一次性，consume 後 `history.replaceState` 清（既有） |
| **未登入不阻玩** | `/i/`、`/s/`、離線快樂路徑不受影響（既有） |

---

## 8. UX 硬規則

- **Mobile-first**：`/go/login` 面窄屏可用；進入 CTA 全寬、易點（≥44px 高）。
- **禁止原生 dialog**：登入失敗／成功一律頁內 flash；無 `alert`／`confirm`／`prompt`。
- **Svelte 5 runes**：`goAuth.svelte.ts`、`+layout.svelte`、`+page.svelte` 皆 runes。
- 用語對齊 GLOSSARY／DEC-004：登入／登出；勿 SaaS「帳號中心」腔。

---

## 9. 階段與完成定義

| Phase | 內容 | 完成定義 | 狀態 |
| --- | --- | --- | --- |
| **0. 契約** | 本文件；DEC-054 | 架構／provider 界定清楚 | **已落地** |
| **1. go login 轉導** | `platformClient.goLoginUrl`；`goAuth.login()` 整頁轉導；移除 popup handoff | 點「登入」整頁到 `/go/login`；SSO 後自動回 go 變已登入、avatar 更新 | **已落地** |
| **2. dash 登入面** | `/go/login` layout＋page（LINE 主／Google 次要） | `/go/login` 顯示極簡登入面；選 LINE／Google 完成 SSO→自動 provision→整頁回 go | **已落地** |
| **3. 收口** | 移除 dash popup 殘留（`RETURN_POPUP_KEY` 等） | `/go/login` 走 bare shell；無 `alert` | **已落地** |
| **4. E2E／manual** | 真瀏覽器既有 dash→go 完走；失敗態 | LINE／Google 各走一輪；自動回 go 已登入；關頁 key 失效 | — |
| **5. Enhancement（可選）** | SSO 後回 `/go/login` 而非 dash root（return path 寫進 OAuth state） | 轉導過程不閃現 dash root | 未排程 |

---

## 10. 驗收清單（草案）

**go client**
- [ ] `goAuth.login()` 整頁 `window.location.assign(goLoginUrl(goOrigin()))`
- [ ] `initFromLocation()` redeem→已登入、avatar 更新、flash「已登入」
- [ ] 重整頁面：field API key 消失（記憶體），profile 依 localStorage 顯示
- [ ] 登入不阻擋 `/i/`／`/s/`／離線

**dash 登入面 `/go/login`**
- [ ] 極簡（無 TopNav／DashboardNav／AccountBar／ConfirmDialog）；只顯示 LINE／Google 進入
- [ ] 未登入：兩個 CTA 可用；登入成功→自動 provision→整頁回 go
- [ ] 已登入（session 有效）：進 `/go/login?field=go` 即自動 provision 跳 go
- [ ] 窄屏可用；無 `alert`／`confirm`／`prompt`

**Platform（零變更驗證）**
- [ ] `/go/login` 由 dash ASSETS 服務（SvelteKit 靜態路由）
- [ ] 既有 `/v1/field/provision`／`redeem`／`/v1/field/me` 未改而 flow 走通

---

## 11. 文件與用語

| 用 | 不用 |
| --- | --- |
| 整頁轉導登入；dash 專用登入面 `/go/login`；Google／LINE 進入 | 說「內嵌 webview」／「iframe 登入」／「popup 登入」 |
| 沿用 `#pg_provision=`→記憶體 key（同 play） | 把 key 存 localStorage；另造第二套登入 |
| 登入／登出（DEC-052 語） | SaaS「帳號中心」腔 |

---

## 修訂紀錄

| 日期 | 變更 |
| --- | --- |
| 2026-08-11 | 初版 Draft：popup 方案（dash 專用登入面，postMessage 回傳） |
| 2026-08-11 | **改回整頁轉導**：popup 因 OAuth COOP 切斷 opener、多路 handoff 實測不穩，改為整頁跳 `/go/login`（LINE 主／Google 次要）＋既有 `#pg_provision=`，移除 popup／BroadcastChannel／storage 殘留 |
