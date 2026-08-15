# Playgrounds 純玩版：玩家 UX 打磨（go-client）

> **狀態：** Draft（2026-08-15）— **階段 1–3（P0–P2）已落地**  
> **權威決策：** 從屬 [DECISIONS.md](./DECISIONS.md) **DEC-050**；不另開 DEC  
> **相關：** [PG-GO-CLIENT-PLAN.md](./PG-GO-CLIENT-PLAN.md)、[PG-GO-BOSS-FLASH-PLAN.md](./PG-GO-BOSS-FLASH-PLAN.md)（老闆氣泡歡迎，階段 A–C 已落地）、[PG-GO-AUTH-PLAN.md](./PG-GO-AUTH-PLAN.md)、`.cursor/rules/no-native-dialogs.mdc`、`.cursor/rules/mobile-first-ux.mdc`、[GLOSSARY.md](./GLOSSARY.md)

一句話：在 **DEC-050 產品契約不變**（無編輯、Invite 臨時、分享＝`/s/`、更多＝本機溢流）前提下，修一輪**玩家可感的摩擦**：死胡同狀態、發現性、窄屏主 CTA、邀請／分享語意，以及 chrome 與老闆世界觀的小缺口。

---

## 1. 動機

- go 主路徑（`/`、`/s/`、`/i/`、離線、分享、登入）已可用；剩餘問題多半是**狀態不清、發現成本高、窄屏藏主操作**，不是缺大功能。
- 老闆歡迎氣泡（[PG-GO-BOSS-FLASH-PLAN.md](./PG-GO-BOSS-FLASH-PLAN.md) A–C）已立起櫃檯隱喻；週邊仍有系統腔／開發者欄位／chrome 標籤「站群」等斷點。
- 本刀只打磨**既有面**，不重開型錄貨架、不改 Invite／離線產品規則。

---

## 2. 目標

- 消除明確**死胡同**與**灰掉卻佔位**的控件。
- 首頁搜尋對齊玩家心智（標題優先，不限 id）。
- `/apps` 窄屏仍能**直接開玩**。
- 邀請同意面只講玩家需要的資訊。
- 遊玩中回饋與換片可被發現（不與 chrome 自動隱藏打架）。
- 用語／a11y 對齊老闆＝左、玩家＝右；遵守 mobile-first 與禁原生 dialog。

---

## 3. 非目標

- 在 go 做完整型錄瀏覽／filter／貨架（DEC-050 非目標不變）。
- Invite `/i/` 可離線、可分享當傳閱入口。
- 強制 onboarding modal、多步教學。
- 重做視覺主題或整頁改版。
- 場殼 `play` UX 同步。
- 老闆 Phase D 全做完（子池／碎念／全 flash 改口吻）——見老闆計劃；本刀只收**相鄰** chrome 項。

---

## 4. 現況摩擦（盤點摘要）

| 面 | 問題 | 主要檔 |
| --- | --- | --- |
| `/i/` | `decline()` 後 phase 回 idle，UI 像仍在「讀取邀請」 | `guestRuntime.ts`、`i/[shortId]/+page.svelte` |
| `/` | `searchGoCatalogById` 只配 id；placeholder 教玩家記 id | `goCatalog.ts`、`+page.svelte` |
| `/apps` | `@media` 藏 `.play-btn` 至 ≥42rem；手機主 CTA 消失 | `apps/+page.svelte` |
| chrome | Invite 時「分享」`disabled` 仍露；`aria-label="站群"` | `Chrome.svelte` |
| `/i/` 同意 | 露 `protocolId`／`samSource` | `i/[shortId]/+page.svelte` |
| `/s/` 換片 | 規格有「下一個」；實作多在「更多→試試這些」，chrome 又自動藏 | `Chrome.svelte`、`GoMorePanel`、`.hdr-next` CSS 殘留 |
| flash | `canvasActive`＋chrome hidden 時 flash 一併藏 | `Chrome.svelte` |
| 首頁 | 加主畫面／說明幾乎只經「更多」 | `+page.svelte`、`/help` |
| profile | 面板露 raw `user_id` | `GoProfilePanel.svelte` |
| 操作面 | More 與 `GoGameDrawer` 重疊 clear／update | 兩面板 |

---

## 5. 定案（按優先）

### 5.1 P0 — 死胡同與主路徑（硬）

#### A. 邀請取消狀態

- `decline()` 不得落回與「載入中」無法區分的 idle。
- 新增明確 phase（建議 `cancelled`）或同等 UI 分支：文案「已取消」、主 CTA「回純玩首頁」、次要「重新開啟此邀請」（重整或再 resolve）。
- 禁 `alert`。

#### B. 首頁搜尋＝標題＋id

- 搜尋比對 `title`／`blurb`／`id`（大小寫不敏感；既有 listed／game 過濾規則不變）。
- Placeholder／空態改玩家語氣（例：「搜尋遊戲名稱或 id」）；勿暗示「只能記 id」。
- 函式可改名或加 `searchGoCatalog`；舊 `searchGoCatalogById` 可薄轉發。**TDD。**

#### C. `/apps` 窄屏可玩

- 窄屏**必須**有開玩路徑：露「開始」、或整列／標題即 `/s/<id>` 主連（熱區足夠）。
- 「管理」可保留；不得變成手機上唯一可見動作。

#### D. Invite 不露「分享」

- `mode === "invite"`：**不渲染**分享鈕（非 disabled）。
- 標題／tooltip 解釋可刪（無控件即無需解釋）。

#### E. 邀請同意面玩家化

