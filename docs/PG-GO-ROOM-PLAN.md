# Playgrounds 純玩版：包廂（go `/room`）

> **狀態：** Draft（2026-08-19）— 主面＝**包廂電視**（節目 RTP；主持指定來源）；文字＝開口備援（非主欄）；兩層螢幕（電視 ≠ 我這台）；目錄檔私下播／下載走 DC；靜態內景延續大廳畫風（**不走動**）；其餘：進門即主面、不鎖 1:1、兩個時鐘、Hub 星狀、SDP **2+2**
> **權威決策：** 從屬 [DECISIONS.md](./DECISIONS.md) **DEC-050**（純玩版）、**DEC-045**（Roster／薄 signaling；**非** Avatars 產品面）、**DEC-047**（Platform Invite）；**不另開 DEC**  
> **相關：** [PG-GO-CLIENT-PLAN.md](./PG-GO-CLIENT-PLAN.md)、[PG-GO-AUTH-PLAN.md](./PG-GO-AUTH-PLAN.md)（登入＋記憶體 field API key）、[PG-GO-HOST-INVITE-PLAN.md](./PG-GO-HOST-INVITE-PLAN.md)（GO-INVITE＝遊戲 compose；**勿混**）、[PG-GO-SESSION-CHAT-PLAN.md](./PG-GO-SESSION-CHAT-PLAN.md)（局內 overlay 對話——**勿混**）、[PG-GO-SHOP-LOBBY-PLAN.md](./PG-GO-SHOP-LOBBY-PLAN.md)（大廳熱點入口）、[PG-PLATFORM-API-PLAN.md](./PG-PLATFORM-API-PLAN.md)、[PG-PLATFORM-CREDITS-PLAN.md](./PG-PLATFORM-CREDITS-PLAN.md)（官方 TURN；包廂 ICE **與**遊戲邀請分開）、`.cursor/rules/no-native-dialogs.mdc`、`.cursor/rules/mobile-first-ux.mdc`、[GLOSSARY.md](./GLOSSARY.md)

一句話：已登入會員進 **`/room` 就是這一間包廂**（主面立刻出現；**不必先請人**）。**包廂活著＝主持這個畫面還開著；過期的是邀請碼，不是這一間。** 快樂路徑＝**請人進來一起看 MTV／片子**（或主持把某人的 live 切上電視）。**主面是這一臺包廂電視**，不是時間線——資訊架構對齊視訊會議（舞台＝畫面，文字＝抽屜），產品不是會議格子牆。每人自帶手機／筆電可掛檔、下載、**私下播放**，**不跟電視互斥**。電視畫面由**主持指定來源**，一律 **WebRTC 節目 RTP**（電影＝來源端本機播檔再 `captureStream`；會議＝指定誰的 live）；目錄檔的私下播／下載仍走 DataChannel。開口用麥；文字是不方便開口時的輔助。同一張有效門牌可請人進來，也可給自己的另一台掃。人數不鎖 1:1。資料只走 WebRTC（**不**經 Platform 中繼、**不**雲存、**不錄製**）。**現況 Hub 星狀**（mesh 延後）。UI＝大廳同族的**靜態內景**（不走動）。

---

## 1. 動機

- 大廳已有「椅子／桌」熱點與 `/chat` 占位，但公開大廳聊天不像現實用法。網咖／室內遊樂場更常見的是：**租一間包廂**，關門一起看 MTV／片子、邊看邊講話、把檔丟到架子上；每人還可以滑自己的手機。
- **主面是屋子裡那一臺電視**，不是聊天室。視訊會議也是畫面當舞台、文字當輔助——包廂同一層資訊架構，但舞台是**共用電視**（主持導播），不是每人一格臉。
- **兩層螢幕：** 包廂電視＝全場同一路；口袋裡／膝上那台＝自己的（掛、下載、私下播另一部）。兩件事並行，不互斥。
- **預設分享故事仍含自己的裝置之間。** 例如筆電當屋子（電視來源）、手機掃門牌進來收看；舊手機掛鏡頭當遠端監控。請別人進來走同一條門牌、同一套目錄，不是第二套產品。
- 同一條門牌要同時服務兩種現場：**請別人進來一起看**，以及**自己的另一台裝置**。後者不是附加功能，只是同一間的第二個座位。
- Invite／WebRTC 目前幾乎只服務 **開 SAM 入座**（`invite.compose`）。要測「能不能連上」或做遊戲以外的用途，只能先開一局五子棋——過重，也把連線綁死在某一顆小品。
- 局內 [`session_chat`](./PG-GO-SESSION-CHAT-PLAN.md) 是對弈 overlay（預設收合、遊戲優先），**不是**一般用途隔間；該計劃把語音／傳檔列為 overlay **非目標**，那些能力應落在包廂。包廂裡文字同樣是 overlay，不是主欄。
- 分享區「下載到硬碟」在 iOS Safari 常沒有 Save picker（Phase 1 已否決 Blob 後備）。**私下播目錄檔**（DC＋本機播放器）與**電視收看**（節目 RTP）是兩條路；不要把「存檔」當成唯一把檔從 A 台送到 B 台的辦法，也不要把私下播當成電視。
- DEC-045 已撤銷「線上」tab。包廂是 **Invite 拉人進臨時隔間**，不是常駐誰在線、不是好友名單。

---

## 2. 目標

- **包廂＝一般用途 peer 隔間（硬）：** 產品面是「這一間」；裡面做什麼由階段遞增。**禁止**把契約寫死成「只能聊天」。**禁止**做成視訊會議 SaaS（格子牆、錄製、等候室、舉手、雲端 SFU）。可以用來一起看片，也可以由主持把某人 live 切上電視——那是導播，不是開會產品。
- **進門即主面（硬）：** 已登入會員開 `/room`＝已經在包廂裡。**主面是包廂電視**（關機也佔主高度）。邀請是**面內動作**（請人進來），**不是**進門條件。一個人在也是這一間。**禁止**用全頁時間線當進門第一眼。
- **兩個時鐘（硬）：** 包廂壽命＝主持 `/room` 這份文件還在；門牌壽命＝該張 `invite.room` 的 TTL（預設 5m）。門牌過期只擋**新人**；主面與已入座連線不受影響。**按「請人進來」才鑄門牌**（同一時間最多一張有效）。見 §6.4。
- **人數對齊遊戲 session（硬）：** 包廂**不鎖 1:1 入座**。同一張**有效** Invite 短鏈可多人 join；**文字**對已連線 peer **fanout**；**分享目錄** fanout、**內容只在有人 `request` 時 Owner→Requester**。API／UI 勿把包廂寫成雙人專用隔間。鏡頭**不**因第三人加入而關。見 §5.5。
- **預設分享模型（硬）：** 分享目錄＝這一間願意分享的**檔**（授權，**不**把內容推給任何人）。**不掛資料夾。** 其他人依檔選擇下載、檢視、或**播放**（影音）。**Live stream 不是目錄項**——開鏡頭／畫面出現在**在場名單**。見 §5.5。
- **兩種在場同一條門牌（硬）：** 「請人進來」與「自己的另一台掃碼」契約相同。**第二台請掃門牌**；已登入再開 `/room`＝**另一間空包廂**，不是連上既有這一間。見 §5.4。
- **三個動詞（硬）：** **說**、**掛**、**要**分開。**說**＝開口為主（麥），文字＝不方便開口時的輔助面。掛＝把**檔**寫進分享目錄。要＝下載／檢視／**私下播放**檔（DC）；電視收看＝節目 RTP（不是「要」目錄檔）。見 §5.3、§5.6。
- **兩層螢幕（硬）：** **包廂電視**與**我這台裝置**分開。電視＝主持指定的一路 RTP。我這台可同時掛／下載／私下播，**不跟電視互斥**。見 §5.6。
- **電視＝主持導播（硬）：** 這一間同時只有一個電視來源（關機／檔／某 peer 的 live）。來源由主持指定——看電影＝主持決定廣播哪一步（來源端播放器是時鐘）；會議式切台＝主持決定現在電視上是誰。被指定的人不是新主持。見 §5.7。
- **媒體槽（硬）：** SDP **在場**（我的鏡頭／麥）＋**節目**（**房級電視**）。第一次 SDP 就留 2+2（§7.1）；`replaceTrack`，**禁止**經 Platform 二次 O／A。節目槽**不是**空置裝飾，也**不是**會議格子。
- **一條出站在場 live（硬）：** 同一參與者同時最多發布**一條**在場 live（可含影像與聲音）。來源是 `getUserMedia` **或** `getDisplayMedia`，**不能並行**。這是「我能貢獻給電視／開口」的訊號，**不**禁止同機私下播檔。
- **電視走 RTP（硬）：** 主持廣播電影／MTV **與其他 live 一樣走 WebRTC 節目槽**，**不**經 DataChannel 把片子送到每人解碼。來源端本機播檔 → `captureStream`（或等價）→ program `replaceTrack`。DC 只服務目錄的私下播與下載。
- **Hub 轉送（現況硬；mesh 延後）：** 進門仍是 Guest↔Host 一條 PC。**檔 bytes 與 RTP 一律經主持轉。** Guest↔Guest mesh **延後**。見 §7.4。
- **收看綁定（硬）：** 進門 PC 一建立，就把遠端 **節目** receiver 綁上電視用 `<video>`（即使還沒畫面；**不要** `display:none`）。**房級：在場自動收電視**（關機＝空軌／關機畫面）。在場鏡頭仍須明示才拉影像。見 §9。
- **第一階段可交付：** 會員進 `/room` 即包廂 UI（可先不請人）；可請人進來；Guest 開 `/i/<short>` 同意進同一間 → DC 文字＋傳檔。電視／開口／內景見後續階段；SDP **現在**留 2+2。
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
- 把包廂做成視訊會議 SaaS（格子牆、錄製、等候室、舉手、雲端 SFU）。在場可多人各開一條在場 live；**不做**會議格子牆。房級電視與在場聲見 §9.8（自動收節目 ≠ 自動開相機）。
- 複製大廳可行走地圖當 `/room`；把包廂做成可通關 JRPG 或點歌／歌詞／評分 KTV 機台。
- 經 **Platform** 第二輪 O／A／renegotiation；Platform 或第三方 **SFU 中繼 RTP**。
- 完整 BitTorrent swarm（下載者當種子、infohash 產品面）；為 mesh 邊預留無上限 video m-line。
- 雲端片庫、VOD、把收看「存成影片」；AirDrop／Nearby／系統隔空投送當產品路徑。
- 以再開一個 `/room` 當「連上既有這一間」（`/room` 不是房號）。
- 同時收兩路**在場**視訊拼成格子牆（節目＋在場是兩層槽，不是兩張臉）。同一人同時開鏡頭又開畫面分享；4K／跨網電影院承諾。
- 用 DataChannel／每人本機 seek **當作包廂電視**的傳輸；用節目 RTP／`captureStream` **代替**個人下載或私下播檔。
- **Live 收看不得**為通過而組整檔 `Blob`／MSE（live 走 RTP）。**檔案播放**走滑動緩衝／MSE，或（遠端檔）用 **Service Worker** 把 DC bytes 編成給 `<video>`／`<audio>` 的 `Response`（可 Range）；RAM 有頂、**不以整檔大小拒絕**。本機掛的 `File` 可用 object URL（OS 檔，不進 JS heap）。關播放器即 `revoke`／拆 MSE／停 SW 攔截。**下載落盤**仍禁止整檔 Blob 後備（§8.2）。
- **包廂下載不得**用 Service Worker 攔截另存、把 ReadableStream 當下載 `Response` 餵系統下載管理員。**播放**允許 SW（§9.3）。
- **包廂傳檔不得**用 OPFS、IndexedDB、Cache Storage 當檔案緩衝或落盤。
- **包廂傳檔不得**掛資料夾／子目錄（沒有 dir 列、沒有「選資料夾」）。一次可多選檔。
- **包廂傳檔不得**把整份檔讀進 RAM（分享者 `arrayBuffer()` 整檔、收方組 `Blob`／`blob:` URL 再 `<a download>`）。

