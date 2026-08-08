# Playgrounds 純玩版客戶端（`go.samkuo.me`）

> **狀態：** Draft（2026-08-08）— 契約／階段草案；Invite 路徑實作進行中；型錄 `/s/<id>` 與 Header 分享為新增契約  
> **權威決策：** 建議 [DECISIONS.md](./DECISIONS.md) **DEC-050**（Proposed）  
> **相關：** [PG-INVITE-E2E-MVP.md](./PG-INVITE-E2E-MVP.md)（五子棋 E2E；Invite Guest 主路徑）、[PG-CATALOG-UX-PLAN.md](./PG-CATALOG-UX-PLAN.md)（型錄「分享」→ go）、[PG-PLATFORM-API-PLAN.md](./PG-PLATFORM-API-PLAN.md)、[PG-PLATFORM-CREDITS-PLAN.md](./PG-PLATFORM-CREDITS-PLAN.md)（官方 TURN；Guest 經 `join_cap`）、[PG-ROSTER-PLAN.md](./PG-ROSTER-PLAN.md)、DEC-004／023／025／042／045／047／048、[GLOSSARY.md](./GLOSSARY.md)

一句話：**獨立於場殼的純玩客戶端＠`go.samkuo.me`——同時只跑一個 SAM、無編輯環境、不依賴持久 OPFS；啟動不限 Invite（型錄 id 傳閱與 Invite 短鏈並列）；傳閱網址 `/s/<catalog_id>`（內嵌 catalog）；`/s/` 可同 kind「下一個」與至多 3 則推薦換片（無型錄選擇 UI）；Invite `/i/` 不換片。**

---

## 1. 動機

- 掃系統條碼／相機開邀請常落在**受限瀏覽情境**（in-app WebView、預覽殼）：場殼快樂路徑要 `install_if_missing` → **寫 OPFS**，於此常失敗；同一連結用標準 Safari 開場殼則可玩。
- 無法可靠「自動跳出改開標準 Safari」；場殼上的「請用 Safari 開啟」只是降級文案，不是產品主路徑。
- 既有 `view=canvas`／藏 IDE 仍是**同一份場殼**，掃碼與型錄「分享」仍載入開發面假設與 OPFS 管線——接收者並不期望立刻成為作者。
- Guest／傳閱接收者本來就只該「加入並玩」或「打開這顆小品」——不需要 Files、編輯器、密鑰庫、鑄邀請。

因此：**純玩＝獨立客戶端＋獨立 origin**，不是場殼的另一個 UI 模式；**傳閱與入座都落在 go，但 URL／模式分開。**

---

## 2. 目標

- **`https://go.samkuo.me`**＝純玩版權威 origin（站群一員；**不是**場）。
- **同時一個 SAM：** 任一時刻只 materialize／執行一個 SAM；換源＝取代當前實例（無沙盒庫、無多專案）。
- **啟動模式（並列）：**
  1. **Invite／session：** `https://go.samkuo.me/i/<short_id>`（QR／Host 邀請 modal 只出這個）。
  2. **型錄傳閱／單機純玩：** `https://go.samkuo.me/s/<catalog_id>`（型錄列「分享」、go Header「分享」只出這個）。
- **不包含編輯環境**；不依賴持久 OPFS；掃碼／傳閱受限情境為快樂路徑。
- Host 仍在場殼（預設 `play.samkuo.me`）鑄邀請、開 session、作答；資料面仍只走 WebRTC（DEC-045／047）。
- 型錄「一鍵開」仍進**場殼編輯面**（`/?open=`，無 `view=canvas`）——與「分享」刻意分流。
- Invite 首驗收鎖 [PG-INVITE-E2E-MVP.md](./PG-INVITE-E2E-MVP.md)：`invite.compose`／五子棋 `gomoku.v1`（經 go 短鏈進場）。

---

## 3. 非目標

