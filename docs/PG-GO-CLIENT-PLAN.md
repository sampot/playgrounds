# Playgrounds 純玩版客戶端（`go.samkuo.me`）

> **狀態：** Draft（2026-08-08）— 契約／階段草案；Invite 路徑實作進行中；型錄 `/s/<id>`／分享面／換片／§5.5.1 OG／§6.5 離線分數／**§6.6「更多」本機溢流**已定案  

> **權威決策：** 建議 [DECISIONS.md](./DECISIONS.md) **DEC-050**（Proposed）  
> **相關：** [PG-INVITE-E2E-MVP.md](./PG-INVITE-E2E-MVP.md)（五子棋 E2E；Invite Guest 主路徑）、[PG-CATALOG-UX-PLAN.md](./PG-CATALOG-UX-PLAN.md)（型錄「分享」→ go）、[PG-PLATFORM-API-PLAN.md](./PG-PLATFORM-API-PLAN.md)、[PG-PLATFORM-CREDITS-PLAN.md](./PG-PLATFORM-CREDITS-PLAN.md)（官方 TURN；Guest 經 `join_cap`）、[PG-ROSTER-PLAN.md](./PG-ROSTER-PLAN.md)、DEC-004／009／023／025／042／045／047／048、[GLOSSARY.md](./GLOSSARY.md)

一句話：**獨立於場殼的純玩客戶端＠`go.samkuo.me`——同時只跑一個 SAM、無編輯環境、不依賴持久 OPFS；啟動不限 Invite（型錄 id 傳閱與 Invite 短鏈並列）；傳閱網址 `/s/<catalog_id>`（內嵌 catalog）；`/s/` game 可換片；可安裝／造訪後離線／本機分數；Header「更多」＝本機溢流（已下載／分層清除）≠ 僅推薦；Invite `/i/`＝臨時 session（不能離線、不換片、無本機選單）。**

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
  1. **Invite／session：** `https://go.samkuo.me/i/<short_id>`（QR／Host 邀請 modal 只出這個）——**臨時生命週期**（TTL／撤銷／Host session）；**先天不能離線**。
  2. **型錄傳閱／單機純玩：** `https://go.samkuo.me/s/<catalog_id>`（型錄列「分享」、go Header「分享」只出這個）——可重訪；見 §6.5 可安裝／造訪後離線／本機分數；§6.6「更多」本機溢流。
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
- 在 go 上複製完整型錄 UX（搜尋／filter／貨架）；換片僅 §5.6；「已下載」不是第二型錄。
- 觀戰、完美斷線重連、多 peer 排隊當本刀主故事（對齊 E2E：鎖 1 Guest）。
- 使用者自備 TURN；對人揭露直連 vs relay（對齊點數計劃）。
- 跨 origin 自動搬 OPFS；純玩版持久化「我的沙盒庫」（多專案 OPFS 語意）。
- **Invite `/i/` 離線可玩**、Invite 局分數／棋譜雲存、跨裝置同步分數、帳號排行榜。
- 把 Header「更多」定義成「只有推薦」、或 Invite 上露本機已下載／清除。
- 以 Cloudflare Pages 為場網主路徑的敘事延伸——本刀 **go** 可用 Workers Static Assets（與 docs／platform 一致）；若實作選 Pages，仍須同一 origin 契約。
- **型錄傳閱現場傳輸：** NFC／系統 Nearby／自建區網 discovery；為 `/s/` 另開 Platform short map（URL 已短）。現場快樂路徑＝分享面 **QR**（§5.5）。

---

## 4. 角色與站群

| 面 | Origin | 誰用 | 職責 |
| --- | --- | --- | --- |
| **場殼** | `play.samkuo.me`（及任意場） | Host；作者／實驗 | OPFS、編輯、鑄 Invite、session 權威、作答；型錄「一鍵開」 |
| **純玩版** | **`go.samkuo.me`** | Guest／傳閱接收者 | `/i/` 入座；`/s/` 單機＋game 換片；consent（僅 Invite）；Header 傳閱；「更多」本機溢流（僅 `/`／`/s/`） |
| **Platform API** | `api.samkuo.me` | 雙方間接 | Invite／short map／signal／TURN cred；**不當**邀人 QR 主面；**不**管型錄 `/s/` |
| **dash** | `dash.samkuo.me` | Host 帳號 | provision；**不**鑄場 Invite |

**保留名：** `go` 與 `api`／`docs`／`dash` 同級——列入 `PLAYGROUNDS_FIELD_RESERVED_SUBDOMAINS`／場殼 Worker `RESERVED`／Platform `FIELD_RESERVED`；**永不**被 wildcard 當場殼伺候。

**勿混：**

| 用 | 不用當成 |
| --- | --- |
| `go.samkuo.me/i/…` | 型錄傳閱、另一個遊樂場 OPFS origin、可離線重玩的固定入口 |
| `go.samkuo.me/s/<id>` | Invite 短鏈、場 `?open=`、通用縮址 |
| 型錄「分享」→ go `/s/` | 型錄「一鍵開」→ 場編輯面 |
| go Header「分享」→ `/s/<id>` | Host 邀請 modal 的 `/i/<short_id>` |
| `/s/` game 換片（下一個／試試這些≤3；僅 `kind: game`） | go 上型錄瀏覽；Invite 中換小品；對非 game 推換片；跨 kind 推薦 |
| 「更多」＝本機溢流（已下載／分層清除；§6.6） | 「更多」＝只有推薦；我的遊戲庫／沙盒庫；Invite 上的本機選單 |
| `/s/` 造訪後離線＋本機分數（§6.5） | Invite 離線對弈；雲存檔；跨 `play`↔`go` 自動搬分 |
| 純玩「當下 Invite／session」（臨時） | 「只能一局」；跨邀請雲存檔；把短鏈當永久書籤遊戲 |
| `#pg=`／shortId 入 go | `#pg_provision=`、`/join/<token>`、`#roster=` OOB |

---

## 5. URL 契約

### 5.1 兩類 canonical（硬分開）

