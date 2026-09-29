# 設計書（v0.1.0 時点）

星翠麻雀（SEISUI MAHJONG）の全体設計です。実装が進んだら、この文書も合わせて更新してください。

---

## 1. 全体設計

```text
┌──────────────────────── index.html（SPA・ハッシュルーター） ────────────────────────┐
│  app.js ─ 画面切替 / 設定 / 共通UI（toast・confirm・aria-live・振動）                 │
│    │                                                                                  │
│    ├─ 画面コントローラー（DOM・入力）  modes/demo.js  →（今後）nanikiru.js, match.js     │
│    │        │ 状態の変更は必ずモデル経由                                               │
│    │        ▼                                                                         │
│    ├─ モデル（純粋ロジック・DOM非依存） modes/demo-model.js →（今後）game-engine.js      │
│    │        │                                                                         │
│    │        ▼                                                                         │
│    ├─ 麻雀ロジック   tiles / wall / hand-sorter →（今後）shanten / ukeire / agari /     │
│    │                                             yaku / scoring / cpu-player          │
│    ├─ 表示部品       renderer（差分描画）/ tile-art（SVG牌面）/ animation / audio        │
│    └─ 基盤           constants / data/rules / storage / debug                          │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

- **3層分離**：麻雀ロジック（純粋関数）→ モードのモデル（状態遷移）→ 画面コントローラー（DOM・入力）。
  ロジックとモデルは DOM に触れないため、Node.js でもテストできます（`tests/run-node.js`）。
- **グローバル名前空間 `window.MJ`**：`file://` で直接開いても動くよう、ES Modules は使いません。
  読み込み順は `index.html` の `<script>` の順です（依存される側が先）。
- **牌の表現**：牌1枚は `{ id, suit, rank, code, kind, isRed, displayName }`。
  種類番号 `kind`（0〜33）はシャンテン計算などで配列の添字に使います。
  文字列表記は `123m406p11z`（0＝赤5）。
- **乱数**：シード付き（mulberry32）。同じシードなら同じ牌山を再現でき、テストや不具合の再現に使います。

## 2. 画面一覧

| # | 画面 | ルート | 状態 |
|---|---|---|---|
| 1 | タイトル画面 | `#/` | 実装済み |
| 2 | モード選択画面（3モードのカード＋メニュー） | `#/modes` | 実装済み |
| 3 | ルール設定画面 | `#/rules` | 表示のみ（変更機能はフェーズ3） |
| 4 | 牌操作デモ画面 | `#/demo` | 実装済み |
| 5 | 何切る問題一覧 | `#/nanikiru` | 予定内容の案内のみ（フェーズ2） |
| 6 | 何切る問題プレイ画面 | 同上（`#/nanikiru/<id>` を予定） | フェーズ2 |
| 7 | CPU四人麻雀対局画面 | `#/cpu` | 予定内容の案内のみ（フェーズ3〜6） |
| 8 | 局結果画面 | 対局画面内のオーバーレイ | フェーズ4 |
| 9 | 対局結果・順位画面 | 対局画面内のオーバーレイ | フェーズ6 |
| 10 | 戦績画面 | `#/stats` | デモ分のみ実装 |
| 11 | 遊び方画面 | `#/howto` | 実装済み（デモ分） |
| 12 | 更新履歴・クレジット画面 | `#/about` | 実装済み |
| – | 設定画面 | `#/settings` | 実装済み |
| – | 対局中メニュー・手牌読込・確認 | `<dialog>` | 実装済み |

## 3. ゲーム状態遷移

### 3.1 牌操作デモ（実装済み）

```text
 [配牌] ─→ WAIT_DRAW(13枚) ──ツモ──→ WAIT_DISCARD(14枚) ──打牌──→ WAIT_DRAW
                 │                        │  ↑ 選択／選択切替                  │
                 │                        └──┘                                │
                 └──（山が0枚）──→ EXHAUSTED（流局表示）──配牌──→ WAIT_DRAW ←─┘
 どの状態でも：配牌し直す／手牌読込（固定牌山）／整列
 演出中は locked=true となり、入力を受け付けない（二重処理防止）
```

### 3.2 CPU四人麻雀（フェーズ3〜6で実装予定）

