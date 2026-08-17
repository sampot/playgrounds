# SAM 型錄結構化資料／Playgrounds 查詢（草案）

> **狀態：** Phase 0–4 **已落地**  
> **權威決策：** [DECISIONS.md](./DECISIONS.md) **DEC-046**（Draft→實作中）  
> **相關：** [PG-CATALOG-PLAN.md](./PG-CATALOG-PLAN.md)（YAML 權威／`/sam/`）、[PG-CATALOG-UX-PLAN.md](./PG-CATALOG-UX-PLAN.md)（人機 UX）、[PG-GO-CLIENT-PLAN.md](./PG-GO-CLIENT-PLAN.md)（§5.8 卡面封面）、[PG-GAME-AGENT-GUIDE.md](./PG-GAME-AGENT-GUIDE.md)（§2.4）、DEC-023（session 邀請＋型錄 lazy install）、DEC-025（`?open=`）、DEC-041／045、[GLOSSARY.md](./GLOSSARY.md)

一句話：**`catalog:gen` 在產生 `/sam/` 所用 typed module 之外，同步產出版本化 JSON；Playgrounds 以同一權威查詢型錄（含 lazy install 解析），不刮網頁、不另開 CMS。**

---

## 動機

- `/sam/` 是給人看的型錄頁；session 邀請（DEC-023）與 Roster lazy install（DEC-045）需要**機器可查**的型錄：依 id／source／（後段）protocol 規格找相容 SAM。
- 現況已有 `samCatalog.generated.ts`，但契約上主要服務頁面與 picks；缺正式「結構化產物＋查詢面」與靜態可 fetch 的 artifact。
- 型錄項應視為 **虛擬可用**（尚未安裝≠無能力）；查詢面必須能回答「型錄裡有沒有相容項」，再觸發 install。

## 目標

- 建置時自 `catalog/**/*.yaml` **一次**產出：
  1. 既有 typed module（`/sam/`＋殼內 import）
  2. **版本化 JSON**（同源靜態路徑，供殼／SW／除錯 fetch）
- Playgrounds 提供穩定 **查詢 API**（程式面；非產品 CMS）。
- 與 DEC-023 邀請解析對齊：匹配已安裝或型錄項 → 必要時 lazy install。

## 非目標

- CMS、後台編輯、執行期爬 GitHub 填型錄。
- 另設 `PUBLIC_CATALOG_URL` 外站權威（本場 YAML＋建置產出仍是權威）。
- 本草案強制每筆 YAML 立刻宣告 session protocol（後段欄位；未填則僅能靠 id／source 匹配）。
- 型錄伺服器端搜尋引擎／向量檢索。

---

## 權威與產物

| 層 | 位置 | 角色 |
| --- | --- | --- |
| 來源權威 | `catalog/entries/*.yaml`＋`series.yaml`／`picks.yaml`／`page.yaml` | 人與 PR 投稿 |
| 建置 | `npm run catalog:gen` | 單一 codegen；兩邊產物同源、同一次跑 |
| 頁面／殼 import | `src/data/samCatalog.generated.ts`＋`samCatalog.ts` | Astro `/sam/`、殼內同步查詢 |
| 結構化 artifact | **`public/catalog/v1.json`**（建置寫入；部署後 URL＝**`/catalog/v1.json`**） | 可 fetch 的機器副本；schema 見下 |

**硬約束：** JSON 與 typed module **必須**由同一 gen 步驟寫出；CI 對兩者做 `git diff --exit-code`（或等價檢查）。禁止手改 generated 檔。

---

## JSON schema（v1）

頂層：

```json
{
  "v": 1,
  "kinds": [{ "id": "tool", "label": "工具" }, "..."],
  "series": { "tool": ["流程", "..."], "agent": [], "game": [], "toy": [], "media": [] },
  "picks": ["pg-breakout", "..."],
  "page": { "title": "...", "description": "...", "lede": "...", "footnote": "..." },
  "entries": [ /* SamCatalogEntryV1 */ ]
}
```

