# Playgrounds 純玩版：包廂（go `/room`）

> **狀態：** Draft（2026-08-18）— Phase 1：進門即主面、不鎖 1:1；**包廂＝主持 `/room` 畫面，過期的是門牌**  
> **權威決策：** 從屬 [DECISIONS.md](./DECISIONS.md) **DEC-050**（純玩版）、**DEC-045**（Roster／薄 signaling；**非** Avatars 產品面）、**DEC-047**（Platform Invite）；**不另開 DEC**  
> **相關：** [PG-GO-CLIENT-PLAN.md](./PG-GO-CLIENT-PLAN.md)、[PG-GO-AUTH-PLAN.md](./PG-GO-AUTH-PLAN.md)（登入＋記憶體 field API key）、[PG-GO-HOST-INVITE-PLAN.md](./PG-GO-HOST-INVITE-PLAN.md)（GO-INVITE＝遊戲 compose；**勿混**）、[PG-GO-SESSION-CHAT-PLAN.md](./PG-GO-SESSION-CHAT-PLAN.md)（局內 overlay 對話——**勿混**）、[PG-GO-SHOP-LOBBY-PLAN.md](./PG-GO-SHOP-LOBBY-PLAN.md)（大廳熱點入口）、[PG-PLATFORM-API-PLAN.md](./PG-PLATFORM-API-PLAN.md)、[PG-PLATFORM-CREDITS-PLAN.md](./PG-PLATFORM-CREDITS-PLAN.md)（官方 TURN；包廂 ICE **與**遊戲邀請分開）、`.cursor/rules/no-native-dialogs.mdc`、`.cursor/rules/mobile-first-ux.mdc`、[GLOSSARY.md](./GLOSSARY.md)

一句話：已登入會員進 **`/room` 就是這一間包廂**（主面立刻出現；**不必先請人**）。**包廂活著＝主持這個畫面還開著；過期的是邀請碼，不是這一間。** 用既有 Platform Invite 短鏈把人請進來。連上之後資料只走 WebRTC（**不**經 Platform 中繼、**不**雲存）。人數**對齊遊戲 session**：同一張有效門牌可多人加入，**不鎖 1:1**。**第一階段產品**＝文字＋傳檔；**契約不把包廂定成聊天室**——同一條連線預留給音視訊、桌機投放、日後在包廂裡開一局等。

---

## 1. 動機

- 大廳已有「椅子／桌」熱點與 `/chat` 占位，但公開大廳聊天不像現實用法。網咖／室內遊樂場更常見的是：**租一間包廂**，關門說話、傳東西、有時開會、有時把桌機畫面丟到手機。
- Invite／WebRTC 目前幾乎只服務 **開 SAM 入座**（`invite.compose`）。要測「能不能連上」或做遊戲以外的用途，只能先開一局五子棋——過重，也把連線綁死在某一顆小品。
- 局內 [`session_chat`](./PG-GO-SESSION-CHAT-PLAN.md) 是對弈 overlay（預設收合、遊戲優先），**不是**一般用途隔間；該計劃把語音／傳檔列為 overlay **非目標**，那些能力應落在包廂。
- DEC-045 已撤銷「線上」tab。包廂是 **Invite 拉人進臨時隔間**，不是常駐誰在線、不是好友名單。

---

## 2. 目標

- **包廂＝一般用途 peer 隔間（硬）：** 產品面是「這一間」；裡面做什麼由階段遞增，**禁止**把 API／UI 契約寫死成「只能聊天」。
- **進門即主面（硬）：** 已登入會員開 `/room`＝已經在包廂裡（時間線／輸入／這一間）。邀請是**面內動作**（請人進來），**不是**進門條件。一個人在也是這一間。
- **兩個時鐘（硬）：** 包廂壽命＝主持 `/room` 這份文件還在；門牌壽命＝該張 `invite.room` 的 TTL（預設 5m）。門牌過期只擋**新人**；主面與已入座連線不受影響。**按「請人進來」才鑄門牌**（同一時間最多一張有效）。見 §6.4。
- **人數對齊遊戲 session（硬）：** **不鎖 1:1**。同一張**有效** Invite 短鏈可多人 join；**文字**對已連線 peer **fanout**；**檔案目錄** fanout、**檔案內容**只在點下載時 Owner→Requester（對齊 [session-chat](./PG-GO-SESSION-CHAT-PLAN.md) 終態的「多人」而非「全員收 bytes」）。API／UI 勿寫成雙人專用。
- **第一階段可交付：** 會員進 `/room` 即包廂 UI（可先不請人）；可請人進來；Guest 開 `/i/<short>` 同意進同一間 → DataChannel 文字＋傳檔；有人連上即「已連線」。
- **同一套邀請門牌：** 短鏈 canonical 仍是 `https://go.samkuo.me/i/<short_id>`（QR／分享面）；Host 主面是 `/room`。Guest 進門後**留在** `/i/`（**禁止**改寫成 `/room`）。
- **資料不落雲端：** 正文、檔案 bytes、（預留）音視訊 RTP **不**經 signaling／Invite API／物件儲存。文字時間線只在頁面生命週期；檔案內容**不**暫存在分頁——見 §8.2。
- **開這一間要登入、被請進來不必**（對齊 GO-INVITE／遊戲 Guest）。
- **Mobile-first；禁原生 `alert`／`confirm`／`prompt`。**

