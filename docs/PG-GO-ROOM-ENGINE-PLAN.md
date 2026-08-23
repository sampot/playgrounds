# Playgrounds 純玩版：包廂引擎／殼／常駐 daemon（`pg-boothd`）

> **狀態：** Draft（2026-08-23，**第五刀**）— 契約草案；Anchor／Operator **部分落地**；**Guest join 經 Anchor WSS**（§10.7）**規格已定、實作未落地**；從屬並**修訂** [PG-GO-ROOM-PLAN.md](./PG-GO-ROOM-PLAN.md)  
> **`pg-boothd`：** 於**獨立私有 repo** 開發；**非**開源產品；**不在**本 repo（`playgrounds`）落地實作——本文件只定義與 go／Platform 的**契約邊界**  
> **權威決策：** 從屬 [DECISIONS.md](./DECISIONS.md) **DEC-050**（純玩版）、**DEC-045**（Roster／薄 signaling）、**DEC-047**（Platform Invite／Dash）；對齊 **DEC-024**（headless runtime 分層敘事）  
> **相關：** [PG-GO-ROOM-PLAN.md](./PG-GO-ROOM-PLAN.md)（包廂產品契約；wire `session_*`）、[PG-GO-ROOM-PLAY-PLAN.md](./PG-GO-ROOM-PLAY-PLAN.md)（開局；daemon 第一版**非目標**）、[PG-GO-ROOM-DEV-HARNESS-PLAN.md](./PG-GO-ROOM-DEV-HARNESS-PLAN.md)（localhost harness；**勿**當產品契約）、[PG-GO-CLIENT-PLAN.md](./PG-GO-CLIENT-PLAN.md)、[PG-GO-AUTH-PLAN.md](./PG-GO-AUTH-PLAN.md)、[PG-PLATFORM-API-PLAN.md](./PG-PLATFORM-API-PLAN.md)、[PG-PLATFORM-DASH-SPEC.md](./PG-PLATFORM-DASH-SPEC.md)、[PG-PLATFORM-CREDITS-PLAN.md](./PG-PLATFORM-CREDITS-PLAN.md)（包廂 Operator TURN fallback）、[PG-BACKEND-RUNTIME-SPEC.md](./PG-BACKEND-RUNTIME-SPEC.md)（殼↔Runtime 通道類比）、`.cursor/rules/no-native-dialogs.mdc`、`.cursor/rules/mobile-first-ux.mdc`、[GLOSSARY.md](./GLOSSARY.md)

一句話：**包廂＝一個 Booth Hub Engine**（WebRTC Hub、門牌、目錄、導播、私有片庫）＋可選的 **Booth Peer Engine**（headless 終端，連上 Hub 貢獻**檔案**或 **live stream**）。**Platform 只跟 Hub Engine 連線**（`invite.room` **門牌 mint**、**BoothAnchor** Guest／Operator signal、Operator cap）；Peer **不**註冊錨點、**不**打 Platform API。Hub 常駐＝**`pg-boothd`**；Peer 常駐＝**`pg-boothd peer`**。**Booth Shell** 只連 **Hub** 送 intent。瀏覽器 `/i/` **Guest** 仍掃 Platform 門牌（short 鏈／join_cap，**Invite DO**）；**WebRTC 握手經 BoothAnchor WSS 推送至 Hub**——與 headless **Peer** 並存。**`play`／`go` 皆為 Embedded Booth Hub**；**連線遊戲**只 `invite.room`（`invite.compose` Superseded）。

---

## 1. 動機

- 現行 [PG-GO-ROOM-PLAN.md](./PG-GO-ROOM-PLAN.md) 把「包廂活著」綁在**主持 `/room` 分頁還開著**——適合臨時一起看片，不適合 **7×24 監控**（舊手機掛鏡頭、家裡 Hub 常駐、外出遠端切台）。
- 監控快樂路徑需要：**多路鏡頭／檔案來源進同一間**、**主持可切大螢幕**、**外出遠端導播**——舊手機應跑 **Peer Engine**（headless），不是長期開瀏覽器 Guest。
- **Platform 邊界：** 雲端只需認識 **一個 Hub**（錨點、門牌、Operator）；邊緣 **Peer** 只跟 Hub 建立 WebRTC，避免每台監控鏡頭都打 Platform。
- 瀏覽器分頁當 Hub 有硬限制：背景節流、記憶體、SW／OPFS 綁 origin、關分頁即散場、跨網 ICE 不承諾。
- 產品敘事已含「筆電當屋子、舊手機當監控鏡頭」——應有**正式常駐執行體**，而非要求使用者永遠開著 Chrome 分頁。
- [PG-BACKEND-RUNTIME-SPEC.md](./PG-BACKEND-RUNTIME-SPEC.md) 已確立「殼不假設權威在殼瀏覽器、經可替換通道連 Runtime」——包廂應有對等的 **Engine／Shell** 分層（對象是 Room Hub，不是 SAM `functions.js`）。

---

## 2. 目標

- **Hub／Peer 雙模式（硬）：**
  - **Hub Engine**＝包廂本體（星狀 Hub、cast 權威、門牌、目錄、私有片庫）。**唯一**與 Platform 連線的 Engine 角色。
  - **Peer Engine**＝headless 終端（無包廂 UI、無 Platform）。連上 Hub 後貢獻**分享目錄檔**與／或**一條在場 live**（鏡頭／麥）。wire 與瀏覽器 Guest **對齊**（`session_*`），但進門**不**經 Platform `invite.room`（改 Hub 本機 **`peerCap`**，§5.4）。
- **Shell 只連 Hub（硬）：** Booth Shell 送 intent 給 **Hub**；**不**直接指揮 Peer。
- **Platform 只認 Hub（硬）：** BoothAnchor WSS、`invite.room` **門牌 mint**、Guest join signal（§10.7）、`device_token`（hub）、Operator `operatorCap`——**僅 Hub Engine**。Peer **禁止**註冊 anchor、**禁止**呼叫 `/v1/invites`／`/v1/booth/anchors`。
- **BoothAnchor 為請人硬性前提（硬）：** Hub 開著須 **Anchor 已註冊且 Engine WSS 連上**；「請人進來」mint 門牌前須確認 Anchor **online**（或 **degraded** 且 Engine socket 仍在）。**禁止** Invite DO `signal/pending` long poll 作為包廂 Guest 握手路徑；**無 fallback**。
- **兩種 Hub 部署：**
  - **Embedded Hub：** 瀏覽器 **`go` `/room`** 或 **`play` 場殼對等 Booth 面**（過渡；`play` 亦為 Booth Hub，連線＝`invite.room`）。
  - **Daemon Hub：** `pg-boothd`（預設 hub 模式）。
