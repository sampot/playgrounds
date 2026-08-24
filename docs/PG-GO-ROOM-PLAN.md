# Playgrounds 純玩版：包廂（go `/room`）

> **狀態：** Draft（2026-08-22）— 主面＝**主視訊區**（`GoRoomTvSlot` 16:9；沒訊號／片子／live／開局同一塊；槽內無字）；**劇院態**＝應用內**滿窗僅主視訊**（**不顯示** dock／三 tab）；叫出 chrome／Esc → **回廳態**；**2d 殼面 RWD 手測完成**；**2d+ RWD 邊界精修已落地**（§5.8.1）；**開局第一刀手測完成**（五子棋＋redpick）；chrome **可收**；廳態＝大螢幕＋**成員／檔案／聊天** tab + dock；聊天＝`session_chat` 開口備援（非主欄）；兩層螢幕；**大螢幕＝同時一路主畫面**；**否決**多路視訊合成；**在場聲混音（2f）**；**放到大螢幕上＝持檔端渲染 → 節目 RTP**（影／音／圖；**2h 音檔 player 面已落地**）；**分享目錄**一律 `/room-file/<id>`；**mesh（1c）** 檔直連、節目／在場 RTP 仍 Hub；**主持私有 OPFS（2g）**；進門即主面、不鎖 1:1、兩個時鐘、SDP **2+2**；shell 斷點＝**viewport**（與 CSS `@media` 一致）
> **權威決策：** 從屬 [DECISIONS.md](./DECISIONS.md) **DEC-050**（純玩版）、**DEC-045**（Roster／薄 signaling；**非** Avatars 產品面）、**DEC-047**（Platform Invite）；**不另開 DEC**  
> **相關：** [PG-GO-CLIENT-PLAN.md](./PG-GO-CLIENT-PLAN.md)、[PG-GO-AUTH-PLAN.md](./PG-GO-AUTH-PLAN.md)（登入＋記憶體 field API key）、[PG-GO-HOST-INVITE-PLAN.md](./PG-GO-HOST-INVITE-PLAN.md)（GO-INVITE／`invite.compose` **Superseded**；連線改包廂）、[PG-GO-ROOM-PLAY-PLAN.md](./PG-GO-ROOM-PLAY-PLAN.md)（包廂內重用 peer 開局＝`session_play`；Phase 3；**第一刀手測完成**）、[PG-GO-ROOM-RECORD-PLAN.md](./PG-GO-ROOM-RECORD-PLAN.md)（多路 live 錄影＝`session_record`；Hub 私有片庫；**未落地**）、[PG-GO-ROOM-ENGINE-PLAN.md](./PG-GO-ROOM-ENGINE-PLAN.md)（包廂引擎／殼契約、**`pg-booth` 私有 monorepo**＋BoothAnchor 遠端監控；**修訂**本文件「包廂＝分頁」敘事；`play`／`go` 皆 Hub）、[PG-GO-ROOM-TAURI-PLAN.md](./PG-GO-ROOM-TAURI-PLAN.md)（桌面常駐 `pg-booth-desktop`）、[PG-GO-ROOM-DEV-HARNESS-PLAN.md](./PG-GO-ROOM-DEV-HARNESS-PLAN.md)（localhost／Agent 多 tab 進門；**勿**當產品契約）、[PG-GO-SESSION-CHAT-PLAN.md](./PG-GO-SESSION-CHAT-PLAN.md)（局內 overlay 對話——**勿混**）、[PG-GO-SHOP-LOBBY-PLAN.md](./PG-GO-SHOP-LOBBY-PLAN.md)（大廳熱點入口）、[PG-PLATFORM-API-PLAN.md](./PG-PLATFORM-API-PLAN.md)、[PG-PLATFORM-CREDITS-PLAN.md](./PG-PLATFORM-CREDITS-PLAN.md)（官方 TURN；包廂 ICE **與**已廢 compose 連線分開）、`.cursor/rules/no-native-dialogs.mdc`、`.cursor/rules/mobile-first-ux.mdc`、[GLOSSARY.md](./GLOSSARY.md)

一句話：已登入會員進 **`/room` 就是這一間包廂**（主面立刻出現；**不必先請人**）。**包廂活著＝主持這個畫面還開著；過期的是邀請碼，不是這一間。**（**修訂草案：** Engine／Shell 分離、`pg-boothd`／**`pg-booth-desktop`** 常駐、BoothAnchor 遠端 Operator——見 [PG-GO-ROOM-ENGINE-PLAN.md](./PG-GO-ROOM-ENGINE-PLAN.md)、[PG-GO-ROOM-TAURI-PLAN.md](./PG-GO-ROOM-TAURI-PLAN.md)；**未落地**，落地後壽命改綁 **Booth Engine session**。）快樂路徑＝**請人進來一起看大螢幕**（片子／圖／某人 live；可把別人掛的檔、或主持**私有檔**切上大螢幕）。**主面是大螢幕槽**，不是時間線——舞台＝畫面（影片、視訊），文字＝三區之一、不是進門第一眼，產品不是會議格子牆。每人自帶手機／筆電可掛檔、下載、**私下播放**，**不跟大螢幕互斥**。片子／圖／音／live 由主持指定**一路**、走 **WebRTC 節目 RTP**（持檔端本機渲染；再指定＝切台；**不做**多路視訊合成）。開口用麥（星狀下 Host **混音**讓開麥者彼此聽得到）；文字是不方便開口時的輔助。**分享目錄**與**主持私有檔**分開：分享裡每一檔前端一律同源 `/room-file/<id>`（本機 SW 直出；遠端 DC transfer）；私有＝Host 本機 OPFS 片庫，**不** fanout、**不可**被別人「要」——上大螢幕只送節目 RTP，要分享仍須顯式**掛到分享區**。同一張有效門牌可請人進來，也可給自己的另一台掃。人數不鎖 1:1。資料只走 WebRTC（**不**經 Platform 中繼、**不**雲存、**不錄製**）。進門仍 Guest↔Host；Guest 另可試建 Guest↔Guest DC（`session_mesh`）——**下載／私下播**有直連則跳過 Host 轉幀；無直連或失敗＝Host star。節目／在場 RTP 仍 Hub。殼＝大螢幕槽＋成員／檔案／文字（**不**用可行走大廳當 `/room`）。**在大螢幕上開一局**（重用進門 PC、不鑄 compose）＝契約已凍、**第一刀（五子棋）已手測**。

---

## 1. 動機

- 大廳已有「椅子／桌」熱點與 `/chat` 占位，但公開大廳聊天不像現實用法。網咖／室內遊樂場更常見的是：**租一間包廂**，關門一起看 MTV／片子、邊看邊講話、把檔丟到架子上；每人還可以滑自己的手機。
- **主面是屋子裡那一臺大螢幕**，不是聊天室。視訊會議也是畫面當舞台、文字當輔助——包廂同一層資訊架構，但舞台是**共用大螢幕**（主持導播：片子、某人 live、或這一局遊戲），不是每人一格臉、也不是家具點點樂小房間。
- **兩層螢幕：** 包廂大螢幕＝全場同一路；口袋裡／膝上那台＝自己的（掛、下載、私下播另一部）。兩件事並行，不互斥。
- **預設分享故事仍含自己的裝置之間。** 例如筆電當屋子（大螢幕來源）、手機掃門牌進來收看；舊手機掛鏡頭當遠端監控。請別人進來走同一條門牌、同一套目錄，不是第二套產品。
- 同一條門牌要同時服務兩種現場：**請別人進來一起看**，以及**自己的另一台裝置**。後者不是附加功能，只是同一間的第二個座位。
- 過去 Invite／WebRTC 主要服務 **`invite.compose` 直連遊戲**——把「能不能連上」綁死在某一顆小品、且與包廂語意分裂。**定案（2026-08-23）：** **所有連線遊戲**只能走包廂（`invite.room`）＋包廂內 `session_play`；`play`／`go` 皆為 Booth Hub。
- 局內 [`session_chat`](./PG-GO-SESSION-CHAT-PLAN.md) 是對弈 overlay（預設收合、遊戲優先），**不是**一般用途隔間；該計劃把語音／傳檔列為 overlay **非目標**，那些能力應落在包廂。包廂文字是**三區之一**（窄屏與大螢幕分時），不是主欄、也不是蓋住大螢幕的唯一入口。
- 分享區「下載到硬碟」在 iOS Safari 常沒有 Save picker；落盤仍優先使用者選的位置，但**索取面一律走同源 HTTP**（無 picker 時可走瀏覽器對該 URL 的標準下載／另存，**禁止**頁內組整檔 Blob）。**私下播／檢視／下載**同一條 HTTP 門面；**大螢幕收看**仍是節目 RTP——不要把「存檔」當成唯一把檔從 A 台送到 B 台的辦法，也不要把私下播當成大螢幕。
- DEC-045 已撤銷「線上」tab。包廂是 **Invite 拉人進臨時隔間**，不是常駐誰在線、不是好友名單。

---

## 2. 目標

- **包廂＝一般用途 peer 隔間（硬）：** 產品面是「這一間」；裡面做什麼由階段遞增。**禁止**把契約寫死成「只能聊天」。**禁止**做成視訊會議 SaaS（格子牆、**雲端**錄製、等候室、舉手、雲端 SFU）。可以一起看片、把某人 live 切上大螢幕、或在大螢幕上開一局——那是導播，不是開會產品。**Hub 本機多路 live 錄影**（主持指定、私有片庫）見 [PG-GO-ROOM-RECORD-PLAN.md](./PG-GO-ROOM-RECORD-PLAN.md)（**未落地**）。
- **進門即主面（硬）：** 已登入會員開 `/room`＝已經在包廂裡。**主面是包廂大螢幕槽**（沒訊號／片子／live／開局都佔主高度）。邀請是**面內動作**（請人進來），**不是**進門條件。一個人在也是這一間。**禁止**用全頁時間線當進門第一眼。
- **兩個時鐘（硬）：** 包廂壽命＝主持 `/room` 這份文件還在（**修訂草案：** 改為 **Booth Engine session**——見 [PG-GO-ROOM-ENGINE-PLAN.md](./PG-GO-ROOM-ENGINE-PLAN.md)；**未落地**）；門牌壽命＝該張 `invite.room` 的 TTL（預設 5m）。門牌過期只擋**新人**；主面與已入座連線不受影響。**按「請人進來」才鑄門牌**（同一時間最多一張有效）。見 §6.4。
- **人數對齊遊戲 session（硬）：** 包廂**不鎖 1:1 入座**。同一張**有效** Invite 短鏈可多人 join；**文字**對已連線 peer **fanout**；**分享目錄** fanout、**內容只在有人 `request` 時 Owner→Requester**。API／UI 勿把包廂寫成雙人專用隔間。鏡頭**不**因第三人加入而關。見 §5.5。
- **預設分享模型（硬）：** 分享目錄＝這一間願意分享的**檔**（授權，**不**把內容推給任何人）。**不掛資料夾。** 其他人依檔選擇下載、檢視、或**播放**（影音）。**Live stream 不是目錄項**——開鏡頭／畫面出現在**在場名單**。見 §5.5。
- **主持私有檔（硬）：** 私有片庫權威在 **Hub**（Embedded **OPFS**；常駐 **daemon** 本機目錄——見 [PG-GO-ROOM-ENGINE-PLAN.md](./PG-GO-ROOM-ENGINE-PLAN.md) §7.6）。與**分享目錄**分離。私有**不** fanout metadata、**不**進 `/room-file/<id>`、Guest **不能**下載／檢視／私下播。**Owner**（主持 Shell 或 Operator Shell）可讀寫；Operator 遠端經 Owner file channel，**不是**雲端片庫。主持可把私有檔**放到大螢幕上**（Hub 本機渲染 → 節目 RTP）。要讓別人「要」＝顯式**掛到分享區**。Guest 無私有庫。見 §5.5.1、§8.3。
- **兩種在場同一條門牌（硬）：** 「請人進來」與「自己的另一台掃碼」契約相同（**Guest 節點**）。**擁有者外出單機**可走 **Operator 節點**（`operatorCap`；不必掃門牌；一條連線看＋說＋控）——見 [PG-GO-ROOM-ENGINE-PLAN.md](./PG-GO-ROOM-ENGINE-PLAN.md) §6.2、§8.1c。已登入再開 `/room` Embedded＝**本頁另一間空包廂**（**不**連本機 `pg-boothd`），**不是**用門牌連上筆電那一間。見 §5.4。
- **Roster 節點（硬；修訂草案）：** 每個連上 Hub 的分頁／行程＝一 **Roster leaf**（`peerId`＋`members.kind`）。**權限**由 owner／`director`／委任決定，**不**由「是不是 Guest」單一標籤決定。見 ENGINE §6.2（**未落地**委任）。
- **BoothAnchor 為請人硬性前提（硬）：** 包廂 Hub 開著須 **BoothAnchor 已註冊且 Engine WSS 連上**（見 [PG-GO-ROOM-ENGINE-PLAN.md](./PG-GO-ROOM-ENGINE-PLAN.md) §10.7）。「請人進來」mint 門牌前須 Anchor **online**（或 **degraded** 且 Engine socket 仍在）。Guest WebRTC 握手 **只**經 Anchor 推送至 Hub；**禁止** Invite DO `signal/pending` long poll；**無 fallback**。
- **三個動詞（硬）：** **說**、**掛**、**要**分開。**說**＝開口為主（麥），文字＝不方便開口時的輔助面。掛＝把**檔**寫進分享目錄（含「從私有掛上」）。要＝對**分享**檔發**同源 HTTP**（下載／檢視／私下播放同一門面；wire 仍 DC）；大螢幕收看＝節目 RTP（不是「要」；私有亦可上大螢幕）。見 §5.3、§5.5.1、§5.6、§8.2。
- **索取端＝同源靜態檔（硬）：** **分享目錄**每一檔，**前端一律**以同源 **`/room-file/<id>`** 存取（GET／HEAD／Range；`200`／`206`／`404`／`416` 等）。**禁止**為目錄檔另開 `blob:`／object URL 產品路徑，也禁止頁面直讀 DC chunk。**每一次** HTTP request＝一次完整 roundtrip；次數由前端決定。SW＝標準 HTTP server：**本機自己掛的 `File` → SW 直出（不開 transfer、不經 DataChannel）**；遠端檔 → 每 roundtrip 一條 `transferId`（共用 DC）。**私有檔不走此門面。** 見 §8.2、§8.3。
- **兩層螢幕（硬）：** **包廂大螢幕**與**我這台裝置**分開。大螢幕＝主持指定的一路節目（RTP 片子／live，或開局時的 SAM 畫布）。我這台可同時掛／下載／私下播，**不跟大螢幕互斥**。見 §5.6。
- **大螢幕＝主持導播（硬）：** 這一間同時只有一個大螢幕來源（沒訊號／檔／某 peer 的 live／**這一局遊戲**）。來源由主持指定；**再指定＝切台取代**，不是把多路畫面併進同一節目。**檔＝分享目錄上任一在座掛的檔**（含別人掛的）**或主持私有檔**。看電影＝主持決定廣播哪一步（來源端播放器是時鐘）；切 live＝現在大螢幕上是誰；開局＝選哪一款、哪些人入座（其餘觀戰）。被指定上大螢幕或入座的人不是新主持。見 §5.7、§5.9。
- **否決多路視訊合成進節目（硬）：** **禁止**在瀏覽器把多路鏡頭／片子 canvas 合成再當大螢幕（監視牆／會議主講+小格烤進一路等）。負擔過重；訪客仍只收一路節目——那就維持**單主畫面切台**。多人「彼此看得見臉」不是包廂目標。見 §3、§9.8。
- **檔上大螢幕＝持檔端渲染（硬）：** `file { owner, id }` 時，**一律由持有該檔的 peer（owner）**在本機解碼／畫出 → `captureStream`（或等價）→ 節目 RTP；主持 Hub 轉軌（分享檔＝目錄 `File`；私有＝Host OPFS）。**禁止**主持先 `request` 整檔再本機播冒充大螢幕；**禁止**用 DC／每人獨立預覽冒充大螢幕；**禁止**因上大螢幕而把私有檔寫進分享目錄。呈現型別可遞增（影→音→圖→可 canvas／display 捕獲的預覽），**傳輸模型不變**。見 §5.7。
- **媒體槽（硬）：** SDP **在場**（我的鏡頭／麥）＋**節目**（**房級大螢幕**）。第一次 SDP 就留 2+2（§7.1）；`replaceTrack`，**禁止**經 Platform 二次 O／A。節目槽**不是**空置裝飾，也**不是**會議格子。
- **一條出站在場 live（硬）：** 同一參與者同時最多發布**一條**在場 live（可含影像與聲音）。來源是 `getUserMedia` **或** `getDisplayMedia`，**不能並行**。這是「我能貢獻給大螢幕／開口」的訊號，**不**禁止同機私下播檔。
- **在場聲混音（硬；星狀）：** 每條 PC 只有一條在場音 m-line。開麥者應彼此聽得到（未靜音）。星狀下 **Host 用 `AudioContext`（或等價）把多路上行麥混成一軌**，再 `replaceTrack` 填各 peer 的 presence audio（混給某人時宜排除其自己的上行）。**禁止**假設單軌轉發能同時承載多個開麥者。節目音仍跟大螢幕來源；**不要**把開口混進節目音槽。見 §9.8。
- **片子／live 走 RTP（硬）：** 電影／MTV／圖檔投影／指定的在場 live **走 WebRTC 節目槽**，**不**經 DataChannel 把片子送到每人解碼。來源端本機渲染 → `captureStream`（或等價）→ program `replaceTrack`。目錄檔的「要」（下載／檢視／私下播）走 **`/room-file/<id>`**（本機 SW 直出；遠端 SW＋`session_file`），**不**佔節目槽。**開局例外：** 大螢幕槽掛同一顆 SAM 畫布（操作權在入座席），**禁止**用主持畫面 `captureStream` 冒充一起玩。見 §5.9。
- **拓樸（硬）：** 進門仍是 Guest↔Host 一條 PC（Platform **一次** roster O／A，經 **BoothAnchor WSS** 至 Hub；見 ENGINE §10.7）。**節目／在場 RTP 與目錄控制面**經 Host Hub。Guest 在**在線 Guest 名單變動時**（自己進門見既有人、或之後有新人）**主動**試建 Guest↔Guest DC（`session_mesh`）；**失敗則該對不再重試**，之後檔走 Host star。**禁止**等到「要」檔／開 transfer 才建邊。有直連時該 transfer 的檔 bytes **不**經 Host。見 §7.4、Phase **1c**。
- **收看綁定（硬）：** 進門 PC 一建立，就把遠端 **節目** receiver 綁上大螢幕用 `<video>`（即使還沒畫面；**不要** `display:none`）。**房級：在場自動收大螢幕**（沒訊號＝空軌／雪花）。在場鏡頭仍須明示才拉影像。見 §9。
- **第一階段可交付：** 會員進 `/room` 即包廂 UI（可先不請人）；可請人進來；Guest 開 `/i/<short>` 同意進同一間 → DC 文字＋傳檔。大螢幕／開口／**殼面**／**影音圖上大螢幕**已落地；**開局第一刀**（五子棋對弈＋重開）已手測；SDP **2+2**。
- **同一套邀請門牌：** 短鏈 canonical 仍是 `https://go.samkuo.me/i/<short_id>`（QR／分享面）；Host 主面是 `/room`。Guest 進門後**留在** `/i/`（**禁止**改寫成 `/room`）。
- **資料不落雲端：** 正文、檔案 bytes、音視訊 RTP **不**經 signaling／Invite API／物件儲存。**不**做雲端「存成影片」。主持可選把指定在場 live **錄到 Hub 私有片庫**（`session_record`；見 [PG-GO-ROOM-RECORD-PLAN.md](./PG-GO-ROOM-RECORD-PLAN.md)；**未落地**）——仍**不**上 Platform。文字時間線只在頁面生命週期；**分享**檔內容**不**暫存在分頁——見 §8.2。**Host 私有 OPFS**＝本機片庫（非雲；§8.3），不是分享暫存。
- **開這一間要登入、被請進來不必**（對齊包廂 Guest）。自己的第二台當 Guest 時也不必登入。
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
- 把包廂做成視訊會議 SaaS（格子牆、**雲端**錄製、等候室、舉手、雲端 SFU）。在場可多人各開一條在場 live；**不做**會議格子牆。房級大螢幕與在場聲見 §9.8（自動收節目 ≠ 自動開相機）。**Hub 本機多路 live 錄影**見 [PG-GO-ROOM-RECORD-PLAN.md](./PG-GO-ROOM-RECORD-PLAN.md)（**不是**本節所否決的會議錄製）。
- **瀏覽器多路視訊合成進大螢幕**（監視牆／主講+小格／多來源 canvas 併一路 program 再 fanout）。大螢幕維持**單主畫面切台**；多人開口靠**在場聲混音**，不是烤臉進節目。見 §9.8。
- 複製大廳可行走地圖當 `/room`；把包廂做成可通關 JRPG 或點歌／歌詞／評分 KTV 機台。**禁止**用內景家具熱點（門／架／椅）當成員／檔案／請人的**主**導航。
- 為包廂開局另鑄 `invite.compose`、把在場者 `replaceState` 去 `/s/` 或另一張遊戲 `/i/`。用主持螢幕／畫布 `captureStream` 當「一起玩」（那是看片，別人沒有操作權）。第一刀不做局中換席、開局後等人補位。
- 以瀏覽器 Fullscreen／iOS `<video>` 全螢幕當劇院態的唯一殼（殼 overlay／麥／成員會沒了；開局畫布必須留在文件）。
- 經 **Platform** 第二輪 O／A／renegotiation；Platform 或第三方 **SFU 中繼 RTP**。
- 完整 BitTorrent swarm（下載者當種子、infohash 產品面）；為 mesh 邊預留無上限 video m-line。
- 雲端片庫、VOD、把收看「存成影片」；AirDrop／Nearby／系統隔空投送當產品路徑。**主持私有 OPFS 不是雲端片庫**（本機 origin 私有；不跨裝置同步、不上 Platform）。
- 給 Guest 做私有 OPFS 片庫；把私有列 fanout 給在場；猜 id／HTTP 可拉私有 bytes。
- 上大螢幕時自動把私有檔掛進分享目錄；用「大螢幕播放中」冒充可下載列。
- 以再開一個 `/room` 當「連上既有這一間」（`/room` 不是房號）。
- 同時收兩路**在場**視訊拼成格子牆（節目＋在場是兩層槽，不是兩張臉）。同一人同時開鏡頭又開畫面分享；4K／跨網電影院承諾。
- 用 DataChannel／每人本機 seek **當作包廂大螢幕**的傳輸；用節目 RTP／`captureStream` **代替**個人下載或私下播檔。
- 主持為「放到大螢幕上」先把別人的檔 `request` 到自己再播；為任意 MIME 承諾「瀏覽器能開就能上大螢幕」（無來源端可 capture 的表面則不上；PDF／office 等另刀，見 §5.7）。
- **Live 收看不得**為通過而組整檔 `Blob`／MSE（live 走 RTP）。**目錄檔（下載／檢視／私下播）**前端一律 **`/room-file/<id>`**；SW 回標準 `Response`（可 Range）。本機掛檔 SW 直出、不經 DC；遠端每 HTTP＝一 transfer，完成＝SW 交完該 body。播放／檢視 RAM 有頂（滑動窗口）、**不以整檔大小拒絕**。關播放器／關預覽／下載結束即取消對應 fetch（遠端則收尾對應 transfer）。私下播**不用 MediaSource／mp4box**。**禁止**頁內組整檔 `Blob`／`blob:` 當目錄檔存取協定（Safari 無 Save picker 時，僅在 `fetch(/room-file/…)` **收完後**用 `blob:` 橋 OS 存檔除外）。見 §8.2。
- **分享目錄傳檔不得**用 OPFS、IndexedDB、Cache Storage 當**傳輸緩衝或落盤**（SW **亦不得** `Cache.put` 整檔）。**例外（硬）：** 僅 Host **私有檔區**可用 OPFS 存片庫（§5.5.1／§8.3）；私有路徑**禁止**當遠端 transfer 緩衝。
- **包廂傳檔不得**掛資料夾／子目錄（沒有 dir 列、沒有「選資料夾」）。一次可多選檔。私有區同樣**只掛檔、不掛資料夾**。
- **包廂傳檔不得**把整份檔讀進 RAM（分享者 `arrayBuffer()` 整檔、收方組 `Blob`／`blob:` URL 再假下載）。SW 串流 `Response`／`ReadableStream` **允許**（邊收邊吐，不組整檔）。匯入私有區＝寫入 OPFS（可串流 copy），**不是**分享傳檔緩衝。

