# Playgrounds 純玩版：包廂（go `/room`）

> **狀態：** Draft（2026-08-18）— Phase 1：進門即主面、**入座不鎖 1:1**；**包廂＝主持 `/room` 畫面，過期的是門牌**；契約：**說／掛／播**、在場＋節目、SDP **2+2**、第二台掃門牌；**在場視訊僅 1:1**；**檔與音視訊皆直連優先**（Host DC 當 signaling；star 備援）  
> **權威決策：** 從屬 [DECISIONS.md](./DECISIONS.md) **DEC-050**（純玩版）、**DEC-045**（Roster／薄 signaling；**非** Avatars 產品面）、**DEC-047**（Platform Invite）；**不另開 DEC**  
> **相關：** [PG-GO-CLIENT-PLAN.md](./PG-GO-CLIENT-PLAN.md)、[PG-GO-AUTH-PLAN.md](./PG-GO-AUTH-PLAN.md)（登入＋記憶體 field API key）、[PG-GO-HOST-INVITE-PLAN.md](./PG-GO-HOST-INVITE-PLAN.md)（GO-INVITE＝遊戲 compose；**勿混**）、[PG-GO-SESSION-CHAT-PLAN.md](./PG-GO-SESSION-CHAT-PLAN.md)（局內 overlay 對話——**勿混**）、[PG-GO-SHOP-LOBBY-PLAN.md](./PG-GO-SHOP-LOBBY-PLAN.md)（大廳熱點入口）、[PG-PLATFORM-API-PLAN.md](./PG-PLATFORM-API-PLAN.md)、[PG-PLATFORM-CREDITS-PLAN.md](./PG-PLATFORM-CREDITS-PLAN.md)（官方 TURN；包廂 ICE **與**遊戲邀請分開）、`.cursor/rules/no-native-dialogs.mdc`、`.cursor/rules/mobile-first-ux.mdc`、[GLOSSARY.md](./GLOSSARY.md)

一句話：已登入會員進 **`/room` 就是這一間包廂**（主面立刻出現；**不必先請人**）。**包廂活著＝主持這個畫面還開著；過期的是邀請碼，不是這一間。** 同一張有效門牌可請人進來，**也可給自己的另一台掃**（不要再開一個 `/room`）。連上之後資料只走 WebRTC（**不**經 Platform 中繼、**不**雲存）。人數**對齊遊戲 session**：**不鎖 1:1**（文字／傳檔／節目可多人）。**在場視訊僅 1:1**（鏡頭只在兩人時）。產品三個動詞：**說**、**掛／存**、**播出**。**檔 bytes 與音視訊 RTP 皆直連優先**（後續 O／A 走主持 DataChannel，不經 Platform；建不起來回退 Host 轉送）。**第一階段產品**＝文字＋傳檔；播出 UI 分階段，但 SDP **現在**留在場＋節目兩層。**契約不把包廂定成聊天室或視訊會議。**

---

## 1. 動機

- 大廳已有「椅子／桌」熱點與 `/chat` 占位，但公開大廳聊天不像現實用法。網咖／室內遊樂場更常見的是：**租一間包廂**，關門說話、傳東西、開鏡頭、把桌機上的影片或音樂丟到手機。
- 同一條門牌要同時服務兩種現場：**請別人進來**，以及**自己的另一台裝置**（筆電開著 `/room`，手機掃碼進來傳相片、收看投放、當鏡頭）。後者不是第二套產品，只是同一間的第二個座位。
- Invite／WebRTC 目前幾乎只服務 **開 SAM 入座**（`invite.compose`）。要測「能不能連上」或做遊戲以外的用途，只能先開一局五子棋——過重，也把連線綁死在某一顆小品。
- 局內 [`session_chat`](./PG-GO-SESSION-CHAT-PLAN.md) 是對弈 overlay（預設收合、遊戲優先），**不是**一般用途隔間；該計劃把語音／傳檔列為 overlay **非目標**，那些能力應落在包廂。
- 分享區「下載到硬碟」在 iOS Safari 常沒有 Save picker（Phase 1 已否決 Blob 後備）。**收看／收聽播出**才是手機快樂路徑，不要把「存檔」當成唯一把檔從 A 台送到 B 台的辦法。
- DEC-045 已撤銷「線上」tab。包廂是 **Invite 拉人進臨時隔間**，不是常駐誰在線、不是好友名單。

---

## 2. 目標

