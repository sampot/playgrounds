# Playgrounds 一鍵開啟（open-from-URL）計劃（DEC-025）

> **狀態：** Phase 0～3 已完成（2026-08-01；**不做** `/sam` 短鏈）  
> **權威決策：** [DECISIONS.md](./DECISIONS.md) DEC-025  
> **相關：** DEC-016（匯入／GitHub／無站內 proxy）、[GLOSSARY.md](./GLOSSARY.md)

一句話：**`/playgrounds/?open=<來源>` → 遊樂場自動辨型 → 匯入／複製進 OPFS → 依 `as=` 開啟為工作沙盒／Agent／工具。**

行銷口語可稱「一鍵開 SAM 小」（諧音梗）；正式文件與 UI 主標用「從網址開啟」。

---

## 目標

- 分享連結即可在對方瀏覽器開啟沙盒並載入遠端 `.sam` 或 public GitHub／GitLab 儲存庫／子目錄。
- 重用既有匯入／複製語意；含狀態時 ask（`state=none` 可略過）。
- **不做**站內通用 proxy（CORS 失敗則明確提示）。
- **不做** `/sam` 短入口（作者否決；入口固定 `/playgrounds/`）。

---

## URL 契約（方案 A）

```
https://play.samkuo.me/?open=<url-encoded 來源>[&as=work|tool|agent][&state=ask|none][&name=…][&fresh=1]
```

任意場：`https://<name>.samkuo.me/?open=…`（DEC-042）。過渡期舊場仍接受 `https://samkuo.me/playgrounds/?open=…`（DEC-041；提醒匯出遷移）。

| 參數 | 說明 |
| --- | --- |
| `open` | **必填。** `.sam` http(s) URL；或 GitHub URL／`owner/repo`；或 GitLab.com URL |
| `as` | 預設 `work`；`agent`＝設為現行 Agent（需 `controller.js`）；`tool`＝掛進 Editor 工具槽（另確保工作沙盒） |
| `state` | 預設 `ask`；`none`＝不還原執行期狀態、不跳對話 |
| `name` | 覆寫新建專案顯示名 |
| `fresh` | `1`／`true`＝略過同源去重，強制新建 |

| `open` 內容 | 行為 |
| --- | --- |
| 路徑以 `.sam` 結尾（GitHub／GitLab blob／raw → 改寫為 raw） | `fetch` 沙盒包裹 → 匯入 |
| GitHub URL 或 `owner/repo` | `fetchGithubProject` |
| GitLab.com URL（含 subgroup／`/-/tree/`） | `fetchGitlabProject` |
| 無法辨型 | 錯誤提示；其餘 boot 照常 |

處理後清除 `open`／`as`／`name`／`state`／`fresh`。

**同源去重：** 以正規化來源鍵比對既有 `meta.source`；命中則直接 `open`／套用 `as=`，不重複匯入。`fresh=1` 關閉此行為。

---

## 階段

| 階段 | 交付 | 完成定義 | 狀態 |
| --- | --- | --- | --- |
| **0. 契約** | DEC-025、GLOSSARY、本計劃、AGENTS 指針 | 用語與 URL 形狀無歧義 | 已完成 |
| **1. MVP** | `openFromUrl.ts`＋遊樂場 boot＋Vitest | `.sam` URL 與 GitHub 兩種來源可一鍵開啟 | 已完成 |
| **2. UX** | 進度橫幅、失敗提示；「複製開啟連結」「立即開啟」 | 分享迴路閉合 | 已完成 |
| **3. 進階** | `as=`／`state`／`name`／`fresh`、同源去重、GitLab.com；**不含** `/sam` 短鏈 | 進階參數可用 | 已完成 |

---

## 程式路徑

| 路徑 | 用途 |
| --- | --- |
| `src/components/playgrounds/openFromUrl.ts` | 解析 intent／options、raw 改寫、來源鍵、拉取 `.sam` |
| `src/components/playgrounds/gitlabProject.ts` | GitLab.com 公開專案複製 |
| `src/components/playgrounds/gitRepoPaths.ts` | GitHub／GitLab 共用路徑過濾 |
| `src/components/playgrounds/PlaygroundsApp.svelte` | boot／角色套用／去重 |

---

## 與其他決策

- **DEC-016：** 仍無站內 proxy；Git API rate limit／CORS 限制須在 UI 說清。
- **DEC-018：** 含執行期狀態的包裹預設 ask；`state=none` 略過。
- **DEC-017／024：** `as=agent` 仍要求 `controller.js`；否則降級為工作沙盒並提示。
- **DEC-022：** `as=tool` 不切換工作沙盒 id 充當工具；另確保 host 工作沙盒後再掛載。