- **Peer 部署：** `pg-boothd peer`（同一 binary；獨立行程／裝置）。
- **瀏覽器 Guest 保留：** 臨時訪客、無法裝 daemon 的裝置仍掃 `/i/`；握手 **經 BoothAnchor 推送至 Hub**（§10.7）。
- **BoothAnchor DO：** **Hub** 長連 WSS（**必須**）；Operator 經 Platform 連回**同一 Hub**；Guest join offer／answer **經 DO 轉發**（**不**經 Invite DO signal 隊列）。
- **生命週期：** 包廂活著＝**Hub session** 還在；Peer 斷線只少一路來源，**不散場**。
- **單帳號單 Hub（硬）：** 同時最多一個 live Hub session（**`play` 與 `go` 各 origin 各一 Hub**；同一 Platform 帳號在兩 origin 仍各守單 Hub 語意）。
- **媒體原則不變：** 節目／在場 RTP 仍 Hub 星狀；檔 bytes 仍 mesh 直連優先；Platform **不** SFU、**不**錄製、**不**雲存正文／bytes。
- **監控 MVP：** 家裡 Hub 常駐；舊手機跑 **Peer** 掛鏡頭；外出 Dash → Operator 切台；家裡**可無**瀏覽器分頁。

---

## 3. 非目標

- 雲端 SFU、把 RTP／檔案 bytes 經 Platform／R2 中繼（錨點 DO **只**控制面）。
- 永久房號、「我的包廂 3 號」、跨裝置同步私有片庫到雲端。
- 多路視訊合成監視牆（仍**單主畫面切台**；見 ROOM §3）。
- 把 Operator 做成 Guest 門牌的另一種掃碼（Operator **不走** `/i/` Guest 契約）。
- 使用者自備 TURN（DEC-045／047 否決）。
- **`pg-boothd` 第一版** 大螢幕 SAM 開局（`session_play`）；不阻塞監控 MVP。
- 把 Peer Engine 做成另一種 Platform `invite.kind`（Peer **只**認 Hub 本機 `peerCap`）。
- Peer Engine 註冊 BoothAnchor 或持有 `device_token`（**僅 Hub**）。
- 在本 repo 內開發／開源 **`pg-boothd`** 原始碼（實作在**獨立私有 repo**）。
- 讓 `sam-host`（Node SAM headless）承擔包廂 Hub——兩者分離。
- 在 Dash 中繼 WebRTC 媒體（DASH-SPEC 非目標維持）。

---

## 4. 用語（硬）

| 用 | 意思 |
| --- | --- |
| **Booth Hub Engine**（Hub 引擎） | 包廂本體與權威：星狀 Hub、cast、門牌、目錄、私有片庫、檔案 HTTP 門面；**唯一**連 Platform 的 Engine |
| **Booth Peer Engine**（Peer 引擎） | headless 終端：連 **Hub** 貢獻分享檔或 live stream；**不**連 Platform；wire 對齊 Guest `session_*` |
| **Booth Engine** | 統稱；實作上必須標 **hub** 或 **peer** 模式 |
| **Booth Shell**（包廂殼） | UI 客戶端：只連 **Hub**、送 intent、收 state／媒體預覽；**無** Hub 權威 |
| **Embedded Hub** | Hub Engine 與 Shell 同處瀏覽器 `/room` 分頁（過渡形） |
| **`pg-boothd`** | **獨立私有 repo** 的 Rust 常駐二進位；hub／`peer` 子命令；**非**開源；本 repo **只**定契約 |
| **`peerCap`** | Hub 本機核發、Peer 進房憑證；**不**經 Platform Invite DO |
| **BoothAnchor**（錨點） | Platform `BoothAnchorDO` + **Hub** 長連 WSS；**Guest join signal 中繼**（§10.7） |
| **Operator**（遠端操作者） | 帳號授權的 Shell 角色；可導播；**不是** Guest／Peer |
| **boothSessionId** | 本場 **Hub** session 的 UUID；**不是**永久房號 |
| **Control Channel** | Shell ↔ **Hub** 的控制／狀態通道（見 §7） |
| **輕量模式** | Embedded Hub；關分頁＝散場 |
| **常駐模式** | Daemon Hub；關 Shell 不散場 |
| **`session_booth`（wire）** | Guest／Peer↔Hub DC 上的主持 moderation（mute／kick）；**不是**本文件的 Booth Engine——見 [rosterSessionBooth.ts](../src/components/playgrounds/roster/rosterSessionBooth.ts) |

對讀者：**仍叫「包廂」**；勿暴露 Engine／DO 內部語。Dash 可說「常駐包廂」「連回包廂」。

---

## 5. 架構

### 5.1 分層

```text
┌─────────────────────────────────────────────────────────────┐
│ Booth Shell（0..N；可有可無）── 只連 Hub                      │
│  · go `/room`（Embedded：Shell+Hub 同頁）                     │
│  · go `/room/remote` 或 Dash 深鏈（Operator）                 │
│  · 本地輕量顯示殼（可選；HDMI）                               │
└───────────────────────────┬─────────────────────────────────┘
                            │ Control Channel（§7）
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ Booth Hub Engine（每包廂恰好 1）                              │
│  · WebRTC Hub（Guest／Peer／Operator ↔ Hub）                  │
│  · invite.room 門牌 mint（Platform）；Guest 握手經 Anchor（§10.7）│
│  · peerCap mint／Peer join（本機；§5.4）                      │
│  · session_* DC、mesh 介紹、cast 執行                         │
│  · 分享目錄 + 檔案 HTTP 門面                                  │
│  · 私有片庫（本機目錄）                                       │
└───────────────┬─────────────────────────────┬───────────────┘
                │ WSS register（僅 Hub）       │ WebRTC（無 Platform）
                ▼                             ▼
┌───────────────────────────┐   ┌─────────────────────────────┐
│ BoothAnchorDO @ Platform  │   │ Booth Peer Engine（0..N）    │
│  · Hub 長連、Operator     │   │  · headless；檔案／live 來源  │
│  · intent 中繼、Guest join 轉發、離線快照  │   │  · peerCap → Hub              │
└───────────────────────────┘   └─────────────────────────────┘

瀏覽器 Guest（`/i/`）── 門牌 short／join_cap（Invite DO）──► offer/answer 經 BoothAnchor WSS ──► Hub
```

### 5.2 與現行 ROOM 的對應

| 現行（ROOM） | Hub 職責 | Shell 職責 |
| --- | --- | --- |
| 主持 Hub 轉 RTP／DC | Hub | — |
| `GoRoomSurface` UI | — | Shell |
| `session_cast` 發起 | Hub 驗權並執行 | Operator／主持 Shell 送 intent |
| `invite.room` mint | Hub | Shell 觸發 intent |
| `/room-file/<id>` SW | Hub HTTP 門面 | Shell／Guest／Peer 仍發 HTTP |
| 私有 OPFS | Hub 本機 FS（daemon）或 Embedded OPFS | — |
| Guest `/i/` | Guest 握手經 **BoothAnchor** → Hub（§10.7） | Guest 頁（非 Shell） |
| 監控鏡頭／NAS 掛檔 | **Peer** 連 Hub（`peerCap`） | Shell 管理 `peerCap`（§5.4） |

