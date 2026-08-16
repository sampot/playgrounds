# Playgrounds 純玩版：同 session 輕量聊天（go-client）

> **狀態：** Draft（2026-08-16）— **P0–P2 程式已落地**（手測／P3 多人待）；§10 決策已凍結  
> **權威決策：** 從屬 [DECISIONS.md](./DECISIONS.md) **DEC-050**（純玩版）、**DEC-045**（Roster transport；**非** Avatars 產品面）；不另開 DEC  
> **相關：** [PG-GO-CLIENT-PLAN.md](./PG-GO-CLIENT-PLAN.md)（chrome／Invite／§6.4 自動收起）、[PG-GO-HOST-INVITE-PLAN.md](./PG-GO-HOST-INVITE-PLAN.md)（GO-INVITE）、[PG-INVITE-E2E-MVP.md](./PG-INVITE-E2E-MVP.md)（五子棋；鎖 1 Guest）、[PG-ROSTER-PLAN.md](./PG-ROSTER-PLAN.md)（**已取消**側欄名冊——本刀**勿**復辟）、[PG-GO-UX-POLISH-PLAN.md](./PG-GO-UX-POLISH-PLAN.md)、[PG-GO-BOSS-FLASH-PLAN.md](./PG-GO-BOSS-FLASH-PLAN.md)（氣泡家族；**勿**與老闆台詞混為一談）、`.cursor/rules/no-native-dialogs.mdc`、`.cursor/rules/mobile-first-ux.mdc`、[GLOSSARY.md](./GLOSSARY.md)

一句話：已連上**同一 Invite／session** 的玩家之間，由殼提供**預設收合**的輕量對話（自由文字預設開、遊戲可建議關；＋可選快捷語）；入口＝**右緣中段把手**（與左側 `GoGameDrawer` 對稱）；訊息＝獨立 DataChannel `type: "session_chat"`、**peer fanout**；**go ⊂ play** 同約共用；**不**經 Platform、**不**進 session 權威、**不**做成常駐側欄名冊。

---

## 1. 動機

- Invite／GO-INVITE 路徑已能「入座 → 對玩」，但**空檔**（等人、等開始、等對手落子）無低摩擦口語通道；玩家常另開 LINE／口述。
- 對弈中 go chrome 會自動收起、畫布滿版——若聊天做成常駐側欄或強制鍵盤，會直接搶觸控與注意力。
- DEC-045 已撤銷 Avatars／「線上」tab；需要的是 **session 附屬通訊**，不是第二個「誰在線」產品面。

---

## 2. 目標

- **同 session 可說話：** 已連線 peer 之間互傳短訊息；**最終形＝多 peer fanout**（同一場所有座位看得到；第一刀可先 1:1 驗收，契約與 API 不寫死雙人）。
- **遊戲優先：** 未開對話時僅右緣細把手（與 GameDrawer 同寬）；對弈中不自動開鍵盤、不蓋住下緣虛擬操作。
- **殼層統一、play／go 同約：** wire／解析／殼 UI 契約以 **可共用** 為準（見 §7.5）；go shell／runtime ⊂ play；能在 go 跑的 SAM **必須**能在 play 跑。
- **臨時生命週期：** 跟隨 Invite／peer；斷線或結束場 → 本機紀錄可丟；無雲端歷史。
- **對齊既有 UX 硬規則：** 禁原生 dialog；mobile-first；與 chrome auto-hide／flash toast 共存。

---

## 3. 非目標

- 常駐側欄名冊、投影 Avatar、OOB `#roster=` 邀請面（見 [PG-ROSTER-PLAN.md](./PG-ROSTER-PLAN.md) 已取消項）。
- Platform 中繼聊天、帳號私訊、跨局／跨 Invite 歷史、推播。
- 把聊天寫進 `gomoku.v1`（或任一 game）session protocol／`act` 權威狀態。
- `/s/` 單機純玩聊天（無 peer）。
- 為 go **另造**一套與 play 不相容的 chat wire／殼 API（見 §7.5）。
- 語音、貼圖包、檔案傳送、已讀回條產品化、審核／檢舉後台。
- 觀戰席專用聊天產品化、多房間、大廳配對（fanout＝**同 session 座位**，不是跨場大廳）。

