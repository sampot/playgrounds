# Playgrounds Platform 後台 UI 規格（DEC-047）

> **狀態：** Draft（2026-08-07）— 契約完整；實作：MVP＋SSO／access token／HOST invite＋**SvelteKit 5 後台**＋**使用者管理／自刪／SSO 連結管理**＋**「登入我的遊樂場」provision／場殼記憶體通行證**已落地；MFA／用量未落地  

> **權威決策：** [DECISIONS.md](./DECISIONS.md) **DEC-047**  
> **實作計劃：** [PG-PLATFORM-API-PLAN.md](./PG-PLATFORM-API-PLAN.md)  
> **相關：** DEC-004（敘事非產品）、DEC-005（Svelte 5 runes）、DEC-029（SecretStore＝**僅 BYOK**；**不含** Platform API key）、DEC-042（保留名 `api`／`dash`）、DEC-048（場網宿主 Kit；**不**取代本筆後台套件）、[PG-PLATFORM-CREDITS-PLAN.md](./PG-PLATFORM-CREDITS-PLAN.md)（點數／官方 TURN Draft）、[PG-INVITE-E2E-MVP.md](./PG-INVITE-E2E-MVP.md)（場邀請 E2E＝五子棋）、[PG-GO-ROOM-ENGINE-PLAN.md](./PG-GO-ROOM-ENGINE-PLAN.md)（常駐包廂 Dash §6.2.5；**未落地**）、[GLOSSARY.md](./GLOSSARY.md)、場殼 `PlaygroundsLayout`／`global.css`

一句話：**`dash.samkuo.me` 是 Platform 帳號／通行證／註冊營運後台（SvelteKit 5）——Host **主要入口**；統一進入（**Social SSO 公開自助註冊**：首次成功即建帳）後依角色顯示（一般使用者不見營運）；主 CTA「**登入我的遊樂場**」輪替場用 API key 並經短命 **provision** 深鏈開啟預設場（預設 `play.samkuo.me`）；場殼兌換後將 key **僅存記憶體**（**不**進 SecretStore）；註冊使用者可設預設遊樂場網址、**連結／解除 Social SSO**（至少保留一個）、**刪除自己的帳戶**；admin 可選核發註冊邀請並**管理已註冊使用者**；後台持 **access token**；場邀請短網址仍由 SAM 經殼代理取得（非後台鑄）；**不做場內 SSO**。**

---

## 1. 範圍

### 目標

- 提供可對外公開的後台表面（非場殼內嵌），完成 **Platform 帳號生命週期**與 **Host 入場**（「登入我的遊樂場」／預設場網址／SSO 連結管理／自刪帳戶／註冊邀請／**註冊使用者管理**）。
- 後台 UI 以 **SvelteKit 5**＋Svelte 5 **runes** 實作（與場殼同族工程；見 §10），部署仍掛 Platform Worker 的 `dash`／`api` 雙 origin。
- 與 `play.samkuo.me`／`docs.samkuo.me` **同一站群辨識**（頂欄、標記、色票、語系）。
- 信任域分離（硬）：
  - **後台：** SSO → **access token**（或同等 session）→ `Authorization: Bearer` 呼叫帳號／通行證／營運 API。
  - **場殼：** 經後台 **provision** 取得場用 API key → **僅存殼頁記憶體** → 殼代理代呼 Invite／signal。
  - **二者不可互換用途：** 後台 UI **不**用 API key 當登入後憑證；場殼 **不**持後台 access token。
  - **API key ∉ SecretStore：** Platform 通行證與 DEC-029 BYOK 密鑰庫分開；**不**寫入 `PLAYGROUNDS_API_KEY`、**不**經 `env.secrets.*` 暴露給 SAM。
- 文案／資訊架構符合 DEC-004：個人站後台，**非** SaaS 產品控制台腔。對讀者可稱「通行證」；勿強迫暴露 `pg_sk_`／provision 等內部語。

### 非目標

- **鑄場 Invite／短網址／`#pg=`（使用者發出的連線／會議邀請）**——權威路徑見 §7；**後台 UI 不做**（後台只做 **登入場／發通行證**，不鑄場邀請）。
- **場內 SSO**（不在 `play`／場 origin 做 GitHub／Google 登入換場憑證）。
- 場殼內嵌完整帳號後台。
- 把 Platform API key 寫入 SecretStore／OPFS／`.sam`，或要求使用者手動貼上 key。
- Deep link／URL **直接承載** `pg_sk_…` 明文。
- 通用 URL 縮址、CRM、帳單、多租戶組織。
- 以密碼／email magic link 當**主要**登入（允許僅作 SSO 帳號復原的例外須另修訂）。
- 在後台中繼 WebRTC／session 資料面。
- 把後台做成 Help Center 或行銷 landing。
- 讓後台以 API key 當 Bearer／登入憑證。
- Admin 營運面**硬刪他人**帳戶（營運對他人僅停用／復用；**自刪**見 §6.3）。
- 刪除帳戶的「審核工單／延遲冷卻期」產品流（自刪＝頁內確認後立即生效；若需寬限期另修訂）。
- 把 Platform **API** Worker 本體改寫成 SvelteKit SSR 應用伺服器（Kit 只承載 **dash UI**；`/v1/*` 仍為 Workers TypeScript）。
- 為 Platform 通行證改寫 DEC-029（SecretStore 維持 BYOK；本規格不要求密鑰庫改記憶體）。

---

## 2. 主機與路由

| 項 | 規格 |
| --- | --- |
| 後台 origin | **`https://dash.samkuo.me`**（Platform Worker custom domain） |
| API origin | **`https://api.samkuo.me`**（同 Worker；短連結 canonical） |
| `api` 根路徑 | `GET /`／`/admin` → **302** → `https://dash.samkuo.me/` |
| 後台頁面 | `GET /`、`GET /admin`（同 UI） |
| Bootstrap | `GET /bootstrap/`（**不**在登入頁顯示） |
| 註冊 landing | `GET /join/<token>`（可在 dash 或 api host；對外連結以 **dash** 為準） |
| Favicon | `GET /favicon.svg`（同 origin） |
| Health | `GET /health`（JSON；非 UI） |
| 場網保留名 | `dash`／`api` ∈ `PLAYGROUNDS_FIELD_RESERVED_SUBDOMAINS`；場殼**不**代理 |

**硬規則：**

- 短連結 `/i/<id>` 的對外 URL **必須**用 `api.samkuo.me`。
- QR 預設短網址。
- **場邀請 URL 不由後台頁產生**（見 §7）。

---

## 3. 資訊架構（IA）

### 3.1 全域殼

所有後台 HTML 頁共用：