| 類 | URL | 誰產出 | 語意 |
| --- | --- | --- | --- |
| **Invite 短網址** | **`https://go.samkuo.me/i/<short_id>`** | 鑄 Invite 回傳 `short_url`；Host QR／邀請 modal | 入座**當下** session；**臨時生命週期**（TTL／撤銷隨 Invite；需 Host／網路）；**先天不能離線** |
| **型錄 SAM 傳閱** | **`https://go.samkuo.me/s/<catalog_id>`** | 型錄列「分享」；go Header「分享」 | 只執行該型錄小品（單機；無該局 Invite；可重訪；§6.5） |

- Invite 權威／TTL／map 仍在 Platform；go **不**自建第二套邀請庫。
- **`/s/` 不經 Platform short map**；無 TTL、無 join、無點數。
- 鑄邀請回傳 `short_url` 固定組在 **go** origin（**不**再用 `api` request host 組邀請短鏈）。
- **勿**把 `/i/` 宣傳成可加主畫面後離線重玩的入口；主畫面／離線快樂路徑＝`/` 或 `/s/<id>`（§6.5）。

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
| 載入 | 嵌入表查 `id` → 取 `source`（及 title 等）→ 記憶體 fetch／FileMap（**頁內進度條**：檔案數 `done/total`）→ 跑 player UI |
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

現場面對面、又無 AirDrop／Nearby 類通道時，Web Share 與剪貼簿都幫不上忙——須有**畫面對畫面**路徑。Header「分享」因此開**頁內分享面**（非一按即只走 `shareOrCopy`），三選一並列。

| 項 | 規格 |
| --- | --- |
| 位置 | 頂列 chrome：**左**＝山姆鍋 mark（→ play `/`）＋「山姆鍋遊樂場」（→ `/sam/?kind=game`）；**右**＝「分享」 |
| **觸發** | 點「分享」→ 開**頁內分享面**（bottom sheet／modal；禁止 `alert`／`confirm`／`prompt`）。**否決**僅靜默 Web Share→複製、無 QR 的舊快樂路徑當唯一機制 |
| **網址** | **固定＝當前 SAM 的** `https://go.samkuo.me/s/<catalog_id>`（與面內三種動作同一 url） |
| **分享 title（硬）** | **必須**依小品而異：權威＝嵌入型錄該筆的 **`entry.title`**（例：打磚塊、五子棋）。系統分享／`navigator.share({ title })` 用此字串；面內可顯示小品名。**禁止**所有 `/s/` 共用同一個泛稱（如一律「純玩」「遊樂場」）。型錄列「分享」與 go Header **同一 title 來源**（皆＝該 `id` 的 `entry.title`） |
| **分享面內容（硬）** | 同一面內並列三種動作（順序建議如下；窄屏可堆疊）：① **系統分享**（有 Web Share 時；`title`＋`url`；不帶 text 與 url 並送；對齊場／型錄 `shareOrCopy` 語意）② **QR**（編碼同一 `/s/<id>` 絕對網址；足夠大、高對比；文案偏現場：「請對方用相機掃碼開玩」）③ **複製連結**（剪貼簿；頁內 flash）。無 Web Share → **隱藏或 disabled「系統分享」**，**仍須**露出 QR＋複製（**勿**把按鈕文案改成只寫「複製連結」而省略 QR） |
| **QR（硬）** | 載荷＝上述 `/s/<id>` HTTPS 短網址（單張可掃；可重用場殼 Roster／邀請 QR 編碼 library）。**接收端不要求** go 內建掃碼——系統相機對 HTTPS QR 可直接開。QR 產生失敗 → 面內提示＋仍可複製／口誦短形；禁止整面空白 |
| **口誦短形（建議）** | 面內以可讀大字顯示 `go.samkuo.me/s/<id>`（可換行）；掃不到時的備援，非主 CTA |
| **系統分享取消** | 使用者取消（`AbortError`）→ 不抄剪貼簿、不當錯誤；**分享面保持開啟**（可改掃 QR／複製） |
| **成功回饋** | 頁內 flash／status（已分享／已複製；可含小品名）；分享面**預設不自動關閉**（方便先分享給 A、再讓 B 掃 QR）；使用者手動關閉 |
| 明示排除 | **不是** `/i/<short_id>`、不是 `#pg=` secret、不是場 `?open=`；**不是** Invite／Roster 壓縮 payload QR |
| 何時可用 | 當前已載入之 SAM **能對上嵌入型錄的 `id`**（含：經 `/s/` 進入；或 Invite compose 的 source／協定能唯一對上型錄項）。對不上 → 按鈕 disabled／隱藏 |
| 尚無 SAM | 空態／short 失效／載入失敗 → 不分享 |
| 窄屏 | 熱區約 ≥44×44px；按鈕文案固定「分享」（開分享面）；QR 在窄屏須幾乎可掃（建議約半屏寬級） |
| 對弈中 | 往下捲／滑＝自動收起 chrome；往上／下拉＝自動展開；展開後 3s 無點擊頂列→再收起；分享隨 chrome 可視即可；開分享面時不自動收起、chrome／面須可互動關閉 |
| **否決** | NFC／Nearby／自建區網 discovery 當主路徑；為 `/s/` 另鑄 Platform short／TTL；go 內建相機掃 `/s/` QR 當接收快樂路徑；只靠「看網址列」當現場主路徑 |

**語意：** 即使人在 Invite 對弈中按分享，傳出的仍是「打開這顆型錄小品」（單機 `/s/`），**不是**「加入這一場」。Host 邀請 modal **繼續只出** `/i/`（邀請 QR ≠ 型錄傳閱 QR）。

**與 play 型錄列：** 場網型錄列「分享」亦用同源**頁內分享面**（系統分享／QR／複製；見 [PG-CATALOG-UX-PLAN.md](./PG-CATALOG-UX-PLAN.md)）；網址仍為 `/s/<id>`。與 go 差別：型錄分享面內網址**可點擊開新分頁**。

#### 5.5.1 分享連結預覽 title（社群／聊天室；硬）

貼上 `https://go.samkuo.me/s/<catalog_id>` 時，LINE／iMessage／Slack／Facebook 等**連結預覽**必須看得出是**哪一顆小品**——不可所有 id 都顯示同一個站級標題。

