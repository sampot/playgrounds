# Playgrounds Workflow Visual Editor — `pg-wfedit`

本檔定義 **Workflow Visual Editor**（建議 repo：`sampot/pg-wfedit`）的產品契約、垂直畫布 UX、與 `workflow.v1` IR 的往返規則。定義語言見 [PG-WORKFLOW-DEFINITION-SPEC.md](./PG-WORKFLOW-DEFINITION-SPEC.md)；交付邊界見 [PG-WORKFLOW-PLAN.md](./PG-WORKFLOW-PLAN.md)；落地階段見 [PG-WFEDIT-PLAN.md](./PG-WFEDIT-PLAN.md)。權威決策：**DEC-034**（Visual Editor＝Tool SAM）；掛載契約：**DEC-022**／**DEC-030**。

一句話：**獨立 Tool SAM；垂直主軸投影 `workflow.yaml`；經 `env.TOOL` grant 寫回同一 IR；不跑引擎、不持游標。**

**狀態：** 規格初版（2026-08-04）；實作 Phase 0–2 見 [`sampot/pg-wfedit`](https://github.com/sampot/pg-wfedit)／WFEDIT-PLAN。

---

## 1. 定位與邊界

### 1.1 在堆疊中的位置

```text
workflow.v1（YAML IR；本站 SPEC）
        │ 讀／校驗／寫
        ▼
pg-wfedit（Tool SAM；本檔）
        │ env.TOOL + grant
        ▼
宿主沙盒（通常為 pg-workflow 範本或實例的 Code）
  workflow.yaml ＋ 可選 steps/*.js
        │ 重載／instantiate（與編輯器無關）
        ▼
pg-workflow Runtime（Agent；引擎＋游標）
```

| 層 | 本規格的關係 |
| --- | --- |
| **定義語言** | 只讀寫 [WORKFLOW-DEFINITION](./PG-WORKFLOW-DEFINITION-SPEC.md) 可表達者；不得另立執行語意 |
| **Visual Editor** | 本檔；獨立 Tool SAM |
| **Runtime** | `sampot/pg-workflow`；編輯器**不**內嵌、不呼叫其引擎 API |
| **遊樂場介面** | 僅通用 `openTool`／grant／tabs；**不**內建設計器 |

### 1.2 目標

- **G1** 以**垂直（上→下）**流程圖編輯單游標 `workflow.v1`，小螢幕以垂直捲動為主互動。
- **G2** 圖與 YAML **同一 AST**；儲存＝序列化回宿主 `workflow.yaml`。
- **G3** 經 **`env.TOOL`** 讀寫 grant 路徑；角色為工具，不是 Agent／runtime。
- **G4** 靜態校驗（至少：語法、步驟 type、邊指向已知 `stepId`、`run`／`runFile` 互斥）；錯誤機器可讀。
- **G5** 交付形對齊小品：獨立 repo、`?open=`、可選 `/sam/` catalog。

### 1.3 非目標

- 遊樂場內建 BPMN／視覺設計器。
- 以 Tool 充當引擎、持有 cursor／vars／mailbox、或試跑實例。
- 平行多游標、泳道、協同編輯、BPMN／其他圖語匯出。
- Exactly-once 或遠端多人同編。
- 完整 IDE（除短 `run` 與抽檔外，不強制重型語言服務）。
- YAML 註解／鍵序的完美 round-trip（見 §6.4）。

---

## 2. 產品決策

| ID | 決策 |
| --- | --- |
| **E1** | Repo 建議 **`sampot/pg-wfedit`**；`kind: tool`；型錄系列建議「流程」（與 `pg-workflow` 同系列）。 |
| **E2** | **垂直主軸（TB）**為預設版面；水平僅用於分支短岔，不是主閱讀方向。 |
| **E3** | 權威落盤＝宿主 **`workflow.yaml`**（路徑可組態，預設沙盒根）；腳本外檔預設 `steps/`。 |
| **E4** | 步驟 `ui` 僅供編輯器；執行忽略（對齊定義語言 SPEC）。 |
| **E5** | **Layout 權威：** 載入時若步驟已有可用 `ui.x`／`ui.y` 則尊重；**「整理版面」**才批次覆寫座標。一般編輯不暗自重排全圖。 |
| **E6** | **主鏈啟發式：** 從 `start` 出發；每步取「主後繼」往下排。主後繼＝（若有）`ui.primaryNext` 指向的邊，否則依 type：`next`；`await_ui`／`await_child` 的 `on` **文件序第一個**；`choice` 的 `when` **第一條**，若無則 `else`。其餘邊為岔線。 |
| **E7** | **註解：** MVP 允許 stringify 後**丟失** YAML 註解與非語意鍵序；須在 UI／README 明示。不得因此改語意欄位。 |
| **E8** | 與 runtime 分工：編輯器只改定義；重載／開跑由 `pg-workflow`（或使用者）負責。 |

---

## 3. 掛載與 Tool 契約

### 3.1 典型用法

工作沙盒＝含 `workflow.yaml` 的流程範本或實例 Code → 將 `pg-wfedit` 以工具掛進 main content：

```text
HOST.openTool({
  toolSandboxId: "<pg-wfedit 沙盒 id>",
  paths: ["workflow.yaml", "steps/"],
  mode: "readwrite",
  focusPath: "workflow.yaml"
})
```

（舊欄位名 `toolProjectId` 遷移中相容，見 host-api。）

### 3.2 Grant 建議

| 路徑 | 模式 | 說明 |
| --- | --- | --- |
| `workflow.yaml` | `readwrite` | 必備 |
| `steps/`（目錄前綴） | `readwrite` | 建議；供 `runFile` 建立／編輯 |

無 grant 或僅 `read`：可開檢視；寫入須失敗並顯示明確錯誤（對齊 TOOL 錯誤碼風格）。

### 3.3 `env.TOOL` 使用面

| 能力 | 用途 |
| --- | --- |
| `getGrant` | 確認 host／paths／mode |
| `readFile`／`writeFile` | YAML（建議帶 `hash`／`expectedHash` 樂觀鎖） |
| `readFile`／`writeFile`（`steps/*`） | 外檔腳本 |
| `close` | 結束工具 session（可選） |

**禁止：** 假設存在完整 `env.HOST`；經工具寫 Durable／mailbox；呼叫 workflow 引擎內部 API。

### 3.4 SAM meta（建議）

`index.html` `<head>`（DEC-024 `sam:*`）：

| meta | 建議值 |
| --- | --- |
| `sam:title` | 流程視覺編輯（或同等） |
| `sam:tool-kinds` | 含 workflow 定義編輯之意圖（實作自訂字串；供發現） |
| `sam:tool-globs` | `workflow.yaml`、`**/*.yaml`、可選 `steps/**/*.js` |

---

## 4. 垂直畫布 UX

### 4.1 版面骨架

```text
┌─ chrome ─────────────────────────────────────────┐
│ 路徑 · dirty · Validate · Save · Reload · 圖｜YAML │
├────────────────────────────┬─────────────────────┤
│ 畫布（垂直捲動為主）           │ 檢視器（選取時）       │
│                            │ stepId / type       │
│      [步驟卡]                │ 欄位依 type         │
│         │                  │ run / runFile       │
│      [步驟卡]──岔──[卡]      │                     │
│         │                  │                     │
│      [terminal]            │                     │
│                            │                     │
│  （底部：孤立步驟區）          │                     │
└────────────────────────────┴─────────────────────┘
```

窄螢幕：檢視器改 **bottom sheet**（或全幅疊層）；畫布仍垂直捲動。

### 4.2 主鏈與岔線

| 概念 | 規則 |
| --- | --- |
| **主鏈** | 自 `start` 沿主後繼（E6）向下排列；卡片水平置中（或固定主欄 x） |
| **岔線** | 非主後繼的出邊：自母卡向左或右短伸至子卡，再視需要接回主鏈或終端 |
| **邊標籤** | `await_ui`／`await_child` 標 signal／outcome 名；`choice` 標 expr 摘要或 `else`；`onError` 用區分樣式（例如虛線） |
| **孤立** | 自 `start` 不可達的步驟列於畫布底部「孤立」區；校驗應提示 |

### 4.3 步驟卡

最少顯示：

- `stepId`
- `type`（色或圖示區分六型）
- `title`（若有）
- 出邊摘要（主後繼＋岔數量）

### 4.4 互動（MVP 必備 vs 可延後）

| 互動 | MVP | 可延後 |
| --- | --- | --- |
| 選取步驟 → 檢視器編輯 | ★ | |
| 新增步驟（type 選單）／刪除 | ★ | |
| 編輯邊（改 `next`／`on`／`when`／`else`） | ★ | 檢視器＋卡底／側圓點拉線 |
| 邊中或卡下「＋」插入 | ★ | |
| 圖 ⇄ YAML 雙模 | ★ | |
| Validate／Save／Reload | ★ | |
| 「整理版面」寫入 `ui` | ★ | |
| 主鏈拖曳重排 | | Phase 3（已做：拖到主鏈插槽重接 primary） |
| 自由 2D 拖曳當主操作 | | 不鼓勵；可選微調 `ui.x`／`ui.y`（已做：未命中插槽時格點吸附） |
| Undo 堆疊 | | Phase 3 |
| 鍵盤（j/k、Del） | | Phase 3 |
| 在編輯器內試跑 | | **不做**（交給 runtime） |

### 4.5 縮放與捲動

- 預設縮放 100%；主要導航＝**垂直捲動**。
- 桌面可提供縮放按鈕；手機不依賴水平平移才能讀完主鏈。
- 勿預設「整圖塞進一屏」而把步驟壓到不可讀。

### 4.6 步驟 type → UI

| type | 卡上強調 | 檢視器重點 |
| --- | --- | --- |
| `action` | 腳本／builtin 摘要 | `run`｜`runFile`｜`builtin`（互斥規則）、`next`、`onError` |
| `await_ui` | 多出口 | `form`、`on`、`timeout` |
| `choice` | 多出口 | `when[]`、`else`（expr MVP 維持文字） |
| `timer` | 延遲摘要 | `delayMs`｜`at`、`next` |
| `await_child` | 子流程 | `spawn`、`input`、`on`／`next` |
| `terminal` | 終態樣式 | `outcome`、`summary` |

---

## 5. `ui` metadata 約定

定義語言允許步驟級 `ui`（執行忽略）。本編輯器建議使用：

| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| `x` | number | 水平偏移（岔線／微調）；主鏈可為 `0` |
| `y` | number | 垂直深度（越大越下） |
| `label` | string | 可選；覆寫卡上顯示（仍保留 `title` 語意） |
| `primaryNext` | string | 可選；覆寫主後繼 `stepId`（須為該步合法出邊） |

**規則：**

1. 缺 `x`／`y`：載入後以自動 layout **計算繪製**，但**不**寫回檔案，直到使用者按「整理版面」。
2. 「整理版面」：依 E6 重算全部（或選取子圖）`x`／`y` 並標記 dirty。
3. 不得把執行語意塞進 `ui`（例如 timeout、signal）。
4. 頂層定義亦可有 `ui`（畫布級；可選 `zoom`／`scroll` 等）；MVP 可忽略頂層 `ui`。

座標單位：實作自訂（建議邏輯格：主鏈每步 `y += 1`，岔線 `|x| >= 1`）；序列化用數字即可。

---

## 6. 資料流與往返

### 6.1 管線

```text
TOOL.readFile("workflow.yaml")
  → parse（YAML 1.2）
  → validate（workflow.v1 子集／對齊 runtime 規則）
  → 記憶體 AST
  → layout（尊重既有 ui 或臨時計算）
  → 使用者編輯（圖或 YAML 模）
  → validate
  → serialize YAML
  → TOOL.writeFile(..., expectedHash?)
  → 可選：寫 steps/<id>.js
```

### 6.2 記憶體 AST

- 與定義語言同形（頂層＋`steps` map）。
- JSON 僅可作內部／匯出備援，**不是**人類主編格式（對齊 DEC-034）。

### 6.3 圖 ⇄ YAML 雙模

| 狀態 | 行為 |
| --- | --- |
| 圖模編輯 | 更新 AST；YAML 模顯示由 AST 生成的預覽（可延遲） |
| YAML 模編輯 | 解析成功 → 換 AST 並刷新圖；失敗 → **鎖定圖模為唯讀／上次成功 AST**，並顯示 parse 錯誤列 |
| dirty | 任一模變更未存檔 |

### 6.4 序列化政策（MVP）

- 產出合法 `apiVersion: "1"`／`kind: Workflow` YAML。
- **可**重排 map 鍵序、**可**丟註解（E7）。
- **不得**默默刪除未知步驟欄位（前進相容：保留未識別鍵）。
- `run` 多行使用 `|` 塊標量（或同等可讀形式）。

### 6.5 腳本

| 操作 | 行為 |
| --- | --- |
| 編短碼 | 檢視器編輯 `run` |
| 抽外檔 | 將 `run` 改為 `runFile: steps/<stepId>.js`（或使用者選名），寫入檔案，清除 `run` |
| 開外檔 | grant 內 `readFile`／`writeFile`；無 grant 則提示 |

三者互斥規則與定義語言一致：`run`／`runFile`／`builtin`。

### 6.6 樂觀鎖

Save 時若 TOOL 支援 `hash`／`expectedHash`：衝突 → 不覆蓋，提示 Reload 或另存策略（MVP：提示重載後手動合併即可）。

---

## 7. 校驗

編輯器內校驗**不取代** runtime 載入校驗，但應盡力對齊同一規則集（可複製邏輯或未來抽共享模組；共享模組**不**得變成遊樂場依賴）。

### 7.1 MVP 必檢

- YAML 可解析；`apiVersion`／`kind`／`workflowId`／`start`／`steps` 存在且形狀正確
- `stepId` 符合 `^[a-z][a-z0-9_]*$`、唯一
- 每步 `type` ∈ 六型
- 所有邊目標（`next`、`on.*`、`when[].next`、`else`、`onError`、`timeout.next`、`start`）∈ `steps` 或顯式報錯
- `action`：`run`／`runFile`／`builtin` 至少其一；`run` 與 `runFile` 不並存
- `terminal` 無 `next`；`choice` 有 `when` 與 `else`
- `await_ui` 有非空 `on`

### 7.2 建議（可警告）

- 自 `start` 不可達步驟
- 無任何 `terminal` 可達
- `ui.primaryNext` 不是合法出邊

### 7.3 錯誤呈現

- 列表＋可點選跳到步驟／YAML 行（行號盡力）
- 機器碼可複用定義語言建議（如 `workflow_invalid_definition`），或編輯器前綴 `wfedit_*`（實作定；勿與 runtime 狀態碼語意衝突）

---

## 8. 與 `pg-workflow` 的協作

| 方 | 職責 |
| --- | --- |
| **pg-wfedit** | 讀寫定義；校驗；垂直 UX |
| **pg-workflow** | 引擎、游標、await_ui、實例監控；可保留簡陋文字編輯作後備 |
| **遊樂場** | `openTool`／tabs／grant |

建議（非遊樂場特化）：runtime UI 提供「用視覺編輯器開啟」——若本機已有 `pg-wfedit` 沙盒則 `openTool`；否則引導 `?open=sampot/pg-wfedit`。此邏輯活在 **Workflow SAM 內**，不是遊樂場選單硬編碼唯一入口。

一鍵開編輯器（取得工具沙盒後再掛）：

```
https://play.samkuo.me/?open=sampot/pg-wfedit&name=流程視覺編輯
```

---

## 9. 技術約束（小品形）

- 對齊其他 `pg-*`：可無建置或極薄打包；主語言 **JavaScript**。
- 畫布 MVP：**DOM 步驟卡 + SVG／Canvas 連線**；不預設引入完整 node-graph 框架（若引入須能離線、體積合理）。
- 不依賴遊樂場 workflow 特化 API。
- 單測：layout 主鏈／岔線、serialize 往返（語意等價）、validate 案例；可在編輯器 repo 內跑。

---

## 10. 無障礙與小螢幕

- 主鏈可僅靠垂直捲動讀完；關鍵操作（Save／Validate／選 type）觸控目標足夠大。
- 顏色不作為 type 的唯一區分（搭配文字或圖示）。
- 尊重 `prefers-reduced-motion`（若有動畫）。

---

## 11. 相關文件

| 文件 | 關係 |
| --- | --- |
| [PG-WORKFLOW-DEFINITION-SPEC.md](./PG-WORKFLOW-DEFINITION-SPEC.md) | IR／步驟語意；§12 編輯器路線 |
| [PG-WORKFLOW-PLAN.md](./PG-WORKFLOW-PLAN.md) | 交付邊界 |
| [PG-WFEDIT-PLAN.md](./PG-WFEDIT-PLAN.md) | 實作階段與驗收 |
| [PG-TOOLS-PLAN.md](./PG-TOOLS-PLAN.md) | Tool SAM／`env.TOOL` |
| [PG-MAIN-CONTENT-PLAN.md](./PG-MAIN-CONTENT-PLAN.md) | tabs／掛載 |
| [DEC-034](./DECISIONS.md#dec-034-playgrounds-workflow-定義與實例模型) | ADR |
| [GLOSSARY.md](./GLOSSARY.md) | 用語 |