1. **頂欄（sticky）** — 與場殼／文件站同族（場相關對外面共用）：
   - 標記（favicon／山姆鍋 mark）→ `https://samkuo.me/`
   - 導覽：`我是山姆鍋` · `遊樂場` · `小品` · `文件` · **`後台`**（`aria-current` 於後台）
   - **`文件` href：** `https://docs.samkuo.me/guides/opening-a-field/`（閱讀入口；**不是** splash 首頁 `/`。封面 `/` 留給行銷／對外分享。）
   - 外觀切換：淺／深（`localStorage`；預設跟隨 `prefers-color-scheme`，預設語意對齊場殼淺色）
2. **主區** — 單欄，`max-width ≈ 40rem`；首屏品牌級「遊樂場」標題。
3. **頁尾** — `api.samkuo.me`／`dash.samkuo.me`／`play.samkuo.me` 輕量鏈接；非行銷 footer。

### 3.2 登入與角色（硬）

1. **統一進入介面：** 未登入只有**一個**進入構成（SSO：GitHub／Google）。**不**分「使用者登入頁」與「管理者登入頁」；`/` 與 `/admin` 同 UI。
2. **登入後依角色顯示：** 同一已登入殼；可見區塊由 `role` 決定（見下表與 §5.4）。後台 API 呼叫持 **access token**。
3. **一般使用者看不到管理者專用 UI：** `role !== admin` 時，**營運** tab／panel／入口**不得出現**（含導覽、捷徑、深鏈切到營運）。不得僅「灰掉仍可見」。伺服器仍對 `/v1/admin/*` 做角色檢查（UI 隱藏 ≠ 授權）。

| 區塊 | 角色 | 一職 |
| --- | --- | --- |
| 帳號列 | 全部 | 顯示 `user_id`／角色；登出 |
| **主 CTA** | 全部（已登入） | 「**登入我的遊樂場**」——輪替通行證＋provision 開預設場（§6.2）；首屏優先於 tab |
| Tab：**遊樂場** | 全部 | 預設遊樂場網址；通行證狀態（prefix／尚無）；撤銷；進階說明（單席）；**點數餘額＋使用連線備援開關＋每 session 扣點**（§6.2.4；後段） |
| Tab：**帳號** | 全部 | Social SSO **連結／解除**（至少保留一個）；**刪除自己的帳戶** |
| Tab：**營運** | **僅 admin** | Platform **註冊**邀請、**管理註冊使用者**（列表／停用／復用／**加點**／**開通連線備援**）、用量／除錯（後段） |

**無「鑄場邀請」tab。** 場 Invite／短網址由場內 SAM 經殼代理取得（§7）。舊「金鑰」tab 併入 **遊樂場**（對讀者勿強調 API key）。

未登入：bootstrap 收入摺疊，不進第一視線競爭。

### 3.3 技術棧（硬）

| 項 | 規格 |
| --- | --- |
| 框架 | **SvelteKit 5**（後台 UI） |
| 元件 | **Svelte 5 runes**（`$state`／`$derived`／`$effect`／`$props` 等）；**禁止** legacy `export let`、`$:`、隱式 `let` 反應性（DEC-005） |
| 部署 | 仍為 Platform Worker：`dash.samkuo.me`／`api.samkuo.me`；Kit 產出由同 Worker 以 ASSETS（或 Cloudflare adapter 合併）服務 dash 頁 |
| API | `/v1/*`、OAuth callback、短連結 `/i/*` **維持** Workers TypeScript（`platform-api/src/*.ts`）；**不**經 Kit 重寫業務邏輯 |
| 汰除 | `platform-api/src/adminUi.ts` 字串模板 HTML／內嵌 JS（遷移完成後移除） |
| 與場殼 | 視覺對齊場殼 token；**套件獨立**於根專案 DEC-048（勿把 dash 併進場殼 `src/routes/`） |

**硬規則：** 禁止原生 `alert`／`confirm`／`prompt`（見 §4.2）；確認面用 Svelte 頁內元件。

### 3.4 註冊頁 `/join/<token>`

獨立 landing（同一視覺系統；Kit 路由）：驗證邀請狀態 → **領取／SSO 綁定** → 後台 session（**不**在註冊時自動鑄場用 API key；Host 入場改走「登入我的遊樂場」）。**主註冊路徑已改為 dash／go 直接 SSO**；本 landing 為 admin 選用邀請之相容面。

---

## 4. 品牌與視覺

### 4.1 對齊場殼（硬）

| Token | 淺色（預設） | 深色 |
| --- | --- | --- |
| 底 | `#f8faf9`（248 250 249） | `#121c1a`（18 28 26） |
| 字 | `#1c2321` | `#e2e8e6` |
| 強調 | `#0f766e`（teal） | `#2dd4bf` |
| 邊／卡 | 場殼 `--color-border`／card 同源 | 同左深色組 |
| 無襯線 | 系統／PingFang TC／Noto Sans TC（與場殼 `--font-sans`） | 同左 |
| 等寬 | IBM Plex Mono（金鑰、URL） | 同左 |
| Mark | 同 origin `/favicon.svg` | 同左 |

### 4.2 UX 品質（硬）

- **Mobile-first：** 所有畫面以窄螢幕為設計與實作起點，再以 `min-width`（或同等）遞增大螢幕；主 CTA／狀態／進入在手機須可完成。見 `.cursor/rules/mobile-first-ux.mdc`、`AGENTS.md` UI／UX。
- **品牌測試：** 拿掉頂欄後，第一視線仍須讀出「遊樂場／山姆鍋」場群，而非通用 admin template。
- **一構成：** 未登入首屏＝品牌標題＋一句說明＋一組進入 CTA；勿堆 stats／行程／多卡儀表。
- **卡片：** 僅承載互動（表單、密文揭示、邀請輸出）；可去邊框仍可理解則勿卡化。
- **動效：** 至少進場 rise／焦點環／按鈕回饋；尊重 `prefers-reduced-motion`。
- **禁止：** 紫系漸層預設、奶油底＋terracotta 預設、報紙密欄、全螢幕 hero 圖蓋文、emoji 當主圖示列。
- **禁止原生 Dialog：** 不得用 `alert`／`confirm`／`prompt` 做確認或文字輸入；改用頁內確認面／表單／flash。
- **語系：** UI **`zh-Hant`** 為準；技術識別子（`pg_sk_`、`signal.handshake`、path）可英文。
- **敘事：** 禁止「控制台／方案／升級／團隊席位」等產品腔（DEC-004）。

### 4.3 無障礙

