/* 牌・牌山・整列のテスト */
(function () {
  'use strict';
  const describe = MJTest.describe, it = MJTest.it, assert = MJTest.assert;

  describe('牌の生成', function () {
    const set = MJ.tiles.createTileSet(MJ.RULES);

    it('136枚が生成される', function () { assert.equal(set.length, 136); });

    it('id が重複しない', function () {
      assert.equal(new Set(set.map(function (t) { return t.id; })).size, 136);
    });

    it('34種類がそれぞれ4枚ずつ存在する', function () {
      const counts = new Array(34).fill(0);
      set.forEach(function (t) { counts[t.kind] += 1; });
      assert.ok(counts.every(function (c) { return c === 4; }), '枚数：' + counts.join(','));
    });

    it('赤ドラは設定どおり（各スート1枚、計3枚）', function () {
      const reds = set.filter(function (t) { return t.isRed; });
      assert.equal(reds.length, 3);
      assert.deepEqual(reds.map(function (t) { return t.code; }).sort(), ['5m', '5p', '5s']);
    });

    it('赤ドラ0枚の設定では赤牌が生成されない', function () {
      const none = MJ.tiles.createTileSet({ redDora: { man: 0, pin: 0, sou: 0 } });
      assert.equal(none.filter(function (t) { return t.isRed; }).length, 0);
    });

    it('赤5筒2枚の設定に対応する', function () {
      const two = MJ.tiles.createTileSet({ redDora: { man: 1, pin: 2, sou: 1 } });
      assert.equal(two.filter(function (t) { return t.isRed && t.suit === 'pin'; }).length, 2);
    });

    it('表示名が正しい', function () {
      const find = function (code) { return set.find(function (t) { return t.code === code; }); };
      assert.equal(find('1m').displayName, '一萬');
      assert.equal(find('9p').displayName, '九筒');
      assert.equal(find('1z').displayName, '東');
      assert.equal(find('7z').displayName, '中');
    });
  });

  describe('牌の文字列表記', function () {
    it('"123m0p11z" を解析できる', function () {
      const specs = MJ.tiles.parse('123m0p11z');
      assert.equal(specs.length, 6);
      assert.equal(specs[3].rank, 5);
      assert.equal(specs[3].isRed, true);
      assert.equal(specs[4].kind, 27);
    });

    it('空白を無視する', function () { assert.equal(MJ.tiles.parse(' 12m 3p ').length, 3); });

    it('不正な形式は例外', function () { assert.throws(function () { MJ.tiles.parse('12x'); }, /形式/); });
    it('字牌の8は例外', function () { assert.throws(function () { MJ.tiles.parse('8z'); }, /字牌/); });
    it('字牌の赤は例外', function () { assert.throws(function () { MJ.tiles.parse('0z'); }, /赤/); });

    it('toString と parse が往復する', function () {
      const text = '123406m789p11z';
      assert.equal(MJ.tiles.toString(MJ.tiles.parse(text)), text);
    });
  });

  describe('ドラ表示牌', function () {
    const k = MJ.tiles.kindOf;
    const d = MJ.tiles.doraKindFromIndicator;
    it('数牌は次の数字', function () { assert.equal(d(k('man', 3)), k('man', 4)); });
    it('9 の次は 1', function () { assert.equal(d(k('pin', 9)), k('pin', 1)); });
    it('北 の次は 東', function () { assert.equal(d(k('honor', 4)), k('honor', 1)); });
    it('東 の次は 南', function () { assert.equal(d(k('honor', 1)), k('honor', 2)); });
    it('中 の次は 白', function () { assert.equal(d(k('honor', 7)), k('honor', 5)); });
    it('白 の次は 發', function () { assert.equal(d(k('honor', 5)), k('honor', 6)); });
  });

  describe('整列', function () {
    it('萬子→筒子→索子→字牌、数字順に並ぶ', function () {
      const w = MJ.wall.build({ seed: 42, presetHand: '7z1s9p5m1m2z3p' + '999s111m' + '9m' });
      const sorted = MJ.handSorter.sort(w.initialHand);
      assert.equal(MJ.tiles.toString(sorted), '111159m39p1999s27z');
      assert.ok(MJ.handSorter.isSorted(sorted));
    });

    it('赤5は通常の5の後ろに並ぶ', function () {
      const w = MJ.wall.build({ seed: 1, presetHand: '0m5m1234m6789m111z' });
      assert.equal(MJ.tiles.toString(MJ.handSorter.sort(w.initialHand)), '1234506789m111z');
    });

    it('元の配列を変更しない', function () {
      const w = MJ.wall.build({ seed: 3 });
      const before = w.initialHand.map(function (t) { return t.id; }).join();
      MJ.handSorter.sort(w.initialHand);
      assert.equal(w.initialHand.map(function (t) { return t.id; }).join(), before);
    });
  });

  describe('牌山', function () {
    it('配牌13枚・王牌14枚・ツモ山109枚で合計136枚', function () {
      const w = MJ.wall.build({ seed: 7 });
      assert.equal(w.initialHand.length, 13);
      assert.equal(w.dead.length, 14);
      assert.equal(w.live.length, 109);
      const all = w.initialHand.concat(w.dead, w.live);
      assert.equal(new Set(all.map(function (t) { return t.id; })).size, 136);
    });

    it('同じシードなら同じ牌山になる', function () {
      const a = MJ.wall.build({ seed: 'test-seed' });
      const b = MJ.wall.build({ seed: 'test-seed' });
      assert.equal(a.live.map(function (t) { return t.id; }).join(), b.live.map(function (t) { return t.id; }).join());
    });

    it('異なるシードなら異なる牌山になる', function () {
      const a = MJ.wall.build({ seed: 1 });
      const b = MJ.wall.build({ seed: 2 });
      assert.ok(a.live.map(function (t) { return t.id; }).join() !== b.live.map(function (t) { return t.id; }).join());
    });

    it('ドラ表示牌は王牌の中にある', function () {
      const w = MJ.wall.build({ seed: 9 });
      assert.ok(w.dead.indexOf(w.doraIndicators[0]) >= 0);
    });

    it('固定配牌を指定できる', function () {
      const w = MJ.wall.build({ seed: 5, presetHand: '123m456p789s1122z' });
      assert.equal(MJ.tiles.toString(w.initialHand), '123m456p789s1122z');
      assert.equal(w.live.length + w.dead.length + w.initialHand.length, 136);
    });

    it('ツモ順を固定できる', function () {
      const w = MJ.wall.build({ seed: 5, presetHand: '123m456p789s1122z', fixedDraws: '5z0m' });
      assert.equal(w.live[0].code, '5z');
      assert.equal(w.live[1].code, '5m');
      assert.equal(w.live[1].isRed, true);
    });

    it('5枚目の牌を指定すると例外', function () {
      assert.throws(function () { MJ.wall.build({ presetHand: '11111m23456789p' }); }, /足りません/);
    });

    it('赤ドラ設定時は通常の5を4枚指定できない', function () {
      assert.throws(function () { MJ.wall.build({ presetHand: '5555m123456789p' }); }, /足りません/);
    });

    it('13枚・14枚以外の手牌は例外', function () {
      assert.throws(function () { MJ.wall.build({ presetHand: '123m' }); }, /13枚または14枚/);
    });
  });
})();
