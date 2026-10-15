/*
 * 役判定（DOM非依存）。役は定義の配列 YAKU で管理し、追加は skills/add-yaku.skill.md の手順で行う。
 *
 * 各役の定義：
 *   id, name
 *   han       門前の翻数
 *   hanOpen   副露時の翻数（0 = 副露では不成立）
 *   yakuman   役満なら 1
 *   forms     対象の和了形（'normal' / 'chiitoitsu' / 'kokushi'）
 *   excludes  この役が成立したときに外す役の id
 *   test(h)   h は「解釈＋状況」をまとめた情報（下の makeView を参照）
 *
 * 簡略化しているルール：二盃口は未実装（一盃口が2組でも一盃口1翻）。ダブル役満は役満1倍として扱う。
 */
(function (MJ) {
  'use strict';

  const DRAGONS = [31, 32, 33];
  const WIND_KIND = { east: 27, south: 28, west: 29, north: 30 };

  function isYaochu(k) { return k >= 27 || k % 9 === 0 || k % 9 === 8; }
  function isHonor(k) { return k >= 27; }
  function suitOf(k) { return k >= 27 ? 3 : Math.floor(k / 9); }
  function groupKinds(g) { return g.type === 'shuntsu' ? [g.kind, g.kind + 1, g.kind + 2] : [g.kind]; }

  /*
   * 解釈（agari.interpretations の1つ）と状況から、役判定に使う情報をまとめる。
   * ctx: { isTsumo, seatWind, roundWind, riichi, ippatsu, haitei, houtei, rinshan, chankan, kuitan, counts（全牌の枚数） }
   */
  function makeView(interp, ctx) {
    const v = { form: interp.form, ctx: ctx, interp: interp };
    v.isMenzen = !(interp.groups || []).some(function (g) { return g.open; });
    if (interp.form !== 'normal') v.isMenzen = true;
    v.counts = ctx.counts;
    v.kinds = [];
    ctx.counts.forEach(function (n, k) { if (n > 0) v.kinds.push(k); });
    if (interp.form === 'normal') {
      v.groups = interp.groups;
      v.pair = interp.pair;
      v.shuntsu = interp.groups.filter(function (g) { return g.type === 'shuntsu'; });
      v.koutsu = interp.groups.filter(function (g) { return g.type !== 'shuntsu'; });
      v.ankou = v.koutsu.filter(function (g) { return g.concealed; }).length;
    }
    v.seatWindKind = WIND_KIND[ctx.seatWind];
    v.roundWindKind = WIND_KIND[ctx.roundWind];
    return v;
  }

  function hasKoutsu(v, kind) {
    return v.koutsu.some(function (g) { return g.kind === kind; });
  }

  function yakuhaiDef(id, name, kindOf) {
    return {
      id: id, name: name, han: 1, hanOpen: 1, forms: ['normal'],
      test: function (v) { return hasKoutsu(v, kindOf(v)); }
    };
  }

  /* 全ブロック（面子＋雀頭）が条件を満たすか */
  function everyBlock(v, fn) {
    return v.groups.every(function (g) { return groupKinds(g).some(fn); }) && fn(v.pair);
  }

  const YAKU = [
    /* ---- 役満 ---- */
    { id: 'kokushi', name: '国士無双', yakuman: 1, forms: ['kokushi'], test: function () { return true; } },
    { id: 'suuankou', name: '四暗刻', yakuman: 1, forms: ['normal'],
      test: function (v) { return v.isMenzen && v.ankou === 4; } },
    { id: 'daisangen', name: '大三元', yakuman: 1, forms: ['normal'],
      test: function (v) { return DRAGONS.every(function (k) { return hasKoutsu(v, k); }); } },

    /* ---- 状況役 ---- */
    { id: 'riichi', name: '立直', han: 1, hanOpen: 0, forms: ['normal', 'chiitoitsu'],
      test: function (v) { return !!v.ctx.riichi; } },
    { id: 'ippatsu', name: '一発', han: 1, hanOpen: 0, forms: ['normal', 'chiitoitsu'],
      test: function (v) { return !!v.ctx.riichi && !!v.ctx.ippatsu; } },
    { id: 'tsumo', name: '門前清自摸和', han: 1, hanOpen: 0, forms: ['normal', 'chiitoitsu'],
      test: function (v) { return v.isMenzen && !!v.ctx.isTsumo; } },
    { id: 'haitei', name: '海底摸月', han: 1, hanOpen: 1, forms: ['normal', 'chiitoitsu'],
      test: function (v) { return !!v.ctx.isTsumo && !!v.ctx.haitei && !v.ctx.rinshan; } },
    { id: 'houtei', name: '河底撈魚', han: 1, hanOpen: 1, forms: ['normal', 'chiitoitsu'],
      test: function (v) { return !v.ctx.isTsumo && !!v.ctx.houtei; } },
    { id: 'rinshan', name: '嶺上開花', han: 1, hanOpen: 1, forms: ['normal'],
      test: function (v) { return !!v.ctx.isTsumo && !!v.ctx.rinshan; } },
    { id: 'chankan', name: '槍槓', han: 1, hanOpen: 1, forms: ['normal'],
      test: function (v) { return !v.ctx.isTsumo && !!v.ctx.chankan; } },

    /* ---- 役牌 ---- */
    yakuhaiDef('haku', '役牌 白', function () { return 31; }),
    yakuhaiDef('hatsu', '役牌 發', function () { return 32; }),
    yakuhaiDef('chun', '役牌 中', function () { return 33; }),
    yakuhaiDef('bakaze', '場風', function (v) { return v.roundWindKind; }),
    yakuhaiDef('jikaze', '自風', function (v) { return v.seatWindKind; }),

    /* ---- 手役 ---- */
    { id: 'tanyao', name: '断么九', han: 1, hanOpen: 1, forms: ['normal', 'chiitoitsu'],
      test: function (v) {
        if (!v.isMenzen && v.ctx.kuitan === false) return false;
        return v.kinds.every(function (k) { return !isYaochu(k); });
      } },
    { id: 'pinfu', name: '平和', han: 1, hanOpen: 0, forms: ['normal'],
      test: function (v) {
        if (!v.isMenzen || v.koutsu.length > 0 || v.interp.wait !== 'ryanmen') return false;
        const p = v.pair;
        return DRAGONS.indexOf(p) < 0 && p !== v.seatWindKind && p !== v.roundWindKind;
      } },
    { id: 'iipeikou', name: '一盃口', han: 1, hanOpen: 0, forms: ['normal'],
      test: function (v) {
        if (!v.isMenzen) return false;
        const ks = v.shuntsu.map(function (g) { return g.kind; }).sort(function (a, b) { return a - b; });
        for (let i = 1; i < ks.length; i++) if (ks[i] === ks[i - 1]) return true;
        return false;
      } },
    { id: 'chiitoitsu', name: '七対子', han: 2, hanOpen: 0, forms: ['chiitoitsu'], test: function () { return true; } },
    { id: 'toitoi', name: '対々和', han: 2, hanOpen: 2, forms: ['normal'],
      test: function (v) { return v.koutsu.length === 4; } },
    { id: 'sanankou', name: '三暗刻', han: 2, hanOpen: 2, forms: ['normal'],
      test: function (v) { return v.ankou === 3; } },
    { id: 'sanshoku', name: '三色同順', han: 2, hanOpen: 1, forms: ['normal'],
      test: function (v) {
        return v.shuntsu.some(function (g) {
          const n = g.kind % 9;
          return [0, 1, 2].every(function (s) {
            return v.shuntsu.some(function (h) { return h.kind === s * 9 + n; });
          });
        });
      } },
    { id: 'ittsu', name: '一気通貫', han: 2, hanOpen: 1, forms: ['normal'],
      test: function (v) {
        return [0, 1, 2].some(function (s) {
          return [0, 3, 6].every(function (n) {
            return v.shuntsu.some(function (g) { return g.kind === s * 9 + n; });
          });
        });
      } },
    { id: 'chanta', name: '混全帯么九', han: 2, hanOpen: 1, forms: ['normal'],
      test: function (v) {
        return v.shuntsu.length > 0 && v.kinds.some(isHonor) && everyBlock(v, isYaochu);
      } },
    { id: 'junchan', name: '純全帯么九', han: 3, hanOpen: 2, forms: ['normal'], excludes: ['chanta'],
      test: function (v) {
        return v.shuntsu.length > 0 && !v.kinds.some(isHonor) &&
          everyBlock(v, function (k) { return !isHonor(k) && isYaochu(k); });
      } },
    { id: 'shousangen', name: '小三元', han: 2, hanOpen: 2, forms: ['normal'],
      test: function (v) {
        return DRAGONS.indexOf(v.pair) >= 0 &&
          DRAGONS.filter(function (k) { return hasKoutsu(v, k); }).length === 2;
      } },
    { id: 'honitsu', name: '混一色', han: 3, hanOpen: 2, forms: ['normal', 'chiitoitsu'],
      test: function (v) {
        const suits = {};
        v.kinds.forEach(function (k) { suits[suitOf(k)] = true; });
        return !!suits[3] && Object.keys(suits).length === 2;
      } },
    { id: 'chinitsu', name: '清一色', han: 6, hanOpen: 5, forms: ['normal', 'chiitoitsu'], excludes: ['honitsu'],
      test: function (v) {
        const suits = {};
        v.kinds.forEach(function (k) { suits[suitOf(k)] = true; });
        return !suits[3] && Object.keys(suits).length === 1;
      } }
  ];

  /*
   * 解釈1つに対する役の一覧を返す。
   * 戻り値：[{ id, name, han, yakuman }]（役満があれば役満だけ）
   */
  function evaluate(interp, ctx) {
    const v = makeView(interp, ctx);
    const hits = YAKU.filter(function (y) {
      if (y.forms.indexOf(interp.form) < 0) return false;
      if (!y.yakuman && !v.isMenzen && !y.hanOpen) return false;
      return y.test(v);
    });
    const yakuman = hits.filter(function (y) { return y.yakuman; });
    if (yakuman.length) {
      return yakuman.map(function (y) { return { id: y.id, name: y.name, han: 13, yakuman: y.yakuman }; });
    }
    const excluded = {};
    hits.forEach(function (y) { (y.excludes || []).forEach(function (id) { excluded[id] = true; }); });
    return hits.filter(function (y) { return !excluded[y.id]; }).map(function (y) {
      return { id: y.id, name: y.name, han: v.isMenzen ? y.han : y.hanOpen, yakuman: 0 };
    });
  }

  MJ.yaku = {
    YAKU: YAKU,
    WIND_KIND: WIND_KIND,
    DRAGONS: DRAGONS,
    isYaochu: isYaochu,
    evaluate: evaluate,
    makeView: makeView,
    /* 実装済みの役の名前一覧（README・画面表示用） */
    names: function () { return YAKU.map(function (y) { return y.name; }); }
  };
})(window.MJ = window.MJ || {});
