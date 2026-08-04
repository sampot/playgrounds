/**
 * Delegate binding API version and capability tokens (DEC-022／037).
 * Historical name: TOOL_* (same values during migration).
 */

export const DELEGATE_API_VERSION = "1";
/** @deprecated use DELEGATE_API_VERSION */
export const TOOL_API_VERSION = DELEGATE_API_VERSION;

/** Capability names returned by DELEGATE.capabilities(). */
export const DELEGATE_CAPABILITIES = [
  "apiVersion",
  "capabilities",
  "getGrant",
  "readFile",
  "writeFile",
  "readFileBase64",
  "writeFileBase64",
  "close",
  "expectedHash",
  "db",
  "kv",
] as const;

/** @deprecated use DELEGATE_CAPABILITIES */
export const TOOL_CAPABILITIES = DELEGATE_CAPABILITIES;

export type DelegateCapability = (typeof DELEGATE_CAPABILITIES)[number];
/** @deprecated use DelegateCapability */
export type ToolCapability = DelegateCapability;
