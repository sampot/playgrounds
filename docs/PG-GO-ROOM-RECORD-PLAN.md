# Playgrounds 純玩版：包廂多路 live 錄影（`session_record`）

> **狀態：** Partial（2026-08-24）— **Embedded Hub R0／R2／R3 已落地**（wire、`session_record` fanout、成員卡 UI、`MediaRecorder`→OPFS 私有片庫、Operator intent）；**R1 daemon**（`pg-boothd`／`booth-record`）仍待私有 monorepo  
> **權威決策：** 從屬 [DECISIONS.md](./DECISIONS.md) **DEC-050**（純玩版）、**DEC-045**（Roster／薄 signaling）、**DEC-047**（Platform Invite）；**不另開 DEC**  
> **相關：** [PG-GO-ROOM-PLAN.md](./PG-GO-ROOM-PLAN.md)（包廂產品契約；`session_cast`／`session_camera`）、[PG-GO-ROOM-ENGINE-PLAN.md](./PG-GO-ROOM-ENGINE-PLAN.md)（`pg-booth` monorepo、Operator、私有片庫 §7.6）、[PG-GO-ROOM-TAURI-PLAN.md](./PG-GO-ROOM-TAURI-PLAN.md)（桌面常駐）、[PG-GO-ROOM-PLAY-PLAN.md](./PG-GO-ROOM-PLAY-PLAN.md)（開局——**與錄影正交**）、[PG-GO-ROOM-DEV-HARNESS-PLAN.md](./PG-GO-ROOM-DEV-HARNESS-PLAN.md)（localhost harness；**勿**當產品契約）、[PG-GO-CLIENT-PLAN.md](./PG-GO-CLIENT-PLAN.md)、`.cursor/rules/no-native-dialogs.mdc`、`.cursor/rules/mobile-first-ux.mdc`、[GLOSSARY.md](./GLOSSARY.md)  
> **`pg-booth` 錄影實作：** 於**私有 monorepo**（`booth-record` crate）；本 repo 只定 wire 型別與 Shell UI 契約

一句話：主持（director）可像「放到大螢幕上」一樣，在成員卡**指定哪些在場 live 要錄影**——但可**多路同時錄**；每路一檔，由 **Hub Engine 本機**從 **presence** 旁路 tap 寫入 **Hub 私有片庫**；**不**經 Platform、**不**雲存、**不**錄大螢幕 program 切台軌。

---

## 1. 動機

- 監控快樂路徑（ENGINE §1）需要「舊手機掛鏡頭、Hub 常駐、外出切台」——若只能看不能留檔，監控價值不完整。
- 現行 ROOM §3／§49 寫 **不錄製**，語意是 **禁止雲端／會議 SaaS 式錄製**，不是永遠不能有本機 DVR。
- **大螢幕（cast）** 是單路切台；**錄影** 要獨立語意：可同時錄臥室＋客廳兩路 Peer，而大螢幕只顯示其中一路。
- 成品自然落在既有 **Hub 私有片庫**（ROOM §8.3；ENGINE §7.6）——可事後播上大螢幕或掛到分享，不新開雲產品。

---

## 2. 目標

- **主持指定、多路並行（硬）：** director 可對多個 `peerId` 同時 `session_record.start`；每路 **一檔**，互不合成。
- **錄 presence live，不錄 program（硬）：** 來源＝該 peer 的 **在場** RTP（`session_camera` 已 `offer` 的鏡頭／畫面分享）；**不是**當下大螢幕節目槽（切台會斷 continuity）。
- **Hub Engine 執行（硬）：** 錄製 tap 在 Hub ingress；Shell 只送 intent；Guest／Peer **不**自行錄製上傳。
- **落地私有片庫（硬）：** 停止後檔進 Hub 私有命名空間（Embedded OPFS；daemon `~/.pg-booth/private/`）；**不**自動 fanout 分享 metadata、**不**進 `/room-file/<id>`。
- **與 cast 正交：** 可不 cast 也錄；可 cast 同時錄同一人；cast 改源**不**影響已在錄的 peer。
- **全場透明：** 被錄 peer 的成員卡顯示 **錄影中** badge；進場說明更新（見 §10）。
- **Platform 零媒體：** signaling 只 JSON；bytes **不**經 BoothAnchor DO／R2。

