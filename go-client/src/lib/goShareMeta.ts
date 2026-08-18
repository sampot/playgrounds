/**
 * Per-catalog share／document／OG titles (DEC-050 §5.5.1).
 * Site-level og:image（`/og.png`）so Facebook／LINE 等不回退到 favicon.
 */

import { goSamShareHref, PLAYGROUNDS_GO_ORIGIN } from "@utils/playgroundsUrls";
import {
  GENERATED_SAM_KIND_LABEL,
  type GeneratedSamKind,
} from "@data/samCatalog.generated";
import type { GoCatalogEntry } from "./goCatalog";

export const GO_SITE_NAME = "山姆鍋遊樂場";

/** Short brand label for pure-play surface (manifest／apple title／JSON-LD name). */
export const GO_PURE_PLAY_NAME = `${GO_SITE_NAME} · 純玩`;

/** Absolute path of the site OG banner（1200×630）. */
export const GO_OG_IMAGE_PATH = "/og.png";
export const GO_OG_IMAGE_WIDTH = 1200;
export const GO_OG_IMAGE_HEIGHT = 630;

/** Accessible description of the site OG banner. */
export const GO_OG_IMAGE_ALT =
  "山姆鍋遊樂場純玩 — 瀏覽器小品與遊戲預覽圖";

/** X／Twitter handle for twitter:site attribution. */
export const GO_TWITTER_SITE = "@sampotkuo";

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

/**
 * Brand-first home document title — keeps「純玩」identity, adds one play cue
 * (Chinese search SERP width ≠ Latin 50–60 chars).
 */
export const GO_HOME_DOCUMENT_TITLE =
  `${GO_SITE_NAME} · 純玩｜打開就能玩的瀏覽器小品`;

/**
 * Meta／OG description: what go is (guest play client), not a generic slogan pad.
 * Keeps the bilingual tagline as a closing beat.
 */
export const GO_HOME_DESCRIPTION =
  `${GO_SITE_NAME} · 純玩是免安裝、無編輯器的玩家主場：從遊樂場大廳搜尋或推薦挑一款瀏覽器小品打開就玩，造訪過的還能離線再開。Let's dash, go, and play!`;

/** On-page lead under h1 — shorter; brand lives in chrome. */
export const GO_HOME_LEAD = "純玩 — Let's dash, go, and play!";

export const GO_INVITE_DOCUMENT_TITLE = `接受邀請 · ${GO_SITE_NAME}`;
export const GO_INVITE_DESCRIPTION = `用邀請連結進入${GO_SITE_NAME}純玩。`;

export const GO_HELP_DOCUMENT_TITLE = `使用說明 · ${GO_SITE_NAME}`;
export const GO_HELP_DESCRIPTION =
  `${GO_SITE_NAME} · 純玩｜如何加入主畫面，以及用 LINE 等 App 內建瀏覽器開啟時怎麼改用系統瀏覽器。`;

export const GO_ROOM_DOCUMENT_TITLE = `包廂 · ${GO_SITE_NAME}`;
export const GO_ROOM_DESCRIPTION =
  `${GO_SITE_NAME} · 純玩｜會員可邀請朋友進包廂：連線對話、傳送檔案。對話與檔案只在在場者的瀏覽器之間，不會存到伺服器。`;

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
  imageAlt: string;
  imageWidth: number;
  imageHeight: number;
  twitterSite: string;
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
    imageAlt: GO_OG_IMAGE_ALT,
    imageWidth: GO_OG_IMAGE_WIDTH,
    imageHeight: GO_OG_IMAGE_HEIGHT,
    twitterSite: GO_TWITTER_SITE,
  };
}

export type GoJsonLdObject = Record<string, unknown>;

/** Home structured data — WebSite (guest play origin). */
export function goWebsiteJsonLd(
  origin: string = PLAYGROUNDS_GO_ORIGIN
): GoJsonLdObject {
  const base = origin.replace(/\/$/, "");
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    url: `${base}/`,
    name: GO_PURE_PLAY_NAME,
    alternateName: GO_SITE_NAME,
    inLanguage: "zh-Hant",
    description: GO_HOME_DESCRIPTION,
    image: goOgImageUrl(origin),
  };
}

/** Indexable route structured data — WebPage under the go WebSite. */
export function goWebPageJsonLd(input: {
  title: string;
  description: string;
  url: string;
  origin?: string;
}): GoJsonLdObject {
  const base = (input.origin ?? PLAYGROUNDS_GO_ORIGIN).replace(/\/$/, "");
  return {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: input.title,
    description: input.description,
    url: input.url,
    isPartOf: {
      "@type": "WebSite",
      name: GO_PURE_PLAY_NAME,
      url: `${base}/`,
    },
    inLanguage: "zh-Hant",
  };
}

/** Listed catalog entries are indexable; unlisted／missing are not. */
export function goSamIsIndexable(
  entry: Pick<GoCatalogEntry, "status"> | null | undefined
): boolean {
  return entry?.status === "listed";
}

/** Short zh label for catalog kind (on-page meta, not schema). */
export function goSamKindLabel(
  kind: GoCatalogEntry["kind"] | GeneratedSamKind | undefined | null
): string {
  if (!kind) return "";
  return GENERATED_SAM_KIND_LABEL[kind] ?? kind;
}

function goSamSchemaType(
  kind: GoCatalogEntry["kind"] | undefined
): "VideoGame" | "WebApplication" {
  return kind === "game" ? "VideoGame" : "WebApplication";
}

/**
 * Structured data for `/s/<id>` — VideoGame for games, WebApplication otherwise.
 * Uses entry blurb when present so body／meta／JSON-LD stay aligned.
 */
export function goSamJsonLd(
  entry: Pick<GoCatalogEntry, "id" | "title" | "blurb" | "kind" | "status"> &
    Partial<Pick<GoCatalogEntry, "series">>,
  origin: string = PLAYGROUNDS_GO_ORIGIN
): GoJsonLdObject {
  const base = origin.replace(/\/$/, "");
  const blurb = entry.blurb?.trim();
  const description = blurb || goSamDescription(entry);
  const ld: GoJsonLdObject = {
    "@context": "https://schema.org",
    "@type": goSamSchemaType(entry.kind),
    name: goSamShareTitle(entry),
    description,
    url: goSamCanonicalUrl(entry.id, origin),
    image: goOgImageUrl(origin),
    isPartOf: {
      "@type": "WebSite",
      name: GO_PURE_PLAY_NAME,
      url: `${base}/`,
    },
    inLanguage: "zh-Hant",
  };
  const series = entry.series?.trim();
  if (series && entry.kind === "game") {
    ld.genre = series;
  }
  if (entry.kind !== "game") {
    ld.applicationCategory =
      entry.kind === "tool" ? "UtilitiesApplication" : "BrowserApplication";
  }
  return ld;
}
