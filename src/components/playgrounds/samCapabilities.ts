/**
 * Environment capabilities declare / admit helpers (DEC-036).
 */

/** MVP catalog tokens (sam:capabilities). */
export const KNOWN_CAPABILITIES = ["runPython", "runCmd"] as const;

export type KnownCapability = (typeof KNOWN_CAPABILITIES)[number];

const KNOWN_SET = new Set<string>(KNOWN_CAPABILITIES);

/** Tokens that inject env.COMPUTE when admitted. */
export const COMPUTE_CAPABILITIES: readonly KnownCapability[] = [
  "runPython",
  "runCmd",
];

const LABELS: Record<KnownCapability, string> = {
  runPython: "執行 Python（數據／公式；Pyodide）",
  runCmd: "執行允許清單命令列（WASI）",
};

export function isKnownCapability(token: string): token is KnownCapability {
  return KNOWN_SET.has(token);
}

/** Drop unknown tokens (do not admit); preserve order; dedupe. */
export function filterKnownCapabilities(
  tokens: readonly string[] | null | undefined
): KnownCapability[] {
  if (!tokens?.length) return [];
  const out: KnownCapability[] = [];
  const seen = new Set<string>();
  for (const raw of tokens) {
    const t = String(raw || "").trim();
    if (!t || seen.has(t) || !isKnownCapability(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

export function capabilityLabel(token: string): string {
  if (isKnownCapability(token)) return LABELS[token];
  return token;
}

/** Declared minus admitted (known tokens only). */
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

export function formatCapabilitiesMessage(tokens: readonly string[]): string {
  const lines = filterKnownCapabilities(tokens).map(
    t => `• ${capabilityLabel(t)}（${t}）`
  );
  if (!lines.length) return "";
  return [
    "此沙盒宣告需要下列環境能力。同意後，其 functions.js／controller 可經 env.COMPUTE 使用：",
    "",
    ...lines,
    "",
    "可拒絕；沙盒仍可開啟，但呼叫未授權能力會失敗。",
  ].join("\n");
}
