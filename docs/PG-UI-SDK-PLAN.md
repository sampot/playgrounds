# Playgrounds UI 端 SDK（`window.PG`）＋ 後端預設 `functions.js` — 落地計劃

> **狀態：** Draft（2026-08-12；本刀）
> **權威規格：** [PG-UI-SDK-SPEC.md](./PG-UI-SDK-SPEC.md)
> **相關：** [PG-SAM-BINDINGS-SPEC.md](./PG-SAM-BINDINGS-SPEC.md)（§6.2 注入面）／[PG-BACKEND-RUNTIME-SPEC.md](./PG-BACKEND-RUNTIME-SPEC.md) §5.2 Runtime 職責／[PG-AGENT-MODEL-PLAN.md](./PG-AGENT-MODEL-PLAN.md)（drain）／[PG-DELEGATE-GRANT-PLAN.md](./PG-DELEGATE-GRANT-PLAN.md)（DEC-037 注入）
> **對齊：** DEC-031／DEC-038／DEC-053／DEC-035／DEC-036／DEC-051／DEC-037

一句話：**兩端同時落地——後端預設 `functions.js`（`defaultFunctionsHandler`）把 intrinsic 攤成 `/api/kv|/db|/vars|/secrets|/capabilities` 路由；前端靜態 SDK（`/playgrounds/sdk.js`）封裝 `fetch("/api/...")` 為 `window.PG`。** 兩端同源於 SPEC §3／§4，由 [PG-UI-SDK-SPEC.md](./PG-UI-SDK-SPEC.md) 鎖契約。

---

## 目標

- 縮減 SAM 必須寫的 `functions.js` CRUD handler 樣板（KV get/put/delete/list、DB prepare、vars 讀、secrets 名稱表）。
- UI 端共用同一份 SDK，消除每個 SAM 在 UI 端重複封裝 `fetch("/api/kv/...")` 的程式碼。
- 不破 DEC-031／038／053：UI 仍走網路；後端仍在 Backend Runtime；channel 可替換。

## 非目標

- 把 `env` 搬進 `window.PG`。
- SDK 暴露密鑰值。
- 把 SDK 做成 UI 端「完整 API 鏡像」（HOST 仍以 `capabilities()` 子集為準）。
- 跨主機 WebRTC 叢集實作（DEC-038 §1.4 遷移目標非本刀）。
- 改既有 SAM 範本的 `functions.js` 內容（只補 helper，新 SAM 才能 opt-in）。

---

## 現況（落地前）

| 區 | 現況 |
| --- | --- |
| 後端 `functions.js` | 每個 SAM 自寫；無則 `SamInstance.dispatchFunctions` 回 503（[`instance.ts:147`](../../src/sam-runtime/instance.ts)） |
| 後端 `env.KV`／`env.DB` 注入 | `createFunctionsEnv`（[functionsEnv.ts](../../src/components/playgrounds/functionsEnv.ts)）已對 KV／DB 注入；無內建路由包成 `/api/*` |
| UI 端 | SAM 自寫 `fetch("/api/kv/...")`；多份副本（[`codingOrchestrationWorkerStarter.ts:193`](../../src/components/playgrounds/codingOrchestrationWorkerStarter.ts) 已是縮影） |
| 畫布 bridge | `CANVAS_BRIDGE_SCRIPT` 改寫 `/api`→canvas path；console／network 鏡像；不暴露 SDK surface |
| Backend Runtime | 已落地（[`backendRuntime.worker.ts`](../../src/components/playgrounds/backendRuntime.worker.ts)）；`functionsFetch` 已走序列化通道 |

---

## 目標架構

