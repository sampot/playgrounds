# Playgrounds 純玩版：廣告橫幅（go revenue）

> **狀態：** Draft（2026-08-17）— 契約定案中；**未實作**  
> **權威決策：** [DECISIONS.md](./DECISIONS.md) **DEC-054**（Proposed）— go shell 廣告版位；從屬 DEC-050  
> **相關：** [PG-GO-CLIENT-PLAN.md](./PG-GO-CLIENT-PLAN.md)、[PG-PLATFORM-CREDITS-PLAN.md](./PG-PLATFORM-CREDITS-PLAN.md)（點數＝TURN 成本；與本流正交）、[PG-ANALYTICS-PLAN.md](./PG-ANALYTICS-PLAN.md)（自建 play 打點；勿混廣告）、DEC-004（敘事非產品／行銷腔）、DEC-007（勿預設塞追蹤）、`.cursor/rules/no-native-dialogs.mdc`、`.cursor/rules/mobile-first-ux.mdc`、[GLOSSARY.md](./GLOSSARY.md)

一句話：**在 `go.samkuo.me` shell 掛可塌縮的廣告版位**（含 **`/s/` 載入等待面**）；**Phase 1＝house 自推站內遊戲**（**320×100**／寬屏 **728×90**）；**Phase 2＝EthicalAds／Carbon 類**（瀏覽器分頁）；**standalone PWA 僅 house**；不擋玩、不進 SAM iframe、不掛 Invite／畫布遊玩主路徑。

---

## 1. 動機

- go 是玩家主場與型錄傳閱入口（DEC-050），流量與曝光落在訪客／未登入玩家——與 dash「點數儲值」對象不同。
- 點數制（[PG-PLATFORM-CREDITS-PLAN.md](./PG-PLATFORM-CREDITS-PLAN.md)）只回收**官方 TURN**成本；**不能**覆蓋殼／型錄／傳閱的營運與頻寬。
- 需要一條**不阻快樂路徑**的收入：固定 banner／贊助格，而非插頁、獎勵影片或付費解鎖。
- 必須對齊 DEC-004（非產品站）與 DEC-007／analytics 計劃的隱私克制——第三方腳本是例外能力，須閘控、可關、失敗可塌。

---

## 2. 目標

- **營收面（近程）：** Phase 1 先用版位做**站內遊戲互推**（驗證尺寸／gate／載入生命週期）；Phase 2+ 再接聯盟變現。
- **產品面：** 廣告＝**shell chrome** 能力；SAM 可攜契約不變（DEC-053）；不進 FileMap／`functions.js`。
- **UX：** mobile-first；**IAB 形廣告尺寸槽**、無 CLS；**`/s/` 載入中為一級投放**；**`/apps` 列表中段一格**；玩中與 Invite／`/help` 不露。
- **敘事：** 讀者用語偏「也玩玩看／本站小品」（house）或日後「贊助」；內部一律 `GoAdSlot`／provider。
- **可換供應商：** Phase 1＝**house**；Phase 2＝**EthicalAds／Carbon 類（A）**；槽尺寸預留聯盟 creative；勿做成「推薦卡第二排」。
- **standalone：** 加主畫面／`display-mode: standalone` → **僅 house**（永不載聯盟腳本）。

---

## 3. 非目標

- 插頁（interstitial）、獎勵影片、強制「看完才能開」。
- 把關閉廣告做成付費訂閱／Pro／Billing（與點數敘事衝突；DEC-004）。
- 在 **`play`／`dash`／`docs`／`api`** 掛玩家向廣告主路徑。
- **`/i/` Invite** 對弈／同意面掛廣告（臨時 session；隱私與注意力）。
- **`canvasActive` 遊玩中**蓋畫布或常駐浮層（後階段可另議「chrome 展開時薄條」——見 §5.3）。
- 廣告腳本／素材進 SAM iframe 或遊戲 repo。
- 多網路瀑布／複雜 SSP（過度工程；否決為第一刀）。
- **Phase 1 把版位做成迷你型錄／「試試這些」複製品**（多卡網格、搜尋）——house 必須是**單格廣告尺寸**，不是換片 UI。
- 與點數帳本、analytics play 事件耦合計費。
- 離線時仍請求**聯盟**廣告網路（斷網必須可玩；house 同源素材可離線顯示）。

