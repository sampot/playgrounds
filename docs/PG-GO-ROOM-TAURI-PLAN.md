# Playgrounds 純玩版：桌面常駐包廂（`pg-booth-desktop`／Tauri hybrid）

> **狀態：** Draft（2026-08-24，**第九刀**）— 契約從屬 [PG-GO-ROOM-ENGINE-PLAN.md](./PG-GO-ROOM-ENGINE-PLAN.md)（Engine／Shell 分離、BoothAnchor、Control Channel）；**未落地**  
> **權威決策：** 從屬 [DECISIONS.md](./DECISIONS.md) **DEC-050**（純玩版）、**DEC-045**（Roster／薄 signaling）、**DEC-047**（Platform Invite／Dash）；**不另開 DEC**  
> **相關：** [PG-GO-ROOM-PLAN.md](./PG-GO-ROOM-PLAN.md)（包廂產品契約）、[PG-GO-ROOM-ENGINE-PLAN.md](./PG-GO-ROOM-ENGINE-PLAN.md)（`pg-boothd` native engine、Hub／Peer、Operator）、[PG-GO-ROOM-RECORD-PLAN.md](./PG-GO-ROOM-RECORD-PLAN.md)（多路 live 錄影）、[PG-GO-ROOM-PLAY-PLAN.md](./PG-GO-ROOM-PLAY-PLAN.md)（開局——與常駐正交）、[PG-GO-CLIENT-PLAN.md](./PG-GO-CLIENT-PLAN.md)、[PG-GO-AUTH-PLAN.md](./PG-GO-AUTH-PLAN.md)、[PG-PLATFORM-API-PLAN.md](./PG-PLATFORM-API-PLAN.md)、[PG-PLATFORM-DASH-SPEC.md](./PG-PLATFORM-DASH-SPEC.md)、`.cursor/rules/no-native-dialogs.mdc`、`.cursor/rules/mobile-first-ux.mdc`、[GLOSSARY.md](./GLOSSARY.md)  
> **`pg-booth-desktop`：** **私有 Tauri hybrid repo**；**非**開源；**不在**本 repo（`playgrounds`）落地實作——本文件只定義與 go／Platform 的**契約邊界**  
> **`pg-boothd`：** **私有 native engine repo**（headless）；**與本產品不共用 Rust 程式**——見 [PG-GO-ROOM-ENGINE-PLAN.md](./PG-GO-ROOM-ENGINE-PLAN.md)

一句話：**輕量 GUI 節點**＝私有 repo **`pg-booth-desktop`**（Tauri hybrid：托盤／關窗不散場）＋ **`playgrounds`／`go-client` web 程式**（Embedded Hub、`GoRoomSurface`）；Platform 語意與 **`pg-boothd` native headless** **相同**（BoothAnchor、`device_token`、`invite.room`、wire `session_*`），但**實作線不同**——hybrid **不**與 native engine 共用 Rust crate，**以 web 版程式為主**；native engine 專攻單板電腦、伺服器等 **headless** 環境。

---

## 1. 動機

- [PG-GO-ROOM-ENGINE-PLAN.md](./PG-GO-ROOM-ENGINE-PLAN.md) 已定 **Embedded Hub**（瀏覽器 `/room`）與 **`pg-boothd`**（native headless）兩極；中間缺少**一般會員可裝、可 7×24 常駐**的 **GUI 節點**路徑（家裡舊筆電、平板等有螢幕環境）。
- 瀏覽器分頁當 Hub：背景節流、關分頁即散、OPFS／SW 綁 origin——不適合家裡 NUC／舊筆電當「屋子」。
- **`pg-boothd`** 適合 NAS／機房／邊緣 headless peer，但對一般使用者 CLI／systemd 門檻高，且**不是**為 GUI 殼設計。
- **Tauri hybrid** 可**直接複用** `go-client` **web 版**（Embedded Hub、`BoothHubEngine` TS、Shell UI），Tauri 只補**常駐殼**（托盤、持久化、FS plugin、深鏈）——**不必**與 `pg-boothd` 共用 Rust 引擎 crate。
- native headless 與 GUI hybrid **定位不同**（§9）；維護上靠**契約對齊**（Platform API、`boothChannel`），**不是**共用 `booth-*` workspace——**禁止**在 `playgrounds` 開 `booth-tauri/`。

---

## 2. 目標

