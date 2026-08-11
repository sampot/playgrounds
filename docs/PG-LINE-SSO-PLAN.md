# Playgrounds Dash 支援 LINE SSO（登入／連結／註冊）規格

> **狀態：** Draft（2026-08-11）— 契約草案；相依 [DECISIONS.md](./DECISIONS.md) **DEC-047**（Platform Invite／後台）、**DEC-052**（純玩版登入＋Header profile[^1]）  
> **權威決策：** 建議 [DECISIONS.md](./DECISIONS.md) **DEC-053**（Proposed）  
> **相關：** [PG-PLATFORM-DASH-SPEC.md](./PG-PLATFORM-DASH-SPEC.md)（dash 登入／SSO／帳號）、[PG-GO-AUTH-PLAN.md](./PG-GO-AUTH-PLAN.md)（`/v1/field/me` 身分面）、[GLOSSARY.md](./GLOSSARY.md)

一句話：**在既有 dash「統一進入（SSO：GitHub／Google）」之上新增第三個提供者 LINE**，完全走在既有契約裡——`login`／`link`／`join`／`bootstrap` 四意圖、`completeSsoIntent` 共用完成面、`PlatformUser` 加 `line` 欄、`/v1/me`（＋`/v1/field/me`）回傳 line displayName／avatar、帳號頁可連結／解除。**關鍵差異：LINE 無 email、強制 PKCE（S256）**，故以 `displayName`＋`userId` 為身分，state 需承載 `code_verifier`。go 側**零新增**——go 只用 `/v1/field/me`，LINE 登入後同樣看到 avatar。

[^1]: DEC-052 尚未納入 LINE；本刀把 LINE 視為**既存 SSO 面新增提供者**，不改變 go 協定。若 go 亦可選 LINE 登入（dash「登入我的遊樂場」）——因 `?field=go` 只認 dash SSO session，LINE 登入後即得 access token、即可 provision，故 **go 自動支援**，無線程式變更。

---

## 1. 動機

- **dash 目前只有 GitHub／Google 兩個 SSO**（`platform-api/src/ssoFlow.ts` 的 `SsoProvider = "github" | "google"`；登入／帳號 UI 各兩列）。
- **LINE 覆蓋廣（台灣／日本等市場）**：對共用型錄、純玩版 go 的玩家群，LINE Login 是很自然的進入方式——玩家未必有 GitHub，也未必想用 Google。
- 目標是讓 go 可使用 Google／Line 登入；而 go 走的是 `/v1/field/me`（access token → `pg_sk_` → 身分），**只要 dash SSO 多一個 LINE，LINE 登入後照樣能 provision 到 go**、`/v1/field/me` 回 line 身分。
- LINE 的合約缺口很小：backend 需新 provider module 與 state 承載 PKCE verifier；dash 加一個 provider 的進入／帳號列。

---

## 2. 目標

- **dash 第三個 SSO：** LINE Login（authorization code + PKCE S256）可進入後台、可於帳號頁連結／解除、可作註冊邀請 `/join/<token>` 綁定、可 bootstrap 第一個 admin。
- **身分模型對齊：** `PlatformUser` 增 `line?: { id, displayName, linkedAt, avatarUrl? }`；`sso:line:<userId>` 索引；`ssoCount` 計入 line。
- **`/v1/me` 與 `/v1/field/me`** 回傳 line（`display_name`、`avatar_url`）；go Header profile 可顯示 LINE 使用者 avatar／名稱。
- **不改變** go 協定、不另造 LINE 專屬登入面、不改場內 SSO 邊界。

---

## 3. 非目標

- 未連結 dashboard「LINE 官方帳號／Messaging API／LIFF／Bot」——本刀**僅 LINE Login（OAuth 授權碼）**。
- 把 LINE 當**唯一**登入方式：LINE 無 email、無跨系統驗證，仍有找回身分風險；維持「至少保留一個 SSO」契約，且 **bootstrap 第一個 admin 建議仍走 GitHub／Google**（見 §6.4）。
- 用 LINE email（openid 的 `email`）當必備 profile 欄——預設拿不到，**不依賴**。
- 修改 go client／`/v1/field/me` 流程本身（LINE 只是新增的既存 SSO 提供者）。
- 在場 origin 做 LINE SSO（維持「不做場內 SSO」）。

---

## 4. LINE Login 基本（v2.1）