```text
MATCH_START → SEAT_DECIDE（起家決定） → ROUND_SETUP（配牌・ドラ表示）
  → TURN_DRAW（ツモ／嶺上ツモ）
      → [ツモ和了・暗槓・加槓・リーチ・九種九牌 判定] → TURN_DISCARD
  → CALL_CHECK（ロン > ポン・カン > チー の優先順で全員に問い合わせ）
      ├ ロン → ROUND_END(win)
      ├ 鳴き → TURN_DISCARD（鳴いた人の打牌。ツモは飛ばす）
      └ なし → 次の人の TURN_DRAW
  → 山切れ → ROUND_END(draw)：テンパイ判定・ノーテン罰符
  → SCORE（翻・符・点数移動・本場・供託） → NEXT_ROUND（連荘判定）
  → 東4局終了（またはトビ）→ MATCH_END（順位・戦績保存）
```

状態は `phase` と `pendingActions`（各プレイヤーに提示中の選択肢）で表し、
CPUの思考と人間の入力はどちらも「アクションを1つ返す」同じ形に揃えます。

## 4. データ構造

```javascript
// 牌
{ id: "m5-0", suit: "man", rank: 5, code: "5m", kind: 4, isRed: true, displayName: "五萬" }

// 牌山（wall.build の戻り値）
{ seed: 12345, live: [/* ツモ山 */], dead: [/* 王牌14枚 */], doraIndicators: [tile], initialHand: [/* 配牌 */] }

// 牌操作デモの状態（demoModel）
{ seed, wall, hand: [], drawn: tile|null, river: [{ tile, tsumogiri, turn }], turn: 0, finished: false }

// プレイヤー（予定）
{ id: "player", name: "YOU", wind: "east", score: 25000, hand: [], drawn: null,
  discards: [{ tile, tsumogiri, riichi, calledBy }], melds: [{ type: "pon", tiles: [], from: 2 }],
  riichi: false, ippatsu: false, isCPU: false, cpuLevel: 0, theme: "jade" }

// 対局状態（予定）
{ mode: "cpu-match", roundWind: "east", handNumber: 1, honba: 0, riichiSticks: 0,
  dealerIndex: 0, currentPlayerIndex: 0, wall: {...}, players: [], phase: "draw",
  pendingActions: [], log: [] }

// 何切る問題（予定・data/questions.js）
{ id: "Q001", difficulty: "easy", hand: "123m...", seatWind: "south", roundWind: "east",
  doraIndicators: ["3p"], turn: 6, remaining: { "4m": 3 }, candidates: [
    { discard: "9s", grade: "best", shanten: 1, ukeire: ["2m","5m"], ukeireCount: 16, note: "" } ],
  yakuTargets: ["平和"], explanation: "", supplement: "",
  reviewed: false, reviewerNote: "", lastUpdated: "2026-09-29" }

// localStorage（設定・成績のみ。個人情報なし）
seisui.settings.v1 = { tileSize, discardMethod, misdiscardGuard, vibration, sound, volume,
                       animSpeed, cpuSpeed, autoSort, separateDraw, landscapeHint, debug }
seisui.stats.v1    = { demo: {deals, draws, discards}, nanikiru: {...}, match: {...} }
```

## 5. ファイル構成

```text
mahjong-web/
├─ index.html                 全画面（SPA）
├─ css/  base / lobby / table / tiles / effects
├─ js/
│  ├─ constants.js            定数
│  ├─ tiles.js                牌生成・表記・ドラ・並び順
│  ├─ wall.js                 シード乱数・牌山・固定牌山
│  ├─ hand-sorter.js          整列
│  ├─ tile-art.js             オリジナルSVG牌面（差し替えはここだけ）
│  ├─ renderer.js             牌要素生成・差分描画
│  ├─ animation.js            FLIP・飛来・粒子（reduced-motion対応）
│  ├─ audio.js                Web Audio 効果音
│  ├─ storage.js              設定・成績の保存、設定スキーマ
│  ├─ debug.js                デバッグパネル
│  ├─ app.js                  ルーター・設定UI・共通UI
│  └─ modes/
│     ├─ demo-model.js        牌操作デモのモデル
│     └─ demo.js              牌操作デモの画面・入力
├─ data/  rules.js / changelog.js   （今後 questions.js）
├─ tests/ index.html / tiles-tests.html / test-runner.js / run-node.js / specs/
├─ tools/serve.js             ローカル確認用サーバー（任意）
├─ docs/DESIGN.md             本書
├─ skills/                    AI・Copilot 向け作業手順
├─ README.md / instructions.md / CHANGELOG.md
```