**Wire 不變：** 成員之間仍用 `session_chat`／`session_file`／`session_cast`／`session_camera` 等（ROOM §7.2）；Control Channel 是 **Shell↔Hub 內部**，不取代 Guest／Peer wire。

### 5.3 部署形狀

| 模式 | Hub | Peer | Shell | 典型用途 |
| --- | --- | --- | --- | --- |
| **Embedded** | 瀏覽器分頁 | — | 同頁 | 臨時包廂、試用 |
| **Daemon Hub** | `pg-boothd` | — | 無或遠端 Operator | 監控、常駐 |
| **Daemon Hub + Peer** | `pg-boothd` | `pg-boothd peer` ×N | 無或遠端 Operator | 舊手機鏡頭、邊緣掛檔 |
| **Daemon + 本地 Shell** | `pg-boothd` | 可選 | 瀏覽器連 `localhost` Control Channel | 家裡大螢幕 + 穩定 Hub |
| **Daemon + Operator** | `pg-boothd` | 可選 | 外出 Operator | 遠端導播 |

### 5.4 Hub 與 Peer（硬）

| 項 | Hub Engine | Peer Engine |
| --- | --- | --- |
| **代表** | headless 包廂本體 | headless 終端／來源裝置 |
| **Platform** | ✅ Anchor、門牌 mint、`device_token` | ❌ **禁止** |
| **連線對象** | Platform + 所有成員 | **僅 Hub** |
| **進房憑證** | —（本體） | **`peerCap`**（Hub 核發） |
| **可貢獻** | 私有片庫、program、在場混音 | 分享目錄檔、live（鏡頭／麥） |
| **導播** | ✅ cast 權威 | ❌ |
| **UI** | 無（Shell 可選） | 無 |
| **斷線** | 整間散場 | 只少一路來源 |

**`peerCap` 配對（草案）：**

1. Director Shell 送 `booth.intent.peer.mint` → Hub 回 `{ peerCap, joinUrl, expiresAt, label? }`。
2. `joinUrl`＝本機 QR／深鏈（例 `pg-booth://peer/join?cap=…&hub=…`）；**不**經 go 短鏈、**不**寫入 Platform。
3. Peer 行程帶 `peerCap` 連 Hub Control／signaling 端點（本機 LAN 或 Hub 公網可達位址）；完成 WebRTC 後 wire 同 Guest。
4. Hub 在 `members` 標 `kind: "peer"`（與瀏覽器 Guest 區分）；cast／mesh 語意**不變**。
5. `peerCap` TTL 建議 **24h** 或可撤銷；過期 Peer 須重新配對。

**硬：**

- Peer **不得**冒充 Operator 或再開 `/room` Hub。
- 瀏覽器 **Guest** 與 **Peer** 可並存；監控正式路徑優先 **Peer**（省電、無背景節流）。
- Platform 儀表板**只**顯示 Hub 狀態；**不**列舉各 Peer 裝置（Peer 由 Hub `snapshot.members` 呈現給 Shell）。

---

## 6. 角色與權限

| 角色 | 連線方式 | 導播（cast） | 收看大螢幕 | 備註 |
| --- | --- | --- | --- | --- |
| **Hub Engine** | — | 執行 | 產出 program | 權威；**唯一**連 Platform |
| **主持 Shell** | Control Channel → Hub（本地或 Embedded） | ✅ | ✅ | 與 Operator 互斥導播鎖（§7.4） |
| **Operator Shell** | Anchor DO + Control Channel + WebRTC → Hub | ✅ | ✅ | 帳號授權；**不是** Guest／Peer |
| **Guest** | 門牌 short／join_cap（Invite DO）+ 握手經 **BoothAnchor**（§10.7） | ❌ | ✅（房級節目） | 瀏覽器 `/i/`；ROOM §5.4 不變 |
| **Peer Engine** | Hub `peerCap` → Hub | ❌ | ✅（房級節目） | headless 來源；**不**連 Platform |

**硬：**

- Guest **不能**因登入而變 Operator；Operator **不能**用再開 `/room` 冒充（走 `/room/remote` 或 Dash 深鏈）。
- 監控手機正式路徑＝**Peer Engine**（掛鏡頭、被切上大螢幕）；臨時仍可用瀏覽器 Guest。
- 外出手機＝**Operator Shell**（切台）；只連 Platform 以連回 **Hub**。

---

## 7. Control Channel（Shell ↔ Engine）

### 7.1 傳輸

| 部署 | 傳輸 | 認證 |
| --- | --- | --- |
| Embedded | 同頁 `BoothHubEngine` 介面（§14）；無額外 socket | N/A（同進程） |
| Daemon 本地 Shell | `ws://127.0.0.1:<port>/booth/control` 或 unix socket | `shellLocalToken`（daemon 啟動時印出／寫入 `~/.pg-booth/shell.token`） |
| 遠端 Operator | **經 BoothAnchor DO** 中繼 `booth.*` 幀 | `operatorCap`（§9） |

遠端 Operator 的**媒體**不走 DO：Operator ↔ Hub 另建 **WebRTC Operator peer**（§10.6）。

**硬：** Control Channel **只**承載 `booth.*` 與 Operator signal 子幀（§10.6）；**不**承載 Guest／Peer `session_*`、**不**承載 RTP。

### 7.2 訊息封包

每幀為 JSON 文字；必含：

```ts
type BoothEnvelope = {
  type: string; // booth.*
  v: 1;
  id?: string; // intent 可選 request id；Engine 以 booth.ack 回同一 id
  ts?: number; // Engine 產生的 server-ish ms（Daemon／DO 填）
};
```

**Shell → Engine（intent）**

| `type` | 說明 |
| --- | --- |
| `booth.hello` | `{ role: "host" \| "operator" \| "viewer", cap?, subscribe?: BoothSubscribeScope[] }` |
| `booth.intent.invite.mint` | `{ }` — 對齊按需鑄門牌 |
| `booth.intent.invite.revoke` | `{ }` |
| `booth.intent.cast.offer` | 對齊 `session_cast.offer`（ROOM §9.7） |
| `booth.intent.cast.unoffer` | `{ }` |
| `booth.intent.cast.state` | 對齊 `session_cast.state` |
| `booth.intent.peer.mint` | `{ label?, ttlSec? }` — 核發 `peerCap`（§5.4）；僅 director |
| `booth.intent.peer.revoke` | `{ peerCapId }` |
| `booth.intent.ejectPeer` | `{ peerId }` — 請出 Guest／Peer；Hub 轉 `session_booth` kick 或等價 |
| `booth.intent.end` | `{ }` — 結束這一間 |
| `booth.ping` | `{ }` — RTT 探測 |

