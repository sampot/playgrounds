# Playgrounds SecretStore 實作計劃（DEC-029）

> **狀態：** Phase 0–4、**1b WebAuthn PRF**、**2b**（`env.secrets.*` 命名空間）已落地；Phase 5（grant 等）未開始  

> **權威決策：** [DECISIONS.md](./DECISIONS.md) DEC-029（密鑰庫）；掛載點／命名空間見 **DEC-035**／[PG-SAM-ENV-SPEC.md](./PG-SAM-ENV-SPEC.md)  
> **相關：** DEC-016（畫布同源／不做站內通用 proxy）、DEC-017（總管／BYOK 修訂）、DEC-018（有狀態搬動）、DEC-020（仿 D1／`env.DB` 仍有效；舊 per-project `env.SECRETS` bag **由本決策之獨立 binding 取代**）、DEC-022（TOOL ≠ HOST）、DEC-023（SESSION 不暴露完整密鑰面）、[PG-AGENT-PLAN.md](./PG-AGENT-PLAN.md)、[playgrounds-host-api.md](./playgrounds-host-api.md)

一句話：**密鑰統一由遊樂場 SecretStore（密文）管理；unlock 可用 **password 或生物識別（WebAuthn）**；每個 secret 是獨立 binding，掛在小寫命名空間 `env.secrets.<NAME>.get()`。總管設定可選既有密鑰／喚起遊樂場介面 dialog；遊樂場不代打；頁面刷新＝lock。**

---

## 背景與產品假設

### 為什麼要改

- 舊 per-project 明文庫與「遊樂場統一保管」不符；總管 BYOK 不應放在畫布 `localStorage`。
- 對齊 **Cloudflare Secrets Store** 精神：**一個 secret → 一個獨立 binding＋`get()`**，**不是** `env.SECRETS.get(name)` 大袋子。
- **掛載點（DEC-035）：** 不必佔用 `env` 頂層——改掛 `env.secrets.*`，與 `env.vars` 對稱，避免與 `KV`／`HOST`／密鑰名互撞。
- **不做**遊樂場 HTTP 代打。

### 信任邊界

```text
unlock 擇一：
  • password → PBKDF2
  • 生物識別（WebAuthn platform／PRF 等）→ 解開包裝的 master key
      │
      ▼ CryptoKey（extractable: false）  「unlocked」
      │
OPFS 密文 ◄── AES-GCM ──► binding.get() 當下解密 → 字串給 functions.js
      │
lock／刷新 → 丟棄 CryptoKey；僅剩密文
```

| 角色 | 取得明文 | 說明 |
| --- | --- | --- |
| 遊樂場 SecretStore（locked） | **否** | 僅密文＋公開 meta |
| 遊樂場（unlocked，`get` 內） | **短暫** | decrypt → 回傳 → 清內部 buffer |
| `functions.js`（已綁定＋unlocked） | **是** | `await env.secrets.<NAME>.get()` |
| `env.HOST` | **否** | 只 list／status |
| 畫布 JS | **否**（正式通道） | 經 `/api`→functions |
| Tool SAM | MVP：**不**注入 secret bindings | 後段可具名 grant |
| Session 參與者沙盒 | **注入**獨立 bindings（DEC-033 worker BYOK）；`env.SESSION` 本身不帶密鑰 | 非「SESSION 物件夾密」 |

### 設計原則

1. **遊樂場級 SecretStore** — 統一保管密文。  
2. **一 secret＝一 binding** — 注入 `env.secrets[secretName] = { get(): Promise<string> }`；**不**使用 `env.SECRETS`／`env.secrets.get(name)` 字典式 API。  
3. **小寫命名空間** — `secrets` 本身不是 binding；與 `env.vars` 同慣例（DEC-035）。  
4. **取消遊樂場代打**。  
5. **密文靜置**＋**`extractable: false`** 包裝金鑰。  
6. **明確 unlock／lock**；**刷新＝lock**；locked 時 `get` → `secret_locked`。  
7. **Unlock 雙路徑** — **password** 與**生物識別（WebAuthn）**擇一即可解鎖；初始化須能建立 password（復原／無生物裝置後備）；生物識別為可選登錄。  
8. **HOST 無值**。  
9. **保留名** — secret 名稱符合識別字規則；不得為頂層保留名（`vars`／`secrets`／`KV`／`DB`／`HOST`／`TOOL`／`SESSION`）。項目掛在命名空間內，故**不再**與 `HOST` 搶 `env` 頂層。  
10. **用語** — SecretStore；勿稱 Vault。  
11. **設定 UX 不斷裂** — 選既有密鑰／遊樂場介面 dialog 新增；見下節。  
12. **誠實上限** — unlocked 期可信邊界＝該 SAM 的 functions；WebAuthn／PRF 瀏覽器支援不一，須有 password 後備。