- 頂欄與 tab 有可辨識的 `aria-label`／`aria-current`／`aria-selected`。
- 狀態訊息 `role="status"`／`aria-live="polite"`。
- 焦點可見；金鑰／短網址可鍵盤操作複製。
- `noindex`（後台與註冊頁）。

---

## 5. 身分與 session

### 5.1 信任域（硬）

| 域 | 誰用 | 用途 | 儲存／傳遞 |
| --- | --- | --- | --- |
| **Access token**（後台 session） | **僅後台 UI**（`dash`） | 登入後呼叫帳號／通行證／admin 等 API | SSO 換發；建議 HttpOnly **Secure** cookie，或短命 Bearer（**非** `pg_sk_` API key）。後台 `fetch` **只**帶此憑證 |
| **API key**（`pg_sk_…`） | **僅遊樂場殼頁** | 殼代理鑄 Invite、host signal pending／answer、撤銷 Invite 等**場用** API | 伺服器只存 hash。明文經 **provision redeem** 交給場殼後 **僅存殼頁記憶體**；關頁／重整清空。**不**進 SecretStore、**不**進 URL、**不**當後台登入憑證。硬頂 1；「登入我的遊樂場」＝**輪替**（舊場立刻失效） |
| **Provision token** | 後台→場殼交接 | 單次、短命；兌換 API key 明文 | Deep link（例 `#pg_provision=<token>`）**只**帶此 token，**永不**帶 `pg_sk_`。兌換後作廢；TTL 建議 60–120s |
| **Join capability** | 持 Invite 連結者 | 單次加入／offer | 短命；≠ API key、≠ access token、≠ provision |
| **註冊邀請** | 新使用者（選用） | 取得帳號資格（相容路徑） | `/join/<token>`；**主路徑＝dash／go 直接 SSO 建帳**；**≠** 場 `#pg=`、**≠** provision |

**硬規則：**

1. 後台登入成功後，所有後台發起的 `/v1/*` 帳號面呼叫 → **access token**。
2. API key **只**給場殼（經 provision → **記憶體**＋殼代理）；後台可顯示 prefix／撤銷，**不以 key 當 session**；**不以「複製貼上密鑰庫」為主路徑**。
3. 場殼**不**使用後台 access token；後台**不以** API key 登入或當 session。
4. **不做場內 SSO** 換取場憑證；Host 入場權威在 **dash**。
5. **單席：** 同一時間僅一把有效場用 key；再「登入我的遊樂場」＝輪替，其他已開場之記憶體 key 對 API 立刻失敗（避免共用／多開當 host）。
6. Platform API key **∉** SecretStore（DEC-029 仍專供 BYOK 等）。

### 5.2 Social SSO（Phase 5 — 規格定案）

| 優先 | 供應商 | 狀態 |
| --- | --- | --- |
| **必做** | **GitHub OAuth** | Phase 5.1 |
| **次做** | **Google OAuth** | Phase 5.2 |
| 不做（初版） | Apple、Facebook、Twitter／X、SAML／OIDC 企業、email 密碼 | 非目標 |

**理由（契約）：** 站群已用 GitHub 身分（Giscus）；技術向讀者與作者重疊高。Google 覆蓋非 GitHub 使用者（台灣等市場帳號面通常廣於 Facebook；初版不做 FB）。

**規則：**

1. **公開自助註冊：** 未登入者於 dash（或 go 登入面）以支援的 Social SSO（GitHub／Google／LINE）完成首次登入時，**自動建立** Platform 帳號（role=`user`）並綁定該 SSO；**不**需 `/join/<token>`。admin 可選核發註冊邀請（相容路徑仍保留）。密碼註冊仍禁止。
2. **不存密碼。**
3. Bootstrap：`ADMIN_BOOTSTRAP_TOKEN` 一次性 → 綁**第一個** admin 的 SSO subject → 作廢；之後不得再用 bootstrap 鑄 key。
4. 同一 Platform `user_id` 可連結多個 SSO provider（GitHub＋Google）；登入任一連結即可。
5. **已註冊使用者可自助新增／移除 SSO 連結**（見 §6.3）：未連結的供應商可「連結」；已連結可「解除」。**硬：帳號上至少必須保留一個已連結的 SSO**；試圖解除最後一個 → 拒絕（可讀錯誤＋code，例：`last_sso`）。
6. 連結衝突：該 SSO subject 已綁其他 `user_id` → 拒絕（既有 `*_already_linked` 類）。
7. SSO 成功 → 核發／刷新 **access token**（或 session cookie）；登出清 session；**不**自動撤銷 API key。解除某個 SSO **不**撤銷 API key、**不**登出（除非解除後無法維持 session 契約——預設維持目前 access token 至登出／過期）。
8. MFA：政策可選（TOTP 或供應商 MFA）；未啟用不得阻擋既有 **場殼** API key 呼叫。

### 5.3 進入路徑

進入後台：**僅 Social SSO**（GitHub／Google）→ access token／session cookie。

註冊：Social SSO 首次成功 → 後台 session（**不**自動鑄場用 API key）。可選 `/join/<token>` 邀請路徑仍可用。

進入遊樂場當 Host：「**登入我的遊樂場**」（§6.2）→ 輪替 key＋provision → 開預設場 → 場殼 redeem → 記憶體持 key。

**禁止**以 API key（`pg_sk_…`）登入後台或換取後台 session。API key 僅場殼記憶體。

**禁止**場 origin 上的 Social SSO 作為發放場用 API key 的路徑（非目標：場內 SSO）。

### 5.4 角色

| 角色 | 後台可見 | 不可見 |
| --- | --- | --- |
| **user** | 統一進入後 → 帳號列＋**登入我的遊樂場**＋**遊樂場**＋**帳號**（SSO／自刪） | **營運**及一切 admin 專用表面（含註冊邀請、使用者列表） |
| **admin** | 同上＋**營運**（註冊邀請＋**使用者管理**） | — |
| **未登入** | 統一進入／bootstrap（僅未 bootstrapped）／註冊 landing | 已登入殼（遊樂場／帳號／營運） |

停用使用者（admin）：後台標「已停用」；其 **access token** 與 **API key** 驗證均失敗 `401`／`403`；既有場 Invite 不回溯撤銷（另操撤銷 Invite）。復用後可再登入；**有效 key** 須再次「登入我的遊樂場」取得（停用期間驗證失敗；復用後若 hash 仍在且未被撤銷，舊記憶體 key 可恢復可用——實務上記憶體已因關頁清空，使用者仍走 provision）。

自刪帳戶（本人）：見 §6.3；刪除後該 `user_id` 記錄與 SSO 索引、場用 key、access token、未兑 provision **不可再用於驗證**；既有場 Invite 不回溯撤銷。

---

## 6. 畫面規格