- 把場殼改成「無 OPFS 也能完整 IDE」。
- 在純玩版提供 Files／編輯器／匯入匯出／SecretStore／「看原始碼」當主 CTA。
- Guest 註冊、場內 SSO、鑄 Invite、provision、點數／dash UI。
- 通用縮址；以 `/i/` 或 Platform short map 服務非 Invite URL。
- **以 `source`／完整 Git URL／`?open=` 當 go 傳閱主形**（只認型錄 `id`；見 §5.4）。
- 在 go 上複製完整型錄 UX（搜尋／filter／貨架）；換片僅 §5.6。
- 觀戰、完美斷線重連、多 peer 排隊當本刀主故事（對齊 E2E：鎖 1 Guest）。
- 使用者自備 TURN；對人揭露直連 vs relay（對齊點數計劃）。
- 跨 origin 自動搬 OPFS；純玩版持久化「我的沙盒庫」。
- 以 Cloudflare Pages 為場網主路徑的敘事延伸——本刀 **go** 可用 Workers Static Assets（與 docs／platform 一致）；若實作選 Pages，仍須同一 origin 契約。

---

## 4. 角色與站群

| 面 | Origin | 誰用 | 職責 |
| --- | --- | --- | --- |
| **場殼** | `play.samkuo.me`（及任意場） | Host；作者／實驗 | OPFS、編輯、鑄 Invite、session 權威、作答；型錄「一鍵開」 |
| **純玩版** | **`go.samkuo.me`** | Guest／傳閱接收者 | `/i/` 入座；`/s/` 單機＋同 kind 換片；consent（僅 Invite）；Header 傳閱 |
| **Platform API** | `api.samkuo.me` | 雙方間接 | Invite／short map／signal／TURN cred；**不當**邀人 QR 主面；**不**管型錄 `/s/` |
| **dash** | `dash.samkuo.me` | Host 帳號 | provision；**不**鑄場 Invite |

**保留名：** `go` 與 `api`／`docs`／`dash` 同級——列入 `PLAYGROUNDS_FIELD_RESERVED_SUBDOMAINS`／場殼 Worker `RESERVED`／Platform `FIELD_RESERVED`；**永不**被 wildcard 當場殼伺候。

**勿混：**

| 用 | 不用當成 |
| --- | --- |
| `go.samkuo.me/i/…` | 型錄傳閱、另一個遊樂場 OPFS origin |
| `go.samkuo.me/s/<id>` | Invite 短鏈、場 `?open=`、通用縮址 |
| 型錄「分享」→ go `/s/` | 型錄「一鍵開」→ 場編輯面 |
| go Header「分享」→ `/s/<id>` | Host 邀請 modal 的 `/i/<short_id>` |
| `/s/` 同 kind 換片（下一個／推薦≤3） | go 上型錄瀏覽；Invite 中換小品；跨 kind 推薦 |
| 純玩「當下 Invite／session」 | 「只能一局」；跨邀請雲存檔 |
| `#pg=`／shortId 入 go | `#pg_provision=`、`/join/<token>`、`#roster=` OOB |

---

## 5. URL 契約

### 5.1 兩類 canonical（硬分開）

| 類 | URL | 誰產出 | 語意 |
| --- | --- | --- | --- |
| **Invite 短網址** | **`https://go.samkuo.me/i/<short_id>`** | 鑄 Invite 回傳 `short_url`；Host QR／邀請 modal | 入座當下 session（TTL／撤銷隨 Invite） |
| **型錄 SAM 傳閱** | **`https://go.samkuo.me/s/<catalog_id>`** | 型錄列「分享」；go Header「分享」 | 只執行該型錄小品（單機；無該局 Invite） |

- Invite 權威／TTL／map 仍在 Platform；go **不**自建第二套邀請庫。
- **`/s/` 不經 Platform short map**；無 TTL、無 join、無點數。
- 鑄邀請回傳 `short_url` 固定組在 **go** origin（**不**再用 `api` request host 組邀請短鏈）。

### 5.2 Invite 相容

| 路徑 | 行為 |
| --- | --- |
| `https://api.samkuo.me/i/<short_id>` | **302** → `https://go.samkuo.me/i/<同 id>`（舊鏈／除錯；非產品主面） |
| `https://go.samkuo.me/#pg=<secret>` | 可作內部／深鏈相容；**非** QR 預設 |
| 場 `#pg=`（`play…/#pg=`） | 可留場殼 Guest 路徑（除錯／已開場者）；**新鑄邀請的消費者主路徑＝go** |

### 5.3 `/i/<id>` 解析（定案傾向）

**傾向 B（SPA 吃 path）：**

```text
GET go.samkuo.me/i/<short_id>
  → 純玩 SPA（同 origin；path 保留 short_id）
  → 客戶端（或 Worker 邊緣輔助）向 Platform 解 short → invite meta／secret
  → consent → 載入 compose SAM → join
```