---

## 4. 原則（硬）

1. **能力開放** — 包廂是連線容器，不是單一 app。階段只約束**何時交貨**，不約束**永遠不能做什麼**（除非 §3）。
2. **殼擁有 UI** — 不是一顆 `kind: tool` SAM；進包廂不 materialize FileMap／畫布 iframe。
3. **薄 signaling** — Platform 只做 Invite／join／**進門一次** O／A（DEC-045）。Guest↔Host 那條已連則重用（鏡頭／節目 `replaceTrack`）。**禁止**經 Platform renegotiation。Mesh 邊的後續 O／A 走主持 DataChannel（§7.4），不是 Platform。
4. **第一次 SDP 就為兩層媒體留門** — 包廂 peer 在 `createOffer` 前加上 **2 audio + 2 video** transceiver（在場＋節目；軌可空；順序見 §7.1）。Phase 1 **不**開相機、**不**送 RTP；後期 `replaceTrack` 不必第二輪 Platform O／A。**禁止**之後用 1+1 再經 Platform 補 m-line。Signal 交換用 **`av1`（原始 SDP）**，不可壓成遊戲用的 `dc1`（只重建 DataChannel）——否則對端 `setRemoteDescription` 的 m-line 對不上，Guest 會看到「連線失敗」。
5. **遊戲邀請與包廂邀請分開** — 遊戲繼續 `invite.compose`＋（可選）relay-only。包廂 `invite.room` **不**因 Host `turn_prefer` 自動改成 relay-only（見 §7.3）。**不要**把遊戲 DC-only SDP 改成包廂 2+2。
6. **兩個時鐘** — 短鏈 TTL（預設 5m）＝**這一張門牌**還能不能請新人，**不是**包廂租期。已入座且**不斷線**不受門牌過期影響。包廂散場＝主持離開 `/room`（結束／回大廳／關分頁／重整）→ 關 PC、丟時間線與目錄、停進行中的拉流。Guest「離開」只斷自己。
7. **go ⊂ play（wire）** — 文字重用 `session_chat`；檔案新獨立 `type` 放共用 roster 模組。Play 可晚掛 UI。
8. **同時一 SAM 仍成立** — 包廂不是 SAM；進 `/s/`／遊戲 `/i/` 則離開包廂（破壞性，頁內確認）。
9. **進門即這一間** — 已登入開 `/room` 就是包廂主面。**沒按「請人進來」就不鑄 Invite、不倒數。** **禁止**用「尚未邀請」另做一套非包廂畫面當主流程；也禁止進門自動鑄門牌，讓 TTL 變成「房間快到期」的氛圍。
10. **不鎖雙人入座** — Host answer loop **持續作答**（對齊遊戲 compose 多 join；勿 `maxAnswers: 1`）。文字／**分享目錄** fanout；內容按 `request` 路由。函式名勿叫 `sendToOpponent`。**鏡頭不因人數開關。**
11. **主面＝電視；分享面＝邀請** — 主面回答「這一臺電視在播什麼／誰在這一間」。QR／TTL／再發一張只出現在「請人進來」分享面（寬屏側欄最多門牌**小狀態**，不常駐大 QR）。**禁止**把時間線當主欄。
12. **第二台掃門牌** — 連上既有這一間的唯一辦法是掃（或開）**這一張** `/i/<short>`。已登入會員在另一台開 `/room`＝新的空一間。分享面必須寫這句，避免自己連自己連不上。
13. **說／掛／要分開** — **說**＝開口為主、文字為輔（文字不承載檔 bytes）。分享目錄不是電視本體。電視 RTP **不**做成時間線氣泡。私下播檔不佔節目槽。
14. **主持＝進門與轉送樞紐（Hub）** — Platform 只握手 Guest↔Host。文字、目錄由主持轉送。**現況檔 bytes 與音視訊 RTP 一律經主持轉給請求者**（Guest 只保有進門那一條 PC）。Guest↔Guest mesh（`session_mesh`）**延後**。**不**規定媒體必須經主持轉碼（轉的是 track／幀，不是重編碼）。
15. **鏡頭預設關、不錄製** — 進包廂不開相機／麥。掛上的媒體與檔只在這一間還開著時存在於在場裝置之間。
16. **內容按需拉；房級電視例外（硬）** — 目錄檔 bytes、在場**影像**：**禁止**在沒有該 peer 的 `request` 時送。Host 只轉給請求者。不做格子牆。每人最多一條出站在場 live。私下播檔走 DC，不佔節目槽。**房級：** 在場自動收**節目**（電視）與（開麥者的）**在場聲**——進門即對節目／在場音 `request`；**不**自動 `request` 在場視訊、**不**自動開相機。收看端 **PC 一建立就綁節目 `<video>`**（電視洞）；關機時可藏視覺、**不要** `display:none` 以免解碼停。人數不是鏡頭開關。

---

## 5. 產品形狀與用語

### 5.1 空間

```text
大廳 `/`  ──熱點「包廂」──►  `/room`（已登入＝這一間主面；可請人進來）
Guest 掃碼 `/i/<short>`  ──kind=invite.room──►  同意 → 同一包廂主面（**網址仍 /i/**）
深鏈 `/s/`／遊戲 `/i/`  ──bypass──►  不經包廂
```

進 `/room` 後大廳 canvas **卸載**（對齊 `/s/`、`/i/`：殼是大廳）。包廂是**另一張靜態內景**（不走動、不重用大廳地圖），不是第二個大廳、也不是功能表單殼硬套 pixel 框就算完。見 §5.8。

大廳熱點：讀者面 **包廂**（門／隔間入口，不是大廳正中「公開聊天區」）。契約 `hotspotId`＝`room`；大廳畫成南向包廂門。見 [PG-GO-SHOP-LOBBY-PLAN.md](./PG-GO-SHOP-LOBBY-PLAN.md)。

### 5.2 用語（硬）

| 用 | 不用 |
| --- | --- |
| 包廂、進包廂、請人進來、**結束這一間**（主持）、**離開這一間**（Guest）、再發一張邀請、分享區、分享目錄、掛上、下載、檢視、收看、收聽、撤回、**包廂電視**、**放到電視上**、**私下播放** | 聊天區、聊天室、房間、Room、Lounge、Lobby（對讀者）；「先邀請才能進包廂」；附加檔、傳給對方、接收附件；Guest 說「結束這一間」；把時間線叫主畫面 |
| 鏡頭、麥克風、開口、收看、收聽、在場、分享目錄、播放、導播／指定來源（對內） | 直播、推流、串流伺服器、視訊會議、開會（對讀者產品名）；把 RTP 叫成「傳檔」；把掛上說成已經送到對方；把鏡頭當成目錄裡的虛擬檔；把私下播叫成上電視 |
| 已連線、N 人在、就你、這一間還在、把這頁開著 | 直連、P2P、DataChannel、TURN、視訊會議 SaaS 腔；把**入座**說成只能兩人；**包廂倒數／房間即將過期／租期** |
| URL `/room`（與 `/help`／`/apps` 同：路徑英文、chrome 中文）；門牌／邀請（主持 UI 可說「門牌」） | 把 `/chat` 當產品 canonical；對 Guest／分享 title 說「門牌」當產品名 |

