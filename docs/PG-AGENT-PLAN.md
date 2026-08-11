# Playgrounds Agent Runtime 實作計劃

本檔是把「可當現行 Agent 的那類單頁小程式（SAM）」從最小迴圈提升到好用的落地計劃。沙盒主軸仍是開發輕量 Web（DEC-016）；Agent 只是其中一種 SAM（DEC-017）。權威決策以 [DECISIONS.md](./DECISIONS.md) **DEC-016**／**DEC-017**／**DEC-018**／**DEC-019** 為準；本檔管階段、API 表面、完成定義與狀態。實作前請一併讀 [AGENTS.md](./AGENTS.md)、[GLOSSARY.md](./GLOSSARY.md)。

一句話：**遊樂場提供穩定、可探測的 `env.HOST` 與持久化 bindings；Agent 本身仍是可複製的單頁小程式（SAM）——用途可不限 coding，但沙盒不是「Agent 專用 IDE」。**

**Runtime MVP（Phase 0–5）已完成。** Phase 6+ 是「讓 agent 對使用者更有價值」的增值能力：更密的觀察、瀏覽器內 compute、資料／二進位 bindings。**不**經 HOST 接 v86／互動 Linux TTY（見 DEC-019；v86 已移除）。WASI 專案 Shell 與非互動 `HOST.runCmd`（瀏覽器 Wasm＋WASI only）另見 [PG-SHELL-PLAN.md](./PG-SHELL-PLAN.md)／DEC-021——**不**併入本檔 Phase 表。長時間互動的**擴展工具**（Editor 槽、`env.TOOL`、grant）另見 [PG-TOOLS-PLAN.md](./PG-TOOLS-PLAN.md)／DEC-022——**不**併入本檔 Phase 表（Agent 僅後段 `openTool`）。**大 SAM 檔案導航**（`HOST.listDir`、開場清單、Files 過濾）另見 [PG-FILE-NAV-PLAN.md](./PG-FILE-NAV-PLAN.md)／DEC-027——**不**併入本檔 Phase 表；與 Phase 2 `search`／Phase 12 hygiene 互補。

---

## 目標與非目標

### 目標

