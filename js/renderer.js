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

  /*
   * 画面幅に合わせて手牌の牌幅（--tile-w）を決める。slots は牌何枚分の幅が必要か。
   * 手牌ゾーン全体（浮き上がり分・厚み・状態表示を含む）が画面高の約1/3に収まる大きさに抑え、
   * それでも MJ.TILE_MIN_PX 未満になる場合は手牌を横スクロールにする。
   */
  function fitHand(screen, hand, zone, slots, heightRatio) {
    const avail = zone.clientWidth - 12;
    const base = MJ.TILE_SIZE_PX[MJ.settings.tileSize] || MJ.TILE_SIZE_PX.md;
    let w = Math.floor(avail / slots) - 2;
    const byHeight = Math.floor((window.innerHeight * (heightRatio || 0.3) - 40) / 1.95);
    w = Math.min(base, w, Math.max(byHeight, MJ.TILE_MIN_PX + 6));
    const scroll = w < MJ.TILE_MIN_PX;
    if (scroll) w = MJ.TILE_MIN_PX;
    screen.style.setProperty('--tile-w', w + 'px');
    hand.classList.toggle('is-scroll', scroll);
    return w;
  }

  MJ.renderer = {
    fitHand: fitHand,
    createHandTile: createHandTile,
    createStaticTile: createStaticTile,
    createBackTile: createBackTile,
    reconcile: reconcile
  };
})(window.MJ = window.MJ || {});
