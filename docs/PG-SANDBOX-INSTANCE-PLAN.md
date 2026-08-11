# Playgrounds 沙盒實例與工作集計劃（DEC-028）

> **狀態：** Phase 0～4 已完成（2026-08-02）；Phase 5 痛點驅動未開始  

> **權威決策：** [DECISIONS.md](./DECISIONS.md) DEC-028  
> **相關：** DEC-016（沙盒／OPFS）、**DEC-040**（防護邊界＝遊樂場；場內沙盒＝實例容器；整場重置）、DEC-017／018（總管／HOST create／clone／delete）、DEC-022（工具發現）、DEC-023（session 多分身）、[PG-AGENT-PLAN.md](./PG-AGENT-PLAN.md)、[PG-MULTI-AGENT-SESSION-PLAN.md](./PG-MULTI-AGENT-SESSION-PLAN.md)、[playgrounds-host-api.md](./playgrounds-host-api.md)

一句話：**沙盒＝一個 SAM 實例容器（Code＋Data＋Configuration；非對桌面的防護主體——那是遊樂場，見 DEC-040）；clone 產新實例且程式碼分叉。Picker 只顯示使用者工作集（我建的／我要求總管留下的），避免命名空間污染；另設管理面盤點與回收整場所有實例（含自動建立的）；需要空場時用「重置遊樂場」。**

---

## 背景與產品假設

### 為什麼會爆炸

- 一沙盒提供一 SAM **實例**（即使未在執行）。
- SAM ≈ **Code＋Data＋Configuration**（OPFS 檔案樹＋Durable 狀態＋`sam:*`／meta 等設定）。
- **`clone`＝再產實例**；之後雙方獨立演化（預設不帶 KV／DB／Secrets，但 Code 已分叉）。
- 數量主因是**實例增殖**，不只是使用者按「新沙盒」：
  - 總管自迭代：clone → 改 → `setActiveAgent` →（理想）刪舊
  - Session 多位：多分身＝多 clone
  - 換用途：clone 範本後改 prompt／人格
  - 人手「複製沙盒」

這比較像 process／worktree／容器實例，不像「專案目錄慢慢變長」。

### 使用者需求（兩邊）

| 面 | 需求 | 應出現什麼 |
| --- | --- | --- |
| **沙盒 Picker**（既有 toolbar） | 日常切換；**命名空間不被污染** | 我建的，或**我要求總管幫我建／留下的** |
| **遊樂場管理**（新面） | 有效管理整場沙盒 | **全部**實例：手動、總管代建、自迭代副本、session 分身… |

- Picker＝**工作集（working set）**  
- 管理＝**實例總帳（inventory）**  
- **`agentManaged` 只回答「HOST 能不能刪」**，**不**回答「該不該進 Picker」。

### 設計原則

1. **Picker 資格 ≠ agentManaged** — 兩軸正交；見下表。
2. **Clone 預設進總帳，不預設進工作集** — 系統／自迭代／座位分身須顯式「加入工作集」或「代使用者建立」才進 Picker。
3. **血統可查、分叉後誠實** — 記錄 `clonedFrom`／意圖；UI 不暗示 clone 後仍連動 Code。
4. **GC 比資料夾重要** — 優先退役過期實例；不做深層 sandbox 資料夾 taxonomy、不做雲端專案超市。
5. **介面宜薄** — 管理面是遊樂場對話／面板，不是第二個 IDE；領域命名仍可留在 SAM。
6. **使用者手建受保護** — 無 `agentManaged` 者 HOST 仍不可刪（DEC-018）；管理面可標示，刪除走既有使用者確認。

### 非目標

- 雲端同步、帳號、跨裝置專案庫、簽名 plugin 市集。
- 深層資料夾／tag 作為主結構（可選標籤屬痛點驅動後段）。
- 把 Picker 做成全量瀏覽＋複雜篩選（那是管理面的事）。
- 改變「一沙盒一 SAM 實例」或取消 clone 分叉語意。
- 自動合併已分叉實例、或保持 clone 後 Code 連動。

---

## 現況摘要（實作基線）

