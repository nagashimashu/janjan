/*
 * 何切る問題のロジック（DOM非依存）：問題の準備・回答の判定・成績の記録・問題データの検証。
 * 画面側は nanikiru.js。
 */
(function (MJ) {
  'use strict';

  const GRADES = ['best', 'good', 'situational', 'improve'];
  const DIFFICULTIES = ['easy', 'normal', 'hard'];
  const WINDS = ['east', 'south', 'west', 'north'];
  const WIND_NAME = { east: '東', south: '南', west: '西', north: '北' };

  function kindOfCode(code) {
    return MJ.tiles.parse(code)[0].kind;
  }

  /* 見えている牌の枚数：手牌14枚＋ドラ表示牌＋visible */
  function visibleCounts(q, handCounts) {
    const extra = MJ.tiles.parse(q.doraIndicators.join('') + (q.visible || ''));
    return MJ.ukeire.addCounts(handCounts, MJ.shanten.countsOf(extra));
  }

  /* 表示と判定に必要な情報をまとめる */
  function prepare(q) {
    const pool = MJ.tiles.createTileSet(MJ.RULES);
    const tiles = MJ.handSorter.sort(MJ.tiles.takeFromPool(pool, MJ.tiles.parse(q.hand)));
    const counts = MJ.shanten.countsOf(tiles);
    const seen = visibleCounts(q, counts);
    const analysis = MJ.ukeire.analyze(counts, seen);
    const indicators = MJ.tiles.parse(q.doraIndicators.join('')).map(function (s) { return MJ.tiles.fromKind(s.kind); });
    const doraKinds = indicators.map(function (t) { return MJ.tiles.doraKindFromIndicator(t.kind); });
    const visibleTiles = MJ.tiles.parse(q.visible || '').map(function (s) { return MJ.tiles.fromKind(s.kind, s.isRed); });
    const best = q.candidates.filter(function (c) { return c.grade === 'best'; });
    return {
      q: q,
      tiles: tiles,
      counts: counts,
      seen: seen,
      analysis: analysis,
      shantenBefore: MJ.shanten.calc(counts),
      indicators: indicators,
      doraKinds: doraKinds,
      visibleTiles: visibleTiles,
      bestKinds: best.map(function (c) { return kindOfCode(c.discard); }),
      maxBestUkeire: best.reduce(function (m, c) { return Math.max(m, c.ukeireCount); }, 0)
    };
  }

  function candidateFor(q, kind) {
    return q.candidates.find(function (c) { return kindOfCode(c.discard) === kind; }) || null;
  }

  function entryFor(p, kind) {
    return p.analysis.find(function (e) { return e.kind === kind; }) || null;
  }

  /* 回答の判定。候補に無い打牌は「改善余地あり」 */
  function judge(p, kind) {
    const cand = candidateFor(p.q, kind);
    const grade = cand ? cand.grade : 'improve';
    const entry = entryFor(p, kind);
    return {
      kind: kind,
      grade: grade,
      candidate: cand,
      entry: entry,
      isCorrect: grade === 'best' || grade === 'good',
      diffFromBest: entry ? entry.ukeireCount - p.maxBestUkeire : 0
    };
  }

  /* 成績の記録（stats.nanikiru を直接更新する） */
  function record(stats, qid, result) {
    const n = stats.nanikiru;
    n.attempts += 1;
    if (result.isCorrect) n.correct += 1;
    const prev = n.byQuestion[qid] || { attempts: 0, correct: 0, bestGrade: null, lastGrade: null };
    const rank = MJ.QUESTION_GRADES[result.grade].rank;
    const prevRank = prev.bestGrade ? MJ.QUESTION_GRADES[prev.bestGrade].rank : -1;
    n.byQuestion[qid] = {
      attempts: prev.attempts + 1,
      correct: prev.correct + (result.isCorrect ? 1 : 0),
      bestGrade: rank > prevRank ? result.grade : prev.bestGrade,
      lastGrade: result.grade
    };
    return n.byQuestion[qid];
  }

  function resetStats(stats) {
    stats.nanikiru = { attempts: 0, correct: 0, byQuestion: {} };
  }

  function accuracy(n) {
    return n.attempts ? Math.round((n.correct / n.attempts) * 100) : 0;
  }

  function filter(list, difficulty) {
    return difficulty && difficulty !== 'all'
      ? list.filter(function (q) { return q.difficulty === difficulty; })
      : list.slice();
  }

  /*
   * 問題データの検証。問題点の配列を返す（空なら正常）。
   * 計算値（シャンテン数・受入）がエンジンの結果と一致するかも確認する。
   */
  function validate(q) {
    const errors = [];
    const need = ['id', 'title', 'difficulty', 'hand', 'seatWind', 'roundWind', 'doraIndicators', 'turn',
      'candidates', 'yakuTargets', 'explanation', 'perspectives', 'supplement', 'reviewed', 'reviewerNote', 'lastUpdated'];
    need.forEach(function (k) { if (q[k] === undefined) errors.push(k + ' がありません'); });
    if (errors.length) return errors;

    if (DIFFICULTIES.indexOf(q.difficulty) < 0) errors.push('difficulty が不正：' + q.difficulty);
    if (WINDS.indexOf(q.seatWind) < 0 || WINDS.indexOf(q.roundWind) < 0) errors.push('風の指定が不正');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(q.lastUpdated)) errors.push('lastUpdated は YYYY-MM-DD 形式');

    let specs;
    try { specs = MJ.tiles.parse(q.hand); } catch (e) { errors.push('hand：' + e.message); return errors; }
    if (specs.length !== 14) errors.push('hand は14枚（現在 ' + specs.length + ' 枚）');

    let p;
    try { p = prepare(q); } catch (e) { errors.push('牌の枚数が不正：' + e.message); return errors; }
    p.seen.forEach(function (n, k) {
      if (n > MJ.COPIES_PER_KIND) errors.push(MJ.tiles.kindName(k) + ' が' + n + '枚見えています（4枚まで）');
    });

    const seenDiscards = {};
    if (!q.candidates.some(function (c) { return c.grade === 'best'; })) errors.push('best の候補がありません');
    q.candidates.forEach(function (c) {
      const label = q.id + ' 打' + c.discard;
      if (GRADES.indexOf(c.grade) < 0) errors.push(label + '：grade が不正');
      let kind;
      try { kind = kindOfCode(c.discard); } catch (e) { errors.push(label + '：discard が不正'); return; }
      if (seenDiscards[kind]) errors.push(label + '：候補が重複');
      seenDiscards[kind] = true;
      if (!p.counts[kind]) { errors.push(label + '：手牌にない牌'); return; }
      const e = entryFor(p, kind);
      if (c.shanten !== e.shanten) errors.push(label + '：shanten ' + c.shanten + ' ≠ 計算 ' + e.shanten);
      if (c.ukeireCount !== e.ukeireCount) errors.push(label + '：ukeireCount ' + c.ukeireCount + ' ≠ 計算 ' + e.ukeireCount);
      const calc = e.ukeire.map(function (u) { return u.code; }).join(',');
      if ((c.ukeire || []).join(',') !== calc) errors.push(label + '：ukeire ' + (c.ukeire || []).join(',') + ' ≠ 計算 ' + calc);
    });
    return errors;
  }

  MJ.nanikiruModel = {
    WIND_NAME: WIND_NAME,
    kindOfCode: kindOfCode,
    prepare: prepare,
    judge: judge,
    candidateFor: candidateFor,
    entryFor: entryFor,
    record: record,
    resetStats: resetStats,
    accuracy: accuracy,
    filter: filter,
    validate: validate
  };
})(window.MJ = window.MJ || {});
