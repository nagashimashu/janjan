/*
 * アニメーション補助：FLIP移動・飛来・粒子。transform と opacity だけを動かす。
 * 「演出少なめ」設定または prefers-reduced-motion のときは移動演出を省略する。
 */
(function (MJ) {
  'use strict';

  const reduceQuery = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;

  function reducedMotion() {
    return !!(reduceQuery && reduceQuery.matches);
  }

  /* 演出時間の倍率。0 のときは移動演出なし */
  function factor() {
    if (reducedMotion()) return 0;
    const speed = MJ.settings ? MJ.settings.animSpeed : 'normal';
    return speed === 'minimal' ? 0 : speed === 'fast' ? 0.55 : 1;
  }

  function ms(base) { return Math.round(base * factor()); }

  function canAnimate(el) {
    return factor() > 0 && el && typeof el.animate === 'function';
  }

  /* data-id を持つ要素の位置を記録する */
  function capture(container) {
    const map = new Map();
    if (!container) return map;
    container.querySelectorAll('[data-id]').forEach(function (el) {
      map.set(el.dataset.id, el.getBoundingClientRect());
    });
    return map;
  }

  /* 記録した位置から現在位置へ滑らかに移動させる（自動整列など） */
  function flip(container, prev, duration) {
    if (!container || factor() === 0) return;
    const d = ms(duration || 260);
    container.querySelectorAll('[data-id]').forEach(function (el) {
      const before = prev.get(el.dataset.id);
      if (!before || !canAnimate(el)) return;
      const now = el.getBoundingClientRect();
      const dx = before.left - now.left;
      const dy = before.top - now.top;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
      el.animate(
        [{ transform: 'translate(' + dx + 'px,' + dy + 'px)' }, { transform: 'translate(0,0)' }],
        { duration: d, easing: 'cubic-bezier(.2,.8,.2,1)' }
      );
    });
  }

  /*
   * 指定位置（fromRect）から要素の現在位置へ飛ばす。打牌やツモで使う。
   * スクロール領域に切り取られないよう、最前面レイヤーに複製を作って動かし、
   * その間は本物を非表示にする。完了通知が来ない環境でも必ず終わるよう時間切れを設ける。
   */
  function flyFrom(el, fromRect, o) {
    const opt = o || {};
    const layer = document.getElementById('fx-layer');
    if (!canAnimate(el) || !fromRect || !layer) return Promise.resolve();
    const now = el.getBoundingClientRect();
    const clone = el.cloneNode(true);
    clone.removeAttribute('id');
    clone.classList.add('fx-fly');
    clone.style.setProperty('--tile-w', getComputedStyle(el).getPropertyValue('--tile-w'));
    clone.style.left = now.left + 'px';
    clone.style.top = now.top + 'px';
    clone.style.width = now.width + 'px';
    clone.style.height = now.height + 'px';
    layer.appendChild(clone);
    el.style.visibility = 'hidden';

    const dx = (fromRect.left + fromRect.width / 2) - (now.left + now.width / 2);
    const dy = (fromRect.top + fromRect.height / 2) - (now.top + now.height / 2);
    const s = fromRect.width && now.width ? fromRect.width / now.width : 1;
    const rot = opt.rotate || 0;
    const duration = ms(opt.duration || 380);
    const anim = clone.animate([
      { transform: 'translate(' + dx + 'px,' + dy + 'px) scale(' + s + ') rotate(0deg)', opacity: opt.fromOpacity == null ? 1 : opt.fromOpacity },
      { offset: 0.7, transform: 'translate(' + (dx * 0.12) + 'px,' + (dy * 0.12) + 'px) scale(1.08) rotate(' + (rot * 0.92) + 'deg)', opacity: 1 },
      { transform: 'translate(0,0) scale(1) rotate(' + rot + 'deg)' }
    ], { duration: duration, easing: 'cubic-bezier(.25,.8,.25,1)' });

    const timeout = new Promise(function (resolve) { setTimeout(resolve, duration + 150); });
    return Promise.race([anim.finished.catch(function () {}), timeout]).then(function () {
      clone.remove();
      el.style.visibility = '';
    });
  }

  /* 配牌：順番に滑り込ませる */
  function dealIn(elements, stagger) {
    if (factor() === 0) return;
    elements.forEach(function (el, i) {
      if (!canAnimate(el)) return;
      el.animate([
        { transform: 'translateY(-70px) rotate(-8deg)', opacity: 0 },
        { transform: 'translateY(0) rotate(0)', opacity: 1 }
      ], { duration: ms(340), delay: ms((stagger || 45) * i), easing: 'cubic-bezier(.2,.9,.3,1.2)', fill: 'backwards' });
    });
  }

  function pulse(el, className) {
    if (!el) return;
    const cls = className || 'fx-glow';
    el.classList.remove(cls);
    void el.offsetWidth; // アニメーションを再始動させる
    el.classList.add(cls);
    setTimeout(function () { el.classList.remove(cls); }, 900);
  }

  /* 粒子。端末性能と設定に応じて数を減らす */
  function burst(x, y, o) {
    const opt = o || {};
    const layer = document.getElementById('fx-layer');
    if (!layer || factor() === 0) return;
    const cores = navigator.hardwareConcurrency || 4;
    const count = Math.round((opt.count || 14) * (cores <= 4 ? 0.5 : 1) * (MJ.settings.animSpeed === 'fast' ? 0.7 : 1));
    const colors = opt.colors || ['#f3d27a', '#5fe0bd', '#b69cff', '#ffffff'];
    for (let i = 0; i < count; i++) {
      const p = document.createElement('span');
      p.className = 'fx-particle';
      p.style.left = x + 'px';
      p.style.top = y + 'px';
      p.style.background = colors[i % colors.length];
      layer.appendChild(p);
      const ang = (Math.PI * 2 * i) / count + Math.random() * 0.5;
      const dist = 26 + Math.random() * (opt.spread || 46);
      const a = p.animate([
        { transform: 'translate(-50%,-50%) scale(1)', opacity: 1 },
        { transform: 'translate(calc(-50% + ' + Math.cos(ang) * dist + 'px), calc(-50% + ' + Math.sin(ang) * dist + 'px)) scale(0.2)', opacity: 0 }
      ], { duration: ms(620) + Math.random() * 180, easing: 'cubic-bezier(.15,.7,.3,1)' });
      a.onfinish = function () { p.remove(); };
      a.oncancel = function () { p.remove(); };
    }
  }

  function burstAt(el, o) {
    if (!el) return;
    const r = el.getBoundingClientRect();
    burst(r.left + r.width / 2, r.top + r.height / 2, o);
  }

  MJ.anim = {
    reducedMotion: reducedMotion,
    factor: factor,
    ms: ms,
    capture: capture,
    flip: flip,
    flyFrom: flyFrom,
    dealIn: dealIn,
    pulse: pulse,
    burst: burst,
    burstAt: burstAt,
    onReducedMotionChange: function (fn) {
      if (reduceQuery && reduceQuery.addEventListener) reduceQuery.addEventListener('change', fn);
    }
  };
})(window.MJ = window.MJ || {});
