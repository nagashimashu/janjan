# スキル：何切る問題を追加する

> 前提：フェーズ2で `data/questions.js`（`MJ.QUESTIONS` 配列）と `js/shanten.js`・`js/ukeire.js` が実装済みであること。

## 手順

1. `data/questions.js` の末尾に問題オブジェクトを追加する。`id` は `Q` ＋3桁の連番（既存と重複させない）。
2. 手牌・ドラ表示牌は `123m406p11z` 形式で書く（0＝赤5）。手牌は必ず14枚。
3. 候補（`candidates`）のシャンテン数・受入牌・受入枚数は **手計算で書かず**、ブラウザーのコンソールで `MJ.ukeire` の計算結果を使う。
4. `grade` は `best`（最有力）／`good`（有力）／`situational`（目的によって選択可能）／`improve`（改善余地あり）のいずれか。
5. 解説には、シャンテン数・受入枚数・打点・守備力・形の良さ・巡目・ドラ・場況のうち、判断に効いた観点を書く。
6. **レビュー前は `reviewed: false`** にする（画面に「確認中」と表示される）。人が確認したら `true` にし、`reviewerNote` に確認内容を書く。
7. `lastUpdated` を今日の日付（YYYY-MM-DD）にする。
8. `node tests/run-node.js` を実行し、問題データ検証テスト（全問題の枚数・形式・計算値の一致）が成功することを確認する。

## 雛形

```javascript
{
  id: 'Q011',
  difficulty: 'normal',            // easy / normal / hard
  hand: '234m067p3345s1177z',      // 14枚
  seatWind: 'south',
  roundWind: 'east',
  doraIndicators: ['4s'],
  turn: 7,
  remaining: {},                   // 見えている牌で減らす場合のみ。例 { '5s': 2 }
  candidates: [
    { discard: '1z', grade: 'best', shanten: 1, ukeire: ['5m', '8p'], ukeireCount: 16, note: '' }
  ],
  yakuTargets: ['断么九'],
  explanation: '',
  supplement: '',
  reviewed: false,
  reviewerNote: '',
  lastUpdated: '2026-09-29'
}
```

## やってはいけないこと

- AI が生成した推奨打牌や解説を、確認せずに `reviewed: true` にする
- 既存の書籍・サイトの問題文や解説をそのまま転載する
