/* フェーズ6：戦績の記録・制限時間・保存データの移行のテスト */
(function () {
  'use strict';
  const describe = MJTest.describe, it = MJTest.it, assert = MJTest.assert;
  const E = MJ.gameEngine;
  const S = MJ.matchStats;
  const T = function (s) { return MJTestHelpers.tiles(s); };

  function freshStats() { return MJ.storage.mergeKnown(MJ.storage.DEFAULT_STATS, null); }

  /* あなた（席0）がロンで和了した局の結果を作る */
  function roundWithWin(seed, opts) {
    const o = opts || {};
    const m = E.createMatch({ seed: seed });
    E.decideDealer(m);
    E.startRound(m);
    m.doraIndicators = T('1z');
    for (let s = 0; s < 4; s++) m.players[s].hand = T('147m258p369s1234z');
    const from = 3;
    m.players[0].hand = T(o.hand || '234m567p345s23s66p');
    if (o.riichi) m.players[0].riichi = true;
    m.currentPlayerIndex = from;
    m.phase = 'draw';
    m.wall.live.unshift(T('4s')[0]);
    E.draw(m);
    E.discard(m, from, m.players[from].drawn.id);
    E.respondRon(m, 0, true);
    return m;
  }

  describe('戦績：局ごとの記録', function () {
    it('和了・ロン・リーチ・最高の和了を記録する', function () {
      const m = roundWithWin(201, { riichi: true });
      const log = S.recordRound(S.newLog(), m);
      assert.equal(log.rounds, 1);
      assert.equal(log.wins, 1);
      assert.equal(log.ron, 1);
      assert.equal(log.riichi, 1);
      assert.ok(log.best.points > 0);
      assert.ok(log.best.yaku.indexOf('立直') >= 0);
    });

    it('最高の和了の内訳にドラ・赤ドラも残す', function () {
      const m = roundWithWin(204, { hand: '234m067p345s23s66p' });
      const log = S.recordRound(S.newLog(), m);
      assert.ok(log.best.yaku.indexOf('赤ドラ1') >= 0, log.best.yaku.join(','));
    });

    it('同じ局を二重に数えない', function () {
      const m = roundWithWin(202);
      const log = S.newLog();
      S.recordRound(log, m);
      S.recordRound(log, m);
      assert.equal(log.rounds, 1);
    });

    it('放銃を記録する', function () {
      const m = E.createMatch({ seed: 203 });
      E.decideDealer(m);
      E.startRound(m);
      m.doraIndicators = T('1z');
      for (let s = 0; s < 4; s++) m.players[s].hand = T('147m258p369s1234z');
      m.players[1].hand = T('234m567p345s23s66p');
      m.currentPlayerIndex = 0;
      m.phase = 'draw';
      m.wall.live.unshift(T('4s')[0]);
      E.draw(m);
      E.discard(m, 0, m.players[0].drawn.id);
      E.respondRon(m, 1, true);
      const log = S.recordRound(S.newLog(), m);
      assert.equal(log.dealIns, 1);
      assert.equal(log.wins, 0);
    });
  });

  describe('戦績：対局の記録', function () {
    function endedMatch(scores) {
      const m = E.createMatch({ seed: 210 });
      m.players.forEach(function (p, i) { p.score = scores[i]; });
      m.ranking = E.ranking(m);
      return m;
    }

    it('順位分布・平均点・レベル別・履歴を更新する', function () {
      const stats = freshStats();
      const log = S.newLog();
      log.rounds = 5; log.wins = 2; log.tsumo = 1; log.ron = 1; log.riichi = 2;
      const mine = S.recordMatch(stats, endedMatch([32000, 25000, 23000, 20000]), log, 3, '2026-10-15');
      assert.equal(mine.rank, 1);
      const s = stats.match;
      assert.equal(s.games, 1);
      assert.deepEqual(s.placements, [1, 0, 0, 0]);
      assert.equal(s.byLevel['3'].games, 1);
      assert.equal(s.history[0].rank, 1);
      assert.equal(s.history[0].level, 3);
      const sum = S.summary(s);
      assert.equal(sum.avgRank, 1);
      assert.equal(sum.avgScore, 32000);
      assert.equal(sum.winRate, 40);
      assert.equal(sum.riichiRate, 40);
    });

    it('平均順位と1位率・4位率', function () {
      const stats = freshStats();
      S.recordMatch(stats, endedMatch([32000, 25000, 23000, 20000]), S.newLog(), 2, 'a');
      S.recordMatch(stats, endedMatch([10000, 25000, 33000, 32000]), S.newLog(), 2, 'b');
      const sum = S.summary(stats.match);
      assert.equal(sum.avgRank, 2.5);
      assert.equal(sum.topRate, 50);
      assert.equal(sum.lastRate, 50);
    });

    it('最高の和了は点数が高いものだけを残す', function () {
      const stats = freshStats();
      const a = S.newLog(); a.best = { points: 8000, head: '満貫', yaku: ['断么九'] };
      const b = S.newLog(); b.best = { points: 3900, head: '30符3翻', yaku: ['平和'] };
      S.recordMatch(stats, endedMatch([32000, 25000, 23000, 20000]), a, 2, 'x');
      S.recordMatch(stats, endedMatch([32000, 25000, 23000, 20000]), b, 2, 'y');
      assert.equal(stats.match.bestHand.points, 8000);
      assert.equal(stats.match.bestHand.date, 'x');
    });

    it('履歴は直近10対局まで', function () {
      const stats = freshStats();
      for (let i = 0; i < 13; i++) S.recordMatch(stats, endedMatch([32000, 25000, 23000, 20000]), S.newLog(), 1, 'd' + i);
      assert.equal(stats.match.history.length, 10);
      assert.equal(stats.match.history[0].date, 'd12');
    });

    it('リセットで既定値に戻る', function () {
      const stats = freshStats();
      S.recordMatch(stats, endedMatch([32000, 25000, 23000, 20000]), S.newLog(), 1, 'x');
      S.reset(stats);
      assert.equal(stats.match.games, 0);
      assert.deepEqual(stats.match.history, []);
    });
  });

  describe('保存データの移行', function () {
    it('以前の形式（対局数・順位分布だけ）の戦績を読み込める', function () {
      const old = { match: { games: 3, placements: [1, 1, 1, 0] } };
      const s = MJ.storage.mergeKnown(MJ.storage.DEFAULT_STATS, old);
      assert.equal(s.match.games, 3);
      assert.equal(s.match.wins, 0);
      assert.deepEqual(s.match.history, []);
      assert.equal(s.match.byLevel['2'].games, 0);
    });
    it('履歴（長さが変わる配列）を保持する', function () {
      const saved = { match: { history: [{ rank: 1 }, { rank: 2 }, { rank: 3 }] } };
      assert.equal(MJ.storage.mergeKnown(MJ.storage.DEFAULT_STATS, saved).match.history.length, 3);
    });
    it('長さの違う順位分布は採用しない', function () {
      const saved = { match: { placements: [1, 2] } };
      assert.deepEqual(MJ.storage.mergeKnown(MJ.storage.DEFAULT_STATS, saved).match.placements, [0, 0, 0, 0]);
    });
    it('制限時間の設定は既定でなし', function () {
      assert.equal(MJ.storage.mergeKnown(MJ.storage.DEFAULT_SETTINGS, {}).turnTimer, '0');
    });
  });

  describe('操作の制限時間', function () {
    it('残り時間と割合', function () {
      const t = MJ.turnTimer.create(10);
      t.start('turn:1', 1000);
      assert.equal(t.remaining(4000), 7);
      assert.equal(t.fraction(6000), 0.5);
      assert.equal(t.expired(10999), false);
      assert.equal(t.expired(11000), true);
    });
    it('同じキーで start しても残り時間を引き継ぐ（画面回転・再描画）', function () {
      const t = MJ.turnTimer.create(10);
      t.start('turn:1', 0);
      assert.equal(t.start('turn:1', 5000), false);
      assert.equal(t.remaining(5000), 5);
    });
    it('キーが変わればリセットする（次の手番）', function () {
      const t = MJ.turnTimer.create(10);
      t.start('turn:1', 0);
      assert.equal(t.start('turn:2', 5000), true);
      assert.equal(t.remaining(5000), 10);
    });
    it('一時停止中は減らない', function () {
      const t = MJ.turnTimer.create(10);
      t.start('k', 0);
      t.pause(3000);
      assert.equal(t.remaining(9000), 7);
      assert.equal(t.expired(20000), false);
      t.resume(20000);
      assert.equal(t.remaining(21000), 6);
    });
    it('stop すると止まる', function () {
      const t = MJ.turnTimer.create(10);
      t.start('k', 0);
      t.stop();
      assert.equal(t.expired(50000), false);
      assert.equal(t.key, null);
    });
  });
})();
