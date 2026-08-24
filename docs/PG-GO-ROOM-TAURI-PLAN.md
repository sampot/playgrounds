# Playgrounds 純玩版：桌面常駐包廂（`pg-booth-desktop`／Tauri）

> **狀態：** Draft（2026-08-24）— 契約從屬 [PG-GO-ROOM-ENGINE-PLAN.md](./PG-GO-ROOM-ENGINE-PLAN.md)（Engine／Shell 分離、BoothAnchor、Control Channel）；**未落地**  
> **權威決策：** 從屬 [DECISIONS.md](./DECISIONS.md) **DEC-050**（純玩版）、**DEC-045**（Roster／薄 signaling）、**DEC-047**（Platform Invite／Dash）；**不另開 DEC**  
> **相關：** [PG-GO-ROOM-PLAN.md](./PG-GO-ROOM-PLAN.md)（包廂產品契約）、[PG-GO-ROOM-ENGINE-PLAN.md](./PG-GO-ROOM-ENGINE-PLAN.md)（`pg-boothd`、Hub／Peer、Operator）、[PG-GO-ROOM-RECORD-PLAN.md](./PG-GO-ROOM-RECORD-PLAN.md)（多路 live 錄影）、[PG-GO-ROOM-PLAY-PLAN.md](./PG-GO-ROOM-PLAY-PLAN.md)（開局——與常駐正交）、[PG-GO-CLIENT-PLAN.md](./PG-GO-CLIENT-PLAN.md)、[PG-GO-AUTH-PLAN.md](./PG-GO-AUTH-PLAN.md)、[PG-PLATFORM-API-PLAN.md](./PG-PLATFORM-API-PLAN.md)、[PG-PLATFORM-DASH-SPEC.md](./PG-PLATFORM-DASH-SPEC.md)、`.cursor/rules/no-native-dialogs.mdc`、`.cursor/rules/mobile-first-ux.mdc`、[GLOSSARY.md](./GLOSSARY.md)  
> **`pg-booth-desktop`／`pg-boothd`：** 於**私有 monorepo `pg-booth`** 開發；**非**開源產品；**不在**本 repo（`playgrounds`）落地實作——本文件只定義與 go／Platform 的**契約邊界**與 **monorepo 分工**

一句話：**輕量常駐包廂**＝私有 monorepo **`pg-booth`** 的 Tauri 安裝包 **`pg-booth-desktop`**（托盤／關窗不散場）＋與 **`pg-boothd`** 共用的 Rust **`crates/*`**；Hub 語意與 headless daemon **相同**（BoothAnchor、`device_token`、`invite.room`、wire `session_*`），差別在**交付形狀**（桌面 hybrid vs 無頭 CLI）——**不是**第二套協定，**不是** `playgrounds` 子專案。

---

## 1. 動機

- [PG-GO-ROOM-ENGINE-PLAN.md](./PG-GO-ROOM-ENGINE-PLAN.md) 已定 **Embedded Hub**（瀏覽器 `/room`）與 **`pg-boothd`**（headless 專業）兩極；中間缺少**一般會員可裝、可 7×24 常駐**的桌面路徑。
- 瀏覽器分頁當 Hub：背景節流、關分頁即散、OPFS／SW 綁 origin——不適合家裡 NUC／舊筆電當「屋子」。
- **`pg-boothd`** 適合 NAS／機房／邊緣 headless peer，但對一般使用者 CLI／systemd 門檻高。
- **Tauri hybrid** 可複用 `go-client` **Shell UI**（`GoRoomSurface`），同時用 **Rust 共用層** 扛 Anchor、憑證、本機儲存、Control Channel——避免在 TS 與 Rust 各實作一套 Platform 邊界。
- native／hybrid 維護有額外 effort（簽章、更新、各 OS 托盤）——應與 **`pg-boothd` 同一私有 monorepo**，共用 `booth-anchor` 等 crates，**禁止**在 `playgrounds` 開 `booth-tauri/`。

---

## 2. 目標