### 6.1 進入（未登入）— 統一介面

**職：** 取得後台 **access token**／session（**所有角色同一入口**）。

| 元素 | 規格 |
| --- | --- |
| 標題 | 「遊樂場」（品牌級） |
| 副句（對讀者） | 勿暴露內部契約用語。例：「管理帳號、並從這裡登入你的遊樂場。用 GitHub 或 Google 進入即可。」進入區勿提 access token／API key／provision／殼代理等 |
| 主 CTA | 「使用 GitHub 進入」；次：「使用 Google 進入」（5.2）→ SSO → **access token** |
| Bootstrap | **另頁** `GET /bootstrap/`（不在登入首屏）；token＋「以 GitHub 完成 bootstrap」 |

**錯誤：** token 錯、已 bootstrap、`bootstrap_not_configured` → 可讀中文＋技術 `error` code。

登入成功後依 `/v1/me`（持 access token）的 `role` 渲染 §3.2；**不**依登入方式分支不同首頁。首屏已登入區優先顯示 §6.2 主 CTA。

### 6.2 遊樂場（登入場／通行證）

**職：** 後台作為 **Host 主要入口**——「登入我的遊樂場」；設定預設場；檢視／撤銷通行證狀態。對讀者＝**通行證**（VIP）；**非**後台 session。

#### 6.2.1 「登入我的遊樂場」（主路徑）

| 元素 | 規格 |
| --- | --- |
| 主 CTA | 「**登入我的遊樂場**」（已登入首屏＋遊樂場 tab 皆可） |
| 行為 | 持 access token：`POST` provision（見 API plan）→ **輪替**場用 API key（硬頂 1；舊 key 立刻失效）→ 回傳短命 provision＋目標場 deep link → 瀏覽器開啟該 URL |
| Deep link | 目標＝（1）請求帶的 **`target_field`／`?field=`**（場殼發起登入），否則（2）使用者**預設遊樂場網址**（無則 `https://play.samkuo.me`）；hash 例 `#pg_provision=<token>`。**禁止** URL 含 `pg_sk_` |
| **場殼發起** | 工具列「登入」→ `dash/?field=<本場 origin>`；未登入後台則先 SSO；成功後**自動** provision 回該場（勿再要求使用者點一次主 CTA）。仍**不做場內 SSO** |
| 場殼狀態 | 工具列顯示已登入／未登入；「登出」＝清除本頁記憶體通行證（不經場內 OAuth） |
| 場殼 | 偵測 provision → `POST` redeem → 取得 key 明文一次 → **寫入殼頁記憶體** → 清除 hash。之後殼代理讀記憶體 |
| 說明文案 | 明示：**同一時間只能登入一個遊樂場**；再登入會讓其他場的通行證失效；關閉遊樂場頁面後須重新登入 |
| 後台 session | **不變**（access token 不因 provision 而撤銷） |
| 失敗 | provision／開啟失敗 → flash；不留下半套狀態於讀者難理解處 |

#### 6.2.2 預設遊樂場網址

| 元素 | 規格 |
| --- | --- |
| 欄位 | 可編輯；預設 `https://play.samkuo.me` |
| 允許清單 | 初版：**官方場** `https://<name>.samkuo.me`（排除保留名 `api`／`dash`／`docs`／`www`／`blog`／`old-blog` 等，與 DEC-042 對齊）。自架任意 origin＝後段或另修訂 |
| 儲存 | 帳號偏好（`/v1/me` 可讀寫；持 access token） |
| 用途 | 僅用於組 provision deep link；**不**等於場 Invite 的 `targetField` 預設（鑄 Invite 時場殼仍可用目前 host） |

#### 6.2.3 通行證狀態（進階／復原）

| 元素 | 規格 |
| --- | --- |
| 顯示 | 有 key：`prefix…`＋建立時間；無：「尚未登入場」或「尚無通行證」 |
| **不**回顯完整明文 | 後台**不以**「複製 key 貼上場」為主路徑；明文只經場殼 redeem 進記憶體 |
| 撤銷 | 已有 key 時可操作；確認後面殼記憶體 key 對 API 失效；**不**強制登出後台 |
| 手動輪替（可選） | 若保留獨立「更換通行證」＝等同再走一次「登入我的遊樂場」語意（須再開場）；勿另開「複製明文」揭示盒為主 UX |

**廢止（相對舊契約）：** SecretStore 保留名 `PLAYGROUNDS_API_KEY`、後台揭示盒＋「寫入密鑰庫」、場內手動貼上。

#### 6.2.4 點數（**全部已登入角色**；後段／見點數計劃）

**職：** 本人查看**剩餘點數**、**每個 session 扣了多少點**，以及自設是否**使用連線備援**。權威契約與計價見 [PG-PLATFORM-CREDITS-PLAN.md](./PG-PLATFORM-CREDITS-PLAN.md)。

**可見性：** `user` 與 `admin` 皆可見（非營運專屬）。

| 元素 | 規格 |
| --- | --- |
| 放置 | **遊樂場** tab 內小標「點數」（通行證區下方或並列；窄螢幕堆疊） |
| **剩餘點數** | 顯著顯示目前餘額（整數）；低於門檻時 inline「額度偏低」（不阻擋「登入我的遊樂場」） |
| **使用連線備援** | 本人開關（`turn_prefer`）；**僅**在 admin 已開通 `turn.hosted` 時可勾選啟用。**開啟**＝之後 session 邀請以官方 relay 為傳輸路徑（被邀請端與 Host **不嘗試** WebRTC 直連）；**關閉**＝僅直連／STUN、不扣備援點 |
| **Session 扣點列表** | 只讀；每一列＝**一個 session** 的扣點彙總（該 session 內有成本備援合計） |
| 列欄位（至少） | 時間、扣點數（例：`−12`）、可選原因（例：連線轉發）；可選截斷 `session_id` |
| 排序 | 新→舊 |
| 空態 | 「尚無 session 扣點」（說明僅官方連線轉發等才會扣點） |
| 錯誤 | flash／`role="status"`；**不**原生 dialog |
| 非目標（初版） | 自助買點、匯出、圖表；admin 加點見 §6.5.2（不在本區操作） |

**對應 API（持 access token）：**

| 方法 | 路徑 | 行為 |
| --- | --- | --- |
| `GET` | `/v1/me/credits` | 回餘額（可含 `turn_hosted`／`turn_prefer`） |
| `GET` | `/v1/me/credits/sessions` | 回依 session 彙總之扣點列表 |
| `PATCH` | `/v1/me` | 可設 `{ turn_prefer: boolean }`（未開通資格 → 拒） |