- 預設不展示 `protocolId`、`samSource`（或僅 `#` 開發／次要摺疊；預設關）。
- 有型錄對應時秀小品 **title**（＋可選一句 blurb）；無對應時用中性「這一場」／既有邀請文案。
- 保留 in-app 瀏覽器提示（既有幫助路徑）。

### 5.2 P1 — 遊玩中可發現性

#### F. 換片入口

- `kind: game` 的 `/s/`：玩家不開「更多」也能換下一款或看到「試試這些」。
- **定案：還原 Header「下一個」**（對齊主計劃 §5.6；沿用既有 `.hdr-next` 樣式）。「試試這些」仍可在「更多」第二段。
- Invite `/i/` 仍**不**露換片（硬）。

#### G. Chrome 隱藏時仍見 flash

- 遊玩態操作回饋（複製、離線成功等）在 chrome auto-hide 時**仍可見**短時 toast（可維持氣泡家族，不強制再拉出整條 header）。
- 歡迎類僅首頁，不受本條影響。

#### H. 首頁輕連到說明

- 首頁一條次要連（非第二 hero）：「使用說明」或「加入主畫面」→ `/help`。
- 不新增 modal；不擋推薦 CTA。

### 5.3 P2 — 打磨

#### I. Chrome a11y／觸控

- Header `aria-label`：改「純玩」／「山姆鍋遊樂場」等店招語，勿「站群」。
- 窄屏主操作熱區盡量 ≥44×44（對齊 mobile-first 規則）；必要時收文案或溢流，勿再縮到難點。

#### J. Profile

- 玩家面板預設不強調 raw `user_id`（可摺疊／小字「支援用」或省略）；保留顯示名／role／登出。

#### K. More vs Game drawer

- 文案或分段標清：drawer＝**這一局／這款**；更多＝**殼＋本機**。不強制合併實作（可只改標籤／說明）。

#### L. 老闆隱喻（交接）

- 離線／已登入歡迎子池、說話微動畫、操作 flash 老闆口吻 → **[PG-GO-BOSS-FLASH-PLAN.md](./PG-GO-BOSS-FLASH-PLAN.md) 階段 D**；本計劃不重複開刀，僅要求 chrome 用語不與此衝突（§5.3 I）。

---

## 6. UX 硬規則（站群）

- **禁止** `alert`／`confirm`／`prompt`；破壞性操作維持頁內確認。
- **Mobile-first：** 預設窄屏可用；`min-width` 再增強。
- **Svelte 5 runes。**
- 不改變 DEC-050 URL／模式契約（`/i/` 臨時、`/s/` 傳閱、更多≠型錄）。

---

## 7. 階段與完成依據

| 階段 | 內容 | 完成依據 |
| --- | --- | --- |
| **0. 規格** | 本文件 | **完成** |
| **1. P0** | §5.1 A–E | **完成**（單元測＋ check） |
| **2. P1** | §5.2 F–H | **完成**（Header「下一個」；藏 chrome 仍見 toast；首頁 `/help` 連） |
| **3. P2** | §5.3 I–K（L→老闆計劃） | **完成**（chrome a11y／熱區；profile 支援用代號；More／drawer 標籤） |

建議實作順序：**1 → 2 → 3**；P0 可同 PR 或緊鄰 commit。

---

## 8. 驗收清單

**P0**

- [x] `/i/` 取消 → 明確已取消＋回首頁；不再像載入中（`phase: cancelled`；手測待）
- [x] 首頁搜「打磚塊」類標題可命中；只打 id 仍可（`searchGoCatalog`）
- [x] 窄屏 `/apps` 可不開「管理」就進 `/s/<id>`（「開始」預設可見）
- [x] `/i/` chrome **無**分享鈕
- [x] 同意面無預設 `protocolId`／`samSource`；有 title 時看得到小品名
- [x] `npm test`／`go:check` 綠

**P1**

- [x] game `/s/` 換片入口不依賴「先開更多」（Header「下一個」）
- [x] `/i/` 仍無換片
- [x] 遊玩中 chrome 隱藏時，操作 flash 仍短暫可見
- [x] 首頁有通往 `/help` 的次要連

**P2**

- [x] Header 可及名稱非「站群」（`山姆鍋遊樂場`）
- [x] 窄屏主鈕觸控可接受（≥44×44 方向；compact 略收至 2.5rem）
- [x] Profile 不強迫讀 `user_id`（摺疊「支援用代號」）
- [x] More／drawer 標清殼層本機 vs 這一款

---

## 9. 用語對照

| 用 | 不用 |
| --- | --- |
| 已取消、回純玩首頁、搜尋遊戲名稱 | 正在讀取（取消後）、只能輸入 id、邀請中分享（灰鈕） |
| 小品名、這一場 | 協定 xxx、來源 raw URL（預設） |
| 純玩／遊樂場 chrome | 站群（玩家面 aria） |

---

## 10. 變更紀錄

| 日期 | 變更 |
| --- | --- |
| 2026-08-15 | 初版 Draft：依 go-client UX 盤點收 P0–P2；與老闆 flash 計劃分工；DEC-050 契約不變 |
| 2026-08-15 | **P0 落地：** `cancelled` 邀請態；`searchGoCatalog` 標題／blurb／id；apps 窄屏「開始」；邀請隱藏分享；同意面小品名 |
| 2026-08-15 | **P1 落地：** Header「下一個」；chrome 隱藏仍見 flash toast；首頁「使用說明 · 加入主畫面」→ `/help`；F 定案鎖選項 1 |
| 2026-08-15 | **P2 落地：** chrome `aria-label`；窄屏熱區；profile `user_id` 摺疊；More「殼層 · 本機與設定」／drawer「這一款」 |
