# Playgrounds UI 端 SDK（`window.PG`）— 規格

> **狀態：** Draft（2026-08-17；修訂：§1.3／§1.4 殼邊界與主機 SDK 借鑑、開放點 O6–O7）
> **權威決策：** 不立新 DEC；對齊 [DECISIONS.md](./DECISIONS.md) **DEC-031**（UI←網路→後端↔resources）／**DEC-038**（後端執行面＝Backend Runtime；離開 UI 主執行緒）／**DEC-053**（UI 對外契約＝`fetch("/api/...")`；shell/runtime 能力只走 `env.*` binding）
> **相關：** [PG-SAM-ENV-SPEC.md](./PG-SAM-ENV-SPEC.md)（`env.vars`／`env.secrets.*`）、[PG-SAM-BINDINGS-SPEC.md](./PG-SAM-BINDINGS-SPEC.md)（intrinsic vs capability／注入）、[PG-API-SCOPES-SPEC.md](./PG-API-SCOPES-SPEC.md)（OAuth-style scopes／`env.HOST` 子集）、[PG-BACKEND-RUNTIME-SPEC.md](./PG-BACKEND-RUNTIME-SPEC.md)（Runtime 拓撲／通道）、[PG-AGENT-MODEL-SPEC.md §4.2](./PG-AGENT-MODEL-SPEC.md)（UI←網路→後端硬規則）、[PG-DELEGATE-GRANT-PLAN.md](./PG-DELEGATE-GRANT-PLAN.md)（`env.DELEGATE`）、[PG-LIBS-SPEC.md](./PG-LIBS-SPEC.md)（`PG.libs`）、[PG-GAME-AGENT-GUIDE.md](./PG-GAME-AGENT-GUIDE.md)（遊戲側平台義務）
> **動機：** 每個 SAM 為存取 intrinsic（`env.KV`／`env.DB`／`env.vars`）各寫一份 `functions.js` 的 CRUD handler、UI 又各抄一份 `fetch("/api/...")` 封裝。**DX 重複、跨 SAM 難以統一版本。** 把 UI 端封裝抽成一份共享 SDK，並由主機（Runtime）提供一份**預設 `functions.js`** 把 intrinsic 攤成標準 `/api/*` 路由——兩端同源。

一句話：**UI 端薄 SDK 封裝 `fetch("/api/...")`；後端預設 `functions.js` 把 `env.KV`／`env.DB`／`env.vars`／`env.secrets` 攤成對應路由；SDK 與後端共用契約、跨 SAM 統一。** UI 看到的「像直接呼叫」實為 SDK 內部的網路呼叫；`env` 物件本體仍在 Backend Runtime 內對 `functions.js`／`controller.js` 可見。

---

## 1. 定位與邊界

### 1.1 在堆疊中的位置

```text
                ┌──── Playgrounds 殼 / Backend Runtime（離開 UI 主執行緒；DEC-038）───
                │                                                                │
                │  ┌──────────── 主機裝的預設 functions.js（本規格 §4）─────────┐│
                │  │  /api/kv/*        → env.KV                                ││
                │  │  /api/db/*        → env.DB                                ││
                │  │  /api/vars        → env.vars                              ││
                │  │  /api/secrets      → env.secrets.*（names only；鎖＝拒） ││
                │  └─────────────────────────────────────────────────────────┘│
                │  SAM 自訂 functions.js / controller.js（若提供）走原路徑接管   │
                │                                                                │
                │  通道：postMessage（MVP）／WebRTC（DEC-038 §1.4 遷移目標）      │
                └────────────────────────┬───────────────────────────────────────┘
                                         │
                ┌────────────────────────┴─────────────────── 畫布（UI main）───
                │  ┌───── window.PG（本規格 §3）──────────────────┐             │
                │  │  const v = await PG.kv.get("hits");         │             │
                │  │     └─ fetch("/api/kv/hits") ──►           │             │
                │  │  return new Response(JSON.stringify(v));   │             │
                │  └────────────────────────────────────────────┘             │
                │  fetch("/api/...") 經 SW canvas-bridge 改寫至                │
                │  /playgrounds/canvas/<sandboxId>/api/... → BackendHost        │
                └────────────────────────────────────────────────────────────────┘
```

| 層 | 本規格 |
| --- | --- |
| **UI 契約** | `fetch("/api/...")`（DEC-031／053；**不**變） |
| **UI 端 SDK** | `window.PG` ＝`fetch("/api/...")` 的薄封裝；對 UI 「像直接呼叫」、對網路仍是 `/api` |
| **後端執行面** | `functions.js`（SAM 自訂或主機裝的預設）→ 仍由 Backend Runtime Worker 持有資源權威（DEC-038） |
| **資源** | `env.KV`／`env.DB`／`env.vars`／`env.secrets.*` 仍只對後端可見 |