---

## 4. 與既有營收／觀測的關係

| 流 | Origin／對象 | 用途 | 耦合？ |
| --- | --- | --- | --- |
| **點數** | dash／Host 帳號 | 官方 TURN 成本回收 | **否** |
| **Ad banner（本計劃）** | go 訪客／玩家 | Phase 1＝站內互推；其後＝維持／變現 | **否** |
| **Play analytics** | go `/s/` → Platform 聚合 | 每款受歡迎度 | **否**（廣告曝光勿混進 `play_*`） |

**硬：** Guest 入座不因廣告被要求註冊或同意追蹤才能連線（對齊 credits「Guest 免帳號」精神）。

---

## 5. 投放面（定案）

### 5.1 路由 allowlist

| 面 | 第一刀 | 說明 |
| --- | --- | --- |
| **`/s/<id>` 載入中** | ✅ **一級** | 進度條／等待面期間露贊助格；玩家本來就在等（§5.2） |
| **`/` 首頁** | ✅ | 推薦卡**下方**一格；不進 hero |
| **`/apps`** | ✅ | **列表中段**插入一格（§5.1.1）；空態／載入中不掛 |
| **`/help`** | ❌ | 披露文案可寫在此，但**無**廣告槽 |
| **`/s/<id>` 錯誤／尚無畫布** | ✅ 可同槽 | 載入失敗頁可保留同一槽；**不**在錯誤上強制多一層 |
| **`canvasActive` 遊玩中** | ❌ 預設關 | boot 成功 → **立刻收起／卸載**版位；勿搶觸控 |
| **`/i/`** | ❌ | Invite 全程不掛（含其 SAM 下載等待） |
| **SAM iframe 內** | ❌ 永不 | shell only |

#### 5.1.1 `/apps` 列表中段（定案）

| 項 | 規格 |
| --- | --- |
| **何時** | 僅 `apps.length ≥ 1` 的列表態；loading／error／空態**不**掛 |
| **位置** | 列表**中間**：前半列項之後、後半之前。切開點＝`floor(n/2)`（`n=1` → 該則之後；`n=2` → 兩則之間） |
| **形狀** | 同一 `GoAdSlot`（320×100／寬 728×90）；**不是**列表列樣式複製品 |
| **內容** | house 自推其他 game（可排除列表中已有 id 為加分，非硬；預設仍 `pickHouseGame()`） |
| **語意** | 管理面中的站內互推；勿擋「開始／管理」熱區 |

### 5.2 `/s/` 載入等待面（硬；一級投放）

**動機：** 記憶體 fetch／FileMap（頁內進度 `done/total`）期間使用者已在等——廣告不佔「可玩時間」，干擾低於首屏常駐或玩中浮層。

| 項 | 規格 |
| --- | --- |
| **何時露** | `/s/<id>` 自開始 resolve／下載至畫布 **boot 成功**（`canvasActive`／ready）之前 |
| **版位** | 與既有載入 UI（進度條／標題）**同面並列**：建議進度區**下方**一格；窄屏堆疊；**不**蓋住進度數字與取消／返回（若有） |
| **生命週期** | boot 成功 → **同步隱藏並停止**第三方請求／刷新；換片再開下一顆 → 新一輪載入可再露 |
| **不擋載入（硬）** | 廣告腳本與 SAM fetch **並行**；廣告失敗／慢 **不得**延長或序列化小品下載；**禁止**「廣告載完才開始抓 SAM」 |
| **極短載入** | 離線 cache 命中、載入 <~300ms → 版位可閃一下或根本來不及繪出——**可接受**；勿為曝光刻意拖延 boot |
| **House／聯盟** | **Phase 1＝house 自推**（§7.3）；載入面須快出圖；日後聯盟若拖慢首 paint → 降級 house 或跳過該次 |
| **Invite** | `/i/` **不**套用本節（臨時局；§5.1） |

```text
[ Header ]
[ 小品 title／「載入中」 ]
[ 進度條 done/total ]
[ GoAdSlot — 載入期專用 ]
```

### 5.3 遊玩中薄條（後階段；非第一刀）

