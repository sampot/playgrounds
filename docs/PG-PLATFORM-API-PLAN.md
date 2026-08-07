# Playgrounds Platform API 計劃（DEC-047）

> **狀態：** Phase 0 **完成**；Phase 1–4 **完成**（Signal／`#pg=`／後台／compose 場殼兌換）；Phase 5 **進行中**（GitHub＋Google SSO／access token／HOST 殼代理／**field provision＋記憶體通行證**已落地；MFA 未）  
> **權威決策：** [DECISIONS.md](./DECISIONS.md) **DEC-047**  
> **後台 UI 規格：** [PG-PLATFORM-DASH-SPEC.md](./PG-PLATFORM-DASH-SPEC.md)  
> **相關：** DEC-023（session 邀請＋完整 protocol）、DEC-025（`?open=`／放大畫布）、DEC-029（SecretStore＝**BYOK**；**不含** Platform API key）、DEC-042（場網／保留名 `api`）、DEC-045（Roster／薄 signaling）、DEC-046（型錄查詢）、[PG-ROSTER-PLAN.md](./PG-ROSTER-PLAN.md)、[PG-PLATFORM-CREDITS-PLAN.md](./PG-PLATFORM-CREDITS-PLAN.md)（點數／官方 TURN Draft）、[PG-INVITE-E2E-MVP.md](./PG-INVITE-E2E-MVP.md)（代表性 E2E＝五子棋）、[GLOSSARY.md](./GLOSSARY.md)

一句話：**獨立 Cloudflare Workers 上的 Platform API＋後台——以 Invite（一連結多人加入）＋短命 join capability 為中心；已有 PeerConnection 則重用；僅尚未連線時走 Ticket 路徑 signaling（加入者 offer、long-poll 等 answer、握手排隊）。Invite 預設 TTL＝5m（session 已開始後的初始動作，非預約）。近程 `invite.compose`（開 SAM、放大畫布、詢問入座）。短連結為 QR 預設。註冊邀請制＋Social SSO；後台＝access token；**Host 入場＝dash「登入我的遊樂場」→ 短命 provision → 場殼記憶體持 API key（每帳號一把、每次輪替、∉ SecretStore）**。**

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
- 身分：邀請制註冊、Social SSO、不存密碼、可要求 MFA；後台 **access token**；每帳號 API key **1** 把（僅場殼**記憶體**；經 dash provision）。

## 非目標

- Session／DataChannel／presence／mailbox／檔案中繼；trickle ICE；renegotiation；**預設**／免費無限營運 TURN；**使用者自備 TURN**（DEC-045）；官方 TURN＋點數制另見 [PG-PLATFORM-CREDITS-PLAN.md](./PG-PLATFORM-CREDITS-PLAN.md)（**訂閱制**非目標）。
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
| 公開 URL | **`https://api.samkuo.me`**（API）；**`https://dash.samkuo.me`**（後台 UI，同 Worker 別名；DEC-042 保留名 `api`／`dash`） |
| 路徑 | `/v1/...`、後台 `/`（dash）、**`/i/<id>` 短連結**（canonical 在 api） |
| 場殼設定 | 可選 `PUBLIC_PLATFORM_API_URL` |
| 資料面 | **永不**經 Platform；連上後只走 WebRTC／本機 session |

**層分工：**

| 層 | 職責 |
| --- | --- |
| Platform API | 帳號／key／Invite／join／signal mailbox（排隊）；限流 |
| 後台 UI（`dash`） | **統一進入**；登入後 **access token**；主 CTA「登入我的遊樂場」（provision）；依角色（user＝遊樂場／帳號；admin＝＋營運）；**不**鑄場 Invite；**不以** API key 當後台 session |
| 場殼 | redeem provision → **記憶體**持 API key；代理 SAM 呼叫 Platform；`#pg=` redeem、`maximizePreview`、consent；邀請者作答循環 |
| SAM | **發起**鑄場邀請（經殼代理取得 `short_url`／深鏈並呈現） |
| Roster | **可同時多 peer**；每 peer 一條 DataChannel／Avatar |
| Session（DEC-023） | 入座權威、protocol 閘、`act`／事件 |

