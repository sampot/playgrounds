# Playgrounds SAM 執行期參數與 env 命名空間

本檔定義 SAM 後端（`functions.js`／`controller.js`）如何取得**執行期參數**與**密鑰 binding** 的契約。權威決策：**DEC-035**（命名空間與 `.env`）；密鑰庫本體仍屬 **DEC-029**。

一句話：**沙盒根目錄 `.env` → 同步唯讀 `env.vars`；SecretStore 每密鑰獨立 binding 掛在 `env.secrets.<NAME>.get()`。小寫＝命名空間，大寫＝能力／資源 binding。**

**狀態：** 規格初版（2026-08-04）；**核心已落地**（`createFunctionsEnv` 注入 `env.vars`／`env.secrets.*`；範本 BYOK 讀 `env.secrets`）。

---

## 1. 定位與邊界

### 1.1 在堆疊中的位置

```text
沙盒檔案樹                         遊樂場介面（SecretStore）
  └─ .env（明文設定；可進 .sam）      └─ 密文庫（永不進 .sam）
        │                                    │
        ▼                                    ▼
createFunctionsEnv / Controller env
        │
        ├─ env.vars.*          （同步 string；本沙盒）
        ├─ env.secrets.*       （{ get() }；須 unlock）
        ├─ env.KV / env.DB     （Durable 資源；sandbox-intrinsic）
        ├─ env.COMPUTE         （窄 compute；DEC-036 準入後）
        └─ env.HOST|DELEGATE|SESSION（能力 binding；條件／角色注入；歷史 TOOL→DELEGATE）
```

| 層 | 本規格 |
| --- | --- |
| **宣告面** | `index.html` `<head>` 的 `sam:*` meta（身分／協定／**environment capabilities** 見 DEC-036）——**不是** `env.vars` 權威 |
| **執行期參數** | 沙盒根目錄 `.env` → `env.vars` |
| **密鑰** | SecretStore → `env.secrets.<NAME>`（DEC-029 信任／密碼學不變） |
| **注入面** | `functions.js` 與 `controller.js` 同一 `env`（DEC-024／031） |
| **畫布 UI** | **不得**直讀 bindings；經 `/api`→`functions.js` |

### 1.2 目標

- **G1** 提供熟悉的 `.env` 作為沙盒級執行期參數權威。
- **G2** 以 `env.vars`／`env.secrets` **小寫命名空間**避免污染 `env` 頂層（不與 `KV`／`HOST`／密鑰名互撞）。
- **G3** 維持「一 secret＝一獨立 binding＋`get()`」；**不是**復活 `env.SECRETS.get(name)` bag。
- **G4** 明文設定可隨 `.sam` 搬動；密鑰永不進包裹。
- **G5** 與 WASI Shell／`runCmd` process env **預設分離**（不自動合併）。

### 1.3 非目標

- 以 `index.html` `sam:*` meta 承載任意 `KEY=value` 作為 `env.vars` 權威。
- `env.secrets.get(name)`／`env.SECRETS.get(name)` 字典式主路徑。
- 把 `.env` 當第二密鑰庫（API key 仍走 SecretStore）。
- 遊樂場 prefs／localStorage 當 vars 第二權威。
- MVP：自動把 `env.vars` 注入 WASI `runCmd`／人類 Shell session env。
- MVP：`${VAR}` 巢狀展開、多檔 `.env.local` 覆寫鏈（可後段）。
- 本站帳號／雲端同步 `.env`。

---

## 2. env 頂層慣例

| 形狀 | 角色 | 例 |
| --- | --- | --- |
| **大寫鍵** | 能力或資源 **binding** | `KV`、`DB`、`HOST`、`SESSION`、`COMPUTE`（DEC-036）、**`DELEGATE`（DEC-037）**；歷史 `TOOL` |
| **小寫鍵** | **命名空間**（本身不是 binding） | `vars`、`secrets` |
| 命名空間內項目 | 設定值或密鑰 binding | `env.vars.API_BASE`、`env.secrets.OPENAI_API_KEY` |

**頂層保留名（小寫命名空間＋大寫 binding）：**  
`vars`、`secrets`、`KV`、`DB`、`HOST`、`SESSION`、`COMPUTE`、**`DELEGATE`**；歷史 **`TOOL`**（遷移期可雙掛，權威為 `DELEGATE`）。  
Secret／var 的**項目名**不得占用這些頂層保留名（項目活在命名空間內，故不再與 `HOST` 搶頂層；但仍禁止項目名為 `vars`／`secrets` 等造成混淆的鍵——見 §3.3／§4.3）。  
`KV`／`DB`／`vars` 屬沙盒 **intrinsic**（不必 capability 宣告）；`COMPUTE` 準入見 [PG-SAM-BINDINGS-SPEC.md](./PG-SAM-BINDINGS-SPEC.md)。

---

## 3. `env.vars` 與 `.env`

### 3.1 權威來源

