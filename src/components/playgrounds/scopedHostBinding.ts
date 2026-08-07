/**
 * HOST-shaped subset binding from admitted scopes (DEC-051).
 * Same shape as full HOST; unauthorized methods are absent.
 */

import {
  filterAdmittedScopes,
  listKnownScopes,
  methodAllowedByScopes,
  methodsForScopes,
} from "./hostScopeMap";
import type { KnownCapability } from "./samCapabilities";

export interface ScopedHostBindingOptions {
  /** Effective scopes (steward = full catalog). */
  effectiveScopes: readonly string[];
}

/**
 * Wrap a full HOST-shaped object so only methods allowed by scopes are usable.
 * Always exposes capabilities()／listKnownScopes()／listAdmittedScopes().
 */
export function createScopedHostBinding(
  fullHost: Record<string, unknown>,
  options: ScopedHostBindingOptions
): Record<string, unknown> {
  const scopes = filterAdmittedScopes(options.effectiveScopes);
  const allowedMethods = new Set(methodsForScopes(scopes));
  const admittedList: KnownCapability[] = [...scopes];

  const resolve = (prop: string): unknown => {
    if (prop === "apiVersion") {
      return typeof fullHost.apiVersion === "function"
        ? (...args: unknown[]) =>
            (fullHost.apiVersion as (...a: unknown[]) => unknown)(...args)
        : async () => "1";
    }
    if (prop === "capabilities") {
      return async () =>
        methodsForScopes(scopes).filter(
          m => m !== "listKnownScopes" && m !== "listAdmittedScopes"
        );
    }
    if (prop === "listKnownScopes") {
      return async () => listKnownScopes();
    }
    if (prop === "listAdmittedScopes") {
      return async () => [...admittedList];
    }
    if (!allowedMethods.has(prop) || !methodAllowedByScopes(prop, scopes)) {
      return undefined;
    }
    const target = fullHost[prop];
    if (typeof target !== "function") return undefined;
    return (...args: unknown[]) =>
      (target as (...a: unknown[]) => unknown).apply(fullHost, args);
  };

  return new Proxy(
    {},
    {
      get(_t, prop) {
        if (typeof prop !== "string" || prop === "then") return undefined;
        return resolve(prop);
      },
      has(_t, prop) {
        if (typeof prop !== "string") return false;
        return resolve(prop) !== undefined;
      },
      ownKeys() {
        return [...allowedMethods].filter(m => resolve(m) !== undefined);
      },
      getOwnPropertyDescriptor(_t, prop) {
        if (typeof prop !== "string") return undefined;
        const value = resolve(prop);
        if (value === undefined) return undefined;
        return {
          configurable: true,
          enumerable: true,
          writable: false,
          value,
        };
      },
    }
  );
}