---

## 4. 原則（硬）

1. **能力開放** — 包廂是連線容器，不是單一 app。階段只約束**何時交貨**，不約束**永遠不能做什麼**（除非 §3）。
2. **殼擁有 UI** — 不是一顆 `kind: tool` SAM；**進門**不 materialize FileMap／畫布。主持在大螢幕上開局時才在**大螢幕槽**掛那一顆 SAM（§5.9）；包廂 chrome（頂列／三區／底列）仍屬殼。
3. **薄 signaling** — Platform 只做 Invite／join／**進門一次** O／A（DEC-045）。Guest↔Host 那條已連則重用（鏡頭／節目 `replaceTrack`）。**禁止**經 Platform renegotiation。Mesh 邊的後續 O／A 走主持 DataChannel（§7.4），不是 Platform。
4. **第一次 SDP 就為兩層媒體留門** — 包廂 peer 在 `createOffer` 前加上 **2 audio + 2 video** transceiver（在場＋節目；軌可空；順序見 §7.1）。Phase 1 **不**開相機、**不**送 RTP；後期 `replaceTrack` 不必第二輪 Platform O／A。**禁止**之後用 1+1 再經 Platform 補 m-line。Signal 交換用 **`av1`（原始 SDP）**，不可壓成遊戲用的 `dc1`（只重建 DataChannel）——否則對端 `setRemoteDescription` 的 m-line 對不上，Guest 會看到「連線失敗」。
5. **連線遊戲只走包廂（硬）** — **所有連線遊戲**只能 `invite.room`（`play`／`go` 皆 Booth Hub；Guest 握手經 BoothAnchor）。**禁止**新產品面鑄 `invite.compose` 拉人連線對弈。包廂 `invite.room` **不**因 Host `turn_prefer` 自動改成 relay-only（見 §7.3）。SDP **2+2**（在場＋節目）；**不要**把已廢 compose DC-only 握手混進包廂。
6. **兩個時鐘** — 短鏈 TTL（預設 5m）＝**這一張門牌**還能不能請新人，**不是**包廂租期。已入座且**不斷線**不受門牌過期影響。包廂散場＝主持離開 `/room`（結束／回大廳／關分頁／重整）→ 關 PC、丟時間線與**分享**目錄、停進行中的拉流。**主持私有 OPFS 片庫不因散場自動清空**（可明示刪／清空）。Guest「離開」只斷自己。
7. **go ⊂ play（wire）** — 文字重用 `session_chat`；檔案新獨立 `type` 放共用 roster 模組。Play 可晚掛 UI。
8. **同時一 SAM 仍成立** — 包廂進門不是 SAM。**在大螢幕上開局**＝這一間的那一顆 SAM（畫布在大螢幕槽；Guest 網址仍是包廂 `/i/`）。進 **單機 `/s/`**＝離開連線語境（破壞性，頁內確認）。**禁止**包廂裡再嵌第二顆小品；**禁止** `invite.compose` 第二條連線路徑。
9. **進門即這一間** — 已登入開 `/room` 就是包廂主面。**沒按「請人進來」就不鑄 Invite、不倒數。** **禁止**用「尚未邀請」另做一套非包廂畫面當主流程；也禁止進門自動鑄門牌，讓 TTL 變成「房間快到期」的氛圍。
10. **不鎖雙人入座** — Hub **串行**接每位 Guest 的 roster 握手（經 Anchor push；**禁止** Invite DO long poll answer loop）。文字／**分享目錄** fanout；內容按 `request` 路由。函式名勿叫 `sendToOpponent`。**鏡頭不因人數開關。**
11. **主面＝主視訊區；分享面＝邀請** — 主面回答「大螢幕上是什麼／誰在這一間」。QR／TTL／再發一張只出現在「請人進來」分享面（寬屏成員區最多門牌**小狀態**，不常駐大 QR）。**禁止**把時間線當主欄。殼頂列對齊對弈：**可 overlay 收起**。看電影／live／（日後）開局可走**劇院態**（使用者隱藏控制面板才滿窗，**禁止**一播放就進）：主視訊滿窗；叫出控制＝回廳態（§5.8）。
12. **第二台掃門牌** — 連上既有這一間的唯一辦法是掃（或開）**這一張** `/i/<short>`。已登入會員在另一台開 `/room`＝新的空一間。分享面必須寫這句，避免自己連自己連不上。
13. **說／掛／要分開** — **說**＝開口為主、文字為輔（文字不承載檔 bytes）。分享目錄不是大螢幕本體。大螢幕 RTP **不**做成時間線氣泡。要＝同源 HTTP 拉**分享**目錄檔；私下播檔不佔節目槽。**私有 ≠ 掛**；上大螢幕 ≠ 掛。
14. **主持＝進門與轉送樞紐（Hub）；檔可直連繞過** — Platform 只握手 Guest↔Host。文字、**分享**目錄 metadata／控制面由主持轉送。**音視訊 RTP 一律經主持轉**（節目／在場；在場聲須混音，§9.8）。Guest↔Guest mesh：在線 Guest **變動時** Host `hello` 介紹，雙方**立刻**試建 PC（O／A 經 Host DC 轉、**不**經 Platform）；**失敗不再對同一 peerId 重試**。**禁止**傳檔當下才 dial。**檔 bytes：** 已有直連 DC → Owner 直送；否則 star。Host 自己是其中一方時進門 PC 已是一跳。
15. **鏡頭預設關、不自動錄製** — 進包廂不開相機／麥；**不**進門即錄。主持須明示才對指定 live 錄影（見 [PG-GO-ROOM-RECORD-PLAN.md](./PG-GO-ROOM-RECORD-PLAN.md)）。掛上的媒體與檔只在這一間還開著時存在於在場裝置之間（**私有 OPFS 除外**：本機片庫可跨場次）。
16. **內容按需拉；房級大螢幕例外（硬）** — **分享**目錄檔 bytes、在場**影像**：**禁止**在沒有該 peer 的 `request`（由索取端 HTTP／SW 觸發）時送。Host 只轉給請求者。不做格子牆。每人最多一條出站在場 live。目錄「要」走同源 HTTP 門面＋DC，不佔節目槽。**房級：** 在場自動收**節目**（大螢幕）與（開麥者的）**在場聲**——進門即對節目／在場音 `request`；**不**自動 `request` 在場視訊、**不**自動開相機。在場聲在星狀下＝Host 混音後的那一軌（§9.8）。收看端 **PC 一建立就綁節目 `<video>`**（大螢幕槽）；沒訊號／開局時可藏視覺、**不要** `display:none` 以免解碼停。人數不是鏡頭開關。**私有檔 bytes 永不因 request 出 Host。**
17. **索取端不發明文檔案協定（硬）** — UI／媒體／落盤只對 **`/room-file/<id>`**（**分享**目錄）做 HTTP（本機／遠端同一形）。頁面不得把 `session_file` chunk 當「產品協定」直接餵給 `<img>`／`<video>`／下載鍵；也不得為目錄檔另開 object URL。wire 的 `session_file` 只服務**遠端**運輸。**遠端：** 每一筆 HTTP ↔ 一條 `transferId`；SW 交完該 response 後 transfer 才完成。**本機分享掛檔：** SW 直出 `File`，不經 DC。**私有檔：** Host 本機讀 OPFS 供 cast／本機預覽；**禁止**註冊進 `/room-file/` 讓遠端可索取。
18. **私有與分享分離（硬）** — 主持私有區與分享目錄是兩份清單、兩套 id 命名空間。私有不 fanout；上大螢幕只送 RTP；分享須顯式掛上。見 §5.5.1。

---

## 5. 產品形狀與用語

### 5.1 空間

```text
大廳 `/`  ──熱點「包廂」──►  `/room`（已登入＝這一間主面；可請人進來）
Guest 掃碼 `/i/<short>`  ──kind=invite.room──►  同意 → 同一包廂主面（**網址仍 /i/**）
深鏈 `/s/`／遊戲 `/i/`  ──bypass──►  不經包廂
```

進 `/room` 後大廳 canvas **卸載**（對齊 `/s/`、`/i/`：殼是大廳）。包廂是**獨立殼面**：大螢幕槽＋成員／檔案／文字，**不是**第二個可行走大廳，也不是把表單硬套進 pixel 內景就算完。見 §5.8。

大廳熱點：讀者面 **包廂**（門／隔間入口，不是大廳正中「公開聊天區」）。契約 `hotspotId`＝`room`；大廳畫成南向包廂門。見 [PG-GO-SHOP-LOBBY-PLAN.md](./PG-GO-SHOP-LOBBY-PLAN.md)。

### 5.2 用語（硬）

| 用 | 不用 |
| --- | --- |
| 包廂、進包廂、請人進來、**結束這一間**（主持）、**離開這一間**（Guest）、再發一張邀請、分享區、分享目錄、**私有**／**私有檔**（僅主持）、掛上、**掛到分享**、下載、檢視、收看、收聽、撤回、**包廂大螢幕**、**放到大螢幕上**、**從大螢幕拿掉**、**沒訊號**、**私下播放**、**玩遊戲**、**結束這一局**、成員、檔案、文字 | 聊天區、聊天室、房間、Room、Lounge、Lobby（對讀者）；「先邀請才能進包廂」；附加檔、傳給對方、接收附件；Guest 說「結束這一間」；把時間線叫主畫面；把包廂開局叫「邀請對弈」（那是 GO-INVITE）；**關機／關掉大螢幕／開機**（包廂大螢幕一直開著）；把私有叫雲端片庫／我的雲端；把上大螢幕說成已分享 |
| 鏡頭、麥克風、開口、收看、收聽、在場、分享目錄、私有檔、播放、導播／指定來源（對內） | 直播、推流、串流伺服器、視訊會議、開會（對讀者產品名）；把 RTP 叫成「傳檔」；把掛上說成已經送到對方；把鏡頭當成目錄裡的虛擬檔；把私下播叫成上大螢幕；把「看得到大螢幕」說成「拿到檔」 |
| 已連線、N 人在、就你、這一間還在、把這頁開著 | 直連、P2P、DataChannel、TURN、視訊會議 SaaS 腔；把**入座**說成只能兩人；**包廂倒數／房間即將過期／租期** |
| URL `/room`（與 `/help`／`/apps` 同：路徑英文、chrome 中文）；門牌／邀請（主持 UI 可說「門牌」） | 把 `/chat` 當產品 canonical；對 Guest／分享 title 說「門牌」當產品名 |

局內 overlay 仍叫 **對話**（[PG-GO-SESSION-CHAT-PLAN.md](./PG-GO-SESSION-CHAT-PLAN.md)），不要改名包廂。

### 5.3 三個動詞（硬）

| 動詞 | 讀者面 | 傳輸 | 階段 |
| --- | --- | --- | --- |
| **說** | **開口**（麥）為主；**文字**＝三區之一（不方便開口時） | 在場音 RTP（房級自動收）；文字 `session_chat` fanout | 文字＝Phase 1 wire；開口／房級聲＝媒體階段 |
| **掛** | 把**檔**寫進**分享目錄**（授權；不傳內容；**不掛資料夾**）。含「從私有**掛到分享**」 | 目錄 metadata fanout | 檔＝Phase 1；SDP 現在就要；私有→分享＝**2g** |
| **要** | 依型別：**下載**、**檢視**、**私下播放**（影音檔，我這台）——**僅分享目錄** | 索取端＝同源 HTTP；SW 門面；bytes＝`session_file` DC（**有既成 mesh 則直送**；否則 star；**不**在「要」時建邊） | 下載＝Phase 1；檢視／私下播＝Phase 2；mesh＝**1c**；**門面統一＝契約現在凍** |

**放到大螢幕上**不是「要」目錄檔：那是主持指定大螢幕來源，走**節目 RTP**（§5.7）。來源可以是分享目錄上的檔，也可以是**主持私有檔**——後者**仍不是**「要」、也**不**因此變成分享。讀者面不要出現「要」這個字當按鈕——列上寫下載／檢視／播放；大螢幕相關寫放到大螢幕上／從大螢幕拿掉／大螢幕上是…／沒訊號。**包廂大螢幕一直開著**；沒來源＝沒輸入（雪花），不是電源關了。放到大螢幕上不必先開機。

**私下播放／檢視／下載**＝對**分享**檔的同源 URL 發 HTTP（可 Range），邊收邊用；**不是** WebRTC 節目、**不是**包廂大螢幕、也**不是**先把整檔緩進分頁。見 §8.2。**不要**把鏡頭掛進目錄。**私有檔**無「要」；Host 本機預覽私有不算私下播分享檔。

### 5.4 兩種在場（硬）

| 故事 | 主持／Hub | 進門節點 | 快樂路徑 |
| --- | --- | --- | --- |
| **請人進來** | 筆電（或一直開著的那台）`/room` 或 Daemon Hub | **Guest**（別人掃 QR） | 一起看大螢幕、開口、傳檔、私下播 |
| **自己的另一台** | 通常是插電、畫面不關的那台（常當大螢幕來源） | **Guest**（**同一人**掃**這一張**門牌；不必登入） | 手機當座位收大螢幕、丟相片、私下播／下載；舊手機掛鏡頭給主持切上大螢幕 |
| **外出單機（Owner）** | 家裡 Daemon Hub 常駐（或 Embedded 長開） | **Operator**（`operatorCap`；`/room/remote`；`members` 中 `kind: operator`） | 看 Peer／Guest 鏡頭、開自己的鏡頭／麥、切台、開局；**一條連線**；見 ENGINE §8.1c |

三者（Guest／Peer／Operator）在拓樸上皆為 **Hub Roster 節點**（各一 `peerId`）；差別在 **進門憑證**與 **預設能力**（ENGINE §6.2）。**Peer**（`peerCap`）用於 headless 鏡頭／掛檔，可與上表並存。

**Guest 進門**走同一條 `invite.room` 門牌，**不做**「我的裝置」帳號綁定或第二套邀請。第三人（再掃一台傳檔、再掛一路鏡頭）**不**關掉已掛的鏡頭。

**硬：** 第二台裝置若要 **Guest 節點**＝**掃門牌**進來。已登入會員在手機再開 `/room` Embedded＝**本頁另一間空包廂**（**不**從瀏覽器連本機常駐 daemon），連不上「掃門牌那一間」的 Guest 語意。主持／Owner 外出單機＝**Operator 節點**（不掃門牌）。想用手機當屋子、筆電當客人：在手機登入開 `/room`，筆電掃碼（Guest）。

### 5.5 預設分享模型（硬）

分享＝授權，不是推送。分享目錄是這一間願意分享的**檔**的清單：掛上去的只有本機**檔**。**不掛資料夾。裝置不是目錄項。** Live（鏡頭／畫面／可含聲音）標在在場名單上。實作上**內容永遠按需拉**。**主持私有檔不是分享目錄的一部分**（§5.5.1）。

```text
參與者掛上檔（含「從私有掛到分享」）
        ↓
分享目錄 fanout 到在場所有人（僅 metadata；平面檔列表）
        ↓
某人對某一檔選擇下載／檢視／私下播放；主持可把**任一在座掛的分享檔**（含別人的）、**主持私有檔**、或某 live **放到大螢幕上**
        ↓
分享檔 → 向該項 owner request → 只對這條連線送 bytes（「要」）或 RTP（大螢幕）
私有檔上大螢幕 → Host 本機渲染 → 節目 RTP（**零**分享 metadata、**零** `/room-file`）
```

| 項 | 規格 |
| --- | --- |
| **目錄** | 所有人掛上的**檔**合成一份清單。晚進門拿快照。**不含**鏡頭、**不含**資料夾、**不含**主持私有檔 |
| **掛** | Owner 取得本機讀取授權（`File` handle）或從私有掛出。**不**讀檔內容。**沒有**目錄 handle |
| **Live（在場）** | 開鏡頭或畫面＝在場名單標示。`getUserMedia` 與 `getDisplayMedia` 互斥，合成**一條**在場 live（可含聲音）。**影像**未 `request` 不送 RTP。**在場聲**見房級規則 |
| **消費依型別** | 一般檔→下載；圖片→檢視、下載；**影音檔→私下播放與下載**。索取端一律對該檔同源 URL 發 HTTP（§8.2）。**上大螢幕**＝主持指定 `file { owner, id, scope? }` 或 peer live（節目 RTP），**不是**目錄上的「播放／檢視」；可指定**別人掛的分享檔**或**自己的私有檔** |
| **傳輸槽** | SDP **在場**＝開口／可被指定上大螢幕的 live；**節目**＝**房級大螢幕** |
| **預設故事** | 請人進來一起看 MTV；或同一人的不同裝置（筆電當大螢幕來源、手機當座位）；主持把別人掛的片子／圖切上大螢幕；主持用私有片庫播給全場看但**不**開放下載 |
| **要** | **僅分享**目錄內容：請求者主動 `request`。沒 request 的人零**檔 bytes**。私有檔不可「要」 |
| **房級規則** | **在場自動收節目（大螢幕）與開麥者的在場聲。不自動收在場影像、不自動開相機。** 見 §9.8 |

**不做格子牆。** 大螢幕同時一路（再指定＝切台）。在場影像要換上大螢幕＝主持切來源，不是每人點收看拼牆、**不是**多路視訊合成。節目 `<video>` 在進門 PC 建立後就綁上遠端節目軌。**私下播放不影響大螢幕、不佔節目槽。** 多人開口＝在場聲混音（§9.8.1），不是畫面併播。

Wire：目錄 metadata 走 `session_file`（**只掛檔**；**僅分享**）。在場 live 控制走 `session_camera`／`session_mic`。大螢幕控制走 `session_cast`（指定片子／圖／音／live；**不**載檔 bytes；私有檔帶 `scope: "private"`）。開局控制走 `session_play`。影音檔**私下播放**、圖片**檢視**、**下載**前端一律 `/room-file/<id>`（**僅分享**）；本機掛檔 SW 直出，遠端才走 `session_file` chunk（不是節目 RTP）。遠端若送來 `kind:dir`（舊客戶端），本機**不列、不 request**。

### 5.5.1 主持私有檔（硬；契約凍；Phase **2g** 已落地）

**產品句：** 包廂擁有者有一份**掛在 Hub 上的本機片庫**（像 private drive）；跟這一間的**分享目錄**分開。可以播上大螢幕給在場看／聽，**不**等於授權別人下載或私下播。要分享＝顯式**掛到分享**。外出可經 **Operator** 讀寫同一份片庫（ENGINE §7.6）；**不是**雲端備份。

