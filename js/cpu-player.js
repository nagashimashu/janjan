/*
 * CPUの判断（DOM非依存）。
 *
 * レベル1（フェーズ3で実装）：
 *   1. 切ってもシャンテン数が悪化しない牌だけを候補にする
 *   2. 候補の中で「残す価値」が最も低い牌を切る
 *      残す価値 = 他の牌とのつながり（同じ牌・隣・1つ飛び）＋ 字牌の簡易評価（役牌は少し高く）＋ 数牌の位置（中張牌ほど高い）
 *   3. 鳴かない（鳴き自体がフェーズ5で実装）
 * レベル2・3（受入枚数・ドラ・押し引き）はフェーズ5で追加する。ctx.level で分岐できるようにしてある。
 *
 * 戻り値には判断理由と評価値を含め、デバッグパネルで確認できるようにする。
 */
(function (MJ) {
  'use strict';

  const DRAGONS = [31, 32, 33];

  function windKind(wind) {
    return 27 + MJ.gameEngine.WINDS.indexOf(wind);
  }

  function isYakuhai(kind, ctx) {
    return DRAGONS.indexOf(kind) >= 0 || kind === windKind(ctx.seatWind) || kind === windKind(ctx.roundWind);
  }

  /* その牌と他の牌とのつながりの強さ（自分自身の1枚は除く） */
  function connection(kind, counts) {
    let v = (counts[kind] - 1) * (kind >= 27 ? 3 : 2);
    if (kind < 27) {
      const pos = kind % 9;
      [[-1, 2], [1, 2], [-2, 1], [2, 1]].forEach(function (d) {
        const p = pos + d[0];
        if (p >= 0 && p <= 8 && counts[kind + d[0]] > 0) v += d[1];
      });
    }
    return v;
  }

  /* 数牌の位置による価値：3〜7 ＞ 2・8 ＞ 1・9 */
  function positionValue(kind) {
    if (kind >= 27) return 0;
    const rank = (kind % 9) + 1;
    if (rank === 1 || rank === 9) return 0;
    if (rank === 2 || rank === 8) return 1;
    return 2;
  }

  function keepValue(kind, counts, ctx) {
    let v = connection(kind, counts) * 10 + positionValue(kind) * 3;
    if (kind >= 27) v += isYakuhai(kind, ctx) ? 4 : -2;
    if (ctx.level >= 2) {
      /* フェーズ5：ドラ・赤ドラ・受入枚数の評価をここに追加する */
      if (ctx.doraKinds && ctx.doraKinds.indexOf(kind) >= 0) v += 8;
    }
    return v;
  }

  function reasonsFor(kind, counts, ctx, keepsShanten) {
    const r = [];
    if (keepsShanten) r.push('シャンテン数維持');
    if (connection(kind, counts) === 0) r.push('孤立牌');
    if (kind >= 27) r.push(isYakuhai(kind, ctx) ? '役牌だが孤立' : '役のない字牌');
    else if (positionValue(kind) === 0) r.push('端牌');
    else if (positionValue(kind) === 1) r.push('2・8牌');
    return r;
  }

  /* 同じ種類が複数あるとき、どの1枚を切るか：ツモ牌（ツモ切り）→ 赤でない牌 の順 */
  function pickTile(tiles, kind, drawn) {
    if (drawn && drawn.kind === kind && !drawn.isRed) return drawn;
    const same = tiles.filter(function (t) { return t.kind === kind; });
    return same.find(function (t) { return !t.isRed; }) || same[0];
  }

  /*
   * hand: 手牌（13枚）、drawn: ツモ牌、ctx: { level, seatWind, roundWind, doraKinds }
   * 戻り値：{ tile, kind, score, shanten, reasons, candidates }
   *   score は 0〜100 の評価値（大きいほど「切ってよい」）
   */
  function chooseDiscard(hand, drawn, ctx) {
    const c = ctx || { level: 1, seatWind: 'east', roundWind: 'east', doraKinds: [] };
    const tiles = drawn ? hand.concat([drawn]) : hand.slice();
    const counts = MJ.shanten.countsOf(tiles);
    const meldCount = c.meldCount || 0;

    const evals = [];
    for (let k = 0; k < MJ.TILE_KIND_COUNT; k++) {
      if (!counts[k]) continue;
      counts[k]--;
      const s = MJ.shanten.calc(counts, { meldCount: meldCount });
      counts[k]++;
      evals.push({ kind: k, shanten: s, keep: keepValue(k, counts, c) });
    }
    const minShanten = evals.reduce(function (m, e) { return Math.min(m, e.shanten); }, Infinity);
    evals.forEach(function (e) {
      e.keepsShanten = e.shanten === minShanten;
      e.score = Math.max(0, Math.min(100, 100 - e.keep - (e.keepsShanten ? 0 : 40)));
    });
    /* シャンテン数維持を最優先し、その中で評価値が高い（残す価値が低い）牌。同点は種類番号の大きい牌（字牌・端寄り） */
    evals.sort(function (a, b) {
      return (b.keepsShanten - a.keepsShanten) || (b.score - a.score) || (b.kind - a.kind);
    });
    const best = evals[0];
    return {
      tile: pickTile(tiles, best.kind, drawn),
      kind: best.kind,
      score: best.score,
      shanten: best.shanten,
      reasons: reasonsFor(best.kind, counts, c, best.keepsShanten),
      candidates: evals.slice(0, 4).map(function (e) {
        return { code: MJ.tiles.kindToCode(e.kind), score: e.score, shanten: e.shanten };
      })
    };
  }

  /* デバッグ表示用の文章 例）「CPU東（シオン）：3索を選択 理由：シャンテン数維持、孤立牌 評価値：72」 */
  function describe(player, wind, decision) {
    return 'CPU' + MJ.gameEngine.WIND_KANJI[wind] + '（' + player.name + '）：' +
      MJ.tiles.kindName(decision.kind) + 'を選択　理由：' + (decision.reasons.join('、') || '—') +
      '　評価値：' + decision.score;
  }

  MJ.cpuPlayer = {
    chooseDiscard: chooseDiscard,
    describe: describe,
    pickTile: pickTile,
    keepValue: keepValue,
    isYakuhai: isYakuhai
  };
})(window.MJ = window.MJ || {});
