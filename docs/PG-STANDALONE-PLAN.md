# Playgrounds 獨立子網域與開源抽取計劃（DEC-041）

> **狀態：** Phase 0–3／5 部分落地（2026-08-05）；Phase 4 部署待作者綁定 Cloudflare／DNS  
> **權威決策：** [DECISIONS.md](./DECISIONS.md) DEC-041  
> **相關：** DEC-004（對外敘事）、DEC-009／016（SW／路徑）、DEC-025（`?open=`）、DEC-024（`sam-runtime`）、DEC-040（整場重置／origin 資料）

一句話：**正式場＝`https://playgrounds.samkuo.me/`（根路徑）；整包宿主開源為單一 repo；`samkuo.me/playgrounds/` 暫留並提醒匯出遷移。**

---

## 目標

- 遊樂場可獨立部署、獨立 SW、不綁部落格 Layout／Header。
- 公開儲存庫可自架／協作；小品生態（`pg-*`）深鏈改指新 origin。
- 舊使用者不被切斷：舊 URL 仍可用，並清楚說明如何搬到新場。

## 非目標

- 跨 origin 自動搬 OPFS／SecretStore／prefs。
- 把 `/sam/` 型錄或部落格文章搬進宿主 repo。
- 對外改寫成產品／品牌站（DEC-004 仍適用）。
- 過渡期內刪除 `https://samkuo.me/playgrounds/`。

---

## 權威 URL

| 用途 | URL |
| --- | --- |
| 正式入口 | `https://playgrounds.samkuo.me/` |
| 畫布 | `https://playgrounds.samkuo.me/canvas/<sandboxId>/…` |
| 一鍵開啟 | `https://playgrounds.samkuo.me/?open=<…>`（參數同 DEC-025） |
| 過渡舊場 | `https://samkuo.me/playgrounds/`（暫留；提醒遷移） |
| 舊畫布 | `https://samkuo.me/playgrounds/canvas/<sandboxId>/…` |

建議 repo 名：**`sampot/playgrounds`**（單一 repo：介面＋runtime＋host＋SW＋契約文件）。

---

## 遷移對使用者（硬約束）

1. 舊場顯示**持久提醒**（橫幅或管理沙盒區塊）：正式場在子網域；資料綁瀏覽器 origin；請匯出 `.sam` 後到新網址匯入。
2. **不**自動導向（避免使用者以為資料還在）；可提供明顯連結「開啟正式遊樂場」。
3. SecretStore／WebAuthn／介面偏好須在新 origin **重設**；文件與提醒須寫清。
4. 部落格 `/sam/`、新文章、Footer／導覽的「開啟」預設指向**子網域**；舊文深鏈可逐步改或靠舊場提醒。

---

## 階段

| Phase | 內容 | 完成定義 | 狀態 |
| --- | --- | --- | --- |
| **0. 契約** | DEC-041、本計劃、GLOSSARY／AGENTS 同步 | 路徑／repo／遷移策略無歧義 | **已完成** |
| **1. 配置化** | `playgroundsPaths`／`playgroundsUrls`；`PUBLIC_PLAYGROUNDS_BASE_PATH`；雙 canvas 前綴；`openFromUrl` 預設 canonical；SW v11 雙前綴＋standalone host | 單元測綠；blog 預設 `/playgrounds`、standalone 空 base | **已完成** |
| **2. 舊場遷移 UX** | 舊場橫幅提醒＋連正式場；session 可關；不自動清資料 | 開啟 `/playgrounds/` 可見提醒 | **已完成** |
| **3. 抽 repo 骨架** | 本機 `~/dev/sampot/playgrounds`（建議 GitHub `sampot/playgrounds`）；獨立 Astro；`npm test`／`build` 綠 | 見該目錄 README | **已完成**（尚未 push／公開） |
| **4. 子網域部署** | Cloudflare Pages 綁 `playgrounds.samkuo.me`；workflow 草稿在新 repo | 正式 URL 可開 | **待作者**（DNS／Pages／secrets） |
| **5. 部落格接線** | Header／`/sam/`／tools 深鏈／複製開啟連結改 canonical；舊 `/playgrounds/` 續留 | 導覽進子網域；舊場仍可用 | **已完成**（文件範例可續改） |
| **6. 開源 hygiene** | LICENSE／README 已在新 repo；公開 GitHub 待作者 | repo 公開可 clone | **部分**（待 push） |
| **7. 舊場凍結／下線（另令）** | 宣布凍結日；之後只讀提醒或 302（**僅當作者明示**） | 不在本計劃自動執行 | 未開始 |

---

## 技術縫（實作備忘）

- **Path helpers：** 集中 `playgroundsPaths.ts`（或既有常數檔）——`appBase`、`canvasBase`、`swScript`；`public/sw.js` 與 `canvasSwProtocol.ts` 必須同源生成或單一匯入策略（建置時注入）。
- **SW：** 子網域專用腳本 scope `/`；卸下全站 `/offline/` 與非遊樂場 navigation 邏輯。部落格 SW 之後只服務部落格離線策略（另修 DEC-009）。
- **Layout：** OSS 用極簡殼（標題「遊樂場」＋可選連回 [samkuo.me](https://samkuo.me/)）；勿複製整站導覽為硬依賴。
- **文件搬家：** `playgrounds-host-api.md`、與宿主契約強相關之 PG-*／DEC 摘要進 OSS；`CONTENT-PLAN`、寫作語氣長文留 `myblog`。
- **雙建置過渡：** Phase 5 前允許 `myblog` 仍含一份碼；抽取後以「同步策略」避免長期雙修——優先 submodule 或「myblog 舊路徑改 redirect／薄提醒頁 + 連結子網域」一旦子網域穩定。

---

## 敘事（DEC-004）

- 讀者文／UI：可寫「場搬到子網域、程式開源」；**勿**賣點清單、changelog 站、品牌主張。
- 開源 README：工程向（跑起來、架構邊界、授權）；可一句連部落格分享文。

---

## 完成檢查（整體）

- [ ] `playgrounds.samkuo.me/` 為日常正式場
- [ ] `?open=` 文件與 `/sam/` 指向子網域
- [ ] 舊 `/playgrounds/` 仍可開且有遷移提醒（直至 Phase 7）
- [ ] 公開 `sampot/playgrounds` 可自架
- [ ] GLOSSARY／部落格導覽與 DEC-041 一致

---

## 修訂紀錄

| 日期 | 變更 |
| --- | --- |
| 2026-08-05 | 初版：作者拍板根路徑 `/`、舊場暫留＋匯出提醒、單一 repo |
| 2026-08-05 | Phase 1–3／5：路徑配置、遷移橫幅、部落格深鏈、本機抽 repo 建置綠；Phase 4 待部署 |
