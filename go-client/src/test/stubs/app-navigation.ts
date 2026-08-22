/** Vitest stub for `$app/navigation` (root vitest has no SvelteKit runtime). */

let lastReplaceStateUrl: string | null = null;

export function replaceState(url: string | URL, _state: Record<string, unknown> = {}): void {
  lastReplaceStateUrl = String(url);
}

export function pushState(_url: string | URL, _state: Record<string, unknown> = {}): void {
  /* unused in go-client unit tests */
}

export async function goto(_url: string | URL): Promise<void> {
  /* unused in go-client unit tests */
}

export function __getLastReplaceStateUrlForTests(): string | null {
  return lastReplaceStateUrl;
}

export function __resetNavigationStubForTests(): void {
  lastReplaceStateUrl = null;
}
