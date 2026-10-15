/*
 * 操作の制限時間（DOM非依存）。時刻は呼び出し側が渡す（テストでは任意の時刻を使える）。
 *
 *   const t = MJ.turnTimer.create(20);   // 20秒
 *   t.start('turn:12', now)   … 同じキーなら残り時間を引き継ぐ（画面回転・再描画でリセットしない）
 *   t.remaining(now)          … 残り秒（小数）
 *   t.fraction(now)           … 残りの割合 0〜1（ゲージ表示用）
 *   t.expired(now)
 *   t.pause(now) / t.resume(now) … 画面を離れている間は止める
 *   t.stop()
 */
(function (MJ) {
  'use strict';

  function create(seconds) {
    const total = Math.max(0, Number(seconds) || 0) * 1000;
    let key = null;
    let deadline = 0;
    let pausedLeft = null;

    return {
      seconds: total / 1000,
      get key() { return key; },
      get running() { return key !== null && pausedLeft === null; },
      start: function (k, now) {
        if (key === k) return false;
        key = k;
        deadline = now + total;
        pausedLeft = null;
        return true;
      },
      stop: function () { key = null; pausedLeft = null; },
      pause: function (now) {
        if (key === null || pausedLeft !== null) return;
        pausedLeft = Math.max(0, deadline - now);
      },
      resume: function (now) {
        if (key === null || pausedLeft === null) return;
        deadline = now + pausedLeft;
        pausedLeft = null;
      },
      remaining: function (now) {
        if (key === null) return total / 1000;
        const left = pausedLeft !== null ? pausedLeft : deadline - now;
        return Math.max(0, left) / 1000;
      },
      fraction: function (now) {
        return total ? this.remaining(now) * 1000 / total : 0;
      },
      expired: function (now) {
        return key !== null && pausedLeft === null && now >= deadline;
      }
    };
  }

  MJ.turnTimer = { create: create };
})(window.MJ = window.MJ || {});
