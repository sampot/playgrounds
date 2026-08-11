# Playgrounds Agent 艦隊觀測 UX 實作計劃

本檔定義「百～千級 Agent／SAM 實例」下，遊樂場如何讓使用者**掌握運行狀態與實例關係**。權威決策見 [DECISIONS.md](./DECISIONS.md) **DEC-032**（Proposed）。執行模型不變式見 [PG-AGENT-MODEL-SPEC.md](./PG-AGENT-MODEL-SPEC.md)／**DEC-031**；沙盒工作集／總帳見 [PG-SANDBOX-INSTANCE-PLAN.md](./PG-SANDBOX-INSTANCE-PLAN.md)／**DEC-028**。

一句話：**關係優先於扁列表——L0 Fleet Pulse 找異常，L1 以血統／session／編排投影（含可選 3D 鄰域圖）理解結構，L2 Focus 鑽 mailbox／毒訊息；Picker 與沙盒總帳職責不變。**

**狀態：** Phase 0–5 已完成（2026-08-03）。

---

## 背景與動機

DEC-031 落地後，同瀏覽器可有大量 virtual actor（registry＋Durable mailbox＋spawn／session 分身）。DEC-028 已分開 **Picker（工作集）** 與 **管理面（實例總帳）**，但兩者偏「庫存／回收」，不足以回答：

- 誰在跑、誰休眠、誰堵佇列、誰有毒訊息？
- 實例之間如何關聯（血統、session、Supervisor 扇出、接班）？
- 千級時該看哪裡，而不是掃完一千列？

AGENT-MODEL-PLAN Phase 6 僅交付**輕量機制列**（Leader／epoch／深度／poison），並明示「非產品叢集 UI」。本計劃承接產品化觀測面。

---

## 目標與非目標

### 目標

- **G1** 三層視野：Fleet Pulse（L0）／Relation Views（L1）／Agent Focus（L2）。
- **G2** 關係投影：血統樹、session 群組、Supervisor 扇出；扁列表僅作搜尋／批次模式。
- **G3** 可互動 **3D 關係圖**（探索模式）：預設 **ego／篩選子圖**，禁止預設全場千節點力導向。
- **G4** 觀測投影 API：合併 registry＋mailbox 摘要＋沙盒 meta（血統／工作集）＋session 座位；差分訂閱。
- **G5** Attention 規則可測；與既有 GC／工作集操作銜接。
- **G6** 可選輕量 `agent.ui` 標註（角色標籤／群組／健康），遊樂場介面只渲染、不解釋業務。

### 非目標

- 雲端同步、跨 peer 即時拓樸、帳號專案庫。
- 遊樂場內建自動 failover／接班路由（仍屬 Supervisor／應用）。
- 取代 Picker 或沙盒總帳；不做深層沙盒資料夾 taxonomy。
- 預設全場 3D 儀表板、火焰圖、即時全量訊息 payload 鏡像。
- coding 子代理產品 UX（DEC-026 另議）；本計劃只觀測 runtime／關係。
- 改 DEC-031 投遞語意或 Leader 選舉。

---

## 設計原則

| # | 原則 | 含義 |
| --- | --- | --- |
| 1 | **關係優先於清單** | 預設進群／圖／session；扁列表＝搜尋結果 |
| 2 | **異常優先於普查** | 首屏 Needs attention，不是綠燈牆 |
| 3 | **焦點＋脈絡** | 選中 → 鄰居（父／子／session／近期通訊） |
| 4 | **介面宜薄** | 遊樂場介面＝runtime 可觀測＋拓樸投影；領域角色名可由 SAM 標註 |
| 5 | **三軸分開** | `inWorkingSet` ≠ `agentManaged` ≠ registry 運行態 |
| 6 | **GC 一等** | 觀測必須能導向退役；否則拓樸只會更吵 |
| 7 | **虛擬化＋聚合** | 百級可展開；千級摺疊／熱力／ego network |
| 8 | **休眠≠故障** | hibernated 是健康省資源，不進「壞掉」計數 |

