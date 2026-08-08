# Playgrounds go-client（純玩版）

Guest-only client at **`https://go.samkuo.me`** (DEC-050). No editor, no OPFS sandbox library.

## Dev

```bash
# terminal 1 — Platform API (short resolve / join / signal)
npm run platform:dev

# terminal 2 — go client (proxies /v1 → :8787)
npm run go:dev
# → http://localhost:5174/i/<shortId>
# → http://localhost:5174/s/pg-breakout
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

## Product paths

| Path | Role |
| --- | --- |
| `/i/<short_id>` | Invite／session（temporary；needs network） |
| `/s/<catalog_id>` | Solo catalog play — per-entry share／OG title；visit-then-offline；local scores |
| `/` | Home recommendations；PWA start_url |

Build prerenders listed `/s/<id>` HTML so chat／social crawlers see distinct `og:title` (e.g. `打磚塊 · 遊樂場`).

## Flow

1. Host (play) mints `invite.compose` → `short_url` = `go…/i/…`
2. Guest opens short link → resolve secret → consent → memory-load SAM → WebRTC → play
3. Catalog share → `go…/s/<id>` with that SAM’s title in Web Share + link preview
