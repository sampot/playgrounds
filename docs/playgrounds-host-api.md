# Playgrounds Host API 參考（v1）

給撰寫／修改「現行 Agent」這類單頁小程式（SAM）的人（含 Agent 自己）快速對照。沙盒主軸仍是輕量 Web；Agent 用途可不限 coding。HOST 僅注入給現行 Agent。權威決策見 [DECISIONS.md](./DECISIONS.md) DEC-016／017／018／019／020／021／022／023／**024**／**029**／**030**／**031**／**032**／**035**／**036**／**044**；階段見 [PG-AGENT-PLAN.md](./PG-AGENT-PLAN.md)、[PG-SAM-RUNTIME-PLAN.md](./PG-SAM-RUNTIME-PLAN.md)、[PG-SECRETSTORE-PLAN.md](./PG-SECRETSTORE-PLAN.md)、[PG-SAM-ENV-SPEC.md](./PG-SAM-ENV-SPEC.md)、[PG-SAM-BINDINGS-SPEC.md](./PG-SAM-BINDINGS-SPEC.md)、[PG-MAIN-CONTENT-PLAN.md](./PG-MAIN-CONTENT-PLAN.md)、[PG-BOTTOM-DOCK-PLAN.md](./PG-BOTTOM-DOCK-PLAN.md)、[PG-AGENT-MODEL-PLAN.md](./PG-AGENT-MODEL-PLAN.md)、[PG-AGENT-FLEET-UX-PLAN.md](./PG-AGENT-FLEET-UX-PLAN.md)。

**識別：** 沙盒 ID 程式名為 **`sandboxId`**（舊稱 `projectId`；遷移中見 AGENT-MODEL-PLAN Phase 0b）。

**整場重置（DEC-040；非 HOST）：** 「重置遊樂場」僅遊樂場介面（管理沙盒）提供，清光本機 OPFS／prefs／密鑰庫後回到首次空場。**勿**假設存在 `HOST.resetPlaygrounds` 或同類 API。

**通道（副作用）：** 畫布 **UI → `/api` → `functions.js` →** `env.HOST`／KV 等（僅 `sandboxId === activeAgentSandboxId` 時注入 HOST）。**Controller（必備於現行 Agent）** 為後端 DO 面（mailbox／排程）；畫布**不**直連 Controller。functions 與 Controller 皆可碰同一 resources（DEC-024／031）。**勿**把任務 loop 只放在畫布 `app.js`。**後端執行面（DEC-038；規格已定、實作未落地）：** 儲存權威在 Backend Runtime（殼**不**假設本機殼瀏覽器 OPFS）；`functions.js`∥`controller.js` 在 Runtime 執行（MVP＝Leader Dedicated Worker＋`postMessage`；路線可遷 WebRTC／他機 Runtime）；殼面 HOST 為可終端指令。見 [PG-BACKEND-RUNTIME-SPEC.md](./PG-BACKEND-RUNTIME-SPEC.md)。

**Controller：** 現行 Agent **必備**根目錄 `controller.js`（`onStart`／`onStop`／`onCommand`／`alarm`／可選 `fetch`）；直接使用 bindings（`KV`／`HOST` 等）；**無** `env.INFRA`。對 UI 的 HTTP 仍只經 `functions.js`。SAM 宣告在 `index.html` `<head>` 的 **`sam:*` meta**。見 DEC-024／031。

**版號：** `HOST.apiVersion()` → `"1"`；`HOST.capabilities()` 回傳已實作能力字串陣列。