若日後要補營收：僅當 Header chrome **展開**時，於頂列下方掛 ≤50px sticky；chrome 收起則廣告一併隱藏；**禁止**畫布上浮層。須另修訂本節再實作。

### 5.4 離線／PWA

| 條件 | 行為 |
| --- | --- |
| `navigator.onLine === false` | **不**載聯盟腳本；**house** 若素材為同源靜態（cover／字）→ **可**繼續顯示；否則槽塌縮（進度條照常） |
| `display-mode: standalone`（加主畫面） | **僅 house**（硬）；**永不**載 EthicalAds／Carbon／其他聯盟腳本 |
| SW Cache | 聯盟 script／iframe／creative **不進** offline cache；house 若用 `/covers/<id>.png` 等既有靜態可走殼既有策略 |

### 5.5 Catalog 級關閉

**不做**（定案）：不預留 YAML `ads: false`／catalog 旗標。全站依 §5.1 allowlist；若日後單品政策需要再另修訂。

---

## 6. UX 規格（硬）

1. **單一組成：** 首頁首屏仍是品牌＋推薦；廣告**不進 hero**、不蓋封面卡。載入面＝等待組成的一部分，仍**不**蓋進度條。
2. **廣告尺寸槽（硬；Phase 1 即遵守）：** 外框依 **IAB 常見 display** 設計，house 與日後聯盟共用同一槽，**不要**做成自由長寬推薦卡。
3. **固定槽／無 CLS：** 未載／失敗 → **塌縮**或維持約定高；**禁止**大 CLS（載入面進度條勿被來回頂）。
4. **不擋玩／不擋載入：** 無素材、失敗 → 與今日相同可玩；載入面**不得**序列化或拖延 SAM fetch（§5.2）。
5. **觸控：** 整格可點（house → `/s/<other>`）；勿擠壓 Header 主操作；熱區足夠。
6. **禁止** `alert`／`confirm`／`prompt`。Phase 1 house **不需**追蹤同意；聯盟階段同意勿擋短暫載入。
7. **用語（Phase 1 讀者）：** 「也玩玩看」「本站小品」等即可；**勿**假冒第三方廣告標（例如亂標「Ad」卻連自家）。若日後接聯盟再加「贊助」披露。
8. **窄屏優先：** 預設槽 **320×100**；寬屏升 **728×90**（§6.1）。

### 6.1 版位尺寸（定案）

| 情境 | 槽（CSS／設計契約） | 對齊 |
| --- | --- | --- |
| **窄屏／預設**（`/` 與 `/s/` 載入） | **320×100** | Large mobile banner |
| **寬屏** | **728×90**（`min-width` 媒體查詢升階；建議 ≥48rem／768px 級） | Leaderboard |
| **否決（Phase 1）** | 任意高卡片牆、多格 carousel 冒充版位、全寬無上限長文 | 那是推薦 UI，不是 ad slot |

- 槽內 house creative：**單則**（一遊戲）；圖＋短 title（可選一句）；點擊 → `go…/s/<catalog_id>`（同 origin）。
- 視覺可吃既有 **`/covers/<id>.png`**（[PG-GO-CLIENT-PLAN §5.8](./PG-GO-CLIENT-PLAN.md)）或系列 icon——裁切進槽，**object-fit**；勿為 house 另開 runtime 打 GitHub。
- 寬屏 house／聯盟皆填同一 **728×90** 外框（creative 需準備對應素材或置中裁切）。

**首頁 `/`：**

```text
[ Header chrome ]
[ 主內容／推薦 ]
[ GoAdSlot — 窄 320×100／寬 728×90 — house 自推另一顆 game ]
```

**`/s/` 載入中：** 見 §5.2；槽同尺寸契約。

---

## 7. 供應商策略

### 7.1 候選

| 選項 | 適配 | 風險 |
| --- | --- | --- |
| **A. EthicalAds／Carbon 類** | **Phase 2 定案** | 審核／流量門檻；偏 contextual、較合 DEC-007 |
| **B. Google AdSense Display** | **否決**（本計劃不採） | 第三方追蹤較重 |
| **C. House／站內互推** | **Phase 1 定案**；standalone **永遠**可用 | 非現金營收；須避免做成第二型錄 |
| **D. 多網路瀑布** | — | **否決** |

### 7.2 定案路徑