**Engine → Shell（state / events）**

| `type` | 說明 |
| --- | --- |
| `booth.hello.ok` | `{ sessionId, mode: "embedded" \| "daemon", director?: { shellId, role } }` |
| `booth.ack` | `{ id, ok: boolean, error?: BoothErrorCode }` |
| `booth.state.snapshot` | 全量（§7.5） |
| `booth.state.patch` | JSON Patch 或欄位增量（實作二選一；語意：只更新訂閱 scope） |
| `booth.event.director.changed` | 導播鎖易手 |
| `booth.event.engine.offline` | Anchor 將標 offline（grace 內可恢復） |
| `booth.error` | `{ code, message }` |

**BoothErrorCode（草案）：** `not_director`｜`engine_busy`｜`session_ended`｜`invalid_intent`｜`invite_gate`｜`cast_rejected`

**硬：**

- Engine **套用** intent 成功後才 `patch`／`ack`；Shell 不得樂觀更新 cast。
- `booth.intent.cast.*` payload **與** `session_cast` **同形**；Engine 內部轉成對 Guest 的 fanout。

### 7.3 訂閱範圍

```ts
type BoothSubscribeScope =
  | "members"
  | "cast"
  | "inviteGate"
  | "shareFiles"
  | "chatTail" // 最近 N 則；非雲端歷史
  | "engineHealth"
  | "director";
```

不經 Channel 推送：RTP 軌、檔案 bytes（仍 WebRTC／HTTP 門面）。

### 7.4 導播鎖（定案）

| 規則 | 說明 |
| --- | --- |
| **單導播** | 同時最多一個 Shell 持 `director` 鎖（`role: host` 或 `operator`） |
| **優先序** | **本地 host Shell** ＞ 遠端 Operator ＞ 第二連線者降為 `viewer` |
| **viewer** | 可看 `snapshot`／收 WebRTC program；**不可**送 `booth.intent.cast.*`／`end` |
| **搶鎖** | 本地 host Shell 連上時，**可**搶回 director（遠端 Operator 降 viewer + `booth.event.director.changed`） |
| **釋放** | Shell 斷線即釋放；Engine 不代為持有 |

### 7.5 `booth.state.snapshot` 形狀（草案）

```ts
type BoothStateSnapshot = {
  sessionId: string;
  ownerUserId: string;
  engineMode: "embedded" | "daemon";
  deviceLabel?: string; // daemon 裝置名
  members: Array<{
    peerId: string;
    displayName: string;
    kind: "guest" | "peer" | "operator";
    isHost: boolean;
    live?: { camera: boolean; mic: boolean; display: boolean };
  }>;
  cast?: {
    kind: "idle" | "file" | "live" | "play";
  } & Record<string, unknown>; // 對齊 session_cast offer 摘要
  inviteGate: "none" | "live" | "expired";
  inviteShortUrl?: string; // 僅 director 可見完整 URL；viewer 可見「有門牌」不含 secret
  shareFileCount: number;
  guestCount: number;
  anchor: "offline" | "registering" | "online";
  director?: { shellId: string; role: "host" | "operator" };
};
```

---

## 8. 產品流程

### 8.1 監控（Daemon Hub + Peer + Operator）——快樂路徑

```text
1. 家裡 NUC：`pg-boothd`（hub）→ 登入帳號 → 常駐包廂
2. Hub 註冊 BoothAnchor；Dash／go 顯示「常駐包廂 · 在線」
3. 舊手機 A/B：`pg-boothd peer` 掃 Hub 核發的 peerCap QR → 掛鏡頭＋麥
4. 外出：Dash「連回包廂」→ go /room/remote?…
5. Operator 連 Anchor + WebRTC；切「臥室鏡頭」上大螢幕
6. 關 Operator 頁：Hub 與 Peer 仍在；Anchor 仍 online
```

### 8.2 臨時包廂（Embedded）——不變

```text
登入 → /room → 按需鑄門牌 → Guest 掃碼 → 關分頁散場
```

### 8.3 開 `/room` 時已有 Daemon（定案）

| 條件 | 行為 |
| --- | --- |
| 帳號已有 live Daemon Engine | `/room` **預設**進 **本地 Shell**（連 `localhost` Control Channel）；頁內說明「常駐包廂運行中」 |
| 使用者選「改開輕量包廂」 | 頁內確認 → **結束 Daemon session** → 本頁 Embedded 新開（破壞性） |
| 無 Daemon | 現行 Embedded |

**硬：** **禁止**無確認下同時跑 Daemon Engine + Embedded Engine。

### 8.4 Guest、Peer 與 Operator 並存

- 監控手機（正式）：**Peer Engine**（`peerCap`）；可被 cast。
- 臨時訪客：**Guest**（`/i/`）；語意不變。
- 外出手機：**Operator Shell**（`/room/remote`）；可 cast。
- 同一 Hub、**不同角色**——預期故事，不是 bug。

---

## 9. 生命週期（修訂 ROOM §6.4）

| 物件 | 活著條件 | 死法 |
| --- | --- | --- |
| **Hub session** | `pg-boothd`（hub）或 Embedded 分頁仍跑 | `booth.intent.end`、Hub 行程停、Embedded 關分頁 |
| **Peer 連線** | WebRTC 仍連 Hub | Peer 斷線、`peerCap` 撤銷、Hub 散場 |
| **門牌** | 該張 `invite.room` 有效 **且** Hub WSS 可接 join | TTL、撤銷、Hub 散場、Anchor offline |
| **BoothAnchor** | **Hub** WSS 仍連 DO | Hub 斷線、散場、撤銷 |
| **Shell 連線** | WebSocket／頁面在 | 關 UI；**不**結束 Hub |

**修訂推論（取代 ROOM 部分條文）：**

1. **包廂活著＝Hub session 還在**（不再綁「主持分頁」）。
2. **關 Shell ≠ 散場**（Daemon Hub 模式）。
3. **Peer 斷線 ≠ 散場**；Hub 仍在則可重連（新 `peerCap` 或仍有效 cap）。
4. **已登入再開 `/room`**：若帳號已有 live Hub → **接上同一間**（Shell）；若無 → Embedded **新開**或引導「常駐包廂已在 NAS 運行」。
5. **Guest 契約不變**：仍掃 `/i/<short>`；門牌過期規則不變。
6. **Operator 重連**：允許；Guest／Peer 重進各靠門牌或 `peerCap`。
7. **`boothSessionId`**：每場 **Hub** 一個 UUID；**不是**使用者可收藏的房號。

---

## 10. BoothAnchor DO（Platform）

### 10.1 職責

