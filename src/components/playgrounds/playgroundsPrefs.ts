/**
 * Shell-level Playgrounds preferences (localStorage).
 * Separate from layout sizes / tool match / Agent BYOK.
 */

export const PLAYGROUNDS_PREFS_KEY = "playgrounds-prefs-v1";

export interface PlaygroundsPrefs {
  /**
   * When true, canvas bridge also calls the native browser console
   * (DevTools). Default false so work/agent logs stay in the Console panel
   * and do not clutter shell debugging.
   */
  mirrorConsoleToBrowser: boolean;
}

export function defaultPlaygroundsPrefs(): PlaygroundsPrefs {
  return {
    mirrorConsoleToBrowser: false,
  };
}

export function readPlaygroundsPrefs(
  storage: Pick<Storage, "getItem"> | null | undefined = globalThis.localStorage
): PlaygroundsPrefs {
  const defaults = defaultPlaygroundsPrefs();
  try {
    const raw = storage?.getItem(PLAYGROUNDS_PREFS_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) as Partial<PlaygroundsPrefs>;
    return {
      mirrorConsoleToBrowser:
        typeof parsed.mirrorConsoleToBrowser === "boolean"
          ? parsed.mirrorConsoleToBrowser
          : defaults.mirrorConsoleToBrowser,
    };
  } catch {
    return defaults;
  }
}

export function writePlaygroundsPrefs(
  prefs: PlaygroundsPrefs,
  storage: Pick<Storage, "setItem"> | null | undefined = globalThis.localStorage
): void {
  try {
    storage?.setItem(PLAYGROUNDS_PREFS_KEY, JSON.stringify(prefs));
  } catch {
    /* ignore quota / private mode */
  }
}

export function patchPlaygroundsPrefs(
  patch: Partial<PlaygroundsPrefs>,
  storage:
    | Pick<Storage, "getItem" | "setItem">
    | null
    | undefined = globalThis.localStorage
): PlaygroundsPrefs {
  const next = { ...readPlaygroundsPrefs(storage), ...patch };
  writePlaygroundsPrefs(next, storage);
  return next;
}

/** postMessage type: shell → canvas iframe (bridge listens). */
export const CONSOLE_MIRROR_MESSAGE_TYPE = "playgrounds-console-mirror";

/** postMessage type: canvas → shell; shell replies with current mirror flag. */
export const CONSOLE_MIRROR_HELLO_TYPE = "playgrounds-console-mirror-hello";

export function buildConsoleMirrorMessage(enabled: boolean): {
  type: typeof CONSOLE_MIRROR_MESSAGE_TYPE;
  enabled: boolean;
} {
  return { type: CONSOLE_MIRROR_MESSAGE_TYPE, enabled: Boolean(enabled) };
}
