# Playgrounds

Browser host for **SAM** (Single-page Application Module) sandboxes: OPFS workspace, canvas via Service Worker, optional agents, WASI shell, SecretStore.

- **Default field:** [https://play.samkuo.me/](https://play.samkuo.me/)
- **Field net:** any `https://<name>.samkuo.me/` — same build, separate browser origin (OPFS / secrets / SW)
- **Deploy target:** Cloudflare Workers (static assets + wildcard `*.samkuo.me`)
- **Author notes:** [samkuo.me](https://samkuo.me/) (personal blog; not a product site)
- **Legacy (frozen):** `https://samkuo.me/playgrounds/` still opens with a migrate tip but is **not** updated with this repo; export `.sam` then import on the field you want (data is origin-bound)

Decisions: DEC-041 (extract / legacy mount), DEC-042 (Workers / wildcard / `play`) — see `docs/` (snapshot from the blog docs set).

## Develop

```bash
cp .env.example .env   # PUBLIC_PLAYGROUNDS_BASE_PATH= for root mount
npm install
npm run dev
```

```bash
npm test
npm run build
npm run deploy   # Cloudflare Workers (play.samkuo.me)
```

## Open a SAM

```
https://play.samkuo.me/?open=sampot/pg-steward&name=總管
```

On another field, the same query works with that host (in-app “copy open link” should use `location.origin`).

## Layout

| Path | Role |
| --- | --- |
| `src/components/playgrounds/` | Host UI |
| `src/sam-runtime/` | Portable SAM instance runtime |
| `src/sam-host/` | Headless Node host |
| `public/sw.js` | Canvas virtual origin + offline shell cache |
| `docs/` | Host API / decisions snapshot |

## License

MIT — see [LICENSE](./LICENSE).
