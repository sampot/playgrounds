# SAM catalog（投稿）

Authority for the field `/sam/` page lives here: one YAML file per entry under [`entries/`](./entries/). Build-time codegen writes `src/data/samCatalog.generated.ts` and `public/catalog/v1.json`; the app imports helpers from `src/data/samCatalog.ts` (see [PG-CATALOG-QUERY-PLAN.md](../docs/PG-CATALOG-QUERY-PLAN.md)).

## Add an entry

1. Copy [`entries/_template.yaml`](./entries/_template.yaml) → `entries/<id>.yaml`  
   Filename = stable **id** (usually the repo name, e.g. `pg-breakout.yaml`).
2. Fill required fields: `title`, `kind`, `series`, `blurb`, `source`.
3. Optional: `license`, `status`, `protocols` (session protocol decls for invite match).
   - `listed` (default): public `/sam/` browse + go resolve
   - `unlisted`: written to `catalog/v1.json` and go can open `/s/<id>`, but **hidden** from `/sam/` and go home／「下一個」推薦（測試／彩蛋用）
   - `draft`: omitted from codegen entirely
4. Run `npm run catalog:gen` and commit the updated `samCatalog.generated.ts` **and** `public/catalog/v1.json` with your YAML.
   - `picks.yaml` ids must be `listed` (not unlisted／draft).
5. Open a PR. Prefer the catalog PR template if present.

`source` may be `owner/repo` or a full GitHub／GitLab URL. Same-origin 「一鍵開」uses `/?open=<source>`.

## Review rules (maintainers)

- Public repo; readable license (MIT／Apache-2.0／etc. OK).
- Template for Playgrounds — not a SaaS landing or product pitch.
- Tested: open on a field with `/?open=…` (or same-origin from `/sam/`).
- `kind`／`series` fit [`series.yaml`](./series.yaml); new series need a short rationale.
- No auto-merge bot.

## Commands

```bash
npm run catalog:gen   # regenerate typed module + /catalog/v1.json from YAML
npm test
npm run build         # runs catalog:gen then check + astro build
```
