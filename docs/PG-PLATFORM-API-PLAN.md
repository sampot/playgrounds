# Playgrounds Platform API 計劃（DEC-047）

> **狀態：** Phase 0 **完成**；Phase 1 **進行中**（`platform-api/` Worker）  
> **權威決策：** [DECISIONS.md](./DECISIONS.md) **DEC-047**  
> **相關：** DEC-023（session 邀請＋完整 protocol）、DEC-025（`?open=`／放大畫布）、DEC-029（SecretStore）、DEC-042（場網／保留名 `api`）、DEC-045（Roster／薄 signaling）、DEC-046（型錄查詢）、[PG-ROSTER-PLAN.md](./PG-ROSTER-PLAN.md)、[GLOSSARY.md](./GLOSSARY.md)

一句話：**獨立 Cloudflare Workers 上的 Platform API＋後台——以 Invite（一連結多人加入）＋短命 join capability 為中心；已有 PeerConnection 則重用；僅尚未連線時走 Ticket 路徑 signaling（加入者 offer、long-poll 等 answer、握手排隊）。Invite 預設 TTL＝5m（session 已開始後的初始動作，非預約）。近程 `invite.compose`（開 SAM、放大畫布、詢問入座）。短連結為 QR 預設。註冊邀請制＋Social SSO；每帳號一把 API key（SecretStore 保留名）。**

---

## 動機

- Roster Phase 4 需要可選 **rendezvous**（不必 OOB 貼 wire），但仍須守 DEC-045：不中繼資料面、非 trickle、每輪 1× O／A。
- 使用者習慣：**一條邀請連結／一張 QR，多人加入**；邀請者（session host）須在線才能完成 WebRTC——離線本來就連不上。
- 近程情境：邀請連結 → 開場 → 安裝／啟動指定 SAM → **放大畫布** → 詢問是否加入 session → 同意後入座（會議、遊戲等）。
- 若只做「Roster 專屬 CF room」會再長第二套邀請系統；應先定 **Platform**，signaling 當第一個資源。

## 目標

- 部署於 **Cloudflare Workers**（**獨立**於場殼 Worker；建議 **`api.samkuo.me`**）。
- 同部署提供 **HTTP API** 與 **後台管理 UI**。
- **Invite**：一條短連結／深鏈；**多人可經同一連結加入**。
- **Ticket 路徑 signaling**：邀請者**不**預產 offer；加入者提交 offer，**同一邏輯回合**等待 answer；邀請者**排隊串行**作答（同時僅一筆 handshake）。**若雙方已有 PeerConnection → 重用，不跑 signaling。**
- 連上後 **Roster 可同時持有多 peer**（Platform 只負責串行發握手；見 DEC-045）。
- 近程：`invite.compose`（SAM＋放大畫布＋完整 protocol＋consent）。
- **短連結** `/i/<short_id>`：正式支援；**邀請 QR 預設**。
- 身分：邀請制註冊、Social SSO、不存密碼、可要求 MFA；每帳號 API key **1** 把。

## 非目標

- Session／DataChannel／presence／mailbox／檔案中繼；trickle ICE；renegotiation；預設營運 TURN。
- 平行多筆 WebRTC handshake（忙線＝**排隊**，不是並行建 PC）。
- 場網每 name 雲端租戶；跨 origin 自動搬 OPFS／SecretStore。
- 平台存密碼；自助公開註冊；通用 URL 縮址。
- 瀏覽器 Fullscreen API（放大＝場殼 **放大畫布**／`maximizePreview`）。
- 改 OOB `#roster=`／QR／文字路徑的 offer-first 時序（**僅 Ticket／Platform 路徑**改角色）。

---

## 部署與邊界

| 項 | 決定 |
| --- | --- |
| Host | **獨立** Worker（勿併進場殼 `dist`） |
| 公開 URL | 建議 **`https://api.samkuo.me`**（DEC-042 保留名 `api`） |
| 路徑 | `/v1/...`、`/admin/...`、**`/i/<id>` 短連結** |
| 場殼設定 | 可選 `PUBLIC_PLATFORM_API_URL` |
| 資料面 | **永不**經 Platform；連上後只走 WebRTC／本機 session |

**層分工：**

| 層 | 職責 |
| --- | --- |
| Platform API | 帳號／key／Invite／join／signal mailbox（排隊）；限流 |
| 場殼 | `#pg=`、redeem、開 SAM、`maximizePreview`、consent；邀請者側作答循環 |
| Roster | **可同時多 peer**；每 peer 一條 DataChannel／Avatar |
| Session（DEC-023） | 入座權威、protocol 閘、`act`／事件 |

