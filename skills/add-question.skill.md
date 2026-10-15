# スキル：何切る問題を追加する

問題は `data/questions.js` の `MJ.QUESTIONS` 配列に追加する。

## 手順

1. 手牌（14枚）・ドラ表示牌・見えている牌を決め、分析ツールで全打牌の計算値を出す。

   ```bash
   node tools/question-tool.js --hand 23456m78p345678s4z --dora 1p --visible 3s
   ```

   出力の `{ discard: ..., shanten: ..., ukeireCount: ..., ukeire: [...] }` をそのまま `candidates` に貼る。**シャンテン数・受入を手で数えない。**
2. `id` は `Q` ＋3桁の連番（既存と重複させない）。牌は `123m406p11z` 形式（0＝赤5、z は 1〜7 が東南西北白發中）。
3. 候補ごとに `grade` を付ける：`best`（最有力）／`good`（有力）／`situational`（目的によって選択可能）／`improve`（改善余地あり）。`best` は1つ以上必要。候補に無い打牌は画面上で自動的に「改善余地あり」になる。
4. 候補ごとの `note`、`explanation`（解説）、`perspectives`（打点・守備力・形の良さ・巡目・ドラ・場況）、`yakuTargets`、`supplement` を書く。シャンテン数と受入枚数の観点は画面が計算値から自動で表示する。
5. 他家の河など、残り枚数に影響する牌は `visible` に書き、`situation` に状況を文章で書く。
6. **`reviewed: false`** にする（画面に「確認中」と表示される）。人が確認したら `true` にし、`reviewerNote` に確認内容を書く。
7. `lastUpdated` を今日の日付（YYYY-MM-DD）にする。
8. 検証とテストを実行し、すべて成功することを確認する。

   ```bash
   node tools/question-tool.js
   node tests/run-node.js
   ```

## 雛形

```javascript
{
  id: 'Q011',
  title: 'テーマ（回答後に表示）',
  difficulty: 'normal',            // easy / normal / hard
  hand: '234m067p3345s1177z',      // 14枚
  seatWind: 'south',               // east / south / west / north
  roundWind: 'east',
  doraIndicators: ['4s'],
  turn: 7,
  visible: '',                     // 見えている牌（残り枚数から差し引く）。例 '5s5s2p'
  situation: '',                   // 例 '対面がリーチ。対面の河：…'
  candidates: [
    { discard: '1z', grade: 'best', shanten: 1, ukeireCount: 16, ukeire: ['5m', '8p'], note: '' }
  ],
  yakuTargets: ['断么九'],
  explanation: '',
  perspectives: { value: '', defense: '', shape: '', turn: '', dora: '', situation: '' },
  supplement: '',
  reviewed: false,
  reviewerNote: '',
  lastUpdated: '2026-10-15'
}
```

## やってはいけないこと

- AI が生成した推奨打牌や解説を、確認せずに `reviewed: true` にする
- 既存の書籍・サイトの問題文や解説をそのまま転載する
- テストを通すために計算値を書き換える（計算値がおかしいと思ったら `js/shanten.js` のテストを追加して原因を調べる）