- 網址列以 **short_id** 為主，**不必**把 invite secret 放進 hash。
- short map 查詢：go Worker **service binding**（或同源可呼叫的 Platform 公開／半公開 resolve API）；失敗 → 頁內錯誤（過期／撤銷／不存在），禁止 `alert`。

**備案 A：** `go/i/…` 邊緣 302 → `go/#pg=<secret>`（實作小；secret 仍進 hash）。第一刀若綁定成本高可暫用 A，文件標遷移到 B。

**否決：** QR 預設完整 `#pg=` 深鏈；否決短鏈 exclusive 留在 api。

### 5.4 `/s/<catalog_id>`（型錄傳閱；本節定案）

| 項 | 規格 |
| --- | --- |
| 形狀 | **`https://go.samkuo.me/s/<catalog_id>`** 僅此；**無** query 必要參數；**不**帶 `name`／`source`／`open` |
| `catalog_id` | 型錄 YAML／codegen 的穩定 **`id`**（例：`pg-breakout`、`pg-gomoku`）；與 `catalog/entries/<id>.yaml` 檔名一致 |
| Resolve | go **建置內嵌**型錄資料（與場 `catalog:gen` → `public/catalog/v1.json`／typed module **同一產線**）；runtime **不**依賴抓 `play…/catalog/v1.json` 才能開 |
| 載入 | 嵌入表查 `id` → 取 `source`（及 title 等）→ 記憶體 fetch／FileMap → 跑 player UI |
| 未命中 | 頁內錯誤（下架／draft／未知 id）；**禁止** silent fallback 猜 `source` |
| 非型錄 SAM | **不產生** `/s/` 連；go Header 分享禁用或隱藏 |
| 否決 | `/?open=`、`/o?open=`、完整 Git URL、`source` path、`#open=`、Platform 非 Invite 短碼、占用 `/i/` |

**內嵌 catalog：**

- 權威仍為 repo `catalog/**`；`npm run catalog:gen`（或 go build 前置）產出 go 可 import／static 的 JSON（可為全量 `v1.json` 或僅 `{ id, source, title, kind, … }` 瘦身表——須含 **`kind`** 以支援 §5.6；單一 gen、勿第二份 YAML 真相）。
- 與場公開目錄一致：**draft／未上架不進嵌入表** → 無合法 `/s/`。
- 舊連指向已下架 id → 頁內錯誤，可提示回型錄／遊樂場。

**與場型錄按鈕：**

| 按鈕 | URL | 接收者預期 |
| --- | --- | --- |
| **一鍵開** | 場同 origin `/?open=<source>&name=…`（無 `view=canvas`） | 進編輯／實驗面 |
| **分享**（單筆） | **`https://go.samkuo.me/s/<id>`**（絕對；**不**用 `location.origin` 組場殼連） | 只玩該 SAM |
| **分享篩選** | 仍可 `…/sam/?q=…`（瀏覽意圖；非本節） | 逛型錄 |

舊行為 `play…/?open=…&view=canvas`：**廢止為型錄分享主形**（過渡期可另議相容，非契約）。

### 5.5 go Header「分享」（硬）

| 項 | 規格 |
| --- | --- |
| 位置 | 頂列 chrome：**左**＝山姆鍋 mark＋遊樂場名／`play.samkuo.me`；**右**＝分享 |
| 機制 | 優先 Web Share API（`navigator.share`）；不支援或 share 失敗 → 複製網址。使用者取消 share（`AbortError`）→ 不抄剪貼簿、不當錯誤。對齊場／型錄 `shareOrCopy` 語意（title＋url；不帶 text 與 url 並送） |
| 網址 | **固定＝當前 SAM 的** `https://go.samkuo.me/s/<catalog_id>` |
| 明示排除 | **不是** `/i/<short_id>`、不是 `#pg=` secret、不是場 `?open=` |
| 何時可用 | 當前已載入之 SAM **能對上嵌入型錄的 `id`**（含：經 `/s/` 進入；或 Invite compose 的 source／協定能唯一對上型錄項）。對不上 → 按鈕 disabled／隱藏 |
| 尚無 SAM | 空態／short 失效／載入失敗 → 不分享 |
| 回饋 | 頁內 flash／status（已分享／已複製）；禁止 `alert` |
| 窄屏 | 熱區約 ≥44×44px；無 Web Share 時文案可「複製連結」 |
| 對弈中 | 往下捲／滑＝自動收起 chrome；往上＝自動展開；分享隨 chrome 可視即可 |