---

## 3. 非目標

只列**真正不做**的；後續階段能力見 **§9**，**不要**抄進本節。

- 常駐線上、好友名單、跨包廂歷史、推播、帳號私訊（勿復辟 Avatars／「線上」tab）。
- Platform 中繼文字／檔案／媒體；雲端聊天室；把包廂做成 SAM（型錄小品）。
- 第二套邀請網址（`/room/<id>` 當 short map）；為包廂另建邀請庫。
- 把局內右緣 overlay 改成全頁包廂，或在 `/s/` 單機無 peer 時假裝可傳。
- 完美斷線重連、預約房、可收藏的「我的包廂 3 號」、長 TTL 站樁房間（**不是**因為包廂 5 分鐘就散——散場只因主持離開 `/room`；不做的是雲端房間／可收藏房號）。
- 對讀者揭露直連 vs TURN／relay（DEC-004／點數計劃）。
- 使用者自備 TURN（DEC-045／047 否決）。
- 以包廂繞過受保護串流（DRM 畫面變黑不是要修的功能）。
- 第一刀場殼 `play` 同步同一包廂 UX（wire 預留共用；產品面先 go）。
- **包廂傳檔不得**用 Service Worker 攔截下載／把 ReadableStream 當 `Response` 餵系統下載管理員。
- **包廂傳檔不得**用 OPFS、IndexedDB、Cache Storage 當檔案緩衝或落盤。
- **包廂傳檔不得**把整份檔讀進 RAM（分享者 `arrayBuffer()` 整檔、收方組 `Blob`／`blob:` URL 再 `<a download>`）。

---

## 4. 原則（硬）

1. **能力開放** — 包廂是連線容器，不是單一 app。階段只約束**何時交貨**，不約束**永遠不能做什麼**（除非 §3）。
2. **殼擁有 UI** — 不是一顆 `kind: tool` SAM；進包廂不 materialize FileMap／畫布 iframe。
3. **薄 signaling** — Platform 只做 Invite／join／一次 O／A（DEC-045）。已連線則重用 PC；**禁止**經 Platform renegotiation。
4. **第一次 SDP 就為媒體留門** — 包廂 peer 在 `createOffer` 前加上 audio＋video transceiver（軌可空）。Phase 1 **不**開相機、**不**送 RTP；後期 `replaceTrack` 不必第二輪 Platform O／A。Signal 交換用 **`av1`（原始 SDP）**，不可壓成遊戲用的 `dc1`（只重建 DataChannel）——否則對端 `setRemoteDescription` 的 m-line 對不上，Guest 會看到「連線失敗」。
5. **遊戲邀請與包廂邀請分開** — 遊戲繼續 `invite.compose`＋（可選）relay-only。包廂 `invite.room` **不**因 Host `turn_prefer` 自動改成 relay-only（見 §7.3）。
6. **兩個時鐘** — 短鏈 TTL（預設 5m）＝**這一張門牌**還能不能請新人，**不是**包廂租期。已入座且**不斷線**不受門牌過期影響。包廂散場＝主持離開 `/room`（結束／回大廳／關分頁／重整）→ 關 PC、丟時間線與目錄。Guest「離開」只斷自己。
7. **go ⊂ play（wire）** — 文字重用 `session_chat`；檔案新獨立 `type` 放共用 roster 模組。Play 可晚掛 UI。
8. **同時一 SAM 仍成立** — 包廂不是 SAM；進 `/s/`／遊戲 `/i/` 則離開包廂（破壞性，頁內確認）。
9. **進門即這一間** — 已登入開 `/room` 就是包廂主面。**沒按「請人進來」就不鑄 Invite、不倒數。** **禁止**用「尚未邀請」另做一套非包廂畫面當主流程；也禁止進門自動鑄門牌，讓 TTL 變成「房間快到期」的氛圍。
10. **不鎖雙人** — Host answer loop **持續作答**（對齊遊戲 compose 多 join；勿 `maxAnswers: 1`）。文字／**檔案目錄** fanout；內容按下載路由。函式名勿叫 `sendToOpponent`。
11. **主面 ≠ 分享面** — 主面只回答「誰在這一間」；QR／TTL／再發一張只出現在「請人進來」分享面（寬屏側欄最多門牌**小狀態**，不常駐大 QR）。

---

## 5. 產品形狀與用語

### 5.1 空間

```text
大廳 `/`  ──熱點「包廂」──►  `/room`（已登入＝這一間主面；可請人進來）
Guest 掃碼 `/i/<short>`  ──kind=invite.room──►  同意 → 同一包廂主面（**網址仍 /i/**）
深鏈 `/s/`／遊戲 `/i/`  ──bypass──►  不經包廂
```

進 `/room` 後大廳 canvas **卸載**（對齊 `/s/`、`/i/`：殼是大廳，包廂不是第二個大廳）。