| 項 | 規格 |
| --- | --- |
| **權威** | 型錄 **`entry.title`**（及可選 **`entry.blurb`** 作說明）；與 §5.5 分享 title 同源 |
| **`<title>`／`og:title`／`twitter:title`** | **每個** listed `/s/<id>` **不同**；須含該筆 `entry.title`。形狀：`{title} · 山姆鍋遊樂場`（文案勿單用「遊樂場」）。未知／下架 id → 錯誤頁泛稱，**勿**冒充某小品名 |
| **`og:description`／`description`** | **一律含站群脈絡**。有 blurb → `山姆鍋遊樂場 · 純玩｜{blurb}`；無則短站群句＋小品名。不同小品宜可分辨 |
| **`og:url`** | 對應該 `/s/<id>` canonical |
| **`og:image`** | **刻意不提供**（文字卡即可；勿加站級／每小品預覽圖當快樂路徑） |
| **爬蟲可見（硬）** | 預覽爬蟲多半**不執行**客戶端 JS。每個 listed `catalog_id` 的首包 HTML（或邊緣等價注入）就須帶上述 meta——**建置 prerender** `/s/<id>`（entries 來自嵌入 catalog）或 Worker／HTML rewrite 注入；**否決**只靠 SPA hydrate 後改 `<title>` 當社群預覽快樂路徑 |
| **Invite `/i/`** | 短鏈預覽用**中性**泛稱：`接受邀請 · 山姆鍋遊樂場`（description 同脈絡）；**禁止**預設「對弈／對局」。**不**要求依局內 SAM 變 title（分享小品仍走 `/s/`＋本節） |
| **否決** | 全站單一 `og:title`；複製連結有小品名但貼網址預覽卻是「純玩」；為預覽而把 secret 放進 `/i/` 公開 HTML；為社群預覽而強制加 `og:image` |

**驗收直覺：** 分享「打磚塊」與「五子棋」兩條 `/s/` 連到聊天室，未點開前預覽標題就應分別讀出打磚塊／五子棋。

### 5.6 `/s/` 換片（下一個／試試這些；本節定案）

僅 **模式 B（`/s/<id>` 單機傳閱）**且當前小品 **`kind === game`** 時提供；**模式 A（`/i/` Invite）不提供**換片。非 game 的 `/s/<id>`（工具等）仍可單機玩，**不**露換片控件。

| 項 | 規格 |
| --- | --- |
| 語意 | **換片**＝取代當前唯一 SAM slot → 導向／載入另一個 **game** `/s/<id>`；分享網址跟著新 id |
| **下一個** | 嵌入 catalog 中 **`kind: game`** 的穩定序，取當前之後下一筆（末端繞回首筆）。game 僅自己 → 控件 disabled／隱藏 |
| **試試這些（推薦）** | 隨機（或洗牌）抽出 **至多 3** 個**其他 game**；不足 3 就少於 3，**禁止**用其他 kind 湊數。語意＝探索換片，**不是**本機已下載列表 |
| 候選池 | `entry.kind === "game" && entry.id !== current.id`（當前亦必須為 game） |
| UI | 頂列露出「下一個」（一級）。「試試這些」≤3 可放在「更多」面板**第二段**（§6.6），或同等次要露出——**勿**再把「更多」定義成「只有推薦」。非 game／Invite／首頁不出現換片控件 |
| **與「更多」** | **換片** ≠ **本機溢流**（§6.6）。兩者可同進「更多」面板但須分段；推薦不得取代「已下載／清除」 |
| **否決** | go 上型錄形式選擇（搜尋、filter chips、貨架、完整列表）；對 tool／agent 等推換片；跨 kind 推薦；把「更多」做成迷你型錄。完整挑選留在 `play…/sam/` |

**硬規則：** go 換片／試試這些**只推 `kind: game`**；跨 kind **一律禁止**。

嵌入表須含 **`kind`**（及 `id`／`source`／`title`）才能換片。

### 5.7 首頁 `/` 推薦（定案）

開啟 **`https://go.samkuo.me/`**（無 Invite、無 `/s/`）時，主區呈現 **至多 3** 則「推薦試試」：

| 項 | 規格 |
| --- | --- |
| 點擊 | → `/s/<id>` 單機純玩 |
| 來源 | 嵌入 catalog；**優先**場 picks 中的 **game** 洗牌取用，不足再從其他 **game** 補 |
| kind | **僅 `game`**（與 §5.6 一致；不推工具／代理等） |
| chrome | mark＋遊樂場；分享 disabled；**可**露「更多」（§6.6 本機）；**無**「下一個」 |
| 否決 | 搜尋／filter／完整型錄列表；首頁跨 kind 湊數 |

---

## 6. 產品定義（純玩版）

### 6.1 能做

**共通**

- 同時只跑一個 SAM；記憶體載入；無持久 OPFS。
- 站群 chrome（§6.4）＋條件允許時 Header 分享（§5.5）＋「更多」本機溢流（§6.6；`/i/` 除外）。

**模式 0 — 首頁 `/`**

- 至多 3 則**game**推薦（§5.7；picks 優先）→ `/s/<id>`。
- **更多**本機溢流（§6.6）：已下載／清除；無「下一個」。

**模式 A — Invite／session**

- 開啟當下 Invite 指定的 SAM（`invite.compose` → `sam.source`／resolve）。
- 頁內同意入座（protocol 摘要；可改臨時顯示名）。
- Platform ticket／Roster：Guest offer → Host answer；DataChannel；`gomoku.v1` **player** 席。
- 官方 TURN：既有 Guest `join_cap` → `/v1/invites/…/turn/credentials`（記 **Host** 點數）；路徑對人透明。
- 連線態／入座態／Host「開始」後落子至終局；**再來一局**（同 session）由 SAM 決定（五子棋＝Host `reset`）；Host 結束場時可讀提示。
- **不**提供「下一個」／試試這些換片；**不**露「已下載／清除」本機選單（臨時局與本機離線庫無關）。
- **臨時生命週期（硬）：** 短鏈隨 Invite TTL／撤銷失效；入座依賴 Platform＋Host＋WebRTC——**先天不能離線**。不承諾以 `/i/` 加主畫面後離線重玩；不承諾該局分數／棋譜長期本機或雲端保留（顯示名等非局狀態可本機記住，見 §6.5 排除項）。

