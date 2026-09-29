/*
 * 牌操作デモ：画面と入力。状態の変更はすべて MJ.demoModel を通す。
 */
(function (MJ) {
  'use strict';

  const M = MJ.demoModel;
  let S = null;             // demoModel の状態
  let selectedId = null;
  let focusId = null;
  let locked = false;       // 演出中・処理中は入力を受け付けない（二重処理防止）
  let gesture = null;
  let infoTimer = null;
  let el = null;

  function $(id) { return document.getElementById(id); }

  function init() {
    el = {
      screen: $('screen-demo'),
      hand: $('demo-hand'),
      handZone: $('demo-hand-zone'),
      river: $('demo-river'),
      riverArea: $('demo-river-area'),
      remaining: $('demo-remaining'),
      wallStack: $('demo-wall-stack'),
      doraInd: $('demo-dora-ind'),
      doraName: $('demo-dora-name'),
      turn: $('demo-turn'),
      status: $('demo-status'),
      banner: $('demo-banner'),
      btnDeal: $('demo-btn-deal'),
      btnDraw: $('demo-btn-draw'),
      btnDiscard: $('demo-btn-discard'),
      btnSort: $('demo-btn-sort'),
      btnLoad: $('demo-btn-load'),
      info: $('tile-info'),
      dlgLoad: $('dlg-load')
    };

    el.btnDeal.addEventListener('click', function () { newDeal(); });
    el.btnDraw.addEventListener('click', draw);
    el.btnSort.addEventListener('click', sortHand);
    el.btnDiscard.addEventListener('click', function () {
      if (!selectedId) { refuse('先に切る牌を選んでください'); return; }
      tryDiscard(selectedId);
    });
    el.btnLoad.addEventListener('click', openLoadDialog);
    $('demo-banner-deal').addEventListener('click', function () { newDeal(); });

    el.hand.addEventListener('pointerdown', onPointerDown);
    el.hand.addEventListener('pointermove', onPointerMove);
    el.hand.addEventListener('pointerup', onPointerUp);
    el.hand.addEventListener('pointercancel', cancelGesture);
    el.hand.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    el.hand.addEventListener('click', function (e) {
      /* ポインター操作は pointerup で処理済み。detail===0 はキーボード由来のクリック */
      const btn = e.target.closest('.tile-btn');
      if (btn && e.detail === 0) activate(btn.dataset.id, 'key');
    });
    el.hand.addEventListener('keydown', onHandKey);
    el.hand.addEventListener('focusin', function (e) {
      const btn = e.target.closest('.tile-btn');
      if (btn) focusId = btn.dataset.id;
    });

    setupLoadDialog();
    if (window.ResizeObserver) new ResizeObserver(fit).observe(el.handZone);
  }

  /* ---------- 状態変更 ---------- */

  function newDeal(preset) {
    let next;
    try {
      next = M.create({
        rules: MJ.RULES,
        seed: preset && preset.seed,
        presetHand: preset && preset.hand,
        fixedDraws: preset && preset.draws,
        autoSort: MJ.settings.autoSort
      });
    } catch (e) {
      refuse(e.message);
      return e.message;
    }
    S = next;
    selectedId = null;
    focusId = null;
    hideInfo();
    el.hand.replaceChildren();
    el.river.replaceChildren();
    renderDora();
    render();

    const tiles = Array.prototype.slice.call(el.hand.children);
    MJ.anim.dealIn(tiles, 45);
    MJ.anim.dealIn(Array.prototype.slice.call(el.doraInd.children), 0);
    lockFor(MJ.anim.ms(45 * tiles.length + 340));

    MJ.stats.demo.deals += 1;
    MJ.saveStats();
    MJ.audio.play('start');
    MJ.ui.announce('配牌しました。' + (S.drawn ? '14枚です。打牌してください。' : 'ツモボタンで牌を引いてください。'));
    MJ.debug.log('配牌', { seed: S.seed, hand: MJ.tiles.toString(S.hand), drawn: S.drawn && S.drawn.code });
    return null;
  }

  function draw() {
    if (locked) return;
    const check = M.canDraw(S);
    if (!check.ok) { refuse(check.reason); return; }
    const res = M.draw(S);
    selectedId = null;
    focusId = res.tile.id;
    render();

    const btn = handButton(res.tile.id);
    const stack = el.wallStack.getBoundingClientRect();
    const w = btn ? btn.getBoundingClientRect().width * 0.6 : 20;
    const from = { left: stack.left + stack.width / 2 - w / 2, top: stack.top, width: w, height: w * 1.4 };
    locked = true;
    MJ.anim.flyFrom(btn, from, { fromOpacity: 0.2, duration: 360 }).then(function () {
      locked = false;
      if (btn) MJ.anim.pulse(btn.querySelector('.tile'));
      render();
    });

    MJ.stats.demo.draws += 1;
    MJ.saveStats();
    MJ.audio.play('draw');
    MJ.ui.vibrate(10);
    MJ.ui.announce('ツモ：' + MJ.tiles.ariaLabel(res.tile) + '。打牌してください');
    MJ.debug.log('ツモ', { tile: res.tile.code, remaining: S.wall.live.length });
  }

  function tryDiscard(id) {
    if (locked) return;
    const btn = handButton(id);
    const fromRect = btn ? btn.querySelector('.tile').getBoundingClientRect() : null;
    const prev = MJ.anim.capture(el.hand);
    const hadFocus = el.hand.contains(document.activeElement);
    const res = M.discard(S, id, { autoSort: MJ.settings.autoSort });
    if (!res.ok) { refuse(res.reason); return; }

    locked = true;
    selectedId = null;
    focusId = null;
    hideInfo();
    render();
    MJ.anim.flip(el.hand, prev, 260);

    el.riverArea.scrollTop = el.riverArea.scrollHeight;
    const riverTile = el.river.lastElementChild;
    MJ.audio.play('discard');
    MJ.ui.vibrate(12);
    MJ.anim.flyFrom(riverTile, fromRect, { rotate: 360, duration: 430 }).then(function () {
      MJ.anim.pulse(riverTile);
      MJ.anim.burstAt(riverTile, { count: 8, spread: 22 });
      locked = false;
      render();
      if (hadFocus) {
        const target = el.hand.querySelector('.tile-btn[tabindex="0"]');
        if (target) target.focus({ preventScroll: true });
      }
      if (S.finished) {
        MJ.audio.play('end');
        MJ.ui.announce('山がなくなりました。流局です。');
      }
    });

    MJ.stats.demo.discards += 1;
    MJ.saveStats();
    MJ.ui.announce(res.tile.displayName + 'を' + (res.tsumogiri ? 'ツモ切り' : '手出し') + 'しました');
    MJ.debug.log('打牌', { tile: res.tile.code, tsumogiri: res.tsumogiri, hand: MJ.tiles.toString(S.hand) });
  }

  function sortHand() {
    if (locked) return;
    if (MJ.handSorter.isSorted(S.hand)) { MJ.ui.toast('すでに整列済みです'); return; }
    const prev = MJ.anim.capture(el.hand);
    M.sortHand(S);
    render();
    MJ.anim.flip(el.hand, prev, 320);
    MJ.audio.play('sort');
    MJ.ui.announce('手牌を整列しました');
  }

  function select(id) {
    selectedId = id;
    focusId = id;
    render();
    MJ.audio.play('select');
    const tile = M.findTile(S, id);
    if (tile) MJ.ui.announce(MJ.tiles.ariaLabel(tile) + 'を選択しました。' + confirmHint());
  }

  /* タップ／キーボード／スワイプを打牌方法の設定に従って解釈する */
  function activate(id, source) {
    if (locked || !S) return;
    hideInfo();
    const check = M.canDiscard(S);
    if (!check.ok) { refuse(check.reason); return; }

    const method = MJ.settings.discardMethod;
    const guard = MJ.settings.misdiscardGuard;
    const isSelected = selectedId === id;

    if (source === 'swipe') {
      if (method === 'confirm' || (guard && !isSelected)) { select(id); return; }
      tryDiscard(id);
      return;
    }
    if (method === 'retap' && (isSelected || !guard)) { tryDiscard(id); return; }
    if (isSelected) { MJ.ui.toast(confirmHint()); return; }
    select(id);
  }

  function confirmHint() {
    const method = MJ.settings.discardMethod;
    if (method === 'retap') return 'もう一度押すと打牌します';
    if (method === 'swipe') return '上スワイプまたは「この牌を切る」で打牌します';
    return '「この牌を切る」で打牌します';
  }

  function refuse(reason) {
    MJ.ui.toast(reason, 'warn');
    MJ.audio.play('error');
  }

  function lockFor(ms) {
    locked = true;
    render();
    setTimeout(function () { locked = false; render(); }, ms);
  }

  /* ---------- 描画 ---------- */

  function handButton(id) {
    return el.hand.querySelector('.tile-btn[data-id="' + id + '"]');
  }

  function orderedHand() {
    return S.drawn ? S.hand.concat([S.drawn]) : S.hand.slice();
  }

  function renderDora() {
    const ind = S.wall.doraIndicators[0];
    el.doraInd.replaceChildren(MJ.renderer.createStaticTile(ind, 'tile-mini', 'ドラ表示牌：' + MJ.tiles.ariaLabel(ind)));
    const dora = MJ.tiles.suitRankOf(M.doraKinds(S)[0]);
    el.doraName.textContent = MJ.tiles.nameOf(dora.suit, dora.rank);
  }

  function render() {
    if (!S) return;
    const canDiscard = M.canDiscard(S).ok;
    const doraKinds = M.doraKinds(S);
    const items = orderedHand();
    if (!items.some(function (t) { return t.id === focusId; })) focusId = selectedId || (items[0] && items[0].id);

    MJ.renderer.reconcile(el.hand, items, function (t) { return t.id; }, MJ.renderer.createHandTile, function (btn, t) {
      const isDrawn = !!(S.drawn && S.drawn.id === t.id);
      const isSel = t.id === selectedId;
      const isDora = doraKinds.indexOf(t.kind) >= 0;
      btn.classList.toggle('is-drawn', isDrawn && MJ.settings.separateDraw);
      btn.classList.toggle('is-selected', isSel);
      btn.classList.toggle('is-dora', isDora);
      btn.setAttribute('aria-pressed', isSel ? 'true' : 'false');
      btn.setAttribute('aria-disabled', canDiscard && !locked ? 'false' : 'true');
      btn.tabIndex = t.id === focusId ? 0 : -1;
      const extras = [];
      if (isDrawn) extras.push('ツモ牌');
      if (isDora) extras.push('ドラ');
      btn.setAttribute('aria-label', MJ.tiles.ariaLabel(t, extras.join('、')));
    });
    el.hand.classList.toggle('is-waiting', !canDiscard);
    el.hand.classList.toggle('is-locked', locked);

    MJ.renderer.reconcile(el.river, S.river, function (r) { return r.tile.id; }, function (r) {
      const t = MJ.renderer.createStaticTile(r.tile, 'tile-river' + (r.tsumogiri ? ' is-tsumogiri' : ''),
        MJ.tiles.ariaLabel(r.tile, r.tsumogiri ? 'ツモ切り' : '手出し'));
      t.setAttribute('role', 'listitem');
      return t;
    });
    el.riverArea.classList.toggle('is-empty', S.river.length === 0);

    el.remaining.textContent = S.wall.live.length;
    el.turn.textContent = S.turn;

    setDisabled(el.btnDraw, !M.canDraw(S).ok || locked);
    setDisabled(el.btnDiscard, !selectedId || !canDiscard || locked);
    setDisabled(el.btnSort, locked);
    el.btnDiscard.querySelector('.btn-sub').textContent = selectedId ? M.findTile(S, selectedId).displayName : '未選択';

    el.status.textContent = statusText(canDiscard);
    el.banner.hidden = !(S.finished && !canDiscard);
    MJ.debug.render();
  }

  /* 無効状態でも押せるようにし、押したら理由を表示する（非表示にしない） */
  function setDisabled(btn, disabled) {
    btn.setAttribute('aria-disabled', disabled ? 'true' : 'false');
    btn.classList.toggle('is-disabled', disabled);
  }

  function statusText(canDiscard) {
    if (S.finished && !canDiscard) return '山がなくなりました（流局）。「配牌」でやり直せます。';
    if (!canDiscard) return '「ツモ」で牌を1枚引いてください（手牌 ' + M.tileCount(S) + ' 枚）';
    if (!selectedId) return '切る牌を選んでください（' + confirmHintShort() + '）';
    const t = M.findTile(S, selectedId);
    const notes = [];
    if (t.isRed) notes.push('赤ドラ');
    if (M.doraKinds(S).indexOf(t.kind) >= 0) notes.push('ドラ');
    if (S.drawn && S.drawn.id === t.id) notes.push('ツモ牌');
    return '選択中：' + t.displayName + (notes.length ? '（' + notes.join('・') + '）' : '') + ' — ' + confirmHint();
  }

  function confirmHintShort() {
    const m = MJ.settings.discardMethod;
    return m === 'retap' ? 'タップで選択 → もう一度で打牌' : m === 'swipe' ? '上スワイプで打牌' : 'タップで選択 → 「この牌を切る」';
  }

  /* 画面幅に合わせて牌サイズを決める。小さすぎる場合は横スクロールへ切り替える */
  function fit() {
    if (!el || !S) return;
    const avail = el.handZone.clientWidth - 12;
    const base = MJ.TILE_SIZE_PX[MJ.settings.tileSize] || MJ.TILE_SIZE_PX.md;
    const slots = 14 + (MJ.settings.separateDraw ? 0.45 : 0);
    let w = Math.floor(avail / slots) - 2;
    /* 手牌ゾーン全体（浮き上がり分・厚み・状態表示を含む）が画面高の約1/3に収まる大きさ */
    const byHeight = Math.floor((window.innerHeight * 0.3 - 40) / 1.95);
    w = Math.min(base, w, Math.max(byHeight, MJ.TILE_MIN_PX + 6));
    const scroll = w < MJ.TILE_MIN_PX;
    if (scroll) w = MJ.TILE_MIN_PX;
    el.screen.style.setProperty('--tile-w', w + 'px');
    el.hand.classList.toggle('is-scroll', scroll);

    const riverAvail = el.riverArea.clientWidth - 16;
    /* 河は手牌より小さく、ただし縦長画面で余白がある場合は読みやすい大きさを確保する */
    const rw = Math.max(18, Math.min(Math.max(Math.round(w * 0.8), 30), Math.floor((riverAvail - 5 * 3) / MJ.RIVER_COLUMNS), 40));
    el.screen.style.setProperty('--river-w', rw + 'px');
  }

  /* ---------- 入力：タップ・スワイプ・長押し ---------- */

  function onPointerDown(e) {
    const btn = e.target.closest('.tile-btn');
    if (!btn || locked) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    hideInfo();
    gesture = { id: btn.dataset.id, btn: btn, x: e.clientX, y: e.clientY, pid: e.pointerId, moved: false, dragging: false, longPressed: false };
    gesture.timer = setTimeout(function () {
      if (!gesture || gesture.moved) return;
      gesture.longPressed = true;
      showInfo(btn);
      MJ.ui.vibrate(8);
    }, MJ.INPUT.longPressMs);
  }

  function onPointerMove(e) {
    const g = gesture;
    if (!g || e.pointerId !== g.pid) return;
    const dx = e.clientX - g.x;
    const dy = g.y - e.clientY; // 上方向が正
    if (Math.abs(dx) > MJ.INPUT.tapSlop || Math.abs(dy) > MJ.INPUT.tapSlop) {
      g.moved = true;
      clearTimeout(g.timer);
    }
    /* 縦方向が優勢な上向きの動きだけを打牌スワイプとして追従させる */
    if (!g.dragging && dy > MJ.INPUT.tapSlop && dy > Math.abs(dx) * 1.2 && M.canDiscard(S).ok) {
      g.dragging = true;
      g.btn.classList.add('is-dragging');
      try { g.btn.setPointerCapture(g.pid); } catch (err) { /* 未対応ブラウザーでは無視 */ }
    }
    if (g.dragging) {
      const lift = Math.max(0, Math.min(dy, MJ.INPUT.swipeFollowMax));
      g.btn.style.transform = 'translateY(' + (-lift) + 'px)';
      g.btn.classList.toggle('is-armed', dy >= MJ.INPUT.swipeDiscard);
    }
  }

  function onPointerUp(e) {
    const g = gesture;
    if (!g || e.pointerId !== g.pid) return;
    gesture = null;
    clearTimeout(g.timer);
    if (g.longPressed) { scheduleHideInfo(); return; }
    const dy = g.y - e.clientY;
    if (g.dragging) {
      const armed = dy >= MJ.INPUT.swipeDiscard;
      resetDrag(g.btn, !armed);
      if (armed) activate(g.id, 'swipe');
      return;
    }
    if (!g.moved) activate(g.id, 'tap');
  }

  function cancelGesture() {
    if (!gesture) return;
    clearTimeout(gesture.timer);
    resetDrag(gesture.btn, true);
    gesture = null;
  }

  function resetDrag(btn, animateBack) {
    const current = btn.style.transform;
    btn.style.transform = '';
    btn.classList.remove('is-dragging', 'is-armed');
    if (animateBack && current && MJ.anim.factor() > 0 && btn.animate) {
      btn.animate([{ transform: current }, { transform: 'translateY(0)' }], { duration: MJ.anim.ms(200), easing: 'ease-out' });
    }
  }

  function onHandKey(e) {
    const btns = Array.prototype.slice.call(el.hand.querySelectorAll('.tile-btn'));
    const idx = btns.indexOf(document.activeElement);
    if (idx < 0) return;
    let next = -1;
    if (e.key === 'ArrowRight') next = Math.min(btns.length - 1, idx + 1);
    else if (e.key === 'ArrowLeft') next = Math.max(0, idx - 1);
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = btns.length - 1;
    else if (e.key === 'i' || e.key === 'I') { showInfo(btns[idx]); scheduleHideInfo(); e.preventDefault(); return; }
    if (next < 0) return;
    e.preventDefault();
    btns.forEach(function (b, i) { b.tabIndex = i === next ? 0 : -1; });
    btns[next].focus();
    focusId = btns[next].dataset.id;
  }

  /* 画面全体のショートカット（入力欄・ダイアログ操作中は app.js 側で除外） */
  function onKey(e) {
    const k = e.key.toLowerCase();
    if (k === 't') { draw(); e.preventDefault(); }
    else if (k === 's') { sortHand(); e.preventDefault(); }
    else if (k === 'd' && selectedId) { tryDiscard(selectedId); e.preventDefault(); }
  }

  /* ---------- 牌の補足情報（長押し／Iキー） ---------- */

  function showInfo(btn) {
    const tile = M.findTile(S, btn.dataset.id);
    if (!tile) return;
    const notes = [];
    if (tile.isRed) notes.push('赤ドラ（+1翻）');
    if (M.doraKinds(S).indexOf(tile.kind) >= 0) notes.push('ドラ');
    if (S.drawn && S.drawn.id === tile.id) notes.push('ツモ牌');
    el.info.innerHTML = '';
    const title = document.createElement('strong');
    title.textContent = tile.displayName;
    const code = document.createElement('span');
    code.className = 'tile-info-code';
    code.textContent = tile.code;
    el.info.append(title, code);
    if (notes.length) {
      const p = document.createElement('span');
      p.textContent = notes.join(' / ');
      el.info.append(p);
    }
    const r = btn.getBoundingClientRect();
    const x = Math.max(80, Math.min(window.innerWidth - 80, r.left + r.width / 2));
    el.info.style.left = x + 'px';
    el.info.style.top = (r.top - 6) + 'px';
    el.info.hidden = false;
    MJ.ui.announce(tile.displayName + (notes.length ? '、' + notes.join('、') : ''));
  }

  function scheduleHideInfo() {
    clearTimeout(infoTimer);
    infoTimer = setTimeout(hideInfo, MJ.INPUT.infoHideMs);
  }

  function hideInfo() {
    clearTimeout(infoTimer);
    if (el && el.info) el.info.hidden = true;
  }

  /* ---------- 手牌読込ダイアログ（テスト用固定牌山） ---------- */

  function setupLoadDialog() {
    const form = el.dlgLoad.querySelector('form');
    const err = el.dlgLoad.querySelector('.form-error');
    el.dlgLoad.querySelectorAll('[data-sample]').forEach(function (b) {
      b.addEventListener('click', function () {
        form.elements.hand.value = b.dataset.sample;
        form.elements.draws.value = b.dataset.draws || '';
      });
    });
    form.addEventListener('submit', function (e) {
      const action = e.submitter && e.submitter.value;
      if (action !== 'load') return;
      e.preventDefault();
      const msg = newDeal({
        hand: form.elements.hand.value.trim() || null,
        draws: form.elements.draws.value.trim() || null,
        seed: form.elements.seed.value.trim() || null
      });
      if (msg) { err.textContent = msg; err.hidden = false; return; }
      el.dlgLoad.close();
      MJ.ui.toast('指定した牌山で配牌しました');
    });
  }

  function openLoadDialog() {
    const form = el.dlgLoad.querySelector('form');
    form.elements.seed.value = S ? String(S.seed) : '';
    el.dlgLoad.querySelector('.form-error').hidden = true;
    el.dlgLoad.showModal();
  }

  function debugSummary() {
    if (!S) return '';
    return [
      'seed: ' + S.seed,
      'hand: ' + MJ.tiles.toString(S.hand) + (S.drawn ? '  +  ' + S.drawn.code + '(ツモ)' : ''),
      'tiles: ' + M.tileCount(S) + '  selected: ' + (selectedId || '-') + '  locked: ' + locked,
      'wall: ' + S.wall.live.length + '  dead: ' + S.wall.dead.length + '  dora表示: ' + S.wall.doraIndicators[0].code,
      'river: ' + S.river.map(function (r) { return r.tile.code + (r.tsumogiri ? '*' : ''); }).join(' ') + '   (*=ツモ切り)',
      'next draws: ' + S.wall.live.slice(0, 6).map(function (t) { return t.code; }).join(' ')
    ].join('\n');
  }

  MJ.demo = {
    enter: function () {
      if (!el) init();
      if (!S) newDeal(); else render();
      fit();
      MJ.debug.setProvider(debugSummary);
    },
    leave: function () {
      hideInfo();
      cancelGesture();
      MJ.debug.setProvider(null);
    },
    onResize: function () { hideInfo(); fit(); },
    onSettings: function () { if (S) { render(); fit(); } },
    onKey: onKey
  };
})(window.MJ = window.MJ || {});
