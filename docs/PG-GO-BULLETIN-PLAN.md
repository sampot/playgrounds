# Playgrounds 純玩版：全遊樂場布告（go bulletin）

> **狀態：** Draft（2026-08-18）— 契約草案；未實作  
> **權威決策：** 從屬 [DECISIONS.md](./DECISIONS.md) **DEC-050**（純玩版 `go.samkuo.me`）；**不另開 DEC**（營運讀寫走既有 Platform／dash admin 面，對齊 DEC-047）  
> **相關：** [PG-GO-CLIENT-PLAN.md](./PG-GO-CLIENT-PLAN.md)、[PG-GO-BOSS-FLASH-PLAN.md](./PG-GO-BOSS-FLASH-PLAN.md)（老闆 flash——**勿混**）、[PG-GO-ADS-PLAN.md](./PG-GO-ADS-PLAN.md)（廣告版位——**勿混**）、[PG-GO-SESSION-CHAT-PLAN.md](./PG-GO-SESSION-CHAT-PLAN.md)（同 session 聊天——**勿混**）、[PG-GO-SHOP-LOBBY-PLAN.md](./PG-GO-SHOP-LOBBY-PLAN.md)（遊樂場大廳 Lobby；布告欄熱點入口）、[PG-PLATFORM-API-PLAN.md](./PG-PLATFORM-API-PLAN.md)、[PG-PLATFORM-DASH-SPEC.md](./PG-PLATFORM-DASH-SPEC.md)（營運 tab）、[PG-ANALYTICS-PLAN.md](./PG-ANALYTICS-PLAN.md)（公開寫／admin 讀模式參考）、`.cursor/rules/no-native-dialogs.mdc`、`.cursor/rules/mobile-first-ux.mdc`、[GLOSSARY.md](./GLOSSARY.md)

一句話：在 **`go.samkuo.me` shell** 提供**全遊樂場布告**（維修／活動／站務）——頂部薄條＋可開的布告欄；**未登入可見**；權威在 Platform（admin 於 dash 發佈）；**不**進 SAM iframe、**不**佔用老闆 flash／廣告槽、**不**擋玩。

---

## 1. 動機

- go 是玩家主場與型錄傳閱入口（DEC-050）。維修、限流、暫時降級、站務活動需要一條**全站可見、可關閉、可改文不必 redeploy** 的通路。
- 既有通路語意不合：
  - **老闆 flash**＝櫃檯碎念／操作回饋（短命、非營運權威）。
  - **廣告槽**＝互推／贊助（讀者不該把維修當廣告）。
  - **`/help`**＝靜態說明（改文靠部署；無未讀／關閉）。
  - **Session chat**＝同局 peer（不是全站）。
- 需要的是**布告欄**，不是 toast、不是論壇。

---

## 2. 目標

- **站級公告：** 對 go 同源所有訪客／玩家（**含未登入**）可見；登入不特別解鎖內容（MVP `audience: all`）。
- **少數同時生效：** hard cap **≤3** 則 active；strip 只露最高優先 **1** 則。
- **兩層 UI：** 頂部**薄條（strip）**＋**布告欄（board）**列表／全文。
- **可關閉：** 本機記住 dismiss；`rev` 升可再出現；`critical` 可設不可關閉。
- **營運可改文：** Phase 1 起權威＝Platform；dash admin 發佈／下架；go 拉取失敗不得擋首頁／開玩。
- **Shell only：** 不進 SAM iframe／FileMap／`functions.js`（對齊 DEC-053）。
- **UX 硬規則：** 禁原生 dialog；mobile-first；觸控熱區足夠。

---

## 3. 非目標

- Web Push／Email／系統通知中心產品化。
- 每款遊戲／每個 SAM 各自公告（那是遊戲內 HUD／toast）。
- 場殼 `play`／`docs`／`api` 玩家向布告主路徑（第一刀**僅 go**；`play` 同步另議）。
- `/i/` 對弈中蓋畫布；強制多步 onboarding modal。
- 使用者發文、留言板、論壇、檢舉工作流。
- 與廣告曝光、play analytics、點數帳本耦合計費。
- WebSocket／Durable Object 即時推播（公告不是聊天）。
- 跨裝置同步「已讀／已關閉」（未登入快樂路徑；不綁 DEC-052）。

---

## 4. 與既有通路的邊界（硬・勿混）