| 項 | 規格 |
| --- | --- |
| **誰** | **Owner**（主持 Shell 或 Operator Shell；同一帳號）。Guest **無**私有區 |
| **儲存** | **Hub 本機**（Embedded：**OPFS**；daemon：`~/.pg-booth/private/`）。**不是** Platform／R2；**不是**Operator 裝置上的第二份片庫 |
| **壽命** | **跨 Hub session 常駐**（Engine 散場語意見 ENGINE §9；Embedded 關分頁＝Hub 停則跟著語意）。使用者可刪單檔或清空 |
| **清單** | 僅 **Owner Shell** UI 可見（`/room` 或 `/room/remote`）。**禁止** `session_file` fanout 私有 metadata |
| **id 命名空間** | 與分享目錄 **分開**（例：私有 id 永不註冊進 `/room-file/` registry）。**禁止** Guest 猜 id 經 HTTP／DC 拉到 bytes |
| **匯入** | 檔選取／drop → 寫入 **Hub** 私有庫（可串流 copy；Embedded 直寫 OPFS；Operator 經 Owner file channel）。**不掛資料夾**。匯入 ≠ 掛上分享 |
| **遠端讀寫** | Operator：`booth.state.snapshot.privateFiles` + §7.6 Owner file channel。**不是**跨裝置雲同步；是連回自己家 Hub |
| **本機預覽** | Owner 可在檔案區預覽私有影音／圖（Hub 本機讀取或 Operator 經 fetch chunk）。**不是**分享區的「私下播放」動詞（無 `/room-file`） |
| **放到大螢幕上** | `session_cast.offer` 帶 `scope: "private"`（owner＝host）。**Hub** 本機從私有庫解碼 → `captureStream` → 節目 RTP。在場只收 RTP。**禁止**因此寫入分享目錄、**禁止**出現可下載列 |
| **掛到分享** | 顯式動作：私有 → 寫進分享目錄（新分享 id＋metadata fanout）。之後適用現行掛／要／`/room-file`。可保留私有副本或只掛一份——產品可選；契約要求**分享列出現前**別人零 bytes |
| **誠實邊界** | 上大螢幕＝別人看得到／聽得到那一路；防的是**檔案取得**，不是防內容被感知或外錄（與播分享檔相同） |

```text
匯入私有（→ Hub） ──► Owner Shell 列（/room 或 /room/remote）
        │                ├─ 本機預覽（可）
        │                ├─ 放到大螢幕上 → 節目 RTP（在場收看；無「要」）
        │                └─ 掛到分享 → 分享目錄 fanout → 別人可「要」
        └─ 刪除／清空（明示）
```

**否決：** 推播大螢幕順便掛分享；私有列給 Guest 看；私有走 `/room-file/<id>`；用 OPFS 當分享傳檔緩衝；Guest 私有庫。

### 5.6 兩層螢幕（硬）

| | **包廂大螢幕** | **我這台裝置** |
| --- | --- | --- |
| 誰在看 | 在場都對準同一塊（進門即收節目；開局則同一顆畫布） | 只有我 |
| 誰決定 | 主持指定來源（§5.7）／開局席次（§5.9） | 我自己 |
| 傳輸 | 片子／圖／音／live＝**節目槽 RTP**；開局＝進門 PC 上的 SAM session | 掛＝分享目錄 metadata；下載／私下播／檢視＝同源 HTTP 門面＋`session_file` DC；主持私有＝本機 OPFS（可上大螢幕）；我的鏡頭／麥＝在場槽 |
| 時鐘 | 來源端播放器、靜態圖、或 live；收看端跟著 RTP 走（**不能**對有時長的片子／音獨立 seek）。開局＝該 SAM 的局時鐘 | 本機播放器自己 seek |
| 互斥 | 同時一個來源（含開局） | **不跟大螢幕互斥** |

大螢幕槽**只呈現當下那一路節目**（`<video>` 或開局畫布）。私下播放器、分享區、**主持私有區**、下載是這台裝置的 DOM chrome（檔案區／迷你列），**不要**再塞進大螢幕槽。

大螢幕上在放電影、投影圖、或開局時，我可以在手機另播一部、預覽下一部、或把檔掛上——只有我聽到／看到私下那路，不會變成全場大螢幕。主持用私有檔上大螢幕時，Guest 只見節目，**不見**私有列。

### 5.7 包廂大螢幕＝主持導播（硬）

這一間大螢幕狀態只有一份，例如：

```text
off                         // 沒輸入（大螢幕仍開；進門仍綁節目 video；畫面雪花）
file { owner, id, scope? }  // 持檔端本機渲染 → captureStream → 節目 RTP
                            // scope 缺省｜"share"＝分享目錄；"private"＝僅 Host 私有（owner 必須＝host）
peer { peerId }             // 該人當下的在場 live（鏡頭或畫面）→ Hub 送到每人節目槽
game { catalogId, seats[] } // 大螢幕槽掛該 SAM 畫布；席次＝指定入座的 peer（§5.9）
```

- **大螢幕一直開著。** `off`＝沒輸入（雪花），不是關電源。放到大螢幕上不必先開機。
- **只有主持能指定／切換來源。** 可指定自己或某位 Guest 的 live、**分享目錄上任一檔**（含別人掛的）、**自己的私有檔**、或開一局。被指定者不是新主持。
- **`file { owner, id, scope? }`（硬）：**
  1. 主持發 `session_cast.offer`（帶 `id`；`scope: "private"` 時 owner＝host；分享檔 owner 可由目錄 metadata 得知，可選帶 `fromPeer`）。
  2. **持有該檔的 peer（owner）**本機解碼／畫出 → `captureStream`（或等價）→ program `replaceTrack`。分享＝目錄 `File`；私有＝Host 讀 OPFS。
  3. 星狀下主持 Hub 把節目軌轉給其餘收看端（owner 自己是主持時＝本機產軌再 fanout）。
  4. **禁止**主持（或任一非 owner）為上大螢幕先 `request` 檔 bytes 再本機播。**禁止**用 DC＋每人獨立 `<video>`／`<img>` 冒充大螢幕。
  5. **`scope: "private"`：** **禁止** fanout 私有 metadata；**禁止** Guest 對該 id「要」；可選帶顯示用 `name`／`kind` 給槽外狀態——**不是**下載入口。
- **來源渲染（依型別；傳輸不變）：**

  | 呈現 | 來源端（owner） | 節目軌 | 時鐘／HUD |
  | --- | --- | --- | --- |
  | **video** | `<video>` → `captureStream` | 視＋可選音 | 播／停／seek＝**主持**遙控來源播放器；音量＝各端本機 |
  | **audio** | `<audio>` → capture；節目視可靜態／低幀封面（可選） | **音為主**；視可靜態 | 同左；**大螢幕槽改 audio player 面**（§5.7.1／**2h**） |
  | **image** | `<img>`／`drawImage` → `canvas.captureStream`（低幀或近靜態） | 視（靜態） | 無 seek；拿掉即可 |
  | **可預覽 doc**（延後） | 僅當來源端能穩定畫進可 capture 的表面（canvas 或暫時走畫面分享） | 同節目 RTP | **不**承諾任意 MIME；PDF／office 另刀 |

  產品句：**凡來源端能穩定畫進可 `captureStream` 的表面，就能上大螢幕**——不是「凡本機能開的檔，每人各開一份同步」。不能 capture → `session_cast.reject`＋頁內說明（對齊 iOS 不宜當電影來源）。
- **實作遞增：** 別人掛的 **video／audio／image** 已落地（圖＝canvas 靜態節目軌；無 seek HUD）；**音檔大螢幕 player 面＋節奏動畫＝2h 已落地**；doc／「任意可預覽」**不**堵遠端 cast。

#### 5.7.1 音檔上大螢幕＝audio player 面（硬；2h）

推播 **音樂／音檔**（`kind: audio`；分享或主持私有）時，**全場**大螢幕槽須呈現同一套 **audio player 面**——不是沒訊號雪花、不是黑屏、也不是只靠節目 `<video>` 空幀裝沒事。

| 項 | 規格 |
| --- | --- |
| **誰看見** | 在場全員（含晚進門）；進門即收節目音，槽內切成 player 面 |
| **時鐘／transport** | 播／停／**seek／快轉／倒帶**＝**僅主持**（`session_cast.state` 遙控 owner；對齊片子）。收看端（含非主持 Guest）**不可**獨立拖進度或改來源時鐘。想自己拖＝私下播／下載 |
| **音量** | 各端本機喇叭（HUD 喇叭／滑桿）；**不**遙控來源端、**不**走 `state` |
| **節奏／音量動畫（硬）** | player **上方或面內主視覺**須有依**音量或節奏**跳動的視覺化（bars／波形／等價）。驅動＝各端對**本機已收的節目音 sink** 做 `AnalyserNode`（或等價）本機繪製，跟「我聽得見的那一路」對齊。**禁止**每人另開檔／另走 `/room-file` 冒充大螢幕。**禁止**把跳動動畫編碼進節目視訊當**唯一**解（壓縮差、延遲大；owner 低幀封面可當備援靜態，跳動仍跟本機節目音） |
| **槽內無字** | 視覺化／player chrome **不算**違規疊字；**片名、沒訊號、人數**仍槽外狀態（對齊 §5.8） |
| **HUD** | 點主視訊展開半透明浮動控制（同 §10.5）：**僅主持**見播／停／進度／seek；全員見本機喇叭。系統全螢幕＝槽容器，**禁止** `<audio>`／`<video>` 原生播放器當產品面 |
| **切台** | 再指定影／圖／live／開局＝離開 player 面；`unoffer`＝沒訊號 |

**否決：** 收看端可 scrub 來源；用 DC／每人獨立 `<audio src=/room-file>` 同步冒充大螢幕；無跳動的空白大螢幕當音檔完成態；把開口混進節目音驅動視覺化。
- **會議式切台：** 主持把來源設成某 peer 的在場 live。大螢幕上是「現在這路」，不是格子牆、不是 speaker view 牆、**不是**多路視訊合成。
- **開局：** 大螢幕槽改掛 SAM；節目槽可 `unoffer`。**禁止**用 `captureStream` 主持畫面冒充一起玩。見 §5.9。
- 晚進門對準當下大螢幕（含進行中的局＝觀戰），不必再點「收看」。
- `session_cast` 的 `state`：主持遙控來源播放器（paused／t）；owner 回報進度（含 duration）給主持 HUD。片子／音的**畫面時鐘**仍是 RTP；靜態圖無播放頭。開局控制走 `session_play`（§7.2），不是 `session_cast` 載 bytes。
- 星狀下主持對每位 Guest 各送 program RTP（瀏覽器常每條 PC 各編一次）。人數軟頂 ≤6。**不是**雲端轉碼／片庫（主持私有 OPFS 是本機片庫，不是雲端）。
- **再指定＝切台：** 已有節目時再「放到大螢幕上」＝換來源，**不**把舊來源留在畫面上併播。多人開口不靠畫面合成，靠在場聲（§9.8）。

來源端 `captureStream` 快樂路徑＝桌機 **Chrome／Edge**（Chromium）。**Safari／WebKit**（含桌機）當**收看端**收 RTP 可以；當電影／音**片源**常缺 `HTMLMediaElement.captureStream`——reject＋頁內說明改 Chrome／Edge 掛檔或主持自掛（含私有庫）；**禁止** canvas-only 假片源（黑屏／卡死），**不要**為通過而把大螢幕改回 DC 播檔。

### 5.8 殼面：大螢幕槽＋三區（硬）

資訊架構固定四塊（邀請／確認／廣告／私下播是面，不是第五塊舞台）：

| 區 | 角色 |
| --- | --- |
| **大螢幕／主視訊區** | 主舞台。同一塊 slot：沒訊號也佔位；片子／圖／**音（audio player 面，§5.7.1）**／live＝節目 `<video>`（進門即綁，**不要** `display:none`）；開局＝同一塊掛 SAM 畫布。預設 **16:9**、`object-fit: contain`。**槽內禁止疊字**（片名、沒訊號、人數都在槽外狀態或 overlay；**音檔視覺化／player chrome 不算疊字**）。**不要**再把大廳 320×200 內景當頁面主內容、把節目縮成牆上小洞。 |
| **成員** | 在場名單（顯示名、主持標、麥／鏡頭點）。主持：請人進來、放到大螢幕上、**玩遊戲**。**不是**每人一格視訊牆。**指定入座＝開局**（§5.9；自動＋手動席已落地） |
| **檔案** | **分享**目錄：掛、下載、私下播／檢視；主持可把**別人掛的**影音／圖放到大螢幕上。**主持另有私有／分享分段**（§5.5.1；2g）：私有＝匯入／刪／推播／**掛到分享**；Guest 只見分享。私下播迷你列在本區，不佔大螢幕槽。 |
| **文字（UI：聊天）** | 開口備援。時間線＋輸入在**聊天** tab 內。**禁止**當進門英雄空態；**禁止** overlay 抽屜蓋住大螢幕當唯一入口。 |

pixel 畫風可留在**大螢幕外框／沒訊號雪花**；**禁止**行走、碰撞、重用 `GoShopLobby` 地圖。門／架／椅**不是**主導航（請人／檔案／成員走三區）。

清單永遠可及：canvas／畫布失敗、`prefers-reduced-motion`、讀屏 → 大螢幕仍是 DOM `<video>` 或可及的遊戲面，三區與開口仍可用。

Guest `/i/` 不經大廳；進主面須讀成「你在一間包廂」。可選極短 pixel wipe（不擋進門）。

**廣告版位：** DOM 同一 `GoAdSlot`，**浮在主視訊區內**（沒訊號／空槽時）。**節目串流（片子／live／日後開局）自動藏**——劇院態因此也不露。不佔流高度、不另掛 sticky 搶大螢幕。點進 `/s/` 若包廂仍 live → **頁內確認**（開局中須先結束這一局或一併說明散場）。遊戲 Invite 同意面與 **GO-INVITE 對弈中**仍不掛（見 [PG-GO-ADS-PLAN.md](./PG-GO-ADS-PLAN.md)）。內景後牆看板若還畫，純裝飾、不進熱點。浮動廣告是標籤版位，**不是**槽內節目字幕／沒訊號文案。

**兩種殼態（硬）：**

| 態 | 何時 | 主視訊 | 成員／檔案／聊天、dock、廣告 |
| --- | --- | --- | --- |
| **廳態** | 沒訊號、進門預設；未登入／connecting／ended **只廳態** | 直式／平板直式上 16:9；橫向窄屏左；橫向寬屏與右欄並排。`object-fit: contain`。槽內無字 | 文檔流：**成員／檔案／聊天** tab（堆疊下半；橫向窄屏右欄；寬屏右欄）。**dock**（麥／鏡頭／畫面／劇院／結束）在 tab **上方**。廣告浮在主視訊（沒訊號時） |
| **劇院態** | 使用者按「隱藏控制面板」。播放**不**自動進 | **應用內滿窗**（`100svh`；同一顆 `<video>`／開局畫布；`object-fit: contain`） | **不顯示** dock 與三 tab。**僅**主視訊。下拉／peek／Esc 叫出 playground 頂列 → **回廳態**（dock／tab 回來）。槽外狀態列**隱藏** |

- **禁止**用瀏覽器 Fullscreen API 當劇院態**唯一**手段。系統全螢幕可當加分（從廳態 TV HUD 進入）。
- 沒訊號不強迫回廳態。Esc／peek：**先關 overlay**；無 overlay 且已在劇院態 → **回廳態**（仍在包廂）。**禁止**劇院態 overlay dock／三 tab。
- 分享面、結束確認：暫停頂列自動收。**文字 composer focus 不得叫出 playground header。**
- 讀屏：滿窗仍是那顆 `<video>`／遊戲面；回廳態後 tab 標籤寫全名（成員／檔案／聊天）；熱區 ≥44px。

**RWD（mobile-first）：** 預設 CSS＝手機直式。**`roomShellMode` 與 CSS `@media` 皆以 viewport 為準**（`document.documentElement.clientWidth/Height`；實作常數見 `goRoom.ts` 的 `ROOM_SHELL_*`）。下列是**廳態**；劇院態見上表。

| 模式 | `roomShellMode` | 條件（硬；依序判定） | 廳態結構 |
| --- | --- | --- | --- |
| **直式堆疊** | `portrait` | ① `height ≥ width` 且 `width < 1024px`（手機直式）；**或** ② `height ≥ width` 且 `width ≥ 1024px`（**平板直式**——寬達桌機門檻仍上下分，**不**走右欄） | **上：** 主視訊 16:9。**下：** dock + **成員／檔案／聊天** tab（預設成員）。**禁止**三欄並排 |
| **橫向分欄** | `short-landscape` | `width > height` **且**（`height ≤ 560px` **或** `width < 1024px`） | 左大螢幕、右 dock + 三 tab（一次一區）。麥列在右欄頂。**涵蓋**手機橫屏（常 `width ≥ 1024` 但 `height ≤ 560`）與 split view／矮橫窗（`width < 1024` 且 `height > 560`） |
| **寬屏／桌機** | `desktop` | `width ≥ 1024px` **且** `width > height`（橫向寬屏；已排除上兩列） | 左大螢幕；右欄：dock 頂、**上半檔案**、**下半 tab 成員／聊天**。`width ≥ 1440px` 檔案與成員／聊天並排。門牌小狀態在成員區 |

**判定順序（硬，與 `roomShellMode()` 一致）：**

```text
1. width > height 且 (height ≤ 560 或 width < 1024) → short-landscape
2. height ≥ width 且 width ≥ 1024                  → portrait（平板直式）
3. width ≥ 1024 且 width > height                  → desktop
4. 其餘                                           → portrait（手機直式）
```

**`560px` 雙用途：** ① 上表 **OR** 分支之一（手機橫屏分欄）；② **僅**壓縮 playground 頂列／`.main` padding（`ROOM_SHORT_LANDSCAPE_MQ`；`styles.css` `.site:has(.room)`）——**不再**單獨決定「是否分欄」。

廳態 tab **不是**蓋滿大螢幕的 modal。劇院態不排 tab；叫出控制＝回廳態。首次空包廂（沒訊號）可在**成員區**顯示一次大螢幕操作 hint（`GO_ROOM_TV_HINT_*`）。

#### 5.8.1 RWD 邊界精修（2d+；**已落地**）

首版 **2d** 四斷點手測已過；下列為實作與 §5.8 表對齊時的**精修**（不改劇院態／頂列可收契約）：

| 項 | 問題 | 定案 |
| --- | --- | --- |
| **中等橫屏死區** | 現況：`landscape`＋`height > 560`＋`width < 1024` 誤落直式堆疊 | 併入 **橫向分欄**（上表 OR `width < 1024`） |
| **平板直式** | 現況：`width ≥ 1024` 一律右欄，直式 iPad Pro 右欄過擠 | **`height ≥ width` 且 `width ≥ 1024` → 直式堆疊**（上表②） |
| **手機橫屏** | 現況：僅 `height ≤ 560`；Pro 系橫向常 `width ≥ 1024` | 保留 **`height ≤ 560` OR**；與上列 OR 並存 |
| **TV HUD 極窄** | 廳態 HUD 單列不換行；~320px 槽寬時 seek 過窄 | `@container` 窄槽：隱藏次要 clock **或** transport 收成二級（仍 **禁止**整列換行） |
| **檔案 filter 直式** | 私有／分享＋四類 filter 吃光下半高度 | 窄直式：**水平捲動** segmented **或**「篩選」收合；預設 tab 仍 **成員** |
| **虛擬鍵盤** | `clientHeight` 驟變可能讓 `roomShellMode` 在邊界抖動 | 聊天 composer focus 期間可鎖 mode（`visualViewport`）；**不得**因此叫出 playground header |

**實作同步（硬）：** 改斷點須同改 `goRoom.ts`（`roomShellMode`／`roomShortLandscape`）、`GoRoomSurface.svelte`（`room--*` 與 `@media`）、`styles.css`（`.site:has(.room)`）；`goRoom.test.ts` 補邊界 case。`560`／`1024`／`1441` 常數與 CSS `64rem`／`90rem` 保持單一來源註解。

**頂列可收（硬）：** 對齊對弈（3s、下拉／peek）。請人在**成員區**；**結束／離開**在 **dock**（icon；`aria-label` 全名）。人數／大螢幕一句在**槽外狀態列**（**僅廳態**）。

### 5.9 大螢幕上開局（硬；契約凍；**第一刀已手測**）

契約凍（重用進門 PC、不鑄 `invite.compose`、Guest 留 `/i/`）。**第一刀：** `pg-gomoku` Host＋Guest 連線對弈至終局、結束這一局後可再開——手測通過。**redpick：** 四席入座／觀戰／`deal→end` domain 已綠。**多人傳檔：** Host＋≥2 Guest domain e2e 綠。Mesh 檔直連見 §7.4／**1c**（與開局無關）。

**實作計劃（索引）：** [PG-GO-ROOM-PLAY-PLAN.md](./PG-GO-ROOM-PLAY-PLAN.md)（`session_play`、席次、重用 peer、大螢幕掛 SAM、與 GO-INVITE 切界；Phase 0–5）。本節凍產品契約；落地步驟與模組邊界以該文件為準。

包廂已連則**重用進門 PC** 開 SAM session（Phase 3；DEC-045 重用）。**不必**再掃第二張門牌、**禁止**另鑄 `invite.compose`、**禁止** `replaceState` 成 `/s/<id>`。**連線對弈唯一路徑**＝先請人進包廂（`invite.room`），再 `session_play` 開局。

```text
主持 →「玩遊戲」→ 選 kind: game（第一刀：有明確席次者，如五子棋 2 席）
  → 指定入座：手動點成員，或「自動入座」
  → 席不滿：不開局；頁內說明還缺幾人（可請人進來）
  → 確認 → 在場載同一 SAM（local-first／既有離線包）
       指定 peer → 協議席（host／player／…）
       未入座 → 觀戰同一畫布；開口／檔案／文字照舊
  → 局中：大螢幕＝遊戲；成員標在玩／在看；頂列可收
  → 主持「結束這一局」（或 SAM 終局＋再來一局＝同批席）
       卸載畫布；包廂還在；大螢幕沒訊號（節目綁定不拆）
  →「結束這一間」＝連線＋局一起散（確認文案加上遊戲會停）
```

