# Playgrounds 純玩版客戶端（`go.samkuo.me`）

> **狀態：** Draft（2026-08-07）— 契約／階段草案；實作未開始  
> **權威決策：** 建議 [DECISIONS.md](./DECISIONS.md) **DEC-050**（Proposed）  
> **相關：** [PG-INVITE-E2E-MVP.md](./PG-INVITE-E2E-MVP.md)（五子棋 E2E；本刀 Guest 主路徑）、[PG-PLATFORM-API-PLAN.md](./PG-PLATFORM-API-PLAN.md)、[PG-PLATFORM-CREDITS-PLAN.md](./PG-PLATFORM-CREDITS-PLAN.md)（官方 TURN；Guest 經 `join_cap`）、[PG-ROSTER-PLAN.md](./PG-ROSTER-PLAN.md)、DEC-004／023／025／042／045／047／048、[GLOSSARY.md](./GLOSSARY.md)

一句話：**獨立於場殼的純玩客戶端＠`go.samkuo.me`——無編輯環境、不依賴持久 OPFS；場邀請短網址權威落在此 origin（`/i/<short_id>`）；掃 QR 即可同意入座，只參與當下 Invite 指定的 SAM／session（局數／再來一局由該 SAM 決定；首載體＝`invite.compose`＋`gomoku.v1`）。**

---

## 1. 動機

- 掃系統條碼／相機開邀請常落在**受限瀏覽情境**（in-app WebView、預覽殼）：場殼快樂路徑要 `install_if_missing` → **寫 OPFS**，於此常失敗；同一連結用標準 Safari 開場殼則可玩。
- 無法可靠「自動跳出改開標準 Safari」；場殼上的「請用 Safari 開啟」只是降級文案，不是產品主路徑。
- 既有 `view=canvas`／藏 IDE 仍是**同一份場殼**，掃碼仍載入開發面假設與 OPFS 管線。
- Guest（無 Platform 帳號）本來就只該「加入並玩」——不需要 Files、編輯器、密鑰庫、鑄邀請。

因此：**純玩＝獨立客戶端＋獨立 origin**，不是場殼的另一個 UI 模式。

---

## 2. 目標

- **`https://go.samkuo.me`**＝純玩版權威 origin（站群一員；**不是**場）。
- **短網址 canonical：** `https://go.samkuo.me/i/<short_id>`（QR／分享 modal 只出這個）。
- Guest **無帳號**即可：開短鏈 → 讀 `invite.compose` → consent → WebRTC／入座 → **只參與當下 Invite 的 SAM／session**（無編輯、無沙盒庫；同 session 可多局——由 SAM 決定，例：五子棋 `act:reset`）。
- **不包含編輯環境**；不依賴持久 OPFS；掃碼受限情境為快樂路徑。
- Host 仍在場殼（預設 `play.samkuo.me`）鑄邀請、開 session、作答；資料面仍只走 WebRTC（DEC-045／047）。
- 首驗收鎖 [PG-INVITE-E2E-MVP.md](./PG-INVITE-E2E-MVP.md)：`#pg=`／`invite.compose`／五子棋 `gomoku.v1`（經 go 短鏈進場）。

---

## 3. 非目標

- 把場殼改成「無 OPFS 也能完整 IDE」。
- 在純玩版提供 Files／編輯器／匯入匯出／SecretStore／「看原始碼」當主 CTA。
- Guest 註冊、場內 SSO、鑄 Invite、provision、點數／dash UI。
- 通用縮址、非 Invite 的任意 URL 短鏈。
- 觀戰、完美斷線重連、多 peer 排隊當本刀主故事（對齊 E2E：鎖 1 Guest）。
- 使用者自備 TURN；對人揭露直連 vs relay（對齊點數計劃）。
- 跨 origin 自動搬 OPFS；純玩版持久化「我的沙盒庫」。
- 以 Cloudflare Pages 為場網主路徑的敘事延伸——本刀 **go** 可用 Workers Static Assets（與 docs／platform 一致）；若實作選 Pages，仍須同一 origin 契約。

---

## 4. 角色與站群