**模式 B — 型錄 `/s/<id>`**

- 嵌入表 resolve → 記憶體載入（下載中顯示進度條）→ 跑該 SAM player UI（單機；無 consent／join／TURN）。
- **game 換片**（§5.6）：當前為 game 時「下一個」＋「試試這些」≤3；無型錄選擇 UI。
- **可安裝／造訪後離線／本機分數**（§6.5）＋**更多**本機溢流（§6.6）。
- 無編輯、無「一鍵變作者」主 CTA；次要出口＝chrome 上的遊樂場主網址。

### 6.2 不能做（硬）

- 編輯原始碼、Files 側欄、匯入／匯出 `.sam`、SecretStore、fleet、WASI／Python dock。
- 鑄 Invite、provision、「登入我的遊樂場」。
- 把「看原始碼」當預設出口（若有連出場殼，須明確次要、且不阻掃碼／傳閱快樂路徑）。
- 假設持久 OPFS／`createProject` 成功才能玩。
- 同時多 SAM／沙盒庫；把「已下載」做成第二遊樂場／「我的遊戲庫」產品面。
- 將 Invite 短鏈當作 Header／型錄「分享」網址。
- 在 go 上提供型錄形式瀏覽／跨 kind 換片；在 Invite 局中換小品。
- 承諾 **Invite `/i/` 離線可玩**或把短鏈當永久離線遊戲入口。
- 雲存檔、跨裝置同步分數、帳號排行榜；跨 origin（含 `play`↔`go`）自動搬分數／OPFS。
- 用原生 `confirm`／`alert` 做清除確認；用含糊的「清除遊戲資料」一次刪光且不說明範圍。

### 6.3 UX 硬規則

- Mobile-first；主操作在窄屏可完成（對齊 `.cursor/rules/mobile-first-ux.mdc`）。
- 禁止 `alert`／`confirm`／`prompt`（對齊 `.cursor/rules/no-native-dialogs.mdc`）。
- 首屏即玩：載入中也不閃 IDE（本 origin **根本無 IDE**）。
- 用語：加入、入座、開始、已連線、分享、已下載、清除——勿 SaaS／Lobby／直連／TURN／「我的庫」術語對讀者（DEC-004；E2E §10）。

### 6.4 站群身分（硬）

純玩版**必須**讓人看得出屬於「我是山姆鍋」的遊樂場站群，並露出**遊樂場主網址**——即使本頁只玩、無編輯環境。

| 項 | 規格 |
| --- | --- |
| **Logo／mark** | 露出**山姆鍋標誌**（與場殼／dash／docs 同源 mark；例：站群 `favicon.svg`／`logo.svg`）。可點 → **`https://play.samkuo.me/`**（遊樂場主入口；可行時優先外開系統瀏覽器／Safari）。 |
| **「山姆鍋遊樂場」文案** | 頂列文案可點 → **`https://play.samkuo.me/sam/?kind=game`**（小品型錄**遊戲**分類；query 契約見型錄 UX）。若露出網址副標，**固定＝`play.samkuo.me`**（遊樂場主網址；**勿**寫成 `/sam/…` 長路徑）。**勿**只寫程式名 Playgrounds 當品牌。 |
| **開啟意圖** | 點 mark／型錄鏈時，**在可行範圍內**優先讓使用者進**系統瀏覽器／標準 Safari**（跳出相機／App 內嵌 WebView）。實作採盡力而為（例：新分頁／外開）；**不**宣稱、也**無法**保證所有 in-app WebView 都能自動跳出。 |
| **分享** | 頂列右側（§5.5）；與 mark／遊樂場並列為 chrome 一等元件。 |
| **換片（僅 `/s/` 且 `kind: game`）** | 頂列「下一個」一級；「試試這些」≤3 次要（可在「更多」第二段，§5.6／§6.6）。非 game／Invite／首頁不出現換片。 |
| **更多（本機溢流）** | Header「更多」／⋯＝**本機與次要動作**（§6.6），**不是**「只有推薦」。首頁 `/` 與 `/s/` 可開；**Invite `/i/` 不開**本機段。長說明（加主畫面／in-app 瀏覽器）→ 靜態 **`/help`**，更多內只放連結。 |
| **呈現** | 極簡 chrome：**logo（→ play `/`）＋「山姆鍋遊樂場」（→ `/sam/?kind=game`）＋分享**（＋`/s/` game「下一個」＋「更多」）；勿堆滿場相關導覽搶主視線。對弈中：往下捲／滑自動收起頂列（含 logo）、往上／下拉自動展開（盡力監聽同 origin iframe 內手勢；跨域 canvas 僅父頁手勢）。**展開後若 3 秒內未點擊頂列 → 自動再收起**（點頂列則重計時；**分享面或「更多」面板開啟期間不自動收起**）。收起時**不**留單獨 logo／角標；展開後仍須露出身分與型錄鏈。 |
| **窄屏** | logo／「山姆鍋遊樂場」／分享／下一個／更多觸控可點（約 ≥44×44px 熱區）；已下載列表／清除用**頁內面板**（底部 sheet 或全高），勿加長頂列 dropdown。 |
| **敘事** | 對齊 DEC-004：個人遊樂場站群，非產品／SaaS 品牌腔。 |

**品牌測試：** 拿掉對弈／小品 UI 後，仍須讀出「山姆鍋／遊樂場」與可點的型錄／場入口；不可看成無主的通用 game lobby。

**與「請用 Safari 開啟」的關係：** go 快樂路徑**不**依賴跳出 WebView 才能玩（無持久 OPFS）。`play`／`/sam/` 鏈＝站群身分＋**可選**進完整遊樂場／型錄／系統瀏覽器的出口。若某 WebView 點了仍留在內嵌殼，可輔以短提示（分享選單 → Safari／複製連結）——頁內 UI，禁止 `alert`；**勿**把此提示當 go 入座或 `/s/` 主流程。