### 1.2 目標

- **G1** 縮減 SAM 必須寫的 `functions.js` 樣板：純 intrinsic CRUD（KV get/put/delete、DB prepare、vars 讀）由主機裝預設 handler，UI 端只 import SDK。
- **G2** UI 端 DRY：所有 SAM 共用同一份 SDK，避免在 UI 端重複封裝 `fetch("/api/kv/...")`。
- **G3** 不破既有契約：UI 仍走 `fetch("/api/...")`；SDK 內部就是 `fetch` 封裝，**沒有**把 `env` 物件搬進 `window`。
- **G4** 與 DEC-038 拓撲一致：SDK 對後端在哪個 thread / 哪台機器無感；可攜 `pg-gomoku` 等 SAM 同一份 UI 在場殼 `play` 與純玩版 `go` 走同一份 SDK。
- **G5** Capability scoping：未準入的 capability 對應 binding **不掛**在 SDK（`PG.SESSION` 缺位、`PG.COMPUTE` 缺位）；不靠 `undefined` 回傳假裝成功。
- **G6** 與 DEC-051 scopes 對齊：對口席＝`PG.HOST` 全量；非總管＝`PG.HOST` 子集；二者同一形狀、`HOST.capabilities()` 決定可用面。

### 1.3 非目標

- 把 `env` 物件搬進 `window.PG`（UI 端不能持有 env 直連）；違反 DEC-031。
- 把 SDK 變成 UI 端「完整 API 鏡像」（HOST 仍以 `capabilities()` 子集為準，不預先生成長長的 method 表）。
- SDK 暴露密鑰**值**：`PG.secrets` 不掛（仍只列名走 `HOST.listSecretNames` 或後端代理 `/api/secrets`）；密鑰值必須經後端 `functions.js` 用 `env.secrets.<NAME>.get()`（DEC-029／035）。
- 為 SDK 加跨沙盒「自由指定 sandboxId」：SDK 永遠綁當前 canvas；換沙盒 = 重新載 canvas。
- 在 SDK 內建立自己的快取／離線副本：重複資源會破 DEC-018／038 單權威；快取由後端決定（若未來要）。
- 取代 `functions.js`：SAM 仍可寫自訂後端；SDK 只負責 UI 端入口；二者解耦。
- **殼注入玩法 UI：** 不提供 `PG.controls`／`PG.input`、不注入虛擬手把／系統確認框充當遊戲 UX（對齊 no-native-dialogs；確認／toast 在 SAM 頁內）。
- **主機商店面：** 成就／獎盃／內購／訂閱檢查——非本 SDK 範圍。
- **執行期強制「可玩認證」閘門：** TRC／Lotcheck 類以文件＋上架驗收為準（[PG-GAME-AGENT-GUIDE](./PG-GAME-AGENT-GUIDE.md)／[PG-GAMES.md](./PG-GAMES.md)），不在 `sdk.js` 攔截玩法。
- **把線上協定塞進 intrinsic：** Invite／WebRTC／matchmaking 走 Platform 與 capability（`SESSION` 等），不擴成永遠掛載的對戰 SDK。

### 1.4 殼／畫布責任與主機 SDK 借鑑

對齊傳統主機「平台供應薄系統服務＋認證 middleware；遊戲寫玩法」：

| 主機概念 | play／go |
| --- | --- |
| 系統存檔 API | `PG.kv`（＋預設 `/api/kv`）；沙盒 scope 鎖定（§5.4） |
| 選配系統功能 | capability：`SESSION`／`HOST`／`COMPUTE`／`DELEGATE`（未準入＝屬性不存在） |
| 認證 middleware | `PG.libs`（[PG-LIBS-SPEC](./PG-LIBS-SPEC.md)；懶載、禁 precache） |
| 系統 chrome | 殼頂列／邊緣把手；**不**佔遊戲雙下角操控區慣例 |
| 遊戲 title 義務 | 生命週期暫停、輸入歸零、頁內錯誤提示——**文件硬規則**（Agent Guide §3.5），MVP **不**新增 `PG.lifecycle` |
| 線上服務 | Platform API／Invite；與 `/api` intrinsic、`PG.libs` 分離 |

**加深、不另發明大表面：** 優先穩定錯誤碼（如 `functions_no_leader`、`kv_key_too_large`）、雙殼同契約、libs 白名單。可選薄狀態通道見 §9 O6。

---

## 2. 既有契約對齊

### 2.1 UI 不得直連 resources（**核心不變式**）

> **UI（畫布）──✗──► resources（KV／DB／…）**  
> **UI（畫布）──────► functions.js ──► resources**  
> — [PG-AGENT-MODEL-SPEC.md §4.2](./PG-AGENT-MODEL-SPEC.md)

