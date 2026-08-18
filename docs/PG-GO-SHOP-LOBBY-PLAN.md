# Playgrounds 純玩版：遊樂場大廳 Lobby（go lobby）

> **狀態：** Draft（2026-08-18；修訂：里程碑含 **Phase B 輕量行走**；**大廳場景＝canvas**；**室內遊樂場**敘事）— Phase **A＋B** 已落地；布告欄 Phase B stub 已接線  
> **權威決策：** 從屬 [DECISIONS.md](./DECISIONS.md) **DEC-050**（純玩版 `go.samkuo.me`）；**不另開 DEC**  
> **相關：** [PG-GO-CLIENT-PLAN.md](./PG-GO-CLIENT-PLAN.md)、[PG-GO-BOSS-FLASH-PLAN.md](./PG-GO-BOSS-FLASH-PLAN.md)（老闆＝服務台）、[PG-GO-BULLETIN-PLAN.md](./PG-GO-BULLETIN-PLAN.md)（布告欄）、[PG-GO-ADS-PLAN.md](./PG-GO-ADS-PLAN.md)（廣告看板）、[PG-GO-ROOM-PLAN.md](./PG-GO-ROOM-PLAN.md)（包廂 `/room`；大廳熱點入口）、[PG-GO-UX-POLISH-PLAN.md](./PG-GO-UX-POLISH-PLAN.md)、[PG-GO-AUTH-PLAN.md](./PG-GO-AUTH-PLAN.md)、`.cursor/rules/no-native-dialogs.mdc`、`.cursor/rules/mobile-first-ux.mdc`、`.cursor/rules/game-assets-attribution.mdc`、[GLOSSARY.md](./GLOSSARY.md)

一句話：把 go **首頁 `/`** 從「App 列表殼」升級成 **室內遊樂場大廳**（湯姆熊式：走進去、逛大廳、玩機台）——**單一 `<canvas>`** 繪製室內地圖／機台 sprite／avatar；玩家在大廳內**輕量行走**（並保 hit／清單捷徑）接觸布告欄、詢問處、老闆服務台、機台、**包廂門**等；**殼是大廳、小品仍是小品**；深鏈 `/s/`／`/i/`／進 **`/room`** **不經強制逛大廳**。

> **程式識別：** 模組前綴可沿用 `GoShop*`／`goShop*`（Draft 檔名）；**讀者面**統一「遊樂場／大廳／機台」，勿譯成零售「店」。

---

## 1. 動機

- 老闆 flash、pixel chrome、對話氣泡已立起「遊樂場老闆／服務台」隱喻；首頁仍偏工具列表，世界觀斷在 Header。
- 布告／說明／推薦／已下載／廣告在 IA 上已分槽，但讀者心智仍是「幾個選單」——空間化可降低發現成本、強化玩家主場品牌，而不必新開產品能力。
- **「山姆鍋遊樂場」**在中文語境本就可指**室內遊樂場**（類湯姆熊：機台、大廳、服務台），與 Header 店招一致；**不是** outdoor 主題樂園全園，**不是** JRPG 道具店。
- 若把整站做成「一款可通關的 JRPG」，會與 DEC-050 快樂路徑（掃碼即入座、同時一 SAM、mobile-first）衝突。本計劃鎖定：**Lobby＝發現與世界觀層**。

---

## 2. 目標

- **大廳＝首頁主面：** `/` 以 **canvas 室內大廳**為主視覺與互動骨架；既有推薦／搜尋不消失，改掛為場景熱點或並存清單捷徑（清單＝**canvas 外** DOM shell）。
- **Canvas 場景（硬）：** 地圖、tile／sprite、avatar、熱點 hit-test、靠近提示、行走 loop **一律在 `<canvas>`** 內完成；**禁止** DOM（`<img>`／絕對定位 div）當大廳地圖或 NPC／機台本體。
- **熱點對位既有計劃：** 老闆→服務台；布告欄→bulletin；詢問處→頁內 RPG 對話（`/help` 仍為清單靜態說明）；**機台**→home picks／搜尋→`/s/<id>`；後場→`/apps`；廣告看板→`GoAdSlot`。**大廳不導向 `play`／場殼。**
- **雙模式（硬）：** **場景模式**＋**清單模式**永遠可切；清單模式＝可達的 DOM／鍵盤路徑（搜尋、推薦卡、說明連），不得因 canvas 失敗而鎖死。
- **深鏈 bypass（硬）：** `/s/<id>`、`/i/<short_id>` 不強制經過大廳；開玩後不疊行走 HUD。
- **里程碑含行走（硬）：** 交付須 **Phase A＋B**；行走可關、`prefers-reduced-motion`→靜態 hit；**不可**裁 B。
- **UX 硬規則：** 禁原生 dialog；mobile-first；canvas hit 區足夠；`prefers-reduced-motion`→靜態幀＋點選（仍 canvas，不跑移動 loop）。