| 做 | 不做 |
| --- | --- |
| Engine `register`／心跳／offline（**僅 Hub**） | 存 RTP／檔 bytes |
| Operator `connect`（access token 授權） | 代替 Hub 做星狀 Hub |
| 轉發 Operator ↔ Hub 的 `booth.*` | Peer `peerCap` 配對（**Hub 本機**） |
| 轉發 **Guest** `booth.join.*` ↔ Hub（§10.7） | 長期穩定門牌 URL（本階段不做） |
| 轉發 Operator WebRTC signal 子幀（§10.6） | 聊天全文歸檔 |
| 保存最後 `booth.state.snapshot`（TTL **24h** 或 Hub 散場時刪） | 經 Invite DO **signal/pending** long poll 接 Guest（**禁止**） |

### 10.2 DO 身分

- **Class：** `BoothAnchorDurableObject`（與 `InviteDurableObject` 分開）。
- **Stub id：** `ownerUserId`（**每帳號至多一個 active anchor stub**；新 session 覆寫舊 metadata，舊 `boothSessionId` 作廢）。
- **Session：** `boothSessionId`（UUID；存在 DO storage 內，**不是** DO id）。

**定案（開放問題 #3）：** **嚴格單 Engine／單 anchor stub per 帳號**。家裡／公司兩台 daemon 不能同時 live；新裝置啟動須**明示取代**舊 session。

### 10.3 HTTP API

前綴 `/v1/booth`；詳見 [PG-PLATFORM-API-PLAN.md](./PG-PLATFORM-API-PLAN.md) §BoothAnchor。

| 方法 | 路徑 | 憑證 | 行為 |
| --- | --- | --- | --- |
| `POST` | `/v1/booth/anchors` | API key **或** `device_token`（**hub only**） | **Hub** 註冊／更新 anchor；body `{ boothSessionId, deviceLabel?, snapshot? }` → `{ anchorSecret, wsUrl }` |
| `DELETE` | `/v1/booth/anchors/active` | API key 或 device_token | 撤銷本人 active anchor |
| `GET` | `/v1/booth/anchors/active` | access token **或** API key | `{ online, boothSessionId?, snapshot?, deviceLabel?, guestCount?, castSummary? }` |
| `POST` | `/v1/booth/operator-caps` | access token | `{ boothSessionId? }` → `{ operatorCap, expiresAt, remoteUrl }`；`remoteUrl`＝go `/room/remote` 深鏈 |
| `POST` | `/v1/booth/join/offer` | `join_cap`（Bearer 或 body） | Guest 包廂握手：驗 `invite.room` + cap → push `booth.join.offer` 至 Engine WSS → 同步回 `{ answer, join_id }`（§10.7） |
| `GET` | `/v1/booth/ws` | Upgrade：`Authorization: Bearer <anchorSecret\|operatorCap>` + query `role=engine\|operator` | WebSocket |

錯誤：`401`／`403`／`404`（無 active）／`409`（已有其他裝置註冊中，須 `force: true`）／`410`（session 已結束）／`503`（Engine WSS 未連上；Guest join 失敗）／`429`（握手排隊或 rate limit）。

### 10.4 Engine WSS 行為

```text
Hub Engine --WSS--> BoothAnchorDO
  ← anchor.registered { boothSessionId }
  → ping / ← pong                    // 應用層 keepalive；**不**喚醒 DO（auto-response）
  → booth.*  (from Engine, fanout to operators)
  ← booth.*  (from Operator, forward to Engine if director)
  ← anchor.signal { ... }            // Operator WebRTC（§10.6）
  → anchor.signal { ... }
  ← booth.join.* { ... }             // Guest roster 握手（§10.7；HTTP 入口轉 WSS）
  → booth.join.* { ... }
```

**Snapshot（按需）：** Engine **不**在週期訊息附帶 `snapshot`。Operator `booth.hello` 時 Engine 回 `hello.ok` + `booth.state.snapshot`；其後僅在 **有 Operator 連線** 且包廂狀態變更時才 `publishSnapshot()`。DO 轉發 `booth.state.snapshot` 時順便 cache 供 Dash `GET …/active`（`guestCount` 等）；無 Operator 時 DO 可長時間 hibernate。

**Grace：** Engine WSS 斷線後 **60s** 內標 `degraded`（Operator 可連但 UI 警告）；超過標 `offline`。重連同一 `boothSessionId` + `anchorSecret` → 恢復 `online`。

**Hibernation（硬）：** BoothAnchor DO **必須**用 Cloudflare **Hibernatable WebSocket API**（`acceptWebSocket` + `webSocketMessage`／`webSocketClose`／`webSocketError`；**禁止** `ws.accept()` 或把 `WebSocket` 掛在 DO instance 上）。無 inbound 訊息時 DO 可從記憶體釋放；連線由 runtime 維持。`acceptWebSocket` **tags** 保存 `role`／`socketId`；狀態以 storage 為準。`setWebSocketAutoResponse("ping"→"pong")`：Engine 送應用層 `ping` 時**不**喚醒 DO。`booth.*`／`anchor.signal` 仍會喚醒並處理。

**Cloudflare 資源成本（設計約束）：**

| 資源 | 計費／佔用 | 本設計行為 |
|------|------------|------------|
| **DO duration** | 喚醒期間計費 | Engine 僅送 `ping`（auto-pong）→ **不**喚醒；無 Operator 時可長時間 hibernate |
| **DO HTTP** | 每次 `fetch` 喚醒 | `GET …/active` **不**走 `POST /init`（只讀 `status`）；`init` 僅 `POST …/anchors` 註冊時 |
| **DO WSS 訊息** | 每則 inbound 喚醒 | `anchor.signal`（WebRTC ICE）必要；Operator 離線後 Engine **停止** RTC，減少後續 signal |
| **KV** | 讀寫極低 | `anchorSecret`／`operatorCap` 對照；cap TTL 5m 自動過期 |
| **Dash 輪詢** | 間接喚醒 DO | 僅頁面 **visible** 時每 **60s** `GET …/active`；hidden 停輪詢、回到前景再拉一次 |

**刻意不做：** 週期 snapshot 廣播、Engine 每 N 秒寫 DO storage、Dash 30s 無條件輪詢、`ensureBoothStub` 對每次 status 呼叫 `init`、Host **`GET …/signal/pending` long poll**（包廂 Guest 改 §10.7）。

### 10.5 Operator WSS 行為

1. Dash 或 go 以 access token 換 `operatorCap`（TTL **5m**）。
2. Operator Shell Upgrade WSS `role=operator`。
3. DO 驗 `ownerUserId`；轉發 `booth.hello` 至 Engine；Engine 回 `hello.ok` + `snapshot`。
4. 若 Engine 授予 director → Operator 可送 cast intent；否則 viewer。

### 10.6 Operator WebRTC signal（定案）

**不走** 新 `invite.kind`、**不走** Platform HTTP `/signal/offer` 隊列。

經 **Anchor WSS** 轉發專用子幀：