| 項目 | 規則 |
| --- | --- |
| 路徑 | 該沙盒檔案樹**根目錄** `.env`（僅此一路徑為 MVP 權威） |
| 缺檔 | 注入空命名空間：`env.vars` 仍存在，無可列舉鍵（或等價空物件） |
| 編碼 | UTF-8 文字 |
| 與 meta | **不**從 `sam:*` 讀取值；`index.html` 維持宣告面（DEC-024） |
| 編輯 | 人類／Agent／Tool（含 `pg-envkit`）改檔＝改參數；遊樂場不另存第二份 |

### 3.2 檔案格式（dotenv 子集）

支援：

- 空行；`#` 開頭整行註解
- `KEY=value`；`KEY="value"`／`KEY='value'`（去外層配對引號）
- 鍵名：`/^[A-Za-z_][A-Za-z0-9_]*$/`
- 值：去引號後的字串；允許空字串 `KEY=`

不支援（MVP；遇到可忽略該行或整檔失敗——實作選「略過非法行並可選 console 警告」）：

- `export KEY=...` 前綴（可後段寬容剝離）
- 多行值、`\n` 轉義全集
- `${OTHER}`／`$OTHER` 展開
- `.env.local`／環境分層覆寫

同一鍵多次出現：**後寫蓋前寫**。

### 3.3 Binding 形狀

```ts
/** 小寫命名空間；非 binding。內容為同步、唯讀的字串對。 */
type EnvVarsNamespace = Readonly<Record<string, string>>;

// 讀取：
// const base = env.vars.API_BASE;           // string | undefined
// const flag = env.vars["FEATURE_X"];
```

| 規則 | 說明 |
| --- | --- |
| 同步 | **不必** `await`；非密文、無 lock |
| 唯讀 | 注入時 freeze（或僅暴露不可變視圖）；改 `env.vars` **不**回寫 `.env` |
| 無檔／空檔 | `env.vars` 物件仍注入（空） |
| 非法鍵略過 | 不注入該鍵 |
| 與 secrets | 同名可並存於不同命名空間（`env.vars.FOO` vs `env.secrets.FOO`）；文件應勸阻把密鑰放進 `.env` |

可選輔助（非必須）：`Object.keys(env.vars)` 列舉；**不**要求 `env.vars.get`／`list` API。

### 3.4 注入對象與時機

| 對象 | MVP |
| --- | --- |
| 工作沙盒 `functions.js`／`controller.js` | 注入**該沙盒** `.env` → `env.vars` |
| 總管／一般 Agent | 同上（自己的沙盒樹） |
| Session 參與者 | 同上（自己的沙盒樹） |
| Tool SAM | 注入**工具自己沙盒**的 `.env`；**不**注入宿主工作沙盒的 vars |
| 畫布 JS | 不注入 |

**時機：** 組 `env` 時讀取並 parse 一次。檔案變更後，於後續 `functions` 請求／Controller 重建 env 時生效即可；MVP **不**要求檔案監視熱更新。

### 3.5 搬動與匯出

| 動作 | `.env`／`env.vars` |
| --- | --- |
| 進 `.sam` export | **是**（屬沙盒檔案樹；與一般文字檔相同） |
| clone／import | 隨檔案樹複製 |
| 與 Durable KV／DB | 無關；不走 `state.*` 選項 |

提醒：若使用者誤把密鑰寫進 `.env`，匯出即外洩——產品文案應導向 SecretStore。

### 3.6 與 Shell／`runCmd`

- 人類 Shell session 的 `export`／`env`／`$VAR` **不**與 `env.vars` 共用。
- `HOST.runCmd({ env })` **預設不**合併沙盒 `.env`。
- 後段若需要「命令帶專案 dotenv」，須顯式選項（例如 `envFrom: "dotenv"`），非本規格 MVP。

### 3.7 使用例

```js
// functions.js
export default {
  async fetch(request, env) {
    const base = env.vars.API_BASE ?? "https://example.invalid";
    const key = await env.secrets.OPENAI_API_KEY.get();
    // ...
  },
};
```

```env
# 沙盒根目錄 .env
API_BASE=https://api.example.com
FEATURE_X=1
```

---

## 4. `env.secrets`（修訂 DEC-029 掛載點）

密鑰庫、unlock／lock、HOST 無值、永不進 `.sam`、取消遊樂場代打等**不變**——見 [PG-SECRETSTORE-PLAN.md](./PG-SECRETSTORE-PLAN.md)／DEC-029。本節只定**注入路徑**。

### 4.1 Binding 形狀

```ts
interface SecretBinding {
  get(): Promise<string>; // locked → reject secret_locked
}

/** 小寫命名空間；其下每 secret 名一顆獨立 binding */
type EnvSecretsNamespace = Record<string, SecretBinding>;

// await env.secrets.OPENAI_API_KEY.get()
```

