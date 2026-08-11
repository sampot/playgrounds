# Playgrounds Session Protocol — `coding-orchestration.v1`

本檔定義 **LLM-based 總管（Host agent）＋ LLM 子代理（worker）** 協同完成 coding 任務的 **session protocol**。通道能力見 [PG-MULTI-AGENT-SESSION-SPEC.md](./PG-MULTI-AGENT-SESSION-SPEC.md)／**DEC-023**；執行原語見 [PG-AGENT-MODEL-SPEC.md](./PG-AGENT-MODEL-SPEC.md)／**DEC-031**。權威決策：**DEC-033**。

一句話：**Session 提供抽象協同框架；本 protocol 是其上「總管控任務、子代理領任務／回報結果」的具體應用——限定 LLM agent 之間的編排；入座僅邀請制；每一場使用者↔總管對話 session 對應恰好一場多方 session。**

**狀態：** 規格初版（2026-08-03；同日修訂：強制 `invite_only`、對話 session＝多方 session 一對一）。通道／總管 Host 實作見 [PG-CODING-ORCHESTRATION-PLAN.md](./PG-CODING-ORCHESTRATION-PLAN.md)（Phase 0–4）；**產品工人**見 [PG-LLM-AGENT-PLAN.md](./PG-LLM-AGENT-PLAN.md)（`pg-llm-agent`）。  
**承接：** DEC-026「不以 DEC-023 充當 coding 子代理；真·子代理另議」——本協定即該「另議」的產品形狀。

---

## 1. 定位與邊界

### 1.1 在堆疊中的位置

```text
人 ──► 總管（Host agent + env.HOST）──本 protocol──► Session 通道
              │                                      ▲
              │ 指派／彙整／對人交代                    │ act／事件
              ▼                                      │
         權威任務狀態（Host KV／記憶體）          worker × N
                                              （env.SESSION only）
```

| 層 | 本協定的關係 |
| --- | --- |
| Session 通道 | 只用座位／role／`act`／事件／投影；**不**新增遊樂場場景名 |
| Agent Model | spawn／mailbox 可承載工人與事件扇入；**不**等於本協定 |
| Scheme A（DEC-026） | **單 HOST** 分任務（`.agent/plan.md`）；無多 LLM 座位。本協定是**多 LLM worker** 路徑，二者可並存、勿混稱 |
| 通用模擬／遊戲 protocol | **同層不同協定**；本協定**不**約束非 LLM Participant |

### 1.2 目標

- **G1** 使用者只跟**總管**對口；總管拆解 coding 目標、派工、彙整、回報。
- **G2** 子代理以 `worker` role 入座；領任務、回進度／結果／失敗；**不**持 `env.HOST`。
- **G3** 權威任務狀態在 Host；副作用（寫檔、跑指令、開工具）預設由**總管經 HOST** 執行（見 §6）。
- **G4** 訊息形狀機器可讀＋可附自然語言（LLM 友好）；非法 `act` → `act_rejected`。
- **G5** **入座僅邀請制**（`joinPolicy: invite_only`）；工人不自行申請入隊。
- **G6** **一對話 session 對應一多方 session**（§2.1）：使用者與總管的一場對話，綁定恰好一場本協定的 DEC-023 session。

### 1.3 非目標

