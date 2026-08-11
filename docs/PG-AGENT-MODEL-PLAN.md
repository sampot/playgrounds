# Playgrounds Agent Model 實作計劃

本檔是 [PG-AGENT-MODEL-SPEC.md](./PG-AGENT-MODEL-SPEC.md) 的落地階段表。權威決策見 [DECISIONS.md](./DECISIONS.md) **DEC-031**（Accepted）。

一句話：**同瀏覽器 Durable mailbox＋單線程 drain＋virtual actor；單一 Leader 跑 functions＋Controllers；UI←網路→`functions.js`∥controller↔resources；程式識別統一 `sandboxId`（汰換 `projectId`）；先本機強固，再接 SESSION／範本。**

**狀態：** 已完成（2026-08-03）。Phase 0–6 落地；後續為硬化／狗糧與跨 peer 另議。

---

## 目標與非目標

### 目標（MVP）

- **識別更名：** 程式／API／型別／文件中的沙盒識別由 **`projectId` → `sandboxId`**（含 `activeAgentProjectId` 等衍生名）；與規格用語對齊。
- `sam-runtime`：序列化 drain、`onPause`／`onResume`、Durable mailbox（ack／at-least-once）、alarm 表、registry、毒訊息、`ctx.send`／`schedule`／`spawn`。
- 遊樂場：單 Leader＋外接螢幕；Web Lock＋心跳＋epoch；失鎖 degrade；超時＋緩衝後接手。
- 畫布：只經 `/api`→`functions.js`；不直連 Controller／bindings；有 Controller 時亦然。
- 總管／Agent 範本與 DEC-023 session 事件扇入 mailbox（最小相容）。
- Vitest 覆蓋投遞、失敗、選舉時序、序列化；對齊規格 S1–S8 可驗子集。

### 非目標（本計劃 MVP）

- 跨 peer 訊息／migrate 實作、真 CF DO、exactly-once 業務事務。
- 按 agentId 分片多 Leader。
- Page Lifecycle 依賴；coding 子代理產品 UX（僅提供 spawn＋mailbox 原語）。
- 遊樂場產品化「Agent 叢集儀表板」（機制狀態列可有）。
- 強制改使用者可見的舊 OPFS 目錄實體路徑名（見 Phase 0b：可保留 `playgrounds-kv/<id>/` 等，鍵名用 sandboxId）。

---

## 現況基線

| 能力 | 現況 |
| --- | --- |
| 沙盒識別 | 程式普遍 **`projectId`**／`activeId`／`activeAgentProjectId`；產品文案已稱沙盒 |
| `SamInstance`／`schedule`／`alarm`／`onCommand` | 有；**未**串行、無 mailbox |
| 遊樂場現行 Agent Controller | 有（單頁；無多 tab Leader） |
| OPFS KV／DB／專案 meta | 有 |
| 畫布 `/api`→functions | **仍直達**（須打破） |
| DEC-023 session iframe | 有；未扇入 Durable mailbox |

程式錨點：`src/sam-runtime/`、`src/components/playgrounds/**`（含 `PlaygroundsApp.svelte`、`hostBridge`、`canvasSw*`、`mockKv`／`mockD1`）、`public/sw.js`、host-api／範本字串。

---

## 常數與存放（MVP 預設）

實作可調；變更須同步本表與單測。

| 常數 | 預設 | 說明 |
| --- | --- | --- |
| `T_heartbeat` | **2000 ms** | 正式心跳超過此時長 → follower 可競鎖 |
| `T_buffer` | **1000 ms** | 取得鎖後再等此時長才 bump epoch／就任 |
| 自檢週期 | **500 ms** | Leader 週期確認持鎖；**每則 drain 前**亦須確認 |
| 接手延遲 | `T_heartbeat + T_buffer`（**3000 ms**） | 規格下界 |
| `N_maxAttempts` | **3** | 含首次；達上限 → poison |
| 去重窗 | **最近 512 則已 ack `id`／Agent**（或 24h，先到為準） | runtime 去重 |
| Mailbox 容量 | **1000** 則／Agent（未 ack＋inFlight） | 超限 `mailbox_full` |
| Web Lock 名 | `playgrounds-agent-runtime-leader` | `navigator.locks` |
| Interval catch-up | **跳到下一間隔**（不補跑每一 tick） | 漏火只保證不丟「下一火」語意 |

