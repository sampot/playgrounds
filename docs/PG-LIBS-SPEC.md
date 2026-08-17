# Playgrounds 宿主函式庫（`PG.libs`）— 規格

> **狀態：** Draft（2026-08-17；`PG.libs`；同日修訂：禁 precache、授權門檻、候選路線圖、§1.5 主機 middleware 借鑑）  
> **權威決策：** 不立新 DEC；掛在既有宿主／UI SDK 決策之下（DEC-015 釘版精神、DEC-041／050 雙殼、DEC-053 UI 契約邊界）。  
> **相關：** [PG-UI-SDK-SPEC.md](./PG-UI-SDK-SPEC.md)（`window.PG`；§1.4 殼／畫布邊界）、[PG-UI-SDK-PLAN.md](./PG-UI-SDK-PLAN.md)、[PG-GAMES.md](./PG-GAMES.md)（遊戲交付約束）、[PG-GO-CLIENT-PLAN.md](./PG-GO-CLIENT-PLAN.md)（go 靜態同步）、實作階段見 [PG-LIBS-PLAN.md](./PG-LIBS-PLAN.md)、遊戲 coding agent 自足指南見 [PG-GAME-AGENT-GUIDE.md](./PG-GAME-AGENT-GUIDE.md)（含生命週期義務）。  
> **動機：** SAM（尤其 `kind: game`）需要可選的大型 UI 函式庫（2D 引擎、物理、音訊等），但不違反「遊戲 repo 無 build、不安裝套件」；函式庫由 **play／go 殼** 釘版船運，經 **`window.PG.libs` 動態載入**；不需要者 **零下載**。機制不限遊戲——凡殼釘版、白名單 id 的 UI 側函式庫皆可走同一入口。

一句話：**殼釘版供應授權清楚的 UI 函式庫；僅經 `PG.libs.load(id)` 懶載（禁止 precache）；SAM 仍只交 HTML＋CSS＋JS。** 定位對齊主機「認證 middleware」——不是玩法 API、不是線上服務。

---

## 1. 定位與邊界

### 1.1 在堆疊中的位置

```text
  play / go 殼靜態資產
  ├── /playgrounds/sdk.js                 （既有；bridge 注入）
  ├── /playgrounds/functions-runtime.js   （既有；後端 helper）
  └── /playgrounds/libs/<file>.js         （本規格；僅 load 時拉；不 precache）

  畫布（UI main）
  └── window.PG
        ├── kv / db / vars / …            （既有：fetch("/api/...")）
        └── libs                          （本規格：載入殼靜態 UI 函式庫）
              load("phaser") ──► <script> 或 import()
                              ──► 回傳函式庫入口（如 Phaser）
```

| 層 | 本規格 |
| --- | --- |
| **船運** | 主機 `public/playgrounds/libs/*`；go 經 sync 鏡像至 `go-client/static/playgrounds/libs/*` |
| **載入** | 僅畫布 UI；**不**經 Backend Runtime、**不**經 `/api/*`；**僅** `load` 觸發下載 |
| **契約入口** | `window.PG.libs`（intrinsic；永遠掛在 SDK） |
| **SAM** | 呼叫 `load`；**禁止**自帶大型 vendor binary 充當契約、**禁止**外連 CDN 函式庫 |

### 1.2 與 UI SDK 的關係（重要）

[PG-UI-SDK-SPEC](./PG-UI-SDK-SPEC.md) 將 `window.PG` 主要定義為 `fetch("/api/...")` 薄封裝。本規格**有意擴張**一類例外：

> **`PG.libs`＝主機船運的 UI 函式庫載入器**（與 `sdk.js` 同源、同釘版紀律），**不**碰 `env`、**不**持有資源權威、**不**替代 `/api` 契約。

其餘 SDK 不變式（DEC-031／038／053：UI 不直連 resources）**不變**。