局內 overlay 仍叫 **對話**（[PG-GO-SESSION-CHAT-PLAN.md](./PG-GO-SESSION-CHAT-PLAN.md)），不要改名包廂。

### 5.3 三個動詞（硬）

| 動詞 | 讀者面 | 傳輸 | 階段 |
| --- | --- | --- | --- |
| **說** | **開口**（麥）為主；**文字**＝抽屜／把手（不方便開口時） | 在場音 RTP（房級自動收）；文字 `session_chat` fanout | 文字＝Phase 1 wire；開口／房級聲＝媒體階段 |
| **掛** | 把**檔**寫進**分享目錄**（授權；不傳內容；**不掛資料夾**） | 目錄 metadata fanout | 檔＝Phase 1；SDP 現在就要 |
| **要** | 依型別：**下載**、**檢視**、**私下播放**（影音檔，我這台） | 檔 bytes 走 DC（**現況經 Host Hub**；mesh 延後） | 下載＝Phase 1；檢視／私下播＝Phase 2 |

**放到電視上**不是「要」目錄檔：那是主持指定電視來源，走**節目 RTP**（§5.7）。讀者面不要出現「要」這個字當按鈕——列上寫下載／檢視／播放；電視相關寫放到電視上／電視上是…。

**私下播放**＝向 owner 拉 bytes，本機播放器邊收邊播（可 seek），**不是** WebRTC、**不是**包廂電視、也**不是**先把整檔緩進分頁。遠端檔可用 Service Worker 當片源（§9.3）。**不要**把鏡頭掛進目錄。

### 5.4 兩種在場（硬）

| 故事 | 主持 | Guest | 快樂路徑 |
| --- | --- | --- | --- |
| **請人進來** | 筆電（或一直開著的那台）`/room` | 別人掃 QR | 一起看電視、開口、傳檔、私下播 |
| **自己的另一台** | 通常是插電、畫面不關的那台（常當電視來源） | **同一人**掃**這一張**門牌（不必登入） | 手機當座位收電視、丟相片、私下播／下載；舊手機掛鏡頭給主持切上電視 |

兩者走同一條 `invite.room`，**不做**「我的裝置」帳號綁定或第二套邀請。第三人（再掃一台傳檔、再掛一路鏡頭）**不**關掉已掛的鏡頭。

**硬：** 第二台裝置**掃門牌**進來。已登入會員在手機再開 `/room`＝另一間空包廂，連不上筆電那一間。主持永遠是「把 `/room` 這頁開著的那一台」。想用手機當屋子、筆電當客人：在手機登入開 `/room`，筆電掃碼。

### 5.5 預設分享模型（硬）

分享＝授權，不是推送。分享目錄是這一間願意分享的**檔**的清單：掛上去的只有本機**檔**。**不掛資料夾。裝置不是目錄項。** Live（鏡頭／畫面／可含聲音）標在在場名單上。實作上**內容永遠按需拉**。

```text
參與者掛上檔
        ↓
分享目錄 fanout 到在場所有人（僅 metadata；平面檔列表）
        ↓
某人對某一檔選擇下載／檢視／私下播放；主持可把某檔或某 live **放到電視上**
        ↓
向該項 owner request → 只對這條連線送 bytes 或 RTP
```

| 項 | 規格 |
| --- | --- |
| **目錄** | 所有人掛上的**檔**合成一份清單。晚進門拿快照。**不含**鏡頭、**不含**資料夾 |
| **掛** | Owner 取得本機讀取授權（`File` handle）。**不**讀檔內容。**沒有**目錄 handle |
| **Live（在場）** | 開鏡頭或畫面＝在場名單標示。`getUserMedia` 與 `getDisplayMedia` 互斥，合成**一條**在場 live（可含聲音）。**影像**未 `request` 不送 RTP。**在場聲**見房級規則 |
| **消費依型別** | 一般檔→下載；圖片→檢視、下載；**影音檔→私下播放與下載**（bytes；本機播放器）。**上電視**＝主持指定來源（RTP），不是目錄上的「播放」 |
| **傳輸槽** | SDP **在場**＝開口／可被指定上電視的 live；**節目**＝**房級電視** |
| **預設故事** | 請人進來一起看 MTV；或同一人的不同裝置（筆電當電視來源、手機當座位） |
| **要** | 目錄內容：請求者主動 `request`。沒 request 的人零**檔 bytes** |
| **房級規則** | **在場自動收節目（電視）與開麥者的在場聲。不自動收在場影像、不自動開相機。** 見 §9.8 |

**不做格子牆。** 電視同時一路。在場影像要換上電視＝主持切來源，不是每人點收看拼牆。節目 `<video>` 在進門 PC 建立後就綁上遠端節目軌。**私下播放不影響電視、不佔節目槽。**

Wire：目錄 metadata 走 `session_file`（**只掛檔**）。在場 live 控制走 `session_camera`／`session_mic`。電視控制走 `session_cast`（指定來源；**不**載影音 bytes）。影音檔**私下播放**重用 `session_file` chunk（不是節目 RTP）。遠端若送來 `kind:dir`（舊客戶端），本機**不列、不 request**。

### 5.6 兩層螢幕（硬）

| | **包廂電視** | **我這台裝置** |
| --- | --- | --- |
| 誰在看 | 在場都對準同一塊（進門即收節目） | 只有我 |
| 誰決定 | 主持指定來源（§5.7） | 我自己 |
| 傳輸 | **節目槽 RTP** | 掛／下載／私下播＝`session_file` DC；我的鏡頭／麥＝在場槽 |
| 時鐘 | 來源端播放器或 live；收看端跟著 RTP 走（**不能**對電視獨立 seek） | 本機播放器自己 seek |
| 互斥 | 同時一個來源 | **不跟電視互斥** |

場景裡的電視洞**只綁節目**。私下播放器、分享區、下載是這台裝置的 DOM chrome（抽屜／次要面），**不要**再塞進電視洞。

電視上在放電影時，我可以在手機另播一部、預覽下一部、或把檔掛上架子——只有我聽到／看到私下那路，不會變成全場電視。

### 5.7 包廂電視＝主持導播（硬）

這一間電視狀態只有一份，例如：

```text
off                         // 關機（進門仍綁節目 video；畫面關機／雪花）
file { owner, id }          // 來源端本機播該檔 → captureStream → 節目 RTP
peer { peerId }             // 該人當下的在場 live（鏡頭或畫面）→ Hub 送到每人節目槽
```

- **只有主持能指定／切換來源。** 可指定自己或某位 Guest。被指定者不是新主持。
- **看電影／MTV：** 來源端（通常是主持、且持有 `File`）本機 `<video>`／`<audio>` 播放，`HTMLMediaElement.captureStream()`（或等價）進 **program** `replaceTrack`。Seek／暫停＝動來源端播放器，收看端看到的就是那步。**禁止**用 DC＋每人獨立播放器冒充電視。
- **會議式切台：** 主持把來源設成某 peer 的在場 live。電視上是「現在這路」，不是格子牆、不是 speaker view 牆。
- 晚進門對準當下電視，不必再點「收看」。
- `session_cast` 可帶 `name`／`paused`／`t` 當**標籤**（電視上寫片名）；**不是**同步時鐘。時鐘就是 RTP。
- 星狀下主持對每位 Guest 各送 program RTP（瀏覽器常每條 PC 各編一次）。人數軟頂 ≤6。**不是**雲端轉碼／片庫。

來源端 `captureStream` 快樂路徑＝桌機 Chromium。iOS Safari 當**收看端**收 RTP。若要以 iOS 當電影來源而 `captureStream` 失敗：頁內說明改由桌機當電視來源——**不要**為通過而把電視改回 DC 播檔。

### 5.8 內景場景（硬）

- **靜態遊戲內場景**當殼，延續大廳 canvas 色盤／`px()`／暖燈／人物繪法。**禁止**行走、碰撞、點地移動、重用 `GoShopLobby` 地圖。
- 電視洞：canvas 畫機殼；真正的 `<video>` 用 `worldToScreen` **疊在螢幕矩形上**（WebRTC `srcObject` 不能當主路徑畫進 canvas）。
- 可點家具（熱點 ≥44×44 邏輯 px）：電視（展開完整播放控制／全螢幕）、門（主持請人進來，**不要**大 QR 畫在門上）、架子（展開分享區）、座位上的人（在場；點人不自動上電視）。
- 時間線**不**畫進 canvas。文字／分享／登入／座位＝疊在舞台上的 overlay（對齊大廳老闆／機台面）。
- 清單永遠可及：canvas 失敗、`prefers-reduced-motion`、讀屏 → 電視仍是 DOM `<video>`，分享／開口／文字仍可用（大廳雙模式的包廂版，但**沒有**走路開關）。
- 舞台＝頁面主內容（大廳同級 canvas 尺寸 320×200）；**不要**旁邊再加時間線。熱點按鈕在舞台下。寬屏遞增，禁止桌面先做再 `max-width` 縮小。
- Guest `/i/` 不經大廳；內景本身須讀成「你在一間包廂」。可選極短 pixel wipe（不擋進門）。

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
未登入 `/room` → 仍是包廂殼（電視關機＋主 CTA「登入後開包廂」）（goAuth.login；不擋回大廳、不擋 `/s/`）
已登入 → **直接包廂主面**（電視舞台／這一間；門牌＝尚未發出，不倒數；文字抽屜預設收）
  →「請人進來」且尚無有效門牌：
       mintPlatformInvite({ kind: "invite.room", intent, targetField: goOrigin() })
       → 開 GoShareSheet（QR／複製／系統分享；url＝/i/<short>）
       → 分享面加一句：`另一台裝置請掃這張邀請進來，不要再開一間包廂。`
       → Host answer loop **持續作答**（連線 only；不開 SAM session；不因第一位 Guest 停）
  →「請人進來」且門牌仍有效：只開同一分享面（同一張 QR）
  →「請人進來」且門牌已過期：鑄新的、撤舊的、開分享面（禁止再分享過期 QR）
  → 有人 DataChannel open → 時間線文字 fanout；分享目錄同步
  →「結束這一間」／回大廳／Esc → 頁內確認 → 關所有 PC、撤 Invite