---

## 4. 範圍與觸發

| 條件 | 有聊天？ |
| --- | --- |
| `/i/<short>` 且 Roster peer **已連線**（DataChannel open） | **是**（go 主路徑） |
| GO-INVITE：go Host 與 Guest 已握手 | **是**（同左） |
| play 場殼：同 session 已有 Roster peer | **是**（同約；UI 可漸進對齊，見 §7.5） |
| `/s/<id>` 單機、無 peer | **否** |
| 僅 consent／下載中、尚未連線 | **否**（可預留 disabled 入口，勿暗示已能送） |
| Host 結束場／peer 關閉 | **關**；清空本機佇列 |

**顯示名：** 沿用 Roster `presence.name`（Guest 同意面可改的臨時名；未填＝「對手」等中性預設）。**不**要求 Platform 登入才能聊天。

---

## 5. 原則（硬）

1. **預設收合** — 遊戲畫面＝現況 canvas；聊天不是預設佔一欄。
2. **空檔可打、對弈中輕收** — 等待／間隙可露輸入；`active` 對弈以未讀＋短 toast／快捷語為主。
3. **殼擁有 UI** — SAM 可**建議**能力與快捷語，不可取代殼入口。
4. **peer 旁路** — 訊息不進 Host session 權威；Host **不必**為聊天作答或持久化正文。
5. **短、可丟** — 單則長度上限；本機只留最近 N 則；Invite 結束即丟。
6. **勿復辟線上 tab** — 入口＝右側邊緣把手＋面板，不是 IDE 第三 tab。
7. **避開虛擬操作區** — **禁止**右下／左下角浮動鈕（易與遊戲虛擬搖桿／動作鍵重疊）；入口貼螢幕**左右邊緣中段**。
8. **go ⊂ play** — 共用優先；不能共用實作時仍須**同一合約介面**（wire＋殼／SAM 鉤子）。
9. **fanout 為終態** — 發送對「同 session 其他已連線 peer」廣播；勿把 1:1 寫進長期 API。

---

## 6. UX 定案

### 6.1 入口（硬）— 與 `GoGameDrawer` 對稱

對齊既有 [`GoGameDrawer.svelte`](../go-client/src/lib/GoGameDrawer.svelte) 左側 FAB 把手：**聊天＝右側鏡像**，同一套尺寸與垂直置中。

| 項 | 定案 |
| --- | --- |
| 形態 | 螢幕**右緣**豎向把手（rail handle），**不是**右下 FAB／圓鈕 |
| 對稱 | **左**＝`GoGameDrawer`（這一款）；**右**＝session 對話。兩者可同時存在時左右對仗，互不搶角 |
| 寬度 | **與 GameDrawer handle 同寬**：預設 `0.75rem`；窄屏（`max-width: 30rem`）`0.67rem`——實作宜抽共用 CSS 變數，禁止各寫各的 |
| 高度 | 同 GameDrawer：`3.25rem` |
| 垂直 | `top: 50%`＋`translateY(-50%)`（貼右緣中段；**勿**改貼底） |
| 水平 | `right: 0`（鏡像 GameDrawer 的 `left: 0`） |
| 可見 | peer 已連線後出現；chrome 頂列收起時**仍可見**（獨立於 header auto-hide） |
| 未讀 | 把手上小點／數字（不加大把手寬度）；有未讀時可選短 toast（見 §6.3） |
| Invite chrome | **可**在頂列次要放「對話」；**不要**塞進「更多」（`/i/` 無本機溢流） |
| `/s/` | 不渲染對話入口（單機無 peer）；GameDrawer 仍僅其既有條件 |

**為什麼不右下：** 多款遊戲把虛擬操作放在右下／雙下角；邊緣中段把手與 GameDrawer 同語意（殼層溢流），較少擋操作。

### 6.2 面板（硬）— 右側展開，對齊 GameDrawer

