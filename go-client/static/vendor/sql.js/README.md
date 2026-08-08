# sql.js vendor (go host infra)

Populated by `npm run vendor:sqljs` from `node_modules/sql.js/dist`.

- Browser `env.DB` loads WASM via `locateFile` → `/vendor/sql.js/sql-wasm-browser.wasm`
- Go SW caches `/vendor/**` network-first (visit-then-offline after first successful fetch)

Do not point `locateFile` at a CDN.