SDK 是對 `fetch("/api/...")` 的封裝，**不**是 `env` 物件的鏡像；對後端的所有呼叫都走 `/api` 路由 → 畫布 SW bridge 改寫 → BackendHost → `functionsFetch` → Runtime 內 `functions.js` → 後端持有的 `env`。任何「讓 UI 拿到 `env.KV` 直連」的提案都直接退件。

### 2.2 UI←網路→後端↔resources（DEC-031）

SDK 內部所有 method 本體是 `fetch("/api/<method-route>")`；response 解析成 method 回傳形狀（值／陣列／prepared statement）。後端是 Worker／跨主機 WebRTC 對 SDK 不影響。

### 2.3 後端離開 UI main thread（DEC-038）

SDK 只存在於畫布（UI main）；後端在 Leader 的 Backend Runtime Dedicated Worker（或更遠的 peer）。SDK 對此**完全無感**——這正是契約要保留的：`window.PG` 必須不假設後端同 `Window`。

### 2.4 跨主機遷移（DEC-038 §1.4）

SDK 內的 `fetch` 走的是「當前 canvas origin」；channel 從 `postMessage` 換到 WebRTC data channel 時，SDK **不需改**。後端的 `functionsFetch` 序列化／反序列化（[`backendRuntimeProtocol.ts`](../../src/components/playgrounds/backendRuntimeProtocol.ts)）亦不受影響。

### 2.5 沙盒儲存權威在 Backend Runtime（DEC-038 §4.2 不變式 1）

SDK 的所有讀寫回應都由 Runtime Worker 持有的 `mockKv`／`mockDb`／`createEnvVarsNamespace` 產生（見 [`functionsEnv.ts`](../../src/components/playgrounds/functionsEnv.ts)）；UI 不持有權威。

### 2.6 Capability scoping（DEC-036／051／PG-SAM-BINDINGS-SPEC §6.2）

- **intrinsic**（`KV`／`DB`／`vars`）：永遠掛在 SDK，無需宣告。
- **capability**（`COMPUTE`、`SESSION`、`DELEGATE`、`HOST`）：**SDK 上**對應屬性依準入結果掛載；**未準入時屬性不存在**（不是 `undefined` 回傳值）。
- 對 `HOST`（DEC-051 §4.2）：一律子集形狀；`PG.HOST.capabilities()` 回傳該 SAM 句柄上**實際可用**的方法名清單；未覆蓋方法呼叫→拒絕。
- **不**為 sandbox／observe 等另開平行頂層 binding 名（DEC-051 §4.2 硬規則）；SDK 端不發明 `PG.SANDBOX`／`PG.OBSERVE`。

### 2.7 secrets 不暴露值（DEC-029／035）

SDK **不暴露** `PG.secrets` namespace；UI 若需密鑰值必須：

- 由 SAM 自訂 `functions.js` 暴露 `/api/my-thing`，內部呼叫 `env.secrets.<NAME>.get()`，僅回傳**必要**的派生結果（例如 OpenAI chat completion 的 answer），**不得**回傳密鑰字串本身；或
- 經 `PG.HOST`（總管席或已準入 `secrets:get`）呼叫**該 SAM 已獲授權**的能力——HOST 永不回傳值（DEC-029）。

---

## 3. SDK 介面：`window.PG`

### 3.1 全域形態

```ts
declare global {
  interface Window {
    /** Playgrounds UI SDK；純 fetch("/api/...") 封裝；不存在＝主機未注入（或 SAM 已被舊版 Runtime 載入）。 */
    PG: PgSdk;
  }
}

interface PgSdk {
  readonly version: string; // "1"
  /** 沙盒 intrinsic：永遠存在。 */
  readonly kv: PgKv;
  readonly db: PgDb;
  readonly vars: PgVars;
  /** Capability bindings：未準入時屬性缺位（`"SESSION" in PG === false`）。 */
  readonly SESSION?: PgSession;
  readonly COMPUTE?: PgCompute;
  readonly DELEGATE?: PgDelegate;
  readonly HOST?: PgHost;
  /** Debug：列出此 SDK 已掛載的子集。 */
  readonly capabilities(): Promise<ReadonlyArray<PgCapability>>;
  /** Generic escape hatch：自訂路徑。建議**僅在 SAM 自訂 functions.js 提供**時使用。 */
  fetch(path: string, init?: RequestInit): Promise<Response>;
}

type PgCapability =
  | "kv" | "db" | "vars"
  | "session" | "compute" | "delegate" | "host";
```

### 3.2 intrinsic 子集（永遠掛載）

