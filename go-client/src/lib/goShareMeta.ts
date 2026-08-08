/**
 * Per-catalog share／document／OG titles (DEC-050 §5.5.1).
 */

import { goSamShareHref, PLAYGROUNDS_GO_ORIGIN } from "@utils/playgroundsUrls";
import type { GoCatalogEntry } from "./goCatalog";

/** Web Share／shareOrCopy title — catalog entry title only. */
export function goSamShareTitle(entry: Pick<GoCatalogEntry, "title">): string {
  return entry.title.trim() || "小品";
}

/** `<title>`／og:title／twitter:title */
export function goSamDocumentTitle(entry: Pick<GoCatalogEntry, "title">): string {
  return `${goSamShareTitle(entry)} · 遊樂場`;
}

export function goSamDescription(
  entry: Pick<GoCatalogEntry, "title" | "blurb">
): string {
  const blurb = entry.blurb?.trim();
  if (blurb) return blurb;
  return `在山姆鍋遊樂場純玩「${goSamShareTitle(entry)}」。`;
}

export function goSamCanonicalUrl(
  catalogId: string,
  origin: string = PLAYGROUNDS_GO_ORIGIN
): string {
  return goSamShareHref(catalogId, origin);
}

export const GO_HOME_DOCUMENT_TITLE = "純玩 · 山姆鍋遊樂場";
export const GO_HOME_DESCRIPTION =
  "山姆鍋遊樂場 · 純玩——打開遊戲直接玩。";
