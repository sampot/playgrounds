# Playgrounds Backend Runtime — 規格

本檔定義：**SAM 後端腳本（`functions.js`∥`controller.js`）的執行面**，以及**殼層與儲存權威的邊界**——離開遊樂場 UI 主線程、廢止 functions host hidden iframe、由 Backend Runtime 承載後端與沙盒儲存。權威決策：**DEC-038**。執行模型／mailbox／Leader 語意仍見 [PG-AGENT-MODEL-SPEC.md](./PG-AGENT-MODEL-SPEC.md)（DEC-031）；三層與 headless 見 DEC-024／[PG-SAM-RUNTIME-PLAN.md](./PG-SAM-RUNTIME-PLAN.md)。實作階段見 [PG-BACKEND-RUNTIME-PLAN.md](./PG-BACKEND-RUNTIME-PLAN.md)。

一句話：**沙盒儲存（FS／KV／DB）權威在 Backend Runtime，殼層不得假設 OPFS 在「本機殼所在瀏覽器」；`functions.js`∥`controller.js` 只在 Runtime 執行；殼↔Runtime 僅經可替換的訊息通道（MVP＝`postMessage`；跨主機＝WebRTC 等），殼面指令必須可終端完成。**

**狀態：** 規格初版（2026-08-04；修訂拆開 HOST、殼不假設 OPFS；**再修：保留跨主機 WebRTC 叢集遷移路線**）；**Phase 0–4 MVP 已落地**（functions＋Controller＋drain＋FS 權威在 Worker；Secrets §6.3-A）。ADR：**DEC-038**。

---

## 1. 背景與動機

### 1.1 問題

今日（遷移前）瀏覽器後端載入分裂為：

| 路徑 | 載體 | 執行緒 |
| --- | --- | --- |
| Controller／`SamInstance` | 殼頁 `blob:`＋`import()`（`samBrowserLoader`） | **UI main thread** |
| 畫布 `/api`→`functions.js` | `functionsRuntime` **hidden iframe**＋import map | iframe 內（仍佔瀏覽器行程；且與 Controller **雙載入器**） |
| Session Host 轉發 | 同上 `loadFunctionsModule` | 同上 |

後果：

1. **UI 卡頓：** mailbox drain、alarm、`functionsFetch`、百級 fleet tick 與編輯器／Leader 心跳搶同一主線程。
2. **雙軌技術債：** 「執行不依賴 iframe」（DEC-031）只做到 Controller；畫布 `/api` 仍用 `playgrounds-functions-host`。同源 hidden iframe **不是**惡意碼隔離（可碰 `parent`）。
3. **與 headless／跨主機不對稱：** Node 已可跑 `SamInstance`；殼層與 Files／HOST 卻常**直接假設「殼所在瀏覽器」的 OPFS**，無法遷移到「多主機瀏覽器經 WebRTC 成叢集、Runtime／workers 可能在另一台主機」。
4. **易長成矛盾迴路：** 後端請殼層做事 → 殼層為完成又打回後端讀寫權威儲存（後端→殼→後端）。

### 1.2 設計意圖

1. **殼層不得假設 OPFS（或任何沙盒權威儲存）位於「殼所在瀏覽器」。** 編輯器／Files／畫布靜態供給所觸及的沙盒檔，一律經 Backend Runtime 的 API／通道；殼可快取，**權威在 Runtime**。
2. **後端離開 UI main thread**（效能／回應性），不是多租戶硬隔離。
3. **單一後端執行面：** `functions.js` 與 `controller.js` 同屬 Backend Runtime；廢 functions host iframe。
4. **拆開 HOST／Delegate：** 儲存與純資料面在 Runtime **本地**（對該部署的 storage）；僅畫布／編輯器 UI／DOM／殼持有子 runner 走殼面。殼面指令**必須可終端**（見 §6.1）。
5. **維持 DEC-031：** 單權威／`homePeer`；同瀏覽器 MVP 為單 Leader＋外接螢幕。跨主機叢集時 Runtime 隨 **homePeer**（或等價執行宿主），殼可能只是外接螢幕／另一 peer 的 UI。
6. **維持 DEC-024：** `sam-runtime` 與 DOM 解耦；同頁 Worker／Node／**他機 Runtime** 為同級部署，**殼層契約相同**。
7. **保留遷移路線：** 見 §1.4；本計劃不實作 WebRTC 叢集，但不得寫死「Runtime 必與殼同文件／同 OPFS 根」。

