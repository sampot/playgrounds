# Playgrounds Platform 點數制與有成本備援（官方 TURN）

> **狀態：** Draft（2026-08-07；**2026-08-16** 修訂：啟用備援＝relay-only）— 契約／階段草案；DEC-045／047 已否決自備 TURN；官方 TURN／點數實作進行中  
> **權威決策：** [DECISIONS.md](./DECISIONS.md) **DEC-045**（否決自備 TURN；官方 TURN 另段）、**DEC-047**（非目標含自備 TURN）；點數帳本可另立 DEC（建議 **DEC-049** Draft）  
> **相關：** [PG-PLATFORM-API-PLAN.md](./PG-PLATFORM-API-PLAN.md)、[PG-PLATFORM-DASH-SPEC.md](./PG-PLATFORM-DASH-SPEC.md)、[PG-ROSTER-PLAN.md](./PG-ROSTER-PLAN.md)、[PG-INVITE-E2E-MVP.md](./PG-INVITE-E2E-MVP.md)、[PG-GO-CLIENT-PLAN.md](./PG-GO-CLIENT-PLAN.md)（Guest 純玩／短鏈＠go）、DEC-004（非協作 SaaS）、DEC-029（SecretStore＝LLM 等 BYOK；**不含** TURN）、[GLOSSARY.md](./GLOSSARY.md)

一句話：**Platform 註冊帳號採點數制（非訂閱）；跨網備援僅官方 TURN（按消耗扣點）；不支援自備 TURN；Host 啟用備援時該次 session 邀請以 relay 為傳輸路徑（不嘗試 WebRTC 直連）；路徑對人透明；扣點掛 Host。**

---

## 1. 動機

- Roster／Platform Invite 連上後資料面走 WebRTC；許多網路環境無法直連，需要 **TURN 轉發** 作後備。
- TURN 有實質雲費（分鐘／流量）；**不能**當所有註冊使用者的免費無限預設。
- **自備 TURN**（填 URI／帳密）UX 過差，已由 **DEC-045／047 否決**為產品路徑。
- 因此跨網備援的正式解＝**Platform 官方 TURN**，並以**點數制**回收成本（非訂閱）。
- **訂閱制**不適合：消耗與月費難對齊，且易把後台敘事拉成 SaaS「方案／席位」。

---

## 2. 目標

- 定 **點數帳本**（每 Platform 帳號一餘額）與**扣點規則**（僅實際消耗官方備援時）。
- 定 **entitlement**（能否使用官方 TURN）與餘額正交：無 entitlement → 不可簽發 hosted cred；有 entitlement 但餘額不足 → 拒絕或降級。
- 首項（且連線備援上**唯一**）計費能力：**官方 TURN**（Platform 簽發短命 ICE／TURN credentials）。
- Guest（無 Platform 帳號）可繼續經 Invite 入座；**不**直接持點數、**不**被要求註冊才能連線。
- 扣點與配額掛在 **Host**（鑄 Invite／開該次連線的註冊使用者）。
- Dash／場殼用語避開「方案、訂閱、Pro、Billing」產品腔；對讀者用「點數」；營運可說「連線備援」。
| **後台（必做契約）：** 使用者可看**剩餘點數**與**每個 session 扣點**；可自設是否**使用連線備援**（`turn_prefer`；需 admin 已開通 `turn.hosted`）；admin 可為使用者**加點（儲值）**，並可**開通／關閉**該使用者的官方連線備援資格（詳 §7.1）。
- **連線路徑對人透明（硬）：** Host 與 Guest／參與者**無需、也不得被要求**分辨「直連或 relay」。UI 只呈現連上／失敗等連線態（不標「經轉發」）。
- **啟用備援＝relay 優先、不試直連（硬）：** Host 已開通 `turn.hosted`＋已啟用 `turn_prefer`＋餘額足夠時，該次 **session 邀請**（`invite.compose`／GO-INVITE 等同路徑）雙方建 peer **以官方 relay 為傳輸路徑**——殼自動附 TURN credentials，並採 **relay-only ICE**（等價 `iceTransportPolicy: "relay"`）：**不**蒐集／嘗試 host／srflx 直連候選。關閉備援＝僅 STUN／直連。
- **五子棋 E2E 對齊：** 被授權且已啟用備援的 Host，邀請對玩須能經官方 relay 完成連線與對弈（見 [PG-INVITE-E2E-MVP.md](./PG-INVITE-E2E-MVP.md) §3.1／驗收）。

