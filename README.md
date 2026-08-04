# Playgrounds

Browser host for **SAM** (Single-page Application Module) sandboxes: OPFS workspace, canvas via Service Worker, optional agents, WASI shell, SecretStore.

- **Live:** [https://playgrounds.samkuo.me/](https://playgrounds.samkuo.me/)
- **Author notes:** [samkuo.me](https://samkuo.me/) (personal blog; not a product site)
- **Transition:** `https://samkuo.me/playgrounds/` still works; export `.sam` then import here (data is origin-bound)

## Develop

```bash
npm install
npm run dev
```

Defaults to standalone paths (`/` + `/canvas/…`) via `PUBLIC_PLAYGROUNDS_BASE_PATH=` in `.env`.

```bash
npm test
npm run build
```

## Open a SAM

```
https://playgrounds.samkuo.me/?open=sampot/pg-steward&name=總管
```

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
