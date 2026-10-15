/* テスト用の補助関数：文字列から牌を作り、和了の点数を計算する */
(function (root) {
  'use strict';

  function tiles(text) {
    const pool = MJ.tiles.createTileSet(MJ.RULES);
    return MJ.tiles.takeFromPool(pool, MJ.tiles.parse(text));
  }

  /*
   * hand：手の内13枚（副露があれば 13 − 3×副露数）、win：和了牌（"5m" など）
   * opts：scoring.score の ctx を上書き（既定は子・ロン・東場・南家・ドラなし）
   */
  function win(hand, winCode, opts) {
    const all = tiles(hand + winCode);
    const winTile = all.pop();
    const ctx = Object.assign({
      isTsumo: false, isDealer: false, seatWind: 'south', roundWind: 'east',
      doraKinds: [], uraDoraKinds: [], melds: [], kuitan: true
    }, opts || {});
    return MJ.scoring.score(all, winTile, ctx);
  }

  function kind(code) { return MJ.tiles.parse(code)[0].kind; }

  function yakuNames(r) { return r.ok ? r.yaku.map(function (y) { return y.name; }).sort() : []; }

  root.MJTestHelpers = { tiles: tiles, win: win, kind: kind, yakuNames: yakuNames };
})(typeof window !== 'undefined' ? window : globalThis);
