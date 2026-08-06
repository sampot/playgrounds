# SAM 小品型錄人機 UX（Draft）

> **狀態：** Phase 2–5 **已落地**（2026-08-06）；Phase 0 契約仍適用  
> **相關：** DEC-041（`/sam/` 入場網）、DEC-004（敘事）、DEC-025（`?open=`）、DEC-046／[PG-CATALOG-QUERY-PLAN.md](./PG-CATALOG-QUERY-PLAN.md)（機器查詢）、[PG-CATALOG-PLAN.md](./PG-CATALOG-PLAN.md)（YAML 權威）、[PG-SVELTEKIT-PLAN.md](./PG-SVELTEKIT-PLAN.md)（宿主改 SvelteKit；載體）

一句話：**`/sam/` 是場網 PWA 的「找 SAM、一鍵開進本場」面——脫離部落格散文 layout 與「必用 Astro 靜態頁」假設；規模成長靠搜尋／filter／密度，資料權威仍 YAML＋gen。**

---

## 目標

- 型錄主職＝**在本場找到並開啟 SAM**（對齊 `?open=`／lazy install），不是部落格 tools／閱讀頁延伸。
- 版面與互動對齊遊樂場殼（PWA），**不受**部落格閱讀欄寬／文章骨架限制。
- 支援 SAM 數量持續增加：可搜、可篩、可掃視；精選與全庫分流。
- 對外 URL **`/sam/`**（及可選 query）保持可分享；實作可為殼內 route／面板，**不**要求獨立 Astro document。

## 非目標

- 改 YAML 投稿權威、CMS、執行期爬 GitHub 填型錄。
- 刮 HTML 當機器權威（仍用 typed／`/catalog/v1.json`）。
- 型錄伺服器端搜尋／向量檢索。
- 做成產品商店／SaaS 目錄腔（DEC-004）。
- 文件站承載型錄（DEC-043：型錄在場網）。
- 為 UX 先行大改 Astro 頁再丟棄（應以 [PG-SVELTEKIT-PLAN.md](./PG-SVELTEKIT-PLAN.md)／殼為載體）。

---

## 問題（現況 → 已對）

| 層 | 舊痛點 | 現況 |
| --- | --- | --- |
| 版面 | 散文欄寬 | 近全寬；寬螢幕左 filter、右結果 |
| 導覽 | kind tab、無搜尋 | 即時搜尋＋kind／series chips（可多選） |
| 卡片 | hover 才露 CTA、密度低 | compact 預設；「一鍵開」常駐 |
| 架構 | 跳出殼 hop | `/sam/` Kit route＋殼內型錄 dialog（同元件） |
| 資料 | picks 未當貨架 | 精選貨架＋全庫同一流 |

機器查詢面（DEC-046）已夠用；人機產品面見下。

---

## 產品定位

| | 人機 `/sam/`（本計劃） | 機器查詢（DEC-046） |
| --- | --- | --- |
| 讀者 | 人類 | 殼／runtime |
| 主動作 | 瀏覽、搜尋、一鍵開 | list／match／lazy install 解析 |
| 資料 | 同 `catalog:gen` | 同 gen |

**首屏：** 一句定位＋**搜尋**（可選精選貨架），不是長 lede 文章。免責／投稿說明下沉 footnote 或次級區（語氣仍 DEC-004）。

---

## UX 原則（鎖死）

1. **雙速** — 上：`picks.yaml`「玩玩看」貨架；下／主區：可查全庫。  
2. **找得到 > 分得細** — 即時搜尋（`title`／`id`／`blurb`／`series`／`kind`）；kind／series 作 filter chips（可多選），tab 互斥面板可降級或移除。  
3. **版面脫離散文欄** — 寬欄或近全寬；寬螢幕可左 filter／系列、右結果。  
4. **密度預設 compact** — icon＋名＋常駐「一鍵開」；blurb 次級／展開。禁止僅靠 hover 露出主 CTA。  
5. **一鍵開走本場路徑** — 優先殼內直接 open／install；外鏈 `/?open=` 僅相容／深鏈。開發／編輯預設（不加 `view=`）。  
6. **可分享 URL** — 至少 `/sam/`；建議 `?q=`／`?kind=`（及既有 series hash 若保留）。列上「分享」仍 Web Share API（否則拷貝）；**分享出去的開啟連結**加 `view=canvas`，接收者進場後放大畫布（試玩）。試玩頂列＝「換一個／型錄／看原始碼」；型錄與隨機**不**還原工作區，唯「看原始碼」揭露完整殼。  
7. **原生 dialog 禁止** — 確認／輸入一律頁內 UI（repo 硬規則）。

