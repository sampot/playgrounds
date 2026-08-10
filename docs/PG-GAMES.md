# Playgrounds 遊戲清單（`kind: game`）

> **用途：** 維護用快照——已上架＋打算做，避免每次掃 `catalog/entries/`。  
> **權威：** 已上架仍以 [`catalog/entries/*.yaml`](../catalog/entries/)（`kind: game`）＋ `npm run catalog:gen` 為準；本檔不同步自動更新。  
> **更新：** 上架／下架或 backlog 變動時改此檔；系列順序對齊 [`catalog/series.yaml`](../catalog/series.yaml) 的 `game`。  
> **選題：** 台灣味優先、非限制；backlog 依 [`game-assets/`](../game-assets/) 資源就緒度排序。
> **交付要求：** 遊戲只能以 HTML + CSS + JavaScript 形式交付，禁止任何 build 階段。
> **測試指引：** 開發過程可使用 Vitest 執行單元測試。
> **倉庫說明：** 每個遊戲都是獨立的 GitHub repo，本地路徑位於 `~/dev/sampot/<repo-name>`。

純玩入口：`https://go.samkuo.me/s/<id>` · 場型錄：`/sam/?kind=game`

---

## 已實作（50）

### 精緻可玩（8＋1 unlisted）
| id | 標題 | 一句話 |
| --- | --- | --- |
| `pg-chengyu` | 成語接龍 | 末字起頭接龍、挑戰計分與人機 |
| `pg-hopkick` | 跳房子踢毽子 | 跳房子節拍點格與踢毽子連擊 |
| `pg-microdungeon` | 迷你地城 | 5 樓逐層往下回合制隨機地城、戰鬥寶箱藥水 |
| `pg-rubik` | 魔術方塊 | 3×3 轉看／轉層／打亂／計時；本機最佳 |
| `pg-skyburst` | 蒼穹連射 | 垂直捲軸射擊、武裝升級、首領彈幕 |
| `pg-sokoban` | 推箱子 | 十二關、復原、滑動操作 |
| `pg-statue` | 一二三木頭人 | 移動／定格賽跑、人機裁判 |
| `pg-sandrts` | 沙丘戰線 | **unlisted**；障礙繞行＋空襲；指揮部被毀即出局 |
| `pg-gongzhu` | 抽豬 | 夜市抽卡遊戲、避豬計分 |

### 街機（15）

| id | 標題 | 一句話 |
| --- | --- | --- |
| `pg-airhockey` | 空氣曲棍球 | 球拍彈盤進門、先得七分 |
| `pg-breakout` | 打磚塊 | 擋板反彈清磚 |
| `pg-cityroam` | 巷弄迷走 | 街區撿金幣、躲警察、走到出口；30×20 格小地圖 |
| `pg-dancepad` | 節奏踏墊 | 四軌箭頭下落、踩拍連擊 |
| `pg-foodcatch` | 接食材 | 移動菜藍接食物、躲壞番茄；連擊加倍、20 秒升級 |
| `pg-frogcross` | 青蛙過街 | 過馬路、木筏、進巢 |
| `pg-leaptrail` | 躍階旅人 | 短關平台跳躍 |
| `pg-marblepit` | 玻璃彈珠坑 | 凹坑對撞、撥彈進洞 |
| `pg-mazeglow` | 迴廊拾光 | 迷宮撿光、反制追逐 |
| `pg-pixelhop` | 像素躍階 | 5 個關卡收金幣、踩黏液、避尖刺；mobile-first |
| `pg-starshot` | 星屑出擊 | 固定畫面太空射擊 |
| `pg-tankduel` | 戰車對決 | 俯視坦克人機／觀戰 |
| `pg-tetris` | 俄羅斯方塊 | 七種方塊、消行升級 |
| `pg-topduel` | 陀螺對戰 | 蓄力發射、轉速碰撞 |
| `pg-towerdef` | 迷你塔防 | 戰役星等、無盡模式 |