- 點把手 → 面板自**右側向內**展開（鏡像 GameDrawer：左把手 → 面板在把手右側／向內；右把手 → 面板在把手左側／向內）。
- 幾何對齊 GameDrawer panel：寬約 `16rem`（窄屏約 `14rem`）、`max-width: 78vw`；展開時把手與面板**連成一塊**（去相接邊框／圓角，同既有 drawer 開合視覺）。
- 內容：最近訊息列表（上舊下新或反）＋輸入列；寄件顯示名＋短時戳（可相對）。
- **開啟期間：** 暫停 chrome 3s 自動收起（對齊分享面／更多／profile／GameDrawer）。
- **關閉：** 點遮罩／關閉鈕／再點把手；第一刀：送出後**保持**面板開啟，方便連打；對弈中玩家可手動關。
- 鍵盤彈起：面板隨視覺視窗縮，**盡量**不蓋住遊戲主 CTA（已知限制：iOS 視覺 viewport；盡力即可）。
- 關面板後：`blur` 輸入，避免搶遊戲鍵盤／指標焦點。
- **禁止**改回自底升起的全寬 bottom sheet 當主形態（會再度壓到下緣操作區）。

### 6.3 對弈中收訊（硬）

| 模式 | 行為 |
| --- | --- |
| 面板 **關** | 新訊 → 未讀＋可選 **短 toast**（2–3s；**玩家對玩家**文案，勿走老闆 flash 口吻） |
| 面板 **開** | 直接插入列表；清未讀 |
| 自動開面板／自動開鍵盤 | **禁止**（對弈中） |

**Toast 文案（硬）：**

| 條件 | 顯示 |
| --- | --- |
| 短訊（建議 ≤40 字元，實作常數可調） | **全文**（可加顯示名前綴，例「小明：你好」） |
| 過長 | 截斷，例「小明：……」或「對手：……」（保留可辨識開頭；點開面板看全文） |

Toast 可走既有 toast／氣泡視覺家族，但語意＝**對手訊息**，不是老闆台詞（[PG-GO-BOSS-FLASH-PLAN.md](./PG-GO-BOSS-FLASH-PLAN.md)）。位置：**勿**固定右下（見 §8）。

### 6.4 階段行為（建議）

| Session／殼 phase（示意） | 預設 |
| --- | --- |
| 已連線、等人／等開始（`waiting`／`ready`） | 鼓勵開面板；可預填焦點（可選；mobile 慎用自動 focus） |
| 對弈中（`active`） | 右緣把手＋未讀＋toast；自由輸入見 §6.5 |
| 終局／再來一局之間 | 同等待：可較積極露輸入 |
| 斷線／結束 | 隱藏入口；可留「已斷線」一行於面板若仍開著 |

### 6.5 自由文字與快捷語（硬）

**自由文字是否允許——由遊戲建議，殼預設允許：**

| 來源 | 行為 |
| --- | --- |
| SAM **未**宣告 | **允許**自由文字（面板輸入列可見） |
| SAM 建議 `freeText: false`（或等價） | 殼**隱藏／停用**自由輸入；仍可收訊＋未讀＋toast；快捷語若開則可送 |
| SAM 建議 `freeText: true` | 明確允許（與預設相同） |

- 建議經殼／SAM 薄鉤子傳遞（postMessage 或既有 bridge；**同一合約** play／go 共用，見 §7.4／§7.5）。
- 殼**不**依 `kind: game` 硬猜；未建議＝允許。
- 等待／未開局：即使遊戲建議對弈中關自由文字，**空檔仍可允許**自由文字（實作可分 `phase`：僅 `active` 尊守 `freeText: false`）。**定案：** `freeText: false` 只約束 **session `active`（對弈中）**；waiting／ready／ended 仍可打字。

**快捷語（P2）：**

- 殼內建通用 3–6 則（例：加油／等一下／好棋／再來／GG）。
- 快捷訊息列**預設收起**；玩家點「快捷訊息」才展開。送出一則後自動收起，避免長期占用面板高度。
- 點一下即送（等同送出一則 `text`）；**不**開鍵盤。
- SAM 可**建議**覆寫／追加快捷列（字串陣列）；殼渲染與送出仍走 `session_chat`。
- **禁止**要求每款 game 實作輸入框才能聊天。