| 面 | 現況 | 缺口 |
| --- | --- | --- |
| Meta | `id`／`name`／時間／`source`／`agentManaged`／`toolKinds`／`toolGlobs` | 無工作集標記、無 `clonedFrom`、無 clone 意圖 |
| Picker | toolbar 下拉；name／id **prefix** 過濾；列**全部** `listProjects()` | 自迭代／分身污染命名空間 |
| Create／clone | UI 與 HOST；HOST 帶 `agentManaged: true`；預設名「X 副本」 | 無法區分「代使用者留下」vs「系統實例」 |
| 刪除 | HOST 僅 `agentManaged`；UI 可刪使用者沙盒（確認） | 無血統批次清、無升上總管後的退役提示 |
| 管理 UX | 無專用總帳面 | 只能靠 Picker／逐筆刪 |

### 兩軸（目標）

| | 在工作集（Picker） | 不在工作集 |
| --- | --- | --- |
| **使用者擁有**（非 agentManaged） | 手建／匯入／人手複製（預設） | 使用者自管理面移出（少見） |
| **Agent 管理**（agentManaged） | 總管依使用者要求建立／promote | 自迭代中間態、session 分身、未留下的實驗 clone |

---

## 契約摘要（目標形狀）

### `ProjectMeta` 擴充

```ts
type CloneIntent =
  | "user" // 人手複製／明確保留的分叉
  | "steward_for_user" // 總管代使用者建立或留下
  | "self_upgrade" // 總管自迭代
  | "session_seat" // session 參與分身
  | "experiment"; // 其他系統／試驗 clone

interface ProjectMeta {
  // …既有欄位…
  /**
   * 是否屬於使用者工作集（Picker 可見）。
   * 與 agentManaged 正交。
   */
  inWorkingSet?: boolean;
  /** 直接 clone 來源的 projectId；非 clone 則省略。 */
  clonedFrom?: string;
  /** clone／代建意圖；利於管理面分區與 GC。 */
  cloneIntent?: CloneIntent;
}
```

**讀取預設（遷移，缺欄時）：**

| 條件 | `inWorkingSet` 視為 |
| --- | --- |
| 欄位已存在 | 依儲存值 |
| 缺省且 **非** `agentManaged` | `true`（手建／匯入不消失） |
| 缺省且 `agentManaged` | `false`（舊系統實例不進 Picker；可在管理面 promote） |

寫回 meta 時可逐步 materialize，避免永遠靠推斷。

**純函式建議：** `isInWorkingSet(meta)`、`listWorkingSet(projects)`（Vitest）。

### Create／clone 預設

| 路徑 | `agentManaged` | `inWorkingSet` | `cloneIntent`／血統 |
| --- | --- | --- | --- |
| UI「新沙盒」／匯入／`?open=` | false | **true** | — |
| UI「複製沙盒」 | false（現況） | **true** | `clonedFrom`；`user` |
| HOST `createProject`（總管代建給使用者） | true | **true**（預設或顯式） | `steward_for_user` |
| HOST `cloneProject` 自迭代 | true | **false** | `clonedFrom`；`self_upgrade` |
| Session spawn 分身 | true | **false** | `clonedFrom`；`session_seat` |
| HOST clone 且呼叫端設 `inWorkingSet: true` | true | true | 依呼叫（如留下給使用者） |

### HOST API（Phase 1～2）

延續 v1 風格；細節實作時寫入 [playgrounds-host-api.md](./playgrounds-host-api.md)。

| API | 行為 |
| --- | --- |
| `createProject(name, …, opts?)` | 可選 `inWorkingSet?`（預設 **true**）、`cloneIntent?` |
| `cloneProject(sourceId, newName?, opts?)` | 自動寫 `clonedFrom: sourceId`；`inWorkingSet` 預設 **false**；可選 `cloneIntent`／既有 `state` |
| `setWorkingSet(projectId, inWorkingSet)`（新） | 加入／移出工作集；**不**改 `agentManaged` |
| `listProjects()` | 仍回**全部**摘要（總管要能盤點）；摘要含 `inWorkingSet`／`clonedFrom`／`cloneIntent` |
| `deleteProject` | 不變：僅 `agentManaged`；不可刪現行總管 |