**與 dash／docs 頂欄的關係：** 視覺 token／mark 同族即可；**不要求** go 複製完整「我是山姆鍋 · 遊樂場 · 小品 · 文件 · 後台」導覽列。若加次要鏈，優先 `play`；文件／後台可選、非硬。

**否決：** 依賴私有／未文件化 URL scheme「強制開 Safari」當產品契約；否決因無法跳出 WebView 就阻擋 go 上的同意／對弈／`/s/` 試玩。

### 6.5 可安裝／離線／本機分數（僅 `/s/`；本節定案）

使用者對純玩的合理期望（加主畫面、離線再玩、分數留下）**只**落在**型錄單機**路徑；**不**落在 Invite。

| 項 | 規格 |
| --- | --- |
| **範圍** | **僅**模式 B（`/s/<id>`）與為其服務的殼（首頁 `/` 可作安裝／回訪入口）。**模式 A（`/i/`）排除。** |
| **加到主畫面** | go origin 提供 Web App Manifest＋圖示（含 iOS `apple-touch-icon`／必要 meta），使標準 Safari／Chrome 可「加入主畫面」／安裝。start_url 宜為 **`/`** 或穩定 `/s/<id>`（實作可定預設 `/`；深鏈開啟仍尊重 path）。**勿**引導使用者把 **`/i/<short_id>`** 釘成主畫面圖示當永久遊戲（短鏈會過期）。 |
| **離線可玩** | **造訪過才離線**（對齊場殼 DEC-009 精神；非全型錄預先下載）：曾成功載入之 `/s/<id>` 的殼資產＋該 SAM FileMap（或等價 Cache）在網路失敗時仍可再開同 id。嵌入 catalog 已可離線 resolve；差在小品本體與殼 bundle 的 Cache。策略傾向 **network-first**（線上更新優先；失敗才 Cache）——細節可對齊場 `swOfflineStrategy`，但 go SW 須與畫布 snapshot 職責共存、勿 cache-first 釘死舊包。 |
| **分數／實例狀態** | **本機、本 origin**。權威＝SAM 應用模型：`UI → /api → functions.js → env.KV／env.DB`。go 注入同形 bindings，後端為 **IndexedDB（主）＋ localStorage（後備）**，命名空間穩定綁 **`catalog_id`**（`catalog:<id>`），**不**綁每次隨機 `sandboxId`、**不**用 OPFS。Invite 畫布用 ephemeral／非 durable 記憶體 ns。舊 UI 直寫 `localStorage` 的 shim（`injectGoScoreStorage`）僅相容尚未遷移的小品。**無**雲端、**無**跨 `play`↔`go` 自動搬。§6.6 分層清除含 KV／DB＋舊 shim。 |
| **Invite 排除（硬）** | `/i/`：**不能**離線入座／對弈；不承諾該局分數長期保留；短鏈失效後重開＝頁內錯誤（請 Host 重新邀請）。可保留非局偏好（例：Roster 顯示名）。 |
| **敘事** | 對讀者：「傳閱連結可留在手機、沒網路也能玩過的那幾顆」——**不是**「邀請 QR 離線也能加入」。 |
| **否決** | Invite 離線；預先打包全型錄離線；雲排行榜／帳號存檔；把 go 做成第二個 OPFS 沙盒庫；UI 直寫 IndexedDB／OPFS 當權威狀態（runtime 無法匯出／清除）。 |

**與「無持久 OPFS」：** §6.5 允許 Cache API（離線 FileMap）＋ **IndexedDB／localStorage 實作的 `env.KV`／`env.DB`**；仍**禁止**場殼式 OPFS 專案庫、`createProject` 快樂路徑、多沙盒管理面。長遠（含 Tauri）SAM 只依賴 bindings，不依賴瀏覽器 storage 方言。

**`env.DB`／sql.js（宿主 infra）：** 動態 `import("sql.js")`（不擋 KV-only 開玩）；WASM／glue 同源 **`/vendor/sql.js/*`**（`scripts/vendor-sqljs.mjs`）；go SW 對 `/vendor/**` 與 `.wasm` **network-first**（首次成功 fetch 後可離線）。**禁止** CDN 載 sql.js WASM。不在進 `/s/` 時預抓——僅當小品真的使用 `env.DB` 才下載。

### 6.6 Header「更多」＝本機溢流（定案）

「更多」**不再**定義成「只有遊戲推薦」。推薦屬**換片**（§5.6）；本機屬**離線／分數管理**（§6.5）。兩者可同進一個溢流入口，但**必須分段**。

#### 6.6.1 資訊架構

| 段 | 內容 | 何時 |
| --- | --- | --- |
| **本機（硬）** | 「已下載的遊戲」；「清除…」（分層，見 §6.6.3） | 首頁 `/`、模式 B `/s/` |
| **再玩一顆（可選）** | 「試試這些」≤3（§5.6；僅當前為 game 的 `/s/`） | 僅 `/s/` 且 `kind: game`；與本機段之間須有分隔 |
| **排除** | Invite `/i/` **不**露本機段（亦不露試試這些） | 模式 A |

頂列一級：**下一個**（換片）保持在 chrome；**不要**把「下一個」塞進「更多」才找得到。

#### 6.6.2 已下載的遊戲

| 項 | 規格 |
| --- | --- |
| **語意** | 這台裝置**曾成功載入**、可供離線再開的 `/s/<id>`（FileMap／等價 cache 命中）——**不是**「我的沙盒庫／收藏／遊戲庫」 |
| **用語** | 「已下載」或「可離線玩」；**勿**「我的遊戲庫」「收藏夾」 |
| **UI** | 點「更多」→ **頁內面板**（禁止 `alert`）列出小品 **title**；點一筆 → `/s/<id>`（取代當前唯一 slot）。空態一句話：「連線玩過一次後會出現在這裡。」 |
| **範圍** | **只**列本機有離線包的 id；**禁止**完整型錄、搜尋、filter、跨 kind 貨架 |
| **可見** | `/` 與 `/s/` 皆可開（回訪主路徑）；**不**綁「正在玩才出現」 |

