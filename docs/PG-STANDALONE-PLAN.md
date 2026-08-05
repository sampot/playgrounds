# Playgrounds 場網、Workers 與開源抽取計劃（DEC-041／042）

> **狀態：** Phase 0–3／6／**7a（舊場凍結）** 完成；Phase 4＝`play` 已上線（wildcard Route 待 token）；Phase 5 部分；Phase 7b 下線另令  
> **權威決策：** [DECISIONS.md](./DECISIONS.md) DEC-041（抽取／舊場）、**DEC-042**（Workers／wildcard／`play`）  
> **相關：** DEC-004（對外敘事）、DEC-009／016（SW／路徑）、DEC-025（`?open=`）、DEC-024（`sam-runtime`）、DEC-040（整場重置／origin 資料）

一句話：**預設場＝`https://play.samkuo.me/`；任意 `https://<name>.samkuo.me/`＝同程式、異 origin；部署＝Cloudflare Workers；開源 [`sampot/playgrounds`](https://github.com/sampot/playgrounds)；舊 `samkuo.me/playgrounds/` 暫留並提醒匯出。**

---

## 目標

- 遊樂場可獨立部署（Workers）、獨立 SW、不綁部落格 Layout／Header。
- 用 **wildcard 子網域**切開本機狀態（OPFS／SecretStore／prefs），無需伺服器端租戶。
- 公開儲存庫可自架／協作；小品深鏈改指場網。
- 舊使用者不被切斷：舊 URL 仍可用，並清楚說明如何搬到新場。

## 非目標

- 跨 origin 自動搬 OPFS／SecretStore／prefs。
- 把 `/sam/` 型錄或部落格文章搬進宿主 repo。
- 對外改寫成產品／品牌站（DEC-004 仍適用）。
- 過渡期內刪除 `https://samkuo.me/playgrounds/`。
- 為每個 `<name>` 建後端實例、帳號或雲端專案庫。
- 二級以上子域（`a.b.samkuo.me`）。

---

## 權威 URL（DEC-042）

| 用途 | URL |
| --- | --- |
| 預設場（文件／遷移／部落格深鏈預設） | `https://play.samkuo.me/` |
| 預設場畫布 | `https://play.samkuo.me/canvas/<sandboxId>/…` |
| 預設一鍵開啟 | `https://play.samkuo.me/?open=<…>`（參數同 DEC-025） |
| 任意獨立場 | `https://<name>.samkuo.me/`（同一 `dist`） |
| 過渡舊場（**凍結**） | `https://samkuo.me/playgrounds/`（暫留、提醒遷移；**不再**跟場網同步更新） |
| 舊畫布 | `https://samkuo.me/playgrounds/canvas/<sandboxId>/…` |

開源 repo：**[`sampot/playgrounds`](https://github.com/sampot/playgrounds)**。

**保留名（勿當一般實驗場；Worker 可拒）：** 至少 `www`、`blog`、`api`、`docs`、`old-blog`、站務／NT² 既有子域；**`play`＝官方預設場**（實作表：`PLAYGROUNDS_FIELD_RESERVED_SUBDOMAINS`）。

---

## 遷移對使用者（硬約束）

1. 舊場顯示**持久提醒**：正式預設場在 `play.samkuo.me`；亦可自開其他 `<name>.samkuo.me`；資料綁瀏覽器 origin；請匯出 `.sam` 後到目標場匯入。
2. **不**自動導向；可提供明顯連結「開啟 play.samkuo.me」。
3. SecretStore／WebAuthn／介面偏好須在**新 origin**重設（每 name 獨立）。
4. 部落格新深鏈預設指向 **`play.samkuo.me`**；場內複製連結用 **`location.origin`**。

---

## 階段

| Phase | 內容 | 完成定義 | 狀態 |
| --- | --- | --- | --- |
| **0. 契約** | DEC-041、本計劃、GLOSSARY／AGENTS | 抽取／舊場策略無歧義 | **已完成** |
| **0b. 場網契約** | DEC-042：Workers、`*.samkuo.me`、預設 `play`；同步本計劃／GLOSSARY／AGENTS | 文件與 DEC 一致 | **已完成** |
| **1. 配置化** | `playgroundsPaths`／`playgroundsUrls`；雙 canvas 前綴；SW 雙前綴；canonical／場判定＝`play`＋`*.samkuo.me` | blog／standalone 可建 | **已完成** |
| **2. 舊場遷移 UX** | 舊場橫幅＋連 `play.samkuo.me` | `/playgrounds/` 可見提醒 | **已完成** |
| **3. 抽 repo** | [`sampot/playgrounds`](https://github.com/sampot/playgrounds) public | clone／test／build 綠 | **已完成** |
| **4. Workers＋wildcard** | `wrangler`／Static Assets；DNS `*.samkuo.me`；standalone 判定＝`*.samkuo.me`；canonical＝`play.samkuo.me`；分享＝`location.origin`；保留名表 | `play` 與任一實驗 name 可開獨立空場；同程式 | **部分**（`play` 已部署；wildcard Worker Route 待 token） |
| **5. 部落格接線** | 導覽／`/sam/`／tools／文件範例 → `play`（部署後）；舊場續留 | 點進預設場；舊場仍可用 | **部分** |
| **6. 開源 hygiene** | LICENSE／README／AGENTS；public repo | 可 clone | **已完成** |
| **7a. 舊場凍結** | 遷移橫幅已上；**停止**把場網功能同步進 `myblog` `/playgrounds/`；權威＝`sampot/playgrounds` | Agents／開發不再對齊舊場；舊場可落後 | **已完成**（作者 2026-08-05） |
| **7b. 舊場下線** | 刪路由／拆碼（另令） | 不自動執行 | 未開始 |

---

## 技術縫（Phase 4 備忘）

- **Host 判定：** `hostname` 為 `*.samkuo.me` 且非 apex／非保留 → standalone（base `""`、canvas `/canvas/`）。
- **Canonical：** 文件與預設分享範例＝`https://play.samkuo.me`；場內 copy link＝`location.origin`。
- **Worker：** [`sampot/playgrounds`](https://github.com/sampot/playgrounds) — `wrangler.jsonc`＋`src/worker.ts`（ASSETS SPA；保留名 302→`samkuo.me`）；Custom Domain＝`play.samkuo.me`；`workers.dev`＝`playgrounds.eavatar.workers.dev`。
- **DNS：** 已刪舊停車 `*.samkuo.me` A→208.91…；現為 proxied `*` A／AAAA（場網預備）。**Worker Route** `*.samkuo.me/*` 需 zone token 含 `#workers_routes:edit`（現行 token 僅能裝 Custom Domain）。
- **CI：** `npm run build` → `wrangler deploy`（OSS workflow 已改 wrangler-action）。
- **WebAuthn：** 每 origin 獨立（DEC-042）。
- **保留名（實作）：** `www`／`blog`／`api`／`docs`／`old-blog`（後者避免蓋掉舊 GitHub Pages）。

---

## 敘事（DEC-004）

- 讀者文／UI：可寫「場在 `play.samkuo.me`、也可自開子域、程式開源」；**勿**賣點清單、多租戶產品腔。
- 開源 README：工程向（Workers、wildcard、授權）。

---

## 完成檢查（整體）

- [x] `play.samkuo.me/` 為日常預設場（Workers Custom Domain 已上）
- [ ] 至少一個非保留 `<name>.samkuo.me` 為獨立空場（同程式；待 wildcard Route）
- [ ] `?open=` 文件與部落格深鏈指向 `play`（或現行場 origin）
- [x] 舊 `/playgrounds/` 仍可開且有遷移提醒（凍結；下線＝Phase 7b）
- [x] 舊場**不再**與場網同步功能更新（Phase 7a）
- [x] Workers 部署＋wildcard DNS（Route 待 token）
- [x] GLOSSARY／導覽與 DEC-041／042 一致

---

## 修訂紀錄

| 日期 | 變更 |
| --- | --- |
| 2026-08-05 | 初版：根路徑 `/`、舊場暫留、單一 repo |
| 2026-08-05 | Phase 1–3／5：配置、橫幅、抽 repo 公開 |
| 2026-08-05 | **DEC-042：** 部署改 Workers；場網 `*.samkuo.me`；預設場 `play.samkuo.me`（取代 `playgrounds.samkuo.me`／Pages） |
| 2026-08-05 | Phase 4：`play.samkuo.me` Workers Static Assets 上線；刪停車 wildcard；proxied `*` DNS；Route 待 token |
| 2026-08-05 | **Phase 7a：** 舊場凍結——`/playgrounds/` 不再跟場網同步更新 |