- **常駐 Hub（硬）：** `pg-booth-desktop` 行程＝**Booth Hub Engine**（WebView 內 **Embedded Hub**）；關閉視窗＝**最小化到托盤**，不散場；僅「結束包廂」或退出 app 才 `booth.intent.end`。
- **契約對齊 native engine（硬）：** BoothAnchor WSS、Guest 握手經 Anchor（ENGINE §10.7）、`invite.room` mint、`device_token`、Control Channel `booth.*`、wire `session_*`——與 `pg-boothd` hub **同一 Platform 語意**；Dash **不**新開 API kind。
- **web 程式為主（硬）：** Hub／Shell 邏輯在 **`go-client` 建置產物**（`EmbeddedBoothHubEngine`、`GoRoomSurface`）；Tauri Rust 層**只**扛殼職責（§7.2）；**不**依賴 `pg-boothd` 的 Rust crate。
- **Shell 可選（硬）：**
  - **同殼 Shell：** WebView 內嵌 `go-client` `/room`（家裡大螢幕）。
  - **托盤無窗：** 僅 Hub；外出 `/room/remote` Operator。
  - **外殼 Shell：** 瀏覽器 `go` `/room` 偵測本機 Hub → `boothMode: "shell"` 連 `localhost` Control Channel（ENGINE §12）。
- **單帳號單 Hub（硬）：** 與 ENGINE §10.2 相同；桌面 Hub 與 Embedded／另一 `pg-boothd` **互斥**；衝突時須明確 replace 或拒絕。
- **GUI 環境（硬）：** 目標含手機、平板與其他有 GUI 的裝置（Android／iOS 背景政策複雜，見 §3 非目標 MVP）。

---

## 3. 非目標

- 在 **`playgrounds`** 內開發／開源 Tauri 或 native engine 原始碼。
- **與 `pg-boothd` 共用 Rust 程式**（`booth-hub`、`booth-anchor` 等 crate **不**跨 repo 引用）。
- **取代** `pg-boothd` 全部能力（低記憶體 headless、邊緣手機 peer、機房 systemd 為主路徑仍歸 native engine）。
- 雲端 SFU、Platform 載媒體、永久房號——與 ENGINE 相同否決。
- **Android／iOS 常駐 Hub** 作 MVP（背景政策複雜；監控鏡頭仍優先 `pg-boothd peer`）。
- Tauri 內用 `window.alert`／`confirm`／`prompt`（對齊 `no-native-dialogs`；破壞性操作須頁內或原生自訂面板，與 go 一致）。
- 把 **Peer** 做成 Platform `invite.kind`（仍只認 Hub 本機 `peerCap`）。
- **第一版** 大螢幕 SAM 開局（`session_play`）；不阻塞監控 MVP。
- 在 hybrid 內再寫一套 native Rust Hub 引擎以「對齊 boothd」——應擴充 **web Embedded Hub**，非 fork native crate。

---

## 4. 用語（硬）

| 用 | 意思 |
| --- | --- |
| **`pg-booth-desktop`** | **私有 Tauri hybrid repo**；輕量 **GUI 節點**；Tauri 殼＋`go-client` web bundle |
| **`pg-boothd`** | **私有 native engine repo**（Rust）；headless CLI；hub／peer；**與 desktop 不共用 Rust** |
| **Desktop Hub** | 由 `pg-booth-desktop` 承載的 Booth Hub Engine（**web Embedded Hub**）；Platform 視為與 daemon hub **同類** |
| **Hybrid 殼** | Tauri 原生層（托盤、FS、持久化）＋ WebView（`go-client` Hub＋Shell） |
| **Native engine** | `pg-boothd`；專為 headless（單板電腦、伺服器、NAS、邊緣 peer） |
| **Web-first** | Hub／cast／`session_*` 在 TS（`go-client`）；與瀏覽器 Embedded 同程式路徑 |

對讀者：產品仍說「**常駐包廂**」「**裝桌面版**」；勿暴露 repo 分線（除非安裝說明）。

---

## 5. 私有 repo 架構（與 native engine 分線）

### 5.1 兩條實作線

```text
pg-boothd/（私有 native engine repo）     pg-booth-desktop/（私有 Tauri hybrid repo）
├── crates/booth-*                        ├── apps/booth-desktop/     # Tauri 殼 only
├── apps/boothd/                          └── vendor/go-client-dist/  # playgrounds 建置產物
└── （headless hub／peer）                        （Embedded Hub + Shell UI）

        契約對齊（Platform、boothChannel）          web 程式共用 playgrounds
        ═══════════════════════════════════         ═══════════════════════════
        不共用 Rust crate                           不引用 pg-boothd crates
```