```text
┌─ Backend Runtime（Dedicated Worker；DEC-038）──────────────────────────┐
│  SamInstance                                                             │
│    ├─ 有 functions.js → 用 SAM 自訂                                       │
│    └─ 無 functions.js → 注入 defaultFunctionsHandler（**本刀新**）       │
│  defaultFunctionsHandler                                                 │
│    ├─ /api/kv/{key}            → env.KV                                  │
│    ├─ POST /api/kv/list        → env.KV.list                              │
│    ├─ POST /api/db/prepare     → env.DB.prepare                          │
│    ├─ POST /api/db/exec        → env.DB.exec                             │
│    ├─ POST /api/db/batch       → env.DB.batch                            │
│    ├─ GET  /api/vars[/key]     → env.vars                                │
│    ├─ GET  /api/secrets        → env.secrets.* names only                │
│    └─ GET  /api/capabilities   → SDK 用來決定屬性可見性                  │
└─────────────────────────────────────────────────────────────────────────┘
          ▲
          │ functionsFetch（postMessage 通道）
          │
┌─ 殼 BackendHost ──────────────────────────────────────────────────────┐
│  functionsFetch（既有；不變）                                            │
└─────────────────────────────────────────────────────────────────────────┘
          ▲
          │ 序列化 fetch
          │
┌─ 畫布（UI main）───────────────────────────────────────────────────────┐
│  /playgrounds/sdk.js（本刀新；靜態檔）                                  │
│    window.PG.kv.get(key)                                                │
│      └─ fetch("/api/kv/" + encodeURIComponent(key))                    │
│           └─ CANVAS_BRIDGE_SCRIPT 改寫 → /playgrounds/canvas/<id>/api/ │
│                └─ 殼接收 → BackendHost → Runtime                        │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Phase

### Phase 0 — 規格（**本刀已完成**）

- [x] [PG-UI-SDK-SPEC.md](./PG-UI-SDK-SPEC.md)
- [x] [PG-UI-SDK-PLAN.md](./PG-UI-SDK-PLAN.md)（本檔）
- [x] [PG-SAM-BINDINGS-SPEC.md](./PG-SAM-BINDINGS-SPEC.md) §16 加「UI 端 SDK（`window.PG`）」，cross-link

### Phase 1 — 後端：`defaultFunctionsHandler`（最小可用）

**範圍：** 提供預設 `/api/kv/*` ＋ `/api/db/*` ＋ `/api/vars[/key]` ＋ `/api/secrets` ＋ `/api/capabilities`。

| 工作 | 檔案 | 驗收 |
| --- | --- | --- |
| 1.1 新增 `defaultFunctionsHandler.ts` | `src/sam-runtime/defaultFunctionsHandler.ts` | 純函式：`createDefaultFunctionsHandler(envOrGetter): FunctionsHandler`（接受 env 或 getter；後者用於 env 尚未組好的時機） |
| 1.2 `SamInstance.start` 注入 | `src/sam-runtime/instance.ts` | `if (this.hasFunctions())` 後加 `else { this.functions = createDefaultFunctionsHandler(() => this.env); }` |
| 1.3 型別 | `src/sam-runtime/types.ts` | 沿用既有 `FunctionsHandler`；不擴 `SamEnv` |
| 1.4 測試 | `src/sam-runtime/defaultFunctionsHandler.test.ts` | KV round-trip、KV list pagination、KV 非法鍵、DB prepare/all/first/run/raw、DB exec/batch、DB SQL 缺漏→`db_sql_error`、vars 讀（all＋single＋missing）、secrets names-only（含反白名單測）、capabilities、404 not_found、env 延遲讀；SamInstance 整合測：無 functions.js→裝預設＋SAM 自訂 functions.js→自訂優先 |

**DoD：**
- [x] 沙盒無 `functions.js` 時，`fetch("/api/kv/<key>")` 回預期值（SamInstance 整合測）
- [x] KV list pagination；DB error code 回 `db_sql_error`
- [x] `env.secrets.<NAME>.get()` 仍只被後端呼叫；UI 無路徑拿到值（反白名單斷言）
- [x] `capabilities()` JSON 含 `intrinsics: ["kv","db","vars"]` + 當前 binding 清單
- [x] **`npm test` 綠**；新測 13 個全綠（867 total）

**不變式檢查：**
- 不動 `createFunctionsEnv`（[functionsEnv.ts](../../src/components/playgrounds/functionsEnv.ts)）；只在 `SamInstance` 內用其結果組 handler。
- 不動 `BackendHost`／`backendRuntime.worker.ts` 通道。
- 不破既有 `SamInstance.functionsFetch` 公開 API。

### Phase 2 — UI 端 SDK：`/playgrounds/sdk.js`

**範圍：** 靜態 SDK；只封裝 `fetch("/api/...")`；不引入新 bundler。

| 工作 | 檔案 | 驗收 |
| --- | --- | --- |
| 2.1 SDK 源碼 | `public/playgrounds/sdk.js`（或 `static/`） | IIFE；無外部依賴；暴露 `window.PG`；method shape 對齊 SPEC §3 |
| 2.2 載入點 | `src/components/playgrounds/canvasSwProtocol.ts` `injectCanvasBridge` | 在 `CANVAS_BRIDGE_SCRIPT` 旁加 `<script src="/playgrounds/sdk.js" defer data-playgrounds-sdk>` |
| 2.3 capabilities 探測 | SDK 內部 | 啟動時 `fetch("/api/capabilities")`；依回應決定屬性存在；UI 用 `in` 探測（不是 `=== undefined`） |
| 2.4 錯誤型別 | SDK 內部 | `PgError` 對齊 SPEC §3.4；`Response.status !== 2xx` 時丟帶 `code` 的 Error |
| 2.5 測試 | `tests/sdk.test.ts`（jsdom） | 用 jsdom + `fetch` mock 驗：method 路由、`PgError.code` mapping、capabilities 探測屬性可見性 |
| 2.6 體積 | — | gzip 後 ≤ 8 KiB；超過則拆（O2） |

**DoD：**
- [ ] `pg-sdk.js` 在主機 `/playgrounds/sdk.js` 載入；不存在時 `window.PG === undefined`（不 throw）
- [ ] SAM 端不 import 任何東西即可使用 `window.PG`（無 npm）
- [ ] 與 `CANVAS_BRIDGE_SCRIPT` 解耦（bridge 缺席時 SDK 仍發相對 fetch）
- [ ] **svelte-check 綠**；jsdom test 綠；manul round-trip 在 `play.samkuo.me` 一個 fixture SAM 上跑通（PG.kv.get/put/delete）
- [ ] **CI smoke：** `npm run build` 把 SDK 帶進 `dist/playgrounds/sdk.js`

**不變式檢查：**
- SDK **不**引用 `env.*`；測試 grep 確認 `public/playgrounds/sdk.js` 無 `env\.` 字樣。
- SDK 不改 `window.fetch`（不與 BRIDGE 競爭改寫權）；改寫在 BRIDGE 那層。

### Phase 3 — `functions-runtime.js` helper（後端 opt-in）

**範圍：** 給願意寫 `functions.js` 的 SAM 用 helper 把預設路由**帶進去**，與自訂路由共存。

| 工作 | 檔案 | 驗收 |
| --- | --- | --- |
| 3.1 helper 源碼 | `public/playgrounds/functions-runtime.js` | ESM；`export intrinsicRoutes(env)`；`compose(routes)` |
| 3.2 helper 內 import 預設 handler | 同檔 | 用動態 import 或模板字串嵌入（避免 runtime require） |
| 3.3 測試 | `tests/functionsRuntime.test.ts`（jsdom） | SAM 範例：`compose([intrinsicRoutes(env), myCustom])` 順序由 SAM 決定；helper 不 throw |
| 3.4 範例 | `_template.yaml` 旁的 SAM 範本 | 新 SAM 範本改用 `intrinsicRoutes`；既有 SAM 不動 |

**DoD：**
- [x] SAM 自訂 `functions.js` 可用 `import { intrinsicRoutes } from "/playgrounds/functions-runtime.js"` 載入預設路由
- [x] helper 與預設 handler 共用同一份 routing 邏輯（避免雙份真理）— `src/sam-runtime/functionsRouting.ts` 為 TS 權威，JS 端由 `tests/functionsRuntime.test.ts` 14 個 parity fixture 鎖線
- [x] 既有 SAM `pg-gomoku`／`ping-a` 不破（920 tests 綠）

### Phase 4 — 規範化文件收尾

|| 工作 | 檔案 | 狀態 |
|| --- | --- | --- |
|| 4.1 PG-SAM-BINDINGS-SPEC §16 | `docs/PG-SAM-BINDINGS-SPEC.md` | [x] §16「UI 端 SDK（`window.PG`）」已加；§14 cross-link SPEC/PLAN |
|| 4.2 PG-SAM-BINDINGS-PLAN | — | [x] 不開新 plan 檔；範本 SAM 改用 SDK |
|| 4.3 範本更新 | `src/sam-host/fixtures/hello-sdk/` | [x] 純 UI 範本（Phase 5a）落地；走主機預設 handler |
|| 4.3 範本更新 | `src/sam-host/fixtures/hello-sdk-functions/` | [x] 自訂 + helper 範本（Phase 5b/c）落地 |
|| 4.4 AGENTS.md | `AGENTS.md` | [x] `sdk:check`／`sdk:test` commands 已加 |

### Phase 5 — 跨 SAM 驗收 + 文件

|| 工作 | 狀態 |
|| --- | --- |
|| 5.1 三類 SAM round-trip | [x] (a) `hello-sdk/`（純 UI）經 `SamInstance` 注入預設 handler；[x] (b) `hello-sdk-functions/`（自訂 functions.js + helper）跑 intrinsic+custom chain 通過 `tests/loadEsmFromFileMapAbsolute.test.ts`；[x] (c) helper chain 完整（`compose([customRoutes, intrinsicRoutes(env)])`） |
|| 5.1 瀏覽器端 | [x] `tests/samBrowserLoaderAbsolute.test.ts` 鎖 `composePreview.rewriteJsImports` 對 `/playgrounds/*` 絕對 path 改寫為 `new URL(spec, import.meta.url).href` 的 dynamic import（5 個 case） |
|| 5.1 Node 端 | [x] `moduleLoader.ts` 對 `/playgrounds/functions-runtime.js` 採 inline 策略（IIFE 內執行 helper，從 `globalThis.PlaygroundsFunctionsRuntime` 取 surface），避開 Vite public-asset 攔 |
|| 5.2 Capability 未準入 | [x] SDK 端以 `in` 為準（測試見 `tests/sdk.test.ts`）；後端 `env.COMPUTE`／`env.HOST` 缺位時 `capabilities()` 不列（預設 handler 對應測試） |
|| 5.3 對口席 | [x] `PG.HOST` 在 capabilities 回應含 `host` binding 時掛載（測試見 `tests/sdk.test.ts`）；總管卸任後保留明示準入子集契約不變（既有 `env.HOST` 收回路徑） |
|| 5.4 secrets 不外洩 | [x] `scripts/sdk-static-check.ts` 確認 `public/playgrounds/sdk.js` 無 `env.*` 直連、無 `secrets[...].get()` 暴露值；`/api/secrets` 僅回 names |
|| 5.5 DEC-053 §可攜性 | [x] 後端 routing 邏輯同源於 `functionsRouting.ts`（TS 權威）+ `functions-runtime.js`（JS 鏡像），parity fixture 鎖線；`pg-gomoku` 等既有 SAM 不破（920 測試綠，0 regression） |

### Phase 6（**非本刀**）— 後續增強

- SDK 動態 import 與 chunk 切（O2）。
- 為 `play` 與 `go` 各自的 Runtime 補 helper（同源於 `functions-runtime.js`；go 端的 functionsRuntime 已存在，需對齊 §4 路由表）。
- SDK type definitions（`.d.ts`）給願意強型別的 SAM；非破壞性新增。

---

## 風險與緩解

| 風險 | 緩解 |
| --- | --- |
| `CANVAS_BRIDGE_SCRIPT` 改寫 path 後 SDK 的相對 fetch 失效 | SDK 只用**絕對** `/api/...` 路徑；BRIDGE 改寫規則已涵 |
| `defaultFunctionsHandler` 與 SAM 自訂 `functions.js` 路徑衝突 | 自訂顯式回 `Response` 就接管；預設 handler 不在自訂時裝；`not_found` 由 helper 拋而非 404 假裝 |
| `vars` 同步讀造成 UI 端誤以為可寫 | SPEC §3.2 註明「同步唯讀」；型別 `Readonly<Record<...>>`；測試禁止 `PG.vars.x = "y"` |
| secrets 經 `vars` 路徑外洩（SAM 作者誤把 key 寫進 `.env`） | 沿用 DEC-035 §3.5 提醒文案；`/api/vars` 不脫敏（屬公開文本）；產品文案導向 SecretStore |
| SDK 體積變大拖累畫布首屏 | Phase 2 DoD 設 ≤ 8 KiB gzip 上限；超標則 defer + dynamic import |
| `PG.HOST` 動態 method 讓 UI 端 `in` 探測誤判 | 統一走 `await HOST.capabilities()` 取字串清單；UI 不依賴 `typeof HOST.x === "function"` |
| 預設 handler 與既有測試 fixture 衝突 | 既有 `ping-a`／`ping-b` 是 SAM 自訂 functions.js；預設 handler 只在沒 functions.js 時裝——零衝突 |
| 跨主機 WebRTC 遷移時 SDK 不破 | SDK 對 channel 無感；只依賴 `fetch("/api/...")` 走 canvas path |

---

## 驗收（一頁總結）

- [ ] 後端：`SamInstance` 無 `functions.js` 時，`fetch("/api/kv/<key>")` 等回預期值；型別沿用；既有 SAM `pg-gomoku`／`ping-a` 不破
- [ ] 前端：靜態 `/playgrounds/sdk.js` 載入後 `window.PG` 存在；`PG.kv.*`／`PG.db.*`／`PG.vars` round-trip 成功；capability 探測以 `in` 為準
- [ ] Capability：未準入 → 屬性缺位；對口→HOST 全量；非總管準入子集→HOST 子集
- [ ] 跨殼：`pg-gomoku` 同份 UI 在 `play` 與 `go` 行為一致（SDK 與預設 handler 兩殼都提供）
- [ ] 文件：SPEC／PLAN／PG-SAM-BINDINGS-SPEC §16 cross-link；AGENTS.md 加 commands
- [ ] CI：`npm test` + `npm run check` + `npm run build` 全綠；`svelte-check` 無 error
- [ ] 安全：secrets 不經 SDK；UI grep 確認 SDK bundle 無密鑰值路徑

---

## 文件維護

- 規格變更 → [PG-UI-SDK-SPEC.md](./PG-UI-SDK-SPEC.md)
- 階段進度（Phase 勾選）→ 本檔
- DECISIONS：**不立新 DEC**；對齊 DEC-031／038／053／035／036／051／037
- 程式碼：
  - 後端：`src/sam-runtime/defaultFunctionsHandler.ts`（新）
  - 前端：`public/playgrounds/sdk.js`（新）
  - helper：`public/playgrounds/functions-runtime.js`（新；Phase 3）
  - 整合：`src/sam-runtime/instance.ts`（改）、`src/components/playgrounds/canvasSwProtocol.ts`（改）