大廳熱點：讀者面 **包廂**（門／隔間入口，不是大廳正中「公開聊天區」）。契約 `hotspotId`＝`room`；大廳畫成南向包廂門。見 [PG-GO-SHOP-LOBBY-PLAN.md](./PG-GO-SHOP-LOBBY-PLAN.md)。

### 5.2 用語（硬）

| 用 | 不用 |
| --- | --- |
| 包廂、進包廂、請人進來、**結束這一間**（主持）、**離開這一間**（Guest）、再發一張邀請、投放、檔案分享區、下載、撤回 | 聊天區、聊天室、房間、Room、Lounge、Lobby（對讀者）；「先邀請才能進包廂」；附加檔、傳給對方、接收附件；Guest 說「結束這一間」 |
| 已連線、N 人在、就你、這一間還在、把這頁開著 | 直連、P2P、DataChannel、TURN、視訊會議 SaaS 腔；把包廂說成 1 對 1；**包廂倒數／房間即將過期／租期** |
| URL `/room`（與 `/help`／`/apps` 同：路徑英文、chrome 中文）；門牌／邀請（主持 UI 可說「門牌」） | 把 `/chat` 當產品 canonical；對 Guest／分享 title 說「門牌」當產品名 |

局內 overlay 仍叫 **對話**（[PG-GO-SESSION-CHAT-PLAN.md](./PG-GO-SESSION-CHAT-PLAN.md)），不要改名包廂。

---

## 6. URL 與 Invite

### 6.1 路徑

| 誰 | URL | 語意 |
| --- | --- | --- |
| Host 主面 | **`https://go.samkuo.me/room`** | 包廂 UI（已登入即進；邀請為面內動作）。**不是**房間 ID，重整＝新的空一間 |
| Guest 門牌 | **`https://go.samkuo.me/i/<short_id>`** | 解 kind → 包廂 consent（**不**下載 SAM）；同意後**仍是這個網址** |
| 舊占位 | `/chat` | **導向 `/room`**（相容；勿兩套產品面） |

- `/room` 可 prerender／進 sitemap（與 `/help` 同）；**不**把 secret 放進公開 HTML。
- `/i/` 維持 `noindex`／robots Disallow。
- Guest 同意後**維持** `/i/<short>`；**禁止** `replaceState` 成 `/room`（Guest 重整 `/room` 會走主持開間；已登入甚至會鑄新邀請）。
- **分享／QR 永遠是 `/i/`**。
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

**Host（開這一間）**

```text
未登入 `/room` → 仍是包廂殼（時間線空態）＋主 CTA「登入後開包廂」（goAuth.login；不擋回大廳、不擋 `/s/`）
已登入 → **直接包廂主面**（時間線／輸入／這一間；門牌＝尚未發出，不倒數）
  →「請人進來」且尚無有效門牌：
       mintPlatformInvite({ kind: "invite.room", intent, targetField: goOrigin() })
       → 開 GoShareSheet（QR／複製／系統分享；url＝/i/<short>）
       → Host answer loop **持續作答**（連線 only；不開 SAM session；不因第一位 Guest 停）
  →「請人進來」且門牌仍有效：只開同一分享面（同一張 QR）
  →「請人進來」且門牌已過期：鑄新的、撤舊的、開分享面（禁止再分享過期 QR）
  → 有人 DataChannel open → 時間線文字 fanout；檔案目錄同步
  →「結束這一間」／回大廳／Esc → 頁內確認 → 關所有 PC、撤 Invite
```

**Guest**

```text
開 /i/<short> → preview
  → 過期／撤銷／主持不在 → 進不去（頁內錯誤；請對方再發一張）
  → kind=invite.room（或 intent.surface=room）→ consent「進這間包廂」（可改臨時顯示名；無棋規／SAM 摘要）
  → join_cap → offer → answer → DataChannel
  → 包廂 UI（跳過 loading_sam）；網址仍是 /i/<short>
  →「離開這一間」→ 頁內確認 → 只斷自己；主持與其他人還在；自己掛的檔 unshare
拒絕 → 不佔成功 handshake
```

現況 `guestRuntime.consentAndPlay` 無 `sam.source` 即失敗——包廂必須**分流**，不可走 compose 下載管線。Guest 認 `invite.room` **或** `intent.surface === "room"`（kind 可能被預設成 `signal.handshake`）。

同一短鏈在**門牌有效期間**可多人加入（對齊遊戲 Invite；Platform 握手仍串行，做完接下一個）。生命週期細節見 **§6.4**。

### 6.4 生命週期（兩個時鐘）（硬）

| 物件 | 活著的條件 | 死法 | 對人怎麼說 |
| --- | --- | --- | --- |
| **包廂** | 主持的 `/room` 這份文件還在（未關、未重整、未離開路由） | 主持按「結束這一間」、回大廳、關分頁、重整 | 「這一間」 |
| **門牌** | 這一張 `invite.room` 未過期、未撤銷，且主持還在作答 | TTL 5 分鐘、再發一張時撤舊的、散場時撤 | 「邀請／門牌」 |
| **在座連線** | 該 peer 的 DataChannel 還開著 | 對方離開、ICE 死、主持散場 | 「N 人在／已斷線」 |