### 5.2 `pg-booth-desktop` 目錄（草案）

```text
pg-booth-desktop/
├── apps/booth-desktop/              # Tauri：托盤、視窗、深鏈、plugin-fs、開機自啟
├── vendor/go-client-dist/           # playgrounds CI artifact 或 pinned tag
└── （無 booth-hub／booth-anchor 等 native engine crate）
```

**硬：** Hub 邏輯在 **web bundle**（`EmbeddedBoothHubEngine`）；Rust **只**實作殼與最小 IPC（路徑、憑證 secure store、prevent_sleep）。Anchor／WebRTC／cast **不**在 Rust 重寫以「對齊 boothd」。

### 5.3 與 `playgrounds` 分工

| 項 | `pg-boothd`（native） | `pg-booth-desktop`（hybrid） | `playgrounds`（開源） |
| --- | --- | --- | --- |
| Headless hub／peer | ✅ Rust | ❌ | ❌ |
| Tauri 殼、托盤 | ❌ | ✅ | ❌ |
| Embedded Hub（TS） | ❌ | ✅ 消費 dist | ✅ 權威原始碼 |
| `boothChannel`／`BoothHubEngine` 契約 | 對齊消費 | 對齊消費 | ✅ 權威定義 |
| go `/room`、`/room/remote` Shell | ❌ | 打包進 dist | ✅ 原始碼 |
| Platform `BoothAnchorDO`、`/v1/booth/*` | 客戶端消費 | 客戶端消費（web 層） | ✅ 實作 |

**跨 repo 同步：** `boothChannel.ts` ↔ native `booth-protocol` **同形**（契約測試）；`go-client` 建置產物由 `pg-booth-desktop` CI 拉取打入 Tauri `frontendDist`。

---

## 6. 部署形狀（對照 ENGINE §5.3）

| 模式 | Hub | Peer | Shell | 典型用途 |
| --- | --- | --- | --- | --- |
| **Desktop Hub（托盤）** | `pg-booth-desktop` | — | 無或托盤選單 | 家裡 7×24、無大螢幕 |
| **Desktop + 同殼 UI** | 同上 | — | WebView `/room` | 家裡電視／筆電 |
| **Desktop + 瀏覽器 Shell** | 同上 | — | `go` 連 `localhost` WS | Hub 背景、Shell 用瀏覽器 |
| **Desktop + Operator** | 同上 | 可選 `pg-boothd peer` | 外出 `/room/remote` | 遠端導播 |
| **Daemon Hub** | `pg-boothd` | — | 無或遠端 Operator | NAS／機房（headless） |
| **Daemon + Peer** | `pg-boothd` | `pg-boothd peer` ×N | 可選 | 舊手機鏡頭（主路徑） |

Platform／Dash 只辨識 **Hub online**＋`device_token`；UI 可標「桌面」或「daemon」，**不**影響協定。

---

## 7. Hybrid 執行體

### 7.1 分層

```text
┌─────────────────────────────────────────────────────────────┐
│ apps/booth-desktop（Tauri 殼）                               │
│  · 視窗／托盤／單實例／prevent_sleep／deep link／開機自啟      │
└───────────────┬─────────────────────────────────────────────┘
                │ WebView（go-client 靜態 bundle）
                ▼
┌─────────────────────────────────────────────────────────────┐
│ go-client（Embedded Booth Hub + Shell）                      │
│  · EmbeddedBoothHubEngine（TS）— Hub 權威                   │
│  · BoothAnchor WSS、WebRTC、cast、session_*                   │
│  · GoRoomSurface；boothMode: "embedded" 或 "shell"           │
│  · Tauri plugin-fs → privateLibraryDir（§7.4）               │
└───────────────┬─────────────────────────────────────────────┘
                │ WSS
                ▼
         BoothAnchorDO @ Platform
```

**與 native engine 對照：** `pg-boothd` 把 Hub 放在 Rust；hybrid 把 Hub 放在 **web**——兩者 Platform 邊界**語意相同**、**程式庫不同**。

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
| **憑證** | 可選 secure store 包裝 `device_token`；**不**在 Rust 重寫 Platform client |

**硬：** Tauri Rust **不**承擔 BoothAnchor 長連、WebRTC Hub、cast fanout——這些在 **web Embedded Hub**。