- **只有主持**能選遊戲、指定席、開／關局。Guest 不能在別人的包廂另開一局。
- **自動入座：**（1）主持佔 Host 席（若協議有）；（2）其餘席依**進門順序**填；（3）滿則停，多餘觀戰。同一人兩台＝兩個 peer；自動**不要**預設把手機＋筆電填成兩席（名單可提示；主持可改）。
- **手動：** 從成員把人指定到這一局的椅子；開局當下席必須滿。
- **第一刀不做**局中換席、開局後補位。晚進門只能觀戰，等下一局。
- 遊戲 SAM **忽略**閒置 2+2 A／V；**不要**因開局自動開相機。`avatar_relay` 等 session wire 僅在開局後需要時才掛。
- 單機小品「放到大螢幕上給大家看主持在玩」＝觀戰／另標，**不要**和「指定入座一起玩」混成同一顆按鈕。

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
未登入 `/room` → 仍是包廂殼（大螢幕沒訊號＋主 CTA「登入後開包廂」）（goAuth.login；不擋回大廳、不擋 `/s/`）
已登入 → **直接包廂主面**（大螢幕槽／這一間；門牌＝尚未發出，不倒數；文字在三區、窄屏預設成員）
  → openBooth：Hub **註冊 BoothAnchor + Engine WSS**（ENGINE §10；**必須**）
  →「請人進來」且尚無有效門牌：
       **若 Anchor 非 online/degraded → 頁內錯誤，不 mint**
       mintPlatformInvite({ kind: "invite.room", intent, targetField: goOrigin() })
       → 開 GoShareSheet（QR／複製／系統分享；url＝/i/<short>）
       → 分享面加一句：`另一台裝置請掃這張邀請進來，不要再開一間包廂。`
       → **不**啟動 Invite DO `signal/pending` answer loop；Guest offer 經 Anchor push 至 Hub（ENGINE §10.7）
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
  → join_cap → offer → **POST /v1/booth/join/offer**（Anchor 轉 Hub）→ answer → DataChannel
  → 包廂 UI（跳過 loading_sam；開局時才載該 SAM）；網址仍是 /i/<short>
  →「離開這一間」→ 頁內確認 → 只斷自己；主持與其他人還在；自己掛的項目 unshare
拒絕 → 不佔成功 handshake
```

現況 `guestRuntime.consentAndPlay` 無 `sam.source` 即失敗——包廂必須**分流**，不可走 compose 下載管線。Guest 認 `invite.room` **或** `intent.surface === "room"`（kind 可能被預設成 `signal.handshake`）。

同一短鏈在**門牌有效期間**可多人加入（對齊遊戲 Invite；Hub **串行** roster 握手，做完接下一個；**不**經 Invite DO long poll）。生命週期細節見 **§6.4**。

### 6.4 生命週期（兩個時鐘）（硬）

| 物件 | 活著的條件 | 死法 | 對人怎麼說 |
| --- | --- | --- | --- |
| **包廂** | 主持的 `/room` 這份文件還在（未關、未重整、未離開路由） | 主持按「結束這一間」、回大廳、關分頁、重整 | 「這一間」 |
| **門牌** | 這一張 `invite.room` 未過期、未撤銷，且 **Hub Anchor WSS 可接 join** | TTL 5 分鐘、再發一張時撤舊的、散場時撤、Anchor offline | 「邀請／門牌」 |
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

門牌從 `live` → `expired`：**不停**包廂、**不**改寫人數主狀態、**拒絕**新 Guest join（Hub 不再接受 `booth.join.offer`）、**禁止**繼續分享該 `shortUrl`。

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

現況 [`createRosterOffer`](../src/components/playgrounds/roster/rosterPeer.ts) 在 `media: "ready"` 時走 [`reserveBoothMediaTransceivers`](../src/components/playgrounds/roster/rosterPeer.ts)（**2 audio + 2 video**）。**連線遊戲**一律包廂 2+2；歷史 `invite.compose` DC-only **不再**作產品路徑。

包廂 `createOffer` 前，**順序凍結**（m-line 對不齊＝連線失敗）：

```ts
pc.addTransceiver("audio", { direction: "sendrecv" }); // 在場音（開口）
pc.addTransceiver("video", { direction: "sendrecv" }); // 在場視（鏡頭／畫面）
pc.addTransceiver("audio", { direction: "sendrecv" }); // 節目音（包廂大螢幕）
pc.addTransceiver("video", { direction: "sendrecv" }); // 節目視（包廂大螢幕）
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
| `session_file` | **用** | **分享**目錄（**檔** metadata）＋按需串流（見 §8.2）；**不是**聊天附件 push；**不是**未 request 就送 bytes；**不掛資料夾**；**不**承載 Host 私有列 |
| `session_occupancy` | **用** | 主持把在場名單 snapshot fanout（Hub 星狀；人數不以 mesh `hello` 為權威——mesh 可能建不起） |
| `session_mesh` | **用（1c）** | 主持轉送任兩 Guest 的 O／A／candidate；**不**經 Platform；**不**載檔 bytes／RTP。**在線 Guest 變動時** Host `hello`（既有人＋新人）；Guest **立刻**試建第二條 PC。失敗標該 peer 不再 dial。旗標：`GO_ROOM_MESH_ENABLED` |
| `session_cast` | 媒體階段 | **大螢幕控制面**（指定 `file { owner,id,scope? }`／peer live／沒訊號；可選 kind／name／paused／t 當標籤）；**不**承載檔 bytes；節目 RTP 走 Hub；owner≠主持時由持檔端產軌；`scope: "private"`＝Host OPFS |
| `session_play` | **已落地（第一刀）** | **開局控制面**（catalogId、席次 peerId、offer／end）；**不**經 Platform；不載 SAM bytes。見 [PG-GO-ROOM-PLAY-PLAN.md](./PG-GO-ROOM-PLAY-PLAN.md) |
| `session_camera` | Phase 2 | 鏡頭項：offer＝掛上；`request` 才送 RTP |
| `session_record` | 媒體階段 | **多路 live 錄影控制面**（主持指定 presence live → Hub 私有片庫）；**不**載 bytes。見 [PG-GO-ROOM-RECORD-PLAN.md](./PG-GO-ROOM-RECORD-PLAN.md)（**未落地**） |
| `session_ping` | 可選 | RTT 探測；對人可顯示「約 N ms」，不揭露路徑 |
| `avatar_relay` | 開局才用 | 進門不用。大螢幕上開局後才掛 session／SAM 需要的 relay |

**禁止**把檔案或聊天正文掛成 `avatar_relay.payload`。

### 7.3 ICE（包廂）

| Invite | ICE |
| --- | --- |
| **`invite.room`（唯一連線門）** | **預設 STUN／直連**（含區網 host／srflx）。**不**因 `turn_prefer` 自動 stamp relay-only、**不**因附上 TURN URL 就走現況 `iceTransportPolicy: "relay"` 那條**已廢 compose** 工廠 |
| ~~`invite.compose`~~ | **Superseded**（連線遊戲）；API 可暫留相容，**新產品勿用** |

理由：包廂傳檔與節目收看都以**同一網路或足夠直連**為快樂路徑；高碼率走官方 relay 會貴且易卡。包廂「已連線」測的是**這間包廂**，不是已廢 compose relay 政策。

跨網連不上：頁內錯誤／請靠近同一網路或請對方再試；**不**教 ICE。官方 TURN 作包廂「可 fallback、非 relay-only」是否開放，**另段**（牽涉點數與 `buildRosterRtcConfiguration`）；不阻塞 Phase 1。**不承諾**跨網高碼率電影。

對人只顯示：等待／已連線／已斷線／傳送中／收看中。人數與門牌 TTL **分開呈現**（見 §10）；不要用「邀請還有 N 分鐘」當包廂主狀態。

### 7.4 Hub 星狀＋Guest mesh（檔直連）

進門＝Platform 一次 O／A，得到 Guest↔Host 的 PC（2+2＋roster DC）。**節目／在場 RTP、文字、目錄控制面**走這條進門星。

**Mesh 建邊時機（硬）：** 跟**在線 Guest 名單變動**綁定，**不**跟傳檔綁定。

| 何時 | 做什麼 |
| --- | --- |
| Guest 進門（第一次有其他人） | Host 對新來者與每位既有 Guest 互發 `session_mesh.hello` → 各端**立刻**試建直連 |
| 之後又有 Guest 加入 | 同上：新人↔每位既有 Guest 各試一次 |
| Guest 離開 | Host `bye`；清該 peer 的 mesh／「已失敗」狀態 |
| 某人對某人 **ICE／DC 失敗** | 標該 `peerId` **不再重試**；之後與他之間的檔一律 star |
| 「要」檔／開 `transferId`／HTTP | **只讀** `hasDirect(owner|requester)`；**禁止**此時 `createOffer`／dial |

```text
Host ↔ 某人     進門 PC（控制面＋檔 star 備援＋在場／節目 RTP）
Guest ↔ Guest   名單變動時主動試 mesh；開成後該對「要」檔走直連 DC；失敗則該對永久 star（同場次）
```

```text
進門     Guest ── Invite O／A ── Host          ← 唯一經 Platform
mesh     名單變動 → Host hello → Guest A↔B 試 O／A（經 Host DC 轉）
檔 bytes A↔B 已有直連 DC → Owner ── mesh DC ── Requester   ← 不經 Host 組裝
         無直連（未成／曾失敗）→ Owner ── 進門 PC ── Host ── 進門 PC ── Requester
在場聲   多路上行麥 ── Host AudioContext 混音 ── 各 peer 一條 presence audio 出站
節目 RTP 一律經 Host 轉 track（1c 不改）
```

**在場聲（硬）：** 每 PC 一條 presence audio m-line。≥2 個開麥者時，Host **不得**只 `replaceTrack` 轉其中一軌假裝房級；須混音（見 §9.8）。單開麥者可仍單軌轉發。**節目視訊**仍轉 track，**不做**多路畫面合成。

**Mesh 邊（Phase 1c；檔優先）：**

| 項 | 規格 |
| --- | --- |
| **誰介紹** | Host：Guest 進門／離席觸發；`hello`／`bye`；轉 `offer`／`answer`／`candidate`／`fail` |
| **誰發起** | Guest 收到**新的** `hello` 後依 `shouldOfferMesh` 決定誰 offer（避免雙 offer）；**立刻** dial，不等傳檔 |
| **邊長什麼** | **DC-only**（`media: "none"`）。**1c 產品用途＝檔 bytes**。**禁止**在 mesh 上 `replaceTrack` 節目／在場；音視訊 RTP 一律經 Host 進門星 |
| **一次機會（硬）** | 同一場次、同一遠端 `peerId`：**最多試建一次**。`fail`／連不上／DC 未開成 → 記入「無 mesh」；**禁止**之後再 hello 觸發重試、**禁止**傳檔時補建。該 peer **離開再進**（新 `peerId`）＝新人，可再試一次 |
| **檔路由（硬）** | 某一 `transferId`：若 Owner↔Requester **當下已有** open mesh DC → chunk 走直連；**禁止**再經 Host 轉同一批 bytes。否則走 `goRoomFileStar`。路由＝查表，不是 dial |
| **控制面** | `share`／`request`／`reject`／`catalog` 等仍可經 Host fanout／轉送（目錄一致）；bytes 路徑獨立選直連或 star |
| **開成後又斷** | DC／PC 中途關掉：當下視為無直連、走 star；**不要**自動重撥同一 peer（與「一次機會」同） |
| **旗標** | `GO_ROOM_MESH_ENABLED`（打開＝Host 介紹＋Guest 主動建邊＋檔泵送偏好直連） |
| **不在 1c** | 節目／在場影像改走 mesh；在場聲改直連少混（另刀） |

```text
session_mesh.hello     { peerId }                 // 名單變動：介紹一位在線 Guest
session_mesh.bye       { peerId }
session_mesh.offer     { from, to, sdp }
session_mesh.answer    { from, to, sdp }
session_mesh.candidate { from, to, cand }
session_mesh.fail      { from, to }
```

Host **只轉**這些 JSON，不 `setRemoteDescription` 別人的 mesh SDP，也**不**當雲端 SFU。

人數軟頂：包廂規模（建議 ≤6 人）下星狀＋稀疏 mesh 可接受；**不要**做成無限 swarm。

**不像 WebTorrent 的部分（硬）：** 下載者不當種子；分頁不留可再分發的檔副本；無 magnet／infohash 產品面。仍是 Owner 持有 `File` handle，Requester 拉流——路徑可以是 mesh 或 Hub。音視訊 RTP：只對有 `request` 的那條連線出站，Host 轉給該請求者（1c 不變）。

---

## 8. 第一階段產品（文字＋傳檔）

### 8.1 文字（輔助面）

重用 `session_chat` wire／fanout／去重。包廂殼差異：

- 永遠自由文字（無 SAM `SessionChatHints`；無對弈 `active` 閘）
- **不是主面、不是全頁時間線。** 對齊視訊會議 chat：三區裡的**文字**（窄屏與大螢幕分時、寬屏右欄）。主高度讓給大螢幕。**禁止**用蓋滿大螢幕的 overlay 當唯一入口。
- 對「同包廂已連線 peer」**fanout**（一人在時送出可留本機；可加一句低調「對方還看不到——這間目前只有你」——**不要**因此把抽屜做成進門英雄）
- 快捷語可留少數（在嗎／等一下／收到／謝謝）；預設收起
- 單則上限可沿用 200 字；時間線記憶體上限建議 200 則
- 斷線清空；無雲端歷史
- Bubble 視覺可與 overlay 同族（本機右、遠端左；**顯示登入名**＋金色「主持」標記，名不是「主持」）
- 開口（麥）比打開文字更順手；權限拒或不能出聲才強調文字把手
- 空態不要寫「還沒有訊息。先打字也可以。」當主畫面；大螢幕沒訊號才是空態

### 8.2 傳檔（分享目錄＋同源靜態檔門面）

包廂傳檔**不是**訊息附件。對齊 §5.5：掛上＝授權，點「要」才拉。

#### 索取端契約（硬）

分享目錄裡**每一檔**，前端**一律**以同源 **`/room-file/<id>`** 存取（`id`＝目錄 file id）。對前端而言，SW＝標準 HTTP server：只回應進來的 HTTP request，**不**替 downloader／`<video>` 決定要發幾次 request。**禁止**目錄檔另走 `blob:`／`URL.createObjectURL(File)` 當產品 API，也**禁止**頁面因本機檔把 `fetch` 短路成直出 `File`（本機與遠端同一套 URL；本機優化只在 SW）。

```text
前端（本機或遠端檔同一套）
  fetch / <img> / <video> / 下載
       │  一律 GET／HEAD／Range  →  /room-file/<id>
       ▼
  SW（標準 HTTP server）
       │
       ├─ 本機有該 id 的 File handle ──► 直出 File（slice／串流；可 Range）
       │                                 **不**開 transfer、**不**經 DataChannel
       │
       └─ 否則（遠端檔）──────────────► 開 transferId → session_file（共用 DC）
                                          Owner slice → chunk → 編成此 Response
```

| 層 | 誰看得到 | 協定 |
| --- | --- | --- |
| **產品／頁面** | UI、媒體元件、`fetch` | **只**標準 HTTP。URL：**`/room-file/<id>`**。本機／遠端**同一形**；**幾次** roundtrip＝前端決定 |
| **HTTP 門面** | go **既有** Service Worker | 對**每一筆** request 回一筆 `200`／`206`／`404`／`416`／`405`；標準 header／串流 body；`Cache-Control: no-store` |
| **本機優化（硬）** | **只在 SW** | 該 id 是自己掛的 → SW 從本機 `File` 滿足 response（slice／Blob／Range）；**零** `session_file`／**零** DataChannel bytes。**頁面不得**因本機檔改走 object URL、直讀 `File`、或頁內組 `Response` 當第二套存取 |
| **遠端運輸** | peer 之間（直連優先／Host star） | 共用實體 DC（mesh 或進門）；每筆 HTTP roundtrip 一條虛擬 connection（`transferId`）。**不是**把 HTTP 幀原樣塞進 DC |

**驗收語意：** 存取分享目錄檔 ≡ 存取同源靜態檔——一律 `/room-file/<id>`；每一次 HTTP 呼叫都是完整 roundtrip。本機掛檔與遠端檔對前端無第二套 URL。

#### HTTP roundtrip ↔ transfer（硬；遠端隧道）

產品動作（點下載、開預覽、開 `<video>`）**不**直接等於一條 transfer。權威單位是 **HTTP request–response**。**本機優化路徑不開 transfer**（仍是完整 HTTP roundtrip，由 SW 直出）。

**遠端檔：**

```text
client 發出一筆 HTTP request（GET／HEAD／Range）→ /room-file/<id>
  → SW 確認非本機 File → **SW 分配** transferId（虛擬 connection；共用同一條 DC）
  → SW 讀 request 的 `?purpose=`（Page 給的 priority 提示）→ `open-transfer`（id／transferId／offset／end；purpose＝回傳該 request 上的值）
  → 頁面只發 session_file.request（**不得**自造 transferId）；Owner 依該 transfer 泵 chunk
  → SW 把宣告範圍的 bytes 完整交給此 response 的 body（或 client abort／錯誤結束）
  → SW → 頁面 `transfer-complete`／`transfer-abort`
  → 該 HTTP roundtrip 結束 ⟺ 該 transfer 結束
```

**本機掛檔：**

```text
client 同一形 HTTP request → /room-file/<id>
  → SW 有本機 File → 直接 Response（含 Range）；不 request、不 chunk、不 done
  → body 交完即 roundtrip 結束（無 transfer 生命週期）
```

| 規則 | 契約 |
| --- | --- |
| **統一 URL** | 目錄檔前端**只**用 `/room-file/<id>`。**禁止**本機改走 object URL／遠端改走明文 DC API |
| **誰開 roundtrip** | 前端 downloader／`<img>`／`<video>`／`<audio>`／`fetch`。SW **不**發明 request 次數 |
| **本機** | SW 依本機 `File` 優化；**不經 DataChannel**；不開 `transferId` |
| **遠端 1:1** | **一筆** HTTP request–response ↔ **一條** `transferId`（**SW 分配**；頁面只 `request`）。同檔多筆 HTTP（例：媒體雙 Range）＝多條 transfer |
| **誰開 transfer** | **SW**（對應該筆 HTTP）。產品 UI／`play`／`download`／seek 只轉成 HTTP；**禁止**頁面 `newId()` 開 transfer |
| **遠端完成權威** | **SW 確認已把本 response 依宣告長度交給 HTTP client** 後，對頁面 `transfer-complete`（或 `transfer-abort`）；該 transfer 才終態。Owner `done`＝源端泵完，**不得**單獨標成功 |
| **失敗／取消** | abort／湊不齊／`reject`／離席 → 結束該 HTTP 並（若有）`cancel` transfer；**不得**「DC 已 done、HTTP 長度不對」仍當成功 |
| **禁止** | file-level 常駐 DC 池與 HTTP 脫鉤；前端為本機檔另開 object URL 產品路徑 |

用語：**隧道／虛擬 connection**＝遠端每 HTTP roundtrip 一條 transfer、共用 DC。**不是**把 HTTP 幀原樣封進 DataChannel。本機直出是同一 HTTP 門面上的優化，不是第二套協定。

#### 流程

1. 要分享的人把檔 **選進、drop 進分享區**（可多選）。**不掛資料夾**：沒有「選資料夾」、不建 dir 列。Drop 進來若瀏覽器交出其中的 `File`，當**獨立檔**掛上。瀏覽器此時只取得這個 session 讀那些檔的授權（`File` handle 留在分享者分頁）；**不**讀內容、**不**發給任何人。
2. 其他人在分享區只看到**檔**（檔名、大小、誰掛的）與可導向的同源 URL。晚進門的人拿到**當時目錄快照**，仍無內容（無 HTTP 請求＝零 bytes）。
3. 有人**要**該檔（下載／檢視／私下播）：頁面／媒體對 **`/room-file/<id>`** 發 **一筆或多筆** HTTP（次數由前端決定）。**本機掛檔：** SW 直出 `File`，不經 DC。**遠端檔：** 每一筆由 SW 開對應 `transferId` → `session_file.request`；持檔端泵該 transfer；SW 編成**該筆** Response；body 交完（或 abort）才收尾該 transfer。
4. 遠端傳輸點對點、**不**經 Platform／R2。**路徑：** 索檔端↔持檔端有 mesh DC → 直連；否則經 Host 星狀（Owner↔Host↔Requester；Host 自己是其中一方時進門 PC 已是一跳）。Host 若不是其中一方且無直連，只轉控制面／轉幀，**不**組裝。本機優化路徑不進 Hub／mesh。

對讀者可寫：**檔案還在分享者這台裝置上。你這台像開網頁上的檔一樣存取；點下載才會存到你選的位置（或瀏覽器另存）。關包廂，目錄就沒了；已存到你硬碟的檔不受影響。**

**收看 live ≠ 下載 ≠ 私下播放／檢視 ≠ 包廂大螢幕（硬）：** 產品動詞仍分開（落盤／當場看／大螢幕導播）。**傳輸門面**上，下載／檢視／私下播**同一套**同源 HTTP server（SW）；live／大螢幕仍走 RTP。**放到大螢幕上**走 §5.7／§9 節目 RTP，**禁止**用每人獨立 HTTP 預覽冒充大螢幕。

**不掛資料夾（硬）：** 產品面只有檔。禁止 `<input webkitdirectory>`、`showDirectoryPicker()` 當掛上路徑。遠端若送來 `kind:dir`，忽略、不列、不對資料夾本身 `request`。

#### 硬否決（實作／測試都要卡住）

