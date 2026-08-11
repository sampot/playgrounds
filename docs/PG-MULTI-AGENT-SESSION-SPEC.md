# Playgrounds 多 Agent Session — 功能需求規格

本檔定義「多個 Agent 即時參與同一個 session、由當前工作沙盒強制規則」的**功能需求**。權威架構決策見 **DEC-023**；與既有邊界見 **DEC-016**／**017**／**018**／**022**／**031**。實作階段計劃另開，不以本檔代替 Phase 表。

一句話：**Session 是遊樂場介面提供的抽象多方協同框架（座位／role／事件／投影）；具體怎麼合作由 Host 宣告的 session protocol 決定。能講相容協定的 Agent SAM 可在同一 Playgrounds 頁面入座；權威在當前工作沙盒（Host SAM）。**

**狀態：** MVP 已落地（2026-08-01；**不含**遠端使用者／跨 Playgrounds 連線）。ADR：**DEC-023** Accepted；階段見 [PG-MULTI-AGENT-SESSION-PLAN.md](./PG-MULTI-AGENT-SESSION-PLAN.md)。框架層修訂（2026-08-03）：釐清 protocol 應用、總管＝Host agent、**邀請／申請入座與 joinPolicy**；coding 編排見 [PG-CODING-ORCHESTRATION-PROTOCOL.md](./PG-CODING-ORCHESTRATION-PROTOCOL.md)／**DEC-033**。

---

## 1. 背景與動機

### 1.1 問題

今日遊樂場：

- 僅**一個**現行 Agent（產品角色：**總管**）取得完整 `env.HOST`（DEC-017）——適合「協助開發當前沙盒」等由使用者下指示的用途。
- Agent **用途不限 coding**（DEC-017），但缺少「多個 Agent 同時以參與者身分、在同一套沙盒規則下互動」的一等能力。
- 擴展工具（DEC-022）提供窄授權長互動，但是**單槽工具**，不是多參與者 session。

需要覆蓋的情境（皆為 **Host protocol 應用**，不是遊樂場內建產品）：

| 情境例 | 共享的是什麼 | 例 protocol id |
| --- | --- | --- |
| 對局／即時協作遊戲 | 局面、事件、勝負規則 | `boardgame.v1`（示意） |
| 產品腦力激盪 | 卡片、發言、投票、收斂規則 | `brainstorm.v1`（狗糧） |
| 多角色審查／演練 | 提案、註解、角色權限 | （Host 自定） |
| 多 Agent **模擬** | tick、觀測、互動規則 | （Host 自定；常非 LLM） |
| LLM 總管編排 coding 子任務 | 任務圖、指派、回報、彙整 | `coding-orchestration.v1`（DEC-033） |

遊戲／coding／模擬都只是 Host SAM＋protocol；**不是**本規格（通道層）的產品邊界。

### 1.2 設計意圖

1. **通道 ≠ 應用：** 遊樂場 Session 只提供抽象協同框架；**沒有具體 protocol 就不能執行有意義的協作**。領域狀態機、訊息形狀、完成條件留在 Host SAM。
2. **沙盒即規則：** 合法行動、誰可見什麼——由**當前工作沙盒（Host SAM）**強制，不是遊樂場內建某種「官方遊戲／會議／coding 產品」。
3. **即時參與：** 必須支援並行／事件驅動互動；**不得**把系統做成「只能回合制」。回合制可作為某一 Host protocol 的規則子集。
4. **多 Agent 背景執行：** 參與者 Agent 可同時活著、持續對 session 反應，不需輪流搶唯一 HOST 座位。
5. **協定相容即可入座：** 不要求參與 Agent 與 Host 為同一份沙盒內容。凡能遵守該 session **相容協定**並取得允許的 **role** 的 Agent SAM，皆可入座（無論經**邀請**或**申請**，見 §6.5）。
6. **入座路徑由 Host 決定：** 參與者**不一定**自行申請；Host 可在建立 session 時選定政策——邀請入座、開放申請、或二者並存（可加核准）。見 §6.5。
7. **單機／單頁範圍：** 所有參與者（人類與 Agent）都在**同一個** Playgrounds 實例內；**不含**跨裝置、跨使用者遠端連入。
8. **Agent ≠ 必用 LLM：** Session／Agent Model 服務通用 multi-agent system（含模擬）。LLM 僅為可選決策引擎；特定 protocol（如 coding 編排）可自行要求參與者為 LLM-based——那是**應用前提**，不是通道前提。