- **包廂＝一般用途 peer 隔間（硬）：** 產品面是「這一間」；裡面做什麼由階段遞增，**禁止**把 API／UI 契約寫死成「只能聊天」或「視訊會議」。
- **進門即主面（硬）：** 已登入會員開 `/room`＝已經在包廂裡（時間線／輸入／這一間）。邀請是**面內動作**（請人進來），**不是**進門條件。一個人在也是這一間。
- **兩個時鐘（硬）：** 包廂壽命＝主持 `/room` 這份文件還在；門牌壽命＝該張 `invite.room` 的 TTL（預設 5m）。門牌過期只擋**新人**；主面與已入座連線不受影響。**按「請人進來」才鑄門牌**（同一時間最多一張有效）。見 §6.4。
- **人數對齊遊戲 session（硬）：** 包廂**不鎖 1:1 入座**。同一張**有效** Invite 短鏈可多人 join；**文字**對已連線 peer **fanout**；**檔案目錄** fanout、**檔案內容**只在點下載時 Owner→Requester。API／UI 勿把包廂寫成雙人專用隔間。**在場視訊**另條：僅 1:1（見下）。
- **在場視訊僅 1:1（硬）：** 鏡頭只在**恰好兩人**連線時（主持＋一位 Guest，含自己的第二台）。第三人加入則關鏡頭、頁內說明；**不做**會議格子牆、**不**把鏡頭轉給第三人。節目投放與文字／傳檔仍可多人。見 §9.2。
- **兩種在場同一條門牌（硬）：** 「請人進來」與「自己的另一台掃碼」契約相同。**第二台請掃門牌**；已登入再開 `/room`＝**另一間空包廂**，不是連上既有這一間。見 §5.4。
- **三個動詞（硬）：** **說**、**掛／存**、**播出**分開；同一份影音檔可以掛在分享區等人下載，也可以當節目播出——兩個按鈕，不是同一個。見 §5.3。
- **媒體兩層（硬）：** **在場**（鏡頭／麥）＋**節目**（本機影片／音樂投放）。第一次 SDP 就留兩層（§7.1）；後期 `replaceTrack`，**禁止**經 Platform 二次 O／A。Mesh 邊的後續 O／A 走主持 DataChannel（§7.4），不是 Platform。
- **直連優先（硬）：** 進門仍是 Guest↔Host 一條 PC（Platform 一次 O／A）。任兩端之間的 **檔 bytes 與音視訊 RTP** 有直連就走直連：Host↔某人＝進門那條（已是一跳）；Guest↔Guest＝主持用 DC 介紹再建 mesh 邊（**同一條** PC：2+2＋DC，chunk 走 DC、RTP 走 transceiver）。建不起來則回退 Host 轉送（檔＝轉幀，媒體＝轉 track）。**禁止**下載者當種子、整檔進 RAM 做 swarm。見 §7.4。
- **第一階段可交付：** 會員進 `/room` 即包廂 UI（可先不請人）；可請人進來；Guest 開 `/i/<short>` 同意進同一間 → DataChannel 文字＋傳檔；有人連上即「已連線」。播出 UI 見 Phase 2a／2b。
- **同一套邀請門牌：** 短鏈 canonical 仍是 `https://go.samkuo.me/i/<short_id>`（QR／分享面）；Host 主面是 `/room`。Guest 進門後**留在** `/i/`（**禁止**改寫成 `/room`）。
- **資料不落雲端、不錄製：** 正文、檔案 bytes、音視訊 RTP **不**經 signaling／Invite API／物件儲存；**不**做雲端或本機「存成影片」。文字時間線只在頁面生命週期；檔案內容**不**暫存在分頁——見 §8.2。
- **開這一間要登入、被請進來不必**（對齊 GO-INVITE／遊戲 Guest）。自己的第二台當 Guest 時也不必登入。
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
- 把包廂做成視訊會議 SaaS（格子牆、錄製、等候室、舉手、雲端 SFU）。**在場視訊不做多人。**
- 經 **Platform** 第二輪 O／A／renegotiation；Platform 或第三方 **SFU 中繼 RTP**。
- 完整 BitTorrent swarm（下載者當種子、infohash 產品面）；為 mesh 邊預留無上限 video m-line。
- 雲端片庫、VOD、把播出「存成影片」；AirDrop／Nearby／系統隔空投送當產品路徑。
- 以再開一個 `/room` 當「連上既有這一間」（`/room` 不是房號）。
- 每人同時各播一部電影；4K／跨網電影院承諾。
- **播出不得**為通過而組整檔 `Blob`／MSE 當第一刀（節目走 RTP；檔案下載仍走 §8.2）。
- **包廂傳檔不得**用 Service Worker 攔截下載／把 ReadableStream 當 `Response` 餵系統下載管理員。
- **包廂傳檔不得**用 OPFS、IndexedDB、Cache Storage 當檔案緩衝或落盤。
- **包廂傳檔不得**把整份檔讀進 RAM（分享者 `arrayBuffer()` 整檔、收方組 `Blob`／`blob:` URL 再 `<a download>`）。

---

## 4. 原則（硬）

1. **能力開放** — 包廂是連線容器，不是單一 app。階段只約束**何時交貨**，不約束**永遠不能做什麼**（除非 §3）。
2. **殼擁有 UI** — 不是一顆 `kind: tool` SAM；進包廂不 materialize FileMap／畫布 iframe。
3. **薄 signaling** — Platform 只做 Invite／join／**進門一次** O／A（DEC-045）。Guest↔Host 那條已連則重用（鏡頭／節目 `replaceTrack`）。**禁止**經 Platform renegotiation。Mesh 邊的後續 O／A 走主持 DataChannel（§7.4），不是 Platform。
4. **第一次 SDP 就為兩層媒體留門** — 包廂 peer 在 `createOffer` 前加上 **2 audio + 2 video** transceiver（在場＋節目；軌可空；順序見 §7.1）。Phase 1 **不**開相機、**不**送 RTP；後期 `replaceTrack` 不必第二輪 Platform O／A。**禁止**之後用 1+1 再經 Platform 補 m-line。Signal 交換用 **`av1`（原始 SDP）**，不可壓成遊戲用的 `dc1`（只重建 DataChannel）——否則對端 `setRemoteDescription` 的 m-line 對不上，Guest 會看到「連線失敗」。
5. **遊戲邀請與包廂邀請分開** — 遊戲繼續 `invite.compose`＋（可選）relay-only。包廂 `invite.room` **不**因 Host `turn_prefer` 自動改成 relay-only（見 §7.3）。**不要**把遊戲 DC-only SDP 改成包廂 2+2。
6. **兩個時鐘** — 短鏈 TTL（預設 5m）＝**這一張門牌**還能不能請新人，**不是**包廂租期。已入座且**不斷線**不受門牌過期影響。包廂散場＝主持離開 `/room`（結束／回大廳／關分頁／重整）→ 關 PC、丟時間線與目錄、停播出。Guest「離開」只斷自己。
7. **go ⊂ play（wire）** — 文字重用 `session_chat`；檔案新獨立 `type` 放共用 roster 模組。Play 可晚掛 UI。
8. **同時一 SAM 仍成立** — 包廂不是 SAM；進 `/s/`／遊戲 `/i/` 則離開包廂（破壞性，頁內確認）。
9. **進門即這一間** — 已登入開 `/room` 就是包廂主面。**沒按「請人進來」就不鑄 Invite、不倒數。** **禁止**用「尚未邀請」另做一套非包廂畫面當主流程；也禁止進門自動鑄門牌，讓 TTL 變成「房間快到期」的氛圍。
10. **不鎖雙人入座** — Host answer loop **持續作答**（對齊遊戲 compose 多 join；勿 `maxAnswers: 1`）。文字／**檔案目錄** fanout；內容按下載路由。函式名勿叫 `sendToOpponent`。**鏡頭**仍僅 1:1（原則 16）。
11. **主面 ≠ 分享面** — 主面只回答「誰在這一間」；QR／TTL／再發一張只出現在「請人進來」分享面（寬屏側欄最多門牌**小狀態**，不常駐大 QR）。
12. **第二台掃門牌** — 連上既有這一間的唯一辦法是掃（或開）**這一張** `/i/<short>`。已登入會員在另一台開 `/room`＝新的空一間。分享面必須寫這句，避免自己連自己連不上。
13. **說／掛／播分開** — 文字不承載檔 bytes；分享區不是播出器；播出不把 RTP 氣泡丟進時間線。
14. **主持＝進門與控制面樞紐** — Platform 只握手 Guest↔Host。文字、目錄、`session_mesh` 介紹由主持轉送。**檔 bytes 與音視訊 RTP：有直連走直連，否則 Host 轉。** **不**把「Guest 只准有一條 PC」寫死；也**不**規定媒體必須經主持轉碼。
15. **鏡頭預設關、不錄製** — 進包廂不開相機／麥。播出與鏡頭只在這一間還開著時存在於在場裝置之間。
16. **在場視訊僅 1:1** — 鏡頭只在恰好兩人時；第三人加入就關。節目投放仍可一路對多人。

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
| 包廂、進包廂、請人進來、**結束這一間**（主持）、**離開這一間**（Guest）、再發一張邀請、檔案分享區、下載、撤回 | 聊天區、聊天室、房間、Room、Lounge、Lobby（對讀者）；「先邀請才能進包廂」；附加檔、傳給對方、接收附件；Guest 說「結束這一間」 |
| 鏡頭、麥克風、投放、播出、收看、收聽、在場、節目 | 直播、推流、串流伺服器、視訊會議、開會（對讀者）；把 RTP 叫成「傳檔」 |
| 已連線、N 人在、就你、這一間還在、把這頁開著 | 直連、P2P、DataChannel、TURN、視訊會議 SaaS 腔；把**入座**說成只能兩人；**包廂倒數／房間即將過期／租期** |
| URL `/room`（與 `/help`／`/apps` 同：路徑英文、chrome 中文）；門牌／邀請（主持 UI 可說「門牌」） | 把 `/chat` 當產品 canonical；對 Guest／分享 title 說「門牌」當產品名 |