| 否決 | 原因 |
| --- | --- |
| 索取端為下載／檢視／播另發明文協定（頁面直吞 DC chunk 當產品 API） | 破壞「像同源靜態檔」；媒體／下載應只講 HTTP |
| 頁內組整檔 `Blob`／`blob:`／`URL.createObjectURL(File)` 當目錄檔下載／預覽／解碼**協定**（取代 HTTP） | 整檔進 RAM；下載變成「先暫存再另存」。例外：Safari 無 Save picker 時，**僅在** `fetch(/room-file/…)` body 收完後用 `blob:` 橋 OS 存檔 |
| OPFS／IndexedDB／Cache Storage 當**分享傳檔**緩衝或落盤；SW `Cache.put` 整檔 | 不是使用者選的分享路徑；也不是串流門面。**Host 私有片庫用 OPFS 見 §8.3** |
| 分享者 `file.arrayBuffer()`（或一次讀完整份） | 整檔進 RAM |
| 一人「要」就把 bytes fanout 給所有人 | 沒發 HTTP／沒 request 的人被塞檔 |
| 掛資料夾／子目錄（dir 列、選資料夾、整夾 metadata 樹） | 契約只掛檔；一次可多選檔 |
| 用 SW／DC／每人 HTTP 預覽**冒充**包廂大螢幕 | 大螢幕＝節目 RTP（§5.7） |
| 以 DC owner `done`／page `received` 當成功，而 SW 尚未依宣告長度交完該 HTTP body | 破壞 roundtrip↔transfer 綁定；短檔／長度不一致 |
| SW 為「這個檔」預開與 HTTP 脫鉤的常駐拉流，或代替前端決定 request 次數 | SW 不是產品 downloader；它是 HTTP server |
| 目錄檔前端另走 `blob:`／object URL（本機）或明文 DC（遠端） | 破壞統一 `/room-file/<id>`；本機優化須在 SW 內完成 |
| 頁面為本機檔把 `fetch` 短路成 Registry／`File` 直出 `Response`（不經 SW） | 本機優化只在 SW；前端本機／遠端必須同一套 HTTP |

**允許（對齊同源靜態檔）：** SW 攔截 **`/room-file/<id>`**；`ReadableStream` Response 邊收邊吐（`fetch`→Save picker writable、Safari 收完 body 後 `blob:` 橋、`<img>`／`<video>`／`<audio>`）。改 go **既有** SW，不另註冊第二個。頁面是 HTTP **client**；SW 是 HTTP **server**（GET／HEAD／Range → `200`／`206`／`404`／`416`／`405`）。

#### 下載落盤

主路徑（所有瀏覽器）：

```text
使用者手勢 →（有則）showSaveFilePicker → fetch(同源 /room-file/<id>)
  → 本機：SW 直出 File（無 transfer）／遠端：一筆 HTTP＝一條 transfer
  → Response.body 串流寫入 writable → close
  → 核對 Content-Length／寫入位元組與宣告 size（與 SW 交付完成一致）
```

取消 picker＝**不**發起會拉滿整檔的下載（其他已在進行的 HTTP／transfer 不受影響，除非同一 UI 明確取消）。

無 `showSaveFilePicker`（常見：Desktop／iOS Safari）：**同一條** `fetch(同源 URL)`（一定走 SW）。WebKit 的下載管理員在 `Content-Disposition: attachment` 或 `<a download href=/room-file/…>` 時會**繞過 SW**、改打源站（源站對 `/room-file/` 為空 404）——**禁止**以此當遠端落盤。HTTP body 收完後，僅用 `blob:` + `<a download>` 當 OS 存檔橋（不是另發明文協定；不是用 Blob 取代 HTTP）。

掛檔（`<input type="file">`／drop）仍可用 OS 選擇器——那是讀取授權，不是落盤。

#### RAM／背壓

| 用途 | 預算 |
| --- | --- |
| **下載**（stream-through） | 本機：SW 直出，無 DC。遠端每筆 GET transfer：飛在路上的 ≤約一幀 chunk＋DC `bufferedAmount` 背壓。Safari 無 Save picker：HTTP 仍串流進頁，收完後短暫組 Blob 只為 `blob:` 橋（WebKit 例外） |
| **檢視／私下播** | 本機：SW 直出。遠端每筆 Range／GET transfer 滑動窗口軟頂 **32 MiB**；滿則 `pause` **該** transfer；關預覽／播放器即 abort **進行中**的 HTTP／transfer |
| **同時** | 遠端同檔可同時多筆 HTTP（＝task）。**Job＝檔案 id**；每 job 最高 concurrent tasks 初值 **10**（滿則 reject，不排隊）。**Page 政策（現況）：** 同時只開一個遠端 job（`busy`／一次一個檔）——**可改**。開哪些 task＝HTTP client／媒體。**Page** 用 URL **`?purpose=play|save`** 告訴 SW priority。本機掛檔 SW 直出、不開 task |
| **共用 DC 排程（硬）** | 實體 DataChannel **一條共用**。排程只做**已 admit 的**泵送：先 **job**（file id）再 **task**（`transferId`）。Priority：**Page** 決定 purpose → HTTP `?purpose=` → SW 知悉（可 echo 於 `open-transfer`）→ page `request.priority`（save＞play＞default）。背壓仍用 per-`transferId` `pause`／`resume`＋`bufferedAmount` |

背壓不足、把整檔 slice 完塞進 JS 佇列＝變相整檔進記憶體，同樣否決（Safari `blob:` 橋除外，且僅在 HTTP 完成之後）。

**否決：** Owner 對每個 `request` 各自狂灌 DC；同一 file job 超過 concurrent cap 仍 admit；scheduler 發明要開哪幾筆 Range；用 `?download=`／attachment 當 purpose。**要：** Page 開 HTTP（自帶 `?purpose=`）→ SW（job＝file id）配 `transferId`、讀 purpose → page admit／`request.priority` → DC job→task quantum。

#### Wire

控制面 JSON（DataChannel 文字幀）＋ payload 二元幀。`binaryType = "arraybuffer"`。目錄可 fanout；**遠端內容只走 Owner → Requester**（Host 若不是其中一方，只轉幀、不組裝）。**每一筆**對遠端檔的 HTTP 由 SW 開 `transferId` 並觸發 `request`；**本機掛檔不發 `request`、不佔 DC。**不是** UI 繞過 HTTP 直接發明第二套拉流 API。

```text
session_file.share     { id, name, size, mime, owner }   // 掛上：僅檔 metadata。本客戶端不送 kind:dir／parentId
session_file.unshare   { id }                      // 撤一檔
session_file.catalog   { items: share[] }          // 晚進門：Host 重放目錄
session_file.request   { id, transferId, from, offset?, length?, priority?, jobId? }  // task＝此一 HTTP；jobId＝file id；priority＝Page 依自己給 SW 的 purpose（save＞play）
session_file.reject    { id, transferId }          // 已撤回／擁有者離席／忙碌／無法服務
session_file.pause     { id, transferId }          // 該 transfer 背壓；owner 停泵、transfer 仍在
session_file.resume    { id, transferId }          // 續泵
session_file.chunk     二元：transferId + seq + payload  // 同 transfer 有序；勿只用 file id
session_file.done      { id, transferId }          // 語意見下：源端泵完 ≠ HTTP／transfer 成功完成
session_file.cancel    { id, transferId }
```

**`done`／完成（硬）：** Owner 發 `done`＝「此 transfer 在來源側已無更多 bytes 可泵」。索取端頁面**不得**因此 `closeInbound`／標下載成功。SW 交完（或 abort）該 HTTP body 後發 `transfer-complete`／`transfer-abort`（含 `transferId`）；頁面只依此收尾。**禁止**僅因 owner `done` 或 page mirror 計數滿就結束 HTTP body／標成功。

舊 `offer`／`accept`（「要不要收這份推送」）**停用**。掛上分享區＝已授權被拉；要＝HTTP → 每 roundtrip 一 `request`。本客戶端**不**送 `kind:dir`；若收到（舊客戶端），忽略該列。

拓樸：目錄與 `request`／`reject`／`unshare` 仍經 Host fanout／轉送。**chunk 依 `transferId`：** Owner 泵送時若 `hasDirect(requester)` → mesh DC；否則經 Host star。**`hasDirect` 只反映名單變動時已建成的邊**——傳檔路徑**不得**觸發 dial。擁有者離席 → 其目錄 `unshare`、進行中 `cancel`、對應同源 URL → `404`。Host 自己就是 Owner 或 Requester 時，進門那條 PC 已是一跳。

分享者送檔：`file.slice(offset, offset+n)`（或等價 stream reader）每次一塊；`bufferedAmount` 高則停讀。同一 `transferId` 內 `seq` 嚴格遞增；收端按 transfer 組裝，**不得**假設跨 transfer 的全域游標。

| 項 | Phase 1 初值（可調；寫進測試） |
| --- | --- |
| 單檔上限 | 2 GiB（傳輸時長／惡意檔保險，**不是** RAM 預算；內容仍按 chunk 串流） |
| 同時傳送 | **job＝file id**（SW／page 同）；每 job **最多 10 concurrent task**；**page 現況**一頁一遠端 job（可改）；開哪些 task＝HTTP client；**Page** 用 `?purpose=` 告訴 SW priority（非 Response 分支） |
| 掛檔 | 分享區選檔／drop；可多份。**不提供選資料夾** |
| 索取 URL | 每檔 **`/room-file/<id>`**；**Page** 可選帶 **`?purpose=play|save`**（給 SW）；**禁止** `?download=`；遠端**每筆 HTTP 各一 transfer**；本機不開 transfer |
| 下載 | HTTP（`fetch`→writable；Safari 無 picker 則收完後 `blob:` 橋）；**禁止**以 `/room-file/` + Content-Disposition／`<a download>` 觸發下載管理員 |
| 預覽／播 | 同一 URL：`<img src>`／`<video src>`／`<audio src>`（可 Range；媒體自開的每筆 Range＝各一 transfer） |
| 目錄列 | 檔名＋大小＋誰掛的；**不**為縮圖先傳內容（縮圖若做＝另發 HTTP，仍走同一門面、另開 transfer） |
| 散場 | 丟分享 `File` handle 與**分享**目錄；進行中 `cancel`；進行中的 HTTP／transfer 清掉；已寫入使用者選的檔**不**刪。**主持私有 OPFS 不清**（§8.3） |

OS 檔案選擇器允許（掛檔、另存、匯入私有）。**不掛目錄。** 可執行檔拒（頁內，非原生 dialog）。**否決**自動上傳 Platform／R2。

### 8.3 主持私有檔（儲存契約凍；Phase **2g** 已落地）

對齊 §5.5.1。這一節凍**儲存與隔離**；UI／cast 接線見 Phase 2g（手測：私有影／音可上大螢幕；圖同 2e）。

| 項 | 規格 |
| --- | --- |
| **用途** | Host 本機片庫：匯入、列、刪、本機預覽、上大螢幕、**掛到分享** |
| **儲存** | **Embedded 瀏覽器 Hub：** OPFS（`navigator.storage.getDirectory()` 子目錄 `room-private/`）。**`pg-booth-desktop` Shell：** **不用** OPFS；`@tauri-apps/plugin-fs` 寫 `booth_paths.privateLibraryDir`（`manifest.json`＋`files/pvt_*`；見 TAURI-PLAN §7.4）。**daemon：** `~/.pg-booth/private/`。**禁止**用私有庫路徑當分享 DC transfer 緩衝 |
| **與 `/room-file`** | 私有 id **永不**註冊進分享 `/room-file/<id>` registry。Guest／遠端 HTTP 對私有 id → **404**（或不存在於 registry） |
| **上大螢幕** | Host 本機讀 OPFS → 解碼表面 → `captureStream` → 節目 RTP（`session_cast`＋`scope: "private"`）。**不**經 `session_file` bytes |
| **掛到分享** | 從 OPFS 取得可讀 blob／File → 既有分享掛上路徑（新分享 id＋metadata fanout）。之後別人「要」走 §8.2 |
| **IndexedDB／Cache** | 私有庫**不要**用 IDB／Cache Storage 當主存；片庫＝OPFS。SW 仍**不得** `Cache.put` 整檔 |
| **配額／失敗** | OPFS 不可用／配額滿 → 頁內說明；可降級為「僅本場次記憶體 File」（不常駐）——產品可選，契約仍以 OPFS 為快樂路徑 |

**驗收句：** 私有檔上大螢幕時，第二台 Guest 收得到節目、分享區**沒有**該檔、對任意猜測 id 的 `/room-file/…` **無**內容。掛到分享後，同一檔以**新分享 id** 出現在目錄，才可「要」。

### 8.4 連線探測（Phase 1 已夠講）

DataChannel `open` ＝「已連線」。可選 ping。不把「先連包廂再保證五子棋 relay」當 Phase 1 故事。

---

## 9. 媒體項（契約現在凍；UI 分階段）

仍預留的交付是「大螢幕槽＋三區殼面」與「在包廂開一局」。Phase 1 **不做**鏡頭／大螢幕 UI 的舊句已過時（2a／2c 已落地）；**禁止**之後用 Platform renegotiation 補軌。

**在場槽**載開口／鏡頭／畫面（可被主持切上大螢幕）。**節目槽載房級大螢幕**（不再空置）。目錄檔的「要」（同源 HTTP）不上節目槽。

### 9.1 在場 live（SDP 在場槽）

| | 規格 |
| --- | --- |
| **來源** | `getUserMedia` **或** `getDisplayMedia`，**不能同時**。一條**在場** live 可含影像＋聲音 |
| **人數** | 每人同時最多**發布**一條在場 live。預設關相機 |
| **產品面** | 在場名單標示；**不是**目錄虛擬檔；**不是**包廂大螢幕（除非主持指定此路為大螢幕來源） |
| **傳輸** | WebRTC RTP（presence A/V）。現況經 Host 轉 |

**在場影像：** 進門可把遠端 presence receiver 綁到本機隱藏 `<video>`（1×1／透明，**不要** `display:none`）。點座位上的人不自動上大螢幕。上大螢幕＝主持切來源，改走節目洞。

關在場 live＝`replaceTrack(null)` 並 `unoffer`。

**否決**把鏡頭／畫面掛進分享目錄。**否決**用 `captureStream`／節目 RTP **代替私下播檔或下載**。**必須**用 `captureStream`／節目 RTP 當**大螢幕**（§9.2）。

**否決**「第三人加入就關鏡頭」。人數不關 live。不做格子牆。

### 9.2 包廂大螢幕（SDP 節目槽）

| | 規格 |
| --- | --- |
| **來源** | 主持指定：沒訊號／來源端檔 `captureStream`（分享目錄或 Host 私有 OPFS）／某 peer 的在場 live。見 §5.7 |
| **人數** | 全場同時一路。在場**自動收**（房級 §9.8） |
| **產品面** | 大螢幕槽；沒訊號也是主視覺。開局時同一塊改掛 SAM，不是第二個舞台 |
| **傳輸** | WebRTC **節目** RTP。現況經 Host 轉給每位在場。**禁止**用 DC 當大螢幕 |

**大螢幕綁定（硬）：** 進門 PC 一建立，就把遠端 **program** receiver 綁到大螢幕槽 `<video srcObject>`。禁止等有畫面才第一次綁。沒訊號＝空軌或雪花；開局可藏視覺改掛畫布，**不要**拆綁定、**不要** `display:none`。

**聲音兩層（硬）：**

| 層 | 槽 | 內容 | 星狀行為 |
| --- | --- | --- | --- |
| **節目音** | program audio | 大螢幕來源（片子／被推上大螢幕的 live 音） | 跟當下單一路節目轉軌；**不**混多人開口 |
| **在場音** | presence audio | 開口（開麥、未靜音） | Host **混音**成一軌再送各 peer（§9.8） |

兩層可並行（邊看片邊講話）。本機音量可分開（大螢幕／開口）。**禁止**為省事把多人開口混進節目音。

### 9.3 拓樸

與傳檔同一條：**檔 bytes＝mesh 直連優先／star 備援；節目／在場 RTP＝Hub。**

```text
Host ↔ X      進門 PC：文字／目錄／檔 star／在場 RTP／節目 RTP（大螢幕）
Guest ↔ Guest 可選 mesh PC；開成後「要」檔 bytes 可不經 Host
```

| | 任意人數（含自己的另一台） |
| --- | --- |
| **大螢幕** | 節目槽；主持指定**單一路**來源；在場自動收；再指定＝切台 |
| **在場影像** | 開在名單；上大螢幕＝主持切來源。未指定則零影像 RTP（聲見 §9.8） |
| **在場聲** | 開麥房級；星狀＝Host 混音後一軌出站 |
| **檔 bytes／要** | 直連 DC（有 mesh）或進門 DC＋Host star；索取端同源 HTTP 門面；不佔節目槽；不跟大螢幕互斥 |

- **不做：** 雲端 SFU、為每人預留無上限**額外** video m-line、會議格子牆、多路視訊合成進節目、把私下播改走 RTP。
- **延後（非 1c）：** 節目／在場影像改走 mesh；在場聲改直連少混。1c 只開檔用 mesh；失敗仍回 star 混音／Hub RTP。
- 人數軟頂（可調）：包廂 ≤6。超過頁內說明。星狀下電影 RTP 常是每條 PC 各編一次。

### 9.4 拉的方式依項目

下載／檢視／私下播在**索取端**同一門面（§8.2 同源 HTTP）；下表差在產品意圖與 RAM，不差在「要不要講 HTTP」。

| | 下載（§8.2） | 檢視 | 私下播放（影音檔） | 包廂大螢幕 | 在場鏡頭 |
| --- | --- | --- | --- | --- | --- |
| 目的 | 對方硬碟多一份 | 當場看圖（我這台） | 我這台看／聽；可 seek；散場沒有檔 | 全場同一路；跟著來源走 | 可被主持切上大螢幕 |
| 開始 | 對同源 URL 發 HTTP（`fetch`→writable；Safari 無 picker → `blob:` 橋） | 同一 URL → `<img src>` | 同一 URL → `<video>`／`<audio>`（Range／seek） | 主持 `session_cast`；**owner 本機渲染**→節目 RTP；進門即收 | 開＝offer；影像待指定 |
| RAM | stream-through；≤飛在路上的 chunk | 滑動／整圖窗口軟頂（同播窗口量級）；關即停 | 播放窗口軟頂 **32 MiB**；緩衝滿 `pause` owner | 瀏覽器 RTP；**禁止**組整檔 Blob；**禁止**為上大螢幕把檔拉到非 owner | 同左 |
| 控制 | 下載者自己的進度 | 關預覽即停 | **本機播放器** seek／暫停 | **主持**遙控來源播放器（owner 執行）；收看端不可獨立拖進度；**音量本機** | 本機預覽 |

檢視不是下載的 Blob 後備——是同一 URL 的另一種 HTTP 消費。私下播放＝只想自己看、不要一份落盤檔，**不是**大螢幕。可等檔頭足夠就開播（mp4 常要 moov）。**禁止**為目錄檔組整檔 `Blob`／object URL 當存取協定（本機亦走 `/room-file/<id>`，由 SW 直出）。

**Service Worker 門面（硬、有邊界）：** go **既有** SW 攔截 **`/room-file/<id>`**。**本機 File → 直出（不經 DC）**；遠端則對**每一筆** HTTP 開一條 `transferId`，把該 transfer 的 chunk 編成**該筆**標準 `Response`（含 `206` Range）。bytes（遠端）仍只走 WebRTC。**不用 MediaSource／mp4box。** 見 §8.2。

| 可 | 不可 |
| --- | --- |
| 攔截 `/room-file/<id>`；本機直出或遠端串流一筆 `Response` | 頁面直讀 DC chunk；另註冊第二個 SW；本機改走 object URL 產品路徑 |
| Range／多連線（每筆 HTTP＝一條 transfer；以 client abort／完成收尾） | `Cache.put`／IDB／OPFS 當**分享傳檔**緩衝；私有片庫 OPFS 見 §8.3 |
| 遠端：該 response body 交完（或 abort）→ 收尾對應 transfer | 用每人 HTTP 預覽／DC **冒充**包廂大螢幕；以 owner `done` 代替 SW 交付完成 |

**禁止**用 WebRTC 當「我這台播目錄檔」的路徑。**必須**用 WebRTC 當包廂大螢幕。

### 9.5 瀏覽器（驗收寫死，不當後續階段 bug）

| 能力 | 快樂路徑 | 失敗怎麼辦 |
| --- | --- | --- |
| 收大螢幕（節目 RTP）、開鏡頭、開麥 | 含 iOS Safari 當收看／開口 | 權限拒＝頁內說明 |
| 電影／音／圖來源 `captureStream`（含別人掛的檔） | 桌機／Android **Chrome／Edge** 當屋子或持檔端 | **Safari／WebKit**（含桌機）當來源常無 `HTMLMediaElement.captureStream`→ reject＋頁內說明改 Chrome／Edge 掛檔或主持自掛；收看端仍收 RTP；**不要** canvas-only 冒充、**不要**改 DC 當大螢幕 |
| 私下播／檢視目錄檔 | 同源 URL → `<video>`／`<audio>`／`<img>`；大檔邊收邊播（Range） | 解不了→頁內說明；**不要**改叫人下載當唯一出路 |
| 螢幕分享 `getDisplayMedia` | 與鏡頭互斥的同一條**在場** live；可被指定上大螢幕 | 權限拒＝頁內說明 |
| 下載落盤 | 一律 `fetch` 同源 URL；有 Save picker → 串流 writable；Safari 無 picker → HTTP 收完後 `blob:` 橋 | 失敗／不完整 → 頁內錯誤、解除 busy；**禁止** Content-Disposition 繞過 SW |
| 選資料夾掛上 | **不做** | 不畫該控件；drop 夾內檔當獨立檔 |

**禁止**用 WebRTC media stream **私下播**目錄裡的影片檔。**片子／live 必須**用 WebRTC 當包廂大螢幕。**開局**走 SAM 畫布，不是 RTP。下載／檢視／私下播**必須**走同源 HTTP 門面（§8.2）；Safari 存檔橋除外見上表。

### 9.6 誰能掛、誰能拉