**訊息呈現（硬）：** 每則訊息使用 RPG／像素風對話 bubble（硬框、錯落圓角、指向說話者的尾巴、像素陰影）；本機 bubble 尾巴向右、遠端向左。禁止退化成無尾巴的死板矩形卡片。

### 6.6 輸入約束（硬）

| 項 | 值（初值；可調） |
| --- | --- |
| 單則最長 | 200 字元（Unicode code point 或 UTF-16 length 擇一寫進實作／測試） |
| 本機保留 | 最近 50 則（fanout 後仍以本機合併時間線計，非每 peer 各 50 再加總無上限） |
| 送出 | 空白不送；連續送出可客戶端 throttle（例 400ms）防誤觸連點 |
| 內容 | 純文字；不解析 markdown／連結預覽（第一刀） |

---

## 7. 傳輸與契約

### 7.1 層級（硬）— 獨立 `type`

```text
Roster DataChannel
  ├── presence          （既有）
  ├── avatar_relay      （既有：session_invite／act／event…）
  └── session_chat      （本刀；**獨立 top-level type**；peer 旁路）
```

- **`type: "session_chat"` 與 `presence`／`avatar_relay` 同級**——**禁止**掛成 `avatar_relay.payload.kind`。
- 解析：既有 `onMessage` 分支加 `isSessionChatMessage`（或等價）；未知 type 仍忽略。
- **不**經 Platform signaling／Invite API 傳訊息正文。
- **不**寫入 Host `/api/session/*` 狀態。

### 7.2 Wire 形狀（硬）

```ts
type SessionChatMsg = {
  type: "session_chat";
  id: string;          // 客戶端 UUIDv4；去重（fanout 迴聲／重送）
  from: string;        // agentId（對齊 presence）
  name?: string;       // 顯示名快照（可選；接收端可改信本地 presence map）
  text: string;        // 已 trim；長度≤上限
  ts: number;          // Unix ms；顯示用，非權威排序唯一依據
  v: 1;
};
```

| 規則 | 說明 |
| --- | --- |
| 未知 `v`／畸形 | 靜默丟棄 |
| 重複 `id` | 丟棄 |
| 超長 `text` | **丟棄**（避免半句） |
| `from`＝本機 | 不應再插入為「收到」（送出端本機樂觀插入即可） |

### 7.3 Fanout（終態硬；P0 可退化）

| 項 | 定案 |
| --- | --- |
| **語意** | 一則 `session_chat`＝給**同 session 所有其他已連線 peer**（不含自己） |
| **誰送** | 發送端對每個遠端 peer `send` 同一 payload（同 `id`）；或 Host 代轉——**傾向各端直送已知 peer**（無中繼伺服器；Host 不必當聊天權威） |
| **收** | 任一 peer 收到 → 本機時間線＋未讀／toast；多 peer 時 UI 用 `name`／`from` 區分 |
| **P0** | 僅 1 peer 時＝自然 1:1；**API／函式名勿叫 `sendToOpponent`**，用 `broadcastSessionChat`／`sendSessionChat` 等 fanout 語意 |
| **迴聲** | 勿把本機送出的訊息經 peer 再收一次當新訊（依 `id`／`from`） |

### 7.4 SAM 建議鉤子（合約；play／go 相同）

殼向 SAM（或反向）宣告薄能力建議——形狀草案（實作可放 shared 模組）：

```ts
/** SAM → shell；缺欄＝預設 */
type SessionChatHints = {
  /** 對弈中（active）是否允許自由文字；預設 true */
  freeText?: boolean;
  /** 覆寫或追加快捷語；undefined＝只用殼預設 */
  quickReplies?: string[];
};
```

- **預設允許**自由文字（`freeText` 缺省＝`true`）。
- 殼 UI 與送出仍在殼；SAM **不**實作完整 chat。
- 鉤子傳遞通道與既有 canvas bridge 對齊；**go 與 play 同形**。

### 7.5 與 session 權威的界線

| 是 | 不是 |
| --- | --- |
| 玩家之間的附屬通訊 | `gomoku.v1` 的 `place`／`start`／狀態同步 |
| 斷線就沒有 | 可重播的棋譜註解軌道 |
| 殼 UI 狀態（未讀、面板 open） | SAM `functions.js` 必備 API |

