# SAM localStorage 代理相容層規格（PG-LOCALSTORAGE-SHIM）

- 狀態：已實作（2026-08-15 重作：play／go 同合約、應用 key 直映 `env.KV`、即時背景同步）
- 相關決議：DEC-041（Playgrounds 宿主）、DEC-050（go 純玩版 Guest）
- 適用範圍：play shell（`src/`，場網宿主）＋ go shell（`go-client/`，純玩版）
- 目的：讓既有的單頁程式（尤其遊戲）**不呼叫任何 SAM 特有 API**（`env.KV`／`functions.js`／SDK），只要使用標準 `localStorage` 介面，就能在 SAM runtime 上自動持久化到 `env.KV`。

---

## 1. 背景與動機

許多現成的單頁遊戲用 `localStorage` 存最高分、關卡進度、設定。它們不知道 SAM 的 `env.KV` 或 `/api/kv/*` 路由。若要逐一改寫這些程式去用 SAM API，就失去「直接相容」的價值。

本提案在 sandbox 執行上下文（canvas iframe 的 realm）中，**只攔截全域 `window.localStorage`**，將其替換為一個行為相容的 shim；`sessionStorage` 維持瀏覽器原生語意：

- 同步讀取：永遠從 in-memory 快取回傳（與原生 `localStorage` 同步語意一致）。
- 背景回寫：寫入先更新快取，再立即以有序的 fire-and-forget `fetch` 打到宿主既有的 `/api/kv/<key>` 路由（該路由背後就是 `env.KV`），達到重新整理後仍可讀取。

這與 AGENTS.md「Best-effort only；Must not touch authoritative state」的相容層精神一致——shim 是 best-effort，不保證原子性。

---

## 2. 關鍵約束（已從程式碼核對）

### 2.1 同步 vs 非同步（核心矛盾）

| 介面 | 形狀 | 實作 |
|---|---|---|
| `localStorage` | **同步**（`getItem` 直接回傳 string） | 原生 Storage |
| `env.KV` / `/api/kv` | **非同步**（Promise / HTTP） | `createDefaultFunctionsHandler` |

`localStorage` 是同步 API，shim 無法在 `setItem` 內真的等 KV 寫完再回傳。因此 shim **必須是「同步讀 + 同步快取寫 + 非同步背景回寫」**——這是唯一不破壞既有遊戲主迴圈的形狀。把全域改成 async 會讓既有程式 `await localStorage.setItem` 失敗，違反「相容」前提，故**禁止**。

### 2.2 宿主側 `/api/kv/*` 路由兩邊都已現成

- `createDefaultFunctionsHandler`（`src/sam-runtime/defaultFunctionsHandler.ts`）實作：`PUT/GET/DELETE /api/kv/<key>`、`POST /api/kv/list`。
- 契約（取自 `defaultFunctionsHandler.test.ts:106`）：
  - `PUT /api/kv/<key>` body=string → `204 No Content`
  - `GET /api/kv/<key>` → `200` + text body；不存在 → `404`
  - `DELETE /api/kv/<key>` → `204`
  - `POST /api/kv/list` body=`{prefix}` → `200 { keys:[{name}], list_complete, cursor? }`
  - key 含非法字元（如空白，decode 後）→ `404 {code:"not_found"}`
- **play shell**：canvas 經 Service Worker 攔截 `/api/*`，走到 `createFunctionsEnv` 的 `env.KV`（`createMockKvNamespace`）。
- **go shell**：`handleGoFunctionsApi` → `createDefaultFunctionsHandler`，`env.KV` 為 `goWebKv`（IndexedDB + localStorage fallback，`go-client/src/lib/goWebKv.ts`）。

結論：**兩邊的宿主側 KV 路由都現成可用，shim 只需 fetch 到既有 `/api/kv/<key>`，不需新增任何後端路由。**

### 2.3 共用注入點（play 與 go 自動雙邊生效）

- play shell：`injectCanvasBridge()`（`src/components/playgrounds/canvasSwProtocol.ts:585`）把 `CANVAS_BRIDGE_SCRIPT` 注入 canvas HTML `<head>`。
- go shell：`withCanvasBridge()`（`go-client/src/lib/goCanvas.ts:42`）**呼叫同一個** `injectCanvasBridge`（從 `@pg/canvasSwProtocol` 匯入）。

因此把 shim 加進 `injectCanvasBridge` 注入的 script，play 與 go 會**一次生效**，無須各寫一份。

### 2.4 既有衝突：go 的 `injectGoScoreStorage` 已攔截過一次

