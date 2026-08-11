# Playgrounds SAM 環境資源綁定與準入

本檔定義：**哪些環境能力須經 `sam:*` 宣告與使用者同意才注入**；以及沙盒**內建（intrinsic）**預設可開的範圍。權威決策：**DEC-036**。執行期參數／密鑰命名空間仍見 [PG-SAM-ENV-SPEC.md](./PG-SAM-ENV-SPEC.md)（DEC-035）；密鑰庫信任見 DEC-029。

一句話：**User／Agent／SAM 都是遊樂場參與者；對環境資源的存取須明確規範。自己的 Code／Data／Config 預設可開；共用服務（如 `runPython`）須宣告＋同意才準入，並優先走窄 binding（`env.COMPUTE`），不必當總管。**

**狀態：** 規格初版（2026-08-04）；**核心已落地**（`sam:capabilities` 解析、`admittedCapabilities`、匯入／開啟同意、`env.COMPUTE` 注入）。手動「沙盒權限」撤銷 UI 可後補。

---

## 1. 定位與邊界

### 1.1 動機

- 遊樂場裡 **User** 與 **Agent** 都是環境參與者（actor）：差別主要是介面（UI vs API），不是「一個受規範、一個隨便拿」。
- 一般 **SAM** 同樣經後端碰資源；需要數據能力（例：spreadsheet-like UI＋`runPython`）時，不應被迫升成總管、也不應讓畫布直連 Pyodide。
- 今日完整 `env.HOST` 綁「總管席」（DEC-017）；本規格補上**非總管的窄環境能力**準入模型。

### 1.2 在堆疊中的位置

```text
index.html sam:* 宣告 environment capabilities
        ↓
匯入／開啟／升級宣告 → 遊樂場同意 UI（準入）
        ↓
沙盒 Config：已核發 capability set（非宣告權威）
        ↓
createFunctionsEnv／Controller env
        ├─ sandbox-intrinsic（預設）… 檔案／vars／KV／DB／…
        └─ 已準入 environment bindings（例：env.COMPUTE）
        ↓
畫布 /api → functions.js → env.*（不得直連 resources）
```

| 層 | 本規格 |
| --- | --- |
| **宣告面** | `index.html` `<head>` 的 `sam:capabilities`（機器 token 清單） |
| **準入面** | 使用者同意後持久化的已核發集合（遊樂場 Config／side meta） |
| **注入面** | `functions.js` 與 `controller.js` 同一准許集合 |
| **參數／密鑰** | 仍 DEC-035／029（本檔不重定值權威） |
| **畫布 UI** | **不得**直讀 bindings；經 `/api`→`functions.js` |

### 1.3 與既有契約

| 既有 | 關係 |
| --- | --- |
| DEC-017 總管＋完整 `HOST` | **保留**：總管席＝完整 `HOST`。本規格另開窄 `COMPUTE` 給已準入的一般 SAM。 |
| DEC-022／037 委派 grant | **同家族**；權威 binding **`env.DELEGATE`**（歷史 `TOOL`）；虛擬 `.bindings/*` 見 [PG-DELEGATE-GRANT-PLAN.md](./PG-DELEGATE-GRANT-PLAN.md)。本規格偏**環境服務**（compute），不取代委派 grant。 |
| DEC-023 `SESSION` | 入座才注入；不納入本檔 MVP capability 目錄。 |
| DEC-037 委派 grant | 跨工作沙盒 FS／`.bindings/db`｜`kv`；與準入**正交**。 |
| DEC-024 `sam:*` | 宣告權威擴充；**不**用 meta 承載 vars 值（DEC-035）。 |
| DEC-029／035 | secrets／vars 不變；secrets **具名 grant** 可後段對齊本準入 UX（非 MVP）。 |
| DEC-031 | UI←網路→後端↔resources 不變。 |
| DEC-018／025 | 含狀態 ask 與 capability 同意可並陳；見 §5.2。 |

### 1.4 目標

- **G1** Actor 對環境資源一律可敘述、可拒絕、可撤銷。
- **G2** 宣告在 `index.html`；值（dotenv／密鑰）不進 meta。
- **G3** 最小權限：未同意＝不注入對應 binding。
- **G4** 窄 binding 優先於完整 `HOST`（分析類 SAM 只需 compute）。
- **G5** 與總管／Tool／Session **正交**（可並存、不可互替）。
- **G6** 明確 **sandbox-intrinsic** 預設開集合，避免把「自己的檔案／狀態」誤收進同意清單。