#### 6.6.3 清除（必須分層）

禁止單一含糊的「清除遊戲資料」一次刪光且不說明範圍。破壞性步驟皆須**頁內確認**（取消可退；禁止原生 `confirm`）。

| 層 | 動作 | 效果 |
| --- | --- | --- |
| **1** | 清除這個遊戲的進度／分數 | 僅當前（或選定）`catalog_id` 的分數／進度 ns（§6.5 localStorage 前綴） |
| **2** | 移除這個遊戲的離線下載 | 僅該 id 的 SAM FileMap cache；下次需連線重抓才能離線 |
| **3（可選進階）** | 清除全部本機遊戲資料 | 所有小品分數 ns＋offline SAM cache。**預設勿**一併清 theme／Roster 顯示名等非遊戲偏好；若一併清須文案明示 |

清除成功→頁內 flash／status；列表與當前可否離線狀態立刻更新。

#### 6.6.4 UX 硬規則

- 窄屏：列表／清除用底部 sheet 或全高面板；熱區 ≥44×44px。
- 面板開啟期間：暫停 chrome 3s 自動收起（對齊分享面）。
- 仍：**同時一個 SAM**；已下載列表只是索引，點選＝換片載入，不是多開。
- **否決：** Invite 上露本機管理；把「更多」做成搜尋型錄；無確認的破壞性清除；「我的庫」產品敘事。

---

## 7. 執行與儲存模型

### 7.1 與場殼假設的切割

| 假設 | 場殼 Host／`?open=` | 純玩 go |
| --- | --- | --- |
| 持久 OPFS＋`createProject` | **要** | **不要**（§6.5 本機分數／離線 ≠ OPFS 沙盒庫） |
| `sandboxId` | 常態＝OPFS 專案 | 執行期可為 **session／記憶體** id；**分數鍵用 `catalog_id`**（§6.5） |
| Canvas／UI 資產 | OPFS 或殼 FileMap | **記憶體 FileMap** 或等價 blob／薄 SW 服務；（`/s/`）可再進 Cache 供造訪後離線 |
| 離線殼／小品 | 造訪過的場路徑（DEC-009） | **僅 `/s/`** 造訪後離線（§6.5）；**`/i/` 無** |
| Backend Runtime 寫盤 | 常態 | 弱化／避免；Invite 時 player 權威在 **Host session** |
| WASI／Python host | 產品路徑要 projectId→OPFS | Invite 首刀不需要（gomoku）；`/s/` 以該 SAM 實際需求為準（本刀不擴 IDE） |
| 型錄 resolve | 可現場／殼內 | **建置嵌入**（§5.4；離線可查 id） |

### 7.2 SAM 怎麼跑

**Invite（模式 A）**

1. 依 compose `sam.source` fetch（`.sam`／公開 GitHub 等既有可解析來源）。
2. 解成 FileMap，掛在純玩 runtime（**不**呼叫場殼 `opfs.createProject`）。
3. iframe／薄畫布伺候 `index.html`（player UI）。
4. 入座：**reuse 本頁已開的那一份**；禁止再 clone／第二輪寫盤 materialize。

Session／`act`／棋盤權威在 **Host 場**；go 只渲染與經 Roster 隧道發言。

**型錄 `/s/`（模式 B）**

1. 嵌入 catalog 查 `id` → `source`。
2. 同記憶體 FileMap 管線載入（不寫 OPFS）；成功後可 warm Cache（§6.5）。
3. 無 join；本頁即玩；分數鍵依 `catalog_id`（§6.5）。
4. 若使用者再開另一個 `/s/` 或 `/i/`，或按「下一個」／推薦（§5.6）→ **取代**當前唯一 SAM slot。

### 7.3 遠端 entry

**非第一刀。** 若日後記憶體載入仍被部分 WebView 擋 fetch／blob，可另議 CDN／型錄靜態 entry；本計劃不阻塞在此。離線路徑仍以「曾成功 fetch 進 Cache」為準，不依賴遠端 entry 未 offline 時可用。

### 7.4 SW 職責（go）

| 職責 | 說明 |
| --- | --- |
| **畫布** | 既有：`/canvas/<sandboxId>/*` 記憶體 snapshot＋`/api` 轉發（與場對齊；Invite／`/s/` 共用） |
| **離線（§6.5）** | 另：殼 document／hashed assets＋曾載入之 `/s/` SAM 產物——**network-first**；**不**對 `/i/*` 承諾離線 document |
| **安裝** | Manifest／icon 靜態資產可進 Cache；SW 須滿足瀏覽器 installability 常見條件（實作細節另測 Safari／Chrome） |

畫布 snapshot **仍是記憶體／頁生命週期**；離線再開 `/s/<id>`＝重新 materialize（自 Cache 取 FileMap），不是還原當下 Invite session。

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
| 共用 | 抽 library：`platformClient`、short resolve、Roster peer／SDP、compose／consent、session wire、`shareOrCopy`、**QR 編碼**（與 Roster／邀請同源）、**`goSamShareHref(id)`**（組 `/s/<id>`）——**不要** fork 整份 `PlaygroundsApp` 再刪 UI |
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
  → Header「分享」→ 頁內分享面（系統分享／QR／複製；同一 /s/<id>）
  → 現場：對方相機掃 QR → 開 /s/<id>
  →（可選）下一個／同 kind 推薦 ≤3 → 取代 slot → /s/<other>
