# Playgrounds WASI CLI × OPFS 直連 FS（大檔）— 實作計劃

本檔把「Shell／`runCmd` 無法處理大型沙盒檔」收斂成可落地階段。權威決策見 [DECISIONS.md](./DECISIONS.md) **DEC-039**；底盤仍為 **DEC-021**（WASI preview1 Shell／`runCmd`）與 **DEC-038**（儲存權威在 Backend Runtime）。既有短跑契約見 [PG-SHELL-PLAN.md](./PG-SHELL-PLAN.md)；host 表面見 [playgrounds-host-api.md](./playgrounds-host-api.md)。

一句話：**取消「每次命令前把 cwd 子樹整包鏡進記憶體」；WASI preopen 在 Worker 內以 `FileSystemSyncAccessHandle` 對權威 OPFS 做 fd 級讀寫；Shell 維持統一 CLI，不靠堆 HOST／functions 長肉。**

**狀態：** 2026-08-04 — **Phase 0–5 已完成**（per-sandbox 鎖；tab 全域缺陷已修正）。

### 選型註記（Phase 1）

- 使用 `@bjorn3/browser_wasi_shim` 既有 **`SyncOPFSFile`／`OpenSyncOPFSFile`**；目錄樹仍用記憶體 **`Directory`／`PreopenDirectory`**。
- 新增 `wasiOpfsFs.ts`：`DirtySyncOPFSFile` 追蹤寫入／截斷；跑前 async `createSyncAccessHandle` 建樹；跑後 flush、persist 新建 mem `File`、刪除已 unlink 路徑、close handles。
- **產品＝計劃選項 B**（獨立 `hostWasi.worker`＋同來源 OPFS 根）；Phase 3 以殼 `withSandboxFsGate(sandboxId)`＋Runtime **per-sandbox** `fsHold` 互斥。**否決**選項 A（不合併進 Backend Runtime Worker）。
- 無 SyncAccessHandle → `wasi_unavailable`（不退回全量鏡像裝大檔）。`files` 記憶體 preopen **僅 ForTests**（無 `sandboxId`）。

---

## 背景與問題

### 現況

| 步驟 | 實作 | 後果 |
| --- | --- | --- |
| 跑前 | 殼／HOST 載入 `FileMap` → `fileMapToEntries` → `postMessage` 進 WASI Worker | 大專案／大二進位必複製整樹（或 cwd 子樹） |
| 預算 | `HOST_WASI_MAX_FS_BYTES`（16 MiB）→ `too_large` | **人為**上限，不是 OPFS 容量 |
| preopen | `@bjorn3/browser_wasi_shim` 記憶體 `File`／`Directory` | guest 看到的是 RAM 快照 |
| 跑後 | `collectEntries` 整樹 bytes 回傳再 diff 寫回 | 又一次全量複製；寫大檔同樣爆 |

人類 Shell 與 Agent `runCmd` 共用此路徑，故兩邊一起壞。

### 為何不能只「放宽 mirror」或「全改 functions」

1. **放宽 16 MiB：** 仍是雙份記憶體＋`postMessage` 結構化複製；幾百 MB 二進位必 OOM／卡死。
2. **高頻結構化操作進 HOST／functions**（`listDir`／`search`／`read_file`）仍正確——但**不常用**檔案運算若全塞進遊樂場，footprint 變大、不利客製（例如使用者之後從網路加自己的 WASI CLI）。
3. **非 CLI 就沒有統一入口：** 沒有對應 UI 則人類用不了。Shell 已是仿 Linux 命令列的統一面；大檔能力應留在 **同一執行核／同一 FS 語意**，而不是另發明面板。

### 設計原則

1. **Shell／`runCmd` 仍是統一 CLI** — 大檔是 FS 後端升級，不是新產品面。
2. **fd 直連權威儲存** — 不預先鏡整樹；`open`／`read`／`write`／`readdir` 才碰內容。
3. **同步 ABI ↔ SyncAccessHandle** — WASI preview1 為同步；Worker 內用 OPFS **`FileSystemSyncAccessHandle`**。**禁止** SharedArrayBuffer／COI 橋（維持 DEC-021）。
4. **與 DEC-038 對齊** — 權威在 Runtime／其 OPFS 根；殼不因 WASI 再假設「本機殼瀏覽器整包 FileMap」。
5. **上限重定義** — 鏡像預算退役；改 I/O 緩衝、stdout／stderr／stdin、timeout、可選單次開啟風險護欄。
6. **寫回增量** — dirty paths／notify；禁止整樹 `entriesOut`。
7. **客製 CLI 友好** — 同一 preopen 語意；日後使用者釘版／自裝 `.wasm` 不需另做大檔 API。

