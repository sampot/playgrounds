# Playgrounds 擴展工具（Tool SAM）實作計劃

本檔把「用沙盒專案當長時間互動工具、在個人工具箱裡累積」從討論收斂成可落地的階段計劃。權威架構決策見 [DECISIONS.md](./DECISIONS.md) **DEC-022**（Accepted）；與既有沙盒／agent／Shell 邊界見 **DEC-016**／**017**／**019**／**021**。Agent runtime 其餘能力仍以 [PG-AGENT-PLAN.md](./PG-AGENT-PLAN.md)、[playgrounds-host-api.md](./playgrounds-host-api.md) 為準。

一句話：**工作沙盒開發中，可把另一個 SAM 以「工具」角色掛進 Editor 槽長跑；經窄授權讀寫工作沙盒指定路徑；工具本身仍是可匯入／迭代的普通專案——個人工具箱在沙盒專案之間長出來，不進站上 `/tools/`。**

**狀態：** Phase 0–6 **已完成**（2026-08-01）。**後續：** grant 擴充（`.bindings/db`｜`kv`）與 binding 更名 **`env.TOOL` → `env.DELEGATE`**（Tool／worker 統一）見 [PG-DELEGATE-GRANT-PLAN.md](./PG-DELEGATE-GRANT-PLAN.md)／**DEC-037**（尚未實作）。本檔 Phase 表仍記錄已落地之 `TOOL` 實作史。

> **後續（DEC-030）：** main content 以 **tabs** 在編輯器與已掛沙盒畫布間切換；掛載不必是 Tool（grant／`env.TOOL` 可選）。SAM canvas **最多 4**；MVP 至多一個帶 grant。以 [PG-MAIN-CONTENT-PLAN.md](./PG-MAIN-CONTENT-PLAN.md) 為準。

---

## 產品定位（為何做）

站上 `/tools/` 是**作者代選**的少而穩公開工具箱（DEC-008／[TOOLS-PLAN.md](./TOOLS-PLAN.md)）：無法適配每個人的任務。Playgrounds 要成為**大一統工具執行場**：

```text
任務出現
  → Agent 幫做出／改好一個 SAM
  → 當下當工作沙盒用（畫布驗證）
  → 之後當工具沙盒掛上（Editor 槽＋grant）
  → 個人工具箱多一件
  → 下一任務復用或再迭代
```

| 路線 | 供給 | 適配 |
| --- | --- | --- |
| `/tools/` | 作者＋AI 上架 | 作者場景子集 |
| **擴展工具（本計劃）** | 使用者＋Agent，OPFS 累積 | 每人一套 |

**戰略：** 新工具產能與野心掛 Playgrounds；`/tools/` **凍結擴張**（既有頁可留作過渡／歷史成品，見 TOOLS-PLAN 註記）。勿把 Tool SAM 登錄進 `src/data/tools.ts` 或要求介紹文才能用。

---

## 目標與非目標

### 目標

- **人類：** 在工作沙盒 A 脈絡下，從遊樂場（或 A／Agent 發起）開啟沙盒 B 為**工具**；B 顯示在 **Editor 面板（main content）**；可關閉回到 CodeMirror／媒體預覽。
- **工具 SAM：** 經遊樂場介面注入的 **`env.TOOL`**（暫名）讀寫 **grant 範圍內**工作沙盒檔案；長時間互動 UI（viewer／editor 等）留在 B 沙盒內。
- **Agent（後續階段）：** `HOST.openTool`／`closeTool`（可探測）；可幫使用者掛上既有工具沙盒，**不**把完整 HOST 交給工具 iframe。
- **角色分離：** 掛載工具 **≠** `openProject(toolId)`——工作沙盒 `activeId`、檔案樹、工作畫布、Shell cwd 維持 A。

### 非目標