---

## 2. 目標與非目標

### 2.1 目標

- **G1** 使用者能以當前工作沙盒**建立、設定、暫停、結束**一個 multi-agent session，並可**以人類身分直接參與**（與 Agent 座位並列）。
- **G2** 可同時有**多個**本地參與 Agent（背景執行），各自以 role 連入同一 session，遵守 Host SAM 規則。
- **G3** 入座前驗證：**協定相容**（見 §5）＋**相容 role**；不符則拒絕入座。不要求與 Host 相同的沙盒內容指紋。驗證與路徑無關（邀請或申請皆須過閘）。
- **G4** Host 可在**建立 session 時**宣告入座政策（邀請／申請／並存／是否需核准）；遊樂場執行該政策，不預設「只能申請」。
- **G5** 互動模型以**事件／狀態同步**為主，支援即時；回合制僅為 Host 規則可選行為。
- **G6** 參與者預設**不**取得完整 `env.HOST`；編排／開發特權與 session 參與通道分離（對齊 TOOL ≠ HOST 精神）。
- **G7** 遊樂場提供**多人共用的通訊與狀態通道**（座位生命週期、協定／role 閘門、`env.SESSION`、事件推送、容量邊界）；**領域 UX／命名／場次管理／規則留在 Host SAM**。Starter 示範如何呼叫通道 API 即可，遊樂場介面**不**做成 session 產品 UI（不選「房間／局／聊天室」等場景名）。

### 2.2 非目標

- **遠端使用者或遠端 Agent 參與**（另一瀏覽器／裝置／Playgrounds 實例連入同一 session；含 WebRTC、信令、邀請連線等）。
- 本站帳號系統、雲端專案同步、多租戶硬隔離（維持 DEC-001／016／017 精神）。
- 給每個參與 Agent 完整 HOST（`deleteProject`、任意 `setActiveAgent` 等）。
- 遊樂場內建固定遊戲／會議應用目錄（特定體驗＝Host SAM）。
- 遊樂場產品化 session 控制面（開房大廳、場景命名、場次列表）；這些由 Host／starter 自管。
- 強制參與 Agent 與 Host 為同一 SAM 內容（內容指紋／整包等同）；相容協定即可。
- 取代現行「單一總管（現行 Agent + HOST）」；二者並存，職責不同。
- 讀者可見文章預告未完成階段。

---

## 3. 用語（本規格）

正式對照亦應進入 [GLOSSARY.md](./GLOSSARY.md)。

| 用語 | 意思 |
| --- | --- |
| **Host SAM／主持沙盒** | 開啟 session 的那份工作沙盒；擁有規則與權威狀態。 |
| **Session** | 由 Host SAM 強制的一場多方互動；有生命週期與參與者集合。 |
| **Seat／座位** | session 內一個參與槽；綁定 role、人類或 Agent。 |
| **Role／角色** | Host 宣告的 **session 權限類**（如 `participant`、`human`、`spectator`）：決定在此 session 內允許的操作集合。**不是** Agent 人格／隊名標籤；人格與策略留在各 Participant SAM（可 clone 同一範本成多實例）。 |
| **Participant Agent** | 以座位連入 session 的 Agent SAM 實例；走窄 session 通道，非完整 HOST。決策可以是規則／腳本／啟發式／LLM 等——**不規定**必須使用 LLM；**不要求**與 Host 同一沙盒內容。多座位＝多專案實例（clone），通常共用同一權限 role。入座可經 **邀請**或**申請**（§6.5）。 |
| **Invite／邀請入座** | Host（控制面）指定既有或新建 Agent 沙盒＋role，將其納入座位；參與者**不必**先發起申請。 |
| **Apply／申請入座** | 參與者（或代其呼叫的一方）提出 `protocolId`／`apiVersion`／role，請求入座；是否開放、是否需核准由 Host 開場政策決定。 |
| **Join policy／入座政策** | Host 在**建立 session 時**宣告的允許入座路徑（邀請／申請／並存、核准與否）。 |
| **Session protocol** | Host 宣告的**領域協同契約**（`protocolId`／`apiVersion`／roles／capabilities／事件與 `act` 形狀等）。通道層只做相容閘門；語意由 Host 強制。入座前提見 §5；宣告形狀見 §5.3。 |
| **總管（Steward）** | 可選的現行 Agent（`env.HOST`）；使用者唯一對口。預設**不**以 Participant 入座。若總管要**參與**某場 session，身分必須是 **Host agent**（主持沙盒＝總管席），見 §4.3。 |
| **Host agent** | 以 Agent 形態執行、並擔任該 session **Host SAM** 的實例。當總管參與編排類 protocol 時，總管席＝Host agent。 |