```text
Phase 1：C — house 推廣站內 kind:game
  → 槽＝320×100／寬屏 728×90（§6.1）；內容＝自家 /s/<id>
Phase 2：A — EthicalAds／Carbon 類（同一 GoAdSlot）
  → 僅一般瀏覽器分頁；standalone → 回退 house（§5.4）
```

### 7.3 Phase 1 house 內容（硬）

| 項 | 規格 |
| --- | --- |
| **目的** | 推廣**站內其他遊戲**（探索／互推）；順便驗證版位 dimension 與 gate，供日後聯盟 drop-in |
| **候選池** | 嵌入 catalog 中 **`kind: game`**；**排除**當前 `/s/<id>`（若在載入該 id）；首頁則排除無意義的自指 |
| **數量** | 每槽 **1** 則；可輪播／隨機／洗牌取一（實作可簡：隨機一則 ≠ 當前） |
| **連往** | 僅 **`https://go.samkuo.me/s/<id>`**（或同 origin 相對）；**不**連 play 編輯面、**不**連外站 |
| **素材** | 同源：cover／系列 icon＋`entry.title`；靜態、可離線 |
| **≠ 換片 UI** | 不是「試試這些」≤3、不是「下一個」；無多卡、無型錄搜尋 |
| **第三方** | Phase 1 **零**聯盟 script／cookie |

---

## 8. 技術架構（`go-client/`）

### 8.1 模組（建議）

```text
go-client/src/lib/
  GoAdSlot.svelte           # 版位殼：IAB 尺寸、塌縮、route／canvasActive gate
  goAds.svelte.ts           # enabled、provider=house、allowlist、pickHouseGame()
  goAdsProviders/
    house.ts                # 自 catalog 抽一則 game → creative props
    ethicalAds.ts           # Phase 2（EthicalAds／Carbon 類；名稱實作時定）
    # adsense — 否決
```

- 掛點：`/` 頁底槽；`/s/` 載入 UI；**`/apps` 列表中段**；`canvasActive` → 卸載。
- `pickHouseGame(excludeId?)`：listed `kind: game` 池；**TDD** 建議。
- Svelte 5 **runes**（DEC-005）。

### 8.2 載入與設定

| 項 | 規格 |
| --- | --- |
| **何時載（首頁）** | 主內容可見後即可渲染 house（同源、幾乎無網路依賴） |
| **何時載（`/s/` 載入面）** | 進入載入態即顯示 house（與 SAM fetch **並行**）；**不** await |
| **Env** | 例：`PUBLIC_GO_ADS_ENABLED`；`PUBLIC_GO_ADS_PROVIDER=house|ethical`（Phase 2）；standalone 強制 house |
| **CSP** | Phase 1 不需為聯盟放寬；Phase 2 僅放行 A 供應商 origin；**畫布 iframe CSP 仍緊** |
| **Consent** | Phase 1 不需要；Phase 2 依供應商（EthicalAds 類多偏輕／contextual，仍須 help 披露） |
| **與 analytics** | 可選：點擊 house 不強制打點；若打點須另事件，勿混 `play_*` |

### 8.3 失敗行為

腳本 timeout／封鎖／網路失敗 → 槽塌縮；頁內可不 flash（避免噪音）；**禁止**重試迴圈拖慢玩。

---

## 9. 法律／披露（必做清單）

- **`/help`（或短段）：** Phase 1 可簡述「版位會推本站其他遊戲」；Phase 2 補 EthicalAds／Carbon 類第三方說明。
- **同意：** Phase 1 不需要；Phase 2 依供應商政策（能略過則略過＝回退 house）。
- **內容政策：** **不**做 catalog `ads` 旗標（§5.5）；整站依投放面 allowlist。
- **營運：** house 點擊＝站內導航；聯盟勿自點。

細節（個資／GDPR）不阻塞 Phase 1 house。

---

## 10. 階段與完成定義