**capabilities：** 新增 `"setWorkingSet"`（若獨立 API）；`listProjects` 摘要形狀文件化。

**範本工具／prompt（總管）：**

- 使用者要求「做一個沙盒給我用」→ `create`／`clone` 時 **`inWorkingSet: true`**（或 `cloneIntent: steward_for_user`）。
- 自迭代 → clone 預設不進工作集；`setActiveAgent` 成功後引導刪舊或標可回收。
- `list_projects` 可區分工作集 vs 全場；清理時勿誤刪使用者工作集（無 agentManaged 本就刪不了）。

### 人類 UX

#### Picker（既有；收斂）

- 只列 `isInWorkingSet(meta)`。
- 維持鍵盤上下／Enter；過濾可升為**子字串**（同階段或緊接）。
- 列上可顯示場合標記（工作中／總管／工具）——場合，非永久類型。
- 空工作集但場內有隱藏實例時：短提示「尚有 N 個未列入工作集的沙盒 → 管理」。

#### 遊樂場管理（新）

遊樂場對話或面板（名稱 UI：**管理沙盒**／**遊樂場沙盒**；文件可稱 inventory）：

| 能力 | 說明 |
| --- | --- |
| 全量列表 | 含非工作集；顯示名、`updatedAt`、agentManaged、inWorkingSet、意圖／來源名 |
| 加入／移出工作集 | 呼叫與 HOST 相同語意 |
| 開啟 | `openProject`（可同時加入工作集） |
| 刪除 | 使用者擁有：既有確認；agentManaged：可單筆或批次（仍不可刪現行總管） |
| 分區（建議） | 工作集｜可回收（agentManaged ∧ ¬workingSet）｜有血統的副本 |
| 搜尋 | 子字串 name／id；可選意圖篩選 |

**不做（本計劃主路徑）：** 資料夾樹、雲端分享、多選拖曳重組目錄。

#### 退役／GC（Phase 3）

| 觸發 | UX |
| --- | --- |
| `setActiveAgent` 成功且舊總管為 agentManaged 副本 | 應用內 dialog：「是否刪除舊總管實例？」 |
| Session 關閉 | 可提案刪 `cloneIntent === session_seat` 且非工作集之分身（確認） |
| 管理面 | 「清理可回收」：列出 agentManaged ∧ ¬inWorkingSet ∧ 非現行總管 |

---

## 階段

| 階段 | 交付 | 完成定義 | 狀態 |
| --- | --- | --- | --- |
| **0. 契約** | DEC-028、本計劃、GLOSSARY、AGENTS／DECISIONS 指針 | 兩面需求與兩軸無歧義；非目標清楚 | 已完成 |
| **1. Meta＋預設** | `inWorkingSet`／`clonedFrom`／`cloneIntent`；讀取遷移；UI／HOST create／clone 寫入預設；`isInWorkingSet` Vitest | 新自迭代 clone 預設不進工作集；手建／匯入仍進 | 已完成 |
| **2. Picker 收斂＋HOST setWorkingSet** | Picker 只列工作集；`setWorkingSet`＋capabilities＋總管工具／prompt；子字串過濾 | 日常切換不再被「X 副本」淹沒；總管能代建進工作集 | 已完成 |
| **3. 管理面** | 「管理沙盒」對話：全量、promote／demote、開啟、刪除、基本分區／搜尋 | 不靠 Picker 也能盤點與清場 | 已完成 |
| **4. 退役提示** | 升上總管後問舊實例；session 結束可清座位分身；管理面批次可回收 | 自迭代／session 主路徑有回收，不只文件口頭 | 已完成 |
| **5. 痛點驅動** | 閒置提示、配額概覽、血統更深展示、可選標籤 | 有再現痛點再開 | 未開始（運行態／關係圖另見 [PG-AGENT-FLEET-UX-PLAN.md](./PG-AGENT-FLEET-UX-PLAN.md)／DEC-032） |

---

## 程式路徑（預期）

