type AssetsBinding = {
  fetch(request: Request): Promise<Response>;
};

export type GoWorkerEnv = {
  ASSETS: AssetsBinding;
};

function isInvitePath(pathname: string): boolean {
  return pathname === "/i" || pathname.startsWith("/i/");
}

export default {
  async fetch(request: Request, env: GoWorkerEnv): Promise<Response> {
    const url = new URL(request.url);
    if (!isInvitePath(url.pathname)) {
      return env.ASSETS.fetch(request);
    }

    // Static Assets' HTML handling maps `/200` to `200.html` without emitting
    // the public redirect that an explicit `/200.html` request would trigger.
    const fallbackUrl = new URL("/200", url);
    const fallbackRequest = new Request(fallbackUrl, request);
    return env.ASSETS.fetch(fallbackRequest);
  },
};
