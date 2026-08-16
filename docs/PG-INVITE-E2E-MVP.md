# Playgrounds 場邀請 E2E MVP（五子棋）

> **狀態：** Draft（2026-08-16）— Phase 0–3 完成；Phase 4 手測進行中（DEC-053 `env.HOST`）  
> **權威決策：** [DECISIONS.md](./DECISIONS.md) **DEC-047**（Invite／provision）、**DEC-045**（Roster／signal）、**DEC-023**（session／protocol）、**DEC-053**（UI→`/api`→`env.HOST`）  
> **相關：** [PG-PLATFORM-API-PLAN.md](./PG-PLATFORM-API-PLAN.md)、[PG-PLATFORM-DASH-SPEC.md](./PG-PLATFORM-DASH-SPEC.md)、[PG-ROSTER-PLAN.md](./PG-ROSTER-PLAN.md)、[PG-PLATFORM-CREDITS-PLAN.md](./PG-PLATFORM-CREDITS-PLAN.md)（點數／官方 TURN；有權 Host 跨網對玩／路徑透明）、[PG-GO-CLIENT-PLAN.md](./PG-GO-CLIENT-PLAN.md)（純玩版 Guest＠`go.samkuo.me`；短網址 canonical）、[PG-GO-HOST-INVITE-PLAN.md](./PG-GO-HOST-INVITE-PLAN.md)（go 玩家主場亦可鑄邀請）、DEC-025（`?open=`／放大畫布）、DEC-046（型錄／lazy install）、[GLOSSARY.md](./GLOSSARY.md)  
> **載體 SAM：** 型錄 [`pg-gomoku`](../catalog/entries/pg-gomoku.yaml)（source [`sampot/pg-gomoku`](https://github.com/sampot/pg-gomoku)）— **不是**殼內 brainstorm／coding-orch 狗糧

一句話：**用型錄五子棋跑通「註冊 Host 開 session → 鑄場 Invite → 未註冊 Guest 短連結入座 → Host 按「開始」開局 → 對弈」的完整端到端路徑；Host 可在 `play`（作者場）或 `go`（玩家主場）鑄邀請，Guest 一律走 `go…/i/…`。**

---

## 1. 動機

- Platform Invite、`invite.compose`、provision、Roster 遠端入座等多段已落地，但對外可講的「完整邀請故事」仍缺**代表性 SAM**。
- `brainstorm.v1`／coding-orch 適合作管線回歸，**不當**產品示範主角（偏狗糧；後者還綁 BYOK／LLM）。
- 五子棋：型錄已上架、雙人語意清楚、「等人 → 開始 → 終局」邊界明確；Guest 零帳號、零密鑰。

---

## 2. 目標

- **一條可手測的快樂路徑**：兩瀏覽器（或兩 profile）走完開局→邀請→加入→對弈→終局。
- **Host＝註冊使用者**（dash SSO →「登入我的遊樂場」→ 場殼記憶體 API key）。
- **Guest＝無 Platform 帳號**（僅持 Invite／`join_cap`）。
- 邀請由 **SAM → 殼代理 → Platform API** 鑄造（後台**不**鑄場 Invite）。
- 資料面**不**經 Platform；連上後只走 WebRTC／本機 session（DEC-045／047）。
- 邀請附**完整** `gomoku.v1` protocol；consent 不可省（DEC-023／047）。

## 3. 非目標

- 觀戰、悔棋雲同步、斷線重連產品化、預約房、長 TTL 約戰。
- 同連結多人排隊／多 peer 當**本 MVP 主故事**（規格上 Platform 可多人；本刀鎖 **1 Guest**）。
- 場內 SSO、Guest 註冊、後台鑄場邀請。
- **使用者自備 TURN**（DEC-045 否決）；對 Host／Guest **揭露**直連 vs relay／TURN 術語。
- 以五子棋重做通用棋類框架；改 OOB `#roster=` 為主路徑。
- 把「線上」tab 過渡鑄鏈當產品主 CTA（可留除錯；權威 CTA 在五子棋 UI）。
- 為本 MVP 強制改 `picks.yaml`（E2E 穩後可另議）。
- MFA、用量儀表、跨場存檔；本刀**不**實作點數帳本／官方 TURN（見 §3.1 依賴）。

### 3.1 官方 relay 與跨網連線（對齊點數計劃）

**產品期望（官方 TURN 落地後）：** admin 已為 Host **開通連線備援**（`turn.hosted`）且已**加點**時，五子棋邀請對玩在**雙方無法直連**的網路下仍應能完成 WebRTC 連線並進入對弈。

| 規則 | 說明 |
| --- | --- |
| 自動 | 殼在有權＋有點時自動納入官方 TURN；**無**「請選擇轉發」步驟 |
| 對人透明 | Host 與 Guest **無需知道**當次是直連還是 relay；UI 只呈現連上／失敗 |
| 資料面 | session／棋步仍不經 Platform 中繼（僅傳輸路徑可走 TURN） |
| 本刀 Phase 1–4 | 仍以直連／STUN 可連為手測主路徑；跨網無備援失敗＝已知限制 |
| 完整跨網驗收 | 依賴 [PG-PLATFORM-CREDITS-PLAN.md](./PG-PLATFORM-CREDITS-PLAN.md) Phase 2+；見 §9「relay」項 |

---

## 4. 角色與憑證

| 角色 | Platform 帳號 | 場憑證 | 可做 | 不可做 |
| --- | --- | --- | --- | --- |
| **Host** | **要**（邀請制註冊＋SSO） | 殼頁**記憶體** API key（經 provision） | 開五子棋 Host 席、鑄／撤 Invite、作答循環、session 權威 | 把 key 寫入 SecretStore／URL／SAM 可序列化狀態 |
| **Guest** | **不要** | 無；僅 Invite secret＋短命 `join_cap` | 開短連結、同意入座、連線、落子 | 鑄 Invite、provision、「登入我的遊樂場」 |

**勿混：** `#pg_provision=`（Host 通行證交接）≠ `#pg=`（場 Invite）≠ `/join/<token>`（註冊邀請）≠ `#roster=`（OOB wire）。

**Guest 顯示名：** 進場時可改的**臨時** display name（可選本機記住）；**不**綁 Platform account。未填時 UI 可用「對手」等中性預設。

---

## 5. 載體與協定

### 5.1 SAM

| 項 | 規格 |
| --- | --- |
| 型錄 id | `pg-gomoku` |
| source | `sampot/pg-gomoku`（與 `?open=`／compose `sam.source` 同源慣例） |
| 既有模式 | 本機雙人／人機／AI 對 AI **保留** |
| 本 MVP 新增 | **遠端邀請對弈**：Host 開 session＋鑄 `invite.compose`；Guest 經 compose 入座 |

### 5.2 Session protocol：`gomoku.v1`

薄協定即可；權威狀態在 **Host 場** session。

| 欄位 | 規格 |
| --- | --- |
| `protocolId` | `gomoku.v1` |
| `apiVersion` | `"1"` |
| `joinPolicy` | `invite_only` |
| roles（權限類） | `host`（恰好 1；兼執一方）、`player`（恰好 1；對手） |
| 棋盤 | 15×15；標準五連勝（與現有 SAM 規則對齊；禁手若現有未做則 MVP 不做） |
| 執子 | **先手固定黑**；Host 在「開始／再來一局」時以 `firstRole: host|player` 決定誰先 |
| `act` | **`start`**（僅 `host`；見下）— 無 payload；**`place`** — `{ row: 0..14, col: 0..14 }`；非 `active`／非己回合／佔格／終局後 → 拒絕 |
| 狀態投影 | `board`、`turn`（`black`｜`white`）、`status`（`waiting`｜`ready`｜`active`｜`ended`）、`winner`（可選）、座位／顯示名摘要 |
| 事件 | 狀態變更 fanout（對齊 DEC-023 通道；經 Roster 時走既有隧道） |

**宣告：** Host／Player 沙盒 `index.html` head 使用 `sam:protocol`（例：`gomoku.v1:host`／`gomoku.v1:player`）。邀請必須附**完整** protocol 物件（足以相容判斷），不得只傳 id 字串。

**開始語意（硬：按「開始」才開局）：**

| `status` | 條件 | 落子 |
| --- | --- | --- |
| `waiting` | 已開 session，尚缺 `player` 席 | 拒 `place`／`start` |
| `ready` | `player` 已入座；**尚未**開局 | 拒 `place`；僅 Host 可 `start` |
| `active` | Host 已執行 `start`（UI「開始」） | 雙方依回合 `place` |
| `ended` | 五連或無子可下（若實作和局） | 拒 `place`／`start`；Host 可 `reset` |

- Guest 入座 **只**把狀態推到 `ready`，**不**自動 `active`。  
- Host UI 在 `ready` 顯示「誰先（執黑）」＋主 CTA「**開始**」→ `act: start`（`payload.firstRole`）→ `active`（黑先手）。席未滿或非 Host → 拒絕 `start`。
- **再來一局（硬）：** 同 session／同席位；Host `act: reset`（僅 `ended`；可帶新 `firstRole`）→ 清空棋盤 → **直接 `active`**（player 仍在；等同已開始，黑先手，**不必**再按「開始」）；對手已離則 `waiting`。**禁止**把「一局」等同「一 Session」或強制重鑄 Invite／重連 WebRTC。結束連線／session 另用「結束這一場」。
- **結束這一場：** 殼 `close` 前須 fanout `session.closed` 給遠端席；Guest UI 顯示主持已結束（不可無聲斷線）。

### 5.3 `invite.compose` intent（五子棋）

對齊 [PG-PLATFORM-API-PLAN.md](./PG-PLATFORM-API-PLAN.md) `invite.compose` v1：

```text
kind: invite.compose
intent:
  version: 1
  sam:
    source: sampot/pg-gomoku   # 或與型錄／?open= 等價的可解析來源
    resolve: install_if_missing
    presentation: maximize_preview
  session:
    protocol: { …gomoku.v1 完整規格… }
    role: player
    consent: always_ask
  transport:
    roster:
      signal: true
```

| 規則 | 說明 |
| --- | --- |
| TTL | 預設 **5m**（開局後拉人，非預約） |
| Consent | 連結 ≠ 自動入座 |
| 放大 | `maximize_preview`＝場殼 `maximizePreview()`，非瀏覽器 Fullscreen |
| 鑄造 | `env.HOST.createPlatformInvite`（UI→`/api/online/invite`→functions.js；殼代理 mint＋answer＋share modal）。無記憶體 key → `not_provisioned`＋導向 dash／go 登入 |
| 呈現 | **殼頁共用分享 modal**（短網址＋QR；可蓋在最大化畫布之上）。五子棋 UI 鑄邀請後由殼彈出；「線上」tab 不作唯一入口 |
| Wire 上限 | Platform offer／answer 經 API，**不**套用 OOB／直掃 wire QR 的 ≈1200 上限（短網址才進 QR） |

---

## 6. 端到端流程（硬）

### 6.1 Host

```text
dash SSO（已註冊）
  →「登入我的遊樂場」→ provision → 預設場 #pg_provision=…
  → 場殼 redeem → 記憶體持 API key → 清 hash
  → 開啟 pg-gomoku（Host）
  → 開 session（gomoku.v1；status=waiting）
  → 邀請入座 → ready → 選先手 → start（先手執黑）
  →「邀請對手」→ createPlatformInvite(invite.compose)
  → 顯示 short_url／QR（目標＝`https://go.samkuo.me/i/…`）；場殼作答循環保持在線
  → Guest 入座後 status=ready → Host 按「開始」→ act:start → active
  → 輪流 place 至 ended
```

### 6.2 Guest

**目標主路徑（純玩版；見 [PG-GO-CLIENT-PLAN.md](./PG-GO-CLIENT-PLAN.md)）：**

```text
開 https://go.samkuo.me/i/<short_id>（無帳號；QR 預設）
  → 純玩 SPA；解 Invite／compose（無編輯環境、不寫持久 OPFS）
  → 記憶體載入 SAM player UI
  → 頁內同意入座（protocol 摘要）
  → 同意 → join＋protocol 閘（拒絕則不握手）
  → 尚無 PeerConnection → Guest offer → Host answer → Roster
  → player 席入座 → status=ready（等待 Host「開始」；此時不可落子）
  → Host start 後 active → 輪流 place 至 ended
```

**過渡／相容（場殼；go 落地前或除錯）：**

```text
開 api…/i/… 或 場 #pg=<secret>
  → （api 短鏈可 302 → go；舊行為曾 302 → 場 #pg=）
  → 場殼：開 SAM（install_if_missing／OPFS）→ maximize／play-first
  → 殼同意 modal → join…（同上）
```

**Guest UX 硬規則：** 受邀請方（消費者）**預設不看開發環境**。go 落地後＝根本無 IDE；場殼過渡路徑＝play-first（同 `view=canvas`：maximize＋隱藏 Files／編輯器／站頭；載入中也不閃 IDE）。AvatarsPanel 只負責連線／作答等傳輸面；產品同意入座＝頁內 modal。唯主動「看原始碼」才揭露完整殼（場殼路徑；非 go 主 CTA）。

### 6.3 失敗與粗暴恢復

| 情況 | 預期 |
| --- | --- |
| Host 未 provision | 鑄邀請失敗；頁內文案導向 dash「登入我的遊樂場」（禁止教貼 SecretStore key） |
| Invite 過期／撤銷 | Guest 可讀錯誤；可請 Host 重新邀請 |
| Host 離線（需新握手） | Guest 等 answer 超時；已連上 peer 不受短連結失效影響（資料面已在 WebRTC） |
| Guest 拒絕 consent | 不入座；不佔用成功 handshake |
| 斷線中局 | MVP：提示連線中斷；可重開邀請另開一局（不做完美重連） |

**UX 硬規則：** 禁止 `alert`／`confirm`／`prompt`；mobile-first（窄屏可完成邀請／加入／落子）。見 `.cursor/rules/no-native-dialogs.mdc`、`mobile-first-ux.mdc`。

---

## 7. 層職責

| 層 | 本 MVP 要做 |
| --- | --- |
| **`sampot/pg-gomoku`** | `gomoku.v1` Host／Player UI；邀請 CTA；`createPlatformInvite`／呈現短鏈；session open／act／終局；保留本機模式 |
| **場殼（本 repo）** | provision／compose／consent／作答／Roster 入座／act 隧道對 `gomoku.v1` 可跑；lazy install 來源解析；`not_provisioned` 文案 |
| **Platform API** | 既有 Invite／join／signal／TTL；本刀**不**改契約除非缺口阻擋五子棋 |
| **dash** | 僅 Host 入場；**不**加「鑄五子棋邀請」UI |
| **型錄** | 既有 `pg-gomoku` entry；可選後補 `protocols` 摘要（DEC-046）；**不**強制本刀改 picks |

**狗糧邊界：** `brainstorm.v1` 可續作自動化回歸；**文件與示範敘事**以本計劃五子棋為準。

---

## 8. 階段與完成定義

| Phase | 內容 | 完成定義 | 狀態 |
| --- | --- | --- | --- |
| **0. 契約** | 本文件；GLOSSARY／相關計劃交叉引用 | 載體／protocol／角色／非目標清楚 | **完成** |
| **1. Protocol＋SAM Host** | `gomoku.v1` meta；本機雙席或 stub player；`ready`→「開始」→`active` | Host 沙盒可 openSession＋start＋place＋終局（可暫不經 Platform） | **完成** |
| **2. 鑄邀請** | Host UI → `env.HOST.createPlatformInvite`；短鏈／QR；未 provision 錯誤 | 已 provision Host 取得 `go.samkuo.me/i/…` | **完成**（DEC-053） |
| **3. Guest compose** | `#pg=`／go `/i/` → 開五子棋 → consent → signal → 入座 | 無帳號 Guest 成 `player` 席 | **完成** |
| **4. 對弈 E2E** | 雙方落子至終局；手測清單通過 | 兩瀏覽器完成 §9（play Host＋go Host） | **進行中** |
| **5.（可選）** | 型錄 protocols 欄、docs 導讀、picks | 另議 | **部分**（型錄 `protocols` 已加） |

---

## 9. 驗收清單

- [ ] Host 經 dash provision 後，於五子棋 UI 鑄出短網址（後台無鑄入口）
- [ ] 無記憶體 key 時鑄邀請失敗，文案導向「登入我的遊樂場」
- [ ] Guest **無** Platform 登入即可開短連結（目標＝`go.samkuo.me/i/…`；見 [PG-GO-CLIENT-PLAN.md](./PG-GO-CLIENT-PLAN.md)）
- [ ] Consent 前可辨識為五子棋／`gomoku.v1`；拒絕則不入座
- [ ] Guest 入座後為 `ready`（不可落子）；僅 Host 按「開始」後才 `active`，雙方可交替落子至終局
- [ ] 連線後 session／棋步**不**經 Platform 中繼
- [ ] Invite 預設約 5m；過期後新 Guest 無法加入（已連線對局可粗暴處理）
- [ ] 窄螢幕可完成：複製／分享短鏈、同意入座、落子（主操作不靠 hover-only）
- [ ] 無原生 `alert`／`confirm`／`prompt`
- [ ] （官方 TURN 落地後）Host 已開通連線備援＋有點：在**無法直連**環境下仍完成連線→入座→開始→對弈；Host／Guest UI **不**顯示直連／轉發／TURN
- [ ] （同上）連線成功過程**無**「選擇備援／轉發」步驟；Guest 仍無 Platform 帳號

---

## 10. 文件與用語

| 用 | 不用 |
| --- | --- |
| 邀請對手、短網址、加入、入座、**開始** | 後台一鍵發會議連結、Lobby／房間服、Matchmaking 產品腔；入座自動開局 |
| 登入我的遊樂場、通行證（對讀者） | 教使用者貼 `pg_sk_`／寫入密鑰庫 |
| 五子棋、對弈、已連線 | 把 brainstorm 說成正式示範；對讀者說直連／TURN／relay |

敘事對齊 DEC-004：個人遊樂場邀請，非 SaaS 對戰平台。連線備援對人透明，對齊 [PG-PLATFORM-CREDITS-PLAN.md](./PG-PLATFORM-CREDITS-PLAN.md) §7.4。

---

## 修訂紀錄

| 日期 | 變更 |
| --- | --- |
| 2026-08-07 | 初版 Draft：載體 `pg-gomoku`；protocol `gomoku.v1`；Host 註冊／Guest 無帳號；E2E 階段與驗收 |
| 2026-08-07 | 開局改硬規則：`waiting`→`ready`（入座）→ Host「開始」／`act:start`→`active`；禁止入座自動開局 |
| 2026-08-07 | 實作開工：`pg-gomoku` gomoku.v1；場殼 `/api/shell/platform/invite`、`host-domain`、入座 reuse、compose 自動接受；型錄 protocols |
| 2026-08-07 | 邀請短網址／QR 改由**殼頁共用 modal**呈現（最大化畫布可見）；SAM 內嵌邀請盒降為次要 |
| 2026-08-07 | Guest `#pg=`：開 SAM＋maximize 後以**殼同意 modal**入座；不再把同意流程放進 AvatarsPanel／先露開發殼 |
| 2026-08-07 | 再來一局：同 session `act:reset`（`ended`→`active`，不必再按開始）；一局≠一 Session；禁強制重邀 |
| 2026-08-07 | §3.1／§9：有權 Host＋官方 TURN 時無法直連仍須能對玩；Host／Guest 不分辨傳輸路徑（對齊點數計劃） |
| 2026-08-16 | DEC-053：UI→`/api/online/*`→`env.HOST`；play／go 雙殼皆可鑄邀請；短網址 canonical＝`go…/i/…`；Phase 1–3 標完成 |