| 項 | 值 |
| --- | --- |
| Authorize | `https://access.line.me/oauth2/v2.1/authorize` |
| 參數 | `response_type=code`、`client_id`（channel ID）、`redirect_uri`、`state`、`scope=profile openid`、**`code_challenge`＋`code_challenge_method=S256`（強制）**、`nonce` |
| Token | `POST https://api.line.me/oauth2/v2.1/token`（form-urlencoded：`grant_type=authorization_code`、`code`、`redirect_uri`、`client_id`、`client_secret`、**`code_verifier`**） |
| Profile | `GET https://api.line.me/v2/profile`（`Authorization: Bearer`）→ `{ userId, displayName, pictureUrl?, statusMessage? }` |
| 必要 scope | `profile`（displayName／pictureUrl）；`openid` 才回 ID token |
| **無 email** | LINE 預設不放 `email`；需申請核准＋使用者授權才可能回 ID token 內 email，且非人人有——**身分用 `displayName`＋`userId`** |

> 相較 GitHub（`state` only）／Google（`state` only）：**LINE 額外要求 PKCE `code_verifier`**——既有 `encodeOAuthState` 的 state 需承載它（見 §5.2）。

---

## 5. Platform API 變更（`platform-api/`）

### 5.1 新增 `src/lineOAuth.ts`（對齊 `googleOAuth.ts`／`githubOAuth.ts`）

```ts
export type LineOAuthEnv = GithubOAuthEnv & {
  LINE_CLIENT_ID?: string;      // channel ID（數字字串）
  LINE_CLIENT_SECRET?: string;  // channel secret
};

export type LineProfile = {
  id: string;                  // userId
  displayName: string;
  pictureUrl: string | null;
};

export function lineOAuthConfigured(env): boolean
  // LINE_CLIENT_ID && LINE_CLIENT_SECRET && OAUTH_STATE_SECRET

// PKCE：generateCodeVerifier()、sha256CodeChallenge(verifier)（S256 b64url）
export function lineAuthorizeUrl(opts: {
  clientId; redirectUri; state; codeChallenge; nonce;
}): string

export function exchangeLineCode(opts: {
  clientId; clientSecret; code; redirectUri; codeVerifier;
}): Promise<{ accessToken: string } | { error: string }>

export async function fetchLineProfile(accessToken): Promise<LineProfile | { error: string }>
  // GET https://api.line.me/v2/profile；無 userId → error "line_user_missing_id"
```

- **PKCE helper** 與 `githubOAuth.ts` 的 b64url / sha256 同款；`code_verifier` 43–128 字元隨機（`crypto.getRandomValues`）。
- `oauthCallbackUri()` 目前簽章只收 `"github" | "google"`；擴充為 `"github" | "google" | "line"`（`/auth/line/callback`）。

### 5.2 state 承載 `code_verifier`（硬；LINE 專屬差異）

- `githubOAuth.ts` 的 `StatePayload`／`encodeOAuthState` payload 增加**可選 `v?: string`**（code_verifier）。其它 provider 不填不受影響。
- LINE 路由 `encodeOAuthState(secret, intent, ttl, verifier?)` 時帶入；callback `decodeOAuthState` 取出 `state.v` 作 `code_verifier`。
- 安全：state 已 HMAC 簽署（`body.sig`），verifier 包在內可防竄改；不新增 KV 保存，對齊既有無狀態風格。**不做**把 verifier 落 KV 的做法（非必要依賴）。

### 5.3 `src/auth.ts`：`PlatformUser`＋索引

- `PlatformUser` 增：
  ```ts
  line?: { id: string; displayName: string; linkedAt: number; avatarUrl?: string };
  ```
- 新索引 `SSO_LINE = (subject: string) => \`sso:line:${subject}\``。
- 新函數（對齊 github/google 同款）：`getUserIdByLine`、`linkLine`（`user_id` 收起，寫 `sso:line:` 索引）、`unlinkLine`；`ssoLinkCount`（`auth.ts:191`，現為 github＋google）計入 line；`deleteUserAccount` 清 `sso:line:` 索引。

### 5.4 `src/ssoFlow.ts`：加入 "line"

- `SsoProvider = "github" | "google" | "line"`。
- `SsoSubject` 不變（`{ provider, id, label, avatarUrl? }`）——LINE 的 `label = displayName`、`avatarUrl = pictureUrl`。
- `getUserIdBySso`／`linkSso`／`syncSsoAvatar`／`alreadyLinkedError`／`adminMismatchError`／`linkedIdOnUser` 擴充 line 分支（label 語義＝displayName，誤訊息 `line_already_linked`／`admin_line_mismatch`）。

### 5.5 `src/index.ts`：路由（對齊 google/github 完全對稱）