推奨構成との差分：画面ごとの処理を `js/modes/` に分け、モデルと画面を別ファイルにしました。
`shanten.js`・`ukeire.js`・`agari.js`・`yaku.js`・`scoring.js`・`game-engine.js`・`cpu-player.js` と
`tests/{shanten,agari,yaku,scoring}-tests.html` は、各フェーズで中身と一緒に追加します
（空のファイルを先に置いて、実装済みに見えることを避けるためです）。

## 6. フェーズごとの実装順序

| フェーズ | 内容 | 主な追加ファイル |
|---|---|---|
| 1 ✅ | 牌操作デモ | tiles, wall, hand-sorter, tile-art, renderer, animation, audio, storage, demo |
| 2 | シャンテン数・受入 → 何切る問題10問 → 何切る画面・成績 | shanten, ukeire, data/questions, modes/nanikiru |
| 3 | 4人の状態管理・配牌・ツモ打牌の進行・CPUレベル1打牌・流局 | game-engine, cpu-player, modes/match |
| 4 | アガリ判定・役判定・符計算・点数計算・点数移動・局結果 | agari, yaku, scoring |
| 5 | ポン・チー・カン・リーチ・一発・嶺上・槍槓、演出、CPUレベル2・3 | game-engine拡張, cpu-player拡張 |
| 6 | 東風戦完走・連荘・本場・供託・順位・戦績、README完成、公開 | modes/match拡張 |

## 7. 技術的なリスクと対策

| リスク | 対策 |
|---|---|
| シャンテン計算・CPU思考が重く、スマホで画面が固まる | 34種の枚数配列で計算しメモ化。CPUは1手ごとに `setTimeout` で分割。必要なら Web Worker（file://では制約あり）|
| 役判定・符計算の誤り | 手牌分解を全列挙して最高点を採用。点数表と照合するテストを多数用意 |
| `file://` と ES Modules の非互換 | 通常の `<script>` とグローバル名前空間で実装 |
| アニメーション完了が通知されず入力ロックが残る | 演出には必ず時間切れを設ける（`animation.js`）|
| スクロール領域で飛来演出が切れる | 最前面レイヤーに複製を作って動かす |
| 上スワイプとページスクロールの競合 | 手牌は `touch-action: pan-x`、縦方向優勢の動きだけ打牌扱い |
| iOS の `100vh`・ノッチ | `100dvh`＋`100vh` フォールバック、`env(safe-area-inset-*)` |
| 画面回転で状態が失われる | 状態はメモリー上のモデルに保持し、回転時は再配置のみ |
| localStorage が使えない環境 | すべて try/catch。保存できなくても遊べる |
| 生成した何切る解説の誤り | `reviewed` フラグと「確認中」表示 |
| 既存作品との類似 | 牌面・エンブレム・配色はすべて自作。名称・レイアウトも独自 |

## 8. 簡略化するルール（予定）

- 包（パオ）なし／ダブル役満は役満として扱う（重複の細かな扱いなし）
- 途中流局は九種九牌のみ（四風連打・四槓散了・四家立直・三家和は未実装）
- ダブロンなし（頭ハネ：放銃者から見て下家優先）
- 流し満貫・人和・ローカル役なし
- 安全牌読みは現物・字牌・筋・壁の簡易評価のみ
- 牌譜の保存・再生なし、オンライン対戦なし

実装時に画面（ルール設定画面）と README に明記します。

## 9. フェーズ1の作業一覧（完了）

- [x] 136枚の生成（赤ドラ枚数はルールから）
- [x] シード付きシャッフル・王牌14枚・ドラ表示牌
- [x] 13枚配牌・ツモで14枚・自動整列（オン／オフ）
- [x] タップで選択・再タップで打牌・上スワイプで打牌・確認ボタンで打牌・誤打牌防止
- [x] 選択中の牌の浮き上がり・▼マーク・ホバー拡大
- [x] ツモ牌の分離表示（オン／オフ）
- [x] 河を6列で表示・ツモ切り／手出しを記録
- [x] 残り枚数・巡目・ドラ表示
- [x] 配牌し直し・手牌読込（手牌・ツモ順・シード指定）
- [x] 長押し・Iキーで牌の情報
- [x] キーボード操作（←→・Enter・T・S・D）とフォーカス表示
- [x] 配牌・ツモ・打牌（回転）・整列の演出、発光、粒子
- [x] reduced-motion・演出少なめ
- [x] Web Audio 効果音、音量・ミュート
- [x] 設定・成績の保存、データ初期化
- [x] 縦向き・横向きのレイアウト、セーフエリア
- [x] デバッグパネル（`?debug=1`）
- [x] テスト 45件（ブラウザー／Node.js）
