---
title: SAM
description: Single-page Application Module／單頁小程式。
---

**SAM**＝Single-page Application Module（單頁小程式）。沙盒裡可執行的模組：

| 層 | 檔案 | 角色 |
| --- | --- | --- |
| UI | `index.html`（＋前端資源） | 人機入口；定義上必備 |
| Infrastructure | `functions.js` | Workers 形 HTTP（畫布經 `/api`） |
| Controller | `controller.js` | 常駐邏輯：mailbox、排程、`onCommand` 等 |

宣告放在 `index.html` `<head>` 的 **`sam:*` meta**。不必短小——大型前端仍算 SAM。勿與 AWS SAM 混淆。

有 Controller、以 Agent 形態常駐執行時，仍是 SAM，不是另一種產品。