**計劃中（尚未實作，勿假設存在）：** Phase 10 的 `evalInCanvas`、`applyPatch`——以 `capabilities()` 為準。**不會**有互動式 `HOST.shell`／v86（DEC-019）。**下方面板 dock（DEC-044；UI 已落地，HOST 未做）：** 下方預設僅 Console；Python／JS／Shell／自選 plain SAM 須明確加入；Worker／Pyodide／WASI／下方 iframe 真用才啟動。可選 HOST `openBottomPanel`／`closeBottomPanel`／`listBottomPanels`（名稱以計劃為準）——**未列前勿假設存在**。見 [PG-BOTTOM-DOCK-PLAN.md](./PG-BOTTOM-DOCK-PLAN.md)。WASI **`runCmd`／`listCmds`** 已落地（見 [PG-SHELL-PLAN.md](./PG-SHELL-PLAN.md)／DEC-021）。**擴展工具（DEC-022）：** 遊樂場可掛載工具沙盒進 Editor；工具沙盒 **`env.TOOL`**（grant 窄 FS）已落地。Agent 面 **`HOST.openTool`／`closeTool`／`getToolSession`** 已落地（grant host＝目前工作沙盒）。見 [PG-TOOLS-PLAN.md](./PG-TOOLS-PLAN.md)。**多 Agent session（DEC-023）：** 參與者 **`env.SESSION`**；事件 **BroadcastChannel**；HOST 子集 `openSession`／`closeSession`／`listSeats`／`joinSeat`／`leaveSeat`；Host 畫布另可呼叫 **`/api/shell/session/*`**（通道 API；領域 UX 在 Host）。見 [PG-MULTI-AGENT-SESSION-PLAN.md](./PG-MULTI-AGENT-SESSION-PLAN.md)。**大 SAM 導航（DEC-027）：** **`listDir`／`list_dir`** 已落地；大專案請用 `listDir`／`search`，勿整包 `listFiles` 探結構。見 [PG-FILE-NAV-PLAN.md](./PG-FILE-NAV-PLAN.md)。**沙盒工作集（DEC-028）：** **`setWorkingSet`**；`listProjects` 摘要含 `inWorkingSet`／`clonedFrom`／`cloneIntent`（全量）；HOST `createProject` 預設進工作集、`cloneProject` 預設不進。見 [PG-SANDBOX-INSTANCE-PLAN.md](./PG-SANDBOX-INSTANCE-PLAN.md)。**SecretStore／密鑰庫（DEC-029；已落地）：** 遊樂場級密文庫；password 或 **WebAuthn PRF 生物識別** unlock／lock（刷新＝lock；無 PRF 時 UI 隱藏生物識別）；**每 secret 獨立** `env.secrets.<NAME>.get()`（DEC-035）；HOST 僅 `getSecretStoreStatus`／`listSecrets`（無值；`listSecretNames` 相容別名）；**無**遊樂場代打、**無** `env.SECRETS` bag；**永不**進 `.sam`。見 [PG-SECRETSTORE-PLAN.md](./PG-SECRETSTORE-PLAN.md)。**SAM 執行期參數（DEC-035；已落地）：** 沙盒根目錄 `.env` → 同步唯讀 `env.vars`；與 `env.secrets` 同為小寫命名空間。見 [PG-SAM-ENV-SPEC.md](./PG-SAM-ENV-SPEC.md)。**Main content tabs（DEC-030；已落地）：** main content 以 tabs 在**編輯器**與已掛沙盒畫布間切換（SAM canvas **最多 4**；不切工作沙盒）；預設 **plain**（無 `env.TOOL`），Tool＝可選 grant（前景才注入）。HOST：`openMainCanvas`／`listMainTabs`／`setMainTab`／`closeMainTab`／`getMainTab`；`openTool` 為帶 grant 的 tab 特例。見 [PG-MAIN-CONTENT-PLAN.md](./PG-MAIN-CONTENT-PLAN.md)。**Agent Model（DEC-031；已落地核心）：** Durable mailbox／`ctx.send`／單 Leader／`onPause`／`onResume`／SESSION→mailbox；`capabilities()` 含 `agentMailbox`／`agentLeader`／`agentRegistry`。見 [PG-AGENT-MODEL-PLAN.md](./PG-AGENT-MODEL-PLAN.md)。**Agent 艦隊觀測（DEC-032；已落地）：** 遊樂場「管理沙盒 → 運行」；HOST **`listFleetSummary`／`getAgentUi`／`setAgentUi`**（只讀摘要＋顯示標註；**無**訊息 payload／密鑰）。見 [PG-AGENT-FLEET-UX-PLAN.md](./PG-AGENT-FLEET-UX-PLAN.md)。

---

## 方法摘要

