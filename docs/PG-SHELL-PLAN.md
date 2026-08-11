# Playgrounds WASI Shell／`run_cmd` 實作計劃

本檔把 Playgrounds「專案 CLI」從討論收斂成可落地的階段計劃。權威架構決策見 [DECISIONS.md](./DECISIONS.md) **DEC-021**（Accepted）；與既有沙盒／agent 邊界見 **DEC-016**／**017**／**019**。Agent runtime 其餘能力仍以 [PG-AGENT-PLAN.md](./PG-AGENT-PLAN.md)、[playgrounds-host-api.md](./playgrounds-host-api.md) 為準。

一句話：**瀏覽器內建 `WebAssembly`＋WASI（preview1）宿主；工作沙盒 OPFS 當根目錄；人類得 xterm 命令列調度器，Agent 得非互動 `HOST.runCmd`。**

**狀態：** Phase 0–4 已落地（2026-08-01）。允許清單已含 `jq`、`grep`／`sed`／`find`／`awk`、`diff`／`cmp`、`cowsay`／`cowthink`，與官方 uutils `coreutils.wasm`（0.9.0 wasip1；不含 `yes`／`dd`）。人類 Shell 另有 JS `xargs`。

> **後續（大檔／FS）：** OPFS SyncAccessHandle fd 直連與 **per-sandbox** 殼閘／`fsHold` 見 **[PG-WASI-OPFS-FS-PLAN.md](./PG-WASI-OPFS-FS-PLAN.md)**／**DEC-039**（Phase 0–5 已落地；不重開本檔 Phase 表）。

---

## 目標與非目標

### 目標

- **人類：** 下方面板新增 **Shell** Tab——仿 Linux **命令列 UI**（xterm）：提示符、讀一行、執行允許清單內的 **WASI CLI**；cwd／可寫檔對應**目前工作沙盒** OPFS。
- **Agent：** `HOST.runCmd`（範本 tool `run_cmd`）在**同一 FS／runtime 語意**下非互動執行允許清單 CLI；`capabilities()` 可探測；輸出可截斷。
- 兩條消費面**共用** WASI 宿主、釘版 `.wasm` 工具、OPFS 同步；人類面板可有 session 級 `cwd`，Agent 每次呼叫顯式或預設根。

### 非目標

- **`@wasmer/sdk`／Wasmer registry／WASIX**（含真 Bash guest、threads、`fork`、sockets 等 WASIX 擴充）。
- 依賴 **cross-origin isolation**（COOP／COEP／SharedArrayBuffer）才能跑 Shell——以標準 Wasm＋WASI shim 為準。
- 復活 v86／Alpine／真 x86 Linux guest（DEC-019 維持）。
- 經 HOST 把**互動 TTY／字元流**交給模型（不做 `HOST.shell` 串流 stdin）。
- 完整 POSIX／發行版：`apt`、編譯鏈、互動 `vim`、任意 Bash 腳本、job control。
- 預設開放 guest 外網；完整 Node／WebContainer。
- 把 Shell 登錄進 `/tools/` 或要求介紹文才能上線。

---

## 技術邊界（強制）

| 允許 | 禁止 |
| --- | --- |
| 瀏覽器 **`WebAssembly.instantiate`／`compile`**（及同等內建 API） | 綁定 **Wasmer** 產品 SDK 當執行核 |
| **WASI preview1**（或文件釘死的同等子集）imports 由 **JS 宿主**實作 | **WASIX** 或任何「類 POSIX 完整行程」擴充當依賴 |
| 釘版、預先編好的 **WASI `.wasm` CLI**（自托管於 `public/` 或可信 CDN＋釘版） | 執行期從 registry 隨抓未釘版套件當產品承諾 |
| 薄 WASI shim（例：`@bjorn3/browser_wasi_shim` 或自研等價；僅作 preview1 宿主） | 以 WASIX Bash 長跑 instance 充當「真 Linux」 |

**能力天花板（對使用者／文件誠實）：** 允許清單內的 Unix **味**工具＋可選 JS 層管線／`cd`；**不是** wasmer.sh 級真 Bash。

---

## 背景與對齊

| 既有 | 本計劃關係 |
| --- | --- |
| 已移除 v86；下方 Python／JS REPL | Shell **並列**為第四個人類面板；不取代 Pyodide／JS |
| DEC-019 否決 `HOST.shell` + v86 | **不**矛盾：Agent 面是結構化 `runCmd`；人類面是命令調度器，不是 VM／WASIX Bash |
| `HOST.runPython`／觀察迴圈／DB | 仍是 Web／數據主路徑；Shell／`run_cmd` 補 CLI 驗證 |
| Pyodide 不依賴 COOP／COEP | **維持對齊**——本計劃同樣不把 COI 當硬依賴 |

