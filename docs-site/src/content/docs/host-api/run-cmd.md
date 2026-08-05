---
title: runCmd 邊界
description: WASI CLI 允許清單與限制（DEC-021）。
---

- **Runtime：** 瀏覽器內 Wasm＋WASI preview1；無通用 sockets／外網。
- **命令：** 僅 `listCmds()` 允許清單（如 `jq`、部分 uutils／grep／sed 等）。未知 cmd → `not_supported`。
- **Agent：** 單次一命令——勿傳管線、`&&`、重導向、glob 字串。
- **上限：** timeout（預設 30s、硬上限 120s）；stdout／stderr／stdin 可能截斷（`truncated: true`）。
- **結束：** 非零結束以 `exitCode`（加 stderr）表達，不用 `cmd_failed`。

詳見 repo [`docs/playgrounds-host-api.md`](https://github.com/sampot/playgrounds/blob/main/docs/playgrounds-host-api.md) 的 `runCmd` 一節。