- **鏡頭／畫面：** 任一在座裝置可開（預設關）。**開＝本機預覽＋名單標示。** `getUserMedia` 與 `getDisplayMedia` 互斥。上大螢幕＝主持指定。人數不禁用控件。瀏覽器權限對話＝OS 權限，不是產品 `confirm`。
- **麥：** 可與鏡頭同一條在場 live（聲音軌）；不是第二條出站 live。房級：開麥者的聲自動給在場——星狀下經 Host **混音**（§9.8）。關麥／靜音＝`unoffer` 或不進混。
- **分享目錄檔：** 掛在目錄裡。**要**（下載／檢視／私下播）＝索取端對同源 URL 發 HTTP 才拉 bytes。**放到大螢幕上**＝主持指定；**持檔端（owner）**已有該 `File`，本機渲染 → `captureStream`＋節目 RTP（可別人掛的檔；呈現型別見 §5.7）。
- **主持私有檔：** 僅 Host；OPFS；可上大螢幕（`scope: "private"`）；不可被「要」。要分享＝**掛到分享**（§5.5.1／§8.3）。
- 進包廂**不**自動開相機。**自動**收大螢幕與開麥者的聲（混音後的在場音）。

### 9.7 控制面 `session_cast`／`session_camera`／`session_record`／`session_play`

JSON、DataChannel；**不**載檔 bytes。RTP 走 Hub。

**大螢幕** `session_cast`（主持發出；fanout）：

```text
session_cast.offer    { from: host, id?: fileId, fromPeer?: peerId, scope?: "share"|"private", kind?, name? }
  // 分享檔：id＝目錄 fileId；fromPeer＝持檔端（可省略＝從目錄 owner 推得）；scope 缺省＝share
  // 私有檔：scope＝"private"；owner＝host；id＝私有命名空間；**不**進分享目錄
  // live：fromPeer＝在場 peer（無 id）
  // 沒訊號用 unoffer
session_cast.unoffer  { from: host }                                         // 清來源＝沒訊號（大螢幕仍開）
session_cast.state    { from: host|owner, paused?, t?, duration?, name?, kind? }
  // 主持→owner：遙控來源播放器（播／停／seek）。時鐘本體仍在 owner；收看端跟 RTP。
  // owner→在場：回報 paused／t／duration 給主持 HUD。音量＝各端本機收看，不走 state。
session_cast.reject   { from: owner, id?, reason? }                          // 持檔端無法 capture／無權
```

- 主持指定**別人掛的檔**：fanout `offer` 後，**owner** 本機開渲染並對節目槽 `replaceTrack`；主持 `forwardFrom(owner)`（對齊 live 轉軌）。
- 主持指定**私有檔**：本機 OPFS 產軌再 fanout；offer 可帶 `name`／`kind` 給槽外狀態；**禁止**因此 fanout 私有列或開放「要」。
- **片子時鐘由主持遙控**（`state`）；owner 執行並回報進度。收看端（含非主持 Guest）不可獨立 seek／快轉／倒帶。**音量＝本機喇叭**（HUD 本機 sink），不遙控來源端。
- **`kind: audio`：** 大螢幕槽呈現 audio player 面＋音量／節奏跳動（§5.7.1／**2h**）；transport 規則同上。
- 收看端**不必**再 `request` 節目（房級已收）。開局不走 `session_cast`（見 §9.9 `session_play`）。

**私下播／檢視／下載不走 `session_cast`。** **分享**檔前端一律 `/room-file/<id>`。**本機掛檔：** SW 直出，不經 DC。**遠端：** 每一筆 HTTP → SW 開一條 `transferId` → `session_file.request`／chunk；**SW 交完該 response body 後**該 transfer 才結束（owner `done`＝源端泵完，見 §8.2）。同檔可同時多筆遠端 HTTP／`transferId`；**不**在開新 Range 時主動 cancel 舊的——各條以 client finished／cancel／abort 收尾。緩衝滿／下載背壓時 `pause`／`resume` **各** `transferId`。**私有檔不走 `/room-file`。**

**鏡頭** `session_camera`：

```text
session_camera.offer    { from }   // 掛上：可被指定上大螢幕；影像不因 offer 就 fanout
session_camera.unoffer  { from }
session_camera.request  { from }   // 非主路徑：明示拉影像（若需要本機預覽別人臉）
session_camera.release  { from }
```

**錄影** `session_record`（主持發出；Hub 執行；wire 詳見 [PG-GO-ROOM-RECORD-PLAN.md](./PG-GO-ROOM-RECORD-PLAN.md) §6）：

```text
session_record.start   { from: host, targetPeer: peerId, label? }
session_record.stop    { from: host, targetPeer: peerId }
session_record.notify  { targetPeer, active: boolean }     // fanout：全場 badge
session_record.done    { targetPeer, privateId, name, duration?, mime?, size? }
session_record.error   { targetPeer, code, reason? }
```

- 可**多路**同時錄；每路一檔進 Hub 私有片庫。**不**錄大螢幕 program。**不**自動掛分享。

### 9.8 房級規則（定案）

| 項 | 規則 |
| --- | --- |
| 節目（大螢幕） | 進門／入座即收節目。新人對準當下大螢幕。Host 對在場所有 program sender 送當下**單一路**來源。再指定＝切台 |
| 在場聲 | 有人 `offer` 麥 → 在場自動收。關麥／離席即停。**星狀混音見下** |
| 在場影像 | **不**自動 `request`。上大螢幕＝主持指定，Hub 把該路送到節目槽（單主畫面） |
| 相機／畫面 | 進門不自動 `getUserMedia`／`getDisplayMedia` |
| 目錄檔 | 仍無 `request` 零 bytes |

不改「無 request 不送**檔 bytes**／不送**未指定的在場影像**」。房級是對**大螢幕**與**開口**的例外。

#### 9.8.1 在場聲混音（硬；星狀）

**產品：** 未靜音的開麥者應彼此聽得到；大螢幕仍只有一路主畫面。

**約束：** SDP 每條 PC **一條** presence audio m-line。星狀下 Guest 之間無直連音。

**行為：**

1. Host 匯集各開麥 peer（含主持自己）的上行 presence audio。
2. Host 用 **`AudioContext`（或等價）混成一軌**；對每位收聽者 `replaceTrack` 填其 presence audio **出站**（混給某人時**排除**該人自己的上行，減迴音）。
3. **僅一個**開麥者時可單軌轉發，不必開混音圖。
4. **≥2** 個開麥者時**禁止**只轉其中一軌、後蓋前、或假裝「房級已收」。
5. 節目音**不**參與此混；片子／大螢幕 live 音留在 program audio。
6. 主持散場（關 `/room`）＝混音圖與所有出站一併停。

**否決：** 用多路視訊合成／監視牆／會議小格來滿足「在場感」；用加 presence audio m-line 或雲端 SFU 當初期解。mesh 檔直連（1c）打開後，在場聲是否改直連／少混另刀。

**實作：** `go-client` `goRoomPresenceAudioMix`＋Hub `pushPresenceAudio`（**2f 已落地**）。單開麥轉發；≥2 開 `AudioContext` 混音；關麥重推。

### 9.9 其他預留

| 方向 | 概要 | 依賴 |
| --- | --- | --- |
| **別人掛的檔上大螢幕** | 主持 `session_cast` → owner 本機渲染 → Hub 轉節目軌（影／音先；圖同模型） | §5.7；對齊既有 `forwardFrom` live 路徑 |
| **圖檔上大螢幕** | owner canvas 靜態／低幀 video 軌；無 seek HUD | 同上；**已落地** |
| **可預覽 doc 上大螢幕** | 僅來源端可 capture 的表面；不承諾任意 MIME | 不阻塞影／音／圖 |
| **在場聲混音（2f）** | Host `AudioContext` 混多麥 → 各 peer 一條 presence audio | §9.8.1；**已落地** |
| **在包廂開一局** | 已有 PC → 重用；大螢幕槽掛 SAM；主持選遊戲＋指定／自動入座；觀戰＝未入座仍看畫布 | DEC-045 重用；§5.9；實作 [PG-GO-ROOM-PLAY-PLAN.md](./PG-GO-ROOM-PLAY-PLAN.md)。**不要**散場再鑄遊戲邀請當快樂路徑 |
| **螢幕分享** | 同一條在場 live；與鏡頭互斥；可被指定上大螢幕 | 不阻塞大螢幕 |
| **多路 live 錄影** | 主持 `session_record` 指定多路 presence live → Hub 私有片庫；與 cast 正交 | [PG-GO-ROOM-RECORD-PLAN.md](./PG-GO-ROOM-RECORD-PLAN.md)；**未落地** |

**不列為預留：** 多路視訊合成進節目／訪客端監視牆／會議格子（§3 否決）。

實作約束：**peer 當一等物件。** 遊戲 SAM 掛上同一 PC 時應忽略閒置 A／V 軌；開局**不要**自動開相機。

**`session_play`（主持發出；fanout）：**

```text
session_play.offer  { from: host, catalogId, rev?, seats: [{ role, peerId }] }
session_play.end    { from: host }
```

在場載同一 `catalogId`（local-first）。席次對不上或人數不足＝不開、頁內說明。**不錄製。**

---

## 10. UX

隱喻：網咖包廂——坐進去燈就亮、**整面牆是大螢幕**；成員、架子上的檔、不方便開口時的文字在旁邊（或底下分段）。要加人再開門貼一張限時通行證。QR 是門上的便條，不是房間本身。自己的手機掃同一張便條＝第二個座位（自帶螢幕），不是再開一間。主持可以切**誰掛的**片子／圖、切某人 live、或在這臺大螢幕上開一局。

**主面是主視訊區**（沒訊號也是主體；槽內無字）。看電影／開局走劇院態滿窗。分享面才回答「這張邀請還能不能用」。文字不是 UI 主體。不要一進門就是每人一格鏡頭。殼面細節（廳態／劇院態、RWD、頂列可收）見 **§5.8**；開局見 **§5.9**。

### 10.1 誰看見什麼

| | 主持 | Guest |
| --- | --- | --- |
| 大螢幕槽 | 進門即有 | 連上才有（connecting 用短狀態，不要空殼裝成已在） |
| 開口（麥）／鏡頭 | 進門即可；預設未開相機 | 連上才有 |
| 成員／檔案／文字 | 進門即有（窄屏預設成員；文字非英雄） | 連上才有 |
| 指定大螢幕來源／開局 | 有 | **無**（可被指定入座或觀戰） |
| 請人進來／門牌／TTL | 有（成員區＋分享面） | **無** |
| 在場名單 | 有 | 有 |
| 結束這一間 | 有（散場） | 改 **離開這一間** |
| 結束這一局 | 有（包廂還在） | 無 |
| 再開一間 | 僅 ended | 無 |
| 網址 | `/room` | `/i/<short>` |

### 10.2 窄屏（預設＝手機直式）

1. **殼頂列（可 overlay 收起）**  
   對齊對弈 3s 自動收（§5.8）。展開時：左品牌／包廂；右人數膠囊可在大螢幕下緣薄狀態重複，避免收起後找不到「幾人在」。  
   **請人進來**在**成員區**。結束／離開在 **dock**（icon）。熱區 ≥44×44px。
2. **一句狀態**  
   人數＋大螢幕（沒訊號／正在播〈名〉／大螢幕上是〈誰〉／正在玩〈遊戲〉）。**不講 TTL。** 一個人且沒訊號：**不要**寫 `就你一個人 · 把這頁開著，這一間才還在`（這行拿掉）。有人：`3 人在`。門牌過期**不**取代這一行。
3. **主視訊區（主體）**  
   廳態：全寬 16:9。劇院態：滿窗。沒訊號＝雪花、**不要在畫面裡寫字**。片子／live＝DOM `<video>`。開局＝同一塊 SAM 畫布。**不要**把整間 pixel 內景當主內容。
4. **分段面板**  
   **成員**（預設）／**檔案**／**聊天**（wire＝`session_chat`）。廳態直式＝下半 tab。劇院態不排 tab；回廳態後可操作。
5. **麥／鏡頭列（dock）**  
   icon 按鈕（`aria-label` 全名；≥44px），在 tab **上方**；**僅廳態**顯示。**劇院態**整段 dock 隱藏——開麥／結束等須 **Esc／peek 回廳態**。快捷語在聊天區、預設收起。
6. **文字**  
   不要全頁時間線，不要空態「先打字也可以」當英雄。
7. **檔案**  
   **分享：** 掛檔／下載／**私下播放**。私下播放器在檔案區迷你列，**不**佔大螢幕槽。  
   **主持私有（2g）：** 同區內 **私有／分享** 分段（窄屏先疊 tab 或 segmented；寬屏可同欄上下）。私有：匯入、刪、推播至大螢幕、**掛到分享**；**無**下載給別人。Guest **只見分享**。（**2g 已落地**）  
   **不要**做成輸入列「附加檔」、**不要**檔案氣泡混進文字、**不要**「對方想傳檔過來／接收／拒絕」。
8. **請人進來 → 分享面（唯一放大 QR 的地方）**  
   - 有效：QR、口誦 `go.samkuo.me/i/…`、複製／系統分享、一句 `這張邀請約 N 分鐘內有效；過期後再發一張即可，這一間不會因此關掉。`  
   - **必備一句：** `另一台裝置請掃這張邀請進來，不要再開一間包廂。`  
   - 過期：**不要**再畫死 QR；主 CTA `再發一張邀請`。  
   - 尚未鑄：按請人進來再鑄再開分享面。
9. **確認（頁內，非原生 dialog）**  
   - 主持結束／Esc／回大廳：`關掉後在場的人會斷線，分享目錄會沒了，大螢幕與鏡頭會停，進行中的遊戲會停。已存到硬碟的檔不受影響。私有片庫還在這台。`  
   - Guest 離開／Esc／回大廳：`離開後你會斷線；其他人還在。你掛上的項目會從分享區拿掉。`  
   - 結束這一局：包廂還在；不要寫成散場。
   - 清空私有（若提供）：明示確認；**不是**散場。

**手機橫式／橫向窄窗：** 廳態 **橫向分欄**（左大螢幕、右 dock + 三 tab）；廣告浮在大螢幕槽（沒訊號時）；頂緣拉出殼。高度不夠由使用者按劇院進滿窗，**不要**自動滿窗。split view 橫向（`width < 1024`）亦走分欄，**不要**落回直式堆疊。見 §5.8。

**平板直式（`width ≥ 1024` 且 `height ≥ width`）：** 維持 **直式堆疊**（上 16:9 + 下 tab），**不要**因寬度達門檻就改右欄。見 §5.8 表②。

### 10.3 寬屏（橫向 `width ≥ 1024px`）

**廳態：** 大螢幕左；右欄 dock + 檔案 + 成員／**聊天** tab（**僅** `width > height`；平板直式見 §10.2）。

**劇院態：** 主視訊滿窗；**無** dock／tab。Esc／peek 回廳態後可操作。

- 在場名單（主持可指定上大螢幕／入座）
- 門牌列：小狀態（見 §10.2 §8）
- 大螢幕控制（主持）：成員／檔案卡與 TV HUD
- `結束這一間`／`離開`在 dock；開局中另有 `結束這一局`（成員區）

**禁止**桌面先做再 `max-width` 縮小。**禁止**把大 QR 等待面當成已登入會員的預設首屏。**禁止**左欄全頁時間線。現場掃碼是分享面的工作。寬屏頂列同樣可收，游標靠近頂可展開。

### 10.4 未登入／結束後／Guest 進不去

未登入：說明開這一間要通行證；不擋回大廳、不擋 `/s/`。補一句：`被請進來的人不必有通行證；開這一間的人要留在這個畫面。另一台裝置請掃邀請進來。` 此面**不**收頂列。

結束後：`這一間已結束`＋主持「再開一間」＋回大廳。**不要**在結束面留舊 QR。

Guest 主持已離開：主 CTA 回大廳；次要「請對方再發邀請」。

Esc 回大廳（現況 `goEscapeHome` 含 `/chat` → 改 `/room`）。**劇院態／分享面／確認／文字焦點：Esc 先關 overlay**，不要第一次就散場。劇院態無 overlay 時 Esc＝回廳態。已廳態才走散場確認。手機用下拉／頂緣 peek 回廳態。並**暫停**頂列自動收。

### 10.5 大螢幕、私下播放、開局（契約現在凍）

- 主視訊區永遠在舞台；沒訊號也在。槽內**無字**。節目 `<video>` 綁定進門即做；開局改掛畫布時可藏視覺，**不要**拆綁、**不要** `display:none` 到解碼停（切回片子時還要用）。
- 主持指定片子／live 後全場大螢幕亮；收看端不可對片子／live 獨立 seek（想自己拖進度＝私下播放／下載）。
- **劇院態：** 滿窗、**僅**主視訊；開局點主視訊＝操作畫布或觀戰。Esc／peek 回廳態後才有 dock。系統全螢幕是加分。
- 私下播與大螢幕並行；播放器 UI 在**廳態檔案 tab**；劇院態須回廳態才能掛檔／操作檔案 UI（已在播可背景繼續）。
- 開鏡頭／麥＝瀏覽器權限對話；失敗頁內說明。
- 對讀者不說直播／推流／WebRTC；不要會議格子牆；第三人在場**不**藏鏡頭控件。
- 點主視訊（非開局、節目播放中）展開**半透明浮動控制**（疊在主視訊區上，**禁止**頁底 bottom sheet）。列序對齊常見播放器、**單列不換行**：播放／暫停、當前時間、進度、總長、喇叭、全螢幕（已滿屏改還原）。**音量條不常駐**——點喇叭才出現直向滑桿（**本機**音量）。**僅主持**對片子／**音檔**有播／停／seek／快轉／倒帶（含別人掛的檔，經 `session_cast.state` 遙控 owner）。系統全螢幕＝大螢幕槽容器（同一套 HUD，**禁止** `<video>`／`<audio>` 原生播放器）。主持可從大螢幕拿掉（列尾）。片名仍在槽外狀態。
- **音檔（`kind: audio`）：** 槽內常駐 **audio player 面**＋音量／節奏跳動（§5.7.1／**2h**）；不是點開才出現空白播控。HUD 規則同上——transport 僅主持、音量本機。

選遊戲＝頁內 sheet（型錄 `kind: game`）；指定人＝同一 sheet 第二步。不要跳去 `/apps` 整頁。

---

## 11. 隱私與儲存

| 項 | 規格 |
| --- | --- |
| 文字／檔案／媒體 RTP | 只經 WebRTC；signaling 僅 SDP。**不錄製** |
| Host API key | 頁面記憶體；mint／作答；關頁即失 |
| 時間線 | RAM；散場丟 |
| 分享目錄 | RAM metadata；散場丟。**內容**不常駐分頁；索取＝同源 HTTP 串流；落盤＝使用者選的檔或瀏覽器另存 |
| **主持私有檔** | **OPFS**（origin 本機；跨場次常駐；散場不清）。**不** fanout；上大螢幕只 RTP。見 §5.5.1／§8.3 |
| 檔案緩衝（分享傳檔） | **禁止** OPFS／IndexedDB／Cache 當**傳輸**緩衝或落盤；SW **不得** `Cache.put` 整檔。私有片庫 OPFS **除外**（上列） |
| HTTP 門面緩衝 | 一律 `/room-file/<id>`（**僅分享**）。本機＝SW 直出 `File`（不經 DC）。遠端**每 transfer** 下載＝stream-through；檢視／播＝滑動窗口（軟頂 32 MiB）；該 HTTP 結束即收尾。**不用 MediaSource／mp4box**。遠端完成權威＝SW 交付，非 owner `done` |
| 收看緩衝 | live 僅瀏覽器 RTP 管線；**禁止**為 live 組整檔 Blob |
| 顯示名 | 可繼續 Roster `localStorage` |
| 分析 | 若打點，只計「鑄了包廂邀請／握手成功／掛過鏡頭」之類；不記正文、檔名、RTP |
| 離線 | 包廂**不能**離線加入（與 `/i/` 同） |

對讀者可寫：見 [PG-GO-ROOM-RECORD-PLAN.md](./PG-GO-ROOM-RECORD-PLAN.md) §10（含主持可選錄影至本機私有片庫、全場「錄影中」標示、**不上傳雲端**）。主持把這個畫面關掉，這一間就散了；分享目錄沒了，已存到硬碟的檔與主持私有片庫不受影響。

---

## 12. 實作切面（建議）

| 層 | 建議 |
| --- | --- |
| Invite | `wantsRosterSignal` 認 `invite.room`；**不要**對 room stamp 遊戲用 `relay: true` |
| Host | `roomRuntime`：進 `/room` 即主面；**openBooth 須 Anchor WSS**；**按需** mint（勿 `openBooth` 自動鑄）；**禁止** `startPlatformHostAnswerLoop`／Invite DO long poll；門牌過期拒新 join、清／作廢可分享的 shortUrl、**不**把 phase 打成 ended；**進門不** `open` SAM（開局才開，§5.9） |
| Guest | `guestRuntime`／`/i/` 依 kind **或** `intent.surface` 分流；room 進門不 `resolveGoSamFiles`；開局才載該 catalogId；同意後**不** `replaceState` `/room`；離開 ≠ 主持散場 |
| 文字 | `goSessionChat` **三區之一**（撤全頁時間線當主面；窄屏 tab、勿蓋死大螢幕） |
| 檔案 | 共用 `rosterSessionFile.ts`＋單測；索取端一律 **`/room-file/<id>`**＋既有 SW；**本機 File SW 直出（不經 DC）**；遠端 chunk **直連優先（1c）／Host star 備援**、**每 HTTP ↔ 一 `transferId`**；禁止組整檔 Blob／object URL 產品路徑；**只掛檔、不掛資料夾**；**私有 OPFS＝2g**（與分享 id 隔離；見 §8.3） |
| Mesh | **1c。** 在線 Guest 變動 → Host `hello` → Guest **立刻**建 **DC-only** 邊；失敗對該 peerId **不重試**；傳檔只查 `hasDirect`。檔 chunk 直連／star；**節目／在場 RTP 永不走 mesh**（仍 Hub） |
| Peer | 進門 booth 2+2 helper（勿把遊戲 DC-only／現況 1+1 默默改掉）。**mesh 邊＝DC-only**（勿再給 mesh 留 2+2 再當媒體 peers） |
| 媒體 | **節目槽＝片子／live／音檔 player 面**（進門綁 program `<video>`；房級送**單一路**來源；電影 `captureStream`；**audio＝2h player＋本機 Analyser 跳動**）。開局＝大螢幕槽掛 SAM，節目可 unoffer。在場＝開口／可指定上大螢幕。**在場聲＝Host 混音**（§9.8.1／2f）。目錄「要」＝同源 HTTP。人數不關鏡頭。**不做**多路視訊合成 |
| 殼面 | `GoRoomTvSlot` + `GoRoomSurface` 廳態 tab／dock；劇院態滿窗無 chrome（§5.8） |
| 開局 | **第一刀已手測**（`pg-gomoku`）。契約：`session_play`；重用進門 PC；席次從協議 roles；自動＝主持＋進門序。實作計劃：[PG-GO-ROOM-PLAY-PLAN.md](./PG-GO-ROOM-PLAY-PLAN.md) |
| 分享 | `GoShareSheet` 邀請模式；title「邀請你進包廂」；**必備**「另一台請掃碼、不要再開一間」 |
| 路由 | `go-client/src/routes/room/`；`/chat` 導向 `/room` |
| 大廳 | hotspot `room` → `/room`；label「包廂」 |
| chrome | 「更多」連到 `/room`；Esc／bulletin 路徑表；包廂主面 **頂列可收**（對齊 `canvasActive` overlay，勿把包廂偽裝成 SAM canvas） |