---

## 資訊架構

```text
既有：Picker（工作集）｜管理沙盒（總帳／GC）
新增：Agent 艦隊（運行＋關係）
        ├─ L0 Fleet Pulse
        ├─ L1 Relation Views（2D 群組／樹｜搜尋列表｜3D 探索）
        └─ L2 Agent Focus（詳情抽屜）
```

**入口建議：** 「管理沙盒」對話升格為分 tab：**庫存**（既有 DEC-028）｜**運行**（本計劃）；或獨立「Agent 艦隊」面板。勿塞進 toolbar Picker。

**UI 名稱（zh-TW）：** **Agent 艦隊**（文件可稱 Fleet／艦隊觀測）。3D 模式標為 **關係圖（3D）**／探索模式。

---

## UX 摘要

### L0 — Fleet Pulse

5 秒內回答「要不要 intervening」。

| 區塊 | 內容 |
| --- | --- |
| 計數 | registered／running／hibernated／stopped |
| 壓力 | mailbox 深度合計、近滿數、poison 數 |
| 權威 | Leader？、`leaderEpoch`、外接螢幕（可併既有機制列） |
| Needs attention | 固定優先序見下節；點列 → L2 或帶篩選進 L1 |

### L1 — Relation Views

同一投影資料、多視角：

1. **血統樹** — `clonedFrom`／spawn；徽記 `cloneIntent`；休閒枝摺「+N hibernated」
2. **Session 群組** — 一卡一 session；座位、mailbox 摘要；關閉後「可 GC」
3. **Supervisor 扇出** — 中心＝標註／總管席；周圍工人；接班邊「succeeded by」
4. **搜尋列表** — 虛擬捲動；多選批次（工作集／刪除，權限同 DEC-028）
5. **3D 關係圖（探索）** — 見下節

**共同篩選：** 狀態、intent、inWorkingSet、agentManaged、poison、session、name／id 子字串。

### L2 — Agent Focus

| 區塊 | 內容 |
| --- | --- |
| 身分 | name、sandboxId／agentId、intent、clonedFrom、兩軸標記 |
| 生命週期 | registry 狀態、最近 pause／resume、inFlight？ |
| Mailbox | 深度、inFlight、最近 N 則 type（預設無全文）、poison＋重放／丟棄 |
| Alarm | 未到期數／下一火 |
| 關係 | 父、子（摺疊）、session 同伴、接班人 |
| 入口 | 開 UI／工作畫布、加入工作集、送 `system.command`、停／刪（既有權限） |

### 狀態語彙（對使用者）

| Runtime | UI | 語意 |
| --- | --- | --- |
| running | 運作中 | 正常 |
| hibernated | 休眠 | 中性／健康 |
| stopped | 已停 | 靜止 |
| poison／DLQ | 毒訊息 | 需處理 |
| 近滿佇列 | 壅塞 | 警告 |
| 非 Leader tab | 外接螢幕 | 資訊 |

### Attention 優先序（固定）

1. poison／反覆失敗  
2. `mailbox_full` 或深度 ≥ 警示閾（實作常數；建議 80% 容量）  
3. Supervisor／應用標記的 orphan、接班失敗（若有 `agent.ui.health`）  
4. session 結束後殘留 `session_seat`  
5. 長期 running 且佇列不降／無 ack 進展（卡死嫌疑；需心跳或 depth 時間序列最小實作）

---

## 3D 關係圖（探索模式）

### 定位

- **不是**預設 L1；與 2D 群組／樹共用同一圖資料。
- 回答「結構長什麼樣」；Attention／列表回答「現在該處理什麼」。

### 互動

