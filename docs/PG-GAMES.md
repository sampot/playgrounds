# Playgrounds 遊戲清單（`kind: game`）

> **用途：** 維護用快照——已上架＋打算做，避免每次掃 `catalog/entries/`。  
> **權威：** 已上架仍以 [`catalog/entries/*.yaml`](../catalog/entries/)（`kind: game`）＋ `npm run catalog:gen` 為準；本檔不同步自動更新。  
> **更新：** 上架／下架或 backlog 變動時改此檔；系列順序對齊 [`catalog/series.yaml`](../catalog/series.yaml) 的 `game`。  
> **選題：** 台灣味優先、非限制；backlog 依 [`game-assets/`](../game-assets/) 資源就緒度排序。
> **交付要求：** 遊戲只能以 HTML + CSS + JavaScript 形式交付，禁止任何 build 階段。
> **開發規則：** 遊戲 repo 不加入 `node_modules`、不安裝任何套件；需要工具（含測試）時一律以 `npx <pkg>` 臨時執行，不入 repo。
> **測試指引：** 單元測試統一以 `npx vitest run` 執行。
> **倉庫說明：** 每個遊戲都是獨立的 GitHub repo，本地路徑位於 `~/dev/sampot/<repo-name>`。

純玩入口：`https://go.samkuo.me/s/<id>` · 場型錄：`/sam/?kind=game`

---

## 已實作（115）

### 街機（32＋7 unlisted）

| id | 標題 | 一句話 |
| --- | --- | --- |
| `pg-airhockey` | 空氣曲棍球 | 球拍彈盤進門、先得七分 |
| `pg-breakout` | 打磚塊 | 擋板反彈清磚 |
| `pg-carrom` | 康樂球 | **unlisted**；拖曳彈射打擊珠、碰撞推進對手棋子入口袋得點 |
| `pg-cityroam` | 巷弄迷走 | 街區撿金幣、躲警察、走到出口；30×20 格小地圖 |
| `pg-dancepad` | 節奏踏墊 | 四軌箭頭下落、踩拍連擊 |
| `pg-foodcatch` | 接食材 | **unlisted**；移動菜藍接食物、躲壞番茄；連擊加倍、20 秒升級 |
| `pg-frogcross` | 青蛙過街 | 過馬路、木筏、進巢 |
| `pg-leaptrail` | 躍階旅人 | 短關平台跳躍 |
| `pg-marblepit` | 玻璃彈珠坑 | 凹坑對撞、撥彈進洞 |
| `pg-mazeglow` | 迴廊拾光 | 迷宮撿光、反制追逐 |
| `pg-pixelhop` | 像素躍階 | 5 個關卡收金幣、踩黏液、避尖刺；mobile-first |
| `pg-spacepulse` | 數位脈衝 | **unlisted**；節拍驅動躲閃射擊、敵波在拍點推進；≠固定波次 |
| `pg-starshot` | 星屑出擊 | 固定畫面太空射擊 |
| `pg-tankduel` | 戰車對決 | 俯視坦克人機／觀戰 |
| `pg-tetris` | 俄羅斯方塊 | 七種方塊、消行升級 |
| `pg-topduel` | 陀螺對戰 | 蓄力發射、轉速碰撞 |
| `pg-towerdef` | 迷你塔防 | 戰役星等、無盡模式 |
| `pg-aimbeat` | 準星節拍 | 拍點出靶、換準星造型連擊 |
| `pg-parkexam` | 倒車入庫 | 俯視平行停車／S 彎考照小品 |
| `pg-blackout` | 停電尋物 | 手電筒視野找鑰匙／出口 |
| `pg-puffinhale` | 吸吐清波 | 吸入敵人取得屬性再吐出清波 |
| `pg-inkskirmish` | 油漆巷戰 | 限時塗地佔分對 AI |
| `pg-tidewave` | 潮汐倖存 | 走位躲彈、自動射擊、局內三選一升級 |
| `pg-voidnom` | 黑洞吞噬 | 俯視限時吞噬、體積越大可吃越大 |
| `pg-tugwar` | 拔河對決 | 時機點按比合力；人機／1v1 |
| `pg-bowcamp` | 森林射靶營 | 弓箭風阻距離瞄準 |
| `pg-deliver` | 外送路線 | 限時送達、躲路錐 |
| `pg-rooftumble` | 屋頂擊飛 | 同機雙人平台碰撞擊飛出局 |
| `pg-gatecrowd` | 過門加人 | 直線跑過加減門、終點比人數 |
| `pg-flutter` | 振翅穿林 | 單鍵振翅穿越高低障礙、連續過門計分 |
| `pg-diabolo` | 扯鈴 | **unlisted**；節拍連招（抖鈴／拋鈴／接鈴）累加 combo、難度遞增 |
| `pg-hopkick` | 跳房子踢毽子 | 跳房子節拍點格與踢毽子連擊 |
| `pg-microdungeon` | 迷你地城 | 三層短局隨機迷宮、找符石開出口、碰撞戰鬥與成長 |
| `pg-reacttap` | 表情對決 | **unlisted**；看表情種類限時搶拍、連續答對 combo 加速 |
| `pg-skyburst` | 蒼穹連射 | 垂直捲軸射擊、武裝升級、首領彈幕 |
| `pg-sandrts` | 沙丘戰線 | **unlisted**；障礙繞行＋空襲；指揮部被毀即出局 |
| `pg-yakyu` | 野球生涯 | **unlisted**；虛構青棒校隊；打者揮棒或投手兩用、其餘快轉、短賽季決賽 |
| `pg-shrineclear` | 祠堂試煉 | 俯視清房、鑰匙開門、近戰短關 |
| `pg-abilitycave` | 能力門洞穴 | 3～5 能力解鎖過障、短圖回溯 |

