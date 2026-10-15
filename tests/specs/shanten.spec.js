/* シャンテン数・受入のテスト */
(function () {
  'use strict';
  const describe = MJTest.describe, it = MJTest.it, assert = MJTest.assert;
  const S = MJ.shanten;
  const counts = function (text) { return S.countsOf(MJ.tiles.parse(text)); };

  describe('シャンテン数：通常形', function () {
    it('和了形は -1', function () { assert.equal(S.fromString('123m456p789s11122z'), -1); });
    it('雀頭と順子が重なる和了形（11＋123）', function () { assert.equal(S.fromString('11123m456p789s555z'), -1); });
    it('聴牌（単騎）は 0', function () { assert.equal(S.fromString('123m456p789s1112z'), 0); });
    it('聴牌（両面）は 0', function () { assert.equal(S.fromString('23m456p789s11122z'), 0); });
    it('一向聴', function () { assert.equal(S.fromString('23m456p78s11z5552s'), 1); });
    it('二向聴（1面子・嵌張3つ・雀頭）', function () { assert.equal(S.fromString('139m46p79s123p11z5z'), 2); });
    it('ばらばらの手（13枚）', function () {
      const d = S.detail(counts('147m258p369s1234z'));
      assert.equal(d.normal, 8, '通常形');
      assert.equal(d.chiitoitsu, 6, '七対子');
      assert.equal(d.kokushi, 7, '国士無双');
      assert.equal(d.shanten, 6);
    });
    it('九蓮宝燈形は聴牌', function () { assert.equal(S.fromString('1112345678999m'), 0); });
    it('14枚の一向聴（打牌前）', function () { assert.equal(S.fromString('23456m78p345678s4z'), 1); });
    it('面子過多（5面子分の牌）でも 4面子として数える', function () {
      assert.equal(S.normal(counts('123456789m123p11z')), -1);
    });
    it('副露1回（10枚）の聴牌', function () { assert.equal(S.calc(counts('456p789s1112z'), { meldCount: 1 }), 0); });
    it('副露3回（5枚）の和了', function () { assert.equal(S.calc(counts('555m11z'), { meldCount: 3 }), -1); });
    it('副露3回（4枚）のシャンポン聴牌', function () { assert.equal(S.calc(counts('55m55z'), { meldCount: 3 }), 0); });
  });

  describe('シャンテン数：七対子', function () {
    it('6対子＋1枚は聴牌', function () { assert.equal(S.chiitoitsu(counts('1122m3344p5566s7z')), 0); });
    it('7対子は和了', function () { assert.equal(S.fromString('1122m3344p5566s77z'), -1); });
    it('同じ牌4枚は1対子と数え、種類不足も加味する', function () {
      // 対子5組（1萬・3筒・4筒・5索・6索）、種類6 → 6 - 5 + (7 - 6) = 2
      assert.equal(S.chiitoitsu(counts('1111m3344p5566s7z')), 2);
    });
    it('副露があると七対子は対象外', function () {
      assert.equal(S.detail(counts('1122m3344p5s'), { meldCount: 1 }).chiitoitsu, Infinity);
    });
  });

  describe('シャンテン数：国士無双', function () {
    it('13種13枚は聴牌（13面待ち）', function () { assert.equal(S.fromString('19m19p19s1234567z'), 0); });
    it('13種＋対子は和了', function () { assert.equal(S.fromString('19m19p19s1234567z1m'), -1); });
    it('12種＋中張牌は一向聴', function () { assert.equal(S.kokushi(counts('19m19p19s123456z5m')), 1); });
    it('12種＋対子は聴牌', function () { assert.equal(S.kokushi(counts('119m19p19s123456z')), 0); });
  });

  describe('受入', function () {
    it('両面待ちの受入は2種8枚', function () {
      const u = MJ.ukeire.ukeire(counts('23m456p789s11122z'));
      assert.deepEqual(u.tiles.map(function (t) { return t.code; }), ['1m', '4m']);
      assert.equal(u.count, 8);
    });
    it('手の内の牌は残り枚数から引かれる', function () {
      const u = MJ.ukeire.ukeire(counts('34m456p789s1114m2z'));
      // 34m+4m：待ちは 2m（4枚）と 5m（4枚）だが、単騎2z（3枚）も聴牌に含まれる
      const found = {};
      u.tiles.forEach(function (t) { found[t.code] = t.remaining; });
      assert.equal(found['2z'], 3);
    });
    it('見えている牌（河・ドラ表示）を残り枚数から引く', function () {
      const c = counts('23m456p789s11122z');
      const seen = MJ.ukeire.addCounts(c, counts('1m1m4m'));
      const u = MJ.ukeire.ukeire(c, seen);
      assert.equal(u.count, 5);
    });
    it('残り0枚の待ちは受入0枚（種類には含める）', function () {
      const c = counts('23m456p789s11122z');
      const seen = MJ.ukeire.addCounts(c, counts('1111m4444m'));
      const u = MJ.ukeire.ukeire(c, seen);
      assert.equal(u.tiles.length, 2);
      assert.equal(u.count, 0);
    });
    it('九蓮宝燈の受入は9種', function () {
      assert.equal(MJ.ukeire.ukeire(counts('1112345678999m')).tiles.length, 9);
    });
    it('国士無双13面待ちの受入は13種', function () {
      assert.equal(MJ.ukeire.ukeire(counts('19m19p19s1234567z')).tiles.length, 13);
    });
    it('打牌候補はシャンテン数→受入枚数の順に並ぶ', function () {
      const r = MJ.ukeire.analyze(counts('23456m78p345678s4z'));
      assert.equal(r[0].code, '4z');
      assert.equal(r[0].ukeireCount, 37);
      for (let i = 1; i < r.length; i++) {
        assert.ok(r[i - 1].shanten < r[i].shanten ||
          (r[i - 1].shanten === r[i].shanten && r[i - 1].ukeireCount >= r[i].ukeireCount), '並び順 ' + i);
      }
    });
    it('14枚の各種類を1回ずつ評価する', function () {
      const r = MJ.ukeire.analyze(counts('1199m44p66p3s55s77s7z'));
      assert.equal(r.length, 8);
    });
  });
})();