| 操作 | 行為 |
| --- | --- |
| 旋轉／縮放／平移 | 觀看 |
| 點節點 | 選取 → L2；可緩動相機至鄰域 |
| Isolate／雙擊 | 只留 ego network（預設 ±1～2 跳） |
| Hover | name、狀態、深度、intent |
| 邊類型開關 | 血統／session／通訊（分層；預設血統＋session） |
| 多選 | 批次操作（同列表） |

### 視覺編碼（克制）

- 色＝生命週期／attention  
- 大小＝mailbox 深度或 running  
- 環／形＝intent 或 inWorkingSet  
- 避免預設粒子／強 glow（對齊站台設計克制）

### 規模紅線

| 可見節點 | 策略 |
| --- | --- |
| ≤ ~80 | 力導向可接受 |
| ~80–200 | LOD／聚合（遠處「+N hibernated」） |
| 300+ 全圖 | **禁止預設**；必須篩選或 ego |

`prefers-reduced-motion`：提供 2D 樹／群組後備，可停用自動布局動畫。

### 依賴取向（Phase 4 定案）

**已選：`3d-force-graph` + `three`**（薄包裝 `FleetGraph3D.svelte`）。

約束：動態 `import()`（僅開 3D 分頁時載入）；離開分頁／`onDestroy` 呼叫 `_destructor` 卸 WebGL；勿拖慢無艦隊面板的首屏。**DEC-005** 遊樂場維持 Svelte——不引入 React。

---

## 資料契約

### Fleet 投影（遊樂場介面組裝；權威仍在 Durable）

```ts
type FleetNodeStatus =
  | "registered"
  | "running"
  | "hibernated"
  | "stopped";

type FleetEdgeKind =
  | "lineage" // clonedFrom / spawn parent
  | "session" // same session seats
  | "successor" // HA 接班（應用或遊樂場推斷）
  | "traffic"; // 可選：近期 send 抽樣

interface FleetAgentNode {
  agentId: string;
  sandboxId: string;
  name: string;
  status: FleetNodeStatus;
  mailboxDepth: number;
  inFlight: boolean;
  poisonCount: number;
  alarmPendingCount?: number;
  inWorkingSet: boolean;
  agentManaged: boolean;
  clonedFrom?: string;
  cloneIntent?: string;
  sessionId?: string;
  /** Optional app hints (see agent.ui). */
  ui?: AgentUiAnnotation;
  updatedAt: number;
}

interface FleetEdge {
  from: string; // agentId
  to: string;
  kind: FleetEdgeKind;
  weight?: number; // traffic
}

interface FleetAttentionItem {
  agentId: string;
  reason:
    | "poison"
    | "mailbox_pressure"
    | "orphan"
    | "stale_session_seat"
    | "stuck"
    | "app_health";
  severity: "warn" | "error";
  detail?: string;
}

interface FleetSnapshot {
  leader: { isLeader: boolean; epoch: number };
  counts: Record<FleetNodeStatus, number>;
  pressure: {
    mailboxDepthTotal: number;
    nearFullCount: number;
    poisonTotal: number;
  };
  attention: FleetAttentionItem[];
  nodes: FleetAgentNode[];
  edges: FleetEdge[];
  generatedAt: number;
}
```

### 讀取 API（建議）

| 表面 | 行為 |
| --- | --- |
| 遊樂場內模組 `getFleetSnapshot(opts?)` | 合併 registry、mailbox 摘要、project meta、session 座位 |
| 可選 HOST／capabilities | 總管只讀觀測（如 `listFleetSummary`）——**勿**暴露他沙盒密文／完整訊息 body |
| 訂閱 | BroadcastChannel 或輪詢差分；Follower tab **只讀投影** |

`opts` 建議：`egoAgentId?`、`maxNodes?`（硬上限，建議預設 **200**）、`edgeKinds?`、`includeTraffic?`（預設 false）。

### Mailbox 摘要（效能）