### 懷舊（27＋8 unlisted）

| id | 標題 | 一句話 |
| --- | --- | --- |
| `pg-banqi` | 暗棋對弈 | 翻子吃子、簡易人機 |
| `pg-bikekan` | 大家來找碴 | **unlisted**；程式繪製雙場景、點出所有差異、點錯扣時 |
| `pg-candythrow` | 糖果投掷 | 瞄準投擲糖果進桶、連擊積分 |
| `pg-diaoshui` | 釣水球 | **unlisted**；夜市紙鉤釣水球、紙圈套頸撈起、限時過關 |
| `pg-freecell` | 新接龍 | 電腦課經典；八列牌、四暫存、四回收 |
| `pg-fruitcut` | 切水果 | 滑動切菜、炸彈、三命 |
| `pg-jungle` | 鬥獸棋 | 獸穴、陷阱、河界 |
| `pg-lianlian` | 連連看 | **unlisted**；兩張相同牌以 ≤2 轉角路徑相連即消、提示／洗牌、四難度 |
| `pg-marblecir` | 彈珠圈 | **unlisted**；地上畫圈、把圈內目標珠彈出圈外得點；≠凹坑對撞 |
| `pg-mines` | 踩地雷 | **unlisted**；多難度盤面、開格 flood fill、旗標、計時 |
| `pg-moletap` | 地洞敲敲 | 夜市節奏敲擊 |
| `pg-popshot` | 射氣球 | 夜市射靶破球 |
| `pg-ringtoss` | 套圈圈 | 夜市拋環套瓶 |
| `pg-rivercross` | 小馬過河 | 跳格子避移動障礙、節奏過河闖關 |
| `pg-shanghaimj` | 麻將消消 | **unlisted**；疊層麻將配對消除、自由牌判定、提示／洗牌 |
| `pg-solitaire` | 接龍 | **unlisted**；克朗代克 7 列翻牌、A→K 建堆、計時步數 |
| `pg-stamppad` | 戳戳樂 | **unlisted**；付代幣戳開格子看獎品、收集過關 |
| `pg-wanzai` | 尪仔標 | 選牌對拍、翻牌收穫 |
| `pg-wingrace` | 翼途競飛 | 簡化飛行棋 |
| `pg-flagquiz` | 國旗快答 | 限時認旗／配對計分（含 TW 等） |
| `pg-tensum` | 湊十消數 | 框選相鄰數字加總＝10 消除 |
| `pg-tubesort` | 試管分色 | 倒色液／色球至同色滿管過關 |
| `pg-blockfit` | 方塊填格 | 放置多聯骨牌清行／列；≠下落俄羅斯 |
| `pg-merge2048` | 數字合併 | 滑格同數合併挑戰 2048；本機最高分 |
| `pg-screwout` | 螺絲拆解 | 依序拆釘解層級遮擋過關 |
| `pg-cubematch` | 方塊寵物配 | 短局翻牌或圖鑑收集 |
| `pg-fruitmerge` | 合成大果 | 落下同階水果合併升級；杯滿出局 |
| `pg-carjam` | 出車解謎 | 滑車讓目標車出路 |
| `pg-rubik` | 魔術方塊 | 3×3 轉看／轉層／打亂／計時；本機最佳 |
| `pg-sokoban` | 推箱子 | 十二關、復原、滑動操作 |
| `pg-statue` | 一二三木頭人 | 移動／定格賽跑、人機裁判 |
| `pg-gongzhu` | 抽豬 | 夜市抽卡遊戲、避豬計分 |
| `pg-tinyfarm` | 一季小農園 | 短局翻土澆水收成賣箱；非長期養成 |
| `pg-caveline` | 洞穴一筆劃 | 廊道拼路／限步探路 |
| `pg-coopswitch` | 雙人機關 | 同機兩角色踩開關推箱過關；預留 Invite |