**推論**

1. **一個人在也是這一間。** 沒人連上、門牌過期或尚未發出，包廂都還在。
2. **門牌過期 ≠ 散場。** 已入座且不斷線的人繼續；新人掃舊碼進不來。主持再發一張即可。
3. **`/room` 不是房間 ID。** 沒有「包廂 3 號」。主持重整＝新的空包廂；舊 peer 回不去（對齊 §3 不做完美重連）。
4. **Guest 網址不是 `/room`。** 見 §6.1。
5. **同一時間最多一張有效門牌。** 再請人而舊的已過期＝鑄新、撤舊；舊 QR 立刻作廢。有效期間再按「請人進來」＝同一張，不另鑄。
6. **按需鑄（硬）。** 沒按「請人進來」就不 `mint`、不開始 TTL、分享面沒有短鏈。禁止進門自動鑄來「讓 QR 就緒」。
7. **「已入座不受短鏈過期影響」只保護不斷線的人。** Guest 重整＝重新 join，需要**當下仍有效**的門牌；過期則進不去，即使主持還在。
8. **切去別的 App／螢幕關閉 ≠ 主動散場**，但系統可能殺掉連線；對人只顯示已斷線，不教 ICE。
9. **關分頁／重整**無法走頁內確認則直接散場；Guest 看到主持已離開。應用內離開（Esc／回大廳／結束）必須頁內確認。

遊戲 `/i/` 的 5 分鐘很像「這一局約戰結束」。包廂不要沿用那個比喻：**短鏈只是門鈴；屋子是主持那一個畫面。**

**主持狀態**

```text
idle（未登入）
open（已登入、這一間）
  門牌：none | live（含 TTL）| expired
  在場：主持 ＋ 0..N Guest
ended（明示結束或離路由）→「再開一間」＝同一 /room 開一間空的（新時間線，不是重連舊 peer）
```

門牌從 `live` → `expired`：**不停**包廂、**不**改寫人數主狀態、**停** answer loop、**禁止**繼續分享該 `shortUrl`。

**Guest 狀態**

```text
consent → connecting → 在這一間
自己離開 → 斷自己的線
主持散場／關頁 →「主持已關掉這一間」；回大廳
進不去（過期／撤銷／主持不在／ICE 失敗）→ 頁內錯誤
```

主持已離開時，主 CTA＝回大廳；次要＝「請對方再發邀請」。**不要**把「重新開啟此邀請」當主 CTA（舊碼多半已撤）。

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
| `session_file` | **用** | 分享區目錄＋按需串流（見 §8.2）；**不是**聊天附件 push |
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

對人只顯示：等待／已連線／已斷線／傳送中。人數與門牌 TTL **分開呈現**（見 §10）；不要用「邀請還有 N 分鐘」當包廂主狀態。

---

## 8. 第一階段產品（文字＋傳檔）

### 8.1 文字

重用 `session_chat` wire／fanout／去重。包廂殼差異：

- 永遠自由文字（無 SAM `SessionChatHints`；無對弈 `active` 閘）
- 全頁時間線（**不是**右緣把手；沒有遊戲畫布要讓路）
- 對「同包廂已連線 peer」**fanout**（對齊 session-chat；一人在時送出可留本機時間線，可加一句低調「對方還看不到——這間目前只有你」——**不要**因此藏起輸入列／主面）
- 快捷語可留少數（在嗎／等一下／收到／謝謝）；預設收起
- 單則上限可沿用 200 字，或包廂略放寬並寫進測試；時間線記憶體上限建議 200 則
- 斷線清空；無雲端歷史
- Bubble 視覺可與 overlay 同族（本機右、遠端左；**顯示登入名**＋金色「主持」標記，名不是「主持」）
- 空態只說還沒有訊息；**不要**用空態當「請人進來」等待室（請人已在頂列／側欄）

### 8.2 傳檔（分享區＋串流落盤）

包廂傳檔**不是**訊息附件。產品模型：

1. 要分享的人把檔 **選進或 drop 進包廂「檔案分享區」**。瀏覽器此時只取得這個 session 讀該檔的授權（`File` handle 留在分享者分頁）；**不**讀內容、**不**發給任何人。
2. 其他人在分享區只看到目錄（檔名、大小、誰掛的）。晚進門的人拿到**當時目錄快照**，仍無內容。
3. 有人按 **下載**：先打開系統「另存新檔」（使用者手勢），**再**向分享者要內容。內容經 WebRTC **串流寫入使用者選的那個檔案**。
4. 傳輸全程點對點（經既有 Host 星狀 DataChannel 轉送幀；見下）。**不**經 Platform／R2。

對讀者可寫：**檔案還在分享者這台裝置上。點下載才會存到你選的位置。關包廂，目錄就沒了；已存到你硬碟的檔不受影響。**

#### 硬否決（實作／測試都要卡住）

