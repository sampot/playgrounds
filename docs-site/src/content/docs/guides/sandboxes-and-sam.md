---
title: 沙盒與 .sam
description: 沙盒單位、單頁小程式（SAM），以及匯出／匯入。
---

## 沙盒

遊樂場裡的活動單位叫**沙盒**（程式識別 `sandboxId`）。一個沙盒對應一份本機工作區與畫布上的執行結果。

防護邊界在瀏覽器 origin／OPFS，不是「再包一層桌面沙盒」的敘事。跨場（換子域）不共用儲存。

## SAM

沙盒裡跑的是 **SAM**（Single-page Application Module／單頁小程式）：至少有 `index.html` 入口；可選 `functions.js`（Infrastructure）、`controller.js`（Controller）。詳見 [SAM](/concepts/sam/)。

開源範本清單在場網 [小品型錄](https://play.samkuo.me/sam/)（`/sam/`）。

## 匯出／匯入

介面用語是「匯入／匯出沙盒」。檔案副檔名 **`.sam`**（內容為 ZIP，只接受 `.sam`）。

從舊場或另一個場搬家：

1. 在來源場匯出 `.sam`
2. 在目標場（例如 [play.samkuo.me](https://play.samkuo.me/)）匯入
3. 密鑰庫、WebAuthn、介面偏好須在**新 origin**重設——不會跟著 `.sam` 自動過去（密鑰庫內容預設也不進包裹）

## 整場重置

「重置遊樂場」會清光**目前這個 origin** 的本機遊樂場持久化，回到首次開啟的空場。這是介面操作，不是 Host API。