局內 overlay 仍叫 **對話**（[PG-GO-SESSION-CHAT-PLAN.md](./PG-GO-SESSION-CHAT-PLAN.md)），不要改名包廂。

### 5.3 三個動詞（硬）

| 動詞 | 讀者面 | 傳輸 | 階段 |
| --- | --- | --- | --- |
| **說** | 文字時間線 | DataChannel `session_chat` fanout | Phase 1 |
| **掛／存** | 檔案分享區；點下載才落到使用者選的檔 | `session_file`：目錄 fanout；內容 Owner→Requester（**直連優先**，否則 Host 轉幀） | Phase 1（star 已有；mesh 見 §7.4／1c） |
| **播出** | 在場鏡頭／麥（**鏡頭僅 1:1**），或本機影片／音樂當節目（可多人收） | **RTP**（**直連優先**，否則 Host 轉 track）；控制面可走 DC（§9.6） | UI＝Phase 2a／2b；SDP 現在就要 |

「串流」對讀者＝**播出**，不是下載。同一份影片可以掛在分享區等人存，**另外**按「播出」給在場裝置看／聽。

### 5.4 兩種在場（硬）

| 故事 | 主持 | Guest | 快樂路徑 |
| --- | --- | --- | --- |
| **請人進來** | 筆電（或一直開著的那台）`/room` | 別人掃 QR | 文字、傳檔、一起看節目；兩人時可開鏡頭 |
| **自己的另一台** | 通常是插電、畫面不關的那台 | **同一人**掃**這一張**門牌（不必登入） | 手機相片丟筆電、筆電電影丟手機、兩人時手機當鏡頭 |

兩者走同一條 `invite.room`，**不做**「我的裝置」帳號綁定或第二套邀請。

**硬：** 第二台裝置**掃門牌**進來。已登入會員在手機再開 `/room`＝另一間空包廂，連不上筆電那一間。主持永遠是「把 `/room` 這頁開著的那一台」。想用手機當屋子、筆電當客人：在手機登入開 `/room`，筆電掃碼。

---

## 6. URL 與 Invite

### 6.1 路徑

| 誰 | URL | 語意 |
| --- | --- | --- |
| Host 主面 | **`https://go.samkuo.me/room`** | 包廂 UI（已登入即進；邀請為面內動作）。**不是**房間 ID，重整＝新的空一間。**另一台已登入再開 `/room` 也是新的空一間** |
| Guest 門牌 | **`https://go.samkuo.me/i/<short_id>`** | 解 kind → 包廂 consent（**不**下載 SAM）；同意後**仍是這個網址**。自己的第二台也走這裡 |
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
       → 分享面加一句：`另一台裝置請掃這張邀請進來，不要再開一間包廂。`
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
3. **`/room` 不是房間 ID。** 沒有「包廂 3 號」。主持重整＝新的空包廂；舊 peer 回不去（對齊 §3 不做完美重連）。已登入在**另一台**開 `/room`＝又一間空的，不是重連。
4. **Guest 網址不是 `/room`。** 連上既有這一間＝掃／開這一張 `/i/<short>`。見 §5.4、§6.1。
5. **同一時間最多一張有效門牌。** 再請人而舊的已過期＝鑄新、撤舊；舊 QR 立刻作廢。有效期間再按「請人進來」＝同一張，不另鑄。
6. **按需鑄（硬）。** 沒按「請人進來」就不 `mint`、不開始 TTL、分享面沒有短鏈。禁止進門自動鑄來「讓 QR 就緒」。
7. **「已入座不受短鏈過期影響」只保護不斷線的人。** Guest 重整＝重新 join，需要**當下仍有效**的門牌；過期則進不去，即使主持還在。
8. **切去別的 App／螢幕關閉 ≠ 主動散場**，但系統可能殺掉連線；對人只顯示已斷線，不教 ICE。
9. **關分頁／重整**無法走頁內確認則直接散場；Guest 看到主持已離開。應用內離開（Esc／回大廳／結束）必須頁內確認。
10. **自己的第二台＝Guest。** 不另建「裝置配對」；已登入掃門牌進來仍是 Guest（網址仍 `/i/`；CTA 是「離開這一間」不是「結束這一間」）。

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

現況 [`createRosterOffer`](../src/components/playgrounds/roster/rosterPeer.ts) 在 `media: "ready"` 時走 [`reserveBoothMediaTransceivers`](../src/components/playgrounds/roster/rosterPeer.ts)（**2 audio + 2 video**）。遊戲 `invite.compose` **維持 DC-only**（不要把五子棋握手改成包廂 m-line）。

包廂 `createOffer` 前，**順序凍結**（m-line 對不齊＝連線失敗）：

```ts
pc.addTransceiver("audio", { direction: "sendrecv" }); // 在場音（麥）
pc.addTransceiver("video", { direction: "sendrecv" }); // 在場視（鏡頭）
pc.addTransceiver("audio", { direction: "sendrecv" }); // 節目音（音樂／影片聲）
pc.addTransceiver("video", { direction: "sendrecv" }); // 節目視（影片／後期螢幕）
pc.createDataChannel("roster", { ordered: true });
```

實作建議：包廂用**具名** helper（例如 `reserveBoothMediaTransceivers`），**不要**把遊戲可能共用的 `reserveRosterMediaTransceivers` 默默改成 2+2。現況 1+1 須在 Phase 2 UI 之前改掉（見 §13）；改完以前**不要**開鏡頭／投放 UI。

後期在場／節目各自 `RTCRtpSender.replaceTrack`；關則 `replaceTrack(null)`。**禁止**經 Platform renegotiation 加 m-line。