- 列表／圖：只深度、poisonCount、inFlight、最近 type 計數。  
- L2：懶載入最近 N 則 header（id／from／to／type／sentAt／attempts）；payload 預設摺疊且截斷。  
- **禁止**每秒序列化全場訊息全文。

### `agent.ui`（Phase 5 定案）

**存放：** runtime OPFS／`playgrounds-agent-runtime/ui-annotations.json`（`AgentUiStore`）。**不是**沙盒 Code 樹、**不是**各沙盒 KV。

```ts
interface AgentUiAnnotation {
  roleLabel?: string; // 顯示用，非身分
  groupId?: string;
  health?: "ok" | "warn" | "error";
  healthDetail?: string;
  successorOf?: string; // 接班視覺
}
```

寫入：`HOST.setAgentUi`／總管工具 `set_agent_ui`。遊樂場介面**只渲染**；不驗證業務正確性。無標註時仍可依 meta／registry 工作。

**通訊熱邊：** `traffic.json` 對 `send` 入隊抽樣（無 payload）；艦隊 UI「通訊熱邊」或 `listFleetSummary({ includeTraffic: true })` 才投影為 `kind: "traffic"`。

---

## 與既有面的邊界

| 面 | 負責 | 不負責 |
| --- | --- | --- |
| Picker | 日常切工作沙盒 | 運行拓樸 |
| 管理沙盒（庫存） | 全量 Code／Data 盤點、工作集、GC | mailbox 細節、3D |
| Agent 艦隊 | 運行態、關係、attention、毒訊息操作 | 雲端庫、自動 HA |
| 機制列（Phase 6 既有） | Leader／epoch 一行訊號 | 產品艦隊 UI |
| Supervisor SAM | spawn、路由、領域 health | 遊樂場內建 failover |

---

## 階段

| 階段 | 主題 | 完成定義 | 狀態 |
| --- | --- | --- | --- |
| **0. 契約** | DEC-032、本計劃、GLOSSARY／AGENTS 指針 | 三層視野、非目標、與 DEC-028／031 邊界無歧義 | **已完成** |
| **1. 投影層** | `FleetSnapshot` 組裝；mailbox 深度／poison 摘要；Vitest attention／過濾／ego 裁剪 | 無 UI 可測；maxNodes 硬上限生效 | **已完成** |
| **2. L0＋L2＋搜尋列表** | Pulse、Needs attention、Focus 抽屜、虛擬化列表、與工作集／刪除銜接 | 手動：毒訊息與壅塞可定位並處理 | **已完成** |
| **3. L1 關係（2D）** | 血統樹、session 群組、Supervisor 扇出（無 3D） | 自迭代鏈／session 座位可掃；可跳 Focus | **已完成** |
| **4. 3D 探索** | 動態 import 圖庫；邊類型開關；Isolate ego；reduced-motion 後備；卸載 WebGL | ≤80 節點流暢；300+ 全圖非預設 | **已完成**（依賴：`3d-force-graph`＋`three`；動態 `import()`） |
| **5. 標註＋硬化** | `agent.ui`；可選 HOST 只讀摘要；通訊熱邊（opt-in）；文件／host-api | 狗糧可標 roleLabel；`npm test`／`check` 綠 | **已完成**（`ui-annotations.json`／`traffic.json`；HOST `listFleetSummary`／`getAgentUi`／`setAgentUi`；總管工具） |

Phase 0 完成定義：本計劃＋DEC-032＋指針合併後標 **已完成**。

---

## 程式路徑（預期）

