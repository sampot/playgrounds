# Playgrounds Agent Model — 規格（初版）

本檔定義「Agent 作為 SAM 的一種執行形態」之**執行模型、身分、mailbox、權威與分散式邊界**。權威架構決策見 **DEC-031**（Accepted）；與既有邊界見 **DEC-016**／**017**／**023**／**024**／**026**／**028**。實作階段見 [PG-AGENT-MODEL-PLAN.md](./PG-AGENT-MODEL-PLAN.md)，不以本檔代替 Phase 表。

一句話：**SAM 首先是單頁程式；具備 Controller（＋通常 `functions.js` API）時，同一份 SAM 可以 Agent 形態執行——virtual actor：mailbox／alarm 在同瀏覽器 Durable，閒置可 pause，有待處理事件才 resume；模擬 UI←網路→後端（`functions.js`∥`controller.js`）↔resources；跨 Agent 只傳訊息；每實例單權威。**

**狀態：** 初版規格（2026-08-03）；同日修訂依賴方向（CF 形：UI→functions，非 UI→Controller）。ADR：**DEC-031** Accepted。

---

## 1. 背景與動機

### 1.1 問題

今日已有：

- **SAM 三層**（UI／Infrastructure／Controller）與可攜 `SamInstance`（DEC-024）
- **總管＋`env.HOST`**（DEC-017）、**多 Agent session＋`env.SESSION`**（DEC-023）
- **沙盒＝SAM 實例（Code＋Data＋Configuration）**、clone 分叉（DEC-028）

缺口是執行模型尚未一等公民化：

- 無 **mailbox**；跨 Agent 通訊散落在 `onCommand`、SESSION／BroadcastChannel、間接副作用
- **訊息與 alarm 未強制序列化**（`SamInstance` 可重疊進入 handler）
- **身分**（sandbox／agent／peer）與未來 **多 tab／多瀏覽器／多主機** 未寫清
- DEC-026 曾將「真·子代理」另議——本模型提供其 runtime 原語（spawn＋mailbox）；coding 編排產品形狀見 **DEC-033**／`coding-orchestration.v1`（應用 protocol，非本規格）

### 1.2 設計意圖

1. **SAM 優先：** Agent 是執行形態，不是與「單頁程式」對立的另一產品。
2. **UI←網路→後端↔resources（Cloudflare 形）：** 畫布只經「網路」（`fetch("/api/…")`→`functions.js`）碰後端；**不得**直連 bindings，也**不得**直連 `controller.js`。`functions.js`（Workers）與 `controller.js`（DO）為後端同等入口，**皆可**存取同一 resources；有 DO 的程式通常仍以 Worker 當對 UI 的 API。Headless／遊樂場／其他 Agent 可對 Controller 發 mailbox，那是非畫布客戶端。
3. **Virtual actor：** 每實例一 Durable mailbox、單線程 drain；閒置可 hibernate（`onPause`）；**僅當**有訊息或事件待處理時才 dehibernate（`onResume`）；跨實例只傳訊息。
4. **單權威：** 任一 `sandboxId` 最多一個 homePeer 可寫與 drain；migrate 可換 home、ID 不變；**不**自動 failover。
5. **HA 靠上層：** Supervisor spawn 新實例（**新 ID**），不復活掛掉的同一執行體。

---

## 2. 目標與非目標

### 2.1 目標

- **G1** 定義 Agent 形態相對一般 SAM 的必要條件與行為不變式。
- **G2** 定義 `sandboxId`／`name`／`agentId`／`peerId`／`homePeer` 與 clone／migrate／spawn 語意。
- **G3** 定義 mailbox（投遞／ack／at-least-once）、失敗與毒訊息、序列化、alarm、virtual actor、registry、跨 Agent 僅訊息互通。
- **G4** 定義同瀏覽器 Durable 佇列、**單 Leader＋外接螢幕**、Leader 重選、異瀏覽器／異機權威邊界。
- **G5** 定義 UI←網路→後端：畫布只經 `functions.js`；不直連 Controller／bindings。
- **G6** 對齊 DEC-023 session、DEC-017 總管／HOST、DEC-024 三層（依賴方向＝CF：UI→Worker→DO／resources）。

### 2.2 非目標（本規格初版）

- 完整跨裝置同步產品、帳號、雲端專案庫。
- 真 Cloudflare Durable Objects 託管（對齊 DEC-024 非目標）。
- 自動跨 Peer failover／多主複製寫入（CRDT 多寫）。
- 規定 Agent 必須使用 LLM。
- 取代 DEC-023 領域 session 協定（session 建在本模型之上或扇入 mailbox）。
- 本檔內的 Phase 表（落地見 [PG-AGENT-MODEL-PLAN.md](./PG-AGENT-MODEL-PLAN.md)）。

---

## 3. 用語

正式對照亦應進入 [GLOSSARY.md](./GLOSSARY.md)。

