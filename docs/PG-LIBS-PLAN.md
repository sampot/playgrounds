# Playgrounds 宿主函式庫（`PG.libs`）— 實作計畫

> **狀態：** Draft（2026-08-17；修訂：禁 precache、授權門檻、路線圖、文件借鑑主機 SDK）  
> **規格權威：** [PG-LIBS-SPEC.md](./PG-LIBS-SPEC.md)  
> **相關：** [PG-UI-SDK-PLAN.md](./PG-UI-SDK-PLAN.md)、[PG-UI-SDK-SPEC.md](./PG-UI-SDK-SPEC.md)（§1.4 殼邊界）、[PG-GAMES.md](./PG-GAMES.md)、[PG-GAME-AGENT-GUIDE.md](./PG-GAME-AGENT-GUIDE.md)（agent 開發自足指南；§3.5 生命週期）

---

## 目標

落地 `PG.libs.list`／`load`、殼釘版 Phaser 4（＋路線圖 Matter／Howler 等）、play↔go 同步、**libs 不進 precache**、僅授權清楚之開源庫、測試與文件。

---

## Phase 0 — 規格凍結

| 項 | 完成定義 |
| --- | --- |
| SPEC／PLAN | `PG.libs`；G6 禁 precache；G7 授權門檻 |
| 產品 | `phaser`＝Phaser 4；GSAP／授權疑慮者不進 |
| 載入 | 僅 `PG.libs.load`；bridge 不預注入、SW 不 precache libs |

- [x] 起草與更名
- [x] 修訂：懶載硬規則、授權、候選路線圖

---

## Phase 1 — 釘版資產＋同步

| 項 | 路徑／動作 | 完成定義 |
| --- | --- | --- |
| 1.1 Phaser 4 min | `public/playgrounds/libs/phaser-<ver>.min.js` | 版號檔名；LICENSE／來源旁註 |
| 1.2 釘版表 | SDK 或 `libs/pin.json` | `list()` 可讀 version；**list 不下載** |
| 1.3 go sync | `copy-go-playgrounds-static` 含 `libs/**` | 位元同步；≠ precache |
| 1.4 Matter（緊隨） | 同目錄＋LICENSE | 規格 §5 |
| 1.5 Howler（高優先） | 同左 | 可與 1.4 同波或下一波 |

- [x] 1.1–1.3（phaser@4.2.1＋pin.json＋LICENSE-phaser.txt＋go sync）
- [x] 1.4–1.5（matter@0.20.0、howler@2.2.4）
- [x] 白名單其餘：tone、nipple、three（ESM）、pixi（ESM）、seedrandom、planck

---

## Phase 2 — SDK 表面

| 項 | 完成定義 |
| --- | --- |
| `PG.libs` in `sdk.js` | list／load、冪等、`unknown_lib`／`load_failed` |
| `sdk.d.ts` | `PgLibs` |
| 測試 | TDD；含「未 load 無請求」 |
| `sdk:check` | 不引入 `env.*` |

- [x] Phase 2（MVP：`phaser`）

---

## Phase 3 — 雙殼 smoke＋禁 precache

| 項 | 完成定義 |
| --- | --- |
| play／go | `load("phaser")` 可跑一幀 |
| 懶載 | 無 load → 無 `/playgrounds/libs/` 請求 |
| precache | SW／manifest **不含** libs 路徑（測試或 grep 鎖） |
| CI | sync 缺檔失敗 |

- [x] 單元／靜態：懶載契約＋SW 不含 libs（`sdk`／`pgLibsPin` tests）
- [x] CI 缺檔 gate：`pgLibsPin` 對 pin.json 每一 id 檢查 binary＋LICENSE
- [x] 雙殼對等：`pgLibsShellParity`（sdk／libs 位元一致、bridge 注入、SW G6）
- [ ] 瀏覽器 smoke（play／go 手測或後續自動化）

---

## Phase 4 — 文件

| 項 | 完成定義 |
| --- | --- |
| 4.1 交叉引用 | UI SDK／GAMES 已指向本 SPEC |
| 4.2 遊戲 README 慣例 | `PG.libs.load("phaser")` |
| 4.3 主機 SDK 借鑑入規 | Agent Guide §1.1／§3.5；LIBS §1.5；UI SDK §1.4；開放點 flash／lifecycle |
| 4.4 SPEC → Accepted | 實作綠後 |

- [x] 4.1（交叉引用）
- [x] 4.3（2026-08-17：殼／遊戲邊界、生命週期義務、非目標）
- [ ] 4.2、4.4

---

## Phase 5 — 後續 libs

白名單九項已船運。新增 id 時：LICENSE 核對、釘版、sync、更新 SPEC 白名單。Kaplay／GSAP 仍不進（見 SPEC §5.7）。

---

## 非本計畫

- libs precache／install 預取  
- GSAP 或授權有疑慮的庫  
- 預設 Kaplay／Phaser 3 雙軌  
- 重寫全部 vanilla 遊戲為 Phaser  

---

## 風險

| 風險 | 緩解 |
| --- | --- |
| 體積 | 懶載＋禁 precache（G6） |
| 授權漂移 | 每版核 LICENSE（G7）；旁註來源 |
| go 漏同步 | prebuild＋CI |
| WebGL 洩漏 | `game.destroy(true)` 慣例 |