---

## 3. 非目標

- **雲端錄製**、Platform／R2 存檔、Dash 內嵌回放 `<video>`（仍「連回包廂」看私有片庫）。
- **錄大螢幕 program**（單路切台軌、片子 seek 時鐘、開局 SAM 畫布）——那是另一產品，不是本文件。
- **多路合成一檔**（監視牆、PiP、主講+小格）——對齊 ROOM §3 否決多路視訊合成進節目。
- **Guest 發起錄影**、被錄者端本機 `MediaRecorder` 上傳、Peer Engine 直寫 Platform。
- **排程錄影**、動態偵測、motion trigger、AI 摘要。
- **只開麥無畫面** 的獨立音檔（第一版；若監控要純音訊另刀）。
- **錄分享目錄檔／私有檔播放**——要留檔請用匯入私有區或 OS 存檔，不走 `session_record`。
- **自動錄全場**、進門即錄、隱藏錄影。
- 在本 repo 實作 `pg-booth` monorepo 的 ffmpeg 管線（`booth-record` crate；本文件只定契約）。

---

## 4. 與「放到大螢幕上」的對照（硬）

| 項 | 大螢幕 `session_cast` | 錄影 `session_record` |
| --- | --- | --- |
| 路由數 | **單路**（再指定＝切台） | **多路**可並行 |
| 媒體槽 | program RTP | presence RTP（Hub 旁路 tap） |
| 全場狀態 | `onAir`（至多一人） | `recording`（多人可 true） |
| 與對方關係 | 可錄可不錄 | 可 cast 可不 cast |
| 成品 | 無（即時收看） | 私有片庫檔案 |
| UI | 成員卡「放到大螢幕上」 | 成員卡「開始錄影」／「停止錄影」 |
| 執行者 | Hub `forwardFrom` → program | Hub encoder → 私有 FS |

---

## 5. 架構

### 5.1 媒體路徑

```text
Peer/Guest                    Booth Hub Engine                 其他在場者
─────────                    ────────────────                 ──────────
presence A/V ──WebRTC──►  收到上行軌
                              ├─► 混音 → 各 peer presence 出站（ROOM §9.8.1）
                              ├─► forwardFrom → program（僅 onAir 那一路）
                              └─► RecordTap[peerId] ──► 私有片庫檔（本功能）
```

**硬：**

- **不**為錄影新增 SDP m-line；**不**改 2+2 拓樸。
- **不**把多路 presence 併成一路 program 再錄。
- 節目音（片子／被推上大螢幕的 live 音）**不**混入 `RecordTap`——第一版只錄該 peer presence 軌（視訊＋若有則同條 live 的音軌）。

### 5.2 誰能做什麼

| 角色 | start／stop 錄影 | 看 recording badge | 讀錄影成品 |
| --- | --- | --- | --- |
| **Hub Engine** | 執行 tap／寫檔 | — | 權威儲存 |
| **director Shell**（host／operator） | ✅ | ✅ | ✅ 私有片庫 |
| **viewer Shell** | ❌ | ✅ | ✅ 片庫讀（ENGINE §7.4 viewer） |
| **Guest** | ❌ | ✅ | ❌ |
| **Peer Engine** | ❌ | ✅ | ❌ |
| **Platform** | ❌ | ❌ | ❌ |

### 5.3 部署

| Hub 模式 | 錄影實作 | 產品定位 |
| --- | --- | --- |
| **Daemon**（`pg-boothd`） | ffmpeg／gstreamer 寫本機 FS | **快樂路徑**；7×24 監控 |
| **Desktop**（`pg-booth-desktop`） | 共用 `booth-record`（可晚於 daemon） | 輕量常駐；見 [PG-GO-ROOM-TAURI-PLAN.md](./PG-GO-ROOM-TAURI-PLAN.md) |
| **Embedded**（瀏覽器 `/room`） | `MediaRecorder` + OPFS 串流寫 | 短錄、開發驗證；Safari 當 Hub **不承諾** |

