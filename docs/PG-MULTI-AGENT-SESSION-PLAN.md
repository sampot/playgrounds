# Playgrounds 多 Agent Session 實作計劃

本檔是 [PG-MULTI-AGENT-SESSION-SPEC.md](./PG-MULTI-AGENT-SESSION-SPEC.md) 的落地階段表。權威決策見 [DECISIONS.md](./DECISIONS.md) **DEC-023**。

一句話：**工作沙盒當 Host；多個 Participant 經 `env.SESSION` 入座；事件用 BroadcastChannel 推送；單 HOST 編排不變。**

**狀態：** MVP 已落地（2026-08-01）；**joinPolicy** 已落地（2026-08-03）。

---

## 目標與非目標

### 目標（MVP）

- 遊樂場 session **通道 API**（open／pause／close／join／leave；Host 畫布 `/api/shell/session/*`＋HOST 子集）；切工作沙盒結束通道。
- ≥2 背景 Participant iframe；`env.SESSION` 注入。
- 協定相容＋ role 入座；BroadcastChannel 即時事件（無長輪詢）。
- 狗糧 Host **自管 UX**（命名／開始／加入參與者）＋**單一** Participant 範本（clone 多實例；role＝權限類，無 LLM）。
- **入座政策 `joinPolicy`**：邀請／申請路徑；Host 開場宣告（省略＝`invite_or_apply`）。

### 非目標

- 遠端／WebRTC；`waitEvent` 輪詢；多份 HOST；重整自動恢復背景迴圈。
- 遊樂場產品化 Session 面板／場景命名。

---

## 階段

| 階段 | 主題 | 完成定義 | 狀態 |
| --- | --- | --- | --- |
| **0. 契約** | DEC-023、capabilities、錯誤碼、規格推送語意 | 文件入 `docs/` | **已完成** |
| **1. Runtime** | types／bridge／BroadcastChannel／轉發 Host | 單測；無 UI 可測閘門 | **已完成** |
| **2. 遊樂場介面** | 多 iframe、注入、通道 API（非產品面板） | Host／HOST 可開通道、入座 | **已完成** |
| **3. HOST 子集** | openSession／joinSeat 等 | capabilities 誠實 | **已完成** |
| **4. 狗糧** | Host 腦力激盪自管 UX＋Participant 規則 Agent | S1／S2／S4 可驗 | **已完成** |
| **5. UX 收斂** | 遊樂場去產品化；`/api/shell/session/*`；starter 示範 | 狀態列僅機制訊號 | **已完成** |
| **6. joinPolicy** | meta.`joinPolicy`；`via` invite｜apply；spawn＝invite | 單測 join_forbidden；規格 §6.5 | **已完成** |

Coding 編排應用狗糧見 [PG-CODING-ORCHESTRATION-PLAN.md](./PG-CODING-ORCHESTRATION-PLAN.md)（DEC-033）。

---

## 錯誤碼（附錄）

見規格附錄 A：`session_inactive`、`session_paused`、`seat_full`、`role_forbidden`、`protocol_mismatch`、`join_forbidden`、`act_rejected`、`version_conflict`、`capacity_exceeded`。
