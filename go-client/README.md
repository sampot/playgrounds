# Playgrounds go-client（純玩版）

Guest-only client at **`https://go.samkuo.me`** (DEC-050). No editor, no OPFS.

## Dev

```bash
# terminal 1 — Platform API (short resolve / join / signal)
npm run platform:dev

# terminal 2 — go client (proxies /v1 → :8787)
npm run go:dev
# → http://localhost:5174/i/<shortId>
```

Optional in `platform-api/.dev.vars`:

```
GO_PUBLIC_ORIGIN=http://localhost:5174
```

## Deploy

```bash
npm run go:deploy
```

Requires Custom Domain `go.samkuo.me` (and possibly a dashboard Worker Route so field-net wildcard does not swallow it).

## Flow

1. Host (play) mints `invite.compose` → `short_url` = `go…/i/…`
2. Guest opens short link → resolve secret → consent → memory-load SAM → WebRTC → auto-accept `session_invite` → play