**一句話：** Host 入場＝**dash → provision → 場殼記憶體**；場邀請 URL＝**SAM → 殼代理 → API**；Platform **串行發握手**；Roster **並行持連線**。

---

## 身分與憑證

### 分層（勿混）

| 層 | 說明 |
| --- | --- |
| **Platform 帳號** | 邀請制＋**Social SSO**；**不存密碼**；可要求 **MFA**；後台持 **access token** |
| **API key** | 每帳號最多 **1** 把；**僅遊樂場殼頁記憶體**；經 dash「登入我的遊樂場」輪替＋provision 取得；**∉ SecretStore**；**不做場內 SSO** |
| **Access token** | 後台 UI 登入後呼叫帳號／通行證／admin API 的憑證；**≠** API key |
| **Provision token** | 短命、單次；deep link 交接用；redeem 後作廢；**URL 永不帶 `pg_sk_`** |
| **Invite／`#pg=`** | 場邀請；接收者通常**無** Platform 帳號 |
| **Platform 加入邀請** | admin 核發註冊用——**≠** 場 Invite、**≠** provision |

### Bootstrap

- `ADMIN_BOOTSTRAP_TOKEN`（**一次性** CF secret）→ 綁第一個 admin SSO → 作廢。
- 之後僅 SSO（＋政策 MFA）→ access token。

### 角色

| 角色 | 能力 |
| --- | --- |
| **user**（後台：access token；場：記憶體有效 API key） | 後台「登入我的遊樂場」／撤銷／預設場；場殼鑄 Invite／`invite.compose`／signal |
| **admin** | 同上＋Platform 註冊邀請、停用使用者、營運（後台持 access token） |
| **無帳號** | 僅能經 Invite 連結加入，不能鑄邀請、不能 provision |

### API key／provision／註冊邀請

- API key：伺服器只存 hash；「登入我的遊樂場」＝**輪替**（舊立刻失效＝**單席**，避免共用）；明文經 redeem **一次**進場殼記憶體。
- 場內：**不**寫 SecretStore、**不**掛 `env.secrets.PLAYGROUNDS_API_KEY`；殼代理讀記憶體。關頁／重整＝清空。
- Provision：TTL 建議 60–120s；單次；可選綁目標 origin。
- 預設遊樂場網址：帳號偏好；初版允許清單＝官方 `*.samkuo.me` 場（排除保留名）；預設 `https://play.samkuo.me`。
- 註冊：`https://dash.samkuo.me/join/<token>`（與 `#pg=`／`#pg_provision=` 分開）。
- 後台：**不以** API key 登入或當 Bearer；僅 SSO → access token（見 DASH-SPEC §5）。
- **廢止：** 以 SecretStore `PLAYGROUNDS_API_KEY` 為 Platform 主路徑（實作債務須汰除）。

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
Auth：`Authorization: Bearer <access_token|api_key|join_cap|…>`（依端點允許的憑證類型）。