（可選 `generatedAt` **不**寫入 committed 產物，避免每次 gen 時間戳造成 CI drift。）
`entries[]` 每筆（與現 YAML／GeneratedSamEntry 對齊；`draft` 不進產物）：

| 欄位 | 必填 | 說明 |
| --- | --- | --- |
| `id` | 是 | 穩定 id（檔名 stem） |
| `title` | 是 | 顯示名 |
| `kind` | 是 | `tool`｜`agent`｜`game`｜`toy`｜`media` |
| `series` | 是 | 系列字串 |
| `blurb` | 是 | 一句話 |
| `source` | 是 | `owner/repo` 或 GitHub／GitLab URL（`?open=`） |
| `status` | 是 | `listed`（預設）｜`unlisted`（登錄／可 resolve，不進 `/sam/` 瀏覽） |
| `license` | 否 | 如 MIT |
| `protocols` | 否 | 此 SAM 宣告可參與的 session protocol 摘要；省略＝不參與 protocol 匹配 |
| `cover` | 否 | 產品內卡面圖之**站內相對路徑**（例 `/covers/pg-breakout.png`）。**僅**當宿主已同步靜態檔時由 gen／covers 腳本寫入；YAML **不**手填。無此欄＝UI 用系列 icon。契約見 [PG-GO-CLIENT-PLAN §5.8](./PG-GO-CLIENT-PLAN.md)、[PG-GAME-AGENT-GUIDE §2.4](./PG-GAME-AGENT-GUIDE.md)。**≠**離線就緒；**≠** `og:image` |

**`status`：** `listed`＝人機型錄與推薦；`unlisted`＝機器登錄（`/catalog/v1.json`、go `/s/<id>`、protocol 匹配）但不出現在 `/sam/`／go 首頁推薦。YAML `draft` 不寫入產物。

**`protocols`：** 陣列，元素至少含 `protocolId`、`apiVersion`；可含 `roles[]`。用於邀請附完整規格時的型錄匹配。未宣告則 **不**假裝支援任意 protocol——匹配只能靠明確 id／source，或本機已安裝 SAM 的 **`sam:protocol` head**（Phase 4）。

**`cover`：** 來源權威＝已提交之靜態 **`/covers/<id>.png`**（go `go-client/static/covers/`；play 若共用可鏡像同 path）。遊戲 repo 根 `thumbnail.png` 只是作者側慣例；**必須**經維護同步進宿主靜態後，產物才帶 `cover`。首頁／推薦**禁止** runtime 向 GitHub 取圖。

本機 head：`<meta name="sam:protocol" content="…">`，逗號分隔 token：`protocolId[@apiVersion][:role[+role…]]`；省略 `@apiVersion` 時視為 `"1"`（與既有 `brainstorm.v1` 狗糧相容）。

`v` 僅在破壞性變更時遞增；新增選用欄位不升版。

---

## Playgrounds 查詢面

### 同步（同建置、優先）

殼／runtime 經 `src/data/samCatalog.ts`（或後續 `catalogQuery.ts`）：

| 方法（名稱可調） | 行為 |
| --- | --- |
| `listCatalogEntries()` | 公開 listed（`/sam/`） |
| `listRegisteredCatalogEntries()` | listed＋unlisted |
| `getCatalogEntry(id)` | 依 id（含 unlisted） |
| `findCatalogBySource(source)` | 正規化後比對 `source`（含 unlisted） |
| `matchCatalogForProtocol(spec)` | 依邀請 protocol 規格對 `entries[].protocols` 做相容匹配；回傳 0..n 候選（`catalogId`／`source` hint 僅排序） |
| `resolveCatalogInviteCandidates(spec)` | 僅型錄（＝`matchCatalogForProtocol`）；不安裝 |
| `matchInstalledForProtocol`／`resolveInviteCandidates` | 合併型錄＋本機 head 探測結果（`sandboxId` 已安裝優先） |
| `probeInstalledSamProtocols`／`resolveInviteCandidatesWithInstalled` | 殼側：讀 OPFS `index.html` head 再合併（`catalogInviteResolve.ts`） |

