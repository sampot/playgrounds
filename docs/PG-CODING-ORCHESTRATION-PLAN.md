# Playgrounds Coding Orchestration 實作計劃

本檔是 [PG-CODING-ORCHESTRATION-PROTOCOL.md](./PG-CODING-ORCHESTRATION-PROTOCOL.md)（**DEC-033**）的落地階段表。通道前提見 [PG-MULTI-AGENT-SESSION-SPEC.md](./PG-MULTI-AGENT-SESSION-SPEC.md) §6.5（`joinPolicy`）。

一句話：**invite_only 的 `coding-orchestration.v1`；總管＝Host agent，對話 1:1 綁定後派 LLM worker；`host_apply` 寫入工作沙盒（`targetSandboxId`）。**

**狀態：** Phase 0–4 已完成（Phase 4：2026-08-04）。**產品工人路徑**見 [PG-LLM-AGENT-PLAN.md](./PG-LLM-AGENT-PLAN.md)（`sampot/pg-llm-agent`）；本檔狗糧 worker **非**產品規格。

---

## 目標與非目標

### 目標（本計劃 Phase 0–4）

- 通道強制 `joinPolicy`（含 `invite_only` → `join_forbidden`）。
- 狗糧 Host／worker（僅通道／教學驗證）；邀請 1 worker → `task.result` → Host 套用檔案。
- 總管對話 `chatSessionId` 與多方 session **1:1**。
- Worker BYOK／本機 LLM 產 edits（未設定可退回規則修 demo）。
- **總管自任 session Host**（協定 §2／§4.1）；工作沙盒可為一般專案，不必開狗糧 Coding 編排 Host。

### 非目標（後續另開）

