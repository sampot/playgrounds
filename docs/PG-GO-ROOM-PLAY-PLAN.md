# Playgrounds 純玩版：包廂內重用 peer 開局（`session_play`）

> **狀態：** Draft（2026-08-22）— **契約從屬** [PG-GO-ROOM-PLAN.md](./PG-GO-ROOM-PLAN.md) §5.9／凍結 #30／Phase **3**；**Phase 0–5 第一刀手測完成**（`pg-gomoku` Host＋Guest 連線對弈至終局、結束局後可再開；觀戰：殼 channel＋`pg-gomoku` `tryBootAsSpectator`；**harness 第三人觀戰已確認**）  
> **權威決策：** 從屬 [DECISIONS.md](./DECISIONS.md) **DEC-050**（純玩版）、**DEC-045**（已有可用 PeerConnection → **重用**，禁止 Platform renegotiation）、**DEC-047**（Platform Invite）；**不另開 DEC**  
> **相關：** [PG-GO-ROOM-PLAN.md](./PG-GO-ROOM-PLAN.md)（包廂產品契約／媒體／傳檔——**本文件只寫開局落地**）、[PG-GO-HOST-INVITE-PLAN.md](./PG-GO-HOST-INVITE-PLAN.md)（GO-INVITE＝`invite.compose`；**勿混**）、[PG-INVITE-E2E-MVP.md](./PG-INVITE-E2E-MVP.md)（五子棋 `gomoku.v1`）、[PG-GO-CLIENT-PLAN.md](./PG-GO-CLIENT-PLAN.md)、[PG-GO-ROOM-DEV-HARNESS-PLAN.md](./PG-GO-ROOM-DEV-HARNESS-PLAN.md)（localhost／Agent 多 tab；開局 E2E 可建其上）、[PG-GO-SESSION-CHAT-PLAN.md](./PG-GO-SESSION-CHAT-PLAN.md)（局內 overlay——**勿混**）、`.cursor/rules/no-native-dialogs.mdc`、`.cursor/rules/mobile-first-ux.mdc`、[GLOSSARY.md](./GLOSSARY.md)  
> **載體 SAM：** 型錄 [`pg-gomoku`](../catalog/entries/pg-gomoku.yaml)（`gomoku.v1`；roles＝`host`＋`player`）；[`pg-redpick`](../catalog/entries/pg-redpick.yaml)（`redpick.v1`；roles＝`host`＋`p2`＋`p3`＋`p4`）

一句話：包廂進門已連（Guest↔Host PC）→ 主持用 **`session_play`** 在**同一條連線**上開 SAM 局；大螢幕槽掛畫布；入座席走既有 `avatar_relay`；**不鑄** `invite.compose`、**不改** Guest `/i/`、**零** Platform 第二輪 O／A。終局可「結束這一局」而包廂還在。

---

## 1. 動機

- 包廂已能請人進來一起看大螢幕、開口、傳檔；下一步自然是**在這間裡開一局**，而不是散場再掃遊戲 QR。
- GO-INVITE（[`invite.compose`](./PG-GO-HOST-INVITE-PLAN.md)）服務「還沒進包廂、為某一款拉人」——人已在包廂時再鑄 compose＝多餘握手、拆「這一間」語意、Guest 網址被逼換。
- DEC-045／047：**已有可用 PeerConnection → 重用**。包廂進門那次 Platform 握手就是唯一回合；開局只在既有 DC 上加控制面。
- 用主持畫面 `captureStream` 冒充「一起玩」＝看片，別人沒有操作權——契約否決（ROOM §5.9／#21）。

---

## 2. 目標

- **重用進門 PC** 開 SAM session；控制面＝`session_play.offer`／`end`（fanout；不經 Platform；不載 SAM bytes）。
- **大螢幕槽**掛同一顆 SAM 畫布（與片子／live 同一 slot；開局＝切台）。
- **只有主持**能選遊戲、指定／自動入座、開／關局。
- **席次**從協議 roles；開局當下必須滿席；未入座＝觀戰同一畫布。
- **Guest 網址仍是包廂** `/i/<short>`；禁止 `replaceState` `/room`／`/s/<id>`／另一張 compose `/i/`。
- **結束這一局** ≠ 散場；結束這一間＝連線＋局一起散（確認文案說明遊戲會停）。
- **完成依據（第一刀）：** Host＋1 Guest 在包廂內五子棋入座對弈至終局 → 結束這一局 → 包廂仍可文字／再播片；第三人在場＝觀戰。