```ts
interface PgKv {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, opts?: { expirationTtl?: number }): Promise<void>;
  delete(key: string): Promise<void>;
  /** 列舉：受限於後端實作；後端可拒絕（prefix-scan 風險）。 */
  list(opts?: { prefix?: string; cursor?: string; limit?: number }): Promise<{
    keys: Array<{ name: string; expiration?: number }>;
    cursor?: string;
    list_complete: boolean;
  }>;
}

interface PgDb {
  prepare(sql: string): PgDbStatement;
  batch(statements: ReadonlyArray<unknown>): Promise<unknown>;
  exec(sql: string): Promise<void>;
}

interface PgDbStatement {
  bind(...args: unknown[]): PgDbStatement;
  all<T = unknown>(): Promise<T[]>;
  first<T = unknown>(): Promise<T | null>;
  run(): Promise<{ changes: number; last_insert_rowid?: number }>;
  raw<T = unknown>(): Promise<T[]>;
}

interface PgVars {
  /** 同步、唯讀；對應沙盒根目錄 `.env`（DEC-035）。 */
  readonly [key: string]: string | undefined;
  keys(): ReadonlyArray<string>;
  /** 取得 meta（是否存在／來源檔）；同步。 */
  has(key: string): boolean;
}
```

> **注意：** `vars` 在 SDK 內**同步**讀，是因為它對應 `.env` 是靜態文本（在後端 `createEnvVarsNamespace` 一次性 parse；見 [`functionsEnv.ts`](../../src/components/playgrounds/functionsEnv.ts)），UI 不需發 fetch。`kv`／`db` 為非同步。

### 3.3 capability 子集（依準入掛載）

```ts
interface PgSession {
  /** DEC-023：seated guest 才掛；非座位→整個 SESSION 屬性不存在。 */
  capabilities(): Promise<ReadonlyArray<string>>;
  /** 訂閱事件（經 SW bridge；fail-soft）。 */
  subscribe?(handler: (event: SessionEvent) => void): () => void;
  /** 經後端代理送出該 role 允許的行動。 */
  act?(input: { type: string; payload?: unknown }): Promise<unknown>;
  /** 取得 role 允許的狀態投影。 */
  getState?(): Promise<unknown>;
}

interface PgCompute {
  /** DEC-036；runPython／runCmd 方法可見性依已準入子集。 */
  apiVersion(): Promise<string>;
  capabilities(): Promise<ReadonlyArray<string>>;
  runPython(options: HostPythonRunOptions): Promise<HostPythonRunResult>;
  runCmd?(options: HostCmdRunOptions): Promise<HostCmdRunResult>;
}

interface PgDelegate {
  /** DEC-037：delegate session 才掛；同形於 `env.DELEGATE`。 */
  fs: {
    read(path: string): Promise<string>;
    write(path: string, content: string | Uint8Array): Promise<void>;
    list(path: string): Promise<Array<{ name: string; kind: "file" | "dir" }>>;
    mkdir(path: string): Promise<void>;
    remove(path: string): Promise<void>;
  };
  /** delegate grant 摘要（targets／paths／權限強度）。 */
  grant(): Promise<ReadonlyArray<{ sandboxId: string; mode: "read" | "readwrite" }>>;
}

interface PgHost {
  /** DEC-051 §4.2：一律子集形狀；`capabilities()` 回此句柄已實作且已授權的方法名。 */
  capabilities(): Promise<ReadonlyArray<string>>;
  // 方法掛載由 Runtime 動態提供；勿在 SDK 端硬編 method 名（見 §6.2）
  [method: string]: ((...args: unknown[]) => Promise<unknown>) | undefined;
}
```

### 3.4 錯誤形狀

SDK 統一以 `Response` 經 fetch 失敗時丟 `TypeError`（網路錯）；HTTP 4xx／5xx 由 SDK 轉成 `PgError`：

```ts
interface PgError extends Error {
  /** 機器可讀 code；對齊後端錯誤碼（DEC-036 §7）。 */
  code:
    | "capability_not_granted"      // 未準入；呼叫的方法不在 capabilities()
    | "binding_unavailable"          // 已準入但 runner／bridge 不可用
    | "kv_key_too_large"             // 單 key 超 25 MiB（KV 上限）
    | "db_sql_error"                 // prepare/bind 失敗
    | "secrets_locked"               // SecretStore 未 unlock
    | "session_not_seated"           // SESSION 已卸座
    | "functions_unavailable"        // 該沙盒無 functions.js 且主機未裝預設
    | "functions_no_leader"          // 殼尚未選出 Leader（PG-AGENT-MODEL §3）
    | "internal_error";
  status: number;            // HTTP status
  upstream?: { code?: string; message?: string };
}
```

UI 端用：

```js
try {
  await PG.kv.put("hits", String(n));
} catch (e) {
  if (e.code === "functions_no_leader") showToast("Runtime 尚未就緒，稍候重試");
  else throw e;
}
```

