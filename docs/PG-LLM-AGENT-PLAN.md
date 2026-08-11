# Playgrounds coding agent 實作計劃（`pg-llm-agent`）

本檔定義 **BYOK coding agent 產品範本** [`sampot/pg-llm-agent`](https://github.com/sampot/pg-llm-agent) 的交付與階段。協定前提見 [PG-CODING-ORCHESTRATION-PROTOCOL.md](./PG-CODING-ORCHESTRATION-PROTOCOL.md)／**DEC-033**；密鑰見 [PG-SECRETSTORE-PLAN.md](./PG-SECRETSTORE-PLAN.md)／**DEC-029**／**035**；三層 SAM 見 **DEC-024**。權威決策修訂見 **DEC-033**（產品 coding agent 路徑）／**DEC-017**（範本分流）。

一句話：**獨立小品 `pg-llm-agent`＝production-ready BYOK coding agent（檔案改 system prompt、SecretStore 管 key、SESSION 入座；role 名仍為 `worker`）；總管依任務邀請／派工；遊樂場狗糧 starter 僅驗證／教學。**

**狀態：** 2026-08-04 — Phase 0–6 初版落地；**DEC-037**：產品路徑改 `env.DELEGATE` 自寫（`host_apply` 後備）。手動驗收仍建議跑一輪。

---

## 定位

| 小品 | 席位 | 通道 |
| --- | --- | --- |
| [`pg-steward`](https://github.com/sampot/pg-steward) | 總管（現行 Agent） | `env.HOST`＋可自任編排 Host |
| **`pg-llm-agent`** | coding agent 實例（可多份） | **無** `HOST`；`env.SESSION`＋`env.secrets.*`＋自有 KV／Controller |
| 遊樂場內建 Agent 範本 | 一般 Agent | 不強制 LLM |
| `codingOrchestrationWorkerStarter` | 狗糧 starter | 通道／教學驗證；**非**產品路徑 |

- **Role `worker`** 是 session 權限類，不是人格名；人格／技能在沙盒檔（`.agent/system.md` 等）。
- 使用者可 clone 多份進工作集，各自改 prompt／model／專長標籤；總管依任務邀請並指派。
- 交付形對齊 `pg-steward`／DEC-034：**一 SAM 一 repo**＋`?open=`／可選 `/sam/`；**遊樂場不內嵌**此種子。

---

## 目標與非目標

### 目標（本計劃）

- Production-ready coding agent 規格（見下方門檻）；**不是** demo 規則修 bug。
- 使用者可直接改沙盒檔編輯 system prompt／技能說明。
- UI 設定 provider／endpoint／model；API key 與總管相同：SecretStore dialog（選既有名；新增／輪替才輸入值）。
- 相容 `coding-orchestration.v1`（`invite_only`）：領 `task.assigned` → 委派 grant 內經 **`env.DELEGATE`** 執行 → LLM／工具迴圈 → `task.result`／`failed`／`clarify`／`progress`。執行面見 [PG-DELEGATE-GRANT-PLAN.md](./PG-DELEGATE-GRANT-PLAN.md)／**DEC-037**（`host_apply` 僅後備）。
- 多實例可並存；總管可邀請並指派（手動工具先；自動選人／拆任務見 Phase 5）。
- Catalog／`?open=` 上架；coding spawn 產品預設改指向本小品（狗糧可留）。

### 非目標（本計劃不做）

- 給 `pg-llm-agent` 完整 `env.HOST` 或取代總管對口。
- 遊樂場內建 coding agent 種子／編排產品控制台。
- 站內 LLM proxy、預設內建模型、Embedding RAG。
- `side_effects.worker_grant`（歷史；已併入 `delegate_grant`／DEC-037）。
- 刪除狗糧 Host／worker starter（保留驗證／教學）。
- 遠端多使用者／跨 Playgrounds。

---

## Production-ready 門檻（相對狗糧）

現有 `codingOrchestrationWorkerStarter` **不得**充當產品路徑。本小品須同時滿足：

| # | 門檻 | 說明 |
| --- | --- | --- |
| 1 | 三層 SAM | `index.html`／`app.js`＋`functions.js`＋**必備** `controller.js`；任務在 Controller；UI 未掛仍可完成一輪 |
| 2 | SecretStore BYOK | Provider 快捷＋endpoint／model＋密鑰名；新增／輪替 → `playgrounds-open-secret-editor`／`rotate-secret`；執行 `env.secrets.<NAME>.get()`；**禁止** key 進 `localStorage`／`.sam`／prompt |
| 3 | 檔案權威 prompt | `.agent/system.md`（必）；可選 `skills.md`／`output-contract.md`；下一任務讀檔生效 |
| 4 | 真實 LLM 主路徑 | OpenAI-compatible chat；未就緒明確 empty state；**禁止**「無 key 仍假修 demo」當預設成功 |
| 5 | 協定合規 | 相容宣告；經 SESSION `act` 交帳；執行面經委派 grant／`env.DELEGATE`（DEC-037；無 grant 時可 `host_apply`）；路徑跟 brief／grant，不寫死 demo 檔 |
| 6 | Context hygiene | 字元預算／大 input stub；可選自沙盒 `.agent/memory.md`（**不**寫工作沙盒） |
| 7 | Mailbox 冪等 | `session.event` seq 去重；進行中狀態進 KV |
| 8 | 可觀測薄 UI | 入座、task、BYOK、錯誤／步數；非總管聊天 UI |
| 9 | 開箱文件 | README：`?open=`、密鑰、改 system、被邀請；成功標準≠ off-by-one |

---

## 建議檔案布局（小品 repo）

```text
index.html / styles.css / app.js   # 薄 UI：BYOK、狀態、最近 act
functions.js                       # /api/llm/*、/api/secrets、SESSION 轉發
controller.js                      # 領任務、組 prompt、打 LLM、act、冪等
.agent/system.md                   # system prompt（使用者主改）
.agent/skills.md                   # 可選；專長標籤／短說明（總管選人）
.agent/output-contract.md          # 可選；task.result JSON 契約
.agent/memory.md                   # 可選；本實例筆記（非工作沙盒）
.env                               # 非密：DEFAULT_MODEL 等 → env.vars
README.md
```

`index.html` head：`sam:needs-controller`；協定相容 meta（與 SESSION／coding-orch 閘門對齊，形狀開工時釘死並寫進 README）。

---

## 階段

| 階段 | 主題 | 完成定義 | 狀態 |
| --- | --- | --- | --- |
| **0. 契約** | 本 PLAN、GLOSSARY、DEC-017／033 修訂、CODING-ORCH PLAN 產品指針 | 文件無歧義；狗糧≠產品 | **已完成**（2026-08-04） |
| **1. 骨架 repo** | 獨立 `sampot/pg-llm-agent`；三層；讀 `.agent/system.md`；協定相容宣告；SESSION 入座＋`task.assigned`→假 LLM／固定 JSON 可測路徑 | `?open=` 可載入；無 HOST；Controller-only 可回 `task.result`（測試用 stub） | **已完成**（真實 LLM 路徑；無規則假修） |
| **2. BYOK 產品 UX** | Provider 快捷；密鑰選擇器；open／rotate secret dialog；`/api/llm/chat`＋`env.secrets.*.get()`；locked／absent／CORS 可診斷 | 與總管密鑰 UX 同形；無 plaintext 進 iframe storage | **已完成** |
| **3. 真實任務迴圈** | 讀檔組 prompt；parse edits；`progress`／`result`／`failed`／`clarify`；取消／逾時／重試；**移除產品預設規則修 demo** | 真實 brief（非 demo path）可產出合法 result；Host `host_apply` 可套用 | **已完成**（clarify／取消有餘力再補） |
| **4. Hygiene＋觀測** | 字元預算／stub；自沙盒 memory；薄 UI 狀態；README 開箱 | 單測 hygiene／parse；手動：關 UI 仍完成一輪 | **部分完成**（截斷＋狀態 UI＋README；單測／memory 有餘力） |
| **5. 上架與接線** | `/sam/` catalog；spawn 產品預設→本小品；`pg-steward` invite／assign 文件與工具敘事對齊；狗糧 starter 標「僅驗證」 | 手動：總管＋兩份 clone agent → 雙工人指派 | **已完成**（catalog＋spawn；steward 文件敘事可另補） |
| **6. 總管自動調度** | （主要在 `pg-steward`）依 goal 拆 tasks、讀 `skills.md`／工作集選人、不足則 spawn、尊重 `dependsOn` | 人只跟總管；多 agent 自動 invite／assign；本小品僅暴露專長面 | **已完成**（`dispatch_coding_goal`／`list_llm_agents`；平坦多任務；DAG／dependsOn 有餘力） |

---

## 遊樂場／本站變更（薄）

| 位置 | 職責 |
| --- | --- |
| `src/data/samCatalog.ts` | 上架 `kind: agent`（建議 series「子代理」或併「總管」鄰近）；更新 `SAM_AGENT_SERIES_ORDER` |
| `PlaygroundsApp.svelte`／spawn | coding-orch spawn 產品預設 repo／範本改 `pg-llm-agent`（狗糧可選保留） |
| `codingOrchestrationWorkerStarter.ts` | 註明非產品；勿再當開箱主路徑 |
| 本站 docs | 本 PLAN＋交叉引用 |

**遊樂場明確不做：** 內建 `pg-llm-agent` 檔案樹、殼頁 coding agent 設定頁、官方子代理市集。

---

## 總管自動調度（Phase 6 契約摘要）

```text
人 → 總管（goal）
  → 拆 tasks（可先 Scheme A，再決定要不要工人）
  → 掃描工作集中 pg-llm-agent 實例（skills／顯示名）
  → invite（不足 → spawn ?open=sampot/pg-llm-agent 或 clone）
  → task.assigned（＋遊樂場核發 env.DELEGATE）
  → 工人自寫 → task.result（多為 note）→ 總管 read_file 驗收 → 對人摘要
  →（後備）若仍有 kind:write → host_apply
```

- 選人依據：`.agent/skills.md` 與／或 `sam:*` 專長標籤（開工釘死一種，避免雙權威）。
- Agent **不**自申請入座；**不**持 HOST。

---

## 驗收

### Phase 0–1

- [x] 本 PLAN／GLOSSARY／DEC 修訂／CODING-ORCH 產品指針已同步
- [x] 獨立 repo 經 `?open=sampot/pg-llm-agent` 可開
- [x] 無 `env.HOST`；有 `controller.js`；可宣告相容 `coding-orchestration.v1`
- [x] 改 `.agent/system.md` 後下一任務 prompt 內容改變（可測）

### Phase 2–3

- [x] 無密鑰：empty state，不默默成功、不用規則假修當預設
- [x] 新增／輪替密鑰走遊樂場 dialog；設定只存 binding 名＋endpoint／model
- [ ] assign → LLM → `task.result`；總管可 `host_apply` 到 `targetSandboxId`（手動驗收）
- [ ] `task.failed`／`clarify`／locked secret 路徑可手動重現

### Phase 4–5

- [ ] Controller-only（UI 關）完成一輪（手動）
- [x] `/sam/` 上架；兩份 clone 可同時入座各收任務（clone 能力既有；手動驗雙工人）
- [x] spawn 產品路徑指向本小品；狗糧標註清楚

### Phase 6

- [x] 總管依任務自動選人／invite／assign（`dispatch_coding_goal`；平坦多任務；skillTags 對 skills.md）
- [x] 本機模型預設免 API key（總管＋`pg-llm-agent` 預設 `127.0.0.1:1234`）
- [ ] 手動：本機 LLM＋`dispatch_coding_goal` 端到端驗收

一鍵開（目標）：

```
https://play.samkuo.me/?open=sampot/pg-llm-agent&name=Coding%20Agent
```

---

## 相關文件

| 文件 | 關係 |
| --- | --- |
| [PG-CODING-ORCHESTRATION-PROTOCOL.md](./PG-CODING-ORCHESTRATION-PROTOCOL.md) | coding agent act／Host 權威（role=`worker`） |
| [PG-DELEGATE-GRANT-PLAN.md](./PG-DELEGATE-GRANT-PLAN.md) | 委派 grant／執行面（DEC-037） |
| [PG-CODING-ORCHESTRATION-PLAN.md](./PG-CODING-ORCHESTRATION-PLAN.md) | 通道／狗糧／總管 Host（Phase 0–4）；產品 coding agent→本 PLAN |
| [PG-SECRETSTORE-PLAN.md](./PG-SECRETSTORE-PLAN.md) | BYOK／dialog |
| [PG-SAM-ENV-SPEC.md](./PG-SAM-ENV-SPEC.md) | `env.vars`／`env.secrets.*` |
| [PG-SAM-RUNTIME-PLAN.md](./PG-SAM-RUNTIME-PLAN.md) | 三層／Controller |
| [PG-MULTI-AGENT-SESSION-SPEC.md](./PG-MULTI-AGENT-SESSION-SPEC.md) | SESSION 通道 |
| [DECISIONS.md](./DECISIONS.md) | DEC-017／029／033／035 |
| [GLOSSARY.md](./GLOSSARY.md) | coding agent／`pg-llm-agent` 用語 |
| [`pg-steward`](https://github.com/sampot/pg-steward) | 總管；Phase 6 調度主場 |