---

## 6. 控制面 `session_record`

JSON only；DataChannel；**不**載媒體 bytes。與 `session_cast`／`session_camera` 並列（ROOM §9.7 索引）。

### 6.1 Wire（v1）

```text
session_record.start   { from: host, targetPeer: peerId, label?: string }
session_record.stop    { from: host, targetPeer: peerId }
session_record.notify  { targetPeer, active: boolean }           // fanout：全場 UI
session_record.done    { targetPeer, privateId, name, duration?, mime?, size? }  // fanout：僅 director Shell 訂閱處理；Guest 忽略
session_record.error   { targetPeer, code, reason? }            // director + 可選 fanout 摘要
```

| `op` | 發送者 | 說明 |
| --- | --- | --- |
| `start` | director（`from`＝host peerId） | Hub 驗 `targetPeer` 有 active live（`session_camera.offer` 未 `unoffer`） |
| `stop` | director | 正常收尾；Hub finalize 檔案 |
| `notify` | Hub fanout | `active: true`／`false`；驅動成員卡 badge |
| `done` | Hub → director Shell | 寫入私有片庫完成；`privateId` 對齊 ROOM §8.3 |
| `error` | Hub | 見 §6.3 |

**硬：**

- `start` 對已在錄的 `targetPeer` → Hub 忽略或 `error` `already_recording`（實作二選一；語意：冪等拒絕）。
- `stop` 對未在錄的 peer → 忽略（冪等）。
- **禁止** Guest 發 `start`／`stop`。
- `label` 可選；預設檔名見 §7.2。

### 6.2 ENGINE Control Channel 對應

| Shell intent | 對齊 |
| --- | --- |
| `booth.intent.record.start` | `session_record.start` |
| `booth.intent.record.stop` | `session_record.stop` |

見 [PG-GO-ROOM-ENGINE-PLAN.md](./PG-GO-ROOM-ENGINE-PLAN.md) §7.2／§7.5。

**`booth.state.snapshot` 增欄：**

```ts
recordings: Array<{
  peerId: string;
  displayName: string;
  startedAt: number; // ms
  status: "recording" | "finalizing";
}>;
```

`BoothSubscribeScope` 增 `"recordings"`（Owner Shell；Guest snapshot **不含** `privateId` 細節）。

### 6.3 錯誤碼（`session_record.error`／`BoothErrorCode`）

| `code` | 說明 |
| --- | --- |
| `not_director` | 非 director 送 intent |
| `peer_not_live` | `targetPeer` 無 active presence live |
| `already_recording` | 重複 start |
| `storage_full` | OPFS／daemon 磁碟滿 |
| `encoder_failed` | MediaRecorder／ffmpeg 失敗 |
| `peer_gone` | 錄影中 peer 離席（伴隨 auto-stop；可帶部分檔 `done`） |

---

## 7. Hub 錄製行為

### 7.1 狀態機（每 `peerId` 一個 `RecorderSession`）

```text
[idle]
  │ director start ∧ peer has live
  ▼
[recording] ──peer unoffer / kick / disconnect──► [finalizing] ──► [idle] + private file
  │ director stop
  └──────────────────────────────────────────────► [finalizing]
```

| 事件 | Hub 行為 |
| --- | --- |
| `start` | 對 `targetPeer` presence `MediaStream`（或 RTP depacketize）開 encoder；`notify active:true` |
| `stop`（主持） | `finalizing` → 關 encoder → 寫私有片庫 → `notify active:false` → `done` |
| peer `unoffer`／kick／斷線 | **自動 stop**；盡力 finalize **部分檔**；`done` 或 `error peer_gone` |
| Hub `end` session | 所有 recorder `finalizing`；已寫入檔保留（ROOM §8.3） |
| cast 切台 | **不影響** 已在錄的 peer |

### 7.2 檔案與儲存

