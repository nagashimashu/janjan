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
  const AUTO_LEVEL = 2;                    // オート時にあなたの手を打つCPUレベル

  const EMBLEMS = {
    star: '<path d="M12 2l2.9 6.6 7.1.6-5.4 4.7 1.6 7L12 17.3 5.8 20.9l1.6-7L2 9.2l7.1-.6z"/>',
    leaf: '<path d="M20 3C9 3 4 9 4 16c0 2 .5 3.5 1 5 1-4 4-8 9-10-4 3-6.5 6.5-7.5 10C17 21 21 13 20 3z"/>',
    moon: '<path d="M15 2a10 10 0 1 0 7 17A8 8 0 0 1 15 2z"/>',
    flame: '<path d="M12 2c1 4 6 6 6 12a6 6 0 0 1-12 0c0-3 2-5 3-6 0 2 1 3 2 3 0-4-1-6 1-9z"/>'
  };
  const CALL_WORD = { pon: 'ポン', chi: 'チー', kan: 'カン', ankan: 'カン', kakan: 'カン', riichi: 'リーチ', kyuushu: '九種九牌' };

  let M = null;
  let el = null;
  let input = null;
  let timer = null;
  let paused = true;
  let locked = false;
  let selectedId = null;
  let focusId = null;
  let auto = false;
  let riichiMode = false;    // リーチ宣言の打牌を選んでいる
  let cpuLevel = 2;
  let overlayKey = null;
  let hintDismissed = false;
  let turnTimer = null;      // 操作の制限時間（MJ.turnTimer）
  let timerLoop = null;
  let timerWarned = false;
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

  function logDecision(text) {
    decisions.unshift(text);
    if (decisions.length > 8) decisions.length = 8;
    MJ.debug.log(text);
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
      myMelds: $('mt-my-melds'),
      handZone: $('mt-hand-zone'),
      status: $('mt-status'),
      btnDiscard: $('mt-btn-discard'),
      btnSort: $('mt-btn-sort'),
      btnAuto: $('mt-btn-auto'),
      callbar: $('mt-callbar'),
      callInfo: $('mt-call-info'),
      callButtons: {},
      callout: $('mt-callout'),
      overlay: $('mt-overlay'),
      hint: $('mt-landscape-hint'),
      timer: $('mt-timer'),
      timerBar: document.querySelector('#mt-timer .mt-timer-gauge i'),
      timerNum: document.querySelector('#mt-timer .mt-timer-num'),
      dlgChoose: $('dlg-choose'),
      seats: [], rivers: [], backs: [], edges: [], melds: []
    };
    ['tsumo', 'ron', 'riichi', 'kan', 'pon', 'chi', 'kyuushu', 'skip', 'cancel'].forEach(function (k) {
      el.callButtons[k] = $('mt-btn-' + k);
    });
    for (let s = 0; s < 4; s++) {
      el.seats.push(document.querySelector('.mt-seat[data-seat="' + s + '"]'));
      el.rivers.push($('mt-river-' + s));
      el.edges.push(document.querySelector('.mt-edge[data-seat="' + s + '"]'));
      buildSeat(s);
    }

    document.querySelectorAll('#mt-level [data-level]').forEach(function (b) {
      b.addEventListener('click', function () {
        cpuLevel = Number(b.dataset.level);
        document.querySelectorAll('#mt-level [data-level]').forEach(function (x) {
          x.setAttribute('aria-pressed', x === b ? 'true' : 'false');
        });
        document.querySelectorAll('.mt-level-note').forEach(function (n) { n.hidden = n.dataset.level !== String(cpuLevel); });
      });
    });
    $('mt-btn-start').addEventListener('click', startMatch);
    el.btnDiscard.addEventListener('click', function () {
      if (!selectedId) { refuse('先に切る牌を選んでください'); return; }
      playerDiscard(selectedId);
    });
    el.btnSort.addEventListener('click', sortHand);
    el.btnAuto.addEventListener('click', toggleAuto);
    el.callButtons.tsumo.addEventListener('click', playerTsumo);
    el.callButtons.ron.addEventListener('click', function () { playerRespond('ron'); });
    el.callButtons.pon.addEventListener('click', function () { playerRespond('pon'); });
    el.callButtons.chi.addEventListener('click', function () { playerRespond('chi'); });
    el.callButtons.kan.addEventListener('click', function () { if (isPlayerCall()) playerRespond('kan'); else playerKan(); });
    el.callButtons.skip.addEventListener('click', function () { playerRespond('skip'); });
    el.callButtons.riichi.addEventListener('click', playerRiichi);
    el.callButtons.cancel.addEventListener('click', function () { riichiMode = false; selectedId = null; render(); MJ.ui.announce('リーチを取り消しました'); });
    el.callButtons.kyuushu.addEventListener('click', playerKyuushu);
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

  /* 席ごとのプレイヤーパネル・伏せ牌・鳴き牌の置き場所を作る */
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
    const riichi = h('span', 'mt-riichi');
    riichi.append(h('i', 'mt-stick'), h('span', null, 'リーチ'));
    const score = h('b', 'mt-score', '');
    const count = h('span', 'mt-count', '');
    const state = h('span', 'mt-state', '');
    const top = h('span', 'mt-panel-top');
    top.append(emblem, wind, name, oya);
    const bottom = h('span', 'mt-panel-bottom');
    bottom.append(score, riichi, count, state);
    panel.append(top, bottom);
    box.append(panel);
    if (seat !== 0) {
      const backs = h('div', 'mt-backs');
      backs.setAttribute('aria-hidden', 'true');
      const melds = h('div', 'mt-melds');
      box.append(backs, melds);
      el.backs[seat] = backs;
      el.melds[seat] = melds;
    } else {
      el.melds[0] = el.myMelds;
    }
    box.panelParts = { panel: panel, wind: wind, oya: oya, score: score, count: count, state: state, riichi: riichi };
  }

  /* ================= 対局の開始・終了 ================= */

  function showView(view) {
    el.screen.dataset.view = view;
  }

  function startMatch() {
    M = E.createMatch({ cpuLevel: cpuLevel });
    M.playerLog = MJ.matchStats.newLog();   // 戦績：対局が最後まで終わったときだけ保存する
    M.levelChosen = cpuLevel;
    E.decideDealer(M);
    auto = false;
    riichiMode = false;
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
        h('p', 'mt-ov-note', '東風戦・持ち点25,000点・CPUレベル' + cpuLevel + '。'));
    }, '配牌する', function () {
      E.startRound(M);
      afterRoundStart();
    });
    MJ.debug.log('対局開始', { seed: M.seed, dealer: M.dealerIndex, dice: M.dice, level: cpuLevel });
  }

  function afterRoundStart() {
    selectedId = null;
    focusId = null;
    riichiMode = false;
    el.hand.replaceChildren();
    el.rivers.forEach(function (r) { r.replaceChildren(); });
    el.melds.forEach(function (x) { if (x) { x.replaceChildren(); x.dataset.key = ''; } });
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

  function ctxFor(seat) {
    const ctx = E.contextFor(M, seat);
    if (seat === 0) ctx.level = AUTO_LEVEL;
    return ctx;
  }

  /* リーチ後、和了も暗槓もできなければ自動でツモ切りする */
  function riichiAutoTsumogiri() {
    const p = M.players[0];
    if (!p.riichi || !p.drawn) return false;
    const o = E.turnOptions(M, 0);
    return !o.tsumo && !o.ankan.length;
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
        const o = E.turnOptions(M, 0);
        const notes = [];
        if (o.tsumo) notes.push('ツモ和了できます');
        if (o.riichiTiles.length) notes.push('リーチできます');
        if (o.ankan.length || o.kakan.length) notes.push('カンできます');
        if (o.kyuushu) notes.push('九種九牌を申告できます');
        MJ.ui.announce('あなたの番です。ツモ：' + MJ.tiles.ariaLabel(r.tile) + (notes.length ? '。' + notes.join('、') : ''));
        MJ.audio.play(o.tsumo ? 'riichi' : 'draw');
        if (auto) schedule(delays().think);
        else if (riichiAutoTsumogiri()) schedule(550);
      } else {
        schedule(delays().think);
      }
      return;
    }
    if (M.phase === 'discard') {
      if (seat === 0 && !auto) {
        if (riichiAutoTsumogiri()) doDiscard(0, p.drawn.id);
        return;   // あなたの入力待ち
      }
      cpuTurn(seat);
      return;
    }
    if (M.phase === 'call') {
      const head = M.pendingActions[0];
      if (head.seat === 0 && !auto) {
        render();
        MJ.ui.vibrate([20, 60, 20]);
        MJ.audio.play('riichi');
        MJ.ui.announce(el.callInfo.textContent + '。選んでください');
        return;
      }
      if (head.type === 'ron') { respondRon(head.seat, true); return; }
      const d = C.decideCall(M.players[head.seat].hand, ctxFor(head.seat),
        { tile: M.lastDiscard.tile, pon: head.pon, kan: head.kan, chi: head.chi });
      if (d.type !== 'skip' && head.seat !== 0) logDecision(C.describeAction(M.players[head.seat], E.seatWind(M, head.seat), { type: d.type, kind: M.lastDiscard.tile.kind, reasons: d.reasons }));
      respondCall(head.seat, d);
      return;
    }
    if (M.phase === 'round-end') { showRoundResult(); return; }
    if (M.phase === 'match-end') showFinal();
  }

  /* CPU（またはオートのあなた）の手番 */
  function cpuTurn(seat) {
    const p = M.players[seat];
    const act = C.decideTurn(p.hand, p.drawn, ctxFor(seat), E.turnOptions(M, seat));
    const wind = E.seatWind(M, seat);
    if (seat !== 0) {
      logDecision(act.decision ? C.describe(p, wind, act.decision) : C.describeAction(p, wind, act));
    }
    if (act.action === 'tsumo') { declareTsumo(seat); return; }
    if (act.action === 'kyuushu') { declareKyuushu(seat); return; }
    if (act.action === 'ankan' || act.action === 'kakan') { doKan(seat, act.action, act.kind); return; }
    doDiscard(seat, act.tile.id, { riichi: act.action === 'riichi' });
  }

  function isPlayerTurn() {
    return !!M && M.phase === 'discard' && M.currentPlayerIndex === 0;
  }

  function isPlayerCall() {
    return !!M && M.phase === 'call' && M.pendingActions.length > 0 && M.pendingActions[0].seat === 0;
  }

  /* ================= 演出 ================= */

  /* 大きな文字の演出。和了は長め、鳴き・リーチは短め */
  function flash(word, seat, small) {
    const p = M.players[seat];
    const call = el.callout;
    call.querySelector('.mt-callout-word').textContent = word;
    call.querySelector('.mt-callout-name').textContent = p.name;
    call.className = 'mt-callout theme-' + p.theme + (small ? ' is-small' : '');
    call.hidden = false;
    MJ.anim.burstAt(call, { count: small ? 12 : 30, spread: small ? 70 : 140 });
    const wait = MJ.anim.factor() > 0 ? MJ.anim.ms(small ? 650 : 1200) : (small ? 150 : 300);
    return new Promise(function (resolve) {
      setTimeout(function () { call.hidden = true; resolve(); }, wait);
    });
  }

  /* 鳴き・カン・リーチの演出をはさんで次へ進める */
  function afterAction(word, seat, sound, next) {
    clearTimer();
    locked = true;
    render();
    MJ.audio.play(sound);
    MJ.ui.vibrate(25);
    MJ.ui.announce(M.players[seat].name + '：' + word);
    flash(word, seat, true).then(function () {
      locked = false;
      render();
      fit();
      if (next) next();
    });
  }

  /* ================= 和了・流局・鳴き ================= */

  function declareTsumo(seat) {
    if (locked) return;
    const r = E.declareTsumo(M, seat);
    if (!r.ok) { refuse(r.reason); return; }
    selectedId = null;
    riichiMode = false;
    MJ.debug.log('ツモ和了', { seat: seat, yaku: r.result.score.yaku.map(function (y) { return y.name; }) });
    celebrate('tsumo');
  }

  function declareKyuushu(seat) {
    const r = E.declareKyuushu(M, seat);
    if (!r.ok) { refuse(r.reason); return; }
    afterAction('九種九牌', seat, 'end', showRoundResult);
  }

  function respondRon(seat, accept) {
    if (locked) return;
    const r = E.respondRon(M, seat, accept);
    if (!r.ok) { refuse(r.reason); return; }
    if (accept) {
      MJ.debug.log('ロン', { seat: seat, from: M.result.loser, yaku: M.result.score.yaku.map(function (y) { return y.name; }) });
      celebrate('ron');
      return;
    }
    if (seat === 0) MJ.ui.announce(M.players[0].riichi ? 'ロンを見送りました。リーチ中のためこの局はフリテンです' : 'ロンを見送りました。次のツモまでフリテンです');
    render();
    schedule(r.roundEnded ? 700 : delays().gap);
  }

  function respondCall(seat, choice) {
    if (locked) return;
    const r = E.respondCall(M, seat, choice);
    if (!r.ok) { refuse(r.reason); return; }
    if (r.passed) {
      render();
      schedule(r.roundEnded ? 700 : delays().gap);
      return;
    }
    selectedId = null;
    afterAction(CALL_WORD[r.type], seat, 'call', function () {
      schedule(seat === 0 && !auto ? 0 : delays().think);
    });
  }

  function doKan(seat, type, kind) {
    if (locked) return;
    const r = type === 'ankan' ? E.declareAnkan(M, seat, kind) : E.declareKakan(M, seat, kind);
    if (!r.ok) { refuse(r.reason); return; }
    selectedId = null;
    afterAction('カン', seat, 'call', function () {
      if (seat === 0 && M.phase === 'discard') MJ.ui.announce('嶺上牌：' + MJ.tiles.ariaLabel(M.players[0].drawn));
      schedule(seat === 0 && !auto ? 0 : delays().think);
    });
  }

  /* 和了の演出：大きな「ロン」「ツモ」の文字と粒子 → 結果画面 */
  function celebrate(type) {
    clearTimer();
    locked = true;
    render();
    MJ.audio.play(type);
    MJ.ui.vibrate(type === 'ron' ? [30, 40, 30] : 40);
    flash(type === 'ron' ? 'ロン' : 'ツモ', M.result.winner, false).then(function () {
      locked = false;
      showRoundResult();
    });
  }

  function doDiscard(seat, id, opts) {
    const o = opts || {};
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
    const res = E.discard(M, seat, id, { autoSort: seat !== 0 || MJ.settings.autoSort, riichi: !!o.riichi });
    if (!res.ok) { refuse(res.reason); return; }

    locked = true;
    if (seat === 0) { selectedId = null; focusId = null; riichiMode = false; }
    MJ.tileInfo.hide();
    render();
    if (prev) MJ.anim.flip(el.hand, prev, 260);
    const riverTile = el.rivers[seat].lastElementChild;
    MJ.audio.play('discard');
    if (seat === 0) MJ.ui.vibrate(10);
    MJ.ui.announce(p.name + '：' + res.tile.displayName + (o.riichi ? '（リーチ）' : res.tsumogiri ? '（ツモ切り）' : ''));

    const fly = MJ.anim.flyFromRotated(riverTile, fromRect, RIVER_ANGLE[seat], { duration: seat === 0 ? 400 : 320, spin: seat === 0 && !o.riichi ? 360 : 0 });
    const done = function () {
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
    };
    fly.then(function () {
      if (o.riichi) {
        locked = false;
        afterAction('リーチ', seat, 'riichi', done);
      } else {
        done();
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

  /* その牌を今切れるか。切れない場合は理由を返す */
  function blockReason(id) {
    const p = M.players[0];
    const t = findPlayerTile(id);
    if (!t) return '手牌にない牌です';
    if (p.riichi && (!p.drawn || p.drawn.id !== id)) return 'リーチ後はツモ切りしかできません';
    if (riichiMode && E.turnOptions(M, 0).riichiTiles.indexOf(id) < 0) return 'その牌を切るとテンパイになりません';
    const all = p.drawn ? p.hand.concat([p.drawn]) : p.hand;
    if (p.kuikae.indexOf(t.kind) >= 0 && all.some(function (x) { return p.kuikae.indexOf(x.kind) < 0; })) return '喰い替えになるため、この牌は切れません';
    return '';
  }

  function activate(id, source) {
    if (!M || locked) return;
    MJ.tileInfo.hide();
    if (isPlayerCall()) { refuse('ロン・鳴き・スキップのどれかを選んでください'); return; }
    if (!isPlayerTurn()) {
      refuse(M.phase === 'discard' ? M.players[M.currentPlayerIndex].name + 'の番です' : 'あなたの番ではありません');
      return;
    }
    if (auto) { refuse('オート中です。オートを解除すると操作できます'); return; }
    const why = blockReason(id);
    if (why) { refuse(why); return; }
    const action = MJ.handInput.interpret(source, selectedId === id);
    if (action === 'commit') playerDiscard(id);
    else if (action === 'hint') MJ.ui.toast(MJ.handInput.commitHint(riichiMode ? 'リーチ' : '打牌'));
    else {
      selectedId = id;
      focusId = id;
      render();
      MJ.audio.play('select');
      const t = findPlayerTile(id);
      MJ.ui.announce(MJ.tiles.ariaLabel(t) + 'を選択しました。' + MJ.handInput.commitHint(riichiMode ? 'リーチ' : '打牌'));
    }
  }

  function playerDiscard(id) {
    if (!isPlayerTurn() || locked) { refuse('あなたの番ではありません'); return; }
    if (auto) { refuse('オート中です'); return; }
    const why = blockReason(id);
    if (why) { refuse(why); return; }
    doDiscard(0, id, { riichi: riichiMode });
  }

  function playerTsumo() {
    if (!isPlayerTurn() || locked) { refuse('ツモ和了できるのは、あなたの番だけです'); return; }
    if (!E.tsumoResult(M, 0)) { refuse('和了形ではないか、役がありません'); return; }
    declareTsumo(0);
  }

  function playerRiichi() {
    if (!isPlayerTurn() || locked) { refuse('リーチできるのは、あなたの番だけです'); return; }
    const rc = E.canRiichi(M, 0);
    if (!rc.ok) { refuse(rc.reason); return; }
    riichiMode = true;
    selectedId = rc.tiles.length === 1 ? rc.tiles[0] : null;
    render();
    MJ.ui.toast('リーチ：光っている牌から1枚選んで切ってください');
  }

  function playerKan() {
    if (!isPlayerTurn() || locked) { refuse('カンできるのは、あなたの番だけです'); return; }
    const o = E.turnOptions(M, 0);
    const opts = o.ankan.map(function (k) { return { type: 'ankan', kind: k }; })
      .concat(o.kakan.map(function (k) { return { type: 'kakan', kind: k }; }));
    if (!opts.length) { refuse('カンできる牌がありません'); return; }
    if (opts.length === 1) { doKan(0, opts[0].type, opts[0].kind); return; }
    choose('カンする牌を選んでください', opts.map(function (x) {
      return { label: (x.type === 'ankan' ? '暗槓 ' : '加槓 ') + MJ.tiles.kindName(x.kind), kinds: [x.kind, x.kind, x.kind, x.kind], value: x };
    })).then(function (x) { if (x) doKan(0, x.type, x.kind); });
  }

  async function playerKyuushu() {
    if (!isPlayerTurn() || locked || !E.canKyuushu(M, 0)) { refuse('九種九牌を申告できる場面ではありません'); return; }
    const ok = await MJ.ui.confirm('九種九牌で途中流局にしますか？（点数の移動はなく、親は連荘します）', { title: '九種九牌', ok: '流局にする' });
    if (ok) declareKyuushu(0);
  }

  /* 応答（ロン・ポン・チー・カン・スキップ） */
  function playerRespond(type) {
    if (!isPlayerCall() || locked) { refuse('選べる場面ではありません'); return; }
    const head = M.pendingActions[0];
    if (head.type === 'ron') {
      if (type === 'ron') respondRon(0, true);
      else if (type === 'skip') respondRon(0, false);
      else refuse('ロンかスキップを選んでください');
      return;
    }
    if (type === 'skip') { respondCall(0, { type: 'skip' }); return; }
    if (type === 'chi') {
      if (!head.chi.length) { refuse('チーできません'); return; }
      if (head.chi.length === 1) { respondCall(0, { type: 'chi', chi: 0 }); return; }
      const t = M.lastDiscard.tile;
      choose('チーする組み合わせを選んでください', head.chi.map(function (pair, i) {
        return { label: MJ.tiles.kindName(pair[0]) + '・' + MJ.tiles.kindName(pair[1]), kinds: [pair[0], pair[1], t.kind].sort(function (a, b) { return a - b; }), value: i };
      })).then(function (i) { if (i != null && isPlayerCall()) respondCall(0, { type: 'chi', chi: i }); });
      return;
    }
    if ((type === 'pon' && !head.pon) || (type === 'kan' && !head.kan)) { refuse('その鳴きはできません'); return; }
    respondCall(0, { type: type });
  }

  /* 選択ダイアログ（チーの組み合わせ・カンの牌）。背景のタップでは確定しない */
  function choose(title, options) {
    const dlg = el.dlgChoose;
    dlg.querySelector('.dlg-title').textContent = title;
    const list = dlg.querySelector('.choose-list');
    list.replaceChildren();
    return new Promise(function (resolve) {
      let picked = null;
      options.forEach(function (o) {
        const b = h('button', 'choose-opt');
        b.type = 'button';
        o.kinds.forEach(function (k) { b.append(MJ.renderer.createStaticTile(MJ.tiles.fromKind(k), 'tile-sm')); });
        b.append(h('span', null, o.label));
        b.setAttribute('aria-label', o.label);
        b.addEventListener('click', function () { picked = o.value; dlg.close('ok'); });
        list.append(b);
      });
      dlg.addEventListener('close', function onClose() {
        dlg.removeEventListener('close', onClose);
        resolve(dlg.returnValue === 'ok' ? picked : null);
      });
      dlg.returnValue = '';
      dlg.showModal();
      const first = list.querySelector('button');
      if (first) first.focus();
    });
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
    riichiMode = false;
    render();
    MJ.ui.toast(auto ? 'オート：あなたの手番・鳴きもCPU（レベル' + AUTO_LEVEL + '）が判断します' : 'オートを解除しました');
    if (auto && (isPlayerTurn() || isPlayerCall())) schedule(delays().think);
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
    const why = isPlayerTurn() ? blockReason(t.id) : '';
    if (why) notes.push(why);
    MJ.tileInfo.show(btn, t.displayName, t.code, notes);
  }

  function onKey(e) {
    if (!M) return;
    const k = e.key.toLowerCase();
    const call = isPlayerCall();
    const head = call ? M.pendingActions[0] : null;
    if (k === 't' && isPlayerTurn() && E.tsumoResult(M, 0)) { playerTsumo(); e.preventDefault(); }
    else if (k === 'r' && call && head.type === 'ron') { playerRespond('ron'); e.preventDefault(); }
    else if (k === 'r' && isPlayerTurn() && !call) { playerRiichi(); e.preventDefault(); }
    else if (k === 'p' && call && head.pon) { playerRespond('pon'); e.preventDefault(); }
    else if (k === 'c' && call && head.chi && head.chi.length) { playerRespond('chi'); e.preventDefault(); }
    else if (k === 'k' && (call ? head.kan : isPlayerTurn())) { if (call) playerRespond('kan'); else playerKan(); e.preventDefault(); }
    else if ((k === 'n' || k === 'escape') && call) { playerRespond('skip'); e.preventDefault(); }
    else if (k === 'escape' && riichiMode) { riichiMode = false; render(); e.preventDefault(); }
    else if (k === 'd' && selectedId) { playerDiscard(selectedId); e.preventDefault(); }
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
    if (el.dora.dataset.count !== String(M.doraIndicators.length) || el.dora.dataset.round !== String(M.roundCount)) {
      el.dora.dataset.count = String(M.doraIndicators.length);
      el.dora.dataset.round = String(M.roundCount);
      el.dora.replaceChildren();
      M.doraIndicators.forEach(function (t) {
        el.dora.append(MJ.renderer.createStaticTile(t, 'tile-dora', 'ドラ表示牌：' + MJ.tiles.ariaLabel(t)));
      });
    }

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
      const isRiichi = p.riichi || p.riichiPending;
      parts.riichi.hidden = !isRiichi;
      const furiten = seat === 0 && playerFuriten();
      parts.state.textContent = thinking ? '考え中' : isTurn ? (seat === 0 ? 'あなたの番' : 'ツモ') : furiten ? 'フリテン' : '';
      parts.panel.classList.toggle('is-turn', isTurn);
      parts.panel.classList.toggle('is-thinking', thinking);
      parts.panel.classList.toggle('is-riichi', isRiichi);
      parts.panel.setAttribute('aria-label', E.SEAT_LABEL[seat] + ' ' + p.name + '、' + E.WIND_KANJI[wind] + '家' +
        (seat === M.dealerIndex ? '（親）' : '') + '、' + fmt(p.score) + '点' + (isRiichi ? '、リーチ中' : '') +
        (p.melds.length ? '、鳴き' + p.melds.length + '回' : '') + (thinking ? '、考え中' : ''));

      el.edges[seat].textContent = E.WIND_KANJI[wind];
      el.edges[seat].classList.toggle('is-turn', isTurn);

      if (seat !== 0) renderBacks(seat, p);
      renderRiver(seat, p);
      renderMelds(seat, p);
    });

    renderHand(myTurn);

    setDisabled(el.btnDiscard, !myTurn || !selectedId || locked || auto);
    const sel = selectedId && findPlayerTile(selectedId);
    el.btnDiscard.querySelector('.btn-label').textContent = riichiMode ? 'リーチして切る' : 'この牌を切る';
    el.btnDiscard.querySelector('.btn-sub').textContent = sel ? sel.displayName : '未選択';
    el.btnAuto.setAttribute('aria-pressed', auto ? 'true' : 'false');
    el.btnAuto.querySelector('.btn-sub').textContent = auto ? 'オン' : 'オフ';
    renderCallbar(myTurn);
    el.status.textContent = statusText(myTurn, sel);
    el.screen.classList.toggle('is-my-turn', myTurn);
    el.screen.classList.toggle('is-riichi-mode', riichiMode);

    updateHint();
    updateTimer();
    MJ.debug.render();
  }

  /* ================= 操作の制限時間 ================= */

  function timerSeconds() { return Number(MJ.settings.turnTimer) || 0; }

  /* あなたの操作を待っている場面ごとのキー（同じキーの間は残り時間を引き継ぐ） */
  function waitKey() {
    if (!M || auto || overlayKey) return null;
    if (isPlayerCall()) return 'call:' + M.discardSeq + ':' + M.pendingActions.length + ':' + (M.pendingKakan ? 'k' : '');
    if (isPlayerTurn() && !riichiAutoTsumogiri()) return 'turn:' + M.turnCount + ':' + M.kanCount + ':' + M.players[0].melds.length;
    return null;
  }

  function updateTimer() {
    if (!el || locked) return;
    const secs = timerSeconds();
    const key = secs ? waitKey() : null;
    if (!key) {
      if (turnTimer) turnTimer.stop();
      el.timer.hidden = true;
      clearInterval(timerLoop);
      timerLoop = null;
      return;
    }
    if (!turnTimer || turnTimer.seconds !== secs) turnTimer = MJ.turnTimer.create(secs);
    if (turnTimer.start(key, performance.now())) timerWarned = false;
    el.timer.hidden = false;
    if (!timerLoop) timerLoop = setInterval(tickTimer, 200);
    tickTimer();
  }

  /* ゲージと残り秒数を更新。残りが少なくなったら色を変える（点滅はしない） */
  function tickTimer() {
    if (!turnTimer || !turnTimer.key || paused) return;
    const now = performance.now();
    const left = Math.ceil(turnTimer.remaining(now));
    el.timerBar.style.transform = 'scaleX(' + turnTimer.fraction(now).toFixed(3) + ')';
    el.timerNum.textContent = String(left);
    el.timer.classList.toggle('is-low', left <= 5);
    el.timer.setAttribute('aria-label', '残り' + left + '秒');
    if (left <= 5 && !timerWarned) { timerWarned = true; MJ.ui.announce('残り5秒です'); }
    if (turnTimer.expired(now)) {
      turnTimer.stop();
      clearInterval(timerLoop);
      timerLoop = null;
      el.timer.hidden = true;
      onTimeout();
    }
  }

  /* 時間切れ：打牌はツモ切り（ツモ牌がなければ右端の切れる牌）、鳴き・ロンは見送り */
  function onTimeout() {
    ['dlg-choose', 'dlg-confirm'].forEach(function (id) { const d = $(id); if (d && d.open) d.close('cancel'); });
    if (!M || locked) return;
    if (isPlayerCall()) {
      MJ.ui.toast('時間切れのため見送りました', 'warn');
      playerRespond('skip');
      return;
    }
    if (!isPlayerTurn()) return;
    riichiMode = false;
    const p = M.players[0];
    let id = p.drawn && !blockReason(p.drawn.id) ? p.drawn.id : null;
    for (let i = p.hand.length - 1; !id && i >= 0; i--) if (!blockReason(p.hand[i].id)) id = p.hand[i].id;
    if (!id) return;
    MJ.ui.toast('時間切れのため自動で打牌しました', 'warn');
    doDiscard(0, id);
  }

  /* 和了・鳴き・リーチ・カンなどの選択バー。できる操作だけ表示する */
  function renderCallbar(myTurn) {
    const b = el.callButtons;
    const show = {};
    let info = '';
    if (myTurn && !auto && !locked) {
      const o = E.turnOptions(M, 0);
      show.tsumo = !!o.tsumo;
      show.riichi = o.riichiTiles.length > 0 && !riichiMode;
      show.cancel = riichiMode;
      show.kan = o.ankan.length + o.kakan.length > 0 && !riichiMode;
      show.kyuushu = o.kyuushu && !riichiMode;
      const parts = [];
      if (show.tsumo) parts.push('ツモ和了できます');
      if (show.riichi) parts.push('リーチできます');
      if (riichiMode) parts.push('リーチ：光っている牌から切る牌を選んでください');
      if (show.kan) parts.push('カンできます');
      if (show.kyuushu) parts.push('九種九牌を申告できます');
      info = parts.join('／');
    }
    if (isPlayerCall() && !auto && !locked) {
      const head = M.pendingActions[0];
      const d = M.lastDiscard;
      const from = M.players[d.seat].name + 'の' + d.tile.displayName;
      if (head.type === 'ron') {
        show.ron = true;
        info = from + 'で' + (head.chankan ? '槍槓' : 'ロン') + 'できます';
      } else {
        show.pon = !!head.pon;
        show.chi = head.chi && head.chi.length > 0;
        show.kan = !!head.kan;
        info = from + 'を鳴けます';
      }
      show.skip = true;
    }
    let any = false;
    Object.keys(b).forEach(function (k) {
      b[k].hidden = !show[k];
      if (show[k]) any = true;
    });
    el.callbar.hidden = !any;
    el.callInfo.textContent = info;
    el.screen.classList.toggle('is-calling', any);
  }

  function playerFuriten() {
    if (!M || M.phase === 'round-end' || M.phase === 'match-end' || M.phase === 'ready') return null;
    const info = E.furitenInfo(M, 0);
    return info.tenpai && info.furiten ? info : null;
  }

  function setDisabled(btn, disabled) {
    btn.setAttribute('aria-disabled', disabled ? 'true' : 'false');
    btn.classList.toggle('is-disabled', disabled);
  }

  function statusText(myTurn, sel) {
    if (M.phase === 'ready') return '配牌を待っています';
    if (M.phase === 'round-end') return M.result && (M.result.type === 'tsumo' || M.result.type === 'ron') ? '和了しました' : '流局しました';
    if (M.phase === 'match-end') return '対局終了';
    if (auto) return 'オート中（Aキーまたは「オート」で解除）';
    if (M.phase === 'call') {
      return isPlayerCall() ? '選んでください（R：ロン／P：ポン／C：チー／K：カン／N：スキップ）' : M.players[M.pendingActions[0].seat].name + 'の応答を待っています';
    }
    const p = M.players[0];
    const furiten = playerFuriten();
    let note = furiten ? '【フリテン：ロンできません' + (furiten.temporary ? '（次のツモまで）' : '') + '】' : '';
    if (p.riichi) note += '【リーチ中】';
    if (!myTurn) return note + M.players[M.currentPlayerIndex].name + 'の番です';
    if (riichiMode) return 'リーチ：光っている牌から切る牌を選んでください（Escで取り消し）';
    if (p.riichi) return note + 'ツモ切りします';
    if (p.kuikae.length && !sel) return note + '鳴いた牌を切ってください（喰い替えになる牌は切れません）';
    if (!sel) return note + 'あなたの番です。切る牌を選んでください';
    return note + '選択中：' + MJ.tiles.ariaLabel(sel) + ' — ' + MJ.handInput.commitHint('打牌');
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
    const last = M.lastDiscard && M.lastDiscard.seat === seat && !M.lastDiscard.chankan ? M.lastDiscard.tile.id : null;
    const items = p.discards.filter(function (d) { return !d.called; });
    MJ.renderer.reconcile(el.rivers[seat], items, function (d) { return d.tile.id; }, function (d) {
      const t = MJ.renderer.createStaticTile(d.tile, 'tile-pond' + (d.tsumogiri ? ' is-tsumogiri' : '') + (d.riichi ? ' is-riichi' : ''),
        p.name + 'の捨て牌：' + MJ.tiles.ariaLabel(d.tile, (d.riichi ? 'リーチ宣言牌、' : '') + (d.tsumogiri ? 'ツモ切り' : '手出し')));
      t.setAttribute('role', 'listitem');
      return t;
    }, function (node, d) {
      node.classList.toggle('is-last', d.tile.id === last);
    });
  }

  /* 鳴き牌：鳴いた相手の方向に応じて横向きの牌の位置を変える（上家=左、対面=中、下家=右）。暗槓は両端を伏せる */
  function meldElement(meld, seat) {
    const box = h('span', 'mt-meld');
    const tiles = meld.tiles.slice();
    let calledIndex = -1;
    if (meld.calledTile) {
      const rest = tiles.filter(function (t) { return t !== meld.calledTile; });
      const rel = (meld.from - seat + 4) % 4;   // 1 = 下家, 2 = 対面, 3 = 上家
      calledIndex = rel === 3 ? 0 : rel === 2 ? 1 : rest.length;
      rest.splice(calledIndex, 0, meld.calledTile);
      tiles.length = 0;
      Array.prototype.push.apply(tiles, rest);
    }
    tiles.forEach(function (t, i) {
      if (meld.concealed && (i === 0 || i === 3)) { box.append(MJ.renderer.createBackTile('tile-meld')); return; }
      box.append(MJ.renderer.createStaticTile(t, 'tile-meld' + (i === calledIndex ? ' is-called' : '')));
    });
    const kindName = MJ.tiles.kindName(meld.kind);
    const label = meld.type === 'shuntsu' ? 'チー ' + kindName + 'から' : (meld.type === 'kantsu' ? (meld.concealed ? '暗槓 ' : '明槓 ') : 'ポン ') + kindName;
    box.setAttribute('role', 'img');
    box.setAttribute('aria-label', label);
    return box;
  }

  function renderMelds(seat, p) {
    const box = el.melds[seat];
    if (!box) return;
    const key = p.melds.map(function (x) { return x.type + x.kind + x.tiles.length; }).join('|');
    if (box.dataset.key === key) return;
    box.dataset.key = key;
    box.replaceChildren();
    p.melds.forEach(function (x) { box.append(meldElement(x, seat)); });
    box.hidden = !p.melds.length;
  }

  function renderHand(myTurn) {
    const p = M.players[0];
    const items = p.drawn ? p.hand.concat([p.drawn]) : p.hand.slice();
    const doraKinds = E.doraKinds(M);
    const riichiTiles = riichiMode ? E.turnOptions(M, 0).riichiTiles : [];
    if (!items.some(function (t) { return t.id === focusId; })) focusId = selectedId || (items[0] && items[0].id);
    MJ.renderer.reconcile(el.hand, items, function (t) { return t.id; }, MJ.renderer.createHandTile, function (btn, t) {
      const isDrawn = !!(p.drawn && p.drawn.id === t.id);
      const isSel = t.id === selectedId;
      const isDora = doraKinds.indexOf(t.kind) >= 0;
      const blocked = myTurn && !!blockReason(t.id);
      btn.classList.toggle('is-drawn', isDrawn && MJ.settings.separateDraw);
      btn.classList.toggle('is-selected', isSel);
      btn.classList.toggle('is-dora', isDora);
      btn.classList.toggle('is-blocked', blocked);
      btn.classList.toggle('is-riichi-ok', riichiMode && riichiTiles.indexOf(t.id) >= 0);
      btn.setAttribute('aria-pressed', isSel ? 'true' : 'false');
      btn.setAttribute('aria-disabled', myTurn && !locked && !auto && !blocked ? 'false' : 'true');
      btn.tabIndex = t.id === focusId ? 0 : -1;
      const extras = [];
      if (isDrawn) extras.push('ツモ牌');
      if (isDora) extras.push('ドラ');
      if (blocked) extras.push('切れない牌');
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
    /* 鳴き牌がある分だけ手牌の幅を詰める */
    const meldSlots = M ? M.players[0].melds.reduce(function (n, x) { return n + x.tiles.length * 0.75 + 0.3; }, 0) : 0;
    const lowLandscape = window.innerWidth > window.innerHeight && window.innerHeight <= 520;
    MJ.renderer.fitHand(el.screen, el.hand, el.handZone, 14.45 - (M ? M.players[0].melds.length * 3 : 0) + meldSlots, lowLandscape ? 0.27 : 0.3);
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

  function nextLabel(next) {
    return next.ended ? '最終結果へ' : '次の局へ（' + next.label + ' ' + next.honba + '本場）';
  }

  function goNext() {
    const res = E.nextRound(M);
    if (res.ended) showFinal();
    else afterRoundStart();
  }

  function paymentList(r, extra) {
    const list = h('ul', 'mt-res-list');
    M.players.forEach(function (p, seat) {
      const li = h('li', 'mt-res-row theme-' + p.theme + (r.winner === seat ? ' is-winner' : '') + (r.loser === seat ? ' is-loser' : ''));
      const who = h('span', 'mt-res-who');
      who.append(h('span', 'mt-wind', E.WIND_KANJI[E.seatWind(M, seat)]), h('b', null, p.name));
      const tag = extra ? extra(seat) : h('span', null, '');
      const delta = h('span', 'mt-delta ' + (r.deltas[seat] > 0 ? 'is-plus' : r.deltas[seat] < 0 ? 'is-minus' : ''), signed(r.deltas[seat]));
      const score = h('span', 'mt-res-score', fmt(r.before[seat]));
      countUp(score, r.before[seat], r.after[seat]);
      li.append(who, tag, delta, score);
      list.append(li);
    });
    return list;
  }

  function indicatorRow(label, tiles) {
    const row = h('div', 'mt-win-dora');
    row.append(h('span', 'chip-label', label));
    tiles.forEach(function (t) { row.append(MJ.renderer.createStaticTile(t, 'tile-xs')); });
    return row;
  }

  function showWinResult(key, r, next) {
    const winner = M.players[r.winner];
    const s = r.score;
    const desc = MJ.scoring.describe(s);
    const title = r.type === 'ron' ? (r.chankan ? '槍槓' : 'ロン') : 'ツモ';
    showOverlay(key, title, function (body) {
      body.append(h('p', 'mt-ov-lead', r.label + ' ' + r.honba + '本場 — ' + winner.name +
        (r.type === 'ron' ? '（' + M.players[r.loser].name + 'から）' : '') + (r.winner === M.dealerIndex ? '・親' : '')));

      /* 和了形：手の内＋鳴き牌＋和了牌 */
      const handRow = h('div', 'mt-win-hand');
      handRow.setAttribute('aria-label', '和了形');
      r.hand.forEach(function (t) { handRow.append(MJ.renderer.createStaticTile(t, 'tile-win')); });
      (r.melds || []).forEach(function (x) {
        const mel = meldElement(x, r.winner);
        mel.classList.add('mt-win-meld');
        handRow.append(mel);
      });
      const winBox = h('span', 'mt-win-tile');
      winBox.append(MJ.renderer.createStaticTile(r.winTile, 'tile-win is-win', '和了牌：' + MJ.tiles.ariaLabel(r.winTile)),
        h('small', null, r.type === 'ron' ? 'ロン牌' : 'ツモ牌'));
      handRow.append(winBox);
      body.append(handRow);

      body.append(indicatorRow('ドラ表示', r.doraIndicators));
      if (r.uraIndicators && r.uraIndicators.length) body.append(indicatorRow('裏ドラ表示', r.uraIndicators));

      const ul = h('ul', 'mt-yaku');
      s.yaku.forEach(function (y) {
        const li = h('li', y.yakuman ? 'is-yakuman' : '');
        li.append(h('span', null, y.name), h('b', null, y.yakuman ? '役満' : y.han + '翻'));
        ul.append(li);
      });
      [['dora', 'ドラ'], ['aka', '赤ドラ'], ['ura', '裏ドラ']].forEach(function (d) {
        if (!s.dora[d[0]]) return;
        const li = h('li', 'is-dora');
        li.append(h('span', null, d[1]), h('b', null, s.dora[d[0]] + '翻'));
        ul.append(li);
      });
      body.append(ul);

      const total = h('div', 'mt-win-total');
      total.append(h('strong', 'mt-win-head', desc.head));
      if (desc.detail && desc.head !== desc.detail) total.append(h('span', 'mt-win-detail', desc.detail));
      total.append(h('span', 'mt-win-points', desc.points));
      body.append(total);

      if (s.fuParts && s.fuParts.length > 1) {
        const det = h('details', 'mt-fu');
        det.append(h('summary', null, '符の内訳'));
        const fl = h('ul');
        s.fuParts.forEach(function (p) { fl.append(h('li', null, p.label + '　' + p.fu + '符')); });
        const raw = s.fuParts.reduce(function (a, p) { return a + p.fu; }, 0);
        fl.append(h('li', 'mt-fu-sum', '合計 ' + raw + '符' + (raw !== s.fu ? ' → ' + s.fu + '符' : '')));
        det.append(fl);
        body.append(det);
      }

      body.append(paymentList(r, function (seat) {
        if (seat === r.winner) return h('span', 'badge badge-tenpai', '和了');
        if (seat === r.loser) return h('span', 'badge badge-noten', '放銃');
        return h('span', null, '');
      }));

      const notes = [];
      if (r.honba) notes.push('本場 ' + r.honba + '本（' + (r.type === 'ron' ? fmt(r.honba * 300) + '点' : '1人' + fmt(r.honba * 100) + '点') + '）を含みます。');
      if (r.riichiSticks) notes.push('供託 ' + fmt(r.riichiSticks * 1000) + '点を受け取りました。');
      if (!next.ended) notes.push(next.renchan ? '親の和了のため連荘します。' : '親が移ります。');
      if (notes.length) body.append(h('p', 'mt-ov-note', notes.join('')));
    }, nextLabel(next), goNext);
    render();
    MJ.ui.announce(title + '。' + winner.name + '、' + s.yaku.map(function (y) { return y.name; }).join('、') + '。' + desc.head + ' ' + desc.points);
  }

  function showAbortiveResult(key, r, next) {
    const who = M.players[r.seat];
    showOverlay(key, r.reason, function (body) {
      body.append(h('p', 'mt-ov-lead', r.label + ' ' + r.honba + '本場 — ' + who.name + 'の申告で途中流局'));
      const row = h('div', 'mt-win-hand');
      MJ.handSorter.sort(r.hand).forEach(function (t) { row.append(MJ.renderer.createStaticTile(t, 'tile-win' + (MJ.agari.YAOCHU.indexOf(t.kind) >= 0 ? ' is-win' : ''))); });
      body.append(row);
      body.append(h('p', 'mt-ov-note', '点数の移動はありません。親は連荘し、本場を1つ積みます。供託は次の局に持ち越します。'));
    }, nextLabel(next), goNext);
    render();
    MJ.ui.announce(r.reason + '。' + who.name + 'の申告で途中流局');
  }

  function showRoundResult() {
    const key = 'round-' + M.roundCount;
    if (overlayKey === key) return;
    if (M.playerLog) MJ.matchStats.recordRound(M.playerLog, M);
    const r = M.result;
    const next = E.peekNext(M);
    if (r.type === 'tsumo' || r.type === 'ron') { showWinResult(key, r, next); return; }
    if (r.type === 'abortive') { showAbortiveResult(key, r, next); return; }
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
          p.melds.forEach(function (x) { handBox.append(meldElement(x, seat)); });
          li.append(handBox);
        }
        list.append(li);
      });
      body.append(list);
      const n = r.tenpai.filter(Boolean).length;
      body.append(h('p', 'mt-ov-note', (n === 0 || n === 4 ? '全員' + (n ? 'テンパイ' : 'ノーテン') + 'のため点数の移動はありません。' : 'ノーテン罰符 3,000点をテンパイ者が受け取ります。') +
        (M.riichiSticks ? '供託 ' + fmt(M.riichiSticks * 1000) + '点は次の局に持ち越します。' : '') +
        (next.ended ? '' : (next.renchan ? '親がテンパイのため連荘します。' : '親がノーテンのため親が移ります。'))));
    }, nextLabel(next), goNext);
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
      body.append(ol);
      if (M.leftoverSticks) body.append(h('p', 'mt-ov-note', '残っていた供託 ' + fmt(M.leftoverSticks * 1000) + '点はトップが受け取りました。'));
      /* 戦績の保存（最後まで打った対局だけ。1回だけ） */
      if (!M.statsSaved && M.playerLog) {
        MJ.matchStats.recordMatch(MJ.stats, M, M.playerLog, M.levelChosen, new Date().toISOString().slice(0, 10));
        MJ.saveStats();
        M.statsSaved = true;
      }
      const sum = MJ.matchStats.summary(MJ.stats.match);
      const log = M.playerLog || MJ.matchStats.newLog();
      body.append(h('p', 'mt-ov-note', 'この対局：和了 ' + log.wins + '回・放銃 ' + log.dealIns + '回・リーチ ' + log.riichi + '回（全' + log.rounds + '局）'));
      body.append(h('p', 'mt-ov-note', '戦績を保存しました（通算 ' + sum.games + '戦・平均順位 ' + sum.avgRank.toFixed(2) + '）。「戦績」画面で詳しく見られます。'));
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
      'seed: ' + M.seed + '  phase: ' + M.phase + '  ' + E.roundLabel(M) + ' ' + M.honba + '本場  供託' + M.riichiSticks + '  カン' + M.kanCount,
      'turn: ' + M.players[M.currentPlayerIndex].name + '  wall: ' + (M.wall ? M.wall.live.length : '-') + '  locked: ' + locked + '  timer: ' + !!timer
    ];
    M.players.forEach(function (p) {
      const melds = p.melds.map(function (x) { return (x.concealed ? '[暗' : '[') + MJ.tiles.toString(x.tiles) + ']'; }).join('');
      lines.push(p.name + '(L' + (p.cpuLevel || '-') + ') ' + p.score + (p.riichi ? ' リーチ' : '') + '  ' + MJ.tiles.toString(p.hand) + (p.drawn ? ' +' + p.drawn.code : '') + ' ' + melds);
    });
    return lines.concat(['— CPU判断 —'], decisions).join('\n');
  }

  MJ.match = {
    enter: function () {
      if (!el) init();
      showView(M ? 'table' : 'setup');
      paused = false;
      if (turnTimer) turnTimer.resume(performance.now());
      MJ.debug.setProvider(debugSummary);
      if (M) {
        render();
        fit();
        if (!overlayKey) schedule(300);
      }
    },
    leave: function () {
      paused = true;
      if (turnTimer) turnTimer.pause(performance.now());
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
    quit: quit,
    /* デバッグ表示が有効なときだけ対局状態を返す（ブラウザーでの検証用） */
    debugState: function () { return MJ.debug.enabled() ? M : null; },
    debugRender: function () { if (MJ.debug.enabled()) { render(); fit(); schedule(0); } }
  };
})(window.MJ = window.MJ || {});
