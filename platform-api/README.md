# Playgrounds Platform API

Independent Cloudflare Worker for Invite / thin WebRTC signaling + dashboard (DEC-047).

- **API:** `https://api.samkuo.me`
- **Dashboard:** `https://dash.samkuo.me`（同 Worker custom domain 別名）
- **workers.dev:** `https://playgrounds-platform-api.eavatar.workers.dev`

## Develop

```bash
cd platform-api
npm install
# set secret once for local:
# echo 'dev-bootstrap-token' | npx wrangler secret put ADMIN_BOOTSTRAP_TOKEN
npx wrangler kv namespace create STORE   # paste id into wrangler.jsonc
npm run dev
```

Open `http://127.0.0.1:8787/` for the dashboard (local). Bootstrap (once):

```bash
curl -sS -X POST http://127.0.0.1:8787/v1/admin/bootstrap \
  -H 'Content-Type: application/json' \
  -d '{"token":"dev-bootstrap-token"}'
```

Or use the bootstrap form on the dashboard.

## Test

```bash
npm test
```

Invite default TTL is **5 minutes** (session already started; not a reservation).
Short links (`/i/…`) are canonical on `api.samkuo.me` even when minted from the dashboard.