### 懷舊（9）

| id | 標題 | 一句話 |
| --- | --- | --- |
| `pg-banqi` | 暗棋對弈 | 翻子吃子、簡易人機 |
| `pg-freecell` | 新接龍 | 電腦課經典；八列牌、四暫存、四回收 |
| `pg-fruitcut` | 切水果 | 滑動切菜、炸彈、三命 |
| `pg-jungle` | 鬥獸棋 | 獸穴、陷阱、河界 |
| `pg-moletap` | 地洞敲敲 | 夜市節奏敲擊 |
| `pg-popshot` | 射氣球 | 夜市射靶破球 |
| `pg-ringtoss` | 套圈圈 | 夜市拋環套瓶 |
| `pg-wanzai` | 尪仔標 | 選牌對拍、翻牌收穫 |
| `pg-wingrace` | 翼途競飛 | 簡化飛行棋 |

### 機台（6）

| id | 標題 | 一句話 |
| --- | --- | --- |
| `pg-bingolite` | 賓果閃燈 | 五五賓果燈板 |
| `pg-clawgrab` | 夾娃娃 | 搖爪落下夾取 |
| `pg-coinpush` | 推幣機 | 落幣堆疊、推板擠落 |
| `pg-horselit` | 賽馬機 | 六軌燈光賽馬 |
| `pg-mali` | 小瑪莉 | 復古燈圈跑燈 |
| `pg-pinfall` | 釘雨落珠 | 發射撞釘入洞 |

### 桌遊（11）

| id | 標題 | 一句話 |
| --- | --- | --- |
| `pg-big2` | 大老二 | 四人出牌人機 |
| `pg-gomoku` | 五子棋 | 雙人／人機；Invite `gomoku.v1` |
| `pg-junqi` | 軍棋 | 陸戰棋暗棋對 AI |
| `pg-mahjong` | 台灣麻將 | 十六張簡化台、補花吃碰槓胡、人機 |
| `pg-match3` | 消消樂 | 三消、關卡目標 |
| `pg-redpick` | 撿紅點 | 對點數撿牌、四人人機 |
| `pg-shisan` | 十三支 | 十三張排前中後三墩、逐墩比牌 |
| `pg-sudoku` | 數獨 | 九宮填數、難度／筆記／提示 |
| `pg-tictactoe` | 井字遊戲 | 3×3、Minimax |
| `pg-twland` | 台灣路名地產 | 買地蓋房、機會命運 |
| `pg-xiangqi` | 象棋 | 楚河漢界、將軍困斃；人機／雙人／AI 對 AI |

---

## 打算實作（backlog）

上架後：把列移到「已實作」、補 `catalog/entries/<id>.yaml`，並跑 `catalog:gen`。

**選題方針：** **台灣味優先**（在地玩法、夜市／學校／電腦課回憶、華語圈常玩），但**不是限制**——`game-assets/` 已成套、能明顯增加豐富度的通用小品也可排程。  
**排程軸：** 下表依 **資源就緒度** 排序（高→低）；同檔內台灣味與通用並列，就緒度相同時台灣味靠前。資產路徑見 [`game-assets/ATTRIBUTION.md`](../game-assets/ATTRIBUTION.md)。

| 就緒度 | 含義 |
| --- | --- |
| **高** | 美術＋音效（＋可選 BGM）在庫內大致齊；主要寫規則／AI／UI |
| **中** | 主資產有一部分；台規 UI、關卡圖或少數元件需補 |
| **低** | 缺成套美術；須自繪或另找 pack 再開工 |

### Backlog（依資源就緒度）

