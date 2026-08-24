/** Routes where Escape leaves the page for the lobby home. */
export function isEscapeHomePath(pathname: string): boolean {
  const path = pathname.replace(/\/+$/, "") || "/";
  return path === "/help" || path === "/apps" || path === "/chat" || path === "/room";
}

export function shouldEscapeToHome(args: {
  key: string;
  pathname: string;
  modalOpen?: boolean;
  textEntry?: boolean;
  /** pg-booth-desktop: stay on booth; no lobby escape. */
  boothDesktop?: boolean;
}): boolean {
  if (args.key !== "Escape") return false;
  if (args.modalOpen) return false;
  if (args.textEntry) return false;
  if (args.boothDesktop) return false;
  return isEscapeHomePath(args.pathname);
}
