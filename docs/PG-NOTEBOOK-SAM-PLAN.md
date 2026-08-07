# Playgrounds Python 筆記本 SAM（`pg-notebook`）

> **狀態：** Implemented（MVP，2026-08-08）  
> **相關：** DEC-015／016／019／027／036／051、[PG-API-SCOPES-SPEC.md](./PG-API-SCOPES-SPEC.md)、[playgrounds-host-api.md](./playgrounds-host-api.md)、型錄 `catalog/entries/pg-notebook.yaml`  
> **程式庫：** [sampot/pg-notebook](https://github.com/sampot/pg-notebook)（場外 SAM；本文件為宿主側計劃／契約）

一句話：**輕量 Python cell 筆記本（Markdown＋code）——經場殼 `compute:python`／Pyodide 執行；不是完整 Jupyter。**

---

## 1. 目標

- Catalog **tool** SAM：多 cell 文件、單格／全部執行、本機持久化。
- 執行走既有場殼 Python（`env.COMPUTE.runPython`；與 dock Python REPL **同 kernel**）。
- Mobile-first；破壞性操作用頁內 confirm（禁止 `alert`／`confirm`／`prompt`）。

## 2. 非目標

- 完整 Jupyter、`.ipynb` 權威、ipywidgets、nbformat 匯入匯出。
- JavaScript／其他語言 cell（刻意不做；若再開另刀）。
- 場殼內建 notebook 面板；文章內嵌自動跑 code block（DEC-015）。
- 本站後端 Python。

## 3. 契約

| 面 | 選擇 |
| --- | --- |
| 宣告 | `sam:capabilities` = `compute:python` |
| 執行 | `functions.js` `POST /api/run` → `env.COMPUTE.runPython`（或 HOST 同形子集） |
| 文件 | JSON `version:1`；`title`＋`cells[{id,kind:md\|code,source}]` |
| 持久化 | `env.KV` 鍵 `notebook:v1`；種子檔 `notebook.json` |
| 套件 | 場白名單：`numpy`／`pandas`／`scipy`／`matplotlib` |

## 4. 階段

| Phase | 內容 | 狀態 |
| --- | --- | --- |
| 0 | repo＋計劃＋catalog draft／listed | Done |
| 1 | UI：cell CRUD、md 預覽、標題、儲存 | Done |
| 2 | Python run／run all；準入提示 | Done |
| 3 | （可選）分享 deep-link、圖輸出強化、`.ipynb` 單向匯入 | 未做 |

## 5. 驗收

1. `/?open=sampot/pg-notebook` 可開；準入後可跑範例格。  
2. 窄螢幕可編／跑／看輸出，無橫向捲主 chrome。  
3. 拒絕準入時仍可編輯；執行有清楚引導。  
4. 重整後 KV 文件還原。  
5. 文案不宣稱「完整 Jupyter」。