---

## 3. 非目標

- 把 go 改成可通關／可存檔進度的獨立 JRPG 或 outdoor 全園 simulation。
- 大廳 canvas 再 materialize 一顆 SAM（大廳＝**shell UI**；**不是** SAM iframe）。
- DOM 當大廳地圖／機台／avatar 本體。
- 強制 onboarding、擋在 `/i/` 同意面之前先逛大廳。
- `canvasActive` 或 Invite 對弈中啟用大廳行走。
- 完整對話樹、好感度、多樓層、戰鬥、背包經濟。
- 場殼 `play` 同步同一大廳（第一刀**僅 go**）。
- 用場景取代 Platform 布告／老闆文案／廣告契約——只改**呈現與入口**。
- go 完整型錄貨架（DEC-050 非目標不變）。
- **大廳熱點導向 `play.samkuo.me`／場殼型錄**（Header 既有 mark 連結不在此限；大廳 canvas **不**再加 play 出口）。

---

## 4. 產品形狀（定案）

### 4.1 一句架構

```text
深鏈 /s|/i  ──bypass──►  載入／同意／SAM canvas（既有）
首頁 /      ──►  遊樂場大廳 Lobby（本計劃）──互動──► help／apps／bulletin／開 /s
清單模式     ──►  同能力、無空間（永遠可用）
```

**殼是大廳，遊戲仍是遊戲：** 進 `/s/` 或 `/i/` 後 UI 回到 chrome＋**SAM canvas**；大廳 Lobby canvas **卸載或隱藏**（與 SAM 畫布不同元素、不同生命週期）。

### 4.2 敘事錨點（硬）

| 讀者面 | 產品對位 | 不是 |
| --- | --- | --- |
| **山姆鍋遊樂場** | 整體品牌（Header 店招；類「○○遊樂場」） | 戶外全園、SaaS 產品名 |
| **大廳** | go `/` canvas 空間 | 完整型錄、第二 SAM |
| **機台** | `kind: game` → `/s/<id>` | 型錄瀏覽、編輯器 |
| **老闆／服務台** | boss flash、短選單 | 布告權威、玩家 profile |
| **後場** | `/apps` 本機已下載 | 雲遊戲庫 |

視覺傾向：**室內** tilemap（地板、走道、牆／欄杆、機台列、服務台、布告欄）；**勿** outdoor 草皮全園、**勿** RPG 藥水店陳列架當主視覺。

### 4.3 投放面

| 面 | 大廳 Lobby | 說明 |
| --- | --- | --- |
| **`/` 首頁** | ✅ 主場 | 大廳 canvas＋清單捷徑 |
| **`/help`／`/apps`／`/room`** | ❌ 不重做大廳 | 可從熱點進入；頁維持功能面 |
| **`/s/<id>` 載入／錯誤** | ❌ | 可「回遊樂場」→ `/` |
| **`canvasActive`** | ❌ | 大廳 canvas 不顯示、不接收輸入 |
| **`/i/`** | ❌ | 不經大廳；critical 布告見 bulletin 計劃 |

### 4.4 與既有通路邊界（硬・勿混）

| 物件／流 | 語意 | 大廳內表現 | 不是 |
| --- | --- | --- | --- |
| **老闆（服務台）** | 歡迎／碎念／操作 flash | 服務台 NPC；氣泡家族 | 布告、ads |
| **布告欄** | 站級營運公告 | 互動物件 → board／strip | 老闆台詞 |
| **詢問處** | 靜態說明 | 大廳內對話；完整文仍在 `/help` | 客服 |
| **機台** | 推薦／搜尋開玩 | hit→清單 overlay 或 `/s/<id>` | 完整型錄 |
| **後場門** | 本機溢流 | → `/apps` | 雲庫 |
| **廣告看板** | house／贊助 | canvas sprite；→ 下方 DOM `GoAdSlot` | 維修文案 |
| **Session chat** | 同局 peer | **不**進大廳 | — |
| **包廂** | 臨時隔間 `/room`（壽命＝主持畫面開著；說／掛／播） | 熱點 **包廂門** → `/room` | 局內 overlay；公開聊天區；視訊會議 |