**一句話：** Platform **串行發握手**；Roster **並行持連線**。

---

## 身分與憑證

### 分層（勿混）

| 層 | 說明 |
| --- | --- |
| **Platform 帳號** | 邀請制＋**Social SSO**；**不存密碼**；可要求 **MFA** |
| **API key** | 後台自管；**每帳號最多 1 把**；僅建立時顯示／可複製 |
| **SecretStore `PLAYGROUNDS_API_KEY`** | 場內持有 key 副本（DEC-029） |
| **Invite／`#pg=`** | 場邀請；接收者通常**無** Platform 帳號 |
| **Platform 加入邀請** | admin 核發註冊用——**≠** 場 Invite |

### Bootstrap

- `ADMIN_BOOTSTRAP_TOKEN`（**一次性** CF secret）→ 綁第一個 admin SSO → 作廢。
- 之後僅 SSO（＋政策 MFA）。

### 角色

| 角色 | 能力 |
| --- | --- |
| **user**（＋有效 API key） | 鑄 Invite／`invite.compose`／signal；自管唯一 API key |
| **admin** | 同上＋Platform 註冊邀請、停用使用者、營運 |
| **無帳號** | 僅能經 Invite 連結加入，不能鑄邀請 |

### API key／SecretStore／註冊邀請

- API key：建立時顯示一次；伺服器只存 hash；輪替＝撤舊發新。
- 場內：`env.secrets.PLAYGROUNDS_API_KEY.get()`；永不進 `.sam`。
- 註冊：`https://api.samkuo.me/join/<token>`（與 `#pg=` 分開）。

---

## Invite 模型（一連結、多人）

設計中心＝**Invite**（穩定短連結＋intent）；每次加入＝一次 **join**（短命 capability＋可選 handshake 槽）。

### Invite（邏輯）

| 欄位 | 說明 |
| --- | --- |
| `id`／深鏈 secret | 高熵；`#pg=<secret>` |
| `short_id` | 短連結 id；**對 Invite 穩定**（多人共用同一 `/i/…`） |
| `kind` | `signal.handshake`／`invite.compose`／… |
| `intent` | 宣告式意圖（無 WebRTC offer） |
| `created_by` | user／API key id |
| `expires_at` | Invite TTL（**預設 5m**） |

| `max_joins?` | 可選上限；省略則靠 rate limit |
| `state` | `open`／`revoked`／`expired` |

**硬規則：**

- 邀請者鑄 Invite 時**不**產生 WebRTC offer。
- **一條邀請連結**（短 URL 或深鏈）；**多人可經同一連結加入**（符合使用習慣）。
- 每位加入者 redeem／join 時取得**一次性** join capability（及 signal 槽）；不是「整張 Invite 用一次就廢」。
- Invite TTL 到或撤銷 → 短連結失效；已連上的 peer **不受影響**（資料面已在 WebRTC）。
- **預設 TTL＝5 分鐘**：邀請是 session **已開始**後拉人進來的初始動作，**不是**預約制；可回應窗口短。

### Kind

| kind | 用途 | 階段 |
| --- | --- | --- |
| `signal.handshake` | 僅薄 O／A（Roster 連線） | P1–2 |
| `invite.compose` | 開 SAM＋放大畫布＋可選 session＋可選 signal | P4 |
| 其他 | 預留 | — |

### 深鏈與短連結

| 形狀 | 角色 |
| --- | --- |
| `https://<field>/#pg=<invite_secret>` | 場內權威深鏈；處理後清除 hash |
| `https://api.samkuo.me/i/<short_id>` | **短連結**；302 → `#pg=`；**QR 預設** |

- 鑄 Invite 回傳 `short_url`＋場深鏈。
- `short_id`：高熵、URL-safe；與 Invite 同壽命；非可列舉序號。
- 短連結視同 secret；不另做公開預覽頁洩漏 intent。
- 並存：`?open=`、`#roster=<wire>`（OOB）、`#pg=`／`/i/`（Platform）。

---

## Ticket 路徑 Signaling（角色對調＋排隊）

**僅適用 Platform Invite／Ticket。** OOB（QR／文字／`#roster=`）仍為：發起者出 offer → 對方回 answer（DEC-045 既有 UX）。

### 時序

