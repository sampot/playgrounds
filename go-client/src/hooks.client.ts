/**
 * Consume `#pg_provision=` as early as possible (before layout onMount / HMR
 * races that can strip the hash or hit `/v1/field/me` with a rotated key).
 */
import {
  boothDesktopScopeRedirect,
  installBoothDesktopNavigationGuards,
} from "$lib/boothDesktopNav";
import { isBoothDesktopShell } from "$lib/boothDesktop";
import { goAuth } from "$lib/goAuth.svelte";

function maybeBoothDesktopScopeRedirect(): boolean {
  if (!isBoothDesktopShell()) return false;
  const target = boothDesktopScopeRedirect(window.location.pathname);
  if (!target) return false;
  const { search, hash } = window.location;
  window.location.replace(`${target}${search}${hash}`);
  return true;
}

installBoothDesktopNavigationGuards();

if (!maybeBoothDesktopScopeRedirect()) {
  void goAuth.initFromLocation();
}
