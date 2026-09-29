/*
 * ルール定義。実装状況（status）を必ず併記し、未実装のルールを実装済みに見せない。
 * status: 'active'  … 現在の版で動作に反映される
 *         'planned' … 値は保持しているが、対応機能が未実装
 */
(function (MJ) {
  'use strict';

  MJ.RULES = {
    matchLength: 'tonpu',           // 東風戦
    startScore: 25000,
    kuitan: true,                   // 喰いタン
    redDora: { man: 1, pin: 1, sou: 1 },
    abortiveDraws: { kyushuKyuhai: true },
    turnTimerSec: 0                 // 0 = 制限時間なし
  };

  MJ.RULE_INFO = [
    { key: 'redDora', label: '赤ドラ', value: '5萬・5筒・5索 各1枚', status: 'active',
      note: '牌の生成に反映（牌操作デモで確認できます）' },
    { key: 'matchLength', label: '対局の長さ', value: '東風戦', status: 'planned', note: 'CPU四人麻雀（フェーズ3〜6）で有効化' },
    { key: 'startScore', label: '持ち点', value: '25,000点', status: 'planned', note: 'CPU四人麻雀で有効化' },
    { key: 'kuitan', label: '喰いタン', value: 'あり', status: 'planned', note: '役判定（フェーズ4）で有効化' },
    { key: 'abortiveDraws', label: '九種九牌', value: 'あり', status: 'planned', note: '途中流局（フェーズ5）で有効化' },
    { key: 'turnTimerSec', label: '操作制限時間', value: 'なし', status: 'planned', note: 'CPU四人麻雀で有効化（時間切れはツモ切り）' }
  ];
})(window.MJ = window.MJ || {});
