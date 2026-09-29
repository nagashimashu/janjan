/* 定数定義：ゲーム全体で共有する値。ロジック・描画のどちらにも依存しない。 */
(function (MJ) {
  'use strict';

  MJ.VERSION = '0.1.0';
  MJ.APP_NAME = '星翠麻雀';
  MJ.APP_NAME_EN = 'SEISUI MAHJONG';

  MJ.SUITS = ['man', 'pin', 'sou', 'honor'];
  MJ.SUIT_LETTER = { man: 'm', pin: 'p', sou: 's', honor: 'z' };
  MJ.LETTER_SUIT = { m: 'man', p: 'pin', s: 'sou', z: 'honor' };
  MJ.SUIT_ORDER = { man: 0, pin: 1, sou: 2, honor: 3 };
  MJ.SUIT_NAME = { man: '萬', pin: '筒', sou: '索' };
  MJ.KANJI_NUM = ['一', '二', '三', '四', '五', '六', '七', '八', '九'];
  MJ.HONOR_NAMES = ['東', '南', '西', '北', '白', '發', '中'];

  MJ.TILE_KIND_COUNT = 34;
  MJ.COPIES_PER_KIND = 4;
  MJ.TOTAL_TILES = 136;
  MJ.DEAD_WALL_SIZE = 14;
  MJ.HAND_SIZE = 13;
  MJ.RIVER_COLUMNS = 6;

  /* 入力判定の閾値（CSSピクセル／ミリ秒） */
  MJ.INPUT = {
    tapSlop: 10,          // これ以下の移動はタップとして扱う
    swipeDiscard: 42,     // 上方向にこれ以上動いたら打牌
    swipeFollowMax: 96,   // スワイプ中に牌が追従する最大量
    longPressMs: 480,
    infoHideMs: 2200
  };

  /* 手牌の牌幅（CSSピクセル）。画面幅に応じてこれ以下へ自動縮小する */
  MJ.TILE_SIZE_PX = { sm: 40, md: 50, lg: 60 };
  MJ.TILE_MIN_PX = 22;    // これ未満になる場合は手牌を横スクロールにする

  MJ.STORAGE_KEYS = {
    settings: 'seisui.settings.v1',
    stats: 'seisui.stats.v1'
  };
})(window.MJ = window.MJ || {});
