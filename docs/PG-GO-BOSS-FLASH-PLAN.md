# Playgrounds 純玩版：老闆頭像 × 對話氣泡 flash

> **狀態：** Draft（2026-08-15）— **階段 A–D 已落地**；瀏覽器手測待勾  
> **權威決策：** 從屬 [DECISIONS.md](./DECISIONS.md) **DEC-050**（純玩版 `go.samkuo.me`）；不另開 DEC  
> **相關：** [PG-GO-CLIENT-PLAN.md](./PG-GO-CLIENT-PLAN.md)、[PG-GO-UX-POLISH-PLAN.md](./PG-GO-UX-POLISH-PLAN.md)、[PG-GO-AUTH-PLAN.md](./PG-GO-AUTH-PLAN.md)、`.cursor/rules/no-native-dialogs.mdc`、`.cursor/rules/mobile-first-ux.mdc`、[GLOSSARY.md](./GLOSSARY.md)

一句話：**Header 左上角 mark＝遊樂場老闆**；頁內 flash 以 **RPG 對話氣泡**呈現。玩家**同一瀏覽器 session**（`sessionStorage`）**首次進入首頁 `/`** 時，從文案池抽一句歡迎一次；池夠大並跨 session 避開剛講過的。階段 D 補子池、說話微動畫、登入口吻、首頁點 mark 碎念。

---

## 1. 動機

- 左上 mark 易被當成站標；flash 易被當成系統 toast。寫死「老闆講話」可低成本強化櫃檯世界觀。
- 單句歡迎易膩 → 文案池＋抗重複；仍維持每 session 首頁只講一次。

---

## 2. 目標

- **角色契約（硬）：** mark＝老闆；右側 profile＝玩家通行證（DEC-052）。
- **歡迎 flash：** 同 tab session 第一次進 `/` 講一次；之後同 session 再回 `/` 不講。
- **文案池：** ≥12 句通用＋離線／已登入子池；抽選避開 recent（最多 3）。
- **視覺：** 氣泡家族；flash 可見時 mark 微動（尊重 reduced-motion）。
- **通路：** 既有 `chromeSession.setFlash`；禁原生 dialog／強制點擊繼續。

---

## 3. 非目標

- 完整角色／表情 atlas／語音／對話樹／強制 onboarding。
- 同 session 每次回首頁都自動歡迎（點 mark 碎念除外）。
- 一次改完所有操作／遊戲 flash 口吻（登入相關已改；其餘漸進）。
- 跨裝置同步台詞進度；場殼 `play` 套用同隱喻。

---

## 4. 角色對位

| UI | 是誰 | 不是 |
| --- | --- | --- |
| Header 左 **mark** | 老闆頭像 | 玩家 |
| Header **字標** | 店招「山姆鍋遊樂場」 | 老闆本人 |
| Header 右 **profile** | 玩家通行證 | 老闆／後台 |
| **flash／氣泡** | 老闆台詞 | HTTP 原文 |

---

## 5. 歡迎：生命週期與觸發（已落地）

### 5.1 Storage（硬）

| Key | Storage | 用途 |
| --- | --- | --- |
| `pg_go_boss_welcomed` | `sessionStorage` | 本 session 已自動歡迎 |
| `pg_go_boss_welcome_recent` | `localStorage` | 最近 index≤3（含通用＋子池統一編號） |

### 5.2 觸發（硬）

1. Client、首頁 `/` only（自動歡迎）。
2. 無 `pg_go_boss_welcomed`。
3. 能力閘未擋。
4. Auth 優先：busy／已有 flash → 仍 claim、不講歡迎。

### 5.3 首頁點 mark（階段 D）

- 已在 `/` 時點 mark：**preventDefault**，再抽一句碎念（**不**重設 session 歡迎旗標）。
- 他頁點 mark：仍回 `/`（既有行為）。

### 5.4 時長

歡迎／碎念 **3800ms**；其他操作回饋維持現況。

---

## 6. 文案池與抽選（已落地）

模組：`goBossWelcome.ts`

- `GO_BOSS_WELCOMES` ≥12
- `GO_BOSS_WELCOMES_OFFLINE`／`GO_BOSS_WELCOMES_SIGNED_IN`
- `GO_BOSS_WELCOME_CATALOG`：扁平穩定 index（general → offline → signedIn）
- `pickBossWelcome({ offline, signedIn, recentIndices, random })`
- `BOSS_FLASH`：登入／登出／失效老闆口吻

抽選：情境合格句 ∪ 排除 recent → 空則回退合格全池 → 均勻隨機。

---

## 7. 視覺與 a11y（已落地）

- `.chrome-flash` 氣泡；`.mark--speaking` 在 flash 可見時輕跳；`prefers-reduced-motion` 停動畫。
- `alt="遊樂場老闆"`。

---

## 8–9. 硬規則／as-built

| 項 | 位置 |
| --- | --- |
| 池＋抽選＋`BOSS_FLASH` | `goBossWelcome.ts`／`.test.ts` |
| 自動歡迎 | `routes/+page.svelte` |
| 點 mark 碎念＋說話 class | `Chrome.svelte` |
| 登入口吻 | `goAuth.svelte.ts` |
| 動畫 CSS | `styles.css` |

---

## 10. 階段

| 階段 | 內容 | 狀態 |
| --- | --- | --- |
| **A–C** | 規格／池／觸發／氣泡／alt | **完成** |
| **D** | 子池；說話微動畫；登入 flash 老闆口吻；首頁點 mark 碎念 | **完成** |

---

## 11. 驗收清單

**A–C（手測待勾）**

- [ ] 新 tab 開 `/` → 歡迎氣泡；session 旗標
- [ ] 同 tab 再回 `/` → 無第二句**自動**歡迎
- [ ] 關 tab 重開 → 可再歡迎；文案常不同
- [ ] provision 登入 flash 優先
- [x] mark alt；單元測綠

**D**

- [x] 離線／已登入子池可測且不單調
- [x] 說話微動畫＋reduced-motion
- [x] 登入／登出／失效 flash 老闆口吻（`BOSS_FLASH`）
- [x] 首頁點 mark 可碎念（不重開 session 歡迎旗標）

---

## 12. 用語對照

| 用 | 不用 |
| --- | --- |
| 老闆、櫃檯、通行證、入座 | 系統通知、帳號中心 |
| 每 session 自動歡迎一次 | 每次回首頁自動歡迎 |
| 點 mark 再碎念 | 點 mark 開 modal／對話樹 |

---

## 13. 變更紀錄

| 日期 | 變更 |
| --- | --- |
| 2026-08-15 | 初版 Draft；A–C 落地；修訂 as-built |
| 2026-08-15 | **階段 D 落地：** 離線／已登入子池；`mark--speaking`；`BOSS_FLASH`；首頁點 mark 碎念 |