#### 6.2.5 常駐包廂（**後段**；見 [PG-GO-ROOM-ENGINE-PLAN.md](./PG-GO-ROOM-ENGINE-PLAN.md)）

**職：** 讓已安裝 **`pg-booth-desktop`** 或 **`pg-boothd`** 的使用者從後台得知包廂是否在線，並一鍵「連回包廂」做遠端導播（Operator）。**不是**鑄場 Invite；**不是**第二個「登入我的遊樂場」。

**可見性：** `user` 與 `admin` 皆可見（非營運專屬）。

| 元素 | 規格 |
| --- | --- |
| 放置 | **遊樂場** tab；通行證區下方（或點數區上方）；窄螢幕堆疊 |
| 資料來源 | `GET /v1/booth/anchors/active`（持 access token） |
| **在線** | 顯示：裝置名（`deviceLabel`）、「N 人在」、大螢幕摘要（例：「臥室鏡頭」／「沒訊號」） |
| **離線** | 「目前沒有常駐包廂」+ 說明如何取得 **`pg-booth-desktop`**（輕量）或 **`pg-boothd`**（專業）（**非**開源；連產品文件／安裝說明；**不**在 dash 內嵌安裝器、**不**連 GitHub 原始碼） |
| 主 CTA（在線） | 「**連回包廂**」→ 開 `remoteUrl`（go `/room/remote?…`） |
| 次動作 | 「結束常駐包廂」→ 頁內確認 → `DELETE /v1/booth/anchors/active` |
| **裝置** | 子區：已綁定 `device_token` 列表；可「撤銷裝置」 |
| 非目標 | Dash 內 WebRTC 預覽；常駐包廂設定編輯器 |

**對讀者用語：** 「常駐包廂」「連回包廂」；勿寫 Engine／DO／daemon 當標題。

### 6.3 帳號（**全部已登入角色**）

**職：** 管理自己的 Social SSO 連結，以及**刪除自己的帳戶**。

**可見性：** `user` 與 `admin` 皆可見（非營運）。

#### 6.3.1 Social SSO 連結

| 元素 | 規格 |
| --- | --- |
| 列表 | 每個支援的供應商一列（初版：GitHub、Google）：狀態＝已連結（顯示 `login`／email）或未連結 |
| 新增連結 | 未連結列：「連結 GitHub／Google」→ 走既有 OAuth link 流程 → 成功後列更新為已連結 |
| 移除連結 | 已連結列：「解除連結」→ 頁內確認 → 解除該 provider |
| **至少一個** | 當帳號僅剩**一個**已連結 SSO 時，該列「解除連結」**不可操作**（或確認後 API 拒）；文案說明「至少須保留一個登入方式」；錯誤 code 例：`last_sso` |
| 衝突 | subject 已綁其他帳號 → 可讀錯誤（既有 `*_already_linked`） |
| 與金鑰 | 連結／解除**不**輪替或撤銷場用 API key（亦不觸發 provision） |

**對應 API（持 access token；細節以 API 計劃對齊）：**

| 方法 | 路徑 | 行為 |
| --- | --- | --- |
| （既有）OAuth link | `/auth/github`、`/auth/google`（已登入＋link 意圖） | 新增連結 |
| `DELETE` | `/v1/me/sso/github` 或 `/v1/me/sso/google` | 解除該 provider；若為最後一個 → `400`／`409`＋`last_sso` |

（路徑名可微調；契約語意＝本人解除＋至少保留一個。）

#### 6.3.2 刪除自己的帳戶

| 元素 | 規格 |
| --- | --- |
| 入口 | 帳號 tab 底部危險區：「刪除我的帳戶」 |
| 確認 | **頁內確認面**（非原生 dialog）：說明後果（無法再以此帳號進入後台；場用通行證失效；之後須再以 Social SSO 建立新帳戶）；需明確確認動作（例：勾選「我了解」或輸入固定提示語——**勿**用 `prompt`） |
| 成功 | 清 session／access token；導回未登入進入頁；flash 可選「帳戶已刪除」 |
| 效果 | 刪除（或等效不可恢復之標記）`user` 記錄、SSO 索引、場用 API key、該使用者 access token；**不**回溯撤銷已鑄場 Invite |
| 最後 admin | **不可**自刪「目前唯一未停用的 admin」（與停用對稱）；→ 可讀錯誤＋`last_admin`；須先有其他 admin 或完成交接 |
| 與營運停用 | 自刪 ≠ admin 停用；自刪後列表中**不再出現**該使用者（或僅短暫 tombstone，初版以不再列出為準） |
| Admin 營運 | **不**提供「代刪他人」按鈕（見 §6.5.1） |

**對應 API：**

| 方法 | 路徑 | 行為 |
| --- | --- | --- |
| `DELETE` | `/v1/me` | 刪除目前使用者帳戶；`last_admin` 時拒絕 |

### 6.4 （刪除）場 Invite 鑄造

**不在後台。** 見 §7。

### 6.5 營運（**僅 admin**）

**職：** Platform **註冊**與營運（≠ 場 Invite）。

**可見性：** 僅 `role === admin`。一般使用者：tab 不渲染／`hidden`＋不可選；panel 不得露出。API：`/v1/admin/*` 對非 admin → `403`。

營運 panel 內分兩塊（同一 tab；可為小標分段，**不**另開「使用者」頂層 tab）：

1. **註冊邀請**（核發）
2. **註冊使用者**（列表與停用／復用／**加點**／**開通連線備援**）

| 能力 | 優先 | 規格 |
| --- | --- | --- |
| 核發註冊邀請 | **MVP**（已落地） | 回 `join_url`（dash）、到期；複製 |
| **管理註冊使用者** | **必做** | 見 §6.5.1 |
| **為使用者加點** | 後段（點數計劃 Phase 1） | 見 §6.5.2 |
| **開通／關閉連線備援** | 後段（點數計劃；官方 TURN） | 見 §6.5.3 |
| Invite／隊列除錯 | 後段 | 只讀除錯（營運）；**非**使用者鑄鏈入口 |
| 用量 | 後段 | 每 user／日 join 與 invite 計數摘要；點數 ledger 以 §6.2.4／§6.5.2 為準 |
| **布告（go）** | 後段 | 發佈／下架純玩版全站布告；見 [PG-GO-BULLETIN-PLAN.md](./PG-GO-BULLETIN-PLAN.md)；**非**場 Invite、**非**註冊邀請 |

#### 6.5.1 管理註冊使用者

**職：** admin 檢視已註冊 Platform 帳號並停用／復用（公開自助註冊帳號面的營運把手）。

