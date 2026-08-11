# Playgrounds 開發小工具 backlog

本檔記錄「軟體開發過程有用」的小品候選與已落地清單，載體為 **Playgrounds SAM**（[`samCatalog`](../src/data/samCatalog.ts)）。**不要**把候選堆進凍結的 [`TOOLS-PLAN.md`](./TOOLS-PLAN.md)／`/tools/`（DEC-022）。

> **狀態：** Wave A–C 已落地（2026-08-03）。Wave D 為有餘力項。

## 定位

- Tool SAM：`env.TOOL` + `index.html` head 的 `sam:tool-*`（DEC-024）。
- series（`kind: tool`）：**前端**／**資料**／**協定**／**環境**／**日常**（見 `SAM_TOOL_SERIES_ORDER`）。
- 一 SAM 一 repo（`sampot/pg-*`）。

## 已落地

### 既有（規劃前）

雜湊、JWT、Regex、Cron、JSON／YAML、ID、文字 diff、Markdown、Base、Python、時區、色票，以及前端三波（HTML／SVG／URL／對比度／CSS 單位／圖／假資料／JSON 結構 diff／OG／QR／文字小工）。

### Wave A — 設定檔與資料互轉

| Repo | 標題 |
| --- | --- |
| `pg-tomlfmt` | TOML 整形 |
| `pg-csvjson` | CSV ↔ JSON |
| `pg-envkit` | .env 工坊 |
| `pg-sqlfmt` | SQL 整形 |

### Wave B — 協定與貼上就懂

| Repo | 標題 |
| --- | --- |
| `pg-httpmsg` | HTTP 訊息工坊 |
| `pg-httpref` | HTTP 速查 |
| `pg-pempeek` | PEM 窺視 |
| `pg-netcid` | IP／CIDR 小算 |

### Wave C — 版本、權限、字元

| Repo | 標題 |
| --- | --- |
| `pg-semver` | Semver 對照 |
| `pg-chmod` | Unix 權限 |
| `pg-unilook` | Unicode 檢視 |
| `pg-ignoregen` | gitignore 小造 |

## Wave D — 有餘力

- XML 整形（`pg-xmlfmt`）
- JSON Schema 驗證
- GraphQL 文件整形
- 密碼／token 產生器（標明非稽核）
- 行尾／空白可視化（可併 unilook）
- Dockerfile／Compose 極薄檢查

## 刻意不做

完整 OpenAPI UI、Wireshark 級封包、真 TLS handshake、Kubernetes manifest 全集、重型 linter／bundler、需私鑰上雲的安全產品。
