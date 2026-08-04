/** Share-URL helpers and package parsing for the in-browser Python runner. */

/** Pinned jsDelivr channel; bump deliberately when upgrading Pyodide. */
export const PYODIDE_VERSION = "0.27.7";

export const PYODIDE_INDEX_URL = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;

export const PYODIDE_MODULE_URL = `${PYODIDE_INDEX_URL}pyodide.mjs`;

export const DEFAULT_PYTHON_CODE = `# 在瀏覽器執行的 CPython（Pyodide）
# 需要第三方套件時，填「套件」欄後再執行；或於程式內用 micropip.install

print("hello from python-runner")
for i in range(3):
    print(i)
`;

export interface PythonRunnerShareState {
  code: string;
  packages: string[];
}

const SHARE_VERSION = 1 as const;

/** Soft cap so shared links stay usable across browsers. */
export const MAX_SHARE_CODE_CHARS = 80_000;

export function parsePackageList(raw: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(/[\s,，;；]+/u)) {
    const name = part.trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    out.push(name);
  }
  return out;
}

export function formatPackageList(packages: string[]): string {
  return packages.join(", ");
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  const b64 =
    typeof globalThis.btoa === "function"
      ? globalThis.btoa(binary)
      : Buffer.from(bytes).toString("base64");
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/u, "");
}

function base64UrlToBytes(b64url: string): Uint8Array {
  const padded = b64url
    .replace(/-/gu, "+")
    .replace(/_/gu, "/")
    .padEnd(b64url.length + ((4 - (b64url.length % 4)) % 4), "=");
  if (typeof globalThis.atob === "function") {
    const binary = globalThis.atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }
  return new Uint8Array(Buffer.from(padded, "base64"));
}

function utf8ToBase64Url(text: string): string {
  return bytesToBase64Url(new TextEncoder().encode(text));
}

function base64UrlToUtf8(b64url: string): string {
  return new TextDecoder().decode(base64UrlToBytes(b64url));
}

/** Build `#s=…` fragment for deep-linking / sharing. */
export function encodeShareHash(state: PythonRunnerShareState): string {
  if (state.code.length > MAX_SHARE_CODE_CHARS) {
    throw new Error(
      `程式碼過長（>${MAX_SHARE_CODE_CHARS} 字元），無法產生分享連結。`
    );
  }
  const payload: { v: typeof SHARE_VERSION; c: string; p?: string[] } = {
    v: SHARE_VERSION,
    c: state.code,
  };
  if (state.packages.length > 0) {
    payload.p = state.packages;
  }
  return `#s=${utf8ToBase64Url(JSON.stringify(payload))}`;
}

export function decodeShareHash(hash: string): PythonRunnerShareState | null {
  const raw = hash.startsWith("#") ? hash.slice(1) : hash;
  if (!raw) return null;

  const params = new URLSearchParams(raw);
  const s = params.get("s");
  if (s) {
    try {
      const parsed = JSON.parse(base64UrlToUtf8(s)) as {
        v?: number;
        c?: unknown;
        p?: unknown;
      };
      if (parsed.v !== SHARE_VERSION || typeof parsed.c !== "string") {
        return null;
      }
      const packages = Array.isArray(parsed.p)
        ? parsed.p.filter((x): x is string => typeof x === "string")
        : [];
      return { code: parsed.c, packages: parsePackageList(packages.join(",")) };
    } catch {
      return null;
    }
  }

  // Legacy / simple: #code=<url-encoded>
  const codeParam = params.get("code");
  if (codeParam !== null) {
    const packages = parsePackageList(params.get("packages") ?? "");
    return { code: codeParam, packages };
  }

  return null;
}

/** Read share state from `?code=` / `?packages=` and / or `#s=` / `#code=`. */
export function decodeShareFromLocation(
  search: string,
  hash: string
): PythonRunnerShareState | null {
  const fromHash = decodeShareHash(hash);
  if (fromHash) return fromHash;

  const q = search.startsWith("?") ? search.slice(1) : search;
  if (!q) return null;
  const params = new URLSearchParams(q);
  const code = params.get("code");
  if (code === null) return null;
  return {
    code,
    packages: parsePackageList(params.get("packages") ?? ""),
  };
}

export function buildToolShareUrl(
  origin: string,
  pathname: string,
  state: PythonRunnerShareState
): string {
  const path = pathname.endsWith("/") ? pathname : `${pathname}/`;
  return `${origin}${path}${encodeShareHash(state)}`;
}
