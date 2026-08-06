# Playgrounds 跨場 Roster／Avatar 計劃（DEC-045）

> **狀態：** Phase 0–3 **已落地**；Phase 4.1–4.2 **已落地**（邀請連結＋相機掃 QR）；薄 CF rendezvous → [PG-PLATFORM-API-PLAN.md](./PG-PLATFORM-API-PLAN.md)／DEC-047；TURN 未做  
> **權威決策：** [DECISIONS.md](./DECISIONS.md) **DEC-045**  
> **相關：** DEC-017（側欄 Files／總管）、DEC-023（本地 session；邀請＋protocol 規格＋型錄 lazy install）、DEC-031（peer／homePeer／virtual actor）、DEC-038（WebRTC 通道路線）、DEC-042（場網／無租戶）、DEC-046（型錄查詢）、DEC-047（Platform Invite／signal）、[GLOSSARY.md](./GLOSSARY.md)

一句話：**薄 signaling 只完成每握手槽一次經樣板壓縮的 offer／answer；連上後只走 WebRTC；Roster＝本場連線使用者名冊（可同時多 peer）；每位連線者在本場自動出現一個 Avatar（薄投影 SAM／User agent），權威與執行仍在對方 `homePeer`，經 Roster DataChannel 轉。Session 入座不為 Avatar 特規——邀請附完整 protocol 規格，遊樂場以型錄為虛擬可用集合、lazy install 兌現相容 SAM。**

---

## 模型

| 概念 | 意思 |
| --- | --- |
| **Roster** | 跟**當前這場**連上的使用者列表（連線名冊）＋ peer／DataChannel 管線。**可同時多 peer**。舊稱 Visit。 |
| **Avatar／化身** | 每位連線使用者在**本場**自動建立的 **User agent 投影**：薄 SAM／proxy；可 agent 模式執行；有 UI。**線上** tab 卡片＝該投影 SAM 的呈現面（不是場殼手畫的終態列表項）。 |
| **homePeer 真身** | 對方場裡的實際 agent／執行與沙盒權威；mailbox／狀態真相在彼。 |
| **為什麼叫化身** | Avatar 代替真實使用者，在本場裡當虛擬代理／投影——不是對方本機的 clone。 |

**權威：** 投影不擁有對方 OPFS／Durable 權威；訊息與 `act`／事件經 Roster DataChannel 轉回對方 `homePeer`（Host 場仍為 session 權威）。斷線 → 撕掉本場投影實例，不殘留對方權威資料。

**Phase 1–3 現況：** 連上即 spawn 投影 Avatar；DataChannel 含 `avatar_relay`（ping／pong、session invite／act／event）。Host 可邀化身入座；座位標記 `remote`（proxy）；權威 act 在 Host，homePeer 經隧道發言並收事件。接受時走型錄／已安裝解析，必要時 lazy install（coding-orch＋`pg-llm-agent`）；`brainstorm.v1` 無型錄命中時退回內建 participant starter。

### Session 與協定（不特規 Avatar）

遠端入座走 **DEC-023 同一套 session 邀請路徑**；Avatar 只影響**呈現**（化身卡片上顯示邀請）與**傳輸**（經 Roster 橋到 homePeer），**不**另建 Avatar 專用協定引擎。

| 規則 | 說明 |
| --- | --- |
| **邀請附完整 protocol 規格** | 不只 `protocolId` 字串；含足以做相容判斷的規格（`apiVersion`、roles／capabilities、訊息與 `act` 形狀，或可解析的規格引用）。可選建議來源（catalog id／`?open=`），**權威是規格相容**，非硬綁單一 repo。 |
| **型錄＝虛擬可用** | 類比 DEC-031 virtual actor：型錄上的 SAM 假設「已可使用」，尚未安裝≠無能力。 |
| **Lazy installation** | 接受邀請後：已安裝相容 → 開／dehibernate 入座；未安裝 → 自型錄（或規格提示之來源）安裝後入座；找不到／拒 → 拒絕邀請。對齊 hibernate：有事件才物化。 |
| **本機與遠端同一閘門** | 一般 Participant 與經 Avatar 進來的入座，都用上述解析；不因「是 Avatar」換一套相容邏輯。 |

聊天狗糧（示意）：Host（chat SAM）邀 Roster 上 Alice 的 Avatar → Alice 場上「我的 Avatar」卡片顯示邀請（附 chat protocol 規格）→ 同意 → 型錄匹配／lazy install chat 相容 SAM → 入座；執行在 Alice `homePeer`，本場仍見其投影。

---

## 目標

- 兩台瀏覽器可經邀請連成 peer；本場 Roster 列出連線使用者。
- 連線完成後**雙方**各為對方建立／顯示 Avatar（投影；`homePeer` 仍在各自本機）。
- Avatar 可經 **DEC-023** 入座（邀請＋完整 protocol 規格＋型錄 lazy install；執行仍打回 homePeer）。
- 場主**不**負擔資料面雲費；signaling 極薄、可 rate limit、可 OOB。

## 非目標

