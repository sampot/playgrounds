# AGENTS.md (Playgrounds host)

This repo is the **Playgrounds** browser host ([sampot/playgrounds](https://github.com/sampot/playgrounds)).

- **DEC-041:** extract from blog; legacy `samkuo.me/playgrounds/` is a **frozen** snapshot (migrate tip; no further feature sync from this repo); **SAM catalog** at field **`/sam/`** (same Worker as the shell)
- **DEC-042:** deploy on **Cloudflare Workers**; field net **`*.samkuo.me`** (same code, per-origin storage); default field **`play.samkuo.me`**
- **DEC-043:** docs site **Starlight** at **`docs.samkuo.me`** (separate Worker; not a field) — see `docs/PG-DOCS-PLAN.md`
- **DEC-047:** Platform API（Invite／薄 signaling）at **`api.samkuo.me`**；dashboard **`dash.samkuo.me`**（same Worker；`platform-api/`）— see `docs/PG-PLATFORM-API-PLAN.md`、`docs/PG-PLATFORM-DASH-SPEC.md`
- **DEC-048：** 場網宿主＝**SvelteKit** 靜態 PWA（`adapter-static`；Workers ASSETS）— see `docs/PG-SVELTEKIT-PLAN.md`；型錄人機 UX Draft — `docs/PG-CATALOG-UX-PLAN.md`
- **DEC-050（Proposed）：** 純玩版 Guest＠**`go.samkuo.me`**（無編輯環境；邀請短網址 canonical；參與當下 Invite／session）— see `docs/PG-GO-CLIENT-PLAN.md`

This repo is the **authoritative** host codebase. Do not push feature parity back into the blog mount.

Reader-facing narrative stays personal／non-product (blog DEC-004).

## UI／UX（硬）

- **禁止瀏覽器原生 Dialog：** 不得使用 `alert`／`confirm`／`prompt`（或同等）向使用者確認或索取文字；一律用頁內 UI（確認面、表單、flash／toast）。破壞性操作才需確認；使用者已明確發起的非破壞流程（例：上傳目錄建新沙盒）勿再多一層確認。見 `.cursor/rules/no-native-dialogs.mdc`。
- **Mobile-first：** 所有 UX 設計與實作以窄螢幕為先，再遞增至大螢幕；主操作／狀態在手機可用，勿靠 hover-only。見 `.cursor/rules/mobile-first-ux.mdc`。
- **Svelte 5 runes（DEC-005）：** 本 repo 的 Svelte／SvelteKit 元件**必須**用 runes（`$state`／`$derived`／`$effect`／`$props` 等）。**禁止** legacy `export let`、`$:`、隱式 `let` 反應性。維持 `compilerOptions.runes: true`。
- **game-assets 署名：** 開發 `pg-*` 可用本機 [`game-assets/`](./game-assets/)；須按授權署名，**不要求署名也署名**。見該目錄 README 與 `.cursor/rules/game-assets-attribution.mdc`。

## 流程（硬）

- **Test-driven development：** 新增／修改可執行程式邏輯（含 helper、reducer、route handler、binding factory、validation 等），**先寫失敗的測試**，再寫讓測試通過的最小實作，最後重構。例外（純刪除、純檔名／import 整理、單純把常數搬到 config 檔、文件 only）不在此限，但若改動引入新分支條件仍須先有測試。
- **Commit 顆粒度：** 建議「測試 + 實作」同一 commit（或緊鄰兩 commit）；不要把測試留到「之後補」。`npm test` 必須在 push 前綠。
- **不走 TDD 的場景：** 文件、樣式（CSS 變更）、搬檔、重新命名、type-only 變更——這些不需先寫測試。

## Commands

- `npm run dev` — local host (standalone paths: `/` + `/sam/` + `/canvas/`)
- `npm run catalog:gen` — regenerate catalog typed module + `public/catalog/v1.json` from `catalog/**/*.yaml`
- `npm run covers:sync` — copy `~/dev/sampot/<id>/thumbnail.png` → `go-client/static/covers/`＋`public/covers/`（then `catalog:gen` emits optional `cover`）
- `npm test` — Vitest（runs `svelte-kit sync` + `catalog:gen` via pretest）
- `npm run check` — `svelte-kit sync` + `svelte-check`
- `npm run build` — `catalog:gen` + `check` + SvelteKit static build → `dist/`
- `npm run deploy` — `wrangler deploy` (self-host / Deploy to Cloudflare button; root `wrangler.jsonc`)
- `npm run deploy:official` — build + official field-net (`wrangler.official.jsonc` → `play.samkuo.me`)
- `npm run docs:dev` / `docs:build` / `docs:deploy` — Starlight docs (`docs.samkuo.me`)
- `npm run platform:dev` / `platform:test` / `platform:deploy` — Platform API／dashboard (`api.samkuo.me`／`dash.samkuo.me`；`platform-api/`；dash UI＝`platform-api/dash` SvelteKit 5)
- `npm run go:dev` / `go:build` / `go:deploy` — 純玩版 Guest（`go.samkuo.me`；`go-client/`；DEC-050）
- `npm run sdk:check` — UI SDK 靜態檢查：grep 確認 `public/playgrounds/sdk.js` 無 `env.*` 直連、無 `secrets[...].get()` 暴露值；svelte-check 與 vitest 仍走 `npm run check`／`npm test`
- `npm run sdk:test` — Vitest 跑 `*.sdk*.test.ts` / `tests/sdk.test.ts` / `tests/sdkDts.test.ts` / `defaultFunctionsHandler.test.ts`（pattern `-t sdk` 或 `vitest run sdk` 入口）
- `node --experimental-strip-types scripts/copy-go-playgrounds-static.ts --root .` — 同步 `public/playgrounds/{sdk.js,functions-runtime.js,sdk.d.ts}` → `go-client/static/playgrounds/`（`go:build` prebuild 自動跑）

## Layout

- `src/routes/` — SvelteKit routes（`/` 場殼、`/sam/` 型錄）
- `src/components/playgrounds/` — shell UI
- `src/components/sam-catalog/` — 型錄人機面（`SamCatalogBrowser`；頁＋殼共用）
- `catalog/` — SAM catalog YAML sources（`/sam/` authority; see `catalog/README.md`）
- `src/data/samCatalog.ts` — catalog API／query（imports generated data；`/catalog/v1.json`）
- `public/catalog/v1.json` — machine-readable catalog（same gen as typed module）
- `src/sam-runtime/` — portable SAM runtime
- `src/sam-host/` — Node headless host
- `src/sam-host/fixtures/` — 範本 SAM 目錄（`hello-sdk/` 純 UI + 預設 handler；`hello-sdk-functions/` 自訂 functions.js + helper；`ping-a`／`ping-b` 既有多實例 KV 範例）
- `public/sw.js` — canvas SW + offline shell
- `docs-site/` — Starlight docs (DEC-043; separate Worker; **not** SvelteKit)
- `platform-api/` — Platform API Invite／signaling (DEC-047; separate Worker)
- `go-client/` — 純玩版 Guest SPA（DEC-050；`go.samkuo.me`；無編輯環境）
- `docs/PG-SVELTEKIT-PLAN.md` — 宿主 Astro→SvelteKit（Phase 1–6 landed）
- `docs/PG-CATALOG-UX-PLAN.md` — 型錄人機 UX（Phase 2–5 landed）
- `docs/PG-GO-CLIENT-PLAN.md` — 純玩版 Guest（DEC-050）
- `docs/PG-GO-ROOM-PLAN.md` — 純玩版包廂 `/room`（Invite 一般用途隔間；Phase 1＝文字／傳檔；主持私有 OPFS＝2g 契約凍）
- `wrangler.jsonc` — single-site self-host (README Deploy to Cloudflare)
- `wrangler.official.jsonc` — author field-net
- `vercel.json` / `netlify.toml` — README one-click Vercel / Netlify

## Paths / hosts

- Standalone field: `PUBLIC_PLAYGROUNDS_BASE_PATH=` → home `/`, canvas `/canvas/`, catalog `/sam/`
- Default field host: `https://play.samkuo.me`
- SAM catalog: `https://play.samkuo.me/sam/` (same Worker; per-field opens use same origin)
- Docs (Starlight): `https://docs.samkuo.me` (reserved; separate Worker — DEC-043)
- Platform API: `https://api.samkuo.me`；dashboard: `https://dash.samkuo.me` (same Worker — DEC-047；Invite TTL 預設 5m)
- 純玩版（Guest）：`https://go.samkuo.me`（DEC-050；邀請短網址 canonical `go…/i/…`；**不是**場）— see `docs/PG-GO-CLIENT-PLAN.md`
- Any field: `https://<name>.samkuo.me` (reserved names e.g. `www`, `blog`, `api`, `docs`, `dash`, `go`, `old-blog`; `play` = official default)
- One-click self-host: single origin on Cloudflare Workers Static Assets / Vercel / Netlify (not wildcard)
- In-app share links: prefer `location.origin`; docs examples use `play`

Do not auto-migrate OPFS across origins. Do not provision per-name server tenants.

## Commits

Commit messages follow **[Conventional Commits](https://www.conventionalcommits.org/)**（DEC-013）:

```
<type>(optional-scope): <description>
```

- Common `type`: `feat`、`fix`、`docs`、`chore`、`refactor`、`test`、`ci`、`perf`、`style`
- Subject：imperative、簡潔；勿用純敘述句（例如 `Add floating TOC` → `feat: add floating TOC`）
- Agents 代寫 commit 時亦須遵守；勿用 `--no-verify` 繞過 hook（除非作者明確指示）
