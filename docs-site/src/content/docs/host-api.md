---
title: Host API 概覽
description: 現行 Agent 可用的 HOST 契約摘要（v1）。
---

給撰寫／修改「現行 Agent」這類 SAM 的人（含 Agent）快速對照。HOST 僅注入給現行 Agent。完整註記與路由表以 repo 內 [`docs/playgrounds-host-api.md`](https://github.com/sampot/playgrounds/blob/main/docs/playgrounds-host-api.md) 為準；執行期以 `HOST.apiVersion()`／`HOST.capabilities()` 為誠實來源。

**版號：** `apiVersion()` → `"1"`。

**整場重置**是遊樂場介面操作，**沒有** `HOST.resetPlaygrounds`。

## 方法摘要

| 方法 | 說明 |
| --- | --- |
| `apiVersion` / `capabilities` | 契約探測 |
| `listProjects` / `getProject` / `createProject` / `cloneProject` / `setWorkingSet` / `deleteProject` / `openProject` | 沙盒生命週期與工作集 |
| `get/setActiveAgent` / `get/setTargetProject` | 現行 Agent／target |
| `listFiles` / `listDir` / `readFile` / `writeFile` / `mkdir` / `remove` | 文字 FS（`listDir` 可裁切） |
| `readFileBase64` / `writeFileBase64` | 二進位 FS（單檔硬上限 5 MiB） |
| `openFile` | 殼面：在編輯器／媒體預覽開啟 |
| `openTool` / `closeTool` / `getToolSession` | 工具 tab（帶 grant） |
| `openMainCanvas` / `listMainTabs` / `getMainTab` / `setMainTab` / `closeMainTab` | 主內容 tabs |
| `openSession` / `closeSession` / `pauseSession` / `resumeSession` / `getSession` | 多 Agent session |
| `spawnParticipant` / `hostSessionFetch` / `listSeats` / `joinSeat` / `leaveSeat` | session 座位 |
| `search` | 文字搜尋 |
| `reloadCanvas` / `getConsole` / `clearConsole` / `waitConsole` / `getCanvasStatus` | 觀察迴圈 |
| `getNetworkLog` / `clearNetworkLog` / `getDomSnapshot` | 網路摘要／DOM 摘要 |
| `runPython` | Pyodide（允許套件清單） |
| `runCmd` / `listCmds` | WASI CLI（見 [runCmd 邊界](/host-api/run-cmd/)） |
| `captureCanvas` | 畫布截圖（best-effort） |
| `getSecretStoreStatus` / `listSecrets` / `listSecretNames` | 密鑰庫中繼（無值） |
| `createPlatformInvite` / `revokePlatformInvite` | 殼代理鑄／撤場 Invite（持 `PLAYGROUNDS_API_KEY`；不回傳 key） |
| `checkpoint` / `listCheckpoints` / `restore` | target 快照 |
| `listFleetSummary` / `getAgentUi` / `setAgentUi` | 艦隊觀測／顯示標註 |

**禁止（摘要）：** 對現行 Agent 沙盒寫入／刪除等多為 `agent_readonly`；`deleteProject` 僅限 agentManaged 且不可刪現行 Agent。

計劃中尚未實作的能力（例如部分 Phase 能力）**勿假設存在**——以 `capabilities()` 為準。