- Signaling 中繼 DataChannel／presence 心跳／session 事件／檔案（資料面只走 WebRTC peer）。
- Trickle ICE、renegotiation、第二輪 offer／answer 走同一房。
- 預設營運 TURN；跨 origin 自動搬 OPFS／SecretStore（DEC-042）。
- 把對方沙盒 **clone** 成本場權威；把 Avatar 當成擁有對方 FS 的本機實體 agent。
- 為 Avatar **另建**一套 session／protocol 系統（與 DEC-023 分叉）。
- 完整 WebRTC Runtime 叢集（DEC-038 長線；本計劃先 Roster／Avatar 投影）。
- 把 Avatar 塞進總管 iframe 或 Files 樹（線上 tab 專屬呈現）。

---

## 場主 UX

| 項 | 決定 |
| --- | --- |
| **位置** | 左側側欄 **線上** tab（label＝`線上`；鍵 `avatars`），與 **Files／總管** 並列（三 tab）。內容＝連線中的 Avatar／化身投影列表（概念名仍可稱化身；tab 用語對一般使用者用「線上」） |
| **內容** | 預設＝**線上名冊**（Roster 列表）；**發起／加入** 為 CTA，表單按需展開（名冊有人時仍可邀請另一人）。**規格需求：可同時多 peer**（多名冊／多 Avatar）；握手可串行。**現況實作缺口：** 同時僅一 peer，新連線會結束現有——應對齊多 peer 後消除。角色＝initiator／responder（UI 不說場主／訪客；亦不暴露 offer／answer 等術語）。Platform Invite 路徑誰出 offer 見 [PG-PLATFORM-API-PLAN.md](./PG-PLATFORM-API-PLAN.md) |
| **空態** | 無連線時列表為空 |
| **頭像** | 每個 Avatar **預設 identicon**（本機由穩定 id 衍生；不預設外站圖） |
| **自訂圖** | 可後段；不擋 MVP |
| **白話對照** | OOB：邀請≈發起方 offer、回覆≈answer；Platform Invite：加入者出 offer、邀請者回 answer（使用者仍說邀請／加入）。QR＝QR code；同一區網＝lan |

layout 還原：側欄 tab 鍵 `avatars`（與 `files`／`agent` 一併 persist）。

實作（transport／stub）：`src/components/playgrounds/roster/`（`AvatarsPanel.svelte`、`rosterSdpCodec`／`rosterWire`／`rosterPeer`／`rosterQr`／`rosterIdenticon`／`rosterStore`）。QR 套件＝npm **`qr`**；產出 **PNG**（禁止 SVG）。投影 Avatar SAM 範本與 spawn 路徑另段落地。

---

## Signaling 契約（硬）

| 規則 | 說明 |
| --- | --- |
| **每握手槽一次** | 恰好 **1× offer**＋**1× answer**（≠ 全場只能一 peer） |
| **非 trickle** | ICE 收齊後再發布；**無** candidate 訊息類型 |
| **樣板壓縮** | 剪裁必要欄位 → 固定樣板編碼／解碼還原 SDP；**不**傳完整原始 SDP |
| **同區網（可選）** | 宣告 peers 同一 LAN 時，offer／answer **進一步剪裁**（載荷標明模式；雙方一致） |
| **交換方式** | **QR** 或 **文字**（複製／貼上）同等；同一壓縮字串；可選 Platform 短連結 rendezvous |
| **QR 尺寸** | 載荷須小到**單張 QR 易掃**；Platform 邀請 QR **預設短連結**（見 DEC-047） |
| **用完即銷** | 該握手槽：answer 完成、失敗或 TTL → 銷槽；拒再寫 |
| **無重談** | 需重連該 peer → **新握手**；舊槽作廢。**已連線 peer 重用**，不經 Platform／OOB 再跑 O／A（見 DEC-047） |
| **無資料面** | 伺服器永不轉發 session／mailbox／FS／Avatar 投影流量 |
| **格式統一** | QR／文字／薄 rendezvous **同一壓縮格式**（含同區網旗標） |
| **多 peer** | **需求**可同時多條已連線 peer；Platform 路徑握手可**排隊串行**（DEC-047） |

建議 wire 形狀：`{ v, role: "offer"|"answer", tpl, lan?, fields… }`（樣板版號＋可選同區網＋變動欄；細節以實作為準）。

**OOB vs Platform：** OOB（`#roster=`／QR／文字）＝發起者 offer。Platform Invite＝加入者 offer、邀請者 answer、一連結多人、排隊——見 [PG-PLATFORM-API-PLAN.md](./PG-PLATFORM-API-PLAN.md)。

**同區網剪裁（建議方向，非鎖死實作）：** 優先 host candidates；略過需公網 STUN／relay 的候選；fingerprint／ufrag／pwd 仍必備。誤選 → 連線失敗時提示改「一般／跨網」並發**新** offer／answer。

**Rate limit（建議）：** 每 IP 開槽／join 上限；每槽僅允許一次 answer；錯碼計入；可疊 CF Free zone 一條 path 規則。

---

## 階段