| 方法 | 說明 |
| --- | --- |
| `apiVersion` / `capabilities` | 契約探測 |
| `listProjects` / `getProject` / `createProject` / `cloneProject` / `setWorkingSet` / `deleteProject` / `openProject` | 沙盒。對**任何**工作沙盒可 `openProject`／`setTarget` 後讀寫；HOST create／clone 帶 `agentManaged: true`。`listProjects` 回**全量**摘要（含有效 `inWorkingSet`、`clonedFrom?`、`cloneIntent?`、`toolKinds?`／`toolGlobs?`）——Picker 只顯示工作集，總管盤點看全表。`createProject(name, { inWorkingSet?, cloneIntent? })` 預設 `inWorkingSet: true`、`cloneIntent: steward_for_user`。`cloneProject(sourceId, newName?, { state?, inWorkingSet?, cloneIntent? })` 預設 `inWorkingSet: false`、`cloneIntent: self_upgrade`、寫入 `clonedFrom`；**預設不**複製 Durable 狀態（`state.secrets` 忽略）。`setWorkingSet(id, boolean)` 加入／移出 Picker，不改 `agentManaged`。`deleteProject` **僅**允許刪除 agentManaged，且不可刪現行 Agent（並清除該 id 的 KV／DB／checkpoints；SecretStore 為遊樂場級、不隨專案刪） |
| `get/setActiveAgent` / `get/setTargetProject` | Agent／target（`setActiveAgent` 會延遲重載 Agent iframe，以便當前回應送完） |
| `listFiles` / `listDir` / `readFile` / `writeFile` / `mkdir` / `remove` | FS（文字；`listDir`＝可裁切目錄列舉，見 DEC-027；`readFile`／`writeFile` 含 `hash`；可選 `expectedHash`） |
| `readFileBase64` / `writeFileBase64` | 二進位 FS（base64；單檔硬上限 5 MiB） |
| `openFile(path | { path, content?, contentBase64?, focusOnly? })` | **殼面終端**（DEC-038）：在遊樂場編輯器／媒體預覽開啟。須帶 `content`／`contentBase64`，或路徑已在目前工作沙盒緩衝；**禁止**為完成指令再向權威儲存拉檔。僅作用於目前工作沙盒。 |
| `openTool({ toolSandboxId, paths, mode?, focusPath? })` | 掛載另一 SAM 為工具進 main content tab（不切工作沙盒）；grant host＝目前工作沙盒（舊欄位名 `toolProjectId` 遷移中相容） |
| `closeTool()` / `getToolSession()` | 關閉帶 grant 的 tab／查詢目前工具 session |
| `openMainCanvas({ sandboxId })` | 開啟 plain 沙盒畫布 tab（無 grant；最多 4；舊欄位名 `projectId` 遷移中相容） |
| `listMainTabs()` / `getMainTab()` / `setMainTab({ tabId })` / `closeMainTab({ tabId? })` | 主內容 tabs（含 `editor`） |
| `openSession` / `closeSession` / `pauseSession` / `resumeSession` / `getSession` | 多 Agent session 生命週期；coding 編排時 Host＝現行總管、`targetSandboxId`＝目前工作沙盒；`openSession({ chatSessionId })` 供 1:1 綁定 |
| `spawnParticipant` / `hostSessionFetch` | 邀請入座；呼叫工作 Host 領域 `/api/session/*`（DEC-033） |
| `listSeats` / `joinSeat` / `leaveSeat` | 列出／加入／離開 Participant 座位 |
| `search({ query, glob?, maxResults? })` | 文字子字串搜尋 |
| `reloadCanvas` / `getConsole` / `clearConsole` / `waitConsole` / `getCanvasStatus` | 觀察迴圈（status 含 `networkSize`；**`viewport`**：iframe 尺寸／scroll overflow／各 `<canvas>` 可見比例與 `clipped`） |
| `getNetworkLog({ since? })` / `clearNetworkLog` | 工作畫布**同源** `fetch` 摘要（method／url／status／duration；無 body） |
| `getDomSnapshot({ maxChars? })` | 工作畫布精簡 DOM／a11y 摘要（剝 input value；硬上限字元） |
| `runPython({ code, packages?, timeoutMs? })` | 遊樂場 Pyodide Worker；允許套件 `numpy`／`pandas`／`scipy`／`matplotlib`；回傳 stdout／stderr／result |
| `runCmd({ cmd, args?, stdin?, cwd?, env?, timeoutMs? })` | 允許清單 WASI CLI（`jq`＋uutils multicall 子命令）；對 target 沙盒 FS；寫入會落回 OPFS；回傳 stdout／stderr／exitCode／可選 `truncated`。可選 `env` 覆寫（與預設 HOME／USER／PATH／PWD／TERM 合併）。見下方邊界 |
| `listCmds()` | 允許的 WASI 命令清單 |
| `captureCanvas({ path?, maxWidth? })` | 工作畫布 PNG 截圖（best-effort：依 getBoundingClientRect 合成 HTML 近似＋live `<canvas>` 像素；不走 SVG foreignObject）；有 `path` 則寫入專案且不回傳巨量 base64；**永不** remount 工作畫布；回傳 `note`：勿在截圖後 `reloadCanvas`；截圖可能含完整可捲動內容，**不能**單獨證明預設預覽無裁切——請搭配 `getCanvasStatus().viewport` |
| `getSecretStoreStatus()` | `{ state: "absent"\|"locked"\|"unlocked", secretCount?, webauthnRegistered? }` — 無密鑰值；unlock 僅遊樂場「密鑰庫」UI（password 或已登錄之 WebAuthn） |
| `listSecrets()` | `{ secrets: SecretMeta[] }`（name／kind／allowedHosts／defaultBaseUrl／updatedAt；**無值**） |
| `listSecretNames()` | （相容別名）`{ names: string[] }`；可選 `sandboxId` 參數忽略。新程式請用 `listSecrets` |
| `createPlatformInvite({ kind?, intent?, targetField?, ttlMs? })` | **殼代理**鑄場 Invite（DEC-047）：讀場殼**記憶體**中經 provision 取得的 Platform API key，代呼 Platform API；回 `invite_id`／`short_url`／`deep_link`／`secret`／`expires_at`／`kind`。**不**回傳 API key。`targetField` 預設＝目前場 **`location.origin`**（本機為 `http://localhost:…`）。無記憶體 key → `not_provisioned`（引導回 dash「登入我的遊樂場」）。**不**讀 SecretStore `PLAYGROUNDS_API_KEY`（舊路徑廢止） |
| `revokePlatformInvite({ inviteId })` | 撤銷場 Invite（同殼代理；持同一記憶體 API key） |
| `checkpoint` / `listCheckpoints` / `restore` | target 專案快照 |
| `listFleetSummary({ includeTraffic?, maxNodes? })` | Agent 艦隊只讀摘要：Leader／計數／壓力／attention／agents（depth／poison／roleLabel／health…）；**無**訊息 body。`includeTraffic` 時附近期 send 配對權重 |
| `getAgentUi(agentId)` / `setAgentUi(agentId, patch)` | `agent.ui` 顯示標註（roleLabel／groupId／health／healthDetail／successorOf）；存於 runtime `ui-annotations.json`；`null` 欄位清除；須 registry 已有該 agent |

