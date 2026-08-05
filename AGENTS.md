# AGENTS.md (Playgrounds host)

This repo is the **Playgrounds** browser host ([sampot/playgrounds](https://github.com/sampot/playgrounds)).

- **DEC-041:** extract from blog; legacy `samkuo.me/playgrounds/` is a **frozen** snapshot (migrate tip; no further feature sync from this repo); **SAM catalog** at field **`/sam/`** (same Worker as the shell)
- **DEC-042:** deploy on **Cloudflare Workers**; field net **`*.samkuo.me`** (same code, per-origin storage); default field **`play.samkuo.me`**
- **DEC-043:** docs site **Starlight** at **`docs.samkuo.me`** (separate Worker; not a field) — see `docs/PG-DOCS-PLAN.md`

This repo is the **authoritative** host codebase. Do not push feature parity back into the blog mount.

Reader-facing narrative stays personal／non-product (blog DEC-004).

## Commands

- `npm run dev` — local host (standalone paths: `/` + `/sam/` + `/canvas/`)
- `npm run catalog:gen` — regenerate catalog typed module from `catalog/**/*.yaml`
- `npm test` — Vitest（runs `catalog:gen` via pretest）
- `npm run build` — `catalog:gen` + `astro check` + static build
- `npm run deploy` — `wrangler deploy` (self-host / Deploy to Cloudflare button; root `wrangler.jsonc`)
- `npm run deploy:official` — build + official field-net (`wrangler.official.jsonc` → `play.samkuo.me`)
- `npm run docs:dev` / `docs:build` / `docs:deploy` — Starlight docs (`docs.samkuo.me`)

## Layout

- `src/components/playgrounds/` — shell UI
- `catalog/` — SAM catalog YAML sources（`/sam/` authority; see `catalog/README.md`）
- `src/data/samCatalog.ts` — catalog API（imports generated data）
- `src/pages/sam/` — catalog page
- `src/sam-runtime/` — portable SAM runtime
- `src/sam-host/` — Node headless host
- `public/sw.js` — canvas SW + offline shell
- `docs-site/` — Starlight docs (DEC-043; separate Worker)
- `wrangler.jsonc` — single-site self-host (README Deploy to Cloudflare)
- `wrangler.official.jsonc` — author field-net
- `vercel.json` / `netlify.toml` — README one-click Vercel / Netlify

## Paths / hosts

- Standalone field: `PUBLIC_PLAYGROUNDS_BASE_PATH=` → home `/`, canvas `/canvas/`, catalog `/sam/`
- Default field host: `https://play.samkuo.me`
- SAM catalog: `https://play.samkuo.me/sam/` (same Worker; per-field opens use same origin)
- Docs (Starlight): `https://docs.samkuo.me` (reserved; separate Worker — DEC-043)
- Any field: `https://<name>.samkuo.me` (reserved names e.g. `www`, `blog`, `api`, `docs`, `old-blog`; `play` = official default)
- One-click self-host: single origin on Cloudflare Workers Static Assets / Vercel / Netlify (not wildcard)
- In-app share links: prefer `location.origin`; docs examples use `play`

Do not auto-migrate OPFS across origins. Do not provision per-name server tenants.
