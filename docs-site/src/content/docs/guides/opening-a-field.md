---
title: 開場與場網
description: 預設場 play.samkuo.me，以及任意一級子域當獨立場。
---

遊樂場跑在瀏覽器裡。正式部署用 Cloudflare Workers，場網是 `*.samkuo.me`：同一個程式、不同子域＝不同 origin（本機 OPFS、密鑰庫、Service Worker 各自獨立）。

## 預設場

日常預設與文件範例都用：

[https://play.samkuo.me/](https://play.samkuo.me/)

畫布虛擬站在同一 origin 的 `/canvas/<sandboxId>/…`。

## 自開一場

任意符合命名規則的一級子域都可以當獨立場（wildcard 就緒後）：

`https://<name>.samkuo.me/`

`<name>` 只是 origin 標籤，不是雲端專案帳號。換子域＝空場；**不會**自動搬舊場資料。

## 保留名

下列子域**不是**一般實驗場（場網 Worker 會拒）：`www`、`blog`、`api`、`docs`、`old-blog` 等。

`docs.samkuo.me` 是本文件站，不會載入遊樂場介面。

## 舊場

`https://samkuo.me/playgrounds/` 仍可開，但是**凍結快照**：不再跟場網同步功能。資料綁 origin——請匯出 `.sam` 後到 `play`（或你選的場）匯入。見 [沙盒與 .sam](/guides/sandboxes-and-sam/)。

## 開源與自架

宿主程式在 [`sampot/playgrounds`](https://github.com/sampot/playgrounds)。過程分享在 [我是山姆鍋](https://samkuo.me/)。工程決策見 [決策索引](/decisions/)。「Playgrounds」只是程式／repo 識別，不是產品品牌。