---

## 4. 角色與信任模型

```text
┌─────────────────────────────────────────┐
│  同一 Playgrounds 頁面（使用者 U0）       │
│  工作沙盒 = Host SAM（規則＋權威狀態）    │
│                                         │
│  • 人類座位（U0 可直接參與）             │
│  • Participant Agent × N（背景）         │
│  • 可選：總管                              │
│      - 場外：HOST 開發／運維 Host／工人   │
│      - 場內參與：必須＝Host agent         │
└─────────────────────────────────────────┘
```

### 4.0 分層（通道／應用／執行）

```text
遊樂場 Session 通道（本規格）     — 座位、role 閘門、事件、投影、容量
        │
        ▼
Host session protocol（應用）  — 領域狀態機、act／事件語意、完成條件
        │
        ▼
Agent Model（DEC-031）         — mailbox／spawn／單權威（可扇入 session 事件）
```

- **通道**不解釋「任務」「棋步」「投票」；只保證相容入座與投遞。
- **Protocol** 讓協同可執行；不同 protocol 可並存於生態，遊樂場不內建目錄。
- **Agent Model** 是通用 MAS／模擬 runtime；**不是** coding agent 專用棧。

### 4.1 使用者（Host user）

- 控制 session：建立（含入座政策）、邀請入座、核准／拒絕申請、踢出、暫停、結束、調整 Host 側設定（在 SAM／遊樂場允許範圍內）。
- 可開啟人類座位，**直接參與**（操作畫布 UI 或經 Host 定義的人類行動 API）。
- 可掛載多個本地 Participant Agent（背景）——常見路徑是 Host **邀請／spawn**，不必等對方申請。
- 瀏覽器持有 Host 沙盒 OPFS 權威；參與者僅見 Host 允許的狀態投影。

### 4.2 Participant Agent

- 與 Host 同頁、同遊樂場管理下執行。
- 注入窄 binding（**`env.SESSION`**，見 §7）；可訂閱事件、送出行動、讀取 role 允許的狀態投影。
- 如何決定下一步（規則引擎、腳本、啟發式、可選的 LLM 等）留在該 Agent 沙盒內；可同時運行。
- **通道層不規定**使用 LLM；若該 Agent 選擇呼叫外部／本機 LLM，金鑰仍 BYOK、本站不代打（對齊 DEC-017）。特定 protocol 可另定應用前提（例如要求 LLM-based worker）。
- 入座不必由該 Agent「主動申請」：可被 Host 邀請後再注入 SESSION（仍須協定／role 相容）。

### 4.3 總管與 Host agent

- 仍遵守 DEC-017：僅一個現行 Agent（總管）持 `env.HOST`。
- **場外（預設）：** 總管協助開發／除錯 Host 或 Participant、spawn 工人、開關通道；**不是** session 的 Participant 座位。
- **場內參與規則：** 總管若要參與某場 session，**必須以 Host agent 身分**——即該場的 Host SAM（工作沙盒）就是（或被設為）總管席。總管**不得**再以 `env.SESSION` 入一個普通 Participant 座位「雙掛」；不得 SESSION→HOST 默默升級。
- **語意：** 場外＝遊樂場運維對口；場內＝領域規則與權威狀態的擁有者（編排、裁判、任務彙整等由 protocol 定義）。
- 分離仍合法：Host SAM 可以是非總管的領域沙盒（例如純遊戲／純模擬），總管只在場外改檔。