| 面 | Origin | 誰用 | 職責 |
| --- | --- | --- | --- |
| **場殼** | `play.samkuo.me`（及任意場） | Host；開發／實驗 | OPFS、編輯、鑄 Invite、session 權威、作答循環 |
| **純玩版** | **`go.samkuo.me`** | Guest（受邀） | 短鏈入口、consent、載入當下 SAM UI、join／WebRTC、入座、對玩 |
| **Platform API** | `api.samkuo.me` | 雙方間接 | Invite／short map／signal／TURN cred；**不當**邀人 QR 主面 |
| **dash** | `dash.samkuo.me` | Host 帳號 | provision；**不**鑄場 Invite |

**保留名：** `go` 與 `api`／`docs`／`dash` 同級——列入 `PLAYGROUNDS_FIELD_RESERVED_SUBDOMAINS`／場殼 Worker `RESERVED`／Platform `FIELD_RESERVED`；**永不**被 wildcard 當場殼伺候。

**勿混：**

| 用 | 不用當成 |
| --- | --- |
| `go.samkuo.me/i/…` | 場／另一個遊樂場 OPFS origin |
| `#pg=`／shortId 入 go | `#pg_provision=`、`/join/<token>` 註冊邀請、`#roster=` OOB |
| 純玩「當下 Invite／session」 | 型錄瀏覽、一鍵開進 IDE、跨邀請存檔；**勿**把「一局」等同「一 session」 |

---

## 5. URL 與短連結契約

### 5.1 Canonical

| 項 | 規格 |
| --- | --- |
| 短網址 | **`https://go.samkuo.me/i/<short_id>`** |
| 鑄 Invite 回傳 `short_url` | 固定組在 **go** origin（**不**再用 `api` request host 組邀請短鏈） |
| QR／Host 分享 modal | 只呈現 go 短網址 |
| Invite 權威／TTL／map | 仍在 Platform（KV `short:` → invite secret／target 等）；go **不**自建第二套邀請庫 |

### 5.2 相容

| 路徑 | 行為 |
| --- | --- |
| `https://api.samkuo.me/i/<short_id>` | **302** → `https://go.samkuo.me/i/<同 id>`（舊鏈／除錯；非產品主面） |
| `https://go.samkuo.me/#pg=<secret>` | 可作內部／深鏈相容；**非** QR 預設 |
| 場 `#pg=`（`play…/#pg=`） | 可留場殼 Guest 路徑（除錯／已開場者）；**新鑄邀請的消費者主路徑＝go** |

### 5.3 `/i/<id>` 在 go 上的解析（定案傾向）

**傾向 B（SPA 吃 path）：**

```text
GET go.samkuo.me/i/<short_id>
  → 純玩 SPA（同 origin；path 保留 short_id）
  → 客戶端（或 Worker 邊緣輔助）向 Platform 解 short → invite meta／secret
  → consent → 載入 compose SAM → join
```

- 網址列以 **short_id** 為主，**不必**把 invite secret 放進 hash（優於掃碼預覽／轉貼外洩面）。
- short map 查詢：go Worker **service binding**（或同源可呼叫的 Platform 公開／半公開 resolve API）；失敗 → 頁內錯誤（過期／撤銷／不存在），禁止 `alert`。

**備案 A：** `go/i/…` 邊緣 302 → `go/#pg=<secret>`（實作小、與舊場殼像；secret 仍進 hash）。第一刀若綁定成本高可暫用 A，文件標遷移到 B。

**否決：** QR 預設完整 `#pg=` 深鏈；否決短鏈 exclusive 留在 api。

---

## 6. 產品定義（純玩版）

### 6.1 能做

- 開啟當下 Invite 指定的 SAM（`invite.compose` → `sam.source`／resolve）。
- 頁內同意入座（protocol 摘要；可改臨時顯示名）。
- Platform ticket／Roster：Guest offer → Host answer；DataChannel；`gomoku.v1` **player** 席。
- 官方 TURN：既有 Guest `join_cap` → `/v1/invites/…/turn/credentials`（記 **Host** 點數）；路徑對人透明。
- 連線態／入座態／Host「開始」後落子至終局；**再來一局**（同 session）由 SAM 決定（五子棋＝Host `reset`）；Host 結束場時可讀提示。

### 6.2 不能做（硬）