| 否決 | 原因 |
| --- | --- |
| Service Worker 攔截下載、`ReadableStream` 當下載 `Response` | 本契約禁止為傳檔加／改 SW |
| OPFS／IndexedDB／Cache Storage 當緩衝或落盤 | 不是使用者選的檔；也不是「下載到本機硬碟」的產品語意 |
| 分享者 `file.arrayBuffer()`（或一次讀完整份） | 整檔進 RAM |
| 收方累積 `chunks[]`、`assemble`、`new Blob`、`blob:` URL、`<a download>` | 整檔進 RAM；下載變成「先暫存再另存」 |
| 一人下載就把 bytes fanout 給所有人 | 沒點下載的人被塞檔 |
| 先 `request` 再打開存檔對話 | 抵達的幀只能堆在 RAM |

RAM 預算：**最多約一個 chunk**（建議沿用 16 KiB）加上 DataChannel `bufferedAmount` 背壓視窗。背壓不足、把整檔 slice 完塞進 JS 佇列＝變相整檔進記憶體，同樣否決。

#### 落盤 API（唯一允許的寫入端）

請求端必須在送出 `request` **之前**取得 **File System Access** 寫入流：

```text
showSaveFilePicker({ suggestedName }) → fileHandle.createWritable()
```

之後每收到一幀 `writable.write(payload)`，傳完 `close()`。取消 picker＝**不**發 `request`。

瀏覽器沒有 `showSaveFilePicker`／`createWritable`（常見：iOS Safari）→ **這次下載失敗**，頁內說明換系統瀏覽器或電腦再開；**禁止**為通過而改走 Blob／OPFS／SW。掛檔（`<input type="file">`／drop）仍可用 OS 選擇器——那是讀取授權，不是落盤。

#### Wire

控制面 JSON（DataChannel 文字幀）＋ payload 二元幀。`binaryType = "arraybuffer"`。目錄可 fanout；**內容只走 Owner → Requester**（Host 若不是其中一方，只轉幀、不組裝）。

```text
session_file.share     { id, name, size, mime, owner }   // 掛上：僅 metadata
session_file.unshare   { id }
session_file.catalog   { items: share[] }                // 晚進門：Host 重放目錄
session_file.request   { id, transferId, from }          // 下載者；writable 已就緒
session_file.reject    { id, transferId }                // 已撤回／擁有者離席／無寫入能力／忙碌
session_file.chunk     二元：transferId + seq + payload  // 勿只用 file id（並行／排隊會撞 seq）
session_file.done      { id, transferId }
session_file.cancel    { id, transferId }
```

舊 `offer`／`accept`（「要不要收這份推送」）**停用**。掛上分享區＝已授權被拉；下載＝另存新檔＋拉流。

拓樸：Guest 只跟 Host 有 DC。Host 維持 `transferId → { ownerPeer, requesterPeer }`；`share`／`unshare`／`catalog` 轉給其他人；`request` 只轉給 owner；chunk／`done` 只轉給 requester。擁有者離席 → 其目錄 `unshare`、進行中 `cancel`。

分享者送檔：`file.slice(offset, offset+n)`（或等價 stream reader）每次一塊；`bufferedAmount` 高則停讀。

| 項 | Phase 1 初值（可調；寫進測試） |
| --- | --- |
| 單檔上限 | 32 MiB（傳輸時長／惡意檔保險，**不是** RAM 預算） |
| 同時傳送 | 1 筆進行中的 **transfer**（可排隊；**不是**限制 1 位可掛檔、也不是 1 位收件人） |
| 掛檔 | 分享區選檔／drop；可多份列在目錄 |
| 下載 | 先 Save picker，再 `request`；串流寫入該檔 |
| 預覽 | 目錄＝檔名＋大小＋誰掛的；**不**為縮圖先傳內容 |
| 散場 | 丟 `File` handle 與目錄；進行中 `cancel`；已寫入使用者選的檔**不**刪 |

OS 檔案選擇器允許（掛檔、另存）。可執行檔拒（頁內，非原生 dialog）。**否決**自動上傳 Platform／R2。

### 8.3 連線探測（Phase 1 已夠講）

DataChannel `open` ＝「已連線」。可選 ping。不把「先連包廂再保證五子棋 relay」當 Phase 1 故事。

---

## 9. 預留能力（不實作、契約不封死）

下列**不是**非目標。Phase 1 不做 UI，但 §7.1 的 PC／SDP 必須讓它們以後加得進去。

| 方向 | 概要 | 依賴 |
| --- | --- | --- |
| **開會** | 麥克風／鏡頭；`replaceTrack(getUserMedia)` | 瀏覽器權限對話＝OS 權限，不是產品 `confirm`；失敗頁內說明 |
| **投放** | 桌機 Host 選本機影片 `captureStream()`（或後期分頁 `getDisplayMedia`）→ 手機 Guest 全螢幕收看 | 同一視訊 transceiver；與開會出站互斥即可 |
| **在包廂開一局** | 已有 PC → 重用，不再經 signaling；本機開 SAM session | DEC-045 重用；GO-INVITE 後期；可先「散場再鑄遊戲邀請」 |
| **螢幕分享、僅語音、畫質檔** | 同一組 transceiver／DC | 另階段 |