| 方法 | 路徑 | 憑證 | 行為 |
| --- | --- | --- | --- |
| `GET` | `/me` | access token | 目前使用者／角色／key prefix／`default_field_url` |
| `PATCH` | `/me` | access token | 更新偏好（至少 `default_field_url`；允許清單校驗） |
| `DELETE` | `/me` | access token | 刪除自己的帳戶（`last_admin` → 409） |
| `DELETE` | `/me/sso/github`／`/me/sso/google` | access token | 解除 SSO（至少保留一個；`last_sso` → 409） |
| `POST` | `/field/provision` | access token | **輪替**場用 API key＋核發短命 provision；回 `provision_token`／`expires_at`／`field_url`（含 `#pg_provision=`）；**不**回 `pg_sk_` |
| `POST` | `/field/provision/redeem` | provision token（body 或 Bearer 約定） | 單次兌換 → 回 `api_key` 一次；作廢 token；錯／過期／已用 → 4xx |
| `DELETE` | `/keys` | access token | 撤銷場用 API key（不登出後台） |
| `GET` | `/admin/users` | access token＋admin | 列出註冊使用者 |
| `POST` | `/admin/users/:id/disable`／`enable` | access token＋admin | 停用／復用（不可對自己；`last_admin`） |
| `POST` | `/admin/registration-invites` | access token＋admin | 核發註冊邀請 |
| `GET` | `/join/:token` | 無 | 註冊邀請狀態（dash landing） |
| `POST` | `/invites` | **API key**（場殼） | 鑄 Invite（`kind`＋`intent`；**無 offer**）；回傳 `short_url`＋深鏈 |
| `GET` | `/i/:short_id` | 無 | **302** → `#pg=<invite_secret>` |
| `GET` | `/invites/:secret` | 公開持鏈或 key | 預覽 intent（可限流） |
| `POST` | `/invites/:secret/joins` | 持鏈 | 開一次 join；回傳短命 `join_cap` |
| `POST` | `/invites/:id/signal/offer` | join_cap | 寫入 offer；**long-poll** 直到 answer／超時／取消 |
| `GET` | `/invites/:id/signal/pending` | **API key**（host／場殼） | 取隊列頭 pending offer（或 long-poll 等下一個） |
| `PUT` | `/invites/:id/signal/answer` | **API key**（host／場殼） | 對當前頭寫 answer；喚醒對應 offer long-poll |
| `DELETE` | `/invites/:id` | **API key**（場殼） | 撤銷 Invite（短連結失效） |

錯誤：`401`／`403`／`404`／`408`／`410`／`429`；隊列滿可視情況 `503`＋稍後自動重試（仍排隊語意）。

**Rate limit：** 每 IP／每 key／每 Invite 的 join 與 offer 嘗試；provision redeem 嚴格限流；可疊 CF WAF。

**信任域：** 後台帳號面＝**access token**；Host 交接＝**provision**；場 Invite／signal＝**API key**；join＝**join_cap**。四者勿混用用途。

**廢止／過渡：** 後台 `POST /keys` 揭示明文供貼密鑰庫——改由 provision／redeem；過渡期可保留撤銷 `DELETE /keys`。

---

## 後台 UI

**權威 UI 規格：** [PG-PLATFORM-DASH-SPEC.md](./PG-PLATFORM-DASH-SPEC.md)

**Host：** `https://dash.samkuo.me`（與 `api.samkuo.me` 同 Worker；`api` 根路徑 302→dash）。

摘要（細節以 DASH-SPEC 為準）：

1. Social SSO：**GitHub 必做、Google 次做**；（政策）MFA → **access token**。
2. 後台登入後 API：**僅 access token**；**API key 專供場殼記憶體**。
3. **登入我的遊樂場：** provision（輪替＋深鏈）；單席說明；預設遊樂場網址；通行證 status／撤銷。**不**以貼 `PLAYGROUNDS_API_KEY` 為主路徑。
4. **Admin：** Platform **註冊**邀請（`/join/<token>`）；**管理註冊使用者**（列表／停用／復用）；用量後段。帳號 tab：SSO 連結／解除（≥1）、自刪帳戶。
5. **不鑄場 Invite**——短網址由 **SAM → 殼代理 → API**（持記憶體 API key；見 DASH-SPEC §7）。
6. **不做場內 SSO。**
7. 品牌與場殼同一色票／頂欄族；DEC-004 非產品腔。

---

## 安全與隱私

- Invite 短連結、API key、access token、provision token、join_cap 視同 secret。
- Wire：TLS；日誌截斷；handshake 槽短命；**勿**把 `pg_sk_` 寫進 URL／Referer 可達處。
- Host 必須在線作答；規格不承諾離線入座。
- CORS：場 origin 策略文件化。
- SecretStore（DEC-029）：仍為 BYOK；重整＝lock；**與 Platform 通行證無關**。
- 場殼 Platform key：僅記憶體；document 卸載清空。