- 讓「設為現行 Agent 的單頁小程式（SAM）」能對**工作沙盒**做可靠的觀察—行動迴圈（範本示範：改檔 → 重載畫布 → 讀 console／狀態；其他用途可 clone 後改 prompt／工具）。
- `env.HOST` 成為版本化、機器可讀錯誤、可探測能力的契約。
- 對話／scratch／checkpoint 可跨分頁重整存活（不依賴本站後端）。
- 範本 Agent（[`pg-steward`](https://github.com/sampot/pg-steward) 總管／遊樂場內建 `agentBaseStarter`）工具面與 HOST 對稱，並能續跑 session；**技能**（prompt／playbook）可依用途分叉——不限 coding。
- **Phase 6+：** 補強觀察（network／DOM）、獨立 compute（Python）、二進位產物與仿 D1／Secrets——仍全在瀏覽器。

### 非目標（本計劃不破既有決策）

- 把沙盒主軸改成 Agent 開發平台（主軸仍是單頁小程式／SAM，見 DEC-016／017）。
- 本站 LLM proxy、帳號、雲端專案同步（DEC-001／017）。
- 非現行 Agent 取得 `HOST`，或畫布 `postMessage` 繞過 `functions.js`。
- 把 Playgrounds 登錄進 `/tools/` 或要求介紹文才能上線。
- 完整雲端 IDE、多租戶隔離、預設開放的 VM／shell 遠端執行。
- **`HOST.shell`／真 Linux guest**（DEC-019）：**已移除** v86 面板；人類用下方 **Python REPL**；不列入 agent 工具面。
- 通用 CORS proxy／站內代抓外網；完整 Node／WebContainer；任意 micropip 無上限。
- 遊樂場內建多套「官方 Agent 產品」目錄——特定功能＝另做一個 SAM 沙盒再設為現行 Agent。

---

## 現況基線（2026-07-31；Phase 0–5 後）

| 能力 | 狀態 |
| --- | --- |
| 雙執行面、HOST v1、觀察迴圈、search、`expectedHash` | **已有**（DEC-017／018） |
| Durable KV、session、checkpoint | **已有** |
| 範本 Agent：tools 對齊 HOST、可續跑、可中止、串流、Markdown（mermaid／數學）、UX Round 2（BYOK／佇列／改檔可見） | **已有**（未做 `applyPatch`；舊 Agent 需套用最新範本） |
| Network log／DOM snapshot／截圖 | network／DOM／`captureCanvas` **已有** |
| Python／JS 獨立 compute binding | **`runPython` 已有**；`runJs` **無** |
| 仿 D1／Secrets／二進位 FS API | **已有**（DEC-020；二進位 Phase 8） |
| Python REPL 面板（人類用） | **已有**；與 `HOST.runPython` 同 Worker；**不**經 HOST 暴露 shell（DEC-019） |

契約參考：[playgrounds-host-api.md](./playgrounds-host-api.md)。

---

## 設計原則

1. **HOST 唯一正式通道**：Agent UI → `fetch("/api/…")` → 該專案 `functions.js` → `env.HOST`。
2. **三層持久化語意要分開**：
   - **OPFS 專案檔**：工作／Agent 原始碼（權威）。
   - **Durable store**（KV 或專案內 `.agent/`）：session、記憶、checkpoint 索引。
   - **localStorage**：僅 BYOK 金鑰（不變）。
3. **契約版本化**：遊樂場升級不可默默弄斷舊 Agent 沙盒；用 `apiVersion` + `capabilities()`。
4. **錯誤機器可讀**：沿用 `HostBridgeError.code`；HTTP 一律 `{ error, code }`。
5. **觀察訊號優先於工具堆砌**：先讓「改完看得到結果」穩定，再加 FS 方言；Phase 6+ 同理——先 network／DOM，再 compute／DB。
6. **遊樂場薄、SAM 厚**：runtime 能力進 HOST／bindings；Agent 仍是單頁小程式——推理策略、playbook、用途定位都在該專案裡（可複製迭代；不限 coding）。
7. **工具 vs 技能**：遊樂場保證可探測能力＝工具；Agent 沙盒 system prompt／標準劇本／`.agent/` 慣例＝技能（可不改 HOST 先試另一種用途）。
8. **瀏覽器內、可釘版**：大型執行期（Pyodide 等）走 CDN＋釘版本，對齊 DEC-015 精神；不把整份 runtime 打進本站 bundle。

---

## 目標 Host API 表面

### v1（已落地）

路徑慣例：範本 `functions.js` 薄路由到 `/api/host/…`；遊樂場 `HostBridge` 為權威實作。

```
apiVersion | capabilities
listProjects | getProject | createProject | cloneProject | deleteProject | openProject
get/setActiveAgent | get/setTargetProject
listFiles | readFile | writeFile (expectedHash?) | mkdir | remove | search
reloadCanvas | getConsole | clearConsole | waitConsole | getCanvasStatus
checkpoint | listCheckpoints | restore
```

**禁止（維持 DEC-017）**：經 HOST 寫入**現行 Agent**專案；非現行 Agent 不得注入 `HOST`。

### v1 增值（Phase 6+；實作時以 `capabilities()` 誠實揭露）

```
getNetworkLog({ since? })
clearNetworkLog()
getDomSnapshot({ maxChars? })   # 精簡 a11y／外層 HTML 摘要，非完整 page source
# （Phase 6 已落地）

# Phase 7 — compute（已落地 runPython；runJs 未做）
runPython({ code, packages? })  # Worker + 釘套件清單；stdout／stderr／result
# 可選：runJs({ code }) 於隔離 Worker

# Phase 8 — 二進位／產物（已落地）
readFileBase64 | writeFileBase64
openFile(path)                   # 遊樂場編輯器／媒體預覽（圖檔等）
captureCanvas({ path? })        # 工作畫布截圖 → OPFS（或回傳 base64）

# Phase 9 — bindings（已落地；Secrets 見 DEC-029／035）
# env.DB 形（sql.js + OPFS）
# env.secrets.<NAME>.get() — SecretStore 獨立 binding（須 unlock；不進 .sam）
# env.vars — 沙盒 .env（DEC-035）
# HOST.getSecretStoreStatus() / listSecrets()（listSecretNames 相容）

# Phase 10 — 高權力／可選（預設關或 capability 探測）
evalInCanvas({ expression })    # 僅工作畫布
applyPatch(path, unifiedDiff)   # Phase 2 未做項

# 明確不做
# HOST.shell / v86 guest 控制
```

---

## 落地階段

| 階段 | 主題 | 完成定義 | 狀態 |
| --- | --- | --- | --- |
| **0. 契約** | API 版號、capabilities、錯誤碼文件、starter 工具對齊既有 HOST | 文件入 `docs/`；單元測試；新範本可呼叫全部既有 host 路由 | **已完成** |
| **1. 觀察迴圈** | clear／wait console、canvas status；system prompt 標準劇本 | Agent 可「reload → wait → 讀狀態」而不燒光步數 | **已完成** |
| **2. 搜尋與安全寫入** | `search`；可選 revision 鎖或 `applyPatch` | 大專案不必逐檔讀；覆寫衝突可偵測 | **已完成**（`search` + `expectedHash`；未做 applyPatch） |
| **3. Durable KV** | KV 改 OPFS 後端；clone 語意定案 | 重整分頁後 KV 仍在；測試覆蓋 | **已完成** |
| **4. Session／Checkpoint** | `.agent/` 或 KV session；checkpoint／restore | 對話可續跑；實驗可回滾 | **已完成**（session 走 Durable KV；checkpoint 走 OPFS） |
| **5. 範本體驗** | 步數／取消／截斷／開場 context；串流可選 | 新建立的 Agent 沙盒開箱即用上述能力 | **已完成**（串流＋MD 見 Phase 10 部份） |
| **6. 觀察補強** | network log、DOM snapshot；範本驗證劇本 | Agent 能除錯 fetch／看結構，不必猜 console | **已完成** |
| **7. Compute** | `runPython`（Pyodide Worker）；可選 `runJs` | 數據／公式可獨立驗證；不依賴整頁 reload | **已完成**（`runPython`；未做 `runJs`） |
| **8. 二進位與截圖** | base64 讀寫、`captureCanvas` | Python 出圖與 Visual 迴圈有落點 | **已完成** |
| **9. DB／Secrets** | 仿 D1；Secrets→DEC-029 SecretStore | 有狀態 API／需密鑰 demo 可跑 | **已完成**（Secrets 繼任 SECRETSTORE） |
| **10. 高權力可選** | `evalInCanvas`、`applyPatch` | 有痛點再開；預設關或可探測 | **擱置** |
| **11. 範本 UX Round 2** | BYOK 開箱、佇列／重試、改檔可見、工作沙盒標示 | 見下方 Phase 11；多半只改 `agentStarter` | **已完成** |
| **12. Context hygiene** | 字元預算、tool stub、輪次 digest、`.agent/memory.md`；**否決** Embedding RAG | 長對話不整包燒光 context；見 DEC-026 | **已完成** |
| **12b. Scheme A 工作記憶** | 專用 plan／memory 工具、種子檔、開場 task focus、UI 雙頁籤 | 單 HOST 分任務可執行（非子代理） | **已完成** |
| **—** | `HOST.shell` + v86 | — | **否決；v86 已移除** |

狀態欄：`待開發`／`進行中`／`已完成`／`擱置`／`否決（agent 路徑）`。

---

## Phase 0 — 契約與對稱

### 範圍

- `HostBridge` 增加 `apiVersion()`、`capabilities()`（回傳目前已實作能力清單）。
- 文件：本計劃 + 精簡 **Host API 參考**（可附本檔附錄，或另檔 `docs/playgrounds-host-api.md`；實作時二選一，避免重複真相）。
- 範本 `agentStarter`：
  - TOOLS 對齊既有 HOST：`mkdir`、`remove`、`list_projects`、`get/set_target`、`clone`（及既有 list／read／write／reload／console）。
  - `functions.js` 路由與 TOOLS 同步。
  - system prompt 寫明禁止改現行 Agent、標準驗證順序（先簡述；Phase 1 再補 wait）。
- HTTP／bridge 錯誤：確保 `code` 傳到 JSON（已有雛形則補測試）。

### 主要觸及檔案

- `src/components/playgrounds/hostBridge.ts`
- `src/components/playgrounds/shellHostBridge.ts`
- `src/components/playgrounds/agentStarter.ts`（+ test）
- `src/components/playgrounds/hostBridge.test.ts`
- `docs/PG-AGENT-PLAN.md`（本檔狀態）
- 可選：`docs/playgrounds-host-api.md`、[DECISIONS.md](./DECISIONS.md) **DEC-018**（Host API v1／Durable KV 定案時再寫）

### 完成定義

- [x] `capabilities()` 含當前已實作鍵；未實作能力不出現。
- [x] 新建立的範本 Agent 可用工具覆蓋 Phase 0 所列 HOST 方法。
- [x] 單元測試：capabilities、錯誤碼、starter 字串含關鍵路由。
- [x] 本檔 Phase 0 標為已完成。

---

## Phase 1 — 觀察迴圈

### 範圍

| API | 行為 |
| --- | --- |
| `clearConsole()` | 清空工作畫布 console ring buffer |
| `waitConsole({ since, timeoutMs, match? })` | 遊樂場輪詢至新行／符合 match 或逾時；回傳 `{ lines, timedOut }` |
| `getCanvasStatus()` | 至少：是否有工作沙盒、canvas generation、buffer 長度、最近是否有 `error` level |

- 範本：新增對應 tools；system prompt 定標準劇本：`write` → `reload_canvas` → `wait_console`／`get_canvas_status`。
- 可選：Agent UI／遊樂場支援中斷進行中的 wait（AbortSignal）。

### 完成定義

- [x] 上述三 API 有單元測試（buffer／timeout／match）。
- [x] 範本預設步數上限提高到可設定（建議預設 16–24；設定可調）。
- [x] 手動：用範本改工作沙盒一檔，能穩定讀到 reload 後 console。

---

## Phase 2 — 搜尋與安全寫入

### 範圍

**必做：`search`**

- 只掃 target 專案 UTF-8 文字檔；二進位跳過。
- 參數：`query`（字串或簡單 substring；初版不必上 regex 旗標地獄）、可選 `glob`、`maxResults`（硬上限防爆）。
- 回傳：`{ matches: [{ path, line, text }] }`（text 截斷）。

**選做（同階段或緊接）：安全寫入**

- 方案 A：`writeFile` 加可選 `expectedHash`（內容 hash；不符拋 `conflict`）。
- 方案 B：`applyPatch(path, unifiedDiff)`；失敗回 `patch_failed` + 提示。

初版建議先 A（實作較薄）；B 有明確痛點再加（→ Phase 10）。

### 完成定義

- [x] `search` 測試含：命中、二進位跳過、maxResults、空專案。
- [x] 若做 revision 鎖：衝突碼穩定、starter 可選用。
- [x] `capabilities` 更新。

---

## Phase 3 — Durable KV

### 範圍

- 將 `mockKv.ts`（或後繼模組）後端改為 **OPFS**（建議根：`playgrounds-kv/<projectId>/` 或等價），API 形狀維持 Cloudflare KV 近似（`get`／`put`／`delete`／`list`）。
- **語意**：同一 origin、同一 `projectId`，重整分頁後資料仍在。
- **clone 專案**：預設**不**複製 KV／DB／Secrets（避免 session／密鑰汙染）；UI 與 HOST `cloneProject(..., { state })` 可顯式選擇要複製的 store（DEC-018 有狀態 SAM 搬動）。
- 刪除專案時一併清除該 projectId 的 KV 目錄（既有 `clearMockKv` 語意延伸）。
- 記憶體實作可留作測試 double，或測試改打 OPFS polyfill／注入 store。

### 完成定義

- [x] 重整後 KV round-trip 測試或可重複的手動腳本說明。
- [x] clone 後新沙盒 KV 為空（預設）。
- [x] 更新 DEC-016／另立 DEC-018：註明 KV 已 durable；介紹若有對外敘事一併改。
- [x] [GLOSSARY.md](./GLOSSARY.md) 必要時補「Durable KV（沙盒）」。

### 風險

- OPFS 配額與大量小 key：list／UI 不必暴露全部；agent 自律。
- 舊分頁仍握著舊 in-memory Map：升級後應只走 durable 路徑，避免雙後端。

---

## Phase 4 — Session 與 Checkpoint

### 範圍

**Session（範本層為主）**

建議 Agent 沙盒慣例（範本內建）：

```
.agent/
  sessions/<id>.jsonl   # 對話與 tool 摘要
  memory.md             # 可選跨 session 筆記
```

或等價寫入 Durable KV（`session:current` 等）。續跑時載入 transcript；**送給模型時**過長則 stub 舊 tool 結果／digest 舊輪次（Phase 12／DEC-026；UI transcript 仍可完整保留）。

**Checkpoint（遊樂場 HOST）**

- `checkpoint(label?)`：對 **target** 專案做快照（OPFS 複本或 zip 進 `.agent/checkpoints/`／遊樂場管理的 checkpoint store）。
- `restore(id)`／`listCheckpoints()`。
- **不可**對現行 Agent 沙盒 checkpoint-寫回成「熱改自己」的後門；restore 目標仍受 `assertNotWritingActiveAgent` 約束。

### 完成定義

- [x] 範本：關閉分頁再開，能繼續同一對話（BYOK 設定仍在 localStorage）。
- [x] 範本：多組對話 session（KV index + 切換／新對話／清空／刪除）；舊單 key `agent:session:v1` 會遷移。
- [x] 對話 session **per work project**（KV key 含 `workProjectId`）；遊樂場切換專案時 Agent iframe 換載該專案 history；舊未 scoped 的 `agent:sessions:index:v1` 會遷入首次開啟的專案。
- [x] checkpoint → 改檔 → restore 可回到快照（測試或手動清單）。
- [x] 沙盒包裹（`.sam`）export 是否包含 `.agent/`：預設**包含**；文件註明。KV／DB／Secrets 是否進沙盒包裹：預設**否**；匯出／匯入 UI 可勾選寫入／還原 `.playgrounds-state/`（checkpoints 仍不進包裹）。

---

## Phase 5 — 範本體驗打磨

### 範圍（多半只改 `agentStarter`）

- 開場 context pack：可選自動 `list_files` + 讀 README／短說明檔。
- Tool 結果給模型前截斷 + `truncated` 標記（與 UI 截斷分開）。
- 可取消進行中的 agent 回合（Abort）。
- 串流 chat＋Markdown（含 mermaid／數學）：→ **Phase 10（已完成）**。
- 可選：`.agent/plan.md` todo 工具，長任務用。

### 完成定義

- [x] 新「建立 Agent」開箱具備 Phase 0–4 已完成能力。
- [x] 既有使用者已建立的舊 Agent 沙盒：**不強制遷移**；文件說明可「再建立範本」或手動抄路由。可選提供「以範本覆寫 functions／app」進階動作（非必須）。

---

## Phase 6 — 觀察補強

**為何先做：** 現有 console 迴圈對「靜態頁＋`console.log`」夠用；對 API／CORS／DOM 結構仍常瞎猜。觀察訊號的 ROI 高於再堆 FS 方言。

### 範圍

| API | 行為 |
| --- | --- |
| `getNetworkLog({ since? })` | 工作畫布 `fetch`（經 bridge 改寫之 `/api/…` 與同源請求）摘要：method、url、status、時序、可選截斷 body 提示；ring buffer + `since` |
| `clearNetworkLog()` | 清空 buffer |
| `getDomSnapshot({ maxChars? })` | 向**工作畫布**要精簡 accessibility tree 或外層 HTML 摘要（硬上限字元）；失敗回機器可讀碼 |

- 畫布側：輕量 bridge（與既有 console 轉送同模式），**不**把完整 DOM／機密表單值預設送出（可剝 `value`／password）。
- 範本技能（system prompt）：標準劇本延伸為 `reload` → `wait_console`／`get_canvas_status` → 必要時 `get_network_log`／`get_dom_snapshot`。
- **不做：** 通用外網 proxy；記錄跨 origin 明文 cookie。

### 主要觸及檔案

- 畫布 bridge／console 轉送相關模組、`hostBridge.ts`、`shellHostBridge.ts`、`hostCapabilities.ts`、`agentStarter.ts`（+ test）
- [playgrounds-host-api.md](./playgrounds-host-api.md)

### 完成定義

- [x] `getNetworkLog`／`clearNetworkLog`：單元或可重複手動——reload 後能看到至少一筆工作沙盒 `/api` 呼叫摘要。
- [x] `getDomSnapshot`：有字元上限與剝敏；capabilities 含新鍵。
- [x] 範本 TOOLS + 驗證劇本更新；舊 Agent 不強制遷移。
- [x] 本檔 Phase 6 標已完成。

### 風險

- 畫布與遊樂場訊息協議變重：維持「遊樂場權威 buffer、畫布只推事件」。
- Snapshot 過大燒 token：硬截斷 + `truncated`。

---

## Phase 7 — Compute（Python 優先）

**為何：** 數據分析／公式驗證若只能「寫進畫布再 reload」，步數貴且不穩。獨立 Worker 執行讓 agent 有便宜的假設檢驗面。

**決策：** 修訂 DEC-016「Playgrounds 不整合 Pyodide」——**僅**經遊樂場介面 Worker + `HOST.runPython`（或等價）注入；**不**把 `/tools/python-runner/` UI 嵌進沙盒。執行期釘版、CDN 載入，對齊 DEC-015。見 DEC-019。

### 範圍

| API | 行為 |
| --- | --- |
| `runPython({ code, packages? })` | 遊樂場 **Web Worker** 內 Pyodide；回傳 `{ stdout, stderr, result? }`；timeout；記憶體／執行時長硬上限 |

- **釘套件清單（初版）：** `numpy`、`pandas`、`scipy`；圖表可選 `matplotlib`（圖→PNG bytes，搭配 Phase 8 寫檔）。**不**開放任意 micropip 為預設。
- 與畫布 JS **隔離**（不可碰 Agent iframe／遊樂場 DOM）。
- 可選緊接：`runJs({ code })` 同 Worker 模式（驗證純函式；體積遠小於 Pyodide）。
- 範本技能：資料分析 playbook（讀 OPFS csv／json → `run_python` → 寫結果／圖 → 可選 reload 畫布展示）。出圖：`run_python` 最後運算式回傳 PNG base64，並帶 **`writeResultPath`** 直接寫入專案（避免 tool result 截斷後模型無法 `write_file_base64`），再 `open_file` 預覽。

### 主要觸及檔案

- 新：`playgrounds` 下 Pyodide worker／釘版常數（可參考 `pythonRunnerShare.ts`／`pythonRunner.worker.ts`，**勿**強耦合 tools 頁 UI）
- `hostBridge.ts`、`agentStarter.ts`、capabilities、host-api 文件
- 開工前更新 DEC-016／019

### 完成定義

- [x] `runPython` 無套件 round-trip 測試（mock worker 或契約測試；完整 Pyodide 不進 Vitest）。
- [x] 釘套件清單與 timeout／錯誤碼（`timeout`／`python_failed`）文件化。
- [x] 範本 tool + 簡短 playbook；capabilities 誠實。
- [x] DEC-016 修訂註記「例外：HOST.runPython」；本檔 Phase 7 標已完成。

### 風險

- 冷啟動大：懶載入 + UI／agent 可感知的 `loading` 狀態；勿每次 tool call 重載 runtime。
- 與 tools 頁雙份釘版：接受常數重複或抽共用 `pyodidePin.ts`（小模組即可）。

---

## Phase 8 — 二進位與截圖

**為何：** Phase 7 出圖、使用者上傳、字型／圖資都需要二進位通道；Visual 迴圈需要畫布畫面。

### 範圍

| API | 行為 |
| --- | --- |
| `readFileBase64`／`writeFileBase64` | target 專案二進位讀寫；大小硬上限；路徑規則同既有 FS |
| `openFile(path)` | 在遊樂場編輯器開啟路徑；圖／PDF／音訊／視訊走既有媒體預覽（不需塞進畫布 HTML） |
| `captureCanvas({ path? })` | 擷取**工作畫布**可視區域（或 document）→ PNG；可寫入 path 或回傳 base64 |

- 不實作完整「模擬 R2」物件儲存形，除非日後有多桶需求；先用專案 FS + base64 API 滿足 agent。
- 範本：vision 可選——若 BYOK endpoint 支援 image，再餵 `captureCanvas`；否則截圖仍利於人類對照。

### 完成定義

- [x] base64 讀寫測試（含上限／`bad_path`／`agent_readonly`）。
- [x] `captureCanvas` 手動：reload 後截圖檔可在側欄／匯出沙盒看到。
- [x] capabilities 更新；本檔標已完成。

### 風險

- 截圖跨 iframe／CORS：同源畫布應可行；失敗碼穩定（`capture_failed`）。
- 大 PNG 進 transcript：範本截斷、鼓勵寫檔後只回 path。

---

## Phase 9 — 仿 D1 與 Secrets

**為何：** 有狀態 CRUD／「真的像 Workers」的 demo 不能只靠 KV；需密鑰的外部 API demo 需要受控注入。

> **2026-08-02：** **仿 D1／`env.DB` 段仍有效。** Secrets 改 **[DEC-029](./DECISIONS.md#dec-029-playgrounds-secretstore與-binding)**／[PG-SECRETSTORE-PLAN.md](./PG-SECRETSTORE-PLAN.md)（遊樂場密文 SecretStore＋unlock／lock；**每 key 獨立** binding；**無**遊樂場代打、**無** `env.SECRETS` bag）。**2026-08-04：** 掛載點為 `env.secrets.<NAME>.get()`；`.env`→`env.vars`（DEC-035）。下列完成項含歷史 bag／per-project 明文基線。

### 範圍

| Binding／API | 行為 |
| --- | --- |
| 模擬 `env.DB` | sql.js 或 wa-sqlite + OPFS；Workers 形 `prepare`／`batch` 子集即可；每 `projectId` 一庫 |
| Secret bindings | 每 secret 一顆 `env.secrets.<NAME>.get()`；見 DEC-029／035 |

- clone／export／import：DB／KV 預設**不**複製；SecretStore **永不**進包裹。
- 刪專案：清對應 DB；舊 per-project secrets 目錄於 DEC-029 遷移期清除。

### 完成定義

- [x] 工作沙盒 `functions.js` 可 `env.DB.prepare(…).all()` round-trip；重整後資料仍在。
- [x] Secrets：DEC-029 SecretStore＋獨立 binding；`mockSecrets`／`env.SECRETS` bag 已廢（計劃 Phase 4）。
- [x] 更新 DEC + host-api／GLOSSARY；本檔標已完成（仿 D1／`env.DB`）；Secrets 見 DEC-029／SECRETSTORE 計劃。

### 風險

- 仿 D1 API 表面別承諾 100% 雲端相容；文件寫「近似、子集」。
- 密鑰外洩：unlocked 期 functions 可信邊界（對齊 CF Worker）；勿把 key 貼進對話；HOST 不回傳值。

---

## Phase 10 — 高權力可選／範本 UX

| 項目 | 狀態 | 說明 |
| --- | --- | --- |
| 串流 chat + Markdown | **已完成** | OpenAI-compatible SSE（`stream: true`）；assistant bubble 以 CDN marked + DOMPurify 渲染；\`\`\`mermaid + KaTeX（`$…$`／`$$…$$`）；邏輯單元測見 `agentChatStream.ts` |
| `evalInCanvas` | 擱置 | 僅工作畫布；短表達式；回傳 JSON 可序列化結果；capability 預設可不進範本 TOOLS；開工前更新 DEC |
| `applyPatch` | 擱置 | unified diff；補 Phase 2 未做項；開工前更新 DEC |

**串流／Markdown 驗收（已完成）**

- [x] `chat/completions` 請求帶 `stream: true`；delta 累積 content／`tool_calls` arguments。
- [x] 串流中 plain text bubble；結束後 Markdown 渲染（含 mermaid／數學）。
- [x] XSS：DOMPurify；mermaid `securityLevel: "strict"`。
- [x] 既有 Agent 沙盒不自動升級（重建範本／複製路由才拿到新 `app.js`）。

---

## Phase 11 — 範本 UX Round 2

**為何：** Runtime／觀察面已齊；下一刀是開箱摩擦與執行中體感（對齊常見 agent UX），仍維持「遊樂場介面薄、Agent 沙盒厚」。

### 範圍（多半 `agentStarter`；遊樂場薄接線）

| 區塊 | 內容 |
| --- | --- |
| A. BYOK 開箱 | 未設定 empty state；provider 快速設定（OpenAI／Groq／OpenRouter／本機）；測試連線；CORS／本機提示 |
| B. 執行中 | 執行中可佇列下一則；失敗可重試／編輯重送；步驟列（`步驟 n/m · tool`）；長任務 `.agent/plan.md` 面板 |
| C. 改檔可見 | write／result 摘要；`write_file` 可選 unified diff；path 點擊 → `openFile`；本回合 changed-files chips；手動 checkpoint／還原 |
| D. 遊樂場脈絡 | Agent 頂列＋遊樂場 chrome 顯示工作沙盒名；iframe reload 後重送 work-project message |

純邏輯單元測：`agentUx.ts`（與範本內嵌邏輯對稱）。

### 完成定義

- [x] 無 API key 時 onboard，不默默送出失敗。
- [x] 執行中輸入會進佇列；中止清空佇列；失敗顯示重試／編輯重送。
- [x] 寫檔 tool fold 可開檔、可見 diff／摘要；checkpoint 按鈕可用。
- [x] 工作沙盒名在 Agent UI 與遊樂場 Agent chrome 可見。
- [x] 既有 Agent **不**自動升級；需「套用最新 Agent 範本」或重建。

### 非目標

- 本站 LLM proxy／瀏覽器內建模型當預設腦（見既有討論）。
- `evalInCanvas`／`applyPatch`（仍屬 Phase 10 擱置）。

---

## Phase 12 — Context hygiene（防健忘；非 RAG）

**為何：** 長對話＋大 tool 結果會整包重送模型，造成截斷／健忘／「找不到剛改過的檔」。Embedding RAG 對沙盒小專案與 BYOK 路徑不合適（DEC-026）。

### 範圍（多半 `agentContext.ts` + `agentStarter` 鏡像）

- 送 `chat.completions` 前：`compactMessagesForLlm`（字元預算、舊 tool stub、舊 user 輪次 digest）。
- 開場 context：Host meta＋檔名列表＋可選 `.agent/plan.md`／`.agent/memory.md`／`README.md` 摘錄。
- System prompt：context hygiene、維護 memory／plan、遇 `[compacted]` 須重跑工具。
- **不做：** 站內／預設 Embedding 索引；強制每次壓縮另打一槍摘要 LLM。

### 完成定義

- [x] 純函式單元測試（預算內 stub／digest；短對話 no-op）。
- [x] 新「建立 Agent」範本含上述行為；UI transcript 不因壓縮而清空。
- [x] DEC-026／GLOSSARY／本檔狀態已同步。
- [x] 既有舊 Agent **不**強制遷移。

---

## Phase 12b — Scheme A 工作記憶（單 HOST 分任務）

**為何：** Context hygiene 只防止脹爆；還要把「分任務」從 prompt 慣例收成可執行工具與 UI（仍**不**做 coding 子代理／DEC-023 session 冒充）。

### 範圍

- 工具：`ensure_working_memory`、`write_plan`、`write_memory`、`get_task_focus`（寫入 target 的 `.agent/plan.md`／`.agent/memory.md`）。
- 每回合開場：自動 ensure 種子（若不存在）＋注入 **Task focus**（進度／下一步／memory 摘錄）。
- UI：工作記憶面板（計劃／記憶頁籤）；寫入後自動刷新。
- 純函式：`agentWorkingMemory.ts`（種子、focus 格式）。

### 非目標

- 多 LLM 子代理、窄 grant worker（方案 C）。
- 用 DEC-023 `env.SESSION` 跑 coding 分工。

### 完成定義

- [x] 工具＋種子＋task focus 進新 Agent 範本；單元測試覆蓋 helpers／範本字串。
- [x] DEC-026 註記 Scheme A 強化；本檔狀態已同步。
- [x] 舊 Agent 不強制遷移。

---

## 否決：`HOST.shell` + v86（已移除）

| 項目 | 說明 |
| --- | --- |
| 決定 | **不**實作 `HOST.shell`；**已移除** v86／Alpine 面板、映像與建置腳本（DEC-019） |
| 理由 | 慢、無網、無編譯鏈、對「輕量 Web + functions」主軸槓桿低；觀察／Python／DB 更能服務使用者 |
| 人類路徑 | 下方 **Python REPL**（Pyodide；與 `HOST.runPython` 同 Worker） |
| 若日後反悔 | 須新 DEC 說明場景，且預設 capability **關閉** |

---

## 測試與品質門檻

- 純邏輯（bridge、search、KV、console／network buffer、path、base64 邊界）：**Vitest**，與現有 `*.test.ts` 同目錄慣例。
- 不在 Vitest 跑完整畫布 SW／真實 LLM／完整 Pyodide。
- 提交前 `npm test` 與 `npm run check`（husky pre-commit）；完整建置用 `npm run build`。
- Playgrounds UI 仍禁止 `alert`／`confirm`／`prompt`（DEC-016）。

---

## 建議實作順序（一人產能）

### Runtime MVP（已完成）

1. Phase 0 → 1 → 3 → 4（session）→ 2 → 5（含 checkpoint）

### 增值（Phase 6+）

1. **Phase 6**（network + DOM）— 立刻提高現有 Web agent 命中率  
2. **Phase 7**（`runPython`）— 數據／驗證面；開工前修 DEC-016／019  
3. **Phase 8**（base64 + 截圖）— 讓 Phase 7 出圖與 Visual 有落點；可與 7 尾部重疊  
4. **Phase 9**（仿 D1／DB → Secrets）— 有狀態／密鑰 demo 出現時再做  
5. **Phase 10** 按痛點  

若產能極緊：**只做 Phase 6** 即可稱為「觀察更完整的 Web agent」；有數據場景再插 Phase 7。

範本**技能**（prompt／playbook）可與 Phase 6 並行，不阻塞遊樂場。

---

## 決策與文件同步

| 時機 | 動作 |
| --- | --- |
| Phase 0 完成 | 本檔狀態；可選抽出 `playgrounds-host-api.md` |
| Phase 3 Durable KV 定案／完成 | **DEC-018**；GLOSSARY 用語 |
| HOST 語意／雙執行面變更 | 必更新 DEC-017／018 與 GLOSSARY |
| 否決 agent×Linux shell、定 Phase 6+ 路線；v86 已移除 | **DEC-019** |
| Phase 6／8 觀察或截圖開工 | 更新 host-api；必要時修 DEC-018 capabilities 敘事 |
| Phase 7 Pyodide 開工 | **修訂 DEC-016**（例外條款）＋更新 DEC-019／釘版常數 |
| Phase 9 DB／Secrets 開工 | 新 DEC 或修 DEC-016 bindings 段 |
| Phase 10 任一項開工 | 先寫／改 DEC，再寫碼 |

根目錄 [AGENTS.md](../AGENTS.md) 指標表應能連到本計劃。

---

## 附錄 A — 錯誤碼

| code | 含義 |
| --- | --- |
| `host_unavailable` | bridge 未註冊 |
| `no_target` | 無工作／target 專案 |
| `not_found` | 檔案或資源不存在 |
| `bad_path` | 路徑無效 |
| `binary` | 文字 API 碰到二進位 |
| `agent_readonly` | 試圖寫現行 Agent |
| `forbidden` | 政策拒絕（如刪除使用者專案、刪除現行 Agent） |
| `conflict` | expectedHash／版本不符（Phase 2） |
| `patch_failed` | applyPatch 失敗（若實作） |
| `timeout` | waitConsole／runPython 等逾時 |
| `cancelled` | 使用者／agent 中止 |
| `not_supported` | capabilities 以外的呼叫 |
| `python_failed` | Pyodide 執行失敗（Phase 7） |
| `capture_failed` | 畫布截圖失敗（Phase 8） |
| `too_large` | 二進位／snapshot／log 超過硬上限 |

---

## 附錄 B — 與對話建議的對照

| 建議 | 本計劃階段 |
| --- | --- |
| API 版號、starter 對齊、錯誤碼 | Phase 0（已完成） |
| clear／wait／canvas status | Phase 1（已完成） |
| search、revision 鎖 | Phase 2（已完成；`applyPatch` → 10） |
| Durable KV | Phase 3（已完成） |
| session、checkpoint | Phase 4（已完成） |
| 串流、context pack、取消 | Phase 5（取消／context）；串流＋MD → Phase 10（已完成） |
| network log、DOM snapshot | Phase 6 |
| Python（Pyodide）compute、可選 runJs | Phase 7 |
| 二進位 FS、截圖 | Phase 8 |
| 仿 D1（`env.DB`）、Secrets | Phase 9 |
| 串流 chat、Markdown／mermaid／數學 | Phase 10（已完成） |
| evalInCanvas、applyPatch | Phase 10（擱置） |
| BYOK 開箱、佇列／重試、改檔可見、工作沙盒標示 | Phase 11（已完成） |
| 長對話防健忘、context 預算／stub／memory | Phase 12（已完成；DEC-026；**否決** Embedding RAG） |
| 單 HOST 分任務（plan／memory 工具＋UI） | Phase 12b（已完成；Scheme A） |
| `HOST.shell` + v86 | **否決；v86 已移除** |

---

## 附錄 C — 工具與技能分工（Phase 6+）

| 層 | 例子 | 誰實作 |
| --- | --- | --- |
| 工具（HOST／bindings） | `getNetworkLog`、`runPython`、DB、`captureCanvas` | 遊樂場；`capabilities()` 可探測 |
| 技能（範本） |「reload → wait → network／DOM」劇本；「csv → run_python → 寫圖」playbook；Scheme A：`ensure_working_memory`／`write_plan`／`write_memory`／`get_task_focus`；context hygiene | `agentStarter`／可複製 Agent 沙盒 |

---

## 維護

- 改階段狀態、API 表面或原則時**更新本檔**。
- **勿**把真 Linux／v86 shell 需求寫回本檔當必做項（DEC-019）。
- 勿在讀者可見文章預告「接下來會做哪些 Phase」（與 AGENTS「不要預告下一篇」同理）；本檔僅供作者／Agents 排程。