---

## 3. 非目標

- 另鑄 `invite.compose`、Platform renegotiation、為開局新建 PeerConnection。
- 局中換席、開局後補位、晚進門強行入座（晚進＝觀戰，等下一局）。
- 多路視訊合成／用 RTP 代替一起玩。
- 把包廂開局做成局內 `session_chat` overlay 產品面。
- 第一刀支援任意 `kind: game`（僅鎖有明確席次者；首驗＝`pg-gomoku`）。
- 單機小品「放到大螢幕上給大家看主持在玩」與「指定入座一起玩」混成同一 CTA（另標；見 ROOM §5.9）。
- 改遊戲 compose SDP（維持 DC-only）；為開局自動開相機。
- 完美斷線重連、雲存棋譜（對齊既有 Invite 粗暴恢復）。

---

## 4. 與既有通路（勿混）

| 流 | 是 | 不是 |
| --- | --- | --- |
| **本刀 `session_play`** | 包廂已連 → 重用 PC → 大螢幕掛 SAM | GO-INVITE；局內 overlay |
| **GO-INVITE** | 還沒進包廂、鑄 compose 拉人 | 包廂內開局快樂路徑 |
| **`session_cast`** | 片子／圖／音／live 節目 RTP | 開局控制面 |
| **`session_chat`** | 文字（包廂三區或局內 overlay） | 開局／入座 |

產品用語：讀者「玩遊戲」「結束這一局」；**不要**把包廂開局叫「邀請對弈」（那是 GO-INVITE）。

---

## 5. 契約摘要（權威在 ROOM；此處不另凍）

完整硬規則見 [PG-GO-ROOM-PLAN.md](./PG-GO-ROOM-PLAN.md) §5.9、§7.2、§9.9、凍結 #30。本文件落地時**不得**放寬下列項：

1. 重用進門 PC；禁止 compose／改 Guest 網址。
2. 僅主持選局／指定席／開關局。
3. 自動入座：主持佔 host 席（若有）→ 其餘依**進門順序**；滿則停；同一人兩台＝兩 peer，自動**不要**預設塞兩席。
4. 手動：成員點人；開局當下席必須滿，否則不開、頁內說明。
5. 第一刀不做局中換席／開局後補位。
6. 遊戲 SAM 忽略閒置 2+2 A／V；不因開局自動開相機。
7. 開局時節目可 `unoffer`；結束局＝卸載畫布、節目 `<video>` **綁定不拆**（勿 `display:none` 解碼停）。
8. 主持主面 CTA＝「玩遊戲」→ **頁內 Modal**（型錄 `listRoomPlayableGames`）；自動入座開局；完整手動指定席＝後續。

---

## 6. 架構

```text
┌─ 包廂層（已有；ROOM）──────────────────────────────┐
│ invite.room · 進門 2+2 PC · chat/file/cast/mesh…  │
└──────────────────────┬───────────────────────────────┘
                       │ 重用同一 PC／同一 DC
┌─ 開局層（本計劃）──────────────────────────────────┐
│ session_play  — 掛哪顆 SAM、誰坐哪席、何時 end      │
│ materialize   — 各端 local-first 載同一 catalogId  │
│ 大螢幕槽      — 掛畫布（藏節目視覺、不拆綁定）      │
│ avatar_relay  — 入座席 session_invite*／act／event │
│ 觀戰          — 同畫布；不佔 role；不發 act         │
└────────────────────────────────────────────────────┘
```

**兩層拆開（硬）：**

| 層 | 職責 |
| --- | --- |
| **`session_play`** | 包廂控制面（何時掛哪顆、席次 peerId）；**不**承載對弈規則 |
| **`avatar_relay`** | 既有 SAM session 隧道（invite／seat／act／event）；權威仍在 Host 本機 SAM |

Host 本機跑 Host SAM（與 GO-INVITE 同）；被指定的 player **不是**新主持。

### 6.0 殼層→SAM 語境（`pg_surface`）

畫布必須知道自己在**單機**還是**包廂**，才能簡化 UI／入座（連線遊戲快樂路徑＝包廂；`/s/`＝單機）。