| 就緒 | 台灣味 | 建議 id | 標題（暫） | 系列（暫） | 主要 `game-assets/` | 備註 |
| --- | --- | --- | --- | --- | --- | --- |
| 高 | ✓ | `pg-zhuagui` | 抓烏龜 | 桌遊 | `art/playing-cards-pack/` | 童玩抽對子；輕量 |
| 高 | ✓ | `pg-xinzang` | 心臟病 | 桌遊 | `art/playing-cards-pack/` 或 `art/puzzle-pack-1/` | 翻牌搶拍；符號版亦可 |
| 高 | ✓ | `pg-liarsdice` | 大話骰 | 桌遊 | `art/oga-simple-dice/`、`sfx/casino-audio/` | 熱座或簡易人機 |
| 高 | ✓ | `pg-lianlian` | 連連看 | 懷舊 | `art/puzzle-pack-1/`、`sfx/oga-512-8bit-sfx/`、`music/blippy-bits/` | 網咖世代；路徑相連消對 |
| 高 | ✓ | `pg-shanghaimj` | 麻將消消 | 懷舊 | `art/riichi-mahjong-tiles/`、`sfx/ui-audio/` | **新**；牌面堆疊消對（≠台規十六張對局） |
| 高 | · | `pg-reacttap` | 表情對決 | 精緻可玩 | `art/emotes-pack/`、`art/toon-characters/`、`sfx/voiceover-pack/` | **新**；出題反應／搶拍 |
| 中 | ✓ | `pg-mines` | 踩地雷 | 懷舊 | `sfx/oga-8-bit-sound-effect-pack/`、`art/ui-pack/` | 盤面多半程式繪；電腦課經典 |
| 中 | ✓ | `pg-solitaire` | 接龍 | 懷舊 | `art/playing-cards-pack/` | **新**；克朗代克；與新接龍並列無妨 |
| 中 | ✓ | `pg-memory` | 對對碰 | 桌遊 | `art/playing-cards-pack/` 或 `puzzle-pack-1/` | **新**；翻牌配對；可台灣圖騰自製卡背 |
| 中 | ✓ | `pg-guaguale` | 刮刮樂 | 機台 | `sfx/casino-audio/`、`art/ui-pack/` | 刮層／獎項圖需補；純娛樂勿真博弈 |
| 中 | ✓ | `pg-bikekan` | 大家來找碴 | 懷舊 | `sfx/ui-audio/`、`music/music-jingles/` | 關卡雙圖需自製或另找 |
| 中 | · | `pg-spacepulse` | 數位脈衝 | 街機 | `sfx/digital-audio/`、`sfx/sci-fi-sounds/`、`art/particle-pack/`、`music/super-16bit-sounds/` | **新**；節奏／閃避射擊皮；≠ `pg-starshot` 固定畫面波次 |
| 低 | ✓ | `pg-sisek` | 四色牌 | 桌遊 | （缺） | 台灣特有牌具；需自繪或另找 pack |
| 低 | ✓ | `pg-carrom` | 康樂球 | 街機 | （缺） | 學校康樂；物理＋桌面美術 |
| 低 | ✓ | `pg-diaoshui` | 釣水球 | 懷舊 | （缺） | 夜市紙鉤；≠射氣球／套圈 |
| 低 | ✓ | `pg-marblecir` | 彈珠圈 | 懷舊 | （缺） | 地上畫圈；≠ `pg-marblepit`／釘雨 |
| 低 | ✓ | `pg-diabolo` | 扯鈴 | 精緻可玩 | （缺） | 節奏／連招；物理從簡 |
| 低 | ✓ | `pg-stamppad` | 戳戳樂 | 懷舊 | （缺） | 夜市戳洞兌獎簡化 |
| 低 | ✓ | `pg-weiqi` | 圍棋 | 桌遊 | （缺成套） | 規則重；首刀 9×9＋數子；棋子／盤宜自繪 |

### 已涵蓋、不必再做一顆複製品

