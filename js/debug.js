/*
 * デバッグ表示。設定の「デバッグ表示」または URL の ?debug=1 で有効になる。
 * 各モードは setProvider() で状態の要約関数を登録する。
 */
(function (MJ) {
  'use strict';

  const MAX_LINES = 40;
  const lines = [];
  let provider = null;
  let panel = null;

  function fromUrl() {
    try { return new URLSearchParams(window.location.search).get('debug') === '1'; } catch (e) { return false; }
  }

  function enabled() {
    return fromUrl() || !!(MJ.settings && MJ.settings.debug);
  }

  function log(message, data) {
    const time = new Date().toTimeString().slice(0, 8);
    lines.unshift(time + '  ' + message + (data !== undefined ? '  ' + JSON.stringify(data) : ''));
    if (lines.length > MAX_LINES) lines.length = MAX_LINES;
    if (enabled() && typeof console !== 'undefined') console.debug('[MJ]', message, data === undefined ? '' : data);
    render();
  }

  function render() {
    if (!panel) panel = document.getElementById('debug-panel');
    if (!panel) return;
    const on = enabled();
    panel.hidden = !on;
    if (!on) return;
    let summary = '';
    try { summary = provider ? provider() : '（このモードの状態はありません）'; } catch (e) { summary = '状態取得エラー: ' + e.message; }
    panel.querySelector('.debug-state').textContent = summary;
    panel.querySelector('.debug-log').textContent = lines.join('\n');
  }

  MJ.debug = {
    enabled: enabled,
    log: log,
    render: render,
    setProvider: function (fn) { provider = fn; render(); }
  };
})(window.MJ = window.MJ || {});
