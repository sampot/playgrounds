import type { EntryGenerator, PageLoad } from "./$types";
import { GO_CATALOG, getGoCatalogEntry } from "$lib/goCatalog";

/**
 * Prerender listed `/s/<id>` so crawlers see per-entry OG titles (DEC-050 §5.5.1).
 * Runtime SPA still boots the SAM client-side.
 */
export const prerender = true;
/** Override root `ssr = false` so `<svelte:head>` lands in static HTML. */
export const ssr = true;

export const entries: EntryGenerator = () =>
  GO_CATALOG.map(e => ({ catalogId: e.id }));

export const load: PageLoad = ({ params }) => {
  const catalogId = params.catalogId?.trim() || "";
  const entry = catalogId ? getGoCatalogEntry(catalogId) : undefined;
  return {
    catalogId,
    entry: entry ?? null,
  };
};
