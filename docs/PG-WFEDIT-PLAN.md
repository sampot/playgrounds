# Playgrounds Workflow Visual Editor 實作計劃

本檔是 [PG-WFEDIT-SPEC.md](./PG-WFEDIT-SPEC.md) 的落地階段表。IR 見 [PG-WORKFLOW-DEFINITION-SPEC.md](./PG-WORKFLOW-DEFINITION-SPEC.md)；交付邊界見 [PG-WORKFLOW-PLAN.md](./PG-WORKFLOW-PLAN.md)。權威決策：**DEC-034**（編輯器＝Tool SAM）。

一句話：**`sampot/pg-wfedit` 垂直投影 `workflow.v1`；grant 寫回宿主定義；分階段做出可開環編 content-review。**

**狀態：** 2026-08-04 — `sampot/pg-wfedit` Phase 0–2 已落地；Phase 3 主鏈拖曳重排已做，其餘體驗項有餘力再做。

---

## 目標與非目標

### 目標（本計劃 Phase 0–2）

- 獨立 Tool SAM：`env.TOOL` 讀寫 `workflow.yaml`（建議含 `steps/`）。
- 垂直主鏈＋岔線；圖／YAML 雙模；Validate／Save。
- 對 `pg-workflow` 狗糧定義開環（改圖 → 存 → runtime 重載）。
- `/sam/` catalog 可選上架；`?open=sampot/pg-wfedit`。

### 非目標（本計劃不做）

- 遊樂場內建設計器或 YAML save hook。
- 編輯器內試跑／持游標。
- 註解完美保留、完整 graph 框架、協同編輯。

---

## 階段

| 階段 | 主題 | 完成定義 | 狀態 |
| --- | --- | --- | --- |
| **0. 骨架** | Tool meta；讀寫 `workflow.yaml`；垂直卡片堆（可先無自由座標）；選取改 `title`／`next`；Validate 列表；Save | 無 grant 時唯讀或明確錯誤；有 grant 可存回 | **已完成** |
| **1. 可編圖** | 六型新增／刪／改 type；邊編輯；自動 TB layout；「整理版面」寫 `ui`；圖⇄YAML 雙模（壞 YAML 鎖定圖） | SPEC §4–§6；單元測 layout／validate | **已完成** |
| **2. 腳本與狗糧** | inline `run`；抽 `runFile`；對 content-review 開環；README；catalog／`?open=` | 手動：掛 tool → 改 → 存 → runtime 重載後語意正確 | **已完成** |
| **3. 體驗（有餘力）** | 主鏈拖曳重排、undo、窄屏 bottom sheet、鍵盤 | 不擋 0–2 驗收 | **進行中**（拖曳重排／ui 微調已做） |

---

## Repo 與站台指針

| 位置 | 職責 |
| --- | --- |
| `sampot/pg-wfedit`（另 repo） | SAM 實作（`index.html`、編輯邏輯、測試） |
| 本站 SPEC／本 PLAN | 契約與階段 |
| `src/data/samCatalog.ts` | 上架時加 `kind: tool`／系列「流程」 |
| `pg-workflow` | 可選：UI 入口呼叫 `openTool`（SAM 內，非遊樂場特化） |

一鍵開：

```
https://play.samkuo.me/?open=sampot/pg-wfedit&name=流程視覺編輯
```

---

## 驗收（Phase 0–2）

- [x] 獨立 repo 可經 `?open=` 載入為普通沙盒（`sampot/pg-wfedit`）
- [x] 對含 `workflow.yaml` 的宿主 `openTool`＋grant 後可讀寫定義
- [x] 垂直主鏈可捲動讀完；岔線不迫使水平長距平移
- [x] 圖與 YAML 同一 AST；Save 後 runtime 能載入（合法定義）
- [x] 不嵌入引擎、不寫 cursor／Durable
- [x] `/sam/` 型錄上架（`kind: tool`／系列「流程」）
- [x] 一鍵抽 `runFile`；`pg-workflow` UI「視覺編輯」→ `openTool`

---

## 相關文件

| 文件 | 角色 |
| --- | --- |
| [PG-WFEDIT-SPEC.md](./PG-WFEDIT-SPEC.md) | 產品／UX／往返契約 |
| [PG-WORKFLOW-DEFINITION-SPEC.md](./PG-WORKFLOW-DEFINITION-SPEC.md) | `workflow.v1` |
| [PG-WORKFLOW-PLAN.md](./PG-WORKFLOW-PLAN.md) | 交付邊界 |
| [PG-TOOLS-PLAN.md](./PG-TOOLS-PLAN.md) | Tool SAM |
| [DEC-034](./DECISIONS.md#dec-034-playgrounds-workflow-定義與實例模型) | ADR |