- 編輯原始碼、Files 側欄、匯入／匯出 `.sam`、SecretStore、fleet、WASI／Python dock。
- 鑄 Invite、provision、「登入我的遊樂場」。
- 把「看原始碼」當預設出口（若有連出場殼，須明確次要、且不阻掃碼快樂路徑）。
- 假設持久 OPFS／`createProject` 成功才能玩。

### 6.3 UX 硬規則

- Mobile-first；主操作在窄屏可完成（對齊 `.cursor/rules/mobile-first-ux.mdc`）。
- 禁止 `alert`／`confirm`／`prompt`（對齊 `.cursor/rules/no-native-dialogs.mdc`）。
- 首屏即玩：載入中也不閃 IDE（本 origin **根本無 IDE**）。
- 用語：加入、入座、開始、已連線——勿 SaaS／Lobby／直連／TURN 術語對讀者（DEC-004；E2E §10）。

### 6.4 站群身分（硬）

純玩版**必須**讓人看得出屬於「我是山姆鍋」的遊樂場站群，並露出**遊樂場主網址**——即使本頁只玩、無編輯環境。

| 項 | 規格 |
| --- | --- |
| **Logo／mark** | 露出**山姆鍋標誌**（與場殼／dash／docs 同源 mark；例：站群 `favicon.svg`／`logo.svg`）。可點 → `https://samkuo.me/`（部落格／站台身分；對齊 dash 頂欄 mark）。 |
| **遊樂場主網址** | **必須可見**並可點：`https://play.samkuo.me/`（文件預設場／遊樂場主入口；DEC-042）。文案可用「遊樂場」；**勿**只寫程式名 Playgrounds 當品牌。 |
| **開啟意圖（主網址）** | 點 `play.samkuo.me` 時，**在可行範圍內**優先讓使用者進**系統瀏覽器／標準 Safari**（跳出相機／App 內嵌 WebView），以便需要完整遊樂場（OPFS／編輯）時有一條出路。實作採盡力而為（例：新分頁／外開、平台允許的外部瀏覽器 intent）；**不**宣稱、也**無法**保證所有 in-app WebView 都能自動跳出。 |
| **呈現** | 極簡 chrome（頂列或同意／結束面一角即可）：**logo＋連到 play**；勿堆滿場相關導覽搶主視線。對弈中可縮成角標／底列，但**不得完全隱藏**身分與主網址。 |
| **窄屏** | logo／「遊樂場」鏈觸控可點（約 ≥44×44px 熱區）；勿裁成無法辨識的無文案小點且無替代文字。 |
| **敘事** | 對齊 DEC-004：個人遊樂場站群，非產品／SaaS 品牌腔。 |

**品牌測試：** 拿掉對弈 UI 後，仍須讀出「山姆鍋／遊樂場」與可點的 `play.samkuo.me`；不可看成無主的通用 game lobby。

**與「請用 Safari 開啟」的關係：** go 快樂路徑**不**依賴跳出 WebView 才能玩（無持久 OPFS）。`play` 鏈＝站群身分＋**可選**進完整遊樂場／系統瀏覽器的出口。若某 WebView 點了仍留在內嵌殼，可輔以短提示（分享選單 → Safari／複製連結）——頁內 UI，禁止 `alert`；**勿**把此提示當 go 入座主流程。

**與 dash／docs 頂欄的關係：** 視覺 token／mark 同族即可；**不要求** go 複製完整「我是山姆鍋 · 遊樂場 · 小品 · 文件 · 後台」導覽列（避免掃碼窄屏搶戲）。若加次要鏈，優先 `play`；文件／後台可選、非硬。

**否決：** 依賴私有／未文件化 URL scheme「強制開 Safari」當產品契約；否決因無法跳出 WebView 就阻擋 go 上的同意／對弈。

---

## 7. 執行與儲存模型

### 7.1 與場殼假設的切割

| 假設 | 場殼 Host／`?open=` | 純玩 go Guest |
| --- | --- | --- |
| 持久 OPFS＋`createProject` | **要** | **不要** |
| `sandboxId` | 常態＝OPFS 專案 | 可為 **session／記憶體** 實例 id（僅本頁生命週期） |
| Canvas／UI 資產 | OPFS 或殼 FileMap | **記憶體 FileMap** 或等價 blob／薄 SW 服務 |
| Backend Runtime 寫盤 | 常態 | 弱化／避免；player 權威在 **Host session** |
| WASI／Python host | 產品路徑要 projectId→OPFS | **本刀不需要**（gomoku） |