TDD：進門即主面且**未鑄**門牌、kind／surface 分流、無 SAM Guest、持續作答（非 1 Guest）、SDP **兩組** A/V m-line、`share` 不上 chunk、無 HTTP＝零 bytes、**一律 `/room-file/<id>`**（本機 SW 直出零 DC；遠端每 HTTP ↔ transfer，SW 交完 body 才終態）、chunk RAM 預算、第三者收不到 transfer、遠端索取禁止整檔 Blob／OPFS／Cache／目錄檔 object URL（**分享傳檔**路徑）、**拒絕掛資料夾**、fanout 檔清單、斷線 `unshare`、門牌過期包廂仍 open、過期後禁止分享舊 shortUrl、Guest 離開人數 -1；同 URL 可 `fetch`／媒體／下載得正確 HTTP。**1c：** 名單變動 Host `hello`→立刻 dial；fail 後同 peerId 不再試；傳檔不 dial；有直連時 Owner→Requester chunk **不**經 Host；否則 star。媒體：進門綁節目 video；大螢幕來源走 program RTP；**`file { owner,id }` 由持檔端產軌**（含別人掛的；私有＝Host＋`scope:private`）；私下播不清大螢幕；無指定則零在場影像 RTP；第三人加入不關鏡頭；**在場聲混音（2f）**。**2g：** 私有不上 `/room-file`、不 fanout；cast private 零分享列；掛到分享才可要。純文件本刀不寫程式。

---

## 13. 階段

| Phase | 內容 | 完成定義 | 狀態 |
| --- | --- | --- | --- |
| **0. 契約** | 本文件；GLOSSARY／交叉引用 | 包廂≠overlay≠compose；進門即主面；入座不鎖 1:1；**主面＝主視訊區**；廳態／劇院態；頂列可收；**兩層螢幕**；片子／圖／音／live＝節目 RTP（**owner 渲染**；**單主畫面**）；否決多路視訊合成；**在場聲混音**（§9.8.1）；開局＝重用 PC（延後）；**目錄＝一律 `/room-file/<id>`（本機 SW 直出；遠端 roundtrip ↔ transfer）**；主持導播（含別人掛的檔、**含私有**）；目錄只掛檔；**主持私有 OPFS（2g）**；現況 Hub；兩個時鐘；按需鑄；Guest 留 `/i/`；SDP 2+2 | **本刀** |
| **1. 文字＋傳檔** | 進 `/room` 即主面；Anchor WSS + 按需 mint `invite.room`、`/i/` consent、Guest join 經 Anchor、DC、`session_chat` fanout、`session_file` **分享目錄＋`/room-file/<id>`**（本機直出；遠端每 HTTP ↔ transfer；SW 開 id＋交付完成權威）；Hub 串行接 Guest | 會員不必先邀請就見包廂 UI（無 TTL）；同一短鏈 ≥2 Guest 與 Host 互傳文字；分享區可掛檔；對 `/room-file/<id>` 發 HTTP 才有 bytes；落盤優先 Save picker＋串流；Platform 無正文／無檔 bytes；未登入不能開這一間；`/chat`→`/room`；門牌過期包廂仍在 | **按需鑄／兩個時鐘已落地；HTTP↔transfer 隧道已對齊；多人傳檔 domain e2e 綠（star＋dest backpressure）；Guest↔Guest 檔 bytes 見 1c；不掛資料夾** |
| **1b. SDP 2+2** | 進門 offer／answer **2 audio + 2 video**（軌空）；具名 booth helper；遊戲 SDP 不動 | 進門 SDP 含兩組 `m=audio`、兩組 `m=video`；遊戲 compose 仍無須 2+2 | **已落地**（`reserveBoothMediaTransceivers`） |
| **1c. Mesh 直連（檔）** | 在線 Guest 變動時主動 `session_mesh`；邊＝**DC-only**；**一次機會**；傳檔只路由不 dial；chunk 直連／star | 進門／新人加入即試連；失敗不再對同一 guest 重試；有直連則下載／私下播不經 Host；**節目／在場 RTP 仍 Hub（mesh 不進 goRoomMedia peers）** | **已落地**（`GO_ROOM_MESH_ENABLED`；`media: "none"`；fail／close 不重試；Host introduce） |
| **2a. Live（鏡頭／麥／畫面）** | 開在名單；在場**影像**仍 `request` 才送；麥＝房級；`getUserMedia` XOR `getDisplayMedia`；不做格子牆 | 不經 Platform 二次 O／A；預設未開相機；無指定則零在場影像 RTP | **已落地**（房級麥；多人混音 **2f**） |
| **2b. 目錄影音私下播** | 掛在目錄的影片／音樂經同源 URL 邊收邊播；不走節目 RTP | 片源不出雲；可 seek；**不**當大螢幕；與下載／檢視同一 HTTP 門面 | **已落地**（影／音／圖／下載皆 `/room-file/<id>`；撤 blob image sink） |
| **2c. 包廂大螢幕** | `GoRoomTvSlot` 16:9；節目 RTP；房級收節目／在場聲；聊天在 tab 內 | 沒訊號佔主高度；一起看 MTV；私下播與大螢幕並行 | **已落地**（`GoRoomTvSlot`；節目 RTP）。別人掛的檔見 **2e** |
| **2d. 大螢幕槽殼面** | `GoRoomSurface` 廳態三 tab + dock RWD；劇院態滿窗**無** dock／tab；頂列可收 | 直／橫／平板／桌機；請人在成員區 | **已落地** |
| **2d+. RWD 邊界精修** | §5.8.1：`roomShellMode` 判定、平板直式、橫向窄窗、HUD／filter／鍵盤 | 手測四類裝置＋split view | **已落地** |
| **2e. 別人掛的檔上大螢幕** | 主持 `session_cast` → **owner** 本機渲染 → Hub 轉節目；先 video／audio；image 同模型；doc 延後 | 主持可把 Guest 掛的片子／歌放到大螢幕；不能 capture → reject＋頁內說明；**不**為上大螢幕拉檔到主持 | **video／audio／image 已落地**（`fromPeer`；圖＝canvas 靜態軌；doc 延後） |
| **2f. 在場聲混音** | 星狀下 Host `AudioContext` 混多路上行麥 → 各 peer 一條 presence audio；單開麥可轉發；排除自迴音；節目音不混入 | ≥2 開麥者彼此聽得到；關麥即離混；**不做**多路視訊合成 | **已落地**（`goRoomPresenceAudioMix`；Hub `pushPresenceAudio`） |
| **2g. 主持私有檔** | Host OPFS 片庫；與分享分離；可上大螢幕（`scope: private`）；掛到分享才可「要」；Guest 無私有區 | 私有不 fanout、不上 `/room-file`；cast 僅 RTP；散場不清 OPFS | **已落地**（OPFS＋`scope:private`；手測影／音；**圖同 2e**；Safari 影音片源仍同既有限制） |
| **2h. 音檔大螢幕 player** | `kind: audio` 推播 → 全場 **audio player 面**；音量／節奏跳動（本機節目音 `AnalyserNode`）；transport 僅主持 | 全員見 player＋跳動；Guest 不可 seek／快轉／倒帶；音量本機；**不**另開檔冒充大螢幕 | **已落地**（`goRoomAudioPlayer`＋`GoRoomTvSlot` face；HUD 沿用 host-file） |
| **3. 重用 peer 開局** | 包廂已連 → `session_play`；大螢幕槽掛 SAM；主持選遊戲＋指定／自動入座；觀戰看同一畫布 | 不必再掃 compose；Guest 留 `/i/`；終局可結束這一局而包廂還在。第一刀：五子棋 2 席 | **第一刀已落地**（gomoku 手測；手動席；**redpick** 四席＋觀戰＋deal→end domain） |

建議實作順序 **0 → 1 → 1b → 2c → 2d → 2e → 2f → 2g → 1c → 2b**（皆已落地）→ **3 開局＋redpick＋多人傳檔 domain e2e 已綠** → **2h 音檔大螢幕 player 已落地**；**下一刀候選：doc 上大螢幕／瀏覽器抽樣**。2b 私下播保留在檔案區。**不要**排多路視訊合成。1c 打開後節目 RTP／在場聲仍走 Hub，直到另刀評估直連媒體。

---

## 14. 已凍結決策

| # | 題 | 定案 |
| --- | --- | --- |
| 1 | 名稱／URL | 讀者「包廂」；canonical **`/room`**；舊 `/chat` 導轉 |
| 2 | 產品本質 | **一般用途隔間**；快樂路徑＝請人進來一起看大螢幕。Phase 1＝文字＋傳檔 **wire**，不是產品主形 |
| 3 | Invite | **`invite.room`**；門牌仍 `/i/`；進門無 SAM；開局才掛 |
| 4 | 文字 | 重用 `session_chat`；**三區之一**，不是主面（對齊視訊會議 chat） |
| 5 | 傳檔 | `session_file` **分享目錄**。前端一律 **`/room-file/<id>`**（SW＝標準 server）。**本機掛檔 SW 直出、不經 DC**；遠端每 HTTP roundtrip ↔ `transferId`。**禁止**整檔 RAM／Blob／**分享路徑** OPFS／Cache／目錄檔 object URL。**只掛檔，不掛資料夾**。Host 私有 OPFS＝#33 |
| 6 | SDP | 進門 **2 audio + 2 video**＋DC；mesh 邊＝**DC-only**（`media: "none"`；§7.4／**1c**）；**連線遊戲**一律包廂 2+2（`invite.compose` Superseded） |
| 7 | ICE | 包廂 **≠** 已廢 compose relay-only；高碼率以同一網路為快樂路徑 |
| 8 | 登入 | 開這一間要；被請進來不要（自己的第二台當 Guest 也不要） |
| 9 | 雲 | 無；散場丟分享目錄；**不錄製**。Host 私有 OPFS 非雲、散場不清 |
| 10 | 進門 | **已登入開 `/room`＝包廂主面（大螢幕舞台）**；邀請是面內動作 |
| 11 | 人數 | **入座不鎖 1:1**；同一張**有效** Invite 多 join；文字／**分享目錄** fanout。鏡頭**不**因人數開關 |
| 12 | 兩個時鐘 | 包廂壽命＝主持 `/room` 文件；門牌 TTL 只管請新人；過期 ≠ 散場 |
| 13 | 按需鑄 | **沒按「請人進來」就不 mint**；同一時間最多一張有效門牌；過期後禁止分享舊 QR |
| 14 | Guest URL | 同意後**留在** `/i/<short>`；**禁止** `replaceState` `/room` |
| 15 | 角色 CTA | 主持「結束這一間」；Guest「離開這一間」；主面不把 TTL 當包廂狀態 |
| 16 | 第二台 | **掃門牌**進來；再開 `/room`＝另一間空包廂。自帶螢幕可私下播，不跟大螢幕互斥 |
| 17 | 三個動詞 | **說**（開口為主、文字為輔）／**掛**／**要**（下載、檢視、私下播＝同源 HTTP，**僅分享**）。放到大螢幕上≠要；私有上大螢幕≠掛 |
| 18 | 媒體層 | SDP **在場**＝開口／可指定上大螢幕的 live；**節目**＝包廂大螢幕（**同時一路**；再指定＝切台）。每人一條出站在場 live。進門不開相機。PC 建立後綁節目 video。**否決**多路視訊合成進節目 |
| 19 | 大螢幕 vs 私下播 vs 下載 vs 開局 | 片子／圖／音／live＝**節目 RTP**（owner 本機渲染；可分享或 Host 私有）。開局＝大螢幕槽 SAM。目錄「要」＝一律 `/room-file/<id>`（本機 SW 直出；遠端 roundtrip ↔ transfer；**僅分享**）。不與大螢幕互斥 |
| 20 | 拓樸 | 進門＝Guest↔Host（Platform 一次）。**節目／在場 RTP＝Host Hub。** Guest↔Guest mesh：**名單變動時主動試連**（非傳檔時）；失敗對該 peerId **不重試**；有直連則檔 bytes 不經 Host，否則 star。否決 Platform 第二輪與雲端 SFU |
| 21 | 節目源 | **檔／live 必須 RTP。** 開局不是 RTP。否決用 `captureStream`／RTP **代替**個人下載或私下播。否決用 DC／每人 HTTP 預覽當大螢幕。否決主持拉別人檔再播。否決用 capture 主持畫面當一起玩 |
| 22 | 用語 | 包廂大螢幕、放到大螢幕上、私下播放、開口、玩遊戲、結束這一局、私有／掛到分享；不用直播、會議 SaaS 產品名、P2P、串流伺服器、雲端片庫 |
| 23 | 內容傳輸 | 分享目錄檔：無索取端 HTTP／無 `request` 則零 bytes。私有：永不因 request 出 Host。**房級：** 自動收大螢幕與開麥者的聲（星狀＝Host 混音，§9.8.1）。不做格子牆；不做多路視訊合成 |
| 24 | 分享目錄 | **只有檔**；不掛資料夾；鏡頭／畫面不是項；**不含**私有列 |
| 25 | 一條出站在場 live | `getUserMedia` XOR `getDisplayMedia`；可含影像＋聲音 |
| 26 | 兩層螢幕 | 包廂大螢幕 ≠ 我這台。私下播／掛／下載不跟大螢幕互斥 |
| 27 | 主持導播 | 僅主持指定大螢幕來源（**含別人掛的檔**／**主持私有**／peer／開局）。被指定者不是新主持。再指定＝切台 |
| 28 | 殼面 | **主視訊區**＝`GoRoomTvSlot`（16:9；槽內無字）。廳態：**直式堆疊**（手機直式＋**平板直式** `height ≥ width` 且 `width ≥ 1024`）；**橫向分欄**（`width > height` 且 `height ≤ 560` 或 `width < 1024`）；**寬屏右欄**（`width ≥ 1024` 且 `width > height`）；控制欄內雙欄 **`width ≥ 1440`**。判定順序見 §5.8。**劇院態：** 隱藏控制面板 → **滿窗僅主視訊**（**不**顯示 dock／tab）；Esc／peek → 廳態。槽外狀態列**僅廳態**。RWD 斷點＝viewport；邊界精修見 §5.8.1 |
| 29 | 頂列 | 包廂主面 **可 overlay 收起**（約 3s；對齊對弈）。請人／結束不只活在頂列。consent／錯誤面不收 |
| 30 | 開局 | 契約凍：重用進門 PC；`session_play`；主持選遊戲＋指定或自動入座；未入座觀戰；不鑄 compose、不改 Guest 網址。第一刀不做局中換席。**第一刀已手測**（落地見 [PG-GO-ROOM-PLAY-PLAN.md](./PG-GO-ROOM-PLAY-PLAN.md)） |
| 31 | 檔上大螢幕 | **`file { owner, id, scope? }`＝持檔端渲染 → 節目 RTP**。`scope: "private"`＝Host OPFS。呈現型別影→音→圖遞增；**現況影／音／圖**；doc／任意 MIME 不承諾。傳輸模型不變 |
| 32 | 在場聲混音 | 星狀下 Host **混音**再送 presence audio（`AudioContext` 或等價）；單開麥可轉發；≥2 開麥禁止只轉一軌。節目音不混開口。否決多路視訊合成當在場解。**2f** |
| 33 | 主持私有檔 | **僅 Host**；**OPFS** 片庫與分享目錄分離；不 fanout、不上 `/room-file`；可上大螢幕（僅 RTP；**現況影／音／圖**）；要分享＝顯式掛到分享；散場不清 OPFS；Guest 無私有區。**2g 已落地** |
| 34 | 音檔大螢幕 player | **`kind: audio` 推播＝全場 audio player 面**（非黑屏／雪花）。播／停／seek／快轉／倒帶＝**僅主持**；音量＝本機。面內／上方須有依音量或節奏跳動的視覺化（本機節目音 Analyser；**禁止**每人另開檔冒充）。片名仍槽外。**2h 已落地** |

---

## 15. 與既有通路（勿混）

| 流 | 是 | 不是 |
| --- | --- | --- |
| **包廂 `/room`** | 臨時隔間；`GoRoomTvSlot` 主視訊；劇院態滿窗無 dock；Invite 請人 | 大廳地圖、全頁聊天、格子牆、劇院態仍顯示 dock |
| **Session chat** | 已在遊戲 session 裡的附屬對話 | 包廂主面；包廂文字三區可同族但不是局內 overlay |
| **GO-INVITE／`invite.compose`** | **Superseded**（2026-08-23）；連線改包廂 | 現行連線門；包廂內開局 |
| **布告** | 全站營運公告 | peer 對話 |
| **`/s/`** | 單機傳閱 | 無 peer、無包廂 |

---

## 16. 驗收清單（Phase 0–1 草案）

**契約**

- [x] 本文件；不另開 DEC
- [x] GLOSSARY「包廂」；大廳熱點／主計劃交叉引用
- [x] **進門即主面：** 已登入開 `/room` 即包廂 UI，不必先按邀請；主面＝主視訊區（2d）
- [x] **不鎖 1:1 入座：** 同一短鏈多人可進；時間線 fanout；分享目錄同步（內容不全員推送）
- [x] **兩個時鐘：** 包廂＝Host document；門牌 TTL 分開；按需鑄；Guest 留 `/i/`
- [x] **契約本刀：** 主面＝主視訊區；廳態／劇院態；兩層螢幕；片子／live＝節目 RTP；開局＝重用 PC（延後）；**目錄索取＝同源靜態檔 HTTP**；主持導播；槽內無字；頂列可收；房級收節目／在場聲（§5.6–5.9／§8.2／§9／§10）；**單主畫面＋否決視訊合成；在場聲混音（§9.8.1／#32／2f）**；**主持私有 OPFS（#33／2g）**
- [x] **2d：** 殼面已落地（廳態＋劇院態；RWD 手測完成）
- [x] **2d+：** RWD 邊界精修（§5.8.1；`roomShellMode`／平板直式／橫向窄窗）
- [x] **2f：** 星狀在場聲混音（≥2 開麥彼此聽得到；節目音不混）
- [x] **2g：** 主持私有檔已落地（OPFS＋`scope:private`；手測私有影／音可上大螢幕；圖同 2e）
- [x] **2e image：** 圖檔上大螢幕已落地（canvas 靜態節目軌；無 seek；wire kind＝video）
- [x] **3：** 包廂開局第一刀已手測（`pg-gomoku` 對弈＋重開＋harness 觀戰；手動指定席 UI 已落地；見 [PG-GO-ROOM-PLAY-PLAN.md](./PG-GO-ROOM-PLAY-PLAN.md)）
- [x] **2h：** 音檔推上大螢幕 → 全員見 audio player 面＋音量／節奏跳動；僅主持可 seek／快轉／倒帶；Guest 音量本機；不另開檔冒充（§5.7.1／#34）

**Phase 1（實作後）**