### 1.5 非目標

- 遠端／跨裝置權限同步；權限市集。
- 畫布直連 Pyodide／WASI／OPFS 權威 API。
- `sam:*` 承載 `KEY=value` 或密鑰。
- MVP：對每一個 `HOST.*` 方法做獨立 ACL UI。
- MVP：強制既有沙盒補 meta（無宣告＝維持現狀，見 §8）。
- 站內通用 CORS proxy／遊樂場代打外網（若未來做，另當高危 capability）。
- 以本規格取代 Tool grant 或 Session 入座。

---

## 2. 用語（本規格）

| 詞 | 意涵 |
| --- | --- |
| **actor** | 環境參與者：User（UI）、Agent（API／mailbox）、SAM 實例（經 `functions.js`／`controller.js`）。 |
| **sandbox-intrinsic** | 該沙盒**自己的** Code／Data／Config 與定義內建執行路徑；**預設可開、不必宣告**。 |
| **environment capability** | 共用或跨邊界環境服務的機器 token（如 `runPython`）；須宣告＋準入。 |
| **宣告（declare）** | SAM 在 `sam:capabilities` 聲明需要的 token 清單。 |
| **準入（admit）** | 使用者同意後，遊樂場將 token 記入該沙盒已核發集合。 |
| **窄 binding** | 注入 `env` 的有限 API 面（本規格 MVP：`env.COMPUTE`）；≠ 完整 `env.HOST`。 |
| **已核發集合** | 每沙盒持久化的 capability tokens；**不是**宣告權威（權威仍在 `index.html`）。 |

---

## 3. Actor 與信任模型

### 3.1 參與者

| Actor | 介面 | 資源通道 |
| --- | --- | --- |
| **User** | 遊樂場 UI、畫布、下方面板 | 人類通道（Python REPL／Shell 等）由遊樂場核發；與 SAM binding **平行**，不經 `sam:capabilities`。 |
| **Steward（總管）** | Agent UI＋API | 完整 `env.HOST`（DEC-017）；設為總管＝視為持有編排面（見 §5.4）。 |
| **一般 SAM** | 畫布 UI→`/api`→functions | intrinsic 預設＋**已準入**的 environment bindings。 |
| **Tool SAM** | 同一般 SAM＋委派時 **`env.DELEGATE`**（歷史 `env.TOOL`） | 委派 grant 見 DEC-022／030／**037**。 |
| **Session Participant** | `env.SESSION` | 入座規則不變（DEC-023）；不因此取得 `COMPUTE` 或 `HOST`。 |

### 3.2 原則

1. **宣告 ≠ 取得** — meta 只表達需求；注入看已核發集合。
2. **同意對象是能力集合** — UI 須同時有人話說明與機器 token。
3. **升級再同意** — 宣告集合 ⊃ 已核發集合時，於執行會用到新能力前（或匯入時）再詢問。
4. **降級** — 宣告移除某 token 時，可自已核發集合移除（無需再問）；建議可觀測。
5. **撤銷** — 使用者可在遊樂場「沙盒權限」撤銷；後續 `createFunctionsEnv` 不注入。
6. **UI 不直連 resources** — 即使已準入，畫布仍只打 `/api`（DEC-031）。

---

## 4. Sandbox-intrinsic（預設可開）

下列**不必**出現在 `sam:capabilities`，也**不必**準入對話。

| 能力 | 說明 |
| --- | --- |
| **自己沙盒檔案樹讀寫** | OPFS／functions 可讀寫**該** `sandboxId` 檔案樹（含匯入資產）。**不含**他沙盒。 |
| **`env.vars`** | 根目錄 `.env` → 同步唯讀（DEC-035）。 |
| **自己的 `env.KV`／`env.DB`** | 以該 `sandboxId` 為 scope 的 Durable 狀態（DEC-018／020）。 |
| **畫布載入自己的靜態資產** | SAM 定義必備。 |
| **同源 `/api`→自己的 `functions.js`** | UI←網路→後端入口。 |
| **runtime 膠水** | 如 `ctx.waitUntil` stub 等；非可濫用環境服務。 |

**明確不是 intrinsic：**

