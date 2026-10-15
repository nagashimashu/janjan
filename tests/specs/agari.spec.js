/* 和了形の判定・分解・待ちのテスト */
(function () {
  'use strict';
  const describe = MJTest.describe, it = MJTest.it, assert = MJTest.assert;
  const A = MJ.agari;
  const H = MJTestHelpers;
  const counts = function (t) { return MJ.shanten.countsOf(MJ.tiles.parse(t)); };
  const waitsOf = function (t) { return A.waits(counts(t)).map(MJ.tiles.kindToCode); };
  const interp = function (hand, w, isTsumo) { return A.interpretations(counts(hand + w), H.kind(w), { isTsumo: !!isTsumo }); };

  describe('和了形の判定', function () {
    it('通常形（4面子1雀頭）', function () { assert.ok(A.isAgari(counts('123m456p789s11122z'))); });
    it('七対子', function () { assert.ok(A.isAgari(counts('1122m3344p5566s77z'))); });
    it('国士無双', function () { assert.ok(A.isAgari(counts('19m19p19s1234567z1m'))); });
    it('聴牌形は和了ではない', function () { assert.equal(A.isAgari(counts('123m456p789s1112z3z')), false); });
    it('同じ牌4枚を含む七対子形は和了ではない', function () { assert.equal(A.isAgari(counts('1111m3344p5566s77z')), false); });
    it('副露1回（11枚）の和了', function () { assert.ok(A.isAgari(counts('456p789s11122z'), 1)); });
  });

  describe('手の分解', function () {
    it('一通りの分解', function () {
      const d = A.decompose(counts('123m456p789s11122z'));
      assert.equal(d.length, 1);
      assert.equal(d[0].pair, H.kind('2z'));
    });
    it('111222333 は「刻子3つ」と「順子3つ」の両方に分解できる', function () {
      const d = A.decompose(counts('111222333m456p77s'));
      assert.equal(d.length, 2);
    });
    it('雀頭の候補が複数ある形', function () {
      const d = A.decompose(counts('11123m456p789s55z'.replace('55z', '555z')));
      assert.ok(d.some(function (x) { return x.pair === H.kind('1m'); }));
    });
  });

  describe('待ちの形', function () {
    function waitTypes(hand, w) { return interp(hand, w).map(function (i) { return i.wait; }).sort(); }
    it('両面（23 で 1・4）', function () { assert.deepEqual(waitTypes('23m456p789s11122z', '4m'), ['ryanmen']); });
    it('78 で 9 も両面', function () { assert.deepEqual(waitTypes('123m456p78s11122z', '9s'), ['ryanmen']); });
    it('嵌張（13 で 2）', function () { assert.deepEqual(waitTypes('13m456p789s11122z', '2m'), ['kanchan']); });
    it('辺張（12 で 3）', function () { assert.deepEqual(waitTypes('12m456p789s11122z', '3m'), ['penchan']); });
    it('辺張（89 で 7）', function () { assert.deepEqual(waitTypes('89m456p789s11122z', '7m'), ['penchan']); });
    it('双碰', function () { assert.deepEqual(waitTypes('123m456p789s1122z', '1z'), ['shanpon']); });
    it('単騎', function () { assert.deepEqual(waitTypes('123m456p789s1112z', '2z'), ['tanki']); });
    it('複数の解釈：34 5 で 345 の両面と 3 単騎を含む形', function () {
      const ws = waitTypes('3455m456p789s111z', '5m');
      assert.ok(ws.indexOf('ryanmen') >= 0 || ws.indexOf('shanpon') >= 0, ws.join(','));
      assert.ok(ws.length >= 2, ws.join(','));
    });
    it('ロンで完成した刻子は明刻（ツモなら暗刻）', function () {
      const ron = interp('123m456p789s1122z', '1z', false)[0];
      const tsumo = interp('123m456p789s1122z', '1z', true)[0];
      const g = function (i) { return i.groups.find(function (x) { return x.kind === H.kind('1z'); }); };
      assert.equal(g(ron).concealed, false);
      assert.equal(g(tsumo).concealed, true);
    });
    it('国士無双13面待ちを区別する', function () {
      assert.equal(interp('19m19p19s1234567z', '1m')[0].wait, 'kokushi13');
      assert.equal(interp('119m19p19s123456z', '7z')[0].wait, 'tanki');
    });
  });

  describe('待ち牌（テンパイ・フリテン判定用）', function () {
    it('両面待ち', function () { assert.deepEqual(waitsOf('23m456p789s11122z'), ['1m', '4m']); });
    it('九蓮宝燈形は9面待ち', function () { assert.equal(waitsOf('1112345678999m').length, 9); });
    it('国士無双13面待ち', function () { assert.equal(waitsOf('19m19p19s1234567z').length, 13); });
    it('七対子の単騎待ち', function () { assert.deepEqual(waitsOf('1122m3344p5566s7z'), ['7z']); });
    it('ノーテンなら待ちなし', function () { assert.deepEqual(waitsOf('147m258p369s1234z'), []); });
  });
})();
