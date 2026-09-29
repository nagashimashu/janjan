/*
 * 牌データ：生成・種類番号・文字列表記・ドラ計算・並び順。
 * 種類番号 kind：萬子 0-8 / 筒子 9-17 / 索子 18-26 / 字牌 27-33（東南西北白發中）
 * 文字列表記：数字＋スート記号（m/p/s/z）。0 は赤5。例 "123m406p11z"
 */
(function (MJ) {
  'use strict';

  function kindOf(suit, rank) {
    return suit === 'honor' ? 27 + rank - 1 : MJ.SUIT_ORDER[suit] * 9 + rank - 1;
  }

  function suitRankOf(kind) {
    if (kind >= 27) return { suit: 'honor', rank: kind - 26 };
    return { suit: MJ.SUITS[Math.floor(kind / 9)], rank: (kind % 9) + 1 };
  }

  function nameOf(suit, rank) {
    return suit === 'honor' ? MJ.HONOR_NAMES[rank - 1] : MJ.KANJI_NUM[rank - 1] + MJ.SUIT_NAME[suit];
  }

  function createTile(suit, rank, copy, isRed) {
    const letter = MJ.SUIT_LETTER[suit];
    return {
      id: letter + rank + '-' + copy,
      suit: suit,
      rank: rank,
      code: rank + letter,
      kind: kindOf(suit, rank),
      isRed: isRed,
      displayName: nameOf(suit, rank)
    };
  }

  /* 136枚を生成する。赤ドラは各スートの5の先頭から rules.redDora の枚数だけ割り当てる */
  function createTileSet(rules) {
    const red = (rules && rules.redDora) || {};
    const set = [];
    MJ.SUITS.forEach(function (suit) {
      const maxRank = suit === 'honor' ? 7 : 9;
      for (let rank = 1; rank <= maxRank; rank++) {
        for (let copy = 0; copy < MJ.COPIES_PER_KIND; copy++) {
          const isRed = suit !== 'honor' && rank === 5 && copy < (red[suit] || 0);
          set.push(createTile(suit, rank, copy, isRed));
        }
      }
    });
    return set;
  }

  /* "123m0p11z" → [{kind, suit, rank, isRed}, ...] 不正な文字列は例外 */
  function parseTiles(text) {
    const src = String(text || '').replace(/\s+/g, '');
    if (!src) return [];
    if (!/^(\d+[mpsz])+$/i.test(src)) {
      throw new Error('形式が正しくありません（例：123m456p789s1122z）');
    }
    const out = [];
    src.replace(/(\d+)([mpsz])/gi, function (_, digits, letter) {
      const suit = MJ.LETTER_SUIT[letter.toLowerCase()];
      digits.split('').forEach(function (d) {
        let rank = Number(d);
        let isRed = false;
        if (rank === 0) {
          if (suit === 'honor') throw new Error('字牌に赤牌（0）はありません');
          rank = 5; isRed = true;
        }
        if (suit === 'honor' && rank > 7) throw new Error('字牌は1〜7（東南西北白發中）で指定してください');
        out.push({ kind: kindOf(suit, rank), suit: suit, rank: rank, isRed: isRed });
      });
      return '';
    });
    return out;
  }

  /* 牌（または仕様オブジェクト）の配列を "123m0p" 形式へ */
  function toString(tiles) {
    let out = '';
    let pending = '';
    let lastSuit = null;
    tiles.forEach(function (t) {
      if (lastSuit && t.suit !== lastSuit) { out += pending + MJ.SUIT_LETTER[lastSuit]; pending = ''; }
      pending += t.isRed ? '0' : String(t.rank);
      lastSuit = t.suit;
    });
    if (lastSuit) out += pending + MJ.SUIT_LETTER[lastSuit];
    return out;
  }

  /* 牌山（pool）から仕様に一致する牌を取り出す。取り出した牌は pool から削除される */
  function takeFromPool(pool, specs) {
    return specs.map(function (spec) {
      const idx = pool.findIndex(function (t) { return t.kind === spec.kind && t.isRed === spec.isRed; });
      if (idx < 0) {
        const name = nameOf(spec.suit, spec.rank) + (spec.isRed ? '（赤）' : '');
        const hint = spec.rank === 5 && spec.suit !== 'honor'
          ? '（赤ドラがある場合、通常の5は3枚、赤5は1枚までです）'
          : '（同じ牌は4枚までです）';
        throw new Error(name + ' の枚数が足りません' + hint);
      }
      return pool.splice(idx, 1)[0];
    });
  }

  /* ドラ表示牌の種類 → ドラの種類 */
  function doraKindFromIndicator(kind) {
    if (kind < 27) return Math.floor(kind / 9) * 9 + ((kind % 9) + 1) % 9;
    if (kind <= 30) return 27 + ((kind - 27 + 1) % 4);
    return 31 + ((kind - 31 + 1) % 3);
  }

  /* 並び順：種類 → 通常牌を赤牌より前 → id */
  function compare(a, b) {
    if (a.kind !== b.kind) return a.kind - b.kind;
    if (a.isRed !== b.isRed) return a.isRed ? 1 : -1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  }

  /* 読み上げ用の名称 */
  function ariaLabel(tile, extra) {
    let label = tile.displayName;
    if (tile.isRed) label += '（赤ドラ）';
    if (extra) label += '、' + extra;
    return label;
  }

  MJ.tiles = {
    kindOf: kindOf,
    suitRankOf: suitRankOf,
    nameOf: nameOf,
    createTileSet: createTileSet,
    parse: parseTiles,
    toString: toString,
    takeFromPool: takeFromPool,
    doraKindFromIndicator: doraKindFromIndicator,
    compare: compare,
    ariaLabel: ariaLabel
  };
})(window.MJ = window.MJ || {});