---

## 5. 場景熱點目錄（MVP）

| `hotspotId` | 讀者面名稱 | 互動結果 | 備註 |
| --- | --- | --- | --- |
| `boss` | 櫃檯 | 碎念／短選單（今日機台、說明） | 讀者面按鈕＝櫃檯；對齊老闆計劃；自動歡迎仍 session 首次 `/` |
| `bulletin` | 布告欄 | 開 board（無則空態） | 依賴 bulletin；未實作可 stub |
| `help` | 詢問處 | 頁內 RPG 對話（一次一則） | `/help` 仍為清單／更多的靜態說明 |
| `cabinet` | 機台區 | 清單 overlay（蓋在 canvas 上） | 開玩＝`/s/<id>`；canvas 可繪多台 sprite |
| `storage` | 後場 | → `/apps` | 本機溢流 |
| `room` | 包廂 | → `/room` | 大廳畫成南向包廂門（隔間入口）。見 [PG-GO-ROOM-PLAN.md](./PG-GO-ROOM-PLAN.md) |
| `ad` | （裝飾） | 無互動；後牆 PLAY 僅視覺 | 廣告在頁面 `GoAdSlot`，不進捷徑 |

> **遷移：** 早期草案 `shelf`（試玩台）語意併入 **`cabinet`（機台）**；`door`→`play` 已移除（大廳不導場殼）。

**互動 UX（硬）：**

- canvas hit-test／鍵盤走動／點擊指定物件——同一 `hotspotId`。
- 結果用頁內面板、導航或 flash／board；**禁止**原生 dialog。
- 破壞性操作只在 `/apps` 確認面。

### 5.1 老闆短選單（定案傾向）

互動 `boss` 時 ≤3 選項：

1. **隨便說說** → 碎念  
2. **今日有什麼** → 機台區 overlay  
3. **怎麼玩** → `help`  

關閉＝取消；不擋清單 CTA。

---

## 6. 雙模式與深鏈（硬）

### 6.1 清單模式

- 永遠提供：搜尋、推薦開玩、使用說明（機台區 overlay；大廳捷徑「機台區」）。
- canvas 失敗、reduced-motion → 仍可用捷徑／hit 開 overlay；能力不減。
- 窄屏：**canvas 大廳**＋機台 overlay；勿把清單展開到頁面下方再捲動。

### 6.2 深鏈 bypass

| 進入 | 行為 |
| --- | --- |
| `/i/<short_id>` | 直接 Invite；**不**進大廳 |
| `/s/<id>` | 直接載入；可「回遊樂場」→ `/` |
| `/room` | 包廂殼面；**不**經大廳；見 [PG-GO-ROOM-PLAN.md](./PG-GO-ROOM-PLAN.md) |
| `/` | 大廳 Lobby；可觸發老闆自動歡迎 |

場景資產**懶載**，不阻塞 `/s/`／`/i/`。

---

## 7. 階段深度

| Phase | 名稱 | 內容 | 完成定義 |
| --- | --- | --- | --- |
| **A. 場景殼** | Hotspot lobby | canvas **室內** tile／機台 sprite；hit-test；清單並存 | 窄屏 hit 開玩；無移動也能 help／apps／開 `/s` |
| **B. 行走** | Walk | avatar 四向、靠近互動；可關 | 預設可走；關＝A；reduced-motion→A |
| **C. 打磨** | Polish | 進場過場（pixel wipe）、提示、署名 | 手測＋署名 |
| **—** | （不做） | 全園、任務、戰鬥 | — |

**定案：** 上線＝**A＋B**。

### 7.1 Phase B 移動（硬）

| 項 | 規格 |
| --- | --- |
| 範圍 | 僅 `/`；離開卸載 loop／rAF |
| 渲染 | 2D canvas；tilemap／sprite `drawImage`；**禁止** DOM sprite |
| 碰撞 | AABB／tile；無物理引擎 |
| 靠近 | 可選提示；**互動＝點擊／touch 該物件**（不用 Enter） |
| 桌面 | 方向鍵＋WASD 走動；點擊／touch 指定物件互動（不用 Enter） |
| 手機 | 點擊移動（tap-to-move）；點物件互動；**不做**虛擬十字 |
| 開關 | `localStorage` **`pg_go_lobby_walk`**：`on`｜`off`；預設 `on`（reduced-motion 除外） |
| reduced-motion | 靜態幀、無 loop、無搖桿 |
| DPR | `devicePixelRatio`；resize 重算 |
| 效能 | 懶載；不阻塞深鏈 |

