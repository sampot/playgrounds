# Playgrounds Platform API

Independent Cloudflare Worker for Invite / thin WebRTC signaling + dashboard (DEC-047).

- **API:** `https://api.samkuo.me`
- **Dashboard:** `https://dash.samkuo.me`（同 Worker custom domain 別名）
- **workers.dev:** `https://playgrounds-platform-api.eavatar.workers.dev`

## Develop

```bash
cd platform-api
npm install          # also installs dash/ (SvelteKit 5 UI)
npm run dash:build   # or rely on predev / predeploy
# set secret once for local:
# echo 'dev-bootstrap-token' | npx wrangler secret put ADMIN_BOOTSTRAP_TOKEN
npx wrangler kv namespace create STORE   # paste id into wrangler.jsonc
npm run dev
```

Dashboard UI is **SvelteKit 5** under `dash/`（ASSETS binding；Worker 仍處理 `/v1/*`／`/auth/*`）。

Open `http://127.0.0.1:8787/` for the dashboard (local). Bootstrap (once):

```bash
curl -sS -X POST http://127.0.0.1:8787/v1/admin/bootstrap \
  -H 'Content-Type: application/json' \
  -d '{"token":"dev-bootstrap-token"}'
```

Or use the bootstrap form on the dashboard.

Response includes **`access_token`** (`pg_at_…`, for dashboard). Field shell API key (`pg_sk_…`) is obtained via dash **「登入我的遊樂場」** → short-lived **provision** → redeem into **shell memory** (not SecretStore). Account APIs (`/v1/me`, `/v1/field/provision`, admin) require access token; Invite／signal require API key.

### GitHub / Google SSO

Local secrets in `platform-api/.dev.vars` (gitignored):

```
GITHUB_CLIENT_ID=…
GITHUB_CLIENT_SECRET=…
GOOGLE_CLIENT_ID=…
GOOGLE_CLIENT_SECRET=…
OAUTH_STATE_SECRET=…
ADMIN_BOOTSTRAP_TOKEN=…   # optional for first admin
# Official TURN (Cloudflare Realtime) — required for cross-NAT relay
TURN_KEY_ID=…
TURN_API_TOKEN=…
# Optional: override invite short_url origin (default https://go.samkuo.me)
# GO_PUBLIC_ORIGIN=http://localhost:5174
```

Production:

```bash
npx wrangler secret put GITHUB_CLIENT_ID
npx wrangler secret put GITHUB_CLIENT_SECRET
npx wrangler secret put GOOGLE_CLIENT_ID
npx wrangler secret put GOOGLE_CLIENT_SECRET
npx wrangler secret put OAUTH_STATE_SECRET
npx wrangler secret put TURN_API_TOKEN
# TURN_KEY_ID may be wrangler var (not secret):
# npx wrangler secret put TURN_KEY_ID
```

Create a TURN key in Cloudflare Dashboard → Realtime → TURN. Put **Key ID** as `TURN_KEY_ID` and the API token as `TURN_API_TOKEN`.

Admin opens **連線備援** + **加點** for a Host; field shell auto-mints ICE servers when entitled (Host via API key, Guest via join_cap). Without TURN secrets or entitlement, peers fall back to STUN-only.

**GitHub** OAuth App callback URL:

- Local: `http://127.0.0.1:8787/auth/github/callback`
- Prod: `https://dash.samkuo.me/auth/github/callback`

**Google** Cloud Console OAuth client (Web application) authorized redirect URIs:

- Local: `http://127.0.0.1:8787/auth/google/callback`
- Prod: `https://dash.samkuo.me/auth/google/callback`

(OAuth apps often allow only one／few callbacks — use a separate Dev client for local if needed.)

Flows: `GET /auth/{github|google|line}?intent=login|join|link|bootstrap` → provider → `/auth/{provider}/callback` → session cookie + access token. **`login` with an unbound SSO subject creates a Platform user**（open signup; no registration invite required）. `join` remains an optional admin invite path.

Admin bootstrap UI: **`https://dash.samkuo.me/bootstrap/`** (not on the login page).

Logout: `POST /v1/auth/logout`. **No** API-key login for the dashboard.

Account APIs (access token):

- `DELETE /v1/me` — delete own account（`last_admin` → 409）
- `DELETE /v1/me/sso/github|google` — unlink SSO（`last_sso` → 409）
- `GET /v1/admin/users` — list users（admin）
- `POST /v1/admin/users/:id/disable|enable` — disable／enable（admin）
- `GET /v1/join/:token` — registration invite status（public；dash landing）

## Test

```bash
npm test
```

Invite default TTL is **5 minutes** (session already started; not a reservation).
Short links (`/i/…`) are **canonical on `go.samkuo.me`** (DEC-050); `api.samkuo.me/i/…` 302s to go.
Field invites are minted by the playground shell (in-memory API key after dash provision), not the dashboard.