**語意：** 即使人在 Invite 對弈中按分享，傳出的仍是「打開這顆型錄小品」（單機 `/s/`），**不是**「加入這一場」。Host 邀請 modal **繼續只出** `/i/`。

### 5.6 `/s/` 換片（下一個／推薦；本節定案）

僅 **模式 B（`/s/<id>` 單機傳閱）**提供；**模式 A（`/i/` Invite）不提供**換片（對弈綁 Host session，中途換小品＝拆局）。

| 項 | 規格 |
| --- | --- |
| 語意 | **換片**＝取代當前唯一 SAM slot → 導向／載入另一個 `/s/<id>`；分享網址跟著新 id |
| **下一個** | 嵌入 catalog 中與當前 **同一 `kind`** 的穩定序，取當前之後下一筆（末端繞回首筆）。同 kind 僅自己 → 控件 disabled／隱藏 |
| **推薦** | 隨機（或洗牌）抽出 **至多 3** 個**其他**小品；**必須**與當前同一 `kind`；不足 3 就少於 3，**禁止**用其他 kind 湊數 |
| 候選池 | `entry.kind === current.kind && entry.id !== current.id`（下一個繞回時下一筆可為池內任一；推薦永遠不含當前） |
| UI | 極簡：「下一個」鈕＋可選最多 3 個推薦名／圖；窄屏可點；**不**搶過 mark／遊樂場／分享 |
| **否決** | go 上型錄形式選擇（搜尋、filter chips、貨架、完整列表、跨 kind 瀏覽）。完整挑選留在 `play…/sam/` |

**硬規則：** 遊戲不得出現工具（或其他 kind）於「下一個」或推薦；跨 kind **一律禁止**。`kind` 取值對齊型錄（`tool`｜`agent`｜`game`｜`toy`｜`media` 等）。

嵌入表須含 **`kind`**（及 `id`／`source`／`title`）才能換片。

### 5.7 首頁 `/` 推薦（定案）

開啟 **`https://go.samkuo.me/`**（無 Invite、無 `/s/`）時，主區呈現 **至多 3** 則「推薦試試」：

| 項 | 規格 |
| --- | --- |
| 點擊 | → `/s/<id>` 單機純玩 |
| 來源 | 嵌入 catalog；**優先**場 picks（`GENERATED_SAM_PLAYGROUNDS_PICK_IDS`）洗牌取用，不足再從全庫補 |
| kind | **可跨 kind**（首頁無「當前 SAM」；≠ §5.6 換片） |
| chrome | mark＋遊樂場；分享 disabled；**無**「下一個」 |
| 否決 | 搜尋／filter／完整型錄列表 |

---

## 6. 產品定義（純玩版）

### 6.1 能做

**共通**

- 同時只跑一個 SAM；記憶體載入；無持久 OPFS。
- 站群 chrome（§6.4）＋條件允許時 Header 分享（§5.5）。

**模式 0 — 首頁 `/`**

- 至多 3 則推薦（§5.7；picks 優先；可跨 kind）→ `/s/<id>`。

**模式 A — Invite／session**

- 開啟當下 Invite 指定的 SAM（`invite.compose` → `sam.source`／resolve）。
- 頁內同意入座（protocol 摘要；可改臨時顯示名）。
- Platform ticket／Roster：Guest offer → Host answer；DataChannel；`gomoku.v1` **player** 席。
- 官方 TURN：既有 Guest `join_cap` → `/v1/invites/…/turn/credentials`（記 **Host** 點數）；路徑對人透明。
- 連線態／入座態／Host「開始」後落子至終局；**再來一局**（同 session）由 SAM 決定（五子棋＝Host `reset`）；Host 結束場時可讀提示。
- **不**提供「下一個」／推薦換片。

**模式 B — 型錄 `/s/<id>`**

- 嵌入表 resolve → 記憶體載入 → 跑該 SAM player UI（單機；無 consent／join／TURN）。
- **同 kind 換片**（§5.6）：下一個＋至多 3 則推薦；無型錄選擇 UI。
- 無編輯、無「一鍵變作者」主 CTA；次要出口＝chrome 上的遊樂場主網址。

### 6.2 不能做（硬）

