/*
 * CPU四人麻雀：対局画面（DOM・入力・進行のタイミング）。
 * 状態の変更はすべて MJ.gameEngine、CPUの判断は MJ.cpuPlayer を通す。
 *
 * 進行は「1手ずつ setTimeout で進める」方式。タイマーは常に1本だけにし（schedule）、
 * 演出中（locked）・画面を離れている間（paused）は進めない。画面回転では再配置だけを行う。
 */
(function (MJ) {
  'use strict';

  const E = MJ.gameEngine;
  const C = MJ.cpuPlayer;
  const RIVER_ANGLE = [0, -90, 180, 90];   // 席ごとの河の向き（自家が下）

  const EMBLEMS = {
    star: '<path d="M12 2l2.9 6.6 7.1.6-5.4 4.7 1.6 7L12 17.3 5.8 20.9l1.6-7L2 9.2l7.1-.6z"/>',
    leaf: '<path d="M20 3C9 3 4 9 4 16c0 2 .5 3.5 1 5 1-4 4-8 9-10-4 3-6.5 6.5-7.5 10C17 21 21 13 20 3z"/>',
    moon: '<path d="M15 2a10 10 0 1 0 7 17A8 8 0 0 1 15 2z"/>',
    flame: '<path d="M12 2c1 4 6 6 6 12a6 6 0 0 1-12 0c0-3 2-5 3-6 0 2 1 3 2 3 0-4-1-6 1-9z"/>'
  };

  let M = null;
  let el = null;
  let input = null;
  let timer = null;
  let paused = true;
  let locked = false;
  let selectedId = null;
  let focusId = null;
  let auto = false;
  let cpuLevel = 1;
  let overlayKey = null;
  let hintDismissed = false;
  const decisions = [];      // デバッグ表示用：直近のCPU判断

  function $(id) { return document.getElementById(id); }
  function h(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function fmt(n) { return n.toLocaleString('ja-JP'); }
  function signed(n) { return (n > 0 ? '+' : n < 0 ? '−' : '±') + fmt(Math.abs(n)); }

  function delays() {
    const s = MJ.settings.cpuSpeed;
    if (s === 'instant') return { think: 0, gap: 60 };
    if (s === 'slow') return { think: 950, gap: 380 };
    return { think: 480, gap: 180 };
  }

  /* ================= 初期化 ================= */

  function init() {
    el = {
      screen: $('screen-mt'),
      setup: $('mt-setup'),
      board: $('mt-board'),
      pondWrap: $('mt-pond-wrap'),
      pond: $('mt-pond'),
      round: $('mt-round'),
      honba: $('mt-honba'),
      sticks: $('mt-sticks'),
      remaining: $('mt-remaining'),
      dora: $('mt-dora'),
      hand: $('mt-hand'),
      handZone: $('mt-hand-zone'),
      status: $('mt-status'),
      btnDiscard: $('mt-btn-discard'),
      btnSort: $('mt-btn-sort'),
      btnAuto: $('mt-btn-auto'),
      overlay: $('mt-overlay'),
      hint: $('mt-landscape-hint'),
      seats: [], rivers: [], backs: [], edges: []
    };
    for (let s = 0; s < 4; s++) {
      el.seats.push(document.querySelector('.mt-seat[data-seat="' + s + '"]'));
      el.rivers.push($('mt-river-' + s));
      el.edges.push(document.querySelector('.mt-edge[data-seat="' + s + '"]'));
      buildSeat(s);
    }

    document.querySelectorAll('#mt-level [data-level]').forEach(function (b) {
      b.addEventListener('click', function () {
        const lv = Number(b.dataset.level);
        if (lv > 1) { MJ.ui.toast('CPUレベル' + lv + 'はフェーズ5で実装予定です', 'warn'); return; }
        cpuLevel = lv;
        document.querySelectorAll('#mt-level [data-level]').forEach(function (x) {
          x.setAttribute('aria-pressed', x === b ? 'true' : 'false');
        });
      });
    });
    $('mt-btn-start').addEventListener('click', startMatch);
    el.btnDiscard.addEventListener('click', function () {
      if (!selectedId) { refuse('先に切る牌を選んでください'); return; }
      playerDiscard(selectedId);
    });
    el.btnSort.addEventListener('click', sortHand);
    el.btnAuto.addEventListener('click', toggleAuto);
    $('mt-hint-close').addEventListener('click', function () { hintDismissed = true; el.hint.hidden = true; });

    input = MJ.handInput.attach(el.hand, {
      isLocked: function () { return locked || !M; },
      canDrag: function () { return isPlayerTurn() && !auto; },
      onTap: activate,
      onSwipe: function (id) { activate(id, 'swipe'); },
      onInfo: showInfo,
      onFocus: function (id) { focusId = id; }
    });

    if (window.ResizeObserver) {
      const ro = new ResizeObserver(fit);
      ro.observe(el.pondWrap);
      ro.observe(el.handZone);
    }
  }

  /* 席ごとのプレイヤーパネルと伏せ牌の置き場所を作る */
  function buildSeat(seat) {
    const def = E.PLAYER_DEFS[seat];
    const box = el.seats[seat];
    box.replaceChildren();
    const panel = h('div', 'mt-panel theme-' + def.theme);
    const emblem = h('span', 'mt-emblem');
    emblem.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true">' + EMBLEMS[def.emblem] + '</svg>';
    const name = h('span', 'mt-name', def.name);
    const wind = h('span', 'mt-wind', '');
    const oya = h('span', 'mt-oya', '親');
    const score = h('b', 'mt-score', '');
    const count = h('span', 'mt-count', '');
    const state = h('span', 'mt-state', '');
    const top = h('span', 'mt-panel-top');
    top.append(emblem, wind, name, oya);
    const bottom = h('span', 'mt-panel-bottom');
    bottom.append(score, count, state);
    panel.append(top, bottom);
    box.append(panel);
    if (seat !== 0) {
      const backs = h('div', 'mt-backs');
      backs.setAttribute('aria-hidden', 'true');
      box.append(backs);
      el.backs[seat] = backs;
    }
    box.panelParts = { panel: panel, wind: wind, oya: oya, score: score, count: count, state: state };
  }

  /* ================= 対局の開始・終了 ================= */

  function showView(view) {
    el.screen.dataset.view = view;
  }

  function startMatch() {
    M = E.createMatch({ cpuLevel: cpuLevel });
    E.decideDealer(M);
    auto = false;
    decisions.length = 0;
    showView('table');
    paused = false;
    clearTimer();
    el.hand.replaceChildren();
    el.rivers.forEach(function (r) { r.replaceChildren(); });
    render();
    fit();
    MJ.audio.play('start');
    const dealer = M.players[M.dealerIndex];
    showOverlay('dealer', '起家決定', function (body) {
      const dice = h('p', 'mt-dice');
      M.dice.forEach(function (d) { dice.append(h('span', 'mt-die', String(d))); });
      body.append(dice,
        h('p', 'mt-ov-lead', 'サイコロの合計 ' + (M.dice[0] + M.dice[1]) + ' → 起家（最初の親）は ' + dealer.name + ' です。'),
        h('p', 'mt-ov-note', '東風戦・持ち点25,000点。この版ではロン・ツモ和了、鳴き、リーチは未実装のため、各局は流局で終わります。'));
    }, '配牌する', function () {
      E.startRound(M);
      afterRoundStart();
    });
    MJ.debug.log('対局開始', { seed: M.seed, dealer: M.dealerIndex, dice: M.dice });
  }

  function afterRoundStart() {
    selectedId = null;
    focusId = null;
    el.hand.replaceChildren();
    el.rivers.forEach(function (r) { r.replaceChildren(); });
    render();
    fit();
    MJ.anim.dealIn(Array.prototype.slice.call(el.hand.children), 30);
    MJ.ui.announce(E.roundLabel(M) + ' ' + M.honba + '本場。親は' + M.players[M.dealerIndex].name + '。');
    MJ.debug.log('局開始', { round: E.roundLabel(M), honba: M.honba, dealer: M.dealerIndex });
    schedule(MJ.anim.ms(30 * 13 + 340) + 300);
  }

  async function quit() {
    if (!M) return;
    const ok = await MJ.ui.confirm('対局を終了します。この対局の結果は保存されません。よろしいですか？', { title: '対局を終了', ok: '終了する', danger: true });
    if (!ok) return;
    M = null;
    clearTimer();
    hideOverlay();
    showView('setup');
    MJ.ui.toast('対局を終了しました');
  }

  /* ================= 進行 ================= */

  function clearTimer() {
    clearTimeout(timer);
    timer = null;
  }

  /* 次の1手を予約する。予約は常に1本だけ（二重進行を防ぐ） */
  function schedule(delay) {
    if (timer || paused || !M) return;
    timer = setTimeout(function () { timer = null; step(); }, Math.max(0, delay || 0));
  }

  function step() {
    if (!M || paused || locked) return;
    const seat = M.currentPlayerIndex;
    const p = M.players[seat];
    if (M.phase === 'draw') {
      const r = E.draw(M);
      if (!r.ok) return;
      render();
      if (seat === 0) {
        animateDraw(r.tile);
        MJ.ui.vibrate(15);
        MJ.anim.pulse(el.handZone);
        MJ.ui.announce('あなたの番です。ツモ：' + MJ.tiles.ariaLabel(r.tile));
        MJ.audio.play('draw');
        if (auto) schedule(delays().think);
      } else {
        schedule(delays().think);
      }
      return;
    }
    if (M.phase === 'discard') {
      if (seat === 0 && !auto) return;   // あなたの入力待ち
      const d = C.chooseDiscard(p.hand, p.drawn, E.contextFor(M, seat));
      if (seat !== 0) {
        const text = C.describe(p, E.seatWind(M, seat), d);
        decisions.unshift(text);
        if (decisions.length > 6) decisions.length = 6;
        MJ.debug.log(text);
      }
      doDiscard(seat, d.tile.id);
      return;
    }
    if (M.phase === 'round-end') { showRoundResult(); return; }
    if (M.phase === 'match-end') showFinal();
  }

  function isPlayerTurn() {
    return !!M && M.phase === 'discard' && M.currentPlayerIndex === 0;
  }

  function doDiscard(seat, id) {
    const p = M.players[seat];
    let fromRect;
    if (seat === 0) {
      const btn = handButton(id);
      fromRect = btn ? btn.querySelector('.tile').getBoundingClientRect() : null;
    } else {
      const r = el.backs[seat].getBoundingClientRect();
      const w = 22;
      fromRect = { left: r.left + r.width / 2 - w / 2, top: r.top + r.height / 2 - w * 0.7, width: w, height: w * 1.4 };
    }
    const prev = seat === 0 ? MJ.anim.capture(el.hand) : null;
    const hadFocus = el.hand.contains(document.activeElement);
    const res = E.discard(M, seat, id, { autoSort: seat !== 0 || MJ.settings.autoSort });
    if (!res.ok) { refuse(res.reason); return; }

    locked = true;
    if (seat === 0) { selectedId = null; focusId = null; }
    MJ.tileInfo.hide();
    render();
    if (prev) MJ.anim.flip(el.hand, prev, 260);
    const riverTile = el.rivers[seat].lastElementChild;
    MJ.audio.play('discard');
    if (seat === 0) MJ.ui.vibrate(10);
    MJ.ui.announce(p.name + '：' + res.tile.displayName + (res.tsumogiri ? '（ツモ切り）' : ''));

    MJ.anim.flyFromRotated(riverTile, fromRect, RIVER_ANGLE[seat], { duration: seat === 0 ? 400 : 320, spin: seat === 0 ? 360 : 0 })
      .then(function () {
        locked = false;
        render();
        if (hadFocus) {
          const t = el.hand.querySelector('.tile-btn[tabindex="0"]');
          if (t) t.focus({ preventScroll: true });
        }
        if (res.roundEnded) {
          MJ.audio.play('end');
          schedule(700);
        } else {
          schedule(delays().gap);
        }
      });
  }

  function animateDraw(tile) {
    const btn = handButton(tile.id);
    if (!btn) return;
    const r = el.pond.getBoundingClientRect();
    const from = { left: r.left + r.width / 2 - 12, top: r.top + r.height / 2 - 16, width: 24, height: 32 };
    MJ.anim.flyFrom(btn, from, { fromOpacity: 0.2, duration: 320 }).then(function () {
      MJ.anim.pulse(btn.querySelector('.tile'));
    });
  }

  /* ================= あなたの操作 ================= */

  function activate(id, source) {
    if (!M || locked) return;
    MJ.tileInfo.hide();
    if (!isPlayerTurn()) {
      refuse(M.phase === 'discard' ? M.players[M.currentPlayerIndex].name + 'の番です' : 'あなたの番ではありません');
      return;
    }
    if (auto) { refuse('オート中です。オートを解除すると操作できます'); return; }
    const action = MJ.handInput.interpret(source, selectedId === id);
    if (action === 'commit') playerDiscard(id);
    else if (action === 'hint') MJ.ui.toast(MJ.handInput.commitHint('打牌'));
    else {
      selectedId = id;
      focusId = id;
      render();
      MJ.audio.play('select');
      const t = findPlayerTile(id);
      MJ.ui.announce(MJ.tiles.ariaLabel(t) + 'を選択しました。' + MJ.handInput.commitHint('打牌'));
    }
  }

  function playerDiscard(id) {
    if (!isPlayerTurn() || locked) { refuse('あなたの番ではありません'); return; }
    if (auto) { refuse('オート中です'); return; }
    doDiscard(0, id);
  }

  function sortHand() {
    if (!M || locked) return;
    const p = M.players[0];
    if (MJ.handSorter.isSorted(p.hand)) { MJ.ui.toast('すでに整列済みです'); return; }
    const prev = MJ.anim.capture(el.hand);
    p.hand = MJ.handSorter.sort(p.hand);
    render();
    MJ.anim.flip(el.hand, prev, 300);
    MJ.audio.play('sort');
  }

  function toggleAuto() {
    if (!M) return;
    auto = !auto;
    selectedId = null;
    render();
    MJ.ui.toast(auto ? 'オート：あなたの手番もCPU（レベル1）が打牌します' : 'オートを解除しました');
    if (auto && isPlayerTurn()) schedule(delays().think);
  }

  function refuse(reason) {
    MJ.ui.toast(reason, 'warn');
    MJ.audio.play('error');
  }

  function findPlayerTile(id) {
    const p = M.players[0];
    if (p.drawn && p.drawn.id === id) return p.drawn;
    return p.hand.find(function (t) { return t.id === id; });
  }

  function showInfo(btn) {
    const t = findPlayerTile(btn.dataset.id);
    if (!t) return;
    const notes = [];
    if (t.isRed) notes.push('赤ドラ（+1翻）');
    if (E.doraKinds(M).indexOf(t.kind) >= 0) notes.push('ドラ');
    if (M.players[0].drawn && M.players[0].drawn.id === t.id) notes.push('ツモ牌');
    MJ.tileInfo.show(btn, t.displayName, t.code, notes);
  }

  function onKey(e) {
    if (!M) return;
    const k = e.key.toLowerCase();
    if (k === 'd' && selectedId) { playerDiscard(selectedId); e.preventDefault(); }
    else if (k === 's') { sortHand(); e.preventDefault(); }
    else if (k === 'a') { toggleAuto(); e.preventDefault(); }
  }

  /* ================= 描画 ================= */

  function handButton(id) {
    return el.hand.querySelector('.tile-btn[data-id="' + id + '"]');
  }

  function render() {
    if (!M) return;
    const started = M.phase !== 'ready';
    const turnSeat = M.currentPlayerIndex;
    const myTurn = isPlayerTurn();

    /* 中央の情報 */
    el.round.textContent = E.roundLabel(M);
    el.honba.textContent = M.honba + '本場';
    el.sticks.textContent = M.riichiSticks;
    el.remaining.textContent = started && M.wall ? M.wall.live.length : '—';
    el.dora.replaceChildren();
    M.doraIndicators.forEach(function (t) {
      el.dora.append(MJ.renderer.createStaticTile(t, 'tile-dora', 'ドラ表示牌：' + MJ.tiles.ariaLabel(t)));
    });

    /* 各席 */
    M.players.forEach(function (p, seat) {
      const parts = el.seats[seat].panelParts;
      const wind = E.seatWind(M, seat);
      const isTurn = started && seat === turnSeat && (M.phase === 'draw' || M.phase === 'discard');
      const thinking = isTurn && p.isCPU && M.phase === 'discard';
      parts.wind.textContent = E.WIND_KANJI[wind];
      parts.oya.hidden = seat !== M.dealerIndex;
      parts.score.textContent = fmt(p.score);
      parts.count.textContent = (p.hand.length + (p.drawn ? 1 : 0)) + '枚';
      parts.state.textContent = thinking ? '考え中' : isTurn ? (seat === 0 ? 'あなたの番' : 'ツモ') : '';
      parts.panel.classList.toggle('is-turn', isTurn);
      parts.panel.classList.toggle('is-thinking', thinking);
      parts.panel.setAttribute('aria-label', E.SEAT_LABEL[seat] + ' ' + p.name + '、' + E.WIND_KANJI[wind] + '家' +
        (seat === M.dealerIndex ? '（親）' : '') + '、' + fmt(p.score) + '点' + (thinking ? '、考え中' : ''));

      el.edges[seat].textContent = E.WIND_KANJI[wind];
      el.edges[seat].classList.toggle('is-turn', isTurn);

      if (seat !== 0) renderBacks(seat, p);
      renderRiver(seat, p);
    });

    renderHand(myTurn);

    setDisabled(el.btnDiscard, !myTurn || !selectedId || locked || auto);
    const sel = selectedId && findPlayerTile(selectedId);
    el.btnDiscard.querySelector('.btn-sub').textContent = sel ? sel.displayName : '未選択';
    el.btnAuto.setAttribute('aria-pressed', auto ? 'true' : 'false');
    el.btnAuto.querySelector('.btn-sub').textContent = auto ? 'オン' : 'オフ';
    el.status.textContent = statusText(myTurn, sel);
    el.screen.classList.toggle('is-my-turn', myTurn);

    updateHint();
    MJ.debug.render();
  }

  function setDisabled(btn, disabled) {
    btn.setAttribute('aria-disabled', disabled ? 'true' : 'false');
    btn.classList.toggle('is-disabled', disabled);
  }

  function statusText(myTurn, sel) {
    if (M.phase === 'ready') return '配牌を待っています';
    if (M.phase === 'round-end') return '流局しました';
    if (M.phase === 'match-end') return '対局終了';
    if (auto) return 'オート中（Aキーまたは「オート」で解除）';
    if (!myTurn) return M.players[M.currentPlayerIndex].name + 'の番です';
    if (!sel) return 'あなたの番です。切る牌を選んでください';
    return '選択中：' + MJ.tiles.ariaLabel(sel) + ' — ' + MJ.handInput.commitHint('打牌');
  }

  function renderBacks(seat, p) {
    const box = el.backs[seat];
    const key = p.hand.length + ':' + (p.drawn ? 1 : 0);
    if (box.dataset.key === key) return;
    box.dataset.key = key;
    box.replaceChildren();
    for (let i = 0; i < p.hand.length; i++) box.append(MJ.renderer.createBackTile('tile-cpu'));
    if (p.drawn) box.append(MJ.renderer.createBackTile('tile-cpu is-drawn'));
  }

  function renderRiver(seat, p) {
    const last = M.lastDiscard && M.lastDiscard.seat === seat ? M.lastDiscard.tile.id : null;
    MJ.renderer.reconcile(el.rivers[seat], p.discards, function (d) { return d.tile.id; }, function (d) {
      const t = MJ.renderer.createStaticTile(d.tile, 'tile-pond' + (d.tsumogiri ? ' is-tsumogiri' : ''),
        p.name + 'の捨て牌：' + MJ.tiles.ariaLabel(d.tile, d.tsumogiri ? 'ツモ切り' : '手出し'));
      t.setAttribute('role', 'listitem');
      return t;
    }, function (node, d) {
      node.classList.toggle('is-last', d.tile.id === last);
    });
  }

  function renderHand(myTurn) {
    const p = M.players[0];
    const items = p.drawn ? p.hand.concat([p.drawn]) : p.hand.slice();
    const doraKinds = E.doraKinds(M);
    if (!items.some(function (t) { return t.id === focusId; })) focusId = selectedId || (items[0] && items[0].id);
    MJ.renderer.reconcile(el.hand, items, function (t) { return t.id; }, MJ.renderer.createHandTile, function (btn, t) {
      const isDrawn = !!(p.drawn && p.drawn.id === t.id);
      const isSel = t.id === selectedId;
      const isDora = doraKinds.indexOf(t.kind) >= 0;
      btn.classList.toggle('is-drawn', isDrawn && MJ.settings.separateDraw);
      btn.classList.toggle('is-selected', isSel);
      btn.classList.toggle('is-dora', isDora);
      btn.setAttribute('aria-pressed', isSel ? 'true' : 'false');
      btn.setAttribute('aria-disabled', myTurn && !locked && !auto ? 'false' : 'true');
      btn.tabIndex = t.id === focusId ? 0 : -1;
      const extras = [];
      if (isDrawn) extras.push('ツモ牌');
      if (isDora) extras.push('ドラ');
      btn.setAttribute('aria-label', MJ.tiles.ariaLabel(t, extras.join('、')));
    });
    el.hand.classList.toggle('is-waiting', !myTurn);
    el.hand.classList.toggle('is-locked', locked);
  }

  function updateHint() {
    const portrait = window.innerHeight > window.innerWidth;
    el.hint.hidden = !(portrait && MJ.settings.landscapeHint && !hintDismissed && el.screen.dataset.view === 'table');
  }

  /* 卓のサイズ：中央の正方形に、情報パネル＋4方向の河（3段）が収まる牌幅を求める */
  function fit() {
    if (!el || el.screen.dataset.view !== 'table') return;
    const r = el.pondWrap.getBoundingClientRect();
    const P = Math.floor(Math.min(r.width, r.height)) - 4;
    if (P <= 0) return;
    const gap = 2;
    let rw = 34;
    /* 情報パネル I = 河の幅、奥行き D = 3段（牌の高さ＋厚み＋行間）＋余白 */
    while (rw > 10) {
      const I = 6 * rw + 5 * gap + 6;
      const D = 3 * (rw * 1.46 + 2) + 8;
      if (I + 2 * D <= P) break;
      rw -= 1;
    }
    const I = 6 * rw + 5 * gap + 6;
    el.screen.style.setProperty('--rw', rw + 'px');
    el.screen.style.setProperty('--info', I + 'px');
    el.screen.style.setProperty('--pond', P + 'px');
    el.screen.style.setProperty('--cpu-w', Math.max(10, Math.min(22, Math.round(rw * 0.85))) + 'px');
    /* 低い横長画面では、手牌に使う高さを抑えて卓に回す */
    const lowLandscape = window.innerWidth > window.innerHeight && window.innerHeight <= 520;
    MJ.renderer.fitHand(el.screen, el.hand, el.handZone, 14.45, lowLandscape ? 0.27 : 0.3);
  }

  /* ================= 局結果・最終結果 ================= */

  function showOverlay(key, title, build, buttonLabel, onNext) {
    overlayKey = key;
    const ov = el.overlay;
    ov.replaceChildren();
    const card = h('div', 'mt-ov-card');
    const head = h('h3', 'mt-ov-title', title);
    head.id = 'mt-ov-title';
    const body = h('div', 'mt-ov-body');
    build(body);
    const actions = h('div', 'mt-ov-actions');
    const next = h('button', 'btn btn-primary', buttonLabel);
    next.type = 'button';
    next.addEventListener('click', function () {
      hideOverlay();
      onNext();
    }, { once: true });
    actions.append(next);
    card.append(head, body, actions);
    ov.append(card);
    ov.hidden = false;
    if (MJ.anim.factor() > 0 && card.animate) {
      card.animate([{ transform: 'translateY(24px) scale(.96)', opacity: 0 }, { transform: 'none', opacity: 1 }],
        { duration: MJ.anim.ms(320), easing: 'cubic-bezier(.2,.8,.2,1)' });
    }
    next.focus({ preventScroll: true });
    return actions;
  }

  function hideOverlay() {
    overlayKey = null;
    el.overlay.hidden = true;
    el.overlay.replaceChildren();
  }

  function showRoundResult() {
    const key = 'round-' + M.roundCount;
    if (overlayKey === key) return;
    const r = M.result;
    const next = E.peekNext(M);
    showOverlay(key, '流局', function (body) {
      body.append(h('p', 'mt-ov-lead', r.label + ' ' + r.honba + '本場 — 山がなくなりました'));
      const list = h('ul', 'mt-res-list');
      M.players.forEach(function (p, seat) {
        const li = h('li', 'mt-res-row theme-' + p.theme);
        const who = h('span', 'mt-res-who');
        who.append(h('span', 'mt-wind', E.WIND_KANJI[E.seatWind(M, seat)]), h('b', null, p.name));
        const badge = h('span', 'badge ' + (r.tenpai[seat] ? 'badge-tenpai' : 'badge-noten'), r.tenpai[seat] ? 'テンパイ' : 'ノーテン');
        const delta = h('span', 'mt-delta ' + (r.deltas[seat] > 0 ? 'is-plus' : r.deltas[seat] < 0 ? 'is-minus' : ''), signed(r.deltas[seat]));
        const score = h('span', 'mt-res-score', fmt(r.before[seat]));
        countUp(score, r.before[seat], r.after[seat]);
        li.append(who, badge, delta, score);
        if (r.tenpai[seat]) {
          const handBox = h('span', 'mt-res-hand');
          p.hand.forEach(function (t) { handBox.append(MJ.renderer.createStaticTile(t, 'tile-xs')); });
          li.append(handBox);
        }
        list.append(li);
      });
      body.append(list);
      const n = r.tenpai.filter(Boolean).length;
      body.append(h('p', 'mt-ov-note', (n === 0 || n === 4 ? '全員' + (n ? 'テンパイ' : 'ノーテン') + 'のため点数の移動はありません。' : 'ノーテン罰符 3,000点をテンパイ者が受け取ります。') +
        (next.ended ? '' : (next.renchan ? '親がテンパイのため連荘します。' : '親がノーテンのため親が移ります。'))));
    }, next.ended ? '最終結果へ' : '次の局へ（' + next.label + ' ' + next.honba + '本場）', function () {
      const res = E.nextRound(M);
      if (res.ended) showFinal();
      else afterRoundStart();
    });
    render();
    MJ.ui.announce('流局。' + M.players.map(function (p, i) { return p.name + (r.tenpai[i] ? 'テンパイ' : 'ノーテン'); }).join('、'));
  }

  function showFinal() {
    if (overlayKey === 'final') return;
    clearTimer();
    MJ.audio.play('end');
    const actions = showOverlay('final', '対局終了', function (body) {
      body.append(h('p', 'mt-ov-lead', M.endReason + '（全' + M.history.length + '局）'));
      const ol = h('ol', 'mt-rank-list');
      M.ranking.forEach(function (r) {
        const p = M.players[r.seat];
        const li = h('li', 'mt-rank rank-' + r.rank + ' theme-' + p.theme);
        li.append(h('span', 'mt-rank-no', r.rank + '位'), h('b', 'mt-rank-name', p.name),
          h('span', 'mt-rank-score', fmt(r.score) + '点'),
          h('span', 'mt-delta ' + (r.score - M.rules.startScore >= 0 ? 'is-plus' : 'is-minus'), signed(r.score - M.rules.startScore)));
        ol.append(li);
      });
      body.append(ol, h('p', 'mt-ov-note', '戦績の保存はフェーズ6で対応します（現在は保存されません）。'));
      if (M.ranking[0].seat === 0) MJ.anim.burst(window.innerWidth / 2, window.innerHeight / 2, { count: 28, spread: 120 });
    }, 'もう一度対局する', function () {
      M = null;
      showView('setup');
    });
    const back = h('button', 'btn btn-ghost', 'モード選択へ');
    back.type = 'button';
    back.dataset.nav = 'modes';
    back.addEventListener('click', function () { M = null; hideOverlay(); showView('setup'); });
    actions.prepend(back);
    MJ.ui.announce('対局終了。' + M.ranking.map(function (r) { return r.rank + '位 ' + r.name + ' ' + r.score + '点'; }).join('、'));
  }

  /* 点数の数え上げ演出（transform を使わない数値の更新のみ。演出少なめでは即時） */
  function countUp(node, from, to) {
    if (from === to || MJ.anim.factor() === 0) { node.textContent = fmt(to); return; }
    const dur = MJ.anim.ms(900);
    const t0 = performance.now();
    function tick(now) {
      const k = Math.min(1, (now - t0) / dur);
      node.textContent = fmt(Math.round(from + (to - from) * (1 - Math.pow(1 - k, 3))));
      if (k < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
    setTimeout(function () { node.textContent = fmt(to); }, dur + 200);
  }

  function debugSummary() {
    if (!M) return '（対局していません）';
    const lines = [
      'seed: ' + M.seed + '  phase: ' + M.phase + '  ' + E.roundLabel(M) + ' ' + M.honba + '本場',
      'turn: ' + M.players[M.currentPlayerIndex].name + '  wall: ' + (M.wall ? M.wall.live.length : '-') + '  locked: ' + locked + '  timer: ' + !!timer
    ];
    M.players.forEach(function (p) {
      lines.push(p.name + ' ' + p.score + '  ' + MJ.tiles.toString(p.hand) + (p.drawn ? ' +' + p.drawn.code : ''));
    });
    return lines.concat(['— CPU判断 —'], decisions).join('\n');
  }

  MJ.match = {
    enter: function () {
      if (!el) init();
      showView(M ? 'table' : 'setup');
      paused = false;
      MJ.debug.setProvider(debugSummary);
      if (M) {
        render();
        fit();
        if (!overlayKey) schedule(300);
      }
    },
    leave: function () {
      paused = true;
      clearTimer();
      MJ.tileInfo.hide();
      if (input) input.cancel();
      MJ.debug.setProvider(null);
    },
    onResize: function () {
      MJ.tileInfo.hide();
      fit();
      updateHint();
    },
    onSettings: function () { if (M) { render(); fit(); } },
    onKey: onKey,
    isActive: function () { return !!M; },
    quit: quit
  };
})(window.MJ = window.MJ || {});