| 入口 | `pg_surface` | 遊戲行為 |
| --- | --- | --- |
| go `/s/<id>` | `solo`（缺省） | 只單機；**不**露邀請對弈／開場／鑄 compose |
| 包廂大螢幕槽 | `room` | 只連線對弈；入座席由殼層 `session_play`＋`avatar_relay`；遊戲只做選先手／開始／落子／結束局 |

**傳遞（硬）：**

- SW 畫布 entry URL 查詢參數：`pg_surface=solo|room`（例：`…/index.html?v=3&pg_surface=room`）
- Memory／srcdoc：注入 `<meta name="pg:surface" content="room|solo">`（srcdoc 無可用 `location.search`）
- 遊戲讀取順序：`URLSearchParams` → meta → 預設 **`solo`**

結束這一局（遊戲內「結束這一場」或殼「結束這一局」）→ 卸畫布／清 session；**不**關包廂 PeerConnection。

### 6.1 狀態機

```text
包廂 open（無局）
  │ 主持選遊戲＋滿席確認 → session_play.offer fanout
  ▼
play.loading   — 各端 resolveGoSamFiles(catalogId)；槽準備掛畫布
  │ 入座席就緒（或失敗 → 頁內說明；主持 end／不進 active）
  ▼
play.active    — 入座席跑 session；觀戰同畫布
  │ session_play.end 或終局後主持結束這一局
  ▼
包廂 open（無局）— unmount SAM；可再 cast 片子／再開一局
```

「再來一局」（第一刀）：同批席、同 `catalogId`——主持 `end` 後再 `offer`，或殼層 replay；不必做局中換席。

晚進門：只能觀戰；Host 須對新人**重送**當前 `session_play` snapshot（對齊 cast 晚進門重 offer）。

---

## 7. Wire

### 7.1 `session_play`（與 presence／avatar_relay 同級）

```text
session_play.offer  { from: host, catalogId, rev?, seats: [{ role, peerId }] }
session_play.end    { from: host }
```

- **fanout** 給所有在場 peer（經 Host Hub DC；與 chat／cast 同星狀）。
- **不**經 Platform；**不**載 SAM FileMap bytes（各端自 `catalogId` local-first／check-tip 下載）。
- 席次對不上、人數不足、或 `from` 非主持 → 忽略／不開、頁內說明。
- 建議模組：`src/components/playgrounds/roster/rosterSessionPlay.ts`（對齊 `rosterSessionCast`）。

### 7.2 與 `session_invite` 的關係

建議**分開**：

1. Host 發 `session_play.offer`（包廂級鎖定 catalog＋seats）。
2. 各端載 SAM；入座席就緒後，Host 對 seats 內 peer 發既有 `avatar_relay`／`session_invite`（role 來自 seats）。
3. 包廂內可**自動 accept**（人已同意進門）；若需協議摘要，用薄頁內說明、勿再掃碼。

禁止把對弈 `act` 塞進 `session_play` payload。

---

## 8. 席次演算法（純函式；先測）

`assignRoomPlaySeats({ protocolRoles, hostPeerId, occupantsOrdered, mode, manualPicks })`

| mode | 行為 |
| --- | --- |
| **auto** | host 席 → `hostPeerId`（若協議有 host）；其餘席依 `occupantsOrdered`（進門序）跳過已佔、跳過建議「同一顯示名多台」預設雙填；滿則停；多餘＝觀戰 |
| **manual** | `manualPicks` 必須正好填滿每個 role 的容量；同一 `peerId` 不佔兩席；不足／過剩 → `ok: false`＋缺額文案鍵 |

開局閘：`ok !== true` → **不**發 `session_play.offer`。

---

## 9. 實作切面