參考實作形狀：

```text
載入釘版 cmd.wasm
→ WASI preview1 shim（preopen = 工作沙盒樹／OPFS 同步視圖）
→ WebAssembly.instantiate(module, { wasi_snapshot_preview1: … })
→ 跑完收集 stdout／stderr／exitcode

人類：xterm 顯示提示符 → 解析一行 → 同上（或內建 cd／help）
Agent：HOST.runCmd → 同上（無 TTY 狀態機）
```

---

## 設計原則

1. **雙消費面、單執行核：** WASI runner＋OPFS 同步只實作一份。
2. **HOST 仍是 Agent 唯一正式通道：** `run_cmd` → `functions.js` → `env.HOST.runCmd`；人類面板由遊樂場介面直接打 runtime（對齊 Python REPL，不經 HOST）。
3. **FS 權威 = 工作沙盒 OPFS：** WASI preopen 根對應專案（guest 路徑建議 `/` 或 `/project`，開工定案）；禁止寫現行 Agent 沙盒樹。
4. **釘版優於漂下載：** 每個允許命令對應固定 URL／hash 或 `public/playgrounds/wasi/*.wasm`。
5. **capabilities 誠實：** runtime／工具未就緒不宣稱 `runCmd`。
6. **錯誤機器可讀：** 沿用 `HostBridgeError.code`；新增碼見附錄 A。
7. **對外命名：** UI 用「Shell」；說明為「WASI 命令列／專案 CLI」，勿稱「虛擬機」「完整 Linux」。
8. **一命令一 Wasm（Agent 預設）：** 不把任意字串丟進 `bash -c`；管線若做，僅人類面板或另開 capability。

---

## 架構摘要

```text
工作沙盒 OPFS
      │
      ▼
 OPFS ↔ WASI preopen FS 同步層
      │
      ▼
 WASI preview1 shim + WebAssembly（瀏覽器內建）
      │
      ├──────────────┬────────────────────┐
      ▼              ▼                    ▼
 人類 Shell     HOST.runCmd         釘版 .wasm 工具表
 xterm 調度器   非互動 allowlist     （jq、…）
 session cwd    短跑 + timeout
```

| 面向 | 人類 Shell | Agent `run_cmd` |
| --- | --- | --- |
| UI | 下方 Tab + xterm | 範本 tool bubble |
| 進程 | 每次命令短跑 Wasm（無長跑 Bash） | 每次 tool call 短跑 |
| 輸入 | 一行命令（可選簡易管線，見 Phase 2） | `cmd` + `args` + 可選 `stdin` |
| 管線／鏈結／重導向／glob／readline | JS 調度器：`cd`／`pwd`／`help`／`export`／`unset`／`env`；`$VAR`／`$?`；`&&`／`||`／`;`；`>`／`>>`／`<`；未引號 `*`／`?`；`user@project` 提示符；Tab 補全；Ctrl+A/E/U/W/L；`|` 管線；session env 傳入 WASI | 可選 `env` 覆寫；一 binary 一呼叫；**不**共用人類 session；**無**鏈結／重導向／glob 字串 |
| 輸出 | 進終端 | stdout／stderr／exitCode；硬截斷 |
| 切換專案 | 重設 cwd／換 FS 視圖 | 下一次呼叫用當前 target／工作沙盒 |

---

## 目標 API 表面

### 遊樂場 runtime（內部；人類＋HOST 共用）

```
ensureWasiRunner()      # 載入 shim；不要求 crossOriginIsolated
syncProjectFs()         # OPFS → preopen 視圖
flushProjectFs()        # 寫回 OPFS（時機見 Phase 1）
runCmd({ cmd, args, stdin?, cwd?, env?, timeoutMs? })
listCmds()              # 允許清單（UI help 與 agent）
# 人類面板另有：readline 循環、session cwd／env、可選 reset
```

### Host API（Agent）

```
runCmd({ cmd, args?, stdin?, cwd?, env?, timeoutMs? })
  → { stdout, stderr, exitCode, truncated? }
listCmds()
  → { commands: [{ name, summary? }] }
```

`capabilities()` 新增例如：`runCmd`、`listCmds`（runtime 可用時出現）。

### 範本 Agent

| Tool | 路由（建議） | HOST |
| --- | --- | --- |
| `run_cmd` | `POST /api/host/cmd` | `runCmd` |
| `list_cmds` | `GET /api/host/cmds` | `listCmds` |

