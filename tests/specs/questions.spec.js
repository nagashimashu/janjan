/* 何切る問題データと判定・成績のテスト */
(function () {
  'use strict';
  const describe = MJTest.describe, it = MJTest.it, assert = MJTest.assert;
  const N = MJ.nanikiruModel;

  describe('何切る問題データ', function () {
    it('10問以上ある', function () { assert.ok(MJ.QUESTIONS.length >= 10, MJ.QUESTIONS.length + '問'); });

    it('問題IDが重複しない', function () {
      const ids = MJ.QUESTIONS.map(function (q) { return q.id; });
      assert.equal(new Set(ids).size, ids.length);
    });

    it('初級・中級・上級がそれぞれ1問以上ある', function () {
      ['easy', 'normal', 'hard'].forEach(function (d) {
        assert.ok(MJ.QUESTIONS.some(function (q) { return q.difficulty === d; }), d);
      });
    });

    MJ.QUESTIONS.forEach(function (q) {
      it(q.id + '：形式と計算値（シャンテン数・受入）が正しい', function () {
        const errors = N.validate(q);
        assert.ok(errors.length === 0, errors.join(' / '));
      });
    });

    it('最有力候補は、どの問題でも計算上の最小シャンテン数と矛盾しない（Q009 のような例外は解説で説明）', function () {
      MJ.QUESTIONS.forEach(function (q) {
        const p = N.prepare(q);
        const minShanten = p.analysis[0].shanten;
        q.candidates.filter(function (c) { return c.grade === 'best'; }).forEach(function (c) {
          assert.ok(c.shanten - minShanten <= 1, q.id + ' 打' + c.discard + ' はシャンテン数を2以上戻している');
        });
      });
    });
  });

  describe('何切る：判定', function () {
    const q = MJ.QUESTIONS.find(function (x) { return x.id === 'Q001'; });
    const p = N.prepare(q);

    it('手牌は14枚・整列済み', function () {
      assert.equal(p.tiles.length, 14);
      assert.ok(MJ.handSorter.isSorted(p.tiles));
    });

    it('最有力の打牌は best・正答', function () {
      const r = N.judge(p, MJ.tiles.parse('4z')[0].kind);
      assert.equal(r.grade, 'best');
      assert.ok(r.isCorrect);
      assert.equal(r.diffFromBest, 0);
    });

    it('候補に無い打牌は improve・不正答で、受入差を返す', function () {
      const r = N.judge(p, MJ.tiles.parse('3m')[0].kind);
      assert.equal(r.grade, 'improve');
      assert.equal(r.candidate, null);
      assert.equal(r.isCorrect, false);
      assert.equal(r.entry.ukeireCount, 14);
      assert.equal(r.diffFromBest, -23);
    });

    it('赤5は通常の5と同じ種類として判定する', function () {
      const q7 = MJ.QUESTIONS.find(function (x) { return x.id === 'Q007'; });
      const r = N.judge(N.prepare(q7), MJ.tiles.parse('0p')[0].kind);
      assert.equal(r.grade, 'situational');
    });
  });

  describe('何切る：成績', function () {
    function fresh() { return MJ.storage.mergeKnown(MJ.storage.DEFAULT_STATS, null); }

    it('挑戦数・正答数・正答率を記録する', function () {
      const st = fresh();
      N.record(st, 'Q001', { grade: 'best', isCorrect: true });
      N.record(st, 'Q001', { grade: 'improve', isCorrect: false });
      N.record(st, 'Q002', { grade: 'good', isCorrect: true });
      assert.equal(st.nanikiru.attempts, 3);
      assert.equal(st.nanikiru.correct, 2);
      assert.equal(N.accuracy(st.nanikiru), 67);
    });

    it('問題ごとの最高評価と直近の評価を保持する', function () {
      const st = fresh();
      N.record(st, 'Q003', { grade: 'situational', isCorrect: false });
      N.record(st, 'Q003', { grade: 'best', isCorrect: true });
      N.record(st, 'Q003', { grade: 'improve', isCorrect: false });
      const b = st.nanikiru.byQuestion.Q003;
      assert.equal(b.attempts, 3);
      assert.equal(b.correct, 1);
      assert.equal(b.bestGrade, 'best');
      assert.equal(b.lastGrade, 'improve');
    });

    it('リセットで0に戻る', function () {
      const st = fresh();
      N.record(st, 'Q001', { grade: 'best', isCorrect: true });
      N.resetStats(st);
      assert.equal(st.nanikiru.attempts, 0);
      assert.deepEqual(st.nanikiru.byQuestion, {});
      assert.equal(N.accuracy(st.nanikiru), 0);
    });

    it('難易度で絞り込める', function () {
      assert.ok(N.filter(MJ.QUESTIONS, 'easy').every(function (q) { return q.difficulty === 'easy'; }));
      assert.equal(N.filter(MJ.QUESTIONS, 'all').length, MJ.QUESTIONS.length);
    });
  });
})();