命名不採 `engines`／`plugins`：前者過窄；後者易與 Phaser Scene plugins／「可安裝外掛」混淆。`libs` 涵蓋引擎、物理、音訊、輸入，以及未來其他殼釘版 UI 函式庫。

### 1.3 目標

- **G1** 遊戲 repo 維持 [PG-GAMES.md](./PG-GAMES.md)：HTML＋CSS＋JS、無 build、無 `node_modules`。
- **G2** 函式庫**只**在 SAM 明確 `load` 時下載；桌遊／牌類不付 Phaser 等成本。
- **G3** play 與 go **同一契約、同一釘版檔**（對齊 UI SDK G4）。
- **G4** lib id 白名單＋路徑釘版；SAM **不能**傳任意 URL（防外域腳本）。
- **G5** 首批完整 2D＝**Phaser 4**（id `phaser`）；少養、穩升級；機制可擴充非引擎 id。
- **G6** **禁止 precache：** `/playgrounds/libs/*` **不得**進入 play／go Service Worker（或同等）的 precache／預先安裝清單；亦不得在 bridge／殼啟動時預取。允許瀏覽器對**已成功 load 過**的 URL 做一般 HTTP disk cache（非產品承諾的離線預裝）。
- **G7** **授權門檻：** 僅接受條款清楚、可再散布的開源授權（典型：MIT、BSD、Apache-2.0、ISC、zlib 等）。授權有疑慮、雙軌專有、或需額外商用核對者**不進殼**（例：GSAP）。進殼前必須核對**該釘定版本**的 LICENSE 全文並旁註。

### 1.4 非目標

- 把函式庫打進每款 SAM 沙盒檔案樹（污染 OPFS／匯出、版本分叉）。
- Bridge 對每張 canvas **無條件**注入 libs。
- 經 CDN 執行期拉取（破離線與釘版；對齊 UI SDK「不走 CDN」；與 Pyodide DEC-015 的 CDN 例外**分開**——本規格改**自托管靜態**）。
- 將 `/playgrounds/libs/*` 列入 offline precache／install 預取（見 G6）。
- 殼同時養 Phaser 3＋4 當雙預設（見 §6）。
- 預設進殼 Babylon／PlayCanvas／Godot 匯出管線／需 bundler 的 TS-first 堆疊。
- 用函式庫取代玩法驗收（[PG-GAMES.md](./PG-GAMES.md) 可玩標準仍以規則／操作／測試為準）。
- `PG.libs` 走 capability 準入或 `PG.HOST`（非敏感授權面）。
- SAM 自行註冊／上傳 plugin URL（那是另一套擴充模型）。
- 為動畫／特效引入授權有疑慮的庫（用 Phaser tween、CSS、或自寫）。
- **線上／帳號／對戰 SDK**（Invite、WebRTC、matchmaking、`PG.SESSION`）——走 Platform／capability，**永不**進 libs 白名單。
- **殼注入輸入層**（`PG.controls`／虛擬手把）——操控 UI 在遊戲 iframe 內；`nipple` 僅為可選 middleware。
- **成就／獎盃／內購／商店 API**——非本產品定位；不經 `PG.libs` 也不經本規格擴張。

### 1.5 主機 middleware 借鑑（產品定位）

傳統遊戲主機 SDK 常區分：**系統服務**（存檔、帳號）vs **認證 middleware**（引擎／物理／音訊，按 title 選用）。本規格只覆蓋後者在 Web 場的對應：

| 主機概念 | go／play |
| --- | --- |
| 認證、釘版 middleware | `PG.libs.load` 白名單＋殼靜態檔 |
| 系統存檔服務 | `PG.kv`／預設 `/api`（[UI SDK](./PG-UI-SDK-SPEC.md)）——**不是** libs |
| 線上服務 | Platform Invite／session——**不是** libs |
| 系統軟體必裝、大型套件選裝 | `sdk.js` 恆小；libs **禁止 precache**（G6） |
| 遊戲銷毀／換 title | 換沙盒＝整頁 canvas 卸載；遊戲負責 `destroy`（無 MVP `unload`） |

