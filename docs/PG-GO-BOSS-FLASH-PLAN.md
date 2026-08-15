# Playgrounds 純玩版：老闆頭像 × 對話氣泡 flash

> **狀態：** Draft（2026-08-15）— 階段 A–C 已實作；瀏覽器手測待完成  
> **權威決策：** 從屬 [DECISIONS.md](./DECISIONS.md) **DEC-050**（純玩版 `go.samkuo.me`）；不另開 DEC  
> **相關：** [PG-GO-CLIENT-PLAN.md](./PG-GO-CLIENT-PLAN.md)（chrome／flash）、[PG-GO-AUTH-PLAN.md](./PG-GO-AUTH-PLAN.md)（登入 flash 競態）、`.cursor/rules/no-native-dialogs.mdc`、`.cursor/rules/mobile-first-ux.mdc`、[GLOSSARY.md](./GLOSSARY.md)

一句話：**Header 左上角 mark（favicon／人物頭像）＝遊樂場老闆**；頁內 flash 以 **RPG 對話氣泡**呈現，像老闆在講話。玩家**同一瀏覽器 session**（`sessionStorage` 生命週期）**首次進入首頁 `/`** 時，從文案池抽一句歡迎詞顯示一次；池要夠大、跨 session 避開剛講過的，避免很快膩。

---

## 1. 動機

- go chrome 已有像素風字標（`GoWordmark`）與 flash 條／toast；canvas 遊玩態的 `chrome-flash--toast` 已具硬邊氣泡＋尾巴＋呼吸閃爍，但**隱喻未寫死**：左上 mark 易被當成「站標／favicon」，flash 易被當成系統 toast。
- 把 mark 定位成**老闆頭像**、flash 定位成**老闆台詞**，可低成本強化「遊樂場／RPG 櫃檯」世界觀，且不新增教學 modal、不阻玩。
- 單一句歡迎詞重複出現會迅速疲勞；需要**文案池＋抗重複**，仍維持「每 session 首頁只講一次」的克制。

---

## 2. 目標

- **角色契約（硬）：** 左上 mark＝老闆；右側 profile＝玩家通行證身分（DEC-052）。兩者勿在文案／a11y 上混稱。
- **歡迎 flash：** 同一 tab session 內，玩家**第一次**落到首頁 `/` 時顯示一句歡迎；之後同 session 再回 `/` **不再**歡迎。
- **文案池：** ≥12 句通用歡迎／輕提示；可選情境子池（離線、已登入）；抽選避開最近用過的 index。
- **視覺：** 非遊玩頁（至少首頁歡迎）的 flash 亦呈**從 mark 長出的對話氣泡**（尾巴對準頭像），與 canvas toast 同一家族；勿只在遊玩態才像在講話。
- **通路不變：** 仍走既有 `chromeSession.setFlash`；禁止 `alert`／`confirm`／強制點擊繼續的對話框。

---

## 3. 非目標

- 完整角色系統、表情 atlas、語音、打字機逐字、分支對話樹。
- 強制 onboarding／多步教學／阻斷點擊的 modal。
- 同 session 每次回首頁都換句歡迎（吵）。
- 把所有操作成功／失敗 flash **一次改完**為老闆口吻（可列為後續；本刀以歡迎＋視覺錨定為主）。
- 點 mark 開啟說明面或第二套選單（mark 仍＝回首頁；已在首頁時的「輕互動碎念」列可選後續）。
- 跨裝置／跨瀏覽器同步「已聽過哪些句」（僅本機 storage）。
- 場殼 `play` 套用同一老闆隱喻（本刀只限 go-client）。

---

## 4. 角色對位

| UI | 是誰 | 不是 |
| --- | --- | --- |
| Header 左 **mark**（`/favicon.svg`） | 遊樂場**老闆**頭像 | 玩家；系統底圖裝飾 |
| Header **字標**（`GoWordmark`） | 店招「山姆鍋遊樂場」 | 老闆本人 |
| Header 右 **profile** | **玩家**身分／通行證 | 老闆；場主後台 |
| **flash／氣泡** | 老闆台詞（本刀歡迎；既有操作回饋可漸進改口吻） | 瀏覽器／HTTP 錯誤原文 |

用語：老闆／櫃檯／入座／通行證／純玩；避免 SaaS「通知中心」「系統公告」。

---

## 5. 歡迎：生命週期與觸發

### 5.1 Session 定義（硬）

與瀏覽器 **`sessionStorage` 同生命週期**（每 tab 一份；關 tab／視窗即失；重新開 tab＝新 session）。**不**用 `localStorage` 當「本 session 已歡迎」旗標。

| Key（建議） | Storage | 用途 |
| --- | --- | --- |
| `pg_go_boss_welcomed` | `sessionStorage` | 本 session 已顯示過首頁歡迎（有值即可，如 `"1"`） |
| `pg_go_boss_welcome_recent` | `localStorage` | JSON 陣列：最近用過的文案 index（最多 3 個），供跨 session 抗重複 |

