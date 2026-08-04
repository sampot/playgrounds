/**
 * Bridge SecretStore unlock material → Backend Runtime (DEC-038 §6.3-A).
 * Avoids circular imports between secretStore and backendHost.
 */

type PushFn = (secrets: Record<string, string>) => void | Promise<void>;
type ClearFn = () => void | Promise<void>;

let pushFn: PushFn | null = null;
let clearFn: ClearFn | null = null;

export function registerSecretRuntimeBridge(
  hooks: {
    push: PushFn;
    clear: ClearFn;
  } | null
): void {
  pushFn = hooks?.push ?? null;
  clearFn = hooks?.clear ?? null;
}

export async function pushSecretsMaterialToRuntime(
  secrets: Record<string, string>
): Promise<void> {
  if (!pushFn) return;
  await pushFn(secrets);
}

export async function clearSecretsMaterialOnRuntime(): Promise<void> {
  if (!clearFn) return;
  await clearFn();
}
