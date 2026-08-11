# Playgrounds 委派授權（Delegate Grant）實作計劃

本檔定義 **Tool SAM** 與 **session worker Agent**（如 `pg-llm-agent`）共用的**工作沙盒委派授權**模型與落地階段。權威決策：**DEC-037**。既有 Tool 槽見 [PG-TOOLS-PLAN.md](./PG-TOOLS-PLAN.md)／**DEC-022**；coding 編排交帳見 [PG-CODING-ORCHESTRATION-PROTOCOL.md](./PG-CODING-ORCHESTRATION-PROTOCOL.md)／**DEC-033**；SAM 自身能力準入見 [PG-SAM-BINDINGS-SPEC.md](./PG-SAM-BINDINGS-SPEC.md)／**DEC-036**。

一句話：**Tool 與 worker Agent 同為受委派者（delegate）；對工作沙盒採同一套最小權限 grant，注入統一 binding **`env.DELEGATE`**；SAM 自己會什麼由 `index.html` 宣告＋使用者準入；檔案樹以直覺虛擬節點 `.bindings/db`｜`.bindings/kv` 作為工作沙盒 `env.DB`／`env.KV` 的開啟／授權把手（不展開內容、不跟 `.sam` 的 `.playgrounds-state/` 對齊）。**

**狀態：** Phase 0–1、**4 已完成**；Phase 2–3 **部分完成**；Phase 5 **部分完成**（狗糧＋`pg-steward`／`pg-llm-agent` 對齊 DEC-037；手動 E2E 待做；2026-08-04）。

---

## 1. 動機與定位

### 1.1 問題

- 現行 Tool grant（DEC-022）僅工作沙盒 **OPFS 檔案 path**；SQLite／KV 類工具無法從 Files 直覺開啟 **`env.DB`／`env.KV`**。
- 現行 coding worker（DEC-033 MVP）幾乎只有 `env.SESSION`；寫工作沙盒靠總管 `host_apply`——工人無執行面工具，無法對標「受委派後自己把子任務做完」。
- Tool 與 worker 若各搞一套授權，違反「委派＝最小權限」的單一原則。

### 1.2 一句角色模型

```text
使用者（所有權）
  └── 總管（管理權／對人負責；env.HOST）
        └── 委派 delegate（最小權限工作沙盒 grant）
              ├─ Tool SAM（人驅動 UI；env.DELEGATE）
              └─ worker Agent（LLM／Controller；env.SESSION 交帳＋env.DELEGATE）
```

| | 總管 | Delegate（Tool ＝ worker） |
| --- | --- | --- |
| 對誰負責 | 使用者 | 委派方（人經 UI，或總管經任務） |
| 動態授權 | 核發／撤銷工作沙盒 grant | **僅**被核發範圍 |
| 自身能力 | 準入＋intrinsic | 同（DEC-036） |
| 完整 HOST | 有（總管席） | **無** |

### 1.3 兩層授權（正交）

| 層 | 誰同意 | 管什麼 | 動態？ |
| --- | --- | --- | --- |
| **準入** | 使用者 → 該 SAM 實例 | `sam:capabilities`（如 `runPython`）→ 注入自身環境能力 | 匯入／升級再問；非逐任務 |
| **委派 grant** | 人（openTool）或總管（assign） | **工作沙盒**資源：OPFS 路徑＋`.bindings/db`｜`kv` | **是**；掛載／任務結束即撤 |

- Delegate **自己的** FS／`env.KV`／`env.DB`／`vars` 仍為 sandbox-intrinsic（DEC-036）。
- **唯一**需動態授權的跨邊界項＝**工作沙盒**存取（含其 `env.KV`／`env.DB` 投影）。
- `.sam` 的 `.playgrounds-state/` 僅匯出序列化；**不是**授權 path、**不必**與虛擬節點一致。

### 1.4 目標與非目標

**目標**