### 7.3 WebView（Hub + Shell）職責

| 項 | 規格 |
| --- | --- |
| **Hub** | `EmbeddedBoothHubEngine`（與瀏覽器 `/room` **同程式路徑**） |
| **Platform** | web 層 `device_token`、Anchor WSS、Guest join（ENGINE §10.7） |
| **Shell** | `GoRoomSurface`；本地大螢幕或 `boothMode: "shell"` |
| **媒體** | WebRTC 在 WebView；`BoothMediaSurface` 綁 `<video>` |
| **演進** | 新 Hub 能力**先**在 `playgrounds`／`go-client` 落地；desktop **跟 dist**——**不**在 Rust fork 引擎 |

**硬：** WebView **是** Hub 權威（hybrid 模型）；**不是**「過渡態等 Rust 引擎」。

### 7.4 儲存

| 項 | 路徑／行為 |
| --- | --- |
| **私有片庫** | `{app_data}/booth/private/`；**不用** WebView OPFS |
| **Shell 讀寫** | go-client `createHostPrivateLibrary()` → `@tauri-apps/plugin-fs` 直寫 `booth_paths.privateLibraryDir`；layout＝`manifest.json`＋`files/pvt_*`（與 OPFS／daemon 同形） |
| **plugin-fs scope（硬）** | Tauri `allow-fs-private-library.toml`：`$HOME/.local/share/pg-booth/private/**`（Linux）、`$HOME/Library/Application Support/me.samkuo.pg-booth/private/**`（macOS）、`$APPDATA/me/samkuo/pg-booth/private/**`（Windows）；與 native `booth_storage::private_library_dir()` **目錄契約**一致（**非**程式共用） |
| **`device_token`** | web 層或 Tauri secure store；格式與 `pg-boothd` **同契約**（`~/.pg-booth/credentials.json` 0600） |
| **`shellLocalToken`** | `~/.pg-booth/shell.token` 或 app 專用路徑；僅 loopback Control Channel |

---

## 8. Platform／Dash 契約

- Hub 註冊、`POST /v1/booth/anchors`、`device_token` scope——與 ENGINE §10、§11.4 **相同**。
- Dash「遊樂場」tab：裝置列表可顯示 **「Playgrounds Booth（桌面）」** vs **「Playgrounds Booth（daemon）」**（`kind: hub` 不變）。
- `DELETE /v1/booth/anchors/active` → desktop 收 **graceful shutdown** IPC → `booth.intent.end`。
- **無** Tauri 專用 API；Peer 仍 **不**連 Platform。

---

## 9. 與 `pg-boothd` native engine 產品分級

| 維度 | **`pg-booth-desktop`（GUI hybrid）** | **`pg-boothd`（native headless）** |
| --- | --- | --- |
| **定位** | 輕量 **GUI 節點**；手機、平板等有螢幕環境 | **Headless**；單板電腦、伺服器、NAS、邊緣 |
| **目標使用者** | 一般會員、家裡一台舊電腦／平板 | 進階／NAS／機房／邊緣 |
| **安裝** | 圖形安裝包、托盤 | CLI、`install`（systemd／launchd） |
| **Hub 實作** | **web**（`go-client` Embedded Hub） | **Rust** native engine（**`gstreamer-rs`** 媒體棧） |
| **與 playgrounds** | **共用 web 程式**（主） | **契約對齊**（非程式共用） |
| **Rust 共用** | **無**（不引用 boothd crate） | 獨立 repo |
| **記憶體** | 較高（含 WebView） | 較低 |
| **Peer on 手機** | 非主路徑 | `pg-boothd peer` 主路徑 |
| **錄影** | 延後；hybrid＝`MediaRecorder`（web） | 先落地（`booth-record`＋**`gstreamer-rs`**） |
| **授權** | 私有 repo | 私有 repo（**不同 repo**） |

**敘事：** 「裝**桌面版**」＝GUI hybrid 常駐；「裝 **daemon**」＝headless 專業——**同一間包廂協定**，**不同實作線**。

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

| 階段 | `pg-booth-desktop` | `playgrounds` |
| --- | --- | --- |
| **T0 spike** | Tauri 托盤 + WebView Embedded Hub；plugin-fs 私有片庫 | `go-client` dist；契約測試 |
| **T1 Desktop MVP** | 24×7 常駐；Anchor 在 web 層；Operator 切台；單實例／優雅 end | `/room` 偵測 localhost；Dash 標籤 |
| **T2 產品化** | 開機自啟、更新、崩潰恢復 | 安裝說明連結（dash／docs） |
| **T3 Peer（可選）** | 仍引導 `pg-boothd peer` | — |