遊戲側暫停／背景義務（visibility、輸入歸零、音訊）見 [PG-GAME-AGENT-GUIDE §3.5](./PG-GAME-AGENT-GUIDE.md)；**不**由 `PG.libs` 代管 pause。

---

## 2. 既有約束對齊

| 來源 | 對齊方式 |
| --- | --- |
| **PG-GAMES.md** 無 build／無套件 | 遊戲只 `await PG.libs.load(...)`；檔在殼 |
| **PG-UI-SDK-SPEC §5** 殼靜態＋bridge 注入 SDK | Bridge **仍只**注入 `sdk.js`；libs 由 SDK 動態載 |
| **copy-go-playgrounds-static** | 擴充同步 `public/playgrounds/libs/**` → go static（船運≠precache） |
| **DEC-015 釘版精神** | 版號寫進殼常數／檔名；升級＝改釘＋回歸，非漂 `latest` |
| **Mobile-first** | 懶載；銷毀 `Phaser.Game` 時釋放 WebGL；避免背景 tab 白載 |
| **Offline／SW** | libs **可**由同源靜態伺服提供；**禁止** SW Cache API／precache／install 預取（G6；play＋go 皆 passthrough `/playgrounds/libs/**`）；**不**進 canvas 虛擬 snapshot |

---

## 3. SDK 介面：`PG.libs`

### 3.1 掛載

```ts
interface PgSdk {
  // …既有欄位…
  /** Host-shipped UI libraries；intrinsic，永遠掛載。 */
  readonly libs: PgLibs;
}
```

- **不**列入 capability 準入表（`"libs" in PG` 恆為 true；有無某 id 看 `list()`）。
- 須在 `PG.ready` resolve **之前或同時**可用：`list`／`load` 不依賴 `/api/capabilities`。
- 建議：`await PG.ready` 後再 `load`（與其他 SDK 用法一致；`load` 本身不要求 ready）。
- **`list()` 不觸發下載**（僅讀殼釘版表）。

### 3.2 表面

```ts
/** 已定或路線圖 id；實際 `list()` 只含本殼已船運者。擴充須改本規格。 */
type PgLibId =
  | "phaser"
  | "matter"
  | "howler"
  | "tone"
  | "nipple"
  | "three"
  | "pixi"
  | "seedrandom"
  | "planck";

interface PgLibInfo {
  /** 邏輯 id（load 參數）。 */
  id: PgLibId;
  /** 殼釘版字串（semver），例如 "4.2.1"。 */
  version: string;
  /** 可選：人類可讀標籤。 */
  label?: string;
  /** 可選：分類，便於 list 過濾（非載入契約）。 */
  kind?: "engine" | "physics" | "audio" | "input" | "other";
}

interface PgLibs {
  /**
   * 列出本殼已船運、可 load 的函式庫（含 version）。
   * 不含尚未進殼的未來 id。不發起 libs 網路請求。
   */
  list(): Promise<ReadonlyArray<PgLibInfo>>;

  /**
   * 載入並回傳該函式庫的慣用入口模組。
   * - 同 id 並行／重複呼叫 → 共用同一個 Promise（冪等）。
   * - 成功後可再次 load → resolve 同一 module 參考（或語意相等的入口）。
   * - 不接受 version／URL 參數（版本由殼決定）。
   */
  load(id: PgLibId): Promise<PgLibModule>;
}

/**
 * 函式庫入口。執行期型別依 id（例）：
 * - phaser → Phaser；matter → Matter；howler → Howl／Howler；…
 * 規格層用 unknown；`.d.ts` 可用 overload 收窄。
 */
type PgLibModule = unknown;
```

### 3.3 遊戲側慣用形

```js
await PG.ready;
const Phaser = await PG.libs.load("phaser");
const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: "game",
  width: 390,
  height: 700,
  // …
});
```

