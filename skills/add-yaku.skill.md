# スキル：役を追加する

> 前提：フェーズ4で `js/agari.js`（手牌分解）・`js/yaku.js`（役定義の配列）・`js/scoring.js` が実装済みであること。

## 役定義の形（予定）

```javascript
{
  id: 'sanshoku',
  name: '三色同順',
  han: 2,               // 門前の翻数
  hanOpen: 1,           // 副露時の翻数。副露で不成立なら 0
  yakuman: 0,           // 役満なら 1（ダブル役満は 2 だが試作版では 1 として扱う）
  excludes: [],         // 複合しない役の id
  test: function (ctx) { /* ctx: 分解済みの面子・雀頭・待ち・状況 */ return false; }
}
```

## 手順

1. **先にテストを書く**：`tests/specs/yaku.spec.js` に、成立する例・成立しない例・副露時・他の役との複合の4種類以上を追加する。
2. `js/yaku.js` の役定義配列に追加する。判定は分解結果（`ctx.melds`・`ctx.pair`・`ctx.wait`）と状況（`ctx.isTsumo`・`ctx.isMenzen`・`ctx.seatWind` など）だけを見る。
3. 門前限定の役は `hanOpen: 0`、食い下がりの役は `hanOpen: han - 1`。
4. 上位役と複合しない場合は `excludes` に書く（例：清一色は混一色を含まない）。
5. `node tests/run-node.js` と `tests/yaku-tests.html` がすべて成功することを確認する。
6. README の「未実装の役」から削除し、CHANGELOG に追記する。

## 注意

- 1つの手牌に複数の分解がある場合、`scoring.js` は全分解の中で最高点を採用する。役の判定関数は「その分解で成立するか」だけを返す
- ローカル役は `data/rules.js` の設定で有効化できるようにし、既定は無効にする