---

## 5. 協定相容前提

### 5.1 需求

- **FR-PROTO-1** 入座前（無論邀請或申請），必須驗證該座位對應的 **session 協定**與 Host session **相容**（至少含協定識別／`apiVersion`；可含必要 `capabilities`）。不相容→機器可讀拒絕。邀請路徑下，相容宣告可由 Host 代填（已知該 SAM 支援的協定）或由被邀方在啟動時確認。
- **FR-PROTO-2** **不**以沙盒內容指紋或「是否同一份 SAM 原始碼」作為入座硬條件。不同 Agent SAM（不同策略、UI、是否用 LLM）只要協定相容即可佔同一類座位。
- **FR-PROTO-3** Host SAM 必須宣告此 session 允許的 **role 集合**與（可選）每 role 人數上限。
- **FR-PROTO-4** 每個座位必須綁定允許集合內的 role；不在集合或已滿則拒絕（申請路徑由申請方提出 role；邀請路徑由 Host 指定 role）。
- **FR-PROTO-5** Host 可選擇性宣告領域協定 id（例如 `brainstorm.v1`、`boardgame.v1`）；參與者須支援該 id（或 Host 接受的相容集合）。此為協定層，不是整包 SAM 等同。

### 5.2 角色與實作分派

- 遊樂場／session 層只強制：**協定相容 + role（權限類）+ 通道**；不解釋領域規則、不比較沙盒檔案樹。
- **Role ≠ 人格：** 多數協定只需少數權限類（常是單一 `participant`／`player`／`worker`＋可選 `human`）。Agent 要以什麼風格／策略參與，由該 SAM 自己決定；需要多個並行 Agent 時，**clone 同一參與者範本**再分別入座即可。
- Host 仍可依 role 在應用層拒絕非法 `act`（執行期權限）；入座不要求「每個角色一份不同範本」。
- 若協定真的需要多種權限類（如 `moderator` vs `player`），仍用 role 區分**能做什麼**，不是區分 `agent-a`／`agent-b` 這類實例標籤。

### 5.3 Protocol 宣告形狀（通道契約）

開 session 時，Host（或遊樂場代讀 Host meta）必須提供機器可讀宣告，至少：

| 欄位 | 必填 | 說明 |
| --- | --- | --- |
| `protocolId` | 是 | 領域協定 id（建議 `name.vN`，如 `brainstorm.v1`） |
| `apiVersion` | 是 | 該協定的相容版本字串（與 HOST `apiVersion` 無關） |
| `roles` | 是 | 允許的權限類字串列表 |
| `roleLimits` | 否 | 每 role 最大座位數 |
| `capabilities` | 否 | 可選能力旗標（字串）；入座方可宣告自己支援的子集 |
| `joinPolicy` | 否 | 入座政策（§6.5）；省略時實作須有文件化預設（建議：`invite_or_apply`） |

- **FR-PROTO-6** 遊樂場入座比對至少：`protocolId` 相等且 `apiVersion` 相容（MVP：字串全等；未來若需範圍相容另訂）。
- **FR-PROTO-7** `act` payload／事件 body 的**領域 schema**由 Host protocol 規格定義；遊樂場可運送不透明 JSON，**不**在通道層驗證領域欄位（非法由 Host 回 `act_rejected`）。
- **FR-PROTO-8** 具體 protocol 文件（如 DEC-033）屬應用規格；變更不得要求遊樂場認識新的場景名或內建該 UX。
- **FR-PROTO-9** `joinPolicy`（若提供）在 `open` 時固定；進行中變更屬開放問題（§12）；遊樂場不得忽略政策而接受未允許路徑的入座。

建議錯誤碼見附錄 A（含 `protocol_mismatch`、`join_forbidden`）。

---

## 6. Session 行為需求

### 6.1 生命週期

| 狀態 | 說明 |
| --- | --- |
| `idle` | 無進行中 session |
| `open` | 可入座；狀態可更新 |
| `paused` | 暫停；參與者不可推進權威狀態（或僅可讀，由 Host 定） |
| `closed` | 結束；釋放座位 |

