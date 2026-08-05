# AGENTS.md (Playgrounds host)

This repo is the **Playgrounds** browser host ([sampot/playgrounds](https://github.com/sampot/playgrounds)).

- **DEC-041:** extract from blog; legacy `samkuo.me/playgrounds/` kept with migrate tip
- **DEC-042:** deploy on **Cloudflare Workers**; field net **`*.samkuo.me`** (same code, per-origin storage); default field **`play.samkuo.me`**

Reader-facing narrative stays personal／non-product (blog DEC-004).

## Commands

- `npm run dev` — local host (standalone paths: `/` + `/canvas/`)
- `npm test` — Vitest
- `npm run build` — `astro check` + static build
- Deploy (planned): `wrangler deploy` after build (wildcard `*.samkuo.me`)

## Layout

- `src/components/playgrounds/` — shell UI
- `src/sam-runtime/` — portable SAM runtime
- `src/sam-host/` — Node headless host
- `public/sw.js` — canvas SW + offline shell

## Paths / hosts

- Standalone field: `PUBLIC_PLAYGROUNDS_BASE_PATH=` → home `/`, canvas `/canvas/`
- Default document host: `https://play.samkuo.me`
- Any field: `https://<name>.samkuo.me` (reserved names e.g. `www`, `blog`, `api`, `play` as official default)
- In-app share links: prefer `location.origin`; docs examples use `play`

Do not auto-migrate OPFS across origins. Do not provision per-name server tenants.