- **常駐 Hub（硬）：** `pg-booth-desktop` 行程＝**Booth Hub Engine**；關閉視窗＝**最小化到托盤**，不散場；僅「結束包廂」或退出 app 才 `booth.intent.end`。
- **契約對齊 daemon（硬）：** BoothAnchor WSS、Guest 握手經 Anchor（ENGINE §10.7）、`invite.room` mint、`device_token`、Control Channel `booth.*`、wire `session_*`——與 `pg-boothd` hub **同一 Platform 語意**；Dash **不**新開 API kind。
- **私有 monorepo（硬）：** `pg-booth` workspace 含 `apps/boothd`、`apps/booth-desktop`、`crates/booth-*`；**兩產物共用** Anchor／Platform／storage／control crates（§5）。
- **Shell 可選（硬）：**
  - **同殼 Shell：** WebView 內嵌 `go-client` `/room`（家裡大螢幕）。
  - **托盤無窗：** 僅 Hub；外出 `/room/remote` Operator。
  - **外殼 Shell：** 瀏覽器 `go` `/room` 偵測本機 Hub → `boothMode: "shell"` 連 `localhost` Control Channel（ENGINE §12）。
- **單帳號單 Hub（硬）：** 與 ENGINE §10.2 相同；桌面 Hub 與 Embedded／另一 daemon **互斥**；衝突時須明確 replace 或拒絕。
- **演進至共用 Hub 引擎（硬）：** T0 可過渡用 WebView 內 TS Hub；**T1 目標**＝Hub WebRTC／cast 遷入共用 `booth-hub` crate，與 `pg-boothd` **同一引擎、不同殼**——避免長期維護第三套 Hub。

---

## 3. 非目標

- 在 **`playgrounds`** 內開發／開源 Tauri 或 daemon 原始碼。
- **取代** `pg-boothd` 全部能力（低記憶體無頭、邊緣手機 peer、機房 systemd 為主路徑仍歸 boothd）。
- 雲端 SFU、Platform 載媒體、永久房號——與 ENGINE 相同否決。
- **Android／iOS 常駐 Hub** 作 MVP（背景政策複雜；監控鏡頭仍優先 `pg-boothd peer`）。
- Tauri 內用 `window.alert`／`confirm`／`prompt`（對齊 `no-native-dialogs`；破壞性操作須頁內或原生自訂面板，與 go 一致）。
- 把 **Peer** 做成 Platform `invite.kind`（仍只認 Hub 本機 `peerCap`）。
- **第一版** 大螢幕 SAM 開局（`session_play`）；不阻塞監控 MVP。

---

## 4. 用語（硬）

| 用 | 意思 |
| --- | --- |
| **`pg-booth`** | **私有 monorepo**（Rust workspace）；含 `pg-boothd`、`pg-booth-desktop` 與共用 `crates/*`；**非**開源；**不在** `playgrounds` |
| **`pg-booth-desktop`** | monorepo 內 Tauri 應用（安裝包）；**輕量常駐 Hub** 交付形狀 |
| **`pg-boothd`** | 同 monorepo 內 CLI 二進位；hub（預設）／`peer`；**專業 headless** 交付形狀 |
| **Desktop Hub** | 由 `pg-booth-desktop` 承載的 Booth Hub Engine；Platform 視為與 daemon hub **同類** |
| **Hybrid 殼** | Tauri 原生層（托盤、FS、Anchor）＋ WebView（go-client Shell UI） |
| **T0／T1** | T0＝過渡態（部分 Hub 在 WebView TS）；T1＝Hub 核心在共用 `booth-hub` crate |

對讀者：產品仍說「**常駐包廂**」「**裝桌面版**」；勿暴露 monorepo／crate 名（除非安裝說明）。

---

## 5. 私有 monorepo 架構

### 5.1 目錄（草案）

```text
pg-booth/                          # 私有 monorepo
├── Cargo.toml                     # workspace
├── crates/
│   ├── booth-protocol/            # booth.* envelope、snapshot、error codes（對齊 ENGINE §7）
│   ├── booth-platform/            # /v1/booth/*、invite.room、device_token OAuth
│   ├── booth-anchor/              # BoothAnchor WSS（註冊、心跳、join 轉發、anchor.signal）
│   ├── booth-control/             # localhost WS /booth/control + shellLocalToken
│   ├── booth-storage/             # ~/.pg-booth/、私有片庫、分享 index
│   ├── booth-http-file/           # /room-file/<id> Range HTTP
│   ├── booth-webrtc/              # 原生 WebRTC 封裝
│   ├── booth-hub/                 # Hub Engine 核心（cast、peerCap、session_* fanout）
│   ├── booth-peer/                # Peer Engine（peerCap join、掛檔／capture）
│   └── booth-record/              # ffmpeg / session_record（見 RECORD-PLAN）
├── apps/
│   ├── boothd/                    # pg-boothd CLI
│   └── booth-desktop/             # pg-booth-desktop（Tauri）
└── vendor/
    └── go-client-dist/            # playgrounds CI artifact 或 pinned tag（Shell UI）
```