```

### 9.4 失敗

| 情況 | 預期 |
| --- | --- |
| short 不存在／過期／撤銷 | 頁內錯誤；可請 Host 重新邀請 |
| `/s/` 未知／已下架 id | 頁內錯誤；可請回型錄 |
| SAM 下載失敗 | 頁內錯誤；不落到「請用 Safari 存沙盒」當主文案 |
| Host 離線／answer 超時 | 可讀等待／失敗；已連上 peer 不受短鏈失效影響 |
| Guest 斷網再開 `/i/` | 頁內錯誤／無法入座；**不**落到離線可玩（Invite 先天不能離線） |
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
| **0. 契約** | 本文件；GLOSSARY／DEC-050；保留名 `go`；交叉引用 | 產品／雙 URL／換片／§6.5／§6.6／非目標清楚 | **進行中**（2026-08-08：含「更多」本機溢流定案） |
| **1. 骨架** | go Worker＋空 SPA；`go.samkuo.me`；`/i/:id` 進頁；binding／resolve stub | 開短鏈見純玩殼（可先假資料） | **完成**（`go-client/`） |
| **2. 短鏈遷移** | 鑄邀請 `short_url`→go；api `/i/` → 302 go；CORS | Host modal QR＝go；舊 api 短鏈仍可用 | **完成**（含 `GET /v1/shorts/:id`） |
| **3. Compose 可玩** | 記憶體載入 SAM；consent；join／WebRTC；gomoku player | 兩瀏覽器：場殼 Host＋**go Guest** 入座 | **進行中**（guestRuntime＋canvas SW） |
| **4. E2E** | 開始→對弈→終局；TURN 有權路徑；窄屏 | [PG-INVITE-E2E-MVP.md](./PG-INVITE-E2E-MVP.md) §9 以 go 為 Guest | 手測 |
| **5. 型錄 `/s/`** | 嵌入 catalog（含 kind）；`/s/:id` 單機可玩；型錄分享改 go；Header **分享面**（系統分享／QR／複製；§5.5）；同 kind「下一個」＋推薦≤3；**每 id 分享／OG title**（§5.5.1） | 開 `/s/pg-*` 可玩；分享＝`/s/<id>`＋小品名 title；現場可掃 QR；換片不跨 kind；社群預覽可分辨小品；`/i/` 無換片 | **進行中**（prerender＋OG／title＋分享面／QR 已落地；手測預覽／掃碼待） |
| **6. `/s/` 可安裝／離線／分數** | Manifest＋主畫面；造訪後離線再開 `/s/<id>`；**functions.js＋env.KV／DB**（IDB／localStorage；鍵＝`catalog_id`）；SW 與畫布職責共存（§6.5／§7.4） | 標準瀏覽器可加主畫面；曾開過的 `/s/pg-*` 斷網可再玩且 KV 分數仍在；`/i/` 斷網不可入座；無雲存檔／無 OPFS | **進行中**（manifest／SW／FileMap offline；**functions＋goWebKv／goWebDb**；舊 score shim 相容） |
| **6b. 「更多」本機溢流** | Header「更多」＝已下載列表＋分層清除；試試這些可選第二段；Invite 不露（§6.6） | `/`／`/s/` 可開已下載面板；清除分層＋頁內確認；`/i/` 無本機選單；非迷你型錄 | **已落地**（`GoMorePanel`） |
| **7.（可選）** | short 不進 hash（B）；文件站導讀；場殼 `#pg=`／`view=canvas` 標「進階／除錯」或汰除 | 另議 | — |

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
- [ ] **臨時／線上：** 斷網或 short 失效 → 頁內錯誤；**不**宣稱 `/i/` 離線可玩或主畫面永久入口

**共通／chrome**

- [ ] `go` 在場網保留名表；不當場殼
- [x] 露出山姆鍋 logo／mark（→ **`https://play.samkuo.me/`**）與「山姆鍋遊樂場」（→ **`https://play.samkuo.me/sam/?kind=game`**）（§6.4；可行時優先外開系統瀏覽器／Safari）
- [ ] 無編輯環境／Files／鑄邀請入口
- [ ] 無原生 `alert`／`confirm`／`prompt`；窄屏可完成
- [ ] 同時只跑一個 SAM

**型錄傳閱／分享**

- [x] 型錄列「分享」產出 `https://go.samkuo.me/s/<id>`（非 `play?view=canvas`）
- [x] 「一鍵開」仍為場 `/?open=` 編輯面
- [x] go 建置內嵌 catalog；離線／不抓 play 即可 resolve `/s/<id>`
- [x] 未知 id → 頁內錯誤
- [x] go Header 右「分享」：開**頁內分享面**（系統分享／QR／複製並列）；網址＝`/s/<id>`，**絕非** `/i/…`
- [x] 無 Web Share 時仍露出 QR＋複製；按鈕文案維持「分享」（非改成只「複製連結」）
- [x] QR 載荷＝同一 `/s/<id>` HTTPS；產生失敗有頁內提示；接收端用系統相機即可
- [x] Invite 局中分享仍為 `/s/<對應型錄 id>`（有 id 時）；無 id 則不可分享
- [x] 系統分享取消（Abort）不誤報錯、不強制複製；分享面保持開啟
- [x] **分享 title／預覽（§5.5／§5.5.1）：** 系統分享 title＝該筆 `entry.title`；不同 id 不同 `<title>`／`og:title`／`twitter:title`（含 blurb→description）；listed `/s/<id>` 建置 prerender 首包 HTML（`go-client`）
- [ ] 手測：兩條不同 `/s/` 貼聊天室，預覽標題可分辨小品名
- [ ] 手測：兩支手機面對面——A 開分享面 QR，B 系統相機掃碼進同一 `/s/<id>`
- [x] `/s/` 換片／推薦**僅 `kind: game`**；推薦 ≤3；不足不跨 kind 湊
- [x] 非 game 的 `/s/<id>` 不露「下一個」／推薦
- [x] 無搜尋／filter／貨架等型錄選擇 UI
- [x] `/i/` 不出現換片控件
- [ ] 手測：`go:dev` 開 `/s/pg-breakout` 可玩；型錄分享連指向 go
- [x] 首頁 `/` 呈現至多 3 則**game**推薦（picks 優先）；點進 `/s/<id>`

**`/s/` 可安裝／離線／本機分數（§6.5；Phase 6）**

