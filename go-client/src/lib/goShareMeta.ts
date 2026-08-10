/**
 * Per-catalog share／document／OG titles (DEC-050 §5.5.1).
 * Site-level og:image（`/og.png`）so Facebook／LINE 等不回退到 favicon.
 */

import { goSamShareHref, PLAYGROUNDS_GO_ORIGIN } from "@utils/playgroundsUrls";
import type { GoCatalogEntry } from "./goCatalog";

export const GO_SITE_NAME = "山姆鍋遊樂場";

/** Absolute path of the site OG banner（1200×630）. */
export const GO_OG_IMAGE_PATH = "/og.png";
export const GO_OG_IMAGE_WIDTH = 1200;
export const GO_OG_IMAGE_HEIGHT = 630;

/** Canonical absolute OG image URL（crawlers need absolute）. */
export function goOgImageUrl(
  origin: string = PLAYGROUNDS_GO_ORIGIN
): string {
  return `${origin.replace(/\/$/, "")}${GO_OG_IMAGE_PATH}`;
}

/** Web Share／shareOrCopy title — catalog entry title only. */
export function goSamShareTitle(entry: Pick<GoCatalogEntry, "title">): string {
  return entry.title.trim() || "小品";
}

/** `<title>`／og:title／twitter:title for `/s/<id>` */
export function goSamDocumentTitle(entry: Pick<GoCatalogEntry, "title">): string {
  return `${goSamShareTitle(entry)} · ${GO_SITE_NAME}`;
}

export function goSamDescription(
  entry: Pick<GoCatalogEntry, "title" | "blurb">
): string {
  const blurb = entry.blurb?.trim();
  if (blurb) return `${GO_SITE_NAME} · 純玩｜${blurb}`;
  return `在${GO_SITE_NAME}純玩「${goSamShareTitle(entry)}」。打開即可玩。`;
}

export const GO_SAM_UNKNOWN_DESCRIPTION = `${GO_SITE_NAME} · 純玩小品。`;
export const GO_SAM_UNKNOWN_DOCUMENT_TITLE = `小品 · ${GO_SITE_NAME}`;

export function goSamCanonicalUrl(
  catalogId: string,
  origin: string = PLAYGROUNDS_GO_ORIGIN
): string {
  return goSamShareHref(catalogId, origin);
}

/** Brand-first home document title. */
export const GO_HOME_DOCUMENT_TITLE = `${GO_SITE_NAME} · 純玩`;

/** Site slogan — meta／OG description (includes brand prefix). */
export const GO_HOME_DESCRIPTION =
  `${GO_SITE_NAME} · 純玩 — Let's dash, go, and play!`;

/** On-page lead under h1 — shorter; brand lives in chrome. */
export const GO_HOME_LEAD = "純玩 — Let's dash, go, and play!";

export const GO_INVITE_DOCUMENT_TITLE = `接受邀請 · ${GO_SITE_NAME}`;
export const GO_INVITE_DESCRIPTION = `用邀請連結進入${GO_SITE_NAME}純玩。`;

export const GO_HELP_DOCUMENT_TITLE = `使用說明 · ${GO_SITE_NAME}`;
export const GO_HELP_DESCRIPTION =
  `${GO_SITE_NAME} · 純玩｜如何加入主畫面，以及用 LINE 等 App 內建瀏覽器開啟時怎麼改用系統瀏覽器。`;

export function goInviteCanonicalUrl(
  shortId: string,
  origin: string = PLAYGROUNDS_GO_ORIGIN
): string {
  const id = shortId.trim();
  return id ? `${origin}/i/${encodeURIComponent(id)}` : `${origin}/`;
}

/** Fields for svelte:head Open Graph／Twitter cards. */
export type GoOgMeta = {
  title: string;
  description: string;
  url: string;
  siteName: string;
  image: string;
  imageWidth: number;
  imageHeight: number;
};

export function goOgMeta(input: {
  title: string;
  description: string;
  url: string;
  /** Override default go origin for og:image（tests）. */
  origin?: string;
}): GoOgMeta {
  return {
    title: input.title,
    description: input.description,
    url: input.url,
    siteName: GO_SITE_NAME,
    image: goOgImageUrl(input.origin ?? PLAYGROUNDS_GO_ORIGIN),
    imageWidth: GO_OG_IMAGE_WIDTH,
    imageHeight: GO_OG_IMAGE_HEIGHT,
  };
}