| 用語 | 意思 |
| --- | --- |
| **SAM** | 單頁小程式：定義上必有 UI 入口；可選 Infrastructure／Controller。 |
| **SAM 實例／沙盒** | 一份 **Code＋Data＋Configuration**；**不**要求已配置 runtime。程式識別可仍為 `projectId`；產品稱沙盒 ID／`sandboxId`。 |
| **name** | 實例顯示名；可改、可撞名；**不是**全域身分。 |
| **Agent 形態** | 該 SAM 實例以 Controller 常駐執行（可 headless）；具備 mailbox 語意後為完整 Agent 執行體。 |
| **一般 SAM** | 無 Controller（或未以 Agent 形態啟動）的單頁程式。**不要**稱為「殘缺 Agent」。 |
| **agentId** | 可定址 mailbox 的執行體 ID。本機預設可 **`≡ sandboxId`**。 |
| **peerId** | 一個 Playgrounds 執行環境（某 tab 叢集／瀏覽器設定檔／主機上的 runtime 節點）。 |
| **homePeer** | 持有該 `sandboxId` **權威** Code＋Data、並負責 mailbox drain 的 peer。 |
| **mailbox** | 每 Agent 一個 Durable inbox；`send`＝入隊；成功處理後 ack。 |
| **ack／at-least-once** | 處理成功才完成出隊；崩潰／換 Leader 可能重送；handler 須冪等。 |
| **poison／DLQ** | 重試耗盡後隔離的毒訊息區，不堵後續 drain。 |
| **agent registry** | 最小目錄：register／lookup／list。 |
| **leaderEpoch** | Leader 世代；心跳與 inFlight 帶此值。 |
| **Supervisor** | 上層 Agent（應用角色）：負責偵測失敗、spawn 接班人、更新路由；**不是**遊樂場內建 HA。 |
| **hibernate／dehibernate** | Runtime 卸下／重建 Controller 進程（virtual actor）；**僅**在有待處理訊息或事件時 resume。≠ stop，≠ failover。 |
| **onPause／onResume** | Hibernate／dehibernate 生命週期 callback；與 `onStart`／`onStop`（註冊／卸載）不同。 |
| **virtual actor** | 實例邏輯常駐（ID＋Durable mailbox／alarm／狀態）；進程按需激活，非永遠佔用執行資源。 |
| **runtime 實例** | 已載入的 `SamInstance`／Controller 進程；勿與「SAM 實例／沙盒」混稱。 |

---

## 4. SAM 與 Agent 的關係

```text
SAM（單頁小程式：UI 定義必備）
  └─ 後端（可選組件，對 UI 皆為「網路另一側」）
        ├─ functions.js（Workers 形／對 UI 的 HTTP API）
        └─ controller.js（DO 形／mailbox・排程・常駐；Agent 形態）
              ↕ 同一 resources（KV／DB／HOST／…）
```

### 4.1 產品公理

1. **SAM 首先是單頁程式**，然後才能是 Agent。
2. **Agent＝SAM 的一種執行形態**（通常要有 `controller.js`；對 UI 仍經 `functions.js` 當 API，對齊「有 DO 通常配合 Worker」）。
3. **後端服務 UI：** 畫布只經網路打 `functions.js`；`functions.js` 與 `controller.js` 皆可直接使用注入的 resources；functions 可再呼叫 Controller（stub／mailbox／`onCommand`）。**禁止**向 Controller 注入 `env.INFRA`／任何「經 functions 繞路」的 binding——兩者為對等後端，不是互相代理。
4. **執行不依賴 iframe：** Agent 形態可在無 UI 掛載時運行；掛上 UI 不把 Controller 暴露成畫布可直連的表面。
5. **無 Controller 的 SAM** 就是一般單頁 SAM（可僅有 UI，或 UI＋`functions.js`）；不必納入 Agent 敘事。有 Durable 需求時以 `functions.js`（及／或後續加 Controller）存取 resources 即可。

### 4.2 依賴方向（修訂 DEC-024／撤回「UI→Controller」讀法）

```text
UI（畫布）──✗──► resources（KV／DB／…）
UI（畫布）──✗──► controller.js                 【對 UI 亦為後端，不直連】
UI（畫布）──────► functions.js ──► resources
                     └──────────► controller.js（可選）
其他客戶端（遊樂場／headless／Agent）──► controller（mailbox／命令）──► resources
```

- **硬規則：** 畫布只能經 `/api/*`→同沙盒 **`functions.js`** 碰後端；**不能**直連 bindings，也**不能**把畫布 `/api` 改接到 Controller。
- **`functions.js` 與 `controller.js` 同等**可存取同一 resources（如 CF Workers∥DO）；狀態協調靠 KV／DB 等，不假設單一 handler 閘門。
- **Leader：** 同瀏覽器內 **functions＋Controllers 皆由 Leader 執行**；外接螢幕的畫布 `/api` **應路由到 Leader 的 `functions.js`**（與 mailbox drain 同一權威）。
- 純靜態、無 `functions.js` 的 SAM：無後端 API；不要求 Controller。

### 4.3 與角色通道的關係

| 機制 | 關係 |
| --- | --- |
| **Mailbox** | 所有 Agent 執行體的通訊原語（本規格） |
| **`env.HOST`** | 至多一個總管席的編排能力；**不是**跨 Agent RPC |
| **`env.SESSION`** | 多方領域協定＋投影；事件宜 **扇入** 各 Participant mailbox |
| **`env.TOOL`** | 工具槽窄授權；Tool SAM 可不具完整 Agent 形態 |

---

## 5. 身分模型

