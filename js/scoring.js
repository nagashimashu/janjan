/*
 * 符・翻・点数計算（DOM非依存）。
 *
 * score(tiles, winTile, ctx) が入口。手の内の牌（和了牌を除く）と和了牌、状況から、
 * すべての解釈を役判定・符計算し、最も点数の高い解釈を返す。
 *
 * ctx: {
 *   isTsumo, isDealer, seatWind, roundWind,
 *   doraKinds: [kind], uraDoraKinds: [kind],
 *   riichi, ippatsu, haitei, houtei, rinshan, chankan,
 *   melds: [{ type, kind, concealed }],     // 副露（フェーズ5）
 *   honba, riichiSticks, kuitan
 * }
 *
 * 採用ルール：切り上げ満貫なし、数え役満あり（13翻以上）、ダブル役満は役満1倍、
 *             連風牌の雀頭は4符（場風2符＋自風2符）、喰い平和形のロンは30符。
 */
(function (MJ) {
  'use strict';

  const LIMITS = [
    { han: 13, base: 8000, label: '数え役満' },
    { han: 11, base: 6000, label: '三倍満' },
    { han: 8, base: 4000, label: '倍満' },
    { han: 6, base: 3000, label: '跳満' },
    { han: 5, base: 2000, label: '満貫' }
  ];

  function ceil100(n) { return Math.ceil(n / 100) * 100; }
  function ceil10(n) { return Math.ceil(n / 10) * 10; }

  /* 符計算。戻り値 { fu, parts: [{ label, fu }] } */
  function calcFu(interp, view, yakuIds, ctx) {
    if (interp.form === 'chiitoitsu') return { fu: 25, parts: [{ label: '七対子', fu: 25 }] };
    if (interp.form === 'kokushi') return { fu: 0, parts: [] };
    const isPinfu = yakuIds.indexOf('pinfu') >= 0;
    if (isPinfu && ctx.isTsumo) return { fu: 20, parts: [{ label: '平和ツモ', fu: 20 }] };

    const parts = [{ label: '副底', fu: 20 }];
    if (view.isMenzen && !ctx.isTsumo) parts.push({ label: '門前ロン', fu: 10 });
    if (ctx.isTsumo) parts.push({ label: 'ツモ', fu: 2 });

    interp.groups.forEach(function (g) {
      if (g.type === 'shuntsu') return;
      const yaochu = MJ.yaku.isYaochu(g.kind);
      let fu = g.concealed ? 4 : 2;
      if (yaochu) fu *= 2;
      if (g.type === 'kantsu') fu *= 4;
      const name = MJ.tiles.kindName(g.kind);
      parts.push({ label: (g.type === 'kantsu' ? (g.concealed ? '暗槓' : '明槓') : (g.concealed ? '暗刻' : '明刻')) + ' ' + name, fu: fu });
    });

    const p = interp.pair;
    if (MJ.yaku.DRAGONS.indexOf(p) >= 0) parts.push({ label: '役牌の雀頭', fu: 2 });
    if (p === view.seatWindKind) parts.push({ label: '自風の雀頭', fu: 2 });
    if (p === view.roundWindKind) parts.push({ label: '場風の雀頭', fu: 2 });

    if (interp.wait === 'kanchan' || interp.wait === 'penchan' || interp.wait === 'tanki') {
      parts.push({ label: { kanchan: '嵌張待ち', penchan: '辺張待ち', tanki: '単騎待ち' }[interp.wait], fu: 2 });
    }

    let total = parts.reduce(function (s, x) { return s + x.fu; }, 0);
    total = ceil10(total);
    /* 副露していて符が付かない形のロン（喰い平和形）は30符 */
    if (!view.isMenzen && total === 20) total = 30;
    return { fu: total, parts: parts };
  }

  /* 基本点と満貫以上の名前 */
  function basePoints(han, fu, yakumanCount) {
    if (yakumanCount > 0) return { base: 8000 * Math.min(1, yakumanCount), label: '役満' };
    for (let i = 0; i < LIMITS.length; i++) {
      if (han >= LIMITS[i].han) return { base: LIMITS[i].base, label: LIMITS[i].label };
    }
    const base = fu * Math.pow(2, han + 2);
    if (base >= 2000) return { base: 2000, label: '満貫' };
    return { base: base, label: '' };
  }

  /* 支払い（本場・供託は含まない） */
  function payments(base, isDealer, isTsumo) {
    if (!isTsumo) {
      const ron = ceil100(base * (isDealer ? 6 : 4));
      return { ron: ron, total: ron };
    }
    if (isDealer) {
      const each = ceil100(base * 2);
      return { tsumoChild: each, tsumoDealer: 0, total: each * 3 };
    }
    const child = ceil100(base);
    const dealer = ceil100(base * 2);
    return { tsumoChild: child, tsumoDealer: dealer, total: child * 2 + dealer };
  }

  function countDora(counts, kinds) {
    return (kinds || []).reduce(function (n, k) { return n + counts[k]; }, 0);
  }

  /*
   * tiles：手の内の牌（和了牌を除く 3n+1 枚）、winTile：和了牌
   * 戻り値：最も高い解釈の結果。和了形でない／役がない場合は { ok: false, reason }
   */
  function score(tiles, winTile, ctx) {
    const all = tiles.concat([winTile]);
    const counts = MJ.shanten.countsOf(all);
    const melds = ctx.melds || [];
    const meldTilesCounts = MJ.ukeire.zeros();
    melds.forEach(function (m) {
      const ks = m.type === 'shuntsu' ? [m.kind, m.kind + 1, m.kind + 2] : [m.kind, m.kind, m.kind].concat(m.type === 'kantsu' ? [m.kind] : []);
      ks.forEach(function (k) { meldTilesCounts[k]++; });
    });
    const fullCounts = MJ.ukeire.addCounts(counts, meldTilesCounts);

    const interps = MJ.agari.interpretations(counts, winTile.kind, { melds: melds, isTsumo: ctx.isTsumo });
    if (!interps.length) return { ok: false, reason: '和了形ではありません' };

    const yctx = {
      isTsumo: ctx.isTsumo, seatWind: ctx.seatWind, roundWind: ctx.roundWind,
      riichi: ctx.riichi, ippatsu: ctx.ippatsu, haitei: ctx.haitei, houtei: ctx.houtei,
      rinshan: ctx.rinshan, chankan: ctx.chankan,
      kuitan: ctx.kuitan !== false, counts: fullCounts
    };

    let best = null;
    interps.forEach(function (interp) {
      const yaku = MJ.yaku.evaluate(interp, yctx);
      if (!yaku.length) return;
      const view = MJ.yaku.makeView(interp, yctx);
      const yakumanCount = yaku.reduce(function (n, y) { return n + y.yakuman; }, 0);
      const yakuHan = yaku.reduce(function (n, y) { return n + y.han; }, 0);
      const dora = { dora: 0, aka: 0, ura: 0 };
      if (!yakumanCount) {
        dora.dora = countDora(fullCounts, ctx.doraKinds);
        dora.aka = all.filter(function (t) { return t.isRed; }).length + (ctx.redInMelds || 0);
        dora.ura = ctx.riichi ? countDora(fullCounts, ctx.uraDoraKinds) : 0;
      }
      const han = yakumanCount ? 13 * yakumanCount : yakuHan + dora.dora + dora.aka + dora.ura;
      const fu = yakumanCount ? { fu: 0, parts: [] } : calcFu(interp, view, yaku.map(function (y) { return y.id; }), ctx);
      const bp = basePoints(han, fu.fu, yakumanCount);
      const pay = payments(bp.base, !!ctx.isDealer, !!ctx.isTsumo);
      const r = {
        ok: true, interp: interp, yaku: yaku, dora: dora, han: han, fu: fu.fu, fuParts: fu.parts,
        yakuman: yakumanCount, base: bp.base, label: bp.label, payments: pay,
        isTsumo: !!ctx.isTsumo, isDealer: !!ctx.isDealer
      };
      if (!best || r.payments.total > best.payments.total ||
        (r.payments.total === best.payments.total && (r.han > best.han || (r.han === best.han && r.fu > best.fu)))) {
        best = r;
      }
    });
    if (!best) return { ok: false, reason: '役がありません' };
    return best;
  }

  /*
   * 点数移動。seats は4人分、winner/loser は席番号（ツモは loser = null）。
   * 本場：ロンは1本場300点を放銃者が、ツモは100点ずつ全員が支払う。供託は和了者が受け取る。
   */
  function settle(result, opts) {
    const deltas = [0, 0, 0, 0];
    const honba = opts.honba || 0;
    const sticks = opts.riichiSticks || 0;
    const w = opts.winner;
    if (!result.isTsumo) {
      const pay = result.payments.ron + honba * 300;
      deltas[opts.loser] -= pay;
      deltas[w] += pay;
    } else {
      for (let s = 0; s < 4; s++) {
        if (s === w) continue;
        const pay = (s === opts.dealer ? result.payments.tsumoDealer || result.payments.tsumoChild : result.payments.tsumoChild) + honba * 100;
        deltas[s] -= pay;
        deltas[w] += pay;
      }
    }
    deltas[w] += sticks * 1000;
    return deltas;
  }

  /* 表示用：「30符4翻 7,700点」「満貫 8,000点」「1,300・2,600点」など */
  function describe(result) {
    const p = result.payments;
    let pts;
    if (!result.isTsumo) pts = fmt(p.ron) + '点';
    else if (result.isDealer) pts = fmt(p.tsumoChild) + '点オール';
    else pts = fmt(p.tsumoChild) + '・' + fmt(p.tsumoDealer) + '点';
    const head = result.yakuman ? '役満' : (result.label || (result.fu + '符' + result.han + '翻'));
    return { head: head, detail: result.yakuman ? '' : result.fu + '符' + result.han + '翻', points: pts };
  }

  function fmt(n) { return n.toLocaleString('ja-JP'); }

  MJ.scoring = {
    calcFu: calcFu,
    basePoints: basePoints,
    payments: payments,
    score: score,
    settle: settle,
    describe: describe
  };
})(window.MJ = window.MJ || {});
