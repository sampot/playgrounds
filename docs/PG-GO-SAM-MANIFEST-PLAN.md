# Playgrounds：`sam-manifest.json`（遊戲下載清單）

> **狀態：** Draft（2026-08-17）— 契約定案；**Phase 1 宿主／go 實作已落地**（仍直連 raw；無 Worker）  
> **相關：** [PG-GAME-AGENT-GUIDE.md](./PG-GAME-AGENT-GUIDE.md)（遊戲側義務；agent 必讀）、[PG-GO-CLIENT-PLAN.md](./PG-GO-CLIENT-PLAN.md)（純玩載入／tip／離線）、DEC-016（瀏覽器直連；無通用 proxy）、DEC-050（go）  
> **非本檔：** Cloudflare Worker／R2／Pages CDN（後階段可另立計劃；**本階段不做**）

一句話：**`kind: game` 的 GitHub repo 根目錄必須提供 `sam-manifest.json`（修訂號＋執行期檔案列表）；go／Invite 下載改讀此清單，不再用 GitHub Trees API 列檔。**

---

## 1. 動機

- 現行 `fetchGithubProject`：`api.github.com` Trees（匿名 ~60/hr／IP）＋逐檔 `raw.githubusercontent.com`。
- 型錄遊戲量大、共 NAT IP 時，Trees **與** raw 都會限流（含 raw `429`＋ scraping ToS 文案）。
- go **只認型錄 id**（§5.4），下載集合封閉——適合用**允許清單**取代整棵 tree。
- 先定 **repo 內契約**，不引入中央 pack CI、也不做 Worker；後續 CDN 只 cache「manifest＋files[]」即可接上。

---

## 2. 目標

- **遊戲側：** 每個上架／交付的 `pg-*` 根目錄有合法 `sam-manifest.json`。
- **宿主側（本計劃落地後）：** go `/s/`、Invite `/i/` 的 SAM 下載與 tip 比對**只**依 manifest；**不**呼叫 `git/trees`（型錄 game 路徑）。
- **tipRev：** 改為 manifest 的 `rev`（字串），語意對齊現有離線 pack。
- **範圍清晰：** 本階段仍直連 `raw.githubusercontent.com`；**不承諾**消除 raw 429。

---

## 3. 非目標

- Cloudflare Worker／邊緣 cache／R2 懶鏡像／GitHub Pages 產物。
- 中央 CI 打 `.sam` 上傳。
- 改 go 傳閱形狀（仍 `/s/<catalog_id>`；`source` 仍為 GitHub `owner/repo`）。
- 強制場殼「任意 `?open=` GitHub」立刻廢 Trees（場殼可暫留 fallback；**go／`kind: game` 強制 manifest**）。
- 用手維第二份「型錄內嵌檔列表」當權威（權威＝遊戲 repo 的 manifest）。

---

## 4. 契約：`sam-manifest.json`

### 4.1 位置與檔名（硬）

| 項 | 規格 |
| --- | --- |
| 路徑 | 遊戲 repo **根目錄** `sam-manifest.json`（僅此檔名） |
| 編碼 | UTF-8 JSON |
| 公開 | 須可經 raw 讀取（公開 repo） |
| 權威 | **僅此檔**列執行期下載集合；宿主**不得**再掃描整棵 tree 補漏 |

### 4.2 Schema（`version`＝契約版）

```json
{
  "version": 1,
  "rev": "2026-08-17T00:00:00Z",
  "files": [
    "index.html",
    "style.css",
    "app.js",
    "assets/sprite.png"
  ]
}
```

| 欄位 | 型別 | 必填 | 說明 |
| --- | --- | --- | --- |
| `version` | number（整數） | 是 | **Manifest 契約版**；目前僅 **`1`**。宿主遇未知主版 → 明確錯誤，勿猜測 |
| `rev` | string（非空） | 是 | **內容修訂號**；寫入離線 pack 的 `tipRev`；用於 tip 比對與 raw cache-bust query |
| `files` | string[] | 是 | 相對 repo 根的路徑；**至少一筆**且**必須含** `index.html`（或等價唯一入口，見下） |

**入口（硬）：** `files` 必須包含路徑正好為 `index.html` 的一項（與現有「小品入口＝根 `index.html`」一致）。

**路徑規則：**

- 使用 `/` 分隔；**禁止** `..`、絕對路徑、開頭 `/`、空字串。
- 大小寫與 repo 內實際檔名一致（raw 區分大小寫）。
- 同一 path **不得**重複。
- 僅列**執行期**需要進 FileMap 的檔（HTML／CSS／JS／assets 等）。

**建議勿列（減少 raw 次數與噪音）：** `AGENTS.md`、本指南複本、大型僅供人讀的文件、`.gitignore`、測試檔（除非執行期真的要載）。`README.md`／`ATTRIBUTION.md`／`thumbnail.png` **預設不列**——封面進 go 卡面走宿主 `covers:sync`，不靠 runtime 下 thumbnail。

**可列：** `functions.js`（若小品使用自訂 functions）。

### 4.3 `rev` 慣例（硬）

