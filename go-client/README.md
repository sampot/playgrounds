# Playgrounds go-client（純玩版）

Guest-only client at **`https://go.samkuo.me`** (DEC-050). No editor, no OPFS sandbox library.

## Dev

```bash
# terminal 1 — Platform API (short resolve / join / signal)
npm run platform:dev

# terminal 2 — go client (talks directly to https://api.samkuo.me — no Vite /v1 proxy)
npm run go:dev
# → http://localhost:5174/i/<shortId>
# → http://localhost:5174/s/pg-breakout
```

The client always targets `https://api.samkuo.me` (and `https://dash.samkuo.me` for
login). Local dev works because the Platform CORS allowlist includes `localhost`.
Only override via `VITE_PLATFORM_API_ORIGIN`／`VITE_PLATFORM_DASH_ORIGIN` for tests／self-hosting.

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

Build prerenders listed `/s/<id>` HTML so chat／social crawlers see distinct `og:title` (e.g. `打磚塊 · 山姆鍋遊樂場`) and brand-prefixed descriptions. Site-level `og:image`＝`/og.png`（1200×630；非每小品圖）.

Search indexing: `robots.txt` allows `/`、`/help`、`/s/` and disallows `/i/`；`sitemap.xml`（`npm run sitemap`／prebuild）lists home + help + **listed** `/s/<id>` only. Invite pages also emit `noindex, nofollow`.

## Flow

1. Host mints `invite.compose` from **play**（作者場）or **go**（玩家主場／已登入）→ `short_url` = `go…/i/…`
2. Guest opens short link → resolve secret → consent → memory-load SAM → WebRTC → play
3. Catalog share → `go…/s/<id>` with that SAM’s title；go Header share sheet = system share / QR / copy + link preview
4. On `/s/<id>` for hostable protocols（e.g. `pg-gomoku`）， logged-in Host can invite from the SAM UI（`env.HOST.createPlatformInvite`）→ same Guest `/i/` path

## Credits

大廳 tiles／spritesheet 由 Gemini 像素圖裁切（見 [`ATTRIBUTION.md`](./ATTRIBUTION.md) 與 `static/lobby/`）。