| 元素 | 規格 |
| --- | --- |
| 列表 | 顯示已註冊使用者；每列至少：`user_id`、`role`、狀態（使用中／已停用）、SSO 摘要（GitHub `login` 與／或 Google email；未綁則「未連結」）、場用 key `prefix…` 或「尚無通行證」、預設場 origin（可選）、**點數餘額**、**連線備援**（已開通／未開通；點數計劃落地後）、建立時間 |
| 排序 | 預設依 `createdAt` 新→舊（或 `user_id`）；無需分頁直到列表過長（後段可加） |
| 篩選 | 初版可無；後段可加「僅已停用／僅 admin」 |
| 停用 | 頁內確認面（非原生 dialog）：確認後該使用者 **access token** 與 **API key** 驗證失敗；列表標「已停用」 |
| 復用 | 頁內確認；清 `disabled`；列表恢復「使用中」 |
| 不可對自己 | 對**目前登入**的 `user_id`，停用／復用按鈕不可操作；文案說明「不可停用自己」（本人若要離開→走 §6.3.2 自刪） |
| 最後 admin | **不可**停用「目前唯一未停用的 admin」（避免鎖死後台）；嘗試 → 可讀錯誤＋技術 code（例：`last_admin`） |
| 無代刪 | **不**提供「刪除使用者」按鈕（他人僅停用；本人自刪見 §6.3.2） |
| 空態 | 「尚無其他註冊使用者」或僅自己時仍顯示自己那一列（動作不可用） |
| 錯誤 | `403`／`404`／`last_admin` 等 → flash／`role="status"` |

**對應 API（後台持 access token＋admin；細節以 API 計劃對齊）：**

| 方法 | 路徑 | 行為 |
| --- | --- | --- |
| `GET` | `/v1/admin/users` | 列出註冊使用者（含上表欄位所需欄位） |
| `POST` | `/v1/admin/users/:userId/disable` | 停用 |
| `POST` | `/v1/admin/users/:userId/enable` | 復用 |

（等價：單一 `PATCH` 設 `disabled` 亦可；UI 語意仍為停用／復用兩動作。）

#### 6.5.2 為使用者加點（**僅 admin**；後段）

**職：** 為指定註冊使用者**增加**點數（人工儲值／贈點）。計價與帳本見 [PG-PLATFORM-CREDITS-PLAN.md](./PG-PLATFORM-CREDITS-PLAN.md)。

| 元素 | 規格 |
| --- | --- |
| 入口 | §6.5.1 列表每列：「**加點**」 |
| 流程 | 頁內面板／確認面：輸入**正整數** `amount`、可選備註 → 確認 → flash／列上更新餘額 |
| 驗證 | `amount` ≥ 1；非法輸入頁內擋下 |
| 已停用 | 加點不可用或 API 拒＋可讀錯誤 |
| 初版不做 | 後台「扣點／歸零」、批量加點、金流自助儲值 |

**對應 API（持 access token＋admin）：**

| 方法 | 路徑 | 行為 |
| --- | --- | --- |
| `POST` | `/v1/admin/users/:userId/credits` | body：`{ amount: number }`（正整數）＋可選備註；回新餘額 |

#### 6.5.3 開通／關閉連線備援（官方 TURN）（**僅 admin**；後段）

**職：** 決定**哪個註冊使用者**可使用官方 relay（TURN）。對應 entitlement `turn.hosted`（與點數餘額正交：先開通、再有點才能簽發 cred）。見 [PG-PLATFORM-CREDITS-PLAN.md](./PG-PLATFORM-CREDITS-PLAN.md)。

| 元素 | 規格 |
| --- | --- |
| 入口 | §6.5.1 列表每列：顯示備援狀態；動作「**開通連線備援**」／「**關閉連線備援**」（或同等 toggle） |
| 對讀者用語 | 「連線備援」／「轉發」；**勿**主打 TURN／ICE／relay 術語（除錯可次要） |
| 開通 | 頁內確認（可選）：確認後該使用者可向 Platform 請求官方 TURN credentials（仍須餘額足夠） |
| 關閉 | 頁內確認：確認後不可再簽發新 hosted cred；已建立之 peer 行為實作另定（建議盡快停續簽） |
| 列表 | 狀態欄＝已開通／未開通；預設**未開通** |
| 已停用 | 開通／關閉不可用或 API 拒 |
| 與加點 | **獨立**：開通≠自動加點；加點≠自動開通 |
| 非目標（初版） | 批量開通、依方案自動開通、使用者自助申請開通 |

**對應 API（持 access token＋admin）：**

| 方法 | 路徑 | 行為 |
| --- | --- | --- |
| `POST` | `/v1/admin/users/:userId/entitlements/turn.hosted` | body：`{ enabled: boolean }`（或拆 enable／disable）；回目前 entitlement |

### 6.6 註冊 landing `/join/<token>`

| 狀態 | UI |
| --- | --- |
| 有效 | 說明＋主 CTA（SSO：以 GitHub／Google 綁定 → access token；**不**自動鑄場用 API key／不自動 provision） |
| 過期／已用／無效 | 明確狀態膠囊＋連回後台／場 |
| 領取成功 | 導回後台已登入；Host 入場改由「登入我的遊樂場」 |

---

## 7. 與 API／場殼／SAM 的邊界

### 7.0 Host 入場（provision）權威路徑（硬）

```text
後台「登入我的遊樂場」（持 access token）
  → POST /v1/field/provision（輪替 API key＋核發短命 provision）
  → 開啟 {default_field}/#pg_provision=<token>
  → 場殼偵測 hash → POST /v1/field/provision/redeem
  → 取得 pg_sk_… 一次 → 寫入殼頁記憶體 → 清除 hash
  → 之後殼代理讀記憶體呼叫場 API
```

| 規則 | 說明 |
| --- | --- |
| URL **無** API key | 只帶 provision token |
| Key **∉** SecretStore | 僅記憶體；關頁／重整清空；再當 host → 回後台 CTA |
| 單席輪替 | 每次 provision 建立流程輪替 key；其他場立刻失效 |
| 無場內 SSO | 不在場 origin 換發 key |

無記憶體 key 時：殼代理鑄 Invite → 可讀錯誤（例 `not_provisioned`）＋引導回 dash「登入我的遊樂場」（**勿**再要求解鎖密鑰庫）。

### 7.1 場邀請 URL 權威路徑（硬）

使用者要分享的 **場 Invite 短網址／深鏈**（`api.samkuo.me/i/…`、`#pg=`）：

```text
SAM（現行 Agent／會議小品等）
  → 場殼代理（env.HOST 或同等 /api/shell／host 通道）
  → 讀殼頁記憶體中的場用 API key（已 provision）
  → POST https://api.samkuo.me/v1/invites
  → 回傳 short_url／deep_link 給 SAM 呈現（QR／複製／分享）
```

