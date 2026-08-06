# Playgrounds Platform 後台 UI 規格（DEC-047）

> **狀態：** Draft（2026-08-06）— 契約完整；實作：MVP＋GitHub／Google SSO／access token／HOST `createPlatformInvite` 已落地；MFA／停用使用者未落地  

> **權威決策：** [DECISIONS.md](./DECISIONS.md) **DEC-047**  
> **實作計劃：** [PG-PLATFORM-API-PLAN.md](./PG-PLATFORM-API-PLAN.md)  
> **相關：** DEC-004（敘事非產品）、DEC-029（SecretStore）、DEC-042（保留名 `api`／`dash`）、[GLOSSARY.md](./GLOSSARY.md)、場殼 `PlaygroundsLayout`／`global.css`

一句話：**`dash.samkuo.me` 是 Platform 帳號／金鑰／註冊營運後台——與場殼同一品牌辨識；**統一進入介面**，登入後依角色顯示（一般使用者不見營運）；後台呼叫 API 持 **access token**（非 API key）；**API key 專供遊樂場殼頁**（SecretStore）；場邀請短網址由 SAM 經場殼代理呼叫 Platform API 取得（非後台 UI）；登入權威最終為 Social SSO（邀請制）。**

---

## 1. 範圍

### 目標

- 提供可對外公開的後台表面（非場殼內嵌），完成 **Platform 帳號生命週期**（SSO／API key 管理／註冊邀請）。
- 與 `play.samkuo.me`／`docs.samkuo.me` **同一站群辨識**（頂欄、標記、色票、語系）。
- 信任域分離（硬）：
  - **後台：** SSO → **access token**（或同等 session）→ `Authorization: Bearer` 呼叫帳號／金鑰／營運 API。
  - **場殼：** SecretStore **`PLAYGROUNDS_API_KEY`** → 殼代理代呼 Invite／signal 等場用 API。
  - **二者不可互換用途：** 後台 UI **不**用 API key 當登入後憑證；場殼 **不**持後台 access token。
- 文案／資訊架構符合 DEC-004：個人站後台，**非** SaaS 產品控制台腔。

### 非目標

- **鑄場 Invite／短網址／`#pg=`（使用者發出的連線／會議邀請）**——權威路徑見 §7；**後台 UI 不做**。
- 場殼內嵌完整帳號後台（場內只持 SecretStore 的 `PLAYGROUNDS_API_KEY` 複本）。
- 通用 URL 縮址、CRM、帳單、多租戶組織。
- 以密碼／email magic link 當**主要**登入（允許僅作 SSO 帳號復原的例外須另修訂）。
- 在後台中繼 WebRTC／session 資料面。
- 把後台做成 Help Center 或行銷 landing。
- 讓後台以 API key 當 Bearer／登入憑證。

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

1. **頂欄（sticky）** — 與場殼同族：
   - 標記（favicon／山姆鍋 mark）→ `https://samkuo.me/`
   - 導覽：`我是山姆鍋` · `遊樂場` · `小品` · `文件` · **`後台`**（`aria-current` 於後台）
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
| Tab：**金鑰** | 全部 | 檢視 prefix、輪替、撤銷；提示寫入場內密鑰庫 |
| Tab：**營運** | **僅 admin** | Platform **註冊**邀請、停用使用者（後段）、用量／除錯（後段） |

**無「鑄場邀請」tab。** 場 Invite／短網址由場內 SAM 經殼代理取得（§7）。

未登入：bootstrap 收入摺疊，不進第一視線競爭。

### 3.3 註冊頁 `/join/<token>`

獨立 landing（同一視覺系統）：驗證邀請狀態 → **領取／SSO 綁定** → 顯示一次性 API key（或導回後台已登入）。

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
| **Access token**（後台 session） | **僅後台 UI**（`dash`） | 登入後呼叫帳號／金鑰管理／admin 等 API | SSO 換發；建議 HttpOnly **Secure** cookie，或短命 Bearer（**非** `pg_sk_` API key）。後台 `fetch` **只**帶此憑證 |
| **API key**（`pg_sk_…`） | **僅遊樂場殼頁** | 殼代理鑄 Invite、host signal pending／answer、撤銷 Invite 等**場用** API | 伺服器只存 hash；明文僅建立／輪替／claim 時在後台顯示一次 → 使用者寫入 SecretStore **`PLAYGROUNDS_API_KEY`**。**不**當後台登入後憑證 |
| **Join capability** | 持 Invite 連結者 | 單次加入／offer | 短命；≠ API key、≠ access token |
| **註冊邀請** | 新使用者 | 取得帳號資格 | `/join/<token>`；**≠** 場 `#pg=` |

