---
title: 從網址開啟
description: ?open= 深鏈契約；文件範例用 play.samkuo.me。
---

用 query 一次把遠端（或目錄）來源開進遊樂場：

```
https://play.samkuo.me/?open=<url-encoded 來源>
```

常見例子：

```
https://play.samkuo.me/?open=sampot/pg-steward&name=總管
```

## 參數（摘要）

| 參數 | 說明 |
| --- | --- |
| `open` | 必填。來源（GitHub 形 `owner/repo`、或允許的 URL 等——以現行宿主為準） |
| `as` | 可選。開啟角色／槽位（預設工作沙盒語意；詳見宿主） |
| `name` | 可選。顯示名 |
| `state` | 可選。`ask`／`none` 等狀態策略 |
| `fresh` | 可選。帶 `1` 時偏向新開 |

Boot 成功後宿主會清掉這些 query，避免重整重複匯入。

## 哪個場？

- **文件與部落格範例：** 一律寫 `https://play.samkuo.me/?open=…`
- **在某個場裡「複製開啟連結」：** 用當下的 `location.origin`（分享哪個場就開哪個場）

任意場：`https://<name>.samkuo.me/?open=…`（路徑根 `/`，不是舊的 `/playgrounds/`）。