System prompt：說明允許命令、FS＝工作沙盒、**非**完整 Linux／無外網；驗證劇本可選「`run_cmd` → `read_file`／`reload_canvas`」。

### 建議初版允許清單

| 階段 | 命令 | 說明 |
| --- | --- | --- |
| Phase 0–1 | 至少 **一個** 釘版 WASI CLI（建議 `jq`）證明 instantiate＋preopen | 未知 `cmd` → `not_supported` |
| 後續 | 官方預編譯 **uutils** multicall（`coreutils.wasm`）；子命令個別 allowlist，argv0＝命令名 | 不含 `yes`／`dd`；升級版本時改 `wasiPin`＋sha |
| Phase 2 | 人類內建：`help`／`clear`／`cd`／`pwd`；`ls` 走 uutils WASI | session cwd 仍 JS |
| 其後 | 人類內建：`export`／`unset`／`env`；`$VAR`／`${VAR}`；`NAME=value cmd`；WASI env 傳入（解鎖 `printenv`） | session env；Agent 可選 `env` 覆寫 |
| 其後 | 追加釘版 WASI 工具（已含 `cowsay`／`cowthink`） | **僅** WASI；不引入 WASIX 套件 |

**不做：** 預設 `bash`／`sh` wasm 當萬用入口（易變成未審查腳本執行面）。若日後有經審查的 busybox-wasi 子集，須另開 DEC 修訂本計劃。

---

## 落地階段

| 階段 | 主題 | 完成定義 | 狀態 |
| --- | --- | --- | --- |
| **0. WASI runner** | 選 shim、釘一顆 `.wasm`、Worker 或主執行緒執行契約；**無 COI 要求** | `runCmd` 級 API 可對 mock／真 wasm 跑通 stdout | 已完成 |
| **1. OPFS preopen** | FS 同步；切換工作沙盒 | guest 讀寫與 OPFS／編輯器一致 | 已完成 |
| **2. 人類 Shell UI** | 下方 Shell Tab；xterm 調度器；help／cd | 可下允許命令；與 Python／JS／Console 並列 | 已完成 |
| **3. Agent `runCmd`** | HOST＋capabilities＋範本 tools；截斷／timeout | 範本 `list_cmds`／`run_cmd` round-trip；單元測 mock | 已完成 |
| **4. 打磨與邊界** | 輸出上限、互斥佇列、錯誤碼、host-api／GLOSSARY；人類 `|` 管線 | 手動清單＋`npm test`／`check`；DEC-021 Accepted | 已完成 |

狀態欄：`待開發`／`進行中`／`已完成`／`擱置`／`否決`。

---

## Phase 0 — WASI runner 與釘版工具

### 為何先做

先證明「瀏覽器 Wasm＋preview1 shim＋一顆 CLI」可跑，再接 OPFS 與 UI。**不**以 COOP／COEP 為擋路項。

### 範圍

- 選定 WASI preview1 宿主（優先現成薄 shim；避免自研完整 ABI，除非 shim 不合用）。
- 釘版第一個工具（建議 `jq` 的 WASI build）；存放與完整性策略寫進 `wasiPin.ts`（或等價）。
- 執行隔離：建議 **Web Worker**（對齊 Python／JS REPL）；timeout、記憶體／輸出硬上限。
- 契約：`runCmd` 內部形狀固定，供 Phase 2–3 接線。
- 文件：明確「WASI preview1 only」。

### 主要觸及（預期）

- 新：`hostWasi.ts`／`hostWasi.worker.ts`、`wasiPin.ts`、允許清單模組
- DEC-021 記錄 shim 與第一顆工具選型

### 完成定義

- [ ] 單元測或手動：對固定輸入跑通一顆 WASI CLI，取得 stdout／exitCode。
- [ ] **不**依賴 `crossOriginIsolated === true`。
- [ ] 依賴清單無 `@wasmer/sdk`；無 WASIX API 呼叫。

### 風險

- 各工具的 WASI 方言／路徑假設不一致——用契約測試鎖行為。
- 授權與二進位來源：只收可重現建置或可信釋出。

---

## Phase 1 — OPFS ↔ WASI preopen

### 範圍

