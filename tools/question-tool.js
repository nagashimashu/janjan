/*
 * 何切る問題の作成・確認ツール（Node.js）。
 *
 *   node tools/question-tool.js              全問題を検証する
 *   node tools/question-tool.js Q003         問題の検証結果と、全打牌の計算値を表示する
 *   node tools/question-tool.js --hand 23456m78p345678s4z [--dora 1p] [--visible 3s]
 *                                            任意の14枚を分析し、candidates に貼れる形式で出力する
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const sb = { console: console };
sb.window = sb;
vm.createContext(sb);
['js/constants.js', 'data/rules.js', 'data/questions.js', 'js/tiles.js', 'js/hand-sorter.js',
  'js/shanten.js', 'js/ukeire.js', 'js/modes/nanikiru-model.js'].forEach(function (f) {
  vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), sb, { filename: f });
});
const MJ = sb.MJ;

function arg(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : '';
}

function printAnalysis(p) {
  console.log('  打牌前のシャンテン数：' + MJ.shanten.label(p.shantenBefore));
  console.log('  ドラ：' + p.doraKinds.map(MJ.tiles.kindName).join('・'));
  console.log('  --- 全打牌（シャンテン数 → 受入枚数の順） ---');
  p.analysis.forEach(function (e) {
    console.log("      { discard: '" + e.code + "', grade: '', shanten: " + e.shanten + ', ukeireCount: ' + e.ukeireCount +
      ', ukeire: [' + e.ukeire.map(function (u) { return "'" + u.code + "'"; }).join(', ') + "], note: '' },");
  });
}

if (process.argv.indexOf('--hand') >= 0) {
  const q = {
    id: 'NEW', hand: arg('--hand'), doraIndicators: arg('--dora') ? [arg('--dora')] : ['1z'],
    visible: arg('--visible'), candidates: []
  };
  console.log('分析：' + q.hand);
  printAnalysis(MJ.nanikiruModel.prepare(q));
  process.exit(0);
}

const target = process.argv[2];
let failed = 0;
MJ.QUESTIONS.forEach(function (q) {
  if (target && q.id !== target) return;
  const errors = MJ.nanikiruModel.validate(q);
  console.log((errors.length ? '✘ ' : '✔ ') + q.id + ' ' + q.title + (q.reviewed ? '' : '（未レビュー）'));
  errors.forEach(function (e) { console.log('    ' + e); });
  if (errors.length) failed++;
  if (target) printAnalysis(MJ.nanikiruModel.prepare(q));
});
if (target && !MJ.QUESTIONS.some(function (q) { return q.id === target; })) {
  console.log(target + ' は見つかりません');
  failed++;
}
process.exitCode = failed ? 1 : 0;