實作約束：**peer 當一等物件**（不要做成「只能聊天的頁面單例」）。遊戲 SAM 若日後掛上同一 PC，應忽略閒置 A/V 軌；對弈中**不要**自動開相機。

投放快樂路徑＝**桌機 Host → 手機 Guest**；片源不出 Host 瀏覽器。不承諾 4K／跨網電影。受保護畫面變黑不修。

---

## 10. UX（Phase 1）

隱喻：網咖包廂——坐進去燈就亮；要加人再開門貼一張限時通行證。QR 是門上的便條，不是房間本身。

**主面永遠回答「誰在這一間」；分享面才回答「這張邀請還能不能用」。**

### 10.1 誰看見什麼

| | 主持 | Guest |
| --- | --- | --- |
| 時間線／輸入／分享區 | 進門即有 | 連上才有（connecting 用短狀態，不要空殼裝成已在） |
| 請人進來／門牌／TTL | 有 | **無** |
| 在場名單 | 有 | 有 |
| 結束這一間 | 有（散場） | 改 **離開這一間** |
| 再開一間 | 僅 ended | 無 |
| 網址 | `/room` | `/i/<short>` |

### 10.2 窄屏（預設）

1. **頂列（不自動藏）**  
   左：包廂。右：人數膠囊（「就你」／「3 人在」）＋主動作。  
   主持：`請人進來`（主）／`結束`（次、危險描邊）。Guest：只有 `離開`。熱區 ≥44×44px。
2. **一句狀態（live 區）**  
   只講在場與連線，**不講 TTL**。  
   例：`就你一個人 · 把這頁開著，這一間才還在`；有人：`3 人在`（可加顯示名）。斷一人可短暫 `小明已離開`，再回到人數。門牌過期**不**取代這一行（用 flash 或分享面）。
3. **時間線（主體，flex 吃剩餘高度）**  
   只有文字。空態：`還沒有訊息。先打字也可以。` **不要**寫「或請人進來」。
4. **檔案分享區＝可收合條**  
   預設一行：`檔案分享區 · 尚未掛檔`／`檔案分享區 · 2`。展開才有 drop／選檔／目錄／下載。說明縮成展開後一句。窄屏不要跟時間線搶固定 50vh。  
   **不要**做成輸入列「附加檔」、**不要**檔案氣泡混進時間線、**不要**「對方想傳檔過來／接收／拒絕」。
5. **輸入列 sticky 底**  
   主持一進來就有；不要等第一位 Guest。快捷語預設收起。
6. **請人進來 → 分享面（唯一放大 QR 的地方）**  
   - 有效：QR、口誦 `go.samkuo.me/i/…`、複製／系統分享、一句 `這張邀請約 N 分鐘內有效；過期後再發一張即可，這一間不會因此關掉。`  
   - 過期：**不要**再畫死 QR；主 CTA `再發一張邀請`。  
   - 尚未鑄：按請人進來再鑄再開分享面。
7. **確認（頁內，非原生 dialog）**  
   - 主持結束／Esc／回大廳：`關掉後在場的人會斷線，目錄會沒了。已存到硬碟的檔不受影響。`  
   - Guest 離開／Esc／回大廳：`離開後你會斷線；其他人還在。你掛上的檔會從分享區拿掉。`

### 10.3 寬屏（`min-width` 遞增）

左：時間線＋（可較開的）分享區＋輸入。  
右「這一間」卡片：

- 在場名單（主持金色標記＋顯示名）
- 一句：`這一間只在這個畫面開著的時候存在。`
- 門牌列：**小狀態**，不是英雄 QR  
  - 尚未請人：`還沒發邀請`＋「請人進來」  
  - 有效：`邀請有效 · 還有 4:32`＋「顯示邀請」（開同一分享面）  
  - 過期：`邀請已過期`＋「再發一張」
- `結束這一間`

**禁止**桌面先做再 `max-width` 縮小。**禁止**把大 QR 等待面當成已登入會員的預設首屏（寬屏也不常駐 240px QR）。現場掃碼是分享面的工作。

### 10.4 未登入／結束後／Guest 進不去

未登入：說明開這一間要通行證；不擋回大廳、不擋 `/s/`。補一句：`被請進來的人不必有通行證；開這一間的人要留在這個畫面。`

結束後：`這一間已結束`＋主持「再開一間」＋回大廳。**不要**在結束面留舊 QR。

Guest 主持已離開：主 CTA 回大廳；次要「請對方再發邀請」。

`/room` 不是對弈 canvas：頂列**不必** 3s 自動收起。Esc 回大廳（現況 `goEscapeHome` 含 `/chat` → 改 `/room`）。分享面開啟、確認散場期間：對齊既有 sheet 焦點與取消。

---

## 11. 隱私與儲存

