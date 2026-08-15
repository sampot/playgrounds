/**
 * Choose which go shell window Client(s) should receive canvas `/api` forwards.
 * Prefer solo／invite pages that install `installGoCanvasApiListener`; home alone
 * has no handler and would leave the SW waiting until api_timeout.
 */

export type GoShellClientLike = {
  url: string;
  focused?: boolean;
  visibilityState?: string;
};

export function isGoShellClientPath(pathname: string, canvasPrefix = "/canvas/"): boolean {
  return !pathname.startsWith(canvasPrefix);
}

export function isGoCanvasHostPath(pathname: string): boolean {
  return (
    pathname.startsWith("/s/") ||
    pathname === "/i" ||
    pathname.startsWith("/i/")
  );
}

/** Ordered candidates: focused host → visible host → any host → other shell tabs. */
export function pickGoShellApiClients<T extends GoShellClientLike>(
  clients: readonly T[],
  canvasPrefix = "/canvas/"
): T[] {
  const hosts: T[] = [];
  const otherShell: T[] = [];
  for (const client of clients) {
    let pathname = "/";
    try {
      pathname = new URL(client.url).pathname;
    } catch {
      continue;
    }
    if (!isGoShellClientPath(pathname, canvasPrefix)) continue;
    if (isGoCanvasHostPath(pathname)) hosts.push(client);
    else otherShell.push(client);
  }
  const rank = (c: T) => {
    if (c.focused) return 0;
    if (c.visibilityState === "visible") return 1;
    return 2;
  };
  hosts.sort((a, b) => rank(a) - rank(b));
  otherShell.sort((a, b) => rank(a) - rank(b));
  return [...hosts, ...otherShell];
}