Analytics 既有 `pg_go_analytics_session` **不共用**；歡迎旗標獨立。

### 5.2 觸發條件（硬）

同時滿足才歡迎：

1. Client 端、`pathname === "/"`（首頁；不含 `/help`、`/apps`、`/s/…`、`/i/…`）。
2. `sessionStorage` **無** `pg_go_boss_welcomed`。
3. 瀏覽器能力閘未擋（與 layout 既有 unsupported 一致；不支援時不講）。

觸發後：**先**寫入 `pg_go_boss_welcomed`，**再** `setFlash`（避免 Strict／重掛雙觸發講兩次）。

### 5.3 不觸發

- 同 session 第二次之後進 `/`。
- 深鏈直達 `/s/`、`/i/`、`/apps`、`/help`（未先經首頁）——**不**在那些頁補歡迎；玩家之後第一次進 `/` 仍可講一次。
- `prefers-reduced-motion`：**仍顯示文案**；僅可省略說話微動畫（見 §7）。

### 5.4 與登入 flash 競態

`+layout` `onMount` 會 `goAuth.initFromLocation()`，redeem 成功可能 `setFlash("已登入")`，與首頁歡迎爭同一 `chromeSession.flash`（後寫蓋前寫）。

**本刀定案：**

| 情況 | 行為 |
| --- | --- |
| 本導航將／已顯示登入成功或登入失敗 flash | **跳過**本 session 歡迎（仍寫 `pg_go_boss_welcomed`，避免稍後回首頁又講） |
| 無 provision／登入 flash | 正常歡迎 |

實作可：歡迎延遲一短拍（如 0–300ms）讀當前 flash／auth busy；或 `goAuth.initFromLocation` resolve 後再決定。**禁止**兩句排隊輪播（本刀不做 flash queue）。

### 5.5 時長

| 類型 | `setFlash` ms（建議） |
| --- | --- |
| 歡迎（池內句子） | **3800**（可調；長於預設 2200） |
| 既有操作回饋 | 維持現況（多為 2200／3200） |

---

## 6. 文案池與抽選

### 6.1 模組

建議：`go-client/src/lib/goBossWelcome.ts`（純函式＋常數；TDD）。

- `GO_BOSS_WELCOMES: readonly string[]` — 通用池，**初版 ≥12 句**。
- 可選：`GO_BOSS_WELCOMES_OFFLINE`、`GO_BOSS_WELCOMES_SIGNED_IN` — 子池；與通用合併或加權，**勿**讓情境變成「每次離線同一句」。
- `pickBossWelcome(opts): { text: string; index: number }` — 可測：注入 `random`、`recentIndices`、`offline`、`signedIn`。

### 6.2 抽選規則（硬）

1. 建立候選集合：預設＝通用池；若 `navigator.onLine === false` 可併入離線子池；若已登入可併入登入子池（index 空間需穩定：建議各池分開、回傳時帶 `poolId`+`index`，或單一扁平陣列＋tag）。
2. 排除 `recent` 中的 index（若排除後為空，則忽略 recent，從全池抽）。
3. 均勻隨機（或注入 RNG）取一句。
4. 更新 `localStorage` recent：將本次 index 推入，保留最近 **3** 個。

### 6.3 語氣（硬）

- 老闆對玩家說話：短、可掃完、一句一意。
- 可用：歡迎光臨、櫃檯、純玩、通行證、入座、小品、離線／主畫面輕提示。
- 避免：HTTP 狀態、SaaS 腔、長教學、命令式多步驟。
- 一句建議 ≤ ~40 中文字（窄屏氣泡不換行爆炸；可軟性換行但不拆兩則 flash）。

### 6.4 初版文案草案（實作可微調；測試鎖「池長度」與抽選行為，不鎖全文）

**通用：**

1. 歡迎光臨山姆鍋遊樂場！挑一個小品就能玩。
2. 進來坐。下面隨便點，不用報到。
3. 今日營業中——純玩專區，打開就能衝。
4. 老闆在櫃檯。想試哪一款？往下挑就行。
5. Let's dash, go, and play——先選一個再說。
6. 遊樂場開著。分數留在你這台，我不管帳。
7. 新面孔也歡迎。掃一眼推薦，點進去就對了。
8. 別客氣，這不是後台——這裡只負責玩。
9. 常玩的可以加到主畫面，下次少繞一步。
10. 造訪過的小品，斷線也能從「更多」再開。
11. 邀請短連結是臨時的，別當書籤收藏。
12. 用 LINE 內建瀏覽器怪怪的？換系統瀏覽器通常就好。

**離線子池（可選）：**

- 線路不太穩？已下載的還能從「更多」開。
- 店裡燈還亮著。有離線包的，照常玩。

**已登入子池（可選）：**

- 通行證亮著。想找人對弈再跟我說。
- 入座過的旅客——今天想單機還是約戰？

---

## 7. 視覺與 a11y

### 7.1 氣泡錨定（本刀）