### 5.1 層級

```text
sandboxId（projectId）  — 邏輯實例：Code＋Data＋Config
name                    — 顯示標籤（非身分）
peerId / homePeer       — 權威存放與執行節點
agentId                 — mailbox 位址（本機常 ≡ sandboxId）
```

### 5.2 Sandbox ID

- **識別：** 一個分叉後的 SAM 實例。
- **誕生：** create／import／clone／spawn。
- **消滅：** 明確刪除。
- **不表示：** 正在跑、掛在哪個 tab、訊息必達。
- **clone：** 新 `sandboxId`；記錄 `clonedFrom`；自分離起 Code／Data／Config 分岔（DEC-028）。

### 5.3 Agent ID

- **識別：** 可定址的 Agent 執行體（mailbox）。
- **本機預設：** `agentId ≡ sandboxId`。
- **分散式位址（概念）：** `agent:<peerId>/<sandboxId>` 或目錄：`sandboxId → { homePeer, agentId }`。
- **UI** 不另發 `agentId`；UI→自己的 Controller＝打自己的 mailbox。

### 5.4 Peer ID 與 homePeer

- **peerId：** 執行環境節點。今日隱含 peer＝「此 origin 下此瀏覽器設定檔＋OPFS」。
- **homePeer：** 該實例唯一權威所在；可經 **migrate** 變更。

### 5.5 Migrate

| 規則 | 語意 |
| --- | --- |
| 搬運 | Code＋Data＋Configuration（含選定狀態）換到另一 peer |
| ID | **`sandboxId`（及本機 `agentId`）不變** |
| homePeer | **改為**目標 peer |
| 權威 | 過程與結束後仍 **最多一個** 可寫／可 drain 的 home |
| fencing | 遷移中舊 home 必須停寫（或 generation／epoch 作廢），避免雙權威 |

### 5.6 失敗與高可用

| 情況 | 行為 |
| --- | --- |
| homePeer／Agent 掛了 | **不**自動 failover、不自動選新 home |
| 需要 HA | **Supervisor**（或其他上層編排）**spawn** 新實例 → **新 ID** → 更新路由／依賴方 |
| 呼叫方持舊位址 | 應收到明確失敗；再向 Supervisor／目錄查接班人 |

Spawn 接班人 ≠ migrate：前者是新工人；後者是同一邏輯身分換家。

---

## 6. 執行模型（Mailbox／序列化／排程／Spawn）

### 6.1 公理

1. 每個 Agent 有穩定可定址 ID（見 §5）。
2. Agent 可在背景執行，**不**依賴 DOM／iframe 掛載。
3. Agent 可經 `schedule` 在指定時間觸發 **alarm**（入同一處理序列）。
4. 每個 Agent 有一個 **mailbox**，接收其他 Agent 的訊息，**包括自己送給自己的**。
5. Agent **只能**透過訊息與其他 Agent 溝通（無共享可變堆、無直接呼叫對方內部）。
6. 收到訊息（或 alarm）時可改變自身狀態（memory／KV／DB／授權範圍內的 FS 等）。
7. Agent **只能按順序**處理 mailbox 訊息與 alarm（單一 drain；一時間一 handler）。
8. Agent 可以 **spawn** 自己（同 SAM 程式 → 新實例、新 ID）。
9. **Virtual actor：** runtime 可視需要 hibernate（`onPause`）；**不會**無故喚醒——**僅當**有訊息或事件待處理時才 dehibernate（`onResume`）再 drain（見 §6.7）。

### 6.2 Mailbox

訊息形狀（MVP 必填標 ★）：

| 欄位 | 說明 |
| --- | --- |
| `id` ★ | 訊息 id；**去重與追蹤**用（發送方或 runtime 生成；同 `to` 下唯一） |
| `from` ★ | `agentId` 或 `system`／`user`／`host` |
| `to` ★ | 目標 Agent |
| `type`／`payload` ★ | 應用或系統類型 |
| `replyTo`？ | 可選 |
| `sentAt` ★ | 時間戳 |
| `deliveryAttempts`？ | runtime 維護的投遞／處理嘗試次數 |

系統類型（建議命名空間）：`system.command`、`system.alarm`、`system.shutdown`、`session.event`、應用自訂 `app.*`。

對現有表面的收斂（目標語意）：

| 今日 | 模型上 |
| --- | --- |
| `onCommand` | UI／遊樂場 → mailbox 的一種訊息 |
| `alarm` | 排程到期 → **Durable 事件入同一處理序列**（見 §6.4） |
| `controller.fetch` | 若保留：外部／宿主 HTTP 入口；**入隊**同一序列後處理（UI 不走此路打 Infra） |
| DEC-023 BroadcastChannel | 扇出後 **copy／enqueue** 進各 Participant mailbox（或由其訂閱後自入隊） |

### 6.2.1 投遞語義（MVP 已定）