- 統一 **delegate grant** 契約：Tool 與 worker 同一強制執行層。
- Files 顯示虛擬入口 `.bindings/db`、`.bindings/kv`（**不**展開鍵／表）；內容 UI 由 Tool SAM（或 agent 工具迴圈）提供。
- SQLite Tool：只需 `.bindings/db` → 工作沙盒 `env.DB`。
- coding-orchestration：任務指派可核發 grant；工人在授權內執行；`host_apply` 降為可選後備。
- 最小權限：能窄則窄；結束即撤；不因「是 Agent」就比 Tool 更寬。

**非目標（本計劃）**

- 給 delegate 完整 `env.HOST` 或遊樂場管理面。
- 虛擬節點對齊 `.playgrounds-state/` 路徑。
- Files 展開 KV 鍵或 DB schema。
- SecretStore／`.bindings/secrets` 開啟（密鑰維持 DEC-029）。
- 站上官方 SQLite／KV Tool 市集（可另開小品 repo；本檔只定契約）。
- 遠端／跨 Playgrounds 委派。

---

## 2. 契約摘要

### 2.1 虛擬節點（Files／授權 path）

共同子目錄（保留名，非使用者原始碼權威）：

```text
.bindings/
  d1     → 工作沙盒 env.DB（整庫入口；SQLite Tool 主標的）
  kv     → 工作沙盒 env.KV（整庫入口；內容由 Tool／agent 呈現）
```

| 規則 | 說明 |
| --- | --- |
| 直覺優先 | path 服務人與 grant；**不**跟 `.sam` state 目錄同形 |
| 不展開 | 樹上**不**列出 `kv/<key>` 或 DB 表；瀏覽在 Tool／agent 內 |
| 非真檔 | 虛擬節點**不是** OPFS 專案檔；`readFile(".bindings/db")` 不得當成普通文字檔語意（應走 binding API 或明確錯誤） |
| 與 source 分隔 | 預設匯出原始碼**不含**虛擬節點實體；Durable 匯出仍走既有 `.playgrounds-state/` |

### 2.2 Grant 物件（概念）

```text
DelegateGrant = {
  hostSandboxId: string,     // 通常＝工作沙盒／targetSandboxId
  mode: "read" | "readwrite",
  paths: string[],           // OPFS 前綴／精確 path，及／或 ".bindings/db"｜".bindings/kv"
}
```

強制映射：

| grant path | 允許操作 |
| --- | --- |
| 普通相對 path | 工作沙盒 OPFS ∩ path／前綴（既有 grant 語意） |
| `.bindings/db` | 工作沙盒 **`env.DB`**（非整棵 OPFS） |
| `.bindings/kv` | 工作沙盒 **`env.KV`** |
| 其它 `.bindings/*` | MVP 拒絕（未知） |

- 僅授 `.bindings/db` 的 SQLite Tool：**不得**讀工作沙盒任意原始碼，也**不得**碰 `env.KV`。
- Delegate **自己的** `env.KV`／`env.DB` 與 grant 無關（仍指向自身 `sandboxId`）。

### 2.3 Binding 表面（注入）

**統一名稱：`env.DELEGATE`**（大寫頂層 binding；對齊 `HOST`／`SESSION`／`COMPUTE`）。Tool 與 worker **同一契約**，勿並行維護第二套語意。

| 消費者 | Binding | 生命週期 |
| --- | --- | --- |
| Tool SAM | `env.DELEGATE` | tab 掛載／grant 有效期間 |
| worker Agent | `env.DELEGATE` | 任務／座位 grant 有效期間 |

**遷移：** 現行實作之 `env.TOOL` 視為歷史名；落地本計劃時改注入 `DELEGATE`（可短暫相容別名，文件與新範本只用 `DELEGATE`）。`openTool`／tool session UX 名稱可保留「工具」，binding 鍵名一律 `DELEGATE`。

最低方法（概念；由現 TOOL 面遷移並擴）：

- `getGrant()`、`apiVersion()`、`capabilities()`
- OPFS：`readFile`／`writeFile`／base64（僅非 `.bindings` path）
- Durable：`db`／`kv` 存取**僅當** grant 含對應虛擬 path（形狀對齊工作沙盒 `env.DB`／`env.KV` 子集，或經明確 accessor）
- Tool 可選：`close({ dirty? })`（請求卸掛載）