**硬規則：**

1. 後台登入成功後，所有後台發起的 `/v1/*` 帳號面呼叫 → **access token**。
2. API key **只**給場殼（經 SecretStore＋殼代理）；後台 UI **管理** key（檢視 prefix／輪替／撤銷），但**不以 key 當 session**。
3. 場殼**不**使用後台 access token；後台**不以** API key 登入或當 session。

### 5.2 Social SSO（Phase 5 — 規格定案）

| 優先 | 供應商 | 狀態 |
| --- | --- | --- |
| **必做** | **GitHub OAuth** | Phase 5.1 |
| **次做** | **Google OAuth** | Phase 5.2 |
| 不做（初版） | Apple、Facebook、Twitter／X、SAML／OIDC 企業、email 密碼 | 非目標 |

**理由（契約）：** 站群已用 GitHub 身分（Giscus）；技術向讀者與作者重疊高。Google 覆蓋非 GitHub 使用者（台灣等市場帳號面通常廣於 Facebook；初版不做 FB）。

**規則：**

1. **邀請制：** 新使用者必須持有效 `/join/<token>`（或 admin 預綁）才能完成首次 SSO 綁定；禁止公開自助註冊。
2. **不存密碼。**
3. Bootstrap：`ADMIN_BOOTSTRAP_TOKEN` 一次性 → 綁**第一個** admin 的 SSO subject → 作廢；之後不得再用 bootstrap 鑄 key。
4. 同一 Platform `user_id` 可連結多個 SSO provider（GitHub＋Google）；登入任一連結即可。
5. SSO 成功 → 核發／刷新 **access token**（或 session cookie）；登出清 session；**不**自動撤銷 API key。
6. MFA：政策可選（TOTP 或供應商 MFA）；未啟用不得阻擋既有 **場殼** API key 呼叫。

### 5.3 進入路徑

進入：**僅 Social SSO**（GitHub／Google）→ access token／session cookie。

註冊：`/join/<token>` → **GitHub 或 Google 綁定** → 顯示一次場用 API key（寫入場）＋後台 session。

**禁止**以 API key（`pg_sk_…`）登入後台或換取後台 session。API key 僅場殼。
### 5.4 角色

| 角色 | 後台可見 | 不可見 |
| --- | --- | --- |
| **user** | 統一進入後 → 帳號列＋**金鑰**（管理場用 key） | **營運**及一切 admin 專用表面 |
| **admin** | 同上＋**營運** | — |
| **未登入** | 統一進入／bootstrap（僅未 bootstrapped）／註冊 landing | 已登入殼（金鑰／營運） |

停用使用者（admin）：後台標「已停用」；其 **access token** 與 **API key** 驗證均失敗 `401`／`403`；既有場 Invite 不回溯撤銷（另操撤銷 Invite）。

---

## 6. 畫面規格

### 6.1 進入（未登入）— 統一介面

**職：** 取得後台 **access token**／session（**所有角色同一入口**）。

| 元素 | 規格 |
| --- | --- |
| 標題 | 「遊樂場」（品牌級） |
| 副句 | 說明後台職能（帳號、管理場用 API key）；註冊邀請屬營運、僅 admin 登入後可見；場邀請在遊樂場內由小品經殼發出 |
| 主 CTA | 「使用 GitHub 進入」；次：「使用 Google 進入」（5.2）→ SSO → **access token** |
| Bootstrap | **另頁** `GET /bootstrap/`（不在登入首屏）；token＋「以 GitHub 完成 bootstrap」 |

**錯誤：** token 錯、已 bootstrap、`bootstrap_not_configured` → 可讀中文＋技術 `error` code。

