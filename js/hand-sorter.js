/* 手牌の整列。元の配列は変更せず、新しい配列を返す。 */
(function (MJ) {
  'use strict';

  function sort(tiles) {
    return tiles.slice().sort(MJ.tiles.compare);
  }

  function isSorted(tiles) {
    for (let i = 1; i < tiles.length; i++) {
      if (MJ.tiles.compare(tiles[i - 1], tiles[i]) > 0) return false;
    }
    return true;
  }

  MJ.handSorter = { sort: sort, isSorted: isSorted };
})(window.MJ = window.MJ || {});
