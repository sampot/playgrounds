# Playgrounds 純玩版：包廂（go `/room`）

> **狀態：** Draft（2026-08-18）— Phase 1 已實作（`/room`；`/chat` 導向包廂）  
> **權威決策：** 從屬 [DECISIONS.md](./DECISIONS.md) **DEC-050**（純玩版）、**DEC-045**（Roster／薄 signaling；**非** Avatars 產品面）、**DEC-047**（Platform Invite）；**不另開 DEC**  
> **相關：** [PG-GO-CLIENT-PLAN.md](./PG-GO-CLIENT-PLAN.md)、[PG-GO-AUTH-PLAN.md](./PG-GO-AUTH-PLAN.md)（登入＋記憶體 field API key）、[PG-GO-HOST-INVITE-PLAN.md](./PG-GO-HOST-INVITE-PLAN.md)（GO-INVITE＝遊戲 compose；**勿混**）、[PG-GO-SESSION-CHAT-PLAN.md](./PG-GO-SESSION-CHAT-PLAN.md)（局內 overlay 對話——**勿混**）、[PG-GO-SHOP-LOBBY-PLAN.md](./PG-GO-SHOP-LOBBY-PLAN.md)（大廳熱點入口）、[PG-PLATFORM-API-PLAN.md](./PG-PLATFORM-API-PLAN.md)、[PG-PLATFORM-CREDITS-PLAN.md](./PG-PLATFORM-CREDITS-PLAN.md)（官方 TURN；包廂 ICE **與**遊戲邀請分開）、`.cursor/rules/no-native-dialogs.mdc`、`.cursor/rules/mobile-first-ux.mdc`、[GLOSSARY.md](./GLOSSARY.md)

一句話：已登入玩家在 **`/room` 開一間臨時包廂**，用既有 Platform Invite 短鏈把人請進來；連上之後資料只走 WebRTC（**不**經 Platform 中繼、**不**雲存）。**第一階段產品**＝文字＋傳檔；**契約不把包廂定成聊天室**——同一條連線預留給音視訊、桌機投放、日後在包廂裡開一局等。

---

## 1. 動機

- 大廳已有「椅子／桌」熱點與 `/chat` 占位，但公開大廳聊天不像現實用法。網咖／室內遊樂場更常見的是：**租一間包廂**，關門說話、傳東西、有時開會、有時把桌機畫面丟到手機。
- Invite／WebRTC 目前幾乎只服務 **開 SAM 入座**（`invite.compose`）。要測「能不能連上」或做遊戲以外的用途，只能先開一局五子棋——過重，也把連線綁死在某一顆小品。
- 局內 [`session_chat`](./PG-GO-SESSION-CHAT-PLAN.md) 是對弈 overlay（預設收合、遊戲優先），**不是**一般用途隔間；該計劃把語音／傳檔列為 overlay **非目標**，那些能力應落在包廂。
- DEC-045 已撤銷「線上」tab。包廂是 **Invite 拉人進臨時隔間**，不是常駐誰在線、不是好友名單。

---

## 2. 目標

- **包廂＝一般用途 peer 隔間（硬）：** 產品面是「這一間」；裡面做什麼由階段遞增，**禁止**把 API／UI 契約寫死成「只能聊天」。
- **第一階段可交付：** 已登入 Host 鑄邀請 → Guest 開 `/i/<short>` 同意進包廂 → DataChannel 文字＋傳檔；頁內「已連線」即連線探測。
- **同一套邀請門牌：** 短鏈 canonical 仍是 `https://go.samkuo.me/i/<short_id>`（QR／分享面）；Host 主面是 `/room`。
- **資料不落雲端：** 正文、檔案 bytes、（預留）音視訊 RTP **不**經 signaling／Invite API／物件儲存；本機只在頁面生命週期保留。
- **Host 要登入、Guest 不必**（對齊 GO-INVITE／遊戲 Guest）。
- **Mobile-first；禁原生 `alert`／`confirm`／`prompt`。**

---

## 3. 非目標

