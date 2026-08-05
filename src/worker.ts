/**
 * Playgrounds field-net edge (DEC-042).
 * Serves Astro static assets; rejects reserved subdomains when on *.samkuo.me.
 */

const FIELD_SUFFIX = ".samkuo.me";

/** Keep in sync with PLAYGROUNDS_FIELD_RESERVED_SUBDOMAINS (client). */
const RESERVED = new Set(["www", "blog", "api", "docs", "old-blog"]);

type AssetsFetcher = {
  fetch(input: Request | URL | string, init?: RequestInit): Promise<Response>;
};

type WorkerEnv = {
  ASSETS: AssetsFetcher;
};

function reservedSubdomain(hostname: string): string | null {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  if (!host.endsWith(FIELD_SUFFIX)) return null;
  const sub = host.slice(0, -FIELD_SUFFIX.length);
  if (!sub || sub.includes(".")) return null;
  return RESERVED.has(sub) ? sub : null;
}

export default {
  async fetch(request: Request, env: WorkerEnv): Promise<Response> {
    const url = new URL(request.url);
    const reserved = reservedSubdomain(url.hostname);
    if (reserved) {
      // docs = Starlight site (DEC-043); other reserved → apex.
      if (reserved === "docs") {
        return Response.redirect("https://docs.samkuo.me/", 302);
      }
      return Response.redirect("https://samkuo.me/", 302);
    }
    return env.ASSETS.fetch(request);
  },
};