```text
Alice: POST /invites  (intent only，無 offer)
       → 一個 short_url
       → 場殼開始「作答循環」（取隊列頭／回 answer）

Bob:   打開同一連結 → …
       若已與 Alice 有 peer → 重用，跳過 signal
       否則：建 PC、產 offer
       POST …/offer  (body=wire)  ── long-poll 等 answer ──┐
                                                           │
Carol: 同上；需新連線則進**排隊**                          │
                                                           │
Alice: dequeue Bob → setRemote → createAnswer → PUT answer ┘
       Bob 得 200+answer → 連線；保留 peer
Alice: dequeue Carol → …（下一筆 handshake）
```

### 硬規則

| 規則 | 說明 |
| --- | --- |
| **已連線則重用** | 邀請者與加入者**若已有**可用的 PeerConnection（已在對方 Roster／名冊上）→ **重用該連線**；**不**再走 WebRTC signaling（不產 offer／answer、不佔握手隊列） |
| **signaling 時機** | **僅**雙方尚未連線（或既有 peer 已斷／不可用）時才進行 O／A |
| 誰出 offer | **加入者（offerer）**（僅在需 signaling 時） |
| 誰出 answer | **邀請者／session host（answerer）** |
| 每輪 | 恰好 **1× offer**＋**1× answer**；非 trickle；同一壓縮 wire |
| 並發握手 | **禁止**；忙線＝**排隊**（FIFO） |
| Host 離線 | 需新連線時：加入者等不到 answer → 超時失敗（預期）。已有 peer 則可繼續走 session／intent，不依賴 host 當時在線作答 |
| 用完即銷 | 該 **join／handshake 槽**銷毀；Invite 本身可繼續給下一人 |
| 無資料面 | 不轉發 DataChannel／session／FS |
| 連線結果 | 邀請者場 **可同時維持多條**已完成之 peer（Roster 需求） |

**判定「已有連線」（場殼）：** 以本機 Roster 是否已有對該對端的 **connected** peer 為準（穩定 peer id／既有约定）。斷線、失敗、或使用者明確結束 → 視為未連線，下次加入可再 signaling。**禁止**對已連線 peer 做 renegotiation／第二輪 O／A 走 Platform（與 DEC-045 無重談一致）。

### 排隊與 long-poll

- 加入者 `POST offer`：**同一邏輯回合**等待 answer（HTTP long-poll；Workers 時限內可**自動續 poll**，對使用者仍為一回合）。
- 隊列中的請求不平行建 PeerConnection；邀請者一次只作答一筆。
- 超時／Invite 過期／撤銷 → 該 join 失敗；可再試（新 join 嘗試）。
- 建議實作：Durable Object per Invite（隊列＋當前 handshake 狀態機）。

### 與 OOB 對照

| | OOB `#roster=`／QR／文字 | Platform Invite |
| --- | --- | --- |
| Offer 來自 | 發起者 | **加入者** |
| Answer 來自 | 加入者 | **邀請者** |
| 多人同一連結 | 不適用（wire 綁單次） | **適用**（一連結多 join） |
| 同時 handshake | 通常一筆 | **排隊串行** |
| 連上後多 peer | 規格要求可多 peer | 同左 |

---

## Intent：`invite.compose`

```text
invite.compose v1
├─ sam
│   ├─ source            # 與 ?open= 同源
│   ├─ resolve           # install_if_missing | require_installed
│   └─ presentation      # maximize_preview
├─ session
│   ├─ protocol          # 完整規格（硬）
│   ├─ role
│   └─ consent           # always_ask
├─ transport?
│   └─ roster.signal     # 走上方 Ticket 路徑 signaling
└─ ux?
    └─ confirmOpen?
```

### 硬規則

- `session.protocol` 必須完整；同意前可知將入何種 session。
- Consent 不可省；連結 ≠ 自動入座。
- `maximize_preview`＝`maximizePreview()`（**不是**瀏覽器全螢幕）。
- 未連上前以 Invite 內嵌 protocol 為準。

### 場殼兌換順序（加入者）

1. 打開短連結／`#pg=` → （可選）確認。
2. 讀 intent；展示 protocol 摘要。
3. 開 SAM（DEC-025 管線）→ `maximizePreview()`。
4. 詢問是否加入 session；同意 → 閘門＋join。
5. **連線：** 若與邀請者**已有** PeerConnection → **重用**，跳過 signaling。否則（尚未連線）本機產 **offer** → `POST offer`（等 answer）→ 設 answer → 連線。
6. 拒絕 → 可不入座；不佔用成功 handshake。

### 場殼作答循環（邀請者／host）

1. Invite 建立後，若預期有人需**新**連線，保持在線作答（離線則新加入者超時）。
2. 取隊列頭的 pending offer → 產 answer → 寫回（**僅**處理尚未連線者）。
3. 連線成功後 **保留**既有 peers，繼續處理隊列下一個。
4. 已在名冊上的對端再開同一 Invite（例如只為 session／compose）→ **不**進握手隊列。