登入成功後依 `/v1/me`（持 access token）的 `role` 渲染 §3.2；**不**依登入方式分支不同首頁。

### 6.2 金鑰

**職：** 每帳號硬頂 1 把 **場用** API key 的檢視／輪替／撤銷（供寫入 SecretStore；**非**後台 session）。

| 元素 | 規格 |
| --- | --- |
| 顯示 | `prefix…`＋建立時間；**永不**回顯完整明文（除當次建立） |
| 揭示盒 | 輪替／建立／claim 後：警告色虛線盒＋「立刻複製 — 不會再顯示」＋複製鈕；文案明示寫入場內密鑰庫 |
| 輪替 | 確認對話：舊 key 立刻失效（場殼須更新 SecretStore）；成功後揭示新 key；**後台 session（access token）不變** |
| 撤銷 | **僅在已有金鑰時可操作**（無 key 則按鈕停用）；確認後場殼無法再鑄 Invite；**不**因此強制登出後台 |
| 尚無金鑰 | 顯示「尚無金鑰」；主按鈕改「建立金鑰」；撤銷不可用 |
| 場內提示 | 文案指向 SecretStore 保留名 **`PLAYGROUNDS_API_KEY`**；不代寫入場 |

### 6.3 （刪除）場 Invite 鑄造

**不在後台。** 見 §7。

### 6.4 營運（**僅 admin**）

**職：** Platform **註冊**與營運（≠ 場 Invite）。

**可見性：** 僅 `role === admin`。一般使用者：tab 不渲染／`hidden`＋不可選；panel 不得露出。API：`POST /v1/admin/*` 對非 admin → `403`。

| 能力 | 優先 | 規格 |
| --- | --- | --- |
| 核發註冊邀請 | **MVP** | 回 `join_url`（dash）、到期；複製 |
| 停用／復用使用者 | 後段 | 列表＋動作；不可刪除自己 |
| Invite／隊列除錯 | 後段 | 只讀除錯（營運）；**非**使用者鑄鏈入口 |
| 用量 | 後段 | 每 user／日 join 與 invite 計數摘要 |

### 6.5 註冊 landing `/join/<token>`

| 狀態 | UI |
| --- | --- |
| 有效 | 說明＋主 CTA（SSO：以 GitHub／Google 綁定 → access token＋可選揭示場用 API key） |
| 過期／已用／無效 | 明確狀態膠囊＋連回後台／場 |
| 領取成功 | 若新建 key：揭示一次＋複製＋「寫入密鑰庫後前往後台」；後台已持 access token |

---

## 7. 與 API／場殼／SAM 的邊界

### 7.1 場邀請 URL 權威路徑（硬）

使用者要分享的 **場 Invite 短網址／深鏈**（`api.samkuo.me/i/…`、`#pg=`）：

```text
SAM（現行 Agent／會議小品等）
  → 場殼代理（env.HOST 或同等 /api/shell／host 通道）
  → 讀 SecretStore「PLAYGROUNDS_API_KEY」（unlock 後）
  → POST https://api.samkuo.me/v1/invites
  → 回傳 short_url／deep_link 給 SAM 呈現（QR／複製／分享）
```

| 規則 | 說明 |
| --- | --- |
| **後台 UI 不鑄場邀請** | `dash` 無「建立短連結邀請」產品入口 |
| **SAM 不直連持 key 的瀏覽器任意 fetch 繞過殼** | key 不出 SecretStore 明文進 SAM 可序列化狀態；由殼代理代呼（值僅在殼／Runtime 記憶體短用） |
| **殼代理** | 對齊既有 HOST 模式：僅現行 Agent（或明確授權之 SAM）可觸發；`capabilities()` 可探測（名稱以 host-api 落地為準，例：`createPlatformInvite`） |
| **作答循環／`#pg=` 兌換** | 仍在場殼（線上／Roster／深鏈處理）；可顯示 SAM 已取得的 URL，但不替代鑄造權威 |

### 7.2 職責表