- **FR-LIFE-1** 使用者可自工作沙盒脈絡建立 session（`idle`→`open`）。
- **FR-LIFE-2** 可 `pause`／`resume`／`close`；`close` 後所有座位卸權。
- **FR-LIFE-3** 切換工作沙盒（`openProject`／變更 `activeId`）時：**結束**當前 session（對齊 tool session 切專案即 close 的保守策略），除非未來 ADR 明示可遷移（本需求預設不可）。
- **FR-LIFE-4** 頁面重整後：是否恢復 open session 與本地座位由政策定；預設宜保守（例如需使用者確認再恢復背景 Agent 自動迴圈），避免靜默重啟高成本行為（若該 Agent 有呼叫 LLM／付費 API）。

### 6.2 即時性（非僅回合制）

- **FR-RT-1** Session 通道必須以 **BroadcastChannel（或同等推送）** 傳遞事件，讓多座位在重疊時段送出行動／收到更新，無需全局「鎖成單一線程回合」才能運作；**禁止**長輪詢當主路徑。
- **FR-RT-2** Host SAM **可以**實作回合制規則（拒絕非當前玩家行動）；此為應用層規則，**不是**遊樂場唯一調度模式。
- **FR-RT-3** 遊樂場／runtime 不得假設「同時只有一個 Participant 的 act 會成功」；併發衝突由 Host 以版本／拒絕碼解決（可沿用 `expectedHash` 或 session 版本號概念）。
- **FR-RT-4** 多 Agent 必須能**背景**持續運行（訂閱事件→決定→act），不必使用者為每個 Agent 手動「按下一回合」。決定步驟不限 LLM。

### 6.3 權威狀態

- **FR-AUTH-1** Session 權威狀態由 Host SAM（及其 Durable 狀態／記憶體，依 SAM 實作）持有。
- **FR-AUTH-2** 所有改變權威狀態的行動必須經 Host 驗證；非法→機器可讀錯誤，狀態不變。
- **FR-AUTH-3** 參與者看到的是 Host 允許的**投影**（可依 role 不同）；不得默認暴露完整 OPFS／Secrets／HOST。

### 6.4 使用者直接參與

- **FR-HUM-1** 使用者可佔據人類座位（role 可為 `human` 或 Host 宣告的人類角色）。
- **FR-HUM-2** 人類行動與 Agent 行動走同一規則引擎（差別僅在輸入來自 UI 或 Agent binding）。

### 6.5 入座路徑與政策（邀請／申請）

參與者進入 session **不限**「Agent 自己申請」。通道支援兩條路徑；**何者開放由 Host 在建立 session 時決定**（寫入 `joinPolicy` 或同等開場宣告）。

```text
                    ┌─ invite ──► Host 指定 sandboxId＋role ──► 座位 active
入座 ──► 政策閘門 ──┤
                    └─ apply ───► 申請 protocol／role（可選核准）──► 座位 active
```

| 路徑 | 發起方 | 典型 API（名稱示意） | 說明 |
| --- | --- | --- | --- |
| **邀請（invite）** | Host／控制面 | `spawn-participant`、Host 發起的 `joinSeat(sandboxId, role, …)` | Host 選定（或 clone）Agent 沙盒並納入座位；被邀方**不必**先送申請。適合編排／模擬開場一次拉齊工人。 |
| **申請（apply）** | 參與者側（或代呼叫） | 參與者（經允許通道）或外部呼叫 `joinSeat` 且非 Host 邀請語意 | 提出協定＋role；若政策要求核准，須 Host 同意後才 active。 |

**建議 `joinPolicy` 值（通道契約；字串可調，語意固定）：**

| 值 | 含義 |
| --- | --- |
| `invite_only` | 僅邀請；拒絕未受邀的申請 |
| `apply` | 開放申請；入座即生效（仍過協定／role／容量閘） |
| `apply_with_approval` | 申請後待 Host 核准 |
| `invite_or_apply` | 邀請與申請皆可（申請是否需核准由 Host 另旗標或併入此值的文件化變體） |