---

## HTTP API 大綱（v1）

前綴：`/v1`  
Auth：`Authorization: Bearer <api_key|join_cap|…>`。

| 方法 | 路徑 | 憑證 | 行為 |
| --- | --- | --- | --- |
| `POST` | `/invites` | API key | 鑄 Invite（`kind`＋`intent`；**無 offer**）；回傳 `short_url`＋深鏈 |
| `GET` | `/i/:short_id` | 無 | **302** → `#pg=<invite_secret>` |
| `GET` | `/invites/:secret` | 公開持鏈或 key | 預覽 intent（可限流） |
| `POST` | `/invites/:secret/joins` | 持鏈 | 開一次 join；回傳短命 `join_cap` |
| `POST` | `/invites/:id/signal/offer` | join_cap | 寫入 offer；**long-poll** 直到 answer／超時／取消 |
| `GET` | `/invites/:id/signal/pending` | API key（host） | 取隊列頭 pending offer（或 long-poll 等下一個） |
| `PUT` | `/invites/:id/signal/answer` | API key（host） | 對當前頭寫 answer；喚醒對應 offer long-poll |
| `DELETE` | `/invites/:id` | API key | 撤銷 Invite（短連結失效） |

錯誤：`401`／`403`／`404`／`408`／`410`／`429`；隊列滿可視情況 `503`＋稍後自動重試（仍排隊語意）。

**Rate limit：** 每 IP／每 key／每 Invite 的 join 與 offer 嘗試；可疊 CF WAF。

Admin 路徑與上表信任域分離（SSO cookie ≠ API key）。

---

## 後台 UI（MVP）

1. Social SSO；（政策）MFA。
2. **我的 API key：** 建立（一次顯示）／輪替／撤銷；硬頂 1。
3. **Admin：** Platform 註冊邀請；可選停用使用者。
4. （後段）Invite／隊列除錯、用量。

---

## 安全與隱私

- Invite 短連結、API key、join_cap 視同 secret。
- Wire：TLS；日誌截斷；handshake 槽短命。
- Host 必須在線作答；規格不承諾離線入座。
- CORS：場 origin 策略文件化。
- SecretStore：重整＝lock。

---

## 與既有深鏈對照

| 載體 | 權威 | 用途 |
| --- | --- | --- |
| `?open=` | 無 Platform | 開 SAM |
| `#roster=<wire>` | 無伺服器 | OOB；**發起者 offer** |
| `#pg=`／`/i/` | Platform Invite | **一連結多人**；Ticket 路徑 **加入者 offer** |
| `/join/<token>` | Platform | 僅註冊 SSO |

---

## 階段

| Phase | 內容 | 完成定義 | 狀態 |
| --- | --- | --- | --- |
| **0. 契約** | DEC-047、本計劃、GLOSSARY；Roster 多 peer＋交叉引用 | 語意無歧義 | **完成** |
| **1. Signal MVP** | Invite＋排隊 O／A（加入者 offer）；API key；bootstrap／SSO 最小；**TTL 5m** | 一人加入可跑通；二人排隊可串行 | **進行中**（`platform-api/`） |
| **2. 深鏈＋短連結＋場殼** | `#pg=`／`/i/`；QR 短 URL；Roster 接上；**多 peer 並存** | 同一短連結兩人先後加入且雙方名冊可見 | 未開始 |
| **3. 後台** | API key UI；註冊邀請；admin | 使用者自助持 key | 未開始 |
| **4. invite.compose** | protocol＋開 SAM＋放大畫布＋consent | 掃短鏈可走到詢問入座 | 未開始 |
| **5.（可選）** | MFA、用量、自架文件 | 另檢 | 未開始 |

---

## 修訂紀錄

| 日期 | 變更 |
| --- | --- |
| 2026-08-06 | 初版 Draft |
| 2026-08-06 | 短連結 `/i/` 正式支援；QR 預設短 URL |
| 2026-08-06 | **Invite 一連結多人**；Ticket 路徑改加入者 offer＋long-poll 等 answer；握手**排隊**串行；Host 離線＝超時；OOB 不變；對齊 Roster **多 peer** |
| 2026-08-06 | **已有 PeerConnection 則重用**；WebRTC signaling **僅**尚未連線時 |
| 2026-08-06 | Invite 預設 TTL **5m**（session 開始後初始動作，非預約）；Phase 1 `platform-api/` 開工 |