只列**真正不做**的；後續階段能力見 **§9**，**不要**抄進本節。

- 常駐線上、好友名單、跨包廂歷史、推播、帳號私訊（勿復辟 Avatars／「線上」tab）。
- Platform 中繼文字／檔案／媒體；雲端聊天室；把包廂做成 SAM（型錄小品）。
- 第二套邀請網址（`/room/<id>` 當 short map）；為包廂另建邀請庫。
- 把局內右緣 overlay 改成全頁包廂，或在 `/s/` 單機無 peer 時假裝可傳。
- 完美斷線重連、預約房、可收藏的「我的包廂 3 號」、長 TTL 站樁房間。
- 對讀者揭露直連 vs TURN／relay（DEC-004／點數計劃）。
- 使用者自備 TURN（DEC-045／047 否決）。
- 以包廂繞過受保護串流（DRM 畫面變黑不是要修的功能）。
- 第一刀場殼 `play` 同步同一包廂 UX（wire 預留共用；產品面先 go）。

---

## 4. 原則（硬）

1. **能力開放** — 包廂是連線容器，不是單一 app。階段只約束**何時交貨**，不約束**永遠不能做什麼**（除非 §3）。
2. **殼擁有 UI** — 不是一顆 `kind: tool` SAM；進包廂不 materialize FileMap／畫布 iframe。
3. **薄 signaling** — Platform 只做 Invite／join／一次 O／A（DEC-045）。已連線則重用 PC；**禁止**經 Platform renegotiation。
4. **第一次 SDP 就為媒體留門** — 包廂 peer 在 `createOffer` 前加上 audio＋video transceiver（軌可空）。Phase 1 **不**開相機、**不**送 RTP；後期 `replaceTrack` 不必第二輪 Platform O／A。
5. **遊戲邀請與包廂邀請分開** — 遊戲繼續 `invite.compose`＋（可選）relay-only。包廂 `invite.room` **不**因 Host `turn_prefer` 自動改成 relay-only（見 §7.3）。
6. **臨時** — 短鏈 TTL（預設 5m）＝門牌有效；已入座不受短鏈過期影響。散場＝關 PC、丟時間線與 Blob。
7. **go ⊂ play（wire）** — 文字重用 `session_chat`；檔案新獨立 `type` 放共用 roster 模組。Play 可晚掛 UI。
8. **同時一 SAM 仍成立** — 包廂不是 SAM；進 `/s/`／遊戲 `/i/` 則離開包廂（破壞性，頁內確認）。

---

## 5. 產品形狀與用語

### 5.1 空間

```text
大廳 `/`  ──熱點「包廂」──►  `/room`（Host 開桌／等待／已連線主面）
Guest 掃碼 `/i/<short>`  ──kind=invite.room──►  同意 → 同一包廂主面
深鏈 `/s/`／遊戲 `/i/`  ──bypass──►  不經包廂
```

進 `/room` 後大廳 canvas **卸載**（對齊 `/s/`、`/i/`：殼是大廳，包廂不是第二個大廳）。

大廳熱點：讀者面 **包廂**（門／隔間入口，不是大廳正中「公開聊天區」）。契約 `hotspotId`＝`room`（現況程式 `chat` → `/chat` 應遷過來）。

### 5.2 用語（硬）

| 用 | 不用 |
| --- | --- |
| 包廂、進包廂、邀請進包廂、結束這一間、投放 | 聊天區、聊天室、房間、Room、Lounge、Lobby（對讀者） |
| 邀請連線、已連線、傳送檔案 | 直連、P2P、DataChannel、TURN、視訊會議 SaaS 腔 |
| URL `/room`（與 `/help`／`/apps` 同：路徑英文、chrome 中文） | 把 `/chat` 當產品 canonical |

局內 overlay 仍叫 **對話**（[PG-GO-SESSION-CHAT-PLAN.md](./PG-GO-SESSION-CHAT-PLAN.md)），不要改名包廂。

---

## 6. URL 與 Invite

### 6.1 路徑

