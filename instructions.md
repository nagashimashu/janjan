# 開発指示

- 静的Webサイトとして実装する
- HTML、CSS、Vanilla JavaScriptを使用する
- 外部API、外部DB、サーバー処理を使用しない
- 既存麻雀ゲームのロゴ、キャラクター、画面、画像、音声を複製しない
- すべてオリジナルのUI・牌・演出を作成する
- 表示とゲームロジックを分離する
- 役判定と点数計算には必ずテストを追加する
- 未実装の機能を実装済みとして表示しない
- 個人情報を収集しない
- localStorageに保存するのは設定とゲーム成績だけにする
- PC、タブレット、スマートフォンに対応する
- prefers-reduced-motionに対応する
- キーボード操作とフォーカス表示に対応する

## このリポジトリでの約束事

### 構成

- `file://` で動かすため ES Modules は使わず、`(function (MJ) { ... })(window.MJ = window.MJ || {});` の形で `window.MJ` に公開する
- 新しいスクリプトは `index.html` の読み込み順（依存される側が先）に追加する。テストで使うものは `tests/run-node.js` と各テストHTMLにも追加する
- 麻雀ロジック（`js/*.js`）とモデル（`js/modes/*-model.js`）は DOM に触れない。DOM・入力は画面コントローラー（`js/modes/*.js`）だけが扱う
- 定数は `js/constants.js`、ルールは `data/rules.js`、設定項目は `js/storage.js` の `SETTINGS_SCHEMA` に置く
- 牌面の見た目は `js/tile-art.js` だけで決める（差し替え可能にするため）

### UI

- 主要ボタンは 44×44 CSSピクセル以上
- 無効な操作はボタンを消さず、`aria-disabled` と理由の表示で示す
- 色だけで状態を伝えない（▼マーク、文字、形も併用する）
- アニメーションは `transform` と `opacity` だけを動かし、`MJ.anim` 経由で実行する（演出少なめ・reduced-motion を一括で扱うため）
- 演出の完了を待って入力ロックを解除する処理には、必ず時間切れを設ける
- 通知したい出来事は `MJ.ui.announce()` でスクリーンリーダーにも伝える

### テスト

- ロジックを追加・変更したら `tests/specs/` にテストを追加し、`node tests/run-node.js` がすべて成功することを確認する
- 不具合を直したら、その不具合を再現するテストを先に書く
- 乱数を使う処理はシードを指定してテストする

### 文書

- 機能を追加したら README の「未実装機能」「採用ルール」、`CHANGELOG.md`、`data/changelog.js`（画面の更新履歴）を更新する
- 設計を変えたら `docs/DESIGN.md` を更新する
