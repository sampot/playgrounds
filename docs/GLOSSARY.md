# 用語表（Glossary）

撰寫或改寫本站文章時，**優先對齊本檔**。若與口語習慣衝突，以本檔「本站用詞」為準；專有名詞可保留英文，或以「本站用詞（English）」並列（見 `AGENTS.md` 寫作語氣）。

- 語系：**繁體中文（台灣用詞）**，勿混簡體。
- 適用：新文、大幅改寫的舊文；不必為對齊 glossary 而去改歷史文章的穩定 permalink／標題，除非使用者要求。
- 新增詞條：發現反覆出現、或作者明確指定時，再補進本表。

## 對照表

| English / 常見寫法 | 本站用詞 | 備註 |
| --- | --- | --- |
| repository / repo | 儲存庫 | 勿寫「倉庫」；勿用簡體「存储」或混用「存儲」。Git 程式碼庫語境。 |
| source (code) repository | 源始碼儲存庫 | 與站內舊文一致（「源始碼」非「原始碼」為本站既有習慣時從舊）。新建文可寫「原始碼儲存庫」若作者改口再統一。 |
| (container) image repository | 容器映像儲存庫 | |
| package / apt repository | 套件庫 | 系統套件來源語境，不是 Git。 |
| artifact repository | 套件庫／產物儲存庫 | 視語境；Maven／Gradle 倉儲可寫「套件倉儲」。 |
| pull request | Pull request | 可簡稱 **PR**；勿硬譯「拉取請求」。 |
| commit（動詞／名詞） | 提交 | 指令名、log 訊息可保留 `commit`。 |
| push | 推送 | 可與英文並列；指令保留 `push`。 |
| branch | 分支 | |
| merge | 合併 | |
| deploy / deployment | 部署 | |
| release | 發佈／發行 | 產品對外「發佈」；軟體版本「發行」視語境。 |
| pipeline | 管線 | 如「CI／CD 管線」。 |
| workflow（GitHub Actions） | workflow | 可保留英文；說明時可寫「工作流程」。 |
| runner | runner | 可保留英文；首次可寫「runner（執行器）」。 |
| self-hosted runner | 自架 runner | |
| GitHub-hosted runner | GitHub-hosted runner | 可寫「GitHub 託管的 runner」。 |
| Actions minutes | （Actions）分鐘數 | |
| wall-clock (time) | 真實時間 | 相對 CPU time／排隊等待；勿寫「牆鐘時間」。 |
| continuous integration / CI | 持續整合（CI） | 後文可簡稱 CI。 |
| continuous delivery／deployment / CD | 持續交付／持續部署（CD） | 依語意選「交付」或「部署」。 |
| end-to-end / E2E | E2E | 首次可並列「端到端（E2E）」。 |
| unit test | 單元測試 | |
| integration test | 整合測試 | |
| lint | lint | 可保留英文。 |
| monorepo | monorepo | 需要時並列「單一儲存庫、多套件／多應用」。 |
| draft（文章） | 草稿 | frontmatter `draft: true`。 |
| solo developer / indie | 一人開發者／solo | 「indie」可寫「獨立開發」。 |
| feedback | 回饋 | |
| issue（GitHub） | Issue | 保留英文專名。 |
| local-first | local-first | 可並列「本機優先」。 |
| zero-knowledge | 零知識 | 可並列 zero-knowledge；安全宣稱以 `~/dev/nt2` 文件為準。 |
| vault（NT² 產品） | NT² Vault／保管箱 | 產品全名優先 **NT² Vault**；中文通稱可用「保管箱」或「個人數位資產保管箱」，勿寫成產品教學口吻堆砌賣點。 |
| Visual-QA | Visual-QA | 本機「截圖 → 視覺解讀 → 模擬滑鼠／鍵盤」套件；首次可並列說明，後文可直接用英文專名。 |
| Browser-QA | Browser-QA | 已退役的 Playwright＋本機 LLM agent 控制台；歷史敘事可提，勿寫成現行做法。 |
| playbook（Visual-QA） | playbook | 可保留英文；說明時可寫「YAML 劇本／步驟稿」。 |
| vision language model / VLM | 視覺語言模型（VLM） | 後文可簡稱 VLM；本站語境多指本機 loopback，非雲端視覺 API。 |
| template match（OpenCV） | 模板比對 | 可用「OpenCV 模板比對」並列。 |
| actuator | 致動器 | 勿寫「效應器」；Visual-QA 語境指模擬滑鼠／鍵盤這類輸出端。 |
| deterministic | 確定性 | 如「確定性測試」「確定性劇本」；勿整句留英文 deterministic。 |
| digital avatar / digital twin（本站語境） | 數位化身／數位分身 | 指部落格等可公開重播的自我呈現，非產品功能名；可與「影分身」典故並用，勿寫成永生／不死行銷口吻。 |
| Playgrounds（場網：`*.samkuo.me`） | 遊樂場 | 站內導覽／UI 用「遊樂場」；程式識別仍為 `playgrounds`。**預設場**＝[`https://play.samkuo.me/`](https://play.samkuo.me/)；任意 `https://<name>.samkuo.me/`＝同程式、異 origin（DEC-042）。部落格 `https://samkuo.me/playgrounds/`＝**凍結舊場**（提醒匯出；**不再**跟場網同步更新；資料綁 origin）。非站上 `/tools/` 登錄表。主軸：瀏覽器內開發／實驗**單頁小程式（SAM）**；非部署環境。**有防護能力的實驗場**：隔離在瀏覽器 origin／OPFS——見 DEC-040。開源宿主／權威碼 [`sampot/playgrounds`](https://github.com/sampot/playgrounds)；部署＝Cloudflare Workers（靜態 ASSETS）。建置＝**SvelteKit** 靜態 PWA（DEC-048）。**對外敘事勿**產品／品牌／行銷腔（DEC-004）。 |
| 場網／場（Playgrounds） | 場／場網 | `*.samkuo.me` 上每個一級子域是一個**場**（獨立 origin）；場網＝此 wildcard 部署面。預設場名 **`play`**。保留名（非一般場）：`www`／`blog`／`api`／`docs`／`dash`／**`go`** 等（`PLAYGROUNDS_FIELD_RESERVED_SUBDOMAINS`）。見 DEC-042／050。 |
| Playgrounds 文件站 | 文件／`docs.samkuo.me` | 「我是山姆鍋」底下遊樂場的工程與用法文件站 [`https://docs.samkuo.me/`](https://docs.samkuo.me/)（Astro Starlight；獨立 Worker；站標含山姆鍋 Logo）。**不是**場、不跑遊樂場殼；Playgrounds **不是**品牌名。範例場 URL 仍用 `play.samkuo.me`。見 DEC-043、[PG-DOCS-PLAN.md](./PG-DOCS-PLAN.md)。 |
| SAM 小品型錄 | 小品／`/sam/` | 開源 SAM 範本清單（遊戲、工具、代理…）；權威 URL＝場網 [`https://play.samkuo.me/sam/`](https://play.samkuo.me/sam/)（任意場＝同 origin 的 `/sam/`；與場殼同 Worker／PWA）。**一鍵開**＝同場 open 管線（`/?open=<source>`；編輯面）。**分享**＝純玩 **`https://go.samkuo.me/s/<id>`**（DEC-050）。資料權威＝[`catalog/entries/`](../catalog/entries/)（YAML；建置產 `samCatalog.generated.ts`＋`/catalog/v1.json`；go 內嵌同產線）。人機 UX＝搜尋／密度／精選貨架（[PG-CATALOG-UX-PLAN.md](./PG-CATALOG-UX-PLAN.md)）；**不**綁部落格散文 layout。見 DEC-041／046／048／050、[PG-CATALOG-PLAN.md](./PG-CATALOG-PLAN.md)、[PG-GO-CLIENT-PLAN.md](./PG-GO-CLIENT-PLAN.md)。 |
| Playgrounds chrome／app shell（舊稱殼頁） | 遊樂場（必要時：**遊樂場介面**） | 場網上根路徑 `/`（過渡舊場仍為 `/playgrounds/`）的外框 UI（工具列、編輯器、側欄、密鑰庫、fleet…），相對沙盒內畫布／總管 iframe。**正式對外預設寫「遊樂場」**；需對照畫布／注入／dialog 時寫 **「遊樂場介面」**。舊稱「殼頁」——**勿**對外再用「殼」。程式識別可續用 `shell*`。 |
| sandbox（Playgrounds 單位；舊稱 project／專案） | 沙盒 | 遊樂場裡用來管理 **SAM 實例**的容器（OPFS 一份樹＋執行期狀態＋畫布；一沙盒一實例；程式識別為 **`sandboxId`**，舊稱 `projectId`）。**不是**對桌面的第二層安全沙盒敘事——防護邊界在遊樂場（DEC-040）。僅能透過允許的方式（HOST／DELEGATE／SESSION 等）與環境及其他沙盒／SAM 互動。勿與產品名「遊樂場」混用；說明隱喻時可寫「像遊樂場裡的沙坑」，產品單位名固定「沙盒」。 |
| 整場重置（遊樂場） | 重置遊樂場 | 人類 UI（管理沙盒）清光本機 Playgrounds 持久化後回到該 origin 首次開啟的空場（場網＝`/`；過渡舊場＝`/playgrounds/`）。**不**經 `env.HOST`。見 DEC-040。跨 origin（含換 `<name>`）不共用 OPFS——須匯出／匯入（DEC-041／042）。 |
| SAM／Single-page Application Module | 單頁小程式 | 沙盒裡的可執行模組：**Single-page Application Module** 的縮寫。定義上必有 UI 入口（固定 `index.html`）；可選 **Infrastructure**（`functions.js`）與 **Controller**（`controller.js`）。**不**強制短小（大型前端仍算 SAM）。勿與 AWS SAM（Serverless Application Model）混淆。見 DEC-024／027。 |
| Playgrounds 主要語言 | JavaScript（主）／Python（數據） | 可執行契約與範本以 **JS** 為準；數據分析用 **Python**（REPL／`runPython`）。**不**以 TypeScript 型別檢查或 TS 執行管線當產品主軸。見 DEC-027。 |
| listDir（遊樂場 HOST） | `list_dir`／`HOST.listDir` | 可裁切目錄列舉（prefix／depth／maxEntries）；大沙盒導航用，搭配 `search`。既有 `listFiles` 仍保留。見 DEC-027、[PG-FILE-NAV-PLAN.md](./PG-FILE-NAV-PLAN.md)。 |
| README.md（SAM 沙盒根） | `README.md` | 單一 SAM 內**人與代理共用**的沙盒導讀（入口、目錄、禁止事項、驗證方式）。任務面仍用 `.agent/*`。本遊樂場**不**另推沙盒根 `AGENTS.md` 當助理專檔。見 DEC-027、FILE-NAV 計劃。 |
| SAM UI 層 | UI | `index.html`＋前端 JS／CSS／assets；人機互動。定義必備，執行期可不渲染。`<head>`＝機器可讀宣告；`<body>` 可作人類說明。 |
| SAM Infrastructure 層 | Infrastructure／`functions.js` | 後端的 Workers 形 HTTP API（對 UI 的「網路」入口）；可直接使用 resources。見 DEC-016／024／031。 |
| SAM Controller 層 | Controller／`controller.js` | 後端的 Durable Object 形常駐邏輯：mailbox、排程、`onCommand`；與 UI 是否渲染脫鉤。對畫布**不**直連——UI 經 `functions.js`。見 DEC-024／031、[PG-AGENT-MODEL-SPEC.md](./PG-AGENT-MODEL-SPEC.md)。 |
| Agent 形態（遊樂場） | Agent 形態 | SAM 以 Controller 常駐執行的形態（可 headless、可收訊息）；**不是**與單頁程式對立的另一產品。無 Controller＝一般 SAM，不稱殘缺 Agent。見 DEC-031、AGENT-MODEL 規格。 |
| sandboxId（遊樂場） | 沙盒 ID | 邏輯 SAM 實例（Code＋Data＋Configuration）的穩定 ID。程式目標識別為 **`sandboxId`**（舊稱 `projectId`，遷移見 AGENT-MODEL-PLAN Phase 0b）。`name` 僅顯示名。見 DEC-028、AGENT-MODEL 規格。 |
| projectId（遊樂場；歷史） | projectId（舊） | 沙盒 ID 舊程式名；文件與新碼用 `sandboxId`。過渡期 API 可接受輸入別名。 |
| agentId（遊樂場） | Agent ID | 可定址 mailbox 的執行體 ID；本機預設可 ≡ `sandboxId`。見 AGENT-MODEL 規格。 |
| peerId／homePeer（遊樂場） | Peer／homePeer | Playgrounds 執行環境節點；`homePeer`＝持有該沙盒權威儲存與 mailbox drain 的 peer。migrate 換 home、ID 不變；不自動 failover。見 AGENT-MODEL 規格。 |
| mailbox（遊樂場 Agent） | mailbox | 每 Agent 一個 Durable inbox；`send`＝入隊；處理成功後 ack；MVP at-least-once。見 AGENT-MODEL 規格。 |
| at-least-once／ack（遊樂場 Agent） | at-least-once／ack | 崩潰或換 Leader 可能重送同一 `id`；成功處理後才 ack。Handler 須冪等。見 AGENT-MODEL 規格。 |
| poison／DLQ（遊樂場 Agent） | 毒訊息／死信 | 重試達上限後隔離，不堵後續 drain。見 AGENT-MODEL 規格。 |
| agent registry（遊樂場） | Agent 目錄 | `registerAgent`／lookup／list；定址與 `agent_not_found`。見 AGENT-MODEL 規格。 |
| leaderEpoch（遊樂場） | leaderEpoch | Leader 世代號；心跳與 inFlight 帶此值；失效應 stop drain。見 AGENT-MODEL 規格。 |
| hibernate／dehibernate（遊樂場 Agent） | hibernate／dehibernate | Virtual actor：卸下／重建 Controller 進程；同瀏覽器 mailbox／alarm Durable；**僅**有待處理訊息／事件時 resume（`onResume`）。≠ stop／刪除，≠ failover。見 AGENT-MODEL 規格、DEC-031。 |
| onPause／onResume（遊樂場 Agent） | `onPause`／`onResume` | Controller 生命週期：hibernate 前／dehibernate 後（drain 前）；**不**重跑 `onStart`。見 AGENT-MODEL 規格。 |
| virtual actor（遊樂場 Agent） | virtual actor | 邏輯實例常在、進程按需激活；同瀏覽器 Durable 佇列；頁關＝宿主關，後開頁／新 leader 可接手。見 AGENT-MODEL 規格。 |
| Leader tab（遊樂場 Agent） | Leader tab | 同瀏覽器內唯一負責 **functions.js＋全部 Controllers** 的頁面（主機）；其他 tabs＝外接螢幕（`/api` 應轉發至 Leader）。選舉：**Web Lock＋心跳＋`leaderEpoch`**（不依 Page Lifecycle）；自檢失鎖則 degrade；新 Leader 於超時＋緩衝後 bump epoch 再接手。後端腳本目標在 Leader 的 **Backend Runtime Worker** 執行（DEC-038），不在 UI 主線程。見 AGENT-MODEL 規格、DEC-031／038。 |
| Backend Runtime（遊樂場） | Backend Runtime | 執行 `functions.js`∥`controller.js`，並持有**沙盒儲存權威**（FS／KV／DB）的執行面。MVP＝Leader Dedicated Worker（可用 OPFS **實作於 Runtime 內**）；亦可 Node；路線可遷到**他機** peer。見 DEC-038、[PG-BACKEND-RUNTIME-SPEC.md](./PG-BACKEND-RUNTIME-SPEC.md)。 |
| Backend Runtime Worker（遊樂場） | Backend Runtime Worker | MVP：Leader 的 Dedicated Worker（Runtime 的一種同頁部署）。Follower 不啟動。見 DEC-038。 |
| 殼層不假設 OPFS（遊樂場） | 殼／儲存邊界 | 遊樂場 UI **不得**假設「殼所在瀏覽器」OPFS 為沙盒權威；編輯／Files 經 Runtime 通道。見 DEC-038。 |
| 訊息通道（Backend Runtime） | 訊息通道 | 殼↔Runtime 可替換傳輸：MVP＝`postMessage`；跨主機目標＝**WebRTC**。見 DEC-038、SPEC §1.4。 |
| 跨主機叢集（遊樂場路線） | WebRTC 叢集 | 多主機瀏覽器經 WebRTC 成執行叢集；Runtime／workers 可在非殼所在主機。契約保留遷移；細節另規。見 DEC-038。 |
| Roster（遊樂場） | Roster／peer transport | 本場 WebRTC peer／DataChannel 連線機制（可同時多 peer）。≠ 側欄名冊 UI；≠ 開另一場子域。見 DEC-045（[PG-ROSTER-PLAN.md](./PG-ROSTER-PLAN.md) **已取消**產品面）。 |
| Avatar／投影座位（遊樂場） | 投影／proxy seat | 遠端入座時本場可建薄 proxy sandbox 掛 seat；權威在對方 **`homePeer`**；經 Roster DataChannel 轉。Session 不特規——DEC-023＋型錄 lazy install。**不是**「線上」tab 產品卡片。見 DEC-045。 |
| Avatars tab（遊樂場） | ~~線上 tab~~（已取消） | 曾為左側側欄第三 tab（Files／總管／線上）。**2026-08-16 取消**；session 邀請／加入改由 **SAM＋Shell**。 |
| identicon（遊樂場） | identicon | 依穩定 id 本機衍生的預設圖；曾用於 Avatars tab。Tab 取消後非產品必要。 |
| Roster 邀請連結（遊樂場） | `#roster=`（歷史） | 曾把壓縮 wire 放進 URL hash 做 OOB 連線。**非**主路徑（改 Platform `#pg=`／短鏈）。見 DEC-045／047。 |
| 薄 signaling（遊樂場 Roster） | signaling | **每握手槽**只完成一次 WebRTC offer／answer（非 trickle）。見 DEC-045／047。 |
| Roster 樣板 SDP（遊樂場） | 樣板壓縮／交換 payload | 自完整 SDP 抽取必要欄位，依固定樣板編解碼還原；QR／文字／Platform 可共用。見 DEC-045。 |
| 同區網 Roster（遊樂場） | LAN／同區網模式 | 使用者宣告 peers 同一區網時，offer／answer 可更小。見 DEC-045。 |
| Playgrounds Platform API | Platform API | 獨立於場殼的 Cloudflare Workers 服務：**`api.samkuo.me`**（API；舊 `/i/` 可 302 至 go）、**`dash.samkuo.me`**（後台 UI，同 Worker）：Invite、薄 signal、帳號。後台持 **access token**；場殼持 **API key**（記憶體，經 provision）。不中繼 session／DataChannel。後台 UI 規格見 [PG-PLATFORM-DASH-SPEC.md](./PG-PLATFORM-DASH-SPEC.md)。見 DEC-047、[PG-PLATFORM-API-PLAN.md](./PG-PLATFORM-API-PLAN.md)。 |
| 純玩版客戶端（Playgrounds） | 純玩版／`go.samkuo.me` | 獨立 Worker＠**`https://go.samkuo.me`**：**無編輯環境**、不依賴持久 OPFS 沙盒庫；**同時只跑一個 SAM**。啟動含（1）Invite 短鏈入座（**臨時**；**不能離線**）（2）型錄 **`/s/<catalog_id>`** 單機傳閱（3）首頁 `/` 至多 3 則**game**推薦（picks 優先）。`/s/` 當前為 **`kind: game`** 時可換片（下一個／試試這些≤3）；可**加主畫面／造訪後離線／本機分數**；Header「**更多**」＝**本機溢流**（已下載／分層清除；≠ 只有推薦；`/i/` 不露）。產品內卡面可選靜態 **`/covers/<id>.png`**（型錄 `cover`；≠離線訊號；≠每小品 `og:image`）。`/i/` 不換片、不離線。UI **須**露出山姆鍋 logo（→ **`play.samkuo.me/`**）、「山姆鍋遊樂場」（→ **`/sam/?kind=game`**；副標網址＝`play.samkuo.me`），以及條件允許時的 Header「分享」（→`/s/<id>`）。**不是**場。見 [PG-GO-CLIENT-PLAN.md](./PG-GO-CLIENT-PLAN.md) §5.5／§5.6／§5.8／§6.4／§6.5／§6.6、DEC-050。 |
| 純玩版布告（go） | 布告／布告欄 | go shell **全遊樂場**站級公告（維修／活動／站務）：頂部薄條＋布告欄列表；未登入可見；權威在 Platform（dash **營運**發佈）；本機可關閉（`localStorage`）。**不是**老闆 flash、**不是**廣告槽、**不是** session 聊天、**不**進 SAM iframe。見 [PG-GO-BULLETIN-PLAN.md](./PG-GO-BULLETIN-PLAN.md)、DEC-050。 |
| 純玩版遊樂場大廳 Lobby（go） | 大廳／lobby | go **首頁 `/`** 的 **室內遊樂場大廳** canvas 殼（湯姆熊式：走道、機台、服務台；**不是** outdoor 全園、**不是** RPG 道具店）：**單一 2D `<canvas>`**；**輕量行走**＋hit-test（老闆／布告欄／詢問處／**機台**／後場／**包廂門**等）；**殼是大廳、小品仍是小品**；清單模式（DOM）永遠可達；`/s/`／`/i/`／`/room` **深鏈 bypass**（包廂是獨立殼面，不是大廳 canvas）。**禁止** DOM 當大廳地圖本體；**不是** SAM 遊玩 canvas。見 [PG-GO-SHOP-LOBBY-PLAN.md](./PG-GO-SHOP-LOBBY-PLAN.md)、DEC-050。 |
| 純玩版包廂（go） | 包廂／`/room` | go 殼層**臨時隔間**：壽命＝**主持 `/room` 畫面還開著**（關分頁／重整／結束＝散場）。**已登入會員開 `/room` 即包廂主面**（不必先請人；按「請人進來」才鑄門牌）。用 Invite 短鏈 **`/i/<short>`** 請人進來，**同一張有效門牌可多人**（不鎖 1:1）；短鏈 TTL 只管能不能請**新人**，**不是**包廂租期。Guest 同意後留在 `/i/`。資料面只走 WebRTC（文字；檔案＝分享區目錄，點下載才串流寫入使用者選的檔，**不**經 SW／OPFS、**不**整檔進 RAM；契約預留音視訊與桌機投放），**不**雲存、**不**經 Platform 中繼。**不是**局內 overlay 對話、**不是** `invite.compose` 開 SAM、**不是**大廳公開聊天區、**不是**可離線／可收藏房號。見 [PG-GO-ROOM-PLAN.md](./PG-GO-ROOM-PLAN.md)、DEC-050／045／047。 |
| 型錄 SAM 傳閱連（go） | `/s/<catalog_id>`／go 分享網址 | 只認型錄穩定 **`id`** 的純玩深鏈：**`https://go.samkuo.me/s/<id>`**。go **建置內嵌** catalog 解析；無 Invite／join／TTL。型錄列「分享」與 go Header「分享」只出此形；皆開**頁內分享面**（系統分享／**QR**／複製）；**分享 title／`og:title`＝`entry.title`**。當前為 **game** 時可換片；可安裝、造訪後離線、本機分數；可從「更多→已下載」再開。**不是** `/i/`、**不是**場 `?open=`、**不是**「一鍵開」、**不是** go 上完整型錄／我的遊戲庫。見 DEC-050、[PG-GO-CLIENT-PLAN.md](./PG-GO-CLIENT-PLAN.md) §5.5／§5.6／§6.6、[PG-CATALOG-UX-PLAN.md](./PG-CATALOG-UX-PLAN.md)。 |
| Platform Invite（遊樂場） | Invite／`#pg=` | 一條邀請（短連結或深鏈）；**多人可經同一連結加入**。內嵌 intent；**不**預帶 WebRTC offer。每次加入＝短命 join。kind 含 `signal.handshake`、`invite.compose`、**`invite.room`（包廂）**。**鑄造：** SAM 或 go 殼經代理呼叫 Platform API（持殼頁**記憶體** API key）；**非**後台 UI。**消費者主路徑**＝go 短鏈；場 `#pg=` 可留相容。**臨時生命週期**（需網路／Host）；**不是**離線遊戲入口。**不是** Platform 註冊邀請、**不是** `#roster=`、**不是** `#pg_provision=`、**不是**型錄 `/s/`。見 DEC-047、[PG-PLATFORM-DASH-SPEC.md](./PG-PLATFORM-DASH-SPEC.md) §7、[PG-GO-CLIENT-PLAN.md](./PG-GO-CLIENT-PLAN.md)、[PG-GO-ROOM-PLAN.md](./PG-GO-ROOM-PLAN.md)。 |
| Platform Ticket／join | join capability | 單次加入用的短命 capability（由 Invite 核發）。若雙方**已有** PeerConnection → **重用**，不跑 signaling。僅尚未連線時：加入者出 offer，同回合等邀請者 answer；握手排隊串行。見 DEC-047。 |
| Platform 短連結 | `/i/<short_id>` | 對 **Invite** 穩定的短 URL。**Canonical**＝**`https://go.samkuo.me/i/<short_id>`**（邀請 QR 預設）；`api.samkuo.me/i/…` 可 302 至 go。與 Invite 同壽命（過期／撤銷即失效）；非通用縮址；**不**服務型錄傳閱；**不**當離線／主畫面永久入口。見 DEC-047／050、[PG-GO-CLIENT-PLAN.md](./PG-GO-CLIENT-PLAN.md)。 |
| invite.compose（Platform） | 複合邀請 | Invite intent：開指定 SAM → **放大畫布** → 詢問入座（完整 protocol）；可選 Roster signal。場殼持 API key 可鑄。見 DEC-047。 |
| invite.room（Platform） | 包廂邀請 | Invite intent：請人進 go **包廂**殼面（無 SAM）；consent 後 Roster 握手。開這一間的主面是 `/room`（進門即 UI；**按需鑄**這張邀請）；短鏈仍 `/i/`（Guest 留在此）；**可多人 join**；TTL＝門牌，過期不散包廂。見 [PG-GO-ROOM-PLAN.md](./PG-GO-ROOM-PLAN.md)。 |
| 場邀請 E2E MVP（五子棋） | 邀請 E2E／`gomoku.v1` | 以型錄 **`pg-gomoku`** 跑通「註冊 Host 鑄 Invite → 未註冊 Guest 短連結（**go**）入座 → 對弈」；示範協議 `gomoku.v1`（非 brainstorm 狗糧當產品敘事）。見 [PG-INVITE-E2E-MVP.md](./PG-INVITE-E2E-MVP.md)、[PG-GO-CLIENT-PLAN.md](./PG-GO-CLIENT-PLAN.md)、DEC-047／045／023／050。 |
| 放大畫布（遊樂場） | 放大畫布／`maximizePreview` | 場殼把 SAM 畫布放到主工作面（`previewMaximized`）；`?open=`／型錄開啟成功後常用。**不是**瀏覽器全螢幕。見 DEC-025／047。 |
| Platform access token | access token／後台 session | 後台 UI（`dash`）登入後呼叫帳號／通行證／admin API 的憑證（SSO 換發）。**≠** API key；**不**給場殼。見 DEC-047、[PG-PLATFORM-DASH-SPEC.md](./PG-PLATFORM-DASH-SPEC.md) §5。 |
| Platform field API key | 場用 API key／通行證（`pg_sk_…`） | 每帳號至多 1 把；**僅遊樂場殼頁記憶體**；經後台「登入我的遊樂場」→ 短命 **provision** redeem 取得。每次入場輪替（單席）。用於殼代理鑄 Invite／signal。**∉ SecretStore**、**不**掛 `env.secrets.*`、**不**進 URL／`.sam`。**不是**後台登入憑證。對讀者可稱「通行證」。見 DEC-047、DASH-SPEC §5／§6.2。 |
| Platform provision | provision／`#pg_provision=` | 短命、單次 token：後台→場殼交接場用 API key。Deep link **只**帶 provision，**永不**帶 `pg_sk_`。Redeem 後作廢。**≠** `#pg=` 場 Invite。見 DEC-047、DASH-SPEC §7.0。 |
| Platform 點數 | 點數／credits | 註冊帳號餘額；有營運成本的備援（首項＝官方 TURN）按實際消耗扣點。**非**訂閱制。扣點掛 **Host**；Guest 無帳號不持點。見 [PG-PLATFORM-CREDITS-PLAN.md](./PG-PLATFORM-CREDITS-PLAN.md)。 |
| 官方 TURN（Platform） | hosted TURN／連線轉發 | Platform 簽發短命 TURN credentials；admin 開通＋點數＋使用者 `turn_prefer`。啟用備援的 **session 邀請**：殼附 TURN＋**relay-only ICE**（不嘗試直連）；**Host／Guest 人機不分辨**路徑。資料面權威仍在 peer；**不**經 signaling 中繼 session。見 DEC-045／[PG-PLATFORM-CREDITS-PLAN.md](./PG-PLATFORM-CREDITS-PLAN.md)／[PG-INVITE-E2E-MVP.md](./PG-INVITE-E2E-MVP.md) §3.1。 |
| 自備 TURN（否決） | — | 使用者自填 TURN URI／credential。**非產品路徑**（UX 過差）；DEC-045／047 否決。跨網備援僅官方 TURN。 |
| PLAYGROUNDS_API_KEY（廢止主路徑） | （舊）SecretStore 保留名 | **曾**為場內持 Platform API key 的 SecretStore binding。契約改為記憶體＋provision 後**不得**再作為主路徑；實作債務須汰除。BYOK 仍走 SecretStore（DEC-029），名稱自選、非此保留名語意。 |
| Host 本地面／殼面（遊樂場後端） | HOST local｜shell | 本地面＝Runtime 內儲存／純資料；殼面＝終端 UI 指令（執行期不得再打 Runtime 權威儲存完成該指令）。見 DEC-038、SPEC §6。 |
| Host Proxy／RPC（遊樂場後端） | 殼面終端通道 | Runtime→殼的殼面方法通道。**不是**整包 HOST 一律 RPC；**禁止**矛盾迴路（後端→殼→後端權威）。見 DEC-038。 |
| UI←網路→後端（遊樂場 SAM） | UI 只經網路打後端 | 模擬 UI←網路→（`functions.js`∥`controller.js`）↔resources。畫布只打 `/api`→`functions.js`；不直連 Controller／bindings。見 AGENT-MODEL 規格、DEC-031。 |
| Supervisor（遊樂場 Agent） | Supervisor | 上層編排用 Agent 角色：偵測失敗、spawn 接班人（新 ID）、更新路由；遊樂場不內建跨 peer HA。見 AGENT-MODEL 規格。 |
| head metadata（SAM） | head metadata | 放在 `index.html` `<head>` 的沙盒宣告（**`sam:*` meta**、`<title>` 等）；**不**另設頂層 `manifest.json` 為權威；**不**以 `.playgrounds-meta.json` 後備宣告。Session 協定宣告：`sam:protocol`＝`id[@apiVersion][:role[+…]]`（逗號多筆）。 |
| sam-runtime | sam-runtime | 可攜 SAM 實例 runtime（`src/sam-runtime/`）：載入 Controller／Infrastructure、排程、多實例；與 DOM／OPFS 解耦。 |
| headless host（SAM） | headless host | 不渲染 UI 的宿主（如 Node `src/sam-host/node/`）；可同時跑多個 `SamInstance`。 |
| 沙盒包裹（遊樂場） | 沙盒包裹 | 匯入／匯出整份沙盒時的檔案；副檔名 **`.sam`**（內容為 ZIP，僅便於辨識為 Playgrounds／SAM）。介面用語為「匯入／匯出沙盒」；需與一般 ZIP 區隔時才說「沙盒包裹」。**只接受 `.sam` 匯入**。預設為原始碼；可選附帶執行期狀態目錄 **`.playgrounds-state/`**（KV／DB／Secrets；見 DEC-018）。舊稱「專案包裹」。 |
| open-from-URL／一鍵開啟（遊樂場） | 從網址開啟 | deep link：文件預設 `https://play.samkuo.me/?open=<來源>`；任意場 `https://<name>.samkuo.me/?open=`；過渡舊場 `/playgrounds/?open=`（可選 `as`／`state`／`name`／`fresh`）。匯入 `.sam` 或複製 public GitHub／GitLab；同源已安裝時詢問取代／保留。見 DEC-025／041／042。行銷口語可稱「一鍵開 SAM 小」；**正式文件／UI 主標**用本列用詞；**無** `/sam` 短鏈。 |
| 執行期狀態（遊樂場） | 執行期狀態／Durable 狀態 | 相對沙盒原始碼樹的 side store：`env.KV`、`env.DB`（checkpoints 另存；舊 per-sandbox Secrets 已廢）。搬動 SAM（export／import／clone／HOST clone）時可顯式選擇是否一併處理；**預設不帶**。密鑰改 **SecretStore**（DEC-029），**永不**進 `.sam`。 |
| Preview 面板（遊樂場） | 畫布 | 程式在同源 iframe 的**渲染／執行結果**（場網經 `/canvas/` SW 虛擬站台；過渡舊場仍為 `/playgrounds/canvas/`），不是靜態預覽稿，也不是 chat artifact。程式識別可仍含 `preview`。工作沙盒走原畫布。見 DEC-041／042。 |
| Console 面板（遊樂場） | Console | 下方 dock **常駐**面板：工作沙盒畫布 `console.*`／runtime 錯誤（經 bridge `postMessage`）。預設**不**鏡像到瀏覽器 DevTools；可在「選項 → 設定」開啟。見 DEC-016／044。 |
| 下方面板 dock（遊樂場） | 下方 dock／bottom dock | 編輯器下方的輔助槽：預設僅 Console；Python／JavaScript／Shell 與自選 plain SAM 須**明確加入**。Worker／Pyodide／WASI／下方 iframe **真用才啟動**。與 main content（DEC-030）分工；MVP 下槽**不**核發 Tool grant。見 DEC-044、[PG-BOTTOM-DOCK-PLAN.md](./PG-BOTTOM-DOCK-PLAN.md)。 |
| 工作沙盒（遊樂場） | 工作沙盒 | 遊樂場介面當前開啟、編輯器與原畫布所對應的 OPFS 沙盒（`activeId`）——即當前編輯的那份 SAM。舊稱「工作專案」。**不是**總管對話切換軸（對話以任務為準；見 DEC-017）。 |
| Steward／現行 Agent（遊樂場） | 總管 | 產品角色（English：**Steward**）：**取代 UI／產品文案中的「現行 Agent」**。使用者（遊樂場主人）的**唯一對口**（下指示、拿結果）；代為管理遊樂場，持有完整 `env.HOST` 的那一席。Agent 仍是 SAM 種類；多個 Agent 裡只有被設為總管的那位有 HOST。技術槽位 `activeAgentProjectId`（文件／API 可續稱現行 Agent）。**實例顯示名由使用者自訂**；「總管」是角色類名。舊稱「管家」（含「家」與遊樂場隱喻不合）。預設≠ session Participant；若總管要**參與** session，必須以 **Host agent** 身分（主持沙盒＝總管席）。**對話 scope 以任務為主**（開新／切對話），**不**因切換工作沙盒而換 transcript；場內沙盒＝同場工作物（場／origin 才像專案邊界）。勿與未兼任總管的 Host SAM、一般／參與 Agent 混淆。見 DEC-017／023／033。 |
| 總管範本（遊樂場） | 總管範本 | 開源總管角色 SAM 種子（[`sampot/pg-steward`](https://github.com/sampot/pg-steward)；含 BYOK 對話與 HOST 工具）。經場網 [`/sam/`](https://play.samkuo.me/sam/) 或 `?open=sampot/pg-steward` 開入後再「設為總管」。遊樂場**不**內嵌；硬核使用者亦可自寫對口骨架。 |
| LLM Agent 範本（遊樂場） | coding agent／`pg-llm-agent` | 開源 **BYOK coding agent** 種子（[`sampot/pg-llm-agent`](https://github.com/sampot/pg-llm-agent)）：production-ready；system prompt 等為沙盒檔；密鑰走 SecretStore；**無** `env.HOST`；可多實例入座 `coding-orchestration.v1`（session role 仍為 `worker`）。遊樂場**不**內嵌。狗糧 `codingOrchestrationWorkerStarter` 僅驗證／教學。見 [PG-LLM-AGENT-PLAN.md](./PG-LLM-AGENT-PLAN.md)、DEC-017／033。 |
| Agent 範本（遊樂場） | Agent 範本 | 一般 Agent SAM 種子（`createAgentBaseStarterFiles`）：有 Controller、可背景／主動運行，**不**強制 LLM。與工具 SAM 的差別在主動／背景能力，不在是否聊天。 |
| agentManaged（沙盒 meta） | Agent 管理沙盒 | 經 `env.HOST` create／clone 的沙盒；HOST **刪除**僅限這些以回收空間。使用者 UI／匯入沙盒無此標記——Agent 仍可依使用者要求讀寫，只是不可 HOST 刪除。舊稱「Agent 管理專案」。**不**決定是否出現在沙盒 Picker（見工作集／DEC-028）。 |
| 工作集（遊樂場沙盒） | 工作集／`inWorkingSet` | 使用者日常命名空間：出現在 toolbar **沙盒 Picker** 的那些沙盒——我建的，或我要求總管幫我建／留下的。與 `agentManaged` 正交。見 DEC-028、[PG-SANDBOX-INSTANCE-PLAN.md](./PG-SANDBOX-INSTANCE-PLAN.md)。 |
| 沙盒管理面（遊樂場） | 管理沙盒／實例總帳 | 遊樂場介面盤點**全部**沙盒（含非工作集、自動 clone）並可加入／移出工作集、開啟、回收的介面。Picker 不承擔全量瀏覽。見 DEC-028。 |
| Agent 艦隊（遊樂場） | Agent 艦隊／Fleet | 遊樂場介面觀測面：掌握 Agent 運行態與實例關係（Pulse／關係視圖／Focus；可選 3D 探索圖）。**不**取代 Picker 或沙盒總帳。見 DEC-032、[PG-AGENT-FLEET-UX-PLAN.md](./PG-AGENT-FLEET-UX-PLAN.md)。 |
| Fleet Pulse（遊樂場） | Fleet Pulse／艦隊脈搏 | 艦隊 L0：計數、mailbox 壓力、Leader 訊號、Needs attention。見 DEC-032。 |
| ego network（遊樂場艦隊） | ego／焦點鄰域 | 以選中 Agent 為中心、僅 ±N 跳鄰居的子圖；3D／大圖預設裁剪策略。見 DEC-032。 |
| agent.ui（遊樂場艦隊） | agent.ui 標註 | 顯示用註記（roleLabel／health／successorOf 等）；存 runtime `ui-annotations.json`；HOST `setAgentUi`；遊樂場介面只渲染。見 DEC-032。 |
| SAM 實例（遊樂場） | 實例 | 一沙盒對應一 SAM 實例（Code＋Data＋Configuration；即使未執行）。`clone` 產另一實例，之後程式碼分叉。數量爆炸主因常是實例增殖，而非僅「新建」。見 DEC-028。 |
| clonedFrom／cloneIntent（沙盒 meta） | 血統／clone 意圖 | `clonedFrom`＝直接來源 `sandboxId`；`cloneIntent` 區分人手保留、總管代建、自迭代、session 分身等，供管理面分區與 GC。見 DEC-028。 |
| Agent 區（遊樂場） | Agent 區 | 左側側欄與 Files 以 Tab 切換的 iframe；內容為**總管**（現行 Agent 席）的 UI。遊樂場介面 Tab 標籤顯示「總管」；程式／layout 鍵仍可為 `agent`。見 DEC-017。下方 dock 預設 Console；REPL／Shell／自選 SAM 為 opt-in（DEC-044）。 |
| host binding（遊樂場） | host binding／`env.HOST` | **對口席**＝目錄全部 scopes **自動準入**→動態全量；**已準入 SAM**＝同形子集。卸任收回對口快捷。不另立 `env.SANDBOX`／`env.OBSERVE`。見 DEC-017／036／**051**、[PG-API-SCOPES-SPEC.md](./PG-API-SCOPES-SPEC.md)。 |
| sandbox-intrinsic（遊樂場） | 沙盒內建／intrinsic | 該沙盒自己的檔案樹、`env.vars`、自己的 KV／DB、自己的畫布↔functions 等；**預設可開、不必** `sam:capabilities` 宣告。見 DEC-036、[PG-API-SCOPES-SPEC.md](./PG-API-SCOPES-SPEC.md)。 |
| environment capability（遊樂場） | 環境能力／capability／scope | 共用或跨邊界 API 的授權標籤（OAuth-style scope，如 `compute:python`、`sandbox:create`）；須 `sam:capabilities` 宣告＋使用者同意才準入。MVP 別名仍認 `runPython`／`runCmd`。見 DEC-036／**051**、[PG-API-SCOPES-SPEC.md](./PG-API-SCOPES-SPEC.md)。 |
| API scope（遊樂場） | scope／`resource:action` | 中粒度授權單位（非角色、非逐 HOST 方法）；慢變目錄；獲准後投影為 `env.*` 方法子集。見 DEC-051、[PG-API-SCOPES-SPEC.md](./PG-API-SCOPES-SPEC.md)。 |
| 準入（遊樂場 binding） | 準入／admit | 使用者同意後，將 scope／capability 記入沙盒已核發集合並允許注入對應 binding。已核發集合預設不進 `.sam`。見 DEC-036／051。 |
| compute binding（遊樂場） | `env.COMPUTE` | 已準入 `compute:*`（或舊名 `runPython`／`runCmd`）後注入的窄 binding；方法亦投影進 **HOST 形子集**（DEC-051）；遷移期雙掛。≠ 對口全量 `env.HOST`。見 DEC-036／051、[PG-API-SCOPES-SPEC.md](./PG-API-SCOPES-SPEC.md)。 |
| Durable KV（遊樂場） | Durable KV | 對齊 Cloudflare KV 形的模擬 binding；OPFS 後端（`playgrounds-kv/<sandboxId>/`；目錄前綴歷史名可保留），跨重整存活；export／clone **預設**不複製（可選）。見 DEC-018。**總管 UI 對話**存總管沙盒 KV、以**任務**為 scope（`agent:sessions:index:v1`／`agent:session:<sessionId>:v1`；不因切換工作沙盒而換 history；見 DEC-017 2026-08-08）。舊鍵 `agent:sessions:<workSandboxId>:…` 於載入時遷移。 |
| context hygiene（遊樂場 Agent） | context hygiene／脈絡衛生 | 送 LLM 前的字元預算、舊 tool stub、舊輪次 digest，外加該沙盒 `.agent/plan.md`／`.agent/memory.md`；**不是** Embedding RAG。見 DEC-026、PG-AGENT-PLAN Phase 12。 |
| working memory（遊樂場 Agent） | 工作記憶／`.agent/memory.md` | **該沙盒**檔案樹內的 agent 權威耐久筆記（決策、約束、關鍵路徑；常與 `.agent/plan.md` 成對）；開場可注入摘錄。與總管 UI transcript **分離且正交**——transcript 跟任務走，`.agent/*` 跟沙盒走。 |
| Scheme A（遊樂場 Agent） | Scheme A／單 HOST 分任務 | 同一現行 Agent 用**當前焦點沙盒**的 `.agent/plan.md`＋`.agent/memory.md`＋`write_plan`／`write_memory`／`get_task_focus` 拆任務；**不是**多 LLM 子代理，也**不是**總管 UI 對話房的切換條件。多 LLM 工人編排見 `coding-orchestration.v1`／DEC-033。見 DEC-026、AGENT-PLAN Phase 12b。 |
| 仿 D1（遊樂場） | 仿 D1／`env.DB` | sql.js 子集；OPFS `playgrounds-db/<sandboxId>/`。見 DEC-020。 |
| `env.SECRETS`（遊樂場；歷史） | Secrets bag（歷史） | 舊 `{ get(name), list() }` 字典 binding；**已由** `env.secrets.<NAME>.get()` **獨立 binding 取代**（DEC-029／035）。 |
| `env.secrets`（遊樂場） | secrets 命名空間 | 小寫命名空間（本身不是 binding）；其下每密鑰一顆 `await env.secrets.<NAME>.get()`。見 DEC-029／035、[PG-SAM-ENV-SPEC.md](./PG-SAM-ENV-SPEC.md)。 |
| secret binding（遊樂場） | 密鑰 binding | SecretStore 內每個 secret 掛在 `env.secrets` 下：`await env.secrets.<NAME>.get()`（一 secret 一 binding；非 bag）。須 unlock。HOST **不**回傳值。見 DEC-029／035。 |
| `env.vars`（遊樂場） | vars 命名空間 | 小寫命名空間；沙盒根目錄 `.env` 注入的同步唯讀字串對（執行期參數）。見 DEC-035、[PG-SAM-ENV-SPEC.md](./PG-SAM-ENV-SPEC.md)。 |
| `.env`（遊樂場 SAM） | 沙盒 dotenv | 沙盒根目錄執行期參數檔；權威來源 → `env.vars`。可進 `.sam`；**不**當密鑰庫。見 DEC-035。 |
| SecretStore（遊樂場） | SecretStore／密鑰庫 | 遊樂場介面統一持有的密鑰存儲（遊樂場級）。OPFS 為**密文**；password→WebCrypto（`extractable: false`）unlock 後，對允許的沙盒注入**每 key 獨立** binding（`env.secrets.*`）。明確 lock；**頁面刷新＝lock**。**無**遊樂場代打、**無** `env.SECRETS` bag。遊樂場選單 UI 稱「**密鑰庫**」。**勿**稱 Vault。見 DEC-029、[PG-SECRETSTORE-PLAN.md](./PG-SECRETSTORE-PLAN.md)。 |
| SecretStore unlock／lock（遊樂場） | 解鎖／鎖定 | 遊樂場介面以 **password** 或 **生物識別（WebAuthn PRF）** unlock；lock 或重整丟棄記憶體中的 `CryptoKey`。初始化須有 password 復原；無 PRF 時不提供生物識別入口。HOST 不收 password。見 DEC-029。 |
| 總管密鑰設定喚起（遊樂場） | 設定喚起遊樂場介面密鑰 dialog | 總管設定以選既有密鑰名為主；僅新增／輪替時用無值訊息喚起遊樂場介面輸入框。明文只在遊樂場介面寫入。見 DEC-029、SECRETSTORE 計劃。 |
| Python REPL（遊樂場） | Python 面板 | 下方 dock **opt-in** 人類用 Pyodide REPL（xterm）；與 `HOST.runPython` 共用 Worker；加入面板 ≠ 載入 Pyodide；**不是** Linux shell。見 DEC-016／019／044。 |
| JavaScript REPL（遊樂場） | JavaScript 面板 | 下方 dock **opt-in** 人類用隔離 Worker REPL（xterm）；`%run` 跑沙盒 `.js`；**無 npm**；與畫布 runtime 分離。見 DEC-044。 |
| Shell（遊樂場） | Shell 面板 | 下方 dock **opt-in** 人類用仿 Linux **命令列**（xterm＋WASI preview1；瀏覽器內建 Wasm）；FS＝工作沙盒 OPFS，Worker 內 **`FileSystemSyncAccessHandle` fd 直連**（DEC-039；**per-sandbox** 殼閘／`fsHold` 與 Backend Runtime 互斥——scope＝`playgrounds-projects/<sandboxId>/`）；可簡易 `|` 管線；無外網／sockets；**不是** v86／真 Bash。加入面板 ≠ 起 WASI Worker。見 DEC-021／044、[PG-SHELL-PLAN.md](./PG-SHELL-PLAN.md)、[PG-WASI-OPFS-FS-PLAN.md](./PG-WASI-OPFS-FS-PLAN.md)。 |
| runCmd（遊樂場 HOST） | `run_cmd`／`HOST.runCmd` | Agent 非互動執行允許清單 WASI CLI；與 Shell 共用 runner／佇列／OPFS fd 語意，不共用字元級 TTY；無管線字串、無 guest 網路。`too_large`≠專案過大。見 DEC-021／039。 |
| 工具沙盒／Tool SAM（遊樂場） | 工具沙盒／Tool SAM | 以**工具**角色掛進 main content 的單頁小程式——即 canvas tab **附帶**對工作沙盒的委派 grant／目標注入 **`env.DELEGATE`**（歷史名 `env.TOOL`）；與工作沙盒、現行 Agent 角色分離。見 DEC-022、DEC-030、DEC-037、[PG-TOOLS-PLAN.md](./PG-TOOLS-PLAN.md)、[PG-DELEGATE-GRANT-PLAN.md](./PG-DELEGATE-GRANT-PLAN.md)。舊稱「工具專案」。 |
| 工具模式（遊樂場） | 工具模式 | main content **前景**為帶 grant 的 canvas tab（注入 `env.DELEGATE`；遷移期可仍見 `TOOL`）；可用 tab 切回編輯器；**不**切 `activeId`。掛載畫布不必是工具（見 plain）。見 DEC-030／037。 |
| main content tab（遊樂場） | main tab | Editor 槽 tab：固定**編輯器**（不可關）＋最多 **4** 個沙盒 **canvas** tab；可切換 Editor 與任一已掛 SAM。見 DEC-030、[PG-MAIN-CONTENT-PLAN.md](./PG-MAIN-CONTENT-PLAN.md)。下槽輔助掛載見下方 dock／DEC-044。 |
| plain 畫布掛載（遊樂場） | plain 畫布／只看畫布 | canvas tab **無** grant、**無** `env.DELEGATE`；不切 `activeId`。與 Tool 相對。可出現在 main content 或下方 dock（後者 MVP 僅 plain）。見 DEC-030／044。 |
| 下方自選 SAM（遊樂場） | 下方 SAM／dock SAM | 使用者明確加入下方 dock 的 plain 沙盒畫布（硬頂 3；重整不還原；不可與 main 雙掛同一 `sandboxId`）。見 DEC-044。 |
| 授權／grant（遊樂場工具） | 授權／grant／委派 grant | 核發給 delegate 或 scoped SAM：target 沙盒＋paths＋模式。明示（Tool／納管）或 **建立即自動**。自動 grant **不**因建立者 SAM 刪除而清掉產出沙盒內容。見 DEC-037／051、[PG-API-SCOPES-SPEC.md](./PG-API-SCOPES-SPEC.md) §6.5。 |
| delegate（遊樂場） | 受委派者／delegate | 接受工作沙盒委派、在最小權限 grant 內執行的角色——**含 Tool SAM 與 session worker Agent**。對委派方負責；無完整 `env.HOST`。見 DEC-037。 |
| `.bindings`（遊樂場） | `.bindings/` | Files／授權用的**虛擬**共同子目錄：`.bindings/db`→工作沙盒 `env.DB`、`.bindings/kv`→工作沙盒 `env.KV`。樹上只顯示入口、不展開內容；**不**對齊 `.sam` 的 `.playgrounds-state/`。見 DEC-037、DELEGATE-GRANT 計劃。 |
| delegate binding（遊樂場） | `env.DELEGATE` | 帶委派 grant 時注入的窄 API（Tool 與 worker **統一**）；可含 OPFS 與（若 grant 含虛擬節點）工作沙盒 DB／KV 代理；**不是**完整 `env.HOST`。歷史名 **`env.TOOL`**（遷移後非權威）。見 DEC-037、[PG-DELEGATE-GRANT-PLAN.md](./PG-DELEGATE-GRANT-PLAN.md)。 |
| tool binding（遊樂場；歷史） | `env.TOOL` | 舊工具 session 注入名；權威改 **`env.DELEGATE`**（DEC-037）。 |
| 個人工具箱（遊樂場） | 個人工具箱 | 使用者 OPFS 裡可復用為工具的那些 SAM；在遊樂場沙盒之間累積，**不是**站上 `/tools/` 登錄表。 |
| toolKinds／toolGlobs（遊樂場） | `toolKinds`／`toolGlobs` | 工具發現欄位：種類（如 `editor:text`／`viewer:markdown`）與偏好 glob。**權威在** `index.html` head 的 `sam:tool-kinds`／`sam:tool-globs`；遊樂場 `.playgrounds-meta.json` 僅鏡像供列表／Agent，不以 side meta 宣告。見 DEC-022／024、PG-TOOLS-PLAN Phase 6。 |
| multi-agent session（遊樂場） | 多 Agent session／多人通道 | **技術名** session：遊樂場介面提供的**抽象多方協同框架**（座位／role／事件／投影）。有意義的協作須另有 Host **session protocol**；領域怎麼稱呼由 Host 決定；遊樂場不產品化場景名。同一頁面內多個背景 Agent＋人類；入座看**協定相容**；事件走 BroadcastChannel。**不含**遠端。見 DEC-023、[PG-MULTI-AGENT-SESSION-SPEC.md](./PG-MULTI-AGENT-SESSION-SPEC.md)。 |
| session BroadcastChannel（遊樂場） | session 事件頻道 | 名稱 `playgrounds-session:<sessionId>`；遊樂場介面在 act 成功後廣播；參與頁面 `onmessage` 接收。 |
| shell session HTTP（遊樂場） | `/api/shell/session/*` | Host **工作沙盒**畫布可呼叫的遊樂場介面通道 API（open／close／join／spawn-participant 等）；僅 Host 可呼叫，不是給 Participant 的控制面。 |
| Host SAM（session） | 主持沙盒／Host SAM | 開啟並強制 session 規則與權威狀態的那份工作沙盒；並負責領域 UX／命名。舊稱「主持專案」。 |
| Host agent（session） | Host agent | 以 Agent 形態執行並擔任該場 **Host SAM** 的實例。總管若參與 session，必須是 Host agent（非 Participant 座位）。見 DEC-033、SESSION 規格 §4.3。 |
| Participant Agent（session） | 參與 Agent | 以座位連入 session 的 Agent 實例；走窄 `env.SESSION`，**不是**完整 `env.HOST`。通道層不規定必須使用 LLM；不要求與 Host 同一沙盒內容。多位＝clone 沙盒實例。 |
| session role（遊樂場） | session 角色／權限 role | Host 宣告的 session **權限類**（如 `participant`／`worker`）；決定可做哪些 `act`。**不是** Agent 人格標籤。 |
| session protocol（遊樂場） | session 協定 | Host 宣告的**領域協同契約**（`protocolId`／`apiVersion`／roles／capabilities／事件與 act 形狀）；通道只做相容閘門。例：`brainstorm.v1`、`coding-orchestration.v1`。邀請宜附**完整規格**（或可解析引用）供接收場匹配。見 DEC-023。 |
| join policy（遊樂場 session） | 入座政策／`joinPolicy` | Host **建立 session 時**決定的入座路徑：邀請（invite）、申請（apply）、並存、是否需核准。參與者**不必**自行申請；常見由 Host 邀請／spawn 入座。見 SESSION 規格 §6.5。 |
| coding orchestration（遊樂場） | coding 編排／`coding-orchestration.v1` | LLM 總管（Host agent）指派 coding agent、彙整結果以完成 coding 任務的 session protocol；**`joinPolicy: invite_only`**；座位 role 名仍為 `worker`；**每一場使用者↔總管對話 session 對應恰好一場多方 session**。產品路徑：總管 [`pg-steward`](https://github.com/sampot/pg-steward) 自任 Host；coding agent [`pg-llm-agent`](https://github.com/sampot/pg-llm-agent)。工人執行面目標＝與 Tool 共用的**委派 grant**（DEC-037）；`host_apply` 為可選後備。狗糧 starter 僅驗證／教學。見 DEC-033／037、[PG-CODING-ORCHESTRATION-PROTOCOL.md](./PG-CODING-ORCHESTRATION-PROTOCOL.md)、[PG-DELEGATE-GRANT-PLAN.md](./PG-DELEGATE-GRANT-PLAN.md)、[PG-LLM-AGENT-PLAN.md](./PG-LLM-AGENT-PLAN.md)。**不是**通用模擬 MAS 的定義。 |
| workflow（遊樂場） | 工作流程／workflow | 有狀態的多步驟流程。**定義**用 YAML（`workflow.v1`）；**實例**生命週期＝Agent 實例（單游標）。Runtime 範本 **`sampot/pg-workflow`**；Visual Editor＝**`sampot/pg-wfedit`**（Tool SAM）；遊樂場不特化。見 DEC-034、WORKFLOW／WFEDIT 規格。勿與 GitHub Actions 的 workflow 混稱時，可寫「遊樂場 workflow」。 |
| Workflow Visual Editor（遊樂場） | 流程視覺編輯器／`pg-wfedit` | **獨立 Tool SAM**（建議 `sampot/pg-wfedit`）：垂直主軸投影、經 grant 編輯宿主 `workflow.yaml`；**不**執行引擎、**不**持權威狀態。見 DEC-034、[PG-WFEDIT-SPEC.md](./PG-WFEDIT-SPEC.md)。 |
| workflow definition（遊樂場） | 流程定義／`workflow.yaml` | YAML IR：步驟圖、`run`／`runFile`、await_ui 等；亦為編輯器內部表示。見 DEC-034、WORKFLOW-DEFINITION 規格。 |
| workflow instance（遊樂場） | 流程實例 | 一次執行的權威狀態（cursor／vars／history／status）；≡ 一個 Agent 沙盒；終態瘦身後仍保留實例。見 DEC-034。 |
| workflow cursor（遊樂場） | 游標／cursor | 實例當前唯一 active `stepId`；MVP 不支援多游標平行。見 DEC-034。 |
| await_ui（遊樂場 workflow） | `await_ui` | 等人在**該實例 UI** 送 signal 的步驟；不走多方 session role。見 WORKFLOW-DEFINITION 規格。 |
| run／runFile（遊樂場 workflow） | `run`／`runFile` | action 腳本：`run`＝YAML 內嵌短 JS；`runFile`＝外部 `.js`（必支援）；互斥、契約同形。見 DEC-034。 |
| 型錄查詢（遊樂場） | catalog query／`/catalog/v1.json` | 建置自 YAML 產結構化型錄；殼內 API 與可選同源 `GET /catalog/v1.json`；list／get／source／protocol 匹配；本機已安裝可經 `sam:protocol` head 探測並與型錄合併。見 DEC-046 Draft、[PG-CATALOG-QUERY-PLAN.md](./PG-CATALOG-QUERY-PLAN.md)。 |
| lazy installation（遊樂場 session／型錄） | lazy install／延遲安裝 | 接受 session 邀請時，若尚無相容 SAM，自**小品型錄**（或邀請提示之來源）安裝後再入座；型錄項視為**虛擬可用**（類比 virtual actor：有需要才物化）。與 Avatar 無關的特規——本機與遠端同一路徑。見 DEC-023／045。 |
| session binding（遊樂場） | `env.SESSION` | 參與座位期間注入的窄 API：座位資訊、狀態投影、事件訂閱、`act`／`leave`；≠ HOST／TOOL。 |
| host bridge（go） | go `env.HOST` factory／`createGoHostBinding` | go 純玩版的 `env.HOST` 注入實作（[檔案](../../go-client/src/lib/goHostBinding.ts)）；同形同介面於場殼 `HostBridge`，把 `hostRuntime`（`env.KV` authority）+ `goAuth`（Platform invite 代理）包成單例。**不**另立 `env.SHELL`——DEC-053 收斂為「`env.HOST` 在兩殼同形」。 |
| edge functions（遊樂場後端） | functions／edge functions | 對齊 Cloudflare Workers 形 `fetch` handler 的輔助後端；遊樂場可模擬 bindings，上線再部署真 edge。 |

## 自稱與產品提及（摘要）

詳見 `AGENTS.md`。此處只列易偏離的點：

| 情境 | 本站用詞 |
| --- | --- |
| 作者自稱 | 山姆鍋（可與「我」自然混用，勿整篇機械替換） |
| 本站與產品的關係 | 本站是個人部落格；**內容主軸是 Playgrounds／SAM**，不專屬於 NT²；偶寫 NT² 時可自然淺連「在開發 NT² Vault 時……」；**勿**加「那是官網／產品部落格的事」這類分工套話；**既有 NT² 連結不動** |
| 作者當前狀態 | 正在一人開發 NT² Vault（自我介紹可提）；品牌／平台層可寫 NT²（Null Trust²）；站台發文主軸另見 Playgrounds／SAM |
| 產品官網 | [nt2.me](https://nt2.me)（需要時淺連即可） |
| 產品部落格 | [blog.nt2.me](https://blog.nt2.me)（讀者正文通常不必提；站點分工見 `AGENTS.md`） |

## 維護

- 作者指定新對照時，**先改本檔再改文章**。
- Agents 寫文前應讀本檔；與 [AGENTS.md](./AGENTS.md) 衝突時，**用語以本檔為準**，其餘慣例以 `AGENTS.md` 為準。
- 本檔位於 `docs/`，與其它 Agents 文件同目錄。