| 規則 | 語意 |
| --- | --- |
| **`send` 成功** | 僅表示訊息已 **Durable 入隊**（persisted）；**不**表示 handler 已跑完 |
| **預設保證** | **at-least-once**：Leader 切換、handler 中途崩潰、ack 前重啟 → 同一 `id` **可能再處理一次** |
| **出隊／ack** | 採 **處理成功後才 ack**（標記完成並自可重試佇列移除）。**禁止**「peek 前即刪」導致丟失 |
| **進行中** | 可標 `inFlight`（含處理中的 `leaderEpoch`）；崩潰後未 ack 者對新 Leader **可視為可再投** |
| **去重** | Runtime **應**在同一 Agent 對已 ack 的 `id` 做近期去重窗（常數實作定）；應用 handler **必須可冪等**（或能容忍重複）——瀏覽器無跨狀態真事務時的必要契約 |
| **滿佇列** | 超過容量 → `send` **機器可讀拒絕**（如 `mailbox_full`）；**不**默默丟最舊（除非未來另定策略） |
| **非目標（MVP）** | Exactly-once 跨狀態事務；跨 peer 端到端投遞保證 |

```text
send → Durable append (queued)
         → Leader claim / inFlight
         → handle() 成功 → ack (done)
         → handle() 失敗 → 見 §6.3.1（重試或毒訊息）
```

### 6.3 序列化執行

```text
while running as Leader (valid epoch + hold lock):
  e = next(mailbox ∪ alarmQueue) where not acked   // 單一序列
  mark inFlight(e, leaderEpoch)
  await handle(e)
  on success: ack(e)
```

- **跨 Agent 可並行**（多實例各有 drain；同瀏覽器仍由單一 Leader 進程調度）。
- **自送訊息：** enqueue 到佇列尾；**禁止**在當前 handler 內同步重入同一實例的權威狀態寫入路徑。
- **`waitUntil`：不得碰權威狀態**（不得寫 KV／DB／mailbox 順序相關狀態／OPFS 權威樹等）。僅可做與權威狀態無關的背景善後（例如 log、metrics）。需要延續寫狀態 → 排程 alarm 或 `sendSelf`，回到序列化 handler。
- **Drain 前門檻：** 每一則處理前須確認 **仍持 Web Lock** 且 **`leaderEpoch` 仍為當前**；否則立刻 stop drain（degrade），**不 ack** 當前 inFlight（留給後任重試）。

### 6.3.1 Handler 失敗與毒訊息（MVP 已定）

| 情況 | 行為 |
| --- | --- |
| Handler **拋錯／拒絕** | 不 ack；`deliveryAttempts++`；可在短暫延遲後由同一序列 **重試** |
| 達 **`N_maxAttempts`**（實作定，建議 ≥1 可配置） | 標為 **poison**（隔離出主佇列或進 dead-letter 區）；**不**永遠卡住後續訊息；機器可讀錯誤／可觀測（log／狀態） |
| Poison 後 | 預設跳過並繼續 drain；是否人工重放由管理面／PLAN 定 |
| 取消／超時 | 長任務應可取消或 alarm 分段；單則 handler 牆鐘超時策略實作定，超時視同失敗進入重試計數 |

### 6.3.2 狀態與 ack 的原子性（坦白）

瀏覽器／OPFS **不**提供跨「業務狀態＋mailbox ack」的真事務。

| 規則 | 語意 |
| --- | --- |
| **目標順序** | Handler 內先提交權威狀態，**成功後再 ack**（最佳努力同命運） |
| **可能窗口** | 狀態已寫、ack 前崩潰 → 重試時 **重複副作用**；故 handler **必須冪等**或自備去重鍵 |
| **禁止假設** | 不得假設 runtime 提供 exactly-once 業務效果 |
| **waitUntil** | 仍不得寫權威狀態（避免擴大該窗口） |

### 6.4 排程

- `ctx.schedule({ delayMs | at | intervalMs })` → 寫入 **宿主 Durable 排程表**；到期產生與 mailbox **同一序列**可處理的事件（建議形如 `system.alarm` 訊息或等效記錄）。
- **不**依賴 Agent 進程內 `setTimeout` 在 hibernate／非 Leader 時仍存活。
- **漏火：** Leader 宕機期間到期的 alarm，由後任 Leader 在接手後依 Durable 表補投（可能延遲，不丟）。
- **`intervalMs`：** 以排程表為準推進；漏段不要求補跑每一 tick，但須定義下一火時間（實作：catch-up 一次或跳到下一間隔——PLAN 釘死一種）。
- **`cancel`：** 取消尚未火的排程；已入隊未 ack 的 alarm 事件依一般訊息／失敗規則。
- **同瀏覽器** alarm 與 mailbox 一樣 **persistent／durable**。

### 6.5 Spawn

```text
spawn(opts?) → { sandboxId, agentId }
```

- 預設：clone 當前程式（Code）；Durable 狀態 **預設不帶**（對齊 DEC-018；可顯式 opt-in）。
- 可帶 `initialMessage` 進子代 mailbox；可記錄血統（`clonedFrom`／intent）。
- 父子無共享堆疊；結果以訊息回傳。
- **子代不繼承 `env.HOST`**（避免多 HOST）；總管特權仍僅一席。
- 與 DEC-023 `spawn-participant`：座位分身是本 spawn／clone 在 session 層的用法之一。

### 6.6 狀態隔離

- 狀態根以 `sandboxId` 為界。
- 跨實例共享可變狀態：**不可**默認；僅經訊息請求對方修改，或經 Host SAM session 權威（DEC-023）。