- **FR-JOIN-1** Host 建立 session（`idle`→`open`）時必須能選定入座政策；政策屬該場 session 的通道設定（可與 protocol 宣告一併提供）。
- **FR-JOIN-2** **邀請**與**申請**在座位 active 之後語意相同（同一 `env.SESSION`、同一規則引擎）；差別只在誰發起、是否需核准。
- **FR-JOIN-3** 邀請路徑仍須滿足 §5 相容與 role／容量；不得因「Host 邀請」而跳過協定閘或發給 HOST。
- **FR-JOIN-4** 若政策為 `invite_only`，未經邀請的 `join`／apply → 機器可讀拒絕（建議 `join_forbidden`）。
- **FR-JOIN-5** 遊樂場提供邀請所需的控制面能力（指定 sandbox／role 入座、可選 spawn＋入座）；產品上「邀請誰、邀幾個」由 Host agent／Host SAM 決定，遊樂場不做場景化邀請 UI。
- **FR-JOIN-6** 人類座位可同樣走邀請（Host 開啟人類座）或使用者自取（若政策允許）；細節由 Host 定，通道不強制唯一 UX。

---

## 7. 參與通道（功能表面）

名稱暫定；定案時以 ADR + `capabilities()` 為準。

### 7.1 窄 binding：`env.SESSION`（Participant）

參與中的 Agent 應能：

| 能力 | 需求 |
| --- | --- |
| 探測 | `apiVersion`／`capabilities` |
| 身分 | `getSeat()` → sessionId、role、participantId |
| 讀投影 | `getState()`（入座快照；seq 缺口時一次性補齊） |
| 即時 | `getEventChannel()` → BroadcastChannel 名稱；頁面 `onmessage` 推送（**主路徑**） |
| 行動 | `act(payload)` → 經 Host 驗證；成功後遊樂場廣播事件 |
| 離開 | `leave()` |

- **FR-BIND-1** `env.SESSION` **≠** `env.HOST`；不得暴露專案刪除、任意 FS、Secrets 值等。
- **FR-BIND-2** 僅在座位 active 且 session `open`（或 Host 允許的 paused 讀取）時注入／可用。
- **FR-BIND-3** 錯誤碼機器可讀（建議風格對齊 `HostBridgeError.code`）。
- **FR-BIND-4** **不**以 `waitEvent` 長輪詢／定時 GET events 當即時主路徑（MVP 不實作 polling fallback）。頻道：`playgrounds-session:<sessionId>`。

### 7.2 通道控制面（遊樂場 API；產品 UX 在 Host）

遊樂場暴露**中性通道 API**（給 Host 畫布與／或總管），不規定人話名稱：

| 能力 | 需求 |
| --- | --- |
| 建立／結束通道 | 讀取 Host 協定宣告、允許 roles、可選人數上限、**入座政策** |
| 邀請入座 | Host 指定 `sandboxId`＋role（可先 spawn／clone）直接納入座位 |
| 列出座位 | role、狀態（active／paused／pending_approval 等） |
| 受理申請 | 若政策允許 apply；可選 pending |
| 核准／拒絕入座 | 若採 `apply_with_approval` 或同等 |
| 踢出座位 | 立即撤權 |
| 人類 act | 與 Agent 同協議（經 Host 規則） |
| 觀測 | 可選：狀態列座位數等機制訊號；領域事件摘要由 Host 決定 |

- **FR-HOST-1** 通道機制權威在遊樂場；領域狀態與產品控制面在 Host。Participant 不得呼叫通道控制面（除非 Host 顯式代理且仍經規則）。
- **FR-HOST-2** 總管經 HOST 子集（`openSession`／`listSeats`／`joinSeat`／邀請或 `spawn-participant` 等）與／或 Host 畫布經 **`/api/shell/session/*`**（僅工作沙盒）管理通道；須可探測且預設保守。
- **FR-HOST-3** 場景命名（房間／局／討論…）、場次列表、開場引導、**邀誰入座**由 **Host SAM／Host agent**（starter 示範）負責；遊樂場 UI 不內建對等產品面。
- **FR-HOST-4** `joinSeat` 語意須能區分（或由呼叫脈絡區分）Host **邀請**與參與者**申請**，以便執行 `joinPolicy`；實作可用分開方法（如 `inviteSeat` vs `joinSeat`）或選項旗標。

