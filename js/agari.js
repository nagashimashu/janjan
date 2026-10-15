/*
 * 和了形の判定と分解（DOM非依存）。
 *
 * 入力は「手の内の牌の種類別枚数（和了牌を含む）」と「和了牌の種類」。
 * 出力は和了形の解釈の一覧。1つの手に複数の解釈がありうる（例：234+234+... の取り方、和了牌がどの面子に入るか）。
 * 点数計算（scoring.js）は全解釈の中から最も高い点数を採用する。
 *
 * 解釈の形：
 *   { form: 'normal', pair: kind, groups: [{ type: 'shuntsu'|'koutsu', kind, concealed }], waitIndex, wait }
 *     groups には副露面子（melds）も含む。concealed=false は副露、またはロンで完成した刻子（明刻扱い）
 *     wait: 'ryanmen' | 'kanchan' | 'penchan' | 'shanpon' | 'tanki'
 *   { form: 'chiitoitsu', pairs: [kind×7], wait: 'tanki' }
 *   { form: 'kokushi', wait: 'tanki' | 'kokushi13' }
 */
(function (MJ) {
  'use strict';

  const YAOCHU = [0, 8, 9, 17, 18, 26, 27, 28, 29, 30, 31, 32, 33];

  function isAgari(counts, meldCount) {
    return MJ.shanten.calc(counts, { meldCount: meldCount || 0 }) === -1;
  }

  /* 手の内（3n+2枚）を 雀頭1つ＋面子n個 に分ける全通り */
  function decompose(counts) {
    const c = counts.slice();
    const results = [];
    const seen = {};

    function rec(i, groups) {
      while (i < 34 && c[i] === 0) i++;
      if (i >= 34) {
        const key = groups.map(function (g) { return g.type[0] + g.kind; }).sort().join(',');
        if (!seen[key]) { seen[key] = true; results.push(groups.slice()); }
        return;
      }
      if (c[i] >= 3) {
        c[i] -= 3;
        groups.push({ type: 'koutsu', kind: i });
        rec(i, groups);
        groups.pop();
        c[i] += 3;
      }
      if (i < 27 && i % 9 <= 6 && c[i + 1] > 0 && c[i + 2] > 0) {
        c[i]--; c[i + 1]--; c[i + 2]--;
        groups.push({ type: 'shuntsu', kind: i });
        rec(i, groups);
        groups.pop();
        c[i]++; c[i + 1]++; c[i + 2]++;
      }
    }

    const out = [];
    for (let p = 0; p < 34; p++) {
      if (c[p] < 2) continue;
      c[p] -= 2;
      results.length = 0;
      Object.keys(seen).forEach(function (k) { delete seen[k]; });
      rec(0, []);
      results.forEach(function (groups) { out.push({ pair: p, groups: groups }); });
      c[p] += 2;
    }
    return out;
  }

  /* 和了牌が順子のどこに入るかで待ちの形が決まる */
  function shuntsuWait(start, win) {
    const pos = start % 9;
    if (win === start + 1) return 'kanchan';
    if (win === start) return pos === 6 ? 'penchan' : 'ryanmen';      // 7 で 789 → 辺張
    return pos === 0 ? 'penchan' : 'ryanmen';                          // 3 で 123 → 辺張
  }

  /*
   * counts：手の内の枚数（和了牌を含む）、winKind：和了牌、
   * options：{ melds: [{ type, kind }]（副露）, isTsumo }
   */
  function interpretations(counts, winKind, options) {
    const o = options || {};
    /* 副露面子。暗槓（concealed）は門前を崩さない */
    const melds = (o.melds || []).map(function (m) { return { type: m.type, kind: m.kind, concealed: !!m.concealed, open: !m.concealed }; });
    const list = [];

    if (melds.length === 0) {
      /* 国士無双 */
      if (MJ.shanten.kokushi(counts) === -1) {
        const thirteen = counts[winKind] === 2;   // 和了牌が対子になった＝13面待ち
        list.push({ form: 'kokushi', wait: thirteen ? 'kokushi13' : 'tanki' });
        return list;
      }
      /* 七対子（同じ牌4枚は不可） */
      let pairs = 0;
      for (let k = 0; k < 34; k++) if (counts[k] === 2) pairs++;
      if (pairs === 7) {
        list.push({ form: 'chiitoitsu', pairs: counts.map(function (n, k) { return n === 2 ? k : -1; }).filter(function (k) { return k >= 0; }), wait: 'tanki' });
      }
    }

    decompose(counts).forEach(function (d) {
      const groups = d.groups.map(function (g) { return { type: g.type, kind: g.kind, concealed: true }; });
      const all = groups.concat(melds);
      /* 和了牌を含むブロックごとに1つの解釈 */
      if (d.pair === winKind) {
        list.push({ form: 'normal', pair: d.pair, groups: clone(all), waitIndex: -1, wait: 'tanki' });
      }
      groups.forEach(function (g, i) {
        let wait = null;
        if (g.type === 'koutsu' && g.kind === winKind) wait = 'shanpon';
        if (g.type === 'shuntsu' && winKind >= g.kind && winKind <= g.kind + 2) wait = shuntsuWait(g.kind, winKind);
        if (!wait) return;
        const gs = clone(all);
        /* ロンで完成した刻子は明刻として扱う（符・暗刻の数え方） */
        if (wait === 'shanpon' && !o.isTsumo) gs[i].concealed = false;
        list.push({ form: 'normal', pair: d.pair, groups: gs, waitIndex: i, wait: wait });
      });
    });
    return list;
  }

  function clone(groups) {
    return groups.map(function (g) { return { type: g.type, kind: g.kind, concealed: g.concealed, open: !!g.open }; });
  }

  /* 13枚（3n+1枚）の手で和了になる牌の種類。テンパイ判定・フリテン判定に使う */
  function waits(counts, meldCount) {
    const out = [];
    if (MJ.shanten.calc(counts, { meldCount: meldCount || 0 }) !== 0) return out;
    const c = counts.slice();
    for (let k = 0; k < 34; k++) {
      if (c[k] >= 4) continue;
      c[k]++;
      if (isAgari(c, meldCount)) out.push(k);
      c[k]--;
    }
    return out;
  }

  MJ.agari = {
    YAOCHU: YAOCHU,
    isAgari: isAgari,
    decompose: decompose,
    interpretations: interpretations,
    waits: waits,
    shuntsuWait: shuntsuWait
  };
})(window.MJ = window.MJ || {});