### 非目標

- 復活 Wasmer／WASIX／真 Bash／互動 `HOST.shell`（DEC-019／021）。
- 為大檔另開圖形面板或強制每種檔案操作進 HOST。
- 本計劃交付「從網路安裝任意 CLI」產品 UX（可留擴展註記；本檔只保證 FS 不挡路）。
- 惡意碼硬隔離、跨主機 WebRTC（見 DEC-038 路線）。
- 把 Pyodide／JS REPL 一并改成 SyncAccessHandle（正交；可之後仿）。

---

## 目標與完成樣貌

### 人類

- 沙盒含遠大於 16 MiB 的檔案時，Shell 仍可對**小檔／路徑運算**跑允許清單 CLI（例：`jq`、`grep`、`wc`、`ls`）。
- 對大檔做 streaming／seek 型讀寫的 CLI（若工具本身支援）不再因鏡像預算失敗。
- 命令改檔後 Files／編輯器仍能看見變更（經 dirty notify／權威讀回）。

### Agent

- `HOST.runCmd` 同一語意；大專案不因 cwd 子樹總量觸發 `too_large`（argv／stdin／輸出上限仍可截斷）。
- capabilities／錯誤碼文件誠實：`too_large` 語意收窄為「單次 I／O 或輸出／argv 超限」，**不是**「專案太大不能跑 Shell」。

### 程式錨點（預期）

| 模組 | 角色 |
| --- | --- |
| `hostWasi.ts`／`hostWasi.worker.ts` | 拿掉全量 `entries` 鏡像主路徑；改 root／cwd／`sandboxId` 契約 |
| 新：`wasiOpfsFs.ts`（或等價） | OPFS-backed inode／fd；`SyncAccessHandle` |
| `hostWasiFs.ts` | 保留純函式路徑工具；鏡像專用路徑標廢棄或僅測假 |
| Backend Runtime／`sandboxAuthority`／`opfsStore` | 與 WASI 共用權威根；序列化寫入 |
| Shell 調度／`shellHostBridge` | 跑後刷新改吃 dirty list，不重灌整包 FileMap 當唯一真相 |

---

## 技術方案

### 為什麼必須 Worker 內 SyncAccessHandle

```text
WASI preview1 fd_read／fd_write／path_open  → 同步
瀏覽器 OPFS 一般 API                → 多半 async
Worker + FileSystemSyncAccessHandle → 同步，且無須 COI
```

主線程 async「假裝」給 `wasi.start()` 不可行。SAB＋`Atomics.wait` 違 DEC-021。

### preopen 形狀

```text
工作沙盒 OPFS 根（權威＝Runtime）
        │
        ▼
  OpfsPreopenDirectory（自研／shim 相容 inode）
        │  path_open／readdir：只解析目錄項
        │  fd_read／fd_write：對已開 SyncAccessHandle 分段 I/O
        ▼
  WASI + 釘版／未來自裝 .wasm CLI
```

建議最小 inode 能力（MVP）：

| WASI／shim 面 | 行為 |
| --- | --- |
| `path_open`／建立／刪除（allowlist 工具會用到的子集） | 對 OPFS；路徑不得逃出沙盒根 |
| `fd_read`／`fd_pread`／`fd_write`／`fd_pwrite`／`fd_seek`／`fd_filestat_*` | SyncAccessHandle |
| `fd_readdir` | 目錄列舉；**不**預讀檔內容 |
| 關閉／跑完 | `flush`＋close；收集 **dirty 相對路徑** |

實作可：

- 擴充／包裝 `@bjorn3/browser_wasi_shim` 的 `File`／`Directory`（若介面允許注入自訂 Inode）；或
- 自研預開目錄實作，仍掛同一 `wasi_snapshot_preview1` import 物件。

**選定 shim 擴充點時**在 Phase 1 spike 定案並寫進本檔「選型註記」。

### 與 Backend Runtime 的關係