| 項 | 規格 |
| --- | --- |
| **位置** | Hub 私有片庫（ROOM §8.3；ENGINE §7.6） |
| **檔名** | `{displayName}-{YYYYMMDD-HHmmss}.{ext}`；`label` 若有則前綴 `{label}-` |
| **Embedded 格式** | `video/webm`（`MediaRecorder` 預設；vp8/opus 或瀏覽器能力） |
| **Daemon 格式** | `video/mp4`（h264+aac）或 `video/webm`（實作選一；契約 `mime` 回報） |
| **寫入** | **串流**寫 OPFS／FS；**禁止**整段 RAM `Blob` 再落盤（對齊 ROOM §8.3） |
| **metadata** | 與既有私有檔同一列模型；`source: "record"`、`sourcePeerId`、`recordedAt` 可選內部欄 |
| **大小** | 受私有片庫配額約束；滿則 `storage_full` + 頁內說明 |

**散場：** 進行中錄影 finalize 或丟棄未寫完暫存；**已 commit 的私有檔不因散場刪除**（同 §8.3）。

### 7.3 事後用途

錄影成品＝一般私有檔：

- **放到大螢幕上** — `session_cast` + `scope: "private"`（Host 本機解碼 → program RTP）
- **掛到分享** — `booth.intent.private.mountToShare`／ROOM §5.5.1
- **刪除** — Owner Shell `private.remove`

**禁止：** `done` 後自動掛分享；Guest 經 `/room-file` 取得錄影檔。

---

## 8. Shell UX（go `/room`、Operator）

對齊 `.cursor/rules/mobile-first-ux.mdc`、`.cursor/rules/no-native-dialogs.mdc`。

### 8.1 成員卡（主持／director）

| 條件 | 控件 |
| --- | --- |
| peer 有 live（`session_camera`）且未在錄 | **開始錄影**（與「放到大螢幕上」同層；live 時優先顯眼） |
| peer 正在錄 | **停止錄影**（次要 danger 樣式；非 kick 級） |
| 已在錄 | 「放到大螢幕上」仍可用（與 `onAir` 獨立） |

純函式契約（TDD）：`roomHostMemberRecord({ liveAudio, liveVideo, recording })` — 平行 `roomHostMemberPutOnTv`。

### 8.2 全場可見

- 被錄 peer 成員卡：**錄影中** badge（常駐，直至 `notify active:false`）。
- Guest 可看 badge；**不可** stop 他人錄影。
- **禁止** `window.confirm`「確定錄影？」——主持已明確點擊；隱私靠 badge + 進場說明。

### 8.3 私有片庫 UI

- 新檔出現於既有私有區列表；可選顯示來源 peer 名與錄製時段。
- finalize 中 → 列表 `status: receiving` 或殼內「正在儲存…」。

### 8.4 Operator

- 遠端 `/room/remote` 與本地 `/room` **同一套**成員卡錄影控件（持 director 時）。
- 監控場景：家裡 Daemon Hub + 兩路 Peer 同錄，外出 Operator stop／稍後私有區回放。

---

## 9. 修訂 ROOM 敘事（落地本功能時）

以下條文**細化**，非推翻「不做視訊會議 SaaS」：

| ROOM 原文 | 修訂 |
| --- | --- |
| §3「錄製」非目標 | **雲端**錄製、會議式全自動錄製仍否決；**Hub 本機多路 live 錄影**見本文件 |
| §49「不錄製」 | 正文／RTP **不上 Platform**；主持可**選**錄 presence live 至 **Hub 私有片庫** |
| 原則 15「不錄製」 | 改為 **不自動錄製**；進門不開相機；錄影須 director 明示 start |
| §9.9 預留 | 增列 **多路 live 錄影** → 本文件 |
| 對讀者文案（§11） | 見 §10 |

**`session_play`、開局、片子 cast 仍不錄製。**

---

## 10. 對讀者文案（草案）