| 誰 | URL | 語意 |
| --- | --- | --- |
| Host 主面 | **`https://go.samkuo.me/room`** | 鑄邀請、等待、包廂 UI |
| Guest 門牌 | **`https://go.samkuo.me/i/<short_id>`** | 解 kind → 包廂 consent（**不**下載 SAM） |
| 舊占位 | `/chat` | **導向 `/room`**（相容；勿兩套產品面） |

- `/room` 可 prerender／進 sitemap（與 `/help` 同）；**不**把 secret 放進公開 HTML。
- `/i/` 維持 `noindex`／robots Disallow。
- Guest 同意後可 `replaceState` 成 `/room`（網址較乾淨）；**分享／QR 永遠是 `/i/`**。
- Invite OG 維持中性「接受邀請 · 山姆鍋遊樂場」；**禁止**預設寫「對弈」。包廂邀請 title（分享面）＝「邀請你進包廂」。

### 6.2 Kind：`invite.room`

```text
kind: invite.room
intent:
  version: 1
  surface: room
  consent: always_ask
  transport:
    roster: { signal: true }
```

- Platform 現況把 `kind` 當字串存，**不必**為本刀改 Invite 狀態機；go Guest／Host 必須認這個 kind。
- **否決**用 `invite.compose` 掛假 SAM 當包廂。
- 備案 `signal.handshake`＋`intent.surface` 僅在 kind 無法落地時使用；傾向具名 `invite.room`。

### 6.3 流程

**Host**

```text
未登入 `/room` → 主 CTA「登入後邀請」（goAuth.login；不擋逛頁）
已登入 →「邀請進包廂」
  → mintPlatformInvite({ kind: "invite.room", intent, targetField: goOrigin() })
  → GoShareSheet（QR／複製／系統分享；url＝/i/<short>）
  → Host answer loop（連線 only；不開 SAM session）
  → DataChannel open →「已連線」
  → 文字／傳檔（Phase 1）
  →「結束這一間」→ 關 PC、可撤 Invite
```

**Guest**

```text
開 /i/<short> → preview
  → kind=invite.room → consent「進這間包廂」（可改臨時顯示名；無棋規／SAM 摘要）
  → join_cap → offer → answer → DataChannel
  → 包廂 UI（跳過 loading_sam）
拒絕 → 不佔成功 handshake
```

現況 `guestRuntime.consentAndPlay` 無 `sam.source` 即失敗——包廂必須**分流**，不可走 compose 下載管線。

TTL 預設 **5 分鐘**（門牌，非租期）。過期 → Host「再發一張」；已連線 peer 續用。P0 鎖 **1 Guest**；一連結多人加入的 Invite 模型保留，fanout 對齊 session-chat 終態。

離開 `/room` 或重整＝散場。對還在線的對方是破壞性 → **頁內確認**。

---

## 7. 傳輸

### 7.1 Peer（包廂專用工廠）

現況 [`createRosterOffer`](../src/components/playgrounds/roster/rosterPeer.ts) 只建 DataChannel，SDP 通常沒有音視訊 m-line。包廂 **不要**直接拿遊戲那條當唯一工廠，除非加上媒體預留。

包廂 `createOffer` 前：

```ts
pc.addTransceiver("audio", { direction: "sendrecv" });
pc.addTransceiver("video", { direction: "sendrecv" });
pc.createDataChannel("roster", { ordered: true });
```

後期開會／投放用 `RTCRtpSender.replaceTrack`；關則 `replaceTrack(null)`。

- **遊戲** `invite.compose` 可維持 DC-only SDP（不為包廂去改五子棋握手）。
- 包廂走 Platform `transport: signal`（wire 上限 `ROSTER_WIRE_MAX_CHARS_SIGNAL`）；**不要**把帶媒體 m-line 的 SDP 塞進 OOB QR 預算。
- 驗收（即使 Phase 1 UI 無相機）：lounge／room offer SDP **含** `m=audio` 與 `m=video`。

### 7.2 DataChannel `type`（與 presence／avatar_relay 同級）