| 選項 | 說明 | 狀態 |
| --- | --- | --- |
| **A. WASI 併進 Runtime Worker** | 單一 Worker 持 OPFS＋跑 Wasm；殼只發 `runCmd` RPC | **否決**（2026-08-04） |
| **B. 獨立 WASI Worker＋同 OPFS 根** | 維持 `hostWasi.worker`；`SyncAccessHandle`；與 Runtime 經 **per-sandbox** 殼閘＋`fsHold` 互斥 | **產品選擇** |

並行寫入不得腐化**同一沙盒樹**：人類 Shell／Agent `runCmd`（**同沙盒**序列化）＋`withSandboxFsGate(sandboxId)`＋Runtime `fsHold(sandboxId)`（Phase 3）。**無關沙盒不互相阻塞**（見下方「產品與鎖粒度」）。**不**把 WASI 合併進 Backend Runtime Worker。

### `runCmd` 契約演進

今日（內部）：`files: FileMap` 進 runner。

目標（內部）：

```ts
runCmd({
  cmd, args?, stdin?, cwd?, env?, timeoutMs?,
  sandboxId, // 工作／target 沙盒（過渡期 API 欄位可仍名 `projectId`）
  // 不再要求 files 全量鏡像
})
→ { stdout, stderr, exitCode, truncated?, changedPaths?: string[] }
```

對外 Host API 形狀可保持；`filesOut` 若仍暴露，改為「僅小型變更可選內嵌」或廢棄改 `changedPaths`＋殼自行 `readFile`——Phase 2 定案並更新 host-api。

### 上限（取代鏡像預算）

| 上限 | 用途 |
| --- | --- |
| stdout／stderr／stdin 字元（既有） | 防把大檔灌進終端／模型 |
| argv 數量（既有） | 防失控 |
| timeout（既有） | 防長跑 |
| **單次 fd 讀寫緩衝** | 宿主臨時 `Uint8Array` 大小 |
| （可選）單檔若工具一次 `read` 全檔進 guest linear memory | Wasm memory 仍受瀏覽器限制——屬工具本質，不靠鏡像假装解決 |

`too_large`：**不再**表示「沙盒 FS 鏡像超限」。

---

## 階段

| 階段 | 主題 | 完成定義 | 狀態 |
| --- | --- | --- | --- |
| **0. 契約** | 本計劃＋DEC-039；修訂 DEC-021 註記；GLOSSARY／AGENTS／host-api 前瞻一句；標明非目標 | 文件無歧義 | **已完成** |
| **1. Spike** | Worker 內 SyncAccessHandle；OPFS-backed preopen 跑通至少一顆釘版 CLI（讀小檔＋讀／寫大於舊鏡像預算的檔） | 手動／測試證明；選定 shim 擴充點 | **已完成** |
| **2. 切主路徑** | `hostWasi` 主路徑不再 `assertFsBudget` 全量 entries；回傳 dirty／`changedPaths`；Shell／HOST 刷新對齊 | 大檔沙盒可 `runCmd`；既有小專案回歸綠 | **已完成** |
| **3. Runtime 親和** | 與 DEC-038 權威根／寫入佇列對齊（B→A 或文件化共存）；`agent_readonly`／逃逸路徑測 | 無雙寫腐化；殼權威路徑不為 WASI 回流 FileMap 鏡像 | **已完成（選項 B＋互斥；scope 見 Phase 5）** |
| **4. 打磨** | 錯誤碼／host-api／截斷語意；測；FILE-NAV 交叉註記；**不含**合併 WASI→Runtime Worker | `npm test`／`check`；手動清單過 | **已完成** |
| **5. per-sandbox 鎖** | 殼閘／Runtime `fsHold` 改 **per-`sandboxId`**；**移除** tab 全域單寫者 | 切換工作沙盒不被無關沙盒短跑拖住；同沙盒仍序列化 | **已完成** |

狀態欄：`待開發`／`進行中`／`已完成`／`擱置`／`否決`。

---

## Phase 0 — 契約

- [x] 本檔初版
- [x] DEC-039 Accepted（實作依本檔階段推进）
- [x] DEC-021 Revision 指向本計劃／DEC-039
- [x] GLOSSARY：Shell／runCmd 補 OPFS fd 直連（計劃中）
- [x] AGENTS 指標列本檔；實作準則一段
- [x] host-api `runCmd` 上限句標現行 vs 計劃中

---