### 非目標

- `env.SECRETS` bag API（歷史 DEC-020 形）作為主路徑。  
- `env.secrets.get(name)` 動態名字典作為主路徑。  
- 遊樂場／站內代打。  
- 經 HOST／總管畫布 **寫入**密鑰明文（含 `postMessage` 傳 key 給遊樂場介面）。  
- 僅生物識別、無 password 復原的庫（不可取）。  
- 本站帳號、雲端同步。  
- MVP：per-project「只綁部分 secret」矩陣（Phase 5）。  
- 讀者文章預告未完成 Phase。

---

## 現況摘要（Phase 4 後）

| 面 | 狀態 |
| --- | --- |
| SecretStore＋獨立 binding | 已落地（password／WebAuthn PRF unlock；掛載 **`env.secrets.<NAME>.get()`**） |
| 掛載 `env.secrets.*` | **已落地**（Phase 2b；契約見 DEC-035／SAM-ENV-SPEC） |
| HOST | `getSecretStoreStatus`／`listSecrets`（`listSecretNames` 相容） |
| 總管 BYOK | 選 binding 名；新增／輪替遊樂場介面 dialog；`/api/llm/*` 經 functions `get()` |
| 舊 bag／`mockSecrets` | 已移除；`.sam` 永不含 SecretStore |

---

## 契約摘要（目標形狀）

### 密碼學／狀態機

| 項目 | 選擇 |
| --- | --- |
| 資料加密 | AES-GCM；master `CryptoKey` **`extractable: false`** |
| Password 路徑 | WebCrypto **PBKDF2**-SHA-256 →（或解包）master key |
| 生物識別路徑 | **WebAuthn** 平台驗證器（Face ID／Touch ID／Windows Hello 等）；優先 **PRF**（或同等）產出金鑰材料以 **unwrap** 已存的 master key 密文；無 PRF 時開工定可行後備（仍不得把 master key 以可匯出明文長駐） |
| 初始化 | **必須**設定 password（復原）；可**選**登錄生物識別 |
| Unlock UI | 提供「使用密碼」與「使用生物識別」（已登錄且環境支援時） |
| Lock／Refresh | 丟棄記憶體中的 master `CryptoKey`；等同 lock |

```text
absent ──setPassword（必）──► locked
              │ 可選 registerWebAuthn
              ▼
locked ──unlock(password|webauthn)──► unlocked ──lock／refresh──► locked
```

忘記 password 且無其他 unwrap 路徑 → 密文不可恢復（可銷毀庫）；生物識別遺失裝置仍可靠 password。

### Binding（一 secret 一 binding；掛在 `env.secrets`）

```ts
/** 每個 secret 一顆；掛在 env.secrets 上，鍵＝secret name */
interface SecretBinding {
  get(): Promise<string>;  // locked → reject secret_locked；無此名則不注入
}

// 例（unlocked 且 store 有 OPENAI_API_KEY）：
// await env.secrets.OPENAI_API_KEY.get()
```

| 規則 | 說明 |
| --- | --- |
| 命名空間 | 小寫 `env.secrets`；本身不是 binding（DEC-035） |
| 命名 | `/^[A-Za-z_][A-Za-z0-9_]*$/`；**禁止**為頂層保留名（`vars`／`secrets`／`KV`／`DB`／`HOST`／`TOOL`／`SESSION`） |
| MVP 注入對象 | 工作沙盒、總管等「完整 functions env」：unlocked 時為 store 內**每一** secret 各掛一 binding 於 `env.secrets` |
| Tool SAM | 預設不掛 |
| Session 參與者沙盒 | 掛獨立 bindings（供該沙盒 `/api/llm/*`）；SESSION binding 不帶值 |
| locked | 可不掛 binding，或掛上但 `get()` 一律 `secret_locked`（開工二選一；**建議不掛**，呼叫端以 `env.secrets.X == null` 探測） |
| 列舉 | **無** `env.secrets.get(name)`／`env.SECRETS.list`；人類看遊樂場 UI；總管看 `HOST.listSecrets()`（無值） |

對照：

| 形狀 | 狀態 |
| --- | --- |
| `await env.SECRETS.get(name)` | **已廢**（bag） |
| `await env.OPENAI_API_KEY.get()` | **現行程式**（遷移前） |
| `await env.secrets.OPENAI_API_KEY.get()` | **目標契約**（Phase 2b） |