---

## 4. 後端：主機裝的預設 `functions.js`

### 4.1 觸發

- 沙盒檔案樹**無** `functions.js` → 主機（Backend Runtime）裝一份預設 handler（[`defaultFunctionsHandler.ts`](../../src/sam-runtime/defaultFunctionsHandler.ts)）。
- 有 `functions.js` → 完全接管；SAM 仍可經 `env.KV`／`env.DB`／`env.vars` 自寫。
- SAM 想保留內建路由＋自訂路由 → 經 SDK 提供 helper：

```js
// functions.js
import { intrinsicRoutes } from "/playgrounds/functions-runtime.js";
export default {
  fetch(request, env, ctx) {
    return intrinsicRoutes(env).handle(request).catch((e) => {
      // 未涵蓋的 path 落到自訂
      if (e.code === "not_found") return myCustom(request, env, ctx);
      throw e;
    });
  },
};
```

（`/playgrounds/functions-runtime.js` 為主機隨殼 ship 的靜態 helper；與 SDK 端並列。）

### 4.2 預設 handler 的路由表

| Method | Path | 對應 `env.*` | 備註 |
| --- | --- | --- | --- |
| `GET` | `/api/kv/{key}` | `env.KV.get(key)` | 回字串或 `null`（`Content-Type: text/plain`） |
| `PUT` | `/api/kv/{key}` | `env.KV.put(key, body, opts?)` | body 為字串／base64；`opts.expirationTtl` 經 query `?ttl=` |
| `DELETE` | `/api/kv/{key}` | `env.KV.delete(key)` | |
| `POST` | `/api/kv/list` | `env.KV.list({ prefix, cursor, limit })` | JSON；見 §4.3 |
| `POST` | `/api/db/prepare` | `env.DB.prepare(sql).bind(...).all()` | 見 §4.3 |
| `POST` | `/api/db/exec` | `env.DB.exec(sql)` | |
| `POST` | `/api/db/batch` | `env.DB.batch(statements)` | |
| `GET` | `/api/vars` | `env.vars`（全表） | JSON `{key: value}`；密鑰命名空間之變數值仍可能在內（脫敏處理見 §4.4） |
| `GET` | `/api/vars/{key}` | `env.vars[key]` | 回字串或 `null` |
| `GET` | `/api/secrets` | `env.secrets.*` 名稱表 | **names only**（與 DEC-029／035 一致） |
| `GET` | `/api/capabilities` | SDK 解析用 | 見 §4.5 |

不掛：純 intrinsic 之外的 binding（`HOST`／`SESSION`／`COMPUTE`／`DELEGATE`）由 SAM 自訂或根本不暴露——SDK 走 capability 探測拿，**不**走 `/api/host/*`。

### 4.3 KV／DB 路由細節

**KV list**（POST `/api/kv/list`）：

```jsonc
// request
{ "prefix": "user:", "cursor": "...", "limit": 100 }
// response
{ "keys": [{ "name": "user:42", "expiration": 1731000000 }], "cursor": "...", "list_complete": false }
```

**DB prepare**（POST `/api/db/prepare`）：

```jsonc
// request
{ "sql": "SELECT * FROM t WHERE id = ?", "bind": [42], "method": "all" }
// response
{ "rows": [{ "id": 42, "name": "x" }], "meta": { "durationMs": 3 } }
// method ∈ "all" | "first" | "run" | "raw"
```

對齊 Workers D1 形狀（見 [`mockDb.ts`](../../src/components/playgrounds/mockDb.ts)）：不引入新語意；只是把 D1 形 statement 翻成 RPC。

### 4.4 vars／secrets 處理

- `env.vars`：**全 key/value 一律回 JSON**；沙盒 `.env` 是 SAM 作者自己寫的明文設定，視為公開。**禁止**把 `OPENAI_API_KEY` 之類的密鑰寫進 `.env`（DEC-035 §3.5 提醒）。
- `env.secrets.*`：**僅回名字**（`{ names: ["OPENAI_API_KEY", ...] }`）；**永不**回值。值由後端 `functions.js` 持有；UI 端只能經自訂 `/api/...` 或 `HOST` 派生結果。

### 4.5 capabilities 路由

`GET /api/capabilities`：

```jsonc
{
  "intrinsics": ["kv", "db", "vars"],          // 永遠 true
  "bindings": ["session", "compute"],          // 實際已掛的（依準入）
  "hostCapabilities": ["reloadCanvas", "listDir", ...]  // PG.HOST 子集；對口＝全量
}
```

SDK 載入時呼叫一次決定要不要把 `PG.SESSION` 等屬性標成「存在」；之後讀取以**屬性存在與否**為準（避免 race）。