```ts
type AnchorSignalFrame = {
  type: "anchor.signal";
  v: 1;
  phase: "operator-webrtc";
  op: "offer" | "answer" | "candidate";
  sdp?: string; // av1 壓縮與否：與 roster 一致，兩端約定
  candidate?: string;
};
```

- Operator 為 **offerer**；Engine 為 **answerer**（對齊「加入者出 offer」精神，但 **不**占用 invite join 槽）。
- SDP：**2+2** booth transceiver（ROOM §7.1）；`intent.surface=room.operator` 僅作 metadata（**不**鑄新 Invite DO）。
- ICE：包廂 STUN 預設 + 可選 room TURN fallback（CREDITS 另段）。

### 10.7 Guest join（`invite.room` signal；**定案**）

**硬：** 包廂 Guest WebRTC 握手 **只**經 BoothAnchor；**禁止** Invite DO `signal/pending`／`signal/offer` long poll；**無 fallback**。

**分工：**

| 元件 | 職責 |
| --- | --- |
| **Invite DO** | short 鏈解析、`invite.room` metadata、TTL、revoke、`join_cap` 核發（**只讀驗證**於 join 時） |
| **BoothAnchor DO** | 驗 cap + `inviteId` → **WSS push** `booth.join.offer` 至 Hub Engine；回傳 answer 給 Guest |
| **Hub Engine** | 本機 **FIFO 串行** `acceptRosterOffer` → `booth.join.answer`（對齊 ROOM「持續接人」；**不**跑 HTTP answer loop） |

**Host／Hub 前置（硬）：**

1. `openBooth`／Hub 啟動 → `POST /v1/booth/anchors` + Engine WSS `role=engine`（**必須**；非可選「遠端監控」開關）。
2. 「請人進來」→ 僅當 Anchor **`online`** 或 **`degraded`**（Engine socket 仍在）→ `mint invite.room` → `inviteGate: live`。
3. Anchor **`offline`**（grace 逾時）→ **不 mint** 或 Guest join 回 `503`；已入座 peer **不**因門牌 alone 斷線。

**Guest 時序：**

```text
GET /i/<short> → preview（Invite DO）
consent → POST …/join → join_cap
POST /v1/booth/join/offer { inviteId, offerWire }  Authorization: Bearer <join_cap>
  → Worker 驗 invite 未過期／未撤銷／kind=invite.room
  → BoothAnchor DO → WSS 轉 Engine：booth.join.offer
  → Engine acceptRosterOffer → booth.join.answer
  → HTTP 200 { answer, join_id }
→ apply answer → WebRTC DC（ROOM wire 不變）
```

**Wire 子幀（`boothChannel`；與 `anchor.signal` 分 phase）：**

```ts
type BoothJoinOffer = {
  type: "booth.join.offer";
  v: 1;
  joinId: string;
  inviteId: string;
  offerWire: string;
  guestLabel?: string;
};
type BoothJoinAnswer = {
  type: "booth.join.answer";
  v: 1;
  joinId: string;
  answerWire: string;
};
// 可選：booth.join.candidate { joinId, candidate }
```

- Guest 為 **offerer**；Hub 為 **answerer**（與 Ticket 路徑一致）。
- **禁止** Host 端 `pollPendingOffer`／`startPlatformHostAnswerLoop`（包廂路徑）。
- Engine 忙（上一筆握手未完成）→ Guest `429` 或短暫重試；**仍串行**，不平行建 PC。
- 門牌 `expired`／revoked → `410`；Engine 不在 → `503`。

**與 Operator 分離：** Guest **不走** `operatorCap`、**不走** `/room/remote`、**不走** `anchor.signal` `phase: "operator-webrtc"`。

### 10.8 Dash 整合

[PG-PLATFORM-DASH-SPEC.md](./PG-PLATFORM-DASH-SPEC.md) **遊樂場** tab 增（草案 §6.2.5）：

- **常駐包廂卡**（`GET /v1/booth/anchors/active`）：在線／離線、裝置名、N 人在、大螢幕摘要。
- **主動作：** 「連回包廂」→ `remoteUrl`（go Operator）。
- **次動作：** 「結束常駐包廂」（頁內確認 → `DELETE /v1/booth/anchors/active` + daemon 收 SIGTERM 契約）。
- **不**在 Dash 內嵌 `<video>`。

---

## 11. `pg-boothd`（Rust daemon；**獨立 repo**）

### 11.1 定位

- **正式**長期包廂執行體；**無 UI**；**非**開源產品。
- **開發邊界（硬）：** 原始碼與發行在**另一個私有 repo**——**不在** `sampot/playgrounds`。本 repo 只維護：
  - 與 go／Platform 的**契約**（本文件、`boothChannel` 型別、BoothAnchor API）；
  - **Embedded Hub**（瀏覽器）與 **Booth Shell**（`/room`、`/room/remote`）；
  - Platform **`/v1/booth/*`**、`device_token` 核發／撤銷（Dash）。
- 語言：**Rust**（長期常駐、WebRTC、系統服務）。
- **兩種模式（同一 binary）：**
  - **`pg-boothd`（hub，預設）** — Booth **Hub** Engine；連 Platform。
  - **`pg-boothd peer`** — Booth **Peer** Engine；**只**連 Hub；不持有 `device_token`。
- 與 `src/sam-host/node`（SAM headless）**分離**；與 `go-client/`、`platform-api/` **分 repo**。

### 11.2 Hub 必須實作（對齊 ROOM）

| 子系統 | 說明 |
| --- | --- |
| WebRTC Hub | 2+2 transceiver；program／presence 轉發；在場聲混音（ROOM §9.8.1） |
| Platform invite | 門牌 `invite.room` mint；Guest 握手經 **BoothAnchor**（§10.7）；**device_token** 或輪替 API key |
| `session_*` DC | 與現行 roster 模組語意一致 |
| Guest mesh | `session_mesh` 介紹；檔直連優先（ROOM 1c） |
| 分享目錄 + HTTP | 本機 `http://127.0.0.1:<port>/room-file/<id>`（Range）；遠端仍 DC transfer |
| 私有片庫 | `~/.pg-booth/private/`（可設定）；**不** fanout |
| BoothAnchor | WSS 註冊、心跳、Guest join 轉發、Operator signal 轉發（**hub only**） |
| Control Channel | 本地 WS `/booth/control` |
| `peerCap` | mint／revoke；Peer join 驗證 |

### 11.2b Peer 必須實作

| 子系統 | 說明 |
| --- | --- |
| Hub 連線 | 帶 `peerCap` 完成 signaling + WebRTC（**不**打 Platform） |
| `session_*` DC | 與 Guest 相同語意；可選僅 live、僅分享目錄 |
| 分享目錄 | 本機路徑或相機／麥 capture |
| 自動重連 | Hub 仍在且 `peerCap` 有效時重試；過期須重新配對 |