### 5.2 Crate 共用矩陣

| Crate | `pg-boothd` | `pg-booth-desktop` | 說明 |
| --- | --- | --- | --- |
| `booth-protocol` | ✅ | ✅ | 與 `boothChannel.ts` **同形** |
| `booth-platform` | ✅ | ✅ | 登入、`device_token` |
| `booth-anchor` | ✅ | ✅ | **Hub 唯一 Platform 長連**；禁止 desktop 再在 WebView  duplicate |
| `booth-control` | ✅ | ✅ | 本地 Shell WS |
| `booth-storage` | ✅ | ✅ | 私有片庫；desktop 經 Tauri command |
| `booth-http-file` | ✅ | ✅（T1+） | 無瀏覽器 SW 時的檔案門面 |
| `booth-webrtc`／`booth-hub` | ✅ | ✅（T1） | boothd 先落地；desktop **收斂目標** |
| `booth-peer` | ✅ | △（Phase 2） | 邊緣 peer 主路徑仍 boothd |
| `booth-record` | ✅ | △（延後） | 見 [PG-GO-ROOM-RECORD-PLAN.md](./PG-GO-ROOM-RECORD-PLAN.md) |

**硬：** `booth-anchor` **不得**在 go-client WebView 與 Rust 各跑一套長連（T0 spike 除外，須在 T1 前移除 TS 側 Anchor 權威）。

### 5.3 與 `playgrounds` 分工

| 項 | `pg-booth`（私有） | `playgrounds`（開源） |
| --- | --- | --- |
| Hub／Peer 原生引擎 | ✅ | ❌ |
| Tauri 殼、托盤、安裝包 | ✅ | ❌ |
| `boothChannel`／`BoothHubEngine` TS 契約 | 對齊消費 | ✅ 權威定義 |
| Embedded Hub（瀏覽器過渡） | ❌ | ✅ |
| go `/room`、`/room/remote` Shell | 打包進 desktop 或拉 artifact | ✅ 原始碼 |
| Platform `BoothAnchorDO`、`/v1/booth/*` | 客戶端消費 | ✅ 實作 |

**跨 repo 同步：** `booth-protocol` ↔ `src/components/playgrounds/roster/boothChannel.ts` 同形；CI 可選 JSON schema codegen 或契約測試手動對齊。`go-client` 建置產物由 `pg-booth` CI 拉取打入 Tauri `frontendDist`。

---

## 6. 部署形狀（對照 ENGINE §5.3）

| 模式 | Hub | Peer | Shell | 典型用途 |
| --- | --- | --- | --- | --- |
| **Desktop Hub（托盤）** | `pg-booth-desktop` | — | 無或托盤選單 | 家裡 7×24、無大螢幕 |
| **Desktop + 同殼 UI** | 同上 | — | WebView `/room` | 家裡電視／筆電 |
| **Desktop + 瀏覽器 Shell** | 同上 | — | `go` 連 `localhost` WS | Hub 背景、Shell 用瀏覽器 |
| **Desktop + Operator** | 同上 | 可選 boothd peer | 外出 `/room/remote` | 遠端導播 |
| **Daemon Hub** | `pg-boothd` | — | 無或遠端 Operator | NAS／機房（專業） |
| **Daemon + Peer** | `pg-boothd` | `pg-boothd peer` ×N | 可選 | 舊手機鏡頭（主路徑） |

Platform／Dash 只辨識 **Hub online**＋`device_token`；UI 可標「桌面」或「daemon」，**不**影響協定。

---

## 7. Hybrid 執行體

### 7.1 分層

```text
┌─────────────────────────────────────────────────────────────┐
│ apps/booth-desktop（Tauri）                                  │
│  · 視窗／托盤／單實例／prevent_sleep／deep link／開機自啟      │
└───────────────┬─────────────────────────┬───────────────────┘
                │ IPC（Tauri commands）      │ WebView
                ▼                          ▼
┌───────────────────────────┐   ┌─────────────────────────────┐
│ 共用 crates（booth-*）     │   │ go-client Shell（靜態 bundle）│
│  · booth-anchor WSS       │   │  · GoRoomSurface             │
│  · booth-control WS       │   │  · boothMode: "shell"        │
│  · booth-storage          │   │  · 綁 program <video>        │
│  · booth-hub（T1+）       │   └─────────────────────────────┘
└───────────────┬─────────────┘
                │ WSS
                ▼
         BoothAnchorDO @ Platform
```