- 在 WASI／`runCmd` 做互動 TTY 編輯器取代本計劃（DEC-021 短跑邊界維持）。
- 給工具 iframe 完整 `env.HOST`（避免第二個 Agent）。
- 站上工具超市、簽名 plugin 市集、多租戶隔離、帳號雲端工具同步。
- 嵌 `/tools/*` UI 進 Editor（對齊不嵌 python-runner）。
- MVP：跨專案任意 IPC、工具默認讀寫整個工作沙盒或 A 的 KV／DB／Secrets。**Editor↔SAM tabs／多 canvas（≤4）** 見 [PG-MAIN-CONTENT-PLAN.md](./PG-MAIN-CONTENT-PLAN.md)（DEC-030；MVP 至多一個帶 grant）。
- 讀者可見文章預告「接下來會做哪些 Phase」。

---

## 背景與對齊

| 既有 | 本計劃關係 |
| --- | --- |
| SAM＝專案單位（DEC-016） | 工具也是普通 SAM；角色依場合變 |
| 雙執行面：工作沙盒＋現行 Agent（DEC-017） | **第三角色：工具沙盒**；UI 在 Editor 槽，不是 Agent 區 |
| `env.HOST` 僅現行 Agent | 工具走 **`env.TOOL`**；契約分離 |
| WASI Shell／`runCmd`（DEC-021） | 短跑 CLI；長互動 → Tool SAM |
| 遊樂場 CodeMirror／`openFile` 媒體預覽 | Default 槽內容；Tool 模式暫時取代 |
| 畫布 SW `/playgrounds/canvas/<id>/` | 工具＝**第三條** canvas 管線（同 SW，不同 projectId） |
| `/tools/`（DEC-008） | **不再擴張**；個人工具箱＝沙盒專案列表 |

```text
┌─────────────┐  掛載為工具   ┌─────────────┐
│ 工作沙盒 A   │ ──────────► │ 工具沙盒 B   │
│ activeId    │              │ Editor 槽   │
└─────────────┘              └─────────────┘
       ▲                            │
       │ 可選現行 Agent C            │ env.TOOL + grant
       │（左側 Agent 區）            ▼
       └──────── A 的 OPFS 檔案樹 ◄──┘
```

---

## 設計原則

1. **三角色、工作脈絡不變：** 工作／工具／Agent 可同時存在；切工具不切 `activeId`。
2. **介面宜薄、SAM 厚：** 遊樂場只做槽位、grant、注入與卸權；viewer／editor UX 全在工具沙盒。
3. **最小授權：** 初版僅指定 path（或目錄前綴）的 `read`／`readwrite`；能力用 `toolApiVersion`＋`capabilities()` 誠實揭露。
4. **TOOL ≠ HOST：** 工具不得默默拿到專案列表刪除、`setActiveAgent`、全 FS 等。
5. **單槽 MVP：** 同時最多一個掛載工具；關閉即卸授權。
6. **錯誤機器可讀：** 沿用 `HostBridgeError.code` 風格；新增碼見附錄 A。
7. **狗糧：** 內建或範本提供至少一個極簡 Tool SAM（例如純文字／Markdown 預覽編輯），證明 grant 迴圈。
8. **對外命名：** UI 用「工具」／「用沙盒開啟」；文件可用 **Tool SAM**／**工具沙盒**；勿稱 plugin 市集或第二個 IDE。

---

## 架構摘要

### Editor 槽狀態

| 模式 | 內容 |
| --- | --- |
| **Default** | CodeMirror 或既有媒體預覽（現況） |
| **Tool** | 工具沙盒 canvas iframe（`/playgrounds/canvas/<toolProjectId>/…`）＋薄 chrome（工具名、focus path、關閉） |

### 遊樂場狀態（建議）

```
activeId                     # 工作沙盒（不變）
activeAgentProjectId         # 現行 Agent（既有）
activeToolSession?           # { toolProjectId, hostProjectId, grant, focusPath? }
```

`activeToolSession` **不是**把工作沙盒切成工具 id。

### 授權（grant）