| 流 | Origin／對象 | 語意 | 與本計劃 |
| --- | --- | --- | --- |
| **布告（本計劃）** | go 訪客／玩家 | 站級營運訊息 | — |
| 老闆 flash | go chrome | 歡迎／碎念／操作回饋 | **正交**；禁共用同一視覺家族當維修主路徑 |
| `chromeSession.setFlash` | go | 短命操作 status | **正交**；布告不是 flash |
| Ad banner | go | 互推／贊助 | **正交**；維修文案不得放進 `GoAdSlot` |
| Session chat | 同 Invite peer | 局內說話 | **正交** |
| `/help` | go | 靜態說明 | 可互相連結；**不**取代布告即時性 |

| 用 | 不用當成 |
| --- | --- |
| 布告／布告欄 | 老闆歡迎、操作 toast、廣告、型錄、已下載、session 聊天 |
| Platform admin 編輯 | 場殼鑄 Invite、使用者自助發文 |
| go shell 顯示 | SAM 內 `alert`／假設有 `PG.toast` 系統級 |

---

## 5. 投放面（定案）

### 5.1 路由 allowlist

| 面 | Strip | Board 入口 | 說明 |
| --- | --- | --- | --- |
| **`/` 首頁** | ✅ | ✅ | 主發現面 |
| **`/apps`** | ✅ | ✅ | 管理面也需知維修 |
| **`/help`** | ✅ | ✅ | 說明面可並列；**不是**廣告槽 |
| **`/s/<id>` 載入中／錯誤** | ✅ | ✅（經 chrome／更多） | 限流／來源失敗時有用 |
| **`canvasActive` 遊玩中** | ❌ 預設關 | ⚠️ 可僅角標／「更多」內 | 不蓋畫布、不搶觸控；chrome 展開時可再露 strip（實作可後） |
| **`/i/` Invite** | ⚠️ **僅 `critical`** | ⚠️ 僅 critical 時可進 | 臨時局；其餘 severity 不擋同意／對弈 |
| **SAM iframe 內** | ❌ 永不 | ❌ | shell only |

### 5.2 垂直分槽（硬）

```text
[ Header ]
[ Bulletin strip ]   ← 本計劃；極薄；最多 1 則
[ 主內容 … ]
[ GoAdSlot … ]       ← 廣告計劃；與布告分槽
```

- Strip **不得**做成首屏第二 hero；單行或至多兩行 title＋動作。
- 與老闆 flash **並存時**：flash 仍走既有氣泡；strip 不取代、不搶同一 DOM 槽。

---

## 6. 產品形狀

### 6.1 兩層 UI

| 層 | 職 | 規格 |
| --- | --- | --- |
| **Strip** | 當前最高優先 1 則 | `title` 為主；可選「詳情」開 board 或展開 `body`；`dismissible` 時有關閉 |
| **Board** | 布告欄列表 | 當前 active（未 dismiss）全文；可含「已關閉但仍在有效期」區（可後段）；空態：「目前沒有公告」 |

**入口（定案傾向）：** Header「更多」內一項「**布告欄**」；strip「詳情」亦開同一面。不另開頂層 tab。

### 6.2 Severity

| `severity` | 用途 | Strip | 關閉 |
| --- | --- | --- | --- |
| `info` | 一般站務／活動 | 可 | 預設可關 |
| `notice` | 重要但不緊急（例：即將維修） | 優先於 info | 預設可關 |
| `critical` | 進行中故障／必須知悉 | 最高；`/i/` 唯此可露 | 可設 `dismissible: false` |

**排序（硬）：** `critical` > `notice` > `info`；同級比 `startsAt` 新→舊（或 `updatedAt`）。

### 6.3 用語（讀者面）

| 內部 | 讀者面 |
| --- | --- |
| bulletin／announcement | **布告**／**公告** |
| strip | （不單獨命名） |
| board | **布告欄** |
| dismiss | **關閉**（此則） |

敘事對齊 DEC-004：勿訂閱／Pro／Billing 腔；維修文案直說即可。

---

## 7. 資料契約

### 7.1 單則形狀

```ts
type GoBulletin = {
  id: string;              // 穩定 id；dismiss 鍵
  rev: number;             // 同 id 改文須遞增；升 rev → 已關閉者可再出現
  severity: "info" | "notice" | "critical";
  title: string;           // 短；strip 主文（建議 ≤40 字元顯示寬）
  body?: string;           // 可選；board 全文（純文字或受限 markdown——MVP 純文字）
  href?: string;           // 可選 CTA
  hrefLabel?: string;      // 例：「說明」「開遊戲」
  startsAt: string;        // ISO-8601
  endsAt?: string | null;  // null／省略＝無到期（仍須可手動下架）
  dismissible: boolean;
  audience?: "all" | "signed_in"; // MVP 只實作／只發 all
};
```

### 7.2 生效與過濾（client＋server 皆須）

一則 **active** 當且僅當：