---

## 與既有深鏈對照

| 載體 | 權威 | 用途 |
| --- | --- | --- |
| `?open=` | 無 Platform | 開 SAM |
| `#roster=<wire>` | 無伺服器 | OOB；**發起者 offer** |
| `#pg=`／`/i/` | Platform Invite | **一連結多人**；Ticket 路徑 **加入者 offer** |
| `#pg_provision=` | Platform provision | Host 通行證交接（單次）；**≠** 場 Invite |
| `/join/<token>` | Platform | 僅註冊 SSO |

---

## 階段

| Phase | 內容 | 完成定義 | 狀態 |
| --- | --- | --- | --- |
| **0. 契約** | DEC-047、本計劃、GLOSSARY；Roster 多 peer＋交叉引用 | 語意無歧義 | **完成** |
| **1. Signal MVP** | Invite＋排隊 O／A（加入者 offer）；API key；bootstrap；**TTL 5m** | 一人加入可跑通；二人排隊可串行 | **完成** |
| **2. 深鏈＋短連結＋場殼** | `#pg=`／`/i/`；QR 短 URL；Roster 接上；**多 peer 並存** | 同一短連結兩人先後加入且雙方名冊可見 | **完成** |
| **3. 後台** | API key UI；註冊邀請 claim；admin；`dash.samkuo.me`；品牌對齊場殼 | 使用者自助持 key | **完成**（claim；完整 SSO→P5） |
| **4. invite.compose** | protocol＋開 SAM＋放大畫布＋consent | 掃短鏈可走到詢問入座 | **完成** |
| **5.（可選）** | 完整 Social SSO（GitHub→Google）、MFA、用量、自架文件；**provision／記憶體通行證** | 見 [PG-PLATFORM-DASH-SPEC.md](./PG-PLATFORM-DASH-SPEC.md) §9.2 | **進行中**（SSO／access token／HOST invite／**provision＋場殼記憶體**已落地；MFA 未） |

---

## 修訂紀錄

| 日期 | 變更 |
| --- | --- |
| 2026-08-06 | 初版 Draft |
| 2026-08-06 | 短連結 `/i/` 正式支援；QR 預設短 URL |
| 2026-08-06 | **Invite 一連結多人**；Ticket 路徑改加入者 offer＋long-poll 等 answer；握手**排隊**串行；Host 離線＝超時；OOB 不變；對齊 Roster **多 peer** |
| 2026-08-06 | **已有 PeerConnection 則重用**；WebRTC signaling **僅**尚未連線時 |
| 2026-08-06 | Invite 預設 TTL **5m**（session 開始後初始動作，非預約）；Phase 1 `platform-api/` 開工 |
| 2026-08-06 | **`dash.samkuo.me`** 後台別名；Phase 3 API key dashboard／註冊邀請 landing |
| 2026-08-06 | Phase 1–4 場殼打通：`#pg=`、host 作答循環、多 peer、compose、註冊 claim；完整 SSO 改 Phase 5 |
| 2026-08-06 | 後台 UI 權威規格 → [PG-PLATFORM-DASH-SPEC.md](./PG-PLATFORM-DASH-SPEC.md)；SSO＝GitHub 必做／Google 次做 |
| 2026-08-06 | 場邀請 URL＝SAM→殼代理→API；後台不鑄場 Invite |
| 2026-08-06 | 後台統一進入；依角色顯示；user 不見營運 UI |
| 2026-08-06 | 後台＝access token；API key＝僅場殼 |
| 2026-08-06 | 實作 access token（`pg_at_`）；帳號面／場 API 憑證分離 |
| 2026-08-06 | 移除後台 API key 登入（`/v1/auth/token`） |
| 2026-08-07 | **Host provision：** dash「登入我的遊樂場」→ 短命 token → 場殼記憶體 API key；∉ SecretStore；單席輪替；預設場網址；不做場內 SSO |
