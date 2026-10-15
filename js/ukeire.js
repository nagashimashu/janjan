/*
 * 受入計算。
 *   ukeire(counts13, visible)  … 13枚の手牌でシャンテン数が進む牌と残り枚数
 *   analyze(counts14, visible) … 14枚の各打牌候補ごとのシャンテン数・受入（何切る用）
 * visible は「自分から見えている牌」の34種枚数配列（手牌自身・ドラ表示牌・河など）。
 * 残り枚数 = 4 - visible[kind]（0未満にはしない）。
 */
(function (MJ) {
  'use strict';

  function zeros() { return new Array(MJ.TILE_KIND_COUNT).fill(0); }

  function addCounts(a, b) {
    const out = a.slice();
    for (let i = 0; i < out.length; i++) out[i] += b[i];
    return out;
  }

  function remainingOf(kind, visible) {
    return Math.max(0, MJ.COPIES_PER_KIND - visible[kind]);
  }

  /* 13枚（または 3n+1 枚）の手牌の受入 */
  function ukeire(counts, visible, options) {
    const c = counts.slice();
    const seen = visible || c;
    const base = MJ.shanten.calc(c, options);
    const tiles = [];
    let count = 0;
    for (let k = 0; k < MJ.TILE_KIND_COUNT; k++) {
      if (c[k] >= MJ.COPIES_PER_KIND) continue;
      c[k]++;
      const s = MJ.shanten.calc(c, options);
      c[k]--;
      if (s < base) {
        const rest = remainingOf(k, seen);
        tiles.push({ kind: k, code: MJ.tiles.kindToCode(k), remaining: rest });
        count += rest;
      }
    }
    return { shanten: base, tiles: tiles, count: count };
  }

  /*
   * 14枚（または 3n+2 枚）の手牌について、各種類を1枚切った場合を比較する。
   * 並び順：シャンテン数が小さい → 受入枚数が多い → 種類番号順
   */
  function analyze(counts, visible, options) {
    const seen = visible || counts;
    const results = [];
    for (let k = 0; k < MJ.TILE_KIND_COUNT; k++) {
      if (counts[k] === 0) continue;
      const c = counts.slice();
      c[k]--;
      const u = ukeire(c, seen, options);
      results.push({
        kind: k,
        code: MJ.tiles.kindToCode(k),
        shanten: u.shanten,
        ukeire: u.tiles,
        ukeireCount: u.count,
        ukeireKinds: u.tiles.length
      });
    }
    results.sort(function (a, b) {
      return a.shanten - b.shanten || b.ukeireCount - a.ukeireCount || a.kind - b.kind;
    });
    return results;
  }

  MJ.ukeire = {
    zeros: zeros,
    addCounts: addCounts,
    remainingOf: remainingOf,
    ukeire: ukeire,
    analyze: analyze
  };
})(window.MJ = window.MJ || {});