- 包廂走 Platform `transport: signal`（wire 上限 `ROSTER_WIRE_MAX_CHARS_SIGNAL`）；**不要**把帶媒體 m-line 的 SDP 塞進 OOB QR 預算。BUNDLE 候選只放第一條 m-line（ICE／DTLS 憑證仍留在各 m-line）；`av1` JSON **gzip** 後再 base64url（前綴 `z`）。遊戲 `dc1` 不 gzip，以保住 QR 相容。
- 驗收（即使 Phase 1 UI 無相機）：包廂 offer SDP **含兩組** `m=audio` 與兩組 `m=video`。

### 7.2 DataChannel `type`（與 presence／avatar_relay 同級）

| `type` | Phase 1 | 說明 |
| --- | --- | --- |
| `presence` | 用 | 既有 |
| `session_chat` | **用** | 文字；重用 [`rosterSessionChat.ts`](../src/components/playgrounds/roster/rosterSessionChat.ts) |
| `session_file` | **用** | 分享區目錄＋按需串流（見 §8.2）；**不是**聊天附件 push；**不是**節目播出 |
| `session_mesh` | mesh 介紹 | 主持轉送任兩 peer 的 O／A；**不**經 Platform；**不**載檔 bytes／RTP |
| `session_cast` | Phase 2 | 節目控制面（開始／停止／可選 paused＋t）；**不**承載影音 bytes |
| `session_ping` | 可選 | RTT 探測；對人可顯示「約 N ms」，不揭露路徑 |
| `avatar_relay` | 不用 | 包廂無 SAM session；後期若在包廂開局再掛 |

**禁止**把檔案或聊天正文掛成 `avatar_relay.payload`。

### 7.3 ICE（與遊戲邀請切開）

| Invite | ICE |
| --- | --- |
| `invite.compose` | 不變：Host `turn_prefer`＋官方 TURN → **relay-only**（點數計劃 §7.2） |
| `invite.room` | **預設 STUN／直連**（含區網 host／srflx）。**不**因 `turn_prefer` 自動 stamp relay-only、**不**因附上 TURN URL 就走現況 `iceTransportPolicy: "relay"` 那條遊戲工廠 |

理由：包廂傳檔與節目投放都以**同一網路或足夠直連**為快樂路徑；高碼率走官方 relay 會貴且易卡。包廂「已連線」測的是**這間包廂**，不是五子棋的 relay 政策。若要測對弈備援，另鑄遊戲邀請。

跨網連不上：頁內錯誤／請靠近同一網路或請對方再試；**不**教 ICE。官方 TURN 作包廂「可 fallback、非 relay-only」是否開放，**另段**（牽涉點數與 `buildRosterRtcConfiguration`）；不阻塞 Phase 1。**不承諾**跨網高碼率電影。

對人只顯示：等待／已連線／已斷線／傳送中／播出中。人數與門牌 TTL **分開呈現**（見 §10）；不要用「邀請還有 N 分鐘」當包廂主狀態。

### 7.4 Mesh（直連優先；Host 當 signaling）

進門＝Platform 一次 O／A，得到 Guest↔Host 的 PC（2+2＋roster DC）。**檔與音視訊同一條規則：** 有直連就走直連；沒有才經 Host。這不是 Platform renegotiation。

```text
Host ↔ 某人     進門 PC 已是一跳（檔 DC＋在場／節目 RTP）——不必另建 mesh
Guest ↔ Guest   Host 用 session_mesh 介紹 → mesh PC（同樣 2+2＋DC）
失敗            該對回退 Host 轉送：檔＝轉幀；RTP＝轉 track（不組裝、不混成格子牆）
```

```text
進門     Guest ── Invite O／A ── Host          ← 唯一經 Platform
介紹     Host ── session_mesh.* ── A／B        ← 只轉 SDP／候選
直連     A ════ 2+2＋DC ════ B                 ← chunk 走 DC；鏡頭／麥／節目走 RTP
失敗     該對繼續走 Host star
```

**Mesh 邊 SDP 對齊進門包廂工廠**（同一套 2+2＋DC、同一 m-line 順序；軌可空）。**不要**做成「傳檔 DC-only、媒體另開一條 PC」。後期 `replaceTrack`；關則 `replaceTrack(null)`。

```text
session_mesh.hello     { peerId }                 // 新人入座：Host 把既有 peer 介紹給雙方
session_mesh.bye       { peerId }                 // 有人離開：Host 通知其餘 Guest
session_mesh.offer     { from, to, sdp }
session_mesh.answer    { from, to, sdp }
session_mesh.candidate { from, to, cand }         // 可選；也可 ICE complete 一次帶完
session_mesh.fail      { from, to }               // 建不起來 → star
```

Host **只轉**這些 JSON，不 `setRemoteDescription` 別人的 mesh SDP，也**不**當雲端 SFU。ICE 對齊包廂直連；失敗不教 ICE。

人數軟頂：包廂規模（建議 ≤6 人）下 mesh 邊數可接受；**不要**做成無限 swarm。

**不像 WebTorrent 的部分（硬）：** 下載者不當種子；分頁不留可再分發的檔副本；無 magnet／infohash 產品面。仍是 Owner 持有 `File` handle，Requester 拉流——mesh 只改路徑。音視訊同樣：播出者出站、收方進站，Host 只在沒有直連時轉 track。

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
4. 傳輸點對點、**不**經 Platform／R2。路徑與音視訊相同：**直連優先**（Owner↔Requester 已有 mesh／進門 DC 則走那條）；否則 Host 星狀轉幀（現況 Phase 1）。Host 若不是其中一方，只轉控制面／（fallback 時）轉幀，**不**組裝。

對讀者可寫：**檔案還在分享者這台裝置上。點下載才會存到你選的位置。關包廂，目錄就沒了；已存到你硬碟的檔不受影響。**

**播出 ≠ 下載（硬）：** 分享區「下載」走本節。把同一份影音**播給在場裝置看／聽**走 §9 節目 RTP，不經 `session_file` chunk。目錄可對影音 MIME 提供次要動作「播出這份」（Phase 2b；僅持有該檔的那台）。iOS 無 Save picker 時下載失敗——**收看播出**才是手機把桌機影片看完的快樂路徑，不要為此改走 Blob。

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

拓樸：目錄與 `request`／`reject`／`unshare` 仍經 Host fanout／轉送。**chunk／`done`：** 若該 `transferId` 的 Owner 與 Requester 之間已有直連 DC（進門或 mesh）且 `open` → 直送；否則 Host 維持 `transferId → { ownerPeer, requesterPeer }` 轉 binary（現況 `goRoomFileStar`）。可在 star 已開始後 mesh 建好再切直連（勿為等握手卡住 writable）。擁有者離席 → 其目錄 `unshare`、進行中 `cancel`。Host 自己就是 Owner 或 Requester 時，進門那條 PC 已是一跳，不必另建 mesh。

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

## 9. 播出（契約現在凍；UI 分階段）

