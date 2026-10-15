/*
 * CPU四人麻雀のゲームエンジン（DOM非依存・同期処理）。
 *
 * 席番号：0 = あなた（下）、1 = 下家（右）、2 = 対面（上）、3 = 上家（左）。手番は 0→1→2→3 の順。
 *
 * 状態遷移（match.phase）：
 *   ready → [decideDealer] → [startRound] → draw ⇄ discard → round-end → [nextRound] → draw … → match-end
 *
 * フェーズ3の範囲：配牌・ツモ・打牌・山切れ流局（テンパイ判定・ノーテン罰符・連荘・本場）・東風戦の終了・順位。
 * ロン／ツモ和了・鳴き・リーチ・途中流局は未実装（discard() 内の「フェーズ4・5」の箇所で判定を追加する）。
 */
(function (MJ) {
  'use strict';

  const WINDS = ['east', 'south', 'west', 'north'];
  const WIND_KANJI = { east: '東', south: '南', west: '西', north: '北' };
  const SEAT_LABEL = ['自家', '下家', '対面', '上家'];

  /* プレイヤーの既定値（名前・テーマ色・エンブレムはすべてオリジナル） */
  const PLAYER_DEFS = [
    { id: 'player', name: 'あなた', isCPU: false, theme: 'gold', emblem: 'star' },
    { id: 'cpu1', name: 'ヒスイ', isCPU: true, theme: 'jade', emblem: 'leaf' },
    { id: 'cpu2', name: 'シオン', isCPU: true, theme: 'violet', emblem: 'moon' },
    { id: 'cpu3', name: 'アカネ', isCPU: true, theme: 'rose', emblem: 'flame' }
  ];

  const NOTEN_PENALTY = 3000;

  function createMatch(options) {
    const o = options || {};
    const rules = o.rules || MJ.RULES;
    const seed = o.seed == null || o.seed === ''
      ? MJ.wall.normalizeSeed(String(Date.now()) + Math.random())
      : MJ.wall.normalizeSeed(o.seed);
    return {
      mode: 'cpu-match',
      rules: rules,
      seed: seed,
      players: PLAYER_DEFS.map(function (d, i) {
        return {
          id: d.id, name: d.name, isCPU: d.isCPU, theme: d.theme, emblem: d.emblem,
          seat: i,
          cpuLevel: d.isCPU ? (o.cpuLevel || 1) : 0,
          score: rules.startScore,
          hand: [], drawn: null, discards: [], melds: [], riichi: false
        };
      }),
      roundWindIndex: 0,
      handNumber: 1,
      honba: 0,
      riichiSticks: 0,
      dealerIndex: 0,
      initialDealer: 0,
      dice: null,
      roundCount: 0,
      wall: null,
      doraIndicators: [],
      currentPlayerIndex: 0,
      turnCount: 0,
      lastDiscard: null,
      phase: 'ready',
      pendingActions: [],   // フェーズ5：鳴き・ロンの選択肢をここに積む
      result: null,
      history: [],
      ranking: null
    };
  }

  /* 起家決定：サイコロ2個の合計で、自家から反時計回りに数える（シードで再現できる） */
  function decideDealer(m) {
    const rng = MJ.wall.createRng(m.seed ^ 0x9e3779b9);
    const d1 = 1 + Math.floor(rng() * 6);
    const d2 = 1 + Math.floor(rng() * 6);
    m.dice = [d1, d2];
    m.dealerIndex = (d1 + d2 - 1) % 4;
    m.initialDealer = m.dealerIndex;
    return m.dealerIndex;
  }

  function seatWind(m, seat) {
    return WINDS[(seat - m.dealerIndex + 4) % 4];
  }

  function roundWind(m) {
    return WINDS[m.roundWindIndex];
  }

  function roundLabel(m) {
    return WIND_KANJI[roundWind(m)] + m.handNumber + '局';
  }

  function doraKinds(m) {
    return m.doraIndicators.map(function (t) { return MJ.tiles.doraKindFromIndicator(t.kind); });
  }

  /* 局の開始：牌山を作り、親から4枚ずつ3巡＋1枚ずつ配る */
  function startRound(m) {
    if (m.phase === 'match-end') throw new Error('対局は終了しています');
    const wall = MJ.wall.build({ rules: m.rules, seed: m.seed + ':' + m.roundCount, dealCount: 0 });
    m.wall = wall;
    m.doraIndicators = wall.doraIndicators.slice();
    m.players.forEach(function (p) {
      p.hand = []; p.drawn = null; p.discards = []; p.melds = []; p.riichi = false;
    });
    for (let pass = 0; pass < 4; pass++) {
      for (let i = 0; i < 4; i++) {
        const p = m.players[(m.dealerIndex + i) % 4];
        const n = pass < 3 ? 4 : 1;
        for (let k = 0; k < n; k++) p.hand.push(MJ.wall.drawOne(wall));
      }
    }
    m.players.forEach(function (p) { p.hand = MJ.handSorter.sort(p.hand); });
    m.currentPlayerIndex = m.dealerIndex;
    m.turnCount = 0;
    m.lastDiscard = null;
    m.result = null;
    m.pendingActions = [];
    m.phase = 'draw';
    return m;
  }

  function current(m) {
    return m.players[m.currentPlayerIndex];
  }

  function canDraw(m) {
    if (m.phase !== 'draw') return { ok: false, reason: 'ツモの順番ではありません' };
    if (!m.wall.live.length) return { ok: false, reason: '山に牌が残っていません' };
    return { ok: true };
  }

  function draw(m) {
    const check = canDraw(m);
    if (!check.ok) return check;
    const p = current(m);
    p.drawn = MJ.wall.drawOne(m.wall);
    m.turnCount += 1;
    m.phase = 'discard';
    return { ok: true, seat: p.seat, tile: p.drawn };
  }

  function canDiscard(m, seat) {
    if (m.phase !== 'discard') return { ok: false, reason: '打牌の順番ではありません' };
    if (seat !== m.currentPlayerIndex) return { ok: false, reason: m.players[m.currentPlayerIndex].name + 'の番です' };
    return { ok: true };
  }

  /* options.autoSort === false のとき、手出し後の手牌を並べ直さない（あなたの自動整列設定） */
  function discard(m, seat, tileId, options) {
    const autoSort = !options || options.autoSort !== false;
    const check = canDiscard(m, seat);
    if (!check.ok) return check;
    const p = m.players[seat];
    let tile;
    let tsumogiri = false;
    if (p.drawn && p.drawn.id === tileId) {
      tile = p.drawn;
      tsumogiri = true;
      p.drawn = null;
    } else {
      const idx = p.hand.findIndex(function (t) { return t.id === tileId; });
      if (idx < 0) return { ok: false, reason: 'その牌は手牌にありません' };
      tile = p.hand.splice(idx, 1)[0];
      if (p.drawn) { p.hand.push(p.drawn); p.drawn = null; }
      if (autoSort) p.hand = MJ.handSorter.sort(p.hand);
    }
    p.discards.push({ tile: tile, tsumogiri: tsumogiri, turn: m.turnCount });
    m.lastDiscard = { seat: seat, tile: tile };

    /* フェーズ4・5：ここで他家のロン・ポン・チー・カンを判定し、pendingActions に積む */

    if (!m.wall.live.length) {
      endExhaustive(m);
      return { ok: true, tile: tile, tsumogiri: tsumogiri, roundEnded: true };
    }
    m.currentPlayerIndex = (seat + 1) % 4;
    m.phase = 'draw';
    return { ok: true, tile: tile, tsumogiri: tsumogiri, roundEnded: false };
  }

  /* ノーテン罰符：場に3000点。テンパイ者が受け取り、ノーテン者が支払う。全員テンパイ／全員ノーテンは移動なし */
  function notenPayments(tenpai) {
    const n = tenpai.filter(Boolean).length;
    if (n === 0 || n === 4) return [0, 0, 0, 0];
    return tenpai.map(function (t) { return t ? NOTEN_PENALTY / n : -NOTEN_PENALTY / (4 - n); });
  }

  function isTenpai(p) {
    return MJ.shanten.calc(MJ.shanten.countsOf(p.hand), { meldCount: p.melds.length }) === 0;
  }

  function endExhaustive(m) {
    const tenpai = m.players.map(isTenpai);
    const deltas = notenPayments(tenpai);
    const before = m.players.map(function (p) { return p.score; });
    m.players.forEach(function (p, i) { p.score += deltas[i]; });
    m.result = {
      type: 'exhaustive',
      label: roundLabel(m),
      honba: m.honba,
      tenpai: tenpai,
      deltas: deltas,
      before: before,
      after: m.players.map(function (p) { return p.score; }),
      dealerKeeps: tenpai[m.dealerIndex]
    };
    m.history.push({ label: m.result.label, honba: m.honba, type: 'exhaustive', deltas: deltas.slice() });
    m.phase = 'round-end';
  }

  /* 次の局がどうなるかを、状態を変えずに求める（局結果画面のボタン表示用） */
  function peekNext(m) {
    const r = m.result;
    let dealer = m.dealerIndex;
    let hand = m.handNumber;
    let windIdx = m.roundWindIndex;
    if (!r.dealerKeeps) {
      dealer = (dealer + 1) % 4;
      hand += 1;
      if (hand > 4) { hand = 1; windIdx += 1; }
    }
    const maxWinds = m.rules.matchLength === 'hanchan' ? 2 : 1;
    if (m.players.some(function (p) { return p.score < 0; })) return { ended: true, reason: 'トビ' };
    if (windIdx >= maxWinds) return { ended: true, reason: (maxWinds === 1 ? '東風戦' : '半荘戦') + '終了' };
    return {
      ended: false,
      dealer: dealer,
      label: WIND_KANJI[WINDS[windIdx]] + hand + '局',
      honba: m.honba + 1,
      renchan: !!r.dealerKeeps
    };
  }

  /* 次の局へ。流局は本場を1つ積む。親がテンパイなら連荘、ノーテンなら親流れ */
  function nextRound(m) {
    if (m.phase !== 'round-end') throw new Error('局が終わっていません');
    const next = peekNext(m);
    m.roundCount += 1;
    if (next.ended) {
      m.phase = 'match-end';
      m.endReason = next.reason;
      m.ranking = ranking(m);
      return next;
    }
    if (!m.result.dealerKeeps) {
      m.dealerIndex = next.dealer;
      m.handNumber += 1;
      if (m.handNumber > 4) { m.handNumber = 1; m.roundWindIndex += 1; }
    }
    m.honba = next.honba;
    startRound(m);
    return next;
  }

  /* 順位：点数の高い順。同点は起家に近い席が上位 */
  function ranking(m) {
    return m.players
      .map(function (p) { return { seat: p.seat, name: p.name, score: p.score, order: (p.seat - m.initialDealer + 4) % 4 }; })
      .sort(function (a, b) { return b.score - a.score || a.order - b.order; })
      .map(function (r, i) { r.rank = i + 1; return r; });
  }

  /* 牌の総数（テスト・デバッグ用）。常に136枚になる */
  function tileTotal(m) {
    let n = m.wall.live.length + m.wall.dead.length;
    m.players.forEach(function (p) { n += p.hand.length + (p.drawn ? 1 : 0) + p.discards.length; });
    return n;
  }

  /* CPU判断に渡す局面情報 */
  function contextFor(m, seat) {
    return {
      level: m.players[seat].cpuLevel || 1,
      seatWind: seatWind(m, seat),
      roundWind: roundWind(m),
      doraKinds: doraKinds(m)
    };
  }

  MJ.gameEngine = {
    WINDS: WINDS,
    WIND_KANJI: WIND_KANJI,
    SEAT_LABEL: SEAT_LABEL,
    PLAYER_DEFS: PLAYER_DEFS,
    createMatch: createMatch,
    decideDealer: decideDealer,
    startRound: startRound,
    seatWind: seatWind,
    roundWind: roundWind,
    roundLabel: roundLabel,
    doraKinds: doraKinds,
    current: current,
    canDraw: canDraw,
    draw: draw,
    canDiscard: canDiscard,
    discard: discard,
    notenPayments: notenPayments,
    isTenpai: isTenpai,
    peekNext: peekNext,
    nextRound: nextRound,
    ranking: ranking,
    tileTotal: tileTotal,
    contextFor: contextFor
  };
})(window.MJ = window.MJ || {});
