/*
 * Node.js でテストを実行する：  node tests/run-node.js
 * ブラウザー用スクリプトを vm で読み込み、DOM に依存しないロジックだけを検証する。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const files = [
  'js/constants.js',
  'data/rules.js',
  'data/questions.js',
  'js/tiles.js',
  'js/wall.js',
  'js/hand-sorter.js',
  'js/storage.js',
  'js/shanten.js',
  'js/ukeire.js',
  'js/modes/demo-model.js',
  'js/modes/nanikiru-model.js',
  'js/game-engine.js',
  'js/cpu-player.js',
  'tests/test-runner.js',
  'tests/specs/tiles.spec.js',
  'tests/specs/demo-model.spec.js',
  'tests/specs/shanten.spec.js',
  'tests/specs/questions.spec.js',
  'tests/specs/match.spec.js'
];

const sandbox = { console: console, crypto: globalThis.crypto };
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
files.forEach(function (f) {
  vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), sandbox, { filename: f });
});

const results = sandbox.MJTest.run();
let lastSuite = null;
results.forEach(function (r) {
  if (r.suite !== lastSuite) { console.log('\n■ ' + r.suite); lastSuite = r.suite; }
  console.log((r.ok ? '  ✔ ' : '  ✘ ') + r.name + (r.ok ? '' : '\n      ' + r.error));
});
const failed = results.filter(function (r) { return !r.ok; }).length;
console.log('\n' + (failed ? '失敗 ' + failed + ' 件' : 'すべて成功') + ' / ' + results.length + ' 件');
process.exitCode = failed ? 1 : 0;