| 態 | 現況 | 本刀 |
| --- | --- | --- |
| `canvasActive` toast | 已有 `chrome-flash--toast`＋上指尾巴 | 維持；尾巴宜視覺上靠近 mark（可微調 `left`） |
| 非遊玩（首頁等） | 全寬底色條、無尾巴 | **歡迎與之後通用 flash**：改為（或並加）錨定 mark 的氣泡樣式，與 toast 同家族 |

硬規則：氣泡**不**遮死主 CTA（首頁推薦列）；窄屏寬度 `calc(100% - …)`、可多行；`role="status"` 維持。

### 7.2 Mark 語意

- `alt`／可及名稱：建議「遊樂場老闆」或「山姆鍋（老闆）」；`title` 仍可「純玩首頁」。
- 字標連與 mark 連皆可回 `/`（現況保留）。

### 7.3 說話微動畫（可選、同刀或緊接）

- flash 可見期間：mark 極輕 bounce／眨眼；結束即停。
- 尊重 `prefers-reduced-motion: reduce` → 無位移動畫。

### 7.4 明確不做（本刀）

- 多表情切換檔、點頭像開對話 tree、氣泡內按鈕。

---

## 8. UX 硬規則（對齊站群）

- **禁止原生 dialog**；歡迎不是破壞性操作，**禁止**多一層「確定」。
- **Mobile-first：** 氣泡可讀、不依賴 hover；熱區既有 mark ≥44×44 維持。
- **不阻玩：** 無須點氣泡才能選遊戲；自動消失。
- **Svelte 5 runes：** 新 store／頁面邏輯用 runes。

---

## 9. 實作輪廓

| 項 | 建議 |
| --- | --- |
| 文案＋抽選 | `goBossWelcome.ts`＋`goBossWelcome.test.ts`（TDD：池長、排除 recent、空 recent fallback） |
| Session 旗標 | 同檔或 `goBossWelcome.ts`：`maybeWelcomeHome()` |
| 觸發點 | `go-client/src/routes/+page.svelte` `onMount`／`$effect`（僅 browser＋`/`）；或 layout 偵測 pathname——**優先頁面級**，避免非首頁誤觸 |
| Flash API | 既有 `chromeSession.setFlash(text, 3800)` |
| 樣式 | `styles.css`：非 overlay 亦可用 bubble；尾巴對齊 `.chrome .mark` |
| Auth 協調 | 讀 `goAuth` busy／剛設之 flash；見 §5.4 |

---

## 10. 階段

| 階段 | 內容 | 完成依據 |
| --- | --- | --- |
| **A. 規格** | 本文件 Draft | 角色／session／池／競態寫清 |
| **B. 文案池＋歡迎觸發** | `goBossWelcome`＋首頁一次歡迎＋session／recent | 測試綠；手測：同 tab 回首頁不再歡迎；新 tab 再歡迎且常換句 |
| **C. 氣泡錨定 mark** | 非遊玩 flash 亦談話泡＋尾巴對準頭像；a11y alt | 首頁歡迎視覺上「老闆在講話」 |
| **D. 可選強化** | 說話微動畫；登入／操作 flash 漸進改老闆口吻；已在首頁再點 mark 輪播碎念 | 不影響 A–C 收斂 |

建議實作順序：**B → C**；D 另開。

---

## 11. 驗收清單

- [ ] 新 tab 開 `go…/` → 出現一句老闆歡迎氣泡；`sessionStorage` 有 welcomed 旗標
- [ ] 同 tab 進 `/s/…` 再回 `/` → **無**第二句歡迎
- [ ] 關 tab 重開 `/` → 可再歡迎；文案常與上次不同（recent 生效）
- [ ] 帶 `#pg_provision=` 登入成功進站 → 見登入 flash（或既有文案），**不**被歡迎蓋掉；且本 session 之後回 `/` 也不再歡迎
- [ ] 窄屏氣泡可讀、不擋推薦主操作；無 `alert`
- [ ] mark 可及名稱表達老闆；右側仍為玩家
- [x] `npm test`（含 `goBossWelcome`）綠

---

## 12. 用語對照

| 用 | 不用 |
| --- | --- |
| 老闆、櫃檯、歡迎光臨、純玩、通行證 | 系統通知、公告、toast 教學、帳號中心 |
| 每 session 首頁歡迎一次 | 每次回首頁、每日強制、跨裝置同步台詞進度 |
| 對話氣泡自 mark 長出 | 僅底欄色條、與頭像無關的螢幕中央 modal |

---

## 13. 變更紀錄

| 日期 | 變更 |
| --- | --- |
| 2026-08-15 | 初版 Draft：老闆頭像隱喻；session 一次首頁歡迎；文案池≥12＋recent 抗重複；與登入 flash 競態；非遊玩氣泡錨定；階段 A–D |
| 2026-08-15 | 階段 A–C 實作：`goBossWelcome` 抽選／session／recent；首頁觸發與 auth 優先；通用 flash 氣泡＋老闆 a11y 名稱；單元測試與 check 通過 |
