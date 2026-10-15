/*
 * 何切る問題：一覧画面とプレイ画面（DOM・入力）。判定と成績は MJ.nanikiruModel を通す。
 */
(function (MJ) {
  'use strict';

  const N = MJ.nanikiruModel;
  const G = MJ.QUESTION_GRADES;

  let filter = 'all';
  let P = null;              // N.prepare() の結果
  let selectedId = null;
  let focusId = null;
  let result = null;         // N.judge() の結果（未回答なら null）
  let compareKind = null;    // 回答後に比較表示している打牌
  let sheetFull = false;
  let locked = false;
  let el = null;
  let input = null;

  function $(id) { return document.getElementById(id); }

  function h(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function staticTile(kind, isRed, extraClass, label) {
    const t = MJ.tiles.fromKind(kind, isRed);
    return MJ.renderer.createStaticTile(t, extraClass, label || MJ.tiles.ariaLabel(t));
  }

  /* 手牌の中の、その種類の牌（赤でない牌を優先）。表示に使う */
  function handTileOfKind(kind) {
    const same = P.tiles.filter(function (t) { return t.kind === kind; });
    return same.find(function (t) { return !t.isRed; }) || same[0];
  }

  function gradeBadge(grade, big) {
    const g = G[grade];
    const b = h('span', 'grade grade-' + grade + (big ? ' grade-big' : ''));
    b.append(h('span', 'grade-mark', g.mark), h('span', 'grade-label', g.label));
    return b;
  }

  function filteredList() {
    return N.filter(MJ.QUESTIONS, filter);
  }

  /* ================= 一覧 ================= */

  function renderList() {
    const n = MJ.stats.nanikiru;
    $('nk-stat-attempts').textContent = n.attempts;
    $('nk-stat-correct').textContent = n.correct;
    $('nk-stat-rate').textContent = n.attempts ? N.accuracy(n) + '%' : '—';

    document.querySelectorAll('#nk-filter [data-filter]').forEach(function (b) {
      b.setAttribute('aria-pressed', b.dataset.filter === filter ? 'true' : 'false');
    });

    const ul = $('nk-list');
    ul.replaceChildren();
    filteredList().forEach(function (q) {
      const rec = n.byQuestion[q.id];
      const li = h('li');
      const a = h('a', 'nk-item');
      a.href = '#/nanikiru/' + q.id;

      const head = h('span', 'nk-item-head');
      head.append(h('span', 'nk-item-id', q.id), h('span', 'badge diff diff-' + q.difficulty, MJ.QUESTION_DIFFICULTY[q.difficulty]));
      if (!q.reviewed) head.append(h('span', 'badge badge-review', '確認中'));
      a.append(head);

      const handBox = h('span', 'nk-item-hand');
      MJ.handSorter.sort(MJ.tiles.parse(q.hand).map(function (s) { return MJ.tiles.fromKind(s.kind, s.isRed); }))
        .forEach(function (t) { handBox.append(MJ.renderer.createStaticTile(t, 'tile-xs')); });
      handBox.setAttribute('aria-hidden', 'true');
      a.append(handBox);

      const status = h('span', 'nk-item-status');
      if (rec) {
        status.append(gradeBadge(rec.bestGrade), h('span', 'nk-item-count', '挑戦 ' + rec.attempts + ' 回'));
      } else {
        status.append(h('span', 'nk-item-new', '未挑戦'));
      }
      a.append(status);
      a.setAttribute('aria-label', q.id + '、' + MJ.QUESTION_DIFFICULTY[q.difficulty] + (q.reviewed ? '' : '、確認中') +
        '、' + (rec ? '最高評価 ' + G[rec.bestGrade].label + '、挑戦 ' + rec.attempts + ' 回' : '未挑戦'));
      li.append(a);
      ul.append(li);
    });
    $('nk-list-empty').hidden = ul.children.length > 0;
  }

  let listBound = false;
  function bindList() {
    if (listBound) return;
    listBound = true;
    $('nk-filter').addEventListener('click', function (e) {
      const b = e.target.closest('[data-filter]');
      if (!b) return;
      filter = b.dataset.filter;
      renderList();
    });
    $('nk-reset').addEventListener('click', async function () {
      const ok = await MJ.ui.confirm('何切る問題の成績（挑戦数・正答数・問題ごとの評価）をリセットします。よろしいですか？',
        { title: '成績のリセット', ok: 'リセットする', danger: true });
      if (!ok) return;
      N.resetStats(MJ.stats);
      MJ.saveStats();
      renderList();
      MJ.ui.toast('何切る問題の成績をリセットしました');
    });
  }

  /* ================= プレイ ================= */

  function initPlay() {
    el = {
      screen: $('screen-nk'),
      title: $('nk-title'),
      main: $('nk-main'),
      chips: $('nk-chips'),
      situation: $('nk-situation'),
      visible: $('nk-visible'),
      hand: $('nk-hand'),
      handZone: $('nk-hand-zone'),
      status: $('nk-status'),
      btnAnswer: $('nk-btn-answer'),
      sheet: $('nk-sheet'),
      btnPrev: $('nk-btn-prev'),
      btnNext: $('nk-btn-next')
    };

    input = MJ.handInput.attach(el.hand, {
      isLocked: function () { return locked || !P; },
      canDrag: function () { return !result; },
      onTap: activate,
      onSwipe: function (id) { activate(id, 'swipe'); },
      onInfo: showInfo,
      onFocus: function (id) { focusId = id; }
    });

    el.btnAnswer.addEventListener('click', function () {
      if (result) return;
      if (!selectedId) { refuse('先に切る牌を選んでください'); return; }
      answer(selectedId);
    });
    el.btnPrev.addEventListener('click', function () { move(-1); });
    el.btnNext.addEventListener('click', function () { move(1); });

    if (window.ResizeObserver) new ResizeObserver(fit).observe(el.handZone);
  }

  function enterPlay(id) {
    if (!el) initPlay();
    const q = MJ.QUESTIONS.find(function (x) { return x.id === id; });
    if (!q) {
      MJ.ui.toast('問題 ' + id + ' は見つかりません', 'warn');
      window.location.hash = '#/nanikiru';
      return;
    }
    P = N.prepare(q);
    selectedId = null;
    focusId = null;
    result = null;
    compareKind = null;
    sheetFull = false;
    el.hand.replaceChildren();
    renderInfo();
    render();
    fit();
    MJ.anim.dealIn(Array.prototype.slice.call(el.hand.children), 25);
    MJ.debug.setProvider(debugSummary);
    MJ.ui.announce(q.id + '。' + MJ.QUESTION_DIFFICULTY[q.difficulty] + '。何を切りますか。');
  }

  /* 局情報・状況（問題ごとに1回だけ描画） */
  function renderInfo() {
    const q = P.q;
    el.title.textContent = q.id + '　何を切る？';
    el.chips.replaceChildren();

    function chip(label, value, extra) {
      const c = h('span', 'info-chip');
      c.append(h('span', 'chip-label', label));
      if (value != null) c.append(h('b', null, value));
      if (extra) c.append(extra);
      el.chips.append(c);
      return c;
    }
    chip('難易度', MJ.QUESTION_DIFFICULTY[q.difficulty]);
    chip('場風', N.WIND_NAME[q.roundWind]);
    chip('自風', N.WIND_NAME[q.seatWind]);
    chip('巡目', q.turn + '巡目');
    const doraBox = h('span', 'dora-slot');
    P.indicators.forEach(function (t) { doraBox.append(MJ.renderer.createStaticTile(t, 'tile-mini', 'ドラ表示牌：' + MJ.tiles.ariaLabel(t))); });
    const c = chip('ドラ表示', null, doraBox);
    c.append(h('span', 'chip-label', 'ドラ'), h('b', null, P.doraKinds.map(MJ.tiles.kindName).join('・')));
    if (!q.reviewed) {
      const r = h('span', 'info-chip chip-review');
      r.append(h('span', 'badge badge-review', '確認中'));
      r.title = '推奨打牌と解説は未レビューです';
      el.chips.append(r);
    }

    el.situation.hidden = !q.situation;
    el.situation.textContent = q.situation || '';

    el.visible.replaceChildren();
    el.visible.hidden = !P.visibleTiles.length;
    if (P.visibleTiles.length) {
      el.visible.append(h('span', 'chip-label', '見えている牌'));
      P.visibleTiles.forEach(function (t) { el.visible.append(MJ.renderer.createStaticTile(t, 'tile-mini')); });
    }

    const list = filteredList();
    const idx = list.findIndex(function (x) { return x.id === q.id; });
    setDisabled(el.btnPrev, idx <= 0);
    setDisabled(el.btnNext, idx < 0 || idx >= list.length - 1);
  }

  function setDisabled(btn, disabled) {
    btn.setAttribute('aria-disabled', disabled ? 'true' : 'false');
    btn.classList.toggle('is-disabled', disabled);
  }

  function render() {
    if (!P) return;
    const items = P.tiles;
    if (!items.some(function (t) { return t.id === focusId; })) focusId = selectedId || items[0].id;
    const bestTileIds = result ? P.bestKinds.map(function (k) { return handTileOfKind(k).id; }) : [];
    const compareId = result && compareKind != null ? handTileOfKind(compareKind).id : null;

    MJ.renderer.reconcile(el.hand, items, function (t) { return t.id; }, MJ.renderer.createHandTile, function (btn, t) {
      const isSel = t.id === selectedId;
      const isDora = P.doraKinds.indexOf(t.kind) >= 0;
      const isAnswer = !!result && result.tileId === t.id;
      const isBest = bestTileIds.indexOf(t.id) >= 0;
      btn.classList.toggle('is-selected', isSel || isAnswer);
      btn.classList.toggle('is-dora', isDora);
      btn.classList.toggle('is-answer', isAnswer);
      btn.classList.toggle('is-compare', t.id === compareId && !isAnswer);
      btn.setAttribute('aria-pressed', isSel ? 'true' : 'false');
      btn.setAttribute('aria-disabled', locked ? 'true' : 'false');
      btn.tabIndex = t.id === focusId ? 0 : -1;

      let badgeText = '';
      if (isAnswer) badgeText = (isBest ? '◎' : '') + 'あなた';
      else if (isBest) badgeText = '◎最有力';
      else if (t.id === compareId) badgeText = '比較中';
      let badge = btn.querySelector('.tile-badge');
      if (badgeText) {
        if (!badge) { badge = h('span', 'tile-badge'); btn.append(badge); }
        badge.textContent = badgeText;
        badge.dataset.kind = isAnswer ? 'answer' : isBest ? 'best' : 'compare';
      } else if (badge) {
        badge.remove();
      }

      const extras = [];
      if (isDora) extras.push('ドラ');
      if (badgeText) extras.push(badgeText);
      btn.setAttribute('aria-label', MJ.tiles.ariaLabel(t, extras.join('、')));
    });

    el.screen.classList.toggle('is-answered', !!result);
    el.screen.classList.toggle('is-sheet-full', !!result && sheetFull);
    setDisabled(el.btnAnswer, !selectedId || !!result);
    const sel = selectedId && P.tiles.find(function (t) { return t.id === selectedId; });
    el.btnAnswer.querySelector('.btn-sub').textContent = sel ? sel.displayName : '未選択';
    el.status.textContent = statusText(sel);
    MJ.debug.render();
  }

  function statusText(sel) {
    if (result) return '回答済み。手牌の牌を押すと、その牌を切った場合と比較できます。';
    if (!sel) return '切る牌を選んでください（' + (MJ.settings.discardMethod === 'retap' ? 'もう一度押すと回答' : '「この牌を切る」で回答') + '）';
    return '選択中：' + MJ.tiles.ariaLabel(sel) + ' — ' + MJ.handInput.commitHint('回答');
  }

  function fit() {
    if (!el || !P) return;
    MJ.renderer.fitHand(el.screen, el.hand, el.handZone, 14);
  }

  /* ---------- 入力 ---------- */

  function activate(id, source) {
    if (locked || !P) return;
    MJ.tileInfo.hide();
    if (result) { compare(id); return; }
    const action = MJ.handInput.interpret(source, selectedId === id);
    if (action === 'commit') answer(id);
    else if (action === 'hint') MJ.ui.toast(MJ.handInput.commitHint('回答'));
    else {
      selectedId = id;
      focusId = id;
      render();
      MJ.audio.play('select');
      const t = P.tiles.find(function (x) { return x.id === id; });
      MJ.ui.announce(MJ.tiles.ariaLabel(t) + 'を選択しました。' + MJ.handInput.commitHint('回答'));
    }
  }

  function refuse(reason) {
    MJ.ui.toast(reason, 'warn');
    MJ.audio.play('error');
  }

  function showInfo(btn) {
    const t = P.tiles.find(function (x) { return x.id === btn.dataset.id; });
    if (!t) return;
    const notes = [];
    if (t.isRed) notes.push('赤ドラ（+1翻）');
    if (P.doraKinds.indexOf(t.kind) >= 0) notes.push('ドラ');
    if (result) {
      const e = N.entryFor(P, t.kind);
      notes.push('切ると ' + MJ.shanten.label(e.shanten) + '・受入 ' + e.ukeireCount + '枚');
    }
    MJ.tileInfo.show(btn, t.displayName, t.code, notes);
  }

  function onKey(e) {
    const k = e.key.toLowerCase();
    if (k === 'd' && selectedId && !result) { answer(selectedId); e.preventDefault(); }
    else if (k === 'n') { move(1); e.preventDefault(); }
    else if (k === 'p') { move(-1); e.preventDefault(); }
  }

  function move(delta) {
    if (!P) return;
    const list = filteredList();
    const idx = list.findIndex(function (q) { return q.id === P.q.id; });
    const next = list[idx + delta];
    if (!next) { refuse(delta > 0 ? 'これが最後の問題です' : 'これが最初の問題です'); return; }
    window.location.hash = '#/nanikiru/' + next.id;
  }

  /* ---------- 回答 ---------- */

  function answer(id) {
    if (result || locked) return;
    const tile = P.tiles.find(function (t) { return t.id === id; });
    if (!tile) return;
    result = N.judge(P, tile.kind);
    result.tileId = id;
    N.record(MJ.stats, P.q.id, result);
    MJ.saveStats();

    selectedId = null;
    compareKind = null;
    sheetFull = false;
    render();
    renderSheet();
    fit();

    const btn = el.hand.querySelector('.tile-btn[data-id="' + id + '"]');
    if (result.isCorrect) {
      MJ.audio.play('tsumo');
      MJ.anim.burstAt(btn, { count: result.grade === 'best' ? 18 : 10 });
    } else {
      MJ.audio.play('discard');
    }
    MJ.ui.vibrate(result.isCorrect ? 20 : 8);
    if (MJ.anim.factor() > 0 && el.sheet.animate) {
      el.sheet.animate([{ transform: 'translateY(60px)', opacity: 0 }, { transform: 'translateY(0)', opacity: 1 }],
        { duration: MJ.anim.ms(320), easing: 'cubic-bezier(.2,.8,.2,1)' });
    }
    const e = result.entry;
    MJ.ui.announce('評価：' + G[result.grade].label + '。' + MJ.shanten.label(e.shanten) + '、受入' + e.ukeireCount + '枚。');
    MJ.debug.log('何切る回答', { id: P.q.id, discard: tile.code, grade: result.grade });
    el.sheet.querySelector('.nk-verdict').focus({ preventScroll: true });
  }

  function compare(id) {
    const tile = P.tiles.find(function (t) { return t.id === id; });
    compareKind = tile.kind === result.kind ? null : tile.kind;
    sheetFull = true;
    render();
    renderSheet();
    MJ.audio.play('select');
    const cmp = el.sheet.querySelector('.nk-compare');
    if (cmp) cmp.scrollIntoView({ block: 'nearest' });
    if (compareKind != null) {
      const e = N.entryFor(P, compareKind);
      MJ.ui.announce(tile.displayName + 'を切った場合：' + MJ.shanten.label(e.shanten) + '、受入' + e.ukeireCount + '枚');
    }
  }

  function retry() {
    result = null;
    compareKind = null;
    sheetFull = false;
    selectedId = null;
    render();
    fit();
    const first = el.hand.querySelector('.tile-btn[tabindex="0"]');
    if (first) first.focus();
  }

  function toggleSheet() {
    sheetFull = !sheetFull;
    render();
    renderSheet();
    fit();
  }

  /* ---------- 結果シート ---------- */

  function ukeireTiles(entry) {
    const box = h('div', 'uk-tiles');
    entry.ukeire.forEach(function (u) {
      const item = h('span', 'uk-tile');
      item.append(staticTile(u.kind, false, 'tile-sm', MJ.tiles.kindName(u.kind) + '、残り' + u.remaining + '枚'),
        h('small', null, '残' + u.remaining));
      box.append(item);
    });
    if (!entry.ukeire.length) box.append(h('p', 'muted', '受入はありません'));
    return box;
  }

  function statCard(label, value, sub) {
    const c = h('div', 'nk-card');
    c.append(h('span', 'nk-card-label', label), h('strong', 'nk-card-value', value));
    if (sub) c.append(h('span', 'nk-card-sub', sub));
    return c;
  }

  function discardLine(kind, prefix) {
    const line = h('span', 'nk-discard');
    const t = handTileOfKind(kind);
    line.append(h('span', null, prefix), MJ.renderer.createStaticTile(t, 'tile-mini'), h('b', null, t.displayName));
    return line;
  }

  function section(title, body, open, collapsible) {
    if (!collapsible) {
      const s = h('section', 'nk-sec');
      s.append(h('h3', null, title), body);
      return s;
    }
    const d = h('details', 'nk-sec');
    if (open) d.open = true;
    d.append(h('summary', null, title), body);
    return d;
  }

  function renderSheet() {
    const q = P.q;
    const sheet = el.sheet;
    sheet.replaceChildren();
    if (!result) return;
    const e = result.entry;
    sheet.dataset.state = sheetFull ? 'full' : 'peek';

    const handle = h('button', 'nk-sheet-handle');
    handle.type = 'button';
    handle.setAttribute('aria-expanded', sheetFull ? 'true' : 'false');
    handle.append(h('span', 'nk-grip'), h('span', null, sheetFull ? '▼ 解説をたたむ' : '▲ 解説を詳しく見る'));
    handle.addEventListener('click', toggleSheet);
    sheet.append(handle);

    const scroll = h('div', 'nk-sheet-scroll');
    sheet.append(scroll);

    /* 判定と主要な数値（たたんだ状態でも見える） */
    const verdict = h('div', 'nk-verdict grade-bg-' + result.grade);
    verdict.tabIndex = -1;
    verdict.append(gradeBadge(result.grade, true), discardLine(result.kind, 'あなたの打牌'));
    scroll.append(verdict);

    const cards = h('div', 'nk-cards');
    cards.append(
      statCard('シャンテン数', MJ.shanten.label(e.shanten), '打牌前 ' + MJ.shanten.label(P.shantenBefore)),
      statCard('受入', e.ukeireCount + '枚', e.ukeire.length + '種'),
      statCard('最有力との差', result.diffFromBest === 0 ? '±0枚' : (result.diffFromBest > 0 ? '+' : '') + result.diffFromBest + '枚',
        '最有力 ' + P.bestKinds.map(MJ.tiles.kindName).join('・'))
    );
    scroll.append(cards);

    if (result.candidate) scroll.append(h('p', 'nk-note', result.candidate.note));
    else scroll.append(h('p', 'nk-note', 'この打牌は推奨候補にありません。受入や打点で、より良い選択があります。'));

    const detail = h('div', 'nk-detail');
    scroll.append(detail);

    /* 比較（回答後に手牌の別の牌を押したとき） */
    if (compareKind != null) {
      const ce = N.entryFor(P, compareKind);
      const cc = N.candidateFor(q, compareKind);
      const box = h('div', 'nk-compare');
      const head = h('div', 'nk-compare-head');
      head.append(discardLine(compareKind, '比較：'), gradeBadge(cc ? cc.grade : 'improve'));
      box.append(head, h('p', null, MJ.shanten.label(ce.shanten) + '・受入 ' + ce.ukeire.length + '種 ' + ce.ukeireCount + '枚'), ukeireTiles(ce));
      if (cc) box.append(h('p', 'nk-note', cc.note));
      detail.append(box);
    }

    detail.append(section('受入牌（あなたの打牌）', ukeireTiles(e)));

    /* 推奨候補 */
    const cl = h('ol', 'nk-cands');
    q.candidates.forEach(function (c) {
      const kind = N.kindOfCode(c.discard);
      const li = h('li', 'nk-cand' + (kind === result.kind ? ' is-mine' : ''));
      const top = h('div', 'nk-cand-head');
      top.append(gradeBadge(c.grade), discardLine(kind, '打'), h('span', 'nk-cand-num', MJ.shanten.label(c.shanten) + '・' + c.ukeireCount + '枚'));
      if (kind === result.kind) top.append(h('span', 'badge badge-mine', 'あなた'));
      li.append(top, h('p', 'nk-note', c.note));
      const entry = N.entryFor(P, kind);
      li.append(ukeireTiles(entry));
      cl.append(li);
    });
    detail.append(section('推奨候補と評価', cl));

    const yaku = h('ul', 'nk-yaku');
    q.yakuTargets.forEach(function (y) { yaku.append(h('li', null, y)); });
    detail.append(section('狙える役', yaku));

    detail.append(section('解説', h('p', null, q.explanation), true, true));

    /* 判断の観点：シャンテン数・受入枚数は計算値、それ以外は問題データ */
    const dl = h('dl', 'nk-persp');
    function row(label, text) {
      const d = h('div');
      d.append(h('dt', null, label), h('dd', null, text));
      dl.append(d);
    }
    row('シャンテン数', 'あなたの打牌：' + MJ.shanten.label(e.shanten) + '／最有力：' +
      MJ.shanten.label(N.entryFor(P, P.bestKinds[0]).shanten));
    row('受入枚数', 'あなたの打牌：' + e.ukeireCount + '枚／最有力：' + P.maxBestUkeire + '枚');
    Object.keys(MJ.PERSPECTIVE_LABELS).forEach(function (k) {
      if (q.perspectives[k]) row(MJ.PERSPECTIVE_LABELS[k], q.perspectives[k]);
    });
    detail.append(section('判断の観点', dl, false, true));

    /* 全打牌の比較表（計算値） */
    const table = h('table', 'data-table nk-all');
    const thead = h('thead');
    const trh = h('tr');
    ['打牌', 'シャンテン数', '受入', '評価'].forEach(function (x) { const th = h('th', null, x); th.scope = 'col'; trh.append(th); });
    thead.append(trh);
    const tbody = h('tbody');
    P.analysis.forEach(function (a) {
      const tr = h('tr', a.kind === result.kind ? 'is-mine' : '');
      const th = h('th');
      th.scope = 'row';
      th.append(MJ.renderer.createStaticTile(handTileOfKind(a.kind), 'tile-mini'), document.createTextNode(' ' + MJ.tiles.kindName(a.kind)));
      const cand = N.candidateFor(q, a.kind);
      const gtd = h('td');
      if (cand) gtd.append(gradeBadge(cand.grade)); else gtd.textContent = '—';
      tr.append(th, h('td', null, MJ.shanten.label(a.shanten)), h('td', null, a.ukeire.length + '種 ' + a.ukeireCount + '枚'), gtd);
      tbody.append(tr);
    });
    table.append(thead, tbody);
    const tableWrap = h('div', 'table-scroll');
    tableWrap.append(table);
    detail.append(section('すべての打牌の比較（計算値）', tableWrap, false, true));

    if (q.supplement) detail.append(section('補足', h('p', null, q.supplement), false, true));

    const review = h('p', 'nk-review');
    review.append(q.reviewed ? h('span', 'badge badge-active', 'レビュー済み') : h('span', 'badge badge-review', '確認中'),
      document.createTextNode(' ' + q.reviewerNote + '（最終更新 ' + q.lastUpdated + '）'));
    detail.append(review);

    const actions = h('div', 'nk-sheet-actions');
    const again = h('button', 'btn btn-ghost', 'もう一度解く');
    again.type = 'button';
    again.addEventListener('click', retry);
    actions.append(again);
    detail.append(actions);
  }

  function debugSummary() {
    if (!P) return '';
    return [
      'question: ' + P.q.id + '  hand: ' + MJ.tiles.toString(P.tiles),
      'shanten(before): ' + P.shantenBefore + '  dora: ' + P.doraKinds.map(MJ.tiles.kindToCode).join(','),
      'top discards: ' + P.analysis.slice(0, 5).map(function (a) { return a.code + '(' + a.shanten + '/' + a.ukeireCount + ')'; }).join(' '),
      'selected: ' + (selectedId || '-') + '  result: ' + (result ? result.grade : '-')
    ].join('\n');
  }

  MJ.nanikiru = {
    list: {
      enter: function () { bindList(); renderList(); },
      onKey: function () {}
    },
    play: {
      enter: enterPlay,
      leave: function () {
        MJ.tileInfo.hide();
        if (input) input.cancel();
        MJ.debug.setProvider(null);
      },
      onResize: function () { MJ.tileInfo.hide(); fit(); },
      onSettings: function () { if (P) { render(); fit(); } },
      onKey: onKey
    }
  };
})(window.MJ = window.MJ || {});