- 編輯原始碼、Files 側欄、匯入／匯出 `.sam`、SecretStore、fleet、WASI／Python dock。
- 鑄 Invite、provision、「登入我的遊樂場」。
- 把「看原始碼」當預設出口（若有連出場殼，須明確次要、且不阻掃碼／傳閱快樂路徑）。
- 假設持久 OPFS／`createProject` 成功才能玩。
- 同時多 SAM／沙盒庫。
- 將 Invite 短鏈當作 Header／型錄「分享」網址。
- 在 go 上提供型錄形式瀏覽／跨 kind 換片；在 Invite 局中換小品。

### 6.3 UX 硬規則

- Mobile-first；主操作在窄屏可完成（對齊 `.cursor/rules/mobile-first-ux.mdc`）。
- 禁止 `alert`／`confirm`／`prompt`（對齊 `.cursor/rules/no-native-dialogs.mdc`）。
- 首屏即玩：載入中也不閃 IDE（本 origin **根本無 IDE**）。
- 用語：加入、入座、開始、已連線、分享——勿 SaaS／Lobby／直連／TURN 術語對讀者（DEC-004；E2E §10）。

### 6.4 站群身分（硬）

純玩版**必須**讓人看得出屬於「我是山姆鍋」的遊樂場站群，並露出**遊樂場主網址**——即使本頁只玩、無編輯環境。

| 項 | 規格 |
| --- | --- |
| **Logo／mark** | 露出**山姆鍋標誌**（與場殼／dash／docs 同源 mark；例：站群 `favicon.svg`／`logo.svg`）。可點 → **`https://play.samkuo.me/`**（遊樂場主入口；與「遊樂場」文案同目標；可行時優先外開系統瀏覽器／Safari）。 |
| **遊樂場主網址** | **必須可見**並可點：`https://play.samkuo.me/`（文件預設場／遊樂場主入口；DEC-042）。文案可用「遊樂場」；**勿**只寫程式名 Playgrounds 當品牌。 |
| **開啟意圖（主網址）** | 點 `play.samkuo.me` 時，**在可行範圍內**優先讓使用者進**系統瀏覽器／標準 Safari**（跳出相機／App 內嵌 WebView），以便需要完整遊樂場（OPFS／編輯）時有一條出路。實作採盡力而為（例：新分頁／外開、平台允許的外部瀏覽器 intent）；**不**宣稱、也**無法**保證所有 in-app WebView 都能自動跳出。 |
| **分享** | 頂列右側（§5.5）；與 mark／遊樂場並列為 chrome 一等元件。 |
| **換片（僅 `/s/`）** | 「下一個」與至多 3 則同 kind 推薦（§5.6）；次於 mark／遊樂場／分享，勿做成迷你型錄。Invite 模式不出現。 |
| **呈現** | 極簡 chrome：**logo＋連到 play＋分享**（＋`/s/` 時換片控件）；勿堆滿場相關導覽搶主視線。對弈中：往下捲／滑自動收起頂列、往上自動展開（盡力監聽同 origin iframe 內手勢；跨域 canvas 僅父頁手勢）。收起時可暫時不占視線，展開後仍須露出身分與主網址。 |
| **窄屏** | logo／「遊樂場」／分享／換片觸控可點（約 ≥44×44px 熱區）；勿裁成無法辨識的無文案小點且無替代文字。 |
| **敘事** | 對齊 DEC-004：個人遊樂場站群，非產品／SaaS 品牌腔。 |

**品牌測試：** 拿掉對弈／小品 UI 後，仍須讀出「山姆鍋／遊樂場」與可點的 `play.samkuo.me`；不可看成無主的通用 game lobby。

**與「請用 Safari 開啟」的關係：** go 快樂路徑**不**依賴跳出 WebView 才能玩（無持久 OPFS）。`play` 鏈＝站群身分＋**可選**進完整遊樂場／系統瀏覽器的出口。若某 WebView 點了仍留在內嵌殼，可輔以短提示（分享選單 → Safari／複製連結）——頁內 UI，禁止 `alert`；**勿**把此提示當 go 入座或 `/s/` 主流程。

**與 dash／docs 頂欄的關係：** 視覺 token／mark 同族即可；**不要求** go 複製完整「我是山姆鍋 · 遊樂場 · 小品 · 文件 · 後台」導覽列。若加次要鏈，優先 `play`；文件／後台可選、非硬。