### 1.3 與「殼頁 blob」的關係

「殼頁 blob」＝在**遊樂場主頁 Window** 用 `Blob`＋`import()` 載後端。本規格要求後端改到 **Backend Runtime** 內做同等 ESM 載入——**不是**繼續在殼頁 main 跑 blob。**Controller 已遷入 Worker**（殼僅 `RemoteSamInstance` 代理）；「殼頁 blob 跑 Controller」視為已淘汰的過渡實作。

### 1.4 部署形狀與遷移路線

| 階段 | 殼層 | Backend Runtime | 沙盒儲存 | 殼↔Runtime 通道 |
| --- | --- | --- | --- | --- |
| **契約（必守）** | 不假設本機殼瀏覽器 OPFS 為權威 | 跑 functions∥controller | **親和 Runtime／homePeer** | **可替換**訊息通道 |
| **MVP（本計劃）** | 同頁遊樂場 UI | 同頁 Leader **Dedicated Worker** | Worker 內 OPFS（殼不直打） | `postMessage` |
| **同瀏覽器多 tab** | 外接螢幕 tab | 僅 Leader 跑 Runtime | 同左 | 既有 relay＋通道 |
| **跨主機叢集（路線，非本計劃交付）** | 任一 peer 的遊樂場 UI | **可能在另一台主機**的瀏覽器 Worker／節點 | 隨 Runtime／homePeer（實作另定） | **WebRTC**（或等價）；審查架構時可用「HTTP＋WS／edge」作**類比**，**不是**本站要做 CF 託管產品 |

遷移不變式：

1. 殼只依賴 **BackendHost／通道 API**，不依賴「Runtime 與殼同 `Window`／同 OPFS」。
2. 換通道實作（`postMessage` → WebRTC data channel）時，§6 本地面／殼面／可終端規則**不變**。
3. 跨主機後仍遵守 DEC-031：**單一 homePeer 權威**；不自動多寫；HA／migrate 另循 AGENT-MODEL。
4. Cloudflare 等 edge 僅作「殼與 Runtime 分離」的審查類比；**正式遷移目標敘事＝多主機瀏覽器 WebRTC 叢集**。

**本計劃非目標：** 實作 WebRTC 叢集、完整跨 peer Durable、真 CF 託管產品。

---

## 2. 目標與非目標

### 2.1 目標

- **G0** **殼層不假設瀏覽器 OPFS 為沙盒權威**；儲存親和 Backend Runtime；殼↔Runtime 僅經明確通道。
- **G1** 定義 Backend Runtime 拓撲、生命週期與 Leader 關係（MVP＝Dedicated Worker）。
- **G2** 定義殼／Runtime 責任切分；**拆開** HOST／Delegate（Runtime 本地 vs 殼面）；殼面**可終端**。
- **G3** 定義哪些 bindings／HOST 方法在 Runtime 落地、哪些為殼面。
- **G4** 統一畫布 `/api`、`functionsFetch`、session Host 轉發、Controller drain 的執行面。
- **G5** 廢止 `functionsRuntime` hidden iframe；禁止再以「UI 管線細節」保留。
- **G6** 與 Node headless、DEC-031／`homePeer` 相容；**保留**跨主機 WebRTC 叢集遷移路線（契約不阻擋）。

### 2.2 非目標

- 以 Runtime 充當惡意 SAM 安全沙箱（opaque origin 隔離產品另議）。
- SharedWorker 跨 tab 常駐後端（與「關 Leader＝主機關閉」衝突）。
- 按 `agentId` 分片多 Leader（仍見 AGENT-MODEL §7.3）。
- MVP：一 Agent 一 Worker、或 Runtime 內再嵌 Pyodide／WASI。
- **本計劃內交付** WebRTC 多主機叢集或完整 Cloudflare 託管（見 §1.4：契約須可遷移）。
- 本檔內的 Phase 勾選表（見 PLAN）。

---

## 3. 用語

正式對照亦應進入 [GLOSSARY.md](./GLOSSARY.md)。

