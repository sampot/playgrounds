# Playgrounds 遊戲開發指南（Coding Agent）

> **狀態：** Draft（2026-08-17；修訂：2026-08-23 §3.9 Canvas 舞台適配；既有 §8／§2.5／§3.8／§3.6／§3.7／§1.1／§3.5／§2.4）  
> **讀者：** Coding agent（次要：人類作者）  
> **範圍：** 獨立 `pg-*` 遊戲 repo；產物須能在 **go 純玩**（`https://go.samkuo.me/s/<id>`）與 **play 畫布**同契約執行；**多人連線**僅走包廂（§8）。  
> **自足：** 開發遊戲時**只讀本檔**即可；不必讀宿主其它 SPEC／PLAN／源碼。上架型錄、改殼、加新 lib id **不在**本檔範圍。宿主下載協定細節見 [PG-GO-SAM-MANIFEST-PLAN.md](./PG-GO-SAM-MANIFEST-PLAN.md)（維護者；agent 以本檔 §2.5 為準即可）。包廂開局宿主落地見 [PG-GO-ROOM-PLAY-PLAN.md](./PG-GO-ROOM-PLAY-PLAN.md)（維護者；agent 以本檔 §8 為準即可）。  
> **Starter：** 新遊戲請用 template repo [`sampot/pg-game-scaffold`](https://github.com/sampot/pg-game-scaffold)（`gh repo create … --template sampot/pg-game-scaffold`）。遊戲 repo 只保留短 `AGENTS.md` **指針**指向本檔；**禁止**把本指南全文拷進每個 `pg-*`。  
> **借鑑：** go／play 殼契約對齊主機 SDK 的責任切分（平台供應釘版能力＋薄系統服務；遊戲寫玩法）——見 §1.1；細節與非目標見 [PG-UI-SDK-SPEC](./PG-UI-SDK-SPEC.md) §1.4、[PG-LIBS-SPEC](./PG-LIBS-SPEC.md) §1.5。

---

## 0. Agent briefing（先讀這段）

你正在為 **山姆鍋遊樂場（Playgrounds）** 開發一款 **`kind: game`** 小品。

| 項 | 規定 |
| --- | --- |
| **產物** | 獨立 GitHub repo（慣例 id／repo 名＝`pg-<name>`），靜態檔可直接掛進畫布 iframe |
| **開新庫** | 優先自 [`pg-game-scaffold`](https://github.com/sampot/pg-game-scaffold) template 建立；勿從舊遊戲整棵複製，亦勿 vendoring 本指南 |
| **交付形式** | **僅** HTML + CSS + JavaScript；**禁止**任何 build 階段、**禁止**把 `node_modules` 或套件鎖進 repo |
| **下載清單** | 根目錄 **`sam-manifest.json`**（修訂號＋執行期檔列表）必備——見 §2.5；go 依此下載，不掃整棵 repo |
| **執行期** | 宿主注入 `window.PG`；你**不要**自己載入 `/playgrounds/sdk.js` |
| **相容** | 同一套檔在 go 與 play **同形**；**禁止**依 `location.host` 特判 go／play |
| **單機 vs 連線** | go **`/s/<id>`**＝**只單機**；**多人連線**＝只在包廂大螢幕（`pg_surface=room`）——見 §8 |
| **工具** | 需要測試／暫用工具時用 `npx <pkg>`，**不**寫進依賴清單當運行時需求 |

**硬禁令（違者視為未完成）：**

1. 禁止執行期外連 CDN／任意 URL 載入函式庫；大型引擎／物理／音訊只許 `PG.libs.load(白名單 id)`。  
2. 禁止 `window.alert`／`confirm`／`prompt`。  
3. 禁止用裸 `localStorage`（或同類）當分數／進度的**權威**；持久化走 `PG.kv`（或自訂 `/api`）。  
4. 禁止交付時缺少根目錄 `sam-manifest.json`，或 `files` 漏列執行期會載入的相對路徑資源。

做完後依 **§12 Definition of Done** 逐項自檢再停。

### 0.1 從 scaffold 開新遊戲（建議）

```bash
gh repo create sampot/pg-<name> --public --template sampot/pg-game-scaffold --clone
cd pg-<name>
```

- Template：https://github.com/sampot/pg-game-scaffold  
- 遊戲 repo 內的 `AGENTS.md` 只是**指向本指南的短指針**；更新契約時改 playgrounds 本檔，**不要**把全文同步進每個 `pg-*`。  
- 不要從既有遊戲整棵 fork／複製當 starter（易帶入舊素材與過期假設）。

---

## 1. 心智模型

```text
玩家
  → go（純玩）或 play（場殼畫布）
    → iframe 載入你的 index.html（＋相對路徑 CSS／JS／assets）
    → 宿主注入 window.PG（sdk.js）——遊戲勿再載一次

你的遊戲碼
  → await PG.ready
  → PG.kv / PG.db / PG.vars     → 內部 fetch("/api/…") → Backend Runtime
  → PG.libs.load("phaser"|…)    → 同源 /playgrounds/libs/*（僅 load 時下載）
```

要點：

- UI **沒有** `env.KV`；只有 `window.PG`（或你自訂的 `/api/*`）。
- 沙盒**沒有** `functions.js` 時，宿主會裝**預設** `/api/kv`／`/api/db`／…——多數單機遊戲夠用。
- `PG.libs` **不會**在開局預抓；沒呼叫 `load`＝零 libs 流量。桌遊／牌類預設 **不要** load。

### 1.1 殼／遊戲責任（主機 SDK 借鑑）

對齊主機平台的切分：**殼＝平台；iframe 內＝遊戲。**

| 層 | 誰負責 | 例子 |
| --- | --- | --- |
| **殼（play／go）** | 注入 `window.PG`、預設 `/api`、釘版 `PG.libs`、場／純玩 chrome；包廂選局／入座／掛大螢幕 | 頂列、邊緣抽屜把手、SDK、libs 靜態檔、`session_play` |
| **遊戲（你的 repo）** | 玩法、HUD、虛擬搖桿／觸控層、頁內確認／toast、素材；依 `pg_surface`／角色簡化 UI | `#game`、結束面板、Credits、局內「發牌／開始／落子」 |
| **線上（包廂）** | 連線拓樸／Peer／入座席＝**殼**；對弈規則／誰可按設定＝**遊戲**（§8） | **不是** `PG.libs`；**禁止**把 `/s/` 做成多人連線快樂路徑 |

**殼不做、你也不要發明成「平台 API」的：**

- `PG.controls`／`PG.input`／殼注入虛擬手把  
- 殼級成就／獎盃／內購／商店  
- 用 `alert`／`confirm`／`prompt` 充當系統對話框  
- 把 matchmaking／WebRTC 塞進 `PG.libs.load`  
- 在 `pg_surface=room` 再鑄「邀請對弈」／compose 掃碼當開局主路徑（人已在包廂）

**平台義務（遊戲必須履行；多數是文件級硬規則，不是新 `PG.*`）：** 存檔走 `PG.kv`、錯誤頁內提示、生命週期暫停（§3.5）、輸入歸零（§3.2）、mobile-first、玩中 chrome 收合（§3.6）、直橫／桌面視口可玩（§3.7）、採納適用的業界共識並避開否決項（§3.8）；主舞台為 `<canvas>` 時另守 §3.9；連線局另守 §8。

---

## 2. Repo 骨架

### 2.1 最小可玩

```text
index.html           # 入口（必）
app.js               # 或 inline module；可再拆檔
style.css
sam-manifest.json    # 下載清單（必；見 §2.5）
README.md
ATTRIBUTION.md       # 有第三方素材時必填；建議一律有
```

### 2.2 建議完整

```text
index.html
app.js                 # 或 src/ 多檔，仍無 build：用 <script type="module">
style.css
assets/…               # 圖像／音效／字型（拷進本 repo）
sam-manifest.json      # 必；files 須涵蓋上方執行期會載入的路徑
thumbnail.png          # 交付應產出；go／型錄卡面封面（見 §2.4）
tests/game.test.js     # 規則／純函式
ATTRIBUTION.md
README.md
# 可選——僅當預設 /api 不夠時：
functions.js           # 若有：亦須列入 sam-manifest.json 的 files
```

### 2.3 契約

| 規則 | 說明 |
| --- | --- |
| 入口 | 可直接開啟的 `index.html` |
| 下載清單 | 根目錄 `sam-manifest.json`（§2.5）；go 只拉清單內檔案 |
| 路徑 | 資源用**相對路徑**（`./app.js`、`./assets/…`） |
| 禁止入庫 | `node_modules/`、bundler 產物、自帶的 Phaser／Pixi／Three 等大型 vendor |
| SDK | **禁止** `<script src="/playgrounds/sdk.js">`（宿主已注入；再載會重複） |
| 素材來源 | 開發期可從維護者本機素材庫拷貝；**定稿必須在遊戲 repo 內**；禁止 runtime 指到宿主 `game-assets/` 路徑 |

### 2.4 卡面封面 `thumbnail.png`

遊戲 repo **根目錄**須有一張 **`thumbnail.png`**，供 go 首頁推薦卡、`/apps`、換片「試試這些」等**產品內卡面**替換預設系列圖示。舊遊戲尚未補圖時宿主會 fallback 系列 icon；**新做／重寫遊戲的 agent 交付前應產出此檔**（見下方「如何產生」與 §12）。

| 項 | 規格 |
| --- | --- |
| **路徑** | 僅認 repo 根 `thumbnail.png`（勿改名、勿放 `assets/` 才當封面權威） |
| **內容** | **真實遊玩畫面**（一幀可辨識玩法）；勿只放 logo／純字 title card／抽象裝飾圖 |
| **比例** | **4:3**（**640×480** 優先；或 800×600）。正方形僅過渡可接受——宿主會 `object-fit: cover` 裁切，非首選 |
| **格式／體積** | PNG；建議 **≤ ~50KB**（可損壓）；勿丟未壓縮大圖 |
| **署名** | 畫面含第三方素材時，仍依 §9 在 `ATTRIBUTION.md`（及必要時 credits）署名；封面本身不另開授權例外 |
| **語意（硬）** | 有 thumbnail **≠**「這台裝置可離線玩」。離線＝造訪後 cache（go `/apps`／「更多」已下載）；封面只負責「長什麼樣」 |
| **如何進卡面** | 作者／agent 只負責把檔放進遊戲 repo。**宿主**建置／維護腳本把檔同步到 go（等）靜態 **`/covers/<catalog_id>.png`**，型錄產物可選帶 `cover` 路徑——見 [PG-GO-CLIENT-PLAN §5.8](./PG-GO-CLIENT-PLAN.md)、[PG-CATALOG-QUERY-PLAN](./PG-CATALOG-QUERY-PLAN.md)。**禁止**指望 go 首頁 runtime 去打 GitHub raw；**禁止**在遊戲任務裡自行改宿主 `/covers/` 或型錄 YAML（§13） |

#### 如何產生（agent 義務）

交付前依序做：

1. **跑起來**：在本機靜態伺／go／play 畫布實際開玩，等到主玩法畫面可見（非僅開場選單——除非選單本身已清楚展示玩法）。
2. **截一幀可辨識玩法的畫面**：須看得出「這是什麼遊戲」（例如盤面、跑道、角色與主要物件），不要空白場、loading、純 UI chrome。
3. **裁成 4:3 並縮放**：輸出 **640×480**（或 800×600）PNG；可暫用系統／瀏覽器截圖工具、`sips`、一次性 `npx` 影像工具等——**禁止**為此在遊戲 repo 加 build 管線或長期依賴。
4. **壓體積**：目標 **≤ ~50KB**；過大再損壓，仍須可辨識。
5. **寫入權威路徑**：存成 repo 根 **`thumbnail.png`** 並納入版本庫；勿只留在 `/tmp` 或聊天附件。
6. **自檢**：肉眼確認非 logo-only；比例正確；檔名／路徑正確。宿主 `covers:sync` 由維護者另跑——agent **不必**、也**不應**在遊戲任務中改 playgrounds 宿主。

**否決（遊戲側）：** 為封面引入常駐 build／套件；把封面當 `og:image` 義務（社群預覽仍是 go 站級圖，見 go 計劃 §5.5.1）；用「有無 thumbnail」暗示離線就緒；用 AI／貼圖湊一張與實際遊玩無關的卡面充數；把封面放進 `assets/` 卻不放根目錄。

`index.html` 開頭慣例：

```html
<!doctype html>
<html lang="zh-Hant">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <title>遊戲標題</title>
    <link rel="stylesheet" href="./style.css" />
  </head>
  <body>
    <div id="game"></div>
    <script type="module" src="./app.js"></script>
  </body>
</html>
```

### 2.5 下載清單 `sam-manifest.json`（硬）

go 純玩（與日後型錄 game 下載主路徑）**只**依此清單向 GitHub raw 拉檔，**不**掃描整棵 repo。缺檔或漏列 → 玩家開不了或缺資源。宿主協定見 [PG-GO-SAM-MANIFEST-PLAN.md](./PG-GO-SAM-MANIFEST-PLAN.md)。

| 項 | 規格 |
| --- | --- |
| **路徑** | 僅認 repo 根 **`sam-manifest.json`** |
| **契約版** | `"version": 1`（整數；目前僅此） |
| **修訂號** | `"rev"`：非空字串；寫入 go 離線 tip；**改 files 或任一列檔內容就必須 bump** |
| **檔列表** | `"files"`：相對根目錄的路徑陣列；**必須含** `"index.html"`；禁止 `..`、絕對路徑、開頭 `/`、重複 |
| **列什麼** | 執行期會載入的 HTML／CSS／JS／assets／（若有）`functions.js` |
| **預設不列** | `AGENTS.md`、測試檔、`README.md`、`ATTRIBUTION.md`、`thumbnail.png`（封面走宿主 `covers:sync`，非 runtime 下載） |

範例：

```json
{
  "version": 1,
  "rev": "2026-08-17",
  "files": [
    "index.html",
    "style.css",
    "app.js",
    "assets/board.png"
  ]
}
```

**Agent 義務：** 新增／刪除／改名執行期資源時同步改 `files` 並更新 `rev`。交付前用本機靜態伺服確認：清單內每個 path 在 repo 都存在，且頁面不會再請求清單外的相對路徑檔。

**否決：** 無 manifest 就當交付完成；只 bump `rev` 卻忘改 `files`（或相反）；把整份指南或無關大檔塞進 `files` 浪費下載。

---

## 3. UX 硬規則

### 3.1 Mobile-first

- **先**為窄螢幕設計（參考邏輯寬約 **390×700**），再在大螢幕增強；不要桌面排版再硬縮。
- 主操作（開始、移動、確認、再來一局）在手機單手可完成；**禁止**只靠 hover。
- 可點控件熱區盡量 **≥44×44 CSS px**。
- 佈局用 flex／stack；CSS 預設＝手機，用 `@media (min-width: …)` 加寬，不要反過來只靠 `max-width` 補丁。
- go 頂列 chrome 可能出現／自動收合：HUD 勿假設「永遠全螢幕無邊」；優先 `100dvh`、留安全邊距。
- **同時**支援手機與桌面、直式與橫式——見 §3.7；勿只做「直式長頁 + 桌面略加寬」。主舞台為全畫面 `<canvas>` 時見 **§3.9**。
- **玩中**勿把開局設定／大標題／說明整頁常駐——見 §3.6。

### 3.2 行動觸控操控（虛擬搖桿／方向）

動作、射擊、平台等需要**持續移動**的遊戲，**禁止**只靠固定小圓「虛擬方向鍵」（◀▲▼▶／3×2 `data-key` 網格）當唯一手機操控——拇指難對準、無法斜向微調，手感差。桌面仍可用鍵盤；手機須另有可用方案。

操控 UI **只在遊戲 iframe 內**實作。**不要**發明 `PG.controls`／`PG.input`；**不要**假設殼會注入虛擬手把。殼（尤其 go）會佔用**左右邊緣中段**（抽屜／對話把手）；**雙下角與下緣**留給遊戲虛擬操作——把搖桿／動作鍵放左下／右下，並留 `env(safe-area-inset-*)`。

#### 選型（依玩法擇一為主）

| 模式 | 適用 | 作法 |
| --- | --- | --- |
| **類比搖桿** | 俯視移動、坦克、需 360°／斜向的動作 | 左下搖桿；優先 `await PG.libs.load("nipple")`。右側放開火／技能等大鈕（≥約 64×64 CSS px） |
| **畫布拖曳／跟隨** | 固定畫面或垂直捲軸射擊 | 觸控／指標位置驅動自機（可 soft-chase）；自動連射時按下＝開火或僅定位。**不要**為此類硬加方向鍵 |
| **離散 D-pad／swipe** | 格子移動、單步 hop、長按重複一步 | 可用螢幕方向鍵或畫布 swipe；鍵面仍 ≥44×44。可選長按重複（約 300ms 後／100–130ms 一步） |
| **平台左右＋動作** | 橫向平台 | 左：類比（多半只取 X）或大面積左／右熱區；右：獨立跳躍（必要時再加攻擊）。**不要**用三顆小方向鈕冒充 |

同一遊戲可鍵盤＋觸控並存；粗指標（手機）顯示虛擬層，細指標可藏 overlay，但**不得**只留鍵盤可玩。

#### 輸入契約（建議）

鍵盤、搖桿、拖曳最後都寫入同一狀態，規則邏輯只讀狀態、不直接綁 DOM：

```js
// 建議形狀（欄位可裁剪；語意保持一致）
const input = {
  moveX: 0, // -1..1
  moveY: 0, // -1..1
  aimX: 0,
  aimY: 0,
  primary: false,   // 開火／確認（按住）
  secondary: false, // 炸彈／技能
};
```

#### 事件與版面硬規則

- 一律 **Pointer Events**（`pointerdown`／`move`／`up`／`cancel`）；**禁止**新遊戲再寫 touch + mouse 雙綁（易漏放開＝黏鍵）。
- 按住類控件：`setPointerCapture`；放開、`pointercancel`、失焦／隱藏頁面時**必須歸零**移動與按住狀態。
- 畫布與搖桿區：`touch-action: none`（避免捲動搶手勢）；動作鈕可用 `manipulation`。
- 類比：死區約 **0.12–0.18**；單位圓正規化；多點觸控時左＝移動、右＝動作，互不搶同一 pointer。
- 浮動搖桿（nipple dynamic／等同）優於「必須先點中固定圓心」的小盤。
- 觀戰／不可操控時隱藏或 `pointer-events: none` 虛擬層。

```js
await PG.ready;
const nipplejs = await PG.libs.load("nipple");
const manager = nipplejs.create({
  zone: document.getElementById("stick-zone"),
  mode: "dynamic", // 或 static；優先讓第一觸點即可拖
  size: 96,
  restOpacity: 0.45,
});
manager.on("move", (_evt, data) => {
  const f = data.force > 1 ? 1 : data.force;
  const rad = data.angle.radian;
  input.moveX = Math.cos(rad) * f;
  input.moveY = -Math.sin(rad) * f; // 螢幕 Y 向下時可依座標系調整
});
manager.on("end", () => {
  input.moveX = 0;
  input.moveY = 0;
});
```

桌遊、牌、消消、點格謎題等**不需要**本節搖桿；點選／拖曳即可，勿無故 `load("nipple")`。

### 3.3 禁止原生 Dialog

- **禁止** `alert`／`confirm`／`prompt`。
- 結束、錯誤、提示 → 頁內面板／toast／HUD 文案。
- **破壞性**操作（覆寫存檔、清除進度）→ 頁內確認（可取消、可關閉）；**非破壞**且使用者已明確發起的流程（例如選檔上傳建新）→ **不要**再多一層「確定？」。
- 平台錯誤（存檔失敗、`functions_no_leader` 等）同樣**頁內**提示；**不要**假設殼會彈系統級對話框（MVP 無 `PG.toast`／系統 flash——見 UI SDK 開放點）。

### 3.4 可玩驗收（上架／交付門檻）

每款至少滿足：

1. **操作是遊戲本身**——點格、拖曳、即時操控等，不是「動作字串按鈕列」充數。  
2. **狀態有結構**——盤面／單位／牌庫／地圖等，不是幾個純量計數器冒充。  
3. **有挑戰**——AI 或關卡會因玩家選擇改變。  
4. **輸贏清楚**——可勝可敗，且來自玩家操作。  
5. **測試測規則**——不是只斷言「某個欄位有變」。  
6. **美術／音效有實際用上**，且署名齊（§9）。  
7. **生命週期（§3.5）**——背景／隱藏時不繼續吃輸入、不無意義燒 CPU／音訊。  
8. **chrome 收合（§3.6）**——`playing` 時隱藏開局設定／大標題／常駐說明；相位切換改變可見 DOM，非只改文案。  
9. **視口（§3.7）**——手機與桌面、直式與橫式皆可玩；短高橫式有重組，非僅加寬。  
10. **Canvas 舞台（§3.9，若適用）**——主畫面用 `<canvas>` 時：邏輯座標固定、contain 縮放、DPR 正確、指標反算、旋轉只重算 layout。

### 3.5 生命週期（Suspend／Resume）

對齊主機「前景／背景」義務。Web 對應：`document.visibilityState`、`visibilitychange`、`pagehide`（以及視需要 `blur`／`pageshow`）。**MVP 不新增** `PG.lifecycle`；遊戲自行監聽。

**隱藏／背景／卸載時（硬）：**

1. **輸入歸零**——`moveX`／`moveY`／按住類 `primary` 等全部清零；釋放 pointer capture 語意上的「黏鍵」。  
2. **停止或暫停即時迴圈**——`requestAnimationFrame`／固定步模擬在背景應 pause 或降載；禁止隱藏分頁仍全速模擬。  
3. **音訊**——BGM／循環 SFX 暫停或靜音；回到可見再依產品選擇續播或停在暫停選單。  
4. **引擎**——已 `load("phaser")` 時：pause 場景或等價；換沙盒／離頁前 `game.destroy(true)`（釋放 WebGL）。Howler／Tone 同等處理。

**回到可見時：**

- 不要假設輸入狀態仍有效；從零恢復或進暫停選單。  
- 可再讀一次 `PG.kv` 若你的設計需要「他處已寫入」的同步（多數單機不必）。

```js
function suspend() {
  input.moveX = 0;
  input.moveY = 0;
  input.primary = false;
  // pause raf / Phaser scene / Howler …
}

function resume() {
  // 可選：開暫停面板，勿自動「帶著舊按住狀態」開跑
}

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") suspend();
  else resume();
});

window.addEventListener("pagehide", suspend);
```

桌遊／純回合制若本來就沒有連續迴圈，至少仍須在隱藏時清掉「按住／拖曳中」狀態，避免回來後誤觸。

### 3.6 畫面相位與 chrome 收合

多數小品採**單頁相位**（同一 `index.html`，以狀態切換可見區塊），**不要**預設做成多路由「主選單 → 設定頁 → 遊戲頁」SPA。真・離開遊戲＝go／play **殼**（型錄、換片、頂列）；遊戲內預設循環是「再來一局」，不是「回大廳」。

#### 常見相位（名稱可自訂；語意對齊）

| 相位 | 用途 |
| --- | --- |
| `ready`／`setup` | 顯示身分（可選）、開局設定、主 CTA「開始／開局」 |
| `playing` | 玩法本體；舞台優先 |
| `paused` | 僅**即時模擬**需要；回合制／點格謎題通常省略 |
| `over`／`clear`／`won`／`lost`／`settle` | 結果＋「再來一局」／「下一關」／「下一局」 |

可依玩法延伸（勿無故疊床架屋）：關卡串（`clear` → 下一關）、戰役選圖、對弈 setup→match、牌桌 `bet → play → settle`、機台代幣循環、SLG 夜結算 sheet、多局 `round_*` ⊂ `match`。

#### 硬規則：相位必須改變可見 DOM

**禁止**只改按鈕 `disabled`／status 文案，卻讓 hero、難度／模式 chip、說明 `<details>`、Credits、開局專用工具列在 `playing` 仍整排佔高。

| 相位 | 應可見 | 應隱藏或收入溢流 |
| --- | --- | --- |
| `ready`／`setup` | 標題或短說明、設定、主 CTA；可選怎麼玩 | 觸控搖桿可先藏（開打再出） |
| `playing`／`paused` | **舞台**、精簡 HUD（分／命／關）、必要動作／暫停、觸控層 | **大標題／tagline／eyebrow**、開局設定（難度・模式・地圖・造型）、常駐規則文、credits、成就面板（改「⋯／選單」） |
| 結束 | 薄結果（status／canvas banner／overlay／sheet）＋再來／下一關 | 勿為結果永久加高一截常駐區塊 |

**玩中垂直預算（窄直硬目標）：** 非舞台 chrome 總高宜 ≤ 視口約 **15–20%**；其餘給舞台＋觸控。短高橫式改佔左右寬度——見 §3.7。

**主 CTA：** 同一主鈕隨相位改文案（`開始` → 可選暫停語意 → `再來一局`），避免開局＋暫停＋重來三顆同時佔滿一列；次要操作進 overflow／`<details>`。

**設定鎖定：** 難度／模式／關卡選擇屬 `ready`；`playing` 中僅「重來本關／認輸回 setup」等明確出口，勿把整排設定留在畫面上。

**參考形：** 對弈 chrome 以狀態衍生 `showSetup`／`showHud`（例如五子棋 `data-layout="setup"|"match"`）——開打後收起設定、盤面優先。新作應同等或更簡，勿退回「全頁常駐長表單」。

### 3.7 視口矩陣（手機／桌面 × 直／橫）

遊戲須在下列視口皆**可玩**（主操作可點、舞台可辨識、主 chrome 無橫向捲動）：

| 視口 | 典型 | 設計重點 |
| --- | --- | --- |
| **窄直** | 手機直持 | 預設設計面；§3.6 收合；觸控貼底＋ safe-area |
| **窄橫** | 手機橫持／矮窗 | **高度最貴**；改左右分欄或極薄側 chrome，勿維持直式長堆疊 |
| **寬直** | 平板直／窄桌面窗 | 加寬舞台；勿無故雙欄 |
| **寬橫** | 筆電／外接屏 | 可並排 HUD／側資訊；細指標可藏虛擬鍵 |

#### CSS 遞增順序（硬）

1. **預設**＝窄直＋`playing` 收合後的版面。  
2. **短高橫式**：`@media (orientation: landscape) and (max-height: 560px)`（閾值可微調）重組——舞台吃剩餘矩形，chrome 改側欄或更薄。  
3. **寬度增強**：`@media (min-width: …)` 加並排／側欄（next piece、小地圖等）。  

**禁止**桌面優先再 `max-width` 補丁；**禁止**只用「`main { max-width: 32rem }`」假裝支援橫式。

#### 方向與縮放（硬）

- **禁止**以「請改直／請改橫」全屏擋玩；**禁止**依賴螢幕方向 lock。  
- 旋轉／`resize`：**只重算 layout**，**不要**重置局況或清進度。  
- 固定比例舞台：`aspect-ratio` + 在剩餘區 **contain**（`max-width`／`max-height: 100%`），避免固定 px 高度在短視口溢出或把操作頂出畫面。主舞台為 `<canvas>` 時的程式契約見 **§3.9**。  
- 方形盤面：邊長 ≈ `min(可用寬, 可用高) − chrome`。  
- go 頂列玩中可能自動收合：用 `100dvh` + `env(safe-area-inset-*)`；左右邊緣中段留給殼把手（§3.2）。

#### 輸入隨指標變

| | 粗指標（手機／觸控） | 細指標（滑鼠） |
| --- | --- | --- |
| 移動／操作 | §3.2 虛擬層／拖曳／底列 | 鍵盤／指標；虛擬層可藏 |
| 熱區 | ≥44×44 | 可較密，主 CTA 仍清楚 |
| Hover | **禁止**當唯一提示 | 可用於增強（如落子 ghost） |

邏輯只讀同一 `input` 狀態；換裝置只換綁定與可見控件。

#### 驗收（手測）

至少過四態：**手機直、手機橫、窄桌面窗、寬桌面**。每態：`playing` 時舞台為第一公民、主操作可及、無主 chrome 橫向捲動；從直轉橫不丟局。

### 3.8 業界共識（適用於本專案）

以下為 HTML5／行動 Web 遊戲常見最佳實務中，**與 go／play iframe、直橫皆可玩、無外連 CDN** 相容、應採納的項目。細節實作仍以 §3.1–§3.9 為準；本節補「為什麼這樣做」的業界對齊，**不是**另開一套互相衝突的規範。

#### 採用

| 主題 | 準則 |
| --- | --- |
| **邏輯解析度** | 玩法用固定邏輯座標（或固定設計比例），視覺以 contain／必要時 letterbox 塞進視口；避免為每種螢幕重算世界單位。主舞台為 `<canvas>` 時見 **§3.9** |
| **裝置像素比** | 畫面需夠銳，但宜 **cap DPR（約 1.5–2）**，避免高 DPI 手機填四倍像素拖垮效能 |
| **動態視口** | 用 `dvh`（或等價）與 `env(safe-area-inset-*)` 因應行動瀏覽器頂／底列伸縮；手測位址列展開與收合 |
| **resize** | 轉向與視窗變化只重排 layout；可對 resize 做短 debounce（約 100–200ms），避免過渡期狂重算 |
| **熱區** | 可點目標約 **≥44–48 CSS px**（無障礙法規下限更低——遊戲應取較大、按住類更大） |
| **輸入統一** | Pointer Events 單一路徑涵蓋觸控／滑鼠／筆；玩法區 `touch-action: none`，避免瀏覽器搶手勢 |
| **拇指區** | 主操作放在下緣／雙下角；少用螢幕上半與左右中段當唯一操控（殼把手亦佔左右中段——§3.2） |
| **依指標變 UI** | 粗指標露虛擬層；細指標可藏；**禁止** hover-only 當唯一操作 |
| **背景暫停** | 不可見時停模擬與循環音訊（§3.5）；回來勿帶舊按住狀態 |
| **回饋** | 即時、非阻擋（HUD／短提示／畫面反應）；結束給清楚短路徑（再玩／下一關） |
| **首次可懂** | 開局前或首局用短說明／示範，勿假設玩家會讀長文 |
| **可及性（盡力）** | 對比足夠；狀態不只靠顏色；桌面盡量鍵盤可用；焦點可見 |

#### 不要照抄（業界有、本專案否決）

| 常見外來建議 | 本專案作法 |
| --- | --- |
| 「請轉直／請轉橫」全屏擋玩 | **禁止**；四視口皆須可玩（§3.7） |
| `screen.orientation.lock()` | **禁止**依賴；跨瀏覽器／iframe／iOS 不可靠 |
| 假設真正 Fullscreen API 為快樂路徑 | **勿**當必備；iPhone 限制多，殼已有頂列 chrome |
| 為遊戲全面禁止頁面縮放當唯一防誤觸 | 優先玩法區 `touch-action: none`＋Pointer；勿犧牲可及性做整頁禁縮放 |

產品特有約束（玩中 chrome 收合、單頁相位、殼／遊戲責任、`PG.libs`／`PG.kv`）以本檔其餘章節為準；外來教學若與上表「不要照抄」衝突，**以本檔為準**。純 Canvas 舞台的具體程式骨架見 §3.9。

### 3.9 Canvas 舞台適配（純 2D `<canvas>`）

主畫面（或主舞台）以 **HTML Canvas 2D** 繪製時，須把**邏輯座標**、**CSS 顯示尺寸**、**backing store 像素**分開處理。視口矩陣與旋轉語意仍守 §3.7；本節給 agent **可直接照抄的實作契約**。

#### 適用範圍

| 情況 | 作法 |
| --- | --- |
| 主舞台＝`<canvas>`（射擊、平台、像素風、簡易 2D） | **本節**（vanilla 2D API） |
| `load("phaser")`／`load("pixi")` | 用引擎 **Scale／Resolution**（Phaser `scale`、Pixi `resize`）；**勿**再手寫一套與引擎衝突的 `canvas.width` 邏輯 |
| 棋盤／牌桌／格子＝DOM 或 CSS Grid | CSS＋§3.7 即可；**不必**本節 |
| Canvas 只當小圖示／QR／離屏緩衝 | 固定 px 可；主舞台仍須本節 |

#### 三層尺寸（硬）

```text
邏輯世界（固定，例 320×240）  ← 碰撞、繪圖、存檔座標一律用這層
    ↓ scale（contain 等比）
CSS 顯示（例 390×293 px）     ← style.width／height；getBoundingClientRect
    ↓ × dpr（cap 約 1.5–2，見 §3.8）
Backing store（例 780×586）    ← canvas.width／height 屬性
```

**禁止**只靠 CSS `width:100%` 拉伸 `<canvas>` 卻不更新 `canvas.width`／`height`——會糊、座標錯、點擊偏移。

#### 縮放策略（擇一為主）

| 模式 | 公式要點 | 適用 |
| --- | --- | --- |
| **contain**（預設） | `scale = min(capW/worldW, capH/worldH)`；可能 letterbox | 固定比例舞台、像素風 |
| **方形舞台** | 邊長 `≈ min(可用寬, 可用高) − chrome` | 棋類、對稱盤 |
| **cover** | `scale = max(capW/worldW, capH/worldH)`；可能裁切 | 全屏背景；須記錄 offset |
| **stretch** | 非等比拉滿 | **禁止**當預設（圓變橢圓） |

矮橫視口（§3.7 短高橫式）須同時傳入**可用寬與高**做雙向 contain，勿只依容器寬度算高。

#### 參考實作（可整段放進 `layout.js` 或 `app.js`）

```js
/** 固定邏輯世界尺寸——玩法只讀這組數字 */
export const WORLD = { width: 320, height: 240 };

/** cap DPR，避免 3× 手機填九倍像素 */
export function cappedDpr(max = 2) {
  const raw = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
  return Math.min(Math.max(1, raw), max);
}

/**
 * 把世界 contain 進容器；containerHeight 省略時只依寬（仍 preserve aspect）。
 * 回傳 scale 供繪圖與指標反算。
 */
export function computeCanvasLayout(containerWidth, containerHeight, dpr = 1) {
  const aspect = WORLD.height / WORLD.width;
  const capW = Math.max(1, containerWidth || 1);
  let cssWidth = capW;
  let cssHeight = Math.round(cssWidth * aspect);

  if (containerHeight != null && containerHeight > 0) {
    const capH = Math.max(1, containerHeight);
    if (cssHeight > capH) {
      cssHeight = capH;
      cssWidth = Math.round(cssHeight / aspect);
    }
  }

  cssWidth = Math.max(1, cssWidth);
  cssHeight = Math.max(1, Math.round(cssWidth * aspect));
  const scale = cssWidth / WORLD.width;
  return {
    cssWidth,
    cssHeight,
    dpr: Math.max(1, dpr),
    scale,
  };
}

/** 寫入 canvas 三層尺寸 */
export function applyCanvasLayout(canvas, layout) {
  canvas.width = Math.round(layout.cssWidth * layout.dpr);
  canvas.height = Math.round(layout.cssHeight * layout.dpr);
  canvas.style.width = `${layout.cssWidth}px`;
  canvas.style.height = `${layout.cssHeight}px`;
}

/** 繪圖前：世界座標繪製，DPR＋scale 一次處理 */
export function setWorldTransform(ctx, layout) {
  const s = layout.dpr * layout.scale;
  ctx.setTransform(s, 0, 0, s, 0, 0);
}

/** Pointer → 世界座標（content box，不含 border） */
export function pointerToWorld(pointer, canvas, world = WORLD) {
  const rect = canvas.getBoundingClientRect();
  const x = pointer.clientX - rect.left - canvas.clientLeft;
  const y = pointer.clientY - rect.top - canvas.clientTop;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (w <= 0 || h <= 0) return null;
  return {
    x: (x / w) * world.width,
    y: (y / h) * world.height,
  };
}
```

遊戲迴圈內：

```js
function paint(ctx, layout) {
  ctx.save();
  ctx.imageSmoothingEnabled = false; // 像素風；平滑 2D 可 true
  setWorldTransform(ctx, layout);
  // 以下全部用 WORLD 座標：fillRect(0, 0, WORLD.width, WORLD.height) …
  ctx.restore();
}
```

#### 版面與 resize（硬）

1. **外殼**用 flex／grid 吃掉剩餘空間；舞台容器 `flex:1; min-height:0`（短視口才縮得下）。  
2. **`ResizeObserver`** 觀察舞台**容器**（優於只聽 `window.resize`）；鍵盤彈起、iframe 縮放、旋轉都會觸發。  
3. 回呼內：`layout = computeCanvasLayout(el.clientWidth, el.clientHeight, cappedDpr())` → `applyCanvasLayout(canvas, layout)` → 重繪。**不要**重置局況。  
4. 可對 resize **debounce 100–200ms**，避免旋轉過渡期狂算。  
5. 玩法區 canvas：`touch-action: none`（§3.2）。

接線範例（`ResizeObserver`＋可選 debounce）：

```js
let layout = null;
let resizeTimer = 0;

function applyLayout() {
  const wrap = document.querySelector(".stage-wrap");
  const canvas = document.querySelector(".stage-wrap canvas");
  if (!wrap || !canvas) return;
  layout = computeCanvasLayout(
    wrap.clientWidth,
    wrap.clientHeight,
    cappedDpr()
  );
  applyCanvasLayout(canvas, layout);
  paint(canvas.getContext("2d"), layout);
}

function scheduleLayout() {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(applyLayout, 150);
}

const ro = new ResizeObserver(scheduleLayout);
ro.observe(document.querySelector(".stage-wrap"));
applyLayout(); // 初載
```

#### CSS 外殼（建議）

```css
#game {
  width: 100%;
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  padding: env(safe-area-inset-top) env(safe-area-inset-right)
    env(safe-area-inset-bottom) env(safe-area-inset-left);
}

.stage-wrap {
  flex: 1;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.stage-wrap canvas {
  display: block;
  max-width: 100%;
  max-height: 100%;
  /* 實際寬高由 JS applyCanvasLayout 設定 */
}
```

`index.html` 須有 viewport meta（§2.4）。HUD／按鈕優先用 **DOM** 疊在舞台外或上下欄（§3.6 收合）；勿把整片 UI 畫進 canvas 再靠放大字。

#### Phaser／Pixi 簡記

已 `load("phaser")` 時：

- 用 Phaser **Scale Manager**（例 `Phaser.Scale.FIT`／`RESIZE`＋固定 `width`／`height` 遊戲尺寸），讓引擎處理 DPR 與 letterbox。  
- 指標用場景座標或 `camera.getWorldPoint`，**勿**再對主 canvas 手寫 `pointerToWorld` 與引擎搶 transform。  
- `pagehide`／隱藏時 `scene.pause`＋銷毀慣例仍守 §3.5。

#### 否決（常見 agent 錯誤）

| 錯誤 | 後果 |
| --- | --- |
| 開局寫死 `canvas.width = 800` 永不更新 | 大螢幕糊、小螢幕裁切或橫向捲動 |
| 只改 CSS 尺寸不改 backing store | 模糊、點擊錯位 |
| 旋轉／resize 時 `resetGame()` | 違反 §3.7 |
| 用 `innerWidth` 當世界寬度重算實體位置 | 換機即壞；應固定 WORLD＋scale |
| 每幀改 `canvas.width` | 效能差、閃爍 |
| 主舞台 stretch 填滿 | 比例失真 |
| 高 DPI 不 cap DPR | 發熱、掉幀 |

#### 驗收（手測，疊加 §3.7 四視口）

- [ ] 四視口下舞台完整可見、無主 chrome 橫向捲動  
- [ ] 直↔橫旋轉：畫面重排、**局況不變**、點擊仍準  
- [ ] 視覺銳利（DPR 有套、像素風未糊成漸層）  
- [ ] `playing` 時舞台佔 §3.6 垂直預算主體；虛擬鍵在 safe-area 內（§3.2）

純函式 `computeCanvasLayout`／`pointerToWorld` 建議寫進 `tests/layout.test.js`（Vitest），用固定輸入斷言 `scale` 與座標。

---

## 4. `window.PG`（遊戲子集）

一律先：

```js
await window.PG.ready;
```

之後才讀 `vars`、打 `kv`、或 `libs.load`（`load` 技術上可不依賴 ready，但建議與其它 API 一致，ready 之後再載）。

### 4.1 KV（分數／進度——預設首選）

```js
await PG.ready;

// 讀：無鍵 → null
const raw = await PG.kv.get("highscore");
const high = Number(raw || 0);

// 寫：值必須是 string
await PG.kv.put("highscore", String(score));

// 可選 TTL（秒）
await PG.kv.put("tmp", "1", { expirationTtl: 3600 });

await PG.kv.delete("highscore");

const listed = await PG.kv.list({ prefix: "level:" });
// listed.keys / listed.cursor / listed.list_complete
```

| 規則 | |
| --- | --- |
| 權威 | 跨重開的分數／關卡進度以 **KV** 為準 |
| 禁止 | 以裸 `localStorage`／`sessionStorage` 當權威（最多當當幀 UI 暫存） |
| 值型別 | `put` 只收 **string**；數字／物件請自行 `String`／`JSON.stringify` |

等同 raw `fetch`（除錯用；正式碼優先 `PG.kv`）：

```js
const res = await fetch("/api/kv/highscore");
const value = await res.text(); // 或依狀態處理
await fetch("/api/kv/highscore", { method: "PUT", body: String(score) });
```

### 4.2 DB／vars（多數遊戲用不到）

- **`PG.db`**：仿 D1 子集；多欄查詢才考慮。遊戲類優先 KV。  
- **`PG.vars`**：**同步**讀（像靜態設定）；`PG.vars.FOO`、`PG.vars.has("FOO")`、`PG.vars.keys()`。不要把密鑰放 vars 給 UI 讀。

### 4.3 錯誤

失敗時 throw，常見形狀：

```js
try {
  await PG.kv.put("highscore", String(n));
} catch (e) {
  // e.name 可能為 PgError；e.code / e.status
  if (e && e.code === "functions_no_leader") {
    showToast("還沒就緒，請稍候再試");
    return;
  }
  showToast("存檔失敗");
}
```

遊戲常見 `code`：`functions_no_leader`、`functions_unavailable`、`kv_key_too_large`、`internal_error`。  
libs：`unknown_lib`、`load_failed`（見 §5）。  
一律**頁內**提示，禁止 `alert`。KV／配額類失敗時遊戲應可降級繼續玩（本局分數仍可顯示；同步失敗用 toast／HUD）。

### 4.4 不要做的事

- 不要假設存在 `PG.secrets`（UI 不暴露密鑰值）。  
- 不要在 UI 直連「後端 env」。  
- 不要發明 `PG.controls`／`PG.input`／`PG.lifecycle`／`PG.achievements`（殼不注入操控；生命週期見 §3.5；無獎盃 API）。  
- `PG.SESSION`／`COMPUTE`／`HOST`／`DELEGATE` 為 **capability**：未準入時**屬性不存在**（`"SESSION" in PG === false`）。**單機小品（`/s/`、`pg_surface=solo`）預設不要依賴它們。** 包廂連線局依 §8（入座席由殼完成；遊戲讀席次／角色後走既有 session 隧道）。

### 4.5 自訂 API 逃生艙

僅當你提供了 `functions.js` 的自訂路由：

```js
const res = await PG.fetch("/api/my-route", { method: "POST", body: "…" });
```

---

## 5. `PG.libs`（宿主釘版 UI 函式庫）

### 5.1 用法

```js
await PG.ready;

// 不觸發下載——只看殼有哪些 id
const available = await PG.libs.list();

const Phaser = await PG.libs.load("phaser");
const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: "game",
  width: 390,
  height: 700,
  scene: { /* … */ },
});
```

| 規則 | |
| --- | --- |
| 白名單 | `load` **只**接受下表 id；禁止 URL、相對路徑、自創 id |
| 懶載 | 未 `load` 前不得出現對 `/playgrounds/libs/*` 的請求；`list()` 亦不下載 |
| 冪等 | 同一 id 多次 `load` 共用一次成功結果；失敗可再試 |
| 禁止 | 把引擎 min.js 拷進遊戲 repo、`<script src="https://cdn…">`、GSAP 等未列庫 |
| 銷毀 | Phaser：`game.destroy(true)`；換沙盒＝整頁卸載。MVP 無 `unload` |

錯誤：

| `code` | 何時 |
| --- | --- |
| `unknown_lib` | id 不在白名單或本殼未船運 |
| `load_failed` | 下載／初始化失敗 |

### 5.2 白名單（殼釘版；`load` 不帶版號）

| id | 大約版本 | 用途 | `load` 得到 | 何時用 |
| --- | --- | --- | --- | --- |
| `phaser` | 4.2.x | **預設完整 2D** | `Phaser` | 動作、捲軸、tilemap、多 scene、相機 |
| `pixi` | 8.x | 2D 渲染（ESM） | 模組 namespace | 只要渲染、不要 Phaser 全家桶時 |
| `three` | 0.185.x | 3D（ESM） | 模組命名空間 | 明確需要 3D |
| `matter` | 0.20.x | 剛體物理 | `Matter` | 彈珠、堆疊、簡單剛體 |
| `planck` | 1.3.x | Box2D 形 | `planck` | Matter 不夠用時 |
| `howler` | 2.2.x | SFX／BGM | `Howler`／`Howl` | 跨品類音效 |
| `tone` | 15.x | 合成／Transport | `Tone` | 節拍／合成；體積大→真需要才 load |
| `nipple` | 1.0.x | 類比虛擬搖桿 | `nipplejs` | 俯視／連續移動（見 §3.2；勿用小方向鍵代替） |
| `seedrandom` | 3.0.x | 可重現 RNG | `Math.seedrandom` | 關卡種子／可重播 |

```js
const Matter = await PG.libs.load("matter");
const Howler = await PG.libs.load("howler");
const nipplejs = await PG.libs.load("nipple");
const seedrandom = await PG.libs.load("seedrandom"); // === Math.seedrandom
const THREE = await PG.libs.load("three");           // ESM
const PIXI = await PG.libs.load("pixi");             // ESM
```

**Phaser 為 4.x，不是 3。** 寫 API／看文件時以 Phaser 4 為準。

### 5.3 選庫決策

```text
桌遊／牌／消消／數獨／問答／簡易 DOM 或 2D canvas
  → vanilla（不要 load）
  → 主舞台為全畫面 <canvas> 時：§3.9（邏輯座標＋contain＋DPR）

需要完整 2D 場景／精靈／相機／tilemap
  → load("phaser")
  → 優先用 Phaser 內建 Arcade／tween／簡易音，勿無故再疊 Matter+Howler+Tone
  → 縮放用 Phaser Scale Manager，勿與 §3.9 手寫邏輯衝突

只要輕量渲染
  → pixi；不要與 phaser 雙載

剛體彈珠／保齡
  → matter（± vanilla 或 phaser）

明確 3D
  → three

只要 seeded RNG
  → seedrandom（或自寫一小段）

手機連續移動／俯視動作
  → load("nipple") 或畫布拖曳（§3.2）；不要只做固定小 D-pad
  → 已 load("phaser") 時可優先 Phaser pointer／虛擬鍵，必要再疊 nipple

格子／單步／桌遊點選
  → vanilla pointer／swipe；不要無故 load("nipple")
```

**禁止進殼、也禁止你自行 CDN 引入當「替代方案」：** GSAP（授權門檻）、以及任何未列於上表的大型第三方 runtime。動畫用 CSS、自寫、或 Phaser tween。

---

## 6. 自訂 `functions.js`（多數遊戲不需要）

| 情況 | 作法 |
| --- | --- |
| 只有高分／關卡鍵值 | **不要**自訂；`PG.kv` + 宿主預設 handler |
| 需要密鑰派生、自訂業務路由、複雜交易 | 才加 `functions.js`；UI 仍只打 `/api/…`，**永不**在 UI 讀密鑰字串 |

有自訂檔時，宿主**不再**自動合併預設路由的行為以實際 Runtime 為準——能不用就不用，避免踩路由覆蓋。

---

## 7. 單機遊戲啟動樣板

### 7.1 Vanilla + KV 高分

```js
// app.js
await PG.ready;

const el = document.getElementById("game");
let score = 0;
let high = Number((await PG.kv.get("highscore")) || 0);

function render() {
  el.innerHTML = `
    <p>分數 ${score} · 最高 ${high}</p>
    <button type="button" id="tap" style="min-width:44px;min-height:44px">點我</button>
    <p id="msg" hidden></p>
  `;
  el.querySelector("#tap").onclick = async () => {
    score += 1;
    if (score > high) {
      high = score;
      try {
        await PG.kv.put("highscore", String(high));
      } catch {
        el.querySelector("#msg").hidden = false;
        el.querySelector("#msg").textContent = "最高分同步失敗（仍可繼續玩）";
      }
    }
    render();
  };
}

render();
```

### 7.2 Phaser 4 開頭

```js
await PG.ready;
const Phaser = await PG.libs.load("phaser");

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: "game",
  width: 390,
  height: 700,
  backgroundColor: "#1a1a1a",
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: {
    create() {
      this.add.text(12, 12, "Hello", { fontFamily: "sans-serif", fontSize: 18 });
    },
  },
});

// 離開／重開前：
// game.destroy(true);
```

Phaser 場景、物理、輸入細節以 **Phaser 4** 官方文件／examples 為準；本檔不複製整本引擎文件。

---

## 8. 包廂連線遊戲（硬）

遊樂場的**多人連線對弈**快樂路徑＝**包廂**（go `/room` 主持＋Guest `/i/<short>`），不是 `/s/<id>`。任務要求「可連線／包廂局」時遵守本節；**預設仍先做出可在 `/s/` 單機玩的同一套檔**。

### 8.1 拓樸（硬）

| 入口 | 殼注入 | 遊戲必須 |
| --- | --- | --- |
| go **`/s/<id>`**（及 play 畫布單機開） | `pg_surface=solo`（或缺省＝solo） | **只單機**（人機／本地多席／AI 等）；**禁止**露「邀請對弈／開場／鑄 compose／等人入座」當主路徑 |
| 包廂大螢幕槽 | `pg_surface=room` | **只連線對弈**；入座席由殼 `session_play`＋`avatar_relay`；遊戲做局內規則與**依角色**的 UI |

**禁止：**

- 把 `/s/...` 做成多人連線主路徑（掃碼拉人、等人滿、線上大廳）  
- 在 `room` 面再要求 Guest 掃第二張 compose／把網址 `replaceState` 成 `/s/<id>` 或 `/room`  
- 假設「開了 `/s/` 就能跟包廂裡的人同一局」

參考實作：`pg-gomoku`、`pg-redpick`（皆有 `shellSurface.js`＋依 surface 分支）。

### 8.2 讀取 `pg_surface`

殼會傳語境（擇一；**預設 solo**）：

1. URL：`…/index.html?…&pg_surface=room|solo`  
2. Memory／srcdoc：`<meta name="pg:surface" content="room|solo">`  
3. 皆無 → **`solo`**

建議抽小模組（勿依 `location.host`）：

```js
export function readPgSurface(doc = document, loc = location) {
  try {
    const q = new URLSearchParams(loc.search || "").get("pg_surface");
    if (q === "room" || q === "solo") return q;
  } catch { /* ignore */ }
  try {
    const c = doc.querySelector?.('meta[name="pg:surface"]')
      ?.getAttribute?.("content")?.trim();
    if (c === "room" || c === "solo") return c;
  } catch { /* ignore */ }
  return "solo";
}
```

開局：`const shellSurface = readPgSurface();` → `solo` 只掛單機 UI；`room` 只掛連線 UI（等候／入座狀態／依角色操作）。

### 8.3 誰設定遊戲（硬）

| 動作 | 誰可以 | 說明 |
| --- | --- | --- |
| 選哪一款、開／結束這一局 | **包廂主持**（殼） | 遊戲不負責「玩遊戲」選單 |
| 局內設定：發牌、選先手、開始、再來一局、重設規則選項等 | **僅主持角色**（通常 protocol `host`） | Guest **不可**改設定；UI 不顯示或 disabled |
| 輪到自己的出牌／落子／操作 | **該席角色** | 非己回合不可送權威 `act` |
| 觀戰 | 未入座席 | 同畫布；**不**佔 role、**不**送 `act` |

**權威在 Host 本機 SAM `functions.js`：** 非主持的設定類 `act` 必須 `role_forbidden`（例：僅主持可 `deal`／`start`／`reset`）。前端隱藏不夠——後端要拒。

### 8.4 UI 依角色調整（硬）

連線局 UI **必須**隨本機角色改變可見 DOM（對齊 §3.6：相位／角色切換＝改結構，非只改一行字）：

| 角色 | UI 取向 |
| --- | --- |
| **主持（host）** | 可見局內設定與「發牌／開始／再來」；可看滿席／等候文案；輪到自己時可操作 |
| **入座訪客（p2／player…）** | **隱藏**主持專用設定；顯示「已入座／等候主持…」；僅己回合操作；結束後等主持再開 |
| **觀戰** | 只看；無出牌控件；可標「在看」 |

**玩家名稱：** 包廂會把顯示名帶進 session presence／`listSeats`（`name`／`displayName`）。連線局應用這些名稱標席次／回合（勿只顯示「席二」「對手」）；本機視角可把「自己」顯示成「你」，其餘用真名。

**禁止**對玩家露出協議 id 字串（如 `redpick.v1`）當主文案；型錄／除錯另論。

### 8.5 協定與席次（遊戲側）

- 型錄／`protocol` 宣告 `roles`（含主持席）與必要時 `roleLimits`；包廂滿席才開局——**人數閘在殼**，遊戲在 `waiting`／`ready`／`active` 狀態機上對齊。  
- **入座席＝殼的事**：`room` 面不要自己 mint Platform invite、不要自己做 QR 進門。  
- Guest 自動入座後，遊戲只：`getSeat`／同步 state、依 role 渲染、收發合法 `act`。  
- 結束這一局（遊戲內或殼「結束這一局」）→ 卸局；**不要**假設會拆包廂 PeerConnection。

### 8.6 與 GO-INVITE 的界線（**2026-08-23 修訂**）

| 路徑 | 用途 |
| --- | --- |
| **包廂 `invite.room` → `session_play`** | **所有連線遊戲**唯一快樂路徑：先請人進包廂，再大螢幕開局 |
| ~~**GO-INVITE（`invite.compose`）**~~ | **Superseded**；API 可暫留，**新產品勿用** |

任務寫「包廂連線」或「多人對弈」時：**只**做 `invite.room`＋`session_play`；**不要** compose。`pg_surface=solo` 亦**不要**露 compose。

### 8.7 連線局交付自檢（任務要求多人時另勾）

- [ ] `/s/<id>` 與 `pg_surface=solo`：**無**連線邀請／開場／等人主路徑  
- [ ] `pg_surface=room`：**無**單機開局模式切換當主路徑；入座不自鑄 compose  
- [ ] 僅主持可見／可送設定類操作；`functions.js` 拒絕非主持設定 `act`  
- [ ] 訪客／觀戰 UI 與主持明顯不同（隱藏設定、等候文案、無越權控件）  
- [ ] 席位／回合顯示使用包廂顯示名（有則優先）  
- [ ] `sam-manifest.json` 含 `shellSurface.js`（若有）等連線相關檔，並 bump `rev`

---

## 9. 美術／音效／署名

| 規則 | |
| --- | --- |
| 拷貝 | 素材檔必須在本遊戲 repo（如 `assets/`） |
| 禁止 | runtime 依賴宿主或其他 repo 的絕對素材路徑 |
| 署名 | 授權**要求**署名 → 必須依要求；**不要求也要署名**（專案慣例） |
| 放哪 | 至少 `ATTRIBUTION.md`；建議遊戲內「關於／Credits」 |

`ATTRIBUTION.md` 最低範本：

```markdown
# Attribution

- [資產名稱] — [作者] — [授權，如 CC0 / CC BY 4.0] — [來源 URL]
```

---

## 10. 測試

- 單元測試測**玩法規則**（合法步、得分、勝敗、碰撞結果等），用 `npx vitest run`（**不要**為 vitest 把依賴寫死進「遊戲運行時」；以 npx 臨時執行）。  
- **不要**在測試裡假設能載到真實 `/playgrounds/libs/*`（那是殼環境）。引擎相關邏輯：抽純函式測，或 mock。  
- 示例（規則函式）：

```js
// score.js
export function mergeHigh(current, high) {
  return current > high ? current : high;
}

// tests/score.test.js
import { describe, it, expect } from "vitest";
import { mergeHigh } from "../score.js";

describe("mergeHigh", () => {
  it("keeps the larger value", () => {
    expect(mergeHigh(3, 10)).toBe(10);
    expect(mergeHigh(12, 10)).toBe(12);
  });
});
```

```bash
npx vitest run
```

---

## 11. 常見錯誤（禁止重蹈）

1. CDN 或自帶 Phaser／Pixi／Three min.js  
2. 當 Phaser 3 寫（殼是 **4**）  
3. 在 `index.html` 再載 `sdk.js`  
4. `localStorage` 當高分權威  
5. `alert`／`confirm` 結束或重置  
6. 桌遊／DOM 謎題卻 `load("phaser")` 無故加重  
7. 同時 load phaser + pixi「雙引擎」  
8. 提交 `node_modules` 或 build 產物  
9. 僅鍵盤可玩、觸控熱區過小  
10. 連續移動卻只用固定小虛擬方向鍵（應 §3.2 類比搖桿或畫布拖曳）  
11. 新遊戲 touch+mouse 雙綁、或放開後未歸零（黏鍵）  
12. 虛擬鍵佔左右邊緣中段、與殼把手重疊；或未留 safe-area  
13. 無署名或素材未拷進 repo  
14. 用按鈕列表冒充可玩深度  
15. 為 go／play 寫兩套分支  
16. UI 讀密鑰或發明 `PG.secrets`／`PG.controls`／`PG.input`  
17. `load("https://…")` 或自創 lib id  
18. 引入 GSAP 或其它未白名單庫  
19. 分頁隱藏仍全速模擬／BGM，或 resume 時帶著舊按住狀態（違反 §3.5）  
20. 把 Invite／對戰協定塞進 `PG.libs` 或當單機預設依賴 `PG.SESSION`  
21. `playing` 時仍整頁顯示 hero／難度模式／常駐規則，舞台被擠成一條（違反 §3.6）  
22. 只做直式長頁＋`min-width` 略加寬，短高橫式無法玩或需「請旋轉」（違反 §3.7）  
23. 旋轉螢幕重置整局，或固定 px 畫布在矮視口溢出／擋操作  
24. 照抄「請旋轉」／orientation lock／依賴 Fullscreen 當唯一可玩條件（違反 §3.8）  
25. 主舞台 `<canvas>` 只靠 CSS 拉伸、或寫死 `canvas.width`／`height` 不隨容器更新；resize 重置局況；指標未反算世界座標（違反 §3.9）  
26. 無 `sam-manifest.json`，或 `files` 漏列執行期資源／改檔不 bump `rev`（違反 §2.5）  
27. 把 `/s/<id>` 做成多人連線快樂路徑，或在包廂 `room` 面再鑄 compose／掃第二張邀請（違反 §8）  
28. 連線局讓訪客改發牌／先手／再來一局等設定，或 `functions.js` 不拒非主持設定 `act`（違反 §8.3）  
29. 連線局主持／訪客／觀戰同一套設定控件，或角色切換只改文案不改 DOM（違反 §8.4）

---

## 12. Definition of Done（交付前自檢）

複製並在工作記錄勾選：

- [ ] 僅 HTML／CSS／JS；無 build；無 `node_modules` 入庫  
- [ ] 未把 `PG-GAME-AGENT-GUIDE` 全文拷進本 repo（僅保留短 `AGENTS.md` 指針即可）  
- [ ] 未手注 `sdk.js`；使用 `await PG.ready`  
- [ ] 有持久分數／進度 → `PG.kv`（或自訂 `/api`），非裸 `localStorage` 權威  
- [ ] 需引擎／物理／音訊 → 僅 `PG.libs.load` 白名單；否則未 load  
- [ ] 無 CDN 函式庫；無 GSAP／未列庫  
- [ ] Mobile-first；主操作觸控可用；無 `alert`／`confirm`／`prompt`  
- [ ] §3.6：`playing` 收合 setup／大標題／常駐說明；結束用薄結果＋再來；非只改按鈕文案  
- [ ] §3.7：直／橫＋手機／桌面四態可玩；短高橫式有重組；旋轉不重置局  
- [ ] §3.8：採納適用業界項（邏輯解析度／DPR cap／Pointer＋熱區／背景暫停等）；未用請旋轉／orientation lock  
- [ ] （主舞台為 `<canvas>`）§3.9：三層尺寸正確、contain、ResizeObserver、指標反算、旋轉不重置局  
- [ ] 需持續移動時符合 §3.2（類比／拖曳／離散擇一；非唯小 D-pad；Pointer＋歸零）  
- [ ] §3.5 生命週期：hidden／pagehide 時輸入歸零＋暫停迴圈／音訊；引擎有銷毀慣例  
- [ ] 平台錯誤（KV 等）頁內提示，可降級續玩  
- [ ] 可玩標準 §3.4（操作／狀態／挑戰／輸贏／測試／素材／生命週期／chrome／視口）  
- [ ] `ATTRIBUTION.md`（及必要時遊戲內 credits）齊  
- [ ] `npx vitest run` 綠（有規則可測時）  
- [ ] 無 go／play 特判；相對路徑資源正確  
- [ ] 未發明殼級操控／獎盃 API；單機（`/s/`）未依賴 Invite／把連線當預設  
- [ ] 根目錄 `thumbnail.png` 已依 §2.4 產生（真實遊玩幀、4:3、約 640×480、PNG ≤~50KB）並入庫  
- [ ] 根目錄 `sam-manifest.json` 已依 §2.5（`version` 1、`rev` 已 bump、`files` 含 `index.html` 與所有執行期相對路徑資源）  
- [ ] （若任務要求包廂連線）§8.7 連線局自檢全勾  

---

## 13. 本指南不涵蓋（不要擅自擴 scope）

除非任務單**明文**要求，否則不要做：

- 修改 Playgrounds 宿主、Service Worker、`pin.json`、新增 `PG.libs` id  
- 撰寫／提交場型錄 YAML、上架／unlist 流程、宿主 `/covers/<id>.png` 同步  
- 實作包廂殼本身（`session_play` wire、進門 WebRTC、門牌 mint）——那是宿主；遊戲只守 §8  
- 把 GO-INVITE compose 當包廂開局快樂路徑（違反 §8.6）  
- Platform 登入、dash、點數、TURN  
- 文件站、場殼 IDE、OPFS 編輯管線  

**預設產物**＝可在 go **`/s/<id>` 單機**純玩的靜態 SAM。  
**任務要求多人連線時**＝同一套檔另支援 `pg_surface=room`（§8）；仍須保持 `/s/` 為單機。

---

## 14. 給維護者的註腳（agent 可略）

本檔內容摘自宿主契約（UI SDK、`PG.libs`、遊戲交付約束、UX／生命週期／畫面相位／視口硬規則、Canvas 舞台適配、適用的業界 Web 遊戲共識、主機 SDK 責任借鑑、包廂 `session_play`／`pg_surface`）。若與殼上實際 `sdk.js`／`pin.json`／包廂行為衝突，以殼運行為準，並應回修本檔附表版本。Agent 開發遊戲時仍以本檔為唯一必讀。