## Phase 1 — Spike

### 範圍

- 在 Dedicated Worker（現 WASI worker 或 Runtime worker）取得沙盒目錄 handle。
- 實作最小 `readdir`＋`open`＋`read`／`write`＋`close`。
- 對照實驗：專案含 >16 MiB 檔時，對無關小檔跑 `jq`／`wc` 成功；對大檔 `cat`／checksum（若允許清單有）不因鏡像失敗。
- 記錄：shim 可否子類化 `File`；不行則自研掛載策略。

### 風險

- SyncAccessHandle 瀏覽器支援差異 → 能力探測；不成則 `wasi_unavailable`＋誠實 UI，**禁止**靜默退回全量鏡像裝大檔。
- 目錄快取 vs 外部（編輯器）同時改檔 → 以「每次 run 開新視圖／短快取」降低驚喜。

### 完成定義

- [x] Spike 文件或測試固定「選型註記」寫回本檔。
- [x] 至少一條自動化測覆蓋 Opfs FS 單元（mock handle 可接受）。

---

## Phase 2 — 切主路徑

### 範圍

- `runHostCmd` 不再依賴呼叫端提供完整 `FileMap` 當 preopen 內容。
- 廢主路徑 `HOST_WASI_MAX_FS_BYTES` 鏡像檢查（常數可刪或改名留給緩衝上限）。
- Shell 面板：命令結束以 `changedPaths`（或等價）觸發樹／編輯器失效，而非假設 `filesOut` 含全世界。
- 人類 `|` 管線：各段仍短跑；共用同一 OPFS 視圖語意（中間檔寫在權威 FS，不是記憶體 pipe 偷渡整檔——stdin／stdout 字元上限仍在）。

### 完成定義

- [x] 既有 `hostWasi` 單元測改寫；大 entries fixture 不再期望 `too_large`。
- [x] 手動：>16 MiB 檔可讀（作者確認）；其餘手動見附錄 B。

---

## Phase 3 — Runtime 親和

### 範圍

- 確認 WASI 與 `opfsStore`／`fsOp` 指向同一沙盒根布局。
- 互斥：**per-sandbox**（鎖鍵 `sandboxId`）——`runCmd`／authority／REPL 僅序列化同一沙盒樹；copy-on-write 不在 MVP。
- 若採選項 A：把 WASI instantiate 移入 `backendRuntime.worker`——**已否決**；本階段只做 B＋互斥。

### 產品與鎖粒度

遊樂場**正規 UX**以單一**工作沙盒**（`activeId`）為編輯／Shell 焦點；**不**提供「同時對兩個以上沙盒做檔案寫入」的產品路徑。技術互斥只需防**同一沙盒樹**內 `SyncAccessHandle` 與 authority／`fsOp` 競態——**以沙盒為鎖鍵已是刻意取捨**（未採 per-path／per-file）。

**否決 tab 全域「任一時刻僅一個沙盒可寫」：** 首版 tab 單鏈＋全域 `fsHoldCount` 會在沙盒 A 短跑 WASI 時，連帶阻塞沙盒 B 的存檔／`runCmd`——使用者已切到 B 工作仍被 A 拖住，**不可接受**。正確形狀是 **per-sandbox** 互斥：只序列化**同一 `sandboxId`** 內的操作；**無關沙盒的 FS 不互相阻塞**（切換工作沙盒、背景 Agent 在別沙盒短跑時，現用沙盒仍須能存檔）。

### 鎖定模型（選項 B；**scope＝per-sandbox**）

**鎖鍵：** 工作沙盒 **`sandboxId`**（= OPFS `playgrounds-projects/<sandboxId>/` 這棵樹；目錄前綴 `playgrounds-projects` 為歷史名）。

**不在互斥範圍內：**

- 整個 origin OPFS
- 其他沙盒樹（`playgrounds-projects/<otherSandboxId>/`）
- `playgrounds-kv/<sandboxId>/`（mock KV）
- Durable mailbox 等與沙盒檔案樹無交集的 OPFS 用途

**設計原則：** 競態邊界＝同一棵沙盒樹；鎖粒度不再細于沙盒。產品不支援多沙盒同時寫檔，故**不需要** tab 全域單寫者來「保證同一時間只有一個沙盒在寫」——那會誤傷切換工作沙盒的正常路徑。

