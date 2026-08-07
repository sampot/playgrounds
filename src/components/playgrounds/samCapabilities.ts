/**
 * Environment capability scopes (DEC-036／DEC-051).
 * Declare via sam:capabilities; admit → ProjectMeta.admittedCapabilities.
 */

/** Scope catalog v0 (sam:capabilities). Stored form is always these tokens. */
export const KNOWN_CAPABILITIES = [
  "compute:python",
  "compute:cmd",
  "sandbox:list",
  "sandbox:read",
  "sandbox:write",
  "sandbox:edit",
  "sandbox:create",
  "sandbox:delete-managed",
  "canvas:observe",
  "secrets:list",
  "secrets:get",
  "platform:invite",
  "session:host",
  "agent:fleet",
  "ui:tabs",
  "checkpoint",
] as const;

export type KnownCapability = (typeof KNOWN_CAPABILITIES)[number];

const KNOWN_SET = new Set<string>(KNOWN_CAPABILITIES);

/** Legacy DEC-036 MVP tokens → v0 scopes (normalize on filter／persist). */
export const CAPABILITY_ALIASES: Readonly<Record<string, KnownCapability>> = {
  runPython: "compute:python",
  runCmd: "compute:cmd",
};

/** Tokens that inject env.COMPUTE (and HOST compute methods) when admitted. */
export const COMPUTE_CAPABILITIES: readonly KnownCapability[] = [
  "compute:python",
  "compute:cmd",
];

const LABELS: Record<KnownCapability, string> = {
  "compute:python": "執行 Python（Pyodide；數據／公式）",
  "compute:cmd": "執行允許清單命令列（WASI）",
  "sandbox:list": "列舉沙盒與目錄／檔名（不含讀內容）",
  "sandbox:read": "讀取其他沙盒的檔案內容（不含列舉）",
  "sandbox:write": "寫入／刪除其他沙盒檔案（含建目錄；不含列舉／讀）",
  "sandbox:edit": "列舉並讀寫其他沙盒檔案（編輯）",
  "sandbox:create": "建立、複製、開關沙盒與工作集",
  "sandbox:delete-managed": "刪除標為 agentManaged 的沙盒",
  "canvas:observe": "觀察工作畫布（console／網路／DOM／截圖／reload）",
  "secrets:list": "列出密鑰庫名稱與 meta（無值）",
  "secrets:get": "經 env.secrets.<NAME>.get() 讀密鑰值",
  "platform:invite": "鑄／撤場 Invite（殼代理；須已 provision）",
  "session:host": "開／關／編排本機 multi-agent session",
  "agent:fleet": "艦隊只讀摘要與顯示標註",
  "ui:tabs": "主內容 tabs／掛載 plain 或 Tool",
  checkpoint: "target 沙盒 checkpoint 列舉／建立／還原",
};

/** sandbox:edit implies list + read + write at gate-check time. */
const EDIT_IMPLIES: readonly KnownCapability[] = [
  "sandbox:list",
  "sandbox:read",
  "sandbox:write",
];

export function isKnownCapability(token: string): token is KnownCapability {
  return KNOWN_SET.has(token);
}

/** Apply aliases then lowercase v0 tokens; drop unknown. */
export function normalizeCapabilityToken(raw: string): KnownCapability | null {
  const trimmed = String(raw || "").trim();
  if (!trimmed) return null;
  // Legacy aliases are case-sensitive spellings (runPython / runCmd).
  const aliased = CAPABILITY_ALIASES[trimmed];
  if (aliased) return aliased;
  const lower = trimmed.toLowerCase();
  if (isKnownCapability(lower)) return lower;
  return null;
}

/** Drop unknown tokens (do not admit); preserve order; dedupe; store v0 only. */
export function filterKnownCapabilities(
  tokens: readonly string[] | null | undefined
): KnownCapability[] {
  if (!tokens?.length) return [];
  const out: KnownCapability[] = [];
  const seen = new Set<string>();
  for (const raw of tokens) {
    const known = normalizeCapabilityToken(String(raw || ""));
    if (!known || seen.has(known)) continue;
    seen.add(known);
    out.push(known);
  }
  return out;
}

export function capabilityLabel(token: string): string {
  const n = filterKnownCapabilities([token])[0];
  if (n) return LABELS[n];
  return token;
}

/** Declared minus admitted (known tokens only; both sides normalized). */
export function pendingCapabilities(
  declared: readonly string[] | null | undefined,
  admitted: readonly string[] | null | undefined
): KnownCapability[] {
  const adm = new Set(filterKnownCapabilities(admitted));
  return filterKnownCapabilities(declared).filter(t => !adm.has(t));
}

/** Keep only admitted tokens still present in the declaration. */
export function pruneAdmittedToDeclared(
  declared: readonly string[] | null | undefined,
  admitted: readonly string[] | null | undefined
): KnownCapability[] {
  const d = new Set(filterKnownCapabilities(declared));
  return filterKnownCapabilities(admitted).filter(t => d.has(t));
}

export function admitsCompute(
  admitted: readonly string[] | null | undefined
): boolean {
  const set = new Set(filterKnownCapabilities(admitted));
  return COMPUTE_CAPABILITIES.some(t => set.has(t));
}

export function admitsSecretsGet(
  admitted: readonly string[] | null | undefined
): boolean {
  return hasCapability(admitted, "secrets:get");
}

/**
 * Gate-check: whether effective scopes include `token`.
 * `sandbox:edit` satisfies list／read／write.
 */
export function hasCapability(
  admitted: readonly string[] | null | undefined,
  token: KnownCapability
): boolean {
  const set = new Set(filterKnownCapabilities(admitted));
  if (set.has(token)) return true;
  if (
    set.has("sandbox:edit") &&
    (EDIT_IMPLIES as readonly string[]).includes(token)
  ) {
    return true;
  }
  return false;
}

/** Expand edit for gate checks (does not mutate stored admitted set). */
export function expandEffectiveCapabilities(
  admitted: readonly string[] | null | undefined
): KnownCapability[] {
  const base = filterKnownCapabilities(admitted);
  if (!base.includes("sandbox:edit")) return base;
  const out = [...base];
  const seen = new Set<string>(out);
  for (const t of EDIT_IMPLIES) {
    if (!seen.has(t)) {
      seen.add(t);
      out.push(t);
    }
  }
  return out;
}

/** Full catalog — steward seat shortcut (DEC-051). */
export function allKnownCapabilities(): KnownCapability[] {
  return [...KNOWN_CAPABILITIES];
}

/**
 * Effective scopes for a sandbox: steward → full catalog; else admitted only.
 */
export function effectiveCapabilities(opts: {
  admitted: readonly string[] | null | undefined;
  isSteward: boolean;
}): KnownCapability[] {
  if (opts.isSteward) return allKnownCapabilities();
  return filterKnownCapabilities(opts.admitted);
}

export function formatCapabilitiesMessage(tokens: readonly string[]): string {
  const lines = filterKnownCapabilities(tokens).map(t => {
    const note =
      t === "sandbox:edit" ? "（含 list＋read＋write）" : "";
    return `• ${capabilityLabel(t)}（${t}）${note}`;
  });
  if (!lines.length) return "";
  return [
    "此沙盒宣告需要下列環境能力。同意後，其 functions.js／controller 可經 env.HOST（子集）使用；compute 遷移期仍可兼 env.COMPUTE：",
    "",
    ...lines,
    "",
    "可拒絕；沙盒仍可開啟，但呼叫未授權能力會失敗。",
  ].join("\n");
}