**否決：** 依賴私有／未文件化 URL scheme「強制開 Safari」當產品契約；否決因無法跳出 WebView 就阻擋 go 上的同意／對弈／`/s/` 試玩。

---

## 7. 執行與儲存模型

### 7.1 與場殼假設的切割

| 假設 | 場殼 Host／`?open=` | 純玩 go |
| --- | --- | --- |
| 持久 OPFS＋`createProject` | **要** | **不要** |
| `sandboxId` | 常態＝OPFS 專案 | 可為 **session／記憶體** 實例 id（僅本頁生命週期） |
| Canvas／UI 資產 | OPFS 或殼 FileMap | **記憶體 FileMap** 或等價 blob／薄 SW 服務 |
| Backend Runtime 寫盤 | 常態 | 弱化／避免；Invite 時 player 權威在 **Host session** |
| WASI／Python host | 產品路徑要 projectId→OPFS | Invite 首刀不需要（gomoku）；`/s/` 以該 SAM 實際需求為準（本刀不擴 IDE） |
| 型錄 resolve | 可現場／殼內 | **建置嵌入**（§5.4） |

### 7.2 SAM 怎麼跑

**Invite（模式 A）**

1. 依 compose `sam.source` fetch（`.sam`／公開 GitHub 等既有可解析來源）。
2. 解成 FileMap，掛在純玩 runtime（**不**呼叫場殼 `opfs.createProject`）。
3. iframe／薄畫布伺候 `index.html`（player UI）。
4. 入座：**reuse 本頁已開的那一份**；禁止再 clone／第二輪寫盤 materialize。

Session／`act`／棋盤權威在 **Host 場**；go 只渲染與經 Roster 隧道發言。

**型錄 `/s/`（模式 B）**

1. 嵌入 catalog 查 `id` → `source`。
2. 同記憶體 FileMap 管線載入（不寫 OPFS）。
3. 無 join；本頁即玩。
4. 若使用者再開另一個 `/s/` 或 `/i/`，或按「下一個」／推薦（§5.6）→ **取代**當前唯一 SAM slot。

### 7.3 遠端 entry

**非第一刀。** 若日後記憶體載入仍被部分 WebView 擋 fetch／blob，可另議 CDN／型錄靜態 entry；本計劃不阻塞在此。

---

## 8. 部署與套件邊界

### 8.1 部署

| 項 | 規格 |
| --- | --- |
| Host | **獨立** Cloudflare Worker（Static Assets＋必要的 `/i/*`／`/s/*` 邊緣邏輯） |
| 網域 | Custom Domain **`go.samkuo.me`** |
| 與 api | Service binding（或經 HTTPS＋CORS）解 short／preview／join／TURN——**僅 Invite 路徑需要** |
| 與場殼 | **不**併進 `play` 的 `dist`／同一 Worker 主路徑 |
| 型錄 | go build 納入 `catalog:gen` 產物（嵌入）；部署物自包含 resolve |

### 8.2 程式（建議）

| 項 | 規格 |
| --- | --- |
| 目錄 | **`go-client/`**（SvelteKit 5 static SPA＋獨立 Worker） |
| UI | Svelte 5 **runes**（DEC-005／048 家族） |
| 共用 | 抽 library：`platformClient`、short resolve、Roster peer／SDP、compose／consent、session wire、`shareOrCopy`、**`goSamShareHref(id)`**（組 `/s/<id>`）——**不要** fork 整份 `PlaygroundsApp` 再刪 UI |
| 場／型錄 | `samOpenShareHref`（或後繼）改為產出 go `/s/<id>`；與 go Header 同一 builder |
| 指令 | `npm run go:dev`／`go:build`／`go:deploy`（build 須能吃到新鮮 catalog gen） |

### 8.3 CORS／允許 origin

Platform CORS／場允許清單須納入 **`https://go.samkuo.me`**（及 local go dev origin）。Guest TURN／join 已走 `join_cap`，不需場 API key。`/s/` 不呼叫 Platform。

---

## 9. 端到端流程（硬）

### 9.1 Host 邀請（短鏈＝go `/i/`）

```text
dash provision → 場殼記憶體 API key
  → 開 pg-gomoku（Host）→ session waiting
  → createPlatformInvite(invite.compose)
  → short_url = https://go.samkuo.me/i/<id>
  → 殼邀請 modal：短網址＋QR；作答循環在場殼
```