### 7.3 與現行 Agent／Tool 的關係

| 機制 | 關係 |
| --- | --- |
| `env.HOST` | 編排／開發；單一座位特權；不因本規格變多份 |
| `env.TOOL` | 單槽長互動工具；**不是** multi-agent session |
| `env.SESSION` | 多方即時參與；可多座位並行 |

---

## 8. 多 Agent 背景執行

- **FR-BG-1** 遊樂場（或同等 runtime）支援**同時**運行 ≥2 個 Participant Agent 實例（iframe 或經核准的 Worker 模型；實作另定）。
- **FR-BG-2** 背景 Agent 在 session `open` 期間可持续收到事件並 `act`，無需佔用唯一 Agent 區「現行 Agent」槽。
- **FR-BG-3** 使用者可對單一座位：暫停自動迴圈、取消進行中請求、查看該座位 log／狀態。
- **FR-BG-4** 資源上限須可配置或有預設硬上限（最大座位數、事件速率），超限機器可讀拒絕。
- **FR-BG-5** 若 Participant Agent 使用 LLM：金鑰 BYOK、留在該 Agent 側；本站不代打。不使用 LLM 的 Agent 不受此條拘束。

---

## 9. 功能需求總表（追溯用）

| ID | 摘要 |
| --- | --- |
| FR-PROTO-1…9 | 協定相容、role、宣告形狀（含 joinPolicy）；領域 schema 在 Host |
| FR-LIFE-1…4 | session 生命週期與切專案／重整政策 |
| FR-RT-1…4 | 即時事件模型；回合制僅應用層可選 |
| FR-AUTH-1…3 | Host 權威狀態與投影 |
| FR-HUM-1…2 | 使用者可直接參與 |
| FR-JOIN-1…6 | 邀請／申請入座路徑；政策由 Host 開場決定 |
| FR-BIND-1…4 | `env.SESSION` 窄通道 |
| FR-HOST-1…4 | 通道 API（含邀請）；產品 UX 在 Host |
| FR-BG-1…5 | 多 Agent 背景執行 |

---

## 10. 驗收情境（Acceptance scenarios）

### S1 — 即時雙 Agent＋人類（可為不同 Agent SAM）

1. 使用者以 Host SAM 開 session，允許 roles：`human`、`participant`（權限類；可有人數上限）；入座政策含邀請。  
2. Host **邀請**（clone／spawn＋入座）兩位 `participant`；使用者入 `human`（不必由 Agent 先申請）。  
3. 三方在重疊時段送出行動；Host 依規則／role 權限接受／拒絕；畫布／狀態投影即時更新。  
4. **非**依賴「全球鎖成 A→B→人類」才能跑完（除非該 Host 自己寫成回合制）。

### S1b — 申請入座（政策允許時）

1. Host 開 session，`joinPolicy` 含 apply（或 `invite_or_apply`）。  
2. 協定相容的 Agent **自行申請** `participant` 並成功入座。  
3. 若改為 `invite_only`，同等申請 → `join_forbidden`（或同等碼）。

### S2 — 協定不符拒絕

1. 嘗試以不相容協定（錯誤 apiVersion／不支援的領域協定 id）的 Agent 入座（申請或邀請皆可）。  
2. 拒絕；無座位、無狀態寫入。  
3. 對照：另一個內容完全不同、但協定相容的 Agent 可以成功入座。

### S3 — 與總管並存（場外）

1. 仍可設置總管（現行 Agent + HOST）修改 Host SAM。  
2. 修改過程中 session 政策須定義清楚（例如自動 pause，或禁止熱改規則檔）。  
3. 總管**未**成為 Host agent 時，**不得**被解釋成場內參與者或第二個 HOST 座位。

### S3b — 總管以 Host agent 參與

1. 將總管席設為開啟 session 的工作沙盒（Host SAM＝總管）。  
2. 總管經 HOST／Host functions 編排；Participant 僅 `env.SESSION`。  
3. 總管**沒有**額外的 Participant 座位；場內權威在 Host。

### S4 — 腦力激盪型 Host（非遊戲、非 LLM）

