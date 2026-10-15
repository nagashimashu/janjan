/* CPU四人麻雀：ゲーム進行とCPU判断のテスト */
(function () {
  'use strict';
  const describe = MJTest.describe, it = MJTest.it, assert = MJTest.assert;
  const E = MJ.gameEngine;
  const C = MJ.cpuPlayer;

  function newRound(seed) {
    const m = E.createMatch({ seed: seed });
    E.decideDealer(m);
    E.startRound(m);
    return m;
  }

  /* 現在の手番を1手（ツモ＋CPU打牌）進める */
  function step(m) {
    E.draw(m);
    const seat = m.currentPlayerIndex;
    const p = m.players[seat];
    const d = C.chooseDiscard(p.hand, p.drawn, E.contextFor(m, seat));
    return E.discard(m, seat, d.tile.id);
  }

  function playRound(m) {
    let guard = 0;
    while (m.phase === 'draw' && guard++ < 200) step(m);
    return guard;
  }

  describe('対局の開始', function () {
    it('4人・持ち点25000点で始まる', function () {
      const m = E.createMatch({ seed: 1 });
      assert.equal(m.players.length, 4);
      assert.ok(m.players.every(function (p) { return p.score === 25000; }));
      assert.equal(m.players.filter(function (p) { return p.isCPU; }).length, 3);
    });

    it('起家はサイコロで決まり、シードで再現できる', function () {
      const a = E.createMatch({ seed: 'abc' });
      const b = E.createMatch({ seed: 'abc' });
      E.decideDealer(a);
      E.decideDealer(b);
      assert.equal(a.dealerIndex, b.dealerIndex);
      assert.equal(a.dealerIndex, (a.dice[0] + a.dice[1] - 1) % 4);
      assert.equal(a.initialDealer, a.dealerIndex);
    });

    it('配牌：4人に13枚ずつ、ツモ山70枚、王牌14枚、合計136枚', function () {
      const m = newRound(7);
      m.players.forEach(function (p) { assert.equal(p.hand.length, 13, p.name); });
      assert.equal(m.wall.live.length, 70);
      assert.equal(m.wall.dead.length, 14);
      assert.equal(E.tileTotal(m), 136);
      assert.equal(m.currentPlayerIndex, m.dealerIndex);
      assert.equal(m.phase, 'draw');
    });

    it('配牌は整列済み', function () {
      const m = newRound(8);
      assert.ok(m.players.every(function (p) { return MJ.handSorter.isSorted(p.hand); }));
    });

    it('自風は親から東南西北', function () {
      const m = newRound(9);
      assert.equal(E.seatWind(m, m.dealerIndex), 'east');
      assert.equal(E.seatWind(m, (m.dealerIndex + 1) % 4), 'south');
      assert.equal(E.seatWind(m, (m.dealerIndex + 3) % 4), 'north');
      assert.equal(E.roundLabel(m), '東1局');
    });
  });

  describe('ツモと打牌の進行', function () {
    it('手番は 親 → 下家 → 対面 → 上家 の順に回る', function () {
      const m = newRound(10);
      const order = [];
      for (let i = 0; i < 8; i++) { order.push(m.currentPlayerIndex); step(m); }
      const d = m.dealerIndex;
      assert.deepEqual(order, [d, (d + 1) % 4, (d + 2) % 4, (d + 3) % 4, d, (d + 1) % 4, (d + 2) % 4, (d + 3) % 4]);
    });

    it('ツモで14枚になり、打牌で13枚に戻る', function () {
      const m = newRound(11);
      const seat = m.currentPlayerIndex;
      E.draw(m);
      assert.equal(m.players[seat].hand.length + 1, 14);
      assert.equal(m.phase, 'discard');
      E.discard(m, seat, m.players[seat].drawn.id);
      assert.equal(m.players[seat].hand.length, 13);
      assert.equal(m.players[seat].drawn, null);
    });

    it('ツモ切りと手出しを記録する', function () {
      const m = newRound(12);
      const seat = m.currentPlayerIndex;
      E.draw(m);
      const r1 = E.discard(m, seat, m.players[seat].drawn.id);
      assert.equal(r1.tsumogiri, true);
      for (let i = 0; i < 3; i++) step(m);
      E.draw(m);
      const r2 = E.discard(m, seat, m.players[seat].hand[0].id);
      assert.equal(r2.tsumogiri, false);
      assert.deepEqual(m.players[seat].discards.map(function (d) { return d.tsumogiri; }), [true, false]);
    });

    it('手番でない席は打牌できない', function () {
      const m = newRound(13);
      E.draw(m);
      const other = (m.currentPlayerIndex + 1) % 4;
      const r = E.discard(m, other, m.players[other].hand[0].id);
      assert.equal(r.ok, false);
    });

    it('ツモ前は打牌できず、打牌前は次のツモができない', function () {
      const m = newRound(14);
      const seat = m.currentPlayerIndex;
      assert.equal(E.discard(m, seat, m.players[seat].hand[0].id).ok, false);
      E.draw(m);
      assert.equal(E.draw(m).ok, false);
    });

    it('どの時点でも牌の総数は136枚', function () {
      const m = newRound(15);
      for (let i = 0; i < 30; i++) {
        step(m);
        assert.equal(E.tileTotal(m), 136, i + '手目');
      }
    });
  });

  describe('流局', function () {
    it('70回のツモで山がなくなり流局する', function () {
      const m = newRound(21);
      playRound(m);
      assert.equal(m.phase, 'round-end');
      assert.equal(m.wall.live.length, 0);
      assert.equal(m.result.type, 'exhaustive');
      const discards = m.players.reduce(function (n, p) { return n + p.discards.length; }, 0);
      assert.equal(discards, 70);
      assert.equal(E.tileTotal(m), 136);
    });

    it('ノーテン罰符：1人テンパイは +3000 / -1000×3', function () {
      assert.deepEqual(E.notenPayments([true, false, false, false]), [3000, -1000, -1000, -1000]);
    });
    it('ノーテン罰符：2人テンパイは ±1500', function () {
      assert.deepEqual(E.notenPayments([true, false, true, false]), [1500, -1500, 1500, -1500]);
    });
    it('ノーテン罰符：3人テンパイは +1000×3 / -3000', function () {
      assert.deepEqual(E.notenPayments([true, true, true, false]), [1000, 1000, 1000, -3000]);
    });
    it('ノーテン罰符：全員テンパイ・全員ノーテンは移動なし', function () {
      assert.deepEqual(E.notenPayments([true, true, true, true]), [0, 0, 0, 0]);
      assert.deepEqual(E.notenPayments([false, false, false, false]), [0, 0, 0, 0]);
    });

    it('流局後の点数の合計は変わらない', function () {
      const m = newRound(22);
      playRound(m);
      assert.equal(m.players.reduce(function (n, p) { return n + p.score; }, 0), 100000);
      assert.equal(m.result.deltas.reduce(function (a, b) { return a + b; }, 0), 0);
    });

    it('テンパイ判定は手牌のシャンテン数0', function () {
      const m = newRound(23);
      playRound(m);
      m.players.forEach(function (p, i) {
        assert.equal(m.result.tenpai[i], MJ.shanten.calc(MJ.shanten.countsOf(p.hand)) === 0, p.name);
      });
    });
  });

  describe('次の局', function () {
    function endWith(m, tenpai) {
      playRound(m);
      /* テンパイ状況を指定して結果を作り直す（連荘の条件だけを検証する） */
      m.result.tenpai = tenpai;
      m.result.dealerKeeps = tenpai[m.dealerIndex];
    }

    it('親テンパイなら連荘：親・局数はそのまま、本場+1', function () {
      const m = newRound(31);
      const dealer = m.dealerIndex;
      const t = [false, false, false, false];
      t[dealer] = true;
      endWith(m, t);
      const next = E.nextRound(m);
      assert.equal(next.renchan, true);
      assert.equal(m.dealerIndex, dealer);
      assert.equal(m.handNumber, 1);
      assert.equal(m.honba, 1);
      assert.equal(m.phase, 'draw');
    });

    it('親ノーテンなら親流れ：次の席が親、局数+1、本場+1', function () {
      const m = newRound(32);
      const dealer = m.dealerIndex;
      endWith(m, [false, false, false, false]);
      E.nextRound(m);
      assert.equal(m.dealerIndex, (dealer + 1) % 4);
      assert.equal(m.handNumber, 2);
      assert.equal(m.honba, 1);
      assert.equal(E.roundLabel(m), '東2局');
    });

    it('東4局で親が流れると東風戦終了', function () {
      const m = newRound(33);
      m.handNumber = 4;
      endWith(m, [false, false, false, false]);
      const peek = E.peekNext(m);
      assert.equal(peek.ended, true);
      E.nextRound(m);
      assert.equal(m.phase, 'match-end');
      assert.equal(m.ranking.length, 4);
    });

    it('点数がマイナスの人がいれば終了（トビ）', function () {
      const m = newRound(34);
      endWith(m, [false, false, false, false]);
      m.players[1].score = -500;
      assert.equal(E.peekNext(m).reason, 'トビ');
    });

    it('東風戦を最後まで自動で打ち切れる（CPU4人）', function () {
      const m = E.createMatch({ seed: 'full-match' });
      E.decideDealer(m);
      E.startRound(m);
      let rounds = 0;
      while (m.phase !== 'match-end' && rounds < 40) {
        playRound(m);
        assert.equal(m.phase, 'round-end');
        E.nextRound(m);
        rounds++;
      }
      assert.equal(m.phase, 'match-end');
      assert.ok(rounds >= 4, rounds + '局');
      assert.equal(m.players.reduce(function (n, p) { return n + p.score; }, 0), 100000);
      const scores = m.ranking.map(function (r) { return r.score; });
      assert.deepEqual(scores, scores.slice().sort(function (a, b) { return b - a; }));
    });

    it('同点は起家に近い席が上位', function () {
      const m = E.createMatch({ seed: 1 });
      m.initialDealer = 2;
      m.players.forEach(function (p) { p.score = 25000; });
      assert.deepEqual(E.ranking(m).map(function (r) { return r.seat; }), [2, 3, 0, 1]);
    });
  });

  describe('CPUレベル1の打牌', function () {
    const ctx = { level: 1, seatWind: 'south', roundWind: 'east', doraKinds: [] };
    function tiles(text) {
      const pool = MJ.tiles.createTileSet(MJ.RULES);
      return MJ.tiles.takeFromPool(pool, MJ.tiles.parse(text));
    }

    it('孤立した役のない字牌を切る', function () {
      const t = tiles('23456m78p345678s4z');
      const d = C.chooseDiscard(t.slice(0, 13), t[13], ctx);
      assert.equal(d.tile.code, '4z');
      assert.ok(d.reasons.indexOf('孤立牌') >= 0);
      assert.ok(d.score >= 0 && d.score <= 100);
    });

    it('役牌より先にオタ風を切る', function () {
      const t = tiles('123m456p789s11z4z5s');
      const d = C.chooseDiscard(t.slice(0, 13), t[13], ctx);
      assert.equal(d.tile.code, '4z');
    });

    it('孤立した数牌は端牌から切る', function () {
      const t = tiles('123m456p789s11z1p5s');
      const d = C.chooseDiscard(t.slice(0, 13), t[13], ctx);
      assert.equal(d.tile.code, '1p');
    });

    it('シャンテン数を悪化させない（ランダムな手牌200組）', function () {
      for (let s = 0; s < 200; s++) {
        const w = MJ.wall.build({ seed: 'cpu' + s, dealCount: 14 });
        const hand = w.initialHand.slice(0, 13);
        const drawn = w.initialHand[13];
        const best = MJ.ukeire.analyze(MJ.shanten.countsOf(w.initialHand))[0].shanten;
        const d = C.chooseDiscard(hand, drawn, ctx);
        assert.equal(d.shanten, best, 'seed cpu' + s);
        assert.ok(hand.concat([drawn]).indexOf(d.tile) >= 0, '手牌の牌を返す');
      }
    });

    it('同じ種類に赤5と通常の5があれば通常の5を切る', function () {
      const t = tiles('0m5m1z');
      const kind = MJ.tiles.parse('5m')[0].kind;
      assert.equal(C.pickTile(t, kind, null).isRed, false);
    });

    it('同じ種類ならツモ牌を切る（ツモ切り）', function () {
      const t = tiles('5p5p');
      assert.equal(C.pickTile(t, t[1].kind, t[1]), t[1]);
    });

    it('ツモ牌が赤5なら手の内の通常の5を切る', function () {
      const t = tiles('5p0p');
      assert.equal(C.pickTile(t, t[0].kind, t[1]), t[0]);
    });

    it('判断理由の文章を作れる', function () {
      const m = newRound(41);
      const p = m.players[1];
      const d = C.chooseDiscard(p.hand, null, E.contextFor(m, 1));
      const text = C.describe(p, E.seatWind(m, 1), d);
      assert.ok(/^CPU[東南西北]（ヒスイ）：.+を選択　理由：.+　評価値：\d+$/.test(text), text);
    });
  });
})();