```js
const Matter = await PG.libs.load("matter");
const Howler = await PG.libs.load("howler");
```

### 3.4 錯誤

`load`／`list` 失敗時 throw `Error`，並設：

| `error.name` | `error.code` | 何時 |
| --- | --- | --- |
| `PgError` | `unknown_lib` | `id` 不在白名單，或本殼未船運該 id |
| `PgError` | `load_failed` | 腳本／模組下載或初始化失敗（網路、404、語法、超時） |

- `list()` 正常不 throw；殼無任何 lib 檔時回 `[]`（開發期可接受；正式場應至少有釘版表內檔案）。
- 不發明「半載入」狀態給呼叫端輪詢；只透過 Promise settle。

### 3.5 載入語意（硬）

1. **白名單：** `load` 的 `id` 必須 ∈ 殼釘版表；否則 `unknown_lib`。  
2. **禁止 URL：** 不接受 `load("https://…")`、相對路徑、或 SAM 自訂 script src。  
3. **冪等：** `Map<PgLibId, Promise<PgLibModule>>`；失敗可再試（下一次 `load` 開新 Promise）——**成功後穩定、失敗可再試**。  
4. **僅懶載：** 未呼叫 `load` 前，**不得**請求 `/playgrounds/libs/*`。`list()` 不請求。  
5. **禁止 precache（G6）：** SW／install／shell boot **不得**預抓 libs；測試須覆蓋「未 load → 無 libs 請求」。  
6. **UMD vs ESM：** 釘版表可標 `format: "esm"`（`three`／`pixi`）→ 動態 `import()`；其餘預設 UMD `<script>`。`seedrandom` 經 `globalPath: "Math.seedrandom"` 取值。  
7. **Global：** UMD 載入後允許保留慣用 global；`load` 的 resolve 值**必須**是該入口。  
8. **卸載：** MVP **不**要求 `unload`；換沙盒＝整頁 canvas 卸載即可。

---

## 4. 船運、釘版與授權

### 4.1 路徑契約（已船運或路線圖）

| 邏輯 id | 殼路徑（例） | kind | 常見授權 | 狀態 |
| --- | --- | --- | --- | --- |
| `phaser` | `/playgrounds/libs/phaser-4.2.1.min.js` | engine | MIT | **已船運** |
| `matter` | `/playgrounds/libs/matter-0.20.0.min.js` | physics | MIT | **已船運** |
| `howler` | `/playgrounds/libs/howler-2.2.4.min.js` | audio | MIT | **已船運** |
| `tone` | `/playgrounds/libs/tone-15.1.22.js` | audio | MIT | **已船運** |
| `nipple` | `/playgrounds/libs/nipplejs-1.0.4.min.js` | input | MIT | **已船運** |
| `three` | `/playgrounds/libs/three-0.185.1.module.min.js` | other | MIT | **已船運**（ESM） |
| `pixi` | `/playgrounds/libs/pixi-8.19.0.min.mjs` | engine | MIT | **已船運**（ESM） |
| `seedrandom` | `/playgrounds/libs/seedrandom-3.0.5.min.js` | other | MIT | **已船運**（`Math.seedrandom`） |
| `planck` | `/playgrounds/libs/planck-1.3.0.min.js` | physics | MIT | **已船運** |

- 檔名**含版號**；`load("phaser")` 不帶版號。  
- 釘版常數單一來源（建議 `public/playgrounds/libs/pin.json` 或 SDK 內表＋測試鎖 hash／檔名）。  
- play：`public/playgrounds/libs/`；go：`go-client/static/playgrounds/libs/`；URL＝`/playgrounds/libs/…`。  
- **「家族是 MIT」不代替：** 每個釘定檔必須附／核對該版 LICENSE（或 `LICENSE-<id>.txt` 旁註）。

### 4.2 授權門檻（硬，G7）