| 題材 | 既有 id |
| --- | --- |
| 尪仔標、路名地產、成語、暗棋、鬥獸棋、軍棋、象棋、大老二、撿紅點、台灣麻將、新接龍 | `pg-wanzai`、`pg-twland`、`pg-chengyu`、`pg-banqi`、`pg-jungle`、`pg-junqi`、`pg-xiangqi`、`pg-big2`、`pg-redpick`、`pg-mahjong`、`pg-freecell` |
| 夜市射氣球／套圈／打地鼠／切水果 | `pg-popshot`、`pg-ringtoss`、`pg-moletap`、`pg-fruitcut` |
| 小瑪莉、夾娃娃、推幣、釘珠、賽馬燈、賓果燈 | `pg-mali`、`pg-clawgrab`、`pg-coinpush`、`pg-pinfall`、`pg-horselit`、`pg-bingolite` |
| 跳房子／踢毽子、木頭人、飛行棋簡化、躍階平台 | `pg-hopkick`、`pg-statue`、`pg-wingrace`、`pg-leaptrail`、`pg-pixelhop` |
| 短關地城探索／戰鬥節奏 | `pg-microdungeon` |
| 小地圖收集／避開 | `pg-cityroam` |
| 固定畫面太空射擊 | `pg-starshot`（若做 `pg-spacepulse` 須機制明顯不同） |
| 固定點線塔防 | `pg-towerdef`（`pg-sandrts`＝自由佈局＋出擊 AI，勿做成複製品） |

### 候補想法（未排程 id）

- 官兵捉強盜／躲貓貓：輕量對戰，UI／AI 成本高
- 電子雞／育成：偏長期養成，可另開 `toy` 評估
- 熱血系列／跑跑卡丁：授權與體量不適合 SAM 小品
- 再找成套 pack 後可上移就緒度（尤其四色牌、康樂球）

---

## 維護備註

- **非 game：** `toy`／`tool`／`agent`／`media` 不列本檔（例：`pg-cellife` 生命格子＝玩具模擬）。
- **命名：** 勿與既有 id／玩法撞名（例：魔術方塊 `pg-rubik` ≠ 俄羅斯方塊 `pg-tetris`）。
- **持久狀態（分數／進度）：** 有分數／進度的新作，前端只能透過 **`fetch('/api/…')`** 調用，由 runtime 代為持久化；**禁止** UI 直寫裸 `localStorage` 當權威（僅可作輕量臨時緩存）。規則如下：
  - **KV（Durable；跨沙盒共享，適合單鍵數值如最高分／關卡）**：`GET /api/kv/{key}` 讀、`PUT /api/kv/{key}`（body＝字串值）寫、`DELETE /api/kv/{key}` 刪。範例（以 `pg-gongzhu` 為藍本）：
    - 讀：`const res = await fetch('/api/kv/highscore'); const value = await res.text();`
    - 寫：`await fetch('/api/kv/highscore', { method: 'PUT', body: String(score) });`
    - 對照組：`functions.js` 內側等同 `await env.KV.get(key, 'text')`／`await env.KV.put(key, value)`（場與 go 同形；見 [`playgrounds-host-api.md`](./playgrounds-host-api.md) 的 `GET/PUT/DELETE /api/kv` 與 `env.KV` binding）。
  - **DB（仿 D1 子集，適合多欄／查詢的複雜資料）**：走 `/api/db/…`（規格見 `playgrounds-host-api.md` 的 `env.DB`；遊戲類多數用不到，優先 KV）。
  - 需要跨欄位原子更新或更進階時，才考慮在 SAM 內自帶 `functions.js` 路由（仍以 `env.KV`／`env.DB` 為權威）。
- **美術／音效／音樂：** 本機庫 [`game-assets/`](../game-assets/)（二進位不進 git）可用於開發遊戲；定稿拷進各 `pg-*`，勿當 runtime 路徑。**署名硬規則：** 依授權要求署名；**不要求署名也要署名**（見該目錄 README／`ATTRIBUTION.md`）。
- **Backlog 排序：** 以資源就緒度為主軸；台灣味優先但非硬限制。入庫新 pack 後重排對應列的就緒度。