### 11.3 媒體邊界（監控 MVP — 定案 #5）

| 場景 | 策略 | 階段 |
| --- | --- | --- |
| Peer 鏡頭 cast 上大螢幕 | Peer owner 產軌，Hub 轉 | **D1 必做** |
| Guest 鏡頭 cast 上大螢幕 | Guest owner 產軌，Hub 轉 | D1（瀏覽器路徑） |
| 分享目錄檔 cast | Owner 端渲染（Guest 掛檔） | D2 |
| Host 私有片庫 cast | ffmpeg／headless Chromium | **D3／延後** |
| 大螢幕 SAM 開局 | 非目標 | — |

**D1 明確不做：** Host 私有檔上大螢幕、Embedded 開局、完整 mesh 壓測。

### 11.4 裝置憑證（`device_token`）

| 項 | 規格 |
| --- | --- |
| **核發** | **`pg-boothd login`**（hub 模式）走 OAuth device flow 或 dash 一次性碼 |
| **儲存** | `~/.pg-booth/credentials.json`（0600）；**hub only** |
| **權限** | invite.room + booth anchor；**不能**代發 `invite.compose`；**不能**當 `peerCap` |
| **撤銷** | Dash 遊樂場 tab「裝置」列表 → 撤銷；daemon 下次心跳 `401` → 頁內／CLI 提示重新 login |
| **與 API key 關係** | 輪替「登入我的遊樂場」**不**自動殺 device_token；二者獨立 |

### 11.5 CLI（草案）

```text
pg-boothd login          # 綁定帳號（hub；核發 device_token）
pg-boothd start          # 前景跑 Hub + anchor
pg-boothd peer join      # Peer：帶 peerCap／掃 QR
pg-boothd install        # systemd／launchd（hub 單元；peer 另單元）
pg-boothd status         # sessionId／peerCount／anchor online
pg-boothd stop           # 優雅 booth.intent.end + 退出（hub）
```

### 11.6 本 repo 與外部 repo 分工

**`pg-boothd`（私有 repo；契約對齊 §11.2–11.2b）：** hub／peer 實作、WebRTC、本機 `/room-file`、Control Channel server、`~/.pg-booth/` 執行時狀態。目錄佈局由該 repo 自管；**勿**在 `playgrounds` 加 `boothd/`。

**`playgrounds`（本 repo；開源宿主）：**

```text
go-client/src/lib/booth/
  boothHubEngine.ts      # 介面 + Embedded Hub 實作
  boothPeerClient.ts     # Peer 連 Hub（TS 嵌入式 peer 若需要）
  boothShellClient.ts    # Daemon 本地 WS / Operator 遠端
  boothState.ts          # snapshot 型別
  boothOperatorRtc.ts    # Operator peer
platform-api/src/boothAnchorDo.ts   # BoothAnchor DO
```

共用 wire 型別可放 `src/components/playgrounds/roster/boothChannel.ts`（與 `session_*` 並列）。

---

## 12. Booth Shell 路由（go）

| 路由 | 模式 | 說明 |
| --- | --- | --- |
| `/room` | `embedded` 或 `shell` | 無 live daemon → Embedded；有 daemon → 本地 Shell 連 `localhost` 或提示「常駐包廂已運行」 |
| `/room/remote` | `operator` | Operator cap；連 Anchor + WebRTC |
| `/i/<short>` | `guest` | **不變** |

Shell **重用** `GoRoomSurface` 等元件；`boothMode: "embedded" | "shell" | "operator"` 控制 intent 出口與唯讀鎖。

---

## 13. 與 [PG-GO-ROOM-PLAN.md](./PG-GO-ROOM-PLAN.md) 的修訂對照

### 13.1 條文修訂

| ROOM 原文 | 本計劃修訂 |
| --- | --- |
| 包廂活著＝主持 `/room` 還開著（§6.4） | 包廂活著＝**Hub session** 還在 |
| 主持永遠是開 `/room` 的那台（§5.4） | 權威在 **Hub**；Shell 可替換 |
| 已登入再開 `/room`＝另一間空包廂（§5.4） | 有 live Daemon Hub → **本地 Shell 連回**；無 → Embedded 新開 |
| 第二台請掃門牌（§5.4） | Guest 仍掃門牌；**監控正式路徑**＝Peer `peerCap`；Operator 不走門牌 |
| 不做完美斷線重連（§3） | Operator／Shell↔Hub 可重連；Guest 靠門牌；Peer 靠 `peerCap` |
| 私有 OPFS（§5.5.1） | Embedded 仍 OPFS；daemon → **`~/.pg-booth/private/`** |
| Platform 不中繼資料面 | **維持**；Anchor 只 control + signal 轉發 |

### 13.2 ROOM 明確不變

兩個時鐘（門牌 TTL）、Guest 掃 `/i/`、單路大螢幕、否決監視牆、wire `session_*`（含 `session_booth` moderation）、**連線遊戲只 `invite.room`**（`invite.compose` Superseded）、`/room-file` 語意。

### 13.3 建議 ROOM 原文替換句（落地 E1 時改）

**§6.4 表「包廂」列：**

> 活著條件：**Booth Hub session** 還在（Embedded＝`/room` 分頁內 Hub；常駐＝`pg-boothd` hub）。死法：`booth.intent.end`、Hub 行程停、Embedded 關分頁。

**§5.4 硬規則第 2 點後增：**

> 遠端導播＝**Operator** 連回既有 **Hub**（見 ENGINE-PLAN）；**不是**再開 `/room`、**不是** Guest 門牌。監控鏡頭＝**Peer Engine**（`peerCap`）；**不是** Platform 門牌。

---

## 14. `BoothHubEngine` 介面（E1 契約）

Embedded Hub 與 Daemon Hub 共用；Shell 只依賴此介面 + 媒體 surface API。**Peer** 為獨立 client（`BoothPeerClient`／`pg-boothd peer`），**不**實作此介面。

```ts
/** 權威包廂 Hub — 無 DOM */
export interface BoothHubEngine {
  readonly sessionId: string;
  readonly engineRole: "hub";
  readonly mode: "embedded" | "daemon";

  /** 訂閱 state；回傳 unsubscribe */
  subscribe(
    scopes: BoothSubscribeScope[],
    listener: (msg: BoothEngineEvent) => void
  ): () => void;

  /** Shell intent；回傳 ack */
  dispatch(intent: BoothIntent): Promise<BoothAck>;

  /** Guest／Peer／Operator WebRTC 由 Hub 持有；Shell 取 program/presence 軌綁 UI */
  getMediaSurface(): BoothMediaSurface;

  /** 優雅散場 */
  shutdown(reason?: "user" | "replace"): Promise<void>;
}

export type BoothIntent =
  | { type: "invite.mint" }
  | { type: "invite.revoke" }
  | { type: "cast.offer"; payload: SessionCastOffer }
  | { type: "cast.unoffer" }
  | { type: "cast.state"; payload: SessionCastState }
  | { type: "peer.mint"; label?: string; ttlSec?: number }
  | { type: "peer.revoke"; peerCapId: string }
  | { type: "ejectPeer"; peerId: string }
  | { type: "end" };

export interface BoothMediaSurface {
  /** 綁大螢幕槽 <video> */
  bindProgramVideo(el: HTMLVideoElement): void;
  /** Operator／host Shell 預覽在場（非房級自動收影像） */
  requestPresencePreview(peerId: string, el: HTMLVideoElement): void;
  releasePresencePreview(peerId: string): void;
}
```

