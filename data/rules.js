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
    turnTimer: 'setting'            // 操作の制限時間は設定画面（MJ.settings.turnTimer）で選ぶ
  };

  MJ.RULE_INFO = [
    { key: 'redDora', label: '赤ドラ', value: '5萬・5筒・5索 各1枚', status: 'active',
      note: '牌の生成に反映（牌操作デモで確認できます）' },
    { key: 'matchLength', label: '対局の長さ', value: '東風戦', status: 'active', note: '東4局で親が流れると終了。0点未満（トビ）でも終了' },
    { key: 'startScore', label: '持ち点', value: '25,000点', status: 'active', note: 'CPU四人麻雀に反映' },
    { key: 'notenPenalty', label: 'ノーテン罰符', value: '場に3,000点', status: 'active', note: '山切れの流局時。親テンパイで連荘、流局ごとに本場+1' },
    { key: 'winRules', label: '和了', value: '頭ハネ・フリテンあり', status: 'active', note: 'ダブロンなし。捨て牌フリテンと同巡内フリテン' },
    { key: 'scoring', label: '点数計算', value: '切り上げ満貫なし・数え役満あり', status: 'active', note: 'ダブル役満は役満1倍。連風牌の雀頭は4符' },
    { key: 'honbaRule', label: '本場', value: 'ロン300点・ツモ1人100点', status: 'active', note: '親の和了・流局で+1、子の和了で0' },
    { key: 'kuitan', label: '喰いタン', value: 'あり', status: 'active', note: '喰い替え（現物・筋）は禁止' },
    { key: 'riichi', label: 'リーチ', value: '1,000点・残り4枚以上', status: 'active', note: '一発・裏ドラあり。対局終了時に残った供託はトップが受け取る' },
    { key: 'kan', label: 'カン', value: '1局4回まで', status: 'active', note: 'カンドラはカンの直後にめくる（明槓・加槓も即めくり）。四槓散了は未実装' },
    { key: 'abortiveDraws', label: '九種九牌', value: 'あり', status: 'active', note: '最初のツモで么九牌9種以上。点数移動なし・親は連荘。ほかの途中流局は未実装' },
    { key: 'turnTimer', label: '操作の制限時間', value: '設定で選択（既定なし）', status: 'active', note: '10秒・20秒・30秒から選べる。時間切れは打牌ならツモ切り、鳴き・ロンは見送り' }
  ];
})(window.MJ = window.MJ || {});