- 「目前工作沙盒」→ shim 可用的 FS（記憶體樹自 OPFS／遊樂場快照填充，或等價）。
- **讀：** `runCmd`／人類命令前確保視圖含最新專案檔（對齊 canvas snapshot 慣例）。
- **寫：** 命令結束後 flush 回 OPFS；刷新檔案樹；編輯器衝突以 OPFS 為準（可提示重載）。
- 路徑：對齊既有 `bad_path`；拒絕逃出專案根。
- 切換 `openProject`：重設 session cwd、換 FS、進行中命令取消。

### 完成定義

- [ ] 測試或可重複手動：WASI 寫檔 → OPFS／側欄可見；編輯器存檔 → 下一命令讀得到（sync 邊界文件化）。
- [ ] 切換專案不會讀到上一專案內容。

### 風險

- 大專案全量 sync：可先全量，再增量。
- 二進位檔：preopen 須支援（對齊既有二進位 FS）。

---

## Phase 2 — 人類 Shell 面板

### 範圍

- 下方 Tab：**Shell**（與 Console／Python／JavaScript 並列）。
- xterm + FitAddon；懶載入 runner（開 Tab 再 init）。
- **行調度器**（非 Bash guest）：
  - 提示符顯示專案名或 cwd
  - 內建：`help`、`clear`、`cd`、`pwd`、`export`、`unset`、`env`；`ls` 走 uutils allowlist
  - session env 傳入 WASI；`$VAR`／`${VAR}`／`$?`；`NAME=value cmd`
  - 人類：`|` 管線；`&&`／`||`／`;`；`>`／`>>`／`<`；未引號 `*`／`?` glob；Tab／readline
  - 其餘：查 allowlist → `runCmd`
  - Agent 路徑仍禁用管線／鏈結／重導向／glob 字串
- 控制：重設 cwd／中斷進行中命令；說明列寫明 WASI 專案 CLI、非 Linux VM。
- **不要**經 `env.HOST` 暴露字元級 TTY。

### 主要觸及（預期）

- 新：`PlaygroundsShell.svelte`、`shellReadline.ts`（或等價）
- `PlaygroundsApp.svelte`（Tab）
- 樣式對齊現有 REPL 面板

### 完成定義

- [x] 開 Shell：有提示符；`pwd`／`cd` 正常；`help` 列出命令。
- [x] 至少一個 WASI 工具可改專案檔並在側欄可見。
- [x] 與 Python／JS REPL 可並存（最佳努力）。

---

## Phase 3 — Agent `runCmd`

### 範圍

| API | 行為 |
| --- | --- |
| `listCmds()` | 回傳允許命令清單 |
| `runCmd({ cmd, args?, stdin?, cwd?, env?, timeoutMs? })` | 非互動；cwd 相對專案根；可選 env 覆寫；timeout；stdout／stderr 硬上限＋`truncated` |

- `HostBridge`／`shellHostBridge`／`hostCapabilities`／`agentStarter` 對稱。
- 禁止寫現行 Agent（`agent_readonly`）。
- 單元測試：mock WASI runner（完整 `.wasm` 不必進 Vitest 主路徑，對齊 `runPython`）。
- 範本 system prompt 短說明＋可選 playbook。

### 完成定義

- [x] `capabilities` 含 `runCmd`／`listCmds`。
- [x] 範本 tool round-trip（mock 或手動）。
- [x] 未知命令、timeout 有穩定 `code`。
- [x] [playgrounds-host-api.md](./playgrounds-host-api.md) 已更新。

---

## Phase 4 — 打磨與邊界

### 範圍

- 輸出／stdin／argv 上限（**FS 鏡像預算已退役**，見 DEC-039）；`runCmd` **同沙盒互斥**（人類 Shell 與 Agent 共用 runner；**per-sandbox** 殼 `withSandboxFsGate`／Runtime `fsHold`——**否決** tab 全域單寫者；無關沙盒不互拖）。
- 無 WASI sockets／外網；文件寫明。
- 錯誤碼、GLOSSARY、DEC-021 → **Accepted**；本檔階段標已完成。
- 人類 Shell 簡易 `|` 管線（JS 串多次 Wasm；最多 8 段）；Agent `run_cmd` **不**接受管線字串。
- 可選（未做）：第二個釘版 WASI CLI——需要時另開迭代，不阻塞本階段。

### 完成定義

- [x] `npm test`／`npm run check` 通過。
- [x] 手動驗收清單（附錄 B）勾完。
- [x] 讀者可見文章**不**預告本計劃階段（對齊 AGENTS）。

---

## 與 DEC-019 的關係

| DEC-019 | 本計劃 |
| --- | --- |
| 不實作 `HOST.shell`（互動）+ v86 | **維持** |
| 已移除 v86 面板 | **維持**；新面板是 WASI 命令列，不是 VM |
| Agent 不要 Linux TTY | **維持**；改提供 `runCmd` |
| 人類用 Python REPL | **維持**；Shell **加**為並列能力 |

