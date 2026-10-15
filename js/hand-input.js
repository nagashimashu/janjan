/*
 * 手牌の入力（タップ・上スワイプ・長押し・キーボード）を、各モード共通で扱う。
 * 入力の「解釈」（選択するか打牌するか）は各モードのコールバックが決める。
 *
 *   MJ.handInput.attach(container, {
 *     isLocked():   true の間は入力を無視する
 *     canDrag(id):  上スワイプで牌を追従させてよいか
 *     onTap(id, source)   source: 'tap' | 'key'
 *     onSwipe(id)         打牌ラインを越えて指を離した
 *     onInfo(btn)         長押し／I キー（牌の補足表示）
 *     onFocus(id)         キーボードフォーカスの移動
 *   })
 *
 * MJ.tileInfo は長押し時の補足表示（#tile-info）。
 */
(function (MJ) {
  'use strict';

  let infoTimer = null;

  MJ.tileInfo = {
    show: function (btn, title, code, notes) {
      const box = document.getElementById('tile-info');
      if (!box) return;
      box.replaceChildren();
      const strong = document.createElement('strong');
      strong.textContent = title;
      const codeEl = document.createElement('span');
      codeEl.className = 'tile-info-code';
      codeEl.textContent = code;
      box.append(strong, codeEl);
      if (notes && notes.length) {
        const p = document.createElement('span');
        p.textContent = notes.join(' / ');
        box.append(p);
      }
      const r = btn.getBoundingClientRect();
      box.style.left = Math.max(80, Math.min(window.innerWidth - 80, r.left + r.width / 2)) + 'px';
      box.style.top = (r.top - 6) + 'px';
      box.hidden = false;
      clearTimeout(infoTimer);
      MJ.ui.announce(title + (notes && notes.length ? '、' + notes.join('、') : ''));
    },
    hideLater: function () {
      clearTimeout(infoTimer);
      infoTimer = setTimeout(MJ.tileInfo.hide, MJ.INPUT.infoHideMs);
    },
    hide: function () {
      clearTimeout(infoTimer);
      const box = document.getElementById('tile-info');
      if (box) box.hidden = true;
    }
  };

  function attach(container, h) {
    let gesture = null;

    function locked() { return h.isLocked ? h.isLocked() : false; }

    function resetDrag(btn, animateBack) {
      const current = btn.style.transform;
      btn.style.transform = '';
      btn.classList.remove('is-dragging', 'is-armed');
      if (animateBack && current && MJ.anim.factor() > 0 && btn.animate) {
        btn.animate([{ transform: current }, { transform: 'translateY(0)' }], { duration: MJ.anim.ms(200), easing: 'ease-out' });
      }
    }

    function cancel() {
      if (!gesture) return;
      clearTimeout(gesture.timer);
      resetDrag(gesture.btn, true);
      gesture = null;
    }

    container.addEventListener('pointerdown', function (e) {
      const btn = e.target.closest('.tile-btn');
      if (!btn || locked()) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      MJ.tileInfo.hide();
      const g = { id: btn.dataset.id, btn: btn, x: e.clientX, y: e.clientY, pid: e.pointerId, moved: false, dragging: false, longPressed: false };
      g.timer = setTimeout(function () {
        if (gesture !== g || g.moved) return;
        g.longPressed = true;
        if (h.onInfo) h.onInfo(btn);
        MJ.ui.vibrate(8);
      }, MJ.INPUT.longPressMs);
      gesture = g;
    });

    container.addEventListener('pointermove', function (e) {
      const g = gesture;
      if (!g || e.pointerId !== g.pid) return;
      const dx = e.clientX - g.x;
      const dy = g.y - e.clientY; // 上方向が正
      if (Math.abs(dx) > MJ.INPUT.tapSlop || Math.abs(dy) > MJ.INPUT.tapSlop) {
        g.moved = true;
        clearTimeout(g.timer);
      }
      /* 縦方向が優勢な上向きの動きだけを打牌スワイプとして追従させる（横の動きは手牌の横スクロール） */
      if (!g.dragging && dy > MJ.INPUT.tapSlop && dy > Math.abs(dx) * 1.2 && (!h.canDrag || h.canDrag(g.id))) {
        g.dragging = true;
        g.btn.classList.add('is-dragging');
        try { g.btn.setPointerCapture(g.pid); } catch (err) { /* 未対応ブラウザーでは無視 */ }
      }
      if (g.dragging) {
        const lift = Math.max(0, Math.min(dy, MJ.INPUT.swipeFollowMax));
        g.btn.style.transform = 'translateY(' + (-lift) + 'px)';
        g.btn.classList.toggle('is-armed', dy >= MJ.INPUT.swipeDiscard);
      }
    });

    container.addEventListener('pointerup', function (e) {
      const g = gesture;
      if (!g || e.pointerId !== g.pid) return;
      gesture = null;
      clearTimeout(g.timer);
      if (g.longPressed) { MJ.tileInfo.hideLater(); return; }
      if (g.dragging) {
        const armed = g.y - e.clientY >= MJ.INPUT.swipeDiscard;
        resetDrag(g.btn, !armed);
        if (armed && h.onSwipe) h.onSwipe(g.id);
        return;
      }
      if (!g.moved && h.onTap) h.onTap(g.id, 'tap');
    });

    container.addEventListener('pointercancel', cancel);
    container.addEventListener('contextmenu', function (e) { e.preventDefault(); });

    /* ポインター操作は pointerup で処理済み。detail===0 はキーボード（Enter／Space）由来のクリック */
    container.addEventListener('click', function (e) {
      const btn = e.target.closest('.tile-btn');
      if (btn && e.detail === 0 && !locked() && h.onTap) h.onTap(btn.dataset.id, 'key');
    });

    container.addEventListener('focusin', function (e) {
      const btn = e.target.closest('.tile-btn');
      if (btn && h.onFocus) h.onFocus(btn.dataset.id);
    });

    /* 左右キーでフォーカス移動（ロービング tabindex） */
    container.addEventListener('keydown', function (e) {
      const btns = Array.prototype.slice.call(container.querySelectorAll('.tile-btn'));
      const idx = btns.indexOf(document.activeElement);
      if (idx < 0) return;
      let next = -1;
      if (e.key === 'ArrowRight') next = Math.min(btns.length - 1, idx + 1);
      else if (e.key === 'ArrowLeft') next = Math.max(0, idx - 1);
      else if (e.key === 'Home') next = 0;
      else if (e.key === 'End') next = btns.length - 1;
      else if (e.key === 'i' || e.key === 'I') {
        if (h.onInfo) { h.onInfo(btns[idx]); MJ.tileInfo.hideLater(); }
        e.preventDefault();
        return;
      }
      if (next < 0) return;
      e.preventDefault();
      btns.forEach(function (b, i) { b.tabIndex = i === next ? 0 : -1; });
      btns[next].focus();
    });

    return { cancel: cancel };
  }

  /*
   * 打牌方法の設定に従って、入力を「選択」か「確定」に振り分ける（デモと何切るで共通）。
   *   戻り値 'select' | 'commit' | 'hint'
   */
  function interpret(source, isSelected) {
    const method = MJ.settings.discardMethod;
    const guard = MJ.settings.misdiscardGuard;
    if (source === 'swipe') {
      if (method === 'confirm' || (guard && !isSelected)) return 'select';
      return 'commit';
    }
    if (method === 'retap' && (isSelected || !guard)) return 'commit';
    if (isSelected) return 'hint';
    return 'select';
  }

  function commitHint(verb) {
    const v = verb || '打牌';
    const method = MJ.settings.discardMethod;
    if (method === 'retap') return 'もう一度押すと' + v + 'します';
    if (method === 'swipe') return '上スワイプまたは「この牌を切る」で' + v + 'します';
    return '「この牌を切る」で' + v + 'します';
  }

  MJ.handInput = { attach: attach, interpret: interpret, commitHint: commitHint };
})(window.MJ = window.MJ || {});
