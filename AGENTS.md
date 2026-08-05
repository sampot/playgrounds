# AGENTS.md (Playgrounds host)

This repo is the **Playgrounds** browser host ([sampot/playgrounds](https://github.com/sampot/playgrounds)).

- **DEC-041:** extract from blog; legacy `samkuo.me/playgrounds/` is a **frozen** snapshot (migrate tip; no further feature sync from this repo)
- **DEC-042:** deploy on **Cloudflare Workers**; field net **`*.samkuo.me`** (same code, per-origin storage); default field **`play.samkuo.me`**
- **DEC-043:** docs site **Starlight** at **`docs.samkuo.me`** (separate Worker; not a field) — see `docs/PG-DOCS-PLAN.md`

This repo is the **authoritative** host codebase. Do not push feature parity back into the blog mount.

Reader-facing narrative stays personal／non-product (blog DEC-004).

## Commands

- `npm run dev` — local host (standalone paths: `/` + `/canvas/`)
- `npm test` — Vitest
- `npm run build` — `astro check` + static build
- `npm run deploy` — build + `wrangler deploy` (`play.samkuo.me`)
- `npm run docs:dev` / `docs:build` / `docs:deploy` — Starlight docs (`docs.samkuo.me`)

## Layout

- `src/components/playgrounds/` — shell UI
- `src/sam-runtime/` — portable SAM runtime
- `src/sam-host/` — Node headless host
- `public/sw.js` — canvas SW + offline shell
- `docs-site/` — Starlight docs (DEC-043; separate Worker)

## Paths / hosts

- Standalone field: `PUBLIC_PLAYGROUNDS_BASE_PATH=` → home `/`, canvas `/canvas/`
- Default field host: `https://play.samkuo.me`
- Docs (Starlight): `https://docs.samkuo.me` (reserved; separate Worker — DEC-043)
- Any field: `https://<name>.samkuo.me` (reserved names e.g. `www`, `blog`, `api`, `docs`, `old-blog`; `play` = official default)
- In-app share links: prefer `location.origin`; docs examples use `play`

Do not auto-migrate OPFS across origins. Do not provision per-name server tenants.
