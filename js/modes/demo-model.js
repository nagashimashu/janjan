/*
 * 牌操作デモの状態とルール（DOMに依存しない純粋なロジック）。
 * 画面側は demo.js。ここはテスト（tests/specs/demo-model.spec.js）から直接呼べる。
 */
(function (MJ) {
  'use strict';

  function create(options) {
    const opts = options || {};
    const wall = MJ.wall.build({
      rules: opts.rules || MJ.RULES,
      seed: opts.seed,
      presetHand: opts.presetHand,
      fixedDraws: opts.fixedDraws
    });
    const dealt = wall.initialHand.slice();
    const state = {
      seed: wall.seed,
      wall: wall,
      hand: [],
      drawn: null,     // ツモ牌（手牌とは別に保持し、ツモ切り・手出しを区別する）
      river: [],       // { tile, tsumogiri, turn }
      turn: 0,
      finished: false
    };
    if (dealt.length === 14) state.drawn = dealt.pop();
    state.hand = opts.autoSort === false ? dealt : MJ.handSorter.sort(dealt);
    return state;
  }

  function tileCount(s) {
    return s.hand.length + (s.drawn ? 1 : 0);
  }

  function canDraw(s) {
    if (s.drawn || tileCount(s) !== MJ.HAND_SIZE) return { ok: false, reason: 'ツモ済みです。先に1枚打牌してください' };
    if (!s.wall.live.length) return { ok: false, reason: '山に牌が残っていません（流局）' };
    return { ok: true };
  }

  function draw(s) {
    const check = canDraw(s);
    if (!check.ok) return check;
    const tile = MJ.wall.drawOne(s.wall);
    s.drawn = tile;
    s.turn += 1;
    return { ok: true, tile: tile };
  }

  function canDiscard(s) {
    return tileCount(s) === MJ.HAND_SIZE + 1
      ? { ok: true }
      : { ok: false, reason: 'ツモしてから打牌してください' };
  }

  function findTile(s, id) {
    if (s.drawn && s.drawn.id === id) return s.drawn;
    return s.hand.find(function (t) { return t.id === id; }) || null;
  }

  /* 打牌。手出しの場合、ツモ牌は手牌へ加え、自動整列が有効なら並べ直す */
  function discard(s, id, options) {
    const autoSort = !options || options.autoSort !== false;
    const check = canDiscard(s);
    if (!check.ok) return check;

    let tile;
    let tsumogiri = false;
    if (s.drawn && s.drawn.id === id) {
      tile = s.drawn;
      tsumogiri = true;
      s.drawn = null;
    } else {
      const idx = s.hand.findIndex(function (t) { return t.id === id; });
      if (idx < 0) return { ok: false, reason: 'その牌は手牌にありません' };
      tile = s.hand.splice(idx, 1)[0];
      if (s.drawn) { s.hand.push(s.drawn); s.drawn = null; }
      if (autoSort) s.hand = MJ.handSorter.sort(s.hand);
    }
    s.river.push({ tile: tile, tsumogiri: tsumogiri, turn: s.turn });
    if (!s.wall.live.length) s.finished = true;
    return { ok: true, tile: tile, tsumogiri: tsumogiri };
  }

  function sortHand(s) {
    s.hand = MJ.handSorter.sort(s.hand);
  }

  function doraKinds(s) {
    return s.wall.doraIndicators.map(function (t) { return MJ.tiles.doraKindFromIndicator(t.kind); });
  }

  MJ.demoModel = {
    create: create,
    tileCount: tileCount,
    canDraw: canDraw,
    draw: draw,
    canDiscard: canDiscard,
    discard: discard,
    sortHand: sortHand,
    findTile: findTile,
    doraKinds: doraKinds
  };
})(window.MJ = window.MJ || {});