### 6.6.1 Agent Registry（最小目錄）

同瀏覽器 Durable（或 Leader 權威可重建的）**agent 目錄**，供 `send`／spawn／Supervisor 定址：

| 能力（概念） | 語意 |
| --- | --- |
| `registerAgent` | 實例以 Agent 形態啟用時登記：`agentId`、`sandboxId`、狀態（registered／running／hibernated／stopped） |
| `unregisterAgent` | 明確 `onStop`／刪除沙盒時移除（或標 stopped）；pending mailbox 政策：刪沙盒則丟棄或隨專案清 |
| `lookup`／`listAgents` | 依 `agentId` 查是否存在、是否可投遞 |
| 與 spawn | `spawn` 成功必須留下目錄項＋可投遞 mailbox |

無目錄項 → `send` 回 `agent_not_found`（機器可讀）。Hibernate **不** unregister。

### 6.7 Virtual actor：Hibernate／Dehibernate

採 **virtual actor** 語意：邏輯實例（ID＋Durable mailbox／alarm／狀態）常在；**Controller 進程按需激活**，不永久佔用執行資源。

| 規則 | 語意 |
| --- | --- |
| 誰決定 hibernate | **Runtime／宿主**可視需要 pause（卸進程）；非「定時無故喚醒」 |
| 生命週期 callback | Hibernate 前／後：**`onPause(env, ctx)`**／**`onResume(env, ctx)`**。與 `onStart`／`onStop`（首次啟動／明確卸載）分離——**resume 不重跑 `onStart`** |
| 身分 | Pause 期間 **`sandboxId`／`agentId` 不變**；目錄可定址 |
| Durable | **同瀏覽器內** mailbox 與 alarm 排程表 **必須 persistent／durable**（OPFS 或同等）；投遞給 hibernated 實例＝寫入 Durable 佇列 |
| **何時 dehibernate** | **僅當**有待處理訊息或事件（含到期 alarm）需要處理時；**不會**為了「保持熱乎」而自動 resume |
| Resume 後 | 呼叫 `onResume` → 依 §6.3 drain 待處理事件 |
| 與 stop | 明確 `onStop`／刪除 ≠ pause；停止後不適用本條自動 resume |
| 與 failover | Pause／resume 是同瀏覽器（同 peer 儲存）內資源管理；**不是**跨 peer HA |

```text
        onStart（註冊／首次激活）
              │
              ▼
         running ◄──── onResume ◄── 有待處理訊息／事件
              │                         ▲
         onPause                        │
              ▼                         │
         hibernated ── Durable 佇列有工作 ─┘
              │
         onStop（明確卸載）
```

---

## 7. 分散式與多 tab

### 7.1 同瀏覽器：單 Leader（主機）＋外接螢幕 tabs

**MVP 部署（已定）：** 同一瀏覽器內**只有一個 Leader tab** 負責**全部** Agent 的 Controller drain（一台主機）。其他 Playgrounds tabs 只當 **UI／外接螢幕**——可編輯、觀測、把操作寫入 Durable mailbox，**不**跑 Controllers。

隱喻：多螢幕接同一台 PC；關主機或主機休眠時，換一台當主機繼續跑，螢幕上的畫面／操作面仍可接上。

| 規則 | 語意 |
| --- | --- |
| Mailbox／alarm | **Persistent／durable**；不因 Leader 卸載而消失 |
| Leader | 任一時刻**至多一個** tab 持有 runtime 領導權，drain **所有**已註冊 Agent |
| 非 Leader tabs | 外接螢幕：UI only；enqueue／訂閱狀態；不啟動第二套 Controller 進程 |
| Leader 關閉 | **等同該執行宿主關閉**；Durable 佇列保留；**存活的其他 tab（或後開頁）必須重選 Leader** 以繼續運行 Agents |
| Leader hibernate | Leader tab 的 runtime 領導權暫停／卸下（無法再 drain）時，同樣觸發**重選 Leader**（不是「無 Leader 卻假裝還在跑」） |
| 新 Leader 接手後 | 對有待處理工作的實例 `onResume` 並 drain；佇列空則可維持各 Agent hibernate |
| 非目標（MVP） | **不做**「不同 Agent 分片到不同 tab 各當 leader」 |

「頁面關閉＝主機關閉」指 **Leader（執行宿主）** 生命週期；資料面仍在同瀏覽器 Durable 根。非 Leader 關 tab 只少一塊螢幕，不觸發全體 Agents 停機。

#### Leader 選舉：Web Lock＋心跳＋世代（已定）

**不依賴**瀏覽器 Page Lifecycle（`freeze`／`resume` 等）。領導權只由 **Web Lock＋心跳＋`leaderEpoch`＋自檢／緩衝接手** 決定。