**與 ENGINE §16 對齊：**

- **E3a** — `pg-boothd` hub + peer MVP（**native engine repo**）
- **E3b** — `pg-booth-desktop` T1（本文件 §13）
- **E3c** — **僅** native `pg-boothd` 內 `booth-hub` 收斂；**不要求** desktop 遷 Rust 引擎

---

## 12. 風險與緩解

| 風險 | 緩解 |
| --- | --- |
| WebView 背景節流 WebRTC | Tauri `prevent_sleep`、托盤 keep-alive；必要時隱藏視窗常駐 |
| 與 native engine 契約漂移 | `boothChannel` 契約測試；pinned `go-client` artifact |
| 雙 Hub（瀏覽器 + desktop） | 啟動偵測 + replace UX（ENGINE §8.3） |
| hybrid 與 web Embedded 行為分歧 | **單一** `EmbeddedBoothHubEngine` 原始碼；desktop 只包殼 |
| 誤以為需共用 Rust crate | 文件與 CI **禁止** `pg-booth-desktop` 引用 `pg-boothd` crate |
| 在 Rust 重寫 Hub「對齊 boothd」 | **硬否決**；擴充 web Hub |

---

## 13. 驗收（E3b）

- [ ] `pg-booth-desktop` 常駐 ≥24h；關閉視窗後 Hub 仍活；Dash 顯示在線（標「桌面」）。
- [ ] Guest 掃 `/i/` 進房；握手經 BoothAnchor（與 `pg-boothd` 相同 Platform 路徑）。
- [ ] 外出 Operator `/room/remote` 可 `cast.offer` 切 live。
- [ ] 托盤「結束包廂」經頁內確認；Anchor offline；Guest／Peer 見散場。
- [ ] 同帳號啟動第二 Hub（Embedded 或 `pg-boothd`）有明確衝突處理。
- [ ] Hub／Anchor 在 **web 層**；**無** `pg-boothd` Rust crate 依賴；log 無 SDP 正文持久化。
- [ ] **不要求** E3b 完成 ≥2 手機 `pg-boothd peer`（屬 E3a）；desktop MVP 可單 Hub + 瀏覽器 Guest 驗收。

---

## 14. 文件修訂觸點（落地時）

| 文件 | 修訂 |
| --- | --- |
| [PG-GO-ROOM-ENGINE-PLAN.md](./PG-GO-ROOM-ENGINE-PLAN.md) | §11 native vs hybrid 分線；§16 E3 |
| [PG-GO-ROOM-PLAN.md](./PG-GO-ROOM-PLAN.md) | 活著條件增 desktop 常駐 |
| [PG-GO-ROOM-RECORD-PLAN.md](./PG-GO-ROOM-RECORD-PLAN.md) | native engine repo 敘事 |
| [PG-PLATFORM-DASH-SPEC.md](./PG-PLATFORM-DASH-SPEC.md) | 離線卡增「桌面版」安裝說明 |
| [GLOSSARY.md](./GLOSSARY.md) | `pg-booth-desktop`、`pg-boothd` 分線條目 |

---

## 15. 變更紀錄

| 日期 | 變更 |
| --- | --- |
| 2026-08-24 | **native 媒體棧：** `pg-boothd` cast／錄影統一 **`gstreamer-rs`**；§9 |
| 2026-08-24 | **第九刀：定位修訂** — GUI hybrid **不**與 native engine 共用 Rust；以 `playgrounds` web 為主；§5／§7／§9 重寫；移除 T0／T1 Rust 引擎收斂敘事 |
| 2026-08-24 | **pg-booth-desktop：** `tauri-plugin-fs` + `allow-fs-private-library` capabilities（對齊 private 路徑契約） |
| 2026-08-24 | **go-client 落地：** Desktop Shell 私有片庫經 `@tauri-apps/plugin-fs`＋`booth_paths.privateLibraryDir`；§7.4 增 plugin-fs scope／layout 契約 |
| 2026-08-24 | 初稿：Tauri 輕量常駐、與 `pg-boothd` 共用 crates 敘事（**第九刀廢止**）、Hybrid 分層、E3b 驗收 |