### OPFS 路徑（建議）

| 資料 | 路徑 |
| --- | --- |
| Registry | `playgrounds-agent-runtime/registry.json`（或分片） |
| 心跳／epoch | `playgrounds-agent-runtime/leader.json` |
| Mailbox／inFlight／ack 索引 | `playgrounds-agent-runtime/mail/<agentId>/` |
| DLQ／poison | `playgrounds-agent-runtime/mail/<agentId>/poison/` |
| Alarm 排程表 | `playgrounds-agent-runtime/alarms.json` |

（可與現有 `playgrounds-kv/` 並列；**勿**寫進各沙盒原始碼樹。）

---

## 錯誤碼（機器可讀）

| code | 何時 |
| --- | --- |
| `agent_not_found` | registry 無此 `agentId` |
| `mailbox_full` | 未 ack 佇列滿 |
| `not_leader` | follower 嘗試 drain／寫正式心跳 |
| `leader_epoch_mismatch` | 持舊 epoch 寫狀態／ack |
| `mailbox_poisoned` | 訊息已在 DLQ（重放前） |
| `instance_not_started` | 既有 |
| `controller_no_onCommand` | 過渡期；新路徑優選 `onMessage` |

---

## 階段

| 階段 | 主題 | 完成定義 | 狀態 |
| --- | --- | --- | --- |
| **0. 契約** | DEC-031、本計劃、GLOSSARY／host-api 指針、錯誤碼、`sandboxId` 命名決策 | 文件一致 | **已完成** |
| **0b. 識別更名** | 程式 `projectId` → `sandboxId`（型別／API／遊樂場／SW／測試／範本） | `rg projectId` 僅剩遷移註解或刻意相容別名；`npm test`／`check` 綠 | **已完成** |
| **1. Runtime 核心** | Durable mailbox＋ack；序列化；`onPause`／`onResume`；registry；毒訊息；alarm；`ctx.*`（一律 `sandboxId`） | Vitest S2／S6／S8；Node 雙實例互送 | **已完成** |
| **2. Leader 選舉** | Web Lock＋心跳＋epoch；自檢 degrade；緩衝就任 | Vitest 不雙主 | **已完成** |
| **3. 遊樂場接線** | runtime hub；多 tab 外接螢幕 | 關 Leader 後接手 | **已完成** |
| **4. UI←網路→後端** | 畫布 `/api`→functions；撤銷 UI→Controller 閘門；Leader 轉發 | S7 | **已完成** |
| **5. 範本與 SESSION** | onMessage／扇入 mailbox；spawn 對齊 registry | 狗糧可互送 | **已完成** |
| **6. 觀測／硬化** | 機制列、capabilities、文件 | S1–S8；回歸 | **已完成** |

狀態欄：`待開發`／`進行中`／`已完成`／`擱置`。

---

## Phase 0 — 契約

### 範圍

- DEC-031：**建議 Accepted**（與本計劃同變更或緊接）；註明程式識別 **`sandboxId`**（舊稱 `projectId`）。
- `playgrounds-host-api.md`：mailbox／Leader 為計劃中能力；HOST 參數／回傳欄位改用 `sandboxId`（見 Phase 0b）。
- GLOSSARY：`projectId` 標為歷史別名／遷移中。

### 完成定義

- [x] DEC-031／SPEC／本計劃／GLOSSARY 無矛盾
- [x] 常數表與錯誤碼入本檔

---

## Phase 0b — `projectId` → `sandboxId`

在擴 Agent runtime **之前或與 Phase 1 並行開場**完成，避免新 API 再引入 `projectId`。

### 命名對照（目標）

| 舊 | 新 |
| --- | --- |
| `projectId` | `sandboxId` |
| `activeAgentProjectId` | `activeAgentSandboxId` |
| `workProjectId`／類似 | `workSandboxId` 等（依語意） |
| HOST／JSON 欄位 `projectId` | `sandboxId` |
| 型別／函式參數名含 Project 且指沙盒單位 | 改 Sandbox（如 `getProject` 是否改名另議；**ID 欄位必須改**） |