| 路徑 | 用途 |
| --- | --- |
| `src/sam-runtime/mailboxStore.ts`／`registry.ts` | 深度／poison／list 摘要 API（若缺則補） |
| `src/components/playgrounds/fleet/`（新） | snapshot、attention、ego 裁剪純函式＋Vitest |
| `src/components/playgrounds/fleet/FleetPanel.svelte`（新） | L0／L1／L2 遊樂場 UI |
| `src/components/playgrounds/fleet/FleetGraph3D.svelte`（新） | Phase 4；動態 import |
| `src/components/playgrounds/PlaygroundsApp.svelte` | 入口（管理對話 tab 或獨立面板） |
| `src/components/playgrounds/sessionRuntime.ts` 等 | session→edge 投影 |
| `docs/playgrounds-host-api.md` | 若暴露 HOST 只讀摘要 |
| 本計劃／DEC-032／GLOSSARY | 契約 |

---

## 測試

| 層 | 覆蓋 |
| --- | --- |
| Vitest | attention 排序；ego ±k 跳；maxNodes 裁剪；邊 kind 過濾；hibernated 不計入「故障」彙總 |
| Vitest | snapshot 合併：registry∪meta∪mailbox 摘要形狀 |
| 手動 | 百級節點列表虛擬化；3D Isolate；關面板後 GPU／動畫停止；Follower tab 只讀 |
| 手動 | session 結束殘留 seat 出現在 attention；批次 GC 與庫存 tab 一致 |

---

## 建議實作順序

```text
0 契約
 → 1 投影（可與機制列資料重用）
 → 2 L0＋L2＋列表（最小可除錯）
 → 3 2D 關係（主路徑心智模型）
 → 4 3D 探索（增值）
 → 5 標註／HOST／熱邊
```

Phase 2 即可改善毒訊息與壅塞除錯；3D 不阻擋主價值。

---

## 與其他計劃

| 文件／決策 | 關係 |
| --- | --- |
| **DEC-031／AGENT-MODEL** | 觀測對象；不改投遞／Leader；產品化接續 Phase 6「非叢集 UI」 |
| **DEC-028／SANDBOX-INSTANCE** | 庫存 tab／GC／血統欄位；艦隊不取代 Picker |
| **DEC-023／SESSION** | session 邊與殘留 seat attention |
| **DEC-017／HOST** | 可選只讀摘要；勿第二 HOST；勿經觀測洩密 |
| **DEC-005** | Svelte 遊樂場介面；3D 薄包裝，不改島嶼框架 |
| **DEC-030** | 勿把艦隊做成左／右槽多 SAM dashboard |
| **AGENT-PLAN** | 總管可消費只讀摘要；領域 UX 仍可在 SAM |

---

## 風險與取捨

| 風險 | 緩解 |
| --- | --- |
| 全圖毛線球 | 預設 ego／篩選；maxNodes；3D 非預設 |
| 投影讀 OPFS 過重 | 摘要欄位、差分、懶載入 L2 payload |
| 3D 依賴體積 | 動態 import；面板外不載入 |
| 與庫存 UI 重複 | 分 tab：庫存 vs 運行；共用刪除／工作集動作 |
| 應用 health 亂標 | `agent.ui` 可選；遊樂場不信任為唯一 attention 來源 |
| Follower 誤寫 | 投影只讀；drain／ack 仍僅 Leader |

---

## 常數（建議預設；實作可調）

| 常數 | 預設 | 說明 |
| --- | --- | --- |
| `FLEET_MAX_NODES_DEFAULT` | **200** | snapshot 預設上限 |
| `FLEET_EGO_HOPS_DEFAULT` | **2** | Isolate 跳數 |
| `FLEET_MAILBOX_WARN_RATIO` | **0.8** | 相對容量（今日 1000）近滿 |
| `FLEET_ATTENTION_CAP` | **50** | Pulse 列表上限 |
| `FLEET_RECENT_MSG_HEADERS` | **20** | L2 預設 header 數 |
| `FLEET_3D_COMFORT_NODES` | **80** | 超過則提示篩選／聚合 |

---

## 產品句

> **Picker 是我要編的沙盒；庫存是場上有哪些實例；Agent 艦隊是它們怎麼連、誰卡住——用關係與異常導航，不是用一千列名單。**
