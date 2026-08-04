# 我是山姆鍋 — 架構與工程決策

> **最後更新：** 2026-08-05（DEC-040：Playgrounds 防護邊界與整場重置）  
> **對象：** 作者、AI agents；必要時給之後的自己讀

本文件以輕量 **ADR**（Architecture Decision Record）記錄本站**顯著且耐久**的架構／工程選擇：選了什麼、為何不選其他、後續工作不可踩破的後果。細節規格仍以 [AGENTS.md](./AGENTS.md)、[TOOLS-PLAN.md](./TOOLS-PLAN.md) 等為準；此檔是可掃讀的決策索引，避免只活在 PR 與聊天裡。

---

## 1. 怎麼用

### 何時新增／更新

新增或改寫一筆當：

- 在兩個可行架構／工程方向之間做了選擇；
- **明確否決**某作法，且日後很可能再被提出；
- 實作中發現應對後續任務有約束力的限制。

**不要**把完整規格或寫作慣例整份貼進來——連到 `AGENTS.md`、`TOOLS-PLAN.md` 等即可。

### 記錄格式

| 欄位 | 意義 |
| --- | --- |
| **Status** | `Accepted` · `Superseded` · `Proposed` · `Rejected` |
| **Context** | 為什麼必須選 |
| **Decision** | 選了什麼 |
| **Consequences** | 取捨、後續、agents 不可破壞的約束 |

### 決策變更時

1. 更新該筆（可加 **Revision** 註記日期與原因）。
2. 同步改權威文件（`AGENTS.md`、`TOOLS-PLAN.md`、程式設定）於同一變更。
3. 若被新決策取代，舊筆標 `Superseded` 並連到新 ID。

---

## 2. 決策索引