| 項目 | 歸類 |
| --- | --- |
| `runPython`／`runCmd`／完整 `HOST` | environment capability 或角色注入 |
| 他沙盒 FS（含 Tool grant） | DEC-022 grant |
| `env.SESSION` | 入座 |
| `env.secrets.*` | unlock（＋後段具名 grant）；**非**本檔 MVP 準入目錄 |
| 人類 REPL／Shell 面板 | User actor 通道 |
| 站內 proxy／繞 CORS | 禁止或未來高危 capability |

**灰區（本規格定案）：**

| 項目 | 定案 |
| --- | --- |
| 瀏覽器 `fetch` 出站 | **預設允許**（既有 CORS／瀏覽器限制）；不做成 MVP capability。 |
| 觀測**自己**畫布 console／狀態 | 可作後段 intrinsic 或極低摩擦；觀測**他者／工作沙盒**仍走 `HOST`。 |
| mailbox／Controller | Agent 形態執行原語；**不**自動授予 `COMPUTE`／`HOST`。 |

---

## 5. 宣告與準入

### 5.1 宣告面（`index.html`）

權威：該沙盒根目錄 `index.html` `<head>`：

```html
<meta name="sam:capabilities" content="runPython" />
```

| 規則 | 說明 |
| --- | --- |
| 格式 | 逗號分隔 token；空白可 trim；大小寫敏感（目錄用 camelCase／如所示） |
| 空／缺省 | 無 environment capability 需求（僅 intrinsic＋既有角色注入） |
| 未知 token | **不得**默認放行；解析時略過並可警告，或整份宣告失敗（實作選一；建議略過未知＋警告，已知者仍可準入） |
| 禁止 | meta 承載密鑰、`.env` 值、任意 URL 密文 |

可選後段（非 MVP）：`sam:capability-notes` 等人話摘要；MVP 人話可由遊樂場依 token 目錄產生。

### 5.2 準入觸發

於下列時機，若「宣告集合 − 已核發集合」非空，遊樂場須出示同意 UI 後方可將新 token 記入已核發集合：

1. 匯入 `.sam`／`?open=`／自 URL 或 GitHub 複製後，**首次**需要注入對應 binding 之前（建議在匯入流程合併詢問）。
2. 執行期偵測宣告升級（編輯 `index.html` 後下一次 functions／Controller 組 env）。
3. 使用者開啟遊樂場「沙盒權限」手動核發／撤銷。

與 DEC-018／025 **含狀態 ask**：可同一對話分節，或分步；**不得**因 `state=none` 而跳過 capability 同意。

拒絕準入：SAM 仍可載入 UI／intrinsic；呼叫未准許能力時回 §7 錯誤碼（**不**静默當成功）。

### 5.3 已核發集合的持久化與搬動

| 項目 | MVP 規則 |
| --- | --- |
| 存放 | 遊樂場沙盒 Config／side meta（例：`admittedCapabilities: string[]`）；**非** `index.html` 權威 |
| 頁面刷新 | 已核發集合**保留**（與 SecretStore lock 獨立） |
| 進 `.sam` export | **帶宣告**（`index.html`）；**預設不帶**已核發集合 |
| import／clone | 收件方**重新準入**（不繼承來源已核發） |
| 本機同一沙盒 | 同意後持續有效直至撤銷或降級 |

### 5.4 與總管席

| 事件 | 行為 |
| --- | --- |
| 設為總管 | 注入完整 `env.HOST`（既有）；**不**要求 `sam:capabilities` 含 `host`。 |
| 卸任總管 | **收回**完整 `HOST`；曾準入的窄能力（如 `runPython`→`COMPUTE`）**保留**，除非使用者撤銷。 |
| 一般 SAM 宣告 `host` | MVP：**拒絕核發**（或同意 UI 直接禁止）；完整編排面只經總管席取得。 |

---

## 6. Environment capabilities 與注入

### 6.1 MVP capability 目錄

| Token | 意涵 | 注入 |
| --- | --- | --- |
| `runPython` | 使用環境 Pyodide 執行 Python（數據／公式） | 準入後掛 **`env.COMPUTE`**（見 §6.2） |
| `runCmd` | 非互動 WASI CLI（與 Shell 同核語意） | 準入後掛於 **`env.COMPUTE`**（可與 `runPython` 同 binding；方法按已準入子集暴露） |

後段可擴（非 MVP 目錄，列此以免誤用）：`host`（禁／僅總管）、secrets 具名子集、站內 proxy 等。

**不在目錄、且屬 intrinsic：** 自己的 FS、`vars`、`KV`、`DB`（§4）。

### 6.2 窄 binding：`env.COMPUTE`

