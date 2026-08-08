/**
 * Namespace localStorage inside SW canvas so solo scores key by catalog_id
 * (DEC-050 §6.5) — not by ephemeral sandboxId.
 */

const MARK = "data-go-score-ns";

/** Inject into HTML before canvas serves the SAM (same-origin `/canvas/…`). */
export function injectGoScoreStorage(html: string, catalogId: string): string {
  const id = catalogId.trim();
  if (!id || html.includes(MARK)) return html;
  const prefix = `pg-go-score:${id}:`;
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