## 3. 非目標

- **使用者自備 TURN**（殼設定貼 `turn:` URI／credential、SecretStore 存 TURN、教自架 coturn 當產品路徑）——**DEC-045／047 硬否決**。
- **訂閱制**、多檔 subscription plan 表、自動續扣月費。
- 公開自助註冊（仍邀請制；DEC-047）。
- 經 Platform **中繼** session／DataChannel／presence／mailbox／檔案真相（TURN 只解傳輸路徑，權威仍在 peer／本機 session）。
- Trickle ICE、renegotiation 經 Platform、把 TURN 做成「預設一定連得上」的對外無限承諾。
- 對 Host／Guest **揭露**直連 vs relay，或要求其選擇傳輸模式（除錯除外；`turn_prefer` 開關只說「連線備援」，不教 ICE）。
- 在 **Invite E2E MVP（五子棋）** 的**無備援**快樂路徑上強制依賴官方 TURN（未開通／未啟用／無點時仍以直連／STUN 為準；已啟用備援時見 §2／§7.2／E2E §3.1）。
- 已啟用備援時仍先試直連、等失敗再 fallback 到 TURN（浪費握手時間且與「已付費備援」預期不符）——**否決**；啟用＝relay-only。
- 初版完整金流（信用卡／發票／退款流程）——可後段；本計劃先帳本＋admin 儲值／贈點。
- 以點數支付 LLM／其他 BYOK 模型費用（非本計劃範圍；若日後有，另規）。

---

## 4. 模型

| 概念 | 意思 |
| --- | --- |
| **點數（credits）** | Platform 帳號上的整數餘額；消耗有成本能力時扣除。 |
| **Entitlement** | 帳號是否**允許**使用某項官方有成本能力（例：`turn.hosted`）。與餘額分開：先能開、再有點。 |
| **官方 TURN（hosted）** | Platform 代簽短命 TURN／ICE credentials；relay 由營運供應商承擔；**按規則扣 Host 點數**。連線備援的**唯一**正式產品路徑。 |
| **Host（計費主體）** | 持場用 API key、鑄該次 Invite／發起需 relay 之連線的註冊使用者。 |
| **Guest** | 通常無 Platform 帳號；不持點數；其流量若走官方 TURN，仍計入 **Host**。 |

### 4.1 能力矩陣（初版）

| 連線備援 | 誰可開 | 扣點 |
| --- | --- | --- |
| 僅 STUN／直連／同區網 | 所有人 | 否 |
| 官方 TURN | 註冊 Host 且 `turn.hosted`＋餘額足夠 | **是**（Host） |
| 自備 TURN | — | **不支援** |

### 4.2 與現有憑證的關係

| 憑證 | 點數相關？ |
| --- | --- |
| Access token（dash） | 查餘額、看用量、（後段）自助儲值 UI |
| 場用 API key（殼記憶體） | 向 Platform 請求短命 TURN cred（若 entitlement＋餘額 OK） |
| Invite／`join_cap` | **不**承載點數；Guest 無帳號 |
| SecretStore | DEC-029 **LLM 等 BYOK**；**不**存 TURN、**不**存 Platform 點數、**不**存場用 API key |

---

## 5. 計價與扣點規則（契約草案）

> 具體匯率（幾點＝一分鐘／MB）實作前另表；此節定**何時扣、扣誰、失敗行為**。

### 5.1 計價單位（擇一為主）

初版建議只選**一個**主單位，避免雙軌對帳：

| 選項 | 優點 | 缺點 |
| --- | --- | --- |
| **A. Relay 分鐘**（peer 處於 `relay` 候選路徑的時長） | UX 直覺「連了多久」 | 與供應商常按流量計費不完全對齊 |
| **B. Relay 流量（MB）** | 貼近成本 | 終端難預估；需供應商／客戶端回報 |

