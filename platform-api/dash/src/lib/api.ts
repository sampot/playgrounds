const AT_KEY = "pg_dash_access_token";

export type Me = {
  user_id: string;
  role: "admin" | "user";
  github: { id: string; login: string } | null;
  google: { id: string; email: string } | null;
  key: { prefix: string; created_at: number } | null;
};

export type AdminUser = {
  user_id: string;
  role: "admin" | "user";
  disabled: boolean;
  created_at: number;
  github: { id: string; login: string } | null;
  google: { id: string; email: string } | null;
  key: { prefix: string; created_at: number } | null;
};

export function getAccessToken(): string {
  try {
    return sessionStorage.getItem(AT_KEY) || "";
  } catch {
    return "";
  }
}

export function setAccessToken(token: string | null): void {
  try {
    if (token) sessionStorage.setItem(AT_KEY, token);
    else sessionStorage.removeItem(AT_KEY);
    sessionStorage.removeItem("pg_dash_api_key");
  } catch {
    /* ignore */
  }
}

export async function api<T = Record<string, unknown>>(
  path: string,
  opts: RequestInit = {}
): Promise<{ res: Response; data: T }> {
  const headers = new Headers(opts.headers);
  if (!headers.has("Content-Type") && opts.body) {
    headers.set("Content-Type", "application/json");
  }
  const t = getAccessToken();
  if (t) headers.set("Authorization", `Bearer ${t}`);
  const res = await fetch(path, { ...opts, headers, credentials: "include" });
  const text = await res.text();
  let data = {} as T;
  try {
    data = (text ? JSON.parse(text) : {}) as T;
  } catch {
    data = { raw: text } as T;
  }
  return { res, data };
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function formatTime(ms: number | undefined): string {
  if (!ms) return "";
  try {
    return new Date(ms).toLocaleString("zh-TW");
  } catch {
    return String(ms);
  }
}