### 4.6 與 SAM 自訂 `functions.js` 的優先序

```text
1. /api/kv/* 、/api/db/* 、/api/vars/* 、/api/secrets 、/api/capabilities
   ↓ 預設 handler（主機裝；存在 SAM 沒 functions.js 時）
2. SAM 自訂 functions.js
   ↓ 自訂路由接管（沒命中再 fallback）
3. 404 + { code: "not_found", message: "..." }
```

**Override 機制：** SAM 想關閉預設路由的某條 → 自訂 `functions.js` 顯式處理該 path（不回傳則 404）；**不**需宣告「我要關」。

**混用：** 見 §4.1 `intrinsicRoutes()` helper；SAM 用 helper 載入預設路由，順序由 SAM 決定。

---

## 5. 載入與整合

### 5.1 SDK 載入點

主機隨殼 ship **靜態檔** `/playgrounds/sdk.js`（殼根路徑依 [`playgroundsPaths.ts`](../../src/components/playgrounds/playgroundsPaths.ts)）。SDK **不**透過 SAM 沙盒檔案樹（避免污染）；**也不**透過 CDN（避免第三方依賴破 DEC-015 釘版）。

載入策略：
- **MVP：** 經 [`CANVAS_BRIDGE_SCRIPT`](../../src/components/playgrounds/canvasSwProtocol.ts) 注入一行 `<script src="/playgrounds/sdk.js" defer data-playgrounds-sdk>` 進 `index.html` head；SDK 自掛 `window.PG`。
- **未來：** 若 SDK 體積變大或要分 chunk，改為 dynamic import + cache；不破壞「永遠在頭」契約。
- **宿主函式庫（擴張）：** `PG.libs` 為主機船運的 UI 函式庫懶載器（**不**經 `/api`、**不**由 bridge 預注入、**不** precache libs；僅授權清楚之開源庫）。契約細節見 [PG-LIBS-SPEC.md](./PG-LIBS-SPEC.md)（Draft）。

### 5.2 與 `CANVAS_BRIDGE_SCRIPT` 的分工

| 元件 | 職責 |
| --- | --- |
| **`CANVAS_BRIDGE_SCRIPT`**（既有） | 改寫 `/api/...` → canvas path；鏡像 console／network；DOM snapshot |
| **`/playgrounds/sdk.js`**（新增） | 提供 `window.PG` method surface；呼叫 `fetch("/api/...")` |

兩者**解耦**——SDK 不依賴 bridge（即使 bridge 缺席，`fetch` 仍走相對路徑可達）；bridge 不依賴 SDK（橋只負責 path 改寫）。

### 5.3 與 `BackendHost` 的整合

`BackendHost` 已有 `functionsFetch` 通道（見 [`backendHost.ts`](../../src/components/playgrounds/backendHost.ts)）；SDK 的 `fetch("/api/...")` 經：
1. SDK → `fetch` 發起
2. 畫布 `CANVAS_BRIDGE_SCRIPT` 改寫 path 至 `/playgrounds/canvas/<sandboxId>/api/...`
3. 殼 `BackendHost` 接收，**序列化** request
4. `postMessage` → Backend Runtime Dedicated Worker
5. Worker 內 `functionsFetch` → `SamInstance.functionsFetch`（見 [`instance.ts`](../../src/sam-runtime/instance.ts)）
6. 若 `SamInstance` 無 `functions.js` → 使用預設 handler（§4）
7. Response 反序列化 → 回畫布 → SDK promise resolve

**預設 handler 的注入點：** `SamInstance.start`（[`instance.ts:162`](../../src/sam-runtime/instance.ts)）的 `if (this.hasFunctions())` 之後加 else；與 [`backendRuntime.worker.ts`](../../src/components/playgrounds/backendRuntime.worker.ts) 的 `case "functionsFetch"`（`810` 行附近）配合。

### 5.4 沙盒 scope 鎖定

SDK 永遠綁當前 canvas（同源 fetch + SW bridge 改寫）；**不**接受 `PG.kv.get("x", { sandboxId })`。換沙盒 = 重新載 canvas（既有 `PlaygroundsApp` 流程）。

跨沙盒 FS 仍走 `PG.HOST`（`sandbox:edit` ＋ grant；DEC-051 §6.5）；不走 SDK intrinsic。

---

## 6. Capability 與 SDK 屬性可見性

### 6.1 屬性可見性規則

| 狀態 | SDK 行為 |
| --- | --- |
| intrinsic（`KV`／`DB`／`vars`） | 永遠掛載；UI 可呼叫 |
| 已準入 capability（`session`/`compute`/`delegate`/`host`） | 對應屬性掛載；UI 可呼叫 |
| 未準入 capability | 屬性**不存在**（`"SESSION" in window.PG === false`） |
| 不認得的 capability | 不掛（與 [`filterKnownCapabilities`](../../src/components/playgrounds/samCapabilities.ts) 一致） |