1. Host SAM 規則為「自由發言＋標籤＋投票」，無回合鎖（`brainstorm.v1`）。  
2. 多 Agent 與人類連續 `act`（發言／投票）；狀態合併符合 Host 規則。  
3. 證明機制與「遊戲」脫鉤，且**不**要求 LLM。

### S5 — Protocol 應用可替換

1. 同一通道 API 可先跑 `brainstorm.v1`，結束後另開 `coding-orchestration.v1`（或模擬 protocol）。  
2. 遊樂場 UI **不**出現綁死單一場景的產品名；領域命名在各 Host。

---

## 11. 與既有決策的對齊

| 決策 | 本規格態度 |
| --- | --- |
| DEC-016 輕量 Web／OPFS／SAM | Session 體驗本身是 SAM；遊樂場加 runtime 能力；範圍維持本機頁面 |
| DEC-017 單 HOST、用途不限 coding | **維持**單 HOST；多方走 SESSION；總管場內參與＝Host agent，非 Participant |
| DEC-018 Durable KV 等 | Host 可用 KV／DB 存 session |
| DEC-022 TOOL | 不擴成多 Agent；SESSION 為新角色通道 |
| DEC-026 Scheme A | 單 HOST 分任務仍有效；多 LLM 子代理編排走 DEC-033 protocol，不塞進 hygiene |
| DEC-031 Agent Model | mailbox／spawn 為執行原語；session 事件宜扇入 Participant mailbox |
| 無本站 LLM proxy | 通道層 Agent **可不**用 LLM；若用則維持 BYOK |

**DEC-023** 已 Accepted：信任邊界、協定相容入座、role、本地多座位、BroadcastChannel 即時、排除遠端。  
**DEC-033** Accepted：`coding-orchestration.v1` 為 LLM 總管＋子代理 coding 編排的應用 protocol（非通道擴充）。

---

## 12. 開放問題（後續）

1. Host 熱更新協定或規則時，進行中 session 是 pause、拒絕，還是允許兼容版本協商。  
2. 事件速率／訊息大小更細的配額策略。  
3. Participant 長期執行面（多 `SamInstance` vs 過渡隱藏 iframe）收斂節奏——對齊 DEC-024／031。  
4. `apiVersion` 是否引入範圍相容（目前 MVP 字串全等）。  
5. `joinPolicy` 是否允許 session 進行中變更；邀請是否需要被邀方顯式 ack（MVP：Host 邀請即入座並注入 SESSION）。

---

## 13. 相關文件

| 文件 | 關係 |
| --- | --- |
| [DECISIONS.md](./DECISIONS.md) | DEC-023、DEC-033 |
| [PG-CODING-ORCHESTRATION-PROTOCOL.md](./PG-CODING-ORCHESTRATION-PROTOCOL.md) | LLM 總管 coding 編排 protocol |
| [PG-AGENT-MODEL-SPEC.md](./PG-AGENT-MODEL-SPEC.md) | mailbox／spawn；事件扇入 |
| [PG-AGENT-PLAN.md](./PG-AGENT-PLAN.md) | 單 Agent／HOST／Scheme A |
| [PG-TOOLS-PLAN.md](./PG-TOOLS-PLAN.md) | TOOL 單槽；對照非目標 |
| [playgrounds-host-api.md](./playgrounds-host-api.md) | HOST session 管理子集 |
| [GLOSSARY.md](./GLOSSARY.md) | 用語 |

---

## 附錄 A — 建議錯誤碼（需求方向）

實作時可調整命名；須穩定且機器可讀。

| code | 何時 |
| --- | --- |
| `session_inactive` | 無 open session |
| `session_paused` | 暫停中不可 act |
| `seat_full` | role 人數已滿 |
| `role_forbidden` | role 不允許 |
| `protocol_mismatch` | 協定／apiVersion／領域 id 不相容 |
| `join_forbidden` | 入座路徑不被當前 `joinPolicy` 允許（如 invite_only 下的申請） |
| `act_rejected` | Host 規則拒絕（可附 reason） |
| `version_conflict` | 併發衝突 |
| `capacity_exceeded` | 座位或速率上限 |
