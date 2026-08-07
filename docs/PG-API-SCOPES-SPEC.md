# Playgrounds API Scopes（環境能力準入）規格

> **狀態：** Implemented（2026-08-08）— Phase 1–3 ＋ §8.4 場殼義務已落地；Phase 4 Git SAM 型錄仍待  
> **權威決策：** [DECISIONS.md](./DECISIONS.md) **DEC-051**（Accepted）；修訂／延伸 [DEC-036](./DECISIONS.md#dec-036-playgrounds-sam-環境資源綁定與準入)  
> **相關：** DEC-017／029／035／037／038、[playgrounds-host-api.md](./playgrounds-host-api.md)、[GLOSSARY.md](./GLOSSARY.md)  
> **動機場景：** §8 Git 客戶端 SAM（完整遠端版本管理；不內建場殼 Git UI）

一句話：**遊樂場對 SAM 暴露的是隨版本演進的 API 面；授權採 OAuth-style scopes（中粒度、可組合）——`sam:capabilities` 宣告、使用者準入、再投影成 `env.*` 綁定。`env.HOST`＝對口席持有的動態全量 API 客戶端（非整包 scope 名）；角色（總管／Tool／worker）只決定怎麼被打開，不決定能呼叫哪些 API。**

---

## 1. 動機

- 開發者缺口（例：完整 git）需要 SAM 呼叫「建沙盒、改他沙盒 FS、讀 SecretStore」等環境 API——不該被迫「先當總管」或「只能當 Tool」。
- **角色名太粗：** `steward`／`tool`／`worker` 把席位／掛載與授權纏在一起，無法表達「只要建沙盒、不要艦隊／邀請」。
- **逐 HOST 方法太細：** `createProject`、`listDir`、`getConsole`… 各一 token → 同意疲勞；HOST 一擴展就逼重新準入或宣告爆炸。
- DEC-036 已開「宣告＋準入＋窄 binding」路，但 MVP 僅 `runPython`／`runCmd`，且完整 `HOST` 仍硬綁總管席——不足以承載下一波工具型 SAM。

因此採用 **OAuth scopes 慣例**：慢變的 scope 目錄 × 快變的 API 方法面。

---

## 2. 目標

- 定義 **scope 目錄 v0**（名稱、語意、同意文案、對應方法族）。
- 分清四層：**API 面**／**scope**／**`env` 綁定**／**委派 grant**。
- 規定宣告、準入、增量再同意、探測、拒絕後行為。
- 規定 `env.HOST` 與 scopes 的關係（超集客戶端 ≠ 單一 scope `host`）。
- 以 **Git 客戶端 SAM** 為首個非 compute 驗收場景（§8）；場殼**不**內建完整 Git UI。
- 相容遷移：既有 `runPython`／`runCmd` 繼續有效（別名或正式收進 `compute:*`）。

---

## 3. 非目標

- 把每個 `HOST.*` 方法登記成獨立 scope。
- 以單一 scope `host`（或角色名）代表整包動態 HOST 面。
- 場殼內建 Desktop 級 Git（LFS、hooks、submodule、gpg、任意自架 forge CORS）。
- 站內通用 git／HTTP proxy（對齊 DEC-016：瀏覽器直連、僅 CORS 可用）。
- 把 path ACL／工作沙盒委派塞進 `sam:capabilities`（那是 DEC-037 grant）。
- 純玩版 `go.samkuo.me` 的編輯／SecretStore／git（DEC-050）。
- 本刀實作 isomorphic-git 或型錄上架（規格先於實作）。

---

## 4. 模型

### 4.1 四層（勿混）

| 層 | 是什麼 | 變速 | 權威存放 |
| --- | --- | --- | --- |
| **A. API 面** | 場可呼叫的方法集合（HOST bridge、COMPUTE、SESSION、platform 代理…） | **快**（隨場版本長） | `HOST.capabilities()`／文件／實作 |
| **B. Scopes** | 授權標籤（資源×動作強度）；SAM 宣告、使用者同意 | **慢** | `sam:capabilities`＋Config `admittedCapabilities` |
| **C. `env` 綁定** | 獲准 scopes 投影出的 API 句柄 | 隨準入變 | 執行期注入（functions／controller） |
| **D. 委派 grant** | 這次任務對**哪個**工作沙盒的**哪些 path** | **短命** | Tool tab／session worker grant（DEC-037） |

```text
API 面 (A)  ──投影──►  env 綁定 (C)
    ▲                      ▲
    │ 方法掛到 scope 族     │ 僅暴露已準入子集
 scopes (B) ──準入同意───► 已核發集合
                            │
                     正交：grant (D) 限制「對誰／哪條 path」
```

### 4.2 `env.HOST`（全量 vs 子集——同一形狀）

- **對口席（總管）：** `env.HOST`＝**動態全量** API 客戶端。模型上等價於：**任職對口期間，自動準入場認識的全部 scopes**（目錄隨版本變大則對口自動涵蓋新 scope，無需再點同意）。卸任 → 收回此「全目錄準入」快捷；該沙盒若另有使用者明示準入的 scopes，仍保留。
- **已準入 scopes 的任意 SAM（含非總管／卸任後）：** 注入**同一 HOST 形狀**的物件（仍建議掛 **`env.HOST`**）：方法簽名／探測契約與全量相同，但 **`capabilities()` 與可呼叫面＝已準入 scopes 的投影子集**；未覆蓋的方法不存在或明確拒絕。
- **一律子集 HOST 形：** **不**另立 `env.SANDBOX`／`env.OBSERVE` 等平行頂層 API 物件。產品敘事以 scopes 為準；執行期句柄形狀統一為 HOST。
- **`env.COMPUTE`（MVP）：** 遷移期可雙掛；目標將 `runPython`／`runCmd` 收進上述 HOST 子集（準入 `compute:*` 即出現在子集 `capabilities()`）。
- **不**把「整包 HOST」登記為單一 scope 名 `host`（對口＝「全目錄自動準入」，不是一個叫 `host` 的 token）。
- 實作與 bridge **共用同一套方法實作**；差別只在授權用的 scope 集合（對口＝目錄全部 vs 已準入子集）以及 **target／grant**（§6.5）。

### 4.3 角色 ≠ 授權

| 用角色做 | 不用角色做 |
| --- | --- |
| UX：總管區、Tool 掛載、session 入座 | 決定能否 `createProject`／讀 secrets／runPython |
| 誰對使用者負責（總管）、誰對委派方負責（delegate） | 代替 scope 同意 |

任意 SAM 只要 **宣告＋獲準入** 對應 scopes，即可取得 **HOST 形子集**——**不必**先成為總管或 Tool。

### 4.4 OAuth 類比（文件用語）

| OAuth／API 平台 | 遊樂場 |
| --- | --- |
| API 產品面 | A. API 面 |
| Client 請求的 scopes | `sam:capabilities` |
| 使用者同意 | 準入 UI |
| Access token 上的 scopes | `admittedCapabilities` |
| Resource server | Runtime／殼 bridge 按 scope 閘門 |
| RAR／resource 指示 | D. 委派 grant（工作沙盒＋paths） |

---

## 5. Scope 目錄 v0

### 5.1 命名

- 形狀：`resource:action`（小寫；`:` 一段資源、一段動作）。
- 穩定、給人看；同意 UI 顯示**中文說明＋token**。
- 未知 token：**不準入**、不注入（與現行 `filterKnownCapabilities` 一致）。

### 5.2 隱含關係（v0 選定）

原則：**除下表明文「隱含」外，scope 互不包含**（避免準入 `write` 卻靜默拿到 `read`／`invite` 等）。

| Scope | 隱含 |
| --- | --- |
| **`sandbox:edit`** | **`sandbox:list` + `sandbox:read` + `sandbox:write`**（列舉＋讀＋寫；同意 UI 可展開說明） |
| `sandbox:write` | **不**隱含 `sandbox:list`／`sandbox:read`；**不**隱含 `sandbox:create` |
| `sandbox:read` | **不**隱含 `sandbox:list`（已知路徑讀內容不必能列目錄） |
| `sandbox:list` | （無） |
| `secrets:get` | **不**隱含 `secrets:list`（可同時宣告） |
| `compute:python`／`compute:cmd` | （無交叉隱含） |

**準入正規化：** 若宣告／同意 `sandbox:edit`，已核發集合應記 `sandbox:edit`，閘門檢查時視為同時具備 `list`、`read` 與 `write`（不必強迫再各存一筆；若存展開筆，須與 `edit` 同步剪枝）。  
僅有 `sandbox:write`、無 `list`／`read`／`edit` → **可寫不可列、不可讀**（例：已知路徑覆寫）。  
僅有 `sandbox:read`、無 `list`／`edit` → **可讀已知路徑內容，不可 `listDir`／`listFiles`／專案列表探路**。

### 5.3 目錄

| Scope | 同意文案（短） | 方法族（掛到此 scope；非窮舉承諾） | 投影 |
| --- | --- | --- | --- |
| `compute:python` | 執行 Python（Pyodide；數據／公式） | `runPython` | HOST 形子集（遷移期可兼 `env.COMPUTE`） |
| `compute:cmd` | 執行允許清單命令列（WASI） | `runCmd`／`listCmds` | 同上 |
| `sandbox:list` | 列舉沙盒與目錄／檔名（不含讀內容） | `listProjects`／`getProject`（meta）／`listFiles`／`listDir`（對 **已 grant 的 target**；無 grant 時見 §6.5 摘要規則） | HOST 形子集 |
| `sandbox:read` | 讀取其他沙盒的**檔案內容**（不含列舉） | `readFile`／`readFileBase64`／`search`（對 **已 grant 的 target**） | HOST 形子集 |
| `sandbox:write` | 寫入／刪除其他沙盒檔案（含建目錄；**不含**列舉／讀） | `writeFile`／`writeFileBase64`／`mkdir`／`remove`；`openFile` 若需帶內容讀盤則另要 `read`／`edit` | HOST 形子集 |
| `sandbox:edit` | 列舉並讀寫其他沙盒檔案（編輯） | 等價 `sandbox:list`＋`sandbox:read`＋`sandbox:write` | HOST 形子集 |
| `sandbox:create` | 建立、複製、開關沙盒與工作集 | `createProject`／`cloneProject`／`openProject`／`setWorkingSet`；**不含**對使用者沙盒的任意 `deleteProject`（見下） | HOST 形子集 |
| `sandbox:delete-managed` | 刪除標為 agentManaged 的沙盒 | `deleteProject`（既有約束：僅 agentManaged、不可刪現行對口） | HOST 形子集 |
| `canvas:observe` | 觀察工作畫布（console／網路／DOM／截圖／reload） | `reloadCanvas`／`getConsole`／`clearConsole`／`waitConsole`／`getCanvasStatus`／`getNetworkLog`／`clearNetworkLog`／`getDomSnapshot`／`captureCanvas` | HOST 形子集 |
| `secrets:list` | 列出密鑰庫名稱與 meta（無值） | `getSecretStoreStatus`／`listSecrets`／`listSecretNames` | HOST 形子集 |
| `secrets:get` | 經 `env.secrets.<NAME>.get()` 讀密鑰值 | 注入具名 secret binding（仍須 unlock；HOST **永不**回傳值） | `env.secrets.*`（非 HOST 形；DEC-029） |
| `platform:invite` | 鑄／撤場 Invite（殼代理；須已 provision） | `createPlatformInvite`／`revokePlatformInvite` | HOST 形子集 |
| `session:host` | 開／關／編排本機 multi-agent session | `openSession`／`closeSession`／pause／resume／`getSession`／seats／spawn／`hostSessionFetch`… | HOST 形子集 |
| `agent:fleet` | 艦隊只讀摘要與顯示標註 | `listFleetSummary`／`getAgentUi`／`setAgentUi` | HOST 形子集 |
| `ui:tabs` | 主內容 tabs／掛載 plain 或 Tool | `openMainCanvas`／`openTool`／`closeTool`／tab 系列 | HOST 形子集 |
| `checkpoint` | target 沙盒 checkpoint 列舉／建立／還原 | `checkpoint`／`listCheckpoints`／`restore` | HOST 形子集 |

**刻意未進 v0（本刀不準入）：** `evalInCanvas`、`applyPatch`、整場重置、任意刪使用者沙盒、SecretStore 寫入／unlock（僅人類密鑰庫 UI）。

### 5.4 相容別名（遷移）

| 舊 token（DEC-036 MVP） | v0 scope |
| --- | --- |
| `runPython` | `compute:python` |
| `runCmd` | `compute:cmd` |

- 宣告任一侧即可；準入儲存**正規化為 v0 scope**（或雙寫一版後只留 v0）。
- 同意文案以 v0 為準。

### 5.5 新 API 方法如何掛 scope

1. 傷害面與現有 scope **相同** → 掛入該 scope；**已準入者自動可用**（文件 Revision 註記方法名）。  
2. 傷害面**擴大**或新資源 → **新 scope**；僅宣告該 token 的沙盒在升級時走**增量準入**。  
3. 禁止把高敏方法塞進低敏 scope 後靜默擴大。

---

## 6. 宣告、準入、注入

### 6.1 宣告

```html
<meta name="sam:capabilities" content="sandbox:create, sandbox:edit, secrets:get, compute:cmd" />
```

- 權威在 `index.html` head（DEC-024）；**不**承載密鑰或 path。
- 逗號分隔；空白可有可無；大小寫正規化為小寫。

### 6.2 準入時機

- 匯入／`?open=` 安裝／升級（宣告相對已核發有**新增** scope）／使用者手動。
- UI：頁內同意（**禁止** `alert`／`confirm`／`prompt`）；可拒絕——沙盒仍可開，未準入呼叫失敗。
- **增量：** 只對尚未準入的新增 token 再問；已準入且仍在宣告中的保留。
- **剪枝：** 宣告移除某 token → 從已核發集合去掉（對齊現行 `pruneAdmittedToDeclared`）。
- 已核發集合存遊樂場 Config（`admittedCapabilities`）；**預設不進 `.sam`**；import／clone **重準入**（DEC-036）。

### 6.3 注入

- **一律 HOST 形子集：** 已準入 scopes → 注入與對口席同形的 `env.HOST`（子集）；`HOST.capabilities()`＝此句柄上可用方法。**禁止**為 sandbox／observe 等另開平行頂層 binding 名。
- `secrets:get`：維持 `env.secrets.<NAME>.get()`（DEC-029／035；不是 HOST 方法回傳值）。
- `env.COMPUTE`：僅遷移兼容；新碼以 HOST 子集為準。
- 畫布**不**直連 bridge；經 `/api`→`functions.js`（DEC-031）。

### 6.4 探測

| API | 含義 |
| --- | --- |
| `HOST.capabilities()` | **此句柄**已實作且**已授權**的方法名（對口＝全量 A 面；準入 SAM＝scopes 投影子集） |
| 建議 `listKnownScopes()`／文件目錄 | 場**認識**的 scope 目錄（B；慢變） |
| 建議 `listAdmittedScopes()`（或 meta） | **此沙盒**已核發 scopes（B∩同意） |

勿把「場全量方法表」與「此 SAM 子集 `capabilities()`」混為同一語意而不標示。

### 6.5 Target 與委派 grant（DEC-037 家族）

Scopes 決定「這顆 SAM **能不能**呼叫哪些 HOST 形方法」；**對哪個沙盒的檔案樹生效**另靠 grant：

| 取得 target 方式 | 語意 | 例（Git SAM） |
| --- | --- | --- |
| **明示 grant** | 與 Tool／`env.DELEGATE` **同一家族**：使用者把某沙盒（常為整樹 path `/`、`readwrite`）委派給此 SAM | 「將現有沙盒納入 git」＝對該沙盒核發 grant（概念同開 Tool） |
| **建立即自動 grant** | 此 SAM 經已準入之 `sandbox:create`（等）**新建／clone 出的沙盒**，對**建立者 SAM**自動視為已 grant（預設整樹、對齊其已準入之 read／write／edit 強度） | 「從遠端 clone 成新沙盒」→ 建立成功後**不必**再問一次 path 授權即可寫入 `.git`／工作區 |

補充：

- 自動 grant **不**代替 scope 準入：無 `sandbox:edit` 仍不能讀寫；無 `sandbox:create` 不能建。
- **生命週期（已決）：** 自動 grant **不**隨建立者 SAM 刪除／卸載而撤銷。工具用來**產生內容**；產出沙盒是使用者資產，**內容不隨工具刪除**。刪建立者後，他 SAM 要再碰該樹 → 須對新操作者**明示 grant**（或對口全量）；樹本身與既有自動 grant 紀錄的「建立時授權關係」不因工具消失而清掉內容。
- 自動 grant 的**操作主體**在建立當下是建立者 SAM；持久化後視為該 **target 沙盒**上、對建立者 id 的授權條目（或等價）——建立者實例刪除後條目可失效於「誰能呼叫」，但**不**刪 target、**不**清 `.git`／工作區。
- 他沙盒／他 SAM 要碰同一樹 → 仍須明示 grant（或對口全量 HOST）。
- Tool tab 掛載：既有 DEC-037 明示 grant 不變；與「Git 納管既有沙盒」同概念、可同 UI 家族。
- **勿**把 path／sandboxId 寫进 `sam:capabilities`。
- 僅有 scopes、對某 id **無** grant（且非建立即自動之有效主體）→ 跨沙盒 FS 方法失敗（明確錯誤）；`listProjects` 等場級摘要：v0 允許在 `sandbox:list`｜`edit` 下看片名／meta，**對某沙盒 `listDir`／讀檔／寫檔**仍須 grant（自動或明示）。

### 6.6 對口席與 `agent_readonly`

- 對口席＝§4.2 **全目錄 scopes 自動準入** → HOST 全量；卸任失去快捷，改回該沙盒 Config 內明示準入子集（若有）。
- 現行對口 Agent 沙盒自身仍受「不可經 HOST 熱改自己」等既有約束（`agent_readonly`）。準入／對口快捷 **不**解除該約束。
- 對口對**工作／target 沙盒**的既有操作語意保留；非對口則走 §6.5 grant。

---

## 7. 階段

| 階段 | 內容 | 完成定義 |
| --- | --- | --- |
| **0. 規格** | 本文件＋DEC-051＋GLOSSARY | ✅ 目錄 v0 與四層模型無歧義 |
| **1. 目錄落地** | `KNOWN` 改 scope 形；別名；同意文案；正規化儲存 | ✅ 既有 compute 準入回歸綠；舊 token 仍可宣告 |
| **2. 投影擴充** | `sandbox:*`／`secrets:list`／`canvas:observe` 等進 HOST 形子集；grant：明示＋建立即自動 | ✅ 非總管經子集呼叫成功；新建沙盒自動可寫；無 grant 不可碰既有樹 |
| **3. 對口席重述** | 對口＝全目錄 scopes 自動準入；卸任收回快捷 | ✅ host-api／DEC-017／036／051 對齊 |
| **§8.4 場殼** | search／checkpoint／export／clone／畫布／Files 預設排除 `.git` | ✅（Phase 4 型錄前先落地） |
| **4. Git SAM（§8）** | 型錄小品＋驗收；`.git` 進樹＋§8.4 排除表 | ⬜ §8.6 清單 |

---

## 8. 動機場景：Git 客戶端 SAM

### 8.1 定位

- 型錄 SAM（建議 id／source 另定，例 `sampot/pg-git`）：瀏覽器內 git 工作流（isomorphic-git 或等價）。
- 使用者提供 PAT（SecretStore）；自遠端 **clone 成新沙盒**（含完整或 shallow `.git`），或將**既有沙盒** init／remote／push／pull。
- **不**要求場殼另做 Git 面板；**不**要求該 SAM 成為總管——靠 scopes 準入＋ grant（§6.5）。
- 執行期使用 **HOST 形子集** `env.HOST`（非平行 `env.SANDBOX`）。

### 8.2 建議宣告

```html
<meta
  name="sam:capabilities"
  content="sandbox:create, sandbox:edit, secrets:get"
/>
```

| Scope | 用途 |
| --- | --- |
| `sandbox:create` | clone → `createProject`／工作集；**建立成功 → 對新沙盒自動 grant** |
| `sandbox:edit` | 列舉／讀寫工作區與 **`.git`（進樹）**（隱含 list＋read＋write）；對 target 須有 grant |
| `secrets:get` | `GITHUB_PAT`／`GITLAB_PAT` 等 |

| 工作流 | Grant |
| --- | --- |
| 納管**既有**沙盒 | 使用者明示 grant（整樹；**同 Tool grant 概念**） |
| 從遠端 **新建**沙盒 | **自動 grant**（建立者＝此 Git SAM） |

可選後段：`compute:cmd`（本地 diff 輔助，非必須）。**不要**只宣告 `sandbox:write` 而無 `list`／`read`／`edit`——git status／diff／log 需要列舉與讀。

### 8.3 產品邊界（Git）

| 做 | 不做（本場景） |
| --- | --- |
| GitHub／GitLab＋PAT；Smart HTTP；shallow／single-branch 預設可選 | 通用 git proxy；保證任意自架 forge CORS |
| status／diff／commit／push／pull／log；頁內衝突 UI | LFS、hooks、submodule、signing |
| **`.git` 進該沙盒 OPFS 檔案樹**（與工作區同根；非 side-store） | 另開 playgrounds-git／獨立 object DB 權威 |
| 合理預設 `.gitignore`（密鑰、巨大產物、playground 側帳） | 默認把 SecretStore／checkpoint side store 推進遠端 |
| 與場殼「公開 repo 快照匯入」（無 `.git`）並列 | 取代該快樂路徑 |

### 8.4 `.git` 進樹——場殼／Runtime 義務

權威：**`.git` 是沙盒樹內普通目錄前綴**，與工作區一併受 `sandbox:list`／`read`／`write`／`edit` 閘門。為避免把 object DB 當一般原始碼掃爆，實作須：

| 面 | 預設行為（可 Revision） |
| --- | --- |
| Files 側欄 | 預設摺疊／可隱藏 `.git`；勿預設展開 objects |
| `search`／Agent 開場清單 | **預設排除** `.git/**`（顯式 opt-in 才搜） |
| Checkpoint | **預設排除** `.git/**`（體積；還原工作區≠還原 git 史） |
| `.sam` export | **預設排除** `.git/**`；可選「含 git 史」進階勾選（大、且可能含舊密） |
| 沙盒 UI clone | 預設**不**複製 `.git`（對齊「分叉後不暗示遠端連動」）；需要完整史走 Git SAM clone／fetch |
| 畫布 SW 快照 | 服務畫布資產時**跳過** `.git/**`（不當靜態站內容） |

公開「自 GitHub 複製」快樂路徑仍可**不**拉 `.git`（與 Git SAM 並列）。

### 8.5 其餘張力（實作須處理）

1. **單檔 base64 上限（現行 5 MiB）** vs packfile——可能需要 bridge 大檔／分塊 API（掛 `sandbox:write`／`edit`，§5.5）。  
2. **Checkpoint ∥ git ∥ `.sam`** 三套時間軸——文案分開；對齊 §8.4 排除表。  
3. **CORS**——失敗時頁內說明；勿默默改走站內 proxy。

### 8.6 驗收（Phase 4）

- [ ] 非總管沙盒僅宣告 §8.2 scopes，經 **HOST 形子集**準入後可完成「PAT＋公開或私有 GitHub repo → 新沙盒**樹內含 `.git`**」；新建後**無需**再核發 grant 即可寫入。  
- [ ] 「納管既有沙盒」須明示 grant（同 Tool）；無 grant 時無法讀寫該樹。  
- [ ] 可對已 grant 之工作沙盒 init＋remote＋commit＋push；`.git` 落在該沙盒根下。  
- [ ] 僅準入 `sandbox:write`、無 `list`／`read`／`edit` 時，無法完成需列舉／讀樹的 git 流程。  
- [ ] 拒絕 `secrets:get` 時仍可開 SAM，但無法完成需 PAT 的私有流程；頁內可理解。  
- [ ] 未準入 `sandbox:create` 時無法建新沙盒。  
- [ ] 無場殼專用 Git 選單仍可完成上述路徑（型錄／`?open=` 安裝後使用）。
- [ ] §8.4：search／checkpoint／export／畫布快照預設排除 `.git/**`（或文件註明之等價）。
- [ ] 刪除 Git SAM（建立者）後，先前 clone 出的沙盒**仍在**（含 `.git`）；他工具再碰須明示 grant。
- [ ] 無 `env.SANDBOX`／`env.OBSERVE` 平行頂層；SAM 只見 HOST 形（＋`env.secrets`）。

---

## 9. 對現行決策的影響

| 決策 | 影響 |
| --- | --- |
| **DEC-036** | 保留 intrinsic vs capability；目錄升級為 scopes；廢「一般 SAM 宣告 host → MVP 永不核發」的整包敘事，改為按 scope 核發；注入＝HOST 形子集 |
| **DEC-017** | 對口＝**全目錄 scopes 自動準入**→ HOST 全量；卸任收回快捷；非總管得同形子集 |
| **DEC-037** | grant 家族擴及 scoped SAM：明示＋建立即自動；**自動 grant 不隨建立者刪除而撤內容**（工具產內容，內容≠工具生命） |
| **DEC-029／035** | `secrets:get`／`list` 納入目錄；`secrets:get` 仍走 `env.secrets.*` |
| **DEC-038** | 閘門在 Runtime／bridge；scopes／grant 檢查不綁「殼所在 OPFS」假設 |

---

## 10. 開放問題

（本章暫無未決項；新歧義以 Revision 開回。）

**已決摘要：**  
- `sandbox:edit` ⊃ `list`＋`read`＋`write`；`write` **不**⊃ `list`／`read`；`read` **不**⊃ `list`  
- `.git` **進沙盒樹**；場殼義務 §8.4  
- Target：明示 grant（同 Tool）；**建立即自動 grant**  
- 自動 grant：**不**隨建立者 SAM 刪除而撤銷產出內容（工具產內容；內容不隨工具刪）  
- 注入：**一律 HOST 形子集**；對口席＝**全目錄 scopes 自動準入**（快捷全量）

---

## 11. 修訂紀錄

| 日期 | 說明 |
| --- | --- |
| 2026-08-07 | 初版 Draft：OAuth-style scopes；四層模型；目錄 v0；Git SAM 動機場景 |
| 2026-08-07 | 決：`sandbox:edit` 隱含 list＋read＋write；新增 `sandbox:list`；`write`／`read` 不互含 list |
| 2026-08-07 | 決：建立即自動 grant；納管既有＝明示 grant；一律 HOST 形子集 |
| 2026-08-07 | 決：對口＝全目錄自動準入；自動 grant 不隨建立者刪而撤內容 |
| 2026-08-08 | Phase 1–3 ＋ §8.4 落地；DEC-051 Accepted；Phase 4 Git SAM 仍待 |