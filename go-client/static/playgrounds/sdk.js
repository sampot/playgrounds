/*!
 * Playgrounds UI SDK — window.PG (PG-UI-SDK-SPEC.md §3 / §4)
 *
 * Thin wrapper around `fetch("/api/...")`. The SDK does NOT hold any env
 * object (DEC-031), does NOT redefine window.fetch (CANVAS_BRIDGE owns the
 * rewrite), and does NOT expose secret values (DEC-029/035).
 *
 * Loaded by the canvas bridge as `<script src="/playgrounds/sdk.js" defer>`.
 *
 * window.PG is published in two phases:
 *   1. synchronously:  window.PG = { version: "1", ready: <Promise> }
 *   2. after bootstrap:  the Promise resolves to the full surface; SESSION /
 *      COMPUTE / DELEGATE / HOST attach only when the backend advertises
 *      them in /api/capabilities (SPEC §6.1; absent attribute = unadmitted).
 */
(function () {
  "use strict";

  var VERSION = "1";
  var API = "/api/";

  // -------------------------------------------------------------------------
  // Fetch wrapper. All calls go through window.fetch; the canvas bridge in
  // CANVAS_BRIDGE_SCRIPT rewrites `/api/...` to the canvas path.
  // -------------------------------------------------------------------------
  function toError(res, fallbackCode) {
    return res.clone().json().then(function (j) {
      var err = new Error((j && j.message) || ("HTTP " + res.status));
      err.name = "PgError";
      err.code = (j && j.code) || fallbackCode;
      err.status = res.status;
      if (j && j.upstream) err.upstream = j.upstream;
      throw err;
    }, function () {
      var err = new Error("HTTP " + res.status);
      err.name = "PgError";
      err.code = fallbackCode;
      err.status = res.status;
      throw err;
    });
  }

  function get(path, fallbackCode) {
    fallbackCode = fallbackCode || "internal_error";
    return window.fetch(path, { method: "GET", credentials: "same-origin" }).then(function (res) {
      if (res.status === 404) {
        // KV / vars semantics: missing key → null (not an error).
        return res.clone().json().then(function (j) {
          if (j && j.code === "not_found") return null;
          return null;
        }, function () {
          return null;
        });
      }
      if (!res.ok) return toError(res, fallbackCode);
      return res.text();
    });
  }

  function send(method, path, body, contentType, fallbackCode) {
    fallbackCode = fallbackCode || "internal_error";
    var init = {
      method: method,
      credentials: "same-origin",
      headers: contentType ? { "content-type": contentType } : undefined,
      body: body == null ? null : body,
    };
    return window.fetch(path, init).then(function (res) {
      if (res.status === 204) return null;
      if (!res.ok) return toError(res, fallbackCode);
      return res.json();
    });
  }

  function encodeKey(key) {
    return encodeURIComponent(key);
  }

  // -------------------------------------------------------------------------
  // PG.kv
  // -------------------------------------------------------------------------
  function makeKv() {
    return {
      get: function (key) {
        return get(API + "kv/" + encodeKey(key));
      },
      put: function (key, value, opts) {
        var path = API + "kv/" + encodeKey(key);
        if (opts && typeof opts.expirationTtl === "number") {
          path += "?ttl=" + encodeURIComponent(String(opts.expirationTtl));
        }
        return send("PUT", path, value, "text/plain");
      },
      delete: function (key) {
        return send("DELETE", API + "kv/" + encodeKey(key), null, null);
      },
      list: function (opts) {
        opts = opts || {};
        var payload = {};
        if (opts.prefix != null) payload.prefix = opts.prefix;
        if (opts.cursor != null) payload.cursor = opts.cursor;
        if (opts.limit != null) payload.limit = opts.limit;
        return send("POST", API + "kv/list", JSON.stringify(payload), "application/json");
      },
    };
  }

  // -------------------------------------------------------------------------
  // PG.db
  // -------------------------------------------------------------------------
  function makeDb() {
    return {
      prepare: function (sql) {
        return {
          bind: function () {
            var args = Array.prototype.slice.call(arguments);
            return {
              all: function () { return runPrepare(sql, args, "all"); },
              first: function () { return runPrepare(sql, args, "first"); },
              run: function () { return runPrepare(sql, args, "run"); },
              raw: function () { return runPrepare(sql, args, "raw"); },
            };
          },
        };
      },
      exec: function (sql) {
        return send("POST", API + "db/exec", JSON.stringify({ sql: sql }), "application/json");
      },
      batch: function (statements) {
        return send("POST", API + "db/batch", JSON.stringify({ statements: statements }), "application/json");
      },
    };
  }

  function runPrepare(sql, bind, method) {
    return send("POST", API + "db/prepare", JSON.stringify({
      sql: sql, bind: bind, method: method,
    }), "application/json").then(function (out) {
      // Workers D1-ish shape: { rows, meta? }. Normalize to SDK contract.
      if (method === "all" || method === "raw") {
        return (out && out.rows) || [];
      }
      if (method === "first") {
        var rows = (out && out.rows) || [];
        var first = rows[0];
        return first == null ? null : first;
      }
      // run: return { changes, last_insert_rowid? }
      var meta = (out && out.meta) || {};
      var result = { changes: typeof meta.changes === "number" ? meta.changes : 0 };
      if (typeof meta.last_insert_rowid === "number") {
        result.last_insert_rowid = meta.last_insert_rowid;
      }
      return result;
    });
  }

  // -------------------------------------------------------------------------
  // PG.vars — synchronous snapshot loaded at mount time.
  // -------------------------------------------------------------------------
  function makeVars() {
    var snapshot = Object.create(null);
    var keys = [];

    function publish(obj) {
      if (!obj || typeof obj !== "object") return;
      for (var k in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, k)) {
          snapshot[k] = obj[k];
        }
      }
      keys = Object.keys(snapshot);
      // Mirror snapshot keys as own properties on the consumer object.
      for (var i = 0; i < keys.length; i++) {
        (function (k) {
          Object.defineProperty(consumer, k, {
            value: snapshot[k],
            enumerable: true,
            writable: false,
            configurable: false,
          });
        })(keys[i]);
      }
    }

    var consumer = {};
    consumer.keys = function () {
      return keys.slice();
    };
    consumer.has = function (key) {
      return Object.prototype.hasOwnProperty.call(snapshot, key);
    };
    consumer._load = function (promise) {
      promise.then(function (res) {
        if (!res || !res.ok) return;
        return res.json().then(publish, function () { /* ignore */ });
      }, function () { /* ignore */ });
    };
    // Exposed for internal bootstrap: synchronously publish an already-parsed
    // snapshot once the caller has awaited the fetch.
    consumer._publish = function (obj) {
      publish(obj);
    };
    return consumer;
  }

  // -------------------------------------------------------------------------
  // Capability probes. Plain functions attached to PG.<NAME> when present.
  // -------------------------------------------------------------------------
  function makeSession() {
    return {
      capabilities: function () {
        return send("GET", API + "session/capabilities", null, null).then(function (out) {
          return (out && out.capabilities) || [];
        });
      },
    };
  }

  function makeCompute() {
    return {
      apiVersion: function () {
        return send("GET", API + "compute/version", null, null).then(function (out) {
          return (out && out.version) || "";
        });
      },
      capabilities: function () {
        return send("GET", API + "compute/capabilities", null, null).then(function (out) {
          return (out && out.capabilities) || [];
        });
      },
    };
  }

  function makeDelegate() {
    return {
      grant: function () {
        return send("GET", API + "delegate/grants", null, null).then(function (out) {
          return (out && out.grants) || [];
        });
      },
    };
  }

  function makeHost() {
    return {
      capabilities: function () {
        return send("GET", API + "capabilities", null, null).then(function (out) {
          return (out && out.hostCapabilities) || [];
        });
      },
    };
  }

  // -------------------------------------------------------------------------
  // Mount window.PG. capabilities() drives attribute presence; the snapshot
  // for vars is loaded here. We publish a placeholder synchronously so callers
  // can `await PG.ready`; the full surface is published once bootstrap
  // resolves (capabilities + vars).
  // -------------------------------------------------------------------------
  var KNOWN_CAPABILITIES = {
    SESSION: makeSession,
    COMPUTE: makeCompute,
    DELEGATE: makeDelegate,
    HOST: makeHost,
  };

  function fetchCapabilities() {
    return window
      .fetch(API + "capabilities", { method: "GET", credentials: "same-origin" })
      .then(function (res) {
        if (!res || !res.ok) {
          return { intrinsics: ["kv", "db", "vars"], bindings: [] };
        }
        return res.json();
      }, function () {
        return { intrinsics: ["kv", "db", "vars"], bindings: [] };
      });
  }

  function mount() {
    var PG = {
      version: VERSION,
      kv: makeKv(),
      db: makeDb(),
      vars: makeVars(),
      // signalled once bootstrap completes; the resolved value is the list
      // of capabilities (intrinsics + admitted bindings).
      ready: undefined,
      // For PG.capabilities() to read the current capability set without
      // re-hitting the network, we cache it on the surface after bootstrap.
      _cached: undefined,
      fetch: function (path, init) {
        return window.fetch(path, init);
      },
    };
    PG.capabilities = function () {
      if (PG._cached) return Promise.resolve(PG._cached);
      return fetchCapabilities().then(function (cap) {
        PG._cached = cap.intrinsics.concat(cap.bindings || []);
        return PG._cached;
      });
    };

    // Synchronous placeholder so the UI sees `window.PG` immediately. We
    // re-use the same object and publish the rest of the surface once
    // bootstrap completes.
    window.PG = PG;

    // Bootstrap: capabilities then vars, then publish the full surface.
    var bootstrapped = fetchCapabilities().then(function (cap) {
      var intrinsics = (cap && cap.intrinsics) || ["kv", "db", "vars"];
      var bindings = (cap && cap.bindings) || [];
      for (var i = 0; i < bindings.length; i++) {
        var name = bindings[i];
        var key = String(name).toUpperCase();
        if (KNOWN_CAPABILITIES[key]) {
          PG[key] = KNOWN_CAPABILITIES[key]();
        }
      }
      PG._cached = intrinsics.concat(bindings);
      return PG._cached;
    });
    // Walk the full vars chain so PG.ready resolves only after the
    // snapshot is published onto the consumer object.
    var varsChain = window
      .fetch(API + "vars", { method: "GET", credentials: "same-origin" })
      .then(function (res) {
        if (!res || !res.ok) return null;
        return res.json();
      }, function () {
        return null;
      })
      .then(function (obj) {
        if (obj && typeof obj === "object") {
          PG.vars._publish(obj);
        }
        return null;
      });
    PG.ready = Promise.all([bootstrapped, varsChain]).then(function () {
      return PG._cached;
    });
  }

  if (typeof window !== "undefined") {
    mount();
  }
})();