```
grant = {
  hostProjectId: string,     # 通常 === activeId
  paths: string[],           # 精確 path 與／或目錄前綴（開工定案正規化規則）
  mode: "read" | "readwrite"
}
```

### 注入（僅工具模式＋該 toolProjectId 的 functions）

```
env.TOOL.apiVersion()
env.TOOL.capabilities()
env.TOOL.getGrant()
env.TOOL.readFile / writeFile          # 文字；路徑必須通過 grant
env.TOOL.readFileBase64 / writeFileBase64
env.TOOL.close({ dirty? })             # 請求遊樂場卸掛載
# 可選後續：listDir（僅 grant 內）、stat、reloadHostCanvas
```

工具沙盒自己的 `env.KV`／DB／Secrets **照常**（操作自己的 side store）；**grant 不**開放 host 的 Durable 狀態（除非未來另開 capability，預設關）。

### 生命周期

```text
openTool({ toolProjectId, grant, focusPath? })
  → 驗證專案存在、grant 合法、host === 工作沙盒（MVP）
  → 若已有 session：先 close
  → 同步工具沙盒 canvas 快照 → Editor iframe
  → 注入 TOOL + 初始 focusPath
  → chrome 顯示「工具 B · path」

write／read → 僅 host OPFS ∩ grant
close／TOOL.close → 卸 iframe、清 session、Editor 回 Default
  → （可選）若 dirty：提示側欄刷新／開檔
```

**與編輯器衝突（MVP）：** 進入 Tool 模式時，若 Default 編輯器正開著 grant 內且已改未存的檔，先提示存檔或放棄，或暫時鎖定該 path 的 CodeMirror buffer（開工選一；建議提示＋鎖定）。

---

## 目標 API 表面

### 遊樂場 runtime（內部）

```
openToolSession(opts) / closeToolSession()
getToolSession()
assertToolGrant(path, mode)
# 工具 canvas 同步：對齊既有 agent／work canvas SW 路徑
```

### `env.TOOL`（工具沙盒 functions.js）

見上；僅 `projectId === activeToolSession.toolProjectId` 時注入。

### Host API（Agent；偏後階段）

```
openTool({ toolProjectId, paths, mode?, focusPath? })
closeTool()
getToolSession() → null | { toolProjectId, hostProjectId, paths, mode, focusPath? }
```

`HOST.capabilities()` 新增例如：`openTool`、`closeTool`、`getToolSession`（實作後才出現）。

### 工作沙盒發起（可選同階段或緊接）

工作沙盒 **不**注入完整 TOOL／HOST；可由遊樂場介面提供薄橋，例如畫布 `postMessage` 經遊樂場介面白名單轉成 `openToolSession`（須防任意專案自抬權限——**發起開放請求，grant 仍由遊樂場介面依使用者確認或固定規則核發**）。MVP 可只做**遊樂場 UI 發起**，工作沙盒／Agent 發起放後面。

### 範本 Agent tools（Phase 開 HOST 時）

| Tool | 路由（建議） | HOST |
| --- | --- | --- |
| `open_tool` | `POST /api/host/tool/open` | `openTool` |
| `close_tool` | `POST /api/host/tool/close` | `closeTool` |
| `get_tool_session` | `GET /api/host/tool` | `getToolSession` |

---

## 落地階段

| 階段 | 主題 | 完成定義 | 狀態 |
| --- | --- | --- | --- |
| **0. 契約與 DEC** | DEC-022 Accepted；用語進 GLOSSARY；本檔＋host-api 草稿表面 | 文件與錯誤碼表齊；單元測 grant 正規化／拒絕 | 已完成 |
| **1. Editor 槽＋掛載** | Tool 模式 iframe；chrome；不切 `activeId`；關閉還原 | 手動：A 為工作沙盒時掛 B，檔案樹仍是 A | 已完成 |
| **2. `env.TOOL`＋grant FS** | 注入、讀寫／base64、越權碼；與 OPFS 一致 | 測試：允許／拒絕 path、read-only 寫入失敗 | 已完成 |
| **3. 遊樂場開啟 UX** | 「用沙盒開啟」選 B＋path＋mode；衝突提示 | 無 Agent 也能完成 viewer／editor 迴圈 | 已完成 |
| **4. 範本 Tool SAM** | 極簡文字／Markdown 工具沙盒可一鍵建立 | 新使用者可狗糧：開檔 → 工具編 → 寫回 | 已完成 |
| **5. Agent `openTool`** | HOST＋capabilities＋範本 tools | 範本可掛／關工具；舊 Agent 不強制遷移 | 已完成 |
| **6. 打磨** | 重整還原策略、發現性（可選 meta）、文件收斂 | 手動清單＋`npm test`／`check` | 待開發 |