MVP 注入名稱：**`COMPUTE`**（大寫 binding；頂層保留名新增，見 DEC-036）。

```ts
interface ComputeBinding {
  apiVersion(): Promise<string>; // "1"
  capabilities(): Promise<string[]>; // 實際已準入且已實作的子集，如 ["runPython"]
  runPython(options: HostPythonRunOptions): Promise<HostPythonRunResult>;
  runCmd?(options: HostCmdRunOptions): Promise<HostCmdRunResult>; // 僅當已準入 runCmd
}
```

| 規則 | 說明 |
| --- | --- |
| 何時注入 | 已核發集合與 `runPython`／`runCmd` 有交集，且 runner 可用 |
| 方法可見性 | **只**暴露已準入的方法；未準入的方法不存在或呼叫→`capability_not_granted` |
| 與總管 `HOST` | `HOST.runPython`／`runCmd` 可與 `COMPUTE` **共用同一 runner／佇列**；契約對齊 [playgrounds-host-api.md](./playgrounds-host-api.md) |
| 與人類面板 | REPL／Shell **不**經 `env.COMPUTE`；互斥／佇列引用既有 Python／SHELL 計劃 |
| Tool 模式 | 不因 Tool 而自動給 `COMPUTE`；工具沙盒若需 compute，自己宣告＋準入 |
| 非目標 | `COMPUTE` **不含**改他沙盒、openTool、session 控制、listSecrets 值、完整 FS 觀察面 |

### 6.3 `createFunctionsEnv` 規則（契約）

1. 永遠可組 intrinsic：`KV`、`DB`、`vars`；（非 Tool 時）secrets 命名空間規則仍 DEC-029／035。
2. `HOST`：僅總管席＋bridge（既有）。
3. `DELEGATE`／`SESSION`：既有／DEC-037 條件（歷史 `TOOL`）。
4. `COMPUTE`：僅當本規格準入條件滿足。
5. functions 與 controller **同一**准許集合。

### 6.4 UI 使用型式（規範）

```text
畫布 spreadsheet UI
  → POST /api/analyze（或等價）
  → functions.js
  → await env.COMPUTE.runPython({ … })
  → JSON／表格資料回畫布
```

驅動用例見 §9。

---

## 7. 錯誤碼（需求方向）

| code | 何時 |
| --- | --- |
| `capability_not_granted` | 呼叫需要的 token 未在已核發集合（或方法未暴露） |
| `capability_unknown` | 宣告含無法辨識 token（若實作選擇硬失敗時） |
| `capability_declined` | 使用者明確拒絕準入（可選；供遊樂場 UX） |
| `binding_unavailable` | 已準入但 runner／橋接不可用（如 Pyodide 載入失敗） |

HTTP／工具結果建議 `{ error, code }` 形，對齊 host-api。

---

## 8. 相容與遷移

| 情況 | 行為 |
| --- | --- |
| 無 `sam:capabilities` | **維持現狀**：intrinsic＋角色注入（總管 HOST、Tool、Session）；無 `COMPUTE`。 |
| 舊沙盒不改 meta | 不破壞。 |
| 既有總管 | 行為不變；不需補宣告。 |
| 範本 | 分析類 starter 示範 `sam:capabilities`＝`runPython` 與 `/api` 薄路由（實作階段）。 |

頂層保留名（DEC-035／037 修訂）：在既有 `vars`／`secrets`／`KV`／`DB`／`HOST`／`SESSION` 上新增 **`COMPUTE`**、**`DELEGATE`**（歷史 **`TOOL`**）。

---

## 9. 驅動用例

### 9.1 Spreadsheet-like 數據分析 SAM

| 項 | 內容 |
| --- | --- |
| 宣告 | `sam:capabilities`＝`runPython` |
| UI | 類試算表編輯、圖表／報表 |
| 後端 | 讀自己沙盒 CSV／算式 → `env.COMPUTE.runPython` → 回傳結果 |
| 不需要 | 完整 `HOST`、改他沙盒、`openTool`、當總管 |

### 9.2 反用例

1. 未同意即呼叫 `runPython` → `capability_not_granted`。
2. 惡意宣告 `host` → MVP 不核發完整 HOST。
3. 畫布直連 Worker → 違規（DEC-031）；遊樂場／實作不得提供此捷徑當正式面。

---

## 10. 功能需求總表

