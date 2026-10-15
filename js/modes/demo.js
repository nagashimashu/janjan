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
  let input = null;         // MJ.handInput の戻り値
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

    input = MJ.handInput.attach(el.hand, {
      isLocked: function () { return locked || !S; },
      canDrag: function () { return M.canDiscard(S).ok; },
      onTap: activate,
      onSwipe: function (id) { activate(id, 'swipe'); },
      onInfo: showInfo,
      onFocus: function (id) { focusId = id; }
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

    const action = MJ.handInput.interpret(source, selectedId === id);
    if (action === 'commit') tryDiscard(id);
    else if (action === 'hint') MJ.ui.toast(confirmHint());
    else select(id);
  }

  function confirmHint() {
    return MJ.handInput.commitHint('打牌');
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
    const w = MJ.renderer.fitHand(el.screen, el.hand, el.handZone, 14 + (MJ.settings.separateDraw ? 0.45 : 0));

    const riverAvail = el.riverArea.clientWidth - 16;
    /* 河は手牌より小さく、ただし縦長画面で余白がある場合は読みやすい大きさを確保する */
    const rw = Math.max(18, Math.min(Math.max(Math.round(w * 0.8), 30), Math.floor((riverAvail - 5 * 3) / MJ.RIVER_COLUMNS), 40));
    el.screen.style.setProperty('--river-w', rw + 'px');
  }

  /* ---------- 入力（タップ・スワイプ・長押しの検出は MJ.handInput） ---------- */

  /* 画面全体のショートカット（入力欄・ダイアログ操作中は app.js 側で除外） */
  function onKey(e) {
    const k = e.key.toLowerCase();
    if (k === 't') { draw(); e.preventDefault(); }
    else if (k === 's') { sortHand(); e.preventDefault(); }
    else if (k === 'd' && selectedId) { tryDiscard(selectedId); e.preventDefault(); }
  }

  /* 牌の補足情報（長押し／Iキー） */
  function showInfo(btn) {
    const tile = M.findTile(S, btn.dataset.id);
    if (!tile) return;
    const notes = [];
    if (tile.isRed) notes.push('赤ドラ（+1翻）');
    if (M.doraKinds(S).indexOf(tile.kind) >= 0) notes.push('ドラ');
    if (S.drawn && S.drawn.id === tile.id) notes.push('ツモ牌');
    MJ.tileInfo.show(btn, tile.displayName, tile.code, notes);
  }

  function hideInfo() {
    MJ.tileInfo.hide();
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
      if (input) input.cancel();
      MJ.debug.setProvider(null);
    },
    onResize: function () { hideInfo(); fit(); },
    onSettings: function () { if (S) { render(); fit(); } },
    onKey: onKey
  };
})(window.MJ = window.MJ || {});