`go-client/src/lib/goScoreStorage.ts:19` 的 `injectGoScoreStorage` 也攔截 `localStorage`，把 key 加前綴 `pg-go-score:<catalogId>:` 後**仍寫回原生 `window.localStorage`**（瀏覽器本地，非 KV）。

若本 shim 與它同時注入，會形成**兩層攔截**且語意打架（一層寫瀏覽器 localStorage、一層寫 KV）。規格要求：

- 本 shim 為**單一權威攔截**：注入時若偵測到 `data-go-score-ns` 標記已存在，本 shim 不重複包裝（或由 `withCanvasBridge` 決定優先級）。
- 長期目標：讓 `injectGoScoreStorage` 退場，分數儲存改由本 shim 統一代理到 `env.KV`（見 §7 遷移）。在過渡期，go 端必須保證**只有一層**攔截生效（本 shim 優先；`injectGoScoreStorage` 改為 no-op 或在 catalog 分數場景下放寬）。

---

## 3. 目標介面

### 3.1 shim 形狀（完整 `Storage` 介面）

```ts
interface LocalStorageShim {
  getItem(key: string): string | null;        // 同步，從 in-memory 快取
  setItem(key: string, value: string): void;  // 同步寫快取 + 背景 fetch PUT
  removeItem(key: string): void;              // 同步清快取 + 背景 fetch DELETE
  clear(): void;                              // 同步清快取 + 背景 list+delete
  key(index: number): string | null;          // 同步，從快取 keys
  readonly length: number;                    // 同步，快取 key 數
  // 可選：forEach / [Symbol.iterator] 視需要
}
```

`sessionStorage` 不屬於 persistent store，不代理到 `env.KV`。

### 3.2 命名空間

- 應用鍵 **1:1 對應**：`localStorage["high-score"]` 就是 `env.KV["high-score"]`，線上路徑為 `/api/kv/high-score`；不得加 `ls:` 或其他 KV 前綴。
- play 的 `env.KV` 已按 sandboxId 隔離；go 的 `goWebKv` 已按 `catalog:`／`ephemeral:` namespace 隔離。mailbox／alarm／registry／leader 使用獨立 `RuntimeStorage`，不占用應用 `env.KV`。
- 為補足同步 cold-start，宿主可寫 native localStorage 鏡像；這是不可見的實作細節，鍵為 `__pg_kv_mirror__:<encoded app scope>:<application key>`，不得改變應用或 `env.KV` 看到的 key。
- 不提供 IndexedDB shim；`indexedDB` 僅可作宿主實作 `env.KV`／`env.DB` 的儲存介質。

### 3.3 注入契約

- 在 `injectCanvasBridge` 注入的 script 中，於 `CANVAS_BRIDGE_SCRIPT` 之前（或之內）新增 `LOCALSTORAGE_SHIM_SCRIPT`。
- 冪等：script 開頭以 `data-playgrounds-ls-shim` 標記偵測，已注入則跳過。
- 時機：必須在 SAM 程式碼執行**之前**安裝（`Object.defineProperty(window, 'localStorage', { value: shim, configurable: true })`）。

### 3.4 背景回寫（best-effort）

- 寫入流程：更新快取與 scoped native mirror → 立即排入有序寫入鏈 `fetch('/api/kv/'+enc(key), {method:'PUT', body:String(value)})`。
- 錯誤處理：fetch reject / 非 2xx 一律 `console.warn`，**不可**拋同步錯誤（避免破壞遊戲主迴圈）。
- flush 時機：
  - `visibilitychange` → `hidden`：最後一次 flush（best-effort，頁面被 kill 前盡可能寫）。
  - `pagehide` / `beforeunload`：再 flush 一次（navigator.sendBeacon 不可行於 string 長度限制場景時退回 fetch）。
  - 不 debounce：每次 mutation 都立即開始／排入背景同步，並維持呼叫順序；應用不得每幀濫寫 persistent store。
- 讀取一致性：同頁內 `getItem` 永遠從快取走，故寫入立即可見；跨頁則依賴 KV 回寫成功。

### 3.5 初始化還原（cold load）

- shim 安裝後，非同步 `POST /api/kv/list` prefix=`""` 取得該應用 `env.KV` 的全部 keys，回填 in-memory 快取。
- 回填完成前：快取為空，讀取回 `null`（與原生 localStorage 首次行為一致，可接受）。
- 回填與本地快取寫入的 race：先寫本地優先（本地寫代表使用者當前意圖），list 回填只補「本地沒有」的 key。

---

## 4. 與既有 SAM 持久化的分工

```
既有單頁遊戲 ──localStorage 同步 API──▶ shim（快取 + 即時有序 PUT）
                                        │
                                        └──▶ /api/kv/<key> ──▶ env.KV
                                                                  │
SAM Controller ──原生 bindings──▶ env.KV ◀────────────────────────┘
```