既有 `samCatalog`／picks／byKind helpers 可保留；新查詢宜集中、可測。

### 非同步（可選）

- `GET /catalog/v1.json`（同源）：SW、除錯、或未捆進某 chunk 的路徑。
- **權威仍是建置產物**；fetch 失敗時同場應回退到捆進的 generated 資料，勿改抓外站。

### Lazy install 銜接（DEC-023）

接受 session 邀請時：

1. 用邀請內 **完整 protocol 規格**（及可選建議 `source`／catalog id）呼叫查詢面。
2. 已安裝相容 SAM → 開／dehibernate 入座。
3. 僅型錄命中 → **lazy install**（`?open=`／既有匯入管線）再入座。
4. 無候選／使用者拒 → 拒絕邀請。

型錄查詢 **不**執行 install；只回答「虛擬可用集合裡誰相容」。

---

## 與 `/sam/` 的關係

| | `/sam/` 人機面 | `/catalog/v1.json`＋查詢 API |
| --- | --- | --- |
| 讀者 | 人類 | Playgrounds／機器／go |
| 資料 | 同 gen 的 **listed** | 同 gen 的 **listed＋unlisted** |
| UX | 一鍵開、搜尋／陳列（見 [PG-CATALOG-UX-PLAN.md](./PG-CATALOG-UX-PLAN.md)） | 解析、匹配、lazy install、go `/s/<id>` |

頁面 **不**再當機器權威（勿 scrape HTML）。`unlisted` 僅深鏈／機器解析可見。

---

## 階段（建議）

| Phase | 內容 | 完成定義 | 狀態 |
| --- | --- | --- | --- |
| **0. 契約** | 本計劃、DEC-046、GLOSSARY；修訂 PG-CATALOG-PLAN | 產物路徑／schema v1／查詢面無歧義 | **完成** |
| **1. Emit JSON** | `catalog:gen` 寫 `public/catalog/v1.json`；CI 雙產物 | 與 typed module 欄位一致；部署可 `GET /catalog/v1.json` | **完成** |
| **2. Query API** | 殼內 `listCatalogEntries`／`getCatalogEntry`／`findCatalogBySource`；測例 | session／open 路徑可程式查型錄 | **完成** |
| **3. Protocol 欄位** | YAML 可選 `protocols`；`matchCatalogForProtocol`／`resolveCatalogInviteCandidates`；狗糧 `pg-llm-agent` | 邀請規格 → 型錄候選 | **完成** |
| **4. 本機 head** | 自已安裝 SAM `sam:protocol` 探測，與型錄合併（`resolveInviteCandidates`） | 未列型錄的本機 SAM 仍可匹配；已安裝優先於 lazy install | **完成** |

---

## 修訂紀錄

| 日期 | 變更 |
| --- | --- |
| 2026-08-05 | 初稿：typed module＋`/catalog/v1.json` 雙產物；查詢面；lazy install 銜接 |
| 2026-08-05 | Phase 1–2 落地：`catalog:gen`→`public/catalog/v1.json`；query API＋CI 雙產物；省略 committed `generatedAt` |
| 2026-08-05 | Phase 3：YAML `protocols`；`matchCatalogForProtocol`；`pg-llm-agent` 宣告 `coding-orchestration.v1` |
| 2026-08-05 | Phase 4：`sam:protocol` 結構化解析；`resolveInviteCandidates`＋OPFS probe |
| 2026-08-06 | 交叉引用 [PG-CATALOG-UX-PLAN.md](./PG-CATALOG-UX-PLAN.md)；人機／機器分工表更新 |
| 2026-08-17 | 可選欄位 `cover`（靜態 `/covers/<id>.png`；非 YAML 手填；≠離線／OG） |