- [x] 已登入可鑄 `invite.room`；`short_url`＝`go…/i/…`；分享面 QR／複製
- [x] 進 `/room` 不按請人：主面在、**沒有** TTL、**沒有**可分享短鏈
- [x] 未登入不能開這一間；導向登入；不擋 `/s/`
- [x] Guest 無帳號、不下載 SAM，同意後進入包廂 UI（網址仍 `/i/`）
- [x] 同一短鏈 ≥2 Guest 與 Host 互傳≥1 則文字；分享區掛檔後第二人對同源 URL `fetch`／下載成功（≤上限）；無落盤能力則頁內說明且**禁止**整檔 Blob；超限／可執行檔拒（**多人傳檔 domain e2e：** Host＋2 Guest star 下載、Guest→Guest 經 Host star、並發 `bufferedAmount(dest)`；瀏覽器抽樣仍宜）
- [x] **同源靜態檔門面：** 遠端與本機掛檔皆對同一 **`/room-file/<id>`** 發 HTTP；本機零 DC；遠端得正確 status／header；頁面不直讀 DC chunk、不另開 object URL 產品路徑（單元已對齊）
- [x] **2b：** 影／音／圖私下播／檢視與下載同一 `/room-file/`（撤 blob image sink）
- [x] **HTTP↔transfer 隧道：** 遠端每一筆 GET／Range 開一條 `transferId`（SW 分配＋`open-transfer`）；SW 依宣告交完 body 後 `transfer-complete`／abort 才終態；owner `done` 不得單獨標成功；本機不開 transfer；禁止 file-level 常駐池與 HTTP 脫鉤完成條件
- [x] 訊息不經 Platform；檔 bytes 不經 Platform；散場丟目錄（已存檔不刪）
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
| 2026-08-24 | **Operator＝Roster 節點（ENGINE 第七刀）：** §5.4 增外出 Operator 路徑；§2 Roster 節點與能力模型；對齊 ENGINE §6.2、§8.1c（單機一條連線） |
| 2026-08-23 | **`invite.compose` Superseded：** 連線遊戲統一 `invite.room`＋`session_play`；`play`／`go` 皆 Booth Hub；Invite DO **保留** |
| 2026-08-23 | **Guest join 經 BoothAnchor（ENGINE §10.7）：** 廢 Invite DO long poll；openBooth／請人須 Anchor WSS；無 fallback |
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
| 2026-08-19 | **廣告版位：** 包廂主面掛 house `GoAdSlot`＋內景後牆看板；live 點擊頁內確認後進 `/s/`；遊戲 Invite `/i/` 不掛 |
| 2026-08-18 | **預設分享模型：** 目錄＝授權、內容永遠按需拉（檔／子目錄／鏡頭／麥／節目同一張目錄）。撤「在場視訊僅 1:1」。動詞改 **說／掛／要**。房級自動拉規則有需求再定義。掛子目錄僅瀏覽器支援時 |
| 2026-08-18 | **實作對齊按需拉：** 人數不關鏡頭；麥／節目 offer 後等 `request` 才 `replaceTrack`；Host 轉節目只給請求者；`session_cast` 改 offer／request；支援時可掛子目錄 |
| 2026-08-18 | **虛擬檔案系統：** 分享目錄掛檔／資料夾／裝置；影片下載或串流、不另掛節目；鏡頭＝裝置虛擬檔；`session_cast.request { id }` |
| 2026-08-18 | **單檔上限 2 GiB**（串流 chunk；非 RAM 預算） |
| 2026-08-19 | **Hub 先行、mesh 延後：** 檔與媒體一律經主持轉送（`GO_ROOM_MESH_ENABLED = false`）。進門 PC 建立後即綁本機 video；按收看才顯示 |
| 2026-08-19 | **Live ≠ 檔：** 每人同時一條 live（`getUserMedia` XOR `getDisplayMedia`，可含聲），走 WebRTC，出現在在場名單。目錄只掛檔。影音檔改漸進下載＋本機播放器（可 seek），不佔 live、不走 `captureStream` |
| 2026-08-19 | **只掛檔：** 分享目錄不掛資料夾；拿掉「選資料夾」／`webkitdirectory`。Drop 夾內檔當獨立檔。遠端 `kind:dir` 忽略 |
| 2026-08-19 | **播放≠整檔緩存：** 取消 256 MiB 整檔上限。播放＝滑動窗口（32 MiB），緩衝滿 `pause` owner。本機 `File` 仍走 object URL（不進 JS heap） |
| 2026-08-19 | **私下播不用 MSE／mp4box：** 遠端檔只走 SW `/room-play/` 原始 bytes；無 playId 才 byte window |
| 2026-08-19 | **播放可用 SW：** 遠端影音播放若需要，可用 go 既有 Service Worker 攔截播放 URL、把 DC chunk 編成媒體 `Response`（含 Range）。下載仍禁止 SW／Cache 整檔 |
| 2026-08-19 | **包廂大螢幕主面：** 靜態內景（不走動）；主面＝大螢幕不是時間線；兩層螢幕（大螢幕 RTP ≠ 私下播 DC）；主持指定來源；電影廣播＝節目 RTP／`captureStream`；房級收大螢幕與開麥聲；文字＝輔助抽屜。凍結 #18–#28 |
| 2026-08-19 | **2c 落地：** `goBoothLayout`／`GoBoothStage`；節目槽＝大螢幕（`startProgram`／`putLiveOnTv`）；房級收節目與麥；文字／分享抽屜；私下播留在分享區 |
| 2026-08-19 | **殼面＋開局契約：** 大螢幕槽＝主內容（16:9；沒訊號／片子／live／開局同一塊）；成員／檔案／文字三區 RWD；頂列 overlay 可收；開局重用進門 PC（主持選遊戲＋指定／自動入座；不鑄 compose）。凍結 #28–#30 |
| 2026-08-19 | **2d 骨架：** `GoRoomTvSlot` 16:9；主面改大螢幕＋三區；請人在成員區。**尚未完成**（RWD／chrome／既有能力仍有問題） |
| 2026-08-19 | **開局延後：** Phase 3 `session_play` 契約仍凍、實作不排；主面不露玩遊戲。Mesh 仍延後 |
| 2026-08-19 | **劇院態：** 主視訊區可應用內滿窗（看電影／live／日後開局）；槽內無字；廳態三區在流裡，劇院態改 overlay／drawer；禁止以系統 Fullscreen 當劇院態預設。凍結 #28 修訂 |
| 2026-08-19 | **劇院態 UI：** `GoRoomSurface` 大螢幕開自動滿窗；三區／底列 overlay drawer；Esc 先關 overlay 再縮回廳態。系統全螢幕仍是加分（同一顆槽內 `<video>`） |
| 2026-08-19 | **劇院態＝藏面板：** 播放不自動滿窗。底列「隱藏／顯示控制面板」進出劇院態；Esc 仍可縮回。系統全螢幕仍是加分 |
| 2026-08-19 | **劇院態滿窗：** 主視訊佔滿 playing 面；控制面板改跟 header 同一套下拉／peek／3s 收，不再釘在頁底 |
| 2026-08-19 | **劇院態 HUD 原位：** overlay 用廳態下半／右欄幾何，不要底部扁條／drawer |
| 2026-08-19 | **叫出即廳態：** 劇院態沒有控制 overlay；下拉／peek／Esc 回廳態。再進劇院要再隱藏控制面板 |
| 2026-08-19 | **桌機右欄：** 廳態 sidebar 佔滿視窗高；上半檔案、下半 tab 切成員／文字。底列不切右欄 |
| 2026-08-19 | **直式下半 tab：** 寬不到 768px 的直式廳態，螢幕對半——上半大螢幕、下半成員／檔案／文字 tab |
| 2026-08-19 | **單一寬屏右欄：** 撤平板三欄。≥768px＝桌面右欄控制面板（麥列在上）。拿掉「就你一個人 · 把這頁開著…」 |
| 2026-08-19 | **麥列改 icon：** 開麥克風／鏡頭／畫面／從大螢幕拿掉／結束改 44px icon（aria-label 全名） |
| 2026-08-19 | **手機橫式三 tab：** 短橫屏右欄一次一區切成員／檔案／文字，不走桌面上檔案下成員 |
| 2026-08-19 | **在場名單 fanout：** mesh 延後後 Guest 只看得到主持；改走 `session_occupancy` snapshot，第三人加入時每人名單一致 |
| 2026-08-19 | **包廂廣告：** `GoAdSlot` 浮在主視訊區內；節目串流自動藏（不佔流、不因短橫屏另外藏） |
| 2026-08-19 | **大螢幕控制改 HUD：** 播放中點主視訊＝半透明浮動控制（主持片子可播／暫停／seek）；禁止 bottom sheet |
| 2026-08-19 | **全螢幕同一套 HUD：** 系統全螢幕打在大螢幕槽，不用 `<video>` 原生播放器；離開時只喚醒畫面、不改主持時鐘 |
| 2026-08-19 | **HUD 還原＋音量：** 已全螢幕（槽或劇院態）圖示改還原；控制列加本機音量／靜音 |
| 2026-08-19 | **大螢幕一直開著：** 沒來源＝沒訊號（雪花），不是關機。讀者面 `沒訊號`／`從大螢幕拿掉`；`unoffer` 只清輸入 |
| 2026-08-20 | **私下播兩路 Range：** 同一檔最多兩個 `transferId` 同時泵（頭＋尾）；第三路淘汰較遠的（對齊媒體雙連線；下載通常一路 stream-through） |
| 2026-08-21 | **撤「最多兩路／淘汰較遠」：** 同檔可多筆 transfer；開新 Range 不主動 cancel 舊的；各條依 client finished／cancel／abort（SW transfer-complete／abort）收尾 |
| 2026-08-21 | **共用 DC 排程＋priority（硬）：** 多 `transferId` 共用一條 DC；禁止單一 transfer 長佔泵送；Owner 調度器依 priority 分 quantum（playhead／save ＞ prefetch）；低優先 `pause`／少量子，非 UI 互斥。Harness 已可再現 `<video>` 佔線餓死 Range；根治在 DC 排程非躲測試順序。§8.2 RAM／背壓 |
| 2026-08-21 | **實作 `goRoomFileDcScheduler`：** Owner 單迴圈 quantum 泵送；`request.priority`（save＞play）；加權 streak＋anti-starvation；`acceptHttpTransfer` 帶 purpose priority |
| 2026-08-21 | **Job／task 兩層：** job＝file id；每 job 最多 4 concurrent task（滿則 reject）；DC pick＝job→task；`request.jobId`；`goRoomFileJobs` |
| 2026-08-21 | **Job＝file id：** 關聯同一 `/room-file/<id>` 的 HTTP tasks；**不**由 scheduler 決定開哪些 transfer。Page 一頁一遠端 job＝政策（可改）。§8.2 |
| 2026-08-21 | **實作對齊：** admit 只綁 `openRemoteHttp` 的 active file job（不自動開 job）；滿槽 `reject-transfer`→SW 失敗該 HTTP；`GO_SW_REV=40` |
| 2026-08-21 | **Job＝file id（硬）：** 一檔一 job（`<img>`／`<video>`／下載同 id）；SW 以 file id 當 job id、追蹤 tasks；page 現況一頁一遠端 job（政策可改）。`GO_SW_REV=41` |
| 2026-08-21 | **大影片 scrub 獨立：** 真實旅程不含 video；`runVideoScrub`＝隨機快轉＋Host `ioDelayMs` 模擬檔案 I/O；不掛 `<video>`（避 HTTP 連線額度）。 |
| 2026-08-21 | **每檔 task 上限 10；** `runDirectDownloadSched`＝跳過 SW、對 `xf-sched`（1 MiB＋`ioDelayMs`）admit 10 路，**等齊每路 DC 泵滿**＋soft elapsed floor（第 11 路 reject）。`GO_SW_REV=43` |
| 2026-08-20 | **讀者面用語：** `電視` → `大螢幕`（包廂大螢幕／放到大螢幕上／從大螢幕拿掉／沒訊號；計劃與 GLOSSARY 一併） |
| 2026-08-20 | **別人掛的檔上大螢幕：** `file { owner, id }`＝持檔端本機渲染 → 節目 RTP（可 Guest 掛的檔）；呈現型別影→音→圖遞增；doc／任意 MIME 不承諾；否決主持拉檔再播、否決 DC 冒充大螢幕。Phase **2e**；凍結 #31 |
| 2026-08-20 | **2e 實作（video／audio）：** `session_cast.fromPeer`；host `startListedProgram` 遠端檔；owner capture＋Hub `forwardFrom`；reject／持檔端解碼提示 |
| 2026-08-20 | **主持遙控片子時鐘：** 別人掛的檔上大螢幕時，播／停／seek 由主持經 `session_cast.state` 遙控 owner；owner 回報 t／duration；HUD 僅主持有 transport；音量仍本機 sink |
| 2026-08-20 | **Safari 不當大螢幕片源：** 無原生 `HTMLMediaElement.captureStream` 時不走 canvas-only（黑屏／卡頓）；`session_cast.reject`＋`reason`；主持清遠端 cast；頁內說明改 Chrome／Edge 掛檔 |
| 2026-08-20 | **Hub 遠端檔：主持 TV 只綁 owner 接收軌：** 第三人加入時勿用其 program uplink placeholder 蓋掉 `remoteProgramVideo`（否則 Chrome 主持黑屏、重推後 Safari 有畫面） |
| 2026-08-20 | **晚進門重送 `session_cast` offer：** 遠端檔推播中第三人加入時，Hub `refresh` 除轉 RTP 外須重 offer（含 `fromPeer`／id）；否則新人一直「沒訊號」、檔案區無「大螢幕播放中」 |
| 2026-08-20 | **索取端＝同源靜態檔（硬）：** 分享目錄每一檔對索取端像同源 web 靜態資源；下載／檢視／私下播同一 HTTP 門面（建議 `/room-file/<id>`；過渡可沿用 `/room-play/`）；SW 編成標準 Response；運輸仍 `session_file` DC。撤「下載禁止 SW」；仍禁止整檔 Blob／OPFS／Cache。凍結 #5／#17／#19／#23 修訂；§8.2 重寫 |
| 2026-08-20 | **Safari 下載＝頁面 fetch（硬）：** WebKit 下載管理員遇 `Content-Disposition`／`<a download href=/room-file>` 會繞過 SW 打源站 404；遠端落盤一律 `fetch(/room-file/…)`→writable；無 Save picker 僅在 HTTP 收完後用 `blob:` 橋。SW：GET／HEAD／Range → 200／206／404／416／405，不靠 attachment 觸發下載 |
| 2026-08-20 | **大檔 save 不提早 end／不裁未讀：** DC 完成時 UI 可已顯示完整大小，但 play 窗口 trim 若裁掉 pin 前方未讀 bytes＋提早 `end()` → Safari「檔案不完整」。save mode 只丟已讀前綴；`download()` pipe 完才 `end`；SW `v=34` |
| 2026-08-20 | **單主畫面＋在場聲混音：** 否決瀏覽器多路視訊合成進節目（監視牆／會議小格烤一路）。大螢幕維持主持切台一路。星狀下在場聲＝Host `AudioContext` 混音再送（§9.8.1）；節目音不混開口。凍結 #18／#27／#32；Phase **2f** |
| 2026-08-20 | **2f 實作：** `goRoomPresenceAudioMix`；Hub `pushPresenceAudio`（單開麥轉發、≥2 混音、排除自迴音）；關麥重推；節目音不混入 |
| 2026-08-20 | **HTTP↔transfer 隧道綁定（硬）：** 對前端 SW＝標準 HTTP server；每筆 `fetch`／媒體 GET／Range＝完整 roundtrip＝一條虛擬 connection（`transferId`，共用實體 DC）。幾次 request 由 downloader／`<video>` 決定，非 SW。完成權威＝SW 交完該 response 宣告長度；owner `done`＝源端泵完≠成功。否決 file-level 常駐池與 DC／HTTP 認定分裂。§2／§4／§8.2／§9.4／§9.7／凍結 #5／#19 |
| 2026-08-20 | **索取路徑凍結 `/room-file/<id>`：** 契約 URL 僅此形；撤規範面「過渡 `/room-play/`」；下載／檢視／私下播同一路徑 |
| 2026-08-20 | **本機掛檔 SW 直出（硬）：** 前端目錄檔一律 `/room-file/<id>`；自己掛的 `File` 由 SW 滿足 HTTP（可 Range），**不開 transfer、不經 DataChannel**；遠端仍每 roundtrip ↔ transfer。撤「本機可用 object URL」產品路徑 |
| 2026-08-20 | **`transferId` 由 SW 管理（硬）：** 遠端每筆 GET／Range body stream 開時 SW 分配 id 並 `open-transfer`；頁面只 `acceptHttpTransfer`→`session_file.request`。UI／play／download／seek 只發 HTTP。SW `v=36`；撤頁面 `need`→`seekPlay` 自造 id |
| 2026-08-20 | **完成權威＝SW 交付（硬）：** SW 交完／abort 該 HTTP body → `transfer-complete`／`transfer-abort`；頁面 `noteHttpTransferEnd` 才收尾。owner `done` 只標源端泵完。live stream 交齊宣告長度即可 close（不必先 `end`，保 Edge／Safari 讀前不裁 spans）。SW `v=37` |
| 2026-08-20 | **頁面不直出本機檔（硬）：** 索取／預覽／大螢幕解碼一律 HTTP `/room-file/<id>`；本機優化只在 SW（`File.slice`）。頁面不得頁內 Registry `Response`／`createObjectURL(File)`。Owner 仍持 `File` 只為掛上＋把 handle 交給 SW＋遠端 DC 泵 |
| 2026-08-20 | **Range length 對齊（硬）：** `request.length`＝該筆 HTTP body；owner 泵到 offset+length；`noteHttpTransferEnd` 以 Range／SW `delivered` 為成功條件（非整檔 remainder）；完成後 `cancel` 停泵；play 成功不 `end` sink（可再 seek）；背壓 `pause` 含 mid-file Range；撤 `?download=1` CD 門面 |
| 2026-08-21 | **主持私有檔（硬）：** Host OPFS 片庫與分享目錄分離；不 fanout、不上 `/room-file`；可上大螢幕（`scope: "private"`→僅節目 RTP）；要分享＝顯式掛到分享；散場不清 OPFS；Guest 無私有區。收窄「禁 OPFS」＝僅禁分享傳檔緩衝。§2／§3／§4／§5.5.1／§5.7／§8.3／§9／§11／凍結 #5／#9／#17／#19／#24／#27／#31／**#33**；Phase **2g** |
| 2026-08-21 | **Mesh 檔直連（1c 契約）：** Guest 除進門 Host 外可試建 Guest↔Guest DC（`session_mesh`）；**下載／私下播**在索檔↔持檔有直連時不經 Host relay；失敗回 star。節目／在場 RTP 仍 Hub。撤「mesh 全面延後」；凍結 #20／§7.4／Phase 1c 修訂 |
| 2026-08-21 | **Mesh 建邊＝名單變動、非傳檔：** 在線 Guest 變動（進門見既有／後續新人）Host `hello` 後**立刻** dial；同一 peerId **失敗不重試**；「要」檔只查 `hasDirect`、禁止此時建邊。§7.4／凍結 #20 修訂 |
| 2026-08-21 | **1c 實作：** `GO_ROOM_MESH_ENABLED = true`；`goRoomMeshClient` 一次機會（fail／close 進 dead、bye 清）；Host introduce／forward；傳檔 `sendBinary(dest)` 直連優先 |
| 2026-08-21 | **開局實作計劃索引：** Phase 3／§5.9 指向 [PG-GO-ROOM-PLAY-PLAN.md](./PG-GO-ROOM-PLAY-PLAN.md)（重用 peer、`session_play`；實作仍延後） |
| 2026-08-21 | **開局 Phase 1–2 初刀：** `session_play` wire／席次／Host fanout＋晚進門重送；見 PLAY 計劃（主面仍不露 CTA） |
| 2026-08-21 | **2g 實作（初刀）：** `goRoomPrivateOpfs`＋`goRoomPrivateFiles`；`session_cast.scope`；`startPrivateProgram`（blob 片源、不 register `/room-file`）；主持檔案區私有／分享分段；掛到分享→既有 `shareLocalFile`；散場 detach 不清 OPFS |
| 2026-08-21 | **Mesh＝DC-only（修雙 Guest 大螢幕黑屏）：** `session_mesh` 改 `media: "none"`；`goRoomMedia` 忽略 `via: "mesh"`；Guest 媒體 peers 只含進門 Host。兩 Guest 時 mesh 空節目軌曾蓋掉 Host RTP → 雙黑、一人離則恢復 |
| 2026-08-22 | **劇院態：** 改回滿窗**不顯示** dock／tab（叫出 chrome＝回廳態）；撤薄 dock 實驗 |
| 2026-08-22 | **文件↔實作對齊：** 主舞台＝`GoRoomTvSlot`；UI tab「**聊天**」；結束／離開在 dock（廳態）；RWD 斷點＝viewport；凍結 #6 mesh＝DC-only；成員區一次性 TV hint |
| 2026-08-22 | **2e image：** 圖檔上大螢幕（`<img>`／canvas.`captureStream` 低幀靜態節目軌；分享＋私有；無 seek HUD；wire kind＝video；doc 仍延後） |
| 2026-08-22 | **2b 收斂：** 下載／圖檢視與影音私下播同一 `/room-file/`；撤未用 `createImagePreviewSink` blob 路徑；**3** act 隧道單元（`attachExistingPeer`＋`session_act`） |
| 2026-08-22 | **開局第一刀手測：** `pg-gomoku` Host＋Guest 連線對弈至終局、可重開；TV memory BC 綁定修復；Phase **3**／PLAY Phase 5 第一刀完成 |
| 2026-08-22 | **redpick deal→end：** domain 全手；終局剩桌歸 `lastCapturer`（跨 act）；下一刀＝多人傳檔 e2e |
| 2026-08-22 | **多人傳檔 e2e：** Host＋2 Guest star 下載／Guest→Guest 經 Host；`requesterBufferedAmount(dest)` 修正並發 backpressure |
| 2026-08-22 | **音檔大螢幕 player（契約）：** 推播音樂／音檔 → 全場 audio player 面；僅主持 transport（seek／快轉／倒帶）；音量本機；面內依音量／節奏跳動（本機節目音 Analyser）。§5.7.1／§10.5／Phase **2h**／凍結 **#34** |
| 2026-08-22 | **2h 實作：** `goRoomAudioPlayer`（face 判定＋Analyser levels）；`GoRoomTvSlot` audio player 面（bars＋碟片）；`remoteProgramKind` 進 UI store；本機推音設 `ownerDecodeKind`；HUD transport 仍僅 host-file |
| 2026-08-22 | **2h 修：訪客有動畫無聲：** `createMediaStreamSource` 會帶走 `<video>` 可聽路徑；改 `Analyser→Gain→destination`，音量走 GainNode；audio face 時 `<video>` 保持 muted |
| 2026-08-22 | **2d+ 斷點上調：** 大螢幕｜右欄 `768→1024`（`64rem`）；控制欄內雙欄 `1280→1440`（`90rem`）；§5.8／凍結 **#28** |
| 2026-08-23 | **多路 live 錄影契約索引：** `session_record` §7.2／§9.7；§9.9 預留；細化「不錄製」＝不上雲／不自動錄。詳見 [PG-GO-ROOM-RECORD-PLAN.md](./PG-GO-ROOM-RECORD-PLAN.md)（**未落地**） |