- [x] go 有 Web App Manifest＋圖示（`manifest.webmanifest`／favicon；start_url＝`/`）
- [x] 線上成功玩過某 `/s/<id>` 後可 Cache FileMap；殼 SW network-first（`/i/` 不進 shell offline）
- [x] 畫布 `/api`→`functions.js`＋`env.KV`／`env.DB`（IndexedDB／localStorage；ns＝`catalog:<id>`）；不綁隨機 `sandboxId`；無 OPFS
- [x] 舊 UI `localStorage` 分數 shim（`injectGoScoreStorage`）仍相容；§6.6 清除含 KV／DB＋shim
- [ ] 手測：`/s/pg-rubik` 打亂→還原→重整後最佳仍在；Safari／Chrome 主畫面／離線
- [x] `/i/` 不進 shell offline cache；文件敘事不暗示 Invite 可離線
- [x] 無雲存檔、無跨 `play`↔`go` 自動搬分、無 OPFS 沙盒庫 UI

**「更多」本機溢流（§6.6；Phase 6b）**

- [x] Header「更多」＝本機溢流（已下載＋分層清除）；**不是**只有推薦
- [x] 「已下載的遊戲」列本機有離線包的 title；點進 `/s/<id>`；空態白話提示；無搜尋／完整型錄
- [x] 清除分層：進度／分數 vs 離線下載 vs（可選）全部；皆頁內確認；禁止原生 `confirm`
- [x] 「試試這些」若在更多內＝第二段；頂列仍有「下一個」
- [x] `/i/` 不露已下載／清除；面板開啟時暫停 chrome 自動收起
- [x] 用語無「我的遊戲庫／沙盒庫」

---

## 13. 文件與用語

| 用 | 不用 |
| --- | --- |
| 純玩版、`go.samkuo.me`、短網址（Invite）、型錄傳閱／`/s/<id>` | 把 go 叫成「場」、第二遊樂場、Guest IDE |
| 當下 Invite／session（**臨時**；局數由 SAM 定） | 暗示純玩＝只能一局；Invite 離線；雲存檔、我的小品庫（在 go 上） |
| `/s/` 造訪後離線、本機分數、加到主畫面 | Invite 離線對弈；全型錄預先離線包；雲排行榜 |
| 「更多」＝本機溢流；已下載；分層清除 | 「更多」＝只有推薦；我的遊戲庫；含糊一鍵全砍 |
| 傳閱、分享（＝`/s/<id>`）；分享 title＝小品 `entry.title`；分享面＝系統分享／QR／複製 | 把 Header 分享說成「轉發邀請／這場對戰」；所有 `/s/` 同一預覽標題；現場只靠看網址列 |
| 每 `/s/<id>` 不同 `og:title`（爬蟲可見） | 只改 client `<title>`、社群預覽仍是站級泛稱 |
| 型錄傳閱 QR（`/s/<id>`）vs 邀請 QR（`/i/<short_id>`） | 兩者混成同一碼或同一 modal |
| 換片、下一個、試試這些（**僅 game**） | go 上「型錄」「逛小品」「換一個任意類」；對 tool 推換片 |
| 一鍵開（場／作者）vs 分享（go／接收者） | 兩者混成同一深鏈 |
| 山姆鍋 mark（→ play `/`）、「山姆鍋遊樂場」（→ `/sam/?kind=game`）；副標＝`play.samkuo.me` | 無標匿名 lobby；Playgrounds 當對外品牌名；副標寫 `/sam/…` |
| 請 Host 重新邀請 | 教 Guest 開 Safari 才能玩（go 快樂路徑）；教把邀請短鏈釘主畫面當永久遊戲 |

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
| 2026-08-08 | **§6.5／§7.4：** `/s/` 可加主畫面、造訪後離線、本機分數（鍵＝`catalog_id`）；**Invite `/i/`＝臨時生命週期、先天不能離線**；Phase 6；非目標補雲存檔／Invite 離線 |
| 2026-08-08 | **§5.5／§5.5.1：** 每個 `/s/<id>` 分享 title／社群預覽依 `entry.title`（及 blurb）而異；首包 HTML／prerender 須爬蟲可見；禁止全站同一 `og:title` |
| 2026-08-08 | **實作：** go prerender `/s/<id>`＋OG；manifest／SW shell＋SAM FileMap offline cache；canvas score localStorage ns＝`catalog_id` |
| 2026-08-08 | §6.4／chrome：副標網址固定 `play.samkuo.me`（遊樂場主網址；非 `/sam/…`） |
| 2026-08-08 | **§5.5：** Header「分享」改**頁內分享面**——系統分享／QR／複製並列；現場面對面快樂路徑＝掃 `/s/<id>` QR（非只靠 Web Share→複製）；邀請 QR 仍僅 `/i/` |
| 2026-08-08 | **實作：** go `GoShareSheet`（QR＝Roster 編碼／`/s/<id>`）；`shareViaWebShare`／`copyShareUrl`；Header 開分享面 |
| 2026-08-08 | §6.4：對弈中 chrome 收起時**不**留單獨 logo（隨頂列一起隱藏） |
| 2026-08-08 | §6.4：展開頂列後 3s 無點擊 → 自動收起（分享面開啟時暫停） |
| 2026-08-08 | §5.6／§5.7：**更正**——推薦／換片只推 **`kind: game`**（非「僅畫布就緒才推薦」）；非 game 的 `/s/` 不換片；首頁亦不跨 kind |
| 2026-08-08 | `/s/`／`/i/` 下載 SAM 顯示頁內進度條（FileList `done/total`；接 `fetchGithubProject` onProgress） |
| 2026-08-08 | §6.4：頂列「山姆鍋遊樂場」改連 **`play…/sam/?kind=game`**（遊戲分類）；mark 仍 → play `/` |
| 2026-08-08 | **§6.6：** Header「更多」改＝**本機溢流**（已下載／分層清除）；試試這些＝換片第二段；與「只有推薦」脫鉤；`/i/` 不露本機；Phase 6b |
| 2026-08-08 | **§6.5／runtime：** go 與場同一應用模型——`/api`→`functions.js`→`env.KV`／`env.DB`；實作＝IndexedDB＋localStorage（非 OPFS）；驗收小品 `pg-rubik` |
| 2026-08-08 | **sql.js：** 動態 import；WASM 同源 `/vendor/sql.js`＋SW network-first 離線 cache（非 CDN、非進 `/s/` 預載） |