> 大螢幕、開口與分享檔只在在場者的瀏覽器之間；分享檔像開網頁上一份檔，點下載才存到你選的位置，**不會存到遊樂場伺服器**。主持若指定錄影，會把該路鏡頭**存到主持這台**的私有片庫（畫面上會標示「錄影中」）；**不會上傳雲端**。主持私有片庫只在主持這台，播上大螢幕別人看得到畫面但拿不到檔。主持把這個畫面關掉，這一間就散了；分享目錄沒了，**已存到硬碟的錄影與私有片庫**不受影響。

---

## 11. 實作計劃與模組

### 11.1 本 repo（`playgrounds`）

| 模組 | 說明 |
| --- | --- |
| `src/components/playgrounds/roster/rosterSessionRecord.ts` | wire 型別 + `isSessionRecordMessage` + tests |
| `go-client/src/lib/goRoom.ts` | `roomHostMemberRecord`、文案常數 |
| `go-client/src/lib/GoRoomMemberCard.svelte` | 錄影按鈕、badge |
| `go-client/src/lib/goRoomMedia.ts` 或 `boothHubEngine.ts` | Embedded Hub `RecordTap` + OPFS |
| `go-client/src/lib/roomRuntime.ts` | `session_record` fanout／intent 轉發 |

### 11.2 私有 monorepo（`pg-booth`／`booth-record` crate）

| 子系統 | 說明 |
| --- | --- |
| RTP ingress tap | 每 peer 可選錄 |
| ffmpeg 管線 | 寫 `~/.pg-booth/private/` |
| Control Channel | `booth.intent.record.*` |
| 配額／rotate | 磁碟滿策略 |

### 11.3 階段

| 階段 | 範圍 | 驗收 |
| --- | --- | --- |
| **R0 契約** | `rosterSessionRecord.ts` + vitest；本文件 + ROOM／ENGINE 交叉引用 | `npm test` 綠 |
| **R1 Daemon** | `pg-boothd` 錄 Peer live；Operator start/stop | 兩路 Peer 同錄；斷線 partial 檔；私有區可播 |
| **R2 Shell UI** | 成員卡、badge、私有列表 | mobile 可點；與 cast 並行手測 |
| **R3 Embedded** | 瀏覽器 Hub `MediaRecorder`→OPFS | Chrome 桌機 OK；Safari Hub 顯示能力說明 |

**依賴：** ENGINE **D1**（Peer live cast）完成後排 **R1**；可與 D2（分享檔 cast）並行。

**R1 明確不做：** 錄 program、錄僅麥、Dash 回放、雲同步。

---

## 12. 風險

| 風險 | 緩解 |
| --- | --- |
| Embedded Hub 背景節流 | 產品引導常駐 `pg-booth-desktop` 或 `pg-boothd`；Embedded 標「短錄」 |
| 磁碟滿 | `storage_full` + 頁內 toast；daemon 設定上限 |
| 隱私／法規 | 全場 badge；§10 進場說明 |
| 與「不錄製」混淆 | §9 細化；GLOSSARY 更新 |
| WebM 相容 | 私有區播放大螢幕用本機解碼；daemon 可 MP4 |

---

## 13. 驗收清單（R2 手測）

- [ ] director 對兩個開鏡頭 Peer 同時「開始錄影」；兩張 badge；兩檔進私有區
- [ ] A 上大螢幕同時錄 B——兩路互不干擾
- [ ] 停止錄影 → badge 消失 → 私有區可「放到大螢幕上」
- [ ] 錄影中 peer 離席 → 自動 finalize；主持看到狀態
- [ ] Guest 無錄影按鈕；可看 badge
- [ ] 散場後私有錄影檔仍在；分享區清空
- [ ] Operator 遠端 start/stop 與本地等價（daemon）
- [ ] 無 `alert`／`confirm`；手機成員卡可點

---

## 14. 變更紀錄

| 日期 | 摘要 |
| --- | --- |
| 2026-08-24 | **Embedded 落地：** R0 wire + R2 Shell UI + R3 `MediaRecorder`→OPFS；Operator `booth.intent.record.*` + snapshot `recordings` |
| 2026-08-23 | 初稿：多路 presence 錄影、`session_record` wire、Hub 私有片庫、與 cast 正交 |
