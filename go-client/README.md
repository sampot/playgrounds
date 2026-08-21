# Playgrounds go-client（純玩版）

Guest-only client at **`https://go.samkuo.me`** (DEC-050). No editor, no OPFS sandbox library.

## Dev

```bash
# default — go client only (talks directly to https://api.samkuo.me — no Vite /v1 proxy)
npm run go:dev
# → http://localhost:5174/i/<shortId>
# → http://localhost:5174/s/pg-breakout
# → http://localhost:5174/room
```

The client always targets `https://api.samkuo.me` (and `https://dash.samkuo.me` for
login). Local dev works because the Platform CORS allowlist includes `localhost`.
**You do not need `platform:dev` for ordinary go／包廂 work.** Only override via
`VITE_PLATFORM_API_ORIGIN`／`VITE_PLATFORM_DASH_ORIGIN` when developing Platform
itself or self-hosting.

包廂多 tab／Agent 自動化（免 SSO、自動鑄門牌／進門）見
[`docs/PG-GO-ROOM-DEV-HARNESS-PLAN.md`](../docs/PG-GO-ROOM-DEV-HARNESS-PLAN.md)
（僅 `go:dev`＋loopback；正式 API）。

**開發通行證（最簡單）：**

1. 在 localhost **先用「登入」SSO 一次**（任意頁）→ Header 頭像 →「我的身分」→ **記住到本機**／**複製 key**
2. 未登入開 `/room`：頁底貼上 key →「套用並記住」（登入後面板會消失；之後從「我的身分」管理）
3. Agent／腳本：`window.__goRoomDev.getApiKey()` 或 `setApiKey('pg_sk_…', { remember: true })`

**多 tab 劇本：**

1. Host：`/room?dev_mint=1`（已記住 key 則自動登入＋鑄門牌）
2. 讀 `window.__goRoomDev.doorUrl` 或 `[data-testid=room-door-url]`
3. Guest：`{doorUrl}?dev_join=1&name=G1`
4. Host：`__goRoomDev.waitReady({ peerCount: 2 })`

Optional in `platform-api/.dev.vars` when running a **local** Platform:

```
GO_PUBLIC_ORIGIN=http://localhost:5174
```

```bash
# only when changing Invite／signaling／DO — not required for go／包廂
npm run platform:dev
# then point go at it: VITE_PLATFORM_API_ORIGIN=http://127.0.0.1:8787 npm run go:dev
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