**暫定傾向 A（分鐘）**＋硬頂同時 relay 連線數；若供應商帳單以 GB 為主，營運用安全係數換算進點數單價。定案時寫進 DEC／本計劃修訂。

### 5.2 何時扣／不扣

| 事件 | 扣點？ |
| --- | --- |
| 鑄 Invite、signal O／A、純 STUN 直連成功（備援關閉） | 否 |
| 簽發官方 TURN credentials | 可選**預留**（小額 hold），結算時多退少補 |
| 備援已啟用之邀請：relay-only 連上／持續走 TURN | **是**（按主單位累計；啟用後成功連線即預期走 relay） |
| Guest 加入本身 | 否（無帳號）；其 relay 計入 Host |

### 5.3 餘額不足

1. **簽發前：** 拒絕 hosted TURN cred；回可讀錯誤（例：`credits_insufficient`／`turn_not_entitled`）。
2. **連線中耗盡：** 停止續簽／撤銷 cred（細節依供應商）；UI 提示「轉發額度用尽」；**不**經 Platform 改送 session 資料。
3. **降級：** 若該次邀請已標備援（`transport.roster.relay`）但簽發失敗／耗盡：頁內中性失敗即可；**可**提示 Host 關閉備援後重邀（僅直連）。**勿**在同一次握手內靜默改試直連或第二輪 Platform signaling 補 candidates（仍守 DEC-045）；**勿**提示「請自備 TURN」。

### 5.4 濫用與限流

- 同時官方 relay peer 數硬頂（每 Host）。
- Credentials **短 TTL**、綁 session／peer 維度（不可當長期通用帳密）。
- 既有 Platform rate limit（IP／Invite／signal）繼續；點數是第二道閘。

---

## 6. API／資料面（草案）

> 路徑前綴示意；落地時併入 [PG-PLATFORM-API-PLAN.md](./PG-PLATFORM-API-PLAN.md) 路由表。

| 方法 | 路徑（示意） | 憑證 | 職 |
| --- | --- | --- | --- |
| `GET` | `/v1/me/credits` | access token | **餘額**＋可選摘要 |
| `GET` | `/v1/me/credits/sessions` | access token | **依 session 的扣點明細**（見 §7.1.1；分頁／上限另定） |
| `POST` | `/v1/admin/users/:id/credits` | access token＋admin | **加點**（body：正整數 `amount`＋可選備註）；回新餘額 |
| `POST` | `/v1/admin/users/:id/entitlements/turn.hosted` | access token＋admin | **開通／關閉**官方 TURN（`{ enabled: boolean }`） |
| `POST` | `/v1/field/turn/credentials` | 場用 API key | 簽發短命 hosted TURN（檢查 entitlement＋餘額） |
| `POST` | `/v1/field/turn/usage`（或供應商 webhook） | API key／內部 | 回報／結算用量；寫入 ledger（綁 `session_id`） |

**儲存：** 餘額與 ledger（誰、何時、何因、加減點、可選 `session_id`）在 Platform Worker 既有儲存（KV／D1／DO——實作選型時定；須可稽核）。

**非目標：** 場殼把點數快取當權威；權威在 Platform。Admin 初版做**加點**與**開通／關閉連線備援**；不做後台「代扣」按鈕（扣點僅由用量結算寫入）。

---

## 7. UX

### 7.1 後台（`dash`）

權威 UI 條目同步 [PG-PLATFORM-DASH-SPEC.md](./PG-PLATFORM-DASH-SPEC.md) §6.2.4／§6.5.2／§6.5.3。以下為本計劃契約摘要。

**用語：** 「點數」「轉發額度」「本次 session 扣點」；**不用**方案／訂閱／Pro／Billing。

**硬：** mobile-first；頁內確認；無原生 `alert`／`confirm`／`prompt`。

#### 7.1.1 使用者：餘額與 session 扣點（全部已登入角色）

**職：** 本人查看還剩多少點、以及**每個 session 扣了多少點**（只讀；不可自助改餘額——自助儲值＝Phase 5）。

