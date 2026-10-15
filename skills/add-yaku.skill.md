# スキル：役を追加する

役は `js/yaku.js` の `YAKU` 配列に定義を1つ追加する。点数計算（`js/scoring.js`）は役の一覧を自動で使うので、通常は変更不要。

## 役定義の形

```javascript
{
  id: 'sanshokudoukou',          // 英字の識別子（excludes で参照する）
  name: '三色同刻',               // 画面表示名
  han: 2,                        // 門前の翻数
  hanOpen: 2,                    // 副露時の翻数。0 = 副露では不成立（門前限定）
  yakuman: 0,                    // 役満なら 1（試作版はダブル役満も役満1倍として扱う）
  forms: ['normal'],             // 対象の和了形：'normal' / 'chiitoitsu' / 'kokushi'
  excludes: [],                  // この役が成立したら外す役の id（上位役が下位役を外す）
  test: function (v) { return false; }
}
```

`test(v)` に渡される `v`（`yaku.makeView` が作る）：

| 項目 | 内容 |
|---|---|
| `v.groups` | 面子の一覧 `{ type: 'shuntsu'｜'koutsu'｜'kantsu', kind, concealed, open }`（副露面子を含む） |
| `v.shuntsu` / `v.koutsu` | 順子だけ／刻子・槓子だけ |
| `v.pair` | 雀頭の種類番号 |
| `v.ankou` | 暗刻の数（ロンで完成した刻子は含まない） |
| `v.isMenzen` | 門前か（暗槓は門前のまま） |
| `v.kinds` / `v.counts` | 手に含まれる種類の一覧／34種の枚数（副露を含む） |
| `v.interp.wait` | 待ちの形：'ryanmen'・'kanchan'・'penchan'・'shanpon'・'tanki'・'kokushi13' |
| `v.seatWindKind` / `v.roundWindKind` | 自風・場風の種類番号 |
| `v.ctx` | 状況：`isTsumo`・`riichi`・`ippatsu`・`haitei`・`houtei`・`rinshan`・`chankan`・`kuitan` |

種類番号：萬子 0〜8、筒子 9〜17、索子 18〜26、字牌 27〜33（東南西北白發中）。

## 手順

1. **先にテストを書く**。`tests/specs/yaku.spec.js` に次の4種類以上を追加する。
   - 成立する例
   - 成立しない（よく似た）例
   - 副露時の翻数（食い下がり／門前限定）
   - 他の役との複合（同時に付く役・外れる役）

   例：`H.win('222m222p222s45m99p', '3m')` のように、手の内13枚と和了牌を文字列で書く。
2. `tests/specs/scoring.spec.js` に、その役を含む手の**点数**を点数早見表と照合するテストを1つ以上追加する。
3. `js/yaku.js` の `YAKU` 配列に定義を追加する。判定は `v` の情報だけを見る（DOM・ゲーム状態を参照しない）。
4. 上位役と複合しない場合は `excludes` に書く（例：清一色は混一色を外す）。役満は自動的に他の役を外す。
5. 符に影響する場合（例：平和）は `js/scoring.js` の `calcFu` も確認する。
6. 実行してすべて成功させる。

   ```bash
   node tests/run-node.js
   ```

   ブラウザーでは `tests/yaku-tests.html`・`tests/scoring-tests.html` で確認できる。
7. README の「役」の一覧、`CHANGELOG.md`、`data/changelog.js` を更新する。

## 注意

- 1つの手牌に複数の解釈（分解・和了牌の位置）がある場合、`scoring.score` は全解釈の中で最も点数の高いものを採用する。役の判定関数は「その解釈で成立するか」だけを返せばよい
- ローカル役は `data/rules.js` に有効／無効の設定を追加し、既定は無効にする（`v.ctx` 経由で参照する）
- 対局中に状況役（立直・嶺上開花など）を発生させるには、`js/game-engine.js` の `scoreContext` でフラグを渡す
