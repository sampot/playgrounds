# Playgrounds 遊戲清單（`kind: game`）

> **用途：** 維護用快照——已上架＋打算做，避免每次掃 `catalog/entries/`。  
> **權威：** 已上架仍以 [`catalog/entries/*.yaml`](../catalog/entries/)（`kind: game`）＋ `npm run catalog:gen` 為準；本檔不同步自動更新。  
> **更新：** 上架／下架或 backlog 變動時改此檔；系列順序對齊 [`catalog/series.yaml`](../catalog/series.yaml) 的 `game`。  
> **選題：** 台灣味優先、非限制；backlog 依 [`game-assets/`](../game-assets/) 資源就緒度排序。
> **交付要求：** 遊戲只能以 HTML + CSS + JavaScript 形式交付，禁止任何 build 階段。
> **開發規則：** 遊戲 repo 不加入 `node_modules`、不安裝任何套件；需要工具（含測試）時一律以 `npx <pkg>` 臨時執行，不入 repo。
> **測試指引：** 單元測試統一以 `npx vitest run` 執行。
> **倉庫說明：** 每個遊戲都是獨立的 GitHub repo，本地路徑位於 `~/dev/sampot/<repo-name>`。
> **Coding agent：** 獨立開發（含 go 相容、`PG`／`PG.libs`、生命週期／輸入義務）以 [PG-GAME-AGENT-GUIDE.md](./PG-GAME-AGENT-GUIDE.md) 為唯一必讀；不必再翻其它宿主 SPEC。  
> **殼契約借鑑：** 主機式責任切分（平台薄服務＋釘版 middleware；遊戲寫玩法）見該指南 §1.1／§3.5，以及 [PG-UI-SDK-SPEC §1.4](./PG-UI-SDK-SPEC.md)、[PG-LIBS-SPEC §1.5](./PG-LIBS-SPEC.md)。  
> **新遊戲 starter：** GitHub template [`sampot/pg-game-scaffold`](https://github.com/sampot/pg-game-scaffold)；遊戲內只留 `AGENTS.md` 指針，**不要**複製指南全文到每個 `pg-*`。

純玩入口：`https://go.samkuo.me/s/<id>` · 場型錄：`/sam/?kind=game`

---

## 已實作（174）

### 街機（32＋25 unlisted）

| id | 標題 | 一句話 |
| --- | --- | --- |
| `pg-airhockey` | 空氣曲棍球 | 球拍彈盤進門、先得七分 |
| `pg-breakout` | 打磚塊 | 擋板反彈清磚 |
| `pg-carrom` | 康樂球 | **unlisted**；拖曳彈射打擊珠、碰撞推進對手棋子入口袋得點 |
| `pg-cityroam` | 巷弄迷走 | 街區撿金幣、躲警察、走到出口；30×20 格小地圖 |
| `pg-dancepad` | 節奏踏墊 | 四軌箭頭下落、踩拍連擊 |
| `pg-foodcatch` | 接食材 | **unlisted（已重寫・待上架）**；移動菜藍接食物、躲壞番茄；連擊加倍、20 秒升級 |
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
| `pg-reacttap` | 表情對決 | **unlisted（已重寫・待上架）**；看表情種類限時搶拍、連續答對 combo 加速 |
| `pg-skyburst` | 蒼穹連射 | 垂直捲軸射擊、武裝升級、首領彈幕 |
| `pg-sandrts` | 沙丘戰線 | **unlisted**；障礙繞行＋空襲；指揮部被毀即出局 |
| `pg-yakyu` | 野球生涯 | **unlisted**；虛構青棒校隊；打者揮棒或投手兩用、其餘快轉、短賽季決賽 |
| `pg-shrineclear` | 祠堂試煉 | 俯視清房、鑰匙開門、近戰短關 |
| `pg-abilitycave` | 能力門洞穴 | 3～5 能力解鎖過障、短圖回溯 |
| `pg-streetclash` | 騎樓格鬥誌 | **unlisted（重做中）**；多角色招式表、街機／對戰／修練 |
| `pg-nightbrawl` | 夜市清街 | **unlisted（已重寫・待上架）**；側視一路打、夾擊與投技、關卡頭目 |
| `pg-islandloop` | 環島賽 | **unlisted（已重寫・待上架）**；多賽道盃、車輛改裝、計時榜 |
| `pg-pitchduel` | 操場對決 | **unlisted（已重寫・待上架）**；五人制足球場地規則、人機對戰 |
| `pg-alleybowl` | 騎樓保齡 | **unlisted（已重寫・待上架）**；球道物理＋桿數／關卡挑戰 |
| `pg-roofglide` | 頂樓滑板 | **unlisted（已重寫・待上架）**；路線計分、技名連段 |
| `pg-straitwing` | 海峽空戰 | **unlisted（已重寫・待上架）**；俯視狗鬥任務鏈 |
| `pg-templecleave` | 廟口斬陣 | **unlisted（已重寫・待上架）**；自由移動、技能冷卻、裝備掉落關卡 |
| `pg-siegepush` | 攻城推波 | **unlisted（已重寫・待上架）**；組波次攻打 AI 基地 |
| `pg-tidefort` | 潮汐要塞 | **unlisted（重做中）**；能力回流、地圖填圖 |
| `pg-ghostmark` | 查哨夜行 | **unlisted（重做中）**；視線錐、警報等級、任務鏈 |
| `pg-blackward` | 廢校夜勤 | **unlisted（重做中）**；資源稀缺、聲響、有限視野 |
| `pg-backdoor` | 後門任務 | **unlisted（重做中）**；同一關多解（偷／騙／打／駭） |
| `pg-gatepair` | 對門實驗室 | **unlisted（已重寫・待上架）**；傳送門／動量關卡 |
| `pg-nightsnake` | 燈籠蛇 | **unlisted（已重寫・待上架）**；關卡＋無盡雙模式 |
| `pg-lighttrace` | 光跡對決 | **unlisted（已重寫・待上架）**；留跡包圍領地 |
| `pg-typestorm` | 字幕風暴 | **unlisted（已重寫・待上架）**；打字殺敵／搶修台詞 |
| `pg-stringbeat` | 琴弦節拍 | **unlisted（已重寫・待上架）**；軌道對應撥弦 |

### 懷舊（27＋16 unlisted）

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
| `pg-casefile` | 陳年卷宗 | **unlisted（已重寫・待上架）**；場景熱點、道具組合、推理結案 |
| `pg-township` | 鎮誌 | **unlisted（重做中）**；多日曆、好感、多結局 |
| `pg-campusbond` | 社團心事 | **unlisted（重做中）**；行程配置＋關係線 |
| `pg-seacast` | 港邊釣夢 | **unlisted（重做中）**；魚圖鑑、漁場天氣、裝備 |
| `pg-lockroom` | 密室一小時 | **unlisted（已重寫・待上架）**；多房間線索鏈、一局完整解謎 |
| `pg-atticfind` | 頂樓尋物 | **unlisted（已重寫・待上架）**；場景搜尋＋故事章節 |
| `pg-festcrowd` | 遶境人潮 | **unlisted（已重寫・待上架）**；指定動作疏導／救出走位 |
| `pg-worddawn` | 晨間一字 | **unlisted（已重寫・待上架）**；每日＋無盡 Wordle 系文字謎 |

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

### 桌遊（22＋10 unlisted）

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
| `pg-cardbazaar` | 卡市爭鋒 | **unlisted（重做中）**；構築＋排位；≠傳統牌桌 |
| `pg-whodunit` | 誰是兇手 | **unlisted（已重寫・待上架）**；線索卡、指認；多人／人機 |
| `pg-huntshade` | 追匿 | **unlisted（重做中）**；1 追捕 vs 多逃亡；Invite |
| `pg-quizleague` | 搶答聯賽 | **unlisted（重做中）**；賽季題庫＋段位 |

### 策略（24 unlisted）

規格見 [`PG-SLG-GAMES-PLAN.md`](./PG-SLG-GAMES-PLAN.md)。類型覆蓋中長篇錨點亦列於此。

| id | 標題 | 一句話 |
| --- | --- | --- |
| `pg-nightstall` | 夜市攤位爭霸 | **unlisted**；十二夜看天氣進貨、定價、宣傳，與兩名 AI 搶客比淨資產 |
| `pg-junzheng` | 三國一郡 | **unlisted**；三政令經營糧兵城防，攻城或守滿十二回合 |
| `pg-alleyclaim` | 巷弄地盤 | **unlisted**；同時下令佔街廓、搶地標、連線得分 |
| `pg-pondfarm` | 塭仔養魚 | **unlisted**；一造管理密度、水質與颱風風險，抓時機收成 |
| `pg-pilgrim` | 廟會遶境路線 | **unlisted**；時限內規劃必訪宮壇與回廟路線，兼顧香火與擾民 |
| `pg-lixuan` | 里長選舉 | **unlisted**；四週配置拜訪、政見與志工，依議題爭取各鄰支持 |
| `pg-railslot` | 高鐵時刻表戰 | **unlisted**；排發車、停靠與待避，化解延誤並守住準點率 |
| `pg-pierbox` | 港口貨櫃 | **unlisted**；管堆場、橋機與船期，以最少翻櫃完成合約 |
| `pg-islesupply` | 島鏈補給 | **unlisted**；排船期與庫存，迎風避颱維持七島十回合供應 |
| `pg-clubbudg` | 校園社團爭預算 | **unlisted**；八週分配幹部工時、爭場地、辦活動拚期末評鑑 |
| `pg-bannerwar` | 旌旗戰棋 | **unlisted（已重寫・待上架）**；戰役章、兵種相剋、陣亡後果 |
| `pg-islandage` | 島鏈紀元 | **unlisted（重做中）**；探索／擴張／開發／征服 |
| `pg-autolegion` | 自走軍團 | **unlisted（重做中）**；羈絆、經濟、站位、賽季排位 |
| `pg-ascenddeck` | 牌途登峰 | **unlisted（已重寫・待上架）**；路線地圖、遺物、可重複通關 |
| `pg-deepcatacomb` | 深窟探險 | **unlisted（已重寫・待上架）**；程序地城、飢餓／光照、死即重來 |
| `pg-villagewrath` | 里民與天 | **unlisted（重做中）**；佈置災異與恩賜、引導聚落 |
| `pg-outpost` | 離島前哨 | **unlisted（重做中）**；殖民者需求、心情、生產鏈 |
| `pg-roundtable` | 圓桌協議 | **unlisted（重做中）**；多勢力同時出價與條約 |
| `pg-partyquest` | 結社遠征錄 | **unlisted（重做中）**；世界地圖、職業裝備、主線多章 |
| `pg-blockcity` | 街區建國 | **unlisted（已重寫・待上架）**；分區、交通、民怨長期平衡 |
| `pg-porttycoon` | 港口大亨 | **unlisted（重做中）**；航線、倉儲、合約與對手 AI |
| `pg-empirekitchen` | 總舖師傳奇 | **unlisted（重做中）**；菜單研發、員工、展店 |
| `pg-nightmarket` | 夜盤 | **unlisted（重做中）**；多日價格、資訊差、對手 AI |
| `pg-templeidle` | 香火放置 | **unlisted（重做中）**；香火累積、建築升級、離線收益 |

---

## 打算實作（backlog）

類型覆蓋 44 款曾全數為 scaffold（`getLegalActions` 按鈕空殼），已改回 `status: unlisted`。進度：**23** 款標 **unlisted（已重寫・待上架）**（仍未改 `listed`，待人工驗收）；其餘 **21** 款仍標 **unlisted（重做中）**。另有街機 `pg-foodcatch`／`pg-reacttap` 亦已重寫、同標待上架。逐款通過下方驗收標準後才重新上架。

驗收標準（每款都要滿足才可改 `listed`）：

1. **操作是遊戲本身**——棋盤點格／拖曳／即時控制／輸入，而非「動作字串按鈕列」。
2. **狀態空間有意義**——盤面、單位、牌庫、地圖等結構化狀態，不是幾個純量計數器。
3. **對手／挑戰有決策**——AI 或關卡設計會因玩家選擇改變，不是固定遞增數值。
4. **輸贏路徑清楚**——可勝可敗，且來自玩家操作。
5. **測試驗玩法規則**——不是只斷言欄位有變。
6. **美術／音效實際用在畫面上**，且署名齊備。

### 開源 Phaser 移植候補（素材＋玩法；不搬程式）

> itch 篩選：Asset license **CC0**（或來源 pack 同等清楚）；程式授權可忽略（一律在 scaffold 上重寫＋`PG.libs.load("phaser")`）。定稿前仍核 zip 內逐檔授權；進 `pg-*` 須 `ATTRIBUTION.md`。勿與已上架玩法硬撞名。

#### 新 id

| 暫定 id | 標題 | 系列 | 靈感（itch） | 一句話 |
| --- | --- | --- | --- | --- |
| `pg-holdtrade` | 限艙商運 | 街機 | [Shoot'n Trade](https://patbgames.itch.io/ld54-shoot-n-trade)（CC0） | 艙位配置砲／盾／貨、遠航販賣擴艙；≠純彈幕升級 |
| `pg-dogtide` | 狗海蓋樓 | 策略 | [House of Dog](https://pizzasgood.itch.io/house-of-dog)（CC0） | 漲潮狗海 vs 蓋樓；沙發／磚／礦井生產鏈 |
| `pg-bunnyisle` | 兔島神遊 | 策略 | [Bunny Island](https://melchizedek6809.itch.io/bunny-island)（CC0） | 挖填地形養兔、控過密；≠`pg-tinyfarm` 種田 |
| `pg-mutantfeed` | 異株催活 | 街機 | [Feed Me!](https://hawkhelm.itch.io/feed-me)（CC0） | 三資源餵養異株、摘果計分；≠`pg-foodcatch` 接物 |

#### 餵既有（不新開同型 id）

| 靈感（itch） | 資產授權 | 餵向 | 用途 |
| --- | --- | --- | --- |
| [One Class Shooter](https://euophrys.itch.io/one-class-shooter) | CC0 | `pg-skyburst`／`pg-starshot`／`pg-straitwing`（及同類重做） | **已餵** `pg-skyburst`／`pg-starshot`（圖集／SFX／軟追蹤／護盾掉落）；shmup 皮、敵波節奏、觸控拖曳開火 |
| [Zero to Hero](https://rafaeldelboni.itch.io/zero-to-hero) | CC0（含 Kenney 1-bit 等已列來源） | `pg-abilitycave`（及平台能力關） | 能力習得關卡密度／1-bit 皮參考 |

## 維護備註

- **宿主函式庫（可選）：** 需 2D／物理／音訊等時經殼內 `PG.libs.load(id)` **懶載**（預設完整 2D＝Phaser 4）；**禁止** precache、遊戲 repo 套件／build、外連 CDN、或授權有疑慮的第三方。規格：[PG-LIBS-SPEC.md](./PG-LIBS-SPEC.md)；agent 開發手冊：[PG-GAME-AGENT-GUIDE.md](./PG-GAME-AGENT-GUIDE.md)。桌遊／牌類等以 vanilla 為預設，勿無故 load。
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
- **可選卡面封面：** 遊戲 repo 根目錄可放 `thumbnail.png`（真實遊玩畫面；建議 4:3、≤~50KB）。宿主同步為 go 靜態 `/covers/<id>.png` 後，型錄產物可帶 `cover`，推薦卡等替換系列 icon。**≠**離線就緒；**≠**每小品 `og:image`。見 [PG-GAME-AGENT-GUIDE §2.4](./PG-GAME-AGENT-GUIDE.md)、[PG-GO-CLIENT-PLAN §5.8](./PG-GO-CLIENT-PLAN.md)。
- **Backlog 排序：** 以資源就緒度為主軸；台灣味優先但非硬限制。入庫新 pack 後重排對應列的就緒度。