- 遊樂場內建「coding 編排產品 UI」或官方工人市集。
- 給 worker 完整 HOST／任意 `deleteProject`／密鑰明文。
- 把非 LLM 模擬 Agent 強行塞進本協定。
- 遠端多使用者／跨 Playgrounds 連線（維持 DEC-023）。
- 取代 Scheme A；單人單 HOST 長任務仍可用 hygiene＋plan／memory。
- 開放 worker **申請**入座（本協定否決 apply／`invite_or_apply`）。
- 一場使用者對話同時掛多場 coding 多方 session，或一場多方 session 跨多場使用者對話。
- 規定具體模型廠商、prompt 模板正文（實作／範本自定；產品工人見 [`pg-llm-agent`](https://github.com/sampot/pg-llm-agent)）。

### 1.4 應用前提（本協定專屬）

- **Host agent** 與每位 **worker** 皆為 **LLM-based** Agent SAM（可呼叫外部／本機 chat API；BYOK／SecretStore，遊樂場不代打）。
- 總管席＝開啟本 session 的 Host SAM（§2）。
- **`joinPolicy` 必須為 `invite_only`**（§3）。
- 工人決策可含工具迴圈，但**對 session 的對外契約**僅本檔 `act`／事件；不得繞過 Host 改權威任務狀態。

---

## 2. 角色

| Session role | 誰 | 通道 | 職責 |
| --- | --- | --- | --- |
| （無 Participant 座位） | **總管＝Host agent** | `env.HOST`＋Host `functions.js`（權威狀態） | 開／關 session、**邀請**／踢工人、維護任務圖、指派、套用變更、對人交代 |
| `worker` | LLM 子代理 SAM | 僅 `env.SESSION` | 接受指派、回報進度／結果／失敗、可請求澄清 |
| `human`（可選） | 使用者 | 人類座位或 Host UI | 核准高風險步驟、補充約束；**不是**第二對口 |

**硬規則：**

1. 總管**不得**另入 `worker`／`human` 座位「雙掛」。
2. `worker` **不得**取得 `env.HOST`。
3. Role 是權限類，不是人格名；多工人＝clone 同一（或相容）worker 範本。
4. **僅邀請入座**；拒絕一切 apply／未經邀請的 `join`（§3、§7）。

**建議 `roleLimits`（MVP）：** `worker` ≤ 4（對齊 DEC-023 背景座位上限）；`human` ≤ 1。

### 2.1 對話 session ↔ 多方 session（一對一）

本協定把兩種「session」綁成同一場編排生命週期：

| 用語 | 意思 |
| --- | --- |
| **對話 session** | 使用者與總管的一場對話（transcript／history 單位；總管 UI 的「這一輪聊天」） |
| **多方 session** | DEC-023 通道上的一場 `coding-orchestration.v1` session（座位、事件、任務權威狀態） |

**不變式：**

1. **1:1：** 每一個進行中的對話 session，對應**恰好一**個多方 `sessionId`（可在開場時建立，或在該對話首次需要工人／編排時建立；建立後該對話不得另開第二場本協定多方 session）。
2. **對照鍵：** Host 權威狀態必須保存 `chatSessionId`（對話 session 穩定 id）與 `sessionId`（多方）的對照；建議 `orchestrationId ≡ sessionId`，並另存 `chatSessionId`。
3. **新對話 → 新多方 session：** 使用者「新開對話／清空並開新場」時，須 `close` 舊多方 session（若仍 open），再為新對話開新場；工人座位與任務圖不跨對話沿用。
4. **對話結束 → 多方結束：** 對話 session 結束、封存或使用者明確結束任務時，多方 session 進入終態並 `closeSession`；可回收非工作集工人實例（DEC-028）。
5. **切換工作沙盒：** 既有 DEC-023 規則結束多方 session；對應對話 session 的編排視為中斷（總管應對人說明）；是否自動開新對話由總管 UX 定，但**不得**讓舊對話繼續掛到新工作沙盒的新多方 session 而不換 `chatSessionId`。

```text
對話 session A  ←──1:1──►  多方 session S_A（invite_only workers）
對話 session B  ←──1:1──►  多方 session S_B
```

人始終只跟總管說話；工人只存在於該對話對應的多方 session 內，由總管邀請進來。

---

## 3. 協定宣告

開 session 時 Host 宣告（對齊 SESSION 規格 §5.3）：

```json
{
  "protocolId": "coding-orchestration.v1",
  "apiVersion": "1",
  "roles": ["worker", "human"],
  "roleLimits": { "worker": 4, "human": 1 },
  "joinPolicy": "invite_only",
  "capabilities": [
    "task.assign",
    "task.progress",
    "task.result",
    "task.failed",
    "task.clarify",
    "orchestration.cancel",
    "side_effects.host_apply",
    "side_effects.delegate_grant"
  ]
}
```

| 欄位 | 本協定要求 |
| --- | --- |
| `joinPolicy` | **必須**為 `invite_only`。其他值視為協定誤用；遊樂場／Host 應拒絕 open 或立即視為無效。 |

| capability | 含義 |
| --- | --- |
| `task.assign` | Host 可指派任務給 worker（事件） |
| `task.progress`／`result`／`failed`／`clarify` | worker 可送對應 `act` |
| `orchestration.cancel` | Host 可取消任務或整場 |
| `side_effects.host_apply` | **過渡／後備：** 檔案／指令副作用可由 Host 套用（§6.1） |
| `side_effects.delegate_grant`（目標產品路徑；見 DEC-037） | 工人持與 Tool 同家族之工作沙盒 grant，注入 **`env.DELEGATE`** 自執行；細節 [PG-DELEGATE-GRANT-PLAN.md](./PG-DELEGATE-GRANT-PLAN.md) |
| `side_effects.worker_grant`（歷史名） | 併入 `delegate_grant` |

入座：僅 Host **邀請**；被邀方須相容 `coding-orchestration.v1`＠`1`，role∈允許集合。任何 apply → `join_forbidden`。

---

## 4. 權威狀態（Host）

Host 持有（建議 KV key 帶對話維度，例如 `session:coding-orchestration:v1:<chatSessionId>`），投影給 worker 時可裁剪。

### 4.1 頂層

| 欄位 | 說明 |
| --- | --- |
| `chatSessionId` | 對應的使用者↔總管**對話 session** id（§2.1；必填） |
| `orchestrationId` | 本場編排 id（建議 ≡ `sessionId`） |
| `sessionId` | DEC-023 多方 session id |
| `goal` | 使用者目標（短文） |
| `constraints` | 約束列表（路徑邊界、不可碰密鑰、測試指令等） |
| `targetSandboxId` | 要改的工作沙盒（通常＝當前工作沙盒；可與 Host 沙盒相同或不同，由總管決定） |
| `status` | `planning`｜`running`｜`awaiting_human`｜`completed`｜`failed`｜`cancelled` |
| `tasks` | 任務列表（§4.2） |
| `revision` | 單調版本；併發用 |
| `summary` | 總管對人可見的階段摘要（可選） |

### 4.2 任務物件

| 欄位 | 說明 |
| --- | --- |
| `taskId` | 穩定 id |
| `title` | 短標題 |
| `brief` | 給 worker 的說明（可含路徑提示、驗收條件） |
| `status` | `pending`｜`assigned`｜`in_progress`｜`blocked`｜`done`｜`failed`｜`cancelled` |
| `assigneeSeatId` | 指派的 worker 座位；未指派則 `null` |
| `dependsOn` | 可選 `taskId[]`（DAG；MVP 可只支援平坦列表＋人工序） |
| `input` | 結構化輸入（檔案摘錄引用、符號名、錯誤 log 截斷等） |
| `result` | 成功時的結構化結果（§5.3） |
| `error` | 失敗時 `{ code, message, retryable? }` |
| `updatedAt` | ISO 或單調時間戳 |

**投影規則（建議）：**

- Worker 預設可見：自己的任務全文＋其他任務的 `{ taskId, title, status }`（避免整場 prompt 爆炸）。
- `human`／總管 UI 可見完整圖。
- **不得**把 SecretStore 值、完整 BYOK key、無關沙盒樹塞進投影。

---

## 5. 行動與事件

信封沿用通道：`act(payload)` → Host 驗證 → 成功則廣播 `session-event`（可扇入各 seat mailbox）。  
領域 body 建議一律含 `type` 與 `revision`（或 `expectedRevision`）。

### 5.1 Host → workers（事件；非 worker `act`）

| `type` | 何時 | 主要欄位 |
| --- | --- | --- |
| `orchestration.started` | 開場 | `goal`, `constraints`, `targetSandboxId` |
| `task.assigned` | 指派 | `taskId`, `brief`, `input`, `assigneeSeatId` |
| `task.cancelled` | 取消單任務 | `taskId`, `reason` |
| `orchestration.completed`／`failed`／`cancelled` | 終態 | `summary` |
| `human.decision` | 人類核准／駁回 | `requestId`, `decision`, `note` |

Host 亦可用 `getState` 投影代替重播；事件是即時主路徑。

### 5.2 Worker → Host（`act`）

| `type` | 允許 role | 語意 |
| --- | --- | --- |
| `task.progress` | `worker` | 進行中心跳／短狀態；可含 `percent?`、`note`、`evidence?`（路徑列表） |
| `task.result` | `worker` | 成功完成；必含 `result`（§5.3） |
| `task.failed` | `worker` | 失敗；必含 `error` |
| `task.clarify` | `worker` | 請求澄清；Host 可轉 `awaiting_human` 或自行用 LLM 回答後再 `task.assigned` 更新 |

**拒絕條件（例）：** 非指派座位操作他人 `taskId`；任務非 `assigned`／`in_progress`；`expectedRevision` 衝突 → `version_conflict`；內容超過 Host 上限 → `act_rejected`／`capacity_exceeded`。

### 5.3 `task.result` 形狀（MVP）

工人**回報提議**，不直接當權威寫入：

```json
{
  "type": "task.result",
  "taskId": "t1",
  "expectedRevision": 3,
  "result": {
    "summary": "將 listDir 錯誤碼對齊 hostBridge",
    "edits": [
      {
        "path": "src/foo.js",
        "kind": "patch",
        "unifiedDiff": "--- a/src/foo.js\n+++ b/src/foo.js\n@@ ..."
      }
    ],
    "commandsSuggested": [
      { "title": "run unit test", "cmd": "npm test", "argv": ["test"] }
    ],
    "followUps": ["更新 README 一句"]
  }
}
```

| `edits[].kind` | 說明 |
| --- | --- |
| `patch` | unified diff（偏好）；Host 驗證路徑∈允許集後套用 |
| `write` | 全檔替換（小檔）；須 `content` |
| `note` | 無檔案變更的研究結論 |

- Host **必須**驗證 path 邊界與大小後才寫入 `targetSandboxId`。
- `commandsSuggested` 僅建議；是否執行由總管決定（`HOST.runCmd` 等），工人不得假設已執行。

### 5.4 Human（可選）

| `type` | 語意 |
| --- | --- |
| `human.approve`／`human.reject` | 回應 Host 發出的核准請求（例如批次套用 diff、執行破壞性指令） |

---

## 6. 副作用與信任

### 6.1 過渡：`side_effects.host_apply`

1. Worker 可透過 `task.result`／`failed`／`clarify` 說話；結果 edits 可由總管套用。  
2. **總管**解析 `edits`，經 `env.HOST` 寫入 `targetSandboxId`、重載畫布、跑測試、讀 console。  
3. 觀察迴圈可留在總管側。  
4. **產品目標**改以 §6.2 為工人主寫入／執行面；本節保留為無 grant、覆核或回滾後備。

### 6.2 產品目標：`side_effects.delegate_grant`（DEC-037）

Tool 與 worker 共用**委派 grant**（工作沙盒 OPFS path＋虛擬 `.bindings/db`｜`kv` → `env.DB`／`env.KV`）：

- 遊樂場或 Host 於 `task.assigned`（或同等）核發**最小** grant 並注入 **`env.DELEGATE`**；任務終態／取消／踢座撤銷。  
- 仍**無**完整 HOST；自身能力靠 DEC-036 準入。  
- `task.result.edits` 可選證據；權威寫入經 `env.DELEGATE`（grant）。  
- 階段與虛擬節點契約見 [PG-DELEGATE-GRANT-PLAN.md](./PG-DELEGATE-GRANT-PLAN.md)。

### 6.3 密鑰

- Worker／Host 的 LLM 呼叫走各自允許的 SecretStore binding（`env.secrets.<NAME>.get()`，DEC-029／035）；SESSION **物件**不帶密鑰（參與者沙盒可掛 `env.secrets.*` 做 BYOK）。
- 任務 `input`／投影**禁止**夾帶密鑰明文。

---

## 7. 生命週期（編排）

```text
新對話 session（chatSessionId）
  → open 多方 session（joinPolicy=invite_only，綁定同一 chatSessionId）
  → planning｜running（邀請 workers、指派）
  →（可選 awaiting_human）→ completed｜failed｜cancelled
  → close 多方 session；對話可封存或繼續純對口（不再開第二場本協定 session）
```

| 步驟 | 行為 |
| --- | --- |
| 0 | 使用者開啟／繼續**一場**與總管的對話 session（取得或建立 `chatSessionId`） |
| 1 | 總管為該對話確保 1:1 多方 session：若尚無則 `openSession(coding-orchestration.v1)` 且 **`joinPolicy: invite_only`**，寫入 `chatSessionId` |
| 2 | 使用者下 coding 目標（可與步驟 1 同一回合）；總管更新 `goal`／tasks（可先 Scheme A 自洽再決定是否邀請工人） |
| 3 | 需要工人時：Host **僅以邀請**入座（`spawn-participant`／邀請 `joinSeat`；cloneIntent 建議 `session_participant`）。**禁止**等待或接受 worker 申請 |
| 4 | `task.assigned`；工人 `progress`／`result`／`failed`；總管套用、重派、或請求人類 |
| 5 | 任務段落結束：`orchestration.completed`（或 failed）＋對人摘要；`closeSession`；GC 可回收非工作集工人 |
| 6 | 使用者**新開對話** → 新 `chatSessionId` → 新多方 session（先 close 舊場若仍 open） |

切換工作沙盒 → 通道層結束多方 session（DEC-023）；該對話的編排中斷（§2.1）。  
同一對話內是否允許「完成後再開一場本協定 session」：**否**——一對話一場；若需全新編排，開新對話。

---

## 8. 與 mailbox／艦隊觀測

- Host 驗證成功後的領域事件應**扇入**各相關 Agent mailbox（既有 SESSION→mailbox 路徑）；worker handler 須冪等。
- Fleet UX（DEC-032）可顯示 session 群組與指派邊；**不**在遊樂場解釋 `taskId` 業務語意（可用 `agent.ui` 標註）。

---

## 9. 錯誤碼（領域建議）

通道碼沿用 SESSION 附錄 A。Host 可在 `act_rejected` 附：

| code | 何時 |
| --- | --- |
| `task_not_found` | 未知 taskId |
| `task_not_assigned` | 座位未擁有該任務 |
| `task_invalid_state` | 狀態不允許此 act |
| `edit_path_forbidden` | 結果 path 越權 |
| `edit_too_large` | diff／content 超限 |
| `orchestration_not_running` | 頂層非 running／planning |

---

## 10. 驗收情境

### C1 — 單工人修小 bug

1. 人開啟對話 session A；向總管：「修正 foo.js 的 off-by-one」。  
2. 總管為 A 開本協定多方 session（`invite_only`），邀請 1 worker，指派 t1。  
3. Worker `task.result` 含對 `foo.js` 的 patch。  
4. 總管套用、重載、讀輸出，回人「已修」。Worker 全程無 HOST。

### C2 — 雙工人並行、無互寫

1. 同一對話 session 內，總管拆 t1（調查）／t2（寫測）；**邀請**兩 worker。  
2. 兩者只回報；總管序列化套用 edits，避免互蓋。  
3. 依賴：t2 `dependsOn: [t1]` 時，t1 `done` 前不得指派 t2（或指派但 Host 拒早期 result）。

### C3 — 澄清與人類核准

1. Worker `task.clarify`。  
2. 總管在同一對話 session 問人（或自答）後更新 brief 再 `task.assigned`。  
3. 套用前 `awaiting_human`；人 `human.approve` 後才寫檔。

### C4 — 拒絕申請／錯誤協定

1. 任一 Agent **申請** `worker`（非邀請）→ `join_forbidden`。  
2. 僅支援 `brainstorm.v1` 的 Agent 被邀請為 worker → `protocol_mismatch`。

### C5 — 一對話一多方 session

1. 對話 A 已綁多方 session S_A。  
2. 在 A 未結束前再 `openSession` 本協定 → 拒絕（或實作為 no-op 回到 S_A）；不得產生 S_A2。  
3. 使用者新開對話 B → close S_A（若需要）→ open S_B；工人與任務圖不從 A 繼承。

---

## 11. 實作階段

落地 Phase 表見 [PG-CODING-ORCHESTRATION-PLAN.md](./PG-CODING-ORCHESTRATION-PLAN.md)（Phase 0–1 狗糧已完成；總管對話綁定／LLM 為後續）。

---

## 12. 相關文件

| 文件 | 關係 |
| --- | --- |
| [DECISIONS.md](./DECISIONS.md) | DEC-033；修訂 DEC-026 |
| [PG-CODING-ORCHESTRATION-PLAN.md](./PG-CODING-ORCHESTRATION-PLAN.md) | 通道／狗糧／總管 Host 實作階段 |
| [PG-LLM-AGENT-PLAN.md](./PG-LLM-AGENT-PLAN.md) | 產品 BYOK LLM Agent（`pg-llm-agent`） |
| [PG-DELEGATE-GRANT-PLAN.md](./PG-DELEGATE-GRANT-PLAN.md) | 委派 grant／工人執行面（DEC-037） |
| [PG-MULTI-AGENT-SESSION-SPEC.md](./PG-MULTI-AGENT-SESSION-SPEC.md) | 通道框架 |
| [PG-AGENT-MODEL-SPEC.md](./PG-AGENT-MODEL-SPEC.md) | spawn／mailbox |
| [PG-AGENT-PLAN.md](./PG-AGENT-PLAN.md) | Scheme A、HOST 工具 |
| [GLOSSARY.md](./GLOSSARY.md) | 用語 |
| [playgrounds-host-api.md](./playgrounds-host-api.md) | HOST／SESSION 表面 |
