/*
 * CPUの判断（DOM非依存）。すべての判断に理由と評価値を付けて返す（デバッグパネルで確認できる）。
 *
 * レベル1：シャンテン数を悪化させない牌のうち、孤立牌・役のない字牌・端牌から切る。リーチ・鳴きはしない。
 * レベル2：シャンテン数を最優先し、受入枚数を比較。ドラ・赤ドラ・役牌の対子の価値を考える。
 *          テンパイしたら（待ちが残っていれば）リーチ。役が確定する鳴き（役牌のポン、喰いタン、染め）だけをする。
 * レベル3：レベル2に加えて、リーチ者がいるときの押し引き（シャンテン数・残り巡目・順位）と、
 *          現物・字牌・筋・壁による危険度の簡易評価。打点（ドラ・役牌）をより重く見る。
 *          オーラスはトップなら早めに降り、ラスなら押す。
 *
 * ctx は MJ.gameEngine.contextFor が作る局面情報。
 */
(function (MJ) {
  'use strict';

  const DRAGONS = [31, 32, 33];

  function windKind(wind) { return 27 + MJ.gameEngine.WINDS.indexOf(wind); }

  function isYakuhai(kind, ctx) {
    return DRAGONS.indexOf(kind) >= 0 || kind === windKind(ctx.seatWind) || kind === windKind(ctx.roundWind);
  }

  function isYaochu(k) { return k >= 27 || k % 9 === 0 || k % 9 === 8; }

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

  /* レベル1の「残す価値」 */
  function keepValue(kind, counts, ctx) {
    let v = connection(kind, counts) * 10 + positionValue(kind) * 3;
    if (kind >= 27) v += isYakuhai(kind, ctx) ? 4 : -2;
    return v;
  }

  /* 打点の価値（レベル2以上）：その牌を切ると失うもの */
  function valueLoss(kind, tiles, counts, ctx) {
    let loss = 0;
    if ((ctx.doraKinds || []).indexOf(kind) >= 0) loss += 8;
    const same = tiles.filter(function (t) { return t.kind === kind; });
    if (same.length && same.every(function (t) { return t.isRed; })) loss += 6;
    if (kind >= 27 && isYakuhai(kind, ctx) && counts[kind] >= 2) loss += 10;
    return loss;
  }

  /* ---------- 危険度（レベル3） ---------- */

  /* 筋：1-4-7、2-5-8、3-6-9。両側が安全牌なら筋、片側なら片筋 */
  function sujiSafety(kind, safe) {
    if (kind >= 27) return 0;
    const r = kind % 9;
    const lowSafe = r - 3 >= 0 && safe.indexOf(kind - 3) >= 0;
    const highSafe = r + 3 <= 8 && safe.indexOf(kind + 3) >= 0;
    if (r <= 2) return highSafe ? 2 : 0;      // 1・2・3 は上側の筋だけ
    if (r >= 6) return lowSafe ? 2 : 0;       // 7・8・9 は下側の筋だけ
    return (lowSafe ? 1 : 0) + (highSafe ? 1 : 0);   // 4・5・6 は両側で完全
  }

  /* 危険度 0〜100（0 = 現物） */
  function dangerOf(kind, opp, visible) {
    if (opp.safe.indexOf(kind) >= 0) return 0;
    if (kind >= 27) {
      const seen = visible[kind];
      return seen >= 3 ? 3 : seen === 2 ? 10 : seen === 1 ? 20 : 30;
    }
    const r = kind % 9 + 1;
    let base = r === 1 || r === 9 ? 40 : r === 2 || r === 8 ? 55 : 70;
    const s = sujiSafety(kind, opp.safe);
    if (s >= 2) base *= 0.35;
    else if (s === 1) base *= 0.7;
    /* 壁：隣の牌が4枚見えていれば、その牌を使う両面待ちはない */
    const pos = kind % 9;
    if ((pos > 0 && visible[kind - 1] >= 4) || (pos < 8 && visible[kind + 1] >= 4)) base *= 0.6;
    return Math.round(base);
  }

  function maxDanger(kind, ctx) {
    return ctx.opponents.filter(function (o) { return o.riichi; }).reduce(function (m, o) {
      return Math.max(m, dangerOf(kind, o, ctx.visible));
    }, 0);
  }

  /* 押し引き：true なら手を進める、false なら降りる */
  function shouldPush(shanten, ctx) {
    const top = ctx.isAllLast && ctx.rank === 1;
    const last = ctx.isAllLast && ctx.rank === 4;
    if (shanten <= 0) return !top || ctx.wallLeft > 20;
    if (last) return shanten <= 2;
    if (top) return false;
    if (shanten === 1) return ctx.wallLeft >= 30;
    return false;
  }

  /* 同じ種類が複数あるとき、どの1枚を切るか：ツモ牌（ツモ切り）→ 赤でない牌 の順 */
  function pickTile(tiles, kind, drawn) {
    if (drawn && drawn.kind === kind && !drawn.isRed) return drawn;
    const same = tiles.filter(function (t) { return t.kind === kind; });
    return same.find(function (t) { return !t.isRed; }) || same[0];
  }

  function defaults(ctx) {
    const c = Object.assign({ level: 1, seatWind: 'east', roundWind: 'east', doraKinds: [], meldCount: 0, forbidKinds: [],
      opponents: [], wallLeft: 70, rank: 2, isAllLast: false, kuitan: true }, ctx || {});
    return c;
  }

  /*
   * 打牌の選択。hand：手牌、drawn：ツモ牌（鳴いた直後は null）
   * 戻り値：{ tile, kind, score, shanten, reasons, candidates, fold }
   *   score は 0〜100 の評価値（大きいほど「切ってよい」）
   */
  function chooseDiscard(hand, drawn, ctxIn) {
    const ctx = defaults(ctxIn);
    const tiles = drawn ? hand.concat([drawn]) : hand.slice();
    const counts = MJ.shanten.countsOf(tiles);
    const meldCount = ctx.meldCount || 0;
    const visible = ctx.visible || counts;
    const opt = { meldCount: meldCount };
    const forbidAll = tiles.every(function (t) { return ctx.forbidKinds.indexOf(t.kind) >= 0; });

    const evals = [];
    for (let k = 0; k < MJ.TILE_KIND_COUNT; k++) {
      if (!counts[k]) continue;
      if (!forbidAll && ctx.forbidKinds.indexOf(k) >= 0) continue;
      counts[k]--;
      const s = MJ.shanten.calc(counts, opt);
      const u = ctx.level >= 2 ? MJ.ukeire.ukeire(counts, visible, opt).count : 0;
      counts[k]++;
      evals.push({ kind: k, shanten: s, ukeire: u, keep: keepValue(k, counts, ctx), loss: ctx.level >= 2 ? valueLoss(k, tiles, counts, ctx) : 0, danger: 0 });
    }
    const minShanten = evals.reduce(function (m, e) { return Math.min(m, e.shanten); }, Infinity);
    const riichiOpp = ctx.level >= 3 && ctx.opponents.some(function (o) { return o.riichi; });
    const fold = riichiOpp && !shouldPush(minShanten, ctx);
    const lossWeight = ctx.level >= 3 ? 1 : 0.6;

    evals.forEach(function (e) {
      e.keepsShanten = e.shanten === minShanten;
      if (riichiOpp) e.danger = maxDanger(e.kind, ctx);
      if (ctx.level === 1) {
        e.rank = (e.keepsShanten ? 1000 : 0) + (100 - e.keep);
      } else if (fold) {
        e.rank = -e.danger * 10 - e.shanten * 5 + e.ukeire * 0.05;
      } else {
        e.rank = -e.shanten * 100 + e.ukeire - e.loss * lossWeight - e.keep * 0.02 - (riichiOpp ? e.danger * 0.6 : 0);
      }
      e.score = Math.max(0, Math.min(100, Math.round(100 - e.keep - (e.keepsShanten ? 0 : 40))));
    });
    evals.sort(function (a, b) { return b.rank - a.rank || b.kind - a.kind; });
    const best = evals[0];

    const reasons = [];
    if (fold) {
      reasons.push('リーチ者がいるため降り');
      reasons.push(best.danger === 0 ? '現物' : '危険度' + best.danger);
    } else {
      if (best.keepsShanten) reasons.push('シャンテン数維持');
      if (ctx.level >= 2) reasons.push('受入' + best.ukeire + '枚');
      if (connection(best.kind, counts) === 0) reasons.push('孤立牌');
      if (best.kind >= 27) reasons.push(isYakuhai(best.kind, ctx) ? '役牌だが不要' : '役のない字牌');
      else if (positionValue(best.kind) === 0) reasons.push('端牌');
      if (riichiOpp) reasons.push('危険度' + best.danger);
    }
    return {
      tile: pickTile(tiles, best.kind, drawn),
      kind: best.kind,
      score: Math.max(0, Math.min(100, ctx.level === 1 ? best.score : Math.round(fold ? 100 - best.danger : 60 + best.ukeire / 2 - best.loss))),
      shanten: best.shanten,
      ukeire: best.ukeire,
      danger: best.danger,
      fold: fold,
      reasons: reasons,
      candidates: evals.slice(0, 4).map(function (e) {
        return { code: MJ.tiles.kindToCode(e.kind), shanten: e.shanten, ukeire: e.ukeire, danger: e.danger };
      })
    };
  }

  /* ---------- 手番の行動（ツモ・リーチ・カン・九種九牌・打牌） ---------- */

  function bestShanten13(tiles, meldCount) {
    const c = MJ.shanten.countsOf(tiles);
    let best = Infinity;
    for (let k = 0; k < 34; k++) {
      if (!c[k]) continue;
      c[k]--;
      best = Math.min(best, MJ.shanten.calc(c, { meldCount: meldCount }));
      c[k]++;
    }
    return best;
  }

  /*
   * opts：MJ.gameEngine.turnOptions の結果
   * 戻り値：{ action: 'tsumo'|'kyuushu'|'ankan'|'kakan'|'riichi'|'discard', kind, tile, reasons, decision }
   */
  function decideTurn(hand, drawn, ctxIn, opts) {
    const ctx = defaults(ctxIn);
    const o = opts || {};
    const tiles = drawn ? hand.concat([drawn]) : hand.slice();
    if (o.tsumo) return { action: 'tsumo', reasons: ['和了'] };

    if (o.kyuushu) {
      const kinds = MJ.agari.YAOCHU.filter(function (k) { return tiles.some(function (t) { return t.kind === k; }); }).length;
      if (ctx.level === 1 || kinds < 11) return { action: 'kyuushu', reasons: ['么九牌' + kinds + '種'] };
    }

    const riichiOpp = ctx.opponents.some(function (x) { return x.riichi; });
    if (ctx.level >= 2) {
      const before = bestShanten13(tiles, ctx.meldCount);
      const kanOk = function () { return !(ctx.level >= 3 && riichiOpp && before >= 1); };
      for (let i = 0; i < (o.ankan || []).length; i++) {
        const k = o.ankan[i];
        const rest = tiles.filter(function (t) { return t.kind !== k; });
        const after = MJ.shanten.calc(MJ.shanten.countsOf(rest), { meldCount: ctx.meldCount + 1 });
        if (ctx.riichi || (after <= before && kanOk())) return { action: 'ankan', kind: k, reasons: ['暗槓（形を崩さない）'] };
      }
      if ((o.kakan || []).length && kanOk()) return { action: 'kakan', kind: o.kakan[0], reasons: ['加槓'] };
    }

    if (ctx.riichi) return { action: 'discard', tile: drawn, kind: drawn.kind, reasons: ['リーチ中のツモ切り'], decision: null };

    if (ctx.level >= 2 && (o.riichiTiles || []).length) {
      /* 待ちの残り枚数が最も多くなる牌でリーチ */
      let best = null;
      const ids = o.riichiTiles;
      const visible = ctx.visible || MJ.shanten.countsOf(tiles);
      tiles.forEach(function (t) {
        if (ids.indexOf(t.id) < 0) return;
        const rest = tiles.filter(function (x) { return x !== t; });
        const u = MJ.ukeire.ukeire(MJ.shanten.countsOf(rest), visible, { meldCount: ctx.meldCount }).count;
        const danger = ctx.level >= 3 && riichiOpp ? maxDanger(t.kind, ctx) : 0;
        const rank = u * 10 - danger;
        if (!best || rank > best.rank) best = { tile: t, u: u, rank: rank };
      });
      if (best && best.u > 0) {
        return { action: 'riichi', tile: pickTile(tiles, best.tile.kind, drawn), kind: best.tile.kind, reasons: ['テンパイ', '待ち残り' + best.u + '枚'] };
      }
    }

    const d = chooseDiscard(hand, drawn, ctx);
    return { action: 'discard', tile: d.tile, kind: d.kind, reasons: d.reasons, decision: d };
  }

  /* ---------- 鳴き ---------- */

  /* 鳴いた後に役が確定するか（役牌・喰いタン・染め手の簡易判定） */
  function yakuAfterCall(handAfter, melds, ctx) {
    if (melds.some(function (m) { return m.type !== 'shuntsu' && m.kind >= 27 && isYakuhai(m.kind, ctx); })) return '役牌';
    const meldKinds = [];
    melds.forEach(function (m) { if (m.type === 'shuntsu') meldKinds.push(m.kind, m.kind + 1, m.kind + 2); else meldKinds.push(m.kind); });
    if (ctx.kuitan && meldKinds.every(function (k) { return !isYaochu(k); }) &&
      handAfter.filter(function (t) { return isYaochu(t.kind); }).length <= 1) return '断么九';
    const suits = {};
    meldKinds.forEach(function (k) { if (k < 27) suits[Math.floor(k / 9)] = true; });
    const ks = Object.keys(suits);
    if (ks.length === 1) {
      const s = Number(ks[0]);
      const off = handAfter.filter(function (t) { return t.kind < 27 && Math.floor(t.kind / 9) !== s; }).length;
      if (off <= 1) return '混一色';
    }
    return null;
  }

  /*
   * offer：{ tile, pon, kan, chi: [[a, b], ...] }
   * 戻り値：{ type: 'pon' | 'chi' | 'skip', chi, reasons }
   */
  function decideCall(hand, ctxIn, offer) {
    const ctx = defaults(ctxIn);
    if (ctx.level < 2 || ctx.riichi) return { type: 'skip', reasons: ctx.level < 2 ? ['レベル1は鳴かない'] : ['リーチ中'] };
    const riichiOpp = ctx.opponents.some(function (x) { return x.riichi; });
    const s1 = MJ.shanten.calc(MJ.shanten.countsOf(hand), { meldCount: ctx.meldCount });
    if (ctx.level >= 3 && riichiOpp && !shouldPush(s1, ctx)) return { type: 'skip', reasons: ['リーチ者がいるため鳴かない'] };

    const melds = ctx.melds || [];
    const options = [];
    function remove(kinds) {
      const rest = hand.slice();
      kinds.forEach(function (k) {
        const i = rest.findIndex(function (t) { return t.kind === k; });
        rest.splice(i, 1);
      });
      return rest;
    }
    if (offer.pon) {
      const rest = remove([offer.tile.kind, offer.tile.kind]);
      options.push({ type: 'pon', rest: rest, meld: { type: 'koutsu', kind: offer.tile.kind } });
    }
    (offer.chi || []).forEach(function (pair, i) {
      const rest = remove(pair);
      options.push({ type: 'chi', chi: i, rest: rest, meld: { type: 'shuntsu', kind: Math.min(pair[0], pair[1], offer.tile.kind) } });
    });

    let best = null;
    options.forEach(function (op) {
      const yaku = yakuAfterCall(op.rest, melds.concat([op.meld]), ctx);
      if (!yaku) return;
      const s2 = bestShanten13(op.rest, ctx.meldCount + 1);
      const yakuhaiPon = op.type === 'pon' && yaku === '役牌' && op.meld.kind >= 27;
      if (!(s2 < s1 || (yakuhaiPon && s2 <= s1))) return;
      const rank = -s2 * 10 + (op.type === 'pon' ? 1 : 0);
      if (!best || rank > best.rank) best = { op: op, rank: rank, yaku: yaku, s2: s2 };
    });
    if (!best) return { type: 'skip', reasons: ['役が確定しない、または手が進まない'] };
    return { type: best.op.type, chi: best.op.chi, reasons: [best.yaku, 'シャンテン数 ' + s1 + '→' + best.s2] };
  }

  /* デバッグ表示用の文章 例）「CPU東（シオン）：3索を選択　理由：シャンテン数維持、孤立牌　評価値：72」 */
  function describe(player, wind, decision) {
    return 'CPU' + MJ.gameEngine.WIND_KANJI[wind] + '（' + player.name + '）：' +
      MJ.tiles.kindName(decision.kind) + 'を選択　理由：' + (decision.reasons.join('、') || '—') +
      '　評価値：' + decision.score;
  }

  const ACTION_NAME = { tsumo: 'ツモ和了', kyuushu: '九種九牌', ankan: '暗槓', kakan: '加槓', riichi: 'リーチ', pon: 'ポン', chi: 'チー', skip: '見送り' };

  function describeAction(player, wind, act) {
    const what = act.kind != null ? MJ.tiles.kindName(act.kind) + 'で' : '';
    return 'CPU' + MJ.gameEngine.WIND_KANJI[wind] + '（' + player.name + '）：' + what + ACTION_NAME[act.type || act.action] +
      '　理由：' + ((act.reasons || []).join('、') || '—');
  }

  MJ.cpuPlayer = {
    chooseDiscard: chooseDiscard,
    decideTurn: decideTurn,
    decideCall: decideCall,
    describe: describe,
    describeAction: describeAction,
    pickTile: pickTile,
    keepValue: keepValue,
    isYakuhai: isYakuhai,
    dangerOf: dangerOf,
    sujiSafety: sujiSafety,
    shouldPush: shouldPush,
    yakuAfterCall: yakuAfterCall
  };
})(window.MJ = window.MJ || {});
