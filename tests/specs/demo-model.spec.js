/* 牌操作デモの進行（配牌・ツモ・打牌・流局）のテスト */
(function () {
  'use strict';
  const describe = MJTest.describe, it = MJTest.it, assert = MJTest.assert;
  const M = MJ.demoModel;

  describe('牌操作デモの進行', function () {
    it('配牌後は13枚・ツモ牌なし', function () {
      const s = M.create({ seed: 11 });
      assert.equal(M.tileCount(s), 13);
      assert.equal(s.drawn, null);
      assert.ok(MJ.handSorter.isSorted(s.hand));
    });

    it('14枚の固定配牌では最後の1枚がツモ牌になる', function () {
      const s = M.create({ seed: 1, presetHand: '123m456p789s11222z' });
      assert.equal(M.tileCount(s), 14);
      assert.equal(s.drawn.code, '2z');
    });

    it('ツモで14枚になり、山が1枚減る', function () {
      const s = M.create({ seed: 11 });
      const before = s.wall.live.length;
      const r = M.draw(s);
      assert.ok(r.ok);
      assert.equal(M.tileCount(s), 14);
      assert.equal(s.wall.live.length, before - 1);
      assert.equal(s.turn, 1);
    });

    it('14枚のときはツモできない', function () {
      const s = M.create({ seed: 11 });
      M.draw(s);
      assert.equal(M.draw(s).ok, false);
    });

    it('13枚のときは打牌できない', function () {
      const s = M.create({ seed: 11 });
      const r = M.discard(s, s.hand[0].id);
      assert.equal(r.ok, false);
      assert.equal(s.river.length, 0);
    });

    it('ツモ切りは tsumogiri=true として河に記録される', function () {
      const s = M.create({ seed: 1, presetHand: '123m456p789s1122z', fixedDraws: '7z' });
      M.draw(s);
      const r = M.discard(s, s.drawn.id);
      assert.ok(r.ok);
      assert.equal(r.tsumogiri, true);
      assert.equal(s.river[0].tile.code, '7z');
      assert.equal(M.tileCount(s), 13);
    });

    it('手出し後はツモ牌が手牌に入り、整列される', function () {
      const s = M.create({ seed: 1, presetHand: '123m456p789s1122z', fixedDraws: '4m' });
      M.draw(s);
      const target = s.hand.find(function (t) { return t.code === '1z'; });
      const r = M.discard(s, target.id);
      assert.ok(r.ok);
      assert.equal(r.tsumogiri, false);
      assert.equal(s.drawn, null);
      assert.equal(M.tileCount(s), 13);
      assert.equal(MJ.tiles.toString(s.hand), '1234m456p789s122z');
    });

    it('自動整列オフでは手出し後のツモ牌が右端に入る', function () {
      const s = M.create({ seed: 1, presetHand: '123m456p789s1122z', fixedDraws: '4m', autoSort: false });
      M.draw(s);
      M.discard(s, s.hand[0].id, { autoSort: false });
      assert.equal(s.hand[s.hand.length - 1].code, '4m');
    });

    it('手牌に無い牌は打牌できない', function () {
      const s = M.create({ seed: 2 });
      M.draw(s);
      assert.equal(M.discard(s, 'no-such-id').ok, false);
    });

    it('全体の牌数は常に136枚を保つ', function () {
      const s = M.create({ seed: 99 });
      for (let i = 0; i < 20; i++) {
        M.draw(s);
        M.discard(s, s.hand[i % s.hand.length].id);
      }
      const total = s.hand.length + (s.drawn ? 1 : 0) + s.river.length + s.wall.live.length + s.wall.dead.length;
      assert.equal(total, 136);
      assert.equal(s.river.length, 20);
    });

    it('山がなくなると流局になりツモできない', function () {
      const s = M.create({ seed: 5 });
      let guard = 0;
      while (M.draw(s).ok && guard++ < 200) M.discard(s, s.drawn.id);
      assert.equal(s.wall.live.length, 0);
      assert.equal(s.finished, true);
      assert.equal(s.river.length, 109);
      assert.equal(M.canDraw(s).ok, false);
    });

    it('ドラの種類はドラ表示牌の次', function () {
      const s = M.create({ seed: 8 });
      assert.equal(M.doraKinds(s)[0], MJ.tiles.doraKindFromIndicator(s.wall.doraIndicators[0].kind));
    });
  });

  describe('保存データの読み込み', function () {
    it('未知のキーや型違いの値は無視される', function () {
      const merged = MJ.storage.mergeKnown(MJ.storage.DEFAULT_SETTINGS, { volume: 'loud', sound: false, hacker: 1 });
      assert.equal(merged.volume, MJ.storage.DEFAULT_SETTINGS.volume);
      assert.equal(merged.sound, false);
      assert.equal(merged.hacker, undefined);
    });

    it('成績の入れ子構造を補完する', function () {
      const merged = MJ.storage.mergeKnown(MJ.storage.DEFAULT_STATS, { demo: { deals: 3 } });
      assert.equal(merged.demo.deals, 3);
      assert.equal(merged.demo.discards, 0);
      assert.deepEqual(merged.match.placements, [0, 0, 0, 0]);
    });
  });
})();
