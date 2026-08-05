# SAM 小品型錄（YAML sources）

> **Status:** Active  
> **相關：** DEC-041（`/sam/` 入場網）、[catalog/README.md](../catalog/README.md)

## Goal

Host-repo authority for the field catalog page `/sam/`: contributors add a YAML entry via PR; build generates typed data consumed by the shell and catalog page.

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
src/data/samCatalog.generated.ts   # committed output
src/data/samCatalog.ts             # helpers / public API
```

## Defaults (locked)

| Topic | Choice |
| --- | --- |
| Format | One YAML per entry under `catalog/entries/` |
| Authority | Host repo `catalog/` (not per-SAM-repo manifest yet) |
| `source` | `owner/repo` or full GitHub／GitLab URL |
| Render | Build-time gen → typed module; UI imports `samCatalog.ts` |
| Out of scope | CMS, runtime GitHub crawl, `PUBLIC_CATALOG_URL` |

## Commands

- `npm run catalog:gen` — regenerate `samCatalog.generated.ts`
- `npm run build` — gen → `astro check` → `astro build`
- CI: `catalog:gen` + `git diff --exit-code` on generated file

## Contribution

See [catalog/README.md](../catalog/README.md). No auto-merge bot.