| 機制 | 角色 |
| --- | --- |
| **Web Locks API** | 互斥：持有「Playgrounds Agent runtime Leader」鎖者才可宣稱 Leader |
| **`leaderEpoch`** | 單調遞增世代（Durable）。每次成功「開始執行 Leader 工作」時 `epoch++`；心跳與 inFlight 標記帶此值 |
| **心跳** | **僅持鎖且已過緩衝、正式就任的 Leader** 可寫正式心跳（含 `leaderEpoch`＋時間戳）。緩衝期內**不**寫正式心跳（或寫 `pending` 且 follower 忽略） |
| **持鎖自檢** | 以 Web Lock 持鎖 callback 生命週期／等價可觀測手段為準。Leader **必須**在時限內、且在**每次**準備 drain 一則或寫心跳前確認仍持鎖且 epoch 仍有效。若否 → **立刻 degrade 成 follower**：停 Controllers、停正式心跳、**不 ack** 進行中訊息 |
| **心跳超時** | Follower 見正式心跳超過 `T_heartbeat` → 視舊 Leader 失效，可競鎖 |
| **緩衝接手** | 新搶到鎖的 tab **不得立刻**接手；須再等待 **`T_heartbeat`＋`T_buffer`**，再確認仍持鎖 → **bump `leaderEpoch`** → 才啟動 Controllers／寫正式心跳／drain |
| 主動卸領導權 | 釋放鎖、停心跳；可寫 epoch 作廢提示（可選），縮短他人等待 |

```text
Follower 見心跳超時
    → 競 Web Lock
    → 取得鎖後等待 (T_heartbeat + T_buffer)
    → 再確認仍持鎖 → epoch++ → 執行中 Leader

Leader
    → 自檢週期／每則 drain 前：仍持鎖且 epoch 有效？
    → 否：degrade → follower（停工作；inFlight 不 ack）
```

常數 `T_heartbeat`／`T_buffer`／自檢週期／去重窗／`N_maxAttempts` 由實作計劃釘死；相對關係：**接手延遲 ≥ 心跳超時＋緩衝**；**自檢時限應明顯短於該接手延遲**。

### 7.2 拓撲

| 拓撲 | Sandbox ID | Agent 權威 |
| --- | --- | --- |
| **同瀏覽器多 tabs** | 共享同一批 `sandboxId`；共享 Durable mailbox／alarm | **單一 Leader** drain 全部；Leader 可換（agent ID 不變） |
| **同機異瀏覽器** | 預設**不同**命名空間 | 各 peer 各權威；互通靠訊息或受控 migrate |
| **異機** | 同上 | 同上；信任與傳輸另定 |

跨 peer **不**默認共用同一可變 `sandboxId` 多寫。需要同一邏輯身分換機 → **migrate**（§5.5）。需要可用性 → Supervisor **spawn 新 ID**（§5.6）。

### 7.3 多 tab 與負載

| 目標 | MVP 做法 |
| --- | --- |
| 多 UI／多窗 | 非 Leader＝外接螢幕；操作 → Durable mailbox → **Leader** drain |
| 多 Agent 執行 loading 分攤到多 tab | **不做**（單 Leader 扛全部 Controllers） |
| 後端離開 UI 主線程 | **預設：** Leader **Backend Runtime Dedicated Worker** 跑 functions∥Controllers（**DEC-038**／[PG-BACKEND-RUNTIME-SPEC.md](./PG-BACKEND-RUNTIME-SPEC.md)） |
| 單實例內可並行重活 | 再 **spawn 子 Agent**，或後段子 Worker（仍由同一 Leader 調度） |
| Leader 不可用 | **重選 Leader**（關閉或 hibernate 觸發），不是跨 peer failover |

日後若要「按 agentId 分片多 leader」須另修規格；非本初版預設。

### 7.4 與「Peer 掛了不 failover」的分層

| 範圍 | 失敗 | ID | 接手 |
| --- | --- | --- | --- |
| 同瀏覽器 | Leader 關閉或 hibernate | **不變** | **重選 Leader**（既有他 tab 或後開頁）；Durable 佇列仍在 |
| 同瀏覽器 | 非 Leader（螢幕）關閉 | **不變** | 無；Leader 繼續跑 |
| 跨 peer（異瀏覽器／異機） | homePeer 不可用 | migrate 才維持原 ID；HA 常用 **spawn→新 ID** | Supervisor／人；**不**自動 |

---

## 8. 概念 API 形狀（非定稿）

Controller（演進方向）：

```js
export default {
  async onStart(env, ctx) {},   // 註冊／首次激活
  async onStop(env, ctx) {},    // 明確卸載（≠ pause）
  async onPause(env, ctx) {},   // hibernate 前
  async onResume(env, ctx) {},  // dehibernate 後、drain 前（不重跑 onStart）
  async onMessage(msg, env, ctx) {},
  async alarm(env, ctx) {},
  async onCommand(command, env, ctx) {}, // 過渡期可保留＝system.command
};
```

`ctx`（概念）：

```text
ctx.agentId / ctx.sandboxId
ctx.leaderEpoch?            // 僅 Leader 執行 Controllers 時有意義
ctx.send(to, message)       // → Durable 入隊；成功≠已處理
ctx.sendSelf(message)
ctx.schedule(...)           // → Durable alarm 表（宿主持有）
ctx.spawn(opts?)            // → 新實例＋registry
```

宿主／runtime（概念）：`registerAgent`／`unregisterAgent`／`listAgents`；Leader 側持鎖自檢與 epoch。

定案時以 DEC-031 Accepted 版＋實作計劃＋`capabilities()` 為準。

## 9. 不變式總表