下列**不是**非目標。Phase 1 **不做**鏡頭／投放 UI，但 **§7.1 的 2+2 SDP 與本節媒體模型現在凍結**——禁止之後用 Platform renegotiation 補軌。仍預留、未凍死實作細節的只有「在包廂開一局」與螢幕分享。

### 9.1 兩層媒體

| 層 | 讀者面 | 來源 | 同時 |
| --- | --- | --- | --- |
| **在場視訊** | 鏡頭 | `getUserMedia` video | **僅 1:1**：恰好兩人連線時可互看；第三人加入則 `replaceTrack(null)`。預設關 |
| **在場音** | 麥克風 | `getUserMedia` audio | 兩人時互聽（直連）。≥3 人：**各對直連優先**；沒有 mesh 才 Host 混音或轉 track。預設關。**不是**視訊會議 |
| **節目** | 投放／播出 | 本機 `<video>`／`<audio>` 的 `captureStream()`；後期可加 `getDisplayMedia` | **整間同一時間一路**（一人播出，其他人收；與鏡頭 1:1 無關） |

這樣可以：兩人時 **看片＋講話＋互看鏡頭**；多人時 **一起收節目＋（可選）聽得到彼此**，**沒有**多人鏡頭。不承諾每人各播一部、4K、跨網電影院。受保護畫面變黑不修。

關播出／關鏡頭＝`replaceTrack(null)`，不必重新握手。

**否決**舊稿「投放與開會出站互斥、共用同一條視訊軌」——那會把「一起看＋說話」封死，且 1+1 無法在禁止 Platform renegotiation 的前提下補第二層。

### 9.2 拓樸

與傳檔同一條：**直連優先，star 備援。** 鏡頭人數上限仍是 1:1（產品），與「RTP 走哪條 PC」分開。

```text
Host ↔ X      進門 PC（已直連）：文字／目錄／session_mesh／檔 DC／在場＋節目 RTP
Guest ↔ Guest mesh PC（2+2＋DC）：檔 chunk＋在場音／節目 RTP；失敗 → Host 轉
```

| | 2 人（含自己的第二台） | ≥3 人 |
| --- | --- | --- |
| **在場視訊** | 互看（進門 PC，已直連） | **關鏡頭**；頁內 `鏡頭只在兩人時`。不轉給第三人、不做格子牆 |
| **在場音** | 互聽（進門 PC） | **各對直連優先**；否則 Host 轉 track 或混音 |
| **節目** | 播出者 → 對方（進門 PC） | 播出者 → **每一位**收方：**直連優先**（Host 播出＝各進門 PC；Guest 播出＝mesh）；否則 Host 轉 track |
| **檔 bytes** | 進門 DC 已是一跳 | **直連優先**；否則 Host star |

- **不做：** 雲端 SFU、為每人預留無上限 **額外** video m-line、多人 live 視訊、規定媒體必須經主持轉碼。
- **不否決：** Guest–Guest mesh（檔＋音視訊同一條邊）；signaling＝主持，不是 Platform。
- 人數軟頂（可調）：文字／掛檔／節目對齊遊戲 session；在場視訊＝2；mesh 建議包廂 ≤6。超過頁內說明。
- 第三人加入而鏡頭正開：立即關雙方在場視軌；節目與傳檔不停。

### 9.3 播出 ≠ 傳檔

| | 分享區下載（§8.2） | 節目播出 |
| --- | --- | --- |
| 目的 | 對方硬碟多一份 | 當場看／聽；散場沒有檔 |
| 開始 | 先 Save picker，再拉 bytes | **節目：** 播出者選檔，收方跟 `session_cast`。**鏡頭：** 對方按收看才送 RTP（不是開了就廣播） |
| RAM | ≤ 一幀 chunk | 瀏覽器播放緩衝；**禁止**為播出組整檔 Blob／MSE |
| 控制 | 下載者自己的進度 | **播出者**播／停／seek；收方只跟；音量各調各的 |

### 9.4 瀏覽器（驗收寫死，不當 Phase 2 bug）

| 能力 | 快樂路徑 | 失敗怎麼辦 |
| --- | --- | --- |
| 收看／收聽節目、開鏡頭、開麥 | 含 iOS Safari | 權限拒＝頁內說明 |
| 本機影片檔 `captureStream()` 當節目源 | **Chromium 桌機播出** | Safari 當播出端失敗→請換電腦播出，或改掛檔讓對方下載（若對方有 Save picker） |
| 螢幕分享 `getDisplayMedia` | 後期（2c） | 不是第一刀 |
| Save picker 下載 | 桌機／Android Chromium | iOS 失敗（§8.2）；改走收看 |

節目走 RTP；**禁止**用 DataChannel 把整部電影推進 MSE 當第一刀。

### 9.5 誰能開、誰能播

- **鏡頭：** 僅恰好兩人時可開（預設關）。**開鏡頭＝本機預覽＋掛上可收看，不自動把 RTP 推給對方**（對齊分享區：掛檔不送 bytes）。對方按「收看鏡頭」才 `request`，出站才 `replaceTrack`。第三人在場＝控件停用或點了頁內說明。瀏覽器權限對話＝OS 權限，不是產品 `confirm`。
- **麥：** 不限兩人（與鏡頭分開）。
- **節目：** 持有該檔（或該螢幕）的那台。快樂路徑＝**桌機播出、手機收**。人數不限 1:1。
- 進包廂**不**自動開相機。

### 9.6 控制面 `session_cast`／`session_camera`

JSON、DataChannel；**不**載影音 bytes。Host 轉給所有已連線 peer（對齊文字 fanout）。

**節目** `session_cast`：收方只跟 `state`；不要做成每人獨立 Netflix。

```text
session_cast.start  { from, kind: "video"|"audio", name? }
session_cast.stop   { from }
session_cast.state  { from, paused, t }   // 可選；播出者 seek／暫停時帶
```

**鏡頭** `session_camera`：對齊分享區掛／拉。開鏡頭不送 RTP；對方 `request` 才 `replaceTrack`。

```text
session_camera.offer    { from }   // 開鏡頭：可被收看，尚未送 RTP
session_camera.unoffer  { from }   // 關鏡頭
session_camera.request  { from }   // 收看：對端才 replaceTrack
session_camera.release  { from }   // 停止收看
```

### 9.7 其他預留

| 方向 | 概要 | 依賴 |
| --- | --- | --- |
| **在包廂開一局** | 已有 PC → 重用，不再經 signaling；本機開 SAM session | DEC-045 重用；GO-INVITE 後期；可先「散場再鑄遊戲邀請」 |
| **螢幕分享、僅語音、畫質檔** | 節目 transceiver／同一 DC | Phase 2c；不阻塞 2a／2b |

實作約束：**peer 當一等物件**。遊戲 SAM 若日後掛上同一 PC，應忽略閒置 A/V 軌；對弈中**不要**自動開相機。

**不錄製。** 沒有雲端拷貝、沒有「存成影片」。