| 用語 | 意思 |
| --- | --- |
| **Backend Runtime** | 執行 `functions.js`∥`controller.js`，並持有**沙盒儲存權威**的執行面。MVP＝同頁 Dedicated Worker；可遷到他機 peer 的 Runtime。 |
| **Backend Runtime Worker** | MVP：Leader tab 的 **Dedicated Worker**（Runtime 的一種同頁部署）。 |
| **殼層／殼頁** | 遊樂場 UI（編輯器、Leader 選舉、畫布殼、SecretStore UI）。**不**持有沙盒 FS／KV／DB 權威；**不**假設 Runtime 與殼同機。 |
| **BackendHost** | 殼側適配：啟動或**連上** Runtime、轉發 `/api`、實作殼面方法、把殼發起的儲存／API 請求送進通道。 |
| **Runtime 本地面** | 在 Runtime 內的 FS／KV／DB／vars 及 HOST／Delegate 儲存子集；**不**經殼代打權威儲存。 |
| **殼面（終端指令）** | 只碰畫布／編輯器 UI／DOM／殼狀態；執行時**不得**再向 Runtime 打「完成此指令所必需」的權威 FS／KV／DB／functions。 |
| **訊息通道** | 殼↔Runtime 的可替換傳輸：MVP＝`postMessage`；跨主機目標＝**WebRTC**（等價通道另定）。 |
| **跨主機叢集（路線）** | 多主機瀏覽器經 WebRTC 成叢集；Runtime／workers 可在非殼所在主機。細節另立規格；本檔保留遷移不變式。 |
| **functions host iframe** | 歷史載體；本規格要求**移除**。 |

---

## 4. 拓撲

### 4.1 部署圖（MVP：同瀏覽器）

```text
┌─ Follower tabs（外接螢幕）──────────────────────┐
│  編輯／畫布 UI → /api relay → Leader             │
└────────────────────────────────┬────────────────┘
                                 │ 既有 functionsApiRelay 等
┌─ Leader 殼層 ──────────────────▼────────────────┐
│  Web Lock 選舉／心跳／leaderEpoch                 │
│  畫布 SW 入口、編輯器、SecretStore UI            │
│  BackendHost：通道 ↔ Runtime（勿直打沙盒 OPFS）  │
│  殼面：畫布／DOM／編輯器 UI（終端指令）            │
│  drainGate／kickDrain；RemoteSamInstance 代理    │
└────────────────────────────────┬────────────────┘
                                 │ 訊息通道（postMessage）
┌─ Backend Runtime（Dedicated Worker）─▼──────────┐
│  SamInstance×N（functions.js ∥ controller.js）  │
│  AgentRuntime：mailbox drain／alarm             │
│  儲存權威：OPFS FS、KV、DB、vars、secrets 快取   │
│  →殼面指令：reloadCanvas、開編輯器（含內容）…    │
└─────────────────────────────────────────────────┘
```

跨主機形僅替換「Runtime 所在主機＋儲存實作＋通道＝WebRTC 等」；**殼層行為不變**（仍不假設本機殼瀏覽器 OPFS；仍不直連他機儲存 API）。

細節分類見 §6。

### 4.2 不變式

1. **儲存權威在 Runtime／homePeer**；殼層**不得**以「殼所在瀏覽器」的 OPFS（或其它本機 FS API）作為沙盒／KV／DB 權威來源或預設寫入面。
2. **MVP：** 至多一個 Backend Runtime 對應一個 Leader tab。Follower **不得**啟動後端 Runtime。跨主機時：執行宿主＝持有該 `sandboxId` 權威的 peer（對齊 DEC-031），細節另規。
3. Leader／執行宿主 degrade／關閉 → **terminate 或交出** Runtime；進行中 handler **不 ack**（at-least-once）；後任依 Durable／目錄接手。
4. 畫布可見 iframe（UI）**不是**後端執行面；僅經 `/api` 當客戶端。
5. **禁止**再為載入 `functions.js` 建立 hidden iframe。
6. **後端↔後端不得經殼層**（跨 SAM／跨 peer 的 functions／mailbox 走 Runtime／peer 通道，不經 UI 殼代打）。
7. Node headless：無殼層；直接 `SamInstance`＋host adapter。
8. **禁止矛盾迴路：** 不得「Runtime 要求殼完成 X，而殼為完成 X 必須再呼叫 Runtime 權威儲存／functions」（見 §6.1）。
9. **通道可替換：** 殼不得綁死 `postMessage`／同文件假設，以便遷到 WebRTC。