| CF | Playgrounds |
| --- | --- |
| `secrets_store_secrets[].binding` | secret **name**＝`env.secrets` 下鍵（MVP 不另設別名；後段可加 display binding 名） |
| `await env.MY_BINDING.get()`（頂層） | `await env.secrets.MY_BINDING.get()`（命名空間，避免頂層污染） |
| wrangler 宣告綁哪些 | MVP：對允許的沙盒自動綁 store 全部；Phase 5：沙盒 grant 子集 |

### Secret meta（公開 header）

```ts
interface SecretMeta {
  name: string;           // 即 env.secrets 下 binding 鍵
  kind?: "bearer" | "header" | "basic";
  allowedHosts?: string[]; // UI／文件提示，不強制攔截 fetch
  defaultBaseUrl?: string;
  updatedAt: number;
}
```

### 遊樂場操作

初始化（password 必、生物識別可選）／Unlock（password **或**生物識別）／Lock／增刪改（須 unlocked；值不回顯）／狀態列／**密鑰 dialog**（可被總管設定喚起）。

### 總管設定 ↔ 遊樂場介面密鑰 UX（必做）

目標：使用者覺得「在總管設定裡管 API key」，但明文**從不**進 Agent iframe／`localStorage`／HOST。  
**已存在的密鑰可直接選用，不必重填值。**

```text
總管設定 UI（畫布）
  │  endpoint／model
  │  「使用的密鑰」：下拉／清單 ← HOST.listSecrets() 的名稱（無值）
  │       ├─ 選既有名稱（如 OPENAI_API_KEY）→ 存 binding 名即可，不開輸入框
  │       └─ 「新增密鑰…」／「輪替此密鑰…」→ 喚起遊樂場介面 dialog
  │  狀態：SecretStore 已鎖定／已解鎖；所選名是否存在
  ▼
僅在新增／輪替時：
postMessage（意圖＋secretName）——**禁止**帶 key 字串
  ▼
遊樂場介面 dialog：unlock（password 或生物識別，若需）→ 輸入新值 → 寫入 SecretStore
```

| 規則 | 說明 |
| --- | --- |
| **選用既有** | 主路徑：從 `listSecrets()` 選名稱；設定只持久化 **binding 名**（＋endpoint／model）。**不**重輸 API key |
| 新增／輪替 | 才開遊樂場介面 dialog 輸入值；輪替＝同名覆寫密文（值仍不回顯） |
| 喚起通道 | 總管 → 遊樂場介面：只傳意圖（`openSecretEditor`／`rotateSecret`）＋`secretName`；**不得**傳 plaintext |
| 寫入權威 | **僅遊樂場介面**表單寫入 SecretStore |
| 狀態回讀 | `listSecrets`／`getSecretStoreStatus`（無值） |
| Onboarding | 若 store 已有可用名：預選或請使用者選；若無任何密鑰／locked 擋使用：再喚起 dialog／unlock，勿只丟「請去密鑰選單」 |
| 總管設定欄位 | endpoint、model、**密鑰選擇器**；**無** apiKey 文字欄／localStorage |

### HOST API

| API | 行為 |
| --- | --- |
| `getSecretStoreStatus()` | `{ state, secretCount? }` |
| `listSecrets()` | `{ secrets: SecretMeta[] }`（**無值**） |

**無** `llmChat`／`secretsFetch`；**無** HOST 讀／寫明文。

### 總管 BYOK（執行面；目標）

```js
const apiKey = await env.secrets.OPENAI_API_KEY.get();
// fetch(baseUrl + "/chat/completions", { headers: { Authorization: "Bearer " + apiKey } })
```

### 匯出

SecretStore **永不**進 `.sam`。

---

## 階段

| 階段 | 交付 | 完成定義 | 狀態 |
| --- | --- | --- | --- |
| **0. 契約** | DEC-029、本計劃、GLOSSARY；獨立 binding；總管 UX；password∥生物識別 unlock | 契約無歧義 | 已完成 |
| **1. SecretStore 核＋password 路徑** | 密文 OPFS；PBKDF2 unlock／lock；遊樂場介面密鑰 dialog；清舊目錄 | locked 無法 get；password round-trip | 已完成 |
| **1b. 生物識別 unlock** | WebAuthn 登錄／unlock；與 password 解同一庫；不支援時隱藏入口＋說明 | 可只靠生物識別日常 unlock；password 仍可 unlock／復原 | 已完成 |
| **2. 獨立 binding 接線** | `createFunctionsEnv` 按名掛 binding；Tool 不掛；參與者沙盒可掛（DEC-033） | 頂層 `await env.FOO.get()` round-trip（遷移前形狀） | 已完成 |
| **2b. `env.secrets` 命名空間** | 改掛 `env.secrets.<NAME>`；範本／測試改讀新路徑；保留名含 `vars`／`secrets`；**不**長期雙掛頂層；`.env`→`env.vars` | `await env.secrets.FOO.get()`；頂層無密鑰鍵；文件一致（DEC-035） | **已完成** |
| **3. 總管 BYOK＋設定 UX** | 密鑰選擇器；新增／輪替遊樂場介面 dialog；binding `get` | 可選既有 key；值不經 SAM | 已完成 |
| **4. 清理與文件** | 廢 bag／export secrets；host-api 定稿 | 文件一致 | 已完成 |
| **5. 痛點驅動** | per-project grant；binding 別名；audit | 有痛點再開 | 未開始 |