**重構策略（E1）：**

1. `roomRuntime.ts`／`goRoomMedia.ts` 的 Hub 邏輯逐步收斂進 `EmbeddedBoothHubEngine`。
2. `GoRoomSurface` 改向 `BoothShellClient` 要 snapshot／送 intent，**不**直接 `mintInvite`。
3. 第一刀可保留 `roomRuntime` 為 facade，`BoothHubEngine` 薄包裝——但 **intent 入口**須單一。

**測試：** `boothHubEngine.test.ts` 覆蓋 director 鎖、cast ack、`peerCap` mint、散場；現有 `roomRuntime.test.ts` 改 import Hub mock。

---

## 15. 安全

- Anchor 註冊須 **ownerUserId** 匹配；`anchorSecret` 只給 **Hub** 行程（記憶體；daemon 不寫 log）。
- `device_token` **僅 hub**；可撤銷；**不**與 access token 互換；**不**發給 Peer。
- `peerCap` 只由 Hub mint；**不**上傳 Platform；過期／撤銷後 Peer 須重新配對。
- Operator cap：**5m TTL**、單次或短會話、綁 `ownerUserId`；**不**綁 Guest join_cap。
- **禁止**用猜 `boothSessionId` 連他人包廂（stub id＝`ownerUserId` + cap 驗證）。
- 啟用常駐／錨點須**明示同意**（雲端可見「包廂在線」；**不含**媒體上雲）。
- 遠端「結束這一間」須頁內確認（`no-native-dialogs`）。
- Anchor WSS **只**轉 JSON；**禁止** debug 記錄 `anchor.signal` SDP 正文於 production log（與 invite signal 同級）。

---

## 16. 實作分期

| 階段 | 交付 | 驗收 |
| --- | --- | --- |
| **E0 契約** | 本文件 + GLOSSARY + ROOM 交叉引用 | 審閱通過 |
| **E1 Hub 介面** | `BoothHubEngine` TS 介面；Embedded 重構為實作體 | 單測；現行 e2e 不 regress |
| **E2 Anchor + Operator（Embedded）** | `BoothAnchorDO`、`boothChannel` 型別、go `/room/remote`、Dash 狀態卡 | 家裡 Embedded；外出 Operator 切 live cast；E2 驗收 §17 |
| **E3 `pg-boothd` MVP** | **外部私有 repo** 交付 hub + peer；本 repo Platform／Shell 對齊契約 | §18 驗收（跨 repo 手測） |
| **E4 產品化** | 裝置綁定、systemd、room TURN | 跨網 Operator 穩定 |
| **E5** | 私有片庫 cast、完整 mesh／HTTP 對齊 | 非監控阻塞 |

**第一刀建議：** E1 → E2（驗證遠端導播產品路徑）→ E3（監控正式機制）。

---

## 17. 定案（原開放問題）

| # | 問題 | 定案 |
| --- | --- | --- |
| 1 | Embedded 與 Daemon 並存 | 有 live Daemon 時 `/room` **預設 Shell 連回**；新開 Embedded 須**確認並結束 Daemon**（§8.3） |
| 2 | 導播優先 | **本地 host Shell ＞ Operator**；其餘 viewer（§7.4） |
| 3 | 裝置數 | **單帳號單 live Hub**；新 hub daemon `409` 除非 `force: true`（§10.2） |
| 4 | Operator signal | **Anchor WSS `anchor.signal`**；不新 `invite.kind`（§10.6） |
| 5 | Rust D1 媒體 | **Peer live cast**（優先）+ Guest live；不做 Host 私有檔（§11.3） |
| 6 | Hub／Peer 分離 | **Platform 只認 Hub**；Peer 只連 Hub + `peerCap`（§5.4） |

---

## 18. 驗收句

### E2（Embedded + Operator）

- [ ] Hub Embedded；`POST /v1/booth/anchors` 後 Dash 顯示在線。
- [ ] 外出 Operator `/room/remote` 連回；可 `cast.offer` 切 Guest live。
- [ ] 本地 `/room` Shell 連上後搶回 director；Operator 降 viewer。
- [ ] Operator 斷線重連；Guest **不**掉。
- [ ] Platform log 無 SDP 正文持久化。

### E3（`pg-boothd` hub + peer 監控 MVP）

- [ ] 家裡 `pg-boothd`（hub）常駐；無瀏覽器分頁；Dash 顯示在線。
- [ ] ≥2 支裝置 `pg-boothd peer` 掛鏡頭；Hub 不關鏡頭。
- [ ] 外出 Operator 切換大螢幕來源（單路；Peer live）。
- [ ] 關 Operator Shell；Hub 與 Peer **不散場**。
- [ ] Peer 斷線重連（`peerCap` 仍有效）；Hub 仍在。
- [ ] `pg-boothd stop`（hub）；Peer／Guest 看到主持已關閉；Anchor offline。
- [ ] Peer 行程**無** Platform API 呼叫（流量／log 可驗）。

---

## 19. 變更紀錄

| 日期 | 變更 |
| --- | --- |
| 2026-08-23 | **`invite.compose` Superseded；`play`／`go` 皆 Booth Hub：** 連線遊戲只 `invite.room`；Invite DO **保留**（門牌） |
| 2026-08-23 | **Guest join 經 Anchor（§10.7）：** 包廂握手廢 Invite DO long poll；Hub 開著須 Anchor WSS；無 fallback |
| 2026-08-23 | 初稿：Engine／Shell 分離、`pg-boothd`、BoothAnchor DO、Operator、Control Channel、ROOM 修訂對照 |
| 2026-08-23 | 第二刀：Control Channel 幀表、`snapshot` 形狀、產品流程、Anchor WSS／HTTP 定案、Operator `anchor.signal`、`device_token`、`BoothEngine` 介面、開放問題定案、E2/E3 驗收拆分 |
| 2026-08-23 | 第三刀：**Hub／Peer 雙模式**；Platform **只認 Hub**；`peerCap` 配對；監控路徑改 Peer；`BoothHubEngine` 介面；`pg-boothd peer` |
| 2026-08-23 | 第四刀：**`pg-boothd` 獨立私有 repo**、非開源；本 repo 只定契約與 go／Platform 整合 |