若 DEC-021 與 DEC-019 文案衝突，以 DEC-021 修訂註記為準。

---

## 測試與品質門檻

- 同步層、路徑、allowlist、截斷、錯誤碼、調度器解析：**Vitest**＋mock runner。
- 可選：一小顆正式 `.wasm` 的契約測（若 CI 體積可接受）；否則本機手動。
- 提交前 `npm test`、`npm run check`。
- Playgrounds UI 仍禁止 `alert`／`confirm`／`prompt`（DEC-016）。

---

## 建議實作順序（一人產能）

1. **Phase 0**（shim＋一顆 wasm）  
2. **Phase 1**（OPFS preopen）  
3. **Phase 2**（人類 Shell UI）  
4. **Phase 3**（`runCmd`＋範本）  
5. **Phase 4**（邊界＋可選第二工具／管線）

若找不到合用的 WASI 建置或 shim 成本過高：**擱置**並在 DEC-021 註明；勿改回 Wasmer／WASIX 當默認而不開新決策。

---

## 決策與文件同步

| 時機 | 動作 |
| --- | --- |
| 本計劃修訂（WASI-only） | 本檔；DEC-021；GLOSSARY；AGENTS 指標 |
| Phase 0 shim／第一工具定案 | 更新 DEC-021 選型註記 |
| Phase 3 API 定案 | 更新 [playgrounds-host-api.md](./playgrounds-host-api.md)、capabilities |
| 全程完成 | DEC-021 → Accepted |
| 若改回 Wasmer／WASIX | **新 DEC** 或大幅修訂 DEC-021；不可默默加依賴 |

---

## 附錄 A — 錯誤碼（新增／沿用）

| code | 含義 |
| --- | --- |
| `not_supported` | 未知 cmd／未實作／capability 關閉 |
| `host_unavailable` | bridge 未註冊 |
| `no_target` | 無工作／target 專案 |
| `bad_path` | cwd／路徑無效 |
| `agent_readonly` | 試圖寫現行 Agent |
| `timeout` | `runCmd` 逾時 |
| `cancelled` | 使用者／agent 中止 |
| `too_large` | stdout／stderr／stdin／argv 超硬上限（**不再**表示沙盒 FS 鏡像總量；見 DEC-039／[PG-WASI-OPFS-FS-PLAN.md](./PG-WASI-OPFS-FS-PLAN.md)） |
| `wasi_unavailable` | shim／wasm 載入失敗、instantiate 失敗 |

非零程序結束用回傳欄位 **`exitCode`**（與 stderr），**不**另發 `cmd_failed` bridge error。

---

## 附錄 B — 手動驗收清單

- [x] Shell：提示符、`pwd`／`cd`／`help`、至少一 WASI 命令改檔可見  
- [x] 切換工作沙盒後命令作用於新專案  
- [x] Agent：`list_cmds`、`run_cmd`；不可寫現行 Agent  
- [x] 畫布、Python REPL、JS REPL 仍可用  
- [x] 無需 COI 即可使用 Shell／`run_cmd`  
- [x] 依賴與網路請求中無 `@wasmer/sdk`／WASIX 套件載入  
- [x] 匯入／匯出專案（`.sam` 沙盒包裹）與 Shell 寫入一致  

---

## 附錄 C — 工具與技能分工

| 層 | 例子 | 誰實作 |
| --- | --- | --- |
| 工具 | WASI shim、OPFS preopen、Shell 面板、`HOST.runCmd`／`listCmds`、釘版 `.wasm` | 遊樂場 |
| 技能 | 「先 `run_cmd` 再 reload」「jq 驗證 fixture」playbook | `agentStarter`／可複製 Agent |

---

## 附錄 D — 已否決方向（本計劃範圍內）

| 方向 | 理由 |
| --- | --- |
| `@wasmer/sdk`＋WASIX Bash（wasmer.sh） | 超出「內建 Wasm＋WASI」；需 COI；與 DEC-021 修訂衝突 |
| v86／真 Linux | DEC-019 |
| 互動 `HOST.shell` TTY | DEC-019；模型應走結構化 `runCmd` |

---

## 維護

- 改階段狀態、API、允許清單或 shim／釘版時**更新本檔**。
- **勿**把 Wasmer／WASIX／v86／互動 `HOST.shell` 寫回必做項。
- 勿在讀者可見文章預告本計劃階段。
