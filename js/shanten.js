/*
 * シャンテン数計算。入力は34種の枚数配列（counts[kind]）。
 *   -1 = 和了形 / 0 = 聴牌 / 1 = 一向聴 ...
 * 通常形（4面子1雀頭）・七対子・国士無双の最小値を返す。
 * 鳴いている場合は meldCount（副露数）を渡す。七対子・国士無双は門前のみ。
 */
(function (MJ) {
  'use strict';

  const YAOCHU = [0, 8, 9, 17, 18, 26, 27, 28, 29, 30, 31, 32, 33];

  function countsOf(tiles) {
    const c = new Array(MJ.TILE_KIND_COUNT).fill(0);
    tiles.forEach(function (t) { c[t.kind] += 1; });
    return c;
  }

  function total(c) {
    let n = 0;
    for (let i = 0; i < c.length; i++) n += c[i];
    return n;
  }

  /*
   * 通常形：シャンテン数 = 8 - 2×面子 - 塔子 - 雀頭（面子＋塔子は4まで）
   *
   * スート（萬・筒・索・字）ごとに「取りうる（面子, 塔子, 雀頭）の組」を全探索し、
   * 他の組に全要素で負ける組を除いてからキャッシュする。最後に4スートの組を掛け合わせる。
   * 受入計算では1スートだけが変わる計算を何百回も行うため、キャッシュがよく効く。
   */
  const suitCache = new Map();

  function suitOptions(c, start, len, isNum) {
    let key = isNum ? 'n' : 'z';
    for (let i = 0; i < len; i++) key += c[start + i];
    const cached = suitCache.get(key);
    if (cached) return cached;

    const a = c.slice(start, start + len);
    const found = [];

    function dfs(i, m, t, p) {
      while (i < len && a[i] === 0) i++;
      if (i >= len) { found.push([m, t, p]); return; }
      if (a[i] >= 3) { a[i] -= 3; dfs(i, m + 1, t, p); a[i] += 3; }
      if (isNum && i <= 6 && a[i + 1] > 0 && a[i + 2] > 0) {
        a[i]--; a[i + 1]--; a[i + 2]--;
        dfs(i, m + 1, t, p);
        a[i]++; a[i + 1]++; a[i + 2]++;
      }
      if (!p && a[i] >= 2) { a[i] -= 2; dfs(i, m, t, 1); a[i] += 2; }
      if (a[i] >= 2) { a[i] -= 2; dfs(i, m, t + 1, p); a[i] += 2; }
      if (isNum && i <= 7 && a[i + 1] > 0) { a[i]--; a[i + 1]--; dfs(i, m, t + 1, p); a[i]++; a[i + 1]++; }
      if (isNum && i <= 6 && a[i + 2] > 0) { a[i]--; a[i + 2]--; dfs(i, m, t + 1, p); a[i]++; a[i + 2]++; }
      a[i]--; dfs(i + 1, m, t, p); a[i]++;
    }
    dfs(0, 0, 0, 0);

    /* シャンテン数は面子・塔子・雀頭のどれについても単調なので、劣る組は捨ててよい */
    const pruned = found.filter(function (x, idx) {
      return !found.some(function (y, j) {
        if (j === idx) return false;
        const ge = y[0] >= x[0] && y[1] >= x[1] && y[2] >= x[2];
        const gt = y[0] > x[0] || y[1] > x[1] || y[2] > x[2];
        return ge && (gt || j < idx);
      });
    });
    suitCache.set(key, pruned);
    return pruned;
  }

  function normal(counts, meldCount) {
    const melds0 = meldCount || 0;
    const groups = [
      suitOptions(counts, 0, 9, true),
      suitOptions(counts, 9, 9, true),
      suitOptions(counts, 18, 9, true),
      suitOptions(counts, 27, 7, false)
    ];
    let best = 8 - 2 * melds0;

    function combine(g, m, t, p) {
      if (g === groups.length) {
        const mm = Math.min(m, 4);
        const s = 8 - 2 * mm - Math.min(t, 4 - mm) - p;
        if (s < best) best = s;
        return;
      }
      groups[g].forEach(function (o) {
        if (p + o[2] > 1) return;
        combine(g + 1, m + o[0], t + o[1], p + o[2]);
      });
    }
    combine(0, melds0, 0, 0);
    return best;
  }

  function chiitoitsu(c) {
    let pairs = 0;
    let kinds = 0;
    for (let i = 0; i < 34; i++) {
      if (c[i] >= 1) kinds++;
      if (c[i] >= 2) pairs++;
    }
    return 6 - pairs + Math.max(0, 7 - kinds);
  }

  function kokushi(c) {
    let kinds = 0;
    let pair = 0;
    YAOCHU.forEach(function (k) {
      if (c[k] >= 1) kinds++;
      if (c[k] >= 2) pair = 1;
    });
    return 13 - kinds - pair;
  }

  /* 種類ごとの内訳つき。options.meldCount（副露数） */
  function detail(counts, options) {
    const meldCount = (options && options.meldCount) || 0;
    const res = { normal: normal(counts, meldCount), chiitoitsu: Infinity, kokushi: Infinity };
    if (meldCount === 0) {
      res.chiitoitsu = chiitoitsu(counts);
      res.kokushi = kokushi(counts);
    }
    res.shanten = Math.min(res.normal, res.chiitoitsu, res.kokushi);
    return res;
  }

  function calc(counts, options) {
    return detail(counts, options).shanten;
  }

  function label(s) {
    if (s < 0) return '和了';
    if (s === 0) return '聴牌';
    return s + '向聴';
  }

  MJ.shanten = {
    countsOf: countsOf,
    total: total,
    normal: normal,
    chiitoitsu: chiitoitsu,
    kokushi: kokushi,
    detail: detail,
    calc: calc,
    label: label,
    /* 文字列表記から直接計算する（テスト・デバッグ用） */
    fromString: function (text, options) {
      return calc(countsOf(MJ.tiles.parse(text)), options);
    }
  };
})(window.MJ = window.MJ || {});
