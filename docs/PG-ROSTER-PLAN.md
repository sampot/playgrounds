# Playgrounds 跨場 Roster／Avatar 計劃（DEC-045）— **已取消**

> **狀態：** **Cancelled**（2026-08-16）  
> **權威決策：** [DECISIONS.md](./DECISIONS.md) **DEC-045**（薄 signaling／peer 硬約束仍有效；**Avatars／線上 tab 產品面已撤銷**）  
> **取代方向：** Session **邀請與加入**由 **SAM 應用＋場 Shell** 一併提供（Platform Invite／consent／放大畫布；見 [PG-PLATFORM-API-PLAN.md](./PG-PLATFORM-API-PLAN.md)、[PG-INVITE-E2E-MVP.md](./PG-INVITE-E2E-MVP.md)、[PG-GO-CLIENT-PLAN.md](./PG-GO-CLIENT-PLAN.md)）

---

## 為什麼取消

側欄 **「線上」／Avatars tab**（名冊列表、投影 Avatar 卡片、OOB `#roster=`／相機掃 QR／手動貼 wire 等人機面）不再是產品路徑。跨場對玩改走：

1. **Host SAM** 經 Shell 鑄 Platform Invite（分享 QR／短連結）
2. **Guest** 經 Shell consent（或 go 純玩版）加入
3. 底層仍用 Roster **transport**（WebRTC、樣板 SDP、DataChannel session bridge）——**不是**獨立「線上」IDE 分頁

本計劃文件保留為歷史紀錄；**勿**再依本文件實作 Avatars tab／投影名冊 UX。

---

## 仍有效（移出本計劃產品面）

| 項 | 說明 |
| --- | --- |
| 薄 signaling | 每握手槽 1× offer／answer；非 trickle；無資料面中繼（DEC-045／047） |
| Platform Invite | `#pg=`／短鏈；加入者 offer；見 DEC-047 |
| Session bridge | 遠端入座沿用 DEC-023；經 DataChannel；型錄 lazy install |
| 程式庫位置 | `src/components/playgrounds/roster/*`（peer／wire／QR 編碼／session bridge）；殼內 **隱藏** mount，無側欄 tab |

## 已撤銷

| 項 | 說明 |
| --- | --- |
| 側欄 **線上** tab（鍵 `avatars`） | 與 Files／總管並列的第三 tab |
| 線上名冊 UI／identicon 卡片／投影 iframe 呈現面 | 產品 UI |
| OOB `#roster=` 邀請連結作為主路徑 | 改 Platform／SAM＋Shell |
| 本計劃 Phase 4+ 剩餘 Avatars UX | 不再推進 |

---

## 修訂紀錄（摘要）

| 日期 | 變更 |
| --- | --- |
| 2026-08-05…08 | 原計劃 Phase 0–4.2 落地（見 git 歷史） |
| 2026-08-16 | **取消** Avatars／線上 tab 產品面與本計劃；session 邀請／加入＝SAM＋Shell |
