# Playgrounds 跨場 Visit／Avatar 計劃（DEC-045）

> **狀態：** Phase 0 完成；Phase 1–2 **已落地**；Phase 3+ 未開始  
> **權威決策：** [DECISIONS.md](./DECISIONS.md) **DEC-045**  
> **相關：** DEC-017（側欄 Files／總管）、DEC-023（本地 session）、DEC-031（peer／homePeer）、DEC-038（WebRTC 通道路線）、DEC-042（場網／無租戶）、[GLOSSARY.md](./GLOSSARY.md)

一句話：**薄 signaling 只完成一次經樣板壓縮的 offer／answer（QR 或文字交換）；連上後只走 WebRTC；雙方化身列表互見對方 Avatar。**

---

## 目標

- 兩台瀏覽器可經邀請連成 peer（Visit）。
- 連線完成後**雙方**化身列表都出現對方 Avatar（P2P presence；`homePeer` 仍在各自本機）。
- Avatar 可經既有 DEC-023 入座路徑被邀請參與 session（遠端座位＝後段 Phase）。
- 場主**不**負擔資料面雲費；signaling 極薄、可 rate limit、可 OOB。

## 非目標

- Signaling 中繼 DataChannel／presence 心跳／session 事件／檔案。
- Trickle ICE、renegotiation、第二輪 offer／answer 走同一房。
- 預設營運 TURN；跨 origin 自動搬 OPFS／SecretStore（DEC-042）。
- 把 Avatar clone 成場主本機沙盒權威。
- 完整 WebRTC Runtime 叢集（DEC-038 長線；本計劃先 Visit）。
- 把 Avatar 塞進總管 iframe 或 Files 樹。

---

## 場主 UX

| 項 | 決定 |
| --- | --- |
| **位置** | 左側側欄 **化身** tab（label＝`化身`；鍵 `avatars`），與 **Files／總管** 並列（三 tab） |
| **內容** | 預設＝化身列表；**發起連線**／**加入連線** 平常收起。角色＝initiator／responder（UI 不說場主／訪客；亦不暴露 offer／answer 等術語） |
| **空態** | 無連線時列表為空 |
| **頭像** | 每個 Avatar **預設 identicon**（本機由穩定 id 衍生；不預設外站圖） |
| **自訂圖** | 可後段；不擋 MVP |
| **白話對照** | 邀請＝offer；回覆＝answer；QR＝QR code；同一區網＝lan |

layout 還原：側欄 tab 鍵 `avatars`（與 `files`／`agent` 一併 persist）。

實作：`src/components/playgrounds/visit/`（`AvatarsPanel.svelte`、`visitSdpCodec`／`visitWire`／`visitPeer`／`visitQr`／`visitIdenticon`／`visitStore`）。QR 套件＝npm **`qr`**；產出 **PNG**（禁止 SVG）。

---

## Signaling 契約（硬）

| 規則 | 說明 |
| --- | --- |
| **每房一次 handshake** | 恰好 **1× offer**＋**1× answer** |
| **非 trickle** | ICE 收齊後再發布；**無** candidate 訊息類型 |
| **樣板壓縮** | 剪裁必要欄位 → 固定樣板編碼／解碼還原 SDP；**不**傳完整原始 SDP |
| **同區網（可選）** | 宣告 peers 同一 LAN 時，offer／answer **進一步剪裁**（載荷標明模式；雙方一致） |
| **交換方式** | **QR** 或 **文字**（複製／貼上）同等；同一壓縮字串 |
| **QR 尺寸** | 載荷須小到**單張 QR 易掃**；過大則失敗提示，勿默認多碼拼圖 |
| **用完即銷** | answer 被取走、連線成功、失敗或 TTL → 銷房；拒再寫 |
| **無重談** | 需重連或改模式 → **新邀請／新房**；舊碼作廢 |
| **無資料面** | 伺服器永不轉發 session／mailbox／FS |
| **格式統一** | QR／文字／薄 rendezvous **同一壓縮格式**（含同區網旗標） |

建議 wire 形狀：`{ v, role: "offer"|"answer", tpl, lan?, fields… }`（樣板版號＋可選同區網＋變動欄；細節以實作為準）。

**同區網剪裁（建議方向，非鎖死實作）：** 優先 host candidates；略過需公網 STUN／relay 的候選；fingerprint／ufrag／pwd 仍必備。誤選 → 連線失敗時提示改「一般／跨網」並發**新** offer／answer。

**Rate limit（建議）：** 每 IP 開房／join 上限；每碼僅允許一次 answer；錯碼計入；可疊 CF Free zone 一條 path 規則。

---

## 階段

| Phase | 內容 | 完成定義 | 狀態 |
| --- | --- | --- | --- |
| **0. 契約** | DEC-045、本計劃、GLOSSARY | signaling＋樣板壓縮／QR｜文字＋Avatars tab 無歧義 | **完成** |
| **1. Transport** | 非 trickle＋樣板編解碼；**QR 與文字**；可選同區網進一步剪裁 | 一般／同區網皆可 handshake；DataChannel ping | **完成** |
| **2. Presence＋側欄** | 連入後雙方 Avatars 列表＋identicon；斷線清除 | 雙方互見對方化身 | **完成** |
| **3. Session bridge** | 遠端 invite／`act`／事件；修訂 DEC-023 範圍 | 狗糧可邀遠端 Avatar | 未開始 |
| **4. UX** | 開放連入／邀請連結／權限 | 非工程使用者可走完 | 未開始 |
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
| 2026-08-05 | 場主開房／訪客連入預設收起 |
| 2026-08-05 | 連線後雙方互送 presence，化身列表互見 |
| 2026-08-05 | UX：發起／加入連線；邀請／回覆（不說場主／訪客、offer／answer） |