**允許進殼（典型）：** MIT、BSD-2／3、Apache-2.0、ISC、zlib／同等「可再散布、條款清楚」的開源授權。

**禁止進殼：**

- 授權全文不清、專有 runtime、或需額外商用／雙軌授權核對者（**含 GSAP**）。  
- 無法在 repo 旁註來源 URL＋授權全文／連結者。  
- 灰色地帶 → **寧可不進** `PG.libs`（改 vanilla／Phaser 內建／自寫）。

### 4.3 同步

擴充 [`scripts/copy-go-playgrounds-static.ts`](../scripts/copy-go-playgrounds-static.ts)（或後繼）：

- 同步 `sdk.js`／`functions-runtime.js`（既有）**以及** `libs/**`（位元相等）。  
- `go:build`／prebuild 必須拉齊；CI 檢查 play／go 一致。  
- **同步 ≠ precache：** go 靜態樹有檔，不表示 SW 預裝。

### 4.4 版本政策

| 變更 | 作法 |
| --- | --- |
| 相容 patch／minor | 換檔＋改釘版；`id` 不變；smoke＋抽樣回歸 |
| 不相容大改 | 新 id 或明確 breaking 升殼並公告 |
| 停用 | `list()` 移除；`load` → `unknown_lib` |

### 4.5 與 CDN／第三方

- **執行期：** 只允許同源殼路徑。  
- **維護期：** 自官方 release／npm dist 取 min 檔 → 核 checksum＋LICENSE → 放入 `public/playgrounds/libs/`。

---

## 5. 產品選擇與路線圖

### 5.1 進殼順序

白名單九項**已全部船運**：

```text
phaser, matter, howler, tone, nipple, three, pixi, seedrandom, planck
```

`three`／`pixi` 為 ESM（`import()`）；其餘為 UMD／script（`seedrandom` → `Math.seedrandom`）。

同一遊戲：能用 Phaser 內建（tween／簡易音訊／Arcade）就不要疊多套；**桌遊／牌類預設不 `load`。**

### 5.2 `phaser`（必養，MVP）

- **Phaser 4**（非 3）。適用動作、捲軸、tilemap、多 scene、相機等。  
- 以 Phaser 4 文件／examples 為準。

### 5.3 `matter`（已船運）

- 剛體物理；彈珠台、保齡、推幣等。可與 vanilla 並用。

### 5.4 `howler`／`tone`（音訊）

- **Howler（已船運）：** 跨品類 SFX／BGM。  
- **Tone（已船運）：** 合成／Transport／節拍；體積較大 → 只懶載。

### 5.5 其他已船運

- **nipple：** 虛擬搖桿。  
- **three／pixi：** ESM；`const THREE = await PG.libs.load("three")`。  
- **seedrandom：** `const seed = await PG.libs.load("seedrandom")`（即 `Math.seedrandom`）。  
- **planck：** Box2D 形物理（Matter 不夠時）。

### 5.6 何時不要 `load`

- 桌遊、牌、消消、數獨、問答、簡易 DOM／canvas → **vanilla**。  
- 函式庫不取代 [PG-GAMES.md](./PG-GAMES.md) 可玩驗收。

### 5.7 明確不進殼（產品＋授權）

| 項目 | 原因 |
| --- | --- |
| **GSAP** 及授權有疑慮者 | G7 |
| **Kaplay**（預設） | 與 Phaser 重疊；非授權問題，產品延後 |
| Babylon／PlayCanvas | 過重 |
| 即時網路／後端 SDK | 走 Invite／session，非 `PG.libs` |

---

## 6. Phaser 3 vs 4（決策鎖定）

| 項 | 決策 |
| --- | --- |
| 殼預設 `phaser` | **Phaser 4.x** |
| 同時養 3＋4 | **否**（預設） |
| 極少數 v3 鎖版 | 僅當顯式 id `phaser3` 且另修規格；非 MVP |

---

## 7. 整合點（實作指引，契約級）