### 4.3 為何 Dedicated、非 SharedWorker（MVP）

Leader 生命週期＝執行宿主。SharedWorker 跨 tab 存活語意與「關 Leader＝主機關閉／重選」不易對齊。Follower 只當螢幕，不共享後端進程。

### 4.4 為何預設「一 Leader 一 Runtime」（MVP）

對齊現行「單 Leader 扛全部 Controllers」。跨 agent 調度與 epoch fencing 簡單。百級負荷可於後段加 pool；單實例 CPU 重活仍可依 AGENT-MODEL：**spawn 子 Agent**。

---

## 5. 責任切分

### 5.1 殼層（保留）

| 職責 | 說明 |
| --- | --- |
| Leader 選舉 | Web Lock＋心跳＋epoch；Runtime 僅在「已是執行中 Leader」時啟動 |
| BackendHost | 建立／銷毀 Runtime；轉發；**殼發起的**讀寫／`/api` 一律進 Runtime |
| 畫布管線 | SW／快取可服務靜態；**權威檔來自 Runtime**（經通道提供 snapshot，非殼直讀 OPFS 權威） |
| 編輯器／Files UI | 展示與編輯；load／save 走 Runtime API；**可快取，不可當權威** |
| 殼面終端指令 | `reloadCanvas`、DOM／console 觀察、開分頁 UI（見 §6） |
| 密鑰 UI | unlock／lock dialog（DEC-029）；材料如何交 Runtime 見 §6.3 |

### 5.2 Backend Runtime

| 職責 | 說明 |
| --- | --- |
| ESM 載入 | `functions.js`／`controller.js` 及相對依賴 |
| `SamInstance` | start／stop／pause／resume；mailbox／alarm／`functionsFetch` |
| **儲存權威** | 沙盒 FS、KV、DB、mailbox Durable（MVP 可用 Worker 內 OPFS 實作） |
| Bindings | §6：Runtime 本地面；殼面為終端 stub |
| 背壓 | 忙碌時對殼回 busy；殼不得自旋堵 UI |

### 5.3 畫布路徑（目標）

```text
畫布 fetch("/api/…")
  → （SW／殼）BackendHost
  → Runtime.functionsFetch(sandboxId, Request)
  → 序列化 Response → 畫布
```

Session Host 轉發、Leader relay：**同一** `functionsFetch`，不得另開殼層／iframe 執行器。

---

## 6. Bindings：拆開 HOST／Delegate＋殼面可終端

### 6.1 原則

1. **儲存親和 Runtime**——FS／KV／DB 在 Runtime 建立與存取。殼層**不得**假設瀏覽器 OPFS 為權威。
2. **禁止**把殼層活 `HostBridge` 物件參考傳入 Runtime。
3. SAM 作者：`env.HOST`／`env.DELEGATE` **表面契約不變**；實作為「Runtime 本地面＋殼面終端 stub」。
4. **殼面可終端（反矛盾迴路）：** Runtime→殼 的指令在執行期間，殼**不得**再向 Runtime 發送「為完成該指令所必需」的權威 FS／KV／DB／`functionsFetch` 請求。需要檔案內容時，應已在指令 payload（或殼僅操作已在 UI 的緩衝；寫回權威須另開**殼發起**的存檔，不得嵌在終端指令內隱式完成）。
5. **後端互操作不經殼：** 跨 SAM／session 的 functions 呼叫在 Runtime 內完成。
6. **殼→Runtime**（使用者編輯存檔、畫布 `/api`、Files 重整）是正常方向，**不是**矛盾迴路。

### 6.2 分類總表