- shim **只服務**不想碰 SAM API 的第三方程式。
- `functions.js`／`controller.js` 使用同一應用 `env.KV`，因此可用同名 key 讀到 localStorage 寫入值。mailbox／alarm 等 runtime state 走獨立 `RuntimeStorage`。
- shim **不**寫入 SAM runtime 的 authoritative state（符合 `instance.ts:111` 註解）。

---

## 5. 限制與風險

1. **同步 API 不等於同步 durability**：`setItem` 回傳時記憶體與 native mirror 已更新，但 KV HTTP 寫入仍在背景；頁面被強制 kill 時最後一筆仍可能未完成。若需可等待的強一致邊界，SAM 應直接使用 `/api/kv`／`env.KV`。
2. **多實例併發**：SAM 多實例（如 `ping-a`/`ping-b`）共享 KV 時，in-memory 快取會有寫衝突。遊戲場景通常單實例，先不處理，但文件須標註。
3. **配額**：`QuotaExceededError` 在 fire-and-forget 路徑轉為 `console.warn`，不拋同步錯。
4. **go 雙層攔截**（§2.4）：過渡期必須保證只有一層生效。
5. **跨域**：canvas 與宿主同 origin（`/canvas/`），fetch `/api/kv` 不需 CORS；若是異源嵌入需另行處理（目前兩 shell 皆同 origin）。

---

## 6. 實作落點（最小變更）

| 檔案 | 變更 |
|---|---|
| `src/components/playgrounds/canvasSwProtocol.ts` | `LOCALSTORAGE_SHIM_SCRIPT`（go SW／memory canvas）；`injectCanvasBridge` 與 `CANVAS_BRIDGE_SCRIPT` 一起注入 head，並帶 stable app scope。 |
| `public/sw.js` | play canvas 注入相同 rev／同合約 shim；scope＝sandboxId。 |
| `go-client/src/lib/goCanvas.ts`（`withCanvasBridge`） | 不需改——共用 `injectCanvasBridge`。僅確認 `injectGoScoreStorage` 在 go 端不與本 shim 雙重生效（見 §2.4／§7）。 |
| `go-client/src/lib/goScoreStorage.ts` | 過渡期：catalog 分數場景下放寬或改 no-op，避免雙層攔截（§7）。 |
| 測試 | `canvasSwProtocol.test.ts` 驗證 play／go 同 rev 與無 KV 前綴；`localStorageShim.test.ts` 驗證同步讀、key 直映、立即有序 PUT、cold-load／clear；go 端驗證 built-in KV 與 catalog 單獨清除。 |

> 注意：本規格為相容層，**新增可執行程式邏輯須 TDD**（AGENTS.md）。先寫失敗測試（shim 行為 + 注入），再寫實作，最後重構。

---

## 7. 遷移路線（go 雙層攔截收斂）

1. 本 shim 上線後，`injectGoScoreStorage` 在 go 端改為：若 `data-playgrounds-ls-shim` 已注入則 no-op；否則維持舊行為（向下相容舊場）。
2. catalog 分數場景：分數 key 直接走本 shim 的 `localStorage`，以同名 key 代理到 catalog-scoped `goWebKv`；`clearGoProgressForCatalog` 清該 catalog KV／DB 與該 scope 的 native mirror，不影響其他遊戲。
3. 舊 `pg-go-score:` 前綴的 localStorage 殘留由 `clearAllGoScores` 保留一段時間後退場。

---

## 8. 驗收標準（Definition of Done）

- [x] play 與 go 兩 shell 注入 rev 3 同合約 shim，無重複標記。
- [x] 應用 localStorage key 與 `env.KV` key 1:1，不加 `ls:`。
- [x] `getItem`/`setItem`/`removeItem`/`clear`/`key`/`length` 保持同步介面；mutation 立即排入有序 KV 同步。
- [x] 背景回寫失敗（離線／404）只 `console.warn`，不中斷遊戲。
- [x] go 舊 `injectGoScoreStorage` 不在 mount 路徑；native mirror 按 catalog scope 隔離。
- [x] 應用可用 plain `high-score`（無需自加 catalog／game 前綴）；清除 pg-breakout 不影響其他 catalog。

---

## 9. 待決議事項

1. `sessionStorage` 不映射 persistent KV，維持原生 session 語意。
2. `clear()` 需 list + 逐個 DELETE；此成本等同清空該應用 `env.KV`，大型資料集應直接用 KV API 管理。
3. cold-start 以 app-scoped native mirror 提供同步值，KV hydrate 為權威回填；未來若移除 mirror，才需另議 ready gate。