### 機台（17＋1 unlisted）

| id | 標題 | 一句話 |
| --- | --- | --- |
| `pg-bingolite` | 賓果閃燈 | 五五賓果燈板 |
| `pg-clawgrab` | 夾娃娃 | 搖爪落下夾取 |
| `pg-coinpush` | 推幣機 | 落幣堆疊、推板擠落得分；致敬推幣機玩法類型。（已上架） |
| `pg-fishcab` | 釣魚機 | 竿線咬餌收線；機台魚群節奏 |
| `pg-goalshot` | 射門機 | 定點射門進框、限時連射 |
| `pg-guaguale` | 刮刮樂 | **unlisted**；刮開洞看中獎開關、集齊符號中獎；純娛樂非博弈 |
| `pg-hoopshot` | 投籃機 | 限時投籃進框、連投計分換票感 |
| `pg-horselit` | 賽馬機 | 六軌燈光賽馬 |
| `pg-lightgun` | 光槍射擊 | 鼠標瞄準射击、即時反擊；街機光槍 Web 版 |
| `pg-mali` | 小瑪莉 | 復古燈圈跑燈 |
| `pg-pinball` | 彈珠台 | 扳機發射鋼珠、彈跳得分 |
| `pg-pinfall` | 釘雨落珠 | 發射、撞釘、入洞得分；致敬小鋼珠玩法類型 |
| `pg-prizewheel` | 轉轉樂 | 轉盤停格兌獎；純娛樂非博弈 |
| `pg-punchpad` | 測力拳 | 出拳打袋看力道分數 |
| `pg-skeeball` | 滾球台 | 滾球上坡進分環；致敬 Skee-Ball |
| `pg-stacker` | 疊疊機 | 停燈對位堆方塊換獎；時機節奏 |
| `pg-strongman` | 力氣錘 | 蓄力揮錘打鈴／分數帶 |
| `pg-ticketgrab` | 彩票機 | 投幣抓取彩球、組合獲獎 |

### 桌遊（22＋6 unlisted）