| Binding／能力 | 位置 | 說明 |
| --- | --- | --- |
| `env.KV`／`env.DB` | **Runtime 本地** | 儲存親和 Runtime |
| 沙盒 FS（HOST／Delegate 的 read／write／list…） | **Runtime 本地** | 同上 |
| HOST 專案／工作集等純資料操作 | **Runtime 本地** | 不碰 DOM |
| `env.vars` | **Runtime 本地** | 純資料 |
| Delegate grant＋授權路徑 FS | **Runtime 本地** | |
| `env.secrets.*` | **條件** | 見 §6.3 |
| `env.COMPUTE`／`runPython`／`runCmd` | **預設 Runtime 側**（目標） | 需沙盒 FS 的 compute **不應**默認丟殼再回讀權威儲存。MVP 若暫留殼持有 runner，必須在指令內帶**工作集快照**或等價，結果經明確殼→Runtime 寫回——**禁止**隱式二跳。長期：runner 親和 Runtime。 |
| `env.SESSION` | **混合** | 狀態在 Runtime；跨 tab 事件可經殼轉發通道 |
| HOST：`reloadCanvas`、DOM／console／network 觀察 | **殼面終端** | 純 UI／觀測；不讀權威 FS |
| HOST：`openFile`／開編輯器 | **殼面終端** | 指令須含足夠內容或「僅聚焦已開緩衝」；**禁止**殼為完成指令再向 Runtime 拉檔 |
| HOST：開 Tool／main tab UI | **殼面終端** | 純殼 UI；grant／檔案權威仍在 Runtime |
| 畫布／Console／DOM | **殼層** | 不進 Runtime 當權威 |

落地維護 `local`｜`shell` 清單（PLAN／host-api）。

### 6.3 密鑰（SecretStore）

- Unlock／password／WebAuthn **僅殼層 UI**（DEC-029）。
- **A（對齊跨主機／他機 Runtime）：** unlock 後將可用材料交 Runtime 記憶體；`env.secrets.*.get()` **只讀 Runtime 快取**（不每 get RPC）；lock／刷新／shutdown＝Runtime 清密文。
- **B（否決為預設）：** 每次 `get()` 殼回傳——僅過渡期可接受；本計劃採 A。
- **禁止**密鑰進 `.sam`；**禁止**日誌印 plaintext。

### 6.4 殼面通道契約（概念）

- async、可結構化複製（method、args、result、error）。
- **禁止**傳活函數／DOM Node。
- Runtime 內殼面方法為 stub → `host.invoke`；`readFile` 等**不**走此通道。

### 6.5 與準入／委派正交

DEC-036／037 語意不變。Delegate FS 在 Runtime 強制 grant；「打開 Tool 畫布」為殼面終端 UI。

---

## 7. 通訊面（概念 API）

精確訊息型別於實作時定稿；本節約束能力。

### 7.1 殼 → Runtime（殼發起）

```text
runtime.bootstrap({ leaderEpoch })
runtime.shutdown()
runtime.attachAgent({ sandboxId, … })
runtime.detachAgent({ sandboxId })
runtime.readFile / writeFile / listDir / …   // 編輯器／Files：權威在 Runtime
runtime.functionsFetch({ sandboxId, request })
runtime.pauseAgent / resumeAgent
// mailbox：Runtime 直讀 Durable（權威在 Runtime）
```

### 7.2 Runtime → 殼（僅殼面終端）

```text
host.invoke({ sandboxId, method, args }) → result   // 僅 §6.2 殼面；可終端
ui.notify?（可選；勿當權威）
```

權威 FS／KV／DB／HOST 檔案方法：**不**出現在此通道。`openFile` 的 args 應含內容或明確「只聚焦緩衝」。

### 7.3 錯誤與逾時

- Runtime 未就緒／非 Leader：對齊既有 `functions_no_leader`／503 語意。
- 殼面逾時：機器可讀錯誤碼；不得掛死 drain；**不得**以「再打 Runtime 拉檔」當重試策略來完成終端指令。

---

## 8. 執行模型細節

1. **Runtime 內多 `SamInstance`：** 每實例 mailbox **單線程**。MVP：Worker 內全域一條 `AgentRuntime` drain；殼僅推送 `drainGate`／`kickDrain`。
2. **檔案更新：** 殼經通道 `fsOp`／`writeFile`（等）→ Runtime 寫入儲存權威 → 必要時重載該沙盒 ESM。**禁止**「殼直寫瀏覽器 OPFS 再 notify」作為權威路徑（Leader＋Runtime 活著時）。
3. **循環 ESM：** 不得以恢復 iframe 解決。
4. **可觀測：** `capabilities()` 可暴露 `backendRuntime`；艦隊 UX 可選佇列深度。
5. **Console：** 後端 `console.*` 經通道鏡像到殼／Console 面板。