```

**Guest**

```text
開 /i/<short> → preview
  → 過期／撤銷／主持不在 → 進不去（頁內錯誤；請對方再發一張）
  → kind=invite.room（或 intent.surface=room）→ consent「進這間包廂」（可改臨時顯示名；無棋規／SAM 摘要）
  → join_cap → offer → answer → DataChannel
  → 包廂 UI（跳過 loading_sam）；網址仍是 /i/<short>
  →「離開這一間」→ 頁內確認 → 只斷自己；主持與其他人還在；自己掛的項目 unshare
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
pc.addTransceiver("audio", { direction: "sendrecv" }); // 在場音（開口）
pc.addTransceiver("video", { direction: "sendrecv" }); // 在場視（鏡頭／畫面）
pc.addTransceiver("audio", { direction: "sendrecv" }); // 節目音（包廂電視）
pc.addTransceiver("video", { direction: "sendrecv" }); // 節目視（包廂電視）
pc.createDataChannel("roster", { ordered: true });
```

實作建議：包廂用**具名** helper（例如 `reserveBoothMediaTransceivers`），**不要**把遊戲可能共用的 `reserveRosterMediaTransceivers` 默默改成 2+2。**1b 已落地 2+2。**

後期在場／節目各自 `RTCRtpSender.replaceTrack`；關則 `replaceTrack(null)`。**禁止**經 Platform renegotiation 加 m-line。

- 包廂走 Platform `transport: signal`（wire 上限 `ROSTER_WIRE_MAX_CHARS_SIGNAL`）；**不要**把帶媒體 m-line 的 SDP 塞進 OOB QR 預算。BUNDLE 候選只放第一條 m-line（ICE／DTLS 憑證仍留在各 m-line）；`av1` JSON **gzip** 後再 base64url（前綴 `z`）。遊戲 `dc1` 不 gzip，以保住 QR 相容。
- 驗收（即使 Phase 1 UI 無相機）：包廂 offer SDP **含兩組** `m=audio` 與兩組 `m=video`。

### 7.2 DataChannel `type`（與 presence／avatar_relay 同級）

| `type` | Phase 1 | 說明 |
| --- | --- | --- |
| `presence` | 用 | 既有 |
| `session_chat` | **用** | 文字；重用 [`rosterSessionChat.ts`](../src/components/playgrounds/roster/rosterSessionChat.ts) |
| `session_file` | **用** | 分享目錄（**檔** metadata）＋按需串流（見 §8.2）；**不是**聊天附件 push；**不是**未 request 就送 bytes；**不掛資料夾** |
| `session_mesh` | **延後** | 主持轉送任兩 peer 的 O／A；**不**經 Platform；**不**載檔 bytes／RTP。現況不介紹、不建 mesh 邊 |
| `session_cast` | 媒體階段 | **電視控制面**（指定來源／關機；可選 name／paused／t 當標籤）；**不**承載影音 bytes；節目 RTP 走 Hub |
| `session_camera` | Phase 2 | 鏡頭項：offer＝掛上；`request` 才送 RTP |
| `session_ping` | 可選 | RTT 探測；對人可顯示「約 N ms」，不揭露路徑 |
| `avatar_relay` | 不用 | 包廂無 SAM session；後期若在包廂開局再掛 |

**禁止**把檔案或聊天正文掛成 `avatar_relay.payload`。

### 7.3 ICE（與遊戲邀請切開）

| Invite | ICE |
| --- | --- |
| `invite.compose` | 不變：Host `turn_prefer`＋官方 TURN → **relay-only**（點數計劃 §7.2） |
| `invite.room` | **預設 STUN／直連**（含區網 host／srflx）。**不**因 `turn_prefer` 自動 stamp relay-only、**不**因附上 TURN URL 就走現況 `iceTransportPolicy: "relay"` 那條遊戲工廠 |

理由：包廂傳檔與節目收看都以**同一網路或足夠直連**為快樂路徑；高碼率走官方 relay 會貴且易卡。包廂「已連線」測的是**這間包廂**，不是五子棋的 relay 政策。若要測對弈備援，另鑄遊戲邀請。

跨網連不上：頁內錯誤／請靠近同一網路或請對方再試；**不**教 ICE。官方 TURN 作包廂「可 fallback、非 relay-only」是否開放，**另段**（牽涉點數與 `buildRosterRtcConfiguration`）；不阻塞 Phase 1。**不承諾**跨網高碼率電影。

對人只顯示：等待／已連線／已斷線／傳送中／收看中。人數與門牌 TTL **分開呈現**（見 §10）；不要用「邀請還有 N 分鐘」當包廂主狀態。

### 7.4 Hub 星狀（現況）；Mesh 延後

進門＝Platform 一次 O／A，得到 Guest↔Host 的 PC（2+2＋roster DC）。**為查找連線／畫面問題，先不建 Guest↔Guest mesh。** 檔 chunk 與音視訊 RTP **一律**走這條進門星：Owner→Host→Requester（Host 自己是其中一方時就是一跳）。

```text
Host ↔ 某人     進門 PC（檔 DC＋在場／節目 RTP）——唯一媒體／檔 bytes 路徑
Guest ↔ Guest   不另建 PC；控制面經 Host fanout；內容經 Host 轉幀／轉 track
```

```text
進門     Guest ── Invite O／A ── Host          ← 唯一經 Platform
轉送     A ── 進門 PC ── Host ── 進門 PC ── B   ← chunk 走 DC；鏡頭／麥／節目走 RTP
```

**Mesh 邊（延後）：** `session_mesh.*` 契約仍留在本節，**現況 Host 不 `hello`／不轉 O／A，Guest 不建第二條 PC**。日後打開時邊＝與進門相同 2+2＋DC；失敗仍回這條 star。旗標：`GO_ROOM_MESH_ENABLED`。

```text
session_mesh.hello     { peerId }                 // 延後：新人入座時 Host 介紹
session_mesh.bye       { peerId }
session_mesh.offer     { from, to, sdp }
session_mesh.answer    { from, to, sdp }
session_mesh.candidate { from, to, cand }
session_mesh.fail      { from, to }
```

Host **只轉**這些 JSON（將來），不 `setRemoteDescription` 別人的 mesh SDP，也**不**當雲端 SFU。

人數軟頂：包廂規模（建議 ≤6 人）下星狀可接受；**不要**做成無限 swarm。

**不像 WebTorrent 的部分（硬）：** 下載者不當種子；分頁不留可再分發的檔副本；無 magnet／infohash 產品面。仍是 Owner 持有 `File` handle，Requester 拉流——現況路徑經 Hub。音視訊同樣：只對有 `request` 的那條連線出站，Host 轉給該請求者。

---

## 8. 第一階段產品（文字＋傳檔）

### 8.1 文字（輔助面）

重用 `session_chat` wire／fanout／去重。包廂殼差異：

- 永遠自由文字（無 SAM `SessionChatHints`；無對弈 `active` 閘）
- **不是主面、不是全頁時間線。** 對齊視訊會議 chat 與局內 overlay：預設收合的抽屜／把手。主高度讓給電視。
- 對「同包廂已連線 peer」**fanout**（一人在時送出可留本機；可加一句低調「對方還看不到——這間目前只有你」——**不要**因此把抽屜做成進門英雄）
- 快捷語可留少數（在嗎／等一下／收到／謝謝）；預設收起
- 單則上限可沿用 200 字；時間線記憶體上限建議 200 則
- 斷線清空；無雲端歷史
- Bubble 視覺可與 overlay 同族（本機右、遠端左；**顯示登入名**＋金色「主持」標記，名不是「主持」）
- 開口（麥）比打開文字更順手；權限拒或不能出聲才強調文字把手
- 空態不要寫「還沒有訊息。先打字也可以。」當主畫面；電視關機才是空態

### 8.2 傳檔（分享目錄＋串流落盤）

包廂傳檔**不是**訊息附件。對齊 §5.5：掛上＝授權，點下載才拉。

1. 要分享的人把檔 **選進、drop 進分享區**（可多選）。**不掛資料夾**：沒有「選資料夾」、不建 dir 列。Drop 進來若瀏覽器交出其中的 `File`，當**獨立檔**掛上。瀏覽器此時只取得這個 session 讀那些檔的授權（`File` handle 留在分享者分頁）；**不**讀內容、**不**發給任何人。
2. 其他人在分享區只看到**檔**（檔名、大小、誰掛的）。晚進門的人拿到**當時目錄快照**，仍無內容。
3. 有人按 **下載**：先打開系統「另存新檔」（使用者手勢），**再**向分享者要內容。內容經 WebRTC **串流寫入使用者選的那個檔案**。
4. 傳輸點對點、**不**經 Platform／R2。**現況路徑經 Host 星狀**（Owner↔Host↔Requester；Host 自己是其中一方時進門 PC 已是一跳）。Host 若不是其中一方，只轉控制面／轉幀，**不**組裝。Guest↔Guest 直連 mesh **延後**。

對讀者可寫：**檔案還在分享者這台裝置上。點下載才會存到你選的位置。關包廂，目錄就沒了；已存到你硬碟的檔不受影響。**

**收看 live ≠ 下載 ≠ 私下播放 ≠ 包廂電視（硬）：** 分享區「下載」走本節 Save picker。同一份影音要**自己看／聽、可 seek** 走 §9.3 **私下播放**（`session_file` chunk → 本機播放器；可用 SW 當片源），**不**走節目 RTP。**放到電視上**才走 §5.7／§9 節目 RTP。iOS 無 Save picker 時下載失敗——私下播放仍可用；收電視是另一條路。圖片「檢視」見 §9.3。

**不掛資料夾（硬）：** 產品面只有檔。禁止 `<input webkitdirectory>`、`showDirectoryPicker()` 當掛上路徑。遠端若送來 `kind:dir`，忽略、不列、不對資料夾本身 `request`。

#### 硬否決（實作／測試都要卡住）

| 否決 | 原因 |
| --- | --- |
| Service Worker 攔截**下載**、`ReadableStream` 當**下載** `Response` 餵系統下載管理員 | 下載必須走 Save picker 串流落盤；**不要**用 SW 當下載後備 |
| OPFS／IndexedDB／Cache Storage 當**下載**緩衝或落盤 | 不是使用者選的檔；也不是「下載到本機硬碟」的產品語意。播放 SW **亦不得** `Cache.put` 整檔 |
| 分享者 `file.arrayBuffer()`（或一次讀完整份） | 整檔進 RAM |
| 收方累積 `chunks[]`、`assemble`、`new Blob`、`blob:` URL、`<a download>` | 整檔進 RAM；下載變成「先暫存再另存」 |
| 一人下載就把 bytes fanout 給所有人 | 沒點下載的人被塞檔 |
| 先 `request` 再打開存檔對話 | 抵達的幀只能堆在 RAM |
| 掛資料夾／子目錄（dir 列、選資料夾、整夾 metadata 樹） | 契約只掛檔；一次可多選檔 |

RAM 預算：**最多約一個 chunk**（建議沿用 16 KiB）加上 DataChannel `bufferedAmount` 背壓視窗。背壓不足、把整檔 slice 完塞進 JS 佇列＝變相整檔進記憶體，同樣否決。

#### 落盤 API（唯一允許的寫入端）

請求端必須在送出 `request` **之前**取得 **File System Access** 寫入流：

```text
showSaveFilePicker({ suggestedName }) → fileHandle.createWritable()
```

之後每收到一幀 `writable.write(payload)`，傳完 `close()`。取消 picker＝**不**發 `request`。

瀏覽器沒有 `showSaveFilePicker`／`createWritable`（常見：iOS Safari）→ **這次下載失敗**，頁內說明換系統瀏覽器或電腦再開；**禁止**為通過而改走 Blob／OPFS／把 SW 當下載。可改走 §9.3 **播放**。掛檔（`<input type="file">`／drop）仍可用 OS 選擇器——那是讀取授權，不是落盤。

#### Wire

控制面 JSON（DataChannel 文字幀）＋ payload 二元幀。`binaryType = "arraybuffer"`。目錄可 fanout；**內容只走 Owner → Requester**（Host 若不是其中一方，只轉幀、不組裝）。

```text
session_file.share     { id, name, size, mime, owner }   // 掛上：僅檔 metadata。本客戶端不送 kind:dir／parentId
session_file.unshare   { id }                      // 撤一檔
session_file.catalog   { items: share[] }          // 晚進門：Host 重放目錄
session_file.request   { id, transferId, from, offset? }  // 下載或播放；writable 僅下載要就緒；播放 Range 可帶 byte offset
session_file.reject    { id, transferId }          // 已撤回／擁有者離席／無寫入能力／忙碌
session_file.pause     { id, transferId }          // 播放緩衝滿；owner 停泵、transfer 仍在
session_file.resume    { id, transferId }          // 窗口有空；owner 續泵
session_file.chunk     二元：transferId + seq + payload  // 勿只用 file id（並行／排隊會撞 seq）
session_file.done      { id, transferId }
session_file.cancel    { id, transferId }
```

舊 `offer`／`accept`（「要不要收這份推送」）**停用**。掛上分享區＝已授權被拉；下載＝另存新檔＋拉流。本客戶端**不**送 `kind:dir`；若收到（舊客戶端），忽略該列。

拓樸：目錄與 `request`／`reject`／`unshare` 仍經 Host fanout／轉送。**chunk／`done`：** 現況一律經 Host `transferId → { ownerPeer, requesterPeer }` 轉 binary（`goRoomFileStar`）。Guest↔Guest 直連 DC **延後**。擁有者離席 → 其目錄 `unshare`、進行中 `cancel`。Host 自己就是 Owner 或 Requester 時，進門那條 PC 已是一跳。

分享者送檔：`file.slice(offset, offset+n)`（或等價 stream reader）每次一塊；`bufferedAmount` 高則停讀。

| 項 | Phase 1 初值（可調；寫進測試） |
| --- | --- |
| 單檔上限 | 2 GiB（傳輸時長／惡意檔保險，**不是** RAM 預算；內容仍按 chunk 串流） |
| 同時傳送 | 1 筆進行中的 **transfer**（可排隊；**不是**限制 1 位可掛檔、也不是 1 位收件人） |
| 掛檔 | 分享區選檔／drop；可多份。**不提供選資料夾** |
| 下載 | 先 Save picker，再 `request`；串流寫入該檔 |
| 預覽 | 目錄＝檔名＋大小＋誰掛的；**不**為縮圖先傳內容 |
| 散場 | 丟 `File` handle 與目錄；進行中 `cancel`；已寫入使用者選的檔**不**刪 |

OS 檔案選擇器允許（掛檔、另存）。**不掛目錄。** 可執行檔拒（頁內，非原生 dialog）。**否決**自動上傳 Platform／R2。

### 8.3 連線探測（Phase 1 已夠講）

DataChannel `open` ＝「已連線」。可選 ping。不把「先連包廂再保證五子棋 relay」當 Phase 1 故事。

---

## 9. 媒體項（契約現在凍；UI 分階段）

下列**不是**非目標。Phase 1 **不做**鏡頭／電視 UI，但 **§7.1 的 2+2 SDP** 現在凍結——禁止之後用 Platform renegotiation 補軌。仍預留的只有「在包廂開一局」。

**在場槽**載開口／鏡頭／畫面（可被主持切上電視）。**節目槽載房級電視**（不再空置）。目錄檔的私下播走 DC，不上節目槽。

### 9.1 在場 live（SDP 在場槽）

| | 規格 |
| --- | --- |
| **來源** | `getUserMedia` **或** `getDisplayMedia`，**不能同時**。一條**在場** live 可含影像＋聲音 |
| **人數** | 每人同時最多**發布**一條在場 live。預設關相機 |
| **產品面** | 在場名單標示；**不是**目錄虛擬檔；**不是**包廂電視（除非主持指定此路為電視來源） |
| **傳輸** | WebRTC RTP（presence A/V）。現況經 Host 轉 |

**在場影像：** 進門可把遠端 presence receiver 綁到本機隱藏 `<video>`（1×1／透明，**不要** `display:none`）。點座位上的人不自動上電視。上電視＝主持切來源，改走節目洞。

關在場 live＝`replaceTrack(null)` 並 `unoffer`。

**否決**把鏡頭／畫面掛進分享目錄。**否決**用 `captureStream`／節目 RTP **代替私下播檔或下載**。**必須**用 `captureStream`／節目 RTP 當**電視**（§9.2）。

**否決**「第三人加入就關鏡頭」。人數不關 live。不做格子牆。

### 9.2 包廂電視（SDP 節目槽）

| | 規格 |
| --- | --- |
| **來源** | 主持指定：關機／來源端檔 `captureStream`／某 peer 的在場 live。見 §5.7 |
| **人數** | 全場同時一路。在場**自動收**（房級 §9.8） |
| **產品面** | 內景電視洞；關機也是主視覺 |
| **傳輸** | WebRTC **節目** RTP。現況經 Host 轉給每位在場。**禁止**用 DC 當電視 |

**電視綁定（硬）：** 進門 PC 一建立，就把遠端 **program** receiver 綁到電視洞 `<video srcObject>`。禁止等有畫面才第一次綁。關機＝空軌或關機視覺，**不要**拆綁定、**不要** `display:none`。

聲音兩層可並行：節目音＝片／電視來源；在場音＝開口。

### 9.3 拓樸

與傳檔同一條：**現況 Hub 星狀；mesh 延後。**

```text
Host ↔ X      進門 PC：文字／目錄／檔 DC／在場 RTP／節目 RTP（電視）
Guest ↔ Guest 不另建 PC；控制面經 Host fanout；內容經 Host 轉幀／轉 track
```

| | 任意人數（含自己的另一台） |
| --- | --- |
| **電視** | 節目槽；主持指定來源；在場自動收 |
| **在場影像** | 開在名單；上電視＝主持切來源。未指定則零影像 RTP（聲見 §9.8） |
| **檔 bytes／私下播** | 進門 DC；不佔節目槽；不跟電視互斥 |

- **不做：** 雲端 SFU、為每人預留無上限**額外** video m-line、會議格子牆、把私下播改走 RTP。
- **延後：** Guest–Guest mesh。現況不介紹、不建邊。
- 人數軟頂（可調）：包廂 ≤6。超過頁內說明。星狀下電影 RTP 常是每條 PC 各編一次。

### 9.4 拉的方式依項目

| | 下載（§8.2） | 檢視 | 私下播放（影音檔） | 包廂電視 | 在場鏡頭 |
| --- | --- | --- | --- | --- | --- |
| 目的 | 對方硬碟多一份 | 當場看圖 | 我這台看／聽；可 seek；散場沒有檔 | 全場同一路；跟著來源走 | 可被主持切上電視 |
| 開始 | 先 Save picker，再拉 bytes | `request` 後有上限暫看 | `session_file` chunk（滑動緩衝／MSE，或 SW 片源） | 進門即收節目 | 開＝offer；影像待指定 |
| RAM | ≤ 一幀 chunk | 小圖可組暫存 object URL | 播放窗口軟頂 **32 MiB**；緩衝滿 `pause` owner | 瀏覽器 RTP；**禁止**組整檔 Blob | 同左 |
| 控制 | 下載者自己的進度 | 關預覽即停 | **本機播放器** seek／暫停 | **來源端** seek／暫停；收看端不可對電視獨立拖進度 | 本機預覽 |

檢視不是下載的 Blob 後備。私下播放＝只想自己看、不要一份落盤檔，**不是**電視。可等檔頭足夠就開播（mp4 常要 moov）；仍是 DC bytes。**禁止**為私下播組整檔 `Blob` 當暫存（本機 `File` object URL 除外）。

**遠端私下播可用 Service Worker（允許、有邊界）：** 若 MSE／滑動窗口不夠讓瀏覽器原生 `<video>`／`<audio>` 做 Range／漸進讀檔，**可以**用 go 既有 SW 攔截一個本機播放 URL（例：`/room-play/<transferId>`），把 `session_file` chunk 編成 `Response`（含 `206` Range）。bytes 仍只走 WebRTC。

| 可 | 不可 |
| --- | --- |
| 攔截**播放** URL；`ReadableStream`／Range 當媒體 `Response` | 攔截「下載」或餵系統下載管理員 |
| 改 go **既有** SW（不要為包廂另註冊第二個） | `Cache.put`／OPFS／IndexedDB 存整檔 |
| 關播放器即取消 fetch、丟窗口、停對 owner 的 `request` | 用 SW 當 iOS 下載後備；用 SW／DC 當包廂電視 |

本機掛的檔仍走 `File` object URL，不必經 SW。

**禁止**用 WebRTC 當「我這台播目錄檔」的路徑。**必須**用 WebRTC 當包廂電視。

### 9.5 瀏覽器（驗收寫死，不當後續階段 bug）

| 能力 | 快樂路徑 | 失敗怎麼辦 |
| --- | --- | --- |
| 收電視（節目 RTP）、開鏡頭、開麥 | 含 iOS Safari 當收看／開口 | 權限拒＝頁內說明 |
| 電影來源 `captureStream` | 桌機／Android Chromium 當屋子 | iOS 當來源失敗→頁內說明改桌機當電視來源；收看端仍收 RTP |
| 私下播目錄影音 | 本機 `<video controls>`／`<audio controls>`；大檔邊收邊播；遠端可用 SW 片源 | 解不了→頁內說明；**不要**改叫人下載當唯一出路 |
| 螢幕分享 `getDisplayMedia` | 與鏡頭互斥的同一條**在場** live；可被指定上電視 | 權限拒＝頁內說明 |
| Save picker 下載 | 桌機／Android Chromium | iOS 失敗（§8.2）；改私下播或只收電視 |
| 選資料夾掛上 | **不做** | 不畫該控件；drop 夾內檔當獨立檔 |

**禁止**用 WebRTC media stream **私下播**目錄裡的影片檔。**必須**用 WebRTC 當包廂電視。**禁止**為下載組整檔 Blob。私下播可用 SW 當片源；下載仍禁止 SW。

### 9.6 誰能掛、誰能拉

- **鏡頭／畫面：** 任一在座裝置可開（預設關）。**開＝本機預覽＋名單標示。** `getUserMedia` 與 `getDisplayMedia` 互斥。上電視＝主持指定。人數不禁用控件。瀏覽器權限對話＝OS 權限，不是產品 `confirm`。
- **麥：** 可與鏡頭同一條在場 live（聲音軌）；不是第二條出站 live。房級：開麥者的聲自動給在場。
- **影音檔：** 掛在目錄裡。**私下播放**才拉 bytes。**放到電視上**＝來源端已有該 `File`，走 `captureStream`＋節目 RTP。
- 進包廂**不**自動開相機。**自動**收電視與開麥者的聲。

### 9.7 控制面 `session_cast`／`session_camera`

JSON、DataChannel；**不**載影音 bytes。RTP 走 Hub。

**電視** `session_cast`（主持發出；fanout）：

```text
session_cast.offer    { from: host, id?: fileId, fromPeer?: peerId, name? }  // 指定來源（檔或 peer）；關機用 unoffer
session_cast.unoffer  { from: host }                                         // 電視關機
session_cast.state    { from: host, paused?, t?, name? }                     // 可選標籤，不是時鐘
```

收看端**不必**再 `request` 節目（房級已收）。`paused`／`t` 僅 UI。

**私下播檔不走 `session_cast`。** 重用 `session_file.request`／chunk／`done`；收方滑動緩衝、MSE 或 **SW 片源**，不是 Save picker。緩衝滿時 `pause`／`resume` 同一 `transferId`。

**鏡頭** `session_camera`：

```text
session_camera.offer    { from }   // 掛上：可被指定上電視；影像不因 offer 就 fanout
session_camera.unoffer  { from }
session_camera.request  { from }   // 非主路徑：明示拉影像（若需要本機預覽別人臉）
session_camera.release  { from }
```

### 9.8 房級規則（定案）

| 項 | 規則 |
| --- | --- |
| 節目（電視） | 進門／入座即收節目。新人對準當下電視。Host 對在場所有 program sender 送當下來源 |
| 在場聲 | 有人 `offer` 麥 → 在場自動收該音軌。關麥／離席即停 |
| 在場影像 | **不**自動 `request`。上電視＝主持指定，Hub 把該路送到節目槽 |
| 相機／畫面 | 進門不自動 `getUserMedia`／`getDisplayMedia` |
| 目錄檔 | 仍無 `request` 零 bytes |

不改「無 request 不送**檔 bytes**／不送**未指定的在場影像**」。房級是對**電視**與**開口**的例外。

### 9.9 其他預留

| 方向 | 概要 | 依賴 |
| --- | --- | --- |
| **在包廂開一局** | 已有 PC → 重用，不再經 signaling；本機開 SAM session | DEC-045 重用；GO-INVITE 後期；可先「散場再鑄遊戲邀請」 |
| **螢幕分享** | 同一條在場 live；與鏡頭互斥；可被指定上電視 | 不阻塞電視 |

實作約束：**peer 當一等物件**。遊戲 SAM 若日後掛上同一 PC，應忽略閒置 A/V 軌；對弈中**不要**自動開相機。

**不錄製。** 沒有雲端拷貝、沒有「存成影片」。

---

## 10. UX

隱喻：網咖包廂——坐進去燈就亮、電視在牆上；要加人再開門貼一張限時通行證。QR 是門上的便條，不是房間本身。自己的手機掃同一張便條＝第二個座位（自帶螢幕），不是再開一間。

**主面是包廂電視**（關機也是主體）。分享面才回答「這張邀請還能不能用」。文字跟視訊會議一樣不是 UI 主體。不要一進門就是每人一格鏡頭。

### 10.1 誰看見什麼

| | 主持 | Guest |
| --- | --- | --- |
| 電視舞台／內景 | 進門即有 | 連上才有（connecting 用短狀態，不要空殼裝成已在） |
| 開口（麥）／鏡頭 | 進門即可；預設未開相機 | 連上才有 |
| 文字抽屜／分享區 | 進門即有（預設收） | 連上才有 |
| 指定電視來源 | 有 | **無** |
| 請人進來／門牌／TTL | 有 | **無** |
| 在場名單 | 有 | 有 |
| 結束這一間 | 有（散場） | 改 **離開這一間** |
| 再開一間 | 僅 ended | 無 |
| 網址 | `/room` | `/i/<short>` |

### 10.2 窄屏（預設）

1. **頂列（不自動藏）**  
   左：包廂。右：人數膠囊（「就你」／「3 人在」）＋主動作。  
   主持：`請人進來`（主）／`結束`（次、危險描邊）。Guest：只有 `離開`。熱區 ≥44×44px。
2. **一句狀態**  
   人數＋電視（關機／正在播〈名〉／電視上是〈誰〉）。**不講 TTL。**  
   例：`就你一個人 · 把這頁開著，這一間才還在`；有人：`3 人在`。門牌過期**不**取代這一行。
3. **舞台（主體）**  
   靜態內景 canvas **就是頁面主內容**（對齊大廳：熱點按鈕在舞台下，其餘 chrome 藏）。電視洞 DOM `<video>` 對準機殼。關機＝雪花／黑屏。文字／分享／登入／座位動作＝**疊在 canvas 上的 overlay**（對齊大廳老闆／機台面），不要把時間線放舞台旁邊。
4. **底列**  
   開麥克風（主）／分享／文字把手。快捷語預設收起。主持另有「放到電視上」（來源在分享區或在場名單指定）。
5. **文字＝抽屜（預設收）**  
   對齊會議 chat。不要全頁時間線，不要空態「先打字也可以」當英雄。
6. **分享區＝可收合面**  
   掛檔／下載／**私下播放**。私下播放器在這台裝置 chrome，**不**佔電視洞。  
   **不要**做成輸入列「附加檔」、**不要**檔案氣泡混進文字、**不要**「對方想傳檔過來／接收／拒絕」。
7. **請人進來 → 分享面（唯一放大 QR 的地方）**  
   - 有效：QR、口誦 `go.samkuo.me/i/…`、複製／系統分享、一句 `這張邀請約 N 分鐘內有效；過期後再發一張即可，這一間不會因此關掉。`  
   - **必備一句：** `另一台裝置請掃這張邀請進來，不要再開一間包廂。`  
   - 過期：**不要**再畫死 QR；主 CTA `再發一張邀請`。  
   - 尚未鑄：按請人進來再鑄再開分享面。
8. **確認（頁內，非原生 dialog）**  
   - 主持結束／Esc／回大廳：`關掉後在場的人會斷線，目錄會沒了，電視與鏡頭會停。已存到硬碟的檔不受影響。`  
   - Guest 離開／Esc／回大廳：`離開後你會斷線；其他人還在。你掛上的項目會從分享區拿掉。`

### 10.3 寬屏（`min-width` 遞增）

上／左：舞台（電視內景，可較高）。  
下／右：在場、門牌小狀態、分享／文字抽屜。

- 在場名單（主持金色標記＋顯示名；主持可指定誰上電視）
- 一句：`這一間只在這個畫面開著的時候存在。`
- 門牌列：**小狀態**，不是英雄 QR  
  - 尚未請人：`還沒發邀請`＋「請人進來」  
  - 有效：`邀請有效 · 還有 4:32`＋「顯示邀請」  
  - 過期：`邀請已過期`＋「再發一張」
- 電視控制（主持）：關機／放到電視上／切來源
- `結束這一間`

**禁止**桌面先做再 `max-width` 縮小。**禁止**把大 QR 等待面當成已登入會員的預設首屏。**禁止**左欄全頁時間線。現場掃碼是分享面的工作。

### 10.4 未登入／結束後／Guest 進不去

未登入：說明開這一間要通行證；不擋回大廳、不擋 `/s/`。補一句：`被請進來的人不必有通行證；開這一間的人要留在這個畫面。另一台裝置請掃邀請進來。`

結束後：`這一間已結束`＋主持「再開一間」＋回大廳。**不要**在結束面留舊 QR。

Guest 主持已離開：主 CTA 回大廳；次要「請對方再發邀請」。

`/room` 不是對弈 canvas：頂列**不必** 3s 自動收起。Esc 回大廳（現況 `goEscapeHome` 含 `/chat` → 改 `/room`）。分享面開啟、確認散場、文字抽屜開啟期間：對齊既有 sheet 焦點與取消。

### 10.5 電視與私下播放（契約現在凍）

- 電視洞永遠在舞台；關機也在。綁定進門即做。
- 主持指定來源後全場電視亮；收看端不可對電視獨立 seek（想自己拖進度＝私下播放／下載）。
- 私下播放與電視**並行**；第二個本機 `<video>` 在裝置 chrome。
- 開鏡頭／麥＝瀏覽器權限對話；失敗頁內說明。
- 對讀者不說直播／推流／WebRTC；不要會議格子牆；第三人在場**不**藏鏡頭控件。
- 點電視可展開完整控制（音量／全螢幕／主持的播放控制）；窄屏機殼內容納不下原生 controls。

---

## 11. 隱私與儲存

| 項 | 規格 |
| --- | --- |
| 文字／檔案／媒體 RTP | 只經 WebRTC；signaling 僅 SDP。**不錄製** |
| Host API key | 頁面記憶體；mint／作答；關頁即失 |
| 時間線 | RAM；散場丟 |
| 檔案目錄 | RAM metadata（含目錄樹相對路徑）；散場丟。**內容**只在下載時寫入使用者選的檔；分頁不留副本 |
| 檔案緩衝 | **禁止** OPFS／IndexedDB／Cache／SW 當**下載**後備（檢視圖的上限暫存除外；**播放**見下） |
| 播放緩衝 | 影音檔播放＝滑動窗口／MSE，或遠端 **SW 片源**（軟頂 32 MiB）；**不以整檔大小拒絕**；關播放器 `revoke`／停攔截。本機掛檔可用 `File` object URL。SW **不得** Cache 整檔 |
| 收看緩衝 | live 僅瀏覽器 RTP 管線；**禁止**為 live 組整檔 Blob |
| 顯示名 | 可繼續 Roster `localStorage` |
| 分析 | 若打點，只計「鑄了包廂邀請／握手成功／掛過鏡頭」之類；不記正文、檔名、RTP |
| 離線 | 包廂**不能**離線加入（與 `/i/` 同） |

對讀者可寫：**電視、開口與檔案只在在場者的瀏覽器之間；檔案點下載才存到你選的位置，不會存到遊樂場伺服器。不錄影。** 主持把這個畫面關掉，這一間就散了；目錄沒了，已存到硬碟的檔不受影響。

---

## 12. 實作切面（建議）

| 層 | 建議 |
| --- | --- |
| Invite | `wantsRosterSignal` 認 `invite.room`；**不要**對 room stamp 遊戲用 `relay: true` |
| Host | `roomRuntime`：進 `/room` 即主面；**按需** mint（勿 `openBooth` 自動鑄）；answer loop **持續作答**；門牌過期停 loop、清／作廢可分享的 shortUrl、**不**把 phase 打成 ended；**不** `open` SAM session |
| Guest | `guestRuntime`／`/i/` 依 kind **或** `intent.surface` 分流；room 不 `resolveGoSamFiles`；同意後**不** `replaceState` `/room`；離開 ≠ 主持散場 |
| 文字 | `goSessionChat` **抽屜／overlay**（撤全頁時間線當主面） |
| 檔案 | 共用 `rosterSessionFile.ts`＋單測；chunk **現況經 Host star**；禁止全員 fanout；`goRoomFileTransfer` 串流 `slice`／writable，禁止組下載 Blob；**只掛檔、不掛資料夾**；遠端**私下播**可用既有 SW 當片源 |
| Mesh | **延後。** `session_mesh` 模組留著；`GO_ROOM_MESH_ENABLED = false`。Host 不介紹、Guest 不建第二條 PC |
| Peer | 進門 booth 2+2 helper（勿把遊戲 DC-only／現況 1+1 默默改掉）。mesh 邊日後同一套 |
| 媒體 | **節目槽＝電視**（進門綁 program `<video>`；房級送來源；電影 `captureStream`）。在場＝開口／可指定上電視。私下播走 DC，不佔節目。人數不關鏡頭 |
| 場景 | `goBoothCanvas`／`goBoothLayout`（新內景；抽大廳色盤／`px`／`drawFigure`）。**不要**重用 `GoShopLobby`。電視洞 `worldToScreen` 疊 DOM video |
| 分享 | `GoShareSheet` 邀請模式；title「邀請你進包廂」；**必備**「另一台請掃碼、不要再開一間」 |
| 路由 | `go-client/src/routes/room/`；`/chat` 導向 `/room` |
| 大廳 | hotspot `room` → `/room`；label「包廂」 |
| chrome | 「更多」連到 `/room`；Esc／bulletin 路徑表 |

TDD：進門即主面且**未鑄**門牌、kind／surface 分流、無 SAM Guest、持續作答（非 1 Guest）、SDP **兩組** A/V m-line、`share` 不上 chunk、`request` 前已有 writable、chunk RAM≤一幀、第三者收不到 transfer、下載無 SW／OPFS／Blob 後備、**拒絕掛資料夾**、fanout 檔清單、斷線 `unshare`、門牌過期包廂仍 open、過期後禁止分享舊 shortUrl、Guest 離開人數 -1。現況 **不**介紹 `session_mesh`。媒體：進門綁節目 video；電視來源走 program RTP；私下播不清電視；無指定則零在場影像 RTP；第三人加入不關鏡頭。純文件本刀不寫程式。

---

## 13. 階段

| Phase | 內容 | 完成定義 | 狀態 |
| --- | --- | --- | --- |
| **0. 契約** | 本文件；GLOSSARY／交叉引用 | 包廂≠overlay≠compose；進門即主面；入座不鎖 1:1；**主面＝電視**；**兩層螢幕**；電視＝節目 RTP；私下播＝DC；主持導播；靜態內景不走動；目錄只掛檔；現況 Hub；兩個時鐘；按需鑄；Guest 留 `/i/`；SDP 2+2 | **本刀** |
| **1. 文字＋傳檔** | 進 `/room` 即主面；按需 mint `invite.room`、`/i/` consent、DC、`session_chat` fanout、`session_file` **分享目錄＋串流落盤**（只掛檔）；answer loop 持續作答 | 會員不必先邀請就見包廂 UI（無 TTL）；同一短鏈 ≥2 Guest 與 Host 互傳文字；分享區可掛檔、點下載才寫入另存檔；無 Save picker 則頁內說明、不組 Blob；Platform 無正文／無檔 bytes；未登入不能開這一間；`/chat`→`/room`；門牌過期包廂仍在 | **按需鑄／兩個時鐘已落地；多人傳檔 e2e 手測仍待；現況 star；不掛資料夾** |
| **1b. SDP 2+2** | 進門 offer／answer **2 audio + 2 video**（軌空）；具名 booth helper；遊戲 SDP 不動 | 進門 SDP 含兩組 `m=audio`、兩組 `m=video`；遊戲 compose 仍無須 2+2 | **已落地**（`reserveBoothMediaTransceivers`） |
| **1c. Mesh 直連** | `session_mesh`；邊＝2+2＋DC；檔 chunk 與 RTP 直連／star 備援 | 兩位 Guest 之間：下載與節目／麥可不經 Host 組裝 | **延後**（`GO_ROOM_MESH_ENABLED = false`；先把 Hub 查清楚） |
| **2a. Live（鏡頭／麥／畫面）** | 開在名單；在場**影像**仍 `request` 才送；麥＝房級；`getUserMedia` XOR `getDisplayMedia`；不做格子牆 | 不經 Platform 二次 O／A；預設未開相機；無指定則零在場影像 RTP | **已落地**（2c 起麥改房級） |
| **2b. 目錄影音私下播** | 掛在目錄的影片／音樂可下載或漸進下載進本機播放器；不走節目 RTP | 片源不出雲；可 seek；**不**當電視 | **已落地**（分享區播放器；不佔電視洞） |
| **2c. 包廂電視＋內景** | 靜態內景；節目槽＝電視；主持指定來源（檔 `captureStream` 或 peer live）；房級收節目／在場聲；文字收成抽屜 | 關機電視佔主高度；一起看 MTV 走 RTP；私下播與電視並行；不走動 | **已落地**（`GoBoothStage`；節目 RTP；文字／分享抽屜） |
| **3. 重用 peer 開局** | 包廂已連 → SAM session | 不必再掃一次（可選） | 預留 |

建議實作順序 **0 → 1 → 1b**（已落地）→ **2c（電視＋內景）** 對齊本契約；**1c mesh 延後**。2a 在場 live 可與 2c 同刀：開口＋指定上電視。2b 私下播保留為裝置 chrome，不要再當主面播放器。

---

## 14. 已凍結決策

| # | 題 | 定案 |
| --- | --- | --- |
| 1 | 名稱／URL | 讀者「包廂」；canonical **`/room`**；舊 `/chat` 導轉 |
| 2 | 產品本質 | **一般用途隔間**；快樂路徑＝請人進來一起看電視。Phase 1＝文字＋傳檔 **wire**，不是產品主形 |
| 3 | Invite | **`invite.room`**；門牌仍 `/i/`；無 SAM |
| 4 | 文字 | 重用 `session_chat`；**輔助抽屜**，不是主面（對齊視訊會議 chat） |
| 5 | 傳檔 | `session_file` **分享目錄**；點下載才串流到 `showSaveFilePicker`；**下載禁止** SW、OPFS、整檔 RAM／Blob。**只掛檔，不掛資料夾**。**私下播可用** go 既有 SW 當片源 |
| 6 | SDP | 進門 **2 audio + 2 video**＋DC；**在場**＝開口／鏡頭；**節目**＝房級電視；mesh 邊日後同一套；**禁止** Platform renegotiation；遊戲 compose 維持 DC-only |
| 7 | ICE | 包廂 **≠** 遊戲 relay-only stamp；高碼率以同一網路為快樂路徑 |
| 8 | 登入 | 開這一間要；被請進來不要（自己的第二台當 Guest 也不要） |
| 9 | 雲 | 無；散場丟；**不錄製** |
| 10 | 進門 | **已登入開 `/room`＝包廂主面（電視舞台）**；邀請是面內動作 |
| 11 | 人數 | **入座不鎖 1:1**；同一張**有效** Invite 多 join；文字／**分享目錄** fanout。鏡頭**不**因人數開關 |
| 12 | 兩個時鐘 | 包廂壽命＝主持 `/room` 文件；門牌 TTL 只管請新人；過期 ≠ 散場 |
| 13 | 按需鑄 | **沒按「請人進來」就不 mint**；同一時間最多一張有效門牌；過期後禁止分享舊 QR |
| 14 | Guest URL | 同意後**留在** `/i/<short>`；**禁止** `replaceState` `/room` |
| 15 | 角色 CTA | 主持「結束這一間」；Guest「離開這一間」；主面不把 TTL 當包廂狀態 |
| 16 | 第二台 | **掃門牌**進來；再開 `/room`＝另一間空包廂。自帶螢幕可私下播，不跟電視互斥 |
| 17 | 三個動詞 | **說**（開口為主、文字為輔）／**掛**／**要**（下載、檢視、私下播）。放到電視上≠要目錄檔 |
| 18 | 媒體層 | SDP **在場**＝開口／可指定上電視的 live；**節目**＝包廂電視。每人一條出站在場 live。進門不開相機。PC 建立後綁節目 video |
| 19 | 電視 vs 私下播 vs 下載 | **電視＝節目 RTP**（電影 `captureStream` 或 peer live）。私下播與下載走 `session_file`。兩者不互斥 |
| 20 | 拓樸 | 進門＝Guest↔Host（Platform 一次）。**現況檔與 RTP 皆經 Host Hub**。Guest↔Guest mesh **延後**。否決 Platform 第二輪與雲端 SFU |
| 21 | 節目源 | **電視必須 RTP。** 否決用 `captureStream`／RTP **代替**個人下載或私下播。否決用 DC 當電視 |
| 22 | 用語 | 包廂電視、放到電視上、私下播放、開口；不用直播、會議 SaaS 產品名、P2P、串流伺服器 |
| 23 | 內容傳輸 | 檔 bytes 與未指定的在場影像：無 `request` 則零。**房級：** 自動收電視與開麥者的聲。不做格子牆 |
| 24 | 分享目錄 | **只有檔**；不掛資料夾；鏡頭／畫面不是項 |
| 25 | 一條出站在場 live | `getUserMedia` XOR `getDisplayMedia`；可含影像＋聲音 |
| 26 | 兩層螢幕 | 包廂電視 ≠ 我這台。私下播／掛／下載不跟電視互斥 |
| 27 | 主持導播 | 僅主持指定電視來源（檔或 peer）。被指定者不是新主持 |
| 28 | 內景 | 靜態場景延續大廳畫風；**不走動**；不重用大廳地圖；電視洞＝canvas 機殼＋DOM `<video>` |

---

## 15. 與既有通路（勿混）

| 流 | 是 | 不是 |
| --- | --- | --- |
| **包廂 `/room`** | 臨時隔間；進門即**電視主面**；Invite 請人**或自己的另一台**；**活著＝主持畫面開著**；一起看電視（節目 RTP）；自帶裝置可私下播／掛／下載；開口為主、文字為輔；現況 Hub | 大廳可行走地圖、全頁聊天室、局內 overlay、型錄 SAM、必須先邀請才看得到 UI、入座只能兩人、5 分鐘租期的雲端房間、視訊會議格子牆、再開 `/room` 當連線、用 DC 當電視 |
| **Session chat** | 已在遊戲 session 裡的附屬對話 | 包廂主面；包廂文字抽屜可同族但不是局內 overlay |
| **GO-INVITE** | `invite.compose` 開指定 SAM | 包廂 kind |
| **布告** | 全站營運公告 | peer 對話 |
| **`/s/`** | 單機傳閱 | 無 peer、無包廂 |

---

## 16. 驗收清單（Phase 0–1 草案）

**契約**

- [x] 本文件；不另開 DEC
- [x] GLOSSARY「包廂」；大廳熱點／主計劃交叉引用
- [x] **進門即主面：** 已登入開 `/room` 即包廂 UI，不必先按邀請；主面＝靜態內景＋電視（2c）
- [x] **不鎖 1:1 入座：** 同一短鏈多人可進；時間線 fanout；分享目錄同步（內容不全員推送）
- [x] **兩個時鐘：** 包廂＝Host document；門牌 TTL 分開；按需鑄；Guest 留 `/i/`
- [x] **契約本刀：** 主面＝電視；兩層螢幕；電視＝節目 RTP；私下播＝DC；主持導播；靜態內景；房級收節目／在場聲（§5.6–5.8／§9／§10）

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
| 2026-08-18 | **預設分享模型：** 目錄＝授權、內容永遠按需拉（檔／子目錄／鏡頭／麥／節目同一張目錄）。撤「在場視訊僅 1:1」。動詞改 **說／掛／要**。房級自動拉規則有需求再定義。掛子目錄僅瀏覽器支援時 |
| 2026-08-18 | **實作對齊按需拉：** 人數不關鏡頭；麥／節目 offer 後等 `request` 才 `replaceTrack`；Host 轉節目只給請求者；`session_cast` 改 offer／request；支援時可掛子目錄 |
| 2026-08-18 | **虛擬檔案系統：** 分享目錄掛檔／資料夾／裝置；影片下載或串流、不另掛節目；鏡頭＝裝置虛擬檔；`session_cast.request { id }` |
| 2026-08-18 | **單檔上限 2 GiB**（串流 chunk；非 RAM 預算） |
| 2026-08-19 | **Hub 先行、mesh 延後：** 檔與媒體一律經主持轉送（`GO_ROOM_MESH_ENABLED = false`）。進門 PC 建立後即綁本機 video；按收看才顯示 |
| 2026-08-19 | **Live ≠ 檔：** 每人同時一條 live（`getUserMedia` XOR `getDisplayMedia`，可含聲），走 WebRTC，出現在在場名單。目錄只掛檔。影音檔改漸進下載＋本機播放器（可 seek），不佔 live、不走 `captureStream` |
| 2026-08-19 | **只掛檔：** 分享目錄不掛資料夾；拿掉「選資料夾」／`webkitdirectory`。Drop 夾內檔當獨立檔。遠端 `kind:dir` 忽略 |
| 2026-08-19 | **播放≠整檔緩存：** 取消 256 MiB 整檔上限。播放＝滑動窗口（32 MiB）／MSE，緩衝滿 `pause` owner。本機 `File` 仍走 object URL（不進 JS heap） |
| 2026-08-19 | **播放可用 SW：** 遠端影音播放若需要，可用 go 既有 Service Worker 攔截播放 URL、把 DC chunk 編成媒體 `Response`（含 Range）。下載仍禁止 SW／Cache 整檔 |
| 2026-08-19 | **包廂電視主面：** 靜態內景（不走動）；主面＝電視不是時間線；兩層螢幕（電視 RTP ≠ 私下播 DC）；主持指定來源；電影廣播＝節目 RTP／`captureStream`；房級收電視與開麥聲；文字＝輔助抽屜。凍結 #18–#28 |
| 2026-08-19 | **2c 落地：** `goBoothLayout`／`GoBoothStage`；節目槽＝電視（`startProgram`／`putLiveOnTv`）；房級收節目與麥；文字／分享抽屜；私下播留在分享區 |