1. `now >= startsAt`
2. `endsAt` 缺席／`null` **或** `now < endsAt`
3. 未被 admin **下架**（Phase 1：軟刪或 `status: archived`）
4. Client：若本機 dismiss 記錄之 `rev` **≥** 當前 `rev`，則 strip／預設列表不露（board「已關閉」區可另議）

**Hard cap：** 同時 active ≤ **3**；超過時 server 回傳仍須可排序，client 只取前 3；dash 發佈時警告或拒收第 4 則（定案見開問題）。

### 7.3 CTA `href`（定案傾向）

- **允許：** 同源相對 path（`/help`、`/s/<id>`、`/apps`）與 `https://` 外連（部落格／狀態頁）。
- **禁止：** `javascript:`、非 http(s) scheme。
- 外連：`rel="noopener noreferrer"`；可選新分頁。

### 7.4 Body 格式（MVP）

- **純文字**＋換行；**不做**任意 HTML。
- 後段若要輕量 markdown，另修契約；禁止腳本。

---

## 8. 本機狀態（dismiss）

| Key | Storage | 值 |
| --- | --- | --- |
| `pg_go_bulletin_dismissed` | `localStorage` | JSON：`{ [id: string]: number }`（記住關閉時的 `rev`） |

| 行為 | 規格 |
| --- | --- |
| 關閉 | 寫入 `dismissed[id] = rev`；strip 立刻收 |
| 同 id、`rev` 升高 | 視為新內容；再出現（適合同一維修事件更新文案／結束時間） |
| `dismissible: false` | 無關閉鈕；仍可經 board 讀全文 |
| 清站資料／換瀏覽器 | dismiss 丟失＝可接受 |

**不**進 OPFS；**不**經 Platform 使用者偏好 API（MVP）。

---

## 9. 權威與輸送

### 9.1 階段策略（定案）

| Phase | 權威 | 用途 |
| --- | --- | --- |
| **B（UX）** | 建置內嵌 fixture／靜態 JSON | 把 strip／board／dismiss／gate 做對；可隨殼離線 |
| **C–D（產品）** | **Platform KV**＋公開 `GET`＋admin CRUD | 維修當下改文、不必 redeploy go |
| **E** | go 接正式 API；短 cache | 失敗降級；正式營運路徑 |

**定案：** 產品權威＝**Phase C Platform**；內嵌僅開發／降級／測試夾具，**不是**長期手維第二權威。

### 9.2 API（草案；對齊 Platform `/v1`）

| 方法 | 路徑 | 認證 | 用途 |
| --- | --- | --- | --- |
| `GET` | `/v1/bulletins` | 無（公開；限流） | 回 `{ bulletins: GoBulletin[] }`（僅 active，已排序，≤3 或全量由實作定但 client cap 3） |
| `GET` | `/v1/admin/bulletins` | access token＋**admin** | 列表（含未開始／已下架） |
| `POST` | `/v1/admin/bulletins` | 同上 | 建立 |
| `PATCH` | `/v1/admin/bulletins/:id` | 同上 | 更新（**須** bump `rev`） |
| `POST` | `/v1/admin/bulletins/:id/archive` | 同上 | 下架 |

- 公開讀：**短 cache**（建議 `Cache-Control: public, max-age=60` 級；精確值實作定）。
- 寫：僅 admin；UI 隱藏 ≠ 授權（對齊 dash 規格）。
- 儲存：Platform **KV** 足夠（量極小）；不必第一刀 D1。

### 9.3 go 拉取行為（硬）

1. App 啟動／進允許路由時 `GET /v1/bulletins`（可與首屏並行）。
2. 失敗／逾時 → **空列表或上次成功快取**；**禁止**擋推薦卡、下載 SAM、Invite。
3. 離線：可顯示上次快取的仍在有效期之則；無快取＝無 strip（可接受）。
4. **不做** WebSocket；可見期間可選 **5–15 分鐘** 輕輪詢（後段；非 MVP 阻塞）。

### 9.4 Dash（營運）

- 掛既有 **營運** tab 子區「**布告**」（僅 `isAdmin`）；**不**另開頂層 tab。
- 能力：列表、新增、編輯（自動／強制 bump `rev`）、下架、預覽 severity。
- 用語：布告／公告；禁原生 dialog（頁內確認下架）。
- 細節落地時修訂 [PG-PLATFORM-DASH-SPEC.md](./PG-PLATFORM-DASH-SPEC.md) §6.5 與 API 計劃路由表。

---

## 10. UI／a11y（硬）