```text
殼 withSandboxFsGate(sandboxId)     ← Map<sandboxId, Promise chain>
  ├─ sandboxAuthority.*(id, …)      ← 以該 sandboxId 為鎖鍵
  ├─ backendFsOp（含 sandboxId 的 fs 操作）
  └─ runHostCmd／REPL %run（同沙盒）
        ├─ acquireBackendFsHold(sandboxId)
        ├─ WASI Worker SyncAccessHandle 短跑（僅開此沙盒根）
        └─ releaseBackendFsHold(sandboxId)

Runtime fsHoldPerSandbox: Map<sandboxId, count>
  └─ fsOp／beforeFsAccess 僅 await waitFsUnlocked(該 sandboxId)
```

| 層 | 契約 | 阻塞範圍 |
| --- | --- | --- |
| **殼閘** | `withSandboxFsGate(sandboxId, fn)`；同一沙盒的 authority／`runCmd`／REPL 互斥 | **僅該沙盒** |
| **Runtime `fsHold`** | `{ type: "fsHold", sandboxId }`／`fsRelease`；Worker 內 per-sandbox 計數 | 僅阻塞**同沙盒**的 `fsOp`／HOST 本地寫 |
| **沙盒 registry 級殼 op** | `listProjects` 等列舉：**不**與 per-sandbox 持有者互斥（或極短無鎖讀） | 不阻塞任一沙盒 FS |

- **衝突語意（同沙盒）：** 並發請求排隊，不回 `too_large`；鎖釋放後後到寫入依時間序生效。
- **殘餘風險：** 雙 Dedicated Worker 若存在未走閘門的路徑仍可能競態；靠閘＋`fsHold` 覆蓋權威寫與 `runCmd`。**不**以合併 Worker 消除此結構。
- **否決（2026-08-04）：** 選項 A（WASI 併進 Backend Runtime Worker）。
- **過渡期：** 程式／協定欄位若仍名 `projectId`，語意＝`sandboxId`（見 [GLOSSARY.md](./GLOSSARY.md)）。

**實作（2026-08-04）：** per-sandbox 閘＋`fsHoldPerSandbox` 已落地；`listProjects`／`createProject` 不走沙盒閘。

### 完成定義

- [x] 文件寫明鎖定模型與 **per-sandbox scope**（本節）。
- [x] 並發：編輯器存檔 vs Shell 寫**同沙盒**同檔——閘門序列化，行為穩定可測（`sandboxFsGate`／`beforeFsAccess` 單元測）。
- [x] **Phase 5：** 移除 tab 全域單寫者；程式與協定對齊 per-sandbox。

---

## Phase 5 — per-sandbox 鎖（修正 tab 全域缺陷）

### 背景

首版 tab 全域閘等同「任一時刻整個分頁只有一個沙盒能寫檔」——與遊樂場「單一工作沙盒、可切換、無關沙盒不互拖」衝突，**不可作為產品形狀**。本階段為**缺陷修正**，非可選優化。

### 範圍

- `sandboxFsGate.ts`：`Map<sandboxId, chain>`；API `withSandboxFsGate(sandboxId, fn)`。
- `sandboxAuthority`：各 op 傳入對應 `sandboxId`；`listProjects` 等 registry op 不走沙盒閘（或文件化例外）。
- `backendRuntimeProtocol.ts`：`fsHold`／`fsRelease` 帶 `sandboxId`；`acquireBackendFsHold(sandboxId)`。
- `backendRuntime.worker.ts`：`fsHoldPerSandbox`；`waitFsUnlocked(sandboxId)` 僅阻塞同沙盒的 `handleFsOp`／`beforeFsAccess`。
- `hostWasi`／`hostPython`／`hostJs`：持鎖時傳 `sandboxId`。
- 測：同沙盒重疊請求仍序列化；**不同沙盒**的 gate／`fsOp` **不互相等待**；Runtime mock 驗 per-sandbox `fsOp` 等待。

### 完成定義

- [x] 無 tab 全域 FS 閘／全域 `fsHoldCount`（除測試 reset）。
- [ ] 手動：沙盒 A 跑 Shell 長命令時，**已切到**沙盒 B 仍可存檔／`runCmd`（A 不拖 B）。
- [ ] 手動：同沙盒編輯器存檔 vs Shell 寫同檔仍序列化、無腐化。

---

## Phase 4 — 打磨