### 9.2 Guest（Invite → 純玩入座）

```text
掃 QR／開 https://go.samkuo.me/i/<id>
  → 純玩 SPA；解 Invite（compose）
  → 記憶體載入 SAM player UI
  → 同意入座 → join_cap＋（可選）Guest TURN
  → offer → Host answer → DataChannel
  → player 席 → ready →（Host 開始）→ active → place…
  →（可選）Header 分享 → https://go.samkuo.me/s/pg-gomoku（若對上型錄）
```

### 9.3 型錄傳閱（`/s/`）

```text
型錄列「分享」→ Web Share／複製 https://go.samkuo.me/s/<id>
  → 接收者開 go
  → 嵌入 catalog resolve → 記憶體載入 → 單機可玩
  → Header 分享同一 /s/<id>
  →（可選）下一個／同 kind 推薦 ≤3 → 取代 slot → /s/<other>
```

### 9.4 失敗

| 情況 | 預期 |
| --- | --- |
| short 不存在／過期／撤銷 | 頁內錯誤；可請 Host 重新邀請 |
| `/s/` 未知／已下架 id | 頁內錯誤；可請回型錄 |
| SAM 下載失敗 | 頁內錯誤；不落到「請用 Safari 存沙盒」當主文案 |
| Host 離線／answer 超時 | 可讀等待／失敗；已連上 peer 不受短鏈失效影響 |
| 拒絕 consent | 不入座、不佔成功 handshake |
| 非型錄 SAM 無 id | Header 分享不可用；不偽造 `/s/` |
| 同 kind 無其他項 | 「下一個」／推薦隱藏或 disabled；不跨 kind 湊 |

場殼上既有「Safari／OPFS 受限」recovery：**不**作為 go 快樂路徑；僅場殼 `#pg=`／舊 `view=canvas` 殘留路徑可保留至汰除。

---

## 10. 與五子棋 E2E／點數／型錄的對齊

- E2E 驗收之 Guest「開短連結」改以 **go `/i/`** 為準；場殼 `#pg=` 降為次要。
- Consent、`ready`→Host「開始」、再來一局 `reset`、結束場 fanout——協議不變。
- 有權 Host＋官方 TURN：go Guest 在無法直連時仍須能連（[PG-PLATFORM-CREDITS-PLAN.md](./PG-PLATFORM-CREDITS-PLAN.md)；E2E §3.1）——**不**因純玩版省略 TURN。
- 型錄「分享」契約見 [PG-CATALOG-UX-PLAN.md](./PG-CATALOG-UX-PLAN.md)；與本文件 §5.4／§5.5／§5.6 一致。
- `pg-gomoku` 等型錄項：Invite 用 `/i/`；傳閱用 `/s/pg-gomoku`；換片僅同 `kind: game`（或該項實際 kind）。

---

## 11. 階段與完成定義

| Phase | 內容 | 完成定義 | 狀態 |
| --- | --- | --- | --- |
| **0. 契約** | 本文件；GLOSSARY／DEC-050；保留名 `go`；交叉引用 | 產品／雙 URL／換片／非目標清楚 | **進行中**（2026-08-08：`/s/`＋分享＋同 kind 換片） |
| **1. 骨架** | go Worker＋空 SPA；`go.samkuo.me`；`/i/:id` 進頁；binding／resolve stub | 開短鏈見純玩殼（可先假資料） | **完成**（`go-client/`） |
| **2. 短鏈遷移** | 鑄邀請 `short_url`→go；api `/i/` → 302 go；CORS | Host modal QR＝go；舊 api 短鏈仍可用 | **完成**（含 `GET /v1/shorts/:id`） |
| **3. Compose 可玩** | 記憶體載入 SAM；consent；join／WebRTC；gomoku player | 兩瀏覽器：場殼 Host＋**go Guest** 入座 | **進行中**（guestRuntime＋canvas SW） |
| **4. E2E** | 開始→對弈→終局；TURN 有權路徑；窄屏 | [PG-INVITE-E2E-MVP.md](./PG-INVITE-E2E-MVP.md) §9 以 go 為 Guest | 手測 |
| **5. 型錄 `/s/`** | 嵌入 catalog（含 kind）；`/s/:id` 單機可玩；型錄分享改 go；Header 分享；同 kind「下一個」＋推薦≤3 | 開 `/s/pg-*` 可玩；分享＝`/s/<id>`；換片不跨 kind、無型錄 UI；`/i/` 無換片 | **進行中**（`goCatalog`／`/s/`／Header／`samOpenShareHref`→go） |
| **6.（可選）** | short 不進 hash（B）；文件站導讀；場殼 `#pg=`／`view=canvas` 標「進階／除錯」或汰除 | 另議 | — |

