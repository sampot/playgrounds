# SAM 小品型錄（YAML sources）

> **Status:** Active  
> **相關：** DEC-041（`/sam/` 入場網）、[catalog/README.md](../catalog/README.md)、[PG-CATALOG-QUERY-PLAN.md](./PG-CATALOG-QUERY-PLAN.md)（結構化 JSON＋Playgrounds 查詢；Draft）

## Goal

Host-repo authority for the field catalog page `/sam/`: contributors add a YAML entry via PR; build generates typed data consumed by the shell and catalog page.

**延伸：** 同一次 `catalog:gen` 另產版本化 JSON（`/catalog/v1.json`），供 Playgrounds 查詢／session lazy install——見 [PG-CATALOG-QUERY-PLAN.md](./PG-CATALOG-QUERY-PLAN.md)、DEC-046。

## Layout

```text
catalog/
  README.md                 # contribute + review rules
  entries/_template.yaml
  entries/<id>.yaml         # one file per listed SAM
  series.yaml               # kind order + series + labels
  picks.yaml                # 玩玩看 ids
  page.yaml                 # /sam/ hero + footnote
scripts/generate-catalog.ts
src/data/samCatalog.generated.ts   # committed output（頁面＋殼 import）
src/data/samCatalog.ts             # helpers / query API
public/catalog/v1.json             # 同 gen 結構化副本（DEC-046）
```

## Defaults (locked)

| Topic | Choice |
| --- | --- |
| Format | One YAML per entry under `catalog/entries/` |
| Authority | Host repo `catalog/` (not per-SAM-repo manifest yet) |
| `source` | `owner/repo` or full GitHub／GitLab URL |
| Render | Build-time gen → typed module; UI imports `samCatalog.ts` |
| Machine copy | 同 gen → `public/catalog/v1.json`（`GET /catalog/v1.json`）；殼查詢見 [PG-CATALOG-QUERY-PLAN.md](./PG-CATALOG-QUERY-PLAN.md) |
| Out of scope | CMS, runtime GitHub crawl 填型錄；外站 `PUBLIC_CATALOG_URL` 當權威 |

## Commands

- `npm run catalog:gen` — regenerate `samCatalog.generated.ts`＋`public/catalog/v1.json`
- `npm run build` — gen → `astro check` → `astro build`
- CI: `catalog:gen` + `git diff --exit-code` on both generated artifacts

## Contribution

See [catalog/README.md](../catalog/README.md). No auto-merge bot.