- **Production-ready LLM Agent 小品**（[`pg-llm-agent`](https://github.com/sampot/pg-llm-agent)）——見 [PG-LLM-AGENT-PLAN.md](./PG-LLM-AGENT-PLAN.md)（含總管 `dispatch_coding_goal` Phase 6）。
- **委派 grant／工人執行面**（與 Tool 同家族；`.bindings/*`）——見 [PG-DELEGATE-GRANT-PLAN.md](./PG-DELEGATE-GRANT-PLAN.md)／**DEC-037**。
- 遊樂場內建 coding 編排產品 UI。
- 刪除狗糧 Host／worker 範本（保留驗證／教學）。

---

## 階段

| 階段 | 主題 | 完成定義 | 狀態 |
| --- | --- | --- | --- |
| **0. joinPolicy** | `SessionProtocolMeta.joinPolicy`；`JoinSeatOptions.via`；spawn＝invite | 單測：invite_only 拒 apply | **已完成** |
| **1. C1 狗糧** | `codingOrchestrationApi`＋Host／worker starter；spawn 依 protocol 選 worker | Vitest C1；範本可開 | **已完成** |
| **2. 總管綁定** | 對話 session ↔ 多方 session 1:1；總管工具 invite／assign | 協定 §2.1 | **已完成** |
| **3. LLM** | Worker BYOK 產 edits；seated 注入 `env.secrets.*`（DEC-035） | 見下方驗收 | **已完成** |
| **4. 總管 Host agent** | 總管 `functions.js` 承載 protocol；Host＝`activeAgentSandboxId`；`fileWrites`→`targetSandboxId` | 總管 open／invite／assign／host_apply 到工作沙盒；狗糧 Host 僅 demo | **已完成** |

---

## 實作錨點

| 路徑 | 職責 |
| --- | --- |
| `sessionTypes.ts`／`sessionRuntime.ts` | joinPolicy／via／`join_forbidden`；`targetSandboxId` |
| `codingOrchestrationApi.ts` | 可測 Host（含 patch apply、`chatSessionId`、`targetSandboxId`、非狗糧 assign） |
| `codingOrchestrationBind.ts` | 綁定決策（reuse／open／reopen） |
| `codingOrchestrationLlm.ts` | worker prompt／parse／規則後備 |
| `codingOrchestrationHostStarter.ts` | 狗糧主持 SAM（非產品路徑） |
| `codingOrchestrationWorkerStarter.ts` | BYOK LLM worker（SESSION＋`/api/llm/chat`） |
| `functionsEnv.ts` | seated 非 Tool 注入 SecretStore bindings |
| `shellSessionBridge.ts` | domain invoke；`fileWrites` → 遊樂場（依 target） |
| `hostBridge`／`shellHostBridge` | `openSession`：Host＝總管、target＝工作沙盒 |
| [`sampot/pg-steward`](https://github.com/sampot/pg-steward) | **產品**總管：protocol routes＋coding 編排工具；對話生命週期 close（遊樂場不內嵌） |
| [`sampot/pg-llm-agent`](https://github.com/sampot/pg-llm-agent) | **產品** LLM Agent／工人（見 [PG-LLM-AGENT-PLAN.md](./PG-LLM-AGENT-PLAN.md)；本檔 starter 非產品） |
| `PlaygroundsApp.svelte` | Host≠工作沙盒時 domain／apply；coding spawn |

---

## 驗收

### Phase 0–2

- [x] `invite_only`＋`via: apply` → `join_forbidden`
- [x] API：assign → patch／write result → `fileWrites`
- [x] 總管 ensure／invite／assign；新對話 close 綁定
- [ ] 手動：Coding 編排 Host → 邀請 → 指派 → `src/demo.js`（建議；狗糧通道驗證）

### Phase 3

- [x] seated worker `createFunctionsEnv` 有 `env.secrets.*`；Tool 為空 secrets 命名空間
- [x] Worker starter：`/api/llm/chat`＋BYOK UI；parse edits；規則後備
- [x] 單測：parse／rule fix；starter 含 LLM 路徑
- [ ] 手動：worker BYOK（或本機）→ assign → demo 修復；無密鑰時規則後備仍可用

### Phase 4

- [x] 總管（[`pg-steward`](https://github.com/sampot/pg-steward)）含 `/api/session/*`（`coding-orchestration.v1`／`invite_only`）；遊樂場不內嵌
- [x] `HOST.openSession`：Host＝總管；`targetSandboxId`＝工作沙盒
- [x] ensure 不要求工作沙盒＝狗糧 Coding 編排
- [x] `assign_coding_task(brief, path, …)`；`fileWrites` 寫入 target
- [x] 單測：steward protocol meta；open＋custom assign＋`targetSandboxId`
- [x] 手動：一般工作沙盒＋總管 Host → invite／assign（hostSessionFetch）→ worker LLM（`qwen/qwen3-vl-8b`）→ `targetSandboxId` 檔案變更；無 `未知 act type: task.progress`（2026-08-04）

---

## 相關文件

| 文件 | 關係 |
| --- | --- |
| [PG-CODING-ORCHESTRATION-PROTOCOL.md](./PG-CODING-ORCHESTRATION-PROTOCOL.md) | 協定 |
| [PG-MULTI-AGENT-SESSION-PLAN.md](./PG-MULTI-AGENT-SESSION-PLAN.md) | 通道 |
| [PG-SECRETSTORE-PLAN.md](./PG-SECRETSTORE-PLAN.md) | BYOK／bindings |
| [PG-LLM-AGENT-PLAN.md](./PG-LLM-AGENT-PLAN.md) | 產品 BYOK LLM Agent（`pg-llm-agent`） |
| [PG-DELEGATE-GRANT-PLAN.md](./PG-DELEGATE-GRANT-PLAN.md) | 委派 grant（DEC-037） |
| [DECISIONS.md](./DECISIONS.md) | DEC-033（總管場內＝Host agent） |
| [playgrounds-host-api.md](./playgrounds-host-api.md) | HOST session 子集 |