### 7.2 SAM 怎麼跑（第一刀）

1. 依 compose `sam.source` fetch（`.sam`／公開 GitHub 等既有可解析來源）。
2. 解成 FileMap，掛在純玩 runtime（**不**呼叫場殼 `opfs.createProject`）。
3. iframe／薄畫布伺候 `index.html`（player UI）。
4. 入座：**reuse 本頁已開的那一份**；禁止再 clone／第二輪寫盤 materialize。

Session／`act`／棋盤權威在 **Host 場**；go 只渲染與經 Roster 隧道發言。

### 7.3 遠端 entry

**非第一刀。** 若日後記憶體載入仍被部分 WebView 擋 fetch／blob，可另議 CDN／型錄靜態 entry；本計劃不阻塞在此。

---

## 8. 部署與套件邊界

### 8.1 部署

| 項 | 規格 |
| --- | --- |
| Host | **獨立** Cloudflare Worker（Static Assets＋必要的 `/i/*` 邊緣邏輯） |
| 網域 | Custom Domain **`go.samkuo.me`** |
| 與 api | Service binding（或經 HTTPS＋CORS）解 short／preview／join／TURN |
| 與場殼 | **不**併進 `play` 的 `dist`／同一 Worker 主路徑 |

### 8.2 程式（建議）

| 項 | 規格 |
| --- | --- |
| 目錄 | **`go-client/`**（SvelteKit 5 static SPA＋獨立 Worker） |
| UI | Svelte 5 **runes**（DEC-005／048 家族） |
| 共用 | 抽 library：`platformClient`、short resolve、Roster peer／SDP、compose／consent、session wire——**不要** fork 整份 `PlaygroundsApp` 再刪 UI |
| 指令 | `npm run go:dev`／`go:build`／`go:deploy` |

### 8.3 CORS／允許 origin

Platform CORS／場允許清單須納入 **`https://go.samkuo.me`**（及 local go dev origin）。Guest TURN／join 已走 `join_cap`，不需場 API key。

---

## 9. 端到端流程（硬）

### 9.1 Host（不變主體；短鏈改指 go）

```text
dash provision → 場殼記憶體 API key
  → 開 pg-gomoku（Host）→ session waiting
  → createPlatformInvite(invite.compose)
  → short_url = https://go.samkuo.me/i/<id>
  → 殼分享 modal：短網址＋QR；作答循環在場殼
```

### 9.2 Guest（純玩）

```text
掃 QR／開 https://go.samkuo.me/i/<id>
  → 純玩 SPA；解 Invite（compose）
  → 記憶體載入 SAM player UI
  → 同意入座 → join_cap＋（可選）Guest TURN
  → offer → Host answer → DataChannel
  → player 席 → ready →（Host 開始）→ active → place…
```

### 9.3 失敗

| 情況 | 預期 |
| --- | --- |
| short 不存在／過期／撤銷 | 頁內錯誤；可請 Host 重新邀請 |
| SAM 下載失敗 | 頁內錯誤；不落到「請用 Safari 存沙盒」當主文案 |
| Host 離線／answer 超時 | 可讀等待／失敗；已連上 peer 不受短鏈失效影響 |
| 拒絕 consent | 不入座、不佔成功 handshake |

場殼上既有「Safari／OPFS 受限」recovery：**不**作為 go 快樂路徑；僅場殼 `#pg=` 殘留路徑可保留。

---

## 10. 與五子棋 E2E／點數的對齊

- E2E 驗收之 Guest「開短連結」改以 **go** 為準；場殼 `#pg=` 降為次要。
- Consent、`ready`→Host「開始」、再來一局 `reset`、結束場 fanout——協議不變。
- 有權 Host＋官方 TURN：go Guest 在無法直連時仍須能連（[PG-PLATFORM-CREDITS-PLAN.md](./PG-PLATFORM-CREDITS-PLAN.md)；E2E §3.1）——**不**因純玩版省略 TURN。