**探測寫法：**

```js
if ("HOST" in PG) {
  const caps = await PG.HOST.capabilities();
  if (caps.includes("reloadCanvas")) await PG.HOST.reloadCanvas();
}
```

> 對齊 DEC-051 §6.4：探測契約 = 已實作且已授權的方法名（**不**是場全量方法表）。

### 6.2 不預先掛滿 method

`PG.HOST` 不在 SDK 端硬編 method 表——`[method: string]` 動態解析；UI 端需透過 `capabilities()` 探測。原因：

- 場殼新增 HOST 方法 → SDK **不需升版**；UI 端 `capabilities()` 自動看到。
- 已準入但未實作的方法 → `HOST.capabilities()` 不含；UI 端呼叫→拒絕（`capability_not_granted`）。

### 6.3 與 DEC-051 scopes 對齊

| Scope | SDK 屬性 | 方法 |
| --- | --- | --- |
| `secrets:get` | （**不**直接掛 `secrets`；UI 經 `PG.HOST` 派生結果或自訂 `/api`） | — |
| `secrets:list` | （同上；HOST `listSecretNames()`） | — |
| `compute:python` | `PG.COMPUTE` 掛載 | `PG.COMPUTE.runPython()` |
| `compute:cmd` | `PG.COMPUTE` 掛載 | `PG.COMPUTE.runCmd()` |
| `session:host` | `PG.SESSION` 掛載 | `PG.SESSION.*` |
| `sandbox:edit` 等 | `PG.HOST` 掛載（對口全量／子集形狀） | `PG.HOST.<method>`（動態） |

對口席（總管）＝ `PG.HOST.capabilities()` 回場全量；卸任 → 收回對口快捷，保留已明示準入子集（DEC-051 §6.6）。

---

## 7. 測試與驗收

### 7.1 單元

| 測 | 驗證 |
| --- | --- |
| `defaultFunctionsHandler` | KV get/put/delete/list 對齊 `mockKv`；DB prepare/bind/all/first/run/raw 對齊 `mockDb`；vars 同步、secrets names only |
| SDK `PG.kv.*` | round-trip：put 後另一讀者 get 拿到；list pagination；key 編碼（URL-encoded） |
| SDK `PG.db.*` | `prepare().bind().all()` 等四種 method；error code（`db_sql_error`） |
| SDK `PG.vars` | 同步讀；不存在 key → `undefined`；`keys()` 列出所有 |
| SDK capability 探測 | 未準入 → `"HOST" in PG === false`；已準入 → 屬性存在；不認得 scope → 不掛 |
| 屬性不存在 vs undefined | 兩者語意不混：`"SESSION" in PG` 必須用 `in`，不可用 `PG.SESSION === undefined` |

### 7.2 整合

| 場景 | 驗證 |
| --- | --- |
| 畫布 `/api/kv/{key}` 無 `functions.js` | 主機裝預設 handler，回預期值 |
| 畫布 `/api/kv/{key}` 有 `functions.js` | 自訂接管；預設 handler 不執行 |
| 畫布 `/api/my-thing` 有 `functions.js` 自訂 | 自訂路由命中；不影響 `/api/kv/*` 預設 |
| 畫布 `/api/host/*` | SDK 不發（HOST 走 `env.HOST` 在 `functions.js`） |
| SAM `index.html` 在 `play` 與 `go` | 同一份 UI code；兩殼 SDK 行為一致（DEC-053 §可攜性） |
| 預設 handler 在 Backend Runtime Worker 內跑 | Worker 終止後請求→503 `functions_no_leader` |

### 7.3 跨契約

- **`window.PG` ≠ `env`**：type-level test 確認 SDK 型別不含任何 `env.*` 直連（不應出現 `PG.env` 屬性；亦不應把 `env.KV` 物件搬到 SDK）。
- **`fetch("/api/...")` 路徑不繞過 bridge**：所有 SDK method 內部呼叫路徑都以前綴 `/api/` 開頭；測試 grep 確認。
- **Capability 缺位＝屬性缺位**：`in` 探測；不存在屬性不可用 `?.()` 假裝（會 throw）。

### 7.4 驗收場景（產品）

