// 自訂 functions.js 範本（PG-UI-SDK-PLAN §5.1b）。
//
// SAM 同時想要：
//   1. 自訂 `/api/ping` route（純沙盒邏輯）
//   2. 對應 PG.kv / PG.vars 的內建 routes（透過 helper）
//
// 這份檔案示範「自訂 routes + helper 內建 routes 共存」：用
// `/playgrounds/functions-runtime.js` 的 `intrinsicRoutes(env)` 拿到
// 內建 handler，再用 `compose([...])` 串成一個單一 fetch。
//
// 在 Node fixture 內，`/playgrounds/functions-runtime.js` 不可在同一來源
// 取得（temp dir 沒有 `/playgrounds/` 路徑）；瀏覽器／worker 端則由
// `samBrowserLoader.rewriteJsImports` 改寫成 `new URL(spec, import.meta.url).href`
// 的 dynamic import（測試見 tests/samBrowserLoaderAbsolute.test.ts）。

import { intrinsicRoutes, compose } from "/playgrounds/functions-runtime.js";

const customRoutes = {
  async handle(request) {
    const url = new URL(request.url);
    if (url.pathname === "/api/ping" && request.method === "GET") {
      return Response.json({ id: "hello-sdk-functions", ts: Date.now() });
    }
    // Fallthrough to the next route in the chain.
    return Response.json(
      { code: "not_found", message: "not custom" },
      { status: 404 },
    );
  },
};

export default {
  async fetch(request, env) {
    return compose([customRoutes, intrinsicRoutes(env)]).handle(request);
  },
};