---

## 10. UX

隱喻：網咖包廂——坐進去燈就亮；要加人再開門貼一張限時通行證。QR 是門上的便條，不是房間本身。自己的手機掃同一張便條＝第二個座位，不是再開一間。

**主面永遠回答「誰在這一間」；分享面才回答「這張邀請還能不能用」。** 播出是第三塊面（Phase 2），不要一進門就是大鏡頭。

### 10.1 誰看見什麼

| | 主持 | Guest |
| --- | --- | --- |
| 時間線／輸入／分享區 | 進門即有 | 連上才有（connecting 用短狀態，不要空殼裝成已在） |
| 鏡頭／投放（Phase 2） | 進門即有控件；預設關 | 連上才有 |
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
   **不要**做成輸入列「附加檔」、**不要**檔案氣泡混進時間線、**不要**「對方想傳檔過來／接收／拒絕」。Phase 2b 目錄可對影音加次要「播出這份」，仍不是下載。
5. **輸入列 sticky 底**  
   主持一進來就有；不要等第一位 Guest。快捷語預設收起。
6. **請人進來 → 分享面（唯一放大 QR 的地方）**  
   - 有效：QR、口誦 `go.samkuo.me/i/…`、複製／系統分享、一句 `這張邀請約 N 分鐘內有效；過期後再發一張即可，這一間不會因此關掉。`  
   - **必備一句：** `另一台裝置請掃這張邀請進來，不要再開一間包廂。`  
   - 過期：**不要**再畫死 QR；主 CTA `再發一張邀請`。  
   - 尚未鑄：按請人進來再鑄再開分享面。
7. **確認（頁內，非原生 dialog）**  
   - 主持結束／Esc／回大廳：`關掉後在場的人會斷線，目錄會沒了，鏡頭與投放會停。已存到硬碟的檔不受影響。`  
   - Guest 離開／Esc／回大廳：`離開後你會斷線；其他人還在。你掛上的檔會從分享區拿掉。`

### 10.3 寬屏（`min-width` 遞增）

左：時間線＋（可較開的）分享區＋輸入。  
右「這一間」卡片：

- 在場名單（主持金色標記＋顯示名；Phase 2 可加鏡頭點）
- 一句：`這一間只在這個畫面開著的時候存在。`
- 門牌列：**小狀態**，不是英雄 QR  
  - 尚未請人：`還沒發邀請`＋「請人進來」  
  - 有效：`邀請有效 · 還有 4:32`＋「顯示邀請」（開同一分享面）  
  - 過期：`邀請已過期`＋「再發一張」
- Phase 2：節目預覽一塊（不要一進門就是大畫面）
- `結束這一間`

**禁止**桌面先做再 `max-width` 縮小。**禁止**把大 QR 等待面當成已登入會員的預設首屏（寬屏也不常駐 240px QR）。現場掃碼是分享面的工作。

### 10.4 未登入／結束後／Guest 進不去

未登入：說明開這一間要通行證；不擋回大廳、不擋 `/s/`。補一句：`被請進來的人不必有通行證；開這一間的人要留在這個畫面。另一台裝置請掃邀請進來。`

結束後：`這一間已結束`＋主持「再開一間」＋回大廳。**不要**在結束面留舊 QR。

Guest 主持已離開：主 CTA 回大廳；次要「請對方再發邀請」。

`/room` 不是對弈 canvas：頂列**不必** 3s 自動收起。Esc 回大廳（現況 `goEscapeHome` 含 `/chat` → 改 `/room`）。分享面開啟、確認散場期間：對齊既有 sheet 焦點與取消。

### 10.5 播出條（Phase 2；契約現在凍）

窄屏預設；對齊檔案分享區——**可收合條**，不要會議格子牆，不要把 RTP 氣泡丟進時間線。

- 沒人播出、鏡頭全關：`鏡頭與投放 · 關`
- 恰好兩人且**已收看**鏡頭：小預覽＋關鏡頭／關麥／停止收看
- **≥3 人：** 鏡頭控件停用或點了顯示 `鏡頭只在兩人時`；投放不受影響
- 有節目：`正在播出 · <片名或音樂>`＋本機可全螢幕收看／收聽
- 開鏡頭／麥＝瀏覽器權限對話；失敗頁內說明
- 預設全關
- 對讀者不說直播／推流／WebRTC；不要會議格子牆

---

## 11. 隱私與儲存

| 項 | 規格 |
| --- | --- |
| 文字／檔案／媒體 RTP | 只經 WebRTC；signaling 僅 SDP。**不錄製** |
| Host API key | 頁面記憶體；mint／作答；關頁即失 |
| 時間線 | RAM；散場丟 |
| 檔案目錄 | RAM metadata；散場丟。**內容**只在下載時寫入使用者選的檔；分頁不留副本 |
| 檔案緩衝 | **禁止** OPFS／IndexedDB／Cache／SW／整檔 Blob |
| 播出緩衝 | 僅瀏覽器播放管線；**禁止**為播出組整檔 Blob／MSE |
| 顯示名 | 可繼續 Roster `localStorage` |
| 分析 | 若打點，只計「鑄了包廂邀請／握手成功／開過鏡頭」之類；不記正文、檔名、RTP |
| 離線 | 包廂**不能**離線加入（與 `/i/` 同） |

對讀者可寫：**對話、鏡頭與投放只在在場者的瀏覽器之間；檔案點下載才存到你選的位置，不會存到遊樂場伺服器。不錄影。** 主持把這個畫面關掉，這一間就散了；目錄沒了，已存到硬碟的檔不受影響。

---

## 12. 實作切面（建議）

| 層 | 建議 |
| --- | --- |
| Invite | `wantsRosterSignal` 認 `invite.room`；**不要**對 room stamp 遊戲用 `relay: true` |
| Host | `roomRuntime`：進 `/room` 即主面；**按需** mint（勿 `openBooth` 自動鑄）；answer loop **持續作答**；門牌過期停 loop、清／作廢可分享的 shortUrl、**不**把 phase 打成 ended；**不** `open` SAM session |
| Guest | `guestRuntime`／`/i/` 依 kind **或** `intent.surface` 分流；room 不 `resolveGoSamFiles`；同意後**不** `replaceState` `/room`；離開 ≠ 主持散場 |
| 文字 | `goSessionChat` 加全頁模式，或包廂自用同一 store |
| 檔案 | 共用 `rosterSessionFile.ts`＋單測；chunk **直連優先**否則 Host 按 transfer 轉 binary（`goRoomFileStar` fallback）；禁止全員 fanout；`goRoomFileTransfer` 串流 `slice`／writable，禁止組 Blob |
| Mesh | `session_mesh` 經 Host DC 轉 O／A；邊＝**與進門相同 2+2＋DC**（檔走 DC、RTP 走 transceiver）；失敗 star；具名 peerId |
| Peer | 進門與 mesh **同一** booth 2+2 helper（勿把遊戲 DC-only／現況 1+1 默默改掉） |
| 播出 | `replaceTrack`；鏡頭僅兩人時；RTP **直連優先**否則 Host 轉 track；`session_cast` 控制面 |
| 分享 | `GoShareSheet` 邀請模式；title「邀請你進包廂」；**必備**「另一台請掃碼、不要再開一間」 |
| 路由 | `go-client/src/routes/room/`；`/chat` 導向 `/room` |
| 大廳 | hotspot `room` → `/room`；label「包廂」 |
| chrome | 「更多」連到 `/room`；Esc／bulletin 路徑表 |