### 7.2 Canvas 實作（硬）

| 項 | 規格 |
| --- | --- |
| 元素 | `<canvas class="go-lobby-canvas">`；`GoShopLobby.svelte` 掛載 |
| 分層 | `goShopCanvas.ts`＋`goShopHotspots.ts`＋`goShopWalk.ts` |
| Hit-test | pointer→world→`hotspotId`（**TDD**） |
| 資產 | **程序化繪製**（`goShopCanvas.ts`＋`goLobbyLayout.ts`）；不載入 tiles／sprite 圖 |
| **禁止** | DOM 地圖／機台 div；`<img>` 互動層 |
| **允許 DOM** | chrome、清單、對話／board、`GoAdSlot`、a11y 熱點 nav |
| vs SAM | **不同** canvas；大廳僅 `/` |

---

## 8. UI／視覺／a11y（硬）

- **Mobile-first：** canvas 填主內容寬；大螢幕可並排清單。
- **Hit：** 熱點 ≥44×44 邏輯 px；勿 hover-only。
- **a11y：** canvas `tabindex="0"`；外側**熱點清單** `<nav>`；`aria-label` 如「山姆鍋遊樂場大廳」。
- **對話／面板：** canvas 外 DOM；pixel／氣泡家族。
- **reduced-motion：** 靜態幀＋hit／清單。
- **品牌：** mark＋「山姆鍋遊樂場」（DEC-050）；canvas 可繪**室內招牌** sprite，非 outdoor 看板。
- **廣告／布告：** canvas sprite 分槽；`GoAdSlot` 在 canvas 下。

### 8.1 建議元件

| 模組 | 職 |
| --- | --- |
| `GoShopLobby.svelte` | canvas 根；模式切換 |
| `goShopCanvas.ts` | draw loop、資產（**TDD**） |
| `goShopHotspots.ts` | 熱點、hit-test、gate（**TDD**） |
| `GoShopDialog.svelte` | 老闆短選單（DOM） |
| `goShopWalk.ts` | 移動、碰撞（**TDD**） |
| `GoShopHotspotNav.svelte` | a11y 熱點清單 |

---

## 9. 素材與署名（硬）

- 大廳地板、走道、機台、服務台 sprite 優先 [`game-assets/`](../game-assets/)；**複製**至 `go-client/static/lobby/`。
- 署名依授權；至少 README／`ATTRIBUTION.md`／`/help` 一節。
- 見 [`game-assets/ATTRIBUTION.md`](../game-assets/ATTRIBUTION.md)。

---

## 10. 與老闆歡迎的關係

| 行為 | 規格 |
| --- | --- |
| 自動歡迎 | 不變：`chromeSession.setFlash` |
| Header mark | 既有碎念（在 `/`） |
| 大廳內 `boss` | 碎念或短選單；不重設 welcome 旗標 |
| 進場過場 | 不強制「按鍵繼續」擋開玩 |

---

## 11. 檔案落點（建議）

```
docs/PG-GO-SHOP-LOBBY-PLAN.md     # 本檔（檔名保留；標題＝遊樂場大廳）
go-client/src/lib/GoShopLobby.svelte
go-client/src/lib/goShopCanvas.ts
go-client/src/lib/goShopCanvas.test.ts
go-client/src/lib/goShopHotspots.ts
go-client/src/lib/goShopHotspots.test.ts
go-client/src/lib/goShopWalk.ts
go-client/src/lib/goShopWalk.test.ts
go-client/src/lib/GoShopDialog.svelte
go-client/src/lib/GoShopHotspotNav.svelte
go-client/static/lobby/           # 室內大廳 sprite／tile
go-client/ATTRIBUTION.md
```

---

## 12. 階段與完成定義

| Phase | 內容 | 狀態 |
| --- | --- | --- |
| **0. 契約** | 本文件；GLOSSARY；交叉引用 | **進行中** |
| **A** | canvas 室內大廳＋清單＋熱點 | **已落地** |
| **B** | 行走（必交） | **已落地**（鍵盤＋點地移動；`pg_go_lobby_walk`） |
| **A+/B+** | 布告／廣告熱點 | 布告 **stub 已接**（`GoBulletinBoard`；fixture 空） |
| **C** | 打磨 | 進行中（Gemini tiles／spritesheet 已切；物件組裝與進場 wipe 待補） |