- `/auth/line`：`lineOAuthConfigured` 檢查 → `parseOAuthIntent` → `codeChallenge = sha256CodeChallenge(verifier)` → `githubAuthorizeUrl` 式跳 `lineAuthorizeUrl`（同 state 邏輯）。
- `/auth/line/callback`：`lineOAuthConfigured` → 讀 `code`/`state` → `decodeOAuthState`（取 `state.v` 作 verifier）→ `exchangeLineCode` → `fetchLineProfile` → `completeSsoIntent({ provider:"line", id, label: displayName, avatarUrl })` → `dashSuccessRedirect`。
- `/health` 增 `line_oauth: lineOAuthConfigured(env)`。
- `/v1/me`、`/v1/field/me`、`/v1/admin/users`：回傳 line（`{ id, display_name, avatar_url }`／admin 摘要 `{ id, display_name }`）。
- **unlink** 正規式 `/^\/v1\/me\/sso\/(github|google|line)$/`；line → `unlinkLine`；`last_sso` 契約照舊。

### 5.6 測試

- `platform-api/src/auth.account.test.ts`：`linkLine`／`unlinkLine`／`ssoLinkCount` 含 line；`last_sso` 在僅 line 時禁解除（對齊既有「unlinks SSO but keeps at least one」用例）。
- `platform-api/src/inviteState.test.ts`（`completeSsoIntent` 既有測試所在）：line intent login／link／join／bootstrap 完成面。
- `lineOAuth` encoding 單元測試：lineAuthorizeUrl 帶 `code_challenge`＋`S256`；exchangeLineCode body 含 `code_verifier`。

---

## 6. Dash UI 變更（`platform-api/dash/`）

### 6.1 進入（未登入）

- `src/routes/+page.svelte`、`src/lib/components/AccountBar.svelte`：加「**使用 LINE 進入**」(`/auth/line?intent=login`)，為第三個 secondary CTA；leader 文案「GitHub 或 Google 或 LINE」。
- `/join/[token]/+page.svelte` 領取區加「以 LINE 綁定」(`/auth/line?intent=join&token=…`)。
- `/bootstrap/+page.svelte`：**保持 GitHub／Google 為主要**（建議首次 admin 仍用二者）；LINE 可選「以 LINE 完成 bootstrap」但不主打（見 §6.4）。

### 6.2 帳號（`DashAccount.svelte`）

- 新增一行 LINE：已連結顯示 `displayName`（＋avatar）；未連結顯示「未連結」。
- 「連結 LINE」(`/auth/line?intent=link`)／「解除連結」(`DELETE /v1/me/sso/line`)；`ssoCount<=1` 時禁解除（契約照舊）。

### 6.3 `dash.svelte.ts` ssoCount

- `ssoCount = (github?1:0)+(google?1:0)+(line?1:0)`。

### 6.4 bootstrap 注意（硬）

- LINE 無 email；bootstrap 綁第一個 admin 若只用 LINE，萬一 LINE 身分查無主人，後台鎖死風險與 email 型不同但仍存在（需 `ADMIN_BOOTSTRAP_TOKEN` + 同一 userId 的後續 SSO 對齊）。**建議規則：bootstrap 頁仍以 GitHub／Google 優先，LINE 不作為首次 bootstrap 唯一途徑**（可允許，但要能事後再綁 GitHub／Google 當 fallback）。此條列入驗收。

---

## 7. go 相容（硬，但零程式變更）

- go 走 `/v1/field/me`（access token → provision → `pg_sk_` → `/v1/field/me`）。LINE 只是**另一種取得 access token** 的 SSO 來源。
- LINE 使用者 dash 登入 →「登入我的遊樂場」`?field=go` → provision → go `#pg_provision=`→redeem→`/v1/field/me` 回 `line.display_name/avatar_url` → Header profile 顯示。
- **本刀不改 `go-client/`**；驗證在 E2E（§9）。

---

## 8. 儲存與安全

### 8.0 需要的 secrets（部署前）

| Var／Secret | 型別 | 來源 | 備註 |
| --- | --- | --- | --- |
| `LINE_CLIENT_ID` | **var**（channel ID，非機密） | LINE Developers Console | 數字字串 |
| `LINE_CLIENT_SECRET` | **secret** | LINE Developers Console | channel secret |
| `OAUTH_STATE_SECRET` | secret（既有） | 部署端 | HMAC 簽 state；LINE 用它簽沒 `code_verifier` 的 state |
| `GITHUB_CLIENT_ID/SECRET`、`GOOGLE_CLIENT_ID/SECRET` | 既有 | — | LINE 不直接用；對照用 |
| `ADMIN_BOOTSTRAP_TOKEN` | secret（既有，可供 bootstrap） | 部署端 | 僅 bootstrap 用 |