| 項 | 規格 |
| --- | --- |
| 文字／檔案／（預留）媒體 | 只經 WebRTC；signaling 僅 SDP |
| Host API key | 頁面記憶體；mint／作答；關頁即失 |
| 時間線 | RAM；散場丟 |
| 檔案目錄 | RAM metadata；散場丟。**內容**只在下載時寫入使用者選的檔；分頁不留副本 |
| 檔案緩衝 | **禁止** OPFS／IndexedDB／Cache／SW／整檔 Blob |
| 顯示名 | 可繼續 Roster `localStorage` |
| 分析 | 若打點，只計「鑄了包廂邀請／握手成功」之類；不記正文、檔名可選不記 |
| 離線 | 包廂**不能**離線加入（與 `/i/` 同） |

對讀者可寫：**對話只在在場者的瀏覽器之間；檔案點下載才存到你選的位置，不會存到遊樂場伺服器。** 主持把這個畫面關掉，這一間就散了；目錄沒了，已存到硬碟的檔不受影響。

---

## 12. 實作切面（建議）

| 層 | 建議 |
| --- | --- |
| Invite | `wantsRosterSignal` 認 `invite.room`；**不要**對 room stamp 遊戲用 `relay: true` |
| Host | `roomRuntime`：進 `/room` 即主面；**按需** mint（勿 `openBooth` 自動鑄）；answer loop **持續作答**；門牌過期停 loop、清／作廢可分享的 shortUrl、**不**把 phase 打成 ended；**不** `open` SAM session |
| Guest | `guestRuntime`／`/i/` 依 kind **或** `intent.surface` 分流；room 不 `resolveGoSamFiles`；同意後**不** `replaceState` `/room`；離開 ≠ 主持散場 |
| 文字 | `goSessionChat` 加全頁模式，或包廂自用同一 store |
| 檔案 | 共用 `rosterSessionFile.ts`（目錄＋`transferId` 分塊／上限）＋單測；Host **按 transfer 路由** binary，禁止全員 fanout；`goRoomFileTransfer` 串流 `slice`／writable，禁止組 Blob |
| Peer | 包廂工廠：transceiver＋DC；遊戲 `createRosterOffer` 可暫不動 |
| 分享 | `GoShareSheet` 邀請模式；title「邀請你進包廂」 |
| 路由 | `go-client/src/routes/room/`；`/chat` 導向 `/room` |
| 大廳 | hotspot `room` → `/room`；label「包廂」 |
| chrome | 「更多」連到 `/room`；Esc／bulletin 路徑表 |

TDD：進門即主面且**未鑄**門牌、kind／surface 分流、無 SAM Guest、持續作答（非 1 Guest）、SDP 含 A/V m-line、`share` 不上 chunk、`request` 前已有 writable、chunk RAM≤一幀、第三者收不到 transfer、無 SW／OPFS／Blob 後備、fanout 目錄、斷線 `unshare`、門牌過期包廂仍 open、過期後禁止分享舊 shortUrl、Guest 離開人數 -1。純文件本刀不寫程式。

---

## 13. 階段

| Phase | 內容 | 完成定義 | 狀態 |
| --- | --- | --- | --- |
| **0. 契約** | 本文件；GLOSSARY／交叉引用 | 包廂≠overlay≠compose；能力開放寫死；進門即主面；不鎖 1:1；**兩個時鐘；按需鑄；Guest 留 `/i/`** | **本刀** |
| **1. 文字＋傳檔** | 進 `/room` 即主面；按需 mint `invite.room`、`/i/` consent、DC、`session_chat` fanout、`session_file` **分享區＋串流落盤**；SDP 已含 A/V m-line；answer loop 持續作答 | 會員不必先邀請就見包廂 UI（無 TTL）；同一短鏈 ≥2 Guest 與 Host 互傳文字；分享區可掛檔、點下載才寫入另存檔；無 Save picker 則頁內說明、不組 Blob；Platform 無正文／無檔 bytes；未登入不能開這一間；`/chat`→`/room`；門牌過期包廂仍在 | **按需鑄／兩個時鐘已落地；多人傳檔 e2e 手測仍待** |
| **2. 音視訊** | 開／關麥與鏡頭；`replaceTrack` | 不經第二輪 Platform O／A | 預留 |
| **2b. 投放** | 桌機本機影片 → 手機收看 | 片源不出雲 | 預留 |
| **3. 重用 peer 開局** | 包廂已連 → SAM session | 不必再掃一次（可選） | 預留 |

建議實作順序 **0 → 1**；2／2b／3 **不**互為阻塞，擇一即可開做。多人 **不是**另開 Phase——納入 Phase 1 契約。

---

## 14. 已凍結決策