1. **最小 SAM：** 只有 `index.html` + 一行 `<script src="/playgrounds/sdk.js">`，UI 用 `PG.kv.get/put/delete` 跑通——無 `functions.js`、無 UI 端封裝。
2. **混合 SAM：** 有 `functions.js`（自訂路由）+ SDK 內建路由共存；UI 用 SDK 走 intrinsic，用 `fetch("/api/my-thing")` 走自訂。
3. **Capability 未準入：** SAM 宣告 `compute:python` 未同意 → `PG.COMPUTE` 屬性缺位 → UI `if ("COMPUTE" in PG)` 走 fallback；呼叫 `PG.COMPUTE.runPython` → throw `capability_not_granted`。
4. **對口席：** SAM 設為總管 → `PG.HOST.capabilities()` 回場全量；非總管（已準入 `sandbox:edit`）→ 同形子集。
5. **跨殼可攜：** `pg-gomoku`（既有 UI）同份 code 在 `play.samkuo.me` 與 `go.samkuo.me` 行為一致；SDK 在兩殼由各自 Runtime 提供。
6. **secrets 不外洩：** UI 端 `PG` 不暴露密鑰值；測試 grep 確認 SDK bundle 無 `secrets[...].get()` 字串。

---

## 8. 與既有決策／規格的關係

| 既有 | 關係 |
| --- | --- |
| **DEC-031**（UI←網路→後端） | 不變；SDK 內部即 `fetch("/api/...")` |
| **DEC-038**（Backend Runtime／通道可替換） | SDK 對通道無感；channel 換 WebRTC 不破 SDK |
| **DEC-053**（UI 對外契約＝`fetch("/api/...")`） | 不變；SDK 封裝之 |
| **DEC-029**（SecretStore；HOST 無值） | SDK 不暴露 `PG.secrets`；HOST 永不回值 |
| **DEC-035**（`.env`→`env.vars`） | `PG.vars` 同步讀；與後端 `createEnvVarsNamespace` 一致 |
| **DEC-036**（intrinsic vs capability） | intrinsic 永遠掛；capability 屬性缺位＝未準入 |
| **DEC-051**（OAuth-style scopes／HOST 子集） | `PG.HOST` 一律子集；`capabilities()` 決定可用面 |
| **DEC-037**（delegate grant） | `PG.DELEGATE.fs.*` 對齊 `env.DELEGATE.fs.*` |
| **PG-BACKEND-RUNTIME-SPEC §4.2 不變式 1** | 儲存權威在 Runtime；SDK 不持有 |
| **PG-BACKEND-RUNTIME-SPEC §6.2** | `env.KV`／`env.DB`／`env.vars` 在 Runtime 本地；HOST/Delegate 拆開仍生效 |

---

## 9. 開放點

| # | 題 | 傾向 |
| --- | --- | --- |
| O1 | SDK 對 `secrets:list` 是否另開 `PG.secrets.list()`（僅 names）？ | 否；走 `PG.HOST.listSecretNames()`，維持單一 HOST 形 |
| O2 | `pg-sdk.js` 體積／dynamic import 策略 | MVP：內聯或單檔；觀察；> 30 KiB 時再分 chunk；大型宿主函式庫不進 SDK 本體，見 [PG-LIBS-SPEC.md](./PG-LIBS-SPEC.md) |
| O3 | SDK 是否暴露 SAM 端自訂 helpers（如 `PG.runtime.{context, files}`） | 否；SAM 作者自 import helper |
| O4 | DB `prepare` 序列化（statement 物件 vs 每次新 prepare） | 每次 RPC 帶 SQL + bind；不維護長連 statement（與 KV 同） |
| O5 | SDK `vars` 是否暴露 meta（哪個檔案／mtime） | 否；`.env` 靜態，UI 用 `fetch("/api/vars")` 看當下快照即可 |
| O6 | 殼是否提供極薄非阻塞狀態槽（如 `PG.flash`／系統 toast）專給平台錯誤？ | 延期；MVP 由 SAM 頁內 toast。若做：僅非阻塞、不可取代破壞性確認、不可變相 `alert` |
| O7 | 是否新增 `PG.lifecycle`（suspend／resume 事件）？ | **否（MVP）**；遊戲聽 `visibilitychange`／`pagehide`（[Agent Guide §3.5](./PG-GAME-AGENT-GUIDE.md)）。僅當多殼行為嚴重不一致再評估薄通知 |

---

## 10. 文件維護

- 本檔為**規格**；實作進度走 [PG-UI-SDK-PLAN.md](./PG-UI-SDK-PLAN.md)。
- 殼／遊戲邊界或主機借鑑政策變更 → §1.3／§1.4、§9 O6–O7；並同步 [PG-GAME-AGENT-GUIDE](./PG-GAME-AGENT-GUIDE.md)、[PG-LIBS-SPEC](./PG-LIBS-SPEC.md)。
- 新 SDK method → 更新 §3；新 binding 行為變更 → 更新 §4；新 capability → 更新 §6.3 對照表。
- 不再需要新 DEC（DEC-031／038／053 已涵）；本檔掛在 `DEC-053` 之下即可。