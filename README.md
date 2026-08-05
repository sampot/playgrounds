# Playgrounds

Browser host for **SAM** (Single-page Application Module) sandboxes: OPFS workspace, canvas via Service Worker, optional agents, WASI shell, SecretStore.

- **Default field:** [https://play.samkuo.me/](https://play.samkuo.me/)
- **Docs:** [https://docs.samkuo.me/](https://docs.samkuo.me/) — Starlight in `docs-site/` (DEC-043 / `docs/PG-DOCS-PLAN.md`); `npm run docs:dev` / `docs:deploy`
- **Field net (author):** any `https://<name>.samkuo.me/` — same build, separate browser origin (OPFS / secrets / SW)
- **Author notes:** [samkuo.me](https://samkuo.me/) (personal blog; not a product site)
- **Legacy (frozen):** `https://samkuo.me/playgrounds/` still opens with a migrate tip but is **not** updated with this repo; export `.sam` then import on the field you want (data is origin-bound)

Decisions: DEC-041 (extract / legacy mount), DEC-042 (Workers / wildcard / `play`), DEC-043 (docs / Starlight) — see `docs/`.

## One-click deploy (your account, single site)

Fork／clone into **your** Cloudflare, Vercel, or Netlify account and get one HTTPS field (not the `*.samkuo.me` wildcard). Custom domains are optional after the first deploy.

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/sampot/playgrounds)
[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fsampot%2Fplaygrounds&project-name=playgrounds&repository-name=playgrounds&env=PUBLIC_PLAYGROUNDS_BASE_PATH&envDescription=Leave%20empty%20for%20root%20mount%20(%2F%20%2B%20%2Fcanvas%2F%20%2B%20%2Fsam%2F).&envDefaults=)
[![Deploy to Netlify](https://www.netlify.com/img/deploy/button.svg)](https://app.netlify.com/start/deploy?repository=https://github.com/sampot/playgrounds)

| Platform | What the button uses | Notes |
| --- | --- | --- |
| **Cloudflare** | Workers Static Assets (`wrangler.jsonc` → `dist/`, SPA fallback) | Official [Deploy to Cloudflare](https://developers.cloudflare.com/workers/platform/deploy-buttons/) supports Workers (not Pages projects). Same single-site outcome. |
| **Vercel** | `vercel.json` → build `dist/`, SPA rewrite | Leave `PUBLIC_PLAYGROUNDS_BASE_PATH` empty. |
| **Netlify** | `netlify.toml` → publish `dist/`, SPA rewrite | Node 24 via `NODE_VERSION`. |

After deploy you get a `*.workers.dev` / `*.vercel.app` / `*.netlify.app` URL. Bind your own domain in that platform’s dashboard if you want. **Each origin is a separate empty field** (OPFS does not migrate automatically).

Author field-net (`play.samkuo.me` + docs binding) stays on `npm run deploy:official` / `wrangler.official.jsonc`.

## Develop

```bash
cp .env.example .env   # PUBLIC_PLAYGROUNDS_BASE_PATH= for root mount
npm install
npm run dev
```

```bash
npm test
npm run build
npm run deploy            # self-host Worker (root wrangler.jsonc)
npm run deploy:official   # play.samkuo.me field-net
```

## Open a SAM

```
https://play.samkuo.me/?open=sampot/pg-steward&name=總管
```

On another field (including your one-click deploy), the same query works with that host (in-app “copy open link” should use `location.origin`).

## Layout

| Path | Role |
| --- | --- |
| `src/components/playgrounds/` | Host UI |
| `src/sam-runtime/` | Portable SAM instance runtime |
| `src/sam-host/` | Headless Node host |
| `public/sw.js` | Canvas virtual origin + offline shell cache |
| `docs/` | Host API / decisions snapshot |
| `docs-site/` | Starlight site for `docs.samkuo.me` |
| `wrangler.jsonc` | Self-host / Deploy to Cloudflare |
| `wrangler.official.jsonc` | Author `play.samkuo.me` field-net |
| `vercel.json` / `netlify.toml` | One-click Vercel / Netlify |

## License

MIT — see [LICENSE](./LICENSE).