### 7.6 play／go 共用（硬）

> **go shell／runtime ⊂ play shell／runtime。** 能在 go client 執行的 SAM，**必須**能在 play 執行。聊天亦不例外。

| 層 | 規則 |
| --- | --- |
| **Wire／解析** | 放 **共用**模組（傾向 `src/components/playgrounds/roster/*` 或抽出之 `@pg/roster` 路徑）；go／play **同一** `SessionChatMsg`／`isSessionChatMessage`／送收 helper |
| **Fanout helper** | 共用；輸入＝「目前 peer session 列表」＋ payload |
| **殼 UI** | **能共用就共用**（Svelte 元件可進 shared）；go 先落地產品面時，play 可稍後掛同一元件或薄包裝——**禁止** go 專用、play 另一套不相容 props／事件名 |
| **不能共用實作時** | 仍須提供**相同合約介面**（wire 型別、hints 形狀、送收函式簽名、訊息事件名） |
| **本刀排程** | 驗收可先 go Invite／GO-INVITE；合併 PR 時 shared 契約與測試須已存在，避免日後 fork |

---

## 8. 與 chrome／畫布的互動

對齊 [PG-GO-CLIENT-PLAN.md](./PG-GO-CLIENT-PLAN.md) §6.4：

| 情境 | 行為 |
| --- | --- |
| 頂列 auto-hide | 聊天入口**不**隨頂列消失 |
| 對話面板／GameDrawer／分享／更多／profile 開 | 暫停頂列 3s 收起 |
| 新訊 toast | chrome 藏時**仍可見**（對齊 UX polish「藏 chrome 仍見 flash」精神）；toast **勿**固定右下擋虛擬鍵（傾向頂部／chrome flash 帶）；文案規則見 §6.3 |
| Canvas overlay | 右緣把手／面板在 canvas **之上**（z-index）；遮罩不攔截未開面板時的遊戲點擊；**收合時**僅邊緣細把手可點，其餘 pointer-events 穿透 |

---

## 9. 階段與完成依據

| 階段 | 內容 | 完成依據 |
| --- | --- | --- |
| **0. 規格** | 本文件；§10 已凍結 | 本檔合入 |
| **1. P0 等待室＋契約** | shared `session_chat` wire／解析／`broadcast` 語意 helper；go 右緣把手＋面板＋自由文字（預設允許）；1 peer 驗收 | 兩瀏覽器互傳≥1 則；斷線入口關；把手寬＝GameDrawer；shared 單測綠；`npm test`／`go:check` 綠 |
| **2. P1 對弈中** | 未讀＋短 toast（全文／截斷規則）；不自動開鍵盤；尊守 SAM `freeText`（僅 active） | gomoku `active` 可玩；toast 不擋右下；面板開暫停 chrome hide |
| **3. P2 快捷語＋hints** | 殼預設快捷；SAM `SessionChatHints`；可選 play 掛同一 UI | 點快捷即送；`freeText: false` 時 active 無輸入列仍可快捷／收訊 |
| **4. P3 Fanout** | ≥2 Guest（或雙 peer）同場互見；直送各 peer | 三人場（Host＋2）各端時間線一致（同 `id` 去重）；無 Platform 中繼 |

建議實作順序：**0 → 1 → 2 → 3 → 4**。P0–P2 驗收載體優先 **`pg-gomoku`**；P3 可另開多座位手測（不阻塞 E2E 仍鎖 1 Guest 的既有敘事）。

---

## 10. 已凍結決策（原開放題）

| # | 題 | 定案 |
| --- | --- | --- |
| 1 | Wire 掛法 | **獨立** `type: "session_chat"`（與 `presence`／`avatar_relay` 同級） |
| 2 | 對弈中自由文字 | **遊戲建議、預設允許**；`SessionChatHints.freeText`；僅約束 **active**；缺省＝允許 |
| 3 | Toast 全文 | **短訊全文**；過長截斷（例「小明：……」）；點面板看全文 |
| 4 | play／go | **go ⊂ play**；能共用就共用；不能共用也要**相同合約介面**；wire／fanout helper 必共享 |
| 5 | 多 peer | **終態＝peer fanout**；P0 可 1:1 退化，API 用廣播語意；P3 驗收多人 |

