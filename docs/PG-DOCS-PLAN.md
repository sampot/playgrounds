# Playgrounds 文件站計劃（DEC-043）

> **狀態：** Phase 0–5 主線完成（`docs.samkuo.me` 已上線）；部落格／遊樂場 UI「說明」鏈另令  


> **權威決策：** [DECISIONS.md](./DECISIONS.md) **DEC-043**（Starlight＠`docs.samkuo.me`）  
> **相關：** DEC-004（對外敘事）、DEC-012（agents 文件）、DEC-025（`?open=` 範例）、DEC-041／042（場網／保留名 `docs`）、[PG-STANDALONE-PLAN.md](./PG-STANDALONE-PLAN.md)、[playgrounds-host-api.md](./playgrounds-host-api.md)

一句話：**工程／用法文件權威站＝`https://docs.samkuo.me/`；技術＝Astro Starlight（靜態）；部署＝獨立 Cloudflare Worker；與場網同 repo、異 Worker；範例場仍用 `play.samkuo.me`。**

---

## 目標

- 給人與 Agent 一個可掃讀、可搜尋的 **Host／場網／用法** 文件面，不必翻整份 markdown 快照或部落格文章。
- 文件與開源宿主 [`sampot/playgrounds`](https://github.com/sampot/playgrounds) **同 PR 可更新**，避免「碼在 OSS、契約只在部落格」。
- 子網域 **`docs`** 已是場網保留名（DEC-042）：文件站正式佔用該名，**不當實驗場**、不跑遊樂場殼／SW／OPFS。
- 讀者可見敘事仍依 **DEC-004**（非產品／品牌／行銷腔）；工程頁可用實作用語。

## 非目標

- 把部落格文章、`/sam/` 型錄、CONTENT-PLAN 搬進文件站。
- 帳號、留言、後端搜尋、CMS、多租戶「產品文件中心」。
- 文件站離線 PWA／註冊 Service Worker（場網 SW 職責不變）。
- 把 Starlight 嵌進場殼 Astro app（同 `astro.config`／同 `dist`）。
- 為每個計劃草稿（未落地 Phase 規格）建完整公開站——公開以**已 Accepted DEC＋已落地 API**為準。
- 完整多語 i18n（可先中文為主；Starlight UI 字串對齊即可）。
- 改場網保留表拿掉 `docs`，或讓場網 Worker 的 ASSETS 直接服務文件 HTML。

---

## 權威 URL

| 用途 | URL |
| --- | --- |
| 文件站（本計劃） | `https://docs.samkuo.me/` |
| 預設場（範例／遷移／深鏈預設） | `https://play.samkuo.me/` |
| 預設一鍵開啟範例 | `https://play.samkuo.me/?open=<…>`（DEC-025） |
| 開源碼 | [`sampot/playgrounds`](https://github.com/sampot/playgrounds) |
| 部落格／過程分享 | `https://samkuo.me/`（文章權威；非 Host API 契約權威） |
| 凍結舊場 | `https://samkuo.me/playgrounds/` |

**分工：**

| 面 | 職責 |
| --- | --- |
| `docs.samkuo.me` | 用法指南、概念、Host API、DEC／GLOSSARY 的**可讀呈現** |
| `play`／場網 | 執行面（遊樂場） |
| `samkuo.me` | 個人敘事、型錄、舊場凍結快照 |
| repo `docs/` | 工程契約來源（計劃／ADR 原文）；與 Starlight 內容須有單一更新路徑（見下方「內容來源」） |

---

## 技術選擇

| 項 | 選擇 | 理由 |
| --- | --- | --- |
| 框架 | **Astro + [@astrojs/starlight](https://starlight.astro.build/)** | 文件側欄／搜尋（Pagefind）／MDX 成熟；與宿主同 Astro 生態 |
| 產出 | **靜態 SSG** | 無需 SSR；**不**強制 `@astrojs/cloudflare` adapter |
| 部署 | **獨立 Worker**＋Static Assets；Custom Domain＝`docs.samkuo.me` | 與場網 SPA／`run_worker_first`／保留名邏輯解耦 |
| 404 | 靜態 404；**禁止** `single-page-application` fallback | 避免未知路徑落到文件首頁 |
| 套件位置 | repo 內 **`docs-site/`**（獨立 `package.json`／`astro.config`／`wrangler.jsonc`） | 勿與場殼 Svelte／SW 建置混綁 |
| 搜尋 | Starlight 內建 Pagefind | 無後端 |
| 語系 | 預設中文（`zh-TW` 或 Starlight 支援之對等 locale）；API 識別名保留英文 | 對齊 GLOSSARY；UI chrome 譯成中文避免半套 |

**否決：**

- 場網同一 Worker 依 `Host` 切 ASSETS 當主路徑（耦合高、404／SPA 策略衝突）。
- 另開完全獨立 GitHub repo 當唯一來源（易與 host-api 漂移；若日後要拆，再立修訂）。
- Docusaurus／VitePress 等異棧（無必要增加工具鏈）。

---

## 目錄與指令（目標形）

```
playgrounds/
├── docs/                      # 工程契約原文（DECISIONS、計劃、host-api 快照…）
├── docs-site/                 # Starlight 應用（新建）
│   ├── package.json
│   ├── astro.config.ts        # site: https://docs.samkuo.me；integrations: [starlight(...)]
│   ├── wrangler.jsonc         # name: playgrounds-docs；routes: docs.samkuo.me custom_domain
│   └── src/content/docs/      # 站上頁面（MD／MDX）
├── wrangler.jsonc             # 場網 playgrounds（既有）
└── package.json               # 可加 docs:dev／docs:deploy 轉呼
```

建議腳本（根或 `docs-site`）：

| 腳本 | 行為 |
| --- | --- |
| `docs:dev` | `docs-site` 本地 Starlight（port 與場殼 `astro dev` 錯開） |
| `docs:build` | `astro check`（若啟用）＋ `astro build` |
| `docs:deploy` | build＋`wrangler deploy -c docs-site/wrangler.jsonc`（或於子目錄 deploy） |

CI：path filter——僅 `docs-site/**`（及約定之內容來源路徑）變更時部署文件 Worker；場殼 deploy 不重部 docs。

---

## 資訊架構（sidebar）

公開主線（Starlight sidebar）：

```
/                         入口：這是什麼 → 去 play／GitHub／（可選）部落格
/guides/                  人向用法
  opening-a-field         場網與 play／自開 <name>
  sandboxes-and-sam       沙盒、.sam 匯出匯入、舊場遷移
  open-from-url           ?open=（範例絕對 URL＝play）
  secret-store            密鑰庫概念（細節仍以 DEC-029／計劃為準）
/concepts/                SAM、畫布、總管、場／origin、防護邊界（DEC-040 摘要）
/host-api/                現行 Agent／HOST（自 playgrounds-host-api 拆頁）
/decisions/               Accepted DEC 索引與正文（可掃讀）
/glossary/                用語對照
```

**公開優先級：** 已落地行為與 Accepted DEC ＞ 長篇 Phase 計劃。  
未落地規格／WIP 計劃：留在 repo `docs/*-PLAN.md`，站上最多「工程／archive」鏈到 GitHub，**不**進預設 sidebar 主線。

範例與深鏈：**一律** `https://play.samkuo.me/…`（DEC-042）；說明場內複製連結用 `location.origin`。

---

## 內容來源（單一更新路徑）

契約不可有三份互相漂移的正文。採用：

1. **ADR／計劃原文**繼續以 repo **`docs/*.md`** 為編輯權威（agents／PR 習慣不變，對齊 DEC-012）。
2. **Starlight 頁**為讀者呈現層：可（a）MDX 撰寫導覽＋摘錄並鏈回 `docs/` 或 GitHub blob；（b）建置步驟自 `docs/` 產生部分頁（若引入，須寫進本計劃修訂，避免手維雙份）。
3. **Host API：** 短期允許 `docs/playgrounds-host-api.md` 與 `docs-site/.../host-api/` 並存，但 PR 改 API 時**同變更**更新站頁（或改為生成）。斷鏈的未進 OSS 計劃：公開頁刪除或改「見上游／未收錄」，勿留 404。

`playgrounds-host-api.md` 現況鏈到多份未進本 repo 的計劃——Phase 3 前須清點。

---

## 場網接縫（硬約束）

1. **`docs` 維持** `PLAYGROUNDS_FIELD_RESERVED_SUBDOMAINS`／Worker `RESERVED`——**永不**當場殼。
2. 文件由 **`playgrounds-docs`（名稱可調）Worker** 的 Custom Domain 服務；與場網 `playgrounds` Worker 分離。
3. 若請求誤進場網 Worker 且 host＝`docs.samkuo.me`：現行 302→`https://samkuo.me/`；文件站上線後宜改 **302→`https://docs.samkuo.me/`**（僅此誤路由後備；正常流量應打中 docs Custom Domain）。
4. Wildcard Route `*.samkuo.me/*` 上線後，保留名檢查仍必須先於 ASSETS（既有 `run_worker_first`）。
5. 宿主 UI／README／部落格可鏈 docs；**勿**做成產品 Help Center 文案。

---

## 敘事（DEC-004）

- 可寫：文件在 `docs.samkuo.me`、場在 `play.samkuo.me`、程式開源、可自架。
- **勿**賣點清單、版本發佈流水帳腔、多租戶／「平台」行銷語。
- Starlight 預設主題可輕改；勿做成行銷 landing（首屏＝標題＋一句話＋去場／GitHub，其餘進側欄）。
- **站台身分：** 標題／Logo 對齊「我是山姆鍋」（山姆鍋標誌）；對外稱「遊樂場文件」。Playgrounds 僅程式／repo 識別，勿當品牌名呈現。

---

## 階段

| Phase | 內容 | 完成定義 | 狀態 |
| --- | --- | --- | --- |
| **0. 契約** | DEC-043、本計劃；GLOSSARY／AGENTS 點到 `docs.samkuo.me` | 文件站與場網邊界無歧義 | **已完成** |
| **1. Scaffold＋部署** | `docs-site/` Starlight；`wrangler`；Custom Domain `docs.samkuo.me`；靜態 404 | HTTPS 可開、非場殼、標題可見 | **已完成** |
| **2. 指南＋用語** | guides（場網／`.sam`／`?open=`）＋ glossary；入口鏈 play／GitHub | 新人能從 docs 進預設場 | **已完成** |
| **3. Host API** | `host-api/` 分頁；清斷鏈；與 `capabilities`／已落地對齊 | Agent／人可對照；無假方法 | **摘要完成**（全文仍鏈 repo） |
| **4. DEC 呈現** | decisions 索引＋正文可讀；與 `docs/DECISIONS.md` 更新約定 | PR 改 DEC 有站上反映路徑 | **索引完成**（全文鏈 GitHub） |
| **5. 接線** | README、AGENTS、部落格／可選遊樂場「說明」鏈；場網誤打 `docs` 的 302 目標；CI path filter | 對外入口一致 | **部分**（README／AGENTS／CI／302／已部署；部落格／UI 鏈另令） |

---

## 完成檢查（整體）

- [x] `https://docs.samkuo.me/` 由 Starlight 靜態站回應（獨立 Worker `playgrounds-docs`）
- [x] `docs` 子域**不會**載入遊樂場殼／註冊場網 SW（保留名＋獨立 Worker；誤進場網 → 302 docs）
- [x] 範例深鏈指向 `play.samkuo.me`
- [x] 側欄有指南、Host API、DEC／GLOSSARY（或等價可達）
- [x] README 鏈至文件站（部落格另令）
- [x] 公開 Host API 頁無「鏈到不存在計劃」的死鏈（摘要＋鏈 repo 全文）
- [x] DEC-004：讀者向文案非產品腔

---

## 修訂紀錄

| 日期 | 變更 |
| --- | --- |
| 2026-08-05 | 初版：Starlight、`docs.samkuo.me`、獨立 Worker、`docs-site/`、IA 與 Phase 0–5 |
| 2026-08-05 | 實作：`docs-site` Starlight 內容、wrangler、根腳本、`deploy-docs.yml`、場網 `docs`→302 |
