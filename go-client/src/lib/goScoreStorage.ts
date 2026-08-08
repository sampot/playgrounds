/**
 * Legacy UI localStorage score shim (pre–env.KV games)＋§6.6 clear helpers.
 * New SAMs should persist via functions.js → env.KV／env.DB (goWebKv／goWebDb).
 */

import { clearGoWebDbForCatalog } from "./goWebDb";
import { clearGoWebKvForCatalog } from "./goWebKv";

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

/** Legacy sync clear (localStorage shim only). Prefer clearGoProgressForCatalog. */
export function clearGoScoresForCatalog(catalogId: string): number {
  const id = catalogId.trim();
  if (!id) return 0;
  return removeLocalStorageByPrefix(goScorePrefixFor(id));
}

/** Legacy sync clear all score shims. Prefer clearAllGoProgress. */
export function clearAllGoScores(): number {
  return removeLocalStorageByPrefix(GO_SCORE_KEY_ROOT);
}

/**
 * §6.6.3 layer 1: legacy score localStorage＋env.KV／DB for catalog id.
 */
export async function clearGoProgressForCatalog(
  catalogId: string
): Promise<number> {
  const id = catalogId.trim();
  if (!id) return 0;
  let n = clearGoScoresForCatalog(id);
  n += await clearGoWebKvForCatalog(id);
  n += await clearGoWebDbForCatalog(id);
  return n;
}

/**
 * §6.6.3 layer 3: all legacy score shims＋all durable go KV／DB namespaces
 * that use `catalog:` prefix (via listing localStorage＋known idb — best-effort).
 */
export async function clearAllGoProgress(): Promise<number> {
  let n = clearAllGoScores();
  // Clear every catalog:* KV／DB we can discover from localStorage kv／db prefixes
  // plus in-memory; IDB catalog keys require iteration.
  try {
    if (typeof indexedDB !== "undefined") {
      n += await clearAllCatalogIdbKv();
      n += await clearAllCatalogIdbDb();
    }
  } catch {
    /* ignore */
  }
  // localStorage-backed go KV／DB leftovers
  n += removeLocalStorageByPrefix("pg-go-kv:");
  n += removeLocalStorageByPrefix("pg-go-db:");
  return n;
}

async function clearAllCatalogIdbKv(): Promise<number> {
  return new Promise(resolve => {
    const req = indexedDB.open("go-sam-kv-v1", 1);
    req.onerror = () => resolve(0);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("entries")) {
        db.createObjectStore("entries");
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("entries")) {
        db.close();
        resolve(0);
        return;
      }
      const tx = db.transaction("entries", "readwrite");
      const store = tx.objectStore("entries");
      const getKeys = store.getAllKeys();
      getKeys.onsuccess = () => {
        const keys = (getKeys.result as IDBValidKey[]).map(String);
        let n = 0;
        for (const k of keys) {
          if (k.startsWith("catalog:")) {
            store.delete(k);
            n += 1;
          }
        }
        tx.oncomplete = () => {
          db.close();
          resolve(n);
        };
      };
      getKeys.onerror = () => {
        db.close();
        resolve(0);
      };
    };
  });
}

async function clearAllCatalogIdbDb(): Promise<number> {
  return new Promise(resolve => {
    const req = indexedDB.open("go-sam-db-v1", 1);
    req.onerror = () => resolve(0);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("sqlite")) {
        db.createObjectStore("sqlite");
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("sqlite")) {
        db.close();
        resolve(0);
        return;
      }
      const tx = db.transaction("sqlite", "readwrite");
      const store = tx.objectStore("sqlite");
      const getKeys = store.getAllKeys();
      getKeys.onsuccess = () => {
        const keys = (getKeys.result as IDBValidKey[]).map(String);
        let n = 0;
        for (const k of keys) {
          if (k.startsWith("catalog:")) {
            store.delete(k);
            n += 1;
          }
        }
        tx.oncomplete = () => {
          db.close();
          resolve(n);
        };
      };
      getKeys.onerror = () => {
        db.close();
        resolve(0);
      };
    };
  });
}
