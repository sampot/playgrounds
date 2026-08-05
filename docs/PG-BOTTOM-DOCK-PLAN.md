# Playgrounds 下方面板 dock 計劃（DEC-044）

> **狀態：** Phase 0–4 已落地；Phase 5（HOST API）未做  
> **權威決策：** [DECISIONS.md](./DECISIONS.md) **DEC-044**  
> **相關：** DEC-016（場殼／REPL）、DEC-017（雙執行面）、DEC-021（Shell／`runCmd`）、DEC-030（main content；下槽邊界改指本決策）、DEC-037（委派 grant 仍僅 main）、[GLOSSARY.md](./GLOSSARY.md)、[playgrounds-host-api.md](./playgrounds-host-api.md)

一句話：**下方 dock 預設只有 Console；Python／JS／Shell 與自選 plain SAM 須明確加入；Worker／Pyodide／WASI／下方 iframe 真用才啟動。**

---

## 目標

- 降低預設進場成本（xterm、Pyodide CDN、WASI wasm、多餘 iframe）。
- 人類仍可一鍵加入 REPL／Shell。
- 允許把本機自選 SAM 當**輔助面**掛在下方（與 main content 主工作面分工）。
- API 路徑（`runPython`／`runCmd`）維持呼叫時 on-demand，不綁面板是否已加入。

## 非目標

- 左／右槽、自由分屏、任意 dashboard（DEC-030／044 仍禁止）。
- 下槽核發 Tool／`env.DELEGATE`（MVP；授權面留在 main content）。
- 進場 preload Pyodide／WASI；重整自動還原下方自選 SAM。
- 把下方面板做成第二總管或完整 HOST 面。

---

## 模型

| 項 | 預設 | 加入後 | 資源啟動時機 |
| --- | --- | --- | --- |
| Console | 在 | — | 輕量 buffer（既有） |
| Python | 關 | 顯示 tab／可掛 xterm | 使用者載入或送出第一行；或 `runPython` API |
| JavaScript | 關 | 同上 | 載入／第一行 REPL |
| Shell | 關 | 同上 | 第一條命令；或 `runCmd` API |
| 自選 SAM（plain） | 關 | 顯示 tab；前景才掛 iframe | 加入且切到該 tab（非前景可卸） |

**硬頂：** 下方自選 SAM ≤ **3**（與 main canvas 4 **分開計**）。

**互斥：** 同一 `sandboxId` 不可同時在 main canvas tab 與下方 dock。

**清除：** 切換工作沙盒 `activeId` → 清下方自選 SAM；內建已加入項可保留。

---

## 階段

| Phase | 內容 | 完成定義 | 狀態 |
| --- | --- | --- | --- |
| **0. 契約** | DEC-044、本計劃、GLOSSARY／DEC-016／021／030 修訂 | 規格無歧義 | **已完成** |
| **1. 內建 opt-in** | dock 清單；「+」加入／移除 Python／JS／Shell；tab 列只渲染已加入＋Console；拿掉 REPL mount 自動 `boot()` | 預設無三 tab；加入後可不立刻起 Worker | **已完成** |
| **2. Layout** | 持久化已加入內建項；遷移舊 `bottomTab`（可還原「已加入」但**不**進場 boot）；移除＝unmount | 重整行為符合 DEC-044 | **已完成** |
| **3. 自選 SAM** | 「+ → 選沙盒」plain 掛下方；硬頂 3；與 main 雙掛拒絕；非前景可卸 iframe；切 `activeId` 清除 | 可掛／關輔助 SAM | **已完成** |
| **4. Dispose 策略** | 關 JS／Shell 面板且無進行中工作 → 可 dispose runner；Python 與 API 共用時不因關面板 terminate | 關面板可回收時回收 | **已完成** |
| **5. HOST（可選）** | `openBottomPanel`／`closeBottomPanel`／`listBottomPanels`＋capabilities | `capabilities()` 可探測；文件同步 | 未開始 |

---

## UX 備忘

- 下方 tablist：「Console」＋已加入項＋「+」。
- 「+」選單分兩區：內建（Python／JavaScript／Shell；已加入者禁用或改為「已加入」）／本機沙盒（排除總管、已在 main／已在下方者）。
- 關閉：tab 上可關，或「+」管理；Console 不可關。
- 文案：Main「開啟沙盒畫布」vs 下方「加入輔助面板／SAM」——避免使用者以為同一槽。

---

## 實作落點（預期）

- `PlaygroundsApp.svelte`：dock 狀態、`*Mounted`、tablist、「+」dialog、layout persist
- `PlaygroundsPythonRepl.svelte`／`PlaygroundsJsRepl.svelte`：取消 mount 自動 boot
- `hostPython.ts`／`hostJs.ts`／`hostWasi.ts`：維持 `ensureWorker`；補面板關閉 vs dispose
- 下方 SAM：複用 canvas SW 管線，slot＝bottom（與 `mainTabs` 分開）

---

## 完成檢查

- [x] 全新／清空 layout：下方僅 Console tab
- [x] 未加入時不掛 REPL／Shell 元件、不起對應 Worker
- [x] 加入 Python 後未按載入／未輸入前不拉 Pyodide
- [x] 可加入自選 plain SAM；滿 3 拒絕；與 main 雙掛拒絕
- [x] 切工作沙盒清除下方 SAM；重整不還原下方 SAM
- [x] GLOSSARY／host-api 與實作一致（Phase 5 HOST 方法仍為計劃中）

---

## 修訂紀錄

| 日期 | 變更 |
| --- | --- |
| 2026-08-05 | 初版：對齊 DEC-044 |
| 2026-08-05 | Phase 1–4 落地：`bottomDock.ts`、opt-in UI、layout、下方 plain SAM、JS／Shell dispose |