| 路徑 | 用途 |
| --- | --- |
| `src/components/playgrounds/projectTypes.ts` | Meta 欄位型別；`CloneIntent` |
| `src/components/playgrounds/workingSet.ts`（新，建議） | `isInWorkingSet`／遷移純函式 |
| `src/components/playgrounds/opfsStore.ts` | create／clone 寫入血統與工作集；可選 `setWorkingSet` 持久化 |
| `src/components/playgrounds/shellHostBridge.ts`／`hostBridge.ts`／`hostCapabilities.ts` | HOST 接線 |
| [`sampot/pg-steward`](https://github.com/sampot/pg-steward)（總管範本） | 工具＋prompt：代建進工作集、自迭代不進、清理引導 |
| `src/components/playgrounds/PlaygroundsApp.svelte` | Picker 過濾；管理對話；退役 dialog |
| `src/components/playgrounds/sessionRuntime.ts`／session 相關 | 分身 `cloneIntent: session_seat` |
| `docs/playgrounds-host-api.md` | API 表（Phase 1～2 完成時） |

---

## 測試

- **Vitest（Phase 1）：** `isInWorkingSet` 缺省遷移；clone 預設寫入 `clonedFrom`／`inWorkingSet: false`（HOST 路徑）；UI clone 進工作集。
- **Vitest（Phase 2）：** working-set 過濾列表；`setWorkingSet` 切換。
- **手動：** 自迭代一輪後 Picker 仍乾淨；管理面看得到副本並可刪；總管「幫我做一個沙盒」後出現在 Picker。

---

## 與其他計劃

| 計劃／決策 | 關係 |
| --- | --- |
| **DEC-016** | 沙盒單位與 OPFS；本計劃管**實例可見性與生命週期**，不改畫布／SW |
| **DEC-017／018** | `agentManaged` 刪除邊界保留；本計劃加工作集軸與 clone 預設 |
| **DEC-022** | 工具發現仍用 `toolKinds`；工具沙盒是否在工作集由使用者／代建決定 |
| **DEC-023／SESSION** | 多分身＝clone；本計劃要求標記 `session_seat` 並在 Phase 4 可回收 |
| **AGENT-PLAN** | 自迭代流程補上「不進 Picker＋退役」；capabilities／tools 同步 |
| **FILE-NAV（DEC-027）** | 單沙盒**內部**檔案導航；本計劃是**沙盒之間**的實例管理 |
| **OPEN-FROM-URL（DEC-025）** | 匯入預設進工作集（與手建一致） |

---

## 風險與取捨

| 風險 | 緩解 |
| --- | --- |
| 舊 agentManaged 從 Picker「消失」 | 遷移：`agentManaged` 缺省當不在工作集；管理面一鍵「加入工作集」；空 Picker 提示 N 個隱藏 |
| 總管忘記設 `inWorkingSet: true` | 範本 prompt＋`createProject` 對「代使用者」預設 true；僅 `cloneProject` 預設 false |
| 使用者找不到副本 | 管理面為權威總帳；Picker 不承擔全量瀏覽 |
| 誤刪 | 批次清僅限 agentManaged∧¬workingSet∧非現行總管；應用內 confirm（禁 `alert`） |
| Meta 膨脹 | 只加三個可選欄位；不做資料夾樹 |

---

## 錯誤碼（建議）

| 碼 | 何時 |
| --- | --- |
| `not_found` | `setWorkingSet`／操作未知 id（對齊既有） |
| `bad_args` | `inWorkingSet` 非 boolean 等 |
| （刪除） | 沿用既有：非 agentManaged、刪現行總管等 |

細節與 [playgrounds-host-api.md](./playgrounds-host-api.md)、AGENT-PLAN 附錄對齊。

---

## 產品句（給 UI／文件）

> **Picker 是我的沙盒命名空間；管理面是遊樂場的實例總帳。Clone 預設進總帳，只有使用者意圖（含要求總管代建）才進 Picker。整場要回到第一次開啟遊樂場：用「重置遊樂場」（DEC-040），不是逐筆刪沙盒。**