| 元件 | 職責 |
| --- | --- |
| **`injectCanvasBridge`** | **不**注入 libs；只注入 SDK |
| **`sdk.js`** | `PG.libs.list`／`load`；釘版表；in-flight Map |
| **`sdk.d.ts`** | `PgLibs`；overload；防漂移測試 |
| **`public/playgrounds/libs/*`** | 釘版 min.js＋LICENSE 旁註 |
| **copy-go-playgrounds-static** | 雙殼位元同步 |
| **SW／offline** | 提供靜態檔 OK；**禁止** libs 進 precache／install 清單（G6） |

載入實作建議：查釘版表 → 冪等 → 動態 `<script data-pg-lib>` 或 `import()` → resolve 入口；onerror → `load_failed`。

---

## 8. 驗收情境

1. **懶載：** 無 `libs.load` → **無** `/playgrounds/libs/*` 請求；`list()` 亦不產生 libs 請求。  
2. **禁 precache：** 檢查 play／go SW（或 precache manifest）**不含** `/playgrounds/libs/`；冷啟動殼不預抓 libs。  
3. **載入：** `await PG.libs.load("phaser")` → 可 `new Phaser.Game` 一幀。  
4. **冪等：** 兩次 `load("phaser")` → 至多一次網路（或第二次零請求）。  
5. **白名單：** 非法 id／URL → `unknown_lib`。  
6. **雙殼：** play／go 行為一致；go 缺檔 → `load_failed`（CI 先擋）。  
7. **授權：** 每個已船運 id 有可稽核的 LICENSE／來源旁註。  
8. **銷毀：** Game 實例由遊戲 `destroy`；不強制卸載 global 建構子。

---

## 9. 開放點

| # | 題 | 傾向 |
| --- | --- | --- |
| O1 | MVP 是否同時進殼 `matter`／`howler`？ | **已決：兩者已船運** |
| O2 | `load` 失敗後是否自動重試？ | 否；呼叫端再 `load` |
| O3 | 是否提供 `PG.libs.unload`？ | MVP 否 |
| O4 | `.d.ts` 是否為各 id overload？ | 是 |
| O5 | ~~libs 是否 precache？~~ | **已決：禁止（G6）** |
| O6 | catalog YAML 宣告 `libs: […]`？ | 可選 DX；**不得**預載；宿主不依 YAML 下載 |
| O7 | `PG.libs` 是否代管 Game pause／unload？ | **否**；生命週期義務在遊戲（Agent Guide §3.5）；換沙盒＝整頁卸載 |

---

## 10. 與既有決策／規格的關係

| 既有 | 關係 |
| --- | --- |
| **PG-UI-SDK-SPEC** | 擴充 §3 intrinsic：`libs`；殼／畫布邊界見該檔 §1.4 |
| **PG-GAME-AGENT-GUIDE** | 遊戲側用法＋生命週期；本檔管船運／白名單 |
| **PG-GAMES.md** | 交付約束不變；懶載＋授權見本檔 |
| **DEC-015** | 釘版；自托管；**libs 不走 CDN、不 precache** |
| **DEC-041／042／050** | 場殼與 go 同契約 |
| **DEC-031／053** | `/api` 不變；libs 不混入 |
| **DEC-038** | libs 只在 UI main |

**更名備註：** 早期草案曾用 `PG.engines`；本 Draft 以 `PG.libs` 為準。未實作前無相容別名義務。

---

## 11. 文件維護

- 規格本檔；進度 [PG-LIBS-PLAN.md](./PG-LIBS-PLAN.md)。  
- 新增／退役 id → §3.2、§4.1、§5。  
- 授權或 precache 政策變更 → §1.3 G6／G7、§4.2、§8。  
- 產品定位／主機借鑑變更 → §1.4／§1.5。  
- SDK 表面 → `sdk.js`／`sdk.d.ts`／測試＋ UI SDK 交叉引用。  
