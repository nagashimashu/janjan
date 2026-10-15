/*
 * CPU四人麻雀の戦績（DOM非依存）。
 *
 * 対局中は局ごとの記録を「対局ログ」（match.playerLog）にためておき、東風戦を最後まで打ったときだけ
 * MJ.stats.match にまとめて加える。途中で対局を終了した場合は何も保存しない。
 * 保存するのはあなた（席0）の成績だけ。
 */
(function (MJ) {
  'use strict';

  const HISTORY_SIZE = 10;

  function newLog() {
    return { rounds: 0, wins: 0, tsumo: 0, ron: 0, dealIns: 0, riichi: 0, called: 0, best: null, lastRound: -1 };
  }

  /* 局が終わったときに呼ぶ（同じ局を二重に数えない） */
  function recordRound(log, m) {
    if (!m.result || log.lastRound === m.roundCount) return log;
    log.lastRound = m.roundCount;
    const r = m.result;
    const me = m.players[0];
    log.rounds += 1;
    if (me.riichi) log.riichi += 1;
    if (me.melds.some(function (x) { return !x.concealed; })) log.called += 1;
    if (r.type === 'tsumo' || r.type === 'ron') {
      if (r.winner === 0) {
        log.wins += 1;
        log[r.type] += 1;
        const d = MJ.scoring.describe(r.score);
        const hand = {
          points: r.score.payments.total,
          head: d.head,
          detail: d.detail,
          pointsText: d.points,
          /* 役に加えて、ドラ・赤ドラ・裏ドラも翻数の内訳として残す */
          yaku: r.score.yaku.map(function (y) { return y.name; }).concat(
            [['dora', 'ドラ'], ['aka', '赤ドラ'], ['ura', '裏ドラ']].filter(function (d) { return r.score.dora[d[0]]; })
              .map(function (d) { return d[1] + r.score.dora[d[0]]; })),
          round: r.label + ' ' + r.honba + '本場',
          type: r.type
        };
        if (!log.best || hand.points > log.best.points) log.best = hand;
      }
      if (r.loser === 0) log.dealIns += 1;
    }
    return log;
  }

  /* 対局が最後まで終わったときに呼ぶ。stats.match を更新して、この対局の順位を返す */
  function recordMatch(stats, m, log, level, date) {
    const s = stats.match;
    const mine = m.ranking.find(function (r) { return r.seat === 0; });
    const lv = String(level || 1);
    s.games += 1;
    s.placements[mine.rank - 1] += 1;
    s.totalScore += mine.score;
    ['rounds', 'wins', 'tsumo', 'ron', 'dealIns', 'riichi', 'called'].forEach(function (k) { s[k] += log[k]; });
    if (!s.byLevel[lv]) s.byLevel[lv] = { games: 0, placements: [0, 0, 0, 0] };
    s.byLevel[lv].games += 1;
    s.byLevel[lv].placements[mine.rank - 1] += 1;
    if (log.best && !(s.bestHand && s.bestHand.points >= log.best.points)) {
      s.bestHand = Object.assign({}, log.best, { date: date });
    }
    s.history.unshift({ date: date, rank: mine.rank, score: mine.score, level: Number(lv), rounds: log.rounds });
    if (s.history.length > HISTORY_SIZE) s.history.length = HISTORY_SIZE;
    return mine;
  }

  function pct(a, b) { return b ? Math.round((a / b) * 1000) / 10 : 0; }

  /* 画面表示用の集計 */
  function summary(s) {
    const g = s.games;
    const rankSum = s.placements.reduce(function (a, n, i) { return a + n * (i + 1); }, 0);
    return {
      games: g,
      avgRank: g ? Math.round((rankSum / g) * 100) / 100 : 0,
      topRate: pct(s.placements[0], g),
      lastRate: pct(s.placements[3], g),
      avgScore: g ? Math.round(s.totalScore / g) : 0,
      rounds: s.rounds,
      winRate: pct(s.wins, s.rounds),
      dealInRate: pct(s.dealIns, s.rounds),
      riichiRate: pct(s.riichi, s.rounds),
      callRate: pct(s.called, s.rounds),
      tsumoShare: pct(s.tsumo, s.wins)
    };
  }

  function reset(stats) {
    stats.match = JSON.parse(JSON.stringify(MJ.storage.DEFAULT_STATS.match));
  }

  MJ.matchStats = {
    HISTORY_SIZE: HISTORY_SIZE,
    newLog: newLog,
    recordRound: recordRound,
    recordMatch: recordMatch,
    summary: summary,
    reset: reset
  };
})(window.MJ = window.MJ || {});