TDD：進門即主面且**未鑄**門牌、kind／surface 分流、無 SAM Guest、持續作答（非 1 Guest）、SDP **兩組** A/V m-line、`share` 不上 chunk、`request` 前已有 writable、chunk RAM≤一幀、第三者收不到 transfer、無 SW／OPFS／Blob 後備、fanout 目錄、斷線 `unshare`、門牌過期包廂仍 open、過期後禁止分享舊 shortUrl、Guest 離開人數 -1。Mesh：`session_mesh` 不經 Platform；無直連則 star 仍通。純文件本刀不寫程式。

---

## 13. 階段

| Phase | 內容 | 完成定義 | 狀態 |
| --- | --- | --- | --- |
| **0. 契約** | 本文件；GLOSSARY／交叉引用 | 包廂≠overlay≠compose；進門即主面；入座不鎖 1:1；**在場視訊僅 1:1**；**檔與音視訊直連優先**（Host signaling；star 備援）；兩個時鐘；按需鑄；Guest 留 `/i/`；說／掛／播；在場＋節目；第二台掃門牌 | **本刀** |
| **1. 文字＋傳檔** | 進 `/room` 即主面；按需 mint `invite.room`、`/i/` consent、DC、`session_chat` fanout、`session_file` **分享區＋串流落盤**；answer loop 持續作答 | 會員不必先邀請就見包廂 UI（無 TTL）；同一短鏈 ≥2 Guest 與 Host 互傳文字；分享區可掛檔、點下載才寫入另存檔；無 Save picker 則頁內說明、不組 Blob；Platform 無正文／無檔 bytes；未登入不能開這一間；`/chat`→`/room`；門牌過期包廂仍在 | **按需鑄／兩個時鐘已落地；多人傳檔 e2e 手測仍待；現況 star** |
| **1b. SDP 2+2** | 進門 **與 mesh 邊** offer／answer 皆 **2 audio + 2 video**（軌空）；具名 booth helper；遊戲 SDP 不動 | 進門與 mesh SDP 含兩組 `m=audio`、兩組 `m=video`；遊戲 compose 仍無須 2+2 | **已落地**（`reserveBoothMediaTransceivers`） |
| **1c. Mesh 直連** | `session_mesh`；邊＝2+2＋DC；檔 chunk 與 RTP **直連優先**／star 備援 | 兩位 Guest 之間：下載與節目／麥不經 Host 組裝；直連成功則 Host 不吃檔 bytes／可不轉 RTP；失敗仍 star | **signaling + 檔 chunk 路徑已落地**；RTP `replaceTrack` 仍待 2a／2b UI |
| **2a. 在場（鏡頭 1:1）** | 恰好兩人時開／關麥與鏡頭（進門 PC 已直連）；第三人加入關鏡頭；≥3 人麥走 mesh 直連 | 不經 Platform 二次 O／A；預設關；≥3 人無格子牆 | **已落地**（第三人關鏡頭；麥走各 PC replaceTrack） |
| **2b. 節目投放** | 本機影片／音樂 → 在場裝置收看／收聽；一路節目；**播出者→各收方直連優先** | 片源不出雲；Safari 當**收**端 | **已落地**（`captureStream`＋`session_cast`；Host 轉 program track 備援） |
| **2c.** | 分享區「播出這份」；僅語音；螢幕分享 | 不阻塞 2a／2b 開工 | 預留 |
| **3. 重用 peer 開局** | 包廂已連 → SAM session | 不必再掃一次（可選） | 預留 |

建議實作順序 **0 → 1 → 1b**；**1c（mesh）不阻塞 Phase 1 star**，但 Guest↔Guest 的檔／節目／麥要直連就靠它。其後 **2a 與 2b 擇一即可開做**（Host↔Guest 媒體走進門 PC，不必等 1c）。若只做一刀媒體：自己兩台「筆電片 → 手機看」補 iOS 不能下載的洞，**2b 可先於 2a**。

---

## 14. 已凍結決策

| # | 題 | 定案 |
| --- | --- | --- |
| 1 | 名稱／URL | 讀者「包廂」；canonical **`/room`**；舊 `/chat` 導轉 |
| 2 | 產品本質 | **一般用途隔間**；Phase 1＝文字＋傳檔，**不是**功能上限 |
| 3 | Invite | **`invite.room`**；門牌仍 `/i/`；無 SAM |
| 4 | 文字 | 重用 `session_chat` |
| 5 | 傳檔 | `session_file` **分享區目錄**；點下載才串流到 `showSaveFilePicker`；**禁止** SW、OPFS、整檔 RAM／Blob |
| 6 | SDP | 進門與 **mesh 邊**皆 **2 audio + 2 video**＋DC（在場＋節目；軌空；順序凍）；**禁止** Platform renegotiation；遊戲 compose 維持 DC-only |
| 7 | ICE | 包廂 **≠** 遊戲 relay-only stamp；高碼率以同一網路為快樂路徑 |
| 8 | 登入 | 開這一間要；被請進來不要（自己的第二台當 Guest 也不要） |
| 9 | 雲 | 無；散場丟；**不錄製** |
| 10 | 進門 | **已登入開 `/room`＝包廂主面**；邀請是面內動作 |
| 11 | 人數 | **入座不鎖 1:1**；同一張**有效** Invite 多 join；文字／檔案**目錄** fanout；內容按 transfer 路由。**在場視訊僅 1:1** |
| 12 | 兩個時鐘 | 包廂壽命＝主持 `/room` 文件；門牌 TTL 只管請新人；過期 ≠ 散場 |
| 13 | 按需鑄 | **沒按「請人進來」就不 mint**；同一時間最多一張有效門牌；過期後禁止分享舊 QR |
| 14 | Guest URL | 同意後**留在** `/i/<short>`；**禁止** `replaceState` `/room` |
| 15 | 角色 CTA | 主持「結束這一間」；Guest「離開這一間」；主面不把 TTL 當包廂狀態 |
| 16 | 第二台 | **掃門牌**進來；再開 `/room`＝另一間空包廂；不另做裝置配對 |
| 17 | 三個動詞 | **說**／**掛／存**／**播出**分開；同一影音可兼掛兼播 |
| 18 | 媒體層 | **在場**＋**節目**；整間同時一路節目；**鏡頭僅恰好兩人**；預設關 |
| 19 | 播出 vs 下載 | 播出走 RTP；下載走 `session_file`；禁止為播出組整檔 Blob／MSE |
| 20 | 拓樸 | 進門＝Guest↔Host（Platform 一次）。**檔與音視訊皆直連優先**（Host DC 當 signaling；mesh 邊＝2+2＋DC；star 備援：檔轉幀、RTP 轉 track）。Host↔X 用進門 PC，不必另建。否決 Platform 第二輪與雲端 SFU |
| 21 | 節目源 | 快樂路徑＝Chromium 桌機 `captureStream` 播出、含 Safari 的裝置收；Safari 當播出端失敗不當 bug |
| 22 | 用語 | 鏡頭、麥克風、投放／播出、收看、收聽；不用直播、會議 SaaS、P2P、串流伺服器 |
| 23 | 在場視訊 | **僅 1:1**；第三人加入關鏡頭。不做格子牆、不把鏡頭轉給第三人 |

