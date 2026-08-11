# Playgrounds Backend Runtime — 實作計劃

本檔追蹤 [PG-BACKEND-RUNTIME-SPEC.md](./PG-BACKEND-RUNTIME-SPEC.md)／**DEC-038** 的落地階段。規格契約以 SPEC 為準；本檔只列階段與完成定義。

一句話：**殼不假設本機殼瀏覽器 OPFS；儲存與後端在 Runtime；通道可替換（MVP＝`postMessage` → 路線＝WebRTC）；先改殼權威路徑與拆開 HOST，再搬 Dedicated Worker，刪 iframe。**

**狀態：** 2026-08-04 — **Phase 0–4 完成**（MVP 架構要求已落地）。Phase 5（WebRTC 等）可選。

---

## 階段

| 階段 | 內容 | 完成定義 | 狀態 |
| --- | --- | --- | --- |
| **0. 契約** | SPEC／DEC-038／GLOSSARY：殼不假設 OPFS、拆開 HOST、殼面可終端、反矛盾迴路、**WebRTC 遷移不變式** | 文件無歧義 | **已完成** |
| **1. 殼權威路徑改道** | 編輯器／Files／HOST 儲存面改經 Runtime（或過渡 facade）；殼權威路徑不直打沙盒 OPFS；標 `local`｜`shell`；殼面可終端 | 測試：殼權威路徑無 `getDirectory` 當沙盒根；`openFile` 終端約束 | **已完成** |
| **2. Runtime Worker MVP** | Leader Dedicated Worker；functions＋畫布 `/api` 走 Runtime；**刪** iframe；Controller＋drain＋FS 權威進 Worker | SPEC §11；無 `playgrounds-functions-host` | **已完成** |
| **3. Session／其餘呼叫點** | 全部 `functionsFetch` 進 Runtime；後端互打不經殼 | grep／狗糧通過 | **已完成** |
| **4. 密鑰與精煉** | Secrets 偏 §6.3-A；unlock 材料進 Runtime 記憶體；lock／shutdown 清除；**get 不 RPC** | lock 後 Runtime 無密文 | **已完成** |
| **5. 擴展（可選）** | WebRTC 跨主機 Runtime 原型（或等價通道）、compute 親和 Runtime、艦隊指標 | 非阻塞 MVP；叢集細節另立規格 | 待做 |

### Phase 2 落地摘要

- Dedicated Worker：`functions.js`＋`controller.js`／`SamInstance`；殼側 `RemoteSamInstance`。
- **AgentRuntime drain／alarm** 在 Worker；殼保留 Leader 選舉＋`drainGate`／`kickDrain`；Durable mailbox 仍共用 OPFS。
- **FS 權威**在 Worker（`opfsStore`）；殼 `sandboxAuthority` 於 Runtime 活著時走 `fsOp` 通道；HOST `writeFile`／`mkdir`／`remove`／`listDir` 不經 envRpc。
- 刪 `playgrounds-functions-host`；Secrets §6.3-A。

---

## 非目標（本計劃）

- SharedWorker、多 Leader 分片、惡意碼硬隔離產品。
- **本計劃內交付** WebRTC 多主機叢集，或完整 Cloudflare 託管（CF 僅審查類比）。
- 整包 HOST 一律 RPC；殼直打「殼所在瀏覽器」OPFS 當權威；把 Runtime 綁死同文件／`postMessage`。

---

## 程式錨點

- Runtime：`backendRuntime.worker.ts`、`backendHost.ts`、`backendRuntimeProtocol.ts`、`backendRuntimeRpc.ts`、`runtimeLocalHostFs.ts`
- Controller 代理：`remoteSamInstance.ts`、`agentControllerHost.ts`
- 權威／HOST：`sandboxAuthority.ts`（通道客戶端）、`hostMethodSurface.ts`、`secretStoreRuntimeBridge.ts`
- 殼選舉：`agentRuntimeHub.ts`（`autoDrain: false`；enqueue 後 `backendKickDrain`）

---

## 開放點（對齊 SPEC §12）

- [ ] SW snapshot 從 Runtime 取得的方式（殼仍可傳 `files` 快照；權威寫入已在 Runtime）
- [x] Secrets A vs B → **採 A**
- [x] drain 模型 → **Worker 內 AgentRuntime**；殼僅選舉＋gate
- [x] `openFile` payload 形狀
- [ ] compute 快照協定（若暫留殼 runner）
- [x] **WASI 互斥 per-sandbox（DEC-039 Phase 5）**：Runtime `fsHold(sandboxId)`；殼 `withSandboxFsGate(sandboxId)`——見 [PG-WASI-OPFS-FS-PLAN.md](./PG-WASI-OPFS-FS-PLAN.md)