### 7.2 Tauri 殼職責（Rust／`apps/booth-desktop` only）

| 職責 | 規格 |
| --- | --- |
| **生命週期** | 關窗 → hide to tray；托盤「結束包廂」→ 頁內確認 UI（**禁止**原生 `confirm`）→ `booth.intent.end` |
| **單實例** | 同機至多一個 desktop Hub 行程 |
| **常駐** | 可選 `prevent_sleep`；可配置低功耗（降 Shell 預覽） |
| **托盤** | 狀態、成員數、開啟 Shell 視窗、Operator 深鏈、結束包廂 |
| **開機自啟** | 各 OS login item；使用者可關 |
| **深鏈** | `pg-booth://` 或喚起已安裝 app（喚起 Shell／顯示狀態） |
| **崩潰恢復** | watchdog 重啟；冪等 `openBooth`（須定義 session 恢復 vs 新 session） |
| **更新** | 各平台安裝包／自動更新通道（產品化階段） |

### 7.3 WebView 職責

| 階段 | 內容 |
| --- | --- |
| **T0** | 可含 Embedded Hub WebRTC（**過渡**）；Shell UI 必備 |
| **T1** | **僅 Shell**；Hub RTC／cast 由 `booth-hub`；WebView 經 Control Channel + `BoothMediaSurface` 綁 `<video>` |

**硬：** WebView **不**持有 `device_token` 長期明文；憑證由 `booth-platform` crate 管理，經 IPC 暴露最小表面。

### 7.4 儲存

| 項 | 路徑／行為 |
| --- | --- |
| **私有片庫** | `{app_data}/booth/private/`（`booth-storage`）；**不用** OPFS |
| **`device_token`** | secure store 或 `~/.pg-booth/credentials.json`（0600）；與 boothd **同格式** |
| **`shellLocalToken`** | `~/.pg-booth/shell.token` 或 app 專用路徑；僅 loopback Control Channel |

---

## 8. Platform／Dash 契約

- Hub 註冊、`POST /v1/booth/anchors`、`device_token` scope——與 ENGINE §10、§11.4 **相同**。
- Dash「遊樂場」tab：裝置列表可顯示 **「Playgrounds Booth（桌面）」** vs **「Playgrounds Booth（daemon）」**（`kind: hub` 不變）。
- `DELETE /v1/booth/anchors/active` → desktop 收 **graceful shutdown** IPC → `booth.intent.end`。
- **無** Tauri 專用 API；Peer 仍 **不**連 Platform。

---

## 9. 與 `pg-boothd` 產品分級

| 維度 | **`pg-booth-desktop`（輕量）** | **`pg-boothd`（專業）** |
| --- | --- | --- |
| **目標使用者** | 一般會員、家裡一台舊電腦 | 進階／NAS／機房／邊緣 |
| **安裝** | 圖形安裝包、托盤 | CLI、`install`（systemd／launchd） |
| **Hub 引擎** | 共用 `booth-hub`（T1 後） | 同左 |
| **記憶體** | 較高（含 WebView） | 較低 |
| **Peer on 手機** | 非主路徑 | `pg-boothd peer` 主路徑 |
| **錄影／ffmpeg** | 共用 `booth-record`；可晚一版 | 先落地 |
| **授權** | 私有 monorepo | 同 repo |

**敘事：** 「裝**桌面版**」＝輕量常駐；「裝 **daemon**」＝專業無頭——**同一間包廂協定**。

---

## 10. Booth Shell 與 go-client 整合

對齊 [PG-GO-ROOM-ENGINE-PLAN.md](./PG-GO-ROOM-ENGINE-PLAN.md) §12：

| 路由 | desktop 存在時行為 |
| --- | --- |
| `/room` | 偵測本機 Control Channel → **`boothMode: "shell"`**；或提示「常駐包廂已運行」並提供連回／結束 |
| `/room/remote` | **不變**（Operator） |
| `/i/<short>` | **不變**（Guest） |

**衝突（硬）：** 本機已有 desktop Hub 時，開 Embedded `/room` 須 **replace 或拒絕**（對齊 ENGINE §8.3、§17 #1）。