| `type` | Phase 1 | 說明 |
| --- | --- | --- |
| `presence` | 用 | 既有 |
| `session_chat` | **用** | 文字；重用 [`rosterSessionChat.ts`](../src/components/playgrounds/roster/rosterSessionChat.ts) |
| `session_file` | **用** | 傳檔控制面（新；見 §8.2） |
| `session_ping` | 可選 | RTT 探測；對人可顯示「約 N ms」，不揭露路徑 |
| `avatar_relay` | 不用 | 包廂無 SAM session；後期若在包廂開局再掛 |

**禁止**把檔案或聊天正文掛成 `avatar_relay.payload`。

### 7.3 ICE（與遊戲邀請切開）

| Invite | ICE |
| --- | --- |
| `invite.compose` | 不變：Host `turn_prefer`＋官方 TURN → **relay-only**（點數計劃 §7.2） |
| `invite.room` | **預設 STUN／直連**（含區網 host／srflx）。**不**因 `turn_prefer` 自動 stamp relay-only、**不**因附上 TURN URL 就走現況 `iceTransportPolicy: "relay"` 那條遊戲工廠 |

理由：包廂第一階段傳檔、以及預留的桌機→手機投放，都以**同一網路或足夠直連**為快樂路徑；高碼率走官方 relay 會貴且易卡。包廂「已連線」測的是**這間包廂**，不是五子棋的 relay 政策。若要測對弈備援，另鑄遊戲邀請。

跨網連不上：頁內錯誤／請靠近同一網路或請對方再試；**不**教 ICE。官方 TURN 作包廂「可 fallback、非 relay-only」是否開放，**另段**（牽涉點數與 `buildRosterRtcConfiguration`）；不阻塞 Phase 1。

對人只顯示：等待／已連線／已斷線／傳送中。

---

## 8. 第一階段產品（文字＋傳檔）

### 8.1 文字

重用 `session_chat` wire／fanout／去重。包廂殼差異：

- 永遠自由文字（無 SAM `SessionChatHints`；無對弈 `active` 閘）
- 全頁時間線（**不是**右緣把手；沒有遊戲畫布要讓路）
- 快捷語可留少數（在嗎／等一下／收到／謝謝）；預設收起
- 單則上限可沿用 200 字，或包廂略放寬並寫進測試；時間線記憶體上限建議 200 則
- 斷線清空；無雲端歷史
- Bubble 視覺可與 overlay 同族（本機右、遠端左；Host「主持」標記可沿用）

### 8.2 傳檔

控制面 JSON（DataChannel 文字幀）＋ payload 二元幀。DataChannel 已 `binaryType = "arraybuffer"`。

```text
session_file.offer   { id, name, size, mime, hash? }
session_file.accept | session_file.reject
session_file.chunk   二元：id + seq + payload
session_file.done    { id, hash }
session_file.cancel
```

| 項 | Phase 1 初值（可調；寫進測試） |
| --- | --- |
| 單檔上限 | 32 MiB |
| 同時傳送 | 1 |
| 接收 | **先 offer，對方頁內同意再傳** |
| 落地 | 記憶體 Blob；「下載到這台裝置」才 `<a download>` |
| 散場 | revoke object URL；**不**寫 IndexedDB／OPFS／Cache |
| 預覽 | 圖片可縮圖；其他＝檔名＋大小＋下載 |

OS 檔案選擇器允許。可執行檔可先拒或警告（頁內，非原生 dialog）。**否決**自動上傳 Platform／R2。

### 8.3 連線探測（Phase 1 已夠講）

DataChannel `open` ＝「已連線」。可選 ping。不把「先連包廂再保證五子棋 relay」當 Phase 1 故事。

---

## 9. 預留能力（不實作、契約不封死）

下列**不是**非目標。Phase 1 不做 UI，但 §7.1 的 PC／SDP 必須讓它們以後加得進去。