| Phase | 內容 | 完成定義 | 狀態 |
| --- | --- | --- | --- |
| **0. 契約** | DEC-045、本計劃、GLOSSARY | signaling＋樣板壓縮／QR｜文字＋Avatars tab；Roster／Avatar 投影＋session 不特規語意清楚 | **完成**（語意持續修訂） |
| **1. Transport** | 非 trickle＋樣板編解碼；**QR 與文字**；可選同區網進一步剪裁 | 一般／同區網皆可 handshake；DataChannel ping | **完成** |
| **2. Presence stub＋側欄** | 連入後雙方列表＋identicon；斷線清除 | 雙方互見對方 stub（投影 SAM 前身） | **完成** |
| **2.5. 投影 Avatar SAM** | 連上即在本場 spawn 薄投影 Avatar；卡片掛其 UI；DataChannel 轉發 | 斷線撕投影；權威仍在 homePeer | **完成** |
| **3. Session bridge** | 遠端 invite／`act`／事件經投影轉 homePeer；**邀請附完整 protocol 規格**；型錄匹配／**lazy install**；修訂 DEC-023 遠端範圍 | 狗糧可邀遠端 Avatar 入座；與本機 Participant 同一協定閘 | **完成**（3.1 邀請＋proxy；3.2 act／事件；3.3 型錄／lazy install） |
| **4. UX** | 開放連入／邀請連結／權限 | 非工程使用者可走完 | **進行中**（4.1 連結；**4.2** 相機掃 QR；**4.3** Platform Invite＝[計劃](./PG-PLATFORM-API-PLAN.md)；**4.4 多 peer 並存**（消除單 peer 實作缺口）；TURN 另段） |
| **5.（可選）** | 自備 TURN；mailbox 跨 peer；自訂頭像 | 另規 | 未開始 |

---

## 修訂紀錄

| 日期 | 變更 |
| --- | --- |
| 2026-08-05 | 初版：Visit／Avatar；signaling＝一次 offer／answer（非 trickle） |
| 2026-08-05 | 場主 UX：左側 Avatars tab（並列 Files／總管）；頭像預設 identicon |
| 2026-08-05 | offer／answer：剪裁＋樣板編碼，確保單張 QR 可掃 |
| 2026-08-05 | 交換方式＝QR 或文字（同等） |
| 2026-08-05 | 可選同區網：offer／answer 進一步剪裁 |
| 2026-08-05 | Phase 1–2 落地：`visit/*`＋Avatars tab；QR＝`qr` 套件／PNG |
| 2026-08-05 | 側欄 UI label：Avatars → **化身** |
| 2026-08-05 | 側欄 UI label：化身 → **線上**（概念仍稱 Avatar／化身；鍵 `avatars`） |
| 2026-08-05 | 場主開房／訪客連入預設收起 |
| 2026-08-05 | 連線後雙方互送 presence，化身列表互見 |
| 2026-08-05 | UX：發起／加入連線；邀請／回覆（不說場主／訪客、offer／answer） |
| 2026-08-05 | **Rename：** Visit → **Roster**（計劃 `PG-ROSTER-PLAN.md`；實作 `roster/*`）；Avatar／化身／`avatars` tab **不變** |
| 2026-08-05 | **語意：** Roster＝本場連線使用者名冊；Avatar＝本場**投影** User agent（薄 SAM／proxy；權威在對方 `homePeer`；經 DataChannel 轉）；Phase 2.5＝spawn 投影 SAM |
| 2026-08-05 | **Session：** 不為 Avatar 特規協定；邀請附**完整 protocol 規格**；型錄＝虛擬可用＋**lazy install**（類比 virtual actor）；Phase 3 與 DEC-023 對齊 |
| 2026-08-05 | Phase 2.5：`roster_avatar` 投影 SAM＋卡片 iframe；`avatar_relay` ping／pong |
| 2026-08-05 | Phase 3 第一刀：`session_invite*` 握手；Host 投影 proxy 入座；化身 tab 接受／拒絕；act 橋未通 |
| 2026-08-05 | Phase 3 第二刀：`session_seat_bound`／`session_act`／`session_act_result`／`session_event`；Host 權威 act＋事件 fanout；homePeer tunnel `env.SESSION`；lazy install 仍開 |
| 2026-08-05 | Phase 3 第三刀：接受路徑 `resolveInviteCandidatesWithInstalled`＋clone／GitHub lazy install；brainstorm 內建後備；coding-orch 預填 `pg-llm-agent` |
| 2026-08-05 | Phase 4.1：`#roster=<wire>` 邀請連結；複製邀請／回覆連結；開啟連結確認後加入；貼上可剝 URL |
| 2026-08-05 | Phase 4.2：相機即時掃邀請／回覆 QR（BarcodeDetector 或 canvas＋`qr/decode`）；檔案上傳掃碼保留 |
| 2026-08-06 | Phase 4.3 指向 DEC-047／`PG-PLATFORM-API-PLAN.md`（Invite＋薄 signal；非本計劃內自建 CF room） |
| 2026-08-06 | **多 peer** 升為規格需求（現單 peer＝實作缺口）；Platform：一連結多人、加入者 offer、握手排隊 |
