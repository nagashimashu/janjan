/*
 * オリジナル牌面（SVG）。既存ゲームの牌画像は使用しない。
 * 牌面の差し替えはこのファイルの svg() だけを変更すればよい。
 * viewBox は 60×80。
 */
(function (MJ) {
  'use strict';

  const C = {
    ink: '#1c2544',
    red: '#cf2f3d',
    blue: '#1d5bbd',
    green: '#12845a',
    leaf: '#2aa36e',
    gold: '#c28f18',
    paper: '#fffaf0'
  };
  const SERIF = "'Hiragino Mincho ProN','Yu Mincho','YuMincho','Noto Serif JP','MS PMincho',serif";
  const cache = new Map();

  /* 筒子の円：外輪・白・内輪・芯 */
  function circle(x, y, r, color) {
    return '<g>' +
      '<circle cx="' + x + '" cy="' + y + '" r="' + r + '" fill="' + color + '"/>' +
      '<circle cx="' + x + '" cy="' + y + '" r="' + (r * 0.74) + '" fill="' + C.paper + '"/>' +
      '<circle cx="' + x + '" cy="' + y + '" r="' + (r * 0.52) + '" fill="none" stroke="' + color + '" stroke-width="' + (r * 0.16) + '"/>' +
      '<circle cx="' + x + '" cy="' + y + '" r="' + (r * 0.22) + '" fill="' + color + '"/>' +
      '</g>';
  }

  /* 索子の棒：丸みのある竹と節 */
  function stick(x, y, h, color) {
    const top = y - h / 2;
    return '<g>' +
      '<rect x="' + (x - 3.7) + '" y="' + top + '" width="7.4" height="' + h + '" rx="3.7" fill="' + color + '"/>' +
      '<rect x="' + (x - 1.1) + '" y="' + (top + 2.2) + '" width="2.2" height="' + (h - 4.4) + '" rx="1.1" fill="rgba(255,255,255,.42)"/>' +
      '<line x1="' + (x - 3.7) + '" x2="' + (x + 3.7) + '" y1="' + y + '" y2="' + y + '" stroke="' + C.paper + '" stroke-width="1.3"/>' +
      '</g>';
  }

  const PIN = {
    1: [[30, 40, 17, 'multi']],
    2: [[30, 22, 11, 'green'], [30, 58, 11, 'blue']],
    3: [[15, 17, 9, 'blue'], [30, 40, 9, 'red'], [45, 63, 9, 'green']],
    4: [[18, 22, 9.5, 'blue'], [42, 22, 9.5, 'green'], [18, 58, 9.5, 'green'], [42, 58, 9.5, 'blue']],
    5: [[16, 18, 8.5, 'blue'], [44, 18, 8.5, 'green'], [30, 40, 8.5, 'red'], [16, 62, 8.5, 'green'], [44, 62, 8.5, 'blue']],
    6: [[18, 15, 8, 'green'], [42, 15, 8, 'green'], [18, 42, 8, 'red'], [42, 42, 8, 'red'], [18, 66, 8, 'red'], [42, 66, 8, 'red']],
    7: [[14, 11, 6.8, 'green'], [30, 20, 6.8, 'green'], [46, 29, 6.8, 'green'], [18, 50, 7.4, 'red'], [42, 50, 7.4, 'red'], [18, 68, 7.4, 'red'], [42, 68, 7.4, 'red']],
    8: [[18, 12, 7.4, 'blue'], [42, 12, 7.4, 'blue'], [18, 31, 7.4, 'blue'], [42, 31, 7.4, 'blue'], [18, 50, 7.4, 'blue'], [42, 50, 7.4, 'blue'], [18, 69, 7.4, 'blue'], [42, 69, 7.4, 'blue']],
    9: [[14, 15, 7.6, 'blue'], [30, 15, 7.6, 'blue'], [46, 15, 7.6, 'blue'], [14, 40, 7.6, 'red'], [30, 40, 7.6, 'red'], [46, 40, 7.6, 'red'], [14, 65, 7.6, 'green'], [30, 65, 7.6, 'green'], [46, 65, 7.6, 'green']]
  };

  const SOU = {
    2: [[30, 22, 'green'], [30, 58, 'green']],
    3: [[30, 22, 'green'], [18, 58, 'green'], [42, 58, 'green']],
    4: [[18, 22, 'green'], [42, 22, 'green'], [18, 58, 'green'], [42, 58, 'green']],
    5: [[16, 22, 'green'], [44, 22, 'green'], [30, 40, 'red'], [16, 58, 'green'], [44, 58, 'green']],
    6: [[14, 22, 'green'], [30, 22, 'green'], [46, 22, 'green'], [14, 58, 'green'], [30, 58, 'green'], [46, 58, 'green']],
    7: [[30, 14, 'red'], [14, 42, 'green'], [30, 42, 'green'], [46, 42, 'green'], [14, 66, 'green'], [30, 66, 'green'], [46, 66, 'green']],
    8: [[11, 22, 'green'], [23, 22, 'green'], [37, 22, 'green'], [49, 22, 'green'], [11, 58, 'green'], [23, 58, 'green'], [37, 58, 'green'], [49, 58, 'green']],
    9: [[14, 14, 'green'], [30, 14, 'red'], [46, 14, 'green'], [14, 40, 'green'], [30, 40, 'red'], [46, 40, 'green'], [14, 66, 'green'], [30, 66, 'red'], [46, 66, 'green']]
  };

  function pinSvg(rank, isRed) {
    return PIN[rank].map(function (p) {
      if (p[3] === 'multi') {
        return '<circle cx="30" cy="40" r="19" fill="' + C.blue + '"/>' +
          '<circle cx="30" cy="40" r="15" fill="' + C.paper + '"/>' +
          '<circle cx="30" cy="40" r="12" fill="none" stroke="' + C.green + '" stroke-width="3"/>' +
          '<circle cx="30" cy="40" r="7" fill="' + C.red + '"/>' +
          '<circle cx="30" cy="40" r="3" fill="' + C.paper + '"/>';
      }
      return circle(p[0], p[1], p[2], isRed ? C.red : C[p[3]]);
    }).join('');
  }

  function souSvg(rank, isRed) {
    if (rank === 1) {
      /* 一索：オリジナルの「翡翠の若竹」意匠 */
      return '<path d="M30 72 C30 56 29 38 30 24" stroke="' + C.green + '" stroke-width="5" stroke-linecap="round" fill="none"/>' +
        '<ellipse cx="19" cy="42" rx="11" ry="4.6" transform="rotate(-32 19 42)" fill="' + C.leaf + '"/>' +
        '<ellipse cx="41" cy="52" rx="11" ry="4.6" transform="rotate(30 41 52)" fill="' + C.green + '"/>' +
        '<ellipse cx="22" cy="60" rx="7" ry="3.2" transform="rotate(-24 22 60)" fill="' + C.leaf + '"/>' +
        '<circle cx="30" cy="16" r="8" fill="' + C.red + '"/>' +
        '<circle cx="30" cy="16" r="3.4" fill="' + C.paper + '"/>';
    }
    const h = rank === 7 || rank === 9 ? 20 : 24;
    return SOU[rank].map(function (p) { return stick(p[0], p[1], h, isRed ? C.red : C[p[2]]); }).join('');
  }

  function manSvg(rank, isRed) {
    return '<text x="30" y="35" font-size="30" font-weight="700" text-anchor="middle" font-family="' + SERIF + '" fill="' + (isRed ? C.red : C.ink) + '">' + MJ.KANJI_NUM[rank - 1] + '</text>' +
      '<text x="30" y="71" font-size="31" font-weight="700" text-anchor="middle" font-family="' + SERIF + '" fill="' + C.red + '">萬</text>';
  }

  function honorSvg(rank) {
    if (rank === 5) {
      /* 白：二重の枠線 */
      return '<rect x="11" y="14" width="38" height="52" rx="5" fill="none" stroke="#3b73c4" stroke-width="3"/>' +
        '<rect x="16" y="19" width="28" height="42" rx="3" fill="none" stroke="#3b73c4" stroke-width="1.4"/>';
    }
    const color = rank === 6 ? C.green : rank === 7 ? C.red : C.ink;
    return '<text x="30" y="55" font-size="41" font-weight="700" text-anchor="middle" font-family="' + SERIF + '" fill="' + color + '">' + MJ.HONOR_NAMES[rank - 1] + '</text>';
  }

  function svg(suit, rank, isRed) {
    const key = suit + rank + (isRed ? 'r' : '');
    if (cache.has(key)) return cache.get(key);
    let body;
    if (suit === 'man') body = manSvg(rank, isRed);
    else if (suit === 'pin') body = pinSvg(rank, isRed);
    else if (suit === 'sou') body = souSvg(rank, isRed);
    else body = honorSvg(rank);
    /* 赤ドラは色以外でも区別できるよう、右上に金の菱形を付ける */
    if (isRed) body += '<path d="M52 3 l4.5 5 -4.5 5 -4.5 -5z" fill="' + C.gold + '" stroke="#fff6d8" stroke-width=".8"/>';
    const out = '<svg viewBox="0 0 60 80" aria-hidden="true" focusable="false">' + body + '</svg>';
    cache.set(key, out);
    return out;
  }

  MJ.tileArt = { svg: svg };
})(window.MJ = window.MJ || {});
