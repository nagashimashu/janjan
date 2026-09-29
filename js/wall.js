/*
 * 牌山：シード付き乱数、シャッフル、王牌、固定牌山（テスト用）。
 * build() が返す wall:
 *   { seed, live: ツモ山, dead: 王牌14枚, doraIndicators, initialHand: 配牌 }
 */
(function (MJ) {
  'use strict';

  /* mulberry32：シードが同じなら同じ牌山を再現できる */
  function createRng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* 数値はそのまま、文字列は FNV-1a でハッシュしてシードにする */
  function normalizeSeed(seed) {
    if (typeof seed === 'number' && isFinite(seed)) return seed >>> 0;
    const s = String(seed);
    if (/^\d+$/.test(s)) return Number(s) >>> 0;
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
  }

  function randomSeed() {
    const c = typeof crypto !== 'undefined' ? crypto : null;
    if (c && c.getRandomValues) return c.getRandomValues(new Uint32Array(1))[0];
    return Math.floor(Math.random() * 4294967296);
  }

  function shuffle(arr, rng) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
    }
    return arr;
  }

  function toSpecs(v) {
    if (!v) return [];
    return typeof v === 'string' ? MJ.tiles.parse(v) : v;
  }

  /*
   * options:
   *   rules       … 赤ドラ枚数などのルール
   *   seed        … 数値または文字列。省略時はランダム
   *   presetHand  … 固定配牌（13枚または14枚）。"123m..." 形式または仕様配列
   *   fixedDraws  … 配牌後にツモる牌を先頭から固定
   *   dealCount   … presetHand が無い場合に配る枚数（既定13）
   */
  function build(options) {
    const opts = options || {};
    const rules = opts.rules || MJ.RULES;
    const seed = opts.seed == null || opts.seed === '' ? randomSeed() : normalizeSeed(opts.seed);
    const rng = createRng(seed);
    const pool = MJ.tiles.createTileSet(rules);

    const presetSpecs = toSpecs(opts.presetHand);
    if (presetSpecs.length && presetSpecs.length !== 13 && presetSpecs.length !== 14) {
      throw new Error('手牌は13枚または14枚で指定してください（現在 ' + presetSpecs.length + ' 枚）');
    }
    const preset = MJ.tiles.takeFromPool(pool, presetSpecs);
    const fixed = MJ.tiles.takeFromPool(pool, toSpecs(opts.fixedDraws));

    shuffle(pool, rng);
    const dealCount = opts.dealCount == null ? MJ.HAND_SIZE : opts.dealCount;
    const initialHand = preset.length ? preset : pool.splice(0, dealCount);
    const dead = pool.splice(pool.length - MJ.DEAD_WALL_SIZE, MJ.DEAD_WALL_SIZE);
    const live = fixed.concat(pool);

    return { seed: seed, live: live, dead: dead, doraIndicators: [dead[0]], initialHand: initialHand };
  }

  function drawOne(wall) {
    return wall.live.length ? wall.live.shift() : null;
  }

  MJ.wall = {
    createRng: createRng,
    normalizeSeed: normalizeSeed,
    shuffle: shuffle,
    build: build,
    drawOne: drawOne
  };
})(window.MJ = window.MJ || {});