| 層 | 建議 | 對齊現況 |
| --- | --- | --- |
| Wire | `rosterSessionPlay.ts`＋單測 | 同族 cast／chat／mesh |
| 席次 | `goRoomPlaySeats.ts`（或同檔純函式）＋單測 | 無 UI |
| Host | `roomRuntime`：選局 → seats → fanout offer → **在既有 peer 上**開 session | 今日 room **無** SAM；勿複製整份 mint compose |
| Session core | 自 `hostRuntime` **抽出**「已有 `RosterPeerSession[]` → openSession → invite／act 隧道」；compose 路徑繼續自管 Platform answer loop；包廂路徑**注入** room peer 表 | 禁止包廂呼叫 `mintPlatformInvite({ kind: "invite.compose" })` |
| Guest | `guestRuntime` room 分支：收 offer → `resolveGoSamFiles` → 掛槽；在 seats → accept；否則觀戰 | 今日 room **跳過** `loading_sam` |
| 殼面 | `GoRoomTvSlot`／`GoRoomSurface`：`play.active` 掛 canvas；藏節目視覺、不拆綁定；點槽＝操作／觀看，勿誤開影片 HUD | ROOM §10.5 |
| UX | 成員區「玩遊戲」→ Modal（型錄驅動）→ 自動入座；狀態句「正在玩遊戲」；Guest 無 CTA | 勿硬編碼單一遊戲按鈕 |
| 媒體 | 開局前 unoffer 節目（切台）；麥／文字／檔不因開局停；mesh 不承載 session | ROOM §5.7／#19 |
| Catalog | 可開局＝`kind: game`＋宣告 `protocols`（roles≥2）；含 `pg-gomoku`、`pg-redpick` | `hostableProtocolFor` |

### 9.1 觀戰

- 所有在場端 materialize **同一** `catalogId`。
- 未在 `seats[]`：**不**佔 protocol role、**不**送 `act`；UI「觀戰中」。
- 畫面同步走既有 Host event fanout；無觀戰模式時殼層 disable 輸入即可。
- **實作：** Host `open` 後重送 `session_play.offer` 附 `sessionId`／`channelName`；Guest 觀戰端綁 `createRosterSessionWatchBridge`（`act`→forbidden）；包廂 TV **一律 memory canvas**＋`publishGoMemoryBroadcast`（含 onload 前 queue；避免 SW／Edge BC 漏事件）；`pg-gomoku` `tryBootAsSpectator`（`onlinePanel`，勿用未定義 `onlineSection`）。**harness 已確認**第三人「觀戰中」＋落子同步。

### 9.2 失敗

| 情況 | 預期 |
| --- | --- |
| 席不滿 | 不 offer；頁內說明缺額／可請人進來 |
| 入座席 SAM 下載失敗 | 不進 active；頁內說明；主持可 end |
| 入座席斷線 | 對齊既有粗暴結束局（可 end play；包廂可仍 open） |
| 非主持發 play | 忽略 |
| 開局中點廣告進 `/s/` | 頁內確認（須先結束這一局或一併散場） |

---

## 10. UX（對齊 ROOM §10；mobile-first）

- 主持：成員區／大螢幕控制「玩遊戲」→ 頁內 sheet（勿跳 `/apps` 整頁）。
- Guest：**無**開局 CTA；可被指定入座或觀戰。
- 窄屏：sheet 全寬；熱區 ≥44px；禁 `alert`／`confirm`／`prompt`。
- 劇院態：開局後點主視訊＝畫布操作或觀看；系統 Fullscreen 非劇院態本體。
- 結束這一局（主持）≠ 結束這一間；文案分開。

---

## 11. 階段與完成定義

| Phase | 內容 | 完成定義 | 狀態 |
| --- | --- | --- | --- |
| **0. 契約索引** | 本文件；ROOM §5.9／Phase 3 指向此處 | 開局實作範圍與 GO-INVITE 切界清楚 | **完成** |
| **1. Wire＋席次** | `rosterSessionPlay`；`assignRoomPlaySeats`；單測 | parse／guard；auto／manual 滿席／缺額案例綠 | **完成** |
| **2. Peer 上掛 session** | 抽出 session core；room 注入既有 peer；假 DC：offer→載 stub→invite／act 一回合 | **零** Platform mint／join；end 後 peer 仍可 chat | **完成**（`attachExistingPeer`／`inviteRoomPlayPeers`／`closeSessionKeepPeers`；Guest load＋auto-accept；**act 隧道單元**） |
| **3. 大螢幕槽** | TV slot 掛／卸 canvas；節目綁定保留 | active 見畫布；end 回沒訊號；video 元素仍在 DOM | **完成**（`GoRoomTvSlot`；memory BC 綁定；手測） |
| **4. 主持 sheet UX** | 型錄 game → Modal 選局；自動入座；狀態／結束局；Guest 無 CTA | 窄屏可開局；席不滿頁內說明；無原生 dialog | **完成**（「玩遊戲」Modal；手動指定席待） |
| **5. 五子棋 e2e** | Host＋Guest 包廂內對弈至終局；第三人觀戰；結束局後包廂仍在 | Guest URL 始終包廂 `/i/`；可再播片／文字 | **第一刀手測完成**（連線對弈＋重開新局；觀戰 event channel **單元綠**；**harness 第三人觀戰已確認**） |