**禁止：** 對**現行 Agent**沙盒 `writeFile`／`writeFileBase64`／`mkdir`／`remove`／`checkpoint`／`restore`（`agent_readonly`）；`deleteProject` 對使用者沙盒或現行 Agent（`forbidden`）。`runCmd` 對現行 Agent 的寫入同樣 `agent_readonly`。

---

## `runCmd`／`listCmds` 邊界（DEC-021）

- **Runtime：** 瀏覽器內建 Wasm＋WASI preview1（`@bjorn3/browser_wasi_shim`）；**無** WASIX、**無** `@wasmer/sdk`、**無** COI 要求。
- **網路：** guest **無** sockets／外網；不可當通用 HTTP 客戶端。
- **命令：** 僅 `listCmds()` 允許清單（`jq`；`grep`／`sed`／`find`／`awk`；`diff`／`cmp`；`cowsay`／`cowthink`；uutils `coreutils.wasm` 子命令如 `wc`／`cat`／`sha256sum`，不含 `yes`／`dd`）；未知 cmd → `not_supported`。同一 Module 以 **argv0＝命令名** 調度。人類 Shell 另有 JS host `xargs`（非 WASI、不進 Agent `runCmd`）。
- **管線／鏈結／重導向／glob：** Agent **單次一命令**（勿傳管線／`xargs`／`&&`／重導向／glob 字串）；人類 Shell 可另做 `|`、`xargs`、`&&`／`||`／`;`、`>`／`>>`／`<`、未引號 `*`／`?`（遊樂場調度）。
- **環境變數：** 每次執行傳入 WASI env。省略 `env` 時用預設（`HOME=/`、`USER=playground`、`PATH=/bin`、`PWD` 依 cwd、`TERM=xterm-256color`）；提供 `env` 時與預設合併（Agent）。人類 Shell 另有 session 級 `export`／`unset`／`env`／`$VAR`（不與 Agent 共用）。
- **互斥：** 與人類 Shell 共用同一佇列；並行呼叫會序列化。
- **上限：** timeout（預設 30s、硬上限 120s）；stdout／stderr／stdin 字元截斷（`truncated: true`）；argv 過多 → `too_large`。**產品主路徑（DEC-039）：** Worker 內 OPFS `FileSystemSyncAccessHandle` fd 直連；**不以**沙盒 FS 總量觸發 `too_large`。見 [PG-WASI-OPFS-FS-PLAN.md](./PG-WASI-OPFS-FS-PLAN.md)。
- **結束狀態：** 非零結束以 **`exitCode`**（加 stderr）表達，**不**使用 `cmd_failed`。
- **錯誤碼：** `not_supported`、`bad_path`、`timeout`、`cancelled`、`too_large`（僅 argv／stdin／stdout／stderr 等單次上限，**不是**專案過大）、`wasi_unavailable`、`agent_readonly`、`host_unavailable`、`no_target`（見 Shell 計劃附錄 A／[PG-WASI-OPFS-FS-PLAN.md](./PG-WASI-OPFS-FS-PLAN.md) 附錄 A）。