---

## 15. 與既有通路（勿混）

| 流 | 是 | 不是 |
| --- | --- | --- |
| **包廂 `/room`** | 臨時隔間；進門即主面；Invite 請人**或自己的另一台**（入座可多人）；**活著＝主持畫面開著**；說／掛／播；鏡頭僅兩人；**檔與音視訊直連優先** | 大廳公開桌、局內 overlay、型錄 SAM、必須先邀請才看得到 UI、入座只能兩人、5 分鐘租期的雲端房間、視訊會議格子牆、再開 `/room` 當連線 |
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
- [x] **不鎖 1:1 入座：** 同一短鏈多人可進；時間線 fanout；檔案目錄同步（內容不全員推送）
- [x] **兩個時鐘：** 包廂＝Host document；門牌 TTL 分開；按需鑄；Guest 留 `/i/`
- [x] **說／掛／播；在場＋節目 2+2；第二台掃門牌；在場視訊僅 1:1；檔與音視訊直連優先**（§5.3／§5.4／§7.1／§7.4／§9）

**Phase 1（實作後）**

- [x] 已登入可鑄 `invite.room`；`short_url`＝`go…/i/…`；分享面 QR／複製
- [x] 進 `/room` 不按請人：主面在、**沒有** TTL、**沒有**可分享短鏈
- [x] 未登入不能開這一間；導向登入；不擋 `/s/`
- [x] Guest 無帳號、不下載 SAM，同意後進入包廂 UI（網址仍 `/i/`）
- [ ] 同一短鏈 ≥2 Guest 與 Host 互傳≥1 則文字；分享區掛檔後第二人 Save picker 下載成功（≤上限）；無 picker 則說明且零 binary；超限／可執行檔拒
- [x] 訊息不經 Platform；檔 bytes 不經 Platform；散場丟目錄（已存檔不刪）
- [x] 包廂 offer SDP 含 `m=audio`、`m=video`（現況 **1+1**）
- [x] **1b：** 包廂 offer SDP 含**兩組** `m=audio`、**兩組** `m=video`；遊戲 compose 不變
- [x] `/chat` 進 `/room`；大廳／更多文案為「包廂」
- [x] 無 `alert`／`confirm`／`prompt`；窄屏可請人進來、可傳、可結束（結束有頁內確認）
- [x] 門牌過期：未入座進不去；已連線續用；主狀態仍是人數；舊 QR 不可再分享；「再發一張」鑄新撤舊
- [x] Guest「離開」：主持人數 -1、包廂仍 open；確認文案不是散場
- [x] 主持重整：Guest 斷線；主持看到空的新一間
- [x] 分享面有「另一台請掃碼、不要再開一間」（文案；可隨 1b 或獨立小刀）

---

## 修訂紀錄

| 日期 | 變更 |
| --- | --- |
| 2026-08-18 | 初版 Draft：`/room` 包廂；Phase 1＝文字＋傳檔；契約預留音視訊／投放／開局；`invite.room`；SDP 預留 m-line；ICE 與遊戲邀請切開；資料不落雲端 |
| 2026-08-18 | **進門即主面：** 已登入開 `/room`＝包廂 UI，邀請為面內動作。**不鎖 1:1：** 對齊遊戲 session（多 join、fanout）；撤 P0「1 Guest」與 Phase 4 多人預留 |
| 2026-08-18 | **傳檔改分享區＋串流落盤：** 掛檔只授權、點下載才向分享者拉流；寫入 `showSaveFilePicker`；禁止 SW、OPFS、整檔 Blob／`<a download>`；Host 只按 transfer 轉幀 |
| 2026-08-18 | **兩個時鐘＋UX：** 包廂＝主持 `/room` 畫面，過期的是門牌；按需鑄（撤進門自動鑄）；Guest 禁止 `replaceState` `/room`；主面＝在場、分享面＝邀請；主持結束／Guest 離開分開；§10 窄屏收合分享區、寬屏不常駐大 QR |
| 2026-08-18 | **Phase 1 實作跟上：** 進門不鑄；門牌過期停作答、撤碼、主狀態仍是人數；Guest `leaveRoom`；主面頂列請人／結束，QR 只在分享面 |
| 2026-08-18 | **說／掛／播：** 自己的另一台＝掃門牌（再開 `/room`＝另一間）；媒體凍成在場＋節目、SDP **2+2**（否決投放與鏡頭互斥 1 軌）；播出走 RTP、下載走分享區；Host 樞紐；≥3 人在場視不做格子牆；不錄製；2a／2b 不互為阻塞但皆阻塞於 1b |
| 2026-08-18 | **在場視訊僅 1:1**（第三人加入關鏡頭）。**不否決 mesh：** 傳檔後續 O／A 走 Host DC（`session_mesh`）；chunk mesh 優先／star 備援；否決的是 Platform 第二輪與雲端 SFU／swarm 種子 |
| 2026-08-18 | **檔與音視訊同一條：直連優先。** Mesh 邊改為與進門相同 2+2＋DC（不再 DC-only）；RTP 失敗則 Host 轉 track。Host↔X 走進門 PC，不必另建 |
| 2026-08-18 | **1b／1c 實作：** `reserveBoothMediaTransceivers`（2+2）；`session_mesh` Host 轉 O／A；Guest↔Guest 檔 chunk 直連優先／star 備援；分享面第二台掃碼文案 |
| 2026-08-18 | **2a／2b：** 鏡頭僅兩人、`session_cast`、本機 `captureStream` 播出；Host 轉 program track；播出條可收合 |
| 2026-08-18 | **鏡頭＝掛／拉：** 開鏡頭不自動廣播 RTP；對方按收看才 `session_camera.request` |
