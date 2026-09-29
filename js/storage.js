/*
 * localStorage 永続化。保存するのは「設定」と「成績」だけ（個人情報は扱わない）。
 * 読み込み時は既定値と型が一致するキーだけを採用し、壊れたデータでも起動できるようにする。
 */
(function (MJ) {
  'use strict';

  const DEFAULT_SETTINGS = {
    tileSize: 'md',          // sm / md / lg
    discardMethod: 'retap',  // retap / swipe / confirm
    misdiscardGuard: true,
    vibration: true,
    sound: true,
    volume: 0.6,
    animSpeed: 'normal',     // normal / fast / minimal
    cpuSpeed: 'normal',      // instant / normal / slow（CPU対局の実装後に有効）
    autoSort: true,
    separateDraw: true,
    landscapeHint: true,
    debug: false
  };

  const DEFAULT_STATS = {
    demo: { deals: 0, draws: 0, discards: 0 },
    nanikiru: { attempts: 0, best: 0, byQuestion: {} },
    match: { games: 0, placements: [0, 0, 0, 0] }
  };

  /* 設定画面・対局中メニューの両方で使う定義 */
  const SETTINGS_SCHEMA = [
    { key: 'tileSize', label: '牌サイズ', type: 'select', options: [['sm', '小'], ['md', '中'], ['lg', '大']] },
    { key: 'discardMethod', label: '打牌方法', type: 'select',
      options: [['retap', '再タップ'], ['swipe', '上スワイプ'], ['confirm', '確認ボタン']],
      help: '再タップ：選択中の牌をもう一度押す／上スワイプ：牌を上へはじく（タップは選択のみ）／確認ボタン：「この牌を切る」で確定' },
    { key: 'misdiscardGuard', label: '誤打牌防止', type: 'toggle',
      help: 'オンのとき、1回目のタップやスワイプは選択のみになります' },
    { key: 'vibration', label: '振動', type: 'toggle', help: '対応端末のみ' },
    { key: 'sound', label: '効果音', type: 'toggle' },
    { key: 'volume', label: '音量', type: 'range', min: 0, max: 1, step: 0.05 },
    { key: 'animSpeed', label: '演出速度', type: 'select',
      options: [['normal', '標準'], ['fast', '高速'], ['minimal', '演出少なめ']] },
    { key: 'cpuSpeed', label: 'CPU思考時間', type: 'select',
      options: [['instant', '即時'], ['normal', '標準'], ['slow', 'ゆっくり']], help: 'CPU四人麻雀の実装後に有効になります' },
    { key: 'autoSort', label: '自動整列', type: 'toggle' },
    { key: 'separateDraw', label: 'ツモ牌を分離表示', type: 'toggle' },
    { key: 'landscapeHint', label: '横向き推奨表示', type: 'toggle', help: 'CPU四人麻雀の実装後に有効になります' },
    { key: 'debug', label: 'デバッグ表示', type: 'toggle', help: '牌山のシードや操作ログを表示します' }
  ];

  function clone(v) { return JSON.parse(JSON.stringify(v)); }

  function mergeKnown(defaults, loaded) {
    const out = clone(defaults);
    if (!loaded || typeof loaded !== 'object') return out;
    Object.keys(defaults).forEach(function (k) {
      const d = defaults[k];
      const v = loaded[k];
      if (v === undefined || v === null) return;
      if (Array.isArray(d)) { if (Array.isArray(v) && v.length === d.length) out[k] = v; return; }
      if (typeof d === 'object') { out[k] = Object.keys(d).length ? mergeKnown(d, v) : (typeof v === 'object' ? v : {}); return; }
      if (typeof v === typeof d) out[k] = v;
    });
    return out;
  }

  function read(key) {
    try {
      const raw = window.localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  function write(key, value) {
    try { window.localStorage.setItem(key, JSON.stringify(value)); return true; } catch (e) { return false; }
  }

  function remove(key) {
    try { window.localStorage.removeItem(key); } catch (e) { /* 保存領域が使えない環境では何もしない */ }
  }

  MJ.storage = {
    DEFAULT_SETTINGS: DEFAULT_SETTINGS,
    DEFAULT_STATS: DEFAULT_STATS,
    SETTINGS_SCHEMA: SETTINGS_SCHEMA,
    loadSettings: function () { return mergeKnown(DEFAULT_SETTINGS, read(MJ.STORAGE_KEYS.settings)); },
    saveSettings: function (s) { return write(MJ.STORAGE_KEYS.settings, s); },
    loadStats: function () { return mergeKnown(DEFAULT_STATS, read(MJ.STORAGE_KEYS.stats)); },
    saveStats: function (s) { return write(MJ.STORAGE_KEYS.stats, s); },
    resetAll: function () { remove(MJ.STORAGE_KEYS.settings); remove(MJ.STORAGE_KEYS.stats); },
    mergeKnown: mergeKnown
  };
})(window.MJ = window.MJ || {});