---

## 範本路由（總管 `functions.js`／`sampot/pg-steward`）

| 路由 | HOST／binding |
| --- | --- |
| `GET /api/host/meta` | apiVersion + capabilities |
| `GET/POST/DELETE /api/host/projects` | list／create／delete（DELETE 僅 agentManaged；POST 可帶 `inWorkingSet`／`cloneIntent`） |
| `POST /api/host/working-set` | setWorkingSet（`{ id, inWorkingSet }`） |
| `POST /api/host/fleet-summary` | listFleetSummary（`{ includeTraffic?, maxNodes? }`） |
| `GET /api/host/agent-ui?agentId=` | getAgentUi → `{ ui }` |
| `POST /api/host/agent-ui` | setAgentUi（body：`agentId`＋patch）→ `{ ui }` |
| `GET /api/host/project?id=` | getProject |
| `POST /api/host/open` | openProject（遊樂場切換工作沙盒） |
| `GET/POST /api/host/target` | get／set target |
| `GET/POST /api/host/active-agent` | get／set active agent |
| `POST /api/host/clone` | cloneProject（可帶 `inWorkingSet`／`cloneIntent`／`state`） |
| `GET /api/host/files` | listFiles |
| `POST /api/host/list-dir` | listDir（`prefix`／`depth`／`maxEntries`） |
| `POST /api/host/search` | search |
| `GET/PUT/DELETE /api/host/file` | read／write／remove |
| `GET/PUT /api/host/file-base64` | readFileBase64／writeFileBase64 |
| `POST /api/host/open-file` | openFile（遊樂場編輯器／媒體預覽） |
| `POST /api/host/tool/open` | openTool |
| `POST /api/host/tool/close` | closeTool |
| `GET /api/host/tool` | getToolSession → `{ session }` |
| `POST /api/host/session/open` | openSession（可選 body `chatSessionId`，coding 編排 1:1） |
| `POST /api/host/session/close` | closeSession |
| `POST /api/host/session/pause` | pauseSession |
| `POST /api/host/session/resume` | resumeSession |
| `GET /api/host/session` | getSession → `{ session }`（inactive 時 `session: null`） |
| `GET /api/host/session/seats` | listSeats → `{ seats }` |
| `POST /api/host/session/join` | joinSeat |
| `POST /api/host/session/leave` | leaveSeat |
| `POST /api/host/session/spawn-participant` | spawnParticipant（invite 入座） |
| `POST /api/host/session/fetch` | hostSessionFetch → 工作 Host `/api/session/*`（events／fileWrites 由遊樂場介面處理） |
| `GET/POST /api/shell/session/*` | Host **工作沙盒畫布**通道 API（status／open／close／pause／resume／projects／join／leave／spawn-participant）；非 Agent HOST 路由 |
| `POST /api/host/mkdir` | mkdir |
| `POST /api/host/reload` | reloadCanvas |
| `GET /api/host/console` | getConsole |
| `POST /api/host/console/clear` | clearConsole |
| `POST /api/host/console/wait` | waitConsole |
| `GET /api/host/canvas-status` | getCanvasStatus |
| `GET /api/host/network` | getNetworkLog |
| `POST /api/host/network/clear` | clearNetworkLog |
| `POST /api/host/dom-snapshot` | getDomSnapshot |
| `POST /api/host/python` | runPython；可選 `writeResultPath`：若最後運算式／stdout 末行是 base64，則寫入該沙盒路徑並回傳 `{ path, byteLength, … }`（不含巨量 base64；供出圖） |
| `GET /api/host/cmds` | listCmds |
| `POST /api/host/cmd` | runCmd |
| `POST /api/host/capture` | captureCanvas |
| `GET /api/host/secret-store` | getSecretStoreStatus |
| `GET /api/host/secrets` | listSecrets（meta，無值） |
| `POST /api/llm/chat`／`/api/llm/test` | 總管 functions：以 `env.secrets.<NAME>.get()` 取密鑰後打 upstream（非遊樂場代打） |
| `POST /api/host/checkpoint` 等 | checkpoint／list／restore |
| `GET/PUT/DELETE /api/kv` | 該沙盒 **Durable KV**（session 等；不經 HOST） |

