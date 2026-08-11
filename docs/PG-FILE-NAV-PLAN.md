# Playgrounds 大 SAM 檔案導航計劃（DEC-027）

> **狀態：** Phase 0～3 已完成（2026-08-02）；Phase 4 痛點驅動未開始  

> **權威決策：** [DECISIONS.md](./DECISIONS.md) DEC-027  
> **相關：** DEC-016（檔案樹／OPFS）、DEC-017／018（HOST）、DEC-026（context hygiene；否決 Embedding RAG）、[PG-AGENT-PLAN.md](./PG-AGENT-PLAN.md)、[playgrounds-host-api.md](./playgrounds-host-api.md)

一句話：**人靠「到達」（過濾／快速開檔／收合），Agent 靠「可裁切列舉＋搜尋」；結構記憶留在沙盒內（README／`.agent/*`），不用 TypeScript 或向量索引管大專案。**

---

## 背景與產品假設

- **SAM 定義**是單一 `index.html` 入口（可選 `functions.js`／`controller.js`），**不是**「必須短小」。使用者／Agent 可寫出大型體驗（含 3D 即時遊戲）；體積與檔案數無硬性產品上限。
- **主要可執行語言：JavaScript**（契約入口、範本、Agent 預設產出）。**Python** 用於數據分析（REPL／`HOST.runPython`）。在 AI 時代，程式多由助理產生——可讀的 JS 優先於型別系統；**不**把 TypeScript 型別檢查或 TS 執行管線當作成長管理手段（`.ts` 仍可當任意文字編輯，與其他文字檔相同）。
- 今日痛點：人類 Files 樹為完整遞迴渲染、無過濾；Agent `list_files` 整包扁平清單、開場只截字典序前 40 路徑——沙盒變大時雙方都會先壞在「導航／列舉」，不是語言。

### 設計原則

1. **人用空間感，Agent 用檢索** — 不逼 Agent 模擬點樹；不把側欄做成給 LLM 的 API。
2. **搜尋是一等公民** — 樹負責瀏覽；到達靠 filter／快速開檔／`HOST.search`。
3. **列表必須可裁切** — `listDir`（或等價）支援 prefix／depth／maxEntries；開場清單優先契約檔與頂層目錄。
4. **地圖寫在專案裡** — 根目錄 **`README.md` 人機共用**（入口、目錄、禁止事項、怎麼驗證）；任務進度才寫 `.agent/memory.md`／`plan.md`。延續 DEC-026（**否決** Embedding RAG）。
5. **遊樂場保持薄** — 到達與聚焦可以做；符號大綱、git blame、完整 IDE 檔案索引不做。
6. **人機接力** — Agent `open_file` → 遊樂場展開並開啟；人指出路徑 → Agent 少猜。

### 非目標

- TypeScript 一等執行／型別檢查 UX、`functions.ts` 契約別名、npm 套件生態。
- Embedding／向量 RAG、全專案符號索引。
- 側欄迷你 git、多根 workspace、把 Files 做成第二個 Agent 面板。
- 強制沙盒檔案數上限（匯入來源如 GitHub 既有上限可另議，與本計劃「工作區導航」分開）。
- **另立沙盒根 `AGENTS.md` 當助理專用慣例**（業界常見拆法；本沙盒改以寫好的共用 `README.md` 為準）。若匯入沙盒碰巧有該檔，當普通 Markdown 即可，不進開場必讀、不進範本種子。

---

## 現況摘要（實作基線）

| 面 | 現況 | 缺口 |
| --- | --- | --- |
| 人類 Files | `FileExplorer.svelte` 遞迴展開／收合；空目錄；點檔開啟；**操作列在側欄底部**（樹下方） | 無樹內過濾、快速開檔、全部收合、麵包屑、虛擬化、鍵盤逛樹；**選檔後改名／刪除／下載等須往側欄底找，長樹時更糟** |
| Agent FS | `listFiles` → `string[]`（整包）；`search` 預設 50／硬頂 200；`read_file` 分窗約 120 行 | 無深度／prefix 列舉；開場 `formatOpeningFileList` 切前 40 |
| 脈絡 | DEC-026 hygiene＋Scheme A memory／plan | 無「專案地圖」開場策略；大 `list_files` 結果易被 stub |
| Shell | 人類 `find`／`grep`／管線；Agent `run_cmd` 單命令 | 不取代 HOST 列舉契約 |

---

## 契約摘要（目標形狀）

### `HOST.listDir(options?)`（新；Phase 1）

```ts
type ListDirOptions = {
  /** 專案相對目錄；省略或 `""`＝根。正規化後不得逃出沙盒根。 */
  prefix?: string;
  /** 相對 prefix 的最大深度；預設 1（只列該層）。`0` 不合法。 */
  depth?: number;
  /** 回傳條目上限；預設 200；硬頂建議 500。 */
  maxEntries?: number;
  /** 可選；省略＝目前 target。 */
  projectId?: string;
};

type ListDirEntry = {
  path: string; // 專案相對
  kind: "file" | "dir";
  /** `kind===dir"` 且因 depth 未展開時可為 true */
  truncatedChildren?: boolean;
};

