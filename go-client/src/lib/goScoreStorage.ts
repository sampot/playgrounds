/**
 * Namespace localStorage inside SW canvas so solo scores key by catalog_id
 * (DEC-050 §6.5) — not by ephemeral sandboxId.
 */

const MARK = "data-go-score-ns";

/** Shared prefix for all go solo score keys (§6.6 clear). */
export const GO_SCORE_KEY_ROOT = "pg-go-score:";

export function goScorePrefixFor(catalogId: string): string {
  return `${GO_SCORE_KEY_ROOT}${catalogId.trim()}:`;
}

/** Inject into HTML before canvas serves the SAM (same-origin `/canvas/…`). */
export function injectGoScoreStorage(html: string, catalogId: string): string {
  const id = catalogId.trim();
  if (!id || html.includes(MARK)) return html;
  const prefix = goScorePrefixFor(id);
  const bridge = `<script ${MARK}>
(function () {
  var P = ${JSON.stringify(prefix)};
  try {
    var s = window.localStorage;
    var getItem = s.getItem.bind(s);
    var setItem = s.setItem.bind(s);
    var removeItem = s.removeItem.bind(s);
    s.getItem = function (k) { return getItem(P + String(k)); };
    s.setItem = function (k, v) { return setItem(P + String(k), String(v)); };
    s.removeItem = function (k) { return removeItem(P + String(k)); };
  } catch (_) { /* private／blocked */ }
})();
</script>`;
  if (/<head[\s>]/iu.test(html)) {
    return html.replace(/<head([^>]*)>/iu, `<head$1>${bridge}`);
  }
  if (/<html[\s>]/iu.test(html)) {
    return html.replace(/<html([^>]*)>/iu, `<html$1><head>${bridge}</head>`);
  }
  return `${bridge}${html}`;
}

function removeLocalStorageByPrefix(prefix: string): number {
  if (!prefix || typeof localStorage === "undefined") return 0;
  let n = 0;
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith(prefix)) keys.push(k);
    }
    for (const k of keys) {
      localStorage.removeItem(k);
      n += 1;
    }
  } catch {
    /* private／blocked */
  }
  return n;
}

/** Clear progress／scores for one catalog id (§6.6.3 layer 1). */
export function clearGoScoresForCatalog(catalogId: string): number {
  const id = catalogId.trim();
  if (!id) return 0;
  return removeLocalStorageByPrefix(goScorePrefixFor(id));
}

/** Clear all go solo score namespaces (§6.6.3 layer 3) — not theme／display name. */
export function clearAllGoScores(): number {
  return removeLocalStorageByPrefix(GO_SCORE_KEY_ROOT);
}
