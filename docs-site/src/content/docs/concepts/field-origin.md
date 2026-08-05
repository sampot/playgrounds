---
title: 場與 origin
description: 子域切開本機狀態；無伺服器租戶庫。
---

**場網**＝`*.samkuo.me` 上同一份宿主程式。每個一級子域是一個**場**＝一個瀏覽器 **origin**。

因此：

- OPFS、密鑰庫、SW、介面偏好**不跨場共用**
- 沒有「註冊帳號再分配場」的伺服器租戶
- 搬家靠匯出／匯入 `.sam`（見 [沙盒與 .sam](/guides/sandboxes-and-sam/)）

**預設場**名是 `play`。`docs` 等保留名不當場——文件站在 [docs.samkuo.me](https://docs.samkuo.me/)。
