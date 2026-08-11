# Playgrounds Workflow 計劃

本檔對齊 [PG-WORKFLOW-DEFINITION-SPEC.md](./PG-WORKFLOW-DEFINITION-SPEC.md) 與 **DEC-034** 的**交付邊界**（非遊樂場 Phase 表）。

一句話：**workflow.v1 規格在本站；Runtime＝獨立 Agent SAM（`sampot/pg-workflow`）；Visual Editor＝獨立 Tool SAM（`sampot/pg-wfedit`）；遊樂場零特化。**

**狀態：** 2026-08-04 — 遊樂場零特化；`pg-workflow` 範本落地；`pg-wfedit` 規格已立、實作另開。

---

## 交付原則

| 層 | 放哪 |
| --- | --- |
| **定義語言規格** | 本站 SPEC（DEC-034） |
| **Runtime（引擎＋狗糧流程＋實例 UI）** | **`sampot/pg-workflow`**（Agent 形 SAM；`sam:needs-controller`） |
| **Visual Editor** | **`sampot/pg-wfedit`**（Tool SAM；`env.TOOL`＋grant 編宿主定義；不跑引擎）— 見 [WFEDIT-SPEC](./PG-WFEDIT-SPEC.md)／[WFEDIT-PLAN](./PG-WFEDIT-PLAN.md) |
| **Playgrounds 遊樂場介面** | **不**內建範本／編譯 hook／引擎／設計器 |

架構價值：Workflow runtime／編輯器與小品相同——獨立 repo＋`?open=`；遊樂場只提供通用 Agent／Tool 能力。

---

## 遊樂場明確不做

- 新建選單 workflow starter、YAML save hook、嵌入引擎、內建視覺設計器
- 將 **runtime** 做成 Tool SAM 或遊樂場全域服務

通用能力（`ensureAgentController`、Fleet、`?open=`、`openTool`）**不**算 workflow 特化。

---

## Repo 對照

| Repo | 角色 |
| --- | --- |
| `sampot/pg-workflow` | Runtime 範本（content-review 狗糧） |
| `sampot/pg-wfedit` | Visual Editor Tool SAM（垂直畫布；規格見 WFEDIT-SPEC） |

一鍵開（runtime）：

```
https://play.samkuo.me/?open=sampot/pg-workflow&name=工作流程
```

一鍵開（編輯器；取得沙盒後再對流程宿主 `openTool`）：

```
https://play.samkuo.me/?open=sampot/pg-wfedit&name=流程視覺編輯
```

---

## 與本站文件的關係

| 文件 | 角色 |
| --- | --- |
| WORKFLOW-DEFINITION SPEC | 語言／實例模型；編輯器路線 §12 |
| WFEDIT-SPEC／WFEDIT-PLAN | Visual Editor 契約與階段 |
| 本 PLAN | 交付邊界與 repo 指針 |
| DEC-034 | ADR |

---

## 驗收

- [x] Playgrounds **無** workflow 內建範本與 save hook
- [x] myblog **無** `playgrounds/workflow*` 執行碼／starter
- [x] 獨立 [`sampot/pg-workflow`](https://github.com/sampot/pg-workflow) 可經 `?open=` 使用
- [x] `/sam/` 小品型錄上架（`kind: agent`／系列「流程」）
- [x] Visual Editor 規格（[WFEDIT-SPEC](./PG-WFEDIT-SPEC.md)／[WFEDIT-PLAN](./PG-WFEDIT-PLAN.md)）
- [x] Visual Editor Tool SAM Phase 0–2（[`sampot/pg-wfedit`](https://github.com/sampot/pg-wfedit)；見 WFEDIT-PLAN）