---

## 錯誤碼

見 [PG-AGENT-PLAN.md](./PG-AGENT-PLAN.md) 附錄 A。HTTP JSON：`{ error, code }`。

---

## Bindings

| Binding | 語意 |
| --- | --- |
| `env.KV` | Durable（OPFS `playgrounds-kv/<sandboxId>/`；目錄前綴歷史名可保留）；無 OPFS 時記憶體。export／clone **預設不**複製；可選 `state.kv`／`.sam` 的 `.playgrounds-state/`。 |
| `env.DB` | 仿 D1（sql.js **子集**；OPFS `playgrounds-db/<sandboxId>/db.sqlite`）。同上，可選 `state.db`。見 DEC-020。 |
| `env.vars`（DEC-035） | 小寫命名空間；沙盒根目錄 `.env` → 同步唯讀字串對。缺檔＝空命名空間。見 [PG-SAM-ENV-SPEC.md](./PG-SAM-ENV-SPEC.md)。 |
| `env.secrets.*`（DEC-029／035） | **每 secret 一顆**：`env.secrets.<NAME>`＝`{ get(): Promise<string> }`；須 unlock。值永不進 `.sam`；HOST 不回傳值。Tool 為空命名空間；Session 參與者可注入。**無** `env.SECRETS`／`env.secrets.get(name)` bag；**無**頂層密鑰鍵。 |
| `env.HOST` | 僅現行 Agent（總管） |
| `env.COMPUTE`（DEC-036） | 一般 SAM 經 `sam:capabilities` 宣告＋使用者準入後注入的**窄** compute binding（`runPython`／可選 `runCmd`）；≠ 完整 HOST。自己的檔案／`vars`／KV／DB 為 intrinsic、不必宣告。見 [PG-SAM-BINDINGS-SPEC.md](./PG-SAM-BINDINGS-SPEC.md)。 |
| `env.TOOL` | **歷史名**（DEC-022 MVP）。目標改 **`env.DELEGATE`**（DEC-037）：Tool 與 worker 統一；grant 範圍可含 OPFS 與虛擬 `.bindings/db`｜`kv`。見 [PG-DELEGATE-GRANT-PLAN.md](./PG-DELEGATE-GRANT-PLAN.md)。現行：僅工具 session 期間注入**工具沙盒**；grant 範圍內讀寫 **host／工作沙盒**檔。方法：`apiVersion`／`capabilities`／`getGrant`／`readFile`／`writeFile`（可選 `expectedHash`）／`readFileBase64`／`writeFileBase64`／`close`。範本工具（`toolStarter`）薄路由：`GET /api/tool/meta|grant|file|file-base64`，`PUT /api/tool/file|file-base64`，`POST /api/tool/close`。見 [PG-TOOLS-PLAN.md](./PG-TOOLS-PLAN.md)。 |
| `env.DELEGATE` | **DEC-037（落地中）：** 委派 grant 期間注入（Tool tab 或 session worker）；與 `env.TOOL` 同物件（雙掛）。grant 可含 OPFS path 與虛擬 `.bindings/db`｜`kv`。見 [PG-DELEGATE-GRANT-PLAN.md](./PG-DELEGATE-GRANT-PLAN.md)。 |
| `env.SESSION` | 僅已入座的 Participant 專案；`apiVersion`／`capabilities`／`getSeat`／`getState`／`getEventChannel`／`act`／`leave`。事件推送用 BroadcastChannel（`getEventChannel().name`）。見 DEC-023。領域語意由 Host **session protocol** 決定（例：`brainstorm.v1`、`coding-orchestration.v1`／DEC-033）；通道本身不解釋任務／棋步。 |

### HOST 本地面｜殼面（DEC-038）

執行面分類見 `hostMethodSurface.ts`：

- **local（Runtime）：** FS／專案／KV 面／search／checkpoint／fleet 摘要／`runPython`／`runCmd` 等。
- **shell（終端）：** `openFile`／`reloadCanvas`／DOM／console／main tabs／session UI 等——執行期**不得**再向 Runtime 拉權威儲存來完成該指令。