---

## 9. 與既有決策的關係

| 決策／規格 | 關係 |
| --- | --- |
| DEC-016 畫布／OPFS | **修訂：** 沙盒權威儲存親和 Backend Runtime；殼不假設瀏覽器 OPFS。MVP 仍可用 OPFS **實作於 Runtime 內**。畫布 `/api` 載體改 Runtime；**廢** hidden iframe。 |
| DEC-024 三層／headless | 不變；瀏覽器部署改 Runtime Worker；撤回 iframe 暫留敘事。 |
| DEC-031 Agent Model | 不變；預設後端即 Runtime（離開 UI 主線程）。跨主機叢集對齊 `homePeer`；WebRTC 細節另規。 |
| DEC-017／022／037 HOST／Delegate | 表面不變；儲存本地面在 Runtime；殼面終端且可終端。 |
| DEC-029／035 | secrets／vars；材料交 Runtime 偏 A（§6.3）。 |
| DEC-023 SESSION | Host functions 在 Runtime；通道事件可經殼轉發。 |

---

## 10. 遷移與相容

| 規則 | 說明 |
| --- | --- |
| **無**永久 iframe 相容路徑 | 刪除 `playgrounds-functions-host`。 |
| 殼層 OPFS | 遷移期可暫存快取；完成定義要求權威路徑不依賴殼直打「殼所在瀏覽器」OPFS。 |
| 通道／同文件 | MVP 可用 `postMessage`；**不得**把「Runtime 必與殼同 `Window`／同 OPFS 根」寫進殼長期契約（§1.4）。 |
| SAM 作者契約 | `export default { fetch }`／Controller 不變；HOST 仍 async；不得假設同步 DOM。 |
| 過渡期 | PLAN 可允許短暫雙軌；不得新增長期雙權威。 |
| 跨主機 | 本計劃不交付 WebRTC 叢集；契約完成後換通道實作即可接上（細節另立規格）。 |

---

## 11. 驗收場景（規格層）

1. 畫布 `/api`：handler 在 Runtime；無 `playgrounds-functions-host`。
2. Controller drain 不阻塞編輯器輸入（合理負載）。
3. Follower `/api` → Leader → Runtime；Follower 無 Runtime。
4. Leader 關閉：Runtime 終止；重選後繼續。
5. `env.HOST.readFile` 在 Runtime 完成。`openFile` 殼面指令**不**再向 Runtime 拉檔即可完成（內容已在 payload 或僅聚焦緩衝）。
6. 殼層 Files／編輯器存檔走 Runtime API；測試／靜態分析：**殼權威路徑不呼叫** `navigator.storage.getDirectory` 作為沙盒根（快取另議）。
7. Node fixture：functions∥controller 仍可跑。
8. 無「Runtime→殼→Runtime 權威儲存」完成單一邏輯操作的整合測案例通過。

---

## 12. 開放點（實作前須在 PLAN／ADR 補定）

1. MVP 下畫布 SW snapshot 如何從 Runtime 取得（通道推送 vs 拉取），仍不讓殼當 OPFS 權威。
2. ~~Secrets：§6.3-A vs B~~ → **採 A**（見 PLAN）。
3. ~~drain~~ → Worker 內 `AgentRuntime`；殼選舉＋gate。
4. ~~HOST／Delegate `local`｜`shell`；`openFile` payload~~ → 已定（見 PLAN／host-api）。
5. Compute 暫留殼 runner 時的工作集快照協定（若需要）。
6. 艦隊／capabilities 是否暴露 Runtime 指標。
7. WebRTC 叢集另規時：signaling、homePeer 選主、通道與 DEC-031 對齊（本計劃不定案）。

---

## 13. 文件維護

- 契約變更：更新本檔、**DEC-038**、GLOSSARY、[PG-BACKEND-RUNTIME-PLAN.md](./PG-BACKEND-RUNTIME-PLAN.md)、必要時 DEC-016／024／host-api。
- 落地進度只改 PLAN 狀態欄，勿把 Phase 勾選塞進本規格正文。
