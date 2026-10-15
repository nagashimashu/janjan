/* 符・点数計算のテスト（点数早見表と照合） */
(function () {
  'use strict';
  const describe = MJTest.describe, it = MJTest.it, assert = MJTest.assert;
  const S = MJ.scoring;
  const H = MJTestHelpers;

  function pay(fu, han, dealer, tsumo) {
    return S.payments(S.basePoints(han, fu, 0).base, dealer, tsumo);
  }

  describe('点数早見表', function () {
    it('子ロン 30符1翻 1,000', function () { assert.equal(pay(30, 1, false, false).ron, 1000); });
    it('子ロン 30符2翻 2,000', function () { assert.equal(pay(30, 2, false, false).ron, 2000); });
    it('子ロン 30符3翻 3,900', function () { assert.equal(pay(30, 3, false, false).ron, 3900); });
    it('子ロン 30符4翻 7,700（切り上げ満貫なし）', function () { assert.equal(pay(30, 4, false, false).ron, 7700); });
    it('子ロン 40符3翻 5,200', function () { assert.equal(pay(40, 3, false, false).ron, 5200); });
    it('子ロン 40符4翻 は満貫 8,000', function () { assert.equal(pay(40, 4, false, false).ron, 8000); });
    it('子ロン 25符2翻 1,600', function () { assert.equal(pay(25, 2, false, false).ron, 1600); });
    it('子ロン 110符1翻 3,600', function () { assert.equal(pay(110, 1, false, false).ron, 3600); });
    it('親ロン 30符1翻 1,500', function () { assert.equal(pay(30, 1, true, false).ron, 1500); });
    it('親ロン 30符4翻 11,600', function () { assert.equal(pay(30, 4, true, false).ron, 11600); });
    it('子ツモ 30符1翻 300・500', function () {
      const p = pay(30, 1, false, true);
      assert.deepEqual([p.tsumoChild, p.tsumoDealer], [300, 500]);
    });
    it('子ツモ 20符2翻 400・700', function () {
      const p = pay(20, 2, false, true);
      assert.deepEqual([p.tsumoChild, p.tsumoDealer], [400, 700]);
    });
    it('子ツモ 30符3翻 1,000・2,000', function () {
      const p = pay(30, 3, false, true);
      assert.deepEqual([p.tsumoChild, p.tsumoDealer], [1000, 2000]);
    });
    it('親ツモ 20符2翻 700オール', function () { assert.equal(pay(20, 2, true, true).tsumoChild, 700); });
    it('親ツモ 30符3翻 2,000オール', function () { assert.equal(pay(30, 3, true, true).tsumoChild, 2000); });
    it('満貫：子8,000／親12,000／子ツモ2,000・4,000／親ツモ4,000オール', function () {
      assert.equal(pay(30, 5, false, false).ron, 8000);
      assert.equal(pay(30, 5, true, false).ron, 12000);
      assert.deepEqual([pay(30, 5, false, true).tsumoChild, pay(30, 5, false, true).tsumoDealer], [2000, 4000]);
      assert.equal(pay(30, 5, true, true).tsumoChild, 4000);
    });
    it('跳満・倍満・三倍満・数え役満（子ロン）', function () {
      assert.equal(pay(30, 6, false, false).ron, 12000);
      assert.equal(pay(30, 7, false, false).ron, 12000);
      assert.equal(pay(30, 8, false, false).ron, 16000);
      assert.equal(pay(30, 11, false, false).ron, 24000);
      assert.equal(pay(30, 13, false, false).ron, 32000);
    });
    it('役満：子32,000／親48,000', function () {
      assert.equal(S.payments(S.basePoints(13, 0, 1).base, false, false).ron, 32000);
      assert.equal(S.payments(S.basePoints(13, 0, 1).base, true, false).ron, 48000);
    });
    it('満貫以上の名前', function () {
      assert.equal(S.basePoints(5, 30, 0).label, '満貫');
      assert.equal(S.basePoints(4, 40, 0).label, '満貫');
      assert.equal(S.basePoints(6, 30, 0).label, '跳満');
      assert.equal(S.basePoints(9, 30, 0).label, '倍満');
      assert.equal(S.basePoints(12, 30, 0).label, '三倍満');
      assert.equal(S.basePoints(14, 30, 0).label, '数え役満');
      assert.equal(S.basePoints(3, 30, 0).label, '');
    });
  });

  describe('符計算', function () {
    it('平和ツモは20符', function () { assert.equal(H.win('234m567p345s23s99p', '4s', { isTsumo: true }).fu, 20); });
    it('平和ロンは30符', function () { assert.equal(H.win('234m567p345s23s99p', '4s').fu, 30); });
    it('七対子は25符', function () { assert.equal(H.win('1122m3344p5566s7z', '7z').fu, 25); });
    it('明刻（么九牌）4符：20＋10＋4＝34→40符', function () { assert.equal(H.win('123m456p789s55z11p', '5z').fu, 40); });
    it('暗刻（么九牌）8符＋役牌の雀頭2符＋辺張2符：20＋10＋8＋2＋2＝42→50符', function () {
      assert.equal(H.win('123m789p999s11z12s', '3s').fu, 50);
    });
    it('ツモ2符と嵌張2符：20＋2＋2＝24→30符', function () { assert.equal(H.win('123m456p789s24s99p', '3s', { isTsumo: true }).fu, 30); });
    it('連風牌の雀頭は4符', function () {
      const r = H.win('234m567p345s66s11z', '6s', { isTsumo: true, seatWind: 'east', roundWind: 'east' });
      assert.ok(r.fuParts.some(function (p) { return p.label === '自風の雀頭'; }) && r.fuParts.some(function (p) { return p.label === '場風の雀頭'; }));
    });
    it('喰い平和形のロンは30符', function () {
      const r = H.win('456p678s23s88p', '4s', { melds: [{ type: 'shuntsu', kind: H.kind('2m'), concealed: false }] });
      assert.equal(r.fu, 30);
    });
    it('高い解釈を採用する（平和ツモ 400・700 ＞ 嵌張ツモ 300・500）', function () {
      const r = H.win('234m567p345s23s99p', '4s', { isTsumo: true });
      assert.equal(r.interp.wait, 'ryanmen');
      assert.equal(r.payments.total, 1500);
    });
  });

  describe('和了の点数（手牌から）', function () {
    it('平和ツモ（子）400・700', function () {
      const r = H.win('234m567p345s23s99p', '4s', { isTsumo: true });
      assert.deepEqual([r.han, r.fu, r.payments.tsumoChild, r.payments.tsumoDealer], [2, 20, 400, 700]);
    });
    it('平和・断么九 子ロン 2,000／親ロン 2,900', function () {
      assert.equal(H.win('234m567p345s23s66p', '4s').payments.ron, 2000);
      assert.equal(H.win('234m567p345s23s66p', '4s', { isDealer: true }).payments.ron, 2900);
    });
    it('役牌のみ 40符1翻 子ロン 1,300', function () { assert.equal(H.win('123m456p789s55z11p', '5z').payments.ron, 1300); });
    it('七対子 子ロン 1,600、断么九つき 3,200', function () {
      assert.equal(H.win('1122m3344p5566s7z', '7z').payments.ron, 1600);
      assert.equal(H.win('2233m4455p6677s8p', '8p').payments.ron, 3200);
    });
    it('一盃口・平和・断么九 3翻30符 3,900', function () { assert.equal(H.win('223344m567p66s78s', '6s').payments.ron, 3900); });
    it('三色同順 40符2翻 2,600', function () { assert.equal(H.win('123m123p12s456m77z', '3s').payments.ron, 2600); });
    it('純全帯么九・平和 30符4翻 7,700', function () { assert.equal(H.win('123m789m123p78s99p', '9s').payments.ron, 7700); });
    it('小三元＋役牌2つ 50符4翻 → 満貫 8,000', function () {
      const r = H.win('555z666z77z234m67p', '8p');
      assert.equal(r.label, '満貫');
      assert.equal(r.payments.ron, 8000);
    });
    it('混一色＋一気通貫＋場風 6翻 → 跳満 12,000', function () {
      const r = H.win('123s456s789s11z22z', '1z');
      assert.equal(r.han, 6);
      assert.equal(r.payments.ron, 12000);
    });
    it('清一色＋一気通貫＋平和 9翻 → 倍満 16,000', function () {
      assert.equal(H.win('12345678923m55m', '4m').payments.ron, 16000);
    });
    it('清一色のみ 6翻 → 跳満 12,000（九蓮宝燈は未実装）', function () {
      assert.equal(H.win('1112345678999m', '5m').payments.ron, 12000);
    });
    it('対々和・三暗刻・場風 5翻 → 満貫 8,000', function () {
      assert.equal(H.win('222m555p888s99s11z', '1z').payments.ron, 8000);
    });
    it('四暗刻ツモ（子）8,000・16,000', function () {
      const r = H.win('222m555p888s99s11z', '1z', { isTsumo: true });
      assert.deepEqual([r.payments.tsumoChild, r.payments.tsumoDealer], [8000, 16000]);
    });
    it('国士無双 親ロン 48,000', function () { assert.equal(H.win('19m19p19s1234567z', '1m', { isDealer: true }).payments.ron, 48000); });
    it('大三元 子ロン 32,000', function () { assert.equal(H.win('555z666z77z123m44p', '7z').payments.ron, 32000); });
  });

  describe('ドラ・赤ドラ・裏ドラ', function () {
    it('ドラは枚数分の翻を加える', function () {
      const r = H.win('234m567p345s23s99p', '4s', { doraKinds: [H.kind('9p')] });
      assert.equal(r.dora.dora, 2);
      assert.equal(r.han, 3);
    });
    it('赤ドラ（和了牌が赤でも数える）', function () {
      const r = H.win('234m067p345s23s99p', '4s');
      assert.equal(r.dora.aka, 1);
      assert.equal(r.han, 2);
    });
    it('裏ドラは立直のときだけ数える', function () {
      assert.equal(H.win('234m567p345s23s99p', '4s', { uraDoraKinds: [H.kind('9p')] }).dora.ura, 0);
      assert.equal(H.win('234m567p345s23s99p', '4s', { riichi: true, uraDoraKinds: [H.kind('9p')] }).dora.ura, 2);
    });
    it('役満ではドラを数えない', function () {
      const r = H.win('555z666z77z123m44p', '7z', { doraKinds: [H.kind('4p')] });
      assert.equal(r.dora.dora, 0);
    });
  });

  describe('点数移動（本場・供託）', function () {
    const ron2000 = H.win('234m567p345s23s66p', '4s');
    it('ロン：放銃者だけが支払う', function () {
      assert.deepEqual(S.settle(ron2000, { winner: 0, loser: 2, dealer: 1 }), [2000, 0, -2000, 0]);
    });
    it('ロン：本場は1本につき300点', function () {
      assert.deepEqual(S.settle(ron2000, { winner: 0, loser: 2, dealer: 1, honba: 2 }), [2600, 0, -2600, 0]);
    });
    it('ツモ（子）：親が多く払う。本場は1人100点ずつ', function () {
      const r = H.win('234m567p345s23s99p', '4s', { isTsumo: true });
      assert.deepEqual(S.settle(r, { winner: 0, loser: null, dealer: 1, honba: 1 }), [1800, -800, -500, -500]);
    });
    it('ツモ（親）：子が同額を払う', function () {
      const r = H.win('234m567p345s23s99p', '4s', { isTsumo: true, isDealer: true });
      assert.deepEqual(S.settle(r, { winner: 1, loser: null, dealer: 1 }), [-700, 2100, -700, -700]);
    });
    it('供託は和了者が受け取る', function () {
      assert.deepEqual(S.settle(ron2000, { winner: 3, loser: 0, dealer: 0, riichiSticks: 2 }), [-2000, 0, 0, 4000]);
    });
    it('点数移動の合計は供託分だけ増える', function () {
      const d = S.settle(ron2000, { winner: 3, loser: 0, dealer: 0, honba: 3, riichiSticks: 1 });
      assert.equal(d.reduce(function (a, b) { return a + b; }, 0), 1000);
    });
  });

  describe('表示', function () {
    it('子ロン 30符2翻', function () {
      const d = S.describe(H.win('234m567p345s23s66p', '4s'));
      assert.equal(d.head, '30符2翻');
      assert.equal(d.points, '2,000点');
    });
    it('子ツモは「子・親」の順', function () { assert.equal(S.describe(H.win('234m567p345s23s99p', '4s', { isTsumo: true })).points, '400・700点'); });
    it('親ツモは「オール」', function () { assert.equal(S.describe(H.win('234m567p345s23s99p', '4s', { isTsumo: true, isDealer: true })).points, '700点オール'); });
    it('満貫以上は名前', function () { assert.equal(S.describe(H.win('123s456s789s11z22z', '1z')).head, '跳満'); });
  });
})();
