---
title: 密鑰庫
description: 遊樂場級密文庫；每 origin 獨立。
---

密鑰庫是**遊樂場級**（不是單一沙盒）的密文存放。解鎖後，現行 Agent 可透過每支 secret 的 binding 取值；**值不會**進 `.sam` 匯出。

## 解鎖

在遊樂場介面操作：密碼，或已登錄的 WebAuthn PRF（裝置支援時）。重新整理頁面會回到鎖定。Host API 只提供狀態與名稱／中繼資料查詢，**沒有**代打外網或整包 `env.SECRETS`。

## 與場網

每個場（每個 origin）各自一份密鑰庫與 WebAuthn。換到 `play` 或其他 `<name>` 要重新設定——這是刻意的 origin 切割，不是漏遷移。

細節契約以 repo 內 DEC-029／相關計劃為準；公開摘要見 [Host API](/host-api/)。
