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

  /*
   * 現在の手番を1手（ツモ＋CPU打牌）進める。
   * takeWins が true ならツモ和了・ロンを取り、false なら和了を見送る（流局のテスト用）
   */
  function step(m, takeWins) {
    E.draw(m);
    const seat = m.currentPlayerIndex;
    if (takeWins && E.tsumoResult(m, seat)) return E.declareTsumo(m, seat);
    const p = m.players[seat];
    const d = C.chooseDiscard(p.hand, p.drawn, E.contextFor(m, seat));
    const r = E.discard(m, seat, d.tile.id);
    let guard = 0;
    while (m.phase === 'call' && guard++ < 10) {
      const head = m.pendingActions[0];
      if (head.type === 'ron') E.respondRon(m, head.seat, !!takeWins);
      else E.respondCall(m, head.seat, { type: 'skip' });   // 鳴きは見送る（フェーズ3・4のテストは門前前提）
    }
    if (m.phase === 'call') throw new Error('応答待ちが終わりません');
    return r;
  }

  function playRound(m, takeWins) {
    let guard = 0;
    while (m.phase === 'draw' && guard++ < 200) step(m, takeWins);
    return guard;
  }

  /* テスト用に手牌・ツモ牌を差し替える（牌の総数の検証はしない） */
  function setHand(m, seat, text) {
    m.players[seat].hand = MJTestHelpers.tiles(text);
  }
  function nextDraw(m, code) {
    m.wall.live.unshift(MJTestHelpers.tiles(code)[0]);
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

    it('東風戦を最後まで自動で打ち切れる（CPU4人・和了なし）', function () {
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

    it('東風戦を最後まで自動で打ち切れる（CPU4人・和了あり、10対局）', function () {
      let wins = 0;
      let total = 0;
      for (let g = 0; g < 10; g++) {
        const m = E.createMatch({ seed: 'win-match-' + g });
        E.decideDealer(m);
        E.startRound(m);
        let rounds = 0;
        while (m.phase !== 'match-end' && rounds < 60) {
          playRound(m, true);
          assert.equal(m.phase, 'round-end');
          if (m.result.type !== 'exhaustive') {
            wins++;
            assert.equal(m.result.deltas.reduce(function (a, b) { return a + b; }, 0), m.result.riichiSticks * 1000);
          }
          E.nextRound(m);
          rounds++;
        }
        assert.equal(m.phase, 'match-end', 'seed ' + g);
        assert.equal(m.players.reduce(function (n, p) { return n + p.score; }, 0), 100000, 'seed ' + g);
        total += rounds;
      }
      assert.ok(wins > 0, '和了が一度もなかった');
      assert.ok(total >= 40, total + '局');
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

  describe('和了の進行（ツモ・ロン・フリテン）', function () {
    const NOTEN = '147m258p369s1234z';
    const PINFU_TANYAO = '234m567p345s23s66p';   // 1索・4索待ち（平和・断么九）
    const PINFU = '234m567p345s23s99p';          // 1索・4索待ち（平和）

    /* ドラを南（表示牌：東）に固定し、全員をノーテンにした局 */
    function setup(seed) {
      const m = newRound(seed);
      m.doraIndicators = MJTestHelpers.tiles('1z');
      for (let s = 0; s < 4; s++) setHand(m, s, NOTEN);
      return m;
    }
    function sumDeltas(m) { return m.result.deltas.reduce(function (a, b) { return a + b; }, 0); }
    /* ロンの候補の席（鳴きの候補は除く） */
    function ronSeats(m) { return m.pendingActions.filter(function (a) { return a.type === 'ron'; }).map(function (a) { return a.seat; }); }
    /* 残りの応答（鳴き）をすべて見送る */
    function skipCalls(m) { while (m.phase === 'call') E.respondCall(m, m.pendingActions[0].seat, { type: 'skip' }); }

    it('親のツモ和了：平和ツモ 700オール、連荘して本場+1', function () {
      const m = setup(51);
      const d = m.currentPlayerIndex;
      setHand(m, d, PINFU);
      nextDraw(m, '4s');
      E.draw(m);
      assert.ok(E.tsumoResult(m, d));
      E.declareTsumo(m, d);
      assert.equal(m.phase, 'round-end');
      assert.equal(m.result.type, 'tsumo');
      assert.equal(m.result.deltas[d], 2100);
      assert.ok(m.result.deltas.every(function (x, i) { return i === d || x === -700; }));
      assert.equal(sumDeltas(m), 0);
      const next = E.peekNext(m);
      assert.equal(next.renchan, true);
      assert.equal(next.honba, 1);
    });

    it('子のロン：放銃者だけが支払い、親が流れて本場は0', function () {
      const m = setup(52);
      const d = m.currentPlayerIndex;
      const w = (d + 1) % 4;
      setHand(m, w, PINFU_TANYAO);
      nextDraw(m, '4s');
      E.draw(m);
      E.discard(m, d, m.players[d].drawn.id);
      assert.equal(m.phase, 'call');
      assert.deepEqual(ronSeats(m), [w]);
      E.respondRon(m, w, true);
      assert.equal(m.result.type, 'ron');
      assert.equal(m.result.winner, w);
      assert.equal(m.result.loser, d);
      assert.equal(m.result.deltas[w], 2000);
      assert.equal(m.result.deltas[d], -2000);
      const next = E.peekNext(m);
      assert.equal(next.renchan, false);
      assert.equal(next.honba, 0);
      assert.equal(next.dealer, w);
    });

    it('頭ハネ：放銃者の下家から順に聞き、先に和了した人だけが和了する', function () {
      const m = setup(53);
      const d = m.currentPlayerIndex;
      setHand(m, (d + 1) % 4, PINFU_TANYAO);
      setHand(m, (d + 2) % 4, PINFU_TANYAO);
      nextDraw(m, '4s');
      E.draw(m);
      E.discard(m, d, m.players[d].drawn.id);
      assert.deepEqual(ronSeats(m), [(d + 1) % 4, (d + 2) % 4]);
      assert.equal(E.respondRon(m, (d + 2) % 4, true).ok, false, '順番を飛ばせない');
      E.respondRon(m, (d + 1) % 4, true);
      assert.equal(m.result.winner, (d + 1) % 4);
    });

    it('ロンを見送ると同巡内フリテンになり、自分のツモで解除される', function () {
      const m = setup(54);
      const d = m.currentPlayerIndex;
      const w = (d + 1) % 4;
      setHand(m, w, PINFU_TANYAO);
      nextDraw(m, '4s');
      E.draw(m);
      E.discard(m, d, m.players[d].drawn.id);
      E.respondRon(m, w, false);
      skipCalls(m);
      assert.equal(m.phase, 'draw');
      assert.equal(m.currentPlayerIndex, w);
      assert.equal(E.furitenInfo(m, w).furiten, true);
      assert.equal(E.furitenInfo(m, w).temporary, true);
      E.draw(m);
      assert.equal(m.players[w].furitenTemp, false);
    });

    it('自分の待ち牌を捨てていればロンできない（捨て牌フリテン）', function () {
      const m = setup(55);
      const d = m.currentPlayerIndex;
      const w = (d + 1) % 4;
      setHand(m, w, PINFU_TANYAO);
      m.players[w].discards.push({ tile: MJTestHelpers.tiles('1s')[0], tsumogiri: false, turn: 0 });
      assert.equal(E.furitenInfo(m, w).furiten, true);
      nextDraw(m, '4s');
      E.draw(m);
      E.discard(m, d, m.players[d].drawn.id);
      assert.deepEqual(ronSeats(m), [], 'ロンの選択肢が出ない');
    });

    it('役がなければロンできないが、門前ならツモ和了はできる', function () {
      const m = setup(56);
      const d = m.currentPlayerIndex;
      const w = (d + 1) % 4;
      setHand(m, w, '123m456p789s24s99p');   // 3索の嵌張待ち・役なし
      nextDraw(m, '3s');
      E.draw(m);
      E.discard(m, d, m.players[d].drawn.id);
      assert.deepEqual(ronSeats(m), []);
      skipCalls(m);
      nextDraw(m, '3s');
      E.draw(m);
      const r = E.tsumoResult(m, w);
      assert.ok(r);
      assert.deepEqual(MJTestHelpers.yakuNames(r), ['門前清自摸和']);
    });

    it('本場はロンで1本300点', function () {
      const m = setup(57);
      m.honba = 2;
      const d = m.currentPlayerIndex;
      const w = (d + 1) % 4;
      setHand(m, w, PINFU_TANYAO);
      nextDraw(m, '4s');
      E.draw(m);
      E.discard(m, d, m.players[d].drawn.id);
      E.respondRon(m, w, true);
      assert.equal(m.result.deltas[w], 2600);
    });

    it('最後の牌の打牌でロンすると河底撈魚', function () {
      const m = setup(58);
      const d = m.currentPlayerIndex;
      const w = (d + 1) % 4;
      setHand(m, w, PINFU_TANYAO);
      m.wall.live = MJTestHelpers.tiles('4s');
      E.draw(m);
      E.discard(m, d, m.players[d].drawn.id);
      assert.equal(m.phase, 'call');
      E.respondRon(m, w, true);
      assert.ok(MJTestHelpers.yakuNames(m.result.score).indexOf('河底撈魚') >= 0);
    });

    it('最後の牌の打牌を見送ると流局', function () {
      const m = setup(59);
      const d = m.currentPlayerIndex;
      const w = (d + 1) % 4;
      setHand(m, w, PINFU_TANYAO);
      m.wall.live = MJTestHelpers.tiles('4s');
      E.draw(m);
      E.discard(m, d, m.players[d].drawn.id);
      E.respondRon(m, w, false);
      assert.equal(m.phase, 'round-end');
      assert.equal(m.result.type, 'exhaustive');
    });

    it('最後の牌でツモ和了すると海底摸月', function () {
      const m = setup(60);
      const d = m.currentPlayerIndex;
      setHand(m, d, PINFU);
      m.wall.live = MJTestHelpers.tiles('4s');
      E.draw(m);
      assert.ok(MJTestHelpers.yakuNames(E.tsumoResult(m, d)).indexOf('海底摸月') >= 0);
    });

    it('和了した局の結果に、和了形・和了牌・ドラ表示牌を記録する', function () {
      const m = setup(61);
      const d = m.currentPlayerIndex;
      setHand(m, d, PINFU);
      nextDraw(m, '4s');
      E.draw(m);
      E.declareTsumo(m, d);
      assert.equal(m.result.hand.length, 13);
      assert.equal(m.result.winTile.code, '4s');
      assert.equal(m.result.doraIndicators.length, 1);
      assert.equal(m.history[m.history.length - 1].type, 'tsumo');
    });
  });
})();