狀態欄：`待開發`／`進行中`／`已完成`／`擱置`／`否決`。

---

## Phase 0 — 契約與決策

### 範圍

- [DECISIONS.md](./DECISIONS.md) **DEC-022** 標 **Accepted**（產品：個人工具箱在沙盒累積；機制：Tool 槽＋`env.TOOL`＋grant；凍結 `/tools/` 擴張）。
- [GLOSSARY.md](./GLOSSARY.md)：工具沙盒、工具模式、grant、`env.TOOL`。
- 純邏輯模組（建議 `toolGrant.ts`）：path 正規化、前綴匹配、`mode` 檢查；Vitest。
- [playgrounds-host-api.md](./playgrounds-host-api.md) 增加「計劃中：Tool／openTool」一節（未實作勿宣稱 capabilities）。

### 完成定義

- [x] DEC-022 Accepted；本檔 Phase 0 標已完成。
- [x] grant 單元測：精確命中、前綴、`..`／逃逸拒絕、read-only（`toolGrant.test.ts`）。
- [x] TOOLS-PLAN 註明凍結擴張並連到本計劃。

---

## Phase 1 — Editor 槽與掛載框

### 為何先做

先證明「第三條 canvas＋不切工作沙盒」，再接授權 FS，避免 UI／角色耦死。

### 範圍

- `PlaygroundsApp`：Editor 區 Default｜Tool 切換；Tool iframe＋關閉。
- 同步工具沙盒 SW 快照（複用既有 canvas sync；注意與工作畫布、Agent iframe 併存）。
- 狀態：`activeToolSession`（可先無 grant 強制，或 Phase 2 才注入 TOOL——本階段至少能顯示 B 的 UI）。
- **禁止**掛載時呼叫 `openProject(toolId)` 當唯一實作。

### 主要觸及檔案

- `src/components/playgrounds/PlaygroundsApp.svelte`
- canvas SW／sync 相關（`canvasSw` 等）
- 可選：`toolSession.ts`

### 完成定義

- [x] 掛 B 時側欄檔案與工作畫布仍屬 A（`openToolSession` 不呼叫 `openProject`）。
- [x] 關閉後 Editor 回 Default；無殘留錯誤 chrome。
- [x] 切換工作沙盒時：**自動 close** 工具 session。

---

## Phase 2 — `env.TOOL` 與 grant FS

### 範圍

| API | 行為 |
| --- | --- |
| `getGrant()` | 回傳當前 grant＋`focusPath?` |
| `readFile`／`writeFile` | host 專案文字；`expectedHash` 可對齊 HOST |
| `readFileBase64`／`writeFileBase64` | 同 HOST 硬上限 |
| `close` | 卸掛載 |
| `apiVersion`／`capabilities` | 工具契約探測 |

- 注入點：對齊 Agent 的 functions `env` 注入，但條件為 tool session，**不是** `activeAgentProjectId`。
- 越權／無 session：`forbidden`／`tool_inactive`／`bad_path`。
- 工具寫入 host 後：側欄／開檔 buffer 失效或刷新（對齊既有 FS 變更通知）。

### 完成定義

