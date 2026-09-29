/*
 * 効果音：外部音声素材を使わず Web Audio API で電子音を合成する。
 * AudioContext はブラウザーの制限により、最初のユーザー操作後に生成する。
 */
(function (MJ) {
  'use strict';

  let ctx = null;
  let master = null;

  function ensure() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function tone(freq, dur, o) {
    const opt = o || {};
    const t0 = ctx.currentTime + (opt.delay || 0);
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = opt.type || 'sine';
    osc.frequency.setValueAtTime(freq, t0);
    if (opt.slideTo) osc.frequency.exponentialRampToValueAtTime(opt.slideTo, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(opt.gain || 0.2, t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g); g.connect(master);
    osc.start(t0); osc.stop(t0 + dur + 0.02);
  }

  /* 牌が卓に当たる音：短いノイズをバンドパスで絞る */
  function click(freq, gain, delay) {
    const t0 = ctx.currentTime + (delay || 0);
    const len = Math.floor(ctx.sampleRate * 0.05);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 4);
    const src = ctx.createBufferSource();
    const bp = ctx.createBiquadFilter();
    const g = ctx.createGain();
    src.buffer = buf;
    bp.type = 'bandpass'; bp.frequency.value = freq; bp.Q.value = 2.2;
    g.gain.value = gain;
    src.connect(bp); bp.connect(g); g.connect(master);
    src.start(t0);
  }

  const SOUNDS = {
    select: function () { tone(1320, 0.07, { type: 'triangle', gain: 0.08 }); },
    draw: function () { click(2400, 0.5); tone(660, 0.08, { type: 'sine', gain: 0.05, delay: 0.02 }); },
    discard: function () { click(1600, 0.9); click(900, 0.4, 0.035); },
    sort: function () { [0, 0.04, 0.08].forEach(function (d) { click(2200, 0.25, d); }); },
    error: function () { tone(220, 0.14, { type: 'square', gain: 0.05 }); },
    riichi: function () { tone(523, 0.18, { type: 'triangle', gain: 0.15 }); tone(784, 0.3, { type: 'triangle', gain: 0.15, delay: 0.12 }); },
    call: function () { tone(440, 0.1, { type: 'sawtooth', gain: 0.06 }); tone(660, 0.14, { type: 'sawtooth', gain: 0.06, delay: 0.08 }); },
    ron: function () { [523, 659, 784, 1047].forEach(function (f, i) { tone(f, 0.35, { type: 'triangle', gain: 0.13, delay: i * 0.07 }); }); },
    tsumo: function () { [587, 740, 880, 1175].forEach(function (f, i) { tone(f, 0.35, { type: 'triangle', gain: 0.13, delay: i * 0.07 }); }); },
    start: function () { tone(392, 0.2, { gain: 0.1 }); tone(587, 0.3, { gain: 0.1, delay: 0.1 }); tone(784, 0.45, { gain: 0.1, delay: 0.2 }); },
    end: function () { tone(784, 0.25, { gain: 0.1 }); tone(587, 0.25, { gain: 0.1, delay: 0.14 }); tone(392, 0.5, { gain: 0.1, delay: 0.28 }); }
  };

  function play(name) {
    const s = MJ.settings;
    if (!s || !s.sound || s.volume <= 0 || !SOUNDS[name]) return;
    if (!ensure()) return;
    master.gain.value = s.volume;
    try { SOUNDS[name](); } catch (e) { /* 音声が鳴らせなくてもゲームは続行する */ }
  }

  MJ.audio = { play: play, unlock: ensure, names: Object.keys(SOUNDS) };
})(window.MJ = window.MJ || {});
