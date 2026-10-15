/*
 * アプリ本体：画面切替（ハッシュルーター）、設定、共通UI（通知・確認ダイアログ・読み上げ）。
 * 各モードは MJ.screens に { enter, leave, onResize, onSettings, onKey } を登録する。
 */
(function (MJ) {
  'use strict';

  const $ = function (sel, root) { return (root || document).querySelector(sel); };
  const $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  const ROUTES = ['title', 'modes', 'demo', 'nanikiru', 'nanikiru-play', 'cpu', 'rules', 'settings', 'stats', 'howto', 'about'];
  const MENU_KEYS = ['volume', 'sound', 'vibration', 'animSpeed', 'discardMethod', 'misdiscardGuard', 'turnTimer'];

  MJ.settings = MJ.storage.loadSettings();
  MJ.stats = MJ.storage.loadStats();
  MJ.screens = {
    demo: MJ.demo,
    nanikiru: MJ.nanikiru.list,
    'nanikiru-play': MJ.nanikiru.play,
    cpu: MJ.match
  };

  MJ.saveStats = function () { MJ.storage.saveStats(MJ.stats); };

  MJ.updateSetting = function (key, value) {
    MJ.settings[key] = value;
    MJ.storage.saveSettings(MJ.settings);
    applySettings();
    syncSettingControls();
    const hooks = MJ.screens[currentRoute];
    if (hooks && hooks.onSettings) hooks.onSettings(key);
  };

  /* ---------- 共通UI ---------- */

  let toastTimer = null;
  MJ.ui = {
    toast: function (message, type) {
      const t = $('#toast');
      t.textContent = message;
      t.dataset.type = type || 'info';
      t.hidden = false;
      t.classList.remove('is-show');
      void t.offsetWidth;
      t.classList.add('is-show');
      clearTimeout(toastTimer);
      toastTimer = setTimeout(function () { t.classList.remove('is-show'); t.hidden = true; }, 2600);
      MJ.ui.announce(message);
    },
    /* スクリーンリーダー向け通知 */
    announce: function (message) {
      const live = $('#sr-live');
      live.textContent = '';
      setTimeout(function () { live.textContent = message; }, 30);
    },
    vibrate: function (ms) {
      /* ブラウザーはユーザー操作前の振動を拒否する（警告が出る）ため、操作済みのときだけ呼ぶ */
      const activated = !navigator.userActivation || navigator.userActivation.hasBeenActive;
      if (MJ.settings.vibration && navigator.vibrate && activated) {
        try { navigator.vibrate(ms); } catch (e) { /* 未対応端末 */ }
      }
    },
    /* 確認ダイアログ。背景タップでは確定しない */
    confirm: function (message, opt) {
      const o = opt || {};
      const dlg = $('#dlg-confirm');
      $('.dlg-title', dlg).textContent = o.title || '確認';
      $('.dlg-msg', dlg).textContent = message;
      $('[value="ok"]', dlg).textContent = o.ok || 'OK';
      $('[value="ok"]', dlg).classList.toggle('btn-danger', !!o.danger);
      dlg.returnValue = '';
      dlg.showModal();
      $('[value="cancel"]', dlg).focus();
      return new Promise(function (resolve) {
        dlg.addEventListener('close', function onClose() {
          dlg.removeEventListener('close', onClose);
          resolve(dlg.returnValue === 'ok');
        });
      });
    }
  };

  /* ---------- 設定 ---------- */

  function applySettings() {
    const root = document.documentElement;
    root.dataset.anim = MJ.anim.reducedMotion() ? 'minimal' : MJ.settings.animSpeed;
    root.dataset.tileSize = MJ.settings.tileSize;
    MJ.debug.render();
  }

  function buildSettingsForm(container, keys) {
    container.replaceChildren();
    MJ.storage.SETTINGS_SCHEMA.forEach(function (def) {
      if (keys && keys.indexOf(def.key) < 0) return;
      const row = document.createElement('label');
      row.className = 'set-row set-' + def.type;
      const text = document.createElement('span');
      text.className = 'set-label';
      text.textContent = def.label;
      if (def.help) {
        const help = document.createElement('small');
        help.textContent = def.help;
        text.appendChild(help);
      }
      row.appendChild(text);

      let input;
      if (def.type === 'select') {
        input = document.createElement('select');
        def.options.forEach(function (opt) {
          const o = document.createElement('option');
          o.value = opt[0]; o.textContent = opt[1];
          input.appendChild(o);
        });
      } else if (def.type === 'toggle') {
        input = document.createElement('input');
        input.type = 'checkbox';
        input.className = 'switch';
        input.setAttribute('role', 'switch');
      } else {
        input = document.createElement('input');
        input.type = 'range';
        input.min = def.min; input.max = def.max; input.step = def.step;
        const out = document.createElement('output');
        out.className = 'set-output';
        row.appendChild(out);
      }
      input.dataset.setting = def.key;
      input.addEventListener(def.type === 'range' ? 'input' : 'change', function () {
        const v = def.type === 'toggle' ? input.checked : def.type === 'range' ? Number(input.value) : input.value;
        MJ.updateSetting(def.key, v);
        if (def.key === 'volume' || def.key === 'sound') MJ.audio.play('select');
      });
      row.insertBefore(input, row.querySelector('output'));
      container.appendChild(row);
    });
    syncSettingControls();
  }

  function syncSettingControls() {
    $$('[data-setting]').forEach(function (input) {
      const v = MJ.settings[input.dataset.setting];
      if (input.type === 'checkbox') input.checked = !!v;
      else input.value = String(v);
      const out = input.parentElement.querySelector('output');
      if (out) out.textContent = Math.round(v * 100) + '%';
    });
  }

  /* ---------- 情報画面 ---------- */

  function renderStats() {
    const s = MJ.stats;
    const body = $('#stats-body');
    body.innerHTML =
      '<div class="stat-card"><h3>牌操作デモ</h3><dl>' +
      '<div><dt>配牌回数</dt><dd>' + s.demo.deals + '</dd></div>' +
      '<div><dt>ツモ回数</dt><dd>' + s.demo.draws + '</dd></div>' +
      '<div><dt>打牌回数</dt><dd>' + s.demo.discards + '</dd></div></dl></div>' +
      '<div class="stat-card"><h3>何切る問題</h3><dl>' +
      '<div><dt>挑戦数</dt><dd>' + s.nanikiru.attempts + '</dd></div>' +
      '<div><dt>正答数（最有力・有力）</dt><dd>' + s.nanikiru.correct + '</dd></div>' +
      '<div><dt>正答率</dt><dd>' + (s.nanikiru.attempts ? MJ.nanikiruModel.accuracy(s.nanikiru) + '%' : '—') + '</dd></div>' +
      '<div><dt>挑戦した問題</dt><dd>' + Object.keys(s.nanikiru.byQuestion).length + ' / ' + MJ.QUESTIONS.length + '</dd></div></dl></div>';
    body.appendChild(matchStatsCard(s.match));
  }

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function statRow(dl, label, value) {
    const d = el('div');
    d.append(el('dt', null, label), el('dd', null, value));
    dl.append(d);
  }

  /* CPU四人麻雀の戦績カード（保存データ由来の文字列は textContent で入れる） */
  function matchStatsCard(m) {
    const card = el('div', 'stat-card stat-card-wide');
    card.append(el('h3', null, 'CPU四人麻雀'));
    const sum = MJ.matchStats.summary(m);
    if (!sum.games) {
      card.append(el('p', 'muted', 'まだ記録がありません。東風戦を最後まで打つと記録されます（途中で終了した対局は記録しません）。'));
      return card;
    }
    const dl = el('dl');
    statRow(dl, '対局数', sum.games + '戦（' + sum.rounds + '局）');
    statRow(dl, '平均順位', sum.avgRank.toFixed(2));
    statRow(dl, '1位率／4位率', sum.topRate + '%／' + sum.lastRate + '%');
    statRow(dl, '平均の最終点数', sum.avgScore.toLocaleString('ja-JP') + '点');
    statRow(dl, '和了率（うちツモ）', sum.winRate + '%（' + sum.tsumoShare + '%）');
    statRow(dl, '放銃率', sum.dealInRate + '%');
    statRow(dl, 'リーチ率／副露率', sum.riichiRate + '%／' + sum.callRate + '%');
    card.append(dl);

    /* 順位分布：棒の長さ＋回数と割合の文字（色だけに頼らない） */
    card.append(el('h4', null, '順位分布'));
    const bars = el('div', 'rank-bars');
    m.placements.forEach(function (n, i) {
      const row = el('div', 'rank-bar rank-bar-' + (i + 1));
      const pctv = sum.games ? Math.round((n / sum.games) * 100) : 0;
      const bar = el('span', 'rank-bar-fill');
      bar.style.width = pctv + '%';
      const track = el('span', 'rank-bar-track');
      track.append(bar);
      row.append(el('span', 'rank-bar-label', (i + 1) + '位'), track, el('span', 'rank-bar-num', n + '回（' + pctv + '%）'));
      bars.append(row);
    });
    card.append(bars);

    card.append(el('h4', null, 'CPUレベル別'));
    const lv = el('dl');
    ['1', '2', '3'].forEach(function (k) {
      const b = m.byLevel[k];
      if (!b || !b.games) return;
      const avg = b.placements.reduce(function (a, n, i) { return a + n * (i + 1); }, 0) / b.games;
      statRow(lv, 'レベル' + k, b.games + '戦・平均順位 ' + avg.toFixed(2) + '・1位 ' + b.placements[0] + '回');
    });
    card.append(lv);

    if (m.bestHand && m.bestHand.points) {
      card.append(el('h4', null, '最高の和了'));
      const best = el('p', 'best-hand');
      best.append(el('strong', null, m.bestHand.head + ' ' + (m.bestHand.pointsText || m.bestHand.points + '点')));
      best.append(el('span', null, '　' + (m.bestHand.yaku || []).join('・') + '（' + (m.bestHand.round || '') + '・' + (m.bestHand.date || '') + '）'));
      card.append(best);
    }

    if (m.history.length) {
      card.append(el('h4', null, '直近の対局（新しい順）'));
      const ol = el('ol', 'match-history');
      m.history.forEach(function (x) {
        ol.append(el('li', 'rank-' + x.rank, x.date + '　' + x.rank + '位　' + Number(x.score).toLocaleString('ja-JP') + '点　レベル' + x.level + '・' + x.rounds + '局'));
      });
      card.append(ol);
    }

    const reset = el('button', 'btn btn-ghost btn-danger-ghost btn-sm', 'CPU四人麻雀の戦績をリセット');
    reset.type = 'button';
    reset.dataset.resetMatch = '1';
    card.append(reset);
    return card;
  }

  async function resetMatchStats() {
    const ok = await MJ.ui.confirm('CPU四人麻雀の戦績（対局数・順位・和了率・履歴など）をリセットします。元に戻せません。よろしいですか？', { title: '戦績のリセット', ok: 'リセットする', danger: true });
    if (!ok) return;
    MJ.matchStats.reset(MJ.stats);
    MJ.saveStats();
    renderStats();
    MJ.ui.toast('CPU四人麻雀の戦績をリセットしました');
  }

  function renderRules() {
    const tbody = $('#rules-body');
    tbody.innerHTML = '';
    MJ.RULE_INFO.forEach(function (r) {
      const tr = document.createElement('tr');
      tr.innerHTML = '<th scope="row"></th><td></td><td></td><td></td>';
      tr.children[0].textContent = r.label;
      tr.children[1].textContent = r.value;
      const badge = document.createElement('span');
      badge.className = 'badge ' + (r.status === 'active' ? 'badge-active' : 'badge-planned');
      badge.textContent = r.status === 'active' ? '反映中' : '未実装';
      tr.children[2].appendChild(badge);
      tr.children[3].textContent = r.note;
      tbody.appendChild(tr);
    });
  }

  function renderChangelog() {
    const box = $('#changelog-body');
    box.innerHTML = '';
    MJ.CHANGELOG.forEach(function (entry) {
      const sec = document.createElement('section');
      sec.className = 'log-entry';
      const h = document.createElement('h3');
      h.textContent = 'v' + entry.version + '（' + entry.date + '）';
      const ul = document.createElement('ul');
      entry.items.forEach(function (it) {
        const li = document.createElement('li');
        li.textContent = it;
        ul.appendChild(li);
      });
      sec.append(h, ul);
      box.appendChild(sec);
    });
  }

  /* モードカードの装飾牌 */
  function renderModeArt() {
    $$('.mode-art').forEach(function (box, i) {
      if (box.dataset.tiles) {
        MJ.tiles.parse(box.dataset.tiles).forEach(function (spec, j) {
          const t = MJ.renderer.createStaticTile({ id: 'art' + i + j, suit: spec.suit, rank: spec.rank, isRed: spec.isRed, displayName: '' }, 'tile-art');
          t.removeAttribute('role');
          t.removeAttribute('aria-label');
          box.appendChild(t);
        });
      }
      for (let j = 0; j < Number(box.dataset.backs || 0); j++) box.appendChild(MJ.renderer.createBackTile('tile-art'));
    });
  }

  async function resetData() {
    const ok = await MJ.ui.confirm('設定と成績をすべて初期化します。元に戻せません。よろしいですか？', { title: 'データ初期化', ok: '初期化する', danger: true });
    if (!ok) return;
    MJ.storage.resetAll();
    MJ.settings = MJ.storage.loadSettings();
    MJ.stats = MJ.storage.loadStats();
    applySettings();
    syncSettingControls();
    renderStats();
    MJ.ui.toast('データを初期化しました');
  }

  /* ---------- ルーター ---------- */

  let currentRoute = null;
  let currentParam = null;

  /* "#/demo" → { name: 'demo' }、"#/nanikiru/Q003" → { name: 'nanikiru-play', param: 'Q003' } */
  function routeFromHash() {
    const path = window.location.hash.replace(/^#\/?/, '');
    const m = /^nanikiru\/([A-Za-z0-9_-]+)$/.exec(path);
    if (m) return { name: 'nanikiru-play', param: m[1] };
    return { name: ROUTES.indexOf(path) >= 0 && path !== 'nanikiru-play' ? path : 'title', param: null };
  }

  function show(name, param) {
    if (name === currentRoute && (param || null) === currentParam) return;
    const prevHooks = MJ.screens[currentRoute];
    if (prevHooks && prevHooks.leave) prevHooks.leave();
    $$('[data-screen]').forEach(function (sec) { sec.hidden = sec.dataset.screen !== name; });
    currentRoute = name;
    currentParam = param || null;
    document.body.dataset.route = name;

    if (name === 'stats') renderStats();
    if (name === 'rules') renderRules();
    if (name === 'about') renderChangelog();

    const hooks = MJ.screens[name];
    if (hooks && hooks.enter) hooks.enter(param);

    const sec = $('[data-screen="' + name + '"]');
    const heading = sec && $('h1, h2', sec);
    document.title = (heading && name !== 'title' ? heading.textContent + ' | ' : '') + MJ.APP_NAME;
    if (heading && name !== 'title') heading.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }

  function navigate(name) {
    const hash = name === 'title' ? '#/' : '#/' + name;
    if (window.location.hash === hash) show(name);
    else window.location.hash = hash;
  }

  /* ---------- 起動 ---------- */

  function init() {
    applySettings();
    buildSettingsForm($('#settings-form'));
    buildSettingsForm($('#menu-settings'), MENU_KEYS);
    $('#app-version').textContent = 'v' + MJ.VERSION;
    renderModeArt();

    document.addEventListener('click', function (e) {
      const nav = e.target.closest('[data-nav]');
      if (nav) {
        e.preventDefault();
        const dlg = nav.closest('dialog');
        if (dlg) dlg.close();
        MJ.audio.unlock();
        navigate(nav.dataset.nav);
        return;
      }
      if (e.target.closest('[data-open-menu]')) {
        /* 対局中だけ「対局を終了」を出す（終了は確認ダイアログを経る） */
        $('#menu-quit-match').hidden = !(currentRoute === 'cpu' && MJ.match.isActive());
        $('#dlg-menu').showModal();
      }
      if (e.target.closest('#menu-quit-match')) {
        $('#dlg-menu').close();
        MJ.match.quit();
      }
      if (e.target.closest('[data-reset-data]')) resetData();
      if (e.target.closest('[data-reset-match]')) resetMatchStats();
    });

    /* 最初のユーザー操作で AudioContext を有効化する */
    document.addEventListener('pointerdown', function unlock() {
      MJ.audio.unlock();
      document.removeEventListener('pointerdown', unlock);
    });

    document.addEventListener('keydown', function (e) {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (document.querySelector('dialog[open]')) return;
      if (e.target.closest('input, select, textarea')) return;
      const hooks = MJ.screens[currentRoute];
      if (hooks && hooks.onKey) hooks.onKey(e);
    });

    /* 画面回転・サイズ変更：状態はメモリーに保持したまま再配置だけ行う */
    let raf = 0;
    function relayout() {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(function () {
        const hooks = MJ.screens[currentRoute];
        if (hooks && hooks.onResize) hooks.onResize();
      });
    }
    window.addEventListener('resize', relayout);
    window.addEventListener('orientationchange', relayout);
    MJ.anim.onReducedMotionChange(applySettings);

    window.addEventListener('hashchange', function () { const r = routeFromHash(); show(r.name, r.param); });
    const first = routeFromHash();
    show(first.name, first.param);
  }

  document.addEventListener('DOMContentLoaded', init);
})(window.MJ = window.MJ || {});