type ListDirResult = {
  entries: ListDirEntry[];
  truncated: boolean; // 因 maxEntries 截斷
  prefix: string;
  depth: number;
};
```

- **向下相容：** 既有 `listFiles(projectId?)` **保留**（仍回全部檔案路徑；文件標註「大專案請改 `listDir`／`search`」）。不在本計劃把 `listFiles` 改成預設截斷（避免暗自破壞舊 Agent）。
- **capabilities：** 新增 `"listDir"`。
- **範本工具：** `list_dir` → `GET` 或 `POST /api/host/list-dir`（query／JSON 帶 options）；system prompt：先 `list_dir` 根與關鍵目錄 → `search` → `read_file`；**禁止**為瞭解結構而整包 `list_files`。

### 開場檔案清單（Phase 1）

取代「排序後前 40 路徑」，組裝優先序：

1. 契約／入口（若存在）：`index.html`、`functions.js`、`controller.js`
2. 頂層**目錄名**（`kind: dir`，來自 `listDir({ depth: 1 })`）
3. 開場文件摘錄（有則讀、截斷策略同 DEC-026）：`.agent/plan.md`、`.agent/memory.md`、**`README.md`**（維持既有 `OPENING_DOC_PATHS`；**不**另加 `AGENTS.md`）
4. 其餘：一句 `…(+N more files; use list_dir / search)`，**不**再塞字典序填滿 40 槽

純函式建議落在 `agentContext.ts`（＋ Vitest），`agentStarter` 鏡像。

### 人類到達 UX（Phase 2）

| 能力 | 行為 |
| --- | --- |
| **操作列就近（必做）** | **專案級**（新檔／新夾／上傳／URL／收合＋filter）固定 Files **頂部**。**選取級**（下載／改名／刪除）顯示在**目前選取的檔／目錄列右側**（含過濾命中列表），隨選取列捲動，避免長樹時目光與操作脫節。 |
| 側欄過濾 | Files 頂部輸入：對可見路徑／檔名子字串過濾；清空恢復樹 |
| 快速開檔（二選一或並存） | 過濾結果 Enter 開第一命中；或簡易 palette（路徑子字串 → 開檔）。**P0 以側欄 filter 為準**；palette 可同階段若成本低 |
| 預設展開 | 開專案／開檔：只展開 `openPath` 祖先；勿預設全開 |
| 全部收合 | 工具列或側欄動作：清空 `expandedDirs`（或只留祖先） |
| 麵包屑（可同階段） | 編輯器路徑列可點目錄 → 側欄選中並展開該目錄 |

**操作列佈局取捨（Phase 2 定案／修訂）：**

- **採用：** 頂部固定 chrome（專案級）＋下方樹；**選取級動作在選取列右側 inline**（下載／改名／刪除）。
- **不做（本階段）：** 右鍵 context menu 當唯一入口（可後補）。
- 與「到達」同一階段：先能找到檔，選取後動作貼在該列。

### 大 SAM 慣例（Phase 3；文件＋範本，非 runtime 魔法）

建議目錄（範本／文件示範，**不**由遊樂場介面強制）：

```text
index.html
functions.js          # 可選
controller.js         # Agent 必備
README.md             # 人與代理共用的沙盒導讀（建議大專案具備）
.agent/plan.md        # Scheme A 任務清單（會變）
.agent/memory.md      # Scheme A 工作記憶（會變）
ui/                   # 畫布前端
lib/                  # 共用邏輯
assets/               # 大二進位／貼圖／模型（預設心智：少搜這裡）
```

#### `README.md`（人機共用）

| 面向 | 說明 |
| --- | --- |
| **角色** | **唯一**專案級導讀：給人看、也給 Agent／助理遵守——入口契約、目錄約定、禁止事項、怎麼在畫布驗證 |
| **寫作要求** | 寫成雙方都讀得懂；勿假設「助理另有一份秘密規格」。大專案範本種子應示範這種寫法 |
| **與 `.agent/*`** | `.agent/plan.md`／`memory.md`＝**當前任務**狀態（可常改寫）；`README.md`＝**專案級**說明與慣例（少改、不當 scratch） |
| **開場** | 維持既有 opening 摘錄（與 plan／memory）；字元上限同 DEC-026 |
| **否決拆檔** | **不**把助理規則拆到沙盒根 `AGENTS.md`（業界常見；本沙盒不跟）。匯入沙盒若有該檔，不特別開場、不進範本 |

- Agent system prompt／playbook：有 `README.md` 則遵循；任務進度寫 memory／plan，**不要**把短暫 scratch 寫進 README；資產與邏輯分目錄；導航三步（list_dir → search → read）。
- 可選：輕量「空白大 SAM」或既有 starter 的 `README.md` 種子——**不**新增第二套語言範本、**不**新增 `AGENTS.md` 種子。

### Phase 4（痛點驅動）

| 項目 | 觸發 |
| --- | --- |
| Files 虛擬化（可見列 flat list） | 實測千級節點卡頓 |
| `search` 可選 `exclude` 或預設偏向 `*.{js,html,css,md,json}` | 資產目錄嚴重污染命中 |
| 鍵盤樹導航／最近檔案 | 人類高頻需求再做 |

---

## 階段

| 階段 | 交付 | 完成定義 | 狀態 |
| --- | --- | --- | --- |
| **0. 契約** | DEC-027、GLOSSARY、本計劃、AGENTS／host-api 指針；語言邊界寫進決策 | 用語與非目標無歧義 | 已完成 |
| **1. Agent 列舉** | `HOST.listDir`＋capabilities＋bridge／HTTP；`list_dir` 工具；開場清單改優先序（仍摘錄 README／`.agent/*`）；Vitest | 大扁平樹不再依賴整包 `list_files`；開場含入口＋頂層目錄＋README 摘錄 | 已完成 |
| **2. 人類到達** | **操作列改 Files 頂部**；filter、全部收合、智慧預設展開；可選麵包屑／簡易快速開檔 | 選檔後改名／刪除等不必往側欄底找；不靠滾長牆即可開到檔 | 已完成 |
| **3. 慣例與 playbook** | 目錄慣例＋**人機共用 `README.md` 種子**；Agent prompt：遵守 README、導航三步 | 大 SAM／再建立範本看得到可共用的 README；小 starter 至少 prompt 提及 | 已完成 |
| **4. 規模強化** | 虛擬化；search exclude／原始碼預設 glob（按痛點） | 有再現步驟與測才開做 | 未開始 |

---

## 程式路徑（預期）

| 路徑 | 用途 |
| --- | --- |
| `src/components/playgrounds/hostListDir.ts`（或併入 `pathUtils`／新模組） | 純函式：FileMap＋dirs → `ListDirResult` |
| `src/components/playgrounds/shellHostBridge.ts`／`hostBridge.ts`／`hostCapabilities.ts` | `listDir` 接線 |
| `src/components/playgrounds/agentContext.ts` | 開場清單組裝；常數 |
| `src/components/playgrounds/agentStarter.ts` | `list_dir` 工具、prompt、openingContext |
| `src/components/playgrounds/FileExplorer.svelte`／`PlaygroundsApp.svelte` | filter、收合、展開策略、麵包屑 |
| `docs/playgrounds-host-api.md` | API 表更新（Phase 1 完成時） |

---

## 測試

- **Vitest（必做 Phase 1）：** `listDir` 深度／prefix／maxEntries／逃逸 path；開場清單優先序（入口＋頂層 dir、總數提示）。
- **Vitest（Phase 2 若抽純函式）：** 路徑 filter 匹配、祖先展開集合。
- **手動：** 數百檔假專案——filter 開檔；Agent「列出 lib/」走 `list_dir` 而非整包 list。

---

## 與其他計劃

| 計劃／決策 | 關係 |
| --- | --- |
| **DEC-016** | 檔案樹／OPFS／無 npm 基線；本計劃加強導航，不改儲存模型 |
| **DEC-026／AGENT-PLAN Phase 12** | 仍否決 RAG；開場與 list 策略是 hygiene 的互補，不是取代 |
| **SHELL-PLAN／WASI-OPFS** | 全量鏡像已由 [PG-WASI-OPFS-FS-PLAN.md](./PG-WASI-OPFS-FS-PLAN.md)／DEC-039（OPFS SyncAccessHandle）處理；本計劃不改 Shell FS，只讓 HOST／UI 少依賴「一次看全樹」 |
| **TOOLS-PLAN** | Tool SAM 掛載不變；工具沙盒變大時同樣受惠於 `listDir`（若 Agent 對 target 呼叫） |

---

## 風險與取捨

| 風險 | 緩解 |
| --- | --- |
| 舊 Agent 仍狂呼 `list_files` | 保留 API；新範本 prompt 引導；capabilities 宣佈 `listDir` |
| filter 與「樹展開狀態」不同步 | filter 模式用扁平命中列表或暫時展開匹配祖先；清空 filter 還原 |
| 開場過短導致 Agent  visional 盲 | 靠頂層目錄名＋README／memory；鼓勵第一步 `list_dir` |
| 虛擬化過早 | Phase 4 痛點驅動，避免為小 SAM 付複雜度 |

---

## 錯誤碼（Phase 1 建議）

| 碼 | 何時 |
| --- | --- |
| `bad_path` | prefix 非法／逃出根 |
| `no_target` | 無 target（與既有 FS 一致） |
| （截斷） | **不**當錯誤：`truncated: true` 於結果內 |

細節實作時與 [playgrounds-host-api.md](./playgrounds-host-api.md)、AGENT-PLAN 附錄 A 對齊。