- [x] 單元或契約測：grant 內寫入／grant 外失敗（`toolBridge.test.ts`）。
- [x] 不可經 TOOL 寫現行 Agent 專案（`forbidden`）。
- [x] capabilities 誠實；本檔／host-api 更新。

---

## Phase 3 — 遊樂場開啟 UX

### 範圍

- 入口（擇一或並行，宜少）：
  - 檔案樹右鍵／工具列：「用沙盒開啟…」
  - 專案對話框：「掛為工具」
- Dialog：選工具沙盒、確認 path（預設＝目前開檔）、`read`｜`readwrite`。
- Tool chrome：工具顯示名、path、關閉；可選「在專案中開啟 B」＝真正 `openProject(B)`（離開工具模式，進開發 B）。

### 完成定義

- [x] 遊樂場「用沙盒開啟」dialog（選 B、path、mode）；Editor 工具列入口。
- [x] Dirty 編輯器衝突：應用內 `askConfirm` 後再掛載。
- [x] Playgrounds UI 仍禁止 `alert`／`confirm`／`prompt`（應用內 dialog）。

---

## Phase 4 — 範本 Tool SAM

### 範圍

- 「建立工具範本」或空白範本註記：`functions.js` 薄路由到 `/api/tool/…` → `env.TOOL`。
- 極簡 UI：顯示 `focusPath`、textarea、儲存、關閉。
- 可選：`toolKinds`／README 慣例（發現性留 Phase 6）；MVP 不強制 meta schema。

### 完成定義

- [x] 新建立的範本工具可不手寫注入協議即可讀寫 grant 檔（`toolStarter.ts`＋`/api/tool/*`）。
- [x] 與「建立 Agent」入口區隔文案（選單「工具 → 建立範本工具」；README 註明不是 Agent）。

---

## Phase 5 — Agent `openTool`

### 範圍

- `HostBridge`：`openTool`／`closeTool`／`getToolSession`；`capabilities` 更新。
- 範本 Agent：tools＋system prompt（何時開工具、勿與 `open_file` 混淆）。
- grant：Agent 傳 `paths`；遊樂場仍可強制 host＝當前工作／target（定案：建議＝**工作沙盒**，與人類 UX 一致）。

### 完成定義

- [x] 範本 round-trip（`shellHostBridge.binary.test.ts` openTool；starter 含 `open_tool` 路由）。
- [x] 舊 Agent 不自動升級；host-api 已更新（需「套用最新 Agent 範本」才拿到新 tools）。

---

## Phase 6 — 打磨與發現性

### 範圍（按痛點裁）

- 重整：預設**不**自動重掛 last tool session（避免誤授權）。
- 沙盒工具發現：`index.html` head `sam:tool-kinds`／`sam:tool-globs`（遊樂場鏡像進 side meta）；`toolMatch` 排序＋localStorage 偏好（副檔名／路徑／最近）。
- 遊樂場：Editor 一鍵開啟（信心足夠）＋對話框「建議」排序；路徑變更時重選。
- Agent：`listProjects` 暴露 `toolKinds`／`toolGlobs`；`open_tool`／system prompt 指引依 meta 選工具。
- 文件：本檔狀態、GLOSSARY、host-api 摘要。

### 完成定義

- [x] `toolMatch.ts`＋單元測；範本 `toolStarterMeta()`。
- [x] 一鍵／對話框建議 UX；偏好記憶。
- [x] Agent 可經 `list_projects` 看到工具宣告（需套用最新 Agent 範本才拿到新 prompt／tool 文案）。
- [x] 附錄 B 可自動化項已勾；關閉後 Editor 同步建議本機手動。
- [x] `npm test`／`npm run check`（實作後跑過）。

---

## 建議實作順序（一人產能）

1. Phase 0（DEC＋grant 純邏輯）  
2. Phase 1 → 2（掛載＋TOOL FS）— **垂直切片最小可用**  
3. Phase 3（人類 UX）— 沒有這步難狗糧  
4. Phase 4（範本工具）  
5. Phase 5（Agent）— 有人類路徑後再接  
6. Phase 6 按痛點  

