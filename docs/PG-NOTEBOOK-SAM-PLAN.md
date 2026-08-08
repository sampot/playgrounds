# Playgrounds Python 筆記本 SAM（`pg-notebook`）

> **狀態：** In progress（2026-08-08）— MVP 已上；**目標轉向 nbformat 4／`.ipynb` 相容**  
> **相關：** DEC-015／016／019／027／036／051、[PG-API-SCOPES-SPEC.md](./PG-API-SCOPES-SPEC.md)、[playgrounds-host-api.md](./playgrounds-host-api.md)、型錄 `catalog/entries/pg-notebook.yaml`  
> **程式庫：** [sampot/pg-notebook](https://github.com/sampot/pg-notebook)

一句話：**以 Jupyter `.ipynb`（nbformat 4）相容為目標的瀏覽器 Python 筆記本——操作／指令盡量對齊；執行仍走場殼 Pyodide（非站端 Jupyter 伺服器）。**

---

## 1. 目標

- Catalog **tool** SAM；權威文件＝**nbformat 4**（下載／開啟 `.ipynb`；KV 持久化同形）。
- 操作對齊常見 Notebook 習慣：`Shift+Enter`／`Ctrl+Enter`、指令／編輯模式、`Y`／`M`、`A`／`B`、`In`／`Out`、Run All、Restart Kernel。
- 指令：至少 `%pip install`（映射場殼套件白名單）；其餘 magic 明確提示不支援。
- 執行：`compute:python`／`env.COMPUTE.runPython`；與 dock Python REPL **同 kernel**。
- Mobile-first；破壞性操作用頁內 confirm。

## 2. 非目標（對齊 DEC-015 精神）

- **不**在場殼或本站跑完整 JupyterServer／JupyterLab。
- **不**做文章內嵌自動跑 code block。
- 不承諾完整 IPython／ipywidgets／所有 magics／協作即時編輯。
- JavaScript cells（另刀）。
- 場殼內建 notebook 面板（維持為可搬 SAM）。

## 3. 契約

| 面 | 選擇 |
| --- | --- |
| 宣告 | `sam:capabilities` = `compute:python` |
| 執行 | `POST /api/run`；`POST /api/kernel/restart`（best-effort 清全域） |
| 文件 | **nbformat 4**；種子 `notebook.ipynb`；legacy `version:1` 可遷移 |
| 持久化 | `env.KV` 鍵 `notebook:ipynb`（讀時相容舊 `notebook:v1`） |
| 套件 | `numpy`／`pandas`／`scipy`／`matplotlib` |

## 4. 階段

| Phase | 內容 | 狀態 |
| --- | --- | --- |
| 0–2 | MVP cell UI＋Python run＋catalog | Done |
| 3 | nbformat 4 權威、`.ipynb` 下載／開啟、In／Out、快捷鍵、`%pip`、Restart | **Done（本刀）** |
| 4 | 圖輸出（matplotlib → display_data）、更多 magics、與 OPFS 檔案樹雙寫 `*.ipynb` | 未做 |
| 5 | （可選）HOST 級 kernel recreate API，取代 best-effort `del globals` | 未做 |

## 5. 驗收

1. 可下載／再開同一份 `.ipynb`（nbformat 4），cells／outputs 合理保留。  
2. `Shift+Enter`／`Y`／`M`／`%pip install numpy` 行為符合上表。  
3. 準入後可跑；與 dock REPL 變數互通；Restart 有確認。  
4. 文案宣稱「`.ipynb` 相容」而非「完整 Jupyter」。