| 元素 | 規格 |
| --- | --- |
| 放置 | **遊樂場** tab（與通行證／預設場合作一區；小標「點數」） |
| **剩餘點數** | 顯著顯示目前餘額（整數）；低於門檻（實作可設，例：< 10）時 inline 提示「額度偏低」——**非**阻擋「登入我的遊樂場」 |
| **Session 扣點列表** | 只讀列表／表：每一列＝**一個 session** 的扣點彙總（該 session 內所有官方 TURN／備援消耗合計） |
| 列欄位（至少） | 時間（該 session 最後結算或開始時間）、扣點數（負向顯示，例：`−12`）、可選簡短原因（例：連線轉發）；有穩定 id 時可顯示截斷 `session_id`（對讀者勿強調內部 id） |
| 排序 | 新→舊 |
| 空態 | 「尚無 session 扣點」——說明僅在使用官方連線轉發等有成本備援時才會出現 |
| 加點列 | **不**混入使用者列表；admin 加點另見 §7.1.2（本人若被加點，餘額更新即可，可不單獨列「儲值收據」於初版） |
| 使用連線備援 | **開關**（`turn_prefer`）：本人可開／關；**僅**在 admin 已開通 `turn.hosted` 時可啟用。**開啟**＝之後鑄的 session 邀請以官方 relay 為傳輸路徑（被邀請端與 Host **不嘗試** WebRTC 直連）；**關閉**＝僅直連／STUN、不扣備援點 |
| 錯誤 | API 失敗 → flash／`role="status"`；**不**原生 dialog |
| 非目標（初版） | 匯出 CSV、圖表、跨帳號對帳、自助買點 |

**對應 API：** `GET /v1/me/credits`、`GET /v1/me/credits/sessions`、`PATCH /v1/me`（`{ turn_prefer: boolean }`）。

#### 7.1.2 Admin：為使用者加點（僅 admin）

**職：** 營運人員為指定註冊使用者**增加**點數（人工儲值／贈點）。

| 元素 | 規格 |
| --- | --- |
| 放置 | **營運** tab → **註冊使用者**列表（§6.5.1）；每列動作含「**加點**」 |
| 流程 | 點「加點」→ **頁內面板／確認面**（非原生 dialog）：輸入**正整數**點數、可選備註 → 確認 → 成功後該列／全域 flash 顯示新餘額 |
| 驗證 | `amount` ≥ 1；非整數／空值 → 頁內錯誤，不送出 |
| 列表顯示 | 使用者列宜顯示目前**餘額**（與加點同一視線）；加點成功後列上餘額更新 |
| 不可對已停用 | 已停用使用者：加點按鈕不可用或確認後 API 拒（可讀錯誤） |
| 非目標（初版） | 後台「扣點／歸零」按鈕、批量加點、自助金流 |

**對應 API：** `POST /v1/admin/users/:id/credits`（僅加點；`amount` 須為正整數）。

#### 7.1.3 Admin：開通／關閉連線備援（僅 admin）

**職：** 決定哪個註冊使用者可使用官方 relay（TURN）。對應 `turn.hosted`；與餘額**正交**（開通≠加點；加點≠開通）。

| 元素 | 規格 |
| --- | --- |
| 放置 | **營運** tab → **註冊使用者**列表；每列顯示備援狀態＋「開通／關閉連線備援」 |
| 用語 | 對讀者「連線備援」；勿主打 TURN／ICE |
| 預設 | **未開通** |
| 與加點 | 獨立兩動作；列表宜同時可見餘額與備援狀態 |
| 已停用 | 不可改 entitlement（或 API 拒） |

**對應 API：** `POST /v1/admin/users/:id/entitlements/turn.hosted`（`{ enabled: boolean }`）。

### 7.2 場殼（Roster／連線）