若產能極緊：**Phase 0–3** 即可稱為「可掛載的個人工具槽」；範本與 Agent 其後補。

---

## 決策與文件同步

| 時機 | 動作 |
| --- | --- |
| 開工／Phase 0 | DEC-022 → Accepted；GLOSSARY；TOOLS-PLAN 凍結註記 |
| Phase 2 TOOL 定案 | 更新 host-api「Tool binding」；必要時修 DEC-022 |
| Phase 5 HOST 開 tool | 更新 host-api capabilities；agentStarter |
| 角色模型變更 | 必更新 DEC-017／022 與 GLOSSARY |
| `/tools/` 正式退場或導覽改掛 | 另修 DEC-008／TOOLS-PLAN（本計劃不強制拆頁） |

根目錄 [AGENTS.md](../AGENTS.md) 指標表應能連到本計劃。

---

## 附錄 A — 錯誤碼

| code | 含義 |
| --- | --- |
| `tool_inactive` | 無工具 session 卻呼叫 TOOL／open 相關 |
| `tool_busy` | 已有 session 且策略不允許覆蓋（若採用） |
| `bad_grant` | grant 空、非法 path、host 不符 |
| `forbidden` | 越權 path、禁 host＝Agent、政策拒絕 |
| `bad_path` | 路徑無效／逃逸 |
| `not_found` | 工具沙盒或檔不存在 |
| `conflict` | expectedHash 不符 |
| `too_large` | 二進位超過硬上限 |
| `not_supported` | capabilities 以外 |
| `host_unavailable` | bridge 未註冊 |

（既有 `agent_readonly`／`no_target` 等仍適用 HOST 面。）

---

## 附錄 B — 手動驗收（MVP）

- [x] 工作沙盒 A 開著；掛工具 B；側欄仍列 A 的檔（實作約束＋單元測）
- [x] B 讀得到 grant 內檔；改 grant 外 path 失敗（`toolBridge.test.ts`）
- [x] read-only grant 下寫入失敗
- [ ] 關閉工具後 Editor 可再編同一檔且內容已更新（建議本機手動：工具 `functions.js` 呼叫 `env.TOOL`）
- [x] 切換工作沙盒會結束工具 session
- [x] 現行 Agent 區與工作畫布仍可用（不互相搶死）
- [x] 不經 `openProject(B)` 完成以上流程

---

## 附錄 C — 用語

| 用語 | 意思 |
| --- | --- |
| 工具沙盒／Tool SAM | 被掛進 Editor 槽、以工具角色執行的沙盒 |
| 工具模式 | Editor 槽顯示工具 iframe |
| 授權／grant | 遊樂場介面核發的 host＋paths＋mode |
| `env.TOOL` | 僅工具模式注入的窄 API |
| 個人工具箱 | 使用者 OPFS 專案中可復用為工具的那些 SAM（非 `/tools/` 登錄表） |
| `toolKinds`／`toolGlobs` | 沙盒 meta 發現欄位；排序／一鍵／Agent 選工具用 |

---

## 附錄 D — 與 `/tools/`、Agent、Shell

| 層 | 例子 | 誰實作 |
| --- | --- | --- |
| 站上 `/tools/` | base-encoding（凍結擴張） | 本站靜態頁；非本計劃 |
| 工具（本計劃） | Editor 槽、grant、`env.TOOL` | 遊樂場 |
| 技能／產品 | 各類 viewer SAM、Agent 何時 `open_tool` | 使用者／範本沙盒 |
| 短跑 CLI | `jq`／`run_cmd` | DEC-021 |
| Agent HOST | 觀察、改檔、開工具 | DEC-017／018 |

---

## 維護

- 改階段狀態、API 表面或原則時**更新本檔**。
- 勿把「復活互動 WASI 編輯器」或「工具＝完整 HOST」寫回必做項。
- 勿在讀者可見文章預告未完成 Phase；本檔僅供作者／Agents 排程。