| ID | 需求 |
| --- | --- |
| FR-INTR-1 | 自己檔案樹、`vars`、自己的 KV／DB、自己的畫布↔functions 為 intrinsic，不必宣告。 |
| FR-DECL-1 | environment capabilities 宣告權威在 `sam:capabilities`。 |
| FR-ADMIT-1 | 匯入／升級／手動；新 token 須使用者可見同意才準入。 |
| FR-ADMIT-2 | 已核發集合預設不進 `.sam`；import／clone 重準入。 |
| FR-INJECT-1 | 未準入不注入 `COMPUTE`（或不暴露對應方法）。 |
| FR-NARROW-1 | MVP 以 `env.COMPUTE` 提供 `runPython`（可選 `runCmd`）；非完整 `HOST`。 |
| FR-UI-1 | 畫布不直連 compute runner。 |
| FR-STEWARD-1 | 總管完整 `HOST` 語意保留；卸任收回 HOST、保留已準入窄能力。 |
| FR-ERR-1 | 機器可讀錯誤碼（§7）。 |
| FR-COMPAT-1 | 無宣告沙盒行為與本規格落地前相容。 |

---

## 11. 驗收情境

1. **同意後分析：** 匯入含 `runPython` 的 SAM → 同意 → 表格／API 經 `COMPUTE.runPython` 得結果。
2. **拒絕：** 拒絕準入 → UI 可開 → 計算 API 回 `capability_not_granted`。
3. **非總管：** 該沙盒不是總管、無 `env.HOST`，仍可在準入後使用 `env.COMPUTE`。
4. **卸總管：** 某沙盒曾是總管且另已準入 `runPython` → 卸任後無 `HOST`、仍有 `COMPUTE`（若未撤銷）。
5. **升級宣告：** 僅有 `runPython` 已準入 → 編輯加入 `runCmd` → 再出現同意 → 同意前 `runCmd` 不可用。
6. **搬動：** export／import 後須重新同意；宣告仍在 `index.html`。
7. **Intrinsic：** 無 `sam:capabilities` 的 SAM 仍可讀寫自己檔案與 `env.vars`／KV／DB。

---

## 12. 開放問題（後續；不擋 MVP 契約）

| # | 題 | 傾向 |
| --- | --- | --- |
| O1 | SecretStore 具名 grant 是否併入同一同意流程？ | 對齊 SECRETSTORE Phase 5；可共用 UX、分 token 目錄 |
| O2 | `COMPUTE` 是否允許指定套件 allowlist 覆寫？ | 預設跟 HOST／Pyodide 釘版清單 |
| O3 | Controller-only（無 functions）如何在 UI 呈現未準入？ | 遊樂場權限頁＋首呼錯誤 |
| O4 | 本機「信任此作者」略過重覆同意？ | 非 MVP |

---

## 13. 實作指針（非本檔交付）

| 預期路徑 | 用途 |
| --- | --- |
| `parseSamHead`／專案 meta | 讀 `sam:capabilities` |
| 沙盒 Config | `admittedCapabilities` |
| `functionsEnv.ts` | 條件注入 `env.COMPUTE` |
| `hostPython`／WASI runner | 供 `COMPUTE` 與 `HOST` 共用 |
| 匯入／`?open=` UX | capability 同意節 |
| 實作計劃 | 另開 `PG-SAM-BINDINGS-PLAN.md`（可後補） |

---

## 14. 相關文件

| 文件 | 關係 |
| --- | --- |
| [DECISIONS.md](./DECISIONS.md) **DEC-036** | 本契約 ADR |
| [PG-SAM-ENV-SPEC.md](./PG-SAM-ENV-SPEC.md) | vars／secrets；與宣告面分工 |
| [PG-SECRETSTORE-PLAN.md](./PG-SECRETSTORE-PLAN.md) | 密鑰；後段 grant |
| [playgrounds-host-api.md](./playgrounds-host-api.md) | `runPython`／`runCmd` 形狀 |
| [PG-AGENT-MODEL-SPEC.md](./PG-AGENT-MODEL-SPEC.md) | UI←網路→後端 |
| DEC-017／022／023／024／031 | 總管／Tool／Session／meta／actor 模型 |
| [GLOSSARY.md](./GLOSSARY.md) | 用語 |

---

## 15. 產品句

> **自己的檔案與狀態預設就能用。要用 Python／命令列這類環境能力，寫在 `index.html`，使用者同意才準入。分析類 SAM 走窄的 `env.COMPUTE`，不必當總管。**