**LINE Developers Console 側：**
- Redirect URI：`https://dash.samkuo.me/auth/line/callback`（＋ dev `http://localhost:5173/auth/line/callback` 若本地測）
- 啟用 **LINE Login**；申請 **`profile`** scope（必要；`openid` 隨 authorize 帶）
- 因採 **PKCE S256** 需 Console 端支援（LINE Login 預設支援）

| 項 | 規格 |
| --- | --- |
| LINE channel secret | Workers secret `LINE_CLIENT_SECRET`；環境變數 `LINE_CLIENT_ID`（對齊 GITHUB/GOOGLE 的 ID=var、SECRET=secret） |
| `code_verifier` | 含於 HMAC state payload（`state.v`）；**不下 KV、不落 client**；一次性 callback 即棄 |
| redirect URI | `https://dash.samkuo.me/auth/line/callback`（＋dev localhost 登記於 LINE Console） |
| 身分 | 以 `userId`（不變）為鍵；`displayName` 可變僅顯示用；avatarUrl 可變僅顯示 |
| 信箱 | **不依賴** LINE email；無 email 者可正常 link／login |

---

## 9. 端到端流程（硬）

```text
dash（未登入）→ 「使用 LINE 進入」→ /auth/line（?intent=login）
  → LINE 授權（PKCE S256）→ 回 /auth/line/callback?code&state
  → decode state（取 verifier）→ exchangeLineCode → fetchLineProfile
  → completeSsoIntent(provider=line) → access token → dash session
  → /v1/me 回 line.display_name/avatar_url；Header/帳號顯示 LINE
  → 「登入我的遊樂場」?field=go → provision → go #pg_provision= → redeem
  → /v1/field/me 回 line 身分 → go Header profile 顯示 LINE avatar
```

---

## 10. 階段與完成定義

| Phase | 內容 | 完成定義 |
| --- | --- | --- |
| **0. 契約** | 本文件；DEC-053 | 提供者／state／身分／UI／go 相容清楚 |
| **1. Backend** | `lineOAuth.ts`；state `v`；`auth.ts` line 欄＋索引；`ssoFlow` line；路由／/v1/me／/v1/field/me／unlink；/health | curl `/auth/line` 跳 LINE；callback 換 token 回身分；`/v1/me` 回 line |
| **2. Dash UI** | 進入 CTA；帳號行；join；ssoCount；bootstrap 文案 | 三種 provider 均可在後台進入／綁定／解除 |
| **3. go 相容 E2E** | LINE 登入→provision go→`/v1/field/me` 顯示 | 一支瀏覽器 LINE→dash→go 完走；`/v1/field/me` 回 line 身分 |
| **4. 驗證** | 失敗態；bootstrap 注意；`alert` 不存在 | 見 §11 |

---

## 11. 驗收清單（草案）

**Platform**
- [ ] `/auth/line` 未設定 → `503 line_oauth_not_configured`；設定 → 跳 LINE（帶 `code_challenge`＋`method=S256`）
- [ ] callback：無效 state → fail；PKCE verifier 不匹配 → token exchange 失敗（錯誤面）
- [ ] `completeSsoIntent` 對 line：login／link／join／bootstrap 皆走通
- [ ] `/v1/me`、`/v1/field/me` 回 `line.display_name`／`avatar_url`；`/admin/users` 回 line summary
- [ ] `DELETE /v1/me/sso/line`；僅剩 line 時 `last_sso` 拒
- [ ] /health 回 `line_oauth`

**Dash**
- [ ] 未登入進入頁可「使用 LINE 進入」；join 可「以 LINE 綁定」
- [ ] 帳號頁 LINE 行：連結／解除；`ssoCount` 含 line
- [ ] bootstrap：LINE 非唯一首次路徑（文案）；事後可再綁 GitHub／Google

**go 相容**
- [ ] LINE 登入 →「登入我的遊樂場」`?field=go` → go Header 顯示 LINE avatar／名稱
- [ ] 本刀未改 `go-client/`；`alert` 不存在

---

## 12. 文件與用語

| 用 | 不用 |
| --- | --- |
| LINE 登入／連結／解除；`displayName`（顯示名） | 把 LINE 當唯一／主要登入；主打 LINE email |
| 既有 SSO 面新增第三提供者 | 「另外做一套 LINE 登入系統」 |
| go 自動相容（`/v1/field/me`） | 宣稱需要改 go client 才支援 LINE |

---

## 修訂紀錄

| 日期 | 變更 |
| --- | --- |
| 2026-08-11 | 初版 Draft：Dash 新增 LINE SSO（登入／連結／註冊／bootstrap）；關鍵差異＝無 email＋強制 PKCE S256 故 state 承載 `code_verifier`、以 `displayName`＋`userId` 為身分；go 經 `/v1/field/me` 自動相容零程式變更 |
