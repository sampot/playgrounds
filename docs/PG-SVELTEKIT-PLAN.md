# Playgrounds 宿主：Astro → SvelteKit（DEC-048）

> **狀態：** Phase 1–6 **完成**（2026-08-06）；Phase 7 型錄 UX 見 [PG-CATALOG-UX-PLAN.md](./PG-CATALOG-UX-PLAN.md)（Phase 2–5 已落地）  
> **權威決策：** [DECISIONS.md](./DECISIONS.md) **DEC-048**  
> **相關：** DEC-005（Svelte 5 **runes**）、DEC-009（SW／離線）、DEC-041／042（場網／Workers）、DEC-043（文件站仍 Starlight）、[PG-CATALOG-UX-PLAN.md](./PG-CATALOG-UX-PLAN.md)（型錄人機面）、[PG-STANDALONE-PLAN.md](./PG-STANDALONE-PLAN.md)、[PG-DOCS-PLAN.md](./PG-DOCS-PLAN.md)

一句話：**場網宿主根專案以 SvelteKit 建置靜態 PWA（adapter-static＋既有 Workers ASSETS）；已卸除根目錄 Astro；**`docs-site/` **與** `platform-api/` **不變。**

---

## 目標

- 建置／路由與產品一致：Playgrounds 是 **Svelte 5 殼 + SW／OPFS 的 PWA**，不再以 Astro islands 薄包一層。
- 部署契約不變：Cloudflare Workers Static Assets、`dist`、SPA `not_found_handling`、`src/worker.ts` 保留名 302。
- 為 [PG-CATALOG-UX-PLAN.md](./PG-CATALOG-UX-PLAN.md) 清掉「型錄必須是獨立 Astro 頁」的假限制。
- 工程面單一：`svelte-check`／Vite／Kit，不再維護根 `@astrojs/*`。



## 非目標

- `docs-site/` 改 SvelteKit（DEC-043＝Astro Starlight；獨立 Worker）。
- `platform-api/` 改框架（DEC-047）。
- 為遷框架引入 **SSR 應用伺服器**、帳號、或邊緣動態租戶。
- 改 `?open=`／canvas／OPFS／Host API／型錄 YAML 權威。
- 部落格 `myblog`／DEC-001（仍 Astro＋Pages）。
- 「順便」大重構殼內無關模組。

---



## 現況（遷移前）


| 項    | 現況                                                                         |
| ---- | -------------------------------------------------------------------------- |
| 頁面   | 僅 `src/pages/index.astro`（掛 `PlaygroundsApp`）與 `src/pages/sam/index.astro` |
| 互動   | 幾乎全部在 Svelte（`client:only`）                                                |
| 建置   | `astro build` → `dist/`；`astro check`                                      |
| 部署   | `wrangler` ASSETS `./dist`；`not_found_handling: single-page-application`   |
| SW   | `public/sw.js`；資產掃描含 `/_astro/*`（`swOfflineStrategy`）                      |
| 型錄資料 | `catalog:gen` → typed + `/catalog/v1.json`（與 UI 框架無關）                      |


根專案已是薄 Astro 殼；遷 Kit 是對齊事實，不是重寫產品。

---



## 目標架構

```text
catalog/**/*.yaml ──catalog:gen──► samCatalog.generated.ts + public/catalog/v1.json
SvelteKit (Svelte 5, adapter-static) ──build──► dist/
src/worker.ts + wrangler ASSETS ──► *.samkuo.me（保留名 302 不變）
public/sw.js（canvas + offline；資產前綴改對 Kit／Vite）
```


| 鎖死選擇                                 | 說明                                                             |
| ------------------------------------ | -------------------------------------------------------------- |
| **adapter-static**                   | 產出靜態 `dist`；`fallback` 對齊現有 SPA 行為                             |
| **Svelte 5 runes**                   | 見 DEC-005；`compilerOptions.runes: true`；禁止 legacy `export let`／`$:`／隱式 let 反應性 |
| **勿先用 adapter-cloudflare**           | 易與自訂 `worker.ts`／ASSETS 模型衝突；若日後要用須另修訂並合併保留名邏輯                 |
| **trailingSlash: always**            | 對齊現況與 canvas／深鏈假設                                              |
| **殼頁 ssr＝false 或整站 prerender + SPA** | 遊樂場本就需 JS／OPFS；勿半套 SSR                                         |
| **URL 契約**                           | `/`、`/sam/`、`/canvas/…`、`/catalog/v1.json`、`/offline/`（若有）對外不變 |


---



## 與型錄 UX