---

## 12. 驗收清單（草案）

**Invite**

- [ ] `short_url` 為 `https://go.samkuo.me/i/…`；邀請 modal／QR 同此
- [ ] `api…/i/…` 302 至 go 同 id（若保留相容）
- [ ] Guest 無 Platform 登入、無 OPFS 寫入即可載入五子棋 UI 並 consent
- [ ] 掃碼／常見 in-app 瀏覽可完成加入（不主依賴「用 Safari 開啟」）
- [ ] 入座後 `ready`；僅 Host「開始」後可交替落子至終局
- [ ] 有權 Host＋官方 TURN：無法直連時 go Guest 仍可連；UI 不揭露 relay
- [ ] 連線後 session／棋步不經 Platform 中繼

**共通／chrome**

- [ ] `go` 在場網保留名表；不當場殼
- [ ] 露出山姆鍋 logo／mark，並可見可點 **`https://play.samkuo.me/`**（§6.4；可行時優先外開系統瀏覽器／Safari）
- [ ] 無編輯環境／Files／鑄邀請入口
- [ ] 無原生 `alert`／`confirm`／`prompt`；窄屏可完成
- [ ] 同時只跑一個 SAM

**型錄傳閱／分享**

- [x] 型錄列「分享」產出 `https://go.samkuo.me/s/<id>`（非 `play?view=canvas`）
- [x] 「一鍵開」仍為場 `/?open=` 編輯面
- [x] go 建置內嵌 catalog；離線／不抓 play 即可 resolve `/s/<id>`
- [x] 未知 id → 頁內錯誤
- [x] go Header 右「分享」：Web Share → 否則複製；網址＝`/s/<id>`，**絕非** `/i/…`
- [x] Invite 局中分享仍為 `/s/<對應型錄 id>`（有 id 時）；無 id 則不可分享
- [x] 分享取消（Abort）不誤報錯、不強制複製
- [x] `/s/`：「下一個」與推薦均同 `kind`；推薦 ≤3；不足不跨 kind 湊
- [x] 無搜尋／filter／貨架等型錄選擇 UI
- [x] `/i/` 不出現換片控件
- [ ] 手測：`go:dev` 開 `/s/pg-breakout` 可玩；型錄分享連指向 go
- [x] 首頁 `/` 呈現至多 3 則推薦（picks 優先）；點進 `/s/<id>`

---

## 13. 文件與用語

| 用 | 不用 |
| --- | --- |
| 純玩版、`go.samkuo.me`、短網址（Invite）、型錄傳閱／`/s/<id>` | 把 go 叫成「場」、第二遊樂場、Guest IDE |
| 當下 Invite／session（局數由 SAM 定） | 暗示純玩＝只能一局；雲存檔、我的小品庫（在 go 上） |
| 傳閱、分享（＝`/s/<id>`） | 把 Header 分享說成「轉發邀請／這場對戰」 |
| 換片、下一個、同 kind 推薦 | go 上「型錄」「逛小品」「換一個任意類」 |
| 一鍵開（場／作者）vs 分享（go／接收者） | 兩者混成同一深鏈 |
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
| 2026-08-08 | **定位擴充：** 同時一 SAM；啟動不限 Invite；型錄傳閱 **`/s/<catalog_id>`**（只認 id、建置內嵌 catalog）；型錄「分享」改 go；Header 右分享＝`/s/` 永不＝`/i/`；與「一鍵開」分流；Phase 5 |
| 2026-08-08 | §5.6：`/s/` 換片＝「下一個」＋同 kind 推薦≤3；禁止跨 kind／型錄選擇 UI；`/i/` 不換片 |
| 2026-08-08 | §5.7：首頁 `/` 推薦≤3（picks 優先、可跨 kind）→ `/s/<id>` |
| 2026-08-08 | §5.5／§6.4：對弈中 chrome＝往下捲收起、往上展開（取代手動 logo 角標） |
| 2026-08-08 | §6.4：logo／mark 連到 `play.samkuo.me`（非部落格） |