| 規則 | 說明 |
| --- | --- |
| **後台 UI 不鑄場邀請** | `dash` 無「建立短連結邀請」產品入口（有「登入場」≠鑄場邀請） |
| **SAM 不直連持 key 的瀏覽器任意 fetch 繞過殼** | key 不出記憶體進 SAM 可序列化狀態；由殼代理代呼（值僅在殼／Runtime 記憶體短用） |
| **殼代理** | 對齊既有 HOST 模式：僅現行 Agent（或明確授權之 SAM）可觸發；`capabilities()` 可探測（名稱以 host-api 落地為準，例：`createPlatformInvite`） |
| **作答循環／`#pg=` 兌換** | 仍在場殼（線上／Roster／深鏈處理）；可顯示 SAM 已取得的 URL，但不替代鑄造權威 |
| **`#pg_provision=` ≠ `#pg=`** | 前者＝Host 通行證交接；後者＝場 Invite |

### 7.2 職責表

| 動作 | 後台 UI | 場殼 | SAM（經殼代理） |
| --- | --- | --- | --- |
| 登入後台（SSO → access token） | ✅ | ❌ | ❌ |
| **登入我的遊樂場**（輪替＋provision） | ✅（持 access token） | redeem → 記憶體 | ❌ |
| 預設遊樂場網址 | ✅ | ❌ | ❌ |
| 撤銷通行證／看 prefix | ✅ | ❌（記憶體有無由殼自知） | ❌ |
| **SSO 連結／解除**（至少保留一個） | ✅（本人；持 access token） | ❌ | ❌ |
| **刪除自己的帳戶** | ✅（本人；持 access token） | ❌ | ❌ |
| **鑄場 Invite／短網址** | ❌ | 代理呼叫（持**記憶體** API key） | ✅ 發起 |
| Host 作答循環 | ❌ | ✅（持記憶體 API key） | 可驅動／觀測 |
| `#pg=` 兌換／compose | ❌ | ✅ | 可參與 UX |
| Platform **註冊**邀請 | ✅（admin；持 access token）／landing | ❌ | ❌ |
| **管理註冊使用者**（列表／停用／復用） | ✅（admin；持 access token） | ❌ | ❌ |
| 場內 SSO 發 key | ❌ | ❌ | ❌ |

### 7.3 過渡實作

若場殼仍讀 SecretStore `PLAYGROUNDS_API_KEY`：視為 **債務**，須改為記憶體＋provision；文件與錯誤文案不得再教「寫入密鑰庫」。側欄「線上」tab 已取消；鑄邀請權威路徑＝HOST 代理＋SAM／Shell UI。後台若曾有「邀請」tab 鑄場 Invite，須移除。

---

## 8. 文案用語表（UI）

| 用 | 不用 |
| --- | --- |
| 後台、進入、帳號、**登入我的遊樂場**、通行證、預設遊樂場、撤銷通行證、連結／解除（SSO）、刪除我的帳戶、註冊邀請、**註冊使用者**、停用／復用、營運、工作階段 | 控制台、Dashboard 當品牌名、方案、席位、Team、Billing、User management／Close account 產品腔；**勿**把「短網址邀請」當後台主職；**勿**暗示後台用 API key 登入；對讀者**勿**主打「API key／SecretStore／provision」 |
| 遊樂場、我是山姆鍋 | Playgrounds Cloud、平台產品名單獨 hero 蓋過山姆鍋 |
| （對讀者）同一時間只能登入一個遊樂場 | 「多裝置同步金鑰」「雲端 API 金鑰倉」 |
| （場內）邀請連結／短網址 | 後台「一鍵發會議連結」 |
| （對讀者）點數、剩餘點數、session 扣點、加點、連線備援（開通／關閉） | 方案、訂閱、Pro、Billing、儲值套餐產品腔；對讀者主打 TURN／ICE |

標題模式：`遊樂場後台 · 我是山姆鍋`；註冊：`遊樂場註冊邀請 · 我是山姆鍋`。

---

## 9. 狀態與完成定義

### 9.1 MVP（部分對齊；auth 契約未完）

- [x] `dash.samkuo.me` 品牌殼＋淺／深色
- [x] 統一進入介面；登入後依角色顯示；**user 不見營運 UI**
- [x] 金鑰輪替／撤銷／一次揭示（場用 key）——**舊路徑**；須改 §6.2 provision
- [x] Admin 註冊邀請＋`/join` claim
- [x] Bootstrap 摺疊表單
- [x] 後台**無**場 Invite 鑄造入口（對齊 §7）
- [x] **後台 API 僅 access token**（GitHub SSO／session cookie；場 API 拒 access token）
- [x] HOST／殼代理 `createPlatformInvite`（或同等）供 SAM 呼叫——**仍讀 SecretStore 為債務**

### 9.2 Phase 5＋後台 Kit／使用者管理

- [x] GitHub OAuth 登入／綁定（公開自助＋邀請相容）→ 核發 access token（程式落地；正式域 secrets／callback 需驗證）
- [x] Google OAuth
- [x] Access token／session cookie 為後台進入；API key 僅場殼
- [x] 汰除「貼 API key 登入」過渡（改純 SSO）
- [x] **後台 UI 遷 SvelteKit 5**（runes；汰除 `adminUi.ts`）
- [x] **管理註冊使用者**：`GET/POST /v1/admin/users…`＋營運 UI（列表／停用／復用；不可停用自己／最後 admin）
- [x] **帳號 tab**：SSO 新增／移除連結（至少保留一個；`last_sso`）
- [x] **自刪帳戶**：`DELETE /v1/me`＋頁內確認（`last_admin` 不可自刪）
- [x] **「登入我的遊樂場」＋ provision／redeem**（輪替；URL 無 `pg_sk_`；場殼記憶體）
- [x] **預設遊樂場網址**（允許清單）
- [x] 殼代理改讀記憶體；**廢止** `PLAYGROUNDS_API_KEY` SecretStore 主路徑
- [ ] MFA 政策開關
- [ ] （可選）隊列／用量只讀
- [ ] **點數／備援：** 遊樂場 tab 餘額＋**使用連線備援**開關＋session 扣點；營運列表**加點**＋**開通／關閉連線備援**（§6.2.4／§6.5.2／§6.5.3；見點數計劃）

### 9.3 完成檢查（SSO 後）

