/**
 * Playgrounds field-net edge (DEC-042／043).
 * Serves Astro static assets; reserved subdomains must not run as fields.
 *
 * With zone route `*.samkuo.me/*`, `docs` also hits this Worker. Forward to
 * `playgrounds-docs` via service binding — never 302 to docs.samkuo.me
 * (that loops: ERR_TOO_MANY_REDIRECTS).
 */

const FIELD_SUFFIX = ".samkuo.me";

/** Keep in sync with PLAYGROUNDS_FIELD_RESERVED_SUBDOMAINS (client). */
const RESERVED = new Set(["www", "blog", "api", "docs", "old-blog"]);

type AssetsFetcher = {
  fetch(input: Request | URL | string, init?: RequestInit): Promise<Response>;
};

type WorkerEnv = {
  ASSETS: AssetsFetcher;
  /** Service binding → playgrounds-docs (DEC-043). */
  DOCS?: AssetsFetcher;
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
    if (reserved === "docs") {
      if (env.DOCS) {
        return env.DOCS.fetch(request);
      }
      return new Response(
        "docs.samkuo.me is reserved for the docs Worker (playgrounds-docs).",
        { status: 502, headers: { "content-type": "text/plain; charset=utf-8" } }
      );
    }
    if (reserved) {
      // Prefer apex over serving a field shell on site infra names.
      return Response.redirect("https://samkuo.me/", 302);
    }
    return env.ASSETS.fetch(request);
  },
};
