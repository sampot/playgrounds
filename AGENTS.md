# AGENTS.md (Playgrounds host)

This repo is the **Playgrounds** browser host (DEC-041). Narrative for readers stays personal／non-product (see sampot/myblog DEC-004).

## Commands

- `npm run dev` — local host (standalone paths: `/` + `/canvas/`)
- `npm test` — Vitest
- `npm run build` — `astro check` + static build

## Layout

- `src/components/playgrounds/` — shell UI
- `src/sam-runtime/` — portable SAM runtime
- `src/sam-host/` — Node headless host
- `public/sw.js` — canvas SW + offline shell

## Paths

- Standalone: `PUBLIC_PLAYGROUNDS_BASE_PATH=` (empty) → home `/`, canvas `/canvas/`
- Blog mount (myblog only): base `/playgrounds`

Do not auto-migrate OPFS across origins. Canonical share links: `https://playgrounds.samkuo.me/?open=…`.