**TDD：** `goShopCanvas`、`hitTestShopHotspot`、gate、`goShopWalk`、`pg_go_lobby_walk`。

---

## 13. 驗收清單（草案）

**Phase A**

- [ ] `/` 為 **canvas 室內大廳**（機台／服務台可辨）；窄屏 hit 開玩
- [ ] 無 DOM 地圖／機台本體（§7.2）
- [ ] a11y 熱點清單或鍵盤路徑
- [ ] 清單模式可搜尋、開 `/s/<id>`；canvas 失敗仍可玩
- [ ] `boss`／`help`／`cabinet`／`storage` 符合 §5
- [ ] 深鏈不強制逛大廳；`canvasActive` 無大廳 canvas
- [ ] 無原生 dialog；觸控可達

**Phase B**

- [ ] 四向行走；avatar 可見
- [ ] 靠近＋確認／tap 同 `hotspotId`
- [ ] 行走可關；reduced-motion 強制關
- [ ] 僅 `/` 輸入；手機可不靠搖桿

---

## 14. 開問題

| # | 題 | 定案傾向 | 狀態 |
| --- | --- | --- | --- |
| 1 | 窄屏預設 | **canvas 大廳＋下方清單** | 暫定 |
| 2 | 老闆「今日」是否直接開 `/s` | **開清單／機台區**，勿自動開玩 | 暫定 |
| 3 | Phase B 里程碑 | **是** | **定案** |
| 4 | DOM vs canvas | **canvas** | **定案** |
| 5 | 另立 DEC | **否** | 暫定 |
| 6 | `/apps` 後場皮 | 第一刀 **否** | 暫定 |
| 7 | 窄屏虛擬十字 | **否**；手機點擊移動 | 定案 |
| 8 | 敘事：室內遊樂場大廳 | **是**（§4.2）；非 outdoor／非 RPG 店 | **定案** |

---

## 15. 用語（對照）

| 用 | 不用 |
| --- | --- |
| 遊樂場、大廳、機台、服務台、老闆 | 零售店、道具店、戶外全園、theme park |
| Lobby canvas、hit-test、清單模式 | DOM 地圖、把大廳當 SAM |
| 後場、詢問處、布告欄、包廂門 | 儀表板、通知中心、大廳公開聊天室 |
| 深鏈 bypass | 掃碼先逛大廳 |
| 湯姆熊式（內部錨點；對外勿商標） | 對外寫競品名 |

---

## 修訂紀錄

| 日期 | 變更 |
| --- | --- |
| 2026-08-18 | 初版 Draft |
| 2026-08-18 | 定案：里程碑 A＋B |
| 2026-08-18 | 定案：大廳＝canvas |
| 2026-08-18 | **敘事改室內遊樂場大廳**（§4.2）；`shelf`→`cabinet`；店主→老闆／服務台；`pg_go_lobby_walk`；`static/lobby/`；開問題 #8 |
| 2026-08-18 | 移除大廳 `door`→`play`；§3 非目標：大廳 canvas 不導場殼 |
| 2026-08-18 | **Phase A＋B 落地**；布告欄 stub（`goBulletin`／`GoBulletinBoard`）；點地移動；入口裝飾 |
| 2026-08-18 | Phase C：大廳熱點改 ComfyUI＋SDXL Turbo 產製 sprite（取代 Kenney 16×16 tile） |
| 2026-08-18 | 詢問處改頁內 RPG 對話（一次一則；`/help` 仍為靜態說明） |
| 2026-08-18 | 機台區／詢問處對話改 canvas overlay（不在頁面下方展開） |
| 2026-08-18 | 大廳改程序化繪製（不載入 tiles／sprite）；版面對齊櫃檯／機台列／南向走道 |
| 2026-08-18 | 熱點 **包廂** → `/room`（契約 `room`；見 [PG-GO-ROOM-PLAN.md](./PG-GO-ROOM-PLAN.md)） |
| 2026-08-18 | 包廂敘事對齊：壽命＝主持 `/room` 畫面開著（門牌 TTL 另計） |
| 2026-08-18 | 包廂熱點對齊說／掛／播（細節見 [PG-GO-ROOM-PLAN.md](./PG-GO-ROOM-PLAN.md)） |