### 範圍

1. **TypeScript／Svelte／測試：** `src/components/playgrounds/**`、`src/sam-runtime/**`、`src/sam-host/**`；參數、介面、區域變數、測試 fixture。
2. **遊樂場狀態鍵：** `localStorage`／meta 若存 `activeAgentProjectId` → 讀寫改新鍵，**讀取時相容舊鍵一次**（遷移後可刪舊鍵）。
3. **HOST／session／tool API：** `hostBridge`、`shellHostBridge`、`session*`、`mainContentTabs`、capabilities 文件——對外欄位與 JSDoc 用 `sandboxId`；過渡期可接受輸入別名 `projectId`（標 deprecated），輸出只給 `sandboxId`。
4. **Canvas／SW：** `canvasSw*`、`public/sw.js` 路徑參數與 postMessage 欄位（URL 段 `/playgrounds/canvas/<sandboxId>/` 值不變，僅程式變數／訊息鍵更名）。
5. **Bindings 實作：** `mockKv`／`mockD1`／checkpoint 等函式參數改名；**OPFS 目錄前綴**（如 `playgrounds-kv/`）可暫不改，避免使用者資料搬遷；註解註明「目錄名歷史，鍵為 sandboxId」。
6. **範本字串：** `agentStarter`／總管／session starter 內工具名與 prompt 若寫 projectId → 改 sandboxId。
7. **文件：** `playgrounds-host-api.md`、相關 PLAN／GLOSSARY；SPEC 已用 sandboxId 處保持。

### 非範圍（本 Phase）

- 改產品中文「專案」殘留文案（另循 GLOSSARY；本 Phase 聚焦**程式識別**）。
- 強制 rename OPFS 實體資料夾名（成本高；值已是 id 字串則不必）。

### 完成定義

- [x] `rg 'projectId' src public docs/playgrounds-host-api.md` — 僅剩：遷移相容層、歷史路徑註解、或「舊稱」說明
- [x] `activeAgentProjectId` 等衍生識別已更名（含相容讀舊）
- [x] `npm test` 與 `npm run check` 通過
- [x] host-api 範例與 HOST 型別以 `sandboxId` 為準

---

## Phase 1 — Runtime 核心

### 範圍

- 擴充 `src/sam-runtime/`（建議模組；**識別一律 `sandboxId`**）：
  - `mailboxStore.ts` — Durable 佇列、inFlight、ack、去重窗、容量
  - `alarmStore.ts` — 排程表、到期轉序列事件、cancel、interval 策略
  - `registry.ts` — register／unregister／lookup／list（欄位 `sandboxId`＋`agentId`）
  - `drainLoop.ts` — 單線程；成功 ack；失敗重試／poison
  - `instance.ts` — 串行化；`onPause`／`onResume`；`waitUntil` 禁寫權威狀態
  - `ctx`：`send`／`sendSelf`／`schedule`／`spawn`（回傳含 `sandboxId`）
- 儲存適配：瀏覽器 OPFS；Node 測用記憶體／暫存目錄。
- **不**在本階段做多 tab 鎖（單進程假 Leader 即可測）。

### 完成定義

- [x] Vitest：入隊／ack／at-least-once、poison、registry、`mailbox_full`、alarm、pause／resume
- [x] Node host fixture：兩 instance 互 `send`
- [x] 新碼無新增 `projectId` 識別（除 0b 相容別名）

程式錨點：`src/sam-runtime/{mailboxStore,alarmStore,registry,drainLoop,runtime,constants,errors,storage,message}.ts`；`SamInstance` 串行／`onPause`／`onResume`／`dispatchMessage`；`NodeSamHost.runtime`。

---

## Phase 2 — Leader 選舉

### 範圍

- `leaderElection.ts`（遊樂場或 `sam-runtime` 瀏覽器適配）：
  - `navigator.locks.request(PLAYGROUNDS_AGENT_LEADER_LOCK, …)`
  - 正式心跳寫 `leader.json`（含 epoch）
  - 緩衝期不寫正式心跳
  - 自檢＋每則 drain 前驗鎖／epoch；失敗 degrade
- 假時鐘測試：超時→競鎖→等 buffer→epoch++→僅一側 drain。