1. SAM 優先；Agent 是執行形態。
2. UI **只**經網路打 `functions.js`；**不得**直連 Controller 或 resources；UI 仍可驅動操作。
3. 每 `sandboxId` 任意時刻最多一個 homePeer／一個 mailbox drain。
4. 跨 Agent 只傳訊息；無共享可變堆。
5. 訊息與 alarm 單線程順序處理；`waitUntil` **不得**碰權威狀態。
6. **投遞：** Durable 入隊＝`send` 成功；**成功處理後 ack**；MVP **at-least-once**；handler **須冪等**（或容忍重複）；滿佇列拒絕。
7. **失敗：** 重試至多 `N_maxAttempts` 後毒訊息隔離，不永久堵佇列。
8. clone／spawn → 新 ID、分叉；migrate → 同 ID、換 homePeer；spawn／啟用須進 **registry**。
9. 無自動跨 peer failover；HA 靠 Supervisor spawn（新 ID）。
10. 子代不繼承 HOST；總管席唯一。
11. Binding（HOST／SESSION／TOOL）≠ 跨 Agent 通訊原語。
12. Virtual actor：同瀏覽器 mailbox／alarm Durable；可 `onPause`；**僅**有待處理事件時 `onResume`（不重跑 `onStart`）。
13. 同瀏覽器 MVP：**單一 Leader**（Web Lock＋心跳＋`leaderEpoch`；**不**依 Page Lifecycle）。自檢失鎖即 degrade；新 Leader 於超時＋緩衝後 bump epoch 再接手；drain／心跳前驗鎖與 epoch。
14. 狀態與 ack **非**真事務；先寫狀態再 ack 為最佳努力。
15. 真 CF DO 託管與 exactly-once 業務效果非本規格承諾。

---

## 10. 與既有決策的對齊

| 決策 | 本規格態度 |
| --- | --- |
| DEC-016／028 沙盒實例 | Sandbox ID＝邏輯實例；clone 分叉 |
| DEC-017 單 HOST／總管 | 維持；spawn 子代無 HOST |
| DEC-023 session | 領域通道；事件扇入 mailbox；座位＝多實例 |
| DEC-024 三層／Controller | 執行載體；**修訂：** UI→`functions.js`（Worker）；Controller＝DO；兩者↔resources；補 mailbox／virtual actor／身分 |
| DEC-026 子代理另議 | 本模型提供 spawn＋mailbox 原語；coding UX 另定 |
| DEC-018 狀態搬動 | spawn／clone 預設不帶 Durable；migrate 可顯式帶狀態；同瀏覽器 mailbox／alarm 另為 Durable 佇列 |

**DEC-031**（Accepted）：採納本檔公理、身分、單權威、migrate／HA、virtual actor、UI←網路→後端、投遞／ack／at-least-once、失敗與毒訊息、registry、`leaderEpoch`、狀態／ack 最佳努力。

---

## 11. 驗收情境（規格層）

### S1 — Headless 與 UI 客戶端

1. 無 iframe 時 Controller 可收訊息／alarm 並改 KV。  
2. 掛上 UI 後，UI 經 `/api`→`functions.js` 觸發操作（可再達 Controller／resources）；UI 非只讀、亦不直連 Controller。

### S2 — 序列化與投遞

1. 連續兩則訊息與一則中間到期的 alarm，處理不重疊。  
2. 自送訊息在當前 handler 結束後才處理。  
3. `waitUntil` 內寫 KV 無效或不被允許（權威狀態僅 handler 內）。  
4. `send` 返回後訊息已在 Durable 佇列；handler 未跑完前重啟 Leader → 同一 `id` 會再處理（at-least-once）。  
5. Handler 成功後 ack；未 ack 前可見 inFlight／可重試。

### S3 — Spawn 與 HOST

1. Agent spawn 自身 → 新 `sandboxId`；父以訊息與子通訊。  
2. 子代無 `env.HOST`。

### S4 — 單 Leader＋外接螢幕＋世代

1. Tab A 為 Leader（跑 **functions＋全部 Controllers**）；Tab B 僅 UI；B 的 `/api` 與 mailbox 操作由 A 執行／drain。  
2. A 心跳停滯超過時限後，B 競得 Web Lock，再等 **時限＋緩衝**，**bump `leaderEpoch`** 後才接手；緩衝期不寫正式心跳。  
3. A 若仍活著但已失鎖／epoch 失效，須 **degrade**，不得繼續 drain；未 ack 訊息由 B 以至少一次語義重試。  
4. 非 Leader 關閉不中斷 Agents。  
5. MVP **不**出現「兩 tab 各 drain 不同 agentId」；**不**依賴 Page Lifecycle。

### S5 — Migrate 與 HA

1. Migrate 後 ID 不變、homePeer 變、舊 home 不可再寫。  
2. home 掛掉不自動復活；Supervisor spawn 新 ID 接班。

### S6 — Virtual actor（Pause／Resume）

1. 閒置可 `onPause`；無待處理事件時**不**無故 resume。  
2. `send` 進 Durable mailbox 或 alarm 到期 → 才 `onResume` 並 drain（不重跑 `onStart`）。  
3. Pause ≠ stop／刪除。

### S7 — UI←網路→後端