- [ ] 無邀請不可自助註冊
- [ ] 登出後無法呼叫需 access token 的後台動作；場用 API key 僅在**已 provision 之場殼記憶體**有效直至撤銷／輪替／關頁
- [ ] 後台網路請求 **不**帶 `pg_sk_`；場殼 **不**帶後台 access token
- [ ] Provision deep link **不**含 `pg_sk_`；redeem 單次
- [ ] 再「登入我的遊樂場」後，舊場記憶體 key 對 API 失敗（單席）
- [ ] Platform key **不**出現在 SecretStore／`env.secrets`
- [ ] 頂欄與場殼品牌測試通過
- [ ] 短網址域名永遠為 `api.samkuo.me`
- [x] 場邀請僅能經 SAM→殼代理取得（後台無鑄入口）
- [ ] `role !== admin` 時網路／UI 皆無法觸及使用者列表與停用 API
- [ ] 停用後該使用者無法再以 access token／API key 通過驗證；復用後恢復（未另撤銷 key 時）
- [ ] 解除最後一個 SSO 被拒；僅一個連結時 UI 不可解除
- [ ] 自刪後無法再以原 SSO／key 進入；session 已清；營運列表不再出現（或等效）
- [ ] 唯一 admin 不可自刪／被停用
- [ ] 後台頁為 Kit 路由／元件；無 `adminUi.ts` 字串模板
- [ ] DEC-004 文案複核無產品腔；對讀者主路徑無「貼 API key／密鑰庫」

---

## 10. 實作落點

| 區域 | 路徑 |
| --- | --- |
| 後台 UI（**SvelteKit 5**） | `platform-api/` 內獨立 Kit 套件或子目錄（建議 `platform-api/dash/`；路由：`/`、`/admin`、`/bootstrap/`、`/join/[token]`）；產出掛同 Worker ASSETS／adapter |
| Worker 入口／API／OAuth／短連結 | `platform-api/src/index.ts` 等 |
| 帳號／key／provision／SSO 連結解除／自刪／註冊邀請／**使用者列表與停用** | `platform-api/src/auth.ts`（＋`/v1/me`、`/v1/field/provision*`、`/v1/me/sso/*`、admin users 端點） |
| （已刪）舊字串模板 UI | ~~`platform-api/src/adminUi.ts`~~ — 已汰除 |
| 場內 Platform 客戶端 | `src/components/playgrounds/platform/*` |
| 保留名 | `src/worker.ts`、`src/utils/playgroundsUrls.ts` |

**建置／指令（落地時對齊 `platform-api/package.json`／根 scripts）：** Kit `check`／build；Platform `deploy` 須同時帶上 API Worker 與 dash 靜態（或 adapter）產出。

---

## 修訂紀錄

| 日期 | 變更 |
| --- | --- |
| 2026-08-06 | 初版：完整後台 UI 規格；SSO 定案 GitHub 必做、Google 次做；對齊已落地 MVP |
| 2026-08-06 | **場邀請 URL＝SAM→殼代理→API**；後台不做鑄場 Invite；IA 僅金鑰＋營運 |
| 2026-08-06 | **統一進入介面**；登入後依角色顯示；一般使用者不可見營運 UI |
| 2026-08-06 | **後台＝access token；API key＝僅場殼**；汰除後台以 key 當 session 的契約 |
| 2026-08-06 | 實作：`pg_at_` access token、`/v1/auth/token`／logout；帳號面拒 API key；場 API 拒 access token |
| 2026-08-06 | GitHub OAuth：`/auth/github`＋callback；邀請制 join／link／bootstrap；session cookie |
| 2026-08-06 | 移除後台 API key 登入過渡（UI＋`/v1/auth/token`） |
| 2026-08-06 | 禁止原生 `alert`／`confirm`／`prompt`；後台改頁內確認面 |
| 2026-08-06 | HOST `createPlatformInvite`／`revokePlatformInvite`（SecretStore 殼代理） |
| 2026-08-06 | Google OAuth：`/auth/google`＋callback；與 GitHub 並存連結同一 `user_id` |
| 2026-08-07 | **後台 UI 改 SvelteKit 5**（runes；汰除 `adminUi.ts`）；**管理註冊使用者**納入營運必做（§6.5.1＋admin users API） |
| 2026-08-07 | 註冊使用者：**自刪帳戶**（§6.3.2）；**新增／移除 Social SSO** 且至少保留一個（§6.3.1／`last_sso`）；新增「帳號」tab |
| 2026-08-07 | **實作落地：** `platform-api/dash` SvelteKit 5；API `admin/users`／`DELETE /v1/me`／`me/sso/*`；汰除 `adminUi.ts` |
| 2026-08-07 | 後台對讀者文案：勿暴露 access token／API key／殼代理等內部用語 |
| 2026-08-07 | 註冊／join **不**自動建立場用 API key；改由金鑰 tab 自建 |
| 2026-08-07 | **Host 入場＝「登入我的遊樂場」＋短命 provision**；API key **僅場殼記憶體**（∉ SecretStore）；URL 無 `pg_sk_`；每次輪替＝單席；可設預設遊樂場；**不做場內 SSO**；廢止貼入 `PLAYGROUNDS_API_KEY` 主路徑 |
| 2026-08-07 | **場殼工具列登入／登出**：未登入→後台 `?field=`；SSO 成功後 **自動 provision 回該場**；已登入顯示狀態＋登出（清記憶體） |
| 2026-08-07 | **UX 硬規則：mobile-first**（§4.2；對齊 `.cursor/rules/mobile-first-ux.mdc`／`AGENTS.md`） |
| 2026-08-07 | **點數後台：** §6.2.4 使用者餘額＋每 session 扣點；§6.5.2 admin 加點（對齊 [PG-PLATFORM-CREDITS-PLAN.md](./PG-PLATFORM-CREDITS-PLAN.md)） |
| 2026-08-07 | **§6.5.3** admin 開通／關閉連線備援（`turn.hosted`）；與加點正交 |
| 2026-08-07 | **§6.2.4** 使用者可自設**使用連線備援**（`turn_prefer`；需已開通資格） |
| 2026-08-16 | §6.2.4：`turn_prefer` 開啟＝session 邀請 **relay-only**（不嘗試直連）；對齊點數計劃 |
| 2026-08-18 | §6.5 營運能力表預留 **布告（go）**（後段；見 [PG-GO-BULLETIN-PLAN.md](./PG-GO-BULLETIN-PLAN.md)） |
| 2026-08-22 | **公開自助註冊：** SSO 首次 login 建帳；`/join` 邀請改選用；DEC-047 對齊 |
| 2026-08-23 | **§6.2.5 常駐包廂（後段）：** Dash 遊樂場 tab 狀態卡＋「連回包廂」；見 [PG-GO-ROOM-ENGINE-PLAN.md](./PG-GO-ROOM-ENGINE-PLAN.md) |