- 每次變更 **`files` 集合**或任一已列檔的**內容**，**必須**更新 `rev`。
- 建議值（擇一，文件化於遊戲 README 即可）：
  - ISO 日期時間／日戳（例：`2026-08-17` 或完整 ISO）
  - 短 commit SHA（agent／作者填入當次提交）
  - 單調整數字串（`"42"`）
- **禁止**長期不 bump 導致玩家「更新遊戲」永遠以為已是最新。

### 4.4 校驗（宿主下載時）

失敗 → 頁內友善錯誤（go 既有 rate-limit／網路文案可沿用類別），**禁止** silent 退回 Trees：

1. HTTP 無法取得 `sam-manifest.json`（含 404）  
2. JSON 無效或缺少必填欄  
3. `version` ≠ 支援的契約版  
4. `files` 空、缺 `index.html`、path 非法、重複  
5. 列表中任一檔 raw 下載失敗（404／429／…）  
6. 檔案數超過宿主上限（對齊現況 `maxFiles` 預設 200，可另調）

---

## 5. 執行期（本階段：無 Worker）

### 5.1 下載

```text
source = catalog entry.source（owner/repo 或 GitHub URL → 解析為 owner/repo）
ref    = main（無 ref 時；與現行 githubProject 預設一致）

1. GET https://raw.githubusercontent.com/<owner>/<repo>/<ref>/sam-manifest.json
2. 解析 → rev, files[]
3. 對 files[] 逐檔（可保留順序進度條）：
     GET …/raw/…/<ref>/<path>?v=<urlencode(rev)>
4. 組成 FileMap；assert 有 index.html
5. tipRev = rev；寫入離線 pack（若可 cache）
```

### 5.2 tip／更新策略（對齊 go §6.5）

| 路徑 | 行為 |
| --- | --- |
| `/s/` local-first | 有同 source 離線包即重用；**不**每次打 tip |
| 「更新遊戲」 | 拉 manifest → 比 `rev`；不同則依 `files[]` 全量（或日後可優化）下載並套用 |
| Invite `/i/` check-tip | 入座前拉 manifest 取 `rev`；與 cached `tipRev` 相符才跳過全量下載 |

**廢止（go／型錄 game）：** 以 Git Trees SHA 當 tip。

### 5.3 與 `fetchGithubProject` 的關係

| 呼叫端 | 落地後 |
| --- | --- |
| go `loadSamFiles`／`fetchSamTipRev` | **只**走 manifest 路徑 |
| 場殼「自 GitHub 複製」／`?open=` 非 game | 可暫留 Trees；若偵測到根目錄有 `sam-manifest.json` 可優先走 manifest（實作可選） |
| Roster lazy-install 型錄 game | 與 go 同：manifest |

### 5.4 本階段明确不治

- raw `429 Too Many Requests`／scraping 限流（瀏覽器仍直連 GitHub）。  
- 後續：allowlist Worker edge cache（另檔）；**不**在本契約加 CI pack 義務。

---

## 6. 遊戲交付義務（權威敘事在指南）

細節與 DoD 勾選見 [PG-GAME-AGENT-GUIDE.md](./PG-GAME-AGENT-GUIDE.md) §2.5／§11。

摘要：

- 新遊戲／重寫：**交付前**必須有合法 `sam-manifest.json`。  
- 新增或刪除執行期檔 → 同步改 `files` 並 bump `rev`。  
- scaffold template 應含範例 manifest（維護者改 [`pg-game-scaffold`](https://github.com/sampot/pg-game-scaffold)；**非**本 playgrounds 任務預設 scope）。  
- 既有上架 game：遷移期由維護者批次補檔；未補前 go 實作可報「來源未就緒」（實作階段定過渡策略）。

---

## 7. 階段

| 階段 | 內容 | 狀態 |
| --- | --- | --- |
| **0. 規格** | 本檔＋指南 §2.5／DoD＋go 計劃交叉連結 | **完成** |
| **1. 宿主實作** | `fetchGithubProjectFromManifest`／`fetchGithubSamTipRev`；go `samLoad` 強制 manifest；Roster 同；場殼 `fetchGithubProject` 優先 manifest、缺則 Trees；TDD | **完成** |
| **2. Scaffold／既有庫** | template 範例；既有 `pg-*` 補 manifest（可分批） | 本機批次：`node scripts/generate-sam-manifests.mjs`（174 款已 push） |
| **3.（可選）CDN** | Worker allowlist cache；另立計劃 | 非本檔 |

---

## 8. 驗收（規格層）

- [x] 指南與本檔對 `version`／`rev`／`files`／入口／勿列項一致  
- [x] go 計劃載入／tip 敘事改為 manifest `rev`，不再寫「GitHub tree SHA」為 game 主路徑  
- [x] 明示本階段無 Worker、raw 429 仍可能  
- [x] （實作後）無 manifest 的型錄 game → 明確錯誤，不 silent Trees  

---

## 9. 修訂紀錄

| 日期 | 變更 |
| --- | --- |
| 2026-08-17 | 初版 Draft：`sam-manifest.json` 契約；go 廢 Trees 列檔；無 Worker |
| 2026-08-17 | Phase 1：`samManifest` 解析＋`fetchGithubProjectFromManifest`／`fetchGithubSamTipRev`；go／Roster 強制；場殼優先 manifest |