1. 畫布 `/api/*` 打到同沙盒 **`functions.js`**（有 Controller 時亦然；**不**改接到 Controller）。  
2. 畫布無法直連 bindings 或 Controller 進程。  
3. `functions.js` 與 Controller 皆可完成 Durable 讀寫（同一 resources）。  
4. （目標）外接螢幕的 `/api` 由 **Leader** 執行 `functions.js`。

### S8 — 失敗、毒訊息、Registry

1. Handler 連續失敗達上限 → 訊息進 poison／DLQ，後續訊息仍可處理。  
2. `send` 到未註冊 `agentId` → `agent_not_found`。  
3. `spawn` 後目錄可 lookup，且可對新 id `send`。

---

## 12. 開放問題（已定案者見上；以下仍開放）

1. ~~生命週期 hooks~~ → **已定：** `onPause`／`onResume`（不重跑 `onStart`）。  
2. ~~Mailbox／alarm 持久~~ → **已定：** 同瀏覽器 Durable；頁關＝宿主關；新 leader／後開頁接手。  
3. ~~UI／後端邊界~~ → **已定：** UI←網路→`functions.js`；UI↛Controller、UI↛resources；functions∥controller↔resources（CF 形）。  
4. ~~`waitUntil`~~ → **已定：** 不得碰權威狀態（mailbox handler 語意；functions 自身可寫 resources）。  
5. ~~多 Agent 預設部署~~ → **已定：** 單一 Leader 跑 **functions＋全部 Controllers**；其他 tabs＝外接螢幕；Leader 關閉／hibernate → 重選 Leader。不做分片多 leader（除非另修規格）。  
6. ~~Leader 選舉~~ → **已定：** Web Lock＋心跳＋`leaderEpoch`；自檢 degrade；超時＋緩衝後就任；不依 Page Lifecycle。  
7. ~~投遞／失敗／registry／原子性~~ → **已定：** at-least-once＋成功後 ack；冪等；毒訊息；registry；狀態／ack 最佳努力（見 §6.2.1–6.3.2／§6.6.1）。  
8. 跨 peer 訊息傳輸與信任（本機 daemon／手動匯出／他案）——初版只定身分與權威，不定線協議。  
9. ~~外接螢幕 `/api`→Leader.functions~~ → **已定／已落地：** BroadcastChannel relay＋epoch fencing（見 `functionsApiRelay`）。  
10. ~~常數與存放~~ → **已定於** [PG-AGENT-MODEL-PLAN.md](./PG-AGENT-MODEL-PLAN.md)（`T_heartbeat`＝2s、`T_buffer`＝1s 等）。

---

## 13. 相關文件

| 文件 | 關係 |
| --- | --- |
| [DECISIONS.md](./DECISIONS.md) | DEC-031 Proposed；既有 DEC-016～030 |
| [PG-AGENT-MODEL-PLAN.md](./PG-AGENT-MODEL-PLAN.md) | 落地 Phase／常數／完成定義 |
| [PG-SAM-RUNTIME-PLAN.md](./PG-SAM-RUNTIME-PLAN.md) | Controller／`SamInstance` 載體 |
| [PG-AGENT-PLAN.md](./PG-AGENT-PLAN.md) | 總管／HOST／範本能力 |
| [PG-MULTI-AGENT-SESSION-SPEC.md](./PG-MULTI-AGENT-SESSION-SPEC.md) | 領域 session；扇入本模型 |
| [PG-SANDBOX-INSTANCE-PLAN.md](./PG-SANDBOX-INSTANCE-PLAN.md) | 實例／clone／工作集 |
| [GLOSSARY.md](./GLOSSARY.md) | 用語 |
| [playgrounds-host-api.md](./playgrounds-host-api.md) | 現行 HOST 表面（mailbox API 未定稿前勿假設） |

---

## 附錄 A — 與現況差距（實作地圖）

| 公理／能力 | 現況（2026-08；Phase 0–5） |
| --- | --- |
| 穩定 sandboxId | 有（程式名 `sandboxId`） |
| Headless Controller | 有（DEC-024／遊樂場／Node host） |
| `schedule`／`alarm` | 有；與 mailbox **串行** drain |
| Mailbox | **有**（Durable／ack／at-least-once） |
| 跨 Agent 僅訊息 | **強制方向**（`ctx.send`；SESSION 扇入 mailbox） |
| Spawn 為 Agent 原語 | `AgentRuntime.spawn`＋session `spawn-participant`→registry |
| homePeer／migrate | **無**（跨 peer 另議） |
| hibernate／`onPause`／`onResume` | **有**（runtime） |
| 同瀏覽器 Durable mailbox／alarm | **有**（OPFS runtime storage） |
| UI←網路→functions（↛Controller） | **畫布 `/api`→functions**；follower→Leader relay（`functionsApiRelay`） |
| `waitUntil` 禁寫權威狀態 | 契約註明；**未**靜態強制 |
| 單 Leader＋外接螢幕／重選 | **有**（Web Lock／心跳／epoch） |
| Durable mailbox ack／at-least-once | **有** |
| 毒訊息／DLQ | **有** |
| Agent registry | **有** |
| `leaderEpoch` | **有** |

落地階段見 [PG-AGENT-MODEL-PLAN.md](./PG-AGENT-MODEL-PLAN.md)；本檔維持需求／模型權威。
