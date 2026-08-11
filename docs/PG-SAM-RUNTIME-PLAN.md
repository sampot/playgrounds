# Playgrounds SAM Runtime 計劃（DEC-024）

> **狀態：** 已落地 MVP（2026-08-01）  
> **權威決策：** [DECISIONS.md](./DECISIONS.md) DEC-024（並修訂 DEC-016／017 指針）  
> **相關：** [PG-AGENT-PLAN.md](./PG-AGENT-PLAN.md)、[PG-MULTI-AGENT-SESSION-PLAN.md](./PG-MULTI-AGENT-SESSION-PLAN.md)、[playgrounds-host-api.md](./playgrounds-host-api.md)

一句話：**SAM＝UI（必備於定義）＋可選後端（`functions.js`∥`controller.js`）↔resources；任務與排程在 Controller；對 UI 的 HTTP API 在 functions；由可攜 sam-runtime 在瀏覽器或 Node 上跑多實例。**

---

## 目標

- 定案三層模型與 head metadata（無頂層 `manifest.json`；無 side-meta 後備宣告）。
- `src/sam-runtime/`：與 DOM／OPFS 解耦的實例／排程／infra dispatch。
- 最小 Node host：headless 多 SAM 實例。
- 瀏覽器：現行 Agent 由遊樂場介面持有 Controller（**必備** `controller.js`）；UI 可晚掛。
- 範本 Agent：Controller 為任務面；UI 為薄互動層。

非目標：完整 HOST 上 Node；真 CF DO；本計劃內替換全部 DEC-023 隱藏 iframe。

**後續（DEC-038）：** 瀏覽器後端執行面改 Leader **Backend Runtime Dedicated Worker**（廢 functions host iframe、離開 UI 主線程）——見 [PG-BACKEND-RUNTIME-SPEC.md](./PG-BACKEND-RUNTIME-SPEC.md)／[PG-BACKEND-RUNTIME-PLAN.md](./PG-BACKEND-RUNTIME-PLAN.md)；不在本計劃 Phase 內重做。

---

## 契約摘要

### Head metadata（`index.html` `<head>`）

| 鍵 | 說明 |
| --- | --- |
| `<title>` | 顯示名（`name`） |
| `meta name="sam:tool-kinds"` | 逗號分隔，如 `editor:text` |
| `meta name="sam:tool-globs"` | 逗號分隔 glob |
| `meta name="sam:needs-controller"` | `true`／`1` |
| `meta name="sam:protocol"` | 可選 session 協定 id |

解析：字串抽 head，不需完整 DOM。**僅** `sam:` 前綴；不解析 `playgrounds:` 宣告鍵；不以 `.playgrounds-meta.json` 填補。

### `controller.js`

```js
export default {
  async fetch(request, env, ctx) {},
  async alarm(env, ctx) {},
  async onStart(env, envCtx) {},
  async onStop(env, ctx) {},
  async onCommand(command, env, ctx) {},
};
```

- `ctx.waitUntil(promise)`、`ctx.schedule({ delayMs | at | intervalMs })` → runtime。
- Controller **直接**使用注入 bindings（`env.KV`／`HOST` 等）；**無** `env.INFRA`。遊樂場若要呼叫同實例 `functions.js`，走 host API（`SamInstance.functionsFetch`），不進 Controller env。
- 現行 Agent 另可有 `env.HOST`（瀏覽器實作；Node stub）。
- 設為現行 Agent **必須**有 `controller.js`（無 app.js-only 相容）。

### Infrastructure（`functions.js`）

Workers 形：`export default { fetch }`——**對畫布的網路入口**。functions 與 Controller **皆可**使用同一注入 bindings（不經對方）。有 Controller 的 SAM 通常仍保留 functions 當 API（CF：Worker＋DO）。

---

## 階段

| 階段 | 交付 | 完成定義 | 狀態 |
| --- | --- | --- | --- |
| **0. 契約** | DEC-024、GLOSSARY、本計劃、AGENTS／host-api | 用語無歧義；`sam:` meta；無向下相容 | 已完成 |
| **1. sam-runtime** | `src/sam-runtime/*` + Vitest | head parse、雙實例、schedule／alarm、infra | 已完成 |
| **2. Node host** | `src/sam-host/node` + fixtures + script | headless 多實例＋排程 | 已完成 |
| **3. 瀏覽器接線** | 遊樂場 `SamInstance` 跑現行 Agent Controller | UI 可晚掛；無 controller 則拒絕設為現行 Agent | 已完成 |
| **4. 範本遷移** | agentStarter 三層；`sam:` head meta | 新 Agent 開箱 | 已完成 |

---

## 程式路徑

| 路徑 | 用途 |
| --- | --- |
| `src/sam-runtime/` | 可攜核心 |
| `src/sam-host/node/` | 最小 Node CLI |
| `src/components/playgrounds/` | 瀏覽器適配、agentStarter |

---

## 與其他計劃

- **AGENT-MODEL（DEC-031）：** 見 [PG-AGENT-MODEL-SPEC.md](./PG-AGENT-MODEL-SPEC.md)＋[PG-AGENT-MODEL-PLAN.md](./PG-AGENT-MODEL-PLAN.md)；擴充本 runtime（mailbox／Leader 等）以該計劃 Phase 為準。
- **AGENT-PLAN：** HOST 表面不變；執行載體改 Controller。
- **MULTI-AGENT-SESSION：** Participant 長期多 `SamInstance`；本計劃 MVP 僅現行 Agent。
- **TOOLS-PLAN：** Tool SAM 仍以 UI＋`functions.js`／`env.TOOL` 為主；可不需 Controller。