`boothMode` 擴充（契約草案）：

```ts
type BoothShellMode = "embedded" | "shell" | "operator";
/** Engine 回報 */
type BoothEngineMode = "embedded" | "daemon" | "desktop";
```

`desktop` 對 Shell 行為與 `daemon` **相同**（連 localhost Control Channel）；差別在產品文案與 Dash 標籤。

---

## 11. 實作分期

| 階段 | monorepo 交付 | `playgrounds` |
| --- | --- | --- |
| **T0 spike** | `booth-anchor`／`platform`／`storage`；Tauri 托盤 + WebView 過渡 Hub | 提供 go-client dist；契約測試 |
| **T1 Desktop MVP** | Anchor 全 native；24×7；Operator 切台；單實例／優雅 end | `/room` 偵測 localhost；Dash 標籤 |
| **T1b Hub 收斂** | WebRTC 遷入 `booth-hub`；WebView 僅 Shell | `BoothHubEngine.mode: "desktop"` |
| **T2 產品化** | 開機自啟、更新、崩潰恢復、`booth-http-file` | 安裝說明連結（dash／docs） |
| **T3 Peer（可選）** | 桌面 Peer 或仍引導 boothd peer | — |

**與 ENGINE §16 對齊：**

- **E3a** — `pg-boothd` hub + peer MVP（monorepo 先 boothd）
- **E3b** — `pg-booth-desktop` T1（本文件 §18）
- **E3c** — Hub 收斂 `booth-hub`（boothd + desktop 同一 PR 可改引擎）

---

## 12. 風險與緩解

| 風險 | 緩解 |
| --- | --- |
| T0 形成第三套 TS Hub | 文件標 T0 **過渡**；T1b **硬目標** |
| WebView 背景節流 WebRTC | T1 遷 `booth-hub`；過渡期 keep-alive／隱藏視窗 |
| Anchor 雙實作（TS + Rust） | T1 前移除 WebView 側 Anchor 權威 |
| 雙 Hub（瀏覽器 + desktop） | 啟動偵測 + replace UX（ENGINE §8.3） |
| hybrid 維護成本 | monorepo 共用 crate；**不**拆第三 repo |
| 跨 repo 契約漂移 | `booth-protocol` 契約測試；pinned go-client artifact |

---

## 13. 驗收（E3b）

- [ ] `pg-booth-desktop` 常駐 ≥24h；關閉視窗後 Hub 仍活；Dash 顯示在線（標「桌面」）。
- [ ] Guest 掃 `/i/` 進房；握手經 BoothAnchor（與 boothd 相同路徑）。
- [ ] 外出 Operator `/room/remote` 可 `cast.offer` 切 live。
- [ ] 托盤「結束包廂」經頁內確認；Anchor offline；Guest／Peer 見散場。
- [ ] 同帳號啟動第二 Hub（Embedded 或 boothd）有明確衝突處理。
- [ ] `booth-anchor` 僅 Rust 一條長連（T1 後）；log 無 SDP 正文持久化。
- [ ] **不要求** T1 完成 ≥2 手機 `pg-boothd peer`（屬 E3a）；desktop MVP 可單 Hub + 瀏覽器 Guest 驗收。

---

## 14. 文件修訂觸點（落地時）

| 文件 | 修訂 |
| --- | --- |
| [PG-GO-ROOM-ENGINE-PLAN.md](./PG-GO-ROOM-ENGINE-PLAN.md) | §5.3 增 Desktop 列；§11 改 monorepo；§16 E3 拆分 |
| [PG-GO-ROOM-PLAN.md](./PG-GO-ROOM-PLAN.md) | 活著條件增 desktop 常駐 |
| [PG-GO-ROOM-RECORD-PLAN.md](./PG-GO-ROOM-RECORD-PLAN.md) | §11.2 改 `pg-booth` monorepo |
| [PG-PLATFORM-DASH-SPEC.md](./PG-PLATFORM-DASH-SPEC.md) | 離線卡增「桌面版」安裝說明 |
| [GLOSSARY.md](./GLOSSARY.md) | `pg-booth`、`pg-booth-desktop` 條目 |

---

## 15. 變更紀錄

| 日期 | 變更 |
| --- | --- |
| 2026-08-24 | 初稿：Tauri 輕量常駐、`pg-booth` 私有 monorepo 與 `pg-boothd` 共用 crates、Hybrid 分層、T0／T1 演進、E3b 驗收 |
