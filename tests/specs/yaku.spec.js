/* 役判定のテスト（既定：子・ロン・東場・南家・ドラなし） */
(function () {
  'use strict';
  const describe = MJTest.describe, it = MJTest.it, assert = MJTest.assert;
  const H = MJTestHelpers;
  const names = function (hand, w, opts) { return H.yakuNames(H.win(hand, w, opts)); };

  describe('役：1翻', function () {
    it('門前清自摸和', function () { assert.deepEqual(names('123m456p789s24s99p', '3s', { isTsumo: true }), ['門前清自摸和']); });
    it('立直（状況フラグ）', function () { assert.deepEqual(names('123m456p789s24s99p', '3s', { riichi: true }), ['立直']); });
    it('立直＋一発', function () { assert.deepEqual(names('123m456p789s24s99p', '3s', { riichi: true, ippatsu: true }), ['一発', '立直']); });
    it('一発は立直なしでは付かない', function () { assert.equal(H.win('123m456p789s24s99p', '3s', { ippatsu: true }).ok, false); });
    it('役牌 白（明刻・双碰ロン）', function () { assert.deepEqual(names('123m456p789s55z11p', '5z'), ['役牌 白']); });
    it('場風と自風（南場の南家は連風牌で2翻）', function () {
      const r = H.win('123m456p789s22z11p', '2z', { roundWind: 'south', seatWind: 'south' });
      assert.deepEqual(H.yakuNames(r), ['場風', '自風']);
      assert.equal(r.han, 2);
    });
    it('オタ風の刻子は役にならない', function () { assert.equal(H.win('123m456p789s44z11p', '4z').ok, false); });
    it('断么九', function () { assert.deepEqual(names('234m456p678s24s88p', '3s'), ['断么九']); });
    it('平和（両面・順子のみ・役牌でない雀頭）', function () { assert.deepEqual(names('234m567p345s23s99p', '4s'), ['平和']); });
    it('雀頭が役牌なら平和にならない', function () { assert.equal(H.win('234m567p345s23s55z', '4s').ok, false); });
    it('嵌張では平和にならない', function () { assert.equal(H.win('234m567p345s13s99p', '2s').ok, false); });
    it('一盃口', function () { assert.deepEqual(names('223344m567p78s99p', '6s'), ['一盃口', '平和']); });
    it('海底摸月', function () { assert.deepEqual(names('123m456p789s24s99p', '3s', { isTsumo: true, haitei: true }), ['海底摸月', '門前清自摸和']); });
    it('河底撈魚', function () { assert.deepEqual(names('123m456p789s24s99p', '3s', { houtei: true }), ['河底撈魚']); });
    it('嶺上開花（海底とは複合しない）', function () {
      assert.deepEqual(names('123m456p789s24s99p', '3s', { isTsumo: true, rinshan: true, haitei: true }), ['嶺上開花', '門前清自摸和']);
    });
    it('槍槓', function () { assert.deepEqual(names('123m456p789s24s99p', '3s', { chankan: true }), ['槍槓']); });
  });

  describe('役：2翻以上', function () {
    it('七対子', function () { assert.deepEqual(names('1122m3344p5566s7z', '7z'), ['七対子']); });
    it('七対子＋断么九', function () { assert.deepEqual(names('2233m4455p6677s8p', '8p'), ['七対子', '断么九']); });
    it('対々和＋三暗刻（双碰ロンの刻子は暗刻に数えない）', function () {
      assert.deepEqual(names('222m555p888s99s44z', '4z'), ['三暗刻', '対々和']);
    });
    it('三色同順', function () { assert.deepEqual(names('123m123p12s456m77z', '3s'), ['三色同順']); });
    it('一気通貫＋平和', function () { assert.deepEqual(names('123456789p23m55s', '1m'), ['一気通貫', '平和']); });
    it('混全帯么九', function () { assert.deepEqual(names('123m789p999s11z12s', '3s'), ['混全帯么九']); });
    it('純全帯么九＋平和（混全帯么九は外れる）', function () { assert.deepEqual(names('123m789m123p78s99p', '9s'), ['平和', '純全帯么九']); });
    it('小三元（役牌2つも付く）', function () {
      assert.deepEqual(names('555z666z77z234m67p', '8p'), ['小三元', '役牌 發', '役牌 白']);
    });
    it('混一色＋一気通貫＋場風', function () {
      assert.deepEqual(names('123s456s789s11z22z', '1z'), ['一気通貫', '場風', '混一色']);
    });
    it('清一色＋一気通貫（混一色は付かない）', function () {
      const n = names('12345678923m55m', '4m');
      assert.ok(n.indexOf('清一色') >= 0 && n.indexOf('一気通貫') >= 0 && n.indexOf('混一色') < 0, n.join(','));
    });
  });

  describe('役満', function () {
    it('国士無双', function () { assert.deepEqual(names('19m19p19s1234567z', '1m'), ['国士無双']); });
    it('四暗刻（ツモ）', function () { assert.deepEqual(names('222m555p888s99s44z', '4z', { isTsumo: true }), ['四暗刻']); });
    it('四暗刻単騎（ロン）', function () { assert.deepEqual(names('222m555p888s444z9s', '9s'), ['四暗刻']); });
    it('大三元', function () { assert.deepEqual(names('555z666z77z123m44p', '7z'), ['大三元']); });
    it('役満があれば他の役は数えない', function () {
      const r = H.win('555z666z77z123m44p', '7z', { isTsumo: true });
      assert.equal(r.yaku.length, 1);
      assert.equal(r.yakuman, 1);
    });
  });

  describe('門前・副露による違い', function () {
    const meld = [{ type: 'shuntsu', kind: MJTestHelpers.kind('2m'), concealed: false }];
    it('喰いタン：副露していても断么九1翻', function () {
      const r = H.win('456p678s24s88p', '3s', { melds: meld });
      assert.deepEqual(H.yakuNames(r), ['断么九']);
      assert.equal(r.han, 1);
    });
    it('喰いタンなしのルールでは役なし', function () {
      assert.equal(H.win('456p678s24s88p', '3s', { melds: meld, kuitan: false }).ok, false);
    });
    it('食い下がり：副露した混一色は2翻', function () {
      const r = H.win('456s789s11z22z', '1z', { melds: [{ type: 'shuntsu', kind: MJTestHelpers.kind('1s'), concealed: false }] });
      const hon = r.yaku.find(function (y) { return y.name === '混一色'; });
      assert.equal(hon.han, 2);
      assert.equal(r.yaku.find(function (y) { return y.name === '一気通貫'; }).han, 1);
    });
    it('副露すると平和・一盃口・門前清自摸和は付かない', function () {
      const r = H.win('567p345s23s99p', '4s', { melds: [{ type: 'shuntsu', kind: MJTestHelpers.kind('2m'), concealed: false }], isTsumo: true });
      assert.equal(r.ok, false);
    });
    it('役なし（嵌張・么九牌あり・ロン）は和了できない', function () {
      const r = H.win('123m456p789s24s99p', '3s');
      assert.equal(r.ok, false);
      assert.equal(r.reason, '役がありません');
    });
    it('ドラだけでは和了できない', function () {
      const r = H.win('123m456p789s24s99p', '3s', { doraKinds: [MJTestHelpers.kind('9p')] });
      assert.equal(r.ok, false);
    });
  });
})();