| 項 | 規格 |
| --- | --- |
| 備援關閉 | 僅 STUN／直連（既有快樂路徑） |
| 備援開啟（`turn.hosted`＋`turn_prefer`＋餘額足夠） | 鑄 Invite 時 intent 帶 `transport.roster.relay: true`；Host 作答與 Guest 出 offer **皆**取官方 TURN `iceServers`；**ICE＝relay-only**（不嘗試 host／srflx 直連） |
| 自備 TURN | **無**（DEC-045） |
| **路徑不透明（硬）** | Host／Guest／SAM UI **不**顯示「直連／轉發／TURN／relay」；不要求使用者在連線當下選擇傳輸模式；除錯／devtools 除外 |
| 連線態 | 只呈現連線中／已連線／失敗等；失敗用中性網路文案 |
| 點數提示 | **不**在連線當下彈「正在消耗轉發點數」；餘額／扣點在 **dash** 事後可查（§7.1.1） |
| 失敗（無權／無點／供應商） | 若因而無法連上：頁內可讀錯誤（可導向 dash）；**不**教自備 TURN；**不** `alert`；**不**同握手內暗降級直連 |

### 7.3 Guest（被邀請者）

- 不顯示 Host 餘額、entitlement、是否走 relay。
- 連線失敗用中性文案（無法連線／請稍後再試）；**不**要求 Guest 註冊或購點。
- Guest **無需**知道 Host 是否開通備援；實作上依 Invite intent／`join_cap` 取 TURN 並採與 Host **相同**的 relay-only 政策（見 §7.2）。
- **硬：** 當該 Invite 啟用備援時，被邀請端**不**嘗試 WebRTC 直連。

### 7.4 與五子棋 E2E 的對齊

當 Host 已開通 `turn.hosted`、已啟用 `turn_prefer`、且餘額足夠（admin 已加點）：

1. Guest 經 Invite 入座的 WebRTC 握手**以官方 relay 建立** PeerConnection（relay-only；不依賴「先直連失敗再 fallback」）。
2. 雙方走完「同意 → 連線 → ready → 開始 → 對弈」時，**任何人機面都不揭露**直連 vs relay。
3. Session／棋步仍**不**經 Platform 中繼（僅 ICE／DataChannel **傳輸**走 TURN）。

詳驗收：[PG-INVITE-E2E-MVP.md](./PG-INVITE-E2E-MVP.md) §3.1／§9。

---

## 8. 與既有決策的關係

| 決策／文件 | 關係 |
| --- | --- |
| **DEC-045** | **已修訂：** 否決自備 TURN；預設無營運 TURN；官方 TURN＋點數＝本計劃。資料面不經 signaling 的硬約束**不變**。 |
| **DEC-047** | **已修訂：** 非目標含自備 TURN；官方 TURN／點數指向本計劃；**訂閱制**非目標。 |
| **DEC-004** | 敘事仍是個人場串連；點數是備援成本回收，不是多租戶協作套餐。 |
| **DEC-029** | SecretStore 繼續服務 LLM 等 BYOK；**不**承載 TURN。官方 TURN cred **短命、∉ SecretStore**。 |
| **Roster Phase 5** | 自備 TURN **刪除**；mailbox／自訂頭像等可另留；官方 TURN 依本計劃。 |
| **Invite E2E MVP** | 無備援時以直連為準；**有** `turn.hosted`＋`turn_prefer`＋點數的 Host → 邀請握手 relay-only，須能完成五子棋對玩連線；路徑對人透明（§7.4）。 |

---

## 9. 階段