| 動作 | 後台 UI | 場殼 | SAM（經殼代理） |
| --- | --- | --- | --- |
| 登入（SSO → access token） | ✅ | ❌ | ❌ |
| 管 API key（輪替／撤銷／揭示一次） | ✅（持 access token） | ❌（只讀／寫入 SecretStore 複本由使用者） | ❌ |
| **鑄場 Invite／短網址** | ❌ | 代理呼叫（持 **API key**） | ✅ 發起 |
| Host 作答循環 | ❌ | ✅（持 API key） | 可驅動／觀測 |
| `#pg=` 兌換／compose | ❌ | ✅ | 可參與 UX |
| Platform **註冊**邀請 | ✅（admin；持 access token）／landing | ❌ | ❌ |

### 7.3 過渡實作

若場殼「線上」tab 暫有鑄鏈按鈕：視為 **dogfood／過渡**，不得寫進後台規格；目標改為 HOST 代理＋SAM UI。後台若曾有「邀請」tab 鑄場 Invite，須移除。

---

## 8. 文案用語表（UI）

| 用 | 不用 |
| --- | --- |
| 後台、進入、金鑰（場用）、輪替、撤銷、註冊邀請、營運、access token／工作階段 | 控制台、Dashboard 當品牌名、方案、席位、Team、Billing；**勿**把「短網址邀請」當後台主職；**勿**暗示後台用 API key 登入 |
| 遊樂場、我是山姆鍋 | Playgrounds Cloud、平台產品名單獨 hero 蓋過山姆鍋 |
| 密鑰庫／`PLAYGROUNDS_API_KEY`（給場殼） | 「雲端 API 金鑰倉」行銷稱；「後台金鑰＝登入密碼」 |
| （場內）邀請連結／短網址 | 後台「一鍵發會議連結」 |

標題模式：`遊樂場後台 · 我是山姆鍋`；註冊：`遊樂場註冊邀請 · 我是山姆鍋`。

---

## 9. 狀態與完成定義

### 9.1 MVP（部分對齊；auth 契約未完）

- [x] `dash.samkuo.me` 品牌殼＋淺／深色
- [x] 統一進入介面；登入後依角色顯示；**user 不見營運 UI**
- [x] 金鑰輪替／撤銷／一次揭示（場用 key）
- [x] Admin 註冊邀請＋`/join` claim
- [x] Bootstrap 摺疊表單
- [x] 後台**無**場 Invite 鑄造入口（對齊 §7）
- [x] **後台 API 僅 access token**（GitHub SSO／session cookie；場 API 拒 access token）
- [x] HOST／殼代理 `createPlatformInvite`（或同等）供 SAM 呼叫

### 9.2 Phase 5

- [x] GitHub OAuth 登入／綁定（邀請制）→ 核發 access token（程式落地；正式域 secrets／callback 需驗證）
- [x] Google OAuth
- [x] Access token／session cookie 為後台進入；API key 僅場殼
- [x] 汰除「貼 API key 登入」過渡（改純 SSO）
- [ ] MFA 政策開關
- [ ] 停用使用者
- [ ] （可選）隊列／用量只讀

### 9.3 完成檢查（SSO 後）

- [ ] 無邀請不可自助註冊
- [ ] 登出後無法呼叫需 access token 的後台動作；既有 **場用** API key 仍可打場 API 直至撤銷
- [ ] 後台網路請求 **不**帶 `pg_sk_`；場殼 **不**帶後台 access token
- [ ] 頂欄與場殼品牌測試通過
- [ ] 短網址域名永遠為 `api.samkuo.me`
- [x] 場邀請僅能經 SAM→殼代理取得（後台無鑄入口）
- [ ] DEC-004 文案複核無產品腔

---

## 10. 實作落點

| 區域 | 路徑 |
| --- | --- |
| 後台 HTML／CSS／JS | `platform-api/src/adminUi.ts` |
| 路由／claim／bootstrap | `platform-api/src/index.ts` |
| 帳號／key／註冊邀請 | `platform-api/src/auth.ts` |
| 場內 Platform 客戶端 | `src/components/playgrounds/platform/*` |
| 保留名 | `src/worker.ts`、`src/utils/playgroundsUrls.ts` |

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
