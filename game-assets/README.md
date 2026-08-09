# game-assets（本機資源庫）

給 `pg-*` 遊戲用的**免費用美術／音效／音樂**暫存與挑選庫。

- **不進 git**（僅本 README 與 `ATTRIBUTION.md` 追蹤）；二進位與下載包留本機。
- **不進**場殼／go build／deploy；runtime **不得**依賴此路徑。
- 定稿後**複製**進各遊戲 repo（例：`sampot/pg-rubik/assets/`），並在該 repo 保留授權說明。

## 使用規則（硬）

開發遊戲**可以使用**本目錄資源，但：

1. **須按授權要求署名**（CC-BY 等）。
2. **授權不要求署名時也要署名**（本專案慣例；例：CC0 仍註明 Kenney／作者／pack／URL）。
3. 署名放在該 SAM 的 README、`ATTRIBUTION.md`、與／或遊戲內 credits／關於；並保留對應 `License.txt` 為佳。
4. 對照本庫 [`ATTRIBUTION.md`](./ATTRIBUTION.md) 與各 pack 授權檔。

## 目錄

```text
game-assets/
  art/         精靈、貼圖、UI、圖示
  sfx/         短音效（點擊、得分、爆炸…）
  music/       BGM／循環樂段
  fonts/       可免費嵌入的字型（核授權）
  _staging/    剛下載、尚未分類的 zip／原檔
```

本機若缺子目錄：

```bash
mkdir -p game-assets/{art,sfx,music,fonts,_staging}
```

## 授權原則

| 優先 | 說明 |
| --- | --- |
| CC0／公共領域／明示可商用可改作 | 可用；**進遊戲仍須署名**（見上方硬規則） |
| CC-BY（等需署名） | 可用；依授權＋本專案慣例署名 |
| 禁止不明／「僅個人非商用」／未核授權 | 勿進各 `pg-*` |

常見來源（仍須**逐件**核授權與重分配條款）：[Kenney](https://kenney.nl)、[OpenGameArt](https://opengameart.org)、[Freesound](https://freesound.org)（濾授權）、itch.io 上標 CC0 的 pack。

## 命名

`來源-描述-變體.ext`，例：`kenney-ui-click-1.ogg`、`opengameart-coin-pickup.wav`。

## 工作流

1. 下載到 `_staging/` → 核授權 → 歸類到 `art/`／`sfx/`／`music/`／`fonts/`。
2. 在 `ATTRIBUTION.md` 加一列（來源、授權、本地路徑、備註）。
3. 做遊戲時**拷貝**需要的檔進該 SAM；勿 symlink 回此目錄當正式依賴。
4. **署名**（要求與不要求皆做）寫進該 SAM；再對照 `ATTRIBUTION.md`。
5. 遊戲清單／題材見 [`docs/PG-GAMES.md`](../docs/PG-GAMES.md)。

## 已種子（本機）

已下載並解壓多批 **CC0** 資源：

- **Kenney**：音效、jingle、撲克／UI／平台／粒子／角色等
- **麻將／象棋**：FluffyStuff 牌面、OGA 像素麻將、xiangqi-setup CC0 主題、sashite xiongqi
- **OpenGameArt**：8-bit 音效庫、chiptune 關卡曲、骰子等
- **RTS／軍事**（[`art/rts/`](./art/rts/)）：俯視坦克、飛彈／爆炸、飛機／直升機、砲塔與工廠／沙漠皮（類 Dune II）

完整清單與 URL 見 [`ATTRIBUTION.md`](./ATTRIBUTION.md)。原始 zip 在 `_staging/`（含 itch 長 BGM：Not Jam／Dylann Taylor／HydroGene）。進遊戲優先拷 **ogg**，勿整包 wav。