Worker **另**持 `env.SESSION` 向總管交帳；Tool 不強制 SESSION。

### 2.4 與 coding-orchestration

| 現行（DEC-033 MVP） | 本計劃目標 |
| --- | --- |
| `side_effects.host_apply` 為工人主寫入 | 工人主路徑＝**delegate grant** 自寫／自讀 |
| `task.result.edits` 為權威提議 | edits 可選證據／摘要；寫入權威在 grant |
| `side_effects.worker_grant` 非 MVP | 升為與 Tool **同一家族**；capability 名建議 `side_effects.delegate_grant` |
| 觀察迴圈僅總管 | 工人在 grant＋自身準入能力下可跑子任務迴圈；總管仍對人彙整 |

協定修訂（Phase 0／協議檔）：`task.assigned` 可攜 grant 摘要或由 Host 經遊樂場核發後事件通知；任務終態／cancel／kick → 撤 grant。`host_apply` 保留為總管覆核／回滾／無 grant 後備。

### 2.5 總管編排（產品敘事）

```text
人 → 總管（goal）
  → 拆子任務（可平行則平行）
  → invite worker（準入已完成的 pg-llm-agent）
  → assign + 最小 DelegateGrant
  → worker 執行（自身工具＋grant）→ SESSION 交帳
  → 撤 grant；對人摘要
```

選人／skills 仍屬總管產品（見 [PG-LLM-AGENT-PLAN.md](./PG-LLM-AGENT-PLAN.md)）；本檔不重定。

---

## 3. 階段

| 階段 | 主題 | 完成定義 | 狀態 |
| --- | --- | --- | --- |
| **0. 契約** | 本 PLAN、DEC-037、GLOSSARY；修訂 DEC-022／033 指針；PROTOCOL 草稿段落（delegate_grant） | 文件無歧義；Tool＝worker 授權同家族 | **已完成**（2026-08-04） |
| **1. Grant 核心** | 統一 grant 正規化／匹配（OPFS path＋`.bindings/db`｜`kv`）；單元測；未知 `.bindings/*` 拒絕 | Vitest：允許／拒絕／mode；DB／KV 映射碼 | **已完成**（2026-08-04） |
| **2. 虛擬節點 UI** | Files 顯示 `.bindings/db`、`.bindings/kv`（入口 only）；開啟／openTool 可選虛擬 path | 手動：點 db 可發起帶 DB grant 的掛載 | **部分完成**（Files／listDir 已投影；手動驗收待做） |
| **3. DELEGATE 注入** | 改／擴注入 `env.DELEGATE`（取代 `env.TOOL`）；grant 含 d1／kv 時暴露工作沙盒 Durable 子集；SQLite 狗糧或小品可只授 d1 | 單測＋手動：僅 d1 grant 不可碰 FS／KV；新範本只用 `DELEGATE` | **部分完成**（注入＋DB／KV 代理＋`TOOL` 別名；範本遷移待做） |
| **4. Worker grant** | session／coding-orch：assign 核發同家族 grant＋注入 `env.DELEGATE`；撤銷；`pg-llm-agent`／狗糧可讀寫授權範圍 | 工人無 HOST 仍能改 target 檔或 DB（依 grant）；結束無殘留 | **已完成**（Host registry／assign 先於 fan-out／leave／close；注入；單測；狗糧 worker 自寫；2026-08-04） |
| **5. 協定收斂** | PROTOCOL／總管：`delegate_grant` 為產品主路徑；`host_apply` 標後備；PLAN／驗收更新 | 文件＋至少一條端到端（總管指派→工人自寫→交帳） | **部分完成**（狗糧＋`pg-steward`／`pg-llm-agent` 已對齊 DEC-037；手動 E2E 待做；2026-08-04） |

---

## 4. 實作錨點（預期）

