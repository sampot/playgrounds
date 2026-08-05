# AGENTS.md (Playgrounds host)

This repo is the **Playgrounds** browser host ([sampot/playgrounds](https://github.com/sampot/playgrounds)).

- **DEC-041:** extract from blog; legacy `samkuo.me/playgrounds/` is a **frozen** snapshot (migrate tip; no further feature sync from this repo)
- **DEC-042:** deploy on **Cloudflare Workers**; field net **`*.samkuo.me`** (same code, per-origin storage); default field **`play.samkuo.me`**

This repo is the **authoritative** host codebase. Do not push feature parity back into the blog mount.

Reader-facing narrative stays personal／non-product (blog DEC-004).

## Commands

- `npm run dev` — local host (standalone paths: `/` + `/canvas/`)
- `npm test` — Vitest
- `npm run build` — `astro check` + static build
- `npm run deploy` — build + `wrangler deploy` (`play.samkuo.me`)

## Layout

- `src/components/playgrounds/` — shell UI
- `src/sam-runtime/` — portable SAM runtime
- `src/sam-host/` — Node headless host
- `public/sw.js` — canvas SW + offline shell

## Paths / hosts

- Standalone field: `PUBLIC_PLAYGROUNDS_BASE_PATH=` → home `/`, canvas `/canvas/`
- Default document host: `https://play.samkuo.me`
- Any field: `https://<name>.samkuo.me` (reserved names e.g. `www`, `blog`, `api`, `docs`, `old-blog`; `play` = official default)
- In-app share links: prefer `location.origin`; docs examples use `play`

Do not auto-migrate OPFS across origins. Do not provision per-name server tenants.