---

## 程式路徑（預期）

| 路徑 | 用途 |
| --- | --- |
| `secretStore.ts`／`secretStoreCrypto.ts` | 狀態機、密文、password unlock／lock；保留名 |
| `secretStoreWebAuthn.ts` | WebAuthn 登錄／PRF unwrap；feature detect（無 PRF 則隱藏 UI） |
| `functionsEnv.ts` | 掛 **`env.secrets`** 命名空間（Phase 2b）；並見 SAM-ENV-SPEC 之 `env.vars` |
| ~~`mockSecrets.ts`~~ | **已刪除**（Phase 4）；舊 OPFS `playgrounds-secrets/` 啟動時 best-effort 清除 |
| host bridge／capabilities | status／listSecrets |
| `PlaygroundsApp.svelte` | Unlock／Lock／密鑰 dialog；聽取總管喚起意圖 |
| [`sampot/pg-steward`](https://github.com/sampot/pg-steward) | 設定／onboarding 喚起遊樂場介面 dialog；狀態徽章；目標 `env.secrets.<NAME>.get()` |

---

## 測試

- 錯密碼；lock 後無 binding 或 get 拒；`env.secrets.FOO.get()`／`env.secrets.BAR.get()` 互不干擾；保留名拒絕寫入；HOST list 無值；頂層無 `env.FOO` 密鑰鍵（Phase 2b）。  
- 手動：刷新須 unlock；從總管設定一鍵寫入 key（遊樂場介面 dialog）後可對話；`.sam` 不含 store；DevTools 確認 Agent localStorage 無 apiKey。

---

## 錯誤碼（建議）

| 碼 | 何時 |
| --- | --- |
| `secret_locked` | 未 unlock 時 `get`／寫入 |
| `secret_absent` | 尚未初始化 |
| `secret_auth_failed` | password 錯誤或 WebAuthn 失敗／取消 |
| `secret_webauthn_unavailable` | 環境不支援或未登錄生物識別 |
| `secret_name_reserved` | 名稱與頂層保留名衝突 |
| `secret_crypto_unavailable` | 無 SubtleCrypto |

---

## 與其他計劃／決策

| 計劃／決策 | 關係 |
| --- | --- |
| **DEC-035／SAM-ENV-SPEC** | `env.secrets` 命名空間＋`.env`／`env.vars`；本計劃只管密鑰庫 |
| **CF Secrets Store** | **一 secret 一 binding＋`get()`**；Playgrounds 掛在 `env.secrets` |
| **DEC-020** | 舊 `env.SECRETS` bag＝歷史；仿 D1／`env.DB` 不變 |
| **DEC-017** | BYOK 經具名 binding；設定／onboarding 喚起遊樂場介面密鑰 dialog |
| **DEC-022／023／033** | Tool 無 secret bindings；SESSION 參與者沙盒可掛 bindings 做 BYOK（SESSION 物件仍不帶密） |

---

## 風險與取捨

| 風險 | 緩解 |
| --- | --- |
| MVP 綁全部 secret → 惡意 SAM 可 `get` 每一顆 | Phase 5 grant；unlocked 縮窗；勿對不可信沙盒 unlock |
| 與舊 `env.SECRETS.get(name)`／頂層 `env.NAME.get()` 教學混淆 | 文件／範本全面改 `env.secrets.*`；Phase 2b 一次切、不長期雙掛 |
| 忘記 password | UI 警告；可銷毀庫；生物識別不能替代復原義務 |
| 無 PRF／無平台驗證器 | 僅顯示 password unlock；1b 完成定義含 feature detect |
| 總管誤把 key 用 postMessage 傳給遊樂場介面 | 契約禁止；遊樂場介面忽略含 value 的 payload |

---

## 產品句（給 UI／文件）

> **SecretStore 用密碼或裝置生物識別解鎖。總管設定可選已存密鑰；新增時在遊樂場輸入。解鎖後 functions 用 `env.secrets.名稱.get()` 取值打 API。**
