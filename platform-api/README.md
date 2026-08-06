# Playgrounds Platform API

Independent Cloudflare Worker for Invite / thin WebRTC signaling (DEC-047).

## Develop

```bash
cd platform-api
npm install
# set secret once for local:
# echo 'dev-bootstrap-token' | npx wrangler secret put ADMIN_BOOTSTRAP_TOKEN
npx wrangler kv namespace create STORE   # paste id into wrangler.jsonc
npm run dev
```

Bootstrap (once):

```bash
curl -sS -X POST http://127.0.0.1:8787/v1/admin/bootstrap \
  -H 'Content-Type: application/json' \
  -d '{"token":"dev-bootstrap-token"}'
```

## Test

```bash
npm test
```

Invite default TTL is **5 minutes** (session already started; not a reservation).