| ID | 標題 | Status |
| --- | --- | --- |
| [DEC-001](#dec-001-靜態站-astro--cloudflare-pages) | 靜態站：Astro + Cloudflare Pages | Accepted |
| [DEC-002](#dec-002-樣式-tailwind-css) | 樣式：Tailwind CSS | Accepted |
| [DEC-003](#dec-003-內容-markdown--content-collections) | 內容：Markdown + Content Collections | Accepted |
| [DEC-004](#dec-004-站台語系與品牌邊界) | 站台語系與品牌／產品邊界 | Accepted |
| [DEC-005](#dec-005-互動-ui-用-svelte-islands) | 互動 UI 用 Svelte islands（不用 React） | Accepted |
| [DEC-006](#dec-006-og-圖-satori--satori-html) | OG 圖：Satori + satori-html | Accepted |
| [DEC-007](#dec-007-留言系統-giscus) | 留言系統：Giscus | Accepted |
| [DEC-008](#dec-008-站上小工具箱定位與技術邊界) | 站上小工具箱定位與技術邊界 | Accepted |
| [DEC-009](#dec-009-工具離線快取-service-worker-runtime-cache) | 單一 SW：Playgrounds 離線 + 畫布虛擬站台 | Accepted |
| [DEC-010](#dec-010-工具邏輯測試與-pre-commit) | 工具邏輯測試與 pre-commit | Accepted |
| [DEC-011](#dec-011-sitemap--robots-薄頁策略) | Sitemap／robots 薄頁策略 | Accepted |
| [DEC-012](#dec-012-agents-文件集中於-docs) | Agents 文件集中於 `docs/` | Accepted |
| [DEC-013](#dec-013-commit-訊息採-conventional-commits) | Commit 訊息採 Conventional Commits + commitlint | Accepted |
| [DEC-014](#dec-014-文章程式碼區塊一鍵複製) | 文章程式碼區塊一鍵複製 | Accepted |
| [DEC-015](#dec-015-瀏覽器-python-工具-pyodide--cdn) | 瀏覽器 Python 工具：Pyodide + CDN | Accepted |
| [DEC-016](#dec-016-playgrounds-瀏覽器遊樂場與-opfs) | Playgrounds：瀏覽器遊樂場與 OPFS | Accepted |
| [DEC-017](#dec-017-playgrounds-agent) | Playgrounds agent | Accepted |
| [DEC-018](#dec-018-playgrounds-host-api-v1與-durable-kv) | Playgrounds Host API v1 與 Durable KV | Accepted |
| [DEC-019](#dec-019-playgrounds-agent-增值能力與-v86-邊界) | Playgrounds agent 增值能力與 v86 邊界 | Accepted |
| [DEC-020](#dec-020-playgrounds-模擬-d1與-secrets) | Playgrounds 仿 D1 與 Secrets | Accepted |
| [DEC-021](#dec-021-playgrounds-wasi-shell與-runcmd) | Playgrounds WASI Shell 與 `runCmd` | Accepted |
| [DEC-022](#dec-022-playgrounds-擴展工具tool-sam與個人工具箱) | Playgrounds 擴展工具（Tool SAM）與個人工具箱 | Accepted |
| [DEC-023](#dec-023-playgrounds-多-agent-session) | Playgrounds 多 Agent session | Accepted |
| [DEC-024](#dec-024-sam-三層模型與-headless-runtime) | SAM 三層模型與 headless runtime | Accepted |
| [DEC-025](#dec-025-playgrounds-一鍵開啟open-from-url) | Playgrounds 一鍵開啟（open-from-URL） | Accepted |
| [DEC-026](#dec-026-playgrounds-agent-context-hygiene) | Playgrounds Agent context hygiene（非 Embedding RAG） | Accepted |
| [DEC-027](#dec-027-playgrounds-大-sam-檔案導航與語言邊界) | Playgrounds 大 SAM 檔案導航與語言邊界 | Accepted |
| [DEC-028](#dec-028-playgrounds-沙盒實例工作集與管理面) | Playgrounds 沙盒實例工作集與管理面 | Accepted |
| [DEC-029](#dec-029-playgrounds-secretstore與-binding) | Playgrounds SecretStore 與 binding | Accepted |
| [DEC-030](#dec-030-playgrounds-main-content-tabs掛載tool) | Playgrounds main content tabs（掛載≠Tool） | Accepted |
| [DEC-031](#dec-031-playgrounds-agent-model) | Playgrounds Agent Model（mailbox／單權威） | Accepted |
| [DEC-032](#dec-032-playgrounds-agent-艦隊觀測-ux) | Playgrounds Agent 艦隊觀測 UX | Accepted |
| [DEC-033](#dec-033-playgrounds-coding-orchestration-session-protocol) | Playgrounds coding orchestration session protocol | Accepted |
| [DEC-034](#dec-034-playgrounds-workflow-定義與實例模型) | Playgrounds workflow 定義與實例模型 | Accepted |
| [DEC-035](#dec-035-playgrounds-sam-執行期參數與-env-命名空間) | Playgrounds SAM 執行期參數與 env 命名空間 | Accepted |
| [DEC-036](#dec-036-playgrounds-sam-環境資源綁定與準入) | Playgrounds SAM 環境資源綁定與準入 | Accepted |
| [DEC-037](#dec-037-playgrounds-委派授權delegate-grant) | Playgrounds 委派授權（Delegate Grant） | Accepted |
| [DEC-038](#dec-038-playgrounds-backend-runtime-worker) | Playgrounds Backend Runtime Worker（後端離 UI 主線程） | Accepted |
| [DEC-039](#dec-039-playgrounds-wasi-cli-opfs-fd-直連) | Playgrounds WASI CLI × OPFS fd 直連（大檔） | Accepted |
| [DEC-040](#dec-040-playgrounds-防護邊界與場內沙盒語意整場重置) | Playgrounds 防護邊界與場內沙盒語意；整場重置 | Accepted |
| [DEC-041](#dec-041-playgrounds-獨立子網域與開源抽取) | Playgrounds 獨立子網域與開源抽取 | Accepted |

---

## 3. 決策紀錄

### DEC-001: 靜態站 Astro + Cloudflare Pages

- **Status:** Accepted
- **Context:** 個人部落格需要低維護成本、可離線寫稿（Markdown）、部署簡單。歷史上曾用 Hexo；2024 起遷至 Astro（基於 AstroPaper），2026 升至 Astro 7。
- **Decision:** 以 **Astro** 做靜態站產生器；以 **Cloudflare Pages** 部署；CI／CD 走 GitHub Actions（`.github/workflows/deploy.yml`）。不為本站引入應用伺服器或帳號系統。
- **Consequences:**
  - 新功能優先可靜態產出或純前端；需後端的能力預設不做。
  - 建置指令以 `npm run build`（含 `astro check`）為準。
  - 升級路徑與踩坑見站內文《把部落格一次升到 Astro 7 與 Tailwind 4》。

### DEC-002: 樣式 Tailwind CSS

- **Status:** Accepted
- **Context:** AstroPaper 生態與站台既有 utility-first 寫法；需長期可維護的主題 token（含 ink-teal 品牌色）。
- **Decision:** 使用 **Tailwind CSS**（現行 v4，Vite 外掛 + CSS `@theme`）。不另引入大型 UI kit 作為預設（曾拿掉 Flowbite）。
- **Consequences:**
  - 元件樣式優先對齊既有 token／utility；勿為單一頁面另起一套設計系統。
  - Astro scoped style 若用 `@apply`，需依 Tailwind v4 補 `@reference`。

### DEC-003: 內容 Markdown + Content Collections

- **Status:** Accepted
- **Context:** 文章是本站主產物；需 schema 把關 frontmatter，並支援必要時的 MDX／數學／Mermaid 等。
- **Decision:** 文章放 `src/content/blog/`，以 Markdown 為主（必要時 MDX）；schema 在 `src/content.config.ts`（Content Layer／glob loader）。URL 慣例 `/post/{YYYY}/{MM}/{slug}/`。
- **Consequences:**
  - Frontmatter、草稿、`avatarLines` 等規則以 [AGENTS.md](./AGENTS.md) 為準。
  - 不要為了方便繞過 content collection 另闢平行內容源。

### DEC-004: 站台語系與品牌／產品邊界

- **Status:** Accepted（**Revision** 2026-08-01：內容主軸改為分享 Playgrounds／單頁小程式；**2026-08-04 再修：** 對外勿將遊樂場／本站寫成產品或品牌）
- **Context:** 本站是個人部落格「我是山姆鍋」，不是 NT² 產品站；作者同時在開發 NT² Vault，內容邊界易被寫糊。遊樂場（Playgrounds）是站上可手玩的主軸場地，發文宜對齊分享 SAM，而非以 NT² 系列為預設主軸。另：工程上遊樂場雖像可交付物，若對外用「產品／品牌／行銷」語彙，會把個人分享站寫成產品站——與站台身分衝突。
- **Decision:**
  - 站台語系 **繁體中文（zh-TW）**；用語對齊 [GLOSSARY.md](./GLOSSARY.md)。
  - **內容主軸**：分享 **Playgrounds（遊樂場）**、其中的**沙盒**與**單頁小程式（SAM）**（過程文／用例／連到正式場）；軟體開發等其他主題可寫，新文優先對齊遊樂場／SAM。用語見 [GLOSSARY.md](./GLOSSARY.md)（場地名＝遊樂場；單位＝沙盒）。
  - **遊樂場／本站對外敘事：** **不要**把 Playgrounds／遊樂場或本站描述成**產品**，也**不要**用**品牌**、**行銷**、賣點、發佈流水帳那類用語寫讀者可見正文、UI 文案或介紹。本站＝山姆鍋個人分享用的部落格；遊樂場＝可玩的場地（可開源、可掛子網域，敘事仍非產品站）。內部 Agents／工程 DEC 可用實作用語；讀者面禁止產品／品牌／行銷腔。
  - **不**把本站寫成 NT² 產品站分身；偶發的 NT²／一人開發文只寫過程經驗，產品教學／changelog／選型辯護留給 `nt2.me`／`blog.nt2.me`。
  - **既有 NT² 連結不動**：首頁、About、AuthorCard、已發文章等處連到 `nt2.me`／產品名的連結維持；勿為主軸轉移而撤掉或改寫成遊樂場。
- **Consequences:**
  - Agents 寫文前讀 `AGENTS.md`「專案身分」「作者正在開發的產品」與 [CONTENT-PLAN.md](./CONTENT-PLAN.md)（優先遊樂場／SAM 題）；寫遊樂場文時對齊「寫作語氣」第 10 點。
  - NT² 產品規格以 `~/dev/nt2` 文件為準，勿臆造；勿把內部路徑當讀者可點連結。（「產品」一詞僅用於 NT² 等真正產品語境，勿套在遊樂場／本站對外敘事。）
  - 遊樂場能力敘事以 DEC-016～041 與 PG-*-PLAN 為準，勿承諾未落地功能。
- **Revision（2026-08-04）：** 明訂對外勿以產品／品牌／行銷描述遊樂場或本站；內容主軸用語由「推廣」改「分享」。
- **Revision（2026-08-05）：** 正式場改子網域／可開源（DEC-041）；對外敘事仍非產品站。

### DEC-005: 互動 UI 用 Svelte islands（不用 React）

- **Status:** Accepted（2026-07-25；取代先前 React islands）
- **Context:** 站上僅少數互動面（搜尋、日期、文章摘要、小工具 UI）。Astro 支援多框架 islands；同時維護 React 與作者其他專案（Svelte）的心智與依賴成本偏高。OG 產生若綁 React JSX，也會把 React 鎖進建置鏈。
- **Decision:** 客戶端互動元件使用 **Svelte 5**（`@astrojs/svelte`）。**不再**依賴 React／`@astrojs/react`。新 island 預設寫 `.svelte`。
- **Consequences:**
  - `src/components/` 互動件為 Astro／Svelte；工具 UI 見 `components/tools/*.svelte`。
  - 不要為了「比較熟 React」再加回 React 依賴，除非本決策被正式 supersede。
  - 與作者其他 Svelte 專案技能可複用；bundle 與依賴面更薄。

### DEC-006: OG 圖 Satori + satori-html

- **Status:** Accepted（隨 DEC-005 調整實作）
- **Context:** 多數文章省略手製 `ogImage`，建置時依標題產生社群預覽圖；過去模板用 React JSX 餵 Satori。
- **Decision:** 建置時 OG 仍用 **Satori** + **@resvg/resvg-js**；模板改以 **satori-html** 產出（`src/utils/og-templates/*.ts`），不需 React。
- **Consequences:**
  - OG 模板保持標題優先、對齊 ink-teal 品牌；改色改版面走共用模組。
  - 勿為 OG 再引入 JSX runtime。

### DEC-007: 留言系統 Giscus

- **Status:** Accepted（取代 Disqus）
- **Context:** Disqus 與站台 `data-theme` 明暗切換長期對不齊；iframe／CDN 快取使維護成本不成比例。
- **Decision:** 留言改用 **Giscus**（GitHub Discussions）。討論存放在公開儲存庫 [`myblog-comments`](https://github.com/sampot/myblog-comments)（本站原始碼儲存庫為 private）。主題可經 `postMessage` 與站台同步。
- **Consequences:**
  - 讀者需 GitHub 帳號才能留言——對技術向個人站可接受。
  - 勿擅自換回 Disqus 或另加追蹤型留言／分析腳本當預設。
  - 緣起見《留言系統從 Disqus 換成 Giscus》。

### DEC-008: 站上小工具箱定位與技術邊界

- **Status:** Accepted（**Revision** 2026-08-01：擴張凍結，個人工具改走 Playgrounds／DEC-022）
- **Context:** 站台除文章外要提供有用的開發小工具，但不能變成 SEO 薄頁超市或需後端的 SaaS。
- **Decision:** 導覽「工具」與「文章」並列；路徑 `/tools/`、`/tools/{slug}/`。原則：**獨立頁、純前端、可離線、資料不離開瀏覽器、少而穩、每個正式工具搭配介紹文**。工具頁 `noindex` 且不進 XML sitemap。細節與候選表見 [TOOLS-PLAN.md](./TOOLS-PLAN.md)。**自 2026-08-01：站上 `/tools/` 凍結新增**；可累積的個人工具以 Playgrounds 擴展工具為主（[DEC-022](#dec-022-playgrounds-擴展工具tool-sam與個人工具箱)）。既有工具頁不因凍結而自動下架。
- **Consequences:**
  - **不要**為小工具引入本站 API、帳號或後端。
  - **Playgrounds**（`/playgrounds/`）是瀏覽器遊樂場（見 DEC-016），**不是**站上 `/tools/` 登錄表；個人工具箱語意見 DEC-022。
  - 凍結期間**勿**再往 TOOLS-PLAN 堆新候選，除非作者明示；正式撤導覽／拆頁另修本決策。

### DEC-009: 工具離線 Service Worker runtime cache

- **Status:** Accepted（方案 A；**2026-08-01 修訂：單一 SW**；離線範圍改為僅 Playgrounds）
- **Context:** 全站 precache 文章成本高且非目標；雙 SW（離線遊樂場 + 畫布）曾造成 scope 搶控制、離線重整失敗。`/tools/` 已凍結擴張，離線優先保證遊樂場。
- **Decision:** **單一** Service Worker：`public/sw.js`，scope `/`（註冊 `updateViaCache: "none"`）。職責：**(1)** Playgrounds 畫布虛擬站台（`/playgrounds/canvas/**` 記憶體 snapshot／`/api` 轉發，見 DEC-016）；**(2)** runtime offline cache **僅**曾造訪的 `/playgrounds/**`（**不含** canvas 虛擬路徑）與遊樂場載入的 `/_astro/*` 等；**(3)** 其他路徑 navigation 失敗 → precache 的 `/offline/`（含站台 Header）。**不**再為 `/tools/**` 做 document cache。不快取全站文章；無 build-time precache manifest。**線上更新優先（無 cache-first）：** 所有會進 Cache API 的路徑皆為 **network-first**（含 `/_astro/*`），且 `fetch(..., { cache: "no-cache" })`；僅網路失敗才回 Cache。策略選擇見 `src/utils/swOfflineStrategy.ts`（須與 `public/sw.js` 同步）。SW 腳本本身不快取。**Vite 開發路徑**（`/@vite/`、`/@id/`、`/node_modules/`、`/@fs/`、`/src/`、`/.vite/`）一律不攔截、不快取，避免 `astro dev` 與 dep optimizer 衝突（`504 Outdated Optimize Dep`）。**不**再以 hostname（localhost）關閉整段 offline cache——`npm run build && npm run preview` 可在 localhost 測離線。`astro dev` 下遊樂場 HTML 可能被 cache，但 Vite 模組不會，故 dev 離線不完整屬預期。啟動時 unregister 舊 `sw-canvas.js` registrations。
- **Consequences:**
  - 對外敘事：遊樂場「造訪過才能離線」；工具頁離線只見 `/offline/`。
  - 勿默默改成全站 precache 或另開需後端的離線方案，除非更新本決策。
  - 勿對 `/playgrounds/canvas/**` 做 Cache API 快取（虛擬站台只走記憶體 snapshot）。
  - **勿**再引入 cache-first（含 hashed `/_astro`）；變更策略時 bump `CACHE_NAME`（`samkuo-offline-v*`）並更新 `swOfflineStrategy` 測試。
  - **勿**對 Vite 開發路徑做 Cache API 快取；擴充 `isDevOnlyPath` 時同步 `sw.js`／`register-sw.js`／`swOfflineStrategy`。
  - 畫布協定變更時同步 `public/sw.js` 與 `canvasSwProtocol.ts`；勿再新增第二個 SW registration。
  - 本機離線驗證：`npm run build && npm run preview` → **線上**造訪 `/playgrounds/` 並等 SW 控制／warm（可看 Application → Cache `samkuo-offline-v*` 是否有 `/_astro/*`）→ 再 Offline → 重整。遊樂場 HTML 會解析並 precache `/_astro`；Cache key 忽略 `?astro-retry=`／`?v=`。

### DEC-010: 工具邏輯測試與 pre-commit

- **Status:** Accepted（**Revision** 2026-07-31：pre-commit 加 `astro check`）
- **Context:** 工具核心是純函式邏輯，適合單元測試；部署 CI 分鐘數需節省。型別錯誤若只在部署的 `npm run build`（內含 `astro check`）才爆，本機易漏接。
- **Decision:**
  - 工具核心邏輯以 **Vitest**（`src/**/*.test.ts`）測試；**husky pre-commit** 跑 `npm test` **與** `npm run check`（＝`astro check`，與 `build`／部署相同）。
  - 部署 CI **不**另跑測試（與 TOOLS-PLAN 一致）；型別檢查仍經 `npm run build` → `check`。
  - 本機 Node 對齊 CI：**24+**（`.nvmrc`／`engines`）。
- **Consequences:**
  - 新增／改工具必須同步測試；邏輯與 UI 分離（例如 `baseEncoding.ts` vs `*.svelte`）。
  - 一般文章／版面改動不强制擴張測試範圍；但任何會讓 `astro check` 失敗的型別問題會在 commit 前被擋下。
  - 勿用 `--no-verify` 繞過，除非作者明確指示。

### DEC-011: Sitemap／robots 薄頁策略

- **Status:** Accepted
- **Context:** 搜尋引擎應優先索引文章；工具、搜尋、playground、離線頁等為薄頁或工具面。
- **Decision:** `@astrojs/sitemap` **排除** `/tools/**`、`/playgrounds/**`、`/search/`、`/offline/`、`/sitemap/` 等；並避免 page-1 重複路徑進 sitemap。工具頁與 Playgrounds meta **`noindex`**（建議 `noindex, follow`）。介紹文依一般文章規則可索引。
- **Consequences:**
  - 新工具路徑必須納入 sitemap filter 與 noindex layout；`/playgrounds/` 同薄頁策略（見 DEC-016）。
  - 人讀 `/sitemap/` 可列工具／Playgrounds 連結——那是站內導覽，≠ XML sitemap。

### DEC-012: Agents 文件集中於 `docs/`

- **Status:** Accepted
- **Context:** 協作慣例、用語、排程、工具計劃需單一真相來源；根目錄只留入口。
- **Decision:** Agents 相關規範放在 **`docs/`**（`AGENTS.md`、`GLOSSARY.md`、`CONTENT-PLAN.md`、`TOOLS-PLAN.md`、本檔）。儲存庫根目錄 `AGENTS.md` 僅為指標表。
- **Consequences:**
  - 改慣例時改 `docs/` 主檔，並必要時更新根目錄指標列。
  - 決策類變更寫入本檔；寫作語氣與目錄慣例仍以 `docs/AGENTS.md` 為準。

### DEC-013: Commit 訊息採 Conventional Commits + commitlint

- **Status:** Accepted（2026-07-25；**Revision** 同日：加上 commitlint 強制檢查）
- **Context:** 專案已裝 Commitizen（`npm run cz`）與 `cz-conventional-changelog`，但近期手動／agent 提交常寫成一般英文句，格式不一、不利掃讀與日後 changelog。僅靠文件規範無法擋掉不合規訊息。
- **Decision:**
  - 所有 commit 訊息（含 AI agents 代寫）必須符合 **[Conventional Commits](https://www.conventionalcommits.org/)**：`<type>(optional-scope): <description>`。細節與常用 type 見 [AGENTS.md](./AGENTS.md)「程式碼變更慣例」。
  - 以 **commitlint**（`@commitlint/cli` + `@commitlint/config-conventional`）在 husky **`commit-msg`** hook 驗證；設定為 `commitlint.config.mjs`。
- **Consequences:**
  - Agents 建立 commit 時不得再用純敘述句當 subject（例如 `Add floating TOC`）；改為 `feat: add floating TOC` 這類格式。
  - 互動式提交可走 `npm run cz`；非互動（含 agent）仍須手寫符合規範的訊息，否則 hook 會拒絕提交。
  - 勿用 `--no-verify` 繞過，除非作者明確指示。

### DEC-014: 文章程式碼區塊一鍵複製

- **Status:** Accepted
- **Context:** 技術文常含指令／程式碼；讀者需方便剪貼。站台已用 Shiki 高亮，但沒有複製 UX。可選 Shiki transformer（建置時注入按鈕）或文章頁 client script。
- **Decision:** 在文章頁以輕量 client script（`CodeCopyButtons.astro`）只對 `#article pre.astro-code` 掛複製按鈕；樣式用元件內 `is:global`（避免寫進 `base.css` 後未進打包）。`astro:page-load` 相容 View Transitions。不另加第三方 copy 套件／Shiki transformer；也不手動重觸發 Mermaid（避免與 astro-mermaid 初始化競態）。
- **Consequences:**
  - 複製按鈕僅文章詳情頁、僅 Shiki 區塊；樣式在 `CodeCopyButtons.astro`，對齊 skin token。
  - 永不改 `pre.mermaid` DOM；行內 code 不做。
  - 勿為同一需求再引入大型依賴，除非此方案明顯不夠用。

### DEC-015: 瀏覽器 Python 工具（Pyodide + CDN）

- **Status:** Accepted（2026-07-31）
- **Context:** 站上文章常含 Python 片段，需要純前端沙盒方便驗證；舊站曾有類似能力未遷至 Astro。自托管 WASM 會脹建置產物；禁止套件則實用性不足；文章內嵌 REPL 會拖慢多數閱讀路徑。
- **Decision:**
  - 正式工具路徑 `/tools/python-runner/`；執行期用 **Pyodide**（版本釘在 `pythonRunnerShare.ts`），自 **jsDelivr CDN** 載入，**不**打進本站靜態產物。
  - **允許** micropip 安裝第三方套件；支援 `#s=`／`?code=` 等 deep-link 預填與分享。
  - 在 **Web Worker** 執行；中斷採終止並重建 Worker（不依賴 COOP／COEP／SharedArrayBuffer）。
  - **不做**文章內嵌自動可跑 code block、完整 Jupyter、本站後端執行。
- **Consequences:**
  - 介紹文／TOOLS-PLAN 須說清：程式碼不送本站，但首次載入與裝套件需連網（CDN／PyPI）；離線不保證。
  - 升級 Pyodide 須同步改釘版常數、介紹文與本決策註記。
  - 單元測試覆蓋分享／套件解析等純邏輯；不在 Vitest 內跑完整 Pyodide。
  - 細節見 [TOOLS-PLAN.md](./TOOLS-PLAN.md)「第二個工具：python-runner」。

### DEC-016: Playgrounds（瀏覽器遊樂場與 OPFS）

- **Status:** Accepted（2026-07-31；路徑自 `/ide/` 改為 `/playgrounds/`，並廢止舊 UI 測試頁；同日修訂：workspace 文字｜二進位；**不採**瀏覽器代抓 APKINDEX／`.apk`；同日再修：**畫布改 SW 虛擬靜態站**；產品定位為輕量 Web 實驗場；同日再修：**`functions.js` Workers 形 `/api/*`**；同日再修：**模擬 `env.KV`**；同日再修：**HOST.runPython／Pyodide Worker 例外**，見 DEC-019；**2026-07-31 再修：移除 v86／Alpine 虛擬機面板，改下方 Python REPL**；**2026-08-01 再修：專案單位正式名 SAM／單頁小程式；匯入／匯出沙盒包裹副檔名 `.sam`（只接受 `.sam`）**；**2026-08-02 再修：遊樂場對外中文名「遊樂場」；單位（舊稱專案）為「沙盒（sandbox）」**；**2026-08-05：權威部署改子網域見 [DEC-041](#dec-041-playgrounds-獨立子網域與開源抽取)**）
- **Context:** 需要在瀏覽器內**開發與實驗單頁小程式（SAM＝Single-page Application Module）**（多檔資產 + **單一 HTML 入口** + **畫布**即時渲染），並可選加 **edge／serverless functions** 輔助；與 `/tools/` 小工具箱分離。要精簡專業、非陽春片段板；沙盒需本機持久化、匯入／匯出，並可自 GitHub public repo 複製到本地。可選瀏覽器內 **Python REPL**（數據／公式；非 Linux shell）。其中一種 SAM 可以是 **Agent UI**（見 DEC-017）。遊樂場**不是**部署環境；驗證通過後可部署到 edge cloud（例如 Cloudflare Workers／Pages）。舊 `/playgrounds/` UI 元件測試頁已移除，路徑改由此遊樂場占用。
- **Decision:**
  - 路徑 **`/playgrounds/`**（非 `/tools/…`）；程式／文件識別名 **Playgrounds**；**對外中文名「遊樂場」**（導覽、頁面標題、UI）；其內單位為 **「沙盒（sandbox）」**（舊稱專案／project；程式識別可仍為 `projectId`）——每個沙盒是一個 SAM 的活動空間，僅經允許通道與環境及其他沙盒互動。實作目錄 **`src/components/playgrounds/`**（CSS／OPFS 前綴同名；舊 `ide`／`web-ide-projects`／`.ide-meta.json` 讀取時遷移）；主軸為 **輕量 Web**——每個沙盒是一個 **SAM（Single-page Application Module／單頁小程式）**：純靜態單頁，或靜態 + Workers 形 functions；邏輯上可多頁（客戶端路由），文件入口仍單一 HTML。**不**嵌 `/tools/python-runner/` UI；**允許**遊樂場隔離 **Web Worker + `HOST.runPython`（Pyodide，CDN＋釘版對齊 DEC-015）** 供 agent 做數據／公式驗證（套件釘允許清單；見 DEC-019／[PG-AGENT-PLAN.md](./PG-AGENT-PLAN.md) Phase 7）。同一 Worker 亦驅動下方人類 **Python REPL** 面板。
  - 編輯器使用 **CodeMirror 6**。**畫布**為同源 iframe（**不加** `sandbox` 屬性：瀏覽器對 `allow-scripts`+`allow-same-origin` 會警告且可視為逃出 sandbox；SW 又**必須**能控制該 iframe 才能攔截 `/playgrounds/canvas/…`）。以 URL **`/playgrounds/canvas/<projectId>/…`** 載入（像從網路下載，相對 ESM／CSS／圖／字型原生解析）。遊樂場將當前 OPFS 沙盒快照 **postMessage** 至站台單一 SW（`public/sw.js`，scope **`/`**；fetch 對 `/playgrounds/canvas/` 以記憶體 snapshot `respondWith`，並兼 Playgrounds 離線 cache，見 DEC-009）提供 `Response`；HTML 回應帶輕量 CSP（`base-uri`／`object-src`／`frame-ancestors`）。**不**再用 `srcdoc` + 模組改寫作為主路徑（舊 `composePreview` 僅 legacy／測試）。畫布入口固定為沙盒根目錄 **`index.html`**（不可改選其他檔）。**信任模型：** 本機個人／Agent 實驗場（非多租戶）；畫布與遊樂場同源，沙盒腳本可碰同 origin 儲存與 parent——可接受；勿在遊樂場放秘密。
  - **`/playgrounds/canvas/<projectId>/api/*`**：由遊樂場介面執行沙盒根目錄 **`functions.js`** 的 Workers 形 `export default { fetch(request, env, ctx) }`（只讀 OPFS 模組；相對 ESM 經 blob／import map）。畫布 HTML bridge 會把 `fetch("/api/…")` 改寫到沙盒 canvas 路徑下。`env` 預設注入模擬 **`KV`**（**Durable**：OPFS `playgrounds-kv/<projectId>/`，見 DEC-018；無 OPFS 時退回記憶體）；`ctx.waitUntil`／`passThroughOnException` 為 stub。無 `functions.js` 時回 **503**（`playgrounds_functions_unavailable`）。DB／R2／Secrets 等其餘 bindings 見 DEC-020。
  - 沙盒權威儲存為瀏覽器 **OPFS**；檔案內容可為 **UTF-8 文字或二進位**（圖檔、字型、`.apk` 等）；編輯器只開可判為文字者。支援**匯入／匯出沙盒**（**沙盒包裹**副檔名 **`.sam`**：ZIP 容器，僅便於辨識；binary 原樣；**只接受 `.sam` 匯入**）；可自 **GitHub public repo** 拉檔後寫入 OPFS（之後與遠端無關）。沙盒列表在選單／對話框，不常駐側欄。
  - 左側 **檔案側欄**為樹狀檔案總管（非扁平路徑列表）：支援目錄展開／空目錄（OPFS directory handle，**不**用 `.gitkeep` 佔位）、單檔與多檔自 OS 上傳、**一次性目錄上傳**（`<input webkitdirectory>`，含巢狀子目錄檔案；以 `webkitRelativePath` 還原結構；空資料夾通常不會出現在 FileList；側欄寫入目前目錄，**新沙盒對話框**可整夾建成新 OPFS 沙盒）、單檔下載、**多檔／資料夾下載預設打 ZIP**（與沙盒包裹分開）、以及使用者指定 **URL → OPFS**（瀏覽器直連 `fetch`，**僅 CORS 可用**；失敗時說明限制；**不**做站內通用 proxy／Pages Functions 代抓）。**不**用 File System Access API 做持久掛載。
  - 可選下方 **Python REPL** 與 **JavaScript REPL** 面板（人類用；xterm；懶載入）。Python 與 `HOST.runPython` 同 Worker；JS 為獨立隔離 Worker（`%run` 沙盒腳本；**無 npm**）。**不是** Linux shell；**已移除** v86／Alpine 虛擬機面板與映像資產。
  - **遊樂場介面偏好（Settings）：** `localStorage` 鍵 **`playgrounds-prefs-v1`**（與 layout／tool prefs／Agent BYOK 分開）。畫布 `console.*` 預設**不**鏡像到瀏覽器 DevTools：SW bridge（`canvasSwProtocol.ts`／`public/sw.js`）＋遊樂場權威 gate（`canvasConsoleGate.ts`，iframe load／src 後注入，抗 sticky 舊 worker）。隱藏 ESM host（`functions.js`／`controller.js`）走 `consoleMirrorBridge.ts`。使用者可在「選項 → 設定」開啟鏡像。
  - 頁面 **`noindex`**，XML sitemap **排除** `/playgrounds/**`；與工具箱登錄表／「一工具一介紹文」模型無關。現有 `/tools/*` 小工具頁不因 Playgrounds 改動或退場。
- **Consequences:**
  - 勿把 Playgrounds 塞進 `src/data/tools.ts` 或要求本站介紹文才能上線。
  - 不支援 OPFS 的瀏覽器須明確失敗，勿默默改用 localStorage 假裝同一套儲存。
  - 不支援 Service Worker 時畫布須明確失敗（不默默退回 `srcdoc`）。
  - 自 GitHub 複製需連網且受 API rate limit；介紹／UI 應說清。
  - Service Worker runtime cache 涵蓋 `/playgrounds/**` 遊樂場（**排除** `/playgrounds/canvas/**`）；沙盒內容在 OPFS，經同一 `/sw.js` 記憶體快照提供給畫布（見 DEC-009）。
  - Binary 沙盒／沙盒包裹會變大——靠 UI 上限與清理。
  - 用語對齊 [GLOSSARY.md](./GLOSSARY.md)：遊樂場 **遊樂場（Playgrounds）**；單位 **沙盒（sandbox）**（舊稱專案）；**SAM／單頁小程式**；匯入／匯出說「沙盒」，需區隔副檔名時說「沙盒包裹（`.sam`）」；勿與 AWS SAM 混淆。
  - 範圍仍不含通用雲端 IDE、真 Linux guest、或公開站上的通用套件代抓；**DB／Secrets** 見 DEC-020；變重前先更新本決策。
  - Playgrounds UI **禁止**使用瀏覽器內建 `alert`／`confirm`／`prompt`；確認與輸入一律用應用內 dialog。
  - 舊「UI 元件測試區」`/playgrounds/` 內容已刪除；勿再恢復為 alert 樣式測試頁。
  - 遊樂場介面偏好勿寫進沙盒包裹／OPFS 沙盒檔；預設保持瀏覽器 console 乾淨。
  - Agent（雙執行面、`env.HOST`、BYOK）見 [DEC-017](#dec-017-playgrounds-agent)。
  - Agent runtime 後續階段（HOST v1、觀察迴圈、Durable KV、session）見 [PG-AGENT-PLAN.md](./PG-AGENT-PLAN.md)；定案時另立／修訂 ADR。
  - **SAM 三層模型／Controller／headless** 見 [DEC-024](#dec-024-sam-三層模型與-headless-runtime)。
- **Revision（2026-08-05）：** 防護邊界與場內「沙盒」語意釐清、整場重置見 [DEC-040](#dec-040-playgrounds-防護邊界與場內沙盒語意整場重置)。

### DEC-017: Playgrounds agent

- **Status:** Accepted（2026-07-31；2026-08-01 釐清定位；**2026-08-01 修訂：** 任務 loop 歸 Controller，見 DEC-024；**2026-08-02 修訂：** 產品角色稱「管家（Steward）」；**同日再修：中文角色名改「總管」**（舊稱管家；對齊遊樂場隱喻）；**2026-08-02 再修：BYOK 金鑰改 SecretStore**，見 DEC-029；**2026-08-04 修訂：** 總管種子改開源 `sampot/pg-steward`，遊樂場不內嵌；**同日再修：** LLM Agent 種子 `sampot/pg-llm-agent`）
- **Context:** 遊樂場主軸是開發單頁小程式（SAM；DEC-016）。其中一種 SAM 可以是 **Agent**：本身仍是普通 Playgrounds 沙盒（`index.html` + 可選 `functions.js`／`controller.js`），設為「現行 Agent」後才注入 `env.HOST`。需與畫布／bindings 對齊，且本站不加帳號後端、不把 key 上傳伺服器。
- **Decision:**
  - **主從關係：** Playgrounds **首先**是輕量 Web 實驗場；Agent **只是**可在此開發／執行的一種單頁小程式（狗糧：Agent UI 也走畫布管線）。勿把遊樂場敘事寫成「Agent 開發平台」。
  - **Agent 用途不限 coding：** 現行 Agent 可以是改檔驗畫布的助手，也可以是其他**特定功能**的 Agent（數據、demo 編排、領域工具等）。人格／工具編排／prompt 留在該 Agent 沙盒裡；遊樂場只提供穩定 `env.HOST`／bindings。內建**範本 Agent**偏向「對工作沙盒觀察—改檔—驗證」以便示範 HOST，可 clone 後改用途。
  - **產品角色「總管（Steward）」：** 持有完整 `env.HOST` 的現行 Agent 席，產品敘事稱**總管**（English：**Steward**；舊稱「管家」）——使用者（遊樂場主人）唯一對口（下指示、拿結果），代為管理遊樂場；沙盒為有邊界的活動空間。實例**顯示名由使用者自訂**；「總管／Steward」是角色類名。技術文件可續用「現行 Agent」指 `activeAgentProjectId` 槽位。勿與 session **Host SAM** 混淆（見 DEC-023）。用語見 [GLOSSARY.md](./GLOSSARY.md)。
  - **範本分流：** **總管範本**為開源小品 [`sampot/pg-steward`](https://github.com/sampot/pg-steward)（BYOK／HOST 對口；經 `?open=`／`/sam/` 取得，**不**內嵌遊樂場）；**LLM Agent 範本**為開源小品 [`sampot/pg-llm-agent`](https://github.com/sampot/pg-llm-agent)（BYOK／**無** HOST；檔案改 system prompt；可多實例入座 coding 編排 `worker`；見 [PG-LLM-AGENT-PLAN.md](./PG-LLM-AGENT-PLAN.md)）；**一般 Agent 範本**仍為遊樂場內建（Controller 背景／主動示範，**不**強制 LLM）。Agent 與工具 SAM 的主差在能否主動／背景運行，不在是否使用 LLM。
  - **雙執行面：** **工作沙盒**（遊樂場 `activeId`）走既有編輯器 + **原畫布**；**現行 Agent**（遊樂場 `activeAgentProjectId`，`localStorage`）走左側側欄 **Agent 區**（與 Files Tab 切換；Agent UI iframe）＋宿主持有的 **Controller 實例**（DEC-024）。下方面板為 Console／Python／JavaScript REPL。Agent **UI** 是第二條 canvas 管線（同 SW／`index.html`），不是遊樂場介面手寫 chat 元件；**任務執行**在 `controller.js`（有則優先），不依賴 UI 是否已掛載。
  - **側欄 Tab 還原：** 記住使用者上次的 Files／Agent tab（layout）；無紀錄時預設 Files。開在 Files 時只還原「現行 Agent」id（徽章／寫入防護），**不**掛載 Agent 畫布；切到 Agent tab、或使用者主動設為／建立現行 Agent 時才載入 UI。已掛載後 Files↔Agent 切換保留 iframe（不重載）；僅在隱藏期間 Agent 檔案有變（stale）或手動重新整理時才重建。有 `controller.js` 時宿主可在 UI 未掛載時仍保持 Controller 運行。
  - **沙盒複製：** OPFS **複製沙盒**（深拷貝檔案與空目錄、新 id）；文案與「自 GitHub 複製」區隔。改 agent 本身：複製 → 當工作沙盒在畫布開發 → UI **設為現行 Agent**（第一版即可從 UI 改設定；可清除）。
  - **BYOK（修訂 DEC-029／035）：** LLM **endpoint／model**／所選 **binding 名**可留在總管設定（可從 SecretStore 既有名稱選，不必重輸 key）；**僅新增／輪替**時經遊樂場介面 dialog 寫入值（訊息不帶 plaintext）。執行時經 `env.secrets.<NAME>.get()` 自行打 endpoint（須 unlock）。本站**不**開帳號後端、**不**代打、HOST **永不**回傳／寫入密鑰值。非密執行期參數見 DEC-035（`.env`→`env.vars`）。
  - **環境唯一通道（對 UI）：** 畫布經 **`functions.js`** → 遊樂場介面注入的 **`env.HOST`**／KV 等。Controller 亦可直接使用同一 bindings（非 UI 路徑）。一般沙盒 `env` 含模擬 **`KV`**／**`DB`**、**`env.vars`**（`.env`）、以及 **`env.secrets.*`**（見 DEC-029／035）；**僅**現行 Agent 沙盒注入 `HOST`。勿讓畫布任意 `postMessage` 繞過 `functions.js` 契約。
  - **`env.HOST` 能力：** 見 DEC-018／[playgrounds-host-api.md](./playgrounds-host-api.md)（v1：FS、search、觀察迴圈、checkpoint、沙盒 create／clone／delete／open 等）。**禁止**經 HOST 寫入現行 Agent 沙盒（避免熱改執行中的自己）；**禁止**經 HOST 刪除使用者建立的沙盒。密鑰見 DEC-029。
  - Agent 必須能讀**當前工作沙盒畫布**的 console（遊樂場介面轉送既有 `playgrounds-preview-console`／error 進 buffer，再經 HOST 暴露）。
  - 提供可建立的**範本 Agent 沙盒**（SAM + `functions.js` 薄路由 + **必備 `controller.js`** + 薄 UI；對話可經該沙盒 Durable KV 續跑）。設為現行 Agent **必須**有 `controller.js`（無 app.js-loop 相容路徑；見 DEC-024）。
- **Consequences:**
  - 勿為 agent 加**本站伺服器**或**遊樂場介面** LLM／通用 URL 代打／帳號；總管自 `fetch` 仍受 **CORS** 約束。
  - 勿讓非現行 Agent 沙盒取得 `env.HOST`；勿讓畫布任意 `postMessage` 當正式工具面繞過 functions。
  - 勿把 agent 登錄進 `/tools/` 或要求介紹文才能上線。
  - 文件／行銷勿把遊樂場主軸說成 Agent IDE；亦勿暗示「Agent＝只能寫程式」。特定功能 Agent＝另寫／clone 一個 SAM 沙盒再設為現行 Agent。
  - 勿再把 API key 寫進 Agent 畫布 `localStorage`／SAM 檔案樹（見 DEC-029）。
  - 變更 HOST 語意或雙執行面模型時更新本決策、DEC-018／DEC-024／DEC-029 與 [GLOSSARY.md](./GLOSSARY.md)。
  - Runtime 階段見 [PG-AGENT-PLAN.md](./PG-AGENT-PLAN.md)；三層／headless 見 [PG-SAM-RUNTIME-PLAN.md](./PG-SAM-RUNTIME-PLAN.md)；密鑰見 [PG-SECRETSTORE-PLAN.md](./PG-SECRETSTORE-PLAN.md)。
- **Revision（2026-08-04）：** 完整 `env.HOST` 仍僅總管席。一般 SAM 經宣告＋準入取得窄 **`env.COMPUTE`**（如 `runPython`）見 [DEC-036](#dec-036-playgrounds-sam-環境資源綁定與準入)；不視為第二份 HOST。
- **Revision（2026-08-04）：** 總管種子改開源小品 [`sampot/pg-steward`](https://github.com/sampot/pg-steward)；遊樂場移除內建「總管」範本與「套用最新總管範本」。產品路徑與 workflow（DEC-034）同為一 SAM 一 repo＋`?open=`。
- **Revision（2026-08-04）：** 產品級 BYOK LLM Agent（子代理／編排工人）種子為 [`sampot/pg-llm-agent`](https://github.com/sampot/pg-llm-agent)；遊樂場不內嵌。見 DEC-033 修訂與 [PG-LLM-AGENT-PLAN.md](./PG-LLM-AGENT-PLAN.md)。

### DEC-018: Playgrounds Host API v1 與 Durable KV

- **Status:** Accepted（2026-07-31；2026-08-01 修訂：有狀態 SAM 搬動）
- **Context:** Agent 需要可探測的 HOST 契約、可靠觀察迴圈、跨重整的 session／scratch，以及 target 沙盒 checkpoint；DEC-016 初版 KV 為分頁記憶體不足。
- **Decision:**
  - **Host API v1：** `apiVersion()`＝`"1"`；`capabilities()` 列已實作能力。擴充含 `search`、`clearConsole`／`waitConsole`／`getCanvasStatus`、`writeFile` 可選 `expectedHash`、`checkpoint`／`listCheckpoints`／`restore`、`createProject`／`cloneProject`／`deleteProject`／`openProject`。細節見 [playgrounds-host-api.md](./playgrounds-host-api.md) 與 [PG-AGENT-PLAN.md](./PG-AGENT-PLAN.md)。
  - **Agent 自迭代與刪除：** HOST `createProject`／`cloneProject` 寫入 `meta.agentManaged: true`。讀寫／`openProject` 可作用於**使用者建立的沙盒**（使用者要求時）。`deleteProject` **僅**可刪 agentManaged 專案，且不可刪現行 Agent。自迭代流程：clone 現行 Agent → 當 target 改良驗證 → `setActiveAgent` → 刪除過舊的 agentManaged 副本。
  - **Durable KV：** `env.KV` 寫入 OPFS（`playgrounds-kv/<projectId>/`）；無 OPFS 時記憶體後備。刪專案時清除該 projectId 的 KV 與 checkpoints。
  - **有狀態 SAM 搬動（2026-08-01）：** 單頁小程式視為可帶執行期狀態的應用。`export`／`import`（`.sam`）、UI `clone`、HOST `cloneProject` **預設只搬原始碼**；可顯式選擇附帶 **KV／DB／Secrets**（checkpoints 暫不進包裹）。`.sam` 可選目錄 `.playgrounds-state/`（side store；**不**把 DB／KV 遷入專案檔案樹）。HOST：`cloneProject(sourceId, newName?, { state?: { kv?, d1?, secrets? } })`。
  - **Checkpoint** 存於 OPFS `playgrounds-checkpoints/<projectId>/`；仍受 `agent_readonly` 約束。
  - 範本 Agent：session 經 `functions.js` 的 `/api/kv`（非 HOST 寫自己）；工具步數可調、可中止、開場 context、tool 結果截斷；長對話 context hygiene 見 DEC-026。
  - **`setActiveAgent`：** 遊樂場介面延遲重載 Agent iframe，讓當前 `/api` 回應有機會送完。
- **Consequences:**
  - 升級 API 時維持 `apiVersion`／`capabilities` 誠實；破壞性變更須升版並更新本決策與 host-api 文件。
  - 勿再假設 KV 重整即失；對外／註解敘事以 Durable 為準。
  - 分享／備份：預設碼 only 避免 session／密鑰默默外流；含 Secrets 的匯出須使用者勾選。
  - 後續增值能力與 **不**經 HOST 暴露 Linux／v86 shell 見 [DEC-019](#dec-019-playgrounds-agent-增值能力與-v86-邊界)；仿 D1／Secrets 見 [DEC-020](#dec-020-playgrounds-模擬-d1與-secrets)；長 session 防健忘見 [DEC-026](#dec-026-playgrounds-agent-context-hygiene)。

### DEC-019: Playgrounds agent 增值能力與 v86 邊界

- **Status:** Accepted（2026-07-31；同日修訂：人類路徑改 Python REPL，**移除** v86／Alpine 面板與資產）
- **Context:** Runtime MVP（HOST v1、觀察迴圈、Durable KV、session／checkpoint、範本體驗）已落地。下一步要提高 agent 對使用者的價值（除錯 API、數據驗證、有狀態 demo）。曾列候選的 `HOST.shell` + v86 對「輕量 Web + functions」主軸槓桿低（慢、無網、無編譯鏈、guest `/mnt` 唯讀），對 agent 有用機率低；人類面板亦改以 Pyodide REPL 取代。
- **Decision:**
  - **增值路線（詳 [PG-AGENT-PLAN.md](./PG-AGENT-PLAN.md) Phase 6+）：** 觀察補強（`getNetworkLog`、`getDomSnapshot`）→ 瀏覽器 compute（優先 **`HOST.runPython`／Pyodide Worker**，CDN＋釘版，對齊 DEC-015 精神）→ 二進位讀寫與畫布截圖 → 仿 D1／SecretStore bindings（DEC-029）→ 高權力可選（`evalInCanvas`、`applyPatch`）按痛點再開。
  - **Pyodide 例外：** DEC-016 允許遊樂場隔離 Worker + `HOST.runPython`（釘版對齊 DEC-015；套件初版釘清單）。**不**嵌 python-runner UI。人類下方面板為 **Python REPL**（同 Worker；非 Linux）。
  - **否決 agent×v86／Linux shell：** **不**實作 `HOST.shell`。**已移除** v86／Alpine 虛擬機面板、映像與建置腳本；勿再加回除非新 DEC。
  - **工具 vs 技能：** 遊樂場提供可探測 HOST／bindings；推理劇本與 playbook 留在可複製的 Agent 範本。
- **Consequences:**
  - 勿把「給 agent 一個**互動** Linux TTY／v86」當 Phase 6+ 必做或預設能力。
  - 若日後要真 Linux **VM** guest 或 agent 控 VM，須**新 DEC**說明場景，且 capability 預設關閉。
  - **WASI 專案命令列**與非互動 `HOST.runCmd` 見 [DEC-021](#dec-021-playgrounds-wasi-shell與-runcmd)與 [PG-SHELL-PLAN.md](./PG-SHELL-PLAN.md)——**不是**復活 v86。
  - Phase 7（`runPython`）已落地；升級 Pyodide 須同步 `pythonRunnerShare.ts` 釘版與 DEC-015／本決策。
  - Phase 9（DB／Secrets）見 [DEC-020](#dec-020-playgrounds-模擬-d1與-secrets)。
  - 階段完成定義與錯誤碼以 [PG-AGENT-PLAN.md](./PG-AGENT-PLAN.md) 為準；契約摘要同步 [playgrounds-host-api.md](./playgrounds-host-api.md)。

### DEC-020: Playgrounds 仿 D1 與 Secrets

- **Status:** Accepted（2026-07-31；2026-08-01 修訂：搬動語意對齊有狀態 SAM；**2026-08-02：Secrets 改 [DEC-029](#dec-029-playgrounds-secretstore與-binding)**——廢 `env.SECRETS` bag，改每 secret 獨立 binding；**2026-08-05：binding 更名 `env.D1`→`env.DB`**，文件稱「仿 D1」，避免與 Cloudflare D1 產品名衝突）
- **Context:** Agent／demo 需要有狀態 SQL 與受控密鑰注入；完整 Cloudflare 相容與站內密鑰代管超出本站範圍。
- **Decision:**
  - **`env.DB`（仿 D1）：** 每 `projectId` 一庫；**sql.js**（WASM）；API 為 Workers／D1 形**子集**（`prepare`／`bind`／`all`／`run`／`first`／`raw`／`batch`／`exec`）。持久化 OPFS `playgrounds-db/<projectId>/db.sqlite`（**side store**，非專案檔案樹；舊根 `playgrounds-d1/` 讀入時遷移）；無 OPFS 時記憶體。虛擬授權入口 **`.bindings/db`**（舊 `.bindings/d1` 正規化為此）。**不**承諾與 Cloudflare D1 全相容。（**仍有效。**）
  - **Secrets（歷史 bag／已取代）：** 曾 `env.SECRETS.get(name)`／per-project 明文。**自 DEC-029／035：** 遊樂場 SecretStore＋**每 key 獨立** `env.secrets.<NAME>.get()`（對齊「一 secret 一 binding」；掛在 `secrets` 命名空間）；password unlock；HOST 僅列名／status。
  - **搬動語意：** export／import／clone **預設不**帶 DB；舊 `state.secrets`／per-project 明文廢止。SecretStore **永不**進 `.sam`。刪專案清 DB／KV／checkpoints；舊 `playgrounds-secrets/<projectId>` 遷移期清除。
- **Consequences:**
  - 升級 sql.js 須留意 WASM／CDN／Node 測試路徑。
  - 密鑰以 [DEC-029](#dec-029-playgrounds-secretstore與-binding)／[PG-SECRETSTORE-PLAN.md](./PG-SECRETSTORE-PLAN.md) 為準；勿再教 `env.SECRETS` bag；勿遊樂場代打。
  - 仿 D1（`env.DB`）細節見 [PG-AGENT-PLAN.md](./PG-AGENT-PLAN.md) Phase 9、[playgrounds-host-api.md](./playgrounds-host-api.md)。

### DEC-021: Playgrounds WASI Shell 與 `runCmd`

- **Status:** Accepted（2026-08-01；Phase 0–4 落地；同日曾擬訂後改為瀏覽器內建 Wasm＋**僅 WASI**，否決 Wasmer／WASIX／COI 必做）
- **Context:** 人類需要仿 Linux **命令列**的沙盒 CLI；Agent 需要非互動 `run_cmd`；FS＝工作沙盒 OPFS。DEC-019 已否決 v86／互動 `HOST.shell`。曾考慮 `@wasmer/sdk`＋WASIX Bash（wasmer.sh），但需 COI、綁定 Wasmer、超出「內建 Wasm」；改採較薄的 WASI preview1 路徑。
- **Decision:**
  - **執行核：** 瀏覽器 **`WebAssembly`**＋**WASI preview1** JS 宿主（`@bjorn3/browser_wasi_shim`）；釘版 `.wasm` CLI（`jq`；uutils `grep`／`sed`／`find`／`diffutils`；goawk `awk`；`cowsay`；**uutils** `coreutils.wasm` 0.9.0 multicall；見 `wasiPin.ts`／`public/playgrounds/wasi/`）。人類 Shell 的 `xargs` 為 JS host（WASI 無法 spawn）。**不**使用 `@wasmer/sdk`、**不**依賴 WASIX、**不**以 COOP／COEP 為硬性前提。guest **無** sockets／外網。
  - **人類：** 下方 **Shell** 面板——xterm＋**行調度器**（`cd`／`help`／allowlist → WASI；可簡易 `|`）；preopen＝工作沙盒 OPFS；**不**經 HOST 暴露字元級 TTY；**不**承諾真 Bash／完整 Linux。
  - **Agent：** `HOST.runCmd`／`listCmds`；非互動、允許清單、timeout、輸出／FS 上限、與人類互斥佇列；與人類共用 runner／FS 語意；**無**管線字串。
  - **不是** v86；**不做**互動式 `HOST.shell`；**不**把未審查的 busybox／任意腳本入口當默認。若改回 Wasmer／WASIX 須新 DEC 或修訂本筆。
  - 階段、完成定義、錯誤碼以 [PG-SHELL-PLAN.md](./PG-SHELL-PLAN.md) 為準。
- **Consequences:**
  - 變更 `runCmd` 契約時更新 [playgrounds-host-api.md](./playgrounds-host-api.md) 與 capabilities。
  - 升級 shim／`.wasm` 釘版時更新 `wasiPin.ts` 與本決策／Shell 計劃。
  - 勿在讀者文章預告未完成階段；對外勿稱虛擬機。
- **Revision（2026-08-04）：** Phase 0–4 落地時採「OPFS → 記憶體 preopen 全量／cwd 鏡像」＋`HOST_WASI_MAX_FS_BYTES`。大沙盒／大二進位會人為 `too_large`。後續 FS 後端改 **Worker 內 OPFS `FileSystemSyncAccessHandle` fd 直連**，見 [DEC-039](#dec-039-playgrounds-wasi-cli-opfs-fd-直連)／[PG-WASI-OPFS-FS-PLAN.md](./PG-WASI-OPFS-FS-PLAN.md)。DEC-021 的 Wasm＋WASI-only／非互動／允許清單邊界**不變**。

### DEC-022: Playgrounds 擴展工具（Tool SAM）與個人工具箱

- **Status:** Accepted（2026-08-01）
- **Context:** WASI／`runCmd` 只適合短跑非互動 CLI（DEC-021）；長時間互動的 viewer／editor 需 Web UI。站上 `/tools/`（DEC-008）是作者代選、少而穩的公開工具箱，無法適配每人任務。沙盒已能用 Agent 開發 SAM；缺的是「開發專案 A 時把專案 B 當工具掛上、並在之後任務復用」的角色與授權模型。
- **Decision:**
  - **產品：** Playgrounds 為**個人工具執行場**——使用者（＋Agent）做出的 SAM 留在 OPFS，可當工作物也可當工具；工具箱＝可復用的沙盒專案，**不**進 `/tools/` 登錄表。站上 `/tools/` **凍結擴張**（既有頁可保留；見 [TOOLS-PLAN.md](./TOOLS-PLAN.md)）。
  - **機制：** **工具模式**佔用 Editor 槽（main content），以第三條 canvas 管線跑**工具沙盒**；**不**因此切換工作沙盒 `activeId`。遊樂場介面核發 **grant**（host 沙盒＋paths＋`read`｜`readwrite`）；僅工具 session 期間注入 **`env.TOOL`**（窄 FS API），**不**注入完整 `env.HOST`。
  - **三角色：** 工作沙盒｜工具沙盒｜現行 Agent（左側）可並存；Agent 開工具走 HOST `openTool`（計劃後段），與 TOOL 分離。
  - 階段、完成定義、錯誤碼以 [PG-TOOLS-PLAN.md](./PG-TOOLS-PLAN.md) 為準。
- **Consequences:**
  - 契約變更同步 GLOSSARY／host-api／AGENTS 指標與 [PG-TOOLS-PLAN.md](./PG-TOOLS-PLAN.md)。
  - 勿用 `openProject(toolId)` 充當掛載工具；勿給工具 iframe 完整 HOST。
  - 勿為擴展工具復活互動 WASI TTY 編輯器當主路徑；勿把新工具產能默認排進 TOOLS-PLAN 候選表。
  - 工具發現靠專案 meta `toolKinds`／`toolGlobs` 與本機偏好；預設不自動重掛上次工具 session（避免誤授權）。
  - 若正式撤下 `/tools/` 導覽或拆頁，另修 DEC-008（本筆只定凍結擴張與沙盒主軸）。
  - **Revision（2026-08-02）：** Editor／main content **掛載畫布 ≠ Tool**。可掛其他沙盒畫布而不核發 grant；Tool＝附帶 grant／`env.TOOL`。main content **tabs** 可在編輯器與已掛 SAM（≤4）間切換——見 [DEC-030](#dec-030-playgrounds-main-content-tabs掛載tool)。
  - **Revision（2026-08-04）：** Tool 與 session worker 共用**委派授權**家族與 **`env.DELEGATE`**（工作沙盒 OPFS path＋虛擬 `.bindings/db`｜`kv` → 該沙盒 Durable）。歷史 `env.TOOL` 遷移見 [DEC-037](#dec-037-playgrounds-委派授權delegate-grant)、[PG-DELEGATE-GRANT-PLAN.md](./PG-DELEGATE-GRANT-PLAN.md)。MVP 僅 FS＋`TOOL` 的敘事視為過渡。

### DEC-023: Playgrounds 多 Agent session

- **Status:** Accepted（2026-08-01）
- **Context:** 單一現行 Agent + `env.HOST`（DEC-017）適合編排／開發；缺的是多個 Participant 在同一工作沙盒規則下即時互動（對局、腦力激盪等）。規格見 [PG-MULTI-AGENT-SESSION-SPEC.md](./PG-MULTI-AGENT-SESSION-SPEC.md)。
- **Decision:**
  - **範圍：** 同一 Playgrounds 頁面內；**不含**遠端使用者／跨實例／WebRTC。
  - **權威：** 當前工作沙盒（Host SAM）經 `functions.js` 強制規則與領域狀態；遊樂場只提供**多人通訊與狀態通道**（座位生命週期、協定閘門、事件推送）。
  - **UX 分工：** 場景命名、場次管理、人類參與主流程由 **Host SAM** 決定；遊樂場介面**不**產品化 session 控制面。Starter 示範呼叫通道 API（Host 畫布 `/api/shell/session/*` 與／或 HOST 子集）。
  - **通道：** 參與 Agent 注入 **`env.SESSION`**（≠ HOST／TOOL）：`getSeat`／`getState`／`getEventChannel`／`act`／`leave`。入座看**協定相容**＋ **role（session 權限類）**，不要求與 Host 同一 SAM 內容。Agent **不規定**使用 LLM。
  - **Role：** 代表 session 內可執行的操作權限，**不是** Agent 人格／隊名。狗糧以單一參與者範本＋ clone 多實例為準；協定通常只需少量 role（如 `human`／`participant`）。
  - **入座路徑（2026-08-03 修訂）：** 支援 Host **邀請**與參與者**申請**；`joinPolicy` 由 Host 在建立 session 時決定（可 `invite_only`／`apply`／`apply_with_approval`／`invite_or_apply`）。邀請仍須過協定閘；不得因邀請發給 HOST。見 SESSION 規格 §6.5。
  - **即時：** 事件以 **BroadcastChannel**（`playgrounds-session:<sessionId>`）推送；**不**以長輪詢當主路徑。`getState` 用於入座快照或 seq 缺口補齊。
  - **執行：** 最多 4 個背景 Participant canvas iframe；不佔用左側現行 Agent 槽。切換工作沙盒結束 session。
  - **編排：** HOST 子集 `openSession`／`closeSession`／`listSeats`／`joinSeat`／`leaveSeat`；Host 畫布另可走 `/api/shell/session/*`（含 spawn-participant 邀請）；單 HOST 不變。
  - 階段與完成定義見 [PG-MULTI-AGENT-SESSION-PLAN.md](./PG-MULTI-AGENT-SESSION-PLAN.md)。
- **Consequences:**
  - 勿給 Participant 完整 HOST；勿把 TOOL 擴成多人 session。
  - 勿為每個並行 Agent 各做一份「角色範本」；人格在 SAM、權限在 role、數量靠 clone。
  - 勿在遊樂場硬選「房間／聊天室」等場景名當唯一 UI 詞；人話名稱活在各 Host。
  - 勿把入座預設成「只能申請」；編排類 Host 常用邀請。
  - 契約變更同步 GLOSSARY／host-api／規格；狗糧範本證明無 LLM 即時迴圈與 Host 自管 UX。
  - Participant 背景執行長期應收斂到 DEC-024 `SamInstance`／Controller（隱藏 iframe 為過渡）。

### DEC-024: SAM 三層模型與 headless runtime

- **Status:** Accepted（2026-08-01）
- **Context:** SAM 曾把任務 loop 放在畫布 `app.js`，導致無 UI／Node／多實例背景執行困難。需要與 Cloudflare 類比清晰的分層：瀏覽器 UI、Worker 形 API、Durable Object 形常駐協調；並支援 headless 宿主（如 Node）同時跑多個 SAM 實例。
- **Decision:**
  - **三層（皆相對同一 SAM 專案）：**
    1. **UI（定義必備）：** `index.html`＋前端 JS／CSS／assets。執行期**可不渲染**。`<head>` 承載機器可讀宣告：`<title>` 與 **`sam:*` meta**（`sam:tool-kinds`、`sam:tool-globs`、`sam:needs-controller`、`sam:protocol` 等）；`<body>` 可作人類說明。**不**另設頂層 `manifest.json` 為權威；**不**以 `.playgrounds-meta.json` 後備 head 宣告（遊樂場專案列表用的 side meta 僅宿主書記，非 SAM 宣告權威）。
    2. **Infrastructure（可選）：** 根目錄 `functions.js`——Workers 形 `export default { fetch }`；有狀態（KV／DB／Secrets）或需 HTTP Facade 的 SAM **應具備**。
    3. **Controller（可選於一般 SAM；現行 Agent 必備）：** 根目錄 `controller.js`——宿主載入的常駐邏輯（類 Durable Object）：`onStart`／`onStop`／`onCommand`／可選 `fetch`／`alarm`；`ctx.schedule`／`waitUntil` 由 **sam-runtime** 實作。
  - **依賴方向（2026-08-03 修訂，對齊 DEC-031）：** 模擬 **UI ← 網路 → 後端（`functions.js`∥`controller.js`）↔ resources**。畫布只經 `/api`→`functions.js`（Workers）；**不得**直連 Controller 或 bindings。`functions.js` 與 `controller.js` 同等可存取 KV／DB／HOST 等；有 Controller 時通常仍以 functions 當對 UI 的 API（CF：Worker＋DO）。**不**向 Controller 注入 `env.INFRA`（2026-08-03 移除；對等後端不得互相代理）。遊樂場 host 可經 `SamInstance.functionsFetch` 呼叫 functions，不進 Controller env。UI **不得**作為任務執行權威；**無**「僅 app.js loop」相容路徑。
  - **可攜核心：** `src/sam-runtime/`（與 DOM／OPFS 解耦）；瀏覽器遊樂場與 Node host（`src/sam-host/node/`）共用實例生命週期與排程。
  - **非目標（本決策不承諾）：** 完整 HOST（畫布截圖／Pyodide／WASI）上 Node；真 CF Durable Objects 託管。
  - 階段與完成定義見 [PG-SAM-RUNTIME-PLAN.md](./PG-SAM-RUNTIME-PLAN.md)。
- **Consequences:**
  - Agent 範本把任務／排程放在 `controller.js`；勿把常駐 loop 寫回 `app.js` 當唯一執行面。
  - head meta 僅認 `sam:` 前綴；勿再解析 `playgrounds:` 宣告鍵。
  - 變更三層契約或 head meta 鍵名時更新本決策、GLOSSARY、SAM-RUNTIME-PLAN、host-api。
  - DEC-023 多 Participant 長期以多 `SamInstance` 取代純隱藏 iframe。
  - **Browser ESM（2026-08-03）：** `SamInstance`（Controller／隨附 functions）經 `samBrowserLoader` 以 **blob URL＋`import()`** 載入，**不**再使用 `playgrounds-sam-module` hidden iframe（對齊 DEC-031「執行不依賴 iframe」）。
  - **Browser 後端執行面（2026-08-04 修訂，見 DEC-038）：** 目標改為 Leader **Dedicated Worker** 執行 `functions.js`∥`controller.js`；**廢止**畫布 `/api` 的 `functionsRuntime` host iframe 暫留敘事。遷移完成前現行碼可能仍短暫雙軌，不以「UI 細節」永久保留 iframe。

### DEC-025: Playgrounds 一鍵開啟（open-from-URL）

- **Status:** Accepted（2026-08-01；同日 Phase 3：`as=`／去重／GitLab；**不做** `/sam` 短鏈；**2026-08-05：** 正式主機見 DEC-041）
- **Context:** 匯入 `.sam` 與自 GitHub 複製已落地，但須手動操作；分享單頁小程式時希望「點一個 URL → 開沙盒 → 自動匯入」。需固定可分享的 deep link 形狀，且不引入站內 proxy 或雲端市集。
- **Decision:**
  - **方案 A：** query 契約固定 **`?open=<url-encoded 來源>`**（**不**另設 `/sam` 短鏈）；遊樂場 boot 時解析一次，成功後清除 `open`／`as`／`name`／`state`／`fresh`。**正式絕對 URL**＝`https://playgrounds.samkuo.me/?open=…`（根路徑；DEC-041）；過渡舊場仍為 `/playgrounds/?open=…`。
  - **辨型：** 路徑以 **`.sam`** 結尾的 http(s) URL → 沙盒包裹 `fetch`（GitHub／GitLab blob／raw 改寫為 raw）；GitHub URL 或 `owner/repo` → GitHub 複製；**GitLab.com** URL → GitLab 複製；無法辨型則錯誤提示。
  - **選用參數：** `as=work|tool|agent`（預設 work）；`state=ask|none`；`name=`；`fresh=1` 強制新建。
  - **同源去重：** 正規化 `meta.source` 與本次來源；命中則重用本機專案並套用 `as=`（除非 `fresh=1`）。
  - **角色：** `agent` 需 `controller.js`，否則降級為工作沙盒並提示；`tool` 另確保 host 工作沙盒後掛 Editor 槽（不把 toolId 當 `openProject`）。
  - **網路：** 瀏覽器直連；**.sam 宿主須開放 CORS**；**不**做站內通用 proxy（對齊 DEC-016）。
  - UI：**複製開啟連結**；專案對話「立即開啟」。
  - 階段見 [PG-OPEN-FROM-URL-PLAN.md](./PG-OPEN-FROM-URL-PLAN.md)。
- **Consequences:**
  - 文件／UI 主標用「從網址開啟」；行銷口語可用「一鍵開 SAM 小」，勿把諧音當正式譯名寫進 glossary 主欄。
  - 變更 `open`／`as` 語意或辨型規則時更新本決策、計劃、GLOSSARY。
  - 介紹文應說明 CORS／Git API rate limit；本機範本無遠端 `source` 時不可產生開啟連結；勿新增 `/sam` 短路由除非另立決策。
- **Revision（2026-08-05）：** 正式絕對 URL 改 `playgrounds.samkuo.me/?open=`（DEC-041）；query 契約不變。

### DEC-026: Playgrounds Agent context hygiene

- **Status:** Accepted（2026-08-01）
- **Context:** Coding／長任務 Agent 對話與 tool 結果會快速脹破模型 context；Embedding RAG 對 Playgrounds 不合適（小專案、BYOK、瀏覽器內、無站內向量基礎設施；檔案樹本就可 `search`／`read_file`）。需要的是「別因 context 太大而健忘／找不到相關資料」——對齊常見 agent best practices，而非檢索基礎設施。
- **Decision:**
  - **否決**以 Embedding／向量 RAG 作為範本 Agent 預設 context 策略。
  - **採用**送模型前的 **context hygiene**（範本／`agentContext`）：
    1. **字元預算**（非精準 token 計數）限制單次 `chat.completions` payload；
    2. **舊 tool 結果 stub**（保留近期完整結果；舊的標 `[compacted]` 並提示重跑工具）；
    3. **舊 user 輪次 digest**（保留近期輪次；更早的收成 `[context compacted]` 摘要，含先前 user asks／見過的 paths）；
    4. **外置 working memory（Scheme A）**：`.agent/plan.md`＋`.agent/memory.md` 為單 HOST 分任務面；專用工具 `ensure_working_memory`／`write_plan`／`write_memory`／`get_task_focus`；開場自動種子＋**Task focus**；UI 工作記憶面板；可選 `README.md` 摘錄。UI transcript 仍可保留完整歷史。
  - **Agentic retrieval 維持主路徑：** `search` → `read_file`／觀察工具；system prompt 禁止把大檔貼進聊天、禁止把已省略的 tool payload 當仍正確。
  - **不**以 DEC-023 **通道本身**充當 coding 子代理產品；多 LLM 子代理編排另以領域 protocol 定義（**2026-08-03：** 見 [DEC-033](#dec-033-playgrounds-coding-orchestration-session-protocol)）。
  - 細節與完成定義見 [PG-AGENT-PLAN.md](./PG-AGENT-PLAN.md) Phase 12／12b。
- **Consequences:**
  - 勿為「防健忘」引入站內 embedding 服務、本機向量索引預設依賴、或每次回合的額外摘要 LLM 呼叫（可選強化另議）。
  - 壓縮只影響**送給模型的 copy**；Durable KV 裡的 UI transcript 不因此刪光。
  - 既有使用者已建立的舊 Agent 沙盒不強制遷移；需「再建立範本」或抄路由才拿到新 hygiene／Scheme A 工具。
  - 變更預算常數、stub／digest、或 plan／memory 工具語意時更新本決策、AGENT-PLAN、GLOSSARY。
  - **Revision（2026-08-03）：** Scheme A 仍是單 HOST 分任務；真·多 LLM 子代理走 `coding-orchestration.v1`（DEC-033），勿把派工語意塞進 hygiene。

### DEC-027: Playgrounds 大 SAM 檔案導航與語言邊界

- **Status:** Accepted（2026-08-02）
- **Context:** SAM 定義是單一 HTML 入口，**不**強制專案短小——大型前端（含 3D 遊戲）仍是合法 SAM。成長痛點在檔案樹導航與 Agent 列舉／脈絡，不是型別系統。AI 時代程式多由助理產生；沙盒應優化「可讀 JS＋即時畫布驗證」，而非把 TypeScript／`tsc` 當作成長管理。既有 Files 樹無過濾、Agent `listFiles` 整包回傳、開場截字典序前 N 路徑——專案變大時會先壞。
- **Decision:**
  1. **語言邊界：** 主要可執行語言為 **JavaScript**（契約檔、範本、Agent 預設產出）；**Python** 用於數據（REPL／`runPython`）。**不**把 TypeScript 一等執行、型別檢查 UX、或 `functions.ts`／`controller.ts` 契約別名列為產品方向。任意文字（含 `.ts`）仍可編輯，與其他文字檔相同——不特製「僅編輯」提示。
  2. **大專案管理靠導航，不靠 TS／RAG：** 人類側強化**到達**（側欄過濾、智慧展開／全部收合、可選麵包屑／快速開檔）與**操作就近**（檔案操作列置於 Files 面板頂部，勿放在長樹下方）；Agent 側新增可裁切 **`HOST.listDir`**（prefix／depth／maxEntries）、開場清單改為優先契約檔＋頂層目錄、維持 `search` → `read_file` 與 DEC-026 hygiene／`.agent/*` 地圖。**否決**以 Embedding RAG 或全專案符號索引作為預設。
  3. **人機共用 `README.md`：** 專案級導讀以根目錄 **`README.md`** 為準（人與 Agent／助理同一份）；開場可摘錄。任務狀態仍用 `.agent/plan.md`／`memory.md`（Scheme A）。**否決**另立專案根 `AGENTS.md` 當助理專用慣例（業界常見拆法；本沙盒不跟）。匯入專案若有該檔，當普通 Markdown，不進開場必讀、不進範本種子。
  4. **相容：** 既有 `listFiles` 保留；大專案引導改用 `listDir`／`search`。虛擬化與 search exclude 等屬痛點驅動之後段。
  - 階段與完成定義見 [PG-FILE-NAV-PLAN.md](./PG-FILE-NAV-PLAN.md)。
- **Consequences:**
  - 實作檔案導航／`listDir`／開場清單時以 FILE-NAV 計劃為準；契約變更同步 host-api、GLOSSARY、capabilities。
  - Files：**專案級**動作（新增／上傳等）可在側欄頂部；**選取級**（改名／刪除／下載）須貼近選取列（列右側），勿只放在長樹頂／底部而與選取脫節。
  - 範本／文件示範「寫給人也能給代理用」的 `README.md`；勿引導使用者把助理規則拆到 `AGENTS.md`；勿與 Scheme A 的 `.agent/*` 混成同一檔。
  - 勿為「專案變大」引入 TS 建置管線、npm、或預設向量索引。
  - 勿在未證實卡頓前先做檔案樹虛擬化；勿暗自截斷 `listFiles` 破壞舊 Agent。
  - 目錄慣例（`ui/`／`lib/`／`assets/`）與 README 種子以範本與文件示範，遊樂場不強制每個小專案都有該檔。

### DEC-028: Playgrounds 沙盒實例工作集與管理面

- **Status:** Accepted（2026-08-02）
- **Context:** 一沙盒＝一 SAM **實例**（Code＋Data＋Configuration）；`clone` 產新實例且程式碼分叉。數量爆炸主因是總管自迭代、session 分身、用途分叉等**實例增殖**，不只是使用者新建。既有 toolbar Picker 列出全部 `listProjects()`，易被「X 副本」污染日常命名空間。`agentManaged` 只約束 HOST 能否刪除，不能兼當「是否該出現在 Picker」。
- **Decision:**
  1. **兩面 UX：** **Picker**＝使用者**工作集**（我建的，或我要求總管幫我建／留下的）；**管理面**＝遊樂場**實例總帳**（全部沙盒，含自動建立）。日常切換靠前者；盤點／回收靠後者。
  2. **兩軸正交：** `inWorkingSet`（Picker 可見）與 `agentManaged`（HOST 可刪）分開。HOST `createProject` 代使用者建立預設進工作集；HOST `cloneProject`（自迭代／座位等）預設**不**進工作集，可 `setWorkingSet` promote。人手新建／匯入／UI 複製預設進工作集。
  3. **血統：** clone 寫入 `clonedFrom`；可選 `cloneIntent`（如 `user`／`steward_for_user`／`self_upgrade`／`session_seat`／`experiment`）。分叉後不暗示 Code 連動。
  4. **GC 優先於資料夾：** 升上總管、session 結束、管理面批次清可回收實例（agentManaged ∧ ¬工作集 ∧ 非現行總管）。**否決**深層沙盒資料夾 taxonomy、雲端專案超市當主結構。
  5. **遷移：** meta 缺 `inWorkingSet` 時——非 agentManaged 視為在工作集；agentManaged 視為不在（可在管理面加入）。
  - 階段與完成定義見 [PG-SANDBOX-INSTANCE-PLAN.md](./PG-SANDBOX-INSTANCE-PLAN.md)。
- **Consequences:**
  - 實作時以 INSTANCE 計劃為準；契約變更同步 host-api、GLOSSARY、總管範本 prompt／tools。
  - 勿用 `agentManaged` 過濾 Picker；勿把 Picker 做成全量瀏覽器而架空管理面。
  - 勿為「沙盒變多」做雲端同步或站上登錄表；個人工具箱語意仍屬 DEC-022。
  - 使用者擁有（非 agentManaged）的刪除邊界維持 DEC-018；HOST 仍不可刪之。
- **Revision（2026-08-05）：** 場內沙盒＝SAM 實例容器（非對桌面的防護主體）；整場重置見 [DEC-040](#dec-040-playgrounds-防護邊界與場內沙盒語意整場重置)。

### DEC-029: Playgrounds SecretStore 與 binding

- **Status:** Accepted（2026-08-02；同日修訂：取消遊樂場代打；一 secret＝一 binding；總管選既有密鑰／遊樂場介面 dialog；**unlock＝password 或 WebAuthn 生物識別**；**2026-08-04 修訂：掛載點改 `env.secrets.<NAME>`**，見 DEC-035）
- **Context:** 需遊樂場統一保管 API key 等密鑰（取代 per-project 明文與 Agent 畫布 localStorage），並對齊 Cloudflare Secrets Store ↔ Workers：**每個 secret 獨立 binding**。Unlock 除 password 外應能用裝置生物識別以降低摩擦。本站不代管帳號、不做遊樂場／站內 HTTP 代打。用語 **SecretStore**（勿稱 Vault）。
- **Decision:**
  1. **SecretStore** 由遊樂場介面統一持有（遊樂場級）。OPFS **僅密文**＋KDF／WebAuthn 包裝參數＋公開 meta；master **`CryptoKey`（`extractable: false`）**；unlocked 不長駐明文 map。
  2. **Unlock／Lock：** 須 unlock 才能 `get`／寫入；明確 lock；**頁面刷新＝lock**。Unlock 可由 **password（PBKDF2）** 或已登錄的 **WebAuthn 生物識別**（優先 PRF unwrap）完成。初始化**必須**設 password（復原）；生物識別可選。Unlock／lock／密鑰值輸入 **僅遊樂場 UI**。
  3. **Binding：** 每 secret 名一顆獨立 binding＋`get()`；**掛在小寫命名空間** `env.secrets.<NAME>.get()`（DEC-035）。**不是**頂層 `env.<NAME>`，也**不是** `env.SECRETS.get(name)`／`env.secrets.get(name)` bag。MVP 對允許沙盒綁全部；Tool 預設不綁；Session 參與者可綁（DEC-033）。HOST 僅 status／`listSecrets`。
  4. **總管 BYOK UX：** 以 `listSecrets` **選既有名**為主；新增／輪替才喚起遊樂場介面 dialog（訊息無 plaintext）。
  5. **取消遊樂場代打**；SecretStore **永不**進 `.sam`。
  - 階段見 [PG-SECRETSTORE-PLAN.md](./PG-SECRETSTORE-PLAN.md)（password＝Phase 1；生物識別＝Phase 1b；命名空間遷移＝Phase 2b）。
- **Consequences:**
  - 信任模型對齊 CF Worker；使用者宜及時 lock。
  - 勿僅生物識別而無 password 復原；無 WebAuthn／PRF 時降級 password；勿遊樂場代打；勿經 HOST／畫布寫密鑰值；勿稱 Vault。
  - 忘記 password＝可能不可恢復；UI 警告。
  - 掛載點與 `.env`／`env.vars` 慣例以 [DEC-035](#dec-035-playgrounds-sam-執行期參數與-env-命名空間)／[PG-SAM-ENV-SPEC.md](./PG-SAM-ENV-SPEC.md) 為準。
- **Revision（2026-08-04）：** 決策核心（一 secret 一 binding、無 bag、HOST 無值）不變；僅將注入路徑自頂層 `env.<NAME>` 改為 `env.secrets.<NAME>`，避免污染 `env` 頂層並與 `env.vars` 對稱。

### DEC-030: Playgrounds main content tabs（掛載≠Tool）

- **Status:** Accepted（2026-08-02；同日修訂：**Editor↔SAM tabs**；SAM canvas **硬頂 4**；掛載≠Tool）
- **Context:** DEC-022 將 Editor 槽定為 Default｜單一 Tool（強制 grant），並把「多工具並行 tab」列為 MVP 非目標。實務上需在不切工作沙盒下於 main content 查看／使用其他沙盒畫布，並用 **tabs 在編輯器與多個 SAM 之間切換**；Tool 授權是可選，不是掛載前提。
- **Decision:**
  1. **範圍：** 僅 **main content（Editor 槽）**；左／右／下槽與自由 dashboard／分屏**不做**。
  2. **Tab 模型：** 固定 **編輯器** tab（不可關）＋ **0..4** 個 **canvas** tab。可用 tabs **切換 Editor 與任一已掛 SAM**；同槽僅一個前景可見。
  3. **掛載 ≠ Tool：** canvas 預設 **plain**（無 grant、無 `env.TOOL`）。**Tool**＝該 tab 另核發 grant，且僅**前景**時注入 `env.TOOL`。MVP **至多一個**帶 grant；`openTool`／`getToolSession`／`closeTool` 語意保留，實作改走 tab 層。
  4. **工作沙盒不變：** 不以 `openProject` 充當掛載；切換 `activeId` 清除全部 canvas tabs（回到 editor）。
  5. **上限／還原：** SAM canvas **硬頂 4**；重整**不**自動還原；非前景可 keep-alive。
  6. **HOST：** `openMainCanvas`／`listMainTabs`／`setMainTab`／`closeMainTab`（名稱以計劃為準）；capabilities 可探測。
  - 階段見 [PG-MAIN-CONTENT-PLAN.md](./PG-MAIN-CONTENT-PLAN.md)。
- **Consequences:**
  - 實作以 MAIN-CONTENT 計劃為準；契約變更同步 host-api、GLOSSARY、總管範本 tools。
  - 勿把 plain 畫布當第二總管或默認注入 TOOL／HOST。
  - 須能 tab 回編輯器；勿超過 4 個 SAM canvas tab。
  - 勿擴成左／右槽 dashboard，除非另立決策。
  - DEC-022 的 grant／個人工具箱定位仍有效；本筆拆開「顯示」與「授權」。

### DEC-031: Playgrounds Agent Model

- **Status:** Accepted（2026-08-03；同日修訂：UI←網路→`functions.js`∥Controller↔resources，撤回「畫布禁止 functions／必須經 Controller」）
- **Context:** DEC-024 提供 Controller／`SamInstance`／alarm，DEC-023 提供領域 session，DEC-028 定義沙盒＝Code＋Data＋Config 實例；仍缺一等公民的 mailbox、訊息與 alarm 序列化、sandbox／agent／peer 身分，以及多 tab／多瀏覽器／多主機下的單權威與 HA 邊界。DEC-026 將真·子代理另議——需要可共用的 runtime 原語。
- **Decision:**（細節以 [PG-AGENT-MODEL-SPEC.md](./PG-AGENT-MODEL-SPEC.md) 為準；階段見 [PG-AGENT-MODEL-PLAN.md](./PG-AGENT-MODEL-PLAN.md)）
  1. **SAM 優先：** Agent 是 SAM 的執行形態（通常要有 Controller）；無 Controller＝一般 SAM，不稱殘缺 Agent。後端（functions∥controller）服務 UI；執行不依賴 iframe；**無** Controller `env.INFRA`（對等後端，禁止互相代理）。
  2. **身分：** `sandboxId`＝邏輯實例（程式汰換舊稱 `projectId`，Phase 0b）；`name`＝顯示名；本機 `agentId` 預設 ≡ `sandboxId`；`peerId`／`homePeer`＝權威節點。clone／spawn → **新 ID**、分叉；**migrate** → **同 ID**、換 `homePeer`，過程維持單權威。
  3. **執行／投遞：** 每 Agent 一 mailbox；跨 Agent **只**傳訊息；訊息與 alarm **單線程**。`send`＝Durable 入隊；**成功處理後 ack**；MVP **at-least-once**；handler **須冪等**。失敗重試至 `N_maxAttempts` 後**毒訊息隔離**。`waitUntil` **不得**碰 mailbox 權威狀態。狀態與 ack **非**真事務（先寫狀態再 ack 為最佳努力）。可 `spawn`（子代**不**繼承 HOST）。
  4. **Virtual actor：** 同瀏覽器 mailbox／alarm **Durable**；`onPause`／`onResume`（不重跑 `onStart`）；有待處理事件才 resume。
  5. **Registry：** 最小 agent 目錄（register／lookup／list）；無項則 `agent_not_found`。
  6. **UI←網路→後端：** 畫布**只**經 `/api`→`functions.js`；**不得**直連 Controller 或 resources。functions 與 controller **皆可**存取同一 resources（CF Workers∥DO）。有 Controller 時仍以 functions 當對 UI 的 API。
  7. **多 tab（MVP）：** **單一 Leader** 跑 **functions＋全部 Controllers**；外接螢幕 tabs（其 `/api` 應轉發至 Leader）。選舉：**Web Lock＋心跳＋`leaderEpoch`**；不依 Page Lifecycle。自檢失鎖 → degrade；新 Leader 於 **超時＋緩衝** 後 bump epoch 再接手；drain／心跳前驗鎖與 epoch。不做分片多 leader。
  8. **HA：** 不自動跨 peer failover；Supervisor **spawn 新 ID**。
  9. **非目標：** 真 CF DO；exactly-once 業務效果；跨 peer 多寫。
- **Consequences:**
  - 依 AGENT-MODEL-PLAN Phase 落地；契約變更同步 GLOSSARY、SAM-RUNTIME、host-api。
  - 勿雙主 drain；勿未 ack 即刪訊息；勿假設 exactly-once；毒訊息不得永久堵佇列。
  - 勿依賴 `freeze`／`resume`；緩衝期勿寫正式心跳。
  - 勿讓 spawn 子代取得第二份 HOST；勿畫布直連 Controller／bindings；勿把 `/api` 改接到 Controller。
  - SESSION／HOST／TOOL 邊界維持。

### DEC-032: Playgrounds Agent 艦隊觀測 UX

- **Status:** Accepted（2026-08-03）
- **Context:** DEC-031 提供 registry／mailbox／spawn／virtual actor 後，同瀏覽器可累積百～千級 Agent 實例；DEC-028 分開 Picker（工作集）與管理面（庫存／GC），但不足以掌握**運行態與實例關係**。AGENT-MODEL-PLAN Phase 6 僅有輕量機制列，並明示非產品叢集 UI。扁列表無法表達血統、session、Supervisor 扇出與接班。
- **Decision:**（細節與階段見 [PG-AGENT-FLEET-UX-PLAN.md](./PG-AGENT-FLEET-UX-PLAN.md)）
  1. **三層視野：** L0 Fleet Pulse（計數／壓力／Needs attention）→ L1 Relation Views（血統／session／編排／搜尋列表／可選 3D）→ L2 Agent Focus（mailbox／poison／alarm／關係鄰居）。
  2. **關係優先：** 預設不以全場扁列表導航；列表保留給搜尋與批次。
  3. **3D 關係圖為探索模式：** `3d-force-graph` 動態載入；預設 **ego／篩選子圖**；**禁止**預設全場千節點力導向；`prefers-reduced-motion` 提供 2D 後備。
  4. **與既有面正交：** 不取代 Picker 或沙盒總帳；「管理沙盒」分 **庫存｜運行**。
  5. **遊樂場介面宜薄：** 投影合併 registry＋mailbox 摘要＋meta＋session；`agent.ui` 存 runtime `ui-annotations.json`，HOST `setAgentUi`／遊樂場介面只渲染。通訊熱邊 opt-in（`traffic.json`）。HOST `listFleetSummary` 只讀、無 payload。
  6. **休眠≠故障：** hibernated 不計入故障彙總。
- **Consequences:**
  - Phase 0–5 已落地；契約見 GLOSSARY、host-api。
  - 勿用 Picker 承擔艦隊觀測；勿預設載入 3D 依賴拖慢首屏；Follower tab 只讀投影。
  - 勿經觀測 API 洩漏密鑰或預設全文訊息 payload。

### DEC-033: Playgrounds coding orchestration session protocol

- **Status:** Accepted（2026-08-03；**2026-08-04 修訂：** 產品工人＝`pg-llm-agent`）
- **Context:** DEC-023 提供抽象多方 session 通道；DEC-031 提供通用 MAS／模擬用 Agent Model。DEC-026 明確「不以通道充當 coding 子代理」。需要一種**具體 protocol**：讓 LLM 總管作為 Host agent 指派 LLM worker、彙整結果以完成 coding 任務——同時不把 Session 變成 coding 專用通道，也不要求模擬 Agent 使用 LLM。
- **Decision:**
  1. **Session＝框架；protocol＝應用。** 有意義的協作必須有 Host 宣告的 `protocolId`／訊息契約；遊樂場不內建編排產品 UX。
  2. **總管場內參與＝Host agent。** 不得以 Participant 座位雙掛；工人僅 `env.SESSION`＋role `worker`。產品路徑：總管沙盒自任 session Host（protocol 狀態在總管 `functions.js`）；`targetSandboxId` 可為目前工作沙盒且可 ≠ Host。狗糧 Coding 編排 Host 僅通道／教學驗證。
  3. **採納協定 `coding-orchestration.v1`（`apiVersion: "1"`）。** 權威任務狀態在 Host；工人 `task.progress`／`result`／`failed`／`clarify`；MVP 副作用 **`side_effects.host_apply`**（總管經 HOST 套用 diff／跑指令）。細節見 [PG-CODING-ORCHESTRATION-PROTOCOL.md](./PG-CODING-ORCHESTRATION-PROTOCOL.md)。
  4. **入座僅邀請制：** 本協定 `joinPolicy` **必須** `invite_only`；否決 worker 申請入隊。
  5. **對話 session＝多方 session（1:1）：** 使用者與總管的每一場對話 session 對應恰好一場本協定多方 session（對照 `chatSessionId`↔`sessionId`）；新對話→新多方 session；對話結束→close 多方 session。
  6. **應用前提：** 本協定參與者為 LLM-based agents；**不**寫進 Session 通道層公理。Agent Model／其他 protocol（如 `brainstorm.v1`、模擬）仍可不使用 LLM。
  7. **與 Scheme A 正交：** 單 HOST＋`.agent/plan.md` 仍有效；多 LLM 座位走本協定。
  8. **產品 coding agent 範本：** Production-ready BYOK coding agent＝獨立小品 [`sampot/pg-llm-agent`](https://github.com/sampot/pg-llm-agent)（檔案權威 system prompt、SecretStore BYOK、無 HOST；session role 仍為 `worker`）。遊樂場內建 coding orchestration worker starter **僅**驗證／教學，**不是**產品規格。階段見 [PG-LLM-AGENT-PLAN.md](./PG-LLM-AGENT-PLAN.md)。
  9. **非目標（本決策）：** worker 完整 HOST、遊樂場官方工人市集、遠端多使用者、一對話多場本協定 session。
- **Consequences:**
  - 實作狗糧／範本前以協定檔為準；契約變更同步 GLOSSARY、SESSION 規格、host-api（若暴露新表面）。
  - 勿在遊樂場硬編碼 coding 編排控制台；勿給 worker 第二份 HOST；勿接受本協定下的 apply 入座。
  - 勿讓同一對話掛兩場 coding 多方 session，或讓舊對話跨到新對話的工人／任務圖。
  - 勿把狗糧 worker／規則修 demo 當成 `pg-llm-agent` 產品門檻。
  - 修訂 DEC-026「真·子代理另議」指向本決策。
  - SESSION 規格已補：總管＝Host agent、protocol 宣告形狀、joinPolicy／邀請路徑。
- **Revision（2026-08-04）：** 產品 LLM 工人路徑改開源小品 `pg-llm-agent`；與總管 `pg-steward` 同為一 SAM 一 repo＋`?open=`。
- **Revision（2026-08-04）：** 工人執行面改走與 Tool 共用的**委派 grant**（[DEC-037](#dec-037-playgrounds-委派授權delegate-grant)）；`host_apply` 降為可選後備。`side_effects.worker_grant` 收斂為同家族 `delegate_grant`。協定／階段見 PROTOCOL 與 [PG-DELEGATE-GRANT-PLAN.md](./PG-DELEGATE-GRANT-PLAN.md)。

### DEC-034: Playgrounds workflow 定義與實例模型

- **Status:** Accepted（2026-08-04；同日修訂：獨立 SAM 交付、遊樂場零特化）
- **Context:** Agent Model（DEC-031）已提供 mailbox／alarm／virtual actor／spawn；需要一種**應用層**有狀態多步驟流程，讓使用者以熟悉格式定義流程，短期文字編輯、長期視覺編輯共用同一 IR。JSON 整包內嵌 JS 的編輯體驗不佳；又須支援短碼內嵌與長碼外檔。架構價值在於 Workflow 與小品相同——**獨立 SAM**，不靠遊樂場特化。
- **Decision:**
  1. **實例＝Agent：** workflow 實例生命週期與 Agent 實例相同（`sandboxId`／mailbox／alarm／Durable 狀態）；一流程一 SAM 範本（引擎＋定義＋UI 同捆）；instantiate＝開新實例。
  2. **單一 cursor：** 同一時間至多一個 active step；平行多游標另議並升 `apiVersion`。
  3. **定義語言＝YAML（`workflow.v1`）：** 人類主格式與編輯器 IR；JSON 僅可作 AST／匯出備援。短 JS 用 `run: |`；長邏輯用 `runFile`（**必支援**）；兩者互斥、契約同形。
  4. **人機僅 UI：** `await_ui` 經該實例畫布 → `functions.js` → mailbox；不依賴多方 session role。
  5. **終態保留實例：** 清除不必要暫態後仍保留整個 Agent／沙盒作紀錄體；不預設 GC。
  6. **遊樂場零特化：** Playgrounds **不**內建 workflow 範本、**不**對定義檔做遊樂場級編譯／save hook、**不**嵌入引擎。Runtime 在獨立 Workflow Agent SAM 內。
  7. **交付＝獨立 SAM repo**（小品形）：Runtime 範本 **`sampot/pg-workflow`**；本站文件鎖語言／模型；`?open=`／可選 catalog，登錄≠遊樂場內建。
  8. **Runtime ≠ Tool：** 不以 Tool SAM／`env.TOOL` 充當 workflow **引擎**或持有權威游標狀態。
  9. **Visual Editor＝Tool SAM：** 視覺編輯器以獨立 Tool SAM 交付（建議 **`sampot/pg-wfedit`**；grant 編宿主定義 IR；**垂直主軸**投影）；與 Runtime 分離；不得另立執行語意。產品契約見 [PG-WFEDIT-SPEC.md](./PG-WFEDIT-SPEC.md)。
  10. **細節規格：** [PG-WORKFLOW-DEFINITION-SPEC.md](./PG-WORKFLOW-DEFINITION-SPEC.md)；交付邊界見 [PG-WORKFLOW-PLAN.md](./PG-WORKFLOW-PLAN.md)；編輯器階段見 [PG-WFEDIT-PLAN.md](./PG-WFEDIT-PLAN.md)。
- **Consequences:**
  - 契約變更同步 GLOSSARY、本 ADR、PLAN／WFEDIT 規格。
  - 勿把 runtime 拉回遊樂場 starter；勿把 Visual Editor 做成遊樂場內建或與引擎混成同一 Tool。
  - 勿以 JSON 字串當人類主編內嵌 JS；勿在 MVP 定義語言表達多 cursor；勿假設 exactly-once。
- **Revision（2026-08-04）：** 補 `pg-wfedit` 規格指針與垂直主軸約定（WFEDIT-SPEC）；非改變 Runtime／遊樂場零特化決策。

### DEC-035: Playgrounds SAM 執行期參數與 env 命名空間

- **Status:** Accepted（2026-08-04；核心已落地：`env.vars`／`env.secrets.*`）
- **Context:** SAM 需要沙盒級非密執行期參數（對齊常見 `.env` 工作流），且 SecretStore 的「一 secret 一 binding」不必佔用 `env` 頂層鍵名（易與 `KV`／`HOST`／密鑰名互撞）。`index.html` 的 `sam:*` meta 已是宣告面權威，不應再塞任意 `KEY=value`。
- **Decision:**
  1. **小寫＝命名空間；大寫＝能力／資源 binding。** 頂層保留 `vars`／`secrets`（命名空間）與既有 `KV`／`DB`／`HOST`／`TOOL`（歷史）／`SESSION`／**`DELEGATE`（DEC-037）**／**`COMPUTE`（DEC-036）**。
  2. **執行期參數：** 沙盒根目錄 **`.env`** 為權威 → 注入同步唯讀 **`env.vars`**（字串對）。缺檔＝空命名空間。functions 與 controller 同一 `env`。
  3. **密鑰：** 維持 DEC-029 信任模型；掛載改為 **`await env.secrets.<NAME>.get()`**。禁止 `env.secrets.get(name)`／舊 `env.SECRETS` bag 主路徑。
  4. **非 meta：** **不**以 `sam:*` 承載 vars 值；宣告與參數分工見規格。
  5. **搬動：** `.env` 隨檔案樹進 `.sam`；SecretStore 永不進。
  6. **Shell 分離：** MVP **不**自動合併 `env.vars` 進 WASI／人類 Shell process env。
  - 細節：[PG-SAM-ENV-SPEC.md](./PG-SAM-ENV-SPEC.md)；SecretStore 計劃同步掛載點。
- **Consequences:**
  - 讀密鑰用 `env.secrets.<NAME>.get()`；讀參數用 `env.vars`；頂層不再掛密鑰鍵。
  - 勿把 API key 寫進 `.env`；勿復活字典式 secrets bag；勿用 meta 當 dotenv。
  - 契約變更同步 GLOSSARY、host-api、SECRETSTORE 計劃、總管範本。

### DEC-036: Playgrounds SAM 環境資源綁定與準入

- **Status:** Accepted（2026-08-04；規格初版；**核心已落地**：宣告／準入／`env.COMPUTE`）
- **Context:** User 與 Agent 都是遊樂場參與者——差別主要是 UI vs API，對環境資源的存取都應明確規範。一般 SAM（例：spreadsheet-like 分析 UI）需要 `runPython` 等共用服務時，不應被迫成為總管，也不應讓畫布直連 runner。DEC-017 將完整 `env.HOST` 綁總管席仍然正確，但缺少「非總管窄能力」的宣告／同意／注入模型。自己的檔案樹與沙盒狀態則屬實例內建，不應塞進同意清單。
- **Decision:**
  1. **Actor 一律規範：** 環境資源分 **sandbox-intrinsic**（預設可開）與 **environment capability**（須 `sam:capabilities` 宣告＋使用者同意才準入）。
  2. **Intrinsic（不必宣告）：** 自己沙盒檔案樹讀寫、`env.vars`、自己的 `KV`／`DB`、自己的畫布資產與 `/api`→functions、runtime 膠水。**不含**他沙盒、完整 HOST、SESSION、secrets 具名權、人類 REPL／Shell。
  3. **宣告：** `index.html` `<meta name="sam:capabilities" content="runPython, …">`；不承載值／密鑰。
  4. **準入：** 匯入／升級／手動；已核發集合存遊樂場 Config；**預設不進 `.sam`**；import／clone 重準入。
  5. **窄 binding：** MVP 準入 `runPython`／`runCmd` 後注入 **`env.COMPUTE`**（方法按已準入子集暴露）；與總管 `HOST` 共用 runner 語意，**不是**完整 HOST。一般 SAM 宣告 `host` → MVP 不核發。
  6. **總管席：** 設為總管仍得完整 `HOST`（不必 capability 宣告）；卸任收回 HOST，已準入窄能力保留除非撤銷。
  7. **UI：** 畫布只經 `/api`→`functions.js`；不直連 compute（DEC-031）。
  - 細節：[PG-SAM-BINDINGS-SPEC.md](./PG-SAM-BINDINGS-SPEC.md)。
- **Consequences:**
  - 頂層保留名新增 `COMPUTE`；分析類 SAM 示範宣告＋薄 `/api` 路由（實作階段）。
  - 修訂「只有總管能碰 runPython」的隱含假設——總管仍獨享完整 HOST；`runPython` 可經準入之 `COMPUTE` 提供給一般 SAM。
  - 勿把 intrinsic 誤做成同意項；勿用完整 HOST 充當分析 SAM 的預設注入；勿讓已核發集合默認隨 `.sam` 信任轉移。
  - 契約變更同步 GLOSSARY、host-api、SAM-ENV-SPEC 交叉引用；實作另開計劃。

### DEC-037: Playgrounds 委派授權（Delegate Grant）

- **Status:** Accepted（2026-08-04；計劃初版；**Phase 0–1 已落地，2–3 部分完成**）
- **Context:** Tool SAM（DEC-022）與 coding worker（DEC-033）都是「接受委派、在授權範圍內做事」；授權模型不應分叉。工人若只有 SESSION、寫入靠總管 `host_apply`，無法完成需探索／迭代的子任務。工作沙盒的 `env.DB`／`env.KV` 若無 Files 可指入口，SQLite／KV 類 Tool 無法直覺開啟。SAM 自身能力已有準入模型（DEC-036），不應與跨沙盒委派混為一談。
- **Decision:**
  1. **同一角色：** Tool 與 session worker Agent 同為 **delegate（受委派者）**；總管對使用者負責並可委派；delegate 對委派方負責。
  2. **兩層授權正交：**（a）使用者對該 SAM 的 **準入**（`sam:capabilities`／DEC-036）決定「自己會什麼」；（b）**委派 grant** 是唯一動態的工作沙盒存取授權。sandbox-intrinsic（自己的 FS／KV／DB）不變。
  3. **Grant 範圍：** 工作沙盒 OPFS 路徑（既有）＋虛擬節點 **`.bindings/db`** → 該沙盒 `env.DB`、**`.bindings/kv`** → 該沙盒 `env.KV`。共同子目錄名 **`.bindings/`**。Files **只顯示入口、不展開**鍵／表；內容由 Tool／agent 呈現。
  4. **虛擬 ≠ `.sam` state：** 授權 path **不**對齊 `.playgrounds-state/`；匯出序列化維持既有目錄，與直覺虛擬節點脫鉤。
  5. **最小權限：** 所有委派情境成立；SQLite Tool 可只授 `.bindings/db`。任務／掛載結束撤銷。Delegate **無**完整 `HOST`。
  6. **強制執行同一家族：** 統一注入 **`env.DELEGATE`**（Tool 與 worker 同契約；歷史名 `env.TOOL` 遷移後廢止為權威）。coding-orchestration 產品主路徑為 `side_effects.delegate_grant`；`host_apply` 可選後備。
  7. **階段：** [PG-DELEGATE-GRANT-PLAN.md](./PG-DELEGATE-GRANT-PLAN.md)。
- **Consequences:**
  - 修訂 DEC-022／033／035 指針；契約變更同步 GLOSSARY、TOOLS／CODING PROTOCOL、host-api、`pg-llm-agent` 計劃敘事。
  - 頂層保留名新增 **`DELEGATE`**；新範本／文件勿再以 `env.TOOL` 為權威。
  - 勿為 worker 另發明與 Tool 語意不同的第二套工作沙盒 ACL。
  - 勿把虛擬節點當普通 OPFS 原始碼檔；勿在 Files 展開 KV 鍵。
  - 勿給 delegate 完整 HOST；勿把 SecretStore 塞進 `.bindings` 開啟主路徑。

### DEC-038: Playgrounds Backend Runtime Worker（後端離 UI 主線程）

- **Status:** Accepted（2026-08-04；修訂拆開 HOST、殼不假設 OPFS；WebRTC 遷移路線；**Phase 0–4 MVP 已落地**）
- **Context:** Controller／functions 佔 UI 主線程或 hidden iframe；殼常直打本機瀏覽器 OPFS。長遠要把**多主機瀏覽器經 WebRTC 串成叢集**，Runtime／workers 可能在另一台主機——殼必須只經可替換訊息通道存取 Runtime。Cloudflare 等僅作「殼與 Runtime 分離」的審查類比，**不是**本決策的產品託管目標。
- **Decision:**
  1. **殼層不得假設**沙盒權威儲存位於「殼所在瀏覽器」的 OPFS。權威親和 **Backend Runtime**（及跨主機時的 homePeer）。
  2. **後端執行面：** `functions.js`∥`controller.js` 只在 Runtime；MVP＝同頁 Leader Dedicated Worker；**不**用 functions host iframe；**不**在 UI main thread。
  3. **拆開 HOST／Delegate**＋**殼面可終端**；禁止後端互經殼；禁止矛盾迴路。
  4. **訊息通道可替換：** MVP＝`postMessage`；遷移目標＝**WebRTC**（等價）連到可能他機的 Runtime；殼 API 不綁死同文件。
  5. **Follower／外接螢幕**不跑 Runtime；跨主機權威仍循 DEC-031 單 homePeer（叢集細節另規）。
  6. **Node** 為同級部署。本計劃**不**交付 WebRTC 叢集或 CF 託管，但契約**必須**保留遷移路線。
  - 細節：[PG-BACKEND-RUNTIME-SPEC.md](./PG-BACKEND-RUNTIME-SPEC.md) §1.4；階段：[PG-BACKEND-RUNTIME-PLAN.md](./PG-BACKEND-RUNTIME-PLAN.md)。
- **Consequences:**
  - 修訂 DEC-016 長期「殼直打 OPFS」假設；MVP OPFS 僅可作 Runtime 內實作。
  - 修訂 DEC-024 iframe 暫留；與 DEC-031 peer／homePeer 對齊遷移敘事。
  - 同步 GLOSSARY／AGENTS／host-api。
  - 勿把 CF 寫成正式遷移目標；勿整包 HOST 一律 RPC；勿 SharedWorker 混淆 Leader。
  - Phase 1：殼權威路徑改經通道／Runtime API，再搬 Worker。
- **Revision（2026-08-04）：** Controller／`SamInstance` 改在 Dedicated Worker 執行；殼側 `RemoteSamInstance` 代理。
- **Revision（2026-08-04）：** Phase 2 完成——Worker 內 `AgentRuntime` drain／alarm；FS 權威經 `fsOp`／HOST local 寫入在 Runtime；殼 `sandboxAuthority` 於 Runtime 活著時走通道；殼僅 Leader 選舉＋`drainGate`／`kickDrain`。

### DEC-039: Playgrounds WASI CLI × OPFS fd 直連

- **Status:** Accepted（2026-08-04；Phase 0–4 已落地；否決合併進 Runtime Worker）
- **Context:** DEC-021 Shell／`runCmd` 以記憶體 preopen 鏡像工作沙盒（cwd 子樹）進 WASI Worker，並以 `HOST_WASI_MAX_FS_BYTES`（16 MiB）擋路。大檔／大專案無法用統一 CLI；只調高上限仍雙份複製。把不常用檔案運算全做進 HOST／functions 會膨脹遊樂場 footprint、不利日後使用者自裝 WASI CLI；非 CLI 又缺統一人類入口。WASI preview1 I／O 為同步；DEC-021 禁止 COI／SAB。DEC-038 已要求儲存權威在 Backend Runtime。
- **Decision:**
  1. **廢止**「每次 `runCmd`／Shell 命令前全量（或 cwd）FileMap→記憶體 preopen」作為產品主路徑；**廢止**以 FS 鏡像總量觸發的 `too_large`。
  2. WASI preopen 改在 **Dedicated Worker** 內以 OPFS **`FileSystemSyncAccessHandle`**（或等價同步 fd）對**權威沙盒根**做 `path_open`／`fd_read`／`fd_write`／`readdir` 等；跑完只回報 **dirty／changed paths**（或等價 notify），不整樹 `entriesOut`。
  3. **Shell 維持統一 CLI**；大檔能力屬 FS 後端。高頻結構化操作仍可走 HOST／functions；**不**要求稀有檔案運算都進遊樂場核。
  4. 維持 DEC-021：WASI preview1 only、無 WASIX／Wasmer、無 COI、無互動 TTY、允許清單短跑。無 SyncAccessHandle 時 → `wasi_unavailable`（誠實失敗），**禁止**靜默退回全量鏡像假裝支援大檔。
  5. 與 DEC-038：WASI 必須使用與 Runtime 相同的沙盒權威根；**獨立 WASI Dedicated Worker**（`hostWasi.worker`）為產品形狀；與 Runtime 寫入經殼 **`withSandboxFsGate(sandboxId)`**＋Runtime **per-sandbox** `fsHold` 互斥——鎖 scope＝`playgrounds-projects/<sandboxId>/`。**否決**整颗 OPFS 鎖、**否決** tab 全域「任一時刻僅一個沙盒可寫」（切換工作沙盒須不被無關沙盒短跑拖住）。遊樂場正規 UX **不**支援同時對兩個以上沙盒寫檔；以沙盒為鎖鍵已是取捨。見 [PG-WASI-OPFS-FS-PLAN.md](./PG-WASI-OPFS-FS-PLAN.md) Phase 3／5。**否決**把 WASI 合併進 Backend Runtime Worker。
  6. 階段與完成定義以 [PG-WASI-OPFS-FS-PLAN.md](./PG-WASI-OPFS-FS-PLAN.md) 為準。
- **Consequences:**
  - 產品呼叫須帶 **`sandboxId`**（OPFS 直連；過渡期 API 可仍見 `projectId`）；記憶體 `files` 僅單元測後備。
  - 同步 GLOSSARY／AGENTS／host-api；Shell 計劃附錄 A 的 `too_large`＝argv／輸出／stdin 等，**不是**專案過大。
  - 勿只調高鏡像常數充當本決策；勿用 SAB／COI；勿因大檔削弱 Shell 改一律 HOST-only。
  - 使用者自裝網路 CLI 的產品 UX **非**本決策交付，但 FS 語意須不挡同一 preopen。
  - 勿把 tab 全域 FS 閘／全域 `fsHold` 當可接受產品形狀。
  - 勿把「合併 WASI→Runtime Worker」當成後續必做項。
- **Revision（2026-08-04）：** 明確否決選項 A；產品維持雙 Worker＋閘門／`fsHold`。
- **Revision（2026-08-04）：** Phase 0–4 完成——主路徑 OPFS fd 直連；互斥與文件打磨落地。
- **Revision（2026-08-04）：** 互斥 scope＝**per-sandbox**；**否決** tab 全域單寫者。Phase 5 已落地 per-sandbox 閘／`fsHold`。

### DEC-040: Playgrounds 防護邊界與場內沙盒語意；整場重置

- **Status:** Accepted（2026-08-05）
- **Context:** 「沙盒」易被讀成對桌面的安全隔離層；實務上**有防護能力、避免污染使用者桌面**的是整個 **Playgrounds（遊樂場）**（瀏覽器 origin／OPFS；不以 File System Access 持久掛載本機目錄為主路徑）。場內單位「沙盒」則是管理 **SAM 實例**的容器。實驗過程易累積實例、Durable 狀態、密鑰庫與介面偏好，需要能回到第一次開啟 `/playgrounds/` 的空場。
- **Decision:**
  1. **防護邊界＝遊樂場：** 對桌面／本機檔案系統的隔離敘事掛在 Playgrounds；勿把場內沙盒寫成第二層「防污染桌面」的安全沙盒。
  2. **場內沙盒＝SAM 實例容器：** 一沙盒＝一 SAM 實例（Code＋Data＋Configuration；DEC-028）。實例間仍僅經允許通道（HOST／DELEGATE／SESSION 等）互動——此為場內邊界，不是對桌面的防護主體。
  3. **整場重置（僅人類 UI）：** 「管理沙盒」提供**重置遊樂場**，清光本機 Playgrounds 持久化（OPFS 已知根、相關 localStorage／sessionStorage、密鑰庫與介面偏好），再導向乾淨 `/playgrounds/`，等同首次載入空場。**不**經 `env.HOST` 暴露（避免總管誤清場）。不自動重建範本沙盒。
  4. **誠實限制：** WebAuthn 驗證器可能殘留已無對應密文的 credential（瀏覽器限制）；Service Worker 站台 cache 非必清。
- **Consequences:**
  - 同步 [GLOSSARY.md](./GLOSSARY.md)、[AGENTS.md](./AGENTS.md)、[PG-SANDBOX-INSTANCE-PLAN.md](./PG-SANDBOX-INSTANCE-PLAN.md)、[playgrounds-host-api.md](./playgrounds-host-api.md)。
  - 實作清單以 `playgroundsFactoryReset.ts` 為單一真相來源；新增 OPFS 根或 prefs 鍵時須一併列入。
  - 勿用逐筆刪沙盒（含「刪光後自動建範本」）充當整場重置。
  - DEC-016／028 單位名與工作集語意不變；本筆釐清防護歸屬與重置能力。

### DEC-041: Playgrounds 獨立子網域與開源抽取

- **Status:** Accepted（2026-08-05）
- **Context:** 遊樂場宿主（介面＋`sam-runtime`＋SW／畫布）仍嵌在部落格儲存庫 `myblog`，路徑 `https://samkuo.me/playgrounds/`。小品已多為獨立開源 repo（`pg-steward`、`pg-llm-agent`、`pg-workflow` 等），宿主卻無法單獨部署或公開協作。目標：正式場改到子網域、整包開源；部落格繼續寫過程分享（DEC-004 敘事不變）。OPFS／SecretStore／prefs 綁 origin，換網域＝新空場，不能自動搬資料。
- **Decision:**
  1. **權威 origin：** 正式遊樂場＝**`https://playgrounds.samkuo.me`**（Cloudflare Pages 等獨立部署）。
  2. **根路徑 `/`：** 子網域上入口為 `/`（非再掛 `/playgrounds/`）；畫布虛擬站為 **`/canvas/<sandboxId>/…`**（對應舊 `/playgrounds/canvas/…`）。`?open=` 等 query 契約不變，僅主機與 path 前綴改變。
  3. **單一開源 repo：** 整個 Playgrounds 宿主抽成一個公開儲存庫（建議名 **`sampot/playgrounds`**）——含遊樂場介面、`src/sam-runtime/`、`src/sam-host/`、畫布／離線 SW、Host API 與必要工程契約文件。**不**拆成 runtime／UI 兩套件當交付形。
  4. **舊場暫留：** `https://samkuo.me/playgrounds/` **暫不移除**（同一套碼或凍結快照皆可，過渡期由計劃定）。UI **提醒**使用者：正式場在子網域；本機資料綁 origin，請**匯出沙盒（`.sam`）後到新網址匯入**；SecretStore／prefs／WebAuthn 包裝須在新 origin 重設。**不做**跨 origin 自動遷移、**不做**站內 proxy 搬 OPFS。
  5. **部落格職責：** 文章／`/sam/` 型錄／導覽可留在 `samkuo.me`；新深鏈與型錄「開啟」指向子網域。讀者可見敘事仍依 DEC-004（勿產品／品牌／行銷腔）；開源＝公開原始碼與可自架，不是產品站。
  6. **階段**以 [PG-STANDALONE-PLAN.md](./PG-STANDALONE-PLAN.md) 為準。
- **Consequences:**
  - 路徑／origin 須配置化（base path、canvas 前綴、預設 `?open=` origin）；消滅硬編碼 `https://samkuo.me/playgrounds` 作為唯一權威。
  - 子網域 SW scope 可為 `/` 且**只**服務遊樂場；部落格 `public/sw.js` 日後可卸下 canvas／遊樂場離線職責（過渡期可雙軌）。
  - 開源 repo 不含部落格文章、`CONTENT-PLAN`、站台品牌主殼；工程 `AGENTS.md`／DEC 精簡版可進 OSS。
  - 同步 [GLOSSARY.md](./GLOSSARY.md)、[AGENTS.md](./AGENTS.md)；舊 DEC-016 路徑敘事加「權威改子網域見 DEC-041」。
  - 舊場下線時點另立修訂；在此之前不得默默刪除 `samkuo.me/playgrounds/`。

---

## 4. 相關文件

| 文件 | 用途 |
| --- | --- |
| [AGENTS.md](./AGENTS.md) | 協作慣例、寫作語氣、目錄與程式碼變更準則 |
| [GLOSSARY.md](./GLOSSARY.md) | 用語對照 |
| [CONTENT-PLAN.md](./CONTENT-PLAN.md) | 發文排程（主軸：Playgrounds／SAM；次要：一人開發／NT²） |
| [TOOLS-PLAN.md](./TOOLS-PLAN.md) | 小工具定位、IA、落地節奏（DEC-008～011、DEC-015 的細節來源；**凍結擴張**見 DEC-022） |
| [PG-AGENT-PLAN.md](./PG-AGENT-PLAN.md) | Agent runtime 與 Phase 6+／12（context hygiene）增值階段、HOST 表面、完成定義 |
| [PG-SHELL-PLAN.md](./PG-SHELL-PLAN.md) | WASI Shell／`runCmd` 階段與完成定義（DEC-021） |
| [PG-WASI-OPFS-FS-PLAN.md](./PG-WASI-OPFS-FS-PLAN.md) | WASI CLI × OPFS fd 直連／大檔（DEC-039） |
| [PG-TOOLS-PLAN.md](./PG-TOOLS-PLAN.md) | 擴展工具／Tool SAM 階段與完成定義（DEC-022） |
| [PG-MULTI-AGENT-SESSION-SPEC.md](./PG-MULTI-AGENT-SESSION-SPEC.md) | 多 Agent 即時 session 功能需求（僅本地） |
| [PG-MULTI-AGENT-SESSION-PLAN.md](./PG-MULTI-AGENT-SESSION-PLAN.md) | 多 Agent session 實作階段（DEC-023） |
| [PG-CODING-ORCHESTRATION-PROTOCOL.md](./PG-CODING-ORCHESTRATION-PROTOCOL.md) | `coding-orchestration.v1`（DEC-033） |
| [PG-CODING-ORCHESTRATION-PLAN.md](./PG-CODING-ORCHESTRATION-PLAN.md) | coding-orchestration 實作階段（DEC-033） |
| [PG-LLM-AGENT-PLAN.md](./PG-LLM-AGENT-PLAN.md) | BYOK LLM Agent 小品 `pg-llm-agent`（產品工人路徑） |
| [PG-WORKFLOW-DEFINITION-SPEC.md](./PG-WORKFLOW-DEFINITION-SPEC.md) | workflow 定義語言 `workflow.v1`／實例模型（DEC-034） |
| [PG-WORKFLOW-PLAN.md](./PG-WORKFLOW-PLAN.md) | workflow 交付邊界：獨立 SAM；遊樂場零特化（DEC-034） |
| [PG-WFEDIT-SPEC.md](./PG-WFEDIT-SPEC.md) | Workflow Visual Editor（`pg-wfedit`）產品／UX 契約 |
| [PG-WFEDIT-PLAN.md](./PG-WFEDIT-PLAN.md) | `pg-wfedit` 實作階段 |
| [PG-AGENT-MODEL-SPEC.md](./PG-AGENT-MODEL-SPEC.md) | Agent 執行模型／mailbox／身分／單權威（DEC-031） |
| [PG-AGENT-MODEL-PLAN.md](./PG-AGENT-MODEL-PLAN.md) | Agent Model 實作階段（DEC-031） |
| [PG-AGENT-FLEET-UX-PLAN.md](./PG-AGENT-FLEET-UX-PLAN.md) | Agent 艦隊觀測 UX／3D 關係圖（DEC-032） |
| [PG-SAM-RUNTIME-PLAN.md](./PG-SAM-RUNTIME-PLAN.md) | SAM 三層／Controller／headless runtime（DEC-024） |
| [PG-OPEN-FROM-URL-PLAN.md](./PG-OPEN-FROM-URL-PLAN.md) | 一鍵開啟／`?open=`（DEC-025） |
| [PG-FILE-NAV-PLAN.md](./PG-FILE-NAV-PLAN.md) | 大 SAM 檔案導航／`listDir`／語言邊界（DEC-027） |
| [PG-SANDBOX-INSTANCE-PLAN.md](./PG-SANDBOX-INSTANCE-PLAN.md) | 沙盒實例工作集／管理面／clone 血統（DEC-028） |
| [PG-SECRETSTORE-PLAN.md](./PG-SECRETSTORE-PLAN.md) | SecretStore／unlock·lock／binding get（DEC-029） |
| [PG-SAM-ENV-SPEC.md](./PG-SAM-ENV-SPEC.md) | `.env`→`env.vars`／`env.secrets.*` 命名空間（DEC-035） |
| [PG-SAM-BINDINGS-SPEC.md](./PG-SAM-BINDINGS-SPEC.md) | 環境能力宣告／準入／`env.COMPUTE`（DEC-036） |
| [PG-DELEGATE-GRANT-PLAN.md](./PG-DELEGATE-GRANT-PLAN.md) | 委派授權／`.bindings`／Tool＝worker grant（DEC-037） |
| [PG-BACKEND-RUNTIME-SPEC.md](./PG-BACKEND-RUNTIME-SPEC.md) | 後端執行面／可替換通道（DEC-038；WebRTC 遷移路線） |
| [PG-BACKEND-RUNTIME-PLAN.md](./PG-BACKEND-RUNTIME-PLAN.md) | Backend Runtime 實作階段（DEC-038） |
| [PG-MAIN-CONTENT-PLAN.md](./PG-MAIN-CONTENT-PLAN.md) | Main content Editor↔SAM tabs／plain 掛載（DEC-030） |
| [PG-STANDALONE-PLAN.md](./PG-STANDALONE-PLAN.md) | 獨立子網域／開源單一 repo／舊場暫留（DEC-041） |
| [playgrounds-host-api.md](./playgrounds-host-api.md) | Host API v1 快速參考 |
| `astro.config.ts`／`src/config.ts` | 建置與站台設定實作 |
