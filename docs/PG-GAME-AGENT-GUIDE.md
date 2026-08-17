# Playgrounds 遊戲開發指南（Coding Agent）

> **狀態：** Draft（2026-08-17；修訂：§3.2 行動觸控操控）  
> **讀者：** Coding agent（次要：人類作者）  
> **範圍：** 獨立 `pg-*` 遊戲 repo；產物須能在 **go 純玩**（`https://go.samkuo.me/s/<id>`）與 **play 畫布**同契約執行。  
> **自足：** 開發遊戲時**只讀本檔**即可；不必讀宿主其它 SPEC／PLAN／源碼。上架型錄、改殼、加新 lib id **不在**本檔範圍。  
> **Starter：** 新遊戲請用 template repo [`sampot/pg-game-scaffold`](https://github.com/sampot/pg-game-scaffold)（`gh repo create … --template sampot/pg-game-scaffold`）。遊戲 repo 只保留短 `AGENTS.md` **指針**指向本檔；**禁止**把本指南全文拷進每個 `pg-*`。

---

## 0. Agent briefing（先讀這段）

你正在為 **山姆鍋遊樂場（Playgrounds）** 開發一款 **`kind: game`** 小品。

| 項 | 規定 |
| --- | --- |
| **產物** | 獨立 GitHub repo（慣例 id／repo 名＝`pg-<name>`），靜態檔可直接掛進畫布 iframe |
| **開新庫** | 優先自 [`pg-game-scaffold`](https://github.com/sampot/pg-game-scaffold) template 建立；勿從舊遊戲整棵複製，亦勿 vendoring 本指南 |
| **交付形式** | **僅** HTML + CSS + JavaScript；**禁止**任何 build 階段、**禁止**把 `node_modules` 或套件鎖進 repo |
| **執行期** | 宿主注入 `window.PG`；你**不要**自己載入 `/playgrounds/sdk.js` |
| **相容** | 同一套檔在 go 與 play **同形**；**禁止**依 `location.host` 特判 go／play |
| **工具** | 需要測試／暫用工具時用 `npx <pkg>`，**不**寫進依賴清單當運行時需求 |

**硬禁令（違者視為未完成）：**

1. 禁止執行期外連 CDN／任意 URL 載入函式庫；大型引擎／物理／音訊只許 `PG.libs.load(白名單 id)`。  
2. 禁止 `window.alert`／`confirm`／`prompt`。  
3. 禁止用裸 `localStorage`（或同類）當分數／進度的**權威**；持久化走 `PG.kv`（或自訂 `/api`）。

做完後依 **§11 Definition of Done** 逐項自檢再停。

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

---

## 2. Repo 骨架

### 2.1 最小可玩

```text
index.html      # 入口（必）
app.js          # 或 inline module；可再拆檔
style.css
README.md
ATTRIBUTION.md  # 有第三方素材時必填；建議一律有
```

### 2.2 建議完整

```text
index.html
app.js                 # 或 src/ 多檔，仍無 build：用 <script type="module">
style.css
assets/…               # 圖像／音效／字型（拷進本 repo）
tests/game.test.js     # 規則／純函式
ATTRIBUTION.md
README.md
# 可選——僅當預設 /api 不夠時：
functions.js
```

### 2.3 契約

| 規則 | 說明 |
| --- | --- |
| 入口 | 可直接開啟的 `index.html` |
| 路徑 | 資源用**相對路徑**（`./app.js`、`./assets/…`） |
| 禁止入庫 | `node_modules/`、bundler 產物、自帶的 Phaser／Pixi／Three 等大型 vendor |
| SDK | **禁止** `<script src="/playgrounds/sdk.js">`（宿主已注入；再載會重複） |
| 素材來源 | 開發期可從維護者本機素材庫拷貝；**定稿必須在遊戲 repo 內**；禁止 runtime 指到宿主 `game-assets/` 路徑 |

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

---

## 3. UX 硬規則

### 3.1 Mobile-first

- **先**為窄螢幕設計（參考邏輯寬約 **390×700**），再在大螢幕增強；不要桌面排版再硬縮。
- 主操作（開始、移動、確認、再來一局）在手機單手可完成；**禁止**只靠 hover。
- 可點控件熱區盡量 **≥44×44 CSS px**。
- 佈局用 flex／stack；CSS 預設＝手機，用 `@media (min-width: …)` 加寬，不要反過來只靠 `max-width` 補丁。
- go 頂列 chrome 可能出現／自動收合：HUD 勿假設「永遠全螢幕無邊」；優先 `100dvh`、留安全邊距。

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

### 3.4 可玩驗收（上架／交付門檻）

每款至少滿足：

1. **操作是遊戲本身**——點格、拖曳、即時操控等，不是「動作字串按鈕列」充數。  
2. **狀態有結構**——盤面／單位／牌庫／地圖等，不是幾個純量計數器冒充。  
3. **有挑戰**——AI 或關卡會因玩家選擇改變。  
4. **輸贏清楚**——可勝可敗，且來自玩家操作。  
5. **測試測規則**——不是只斷言「某個欄位有變」。  
6. **美術／音效有實際用上**，且署名齊（§8）。

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
一律**頁內**提示，禁止 `alert`。

### 4.4 不要做的事

- 不要假設存在 `PG.secrets`（UI 不暴露密鑰值）。  
- 不要在 UI 直連「後端 env」。  
- `PG.SESSION`／`COMPUTE`／`HOST`／`DELEGATE` 為 **capability**：未準入時**屬性不存在**（`"SESSION" in PG === false`）。**單機小品預設不要依賴它們。** 多人／Invite 協定超出本指南（§12）。

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

需要完整 2D 場景／精靈／相機／tilemap
  → load("phaser")
  → 優先用 Phaser 內建 Arcade／tween／簡易音，勿無故再疊 Matter+Howler+Tone

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

## 8. 美術／音效／署名

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

## 9. 測試

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

## 10. 常見錯誤（禁止重蹈）

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
16. UI 讀密鑰或發明 `PG.secrets`／`PG.controls`  
17. `load("https://…")` 或自創 lib id  
18. 引入 GSAP 或其它未白名單庫

---

## 11. Definition of Done（交付前自檢）

複製並在工作記錄勾選：

- [ ] 僅 HTML／CSS／JS；無 build；無 `node_modules` 入庫  
- [ ] 未把 `PG-GAME-AGENT-GUIDE` 全文拷進本 repo（僅保留短 `AGENTS.md` 指針即可）  
- [ ] 未手注 `sdk.js`；使用 `await PG.ready`  
- [ ] 有持久分數／進度 → `PG.kv`（或自訂 `/api`），非裸 `localStorage` 權威  
- [ ] 需引擎／物理／音訊 → 僅 `PG.libs.load` 白名單；否則未 load  
- [ ] 無 CDN 函式庫；無 GSAP／未列庫  
- [ ] Mobile-first；主操作觸控可用；無 `alert`／`confirm`／`prompt`  
- [ ] 需持續移動時符合 §3.2（類比／拖曳／離散擇一；非唯小 D-pad；Pointer＋歸零）  
- [ ] 可玩標準 §3.4（操作／狀態／挑戰／輸贏／測試／素材）  
- [ ] `ATTRIBUTION.md`（及必要時遊戲內 credits）齊  
- [ ] `npx vitest run` 綠（有規則可測時）  
- [ ] 無 go／play 特判；相對路徑資源正確  

---

## 12. 本指南不涵蓋（不要擅自擴 scope）

除非任務單**明文**要求，否則不要做：

- 修改 Playgrounds 宿主、Service Worker、`pin.json`、新增 `PG.libs` id  
- 撰寫／提交場型錄 YAML、上架／unlist 流程  
- Invite／WebRTC／多人对弈協定、`PG.SESSION` 座席邏輯  
- Platform 登入、dash、點數、TURN  
- 文件站、場殼 IDE、OPFS 編輯管線  

預設產物＝**可在 go `/s/<id>` 單機純玩**的靜態 SAM。多人局需另份任務說明。

---

## 13. 給維護者的註腳（agent 可略）

本檔內容摘自宿主契約（UI SDK、`PG.libs`、遊戲交付約束、UX 硬規則）。若與殼上實際 `sdk.js`／`pin.json` 衝突，以殼運行為準，並應回修本檔附表版本。Agent 開發遊戲時仍以本檔為唯一必讀。
