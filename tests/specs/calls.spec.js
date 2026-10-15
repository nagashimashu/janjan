/* フェーズ5：鳴き・リーチ・カン・九種九牌・CPUレベル2・3のテスト */
(function () {
  'use strict';
  const describe = MJTest.describe, it = MJTest.it, assert = MJTest.assert;
  const E = MJ.gameEngine;
  const C = MJ.cpuPlayer;
  const T = function (s) { return MJTestHelpers.tiles(s); };
  const K = function (c) { return MJTestHelpers.kind(c); };
  const NOTEN = '147m258p369s1234z';

  /* ドラを南（表示牌：東）に固定し、全員ノーテン、親がツモ済み（drawCode）の局 */
  function setup(seed, drawCode) {
    const m = E.createMatch({ seed: seed });
    E.decideDealer(m);
    E.startRound(m);
    m.doraIndicators = T('1z');
    for (let s = 0; s < 4; s++) m.players[s].hand = T(NOTEN);
    if (drawCode) {
      m.wall.live.unshift(T(drawCode)[0]);
      E.draw(m);
    }
    return m;
  }
  function d0(m) { return m.currentPlayerIndex; }
  function skipAll(m) {
    while (m.phase === 'call') {
      const h = m.pendingActions[0];
      if (h.type === 'ron') E.respondRon(m, h.seat, false); else E.respondCall(m, h.seat, { type: 'skip' });
    }
  }

  describe('ポン・チー・明槓', function () {
    it('ポン：対子を持つ人が鳴け、鳴いた人の手番（ツモなし）になる', function () {
      const m = setup(101, '5z');
      const d = d0(m);
      const s = (d + 2) % 4;
      m.players[s].hand = T('55z147m258p369s12z');
      E.discard(m, d, m.players[d].drawn.id);
      assert.equal(m.phase, 'call');
      const head = m.pendingActions[0];
      assert.equal(head.seat, s);
      assert.ok(head.pon);
      E.respondCall(m, s, { type: 'pon' });
      const p = m.players[s];
      assert.equal(p.melds.length, 1);
      assert.equal(p.melds[0].type, 'koutsu');
      assert.equal(p.melds[0].from, d);
      assert.equal(p.hand.length, 11);
      assert.equal(m.currentPlayerIndex, s);
      assert.equal(m.phase, 'discard');
      assert.equal(p.drawn, null);
      assert.ok(m.players[d].discards[m.players[d].discards.length - 1].called);
      assert.equal(E.isMenzen(p), false);
    });

    it('チーは下家だけ。組み合わせを返し、喰い替え（同じ牌・筋）を禁止する', function () {
      const m = setup(102, '5m');
      const d = d0(m);
      const w = (d + 1) % 4;
      m.players[w].hand = T('234m147p258s369s1z');
      E.discard(m, d, m.players[d].drawn.id);
      const head = m.pendingActions[0];
      assert.equal(head.seat, w);
      assert.deepEqual(head.chi, [[K('3m'), K('4m')]]);
      E.respondCall(m, w, { type: 'chi', chi: 0 });
      const p = m.players[w];
      assert.equal(p.melds[0].type, 'shuntsu');
      assert.equal(p.melds[0].kind, K('3m'));
      const two = p.hand.find(function (t) { return t.code === '2m'; });
      assert.equal(E.discard(m, w, two.id).ok, false, '筋の2萬は切れない');
      const east = p.hand.find(function (t) { return t.code === '1z'; });
      assert.ok(E.discard(m, w, east.id).ok);
    });

    it('下家以外はチーできない', function () {
      const m = setup(103, '5m');
      const d = d0(m);
      m.players[(d + 2) % 4].hand = T('34m147p258s369s17z');
      E.discard(m, d, m.players[d].drawn.id);
      assert.equal(m.phase, 'draw');
    });

    it('応答の優先順位：ロン → ポン → チー', function () {
      const m = setup(104, '4s');
      const d = d0(m);
      m.players[(d + 1) % 4].hand = T('23s456m147p258p99s1z');    // チー（4索）
      m.players[(d + 2) % 4].hand = T('44s147m258p369p12z');      // ポン（4索）
      m.players[(d + 3) % 4].hand = T('234m567p345s23s66p');      // ロン（4索・平和断么九）
      E.discard(m, d, m.players[d].drawn.id);
      const order = m.pendingActions.map(function (a) { return a.type + (a.pon ? ':pon' : '') + (a.chi && a.chi.length ? ':chi' : ''); });
      assert.deepEqual(order, ['ron', 'call:pon', 'call:chi']);
    });

    it('明槓：嶺上牌を引き、カンドラが増え、王牌は14枚のまま', function () {
      const m = setup(105, '5z');
      const d = d0(m);
      const s = (d + 2) % 4;
      m.players[s].hand = T('555z147m258p369s1z');
      const live = m.wall.live.length;
      E.discard(m, d, m.players[d].drawn.id);
      assert.ok(m.pendingActions[0].kan);
      E.respondCall(m, s, { type: 'kan' });
      const p = m.players[s];
      assert.equal(p.melds[0].type, 'kantsu');
      assert.ok(p.drawn, '嶺上牌をツモしている');
      assert.equal(m.rinshan, true);
      assert.equal(m.kanCount, 1);
      assert.equal(m.doraIndicators.length, 2);
      assert.equal(m.wall.dead.length, 14);
      assert.equal(m.wall.live.length, live - 1);
    });

    it('最後の牌（河底）は鳴けない', function () {
      const m = setup(106);
      const d = d0(m);
      m.players[(d + 2) % 4].hand = T('55z147m258p369s12z');
      m.wall.live = T('5z');
      E.draw(m);
      E.discard(m, d, m.players[d].drawn.id);
      assert.equal(m.phase, 'round-end');
    });

    it('鳴くと全員の一発が消える', function () {
      const m = setup(107);
      m.players.forEach(function (p) { p.ippatsu = true; });
      const d = d0(m);
      m.players[(d + 2) % 4].hand = T('55z147m258p369s12z');
      m.wall.live.unshift(T('5z')[0]);
      E.draw(m);
      E.discard(m, d, m.players[d].drawn.id);
      E.respondCall(m, (d + 2) % 4, { type: 'pon' });
      assert.ok(m.players.every(function (p) { return !p.ippatsu; }));
    });
  });

  describe('暗槓・加槓・槍槓・嶺上開花', function () {
    it('暗槓：門前のまま、嶺上牌を引く', function () {
      const m = setup(111, '5z');
      const d = d0(m);
      m.players[d].hand = T('555z147m258p369s1z');
      assert.deepEqual(E.ankanOptions(m, d), [K('5z')]);
      E.declareAnkan(m, d, K('5z'));
      const p = m.players[d];
      assert.equal(p.melds[0].concealed, true);
      assert.ok(E.isMenzen(p));
      assert.ok(p.drawn);
      assert.equal(m.kanCount, 1);
    });

    it('嶺上牌で和了すると嶺上開花', function () {
      const m = setup(112, '5z');
      const d = d0(m);
      m.players[d].hand = T('555z234m567p23s99p');
      m.wall.dead[10] = T('4s')[0];
      E.declareAnkan(m, d, K('5z'));
      const r = E.tsumoResult(m, d);
      assert.ok(r);
      assert.ok(MJTestHelpers.yakuNames(r).indexOf('嶺上開花') >= 0);
    });

    it('加槓：ポンした牌の4枚目で槓子になる', function () {
      const m = setup(113, '3m');
      const d = d0(m);
      const p = m.players[d];
      p.hand = T('147p258s369s1z');
      p.melds = [{ type: 'koutsu', kind: K('3m'), tiles: T('333m'), from: (d + 1) % 4, concealed: false }];
      assert.deepEqual(E.kakanOptions(m, d), [K('3m')]);
      E.declareKakan(m, d, K('3m'));
      assert.equal(p.melds[0].type, 'kantsu');
      assert.equal(p.melds[0].tiles.length, 4);
      assert.ok(p.drawn);
    });

    it('加槓した牌で他家が和了できれば槍槓', function () {
      const m = setup(114, '3m');
      const d = d0(m);
      const w = (d + 2) % 4;
      const p = m.players[d];
      p.hand = T('147p258s369s1z');
      p.melds = [{ type: 'koutsu', kind: K('3m'), tiles: T('333m'), from: (d + 1) % 4, concealed: false }];
      m.players[w].hand = T('12m456p789s123s11z');   // 3萬の辺張待ち（役なし → 槍槓だけで和了できる）
      E.declareKakan(m, d, K('3m'));
      assert.equal(m.phase, 'call');
      assert.equal(m.pendingActions[0].chankan, true);
      E.respondRon(m, w, true);
      assert.equal(m.result.type, 'ron');
      assert.equal(m.result.loser, d);
      assert.ok(MJTestHelpers.yakuNames(m.result.score).indexOf('槍槓') >= 0);
    });

    it('槍槓を見送れば加槓が成立する', function () {
      const m = setup(115, '3m');
      const d = d0(m);
      const w = (d + 2) % 4;
      const p = m.players[d];
      p.hand = T('147p258s369s1z');
      p.melds = [{ type: 'koutsu', kind: K('3m'), tiles: T('333m'), from: (d + 1) % 4, concealed: false }];
      m.players[w].hand = T('12m456p789s123s11z');
      E.declareKakan(m, d, K('3m'));
      E.respondRon(m, w, false);
      assert.equal(p.melds[0].type, 'kantsu');
      assert.equal(m.phase, 'discard');
    });
  });

  describe('リーチ', function () {
    function riichiSetup(seed) {
      const m = setup(seed, '1z');
      const d = d0(m);
      m.players[d].hand = T('234m567p345s23s99p');   // 1索・4索待ち
      return { m: m, d: d };
    }

    it('リーチできる牌は「切るとテンパイ」の牌だけ', function () {
      const x = riichiSetup(121);
      const rc = E.canRiichi(x.m, x.d);
      assert.ok(rc.ok);
      assert.deepEqual(rc.tiles, [x.m.players[x.d].drawn.id]);
    });

    it('宣言牌が通ると1,000点を供託し、一発の権利を得る', function () {
      const x = riichiSetup(122);
      E.discard(x.m, x.d, x.m.players[x.d].drawn.id, { riichi: true });
      skipAll(x.m);
      const p = x.m.players[x.d];
      assert.equal(p.riichi, true);
      assert.equal(p.ippatsu, true);
      assert.equal(p.score, 24000);
      assert.equal(x.m.riichiSticks, 1);
      assert.ok(p.discards[0].riichi);
    });

    it('一発ツモ：立直・一発・門前清自摸和、裏ドラを見る', function () {
      const x = riichiSetup(123);
      E.discard(x.m, x.d, x.m.players[x.d].drawn.id, { riichi: true });
      skipAll(x.m);
      x.m.currentPlayerIndex = x.d;
      x.m.phase = 'draw';
      x.m.wall.live.unshift(T('4s')[0]);
      E.draw(x.m);
      const r = E.tsumoResult(x.m, x.d);
      const names = MJTestHelpers.yakuNames(r);
      ['立直', '一発', '門前清自摸和', '平和'].forEach(function (n) { assert.ok(names.indexOf(n) >= 0, n); });
      assert.equal(E.scoreContext(x.m, x.d, true).uraDoraKinds.length, 1);
      E.declareTsumo(x.m, x.d);
      assert.equal(x.m.result.uraIndicators.length, 1);
      assert.equal(x.m.riichiSticks, 0, '供託は和了者へ');
    });

    it('リーチ後はツモ切りだけ。次の打牌で一発は消える', function () {
      const x = riichiSetup(124);
      E.discard(x.m, x.d, x.m.players[x.d].drawn.id, { riichi: true });
      skipAll(x.m);
      x.m.currentPlayerIndex = x.d;
      x.m.phase = 'draw';
      x.m.wall.live.unshift(T('9m')[0]);
      E.draw(x.m);
      const p = x.m.players[x.d];
      assert.equal(E.discard(x.m, x.d, p.hand[0].id).ok, false);
      assert.ok(E.discard(x.m, x.d, p.drawn.id).ok);
      assert.equal(p.ippatsu, false);
    });

    it('宣言牌でロンされるとリーチは不成立（供託しない）', function () {
      const m = setup(125, '5p');
      const d = d0(m);
      const w = (d + 1) % 4;
      m.players[d].hand = T('234m567p345s23s99p');
      m.players[w].hand = T('234m456p678s345s5p');   // 5筒単騎・断么九
      E.discard(m, d, m.players[d].drawn.id, { riichi: true });
      assert.equal(m.pendingActions[0].type, 'ron');
      E.respondRon(m, w, true);
      assert.equal(m.result.riichiSticks, 0);
      assert.equal(m.players[d].riichi, false);
      assert.equal(m.players[d].score, 25000 + m.result.deltas[d]);
    });

    it('リーチ後にロンを見送ると、その局はフリテン（ツモでも解除されない）', function () {
      const x = riichiSetup(126);
      E.discard(x.m, x.d, x.m.players[x.d].drawn.id, { riichi: true });
      skipAll(x.m);
      const o = (x.d + 1) % 4;
      x.m.currentPlayerIndex = o;
      x.m.phase = 'draw';
      x.m.wall.live.unshift(T('1s')[0]);
      E.draw(x.m);
      E.discard(x.m, o, x.m.players[o].drawn.id);
      assert.equal(x.m.pendingActions[0].seat, x.d);
      E.respondRon(x.m, x.d, false);
      skipAll(x.m);
      assert.equal(x.m.players[x.d].riichiFuriten, true);
      x.m.currentPlayerIndex = x.d;
      x.m.phase = 'draw';
      E.draw(x.m);
      assert.equal(E.furitenInfo(x.m, x.d).furiten, true);
    });

    it('鳴いているとリーチできない／残り4枚未満・1,000点未満でもできない', function () {
      const x = riichiSetup(127);
      const p = x.m.players[x.d];
      p.melds = [{ type: 'koutsu', kind: K('5z'), tiles: T('555z'), from: 1, concealed: false }];
      assert.equal(E.canRiichi(x.m, x.d).ok, false);
      p.melds = [];
      p.score = 900;
      assert.equal(E.canRiichi(x.m, x.d).ok, false);
      p.score = 25000;
      x.m.wall.live = x.m.wall.live.slice(0, 3);
      assert.equal(E.canRiichi(x.m, x.d).ok, false);
    });

    it('対局終了時に残った供託はトップが受け取る', function () {
      const m = setup(128);
      m.riichiSticks = 2;
      m.players.forEach(function (p, i) { p.score = [26000, 24000, 24000, 24000][i]; });
      m.handNumber = 4;
      m.phase = 'round-end';
      m.result = { type: 'exhaustive', dealerKeeps: false, tenpai: [false, false, false, false] };
      E.nextRound(m);
      assert.equal(m.phase, 'match-end');
      assert.equal(m.players[0].score, 28000);
      assert.equal(m.players.reduce(function (a, p) { return a + p.score; }, 0), 100000);
    });
  });

  describe('九種九牌', function () {
    it('最初のツモで么九牌9種以上なら途中流局（点数移動なし・連荘・本場+1）', function () {
      const m = setup(131, '5z');
      const d = d0(m);
      m.players[d].hand = T('19m19p19s1234z55m6m');
      assert.ok(E.canKyuushu(m, d));
      E.declareKyuushu(m, d);
      assert.equal(m.result.type, 'abortive');
      assert.deepEqual(m.result.deltas, [0, 0, 0, 0]);
      const next = E.peekNext(m);
      assert.equal(next.renchan, true);
      assert.equal(next.honba, 1);
    });
    it('誰かが鳴いた後は九種九牌できない', function () {
      const m = setup(132, '5z');
      const d = d0(m);
      m.players[d].hand = T('19m19p19s1234z55m6m');
      m.anyCall = true;
      assert.equal(E.canKyuushu(m, d), false);
    });
  });

  describe('CPUレベル2・3', function () {
    function ctxOf(level, extra) {
      return Object.assign({ level: level, seatWind: 'south', roundWind: 'east', doraKinds: [], meldCount: 0, melds: [],
        forbidKinds: [], opponents: [], wallLeft: 50, rank: 2, isAllLast: false, kuitan: true, riichi: false }, extra || {});
    }

    it('レベル2：テンパイしたらリーチする', function () {
      const m = setup(141, '1z');
      const d = d0(m);
      m.players[d].cpuLevel = 2;
      m.players[d].hand = T('234m567p345s23s99p');
      const act = C.decideTurn(m.players[d].hand, m.players[d].drawn, E.contextFor(m, d), E.turnOptions(m, d));
      assert.equal(act.action, 'riichi');
      assert.equal(act.tile.code, '1z');
    });

    it('レベル1：リーチも鳴きもしない', function () {
      const m = setup(142, '1z');
      const d = d0(m);
      m.players[d].cpuLevel = 1;
      m.players[d].hand = T('234m567p345s23s99p');
      assert.equal(C.decideTurn(m.players[d].hand, m.players[d].drawn, E.contextFor(m, d), E.turnOptions(m, d)).action, 'discard');
      assert.equal(C.decideCall(T('55z147m258p369s12z'), ctxOf(1), { tile: T('5z')[0], pon: true, chi: [] }).type, 'skip');
    });

    it('レベル2：役牌の対子はポンする', function () {
      const d = C.decideCall(T('55z234m456p78s19p1z'), ctxOf(2), { tile: T('5z')[0], pon: true, chi: [] });
      assert.equal(d.type, 'pon');
      assert.ok(d.reasons.indexOf('役牌') >= 0);
    });

    it('レベル2：役が確定しないチーはしない', function () {
      const d = C.decideCall(T('34m147p258s369s17z'), ctxOf(2), { tile: T('5m')[0], pon: false, chi: [[K('3m'), K('4m')]] });
      assert.equal(d.type, 'skip');
    });

    it('レベル2：喰いタンで手が進むチーはする', function () {
      const d = C.decideCall(T('34m456p678s23s558p'), ctxOf(2), { tile: T('5m')[0], pon: false, chi: [[K('3m'), K('4m')]] });
      assert.equal(d.type, 'chi');
      assert.ok(d.reasons.indexOf('断么九') >= 0);
    });

    it('危険度：現物0、筋は低く、字牌は見えている枚数で下がる', function () {
      const visible = MJ.ukeire.zeros();
      visible[K('1z')] = 3;
      const opp = { safe: [K('4m'), K('2p'), K('8p')], riichi: true };
      assert.equal(C.dangerOf(K('4m'), opp, visible), 0);
      assert.ok(C.dangerOf(K('1m'), opp, visible) < C.dangerOf(K('1s'), opp, visible), '1萬は筋');
      assert.ok(C.dangerOf(K('5p'), opp, visible) < C.dangerOf(K('5s'), opp, visible), '5筒は両筋');
      assert.equal(C.dangerOf(K('1z'), opp, visible), 3);
    });

    it('レベル3：リーチ者がいて2シャンテンなら現物を切って降りる', function () {
      const hand = T('13m46p79s1235z99m');
      const drawn = T('7z')[0];
      const ctx = ctxOf(3, { opponents: [{ seat: 1, riichi: true, safe: [K('9m')] }], visible: MJ.shanten.countsOf(hand.concat([drawn])) });
      const d = C.chooseDiscard(hand, drawn, ctx);
      assert.equal(d.fold, true);
      assert.equal(d.tile.code, '9m');
      assert.equal(d.danger, 0);
    });

    it('レベル3：テンパイなら押す', function () {
      const hand = T('234m567p345s23s99p');
      const drawn = T('7z')[0];
      const ctx = ctxOf(3, { opponents: [{ seat: 1, riichi: true, safe: [] }], visible: MJ.shanten.countsOf(hand.concat([drawn])) });
      const d = C.chooseDiscard(hand, drawn, ctx);
      assert.equal(d.fold, false);
      assert.equal(d.shanten, 0);
    });

    it('レベル3：オーラスのトップは1シャンテンでも降り、ラスは2シャンテンでも押す', function () {
      assert.equal(C.shouldPush(1, ctxOf(3, { isAllLast: true, rank: 1 })), false);
      assert.equal(C.shouldPush(2, ctxOf(3, { isAllLast: true, rank: 4 })), true);
      assert.equal(C.shouldPush(2, ctxOf(3, {})), false);
    });

    it('CPUの判断理由の文章（鳴き・リーチ）', function () {
      const text = C.describeAction({ name: 'シオン' }, 'west', { type: 'pon', kind: K('5z'), reasons: ['役牌'] });
      assert.equal(text, 'CPU西（シオン）：白でポン　理由：役牌');
    });
  });

  describe('対局全体（鳴き・リーチあり）', function () {
    function playAll(level, seed) {
      const m = E.createMatch({ seed: seed, cpuLevel: level });
      E.decideDealer(m);
      E.startRound(m);
      let rounds = 0;
      while (m.phase !== 'match-end' && rounds < 60) {
        let guard = 0;
        while ((m.phase === 'draw' || m.phase === 'discard') && guard++ < 400) {
          if (m.phase === 'draw') E.draw(m);
          const seat = m.currentPlayerIndex;
          const p = m.players[seat];
          for (let k = 0; k < 6 && m.phase === 'discard' && m.currentPlayerIndex === seat; k++) {
            const act = C.decideTurn(p.hand, p.drawn, E.contextFor(m, seat), E.turnOptions(m, seat));
            if (act.action === 'tsumo') { E.declareTsumo(m, seat); break; }
            if (act.action === 'kyuushu') { E.declareKyuushu(m, seat); break; }
            if (act.action === 'ankan') { E.declareAnkan(m, seat, act.kind); continue; }
            if (act.action === 'kakan') E.declareKakan(m, seat, act.kind);
            else E.discard(m, seat, act.tile.id, { riichi: act.action === 'riichi' });
            while (m.phase === 'call') {
              const h = m.pendingActions[0];
              if (h.type === 'ron') E.respondRon(m, h.seat, true);
              else E.respondCall(m, h.seat, C.decideCall(m.players[h.seat].hand, E.contextFor(m, h.seat), { tile: m.lastDiscard.tile, pon: h.pon, kan: h.kan, chi: h.chi }));
            }
            if (act.action !== 'kakan') break;
          }
          if (m.phase !== 'round-end') {
            assert.equal(E.tileTotal(m), 136);
            assert.equal(m.players.reduce(function (a, x) { return a + x.score; }, 0) + m.riichiSticks * 1000, 100000);
          }
        }
        assert.equal(m.phase, 'round-end');
        E.nextRound(m);
        rounds++;
      }
      return m;
    }
    [2, 3].forEach(function (level) {
      it('CPUレベル' + level + '×4人で東風戦を完走（牌136枚・点数＋供託100,000点を毎手確認）', function () {
        for (let g = 0; g < 3; g++) {
          const m = playAll(level, 'calls-' + level + '-' + g);
          assert.equal(m.phase, 'match-end');
          assert.equal(m.players.reduce(function (a, x) { return a + x.score; }, 0), 100000);
        }
      });
    });
  });
})();