**前置（非本文件交付）：** ROOM Phase **2d** 殼面 RWD 手測已完成。剩餘：手動指定席 UI、多人傳檔 e2e。

建議刀序：**0 → 1 → 2 → 3 → 4 → 5**（第一刀已過）。TDD：可執行邏輯先寫失敗測試（席次、wire、peer 掛 session）。

---

## 12. 驗收清單（實作後）

- [x] `session_play.offer`／`end` 經既有包廂 DC fanout；不經 Platform
- [x] 開局**不** mint `invite.compose`；Guest **不**改網址
- [x] 進門 PC 重用（無第二輪 Platform O／A）
- [x] 自動入座；席不滿不開；同一 peer 不佔兩席（**手動指定席 UI 待**）
- [x] 大螢幕槽掛 SAM；結束局卸載；節目綁定不拆（手測）
- [x] 入座席可對弈（Host＋Guest 手測；觀戰 event channel **單元綠**；harness 第三人觀戰已確認）
- [x] 晚進門重送 play snapshot（含 `sessionId`／`channelName`）；只能觀戰
- [x] 結束這一局後包廂仍 open（文字／檔／可再 cast；**可再開新局**手測）
- [ ] 結束這一間確認文案含遊戲會停
- [x] 無 `alert`／`confirm`／`prompt`；窄屏可完成選局／自動入座／終局
- [x] 第一刀：`pg-gomoku`／`gomoku.v1` Host＋1 player 至終局（手測；可重開）

---

## 13. 文件與用語

| 用 | 不用 |
| --- | --- |
| 玩遊戲、結束這一局、觀戰、入座、重用連線 | 邀請對弈（GO-INVITE）、房間配對、另掃遊戲碼當快樂路徑 |
| 包廂還在／結束這一間 | 把結束局說成散場 |
| 大螢幕上開一局 | 直播對戰、P2P 開房、用主持畫面當一起玩 |

---

## 修訂紀錄

| 日期 | 變更 |
| --- | --- |
| 2026-08-21 | 初版 Draft：自 ROOM §5.9／Phase 3 抽出實作計劃；`session_play`＋重用進門 PC；與 GO-INVITE 切界；階段 0–5（實作延後） |
| 2026-08-21 | **Phase 1 落地：** `rosterSessionPlay`＋`goRoomPlaySeats`；**Phase 2 初刀：** `goRoomSessionPlay`、Host `offerPlay`／`endPlay` fanout、晚進門 snapshot、Guest apply；主面仍不露 CTA |
| 2026-08-21 | **Phase 2–4 續：** Host `attachExistingPeer`／合成 invite；`goRoomPlayBootstrap`；TV 槽 iframe；成員區「玩五子棋」；Guest load＋auto-accept |
| 2026-08-21 | **`pg_surface=solo\|room`：** 殼層掛載語境；`/s/` 單機、包廂連線；gomoku 依 surface 簡化 UI；結束局 keep-peers |
| 2026-08-21 | **玩遊戲 Modal＋`pg-redpick`：** 型錄驅動選局；`redpick.v1` 四席；取代硬編碼「玩五子棋」 |
| 2026-08-22 | ROOM **2d** RWD 手測完成；開局前置改為傳檔快樂路徑／e2e |
| 2026-08-22 | ROOM **2e image** 落地（不阻塞開局） |
| 2026-08-22 | Phase **2** act 隧道單元（`attachExistingPeer`＋`session_act`→`/api/session/act`＋`session_act_result`） |
| 2026-08-22 | **fix：** 包廂 TV 槽 `onload` 綁 `setGoMemoryCanvasWindow`——srcdoc memory canvas 否則收不到 Guest `session_event`（主持端看不到對方落子） |
| 2026-08-22 | **手測：** `pg-gomoku` Host＋Guest 連線對弈至終局、結束局後可再開；Phase 3／5 第一刀完成 |