- [x] host-api／GLOSSARY／DEC-039 狀態與本檔階段勾選
- [x] 錯誤碼表：`too_large`＝argv／stdin／stdout／stderr 等（Shell 附錄 A／本檔附錄 A／host-api）
- [x] 記憶體 preopen 標 **ForTests**（產品須 `sandboxId`）；`HOST_WASI_MAX_FS_BYTES` 僅 deprecated 相容
- [x] [PG-FILE-NAV-PLAN.md](./PG-FILE-NAV-PLAN.md) 交叉註記：全量鏡像已由本計劃處理
- **不做：** 把 WASI 合併進 Backend Runtime Worker（選項 A 已否決）

---

## 與其他計劃的邊界

| 計劃 | 關係 |
| --- | --- |
| [PG-SHELL-PLAN.md](./PG-SHELL-PLAN.md) | Phase 0–4 **已完成**；本檔為大檔／FS 後端後續，不重開 Shell UI 階段 |
| [PG-BACKEND-RUNTIME-PLAN.md](./PG-BACKEND-RUNTIME-PLAN.md) | 儲存權威；本檔 Phase 3 接線 |
| [PG-FILE-NAV-PLAN.md](./PG-FILE-NAV-PLAN.md) | 列舉／到達；不取代 CLI；本檔消掉「mirror 挡路」 |
| [PG-TOOLS-PLAN.md](./PG-TOOLS-PLAN.md) | 長時間 UI 工具仍走 Tool／Delegate；短跑 CLI 留 Shell |
| HOST／functions 增值 | 高頻結構化 API 可繼續加；**不**因本檔改成「大檔只能走 HOST」 |

---

## 測試與品質

- Opfs-backed path／逃逸／dirty 收集：**Vitest**（mock SyncAccessHandle）。
- 契約：允許清單命令在「含大檔專案」fixture 下不因總量失敗。
- 提交前 `npm test`、`npm run check`。
- 手動：Shell 改檔可見；Agent `run_cmd`；切換工作沙盒不串根。

---

## 附錄 A — 錯誤碼影響

| code | 本計劃後 |
| --- | --- |
| `too_large` | 僅 stdin／輸出／argv／**單次緩衝**等；**不再**＝FS 鏡像總量 |
| `wasi_unavailable` | shim／Wasm／**無 SyncAccessHandle**／instantiate 失敗 |
| `bad_path` | cwd／open 逃逸 |
| `agent_readonly` | 不變 |
| 其餘 | 見 Shell 計劃附錄 A |

---

## 附錄 B — 手動驗收（Phase 2+）

- [x] 放入 >16 MiB 檔後，`pwd`／`ls`／對小檔 `jq` 或 `wc` 成功（作者 2026-08-04 確認可讀大檔）
- [ ] 允許清單工具改小檔 → 側欄／編輯器可見
- [ ] Agent `run_cmd` 同上語意；不可寫現行 Agent
- [x] 無需 COI
- 手動：切換工作沙盒後命令不碰舊根（不同沙盒互斥獨立，可並行）

---

## 附錄 C — 已否決（本計劃範圍）

| 方向 | 理由 |
| --- | --- |
| 只調高 `HOST_WASI_MAX_FS_BYTES` | 仍雙份複製 |
| 預測 argv「會用到的檔」再鏡像 | glob／相對路徑／工具內部行走猜測不准 |
| SAB＋主線程 async OPFS | COI；DEC-021 |
| 大檔改一律 HOST-only、削弱 Shell | 與「統一 CLI／客製 Wasm」衝突 |
| WASI 併進 Backend Runtime Worker（選項 A） | 作者否決；維持獨立 WASI Worker＋殼閘／`fsHold`（2026-08-04） |
| tab 全域 FS 互斥（單鏈／全域 `fsHoldCount`） | 等同「任一時刻僅一個沙盒可寫」；切換工作沙盒仍被無關沙盒短跑拖住——**不可接受**；改 per-sandbox（Phase 5） |

---

## 維護

- 改階段狀態、選型、與 Runtime 共存／互斥策略時**更新本檔**。
- **勿**把「合併進單一 Runtime Worker」寫回必做或 Phase 目標（已否決）。
- 契約變更同步 DECISIONS／GLOSSARY／host-api／AGENTS。
- **勿**在讀者可見文章預告本計劃階段。