| Phase | 內容 | 完成定義 | 狀態 |
| --- | --- | --- | --- |
| **0. 契約** | 本計劃；GLOSSARY；DEC-045／047 否決自備 TURN | 點數≠訂閱、Host 扣點、**無自備 TURN**、官方 TURN opt-in 寫死 | **進行中**（本文件＋DEC 修訂） |
| **1. 帳本** | Platform：餘額＋ledger（含 `session_id`）＋`turn.hosted` entitlement；`GET /me/credits`＋`/me/credits/sessions`；admin 加點＋開通／關閉備援；dash：餘額＋session 扣點＋營運加點／備援開關 | 使用者可見餘額與每 session 扣點；admin 可加點、可決定誰可用官方 TURN；無 TURN 供應商也可上線帳本 | **進行中**（API＋dash UI 已落地；用量結算仍粗） |
| **2. 官方 TURN 簽發** | entitlement `turn.hosted`；`/field/turn/credentials`＋Guest `…/turn/credentials`；短 TTL；餘額預檢；備援開啟時殼接入 `iceServers`＋**relay-only ICE**（`iceTransportPolicy: "relay"`）；signal 路徑 `keepRelay`；Host `turn_prefer` → stamp intent `relay` | 有點＋有權＋`turn_prefer` 才走備援邀請；五子棋經 relay 可連；不試直連；人機不揭露路徑 | **進行中**（殼 relay-only＋intent stamp 已落地；需設 `TURN_KEY_ID`／`TURN_API_TOKEN`） |
| **3. 用量結算** | 分鐘或 MB 累計入帳；耗盡行為；同時連線硬頂 | 帳本與供應商成本可對上數量級；無靜默無限 relay | 未開始 |
| **4. UX 拋光** | 連線態僅連上／失敗；dash 餘額／扣點；失敗中性文案 | 窄螢幕可完成；**不**教 TURN／relay 術語 | 未開始 |
| **5.（可選）自助儲值** | 金流買點；收據／歷史 | 另規金流與合規；**仍非訂閱** | 未開始 |

**建議實作序：** Phase 0 → 1 → 2 → 3 → 4；Phase 5 最晚。

---

## 10. 文件與用語

| 用 | 不用 |
| --- | --- |
| 點數、餘額、連線備援（**僅** dash／營運） | 訂閱、方案、Pro／Team、席位、Billing；**自備 TURN**；對**對弈／連線 UI**說直連／轉發／TURN／relay |
| Host 消耗點數、Guest 免帳號 | 要求對手付費才能下棋／入座；要 Host／Guest 選擇傳輸模式 |
| 已連線／無法連線 | 「雲端房間」「保證必連」；連線成功時標「經轉發」 |

---

## 11. 開放問題（定案前關閉）

1. 計價主單位最終選 **分鐘** 還是 **MB**？
2. 官方 TURN 供應商（自架 coturn／第三人如 Cloudflare Calls／Twilio 等）與 credential 協議（TURN REST 時限密碼等）——供應商自架≠使用者自備產品路徑。
3. 預扣（hold）vs 純事後結算；連線中耗盡是否強制拆 relay。
4. 新註冊使用者是否贈起步點數，或僅 admin 開 entitlement 時贈點。
5. 是否需要獨立 **DEC-049**（點數帳本），或併入 DEC-047 修訂即可。

---

## 修訂紀錄

| 日期 | 變更 |
| --- | --- |
| 2026-08-07 | 初版 Draft：點數制（非訂閱）；官方 TURN＝首項扣點能力；Host 計費／Guest 免帳號；階段草案 |
| 2026-08-07 | 後台 UI：使用者餘額＋**每 session 扣點**列表；admin **加點**；API `GET …/sessions`；同步 DASH-SPEC |
| 2026-08-07 | **否決自備 TURN**（對齊 DEC-045／047）；刪 Phase「自備 TURN」；備援唯一正式路徑＝官方 TURN＋點數 |
| 2026-08-07 | 後台 admin：**開通／關閉連線備援**（§7.1.3／DASH §6.5.3）；與加點正交 |
| 2026-08-07 | **路徑對人透明：** Host／Guest 不分辨直連 vs relay；有權 Host 的五子棋 E2E 在無法直連時仍須能連（§7.4） |
| 2026-08-07 | 實作開工：credits／entitlement API、CF TURN 簽發、dash 加點／開通、殼 auto iceServers、signal `keepRelay` |
| 2026-08-16 | **啟用備援＝relay-only：** session 邀請時 Host 已開 `turn_prefer` → 雙方不嘗試 WebRTC 直連；被邀請者以 relay 為傳輸路徑（§2／§7.2／§7.3） |
| 2026-08-16 | **實作：** `buildRosterRtcConfiguration`（`iceTransportPolicy: "relay"`）；`stampComposeRelayPrefer`；go／play mint 依 `turn_prefer` stamp intent |