### 完成定義

- [x] 無雙主 drain（測資）
- [x] 舊 Leader 失鎖後未 ack 訊息由新 Leader 重試

程式錨點：`src/sam-runtime/{leaderElection,leaderLock,leaderClock,leaderStore}.ts`；常數 `T_HEARTBEAT_MS`／`T_BUFFER_MS`／`T_TAKEOVER_MS`／`T_SELF_CHECK_MS`／`PLAYGROUNDS_AGENT_LEADER_LOCK`；`AgentRuntime.setElection`／`canDrain` 閘門。

---

## Phase 3 — 遊樂場接線

### 範圍

- Leader tab：持有全部已註冊 Agent 的 `SamInstance` drain hub。
- Follower tabs：UI／畫布／enqueue only；BroadcastChannel 或輪詢 registry 僅作 UX（權威在 Durable）。
- 關 Leader／卸領導權 → 他 tab 走 Phase 2 接手。
- 與現行總管席共存（`activeAgentSandboxId`，見 Phase 0b）：總管仍是一 Agent；HOST 注入規則不變（僅總管 sandbox）。

### 完成定義

- [x] 遊樂場 hub：`agentRuntimeHub`＋OPFS storage＋Web Lock 選舉；Leader 跑 Controller，follower enqueue
- [x] 總管 UI 顯示 Leader／外接螢幕角色（手動兩 tab 驗證仍建議）
- [x] 非 Leader 關 tab：不持鎖則不中斷（Leader 生命週期才卸 Controllers）
- [x] Agent 形態掛載：`sam:needs-controller`／`controller.js` 經 `ensureAgentController` 登記並在 Leader 啟動（**不必**設為總管；總管席仍獨享 `env.HOST`）
- [x] Leader `/api` 檔案解析：sync（開著的 pane／fleet desired）＋ async OPFS 後備（外接螢幕 canvas → Leader 時對方未必開著同一沙盒）
- [x] Registry 並行 register：記憶體權威＋`writeChain`（避免 100 Controllers 同時掛載時 `registry.json` 遺失更新）；瀏覽器 DEV `window.__playgroundsFleetStress`＋Vitest `fleetScale` 已驗 100 背景 tick
- [x] Browser `SamInstance` ESM：`samBrowserLoader` 改 blob＋`import()`（**無** `playgrounds-sam-module` hidden iframe；對齊 SPEC「執行不依賴 iframe」）
- [x] 移除 Controller `env.INFRA`；總管 `host_meta` 改直呼 `env.HOST`；host 呼叫 functions 用 `SamInstance.functionsFetch`

程式錨點：`src/components/playgrounds/{agentRuntimeHub,opfsRuntimeStorage,agentControllerHost}.ts`；`PlaygroundsApp` 訂閱 role／工作集 rehydrate。

---

## Phase 4 — UI←網路→後端（CF 形；修訂）

### 範圍

- **正確依賴：** UI → `functions.js` → resources，及可選 → Controller；UI↛Controller、UI↛bindings。
- 撤銷「有 Controller 則禁止／改接畫布 `/api`」的閘門。
- （待補）外接螢幕 `/api` 轉發至 **Leader** 的 `functions.js`。
- **禁止** Controller `env.INFRA`（已移除）；Controller／functions 對等用 bindings，UI 只經 `/api`→functions。

### 完成定義

- [x] S7：畫布 `/api` 一律打 `functions.js`（有 `controller.js` 亦然）
- [x] 撤銷 `ui_must_use_controller`／畫布改接 `SamInstance.fetch`
- [x] 外接螢幕 `/api` → Leader.functions（BroadcastChannel relay＋`leaderEpoch` fencing）
- [x] SPEC／DEC-024／031／GLOSSARY／host-api／測試同步

程式錨點：`functionsApiRelay.ts`、`canvasSw.ts`、`uiInfraGuard.ts`。

---

## Phase 5 — 範本與 SESSION

### 範圍