| # | 題 | 定案 |
| --- | --- | --- |
| 1 | 名稱／URL | 讀者「包廂」；canonical **`/room`**；舊 `/chat` 導轉 |
| 2 | 產品本質 | **一般用途隔間**；Phase 1＝文字＋傳檔，**不是**功能上限 |
| 3 | Invite | **`invite.room`**；門牌仍 `/i/`；無 SAM |
| 4 | 文字 | 重用 `session_chat` |
| 5 | 傳檔 | `session_file` **分享區目錄**；點下載才串流到 `showSaveFilePicker`；**禁止** SW、OPFS、整檔 RAM／Blob |
| 6 | SDP | Phase 1 就要 audio＋video m-line（軌空） |
| 7 | ICE | 包廂 **≠** 遊戲 relay-only stamp |
| 8 | 登入 | 開這一間要；被請進來不要 |
| 9 | 雲 | 無；散場丟 |
| 10 | 進門 | **已登入開 `/room`＝包廂主面**；邀請是面內動作 |
| 11 | 人數 | **不鎖 1:1**；同一張**有效** Invite 多 join；文字／檔案**目錄** fanout；內容按 transfer 路由 |
| 12 | 兩個時鐘 | 包廂壽命＝主持 `/room` 文件；門牌 TTL 只管請新人；過期 ≠ 散場 |
| 13 | 按需鑄 | **沒按「請人進來」就不 mint**；同一時間最多一張有效門牌；過期後禁止分享舊 QR |
| 14 | Guest URL | 同意後**留在** `/i/<short>`；**禁止** `replaceState` `/room` |
| 15 | 角色 CTA | 主持「結束這一間」；Guest「離開這一間」；主面不把 TTL 當包廂狀態 |

---

## 15. 與既有通路（勿混）

| 流 | 是 | 不是 |
| --- | --- | --- |
| **包廂 `/room`** | 臨時隔間；進門即主面；Invite 請人（可多人）；**活著＝主持畫面開著** | 大廳公開桌、局內 overlay、型錄 SAM、必須先邀請才看得到 UI、1:1 專用、5 分鐘租期的雲端房間 |
| **Session chat** | 已在遊戲 session 裡的附屬對話 | 包廂主面 |
| **GO-INVITE** | `invite.compose` 開指定 SAM | 包廂 kind |
| **布告** | 全站營運公告 | peer 對話 |
| **`/s/`** | 單機傳閱 | 無 peer、無包廂 |

---

## 16. 驗收清單（Phase 0–1 草案）

**契約**

- [x] 本文件；不另開 DEC
- [x] GLOSSARY「包廂」；大廳熱點／主計劃交叉引用
- [x] **進門即主面：** 已登入開 `/room` 即時間線／輸入，不必先按邀請
- [x] **不鎖 1:1：** 同一短鏈多人可進；時間線 fanout；檔案目錄同步（內容不全員推送）
- [x] **兩個時鐘：** 包廂＝Host document；門牌 TTL 分開；按需鑄；Guest 留 `/i/`

**Phase 1（實作後）**

- [x] 已登入可鑄 `invite.room`；`short_url`＝`go…/i/…`；分享面 QR／複製
- [x] 進 `/room` 不按請人：主面在、**沒有** TTL、**沒有**可分享短鏈
- [x] 未登入不能開這一間；導向登入；不擋 `/s/`
- [x] Guest 無帳號、不下載 SAM，同意後進入包廂 UI（網址仍 `/i/`）
- [ ] 同一短鏈 ≥2 Guest 與 Host 互傳≥1 則文字；分享區掛檔後第二人 Save picker 下載成功（≤上限）；無 picker 則說明且零 binary；超限／可執行檔拒
- [x] 訊息不經 Platform；檔 bytes 不經 Platform；散場丟目錄（已存檔不刪）
- [x] 包廂 offer SDP 含 `m=audio`、`m=video`
- [x] `/chat` 進 `/room`；大廳／更多文案為「包廂」
- [x] 無 `alert`／`confirm`／`prompt`；窄屏可請人進來、可傳、可結束（結束有頁內確認）
- [x] 門牌過期：未入座進不去；已連線續用；主狀態仍是人數；舊 QR 不可再分享；「再發一張」鑄新撤舊
- [x] Guest「離開」：主持人數 -1、包廂仍 open；確認文案不是散場
- [x] 主持重整：Guest 斷線；主持看到空的新一間

---

## 修訂紀錄

| 日期 | 變更 |
| --- | --- |
| 2026-08-18 | 初版 Draft：`/room` 包廂；Phase 1＝文字＋傳檔；契約預留音視訊／投放／開局；`invite.room`；SDP 預留 m-line；ICE 與遊戲邀請切開；資料不落雲端 |
| 2026-08-18 | **進門即主面：** 已登入開 `/room`＝包廂 UI，邀請為面內動作。**不鎖 1:1：** 對齊遊戲 session（多 join、fanout）；撤 P0「1 Guest」與 Phase 4 多人預留 |
| 2026-08-18 | **傳檔改分享區＋串流落盤：** 掛檔只授權、點下載才向分享者拉流；寫入 `showSaveFilePicker`；禁止 SW、OPFS、整檔 Blob／`<a download>`；Host 只按 transfer 轉幀 |
| 2026-08-18 | **兩個時鐘＋UX：** 包廂＝主持 `/room` 畫面，過期的是門牌；按需鑄（撤進門自動鑄）；Guest 禁止 `replaceState` `/room`；主面＝在場、分享面＝邀請；主持結束／Guest 離開分開；§10 窄屏收合分享區、寬屏不常駐大 QR |
| 2026-08-18 | **Phase 1 實作跟上：** 進門不鑄；門牌過期停作答、撤碼、主狀態仍是人數；Guest `leaveRoom`；主面頂列請人／結束，QR 只在分享面 |