| 方向 | 概要 | 依賴 |
| --- | --- | --- |
| **開會** | 麥克風／鏡頭；`replaceTrack(getUserMedia)` | 瀏覽器權限對話＝OS 權限，不是產品 `confirm`；失敗頁內說明 |
| **投放** | 桌機 Host 選本機影片 `captureStream()`（或後期分頁 `getDisplayMedia`）→ 手機 Guest 全螢幕收看 | 同一視訊 transceiver；與開會出站互斥即可 |
| **在包廂開一局** | 已有 PC → 重用，不再經 signaling；本機開 SAM session | DEC-045 重用；GO-INVITE 後期；P0 可先「散場再鑄遊戲邀請」 |
| **多人** | 一連結多 join；文字／檔 fanout | Invite 模型已允；P0 鎖 1 Guest |
| **螢幕分享、僅語音、畫質檔** | 同一組 transceiver／DC | 另階段 |

實作約束：**peer 當一等物件**（不要做成「只能聊天的頁面單例」）。遊戲 SAM 若日後掛上同一 PC，應忽略閒置 A/V 軌；對弈中**不要**自動開相機。

投放快樂路徑＝**桌機 Host → 手機 Guest**；片源不出 Host 瀏覽器。不承諾 4K／跨網電影。受保護畫面變黑不修。

---

## 10. UX（Phase 1）

窄屏（預設）：

1. 狀態列：未登入／等待邀請／已連線／已斷線；已連線可「結束這一間」
2. 時間線（文字＋檔案氣泡）
3. 輸入列：文字＋附加檔；熱區 ≥44×44px
4. 等待空態：大 QR＋口誦 `go.samkuo.me/i/…`（現場主路徑）；系統分享／複製可同面或 sheet

寬屏（`min-width` 遞增）：左時間線、右「這一間」卡片（QR、倒數、狀態）。**禁止**桌面先做再 `max-width` 縮小。

未登入：說明包廂要通行證才能邀請；不擋回大廳、不擋 `/s/`。

`/room` 不是對弈 canvas：頂列**不必** 3s 自動收起。Esc 回大廳（現況 `goEscapeHome` 含 `/chat` → 改 `/room`）。

分享面開啟、確認散場期間：對齊既有 sheet 焦點與取消。

---

## 11. 隱私與儲存

| 項 | 規格 |
| --- | --- |
| 文字／檔案／（預留）媒體 | 只經 WebRTC；signaling 僅 SDP |
| Host API key | 頁面記憶體；mint／作答；關頁即失 |
| 時間線／Blob | RAM；散場丟 |
| 顯示名 | 可繼續 Roster `localStorage` |
| 分析 | 若打點，只計「鑄了包廂邀請／握手成功」之類；不記正文、檔名可選不記 |
| 離線 | 包廂**不能**離線加入（與 `/i/` 同） |

對讀者可寫：**對話與檔案只在雙方瀏覽器之間，不會存到遊樂場伺服器。** 關分頁或斷線就沒了。

---

## 12. 實作切面（建議）

| 層 | 建議 |
| --- | --- |
| Invite | `wantsRosterSignal` 認 `invite.room`；**不要**對 room stamp 遊戲用 `relay: true` |
| Host | 新 `roomRuntime`（或從 `hostRuntime` 抽出 answer loop＋peer map）；**不** `open` SAM session |
| Guest | `guestRuntime`／`/i/` 依 kind 分流；room 不 `resolveGoSamFiles` |
| 文字 | `goSessionChat` 加全頁模式，或包廂自用同一 store |
| 檔案 | 共用 `rosterSessionFile.ts`（解析／分塊／上限）＋單測 |
| Peer | 包廂工廠：transceiver＋DC；遊戲 `createRosterOffer` 可暫不動 |
| 分享 | `GoShareSheet` 邀請模式；title「邀請你進包廂」 |
| 路由 | `go-client/src/routes/room/`；`/chat` 導向 `/room` |
| 大廳 | hotspot `room` → `/room`；label「包廂」 |
| chrome | 「更多」連到 `/room`；Esc／bulletin 路徑表 |

TDD：kind 分流、無 SAM Guest、SDP 含 A/V m-line、file offer／chunk／上限／拒絕、斷線清空。純文件本刀不寫程式。

---

## 13. 階段