| 規則 | 說明 |
| --- | --- |
| 一 secret＝一 binding | 掛在 `env.secrets[<NAME>]`，**不是** `env.secrets.get(name)` |
| 禁止 bag | **無** `env.SECRETS`／`env.secrets.get(動態名)` 主路徑 |
| 命名 | `/^[A-Za-z_][A-Za-z0-9_]*$/`；不得為頂層保留名（§2） |
| locked | 建議不掛各 binding（呼叫端以 `env.secrets.X == null` 探測）；或掛上但 `get()`→`secret_locked`（與 SECRETSTORE 計劃一致，開工二選一） |
| 列舉值 | **無**；名稱經遊樂場 UI／`HOST.listSecrets()`（無值） |
| Tool SAM | MVP 不掛 `env.secrets`（或掛空命名空間且無項目） |
| Session 參與者 | 可掛（DEC-033 worker BYOK）；`env.SESSION` 本身不帶密 |

### 4.2 與歷史形狀

| 時期 | 讀取 |
| --- | --- |
| 歷史 bag（已廢） | `await env.SECRETS.get("OPENAI_API_KEY")` |
| 現行實作（遷移前） | `await env.OPENAI_API_KEY.get()` |
| **本規格目標** | `await env.secrets.OPENAI_API_KEY.get()` |

遷移：實作階段應一次切到 `env.secrets.*`；**不**要求長期雙掛頂層 `env.<NAME>`（若短暫相容須標 deprecated 並訂移除期限）。

### 4.3 對照 CF

| CF | Playgrounds（本規格） |
| --- | --- |
| `await env.MY_BINDING.get()`（頂層） | `await env.secrets.MY_BINDING.get()`（命名空間，避免頂層污染） |
| 一 secret 一 binding | **相同** |
| wrangler 選綁子集 | MVP：允許沙盒綁 store 全部；Phase 5 grant |

---

## 5. 與 `sam:*` meta 的分工

| 來源 | 放什麼 |
| --- | --- |
| `index.html` `sam:*` | 身分／協定／是否要 Controller／tool 發現；**environment capabilities**（`sam:capabilities`，DEC-036） |
| 根目錄 `.env` | 執行期參數值 → `env.vars` |
| SecretStore | 密鑰 → `env.secrets.*` |

**不**新增 `sam:vars` 承載 `KEY=value` 作為權威。後段若需「預期鍵」宣告，可另議可選 schema meta；值仍以 `.env` 為準。  
環境服務準入（`runPython`→`env.COMPUTE` 等）見 [PG-SAM-BINDINGS-SPEC.md](./PG-SAM-BINDINGS-SPEC.md)，**不**與本檔 vars 權威混淆。

---

## 6. 錯誤與降級（建議）

| 情況 | 行為 |
| --- | --- |
| `.env` 缺檔 | 空 `env.vars`；不視為錯誤 |
| `.env` 過大 | 實作訂硬上限（建議 ≤ 64 KiB）；超限 → 空 vars＋可觀測警告／錯誤碼 `env_vars_too_large` |
| 非法行 | 略過該行（MVP） |
| secret locked | `get()` → `secret_locked`（DEC-029） |
| 未知 secret 名 | 不注入該 binding |

---

## 7. 實作指針（非本檔交付）

| 路徑（預期） | 用途 |
| --- | --- |
| `functionsEnv.ts` | 注入 `env.vars`、`env.secrets` 命名空間 |
| dotenv parse 小模組 | `.env` 子集 |
| `secretStore.ts` | `createSecretBindingsForEnv` 改掛到 `secrets` 下 |
| `secretStoreCrypto.ts` | 保留名含 `vars`／`secrets`；secret 名不再與 `HOST` 搶頂層 |
| 範本 `pg-steward` 等 | BYOK 改 `env.secrets.<NAME>.get()` |

Phase 狀態見 SECRETSTORE 計劃（2b 已完成）與 DEC-035。

---

## 8. 相關文件

| 文件 | 關係 |
| --- | --- |
| [DECISIONS.md](./DECISIONS.md) DEC-035 | 本契約之 ADR |
| [DECISIONS.md](./DECISIONS.md) DEC-029 | SecretStore 信任／unlock／HOST |
| [DECISIONS.md](./DECISIONS.md) DEC-036 | 環境能力宣告／準入／`env.COMPUTE` |
| [PG-SAM-BINDINGS-SPEC.md](./PG-SAM-BINDINGS-SPEC.md) | intrinsic vs capability；準入生命週期 |
| [PG-SECRETSTORE-PLAN.md](./PG-SECRETSTORE-PLAN.md) | 密鑰庫實作；binding 掛載點依本檔修訂 |
| [playgrounds-host-api.md](./playgrounds-host-api.md) | Bindings 速查 |
| [GLOSSARY.md](./GLOSSARY.md) | `env.vars`／`env.secrets`／`.env` 用語 |
| DEC-024 | `sam:*` 宣告面；勿用 meta 當 vars 權威 |

---

## 9. 產品句

> **非密設定寫在沙盒 `.env`，後端用 `env.vars` 讀。密鑰留在密鑰庫，用 `env.secrets.名稱.get()`。小寫是命名空間，大寫才是 HOST／KV 那類 binding。**