---

## 11. 階段與完成定義

| Phase | 內容 | 完成定義 | 狀態 |
| --- | --- | --- | --- |
| **0. 契約** | 本文件；GLOSSARY／DEC-050 Draft；保留名 `go`；交叉引用 | 產品／URL／非目標清楚 | **進行中** |
| **1. 骨架** | go Worker＋空 SPA；`go.samkuo.me`；`/i/:id` 進頁；binding／resolve stub | 開短鏈見純玩殼（可先假資料） | **完成**（`go-client/`） |
| **2. 短鏈遷移** | 鑄邀請 `short_url`→go；api `/i/` → 302 go；CORS | Host modal QR＝go；舊 api 短鏈仍可用 | **完成**（含 `GET /v1/shorts/:id`） |
| **3. Compose 可玩** | 記憶體載入 SAM；consent；join／WebRTC；gomoku player | 兩瀏覽器：場殼 Host＋**go Guest** 入座 | **進行中**（guestRuntime＋canvas SW） |
| **4. E2E** | 開始→對弈→終局；TURN 有權路徑；窄屏 | [PG-INVITE-E2E-MVP.md](./PG-INVITE-E2E-MVP.md) §9 以 go 為 Guest | 手測 |
| **5.（可選）** | short 不進 hash（B）；文件站導讀；場殼 `#pg=` 標「進階／除錯」 | 另議 | — |

---

## 12. 驗收清單（草案）

- [ ] `short_url` 為 `https://go.samkuo.me/i/…`；分享 modal／QR 同此
- [ ] `api…/i/…` 302 至 go 同 id（若保留相容）
- [ ] `go` 在場網保留名表；不當場殼
- [ ] 露出山姆鍋 logo／mark，並可見可點 **`https://play.samkuo.me/`**（§6.4；可行時優先外開系統瀏覽器／Safari）
- [ ] Guest 無 Platform 登入、無 OPFS 寫入即可載入五子棋 UI 並 consent
- [ ] 掃碼／常見 in-app 瀏覽可完成加入（不主依賴「用 Safari 開啟」）
- [ ] 入座後 `ready`；僅 Host「開始」後可交替落子至終局
- [ ] 無編輯環境／Files／鑄邀請入口
- [ ] 無原生 `alert`／`confirm`／`prompt`；窄屏可完成
- [ ] 有權 Host＋官方 TURN：無法直連時 go Guest 仍可連；UI 不揭露 relay
- [ ] 連線後 session／棋步不經 Platform 中繼

---

## 13. 文件與用語

| 用 | 不用 |
| --- | --- |
| 純玩版、`go.samkuo.me`、短網址、加入、入座 | 把 go 叫成「場」、第二遊樂場、Guest IDE |
| 當下 Invite／session（局數由 SAM 定） | 暗示純玩＝只能一局；雲存檔、我的小品庫（在 go 上） |
| 山姆鍋 mark、遊樂場、`play.samkuo.me` | 無標匿名 lobby；Playgrounds 當對外品牌名 |
| 請 Host 重新邀請 | 教 Guest 開 Safari 才能玩（go 快樂路徑） |

---

## 修訂紀錄

| 日期 | 變更 |
| --- | --- |
| 2026-08-07 | 初版 Draft：獨立 go 客戶端；短網址 canonical＠go；無編輯／無持久 OPFS；對齊五子棋 E2E 與 TURN |
| 2026-08-07 | 用語修正：純玩＝當下 Invite／**session**（可多局，由 SAM 決定）；勿寫成「只玩一局」 |
| 2026-08-07 | §6.4：硬規則露出山姆鍋 logo＋遊樂場主網址 `play.samkuo.me` |
| 2026-08-07 | §6.4：`play` 鏈在可行時優先外開系統瀏覽器／Safari（跳出 WebView）；不保證、不擋 go 快樂路徑 |
| 2026-08-07 | 實作開工：`go-client/` 骨架；保留名 `go`；Platform `short_url`／api `/i/` → go |
| 2026-08-07 | Phase 3：`GET /v1/shorts/:id`；guestRuntime（consent／memory SAM／WebRTC／session tunnel） |