- [`sampot/pg-steward`](https://github.com/sampot/pg-steward)／總管範本：`onMessage`；範例冪等；`onCommand` 轉 enqueue（相容）。
- DEC-023：act／事件成功後 **enqueue** Participant mailbox（保留 BroadcastChannel 作 UI 推送可並行，權威處理走 mailbox）。
- `spawn`／session `spawn-participant` 對齊 registry＋`cloneIntent`。

### 完成定義

- [x] 總管／參與者範本 `onMessage`（冪等 `session.event`；`app.ping`）
- [x] SESSION `publishEvents` 扇入各 Agent seat mailbox（BC 仍推 UI）
- [x] `spawn-participant`／join → registry＋seat Controller（**無**第二 HOST）
- [x] Node／runtime 測資：雙實例互送

---

## Phase 6 — 觀測／硬化

### 範圍

- 遊樂場輕量機制列：Leader？、epoch、佇列深度、poison 數（非產品叢集 UI；產品化見 [PG-AGENT-FLEET-UX-PLAN.md](./PG-AGENT-FLEET-UX-PLAN.md)／DEC-032）。
- `capabilities()`：`agentMailbox`、`agentLeader`、`agentRegistry` 等。
- 更新 host-api、SPEC 附錄 A 現況欄、本計劃狀態。

### 完成定義

- [x] 總管面板顯示 Leader／外接螢幕＋epoch；capabilities 含 mailbox／leader／registry
- [x] host-api／SPEC 附錄 A 與本計劃狀態同步
- [x] `npm test`／`npm run check` 綠；DEC-031 Accepted（Phase 0）

---

## 與其他計劃

| 文件 | 關係 |
| --- | --- |
| [PG-AGENT-MODEL-SPEC.md](./PG-AGENT-MODEL-SPEC.md) | 需求／不變式權威 |
| [PG-SAM-RUNTIME-PLAN.md](./PG-SAM-RUNTIME-PLAN.md) | 既有 instance；本計劃擴充 |
| [PG-AGENT-PLAN.md](./PG-AGENT-PLAN.md) | HOST／範本；執行載體遷本模型 |
| [PG-MULTI-AGENT-SESSION-PLAN.md](./PG-MULTI-AGENT-SESSION-PLAN.md) | Phase 5 扇入 |
| [PG-SANDBOX-INSTANCE-PLAN.md](./PG-SANDBOX-INSTANCE-PLAN.md) | spawn／clone 血統 |
| [PG-AGENT-FLEET-UX-PLAN.md](./PG-AGENT-FLEET-UX-PLAN.md) | 產品級艦隊觀測／3D 關係圖（DEC-032；接續 Phase 6 機制列） |

---

## 建議實作順序（依賴）

```text
Phase 0 → 0b（projectId→sandboxId）→ 1（runtime）→ 2（election）
         → 3（遊樂場）→ 4（UI←網路→後端）→ 5（範本／SESSION）→ 6
```

- **0b 應在 Phase 1 合併前完成**（或 0b 與 1 同 PR 但更名先落地），避免 mailbox／registry 再長 `projectId`。
- Phase 1 無遊樂場亦可在 Node／Vitest 完成；Phase 4 以 UI→functions 為準，勿再把畫布改接到 Controller。

---

## 驗收覆蓋（SPEC S1–S8）

| 情境 | Vitest／自動化 | 說明 |
| --- | --- | --- |
| **S1** Headless／UI→functions | `agentModelAcceptance` S1；instance／runtime | Controller 可直寫 KV；UI 路徑手動 |
| **S2** 序列化／at-least-once／sendSelf | `agentModelAcceptance` S2；`mailboxStore` inFlight；`runtime` sendSelf | S2.3 `waitUntil` 寫 KV **未強制阻擋**（mailbox 語意） |
| **S3** Spawn／無 HOST | `agentModelAcceptance` S3；`runtime` spawn | 遊樂場 seat 無第二 HOST 見 Phase 5 |
| **S4** Leader／epoch | `leaderElection.test` | Tab A/B 手動；`/api`→Leader 待補 |
| **S5** Migrate／HA | — | **非 MVP** |
| **S6** Pause／Resume | `agentModelAcceptance` S6；`runtime` pause | |
| **S7** UI←網路→functions | `uiInfraGuard`；`functionsApiRelay`；canvasSw | Leader 轉發已測 |
| **S8** Poison／registry | `agentModelAcceptance` S8；`mailboxStore` poison | |