### 載體（與 SvelteKit）

| 偏好 | 說明 |
| --- | --- |
| **主 UX 在 PWA／殼** | Svelte 面：獨立 route 或與「玩玩看」同一瀏覽流 |
| **不綁 Astro** | 見 DEC-048／[PG-SVELTEKIT-PLAN.md](./PG-SVELTEKIT-PLAN.md) |
| **薄深鏈** | `/sam/` 可 prerender shell＋meta；互動在 client |

殼內已有 picks「玩玩看」與「看全部小品」——目標是**收成同一流**，避免「推薦在殼、全庫在另一站」。

---

## 資訊架構

```text
/sam/ （或殼 catalog panel）
  ├─ 精選貨架 ← picks.yaml（顯示順序）
  ├─ 搜尋框 + kind／series filters
  └─ 結果列表（compact；可切 density）
       └─ 一鍵開 → 本場 open 管線（DEC-025）
```

系列仍是策展軸（`series.yaml`），但是「逛」的輔助，不是唯一導覽。

**實作：** `src/components/sam-catalog/SamCatalogBrowser.svelte`（頁＋殼共用）；查詢 helpers 在 `samCatalog.ts`（`filterCatalogEntries`／`parseCatalogUrlSearch`）。

---

## 階段

| Phase | 內容 | 完成定義 | 狀態 |
| --- | --- | --- | --- |
| **0. 契約** | 本計劃；與 CATALOG／QUERY／SVELTEKIT 交叉引用 | 定位／非目標無歧義 | **完成** |
| **1. 載體** | `/sam/` 落在 Kit route 或殼內面（對等功能可先） | 不再依賴 Astro 大頁為唯一實作 | **完成**（Kit `src/routes/sam/`） |
| **2. 找得到** | 搜尋＋kind／series filter；URL query 可還原 | 60+ 筆可鍵入命中；分享 `?q=` 可用 | **完成** |
| **3. 雙速＋密度** | picks 貨架＋compact 預設；CTA 常駐 | 首屏非長文；觸控可一鍵開 | **完成** |
| **4. 殼合流** | 「玩玩看」↔ 全庫同一元件／狀態；減少整頁跳出 | 空場／工具列進型錄不丟殼情境（合理範圍內） | **完成**（殼內 catalog dialog） |
| **5. 打磨** | 鍵盤、a11y、空結果、footnote／投稿鏈 | 基本無障礙與行動可用 | **完成** |

---

## 資料／API（不變）

- 權威：`catalog/entries/`、`series.yaml`、`picks.yaml`、`page.yaml`
- 消費：`samCatalog.ts`／捆進資料；可選讀 `/catalog/v1.json`
- **不**為人機面另開 CMS 或第二權威

`page.yaml` 文案可縮短 lede；結構欄位可保留供 footnote／title／description。

可分享 query：`?q=`、`?kind=`（逗號多選）、`?series=`（逗號多選）。舊 `#tool`／`#series-…` hash 進頁時會還原為 filter。

---

## 修訂紀錄

| 日期 | 變更 |
| --- | --- |
| 2026-08-06 | 初稿：脫部落格 layout；PWA／殼載體；搜尋／密度／picks；與 SvelteKit 計劃分冊 |
| 2026-08-06 | Phase 2–5 落地：`SamCatalogBrowser`、URL filter、殼內 dialog、compact CTA |
| 2026-08-06 | 分享：Web Share API（支援時）＋剪貼簿 fallback；列／篩選／殼開啟連結 |
| 2026-08-06 | 列「分享」開啟連結加 `view=canvas`（接收者畫布最大化）；「一鍵開」維持預設殼面 |
| 2026-08-06 | 試玩 session：`view=canvas` 進場後畫布可常駐最大化；頂列「換一個／型錄／看原始碼」；型錄 dialog 與隨機換片不 `restorePreview`；唯「看原始碼」揭露工作區 |