| Phase | 內容 | 完成定義 | 狀態 |
| --- | --- | --- | --- |
| **0. 契約** | 本文件＋**DEC-054**；面／尺寸／house／Phase 2＝A／standalone＝僅 house | 開問題清空 | **完成** |
| **1. House 版位** | `GoAdSlot`（320×100／寬 728×90）＋house；`/` ＋ `/s/` 載入＋**`/apps` 中段**；boot 後收起 | 點進其他 `/s/<id>`；非迷你型錄；`/help`／`/i/`／玩中無 | **已落地**（含 `/apps`） |
| **2. EthicalAds／Carbon** | 同一槽換 A；CSP／env；失敗或 standalone → house | 分頁可出聯盟；standalone **僅** house；載入面不擋 boot | 未排程 |
| **3. 同意／披露** | help＋必要時頁內同意（略過＝house） | 拒聯盟仍可玩 | 未排程 |
| **4.（可選）** | chrome 展開薄條 | 另議 | — |

---

## 11. 驗收清單（草案）

- [x] 廣告僅 shell；SAM iframe／repo 無廣告 SDK
- [x] **Phase 1：** 窄屏 **320×100**、寬屏 **728×90**；內容＝**其他** `kind: game`；點擊 → `/s/<id>`
- [x] **不是**「試試這些」多卡／迷你型錄；**無** catalog `ads` 旗標
- [x] **`/s/` 載入中**露版位；**boot／`canvasActive` 後立即收起**（載入分支卸載）
- [x] house 與 SAM fetch **並行**；**不**延長載入
- [x] `/i/`、`/help` 與遊玩中無版位；**`/apps` 列表中段有一格**
- [x] **standalone：僅 house**（Phase 1 本就 house）
- [ ] 斷網：house 同源素材仍可顯示（或優雅塌縮）；不阻 `/s/` 離線再開（手測）
- [x] Phase 1 **零**第三方廣告腳本
- [x] 無原生 dialog；讀者文案無訂閱／Pro／Billing
- [x] 與點數、play analytics **無**計費耦合

---

## 12. 已定案摘要

| # | 題 | 定案 |
| --- | --- | --- |
| 1 | Phase 2 供應商 | **A — EthicalAds／Carbon 類**（否決 AdSense） |
| 2 | standalone | **僅 house**（永不載聯盟） |
| 3 | DEC | **另立 DEC-054** |
| 4 | Catalog `ads` 旗標 | **不用** |
| 5 | 寬屏尺寸 | **另開 728×90**（窄屏 320×100） |

其餘已定：投放＝`/` ＋ `/s/` 載入＋**`/apps` 列表中段**；不掛 `/help`／`/i/`／玩中；Phase 1＝house 自推站內 game。

---

## 13. 用語

| 用 | 不用 |
| --- | --- |
| 廣告版位、`GoAdSlot`、house 自推／站內互推 | 訂閱、Pro、Unlock、Billing；為曝光拖慢載入 |
| **320×100**／寬屏 **728×90** | 迷你型錄、第二排推薦卡 |
| Phase 2 EthicalAds／Carbon 類；standalone 僅 house | AdSense（本計劃）；standalone 載聯盟 |
| DEC-054 | 只塞進 DEC-050 不立專筆 |

---

## 修訂紀錄

| 日期 | 變更 |
| --- | --- |
| 2026-08-17 | 初版 Draft：go shell banner；與點數／analytics 正交；面／否決／階段／開問題 |
| 2026-08-17 | **定案：** `/s/` **載入等待面＝一級投放**（與進度條同面、並行不擋 fetch；boot 後收起）；開問題剔除「要不要掛 `/s/`」 |
| 2026-08-17 | **定案：** `/apps`／`/help` **不掛**廣告（披露仍可寫在 `/help`） |
| 2026-08-17 | **定案 Phase 1：** house **推廣站內 game**；槽依 **廣告版位 dimension**（§6.1／§7.3）；非迷你型錄；Phase 2 再接聯盟 |
| 2026-08-17 | **定案尺寸：** 窄屏版位 **320×100** |
| 2026-08-17 | **開問題全定案：** Phase 2＝A；standalone＝僅 house；另立 **DEC-054**；無 catalog `ads` 旗標；寬屏 **728×90** |
| 2026-08-17 | **Phase 1 落地：** `GoAdSlot`＋`pickHouseGame`；掛 `/` 與 `/s/` 載入／錯誤面；help 短述；`VITE_GO_ADS_ENABLED` |
| 2026-08-17 | **修訂：** `/apps` **列表中段**加入 banner（撤回「/apps 不掛」）；`/help` 仍不掛 |
