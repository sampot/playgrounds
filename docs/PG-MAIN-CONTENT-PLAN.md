# Playgrounds Main Content Tabs 實作計劃（DEC-030）

> **狀態：** Phase 0～5 **已完成**（2026-08-02）  

> **權威決策：** [DECISIONS.md](./DECISIONS.md) DEC-030  
> **相關：** DEC-016、DEC-017、DEC-022、DEC-023、DEC-028、[PG-TOOLS-PLAN.md](./PG-TOOLS-PLAN.md)、[playgrounds-host-api.md](./playgrounds-host-api.md)

一句話：**既有 layout 不變；main content 用 tabs 在「編輯器」與已掛的沙盒畫布之間切換。同時最多 4 個 SAM 畫布 tab；Tool＝某 tab 附帶 grant／`env.TOOL`，不是掛載的必要條件。**

---

## 落地階段

| 階段 | 主題 | 狀態 |
| --- | --- | --- |
| **0. 契約與 DEC** | DEC-030；GLOSSARY；host-api；TOOLS-PLAN | 已完成 |
| **1. Tab 狀態＋plain** | `mainContentTabs.ts`；plain iframe；硬頂 4 | 已完成 |
| **2. UI tab 列** | 編輯器＋SAM tabs、＋、關閉、plain｜Tool 分岔 | 已完成 |
| **3. Tool 遷入** | `openTool`→grant tab；TOOL 僅前景 | 已完成 |
| **4. HOST API** | open／list／set／close＋capabilities＋範本 tools | 已完成 |
| **5. 打磨** | 單元測；host-api 已落地 | 已完成 |

---

## 契約摘要（已落地）

- `mainTabs`：固定 `editor`＋最多 4 個 `canvas`；`openMainCanvas`／`openTool`／`setMainTab`／`closeMainTab`
- Plain＝無 grant；Tool＝grant，僅前景注入 `env.TOOL`
- 切換工作沙盒 → 清空 canvas tabs
- 純函式：`src/components/playgrounds/mainContentTabs.ts`

## 附錄 — 手動回歸（建議本機）

- [ ] 掛 B plain → tab 可見；切回 Editor 可編 A
- [ ] 掛滿 4 個 SAM；第 5 個拒絕
- [ ] Tool grant；非前景不可暗寫
- [ ] `openTool`／`openMainCanvas` 自 Agent 可用
- [ ] 切工作沙盒 → 只剩 Editor tab
- [ ] editorMaximized 正常