| 區域 | 職責 |
| --- | --- |
| `toolGrant.ts`（或後繼） | path／`.bindings/*` 正規化、mode、匹配 |
| Files／listDir 投影 | 注入虛擬 `.bindings` 入口（標虛擬，非 OPFS 寫入） |
| `openTool`／tool session | grant.paths 可含虛擬節點 |
| `functionsEnv`／`DELEGATE` 注入 | 依 grant 掛工作沙盒 FS／DB／KV 代理；遷移自 `TOOL` |
| session／coding-orch Host | assign↔grant 生命週期；踢座撤權 |
| [`pg-steward`](https://github.com/sampot/pg-steward)／[`pg-llm-agent`](https://github.com/sampot/pg-llm-agent) | 產品路徑對齊（外 repo；本站文件約束） |

---

## 5. 驗收情境

1. **SQLite Tool：** 工作沙盒 Files 見 `.bindings/db` → 用 Tool 開啟 → 僅 `env.DB`；無 FS 其它 path、無 KV。
2. **KV Tool：** `.bindings/kv` → Tool 內列出／編輯鍵；Files **不**展開鍵。
3. **最小 path Tool：** 僅授 `src/**` → 不可碰 `.bindings/*`。
4. **Worker：** 總管 assign＋`src/` grant → 工人自寫檔 → SESSION `task.result`；無 HOST；任務結束 grant 失效。
5. **平行：** 兩 worker 不同 path grant 不互踩；同 path 衝突由 Host／預期碼處理（文件化）。
6. **準入正交：** worker 未準入 `runPython` 時，有 grant 也無 `COMPUTE`。
7. **匯出：** 預設 `.sam` 不含虛擬節點實體；勾選 state 仍走 `.playgrounds-state/`，與 `.bindings` path 無關。

---

## 6. 錯誤碼（建議）

| code | 何時 |
| --- | --- |
| `grant_path_forbidden` | path／虛擬節點不在 grant |
| `grant_binding_required` | 呼叫 DB／KV 但 grant 未含對應 `.bindings/*` |
| `bindings_virtual_not_file` | 把虛擬節點當普通 OPFS 檔讀寫 |
| `grant_inactive` | 無委派 session／已撤銷 |
| （沿用）`forbidden`／`bad_path` | 既有 grant 語意；歷史 `tool_inactive` 可對應 `grant_inactive` |

---

## 7. 相關文件

| 文件 | 關係 |
| --- | --- |
| [DECISIONS.md](./DECISIONS.md) | **DEC-037**；修訂 DEC-022／033 |
| [GLOSSARY.md](./GLOSSARY.md) | delegate／`.bindings`／grant 用語 |
| [PG-TOOLS-PLAN.md](./PG-TOOLS-PLAN.md) | Tool 槽；grant 範圍擴充指針 |
| [PG-CODING-ORCHESTRATION-PROTOCOL.md](./PG-CODING-ORCHESTRATION-PROTOCOL.md) | `delegate_grant`／交帳 |
| [PG-CODING-ORCHESTRATION-PLAN.md](./PG-CODING-ORCHESTRATION-PLAN.md) | 通道／狗糧；產品副作用指針 |
| [PG-LLM-AGENT-PLAN.md](./PG-LLM-AGENT-PLAN.md) | 產品工人；執行面依賴本 grant |
| [PG-SAM-BINDINGS-SPEC.md](./PG-SAM-BINDINGS-SPEC.md) | 準入／intrinsic；與委派正交 |
| [playgrounds-host-api.md](./playgrounds-host-api.md) | `env.DELEGATE`／openTool 表面更新 |

---

## 8. 開放題（開工可定）

| # | 題 | 傾向 |
| --- | --- | --- |
| O1 | ~~worker binding 名~~ | **已定：`env.DELEGATE`**（Tool／worker 統一） |
| O2 | `.bindings` 是否在 `listDir("/")` 預設可見？ | 是（虛擬）；可設定隱藏 |
| O3 | grant 是否支援只讀 DB？ | 要；`mode` 套用到 binding 寫入 |
| O4 | 多 tab 多 grant 與單 worker 多 task？ | MVP：一前景 Tool grant；worker 一 task 一 grant（或 seat 上當前 task） |
| O5 | `env.TOOL` 相容期多長？ | 短；新程式／範本只寫 `DELEGATE`，舊路由可雙掛一版 |
