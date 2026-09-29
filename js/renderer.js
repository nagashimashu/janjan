/*
 * 描画：牌要素の生成と、既存要素を再利用した差分描画。
 * ゲーム状態は変更しない（読むだけ）。
 */
(function (MJ) {
  'use strict';

  function tileFace(tile, extraClass) {
    const face = document.createElement('span');
    face.className = 'tile' + (tile.isRed ? ' is-red' : '') + (extraClass ? ' ' + extraClass : '');
    face.innerHTML = MJ.tileArt.svg(tile.suit, tile.rank, tile.isRed);
    return face;
  }

  /* 操作できる手牌。見た目より広いタップ領域を持つ button で包む */
  function createHandTile(tile) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'tile-btn';
    btn.dataset.id = tile.id;
    btn.appendChild(tileFace(tile));
    return btn;
  }

  /* 表示専用の牌（河・ドラ表示・受入牌など） */
  function createStaticTile(tile, extraClass, label) {
    const el = tileFace(tile, extraClass);
    el.dataset.id = tile.id;
    el.setAttribute('role', 'img');
    el.setAttribute('aria-label', label || MJ.tiles.ariaLabel(tile));
    return el;
  }

  function createBackTile(extraClass) {
    const el = document.createElement('span');
    el.className = 'tile tile-back' + (extraClass ? ' ' + extraClass : '');
    el.setAttribute('aria-hidden', 'true');
    return el;
  }

  /*
   * 既存の子要素を data-id で再利用しながら、items の順に並べ替える。
   * 新しい要素だけ生成し、消えた要素だけ削除する（不要なDOM再生成を避ける）。
   * 戻り値：新規に作成した要素の配列
   */
  function reconcile(container, items, keyOf, create, update) {
    const existing = new Map();
    Array.prototype.forEach.call(container.children, function (el) {
      if (el.dataset && el.dataset.id) existing.set(el.dataset.id, el);
    });
    const created = [];
    let cursor = container.firstElementChild;
    items.forEach(function (item, i) {
      const key = keyOf(item);
      let el = existing.get(key);
      if (el) existing.delete(key);
      else { el = create(item); created.push(el); }
      if (update) update(el, item, i);
      if (el !== cursor) container.insertBefore(el, cursor);
      else cursor = cursor.nextElementSibling;
    });
    existing.forEach(function (el) { el.remove(); });
    return created;
  }

  MJ.renderer = {
    createHandTile: createHandTile,
    createStaticTile: createStaticTile,
    createBackTile: createBackTile,
    reconcile: reconcile
  };
})(window.MJ = window.MJ || {});