| Phase | 內容 | 完成定義 | 狀態 |
| --- | --- | --- | --- |
| **0. 契約** | 本文件；GLOSSARY／交叉引用 | 包廂≠overlay≠compose；能力開放寫死 | **本刀** |
| **1. 文字＋傳檔** | mint `invite.room`、`/i/` consent、DC、`session_chat`、`session_file`；SDP 已含 A/V m-line | 兩瀏覽器互傳文字與一檔；Platform 無正文；未登入不能鑄；`/chat`→`/room` | **本刀** |
| **2. 音視訊** | 開／關麥與鏡頭；`replaceTrack` | 不經第二輪 Platform O／A | 預留 |
| **2b. 投放** | 桌機本機影片 → 手機收看 | 片源不出雲 | 預留 |
| **3. 重用 peer 開局** | 包廂已連 → SAM session | 不必再掃一次（可選） | 預留 |
| **4. 多人 fanout** | ≥2 Guest | 時間線／檔一致（去重） | 預留 |

建議實作順序 **0 → 1**；2／2b／3 **不**互為阻塞，擇一即可開做。

---

## 14. 已凍結決策

| # | 題 | 定案 |
| --- | --- | --- |
| 1 | 名稱／URL | 讀者「包廂」；canonical **`/room`**；舊 `/chat` 導轉 |
| 2 | 產品本質 | **一般用途隔間**；Phase 1＝文字＋傳檔，**不是**功能上限 |
| 3 | Invite | **`invite.room`**；門牌仍 `/i/`；無 SAM |
| 4 | 文字 | 重用 `session_chat` |
| 5 | 傳檔 | 新 `session_file`；記憶體 Blob；先同意再傳 |
| 6 | SDP | Phase 1 就要 audio＋video m-line（軌空） |
| 7 | ICE | 包廂 **≠** 遊戲 relay-only stamp |
| 8 | 登入 | Host 要；Guest 不要 |
| 9 | 雲 | 無；散場丟 |
| 10 | P0 人數 | 1 Guest；模型不寫死雙人 |

---

## 15. 與既有通路（勿混）

| 流 | 是 | 不是 |
| --- | --- | --- |
| **包廂 `/room`** | 臨時隔間；Invite＋WebRTC | 大廳公開桌、局內 overlay、型錄 SAM |
| **Session chat** | 已在遊戲 session 裡的附屬對話 | 包廂主面 |
| **GO-INVITE** | `invite.compose` 開指定 SAM | 包廂 kind |
| **布告** | 全站營運公告 | peer 對話 |
| **`/s/`** | 單機傳閱 | 無 peer、無包廂 |

---

## 16. 驗收清單（Phase 0–1 草案）

**契約**

- [x] 本文件；不另開 DEC
- [x] GLOSSARY「包廂」；大廳熱點／主計劃交叉引用

**Phase 1（實作後）**

- [x] 已登入可鑄 `invite.room`；`short_url`＝`go…/i/…`；分享面 QR／複製
- [x] 未登入不能鑄；導向登入；不擋 `/s/`
- [x] Guest 無帳號、不下載 SAM，同意後進入包廂 UI
- [x] 兩端互傳≥1 則文字；傳≥1 檔（≤上限）；超限拒；拒絕 offer 不傳
- [x] 訊息／檔不經 Platform；散場本機清空
- [x] 包廂 offer SDP 含 `m=audio`、`m=video`
- [x] `/chat` 進 `/room`；大廳／更多文案為「包廂」
- [x] 無 `alert`／`confirm`／`prompt`；窄屏可邀請、可傳、可結束（結束有頁內確認）
- [x] 斷網／短鏈過期：未入座頁內錯誤；已連線不受短鏈失效影響

---

## 修訂紀錄

| 日期 | 變更 |
| --- | --- |
| 2026-08-18 | 初版 Draft：`/room` 包廂；Phase 1＝文字＋傳檔；契約預留音視訊／投放／開局；`invite.room`；SDP 預留 m-line；ICE 與遊戲邀請切開；資料不落雲端 |