本計劃只保證：**宿主可跑 Kit 路由與殼內面**，不再綁 Astro page。

人機型錄（搜尋、密度、picks、殼內「一鍵開」）見 **[PG-CATALOG-UX-PLAN.md](./PG-CATALOG-UX-PLAN.md)**。可與本計劃 Phase 2＋並行，但**不要**在卸除前的 Astro `/sam/` 上做大改版再丟棄。

---



## 階段


| Phase           | 內容                                                                                                  | 完成定義                                 | 狀態           |
| --------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------ | ------------ |
| **0. 契約**       | DEC-048、本計劃、GLOSSARY／AGENTS 交叉引用；明確 static、排除 docs-site                                             | 無歧義                                  | **完成** |
| **1. Scaffold** | 根目錄 SvelteKit；Tailwind 4 Vite plugin；`PUBLIC_`；`__PLAYGROUNDS_BUILT_AT__`；`trailingSlash: 'always'`；**`compilerOptions.runes: true`** | `npm run dev` 可起；與舊路徑並存策略寫明          | **完成** |
| **2. 路由搬移**     | `/` → 掛既有 `PlaygroundsApp`；layout 自 `PlaygroundsLayout.astro` 遷 `+layout`；`/sam/` 先**功能對等**         | 導覽、meta／OG、一鍵開、hash／query 不回歸        | **完成** |
| **3. 建置／部署**    | `build` → `dist`；wrangler 自架／official dry；Vercel／Netlify 靜態設定對齊 Kit 產出                              | `deploy:dry`／`deploy:official:dry` 過 | **完成**（dist 產出驗證；dry 視憑證） |
| **4. SW／離線**    | 資產前綴自 `/_astro/` 改為 Kit／Vite 實際路徑；`swOfflineStrategy`＋測試；bump `CACHE_NAME`                          | `build && preview` 離線可開殼；策略單測綠       | **完成** |
| **5. 工程面**      | `astro check` → `svelte-check`；scripts／CI／pre-commit／README／AGENTS                                  | `npm test`＋`npm run build` 綠         | **完成** |
| **6. 卸 Astro**  | 刪根 `astro.config`、`@astrojs/`*、`astro` dependency、殘留 `.astro` 頁                                     | 根 `package.json` 無 Astro；文件敘事一致      | **完成** |
| **7. 型錄 UX**    | 依 [PG-CATALOG-UX-PLAN.md](./PG-CATALOG-UX-PLAN.md)（可與 2–6 重疊，但以 Kit／殼為載體）                           | 見該計劃完成定義                             | 另追           |


---



## 高風險／硬約束

1. **SW 資產路徑** — 現碼與測試假設 `/_astro/`；遷完若不改，離線必壞。變更策略須 bump `CACHE_NAME`（`samkuo-offline-v`*）。
2. **自訂** `src/worker.ts` — 保留名 redirect 必須與 Kit 靜態產出並存；Phase 3 禁止被 adapter 預設 Worker 默默取代。
3. **Trailing slash** — 全站 `always`；SW pathname、canvas、深鏈測試須覆蓋。
4. **一鍵自架** — `wrangler.jsonc`／`vercel.json`／`netlify.toml`／README Deploy 按鈕改指 Kit `dist`（或等價）。
5. `/sam/` **SEO／分享** — 遷路由時至少保留可分享 URL＋基本 meta（prerender shell 或 layout）；細節 UX 見型錄計劃。
6. **Dev 與 SW** — Vite／Kit dev 路徑仍勿被 SW cache（對齊 DEC-009 精神）。

---



## Commands（目標態；Phase 5＋落地後）


| 現況（Astro）       | 目標（Kit）                                   |
| --------------- | ----------------------------------------- |
| `astro dev`     | `vite dev`／`svelte-kit` 慣例（`npm run dev`） |
| `astro check`   | `svelte-check`（`npm run check`）           |
| `astro build`   | `vite build`（經 Kit；仍先 `catalog:gen`）      |
| `astro preview` | `vite preview` 或靜態 preview                |


`catalog:gen`、`wrangler deploy`、`docs:*`、`platform:*` 職責不變。

---



## 修訂紀錄


| 日期         | 變更                                                         |
| ---------- | ---------------------------------------------------------- |
| 2026-08-06 | 初稿：adapter-static；卸根 Astro；docs-site／platform 排除；與型錄 UX 分冊 |
| 2026-08-06 | 鎖死 Svelte 5 runes（DEC-005）；scaffold 須 `runes: true` |
| 2026-08-06 | Phase 1–6 落地：SvelteKit＋`/_app/` SW；根 Astro 卸除 |