---

## 11. 用語對照

| 用 | 不用 |
| --- | --- |
| 同場對話、對話、對手訊息 | 線上 tab、聊天室、社群、私訊、大廳 |
| 右側邊緣把手、與 GameDrawer 對稱 | 右下浮動鈕、bottom sheet 主入口 |
| fanout／同場廣播 | 私訊頻道、送對手（寫死雙人 API） |
| 共用契約、go ⊂ play | go 專用協定、play 另一套 wire |
| 臨時、這一局 | 雲端紀錄、好友聊天 |
| 殼層入口；遊戲**建議** | 每款遊戲自建聊天 UI（作為主路徑） |

---

## 12. 驗收清單（草案）

**P0**

- [x] shared `session_chat` wire／`broadcastSessionChat`／hints helpers＋單測（`rosterSessionChat.ts`）
- [x] go `goSessionChat` store＋guest／host runtime 送收／detach
- [x] `/i/` 連線後**右緣中段**對話把手（寬＝GameDrawer）；**無**右下殼層鈕；`/s/` 單機無 peer 則無入口
- [x] 面板自右側向內展開；可送／收短訊；超長拒送；空白不送
- [x] `type: "session_chat"` 獨立解析；訊息不經 Platform；斷線後入口關
- [x] shared 模組可被 play／go 引用；送收 API 為 fanout 語意
- [x] 禁原生 dialog；窄屏可打字、可關；收合僅邊緣把手攔截點擊
- [ ] 兩瀏覽器手測：等人時互傳≥1 則

**P1**

- [x] 面板關時新訊→未讀；短 toast 全文／過長截斷（flash）；非右下；不自動 focus
- [ ] 對弈中可繼續操作遊戲（手測 gomoku）
- [x] 面板開時暫停 chrome auto-hide
- [x] 未宣告 hints 時預設允許自由輸入（store 已覆蓋 `freeText:false`）

**P2**

- [x] 快捷訊息預設收起；點選展開；一點即送後收起（殼預設 加油／等一下／好棋／再來／GG）
- [x] 訊息使用 RPG 對話 bubble；本機／遠端尾巴分向右／左
- [x] SAM `playgrounds-session-chat-hints` postMessage → `setHints`（`freeText`／`quickReplies`）
- [x] `freeText: false` → active 無自由輸入、仍可快捷／收訊（store 測）
- [x] waiting／ready 在 `freeText: false` 下仍可打字
- [ ] 某一款 game 實作 hints 手測（可選；未宣告＝預設允許）

**P3**

- [x] fanout helper／host `collectChatPeers` 直送各 peer（同 `id`）
- [ ] ≥2 Guest 手測時間線一致

---

## 13. 變更紀錄

| 日期 | 變更 |
| --- | --- |
| 2026-08-16 | 初版 Draft：殼層 session 聊天、預設收合、peer 旁路 `session_chat`、P0 等待室→P1 對弈中→P2 快捷語；明確非 Avatars 復辟 |
| 2026-08-16 | **入口改右側邊緣把手：** 與 `GoGameDrawer` 左右對稱、同寬同高置中；禁止右下 FAB／bottom sheet 主形態（避虛擬操作鍵） |
| 2026-08-16 | **凍結 §10：** 獨立 type；自由文字＝遊戲建議／預設允許；toast 全文／截斷；go ⊂ play 同約共用；終態 peer fanout（+P3） |
| 2026-08-16 | **P0 落地（程式）：** `rosterSessionChat`＋`goSessionChat`＋guest／host 接线＋`GoSessionChatPanel` 右緣把手；單測綠；手測待 |
| 2026-08-16 | **P2 落地（程式）：** 殼預設快捷語；`playgrounds-session-chat-hints` listener；guest 自 session event 推 uiPhase；sdk.d.ts 合約註解 |
| 2026-08-16 | **聊天面板打磨：** 快捷訊息預設收起、點選展開、送出後收起；訊息改 RPG 像素對話 bubble |
| 2026-08-16 | **Host 標記：** wire 可選 `role:"host"`；顯示名「主持」＋金色「主持」tag；不再用「玩家 A」 |