- Strip 關閉／詳情：觸控熱區約 ≥44×44px；窄屏可堆疊動作，勿靠 hover。
- `role="status"`；`aria-live="polite"`（`critical` 可用 `assertive`，但**禁止**輪詢造成重複朗讀——僅內容變更時更新）。
- Critical 高對比；**不是**全螢幕強制 modal（讀公告 ≠ 破壞性確認）。
- 尊重 `prefers-reduced-motion`（若有進場動畫）。
- 建議元件：`GoBulletinStrip`、`GoBulletinBoard`；邏輯：`goBulletin.ts`（過濾／排序／dismiss／gate）。

### 10.1 Gate helper（建議；TDD）

```ts
shouldShowBulletinStrip({
  route,           // "/" | "/apps" | "/help" | "/s" | "/i" | …
  canvasActive,
  severity,        // of candidate
}): boolean
```

對齊 Ads：`canvasActive` → false；`/i/` → 僅 `critical`。

---

## 11. 檔案落點（建議）

```
docs/PG-GO-BULLETIN-PLAN.md          # 本檔
go-client/src/lib/goBulletin.ts      # 契約型別、過濾、dismiss、gate
go-client/src/lib/goBulletin.test.ts
go-client/src/lib/GoBulletinStrip.svelte
go-client/src/lib/GoBulletinBoard.svelte
platform-api/src/bulletins.ts        # KV＋handlers
platform-api/src/bulletins.test.ts
platform-api/dash/…                  # 營運「布告」子面
```

靜態夾具（Phase B）：例如 `go-client/static/bulletins/v1.json` 或 build 嵌入——接 API 後僅作 fallback／測試。

---

## 12. 階段與完成定義

| Phase | 內容 | 完成定義 | 狀態 |
| --- | --- | --- | --- |
| **A. 契約** | 本文件；GLOSSARY 詞條；CLIENT-PLAN 交叉引用 | 審閱可開工 | **進行中** |
| **B. Shell UX** | Strip＋Board＋dismiss＋gate；fixture | 手測投放表；單元測試綠 | 未開始 |
| **C. Platform API** | 公開 GET＋admin CRUD＋KV | vitest／curl；限流有底 | 未開始 |
| **D. Dash** | 營運「布告」子面 | 僅 admin 可見；下架頁內確認 | 未開始 |
| **E. 接線** | go → API；cache／失敗降級；Invite critical | 改文不 redeploy go 即生效（cache 窗內） | 未開始 |

**TDD（硬）：** 生效窗、dismiss＋`rev`、severity 排序、`shouldShowBulletinStrip` 各路由。

---

## 13. 驗收清單（草案）

- [ ] 布告僅 shell；SAM iframe／遊戲 repo 無布告 SDK
- [ ] `/`／`/apps`／`/help`／`/s/` 載入可露 strip；`canvasActive` 預設不蓋畫布
- [ ] `/i/` 僅 `critical` 露 strip
- [ ] 同時 active ≤3；strip 僅 1 則且為最高優先
- [ ] 關閉寫入 `localStorage`；升 `rev` 再出現
- [ ] `dismissible: false` 無關閉鈕
- [ ] 拉取失敗不擋開玩／首頁
- [ ] 與老闆 flash、`GoAdSlot`、session chat **分槽／分語意**
- [ ] 無原生 dialog；讀者文案無訂閱／Pro／Billing
- [ ] admin 可於 dash 發佈／下架（Phase D）；公開 GET 無需登入

---

## 14. 開問題

| # | 題 | 定案傾向 | 狀態 |
| --- | --- | --- | --- |
| 1 | 第 4 則 active 時 server 拒收 vs 只警告？ | **拒收**（409／可讀錯誤） | 待拍板 |
| 2 | Body 是否允許輕量 markdown？ | MVP **純文字** | 暫定 |
| 3 | `play` 場殼是否共用同一 `GET /v1/bulletins`？ | 第一刀 **否** | 暫定 |
| 4 | Board 是否顯示「已關閉但仍有效」？ | 後段可；MVP **可不做** | 暫定 |
| 5 | 另立 DEC？ | **否**（從屬 DEC-050＋Platform admin） | 暫定 |

---

## 15. 用語（對照）

| 用 | 不用 |
| --- | --- |
| 布告、布告欄、`GoBulletin*`、公告 | 通知中心、Push、Inbox、Banner 當廣告同義、老闆台詞 |
| 關閉（dismiss） | 已讀回條產品化、跨裝置已讀 |
| 營運（dash）發佈 | 使用者投稿、場殼鑄鏈 |

---

## 修訂紀錄

| 日期 | 變更 |
| --- | --- |
| 2026-08-18 | 初版 Draft：全 go 布告；strip＋board；與 flash／ads／chat 切開；Phase B fixture → C–E Platform／dash；投放表與契約 |