| id | 標題 | 一句話 |
| --- | --- | --- |
| `pg-big2` | 大老二 | 四人出牌人機 |
| `pg-blackjack` | 21點 | 對莊家要牌／停牌／加倍、籌碼下注；S17、天然 3:2 |
| `pg-gomoku` | 五子棋 | 雙人／人機；Invite `gomoku.v1` |
| `pg-junqi` | 軍棋 | 陸戰棋暗棋對 AI |
| `pg-liarsdice` | 大話骰 | **unlisted**；喊「N 個 X」可加喊或抓、1 點萬能、拔骰出局 |
| `pg-mahjong` | 台灣麻將 | 十六張簡化台、補花吃碰槓胡、人機 |
| `pg-match3` | 消消樂 | 三消、關卡目標 |
| `pg-memory` | 記憶翻牌 | **unlisted**；翻牌配對、pair 消除、關卡遞增 |
| `pg-redpick` | 撿紅點 | 對點數撿牌、四人人機 |
| `pg-shisan` | 十三支 | 十三張排前中後三墩、逐墩比牌 |
| `pg-sisek` | 四色牌 | **unlisted**；112 張台味字牌、配對成組得分、人機 |
| `pg-sudoku` | 數獨 | 九宮填數、難度／筆記／提示 |
| `pg-tictactoe` | 井字遊戲 | 3×3、Minimax |
| `pg-twland` | 台灣路名地產 | 買地蓋房、機會命運 |
| `pg-weiqi` | 圍棋 9×9 | **unlisted**；小盤圍棋、氣／提子／打劫、地盤計分、對 AI |
| `pg-xiangqi` | 象棋 | 楚河漢界、將軍困斃；人機／雙人／AI 對 AI |
| `pg-xinzang` | 心臟病 | **unlisted**；翻牌見心臟病號碼秒拍、最慢收整疊、對決 AI |
| `pg-zhuagui` | 抓烏龜 | **unlisted**；丟對子後輪流盲抽、剩烏龜牌者出局、四人童玩 |
| `pg-domino` | 骨牌接龍 | 雙六骨牌接點出牌、人機 |
| `pg-seabattle` | 海戰佈艦 | 佈艦後輪流點射；人機先、預留 Invite |
| `pg-fourline` | 四子棋 | 重力落子連四；人機／雙人，預留 Invite |
| `pg-sealedbid` | 密封拍賣 | 同時密封出價、揭示比價；3～4 人／人機 |
| `pg-buzzerquiz` | 搶答題庫 | 同題搶拍計分；單人練習／多人房 |
| `pg-hotpotato` | 傳炸彈 | 限時傳遞熱土豆、爆者出局；3～4 人／人機 |
| `pg-undercover` | 影武者詞殺 | 多數同詞、少數異詞、輪流描述投票 |
| `pg-sketchtell` | 你畫我猜 | 一輪一畫家、其餘猜詞；預留 Invite |
| `pg-chengyu` | 成語接龍 | 末字起頭接龍、挑戰計分與人機；對戰超時出局，預留 `chengyu.v1` |
| `pg-holdem` | 德州撲克 | 六人桌 NLHE 對 AI；Sit & Go 盲注遞增、虛擬籌碼；純娛樂非博弈 |

---

## 打算實作（backlog）

短局 SLG 遊戲群規格見 [`PG-SLG-GAMES-PLAN.md`](./PG-SLG-GAMES-PLAN.md)。批次內仍逐款完成；第一款通過上架驗收後才開始下一款。

| 批次 | id | 標題 | 一句話 | 資源就緒度 |
| --- | --- | --- | --- | --- |
| A1 | `pg-nightstall` | 夜市攤位爭霸 | 十二夜進貨、定價、宣傳，與 AI 搶客比淨資產 | 中 |
| A2 | `pg-junzheng` | 三國一郡 | 三政令經營糧兵城防，攻城或守滿十二回合 | 高 |
| A3 | `pg-alleyclaim` | 巷弄地盤 | 同時下令佔街廓、搶地標、連線得分 | 高 |
| B1 | `pg-pondfarm` | 塭仔養魚 | 一造管理密度、水質與颱風風險，抓時機收成 | 中 |
| B2 | `pg-pilgrim` | 廟會遶境路線 | 時限內規劃必訪宮壇與回廟路線，兼顧香火與擾民 | 中低 |
| B3 | `pg-lixuan` | 里長選舉 | 四週配置拜訪、政見與志工，依議題爭取各鄰支持 | 中 |
| C1 | `pg-railslot` | 高鐵時刻表戰 | 排發車、停靠與待避，化解延誤並守住準點率 | 中低 |
| C2 | `pg-pierbox` | 港口貨櫃 | 管堆場、橋機與船期，以最少翻櫃完成合約 | 中低 |
| C3 | `pg-islesupply` | 島鏈補給 | 排船期與庫存，迎風避颱維持七島十回合供應 | 中 |
| D1 | `pg-clubbudg` | 校園社團爭預算 | 八週分配幹部工時、爭場地、辦活動拚期末評鑑 | 中 |

首款進型錄時新增遊戲系列 **`策略`**。**GitHub remote／`gh repo create` 尚未建立**——上架 go／`?open=` 前需逐款建立並推送對應 `sampot/pg-*` public repo。

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
