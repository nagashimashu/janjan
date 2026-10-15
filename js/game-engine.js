/*
 * CPU四人麻雀のゲームエンジン（DOM非依存・同期処理）。
 *
 * 席番号：0 = あなた（下）、1 = 下家（右）、2 = 対面（上）、3 = 上家（左）。手番は 0→1→2→3 の順。
 *
 * 状態遷移（match.phase）：
 *   ready → [decideDealer] → [startRound] → draw → discard ─┬─ 打牌 →（応答があれば）call ─┬─ ロン → round-end
 *                                                            │                              ├─ ポン・チー → discard（鳴いた人）
 *                                                            │                              ├─ 明槓 → 嶺上ツモ → discard
 *                                                            │                              └─ 全員見送り → draw（次の人）／流局
 *                                                            ├─ ツモ和了・九種九牌 → round-end
 *                                                            ├─ 暗槓 → 嶺上ツモ → discard
 *                                                            └─ 加槓 →（槍槓の候補があれば）call → 嶺上ツモ → discard
 *   round-end → [nextRound] → draw … → match-end
 *
 * 牌山の王牌（14枚）の使い方：dead[0..4] ドラ表示牌（カンごとに1枚ずつめくる）、dead[5..9] 裏ドラ表示牌、
 * dead[10..13] 嶺上牌。嶺上牌を取ったら、ツモ山の最後の1枚を王牌に補充する（王牌は常に14枚）。
 *
 * 簡略化しているルール：カンドラはカンの直後にめくる（明槓・加槓も即めくり）、四槓散了・四風連打・四家立直・
 * 三家和・ダブル立直・流し満貫・包は未実装。ダブロンなし（頭ハネ）。
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
  const RIICHI_COST = 1000;
  const MAX_KANS = 4;

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
        const p = {
          id: d.id, name: d.name, isCPU: d.isCPU, theme: d.theme, emblem: d.emblem,
          seat: i,
          cpuLevel: d.isCPU ? (o.cpuLevel || 1) : 0,
          score: rules.startScore
        };
        resetPlayer(p);
        return p;
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
      kanCount: 0,
      rinshan: false,        // 現在の手番のツモが嶺上牌か
      anyCall: false,        // この局で鳴き・カンがあったか（九種九牌・一発の判定）
      discardSeq: 0,
      pendingKakan: null,
      currentPlayerIndex: 0,
      turnCount: 0,
      lastDiscard: null,
      phase: 'ready',
      pendingActions: [],
      result: null,
      history: [],
      ranking: null
    };
  }

  function resetPlayer(p) {
    p.hand = [];
    p.drawn = null;
    p.discards = [];
    p.melds = [];
    p.riichi = false;
    p.riichiPending = false;
    p.riichiSeq = -1;
    p.ippatsu = false;
    p.riichiFuriten = false;
    p.furitenTemp = false;
    p.kuikae = [];
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

  function seatWind(m, seat) { return WINDS[(seat - m.dealerIndex + 4) % 4]; }
  function roundWind(m) { return WINDS[m.roundWindIndex]; }
  function roundLabel(m) { return WIND_KANJI[roundWind(m)] + m.handNumber + '局'; }
  function doraKinds(m) { return m.doraIndicators.map(function (t) { return MJ.tiles.doraKindFromIndicator(t.kind); }); }

  function uraIndicators(m) {
    return m.doraIndicators.map(function (_, i) { return m.wall.dead[5 + i]; });
  }

  function isMenzen(p) {
    return p.melds.every(function (x) { return x.concealed; });
  }

  function handWithDrawn(p) {
    return p.drawn ? p.hand.concat([p.drawn]) : p.hand.slice();
  }

  /* 局の開始：牌山を作り、親から4枚ずつ3巡＋1枚ずつ配る */
  function startRound(m) {
    if (m.phase === 'match-end') throw new Error('対局は終了しています');
    const wall = MJ.wall.build({ rules: m.rules, seed: m.seed + ':' + m.roundCount, dealCount: 0 });
    m.wall = wall;
    m.doraIndicators = [wall.dead[0]];
    m.kanCount = 0;
    m.rinshan = false;
    m.anyCall = false;
    m.discardSeq = 0;
    m.pendingKakan = null;
    m.players.forEach(resetPlayer);
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

  function current(m) { return m.players[m.currentPlayerIndex]; }

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
    p.furitenTemp = false;   // 同巡内フリテンは自分のツモで解除
    p.kuikae = [];
    m.rinshan = false;
    m.turnCount += 1;
    m.phase = 'discard';
    return { ok: true, seat: p.seat, tile: p.drawn };
  }

  /* 嶺上牌を引く。ツモ山の最後の牌を王牌に補充して、王牌を14枚に保つ */
  function drawRinshan(m, p) {
    const idx = 10 + m.kanCount - 1;
    p.drawn = m.wall.dead[idx];
    m.wall.dead[idx] = m.wall.live.pop();
    m.rinshan = true;
    m.phase = 'discard';
    m.currentPlayerIndex = p.seat;
  }

  function flipKanDora(m) {
    m.doraIndicators.push(m.wall.dead[m.kanCount]);
  }

  function breakIppatsu(m) {
    m.anyCall = true;
    m.players.forEach(function (p) { p.ippatsu = false; });
  }

  function canDiscard(m, seat) {
    if (m.phase !== 'discard') return { ok: false, reason: '打牌の順番ではありません' };
    if (seat !== m.currentPlayerIndex) return { ok: false, reason: m.players[m.currentPlayerIndex].name + 'の番です' };
    return { ok: true };
  }

  function findTileIn(list, id) {
    return list.findIndex(function (t) { return t.id === id; });
  }

  /*
   * 打牌。options：
   *   autoSort === false … 手出し後に並べ直さない（あなたの自動整列設定）
   *   riichi === true    … リーチ宣言牌として打牌する（canRiichi で確認済みであること）
   */
  function discard(m, seat, tileId, options) {
    const o = options || {};
    const check = canDiscard(m, seat);
    if (!check.ok) return check;
    const p = m.players[seat];
    if (p.riichi && (!p.drawn || p.drawn.id !== tileId)) return { ok: false, reason: 'リーチ後はツモ切りしかできません' };

    let tile = p.drawn && p.drawn.id === tileId ? p.drawn : p.hand[findTileIn(p.hand, tileId)];
    if (!tile) return { ok: false, reason: 'その牌は手牌にありません' };
    if (p.kuikae.indexOf(tile.kind) >= 0 && handWithDrawn(p).some(function (t) { return p.kuikae.indexOf(t.kind) < 0; })) {
      return { ok: false, reason: '鳴いた直後に同じ牌・筋の牌は切れません（喰い替え禁止）' };
    }
    if (o.riichi) {
      const rc = canRiichi(m, seat);
      if (!rc.ok) return rc;
      if (rc.tiles.indexOf(tileId) < 0) return { ok: false, reason: 'その牌を切るとテンパイになりません' };
    }

    let tsumogiri = false;
    if (p.drawn && p.drawn.id === tileId) {
      tsumogiri = true;
      p.drawn = null;
    } else {
      p.hand.splice(findTileIn(p.hand, tileId), 1);
      if (p.drawn) { p.hand.push(p.drawn); p.drawn = null; }
      if (o.autoSort !== false) p.hand = MJ.handSorter.sort(p.hand);
    }
    /* リーチ後の2回目の打牌で一発は消える */
    if (p.riichi) p.ippatsu = false;
    p.kuikae = [];
    m.rinshan = false;
    m.discardSeq += 1;
    const entry = { tile: tile, tsumogiri: tsumogiri, turn: m.turnCount, seq: m.discardSeq, riichi: !!o.riichi, called: false };
    p.discards.push(entry);
    if (o.riichi) { p.riichiPending = true; p.riichiSeq = m.discardSeq; }
    m.lastDiscard = { seat: seat, tile: tile, chankan: false };

    const actions = collectResponses(m, seat, tile);
    if (actions.length) {
      m.pendingActions = actions;
      m.phase = 'call';
      return { ok: true, tile: tile, tsumogiri: tsumogiri, roundEnded: false, calls: actions };
    }
    proceedAfterDiscard(m, seat);
    return { ok: true, tile: tile, tsumogiri: tsumogiri, roundEnded: m.phase === 'round-end' };
  }

  /* チーの組み合わせ（手牌から出す2種類）。例：5 をチー → [3,4] [4,6] [6,7] */
  function chiOptions(p, kind) {
    if (kind >= 27) return [];
    const pos = kind % 9;
    const c = MJ.shanten.countsOf(p.hand);
    const out = [];
    [[-2, -1], [-1, 1], [1, 2]].forEach(function (d) {
      const a = pos + d[0];
      const b = pos + d[1];
      if (a < 0 || b > 8) return;
      if (c[kind + d[0]] > 0 && c[kind + d[1]] > 0) out.push([kind + d[0], kind + d[1]]);
    });
    return out;
  }

  /*
   * 打牌に対する応答の候補。順番：ロン（下家から＝頭ハネ）→ ポン・明槓 → チー。
   * 最後の牌（河底）は鳴けない。リーチ中は鳴けない。
   */
  function collectResponses(m, seat, tile) {
    const list = [];
    for (let k = 1; k <= 3; k++) {
      const s = (seat + k) % 4;
      if (ronResult(m, s, tile)) list.push({ seat: s, type: 'ron' });
    }
    if (!m.wall.live.length) return list;
    let ponEntry = null;
    for (let k = 1; k <= 3; k++) {
      const s = (seat + k) % 4;
      const p = m.players[s];
      if (p.riichi) continue;
      const n = MJ.shanten.countsOf(p.hand)[tile.kind];
      if (n >= 2) {
        ponEntry = { seat: s, type: 'call', pon: true, kan: n >= 3 && m.kanCount < MAX_KANS, chi: [] };
      }
    }
    const chiSeat = (seat + 1) % 4;
    const chi = m.players[chiSeat].riichi ? [] : chiOptions(m.players[chiSeat], tile.kind);
    if (ponEntry) list.push(ponEntry);
    if (chi.length) {
      if (ponEntry && ponEntry.seat === chiSeat) ponEntry.chi = chi;
      else list.push({ seat: chiSeat, type: 'call', pon: false, kan: false, chi: chi });
    }
    return list;
  }

  /* リーチ宣言牌が通ったら成立：1000点を供託し、一発の権利を得る */
  function finalizeRiichi(m) {
    m.players.forEach(function (p) {
      if (!p.riichiPending) return;
      p.riichiPending = false;
      p.riichi = true;
      p.ippatsu = true;   // 以後、誰かが鳴くか本人が次に打牌すると消える
      p.score -= RIICHI_COST;
      m.riichiSticks += 1;
    });
  }

  /* 打牌に対する応答が終わった後の進行：山がなければ流局、あれば次の人のツモ */
  function proceedAfterDiscard(m, seat) {
    m.pendingActions = [];
    finalizeRiichi(m);
    if (!m.wall.live.length) { endExhaustive(m); return; }
    m.currentPlayerIndex = (seat + 1) % 4;
    m.phase = 'draw';
  }

  /* ================= 鳴き ================= */

  /* 手牌から指定の種類の牌を n 枚取り出す（赤5は残す方を優先しない：通常の5から使う） */
  function takeKinds(p, kinds) {
    const taken = [];
    kinds.forEach(function (k) {
      let idx = p.hand.findIndex(function (t) { return t.kind === k && !t.isRed; });
      if (idx < 0) idx = p.hand.findIndex(function (t) { return t.kind === k; });
      taken.push(p.hand.splice(idx, 1)[0]);
    });
    return taken;
  }

  /*
   * ポン・チー・明槓の応答。choice：{ type: 'pon' | 'chi' | 'kan' | 'skip', chi: 組み合わせの番号 }
   */
  function respondCall(m, seat, choice) {
    if (m.phase !== 'call' || !m.pendingActions.length) return { ok: false, reason: '鳴きの選択中ではありません' };
    const head = m.pendingActions[0];
    if (head.seat !== seat || head.type !== 'call') return { ok: false, reason: m.players[head.seat].name + 'の選択を待っています' };
    const type = choice && choice.type;
    if (type === 'skip' || !type) {
      m.pendingActions.shift();
      if (!m.pendingActions.length) proceedAfterDiscard(m, m.lastDiscard.seat);
      return { ok: true, passed: true, roundEnded: m.phase === 'round-end' };
    }
    if (type === 'pon' && !head.pon) return { ok: false, reason: 'ポンできません' };
    if (type === 'kan' && !head.kan) return { ok: false, reason: 'カンできません' };
    if (type === 'chi' && !head.chi[choice.chi || 0]) return { ok: false, reason: 'チーできません' };

    const from = m.lastDiscard.seat;
    const tile = m.lastDiscard.tile;
    const p = m.players[seat];
    finalizeRiichi(m);   // 宣言牌が鳴かれてもリーチは成立する
    m.players[from].discards[m.players[from].discards.length - 1].called = true;
    breakIppatsu(m);
    m.pendingActions = [];

    let meld;
    if (type === 'pon') {
      meld = { type: 'koutsu', kind: tile.kind, tiles: takeKinds(p, [tile.kind, tile.kind]).concat([tile]), from: from, calledTile: tile, concealed: false };
      p.kuikae = [tile.kind];
    } else if (type === 'kan') {
      meld = { type: 'kantsu', kind: tile.kind, tiles: takeKinds(p, [tile.kind, tile.kind, tile.kind]).concat([tile]), from: from, calledTile: tile, concealed: false };
    } else {
      const pair = head.chi[choice.chi || 0];
      const start = Math.min(pair[0], pair[1], tile.kind);
      meld = { type: 'shuntsu', kind: start, tiles: takeKinds(p, pair).concat([tile]), from: from, calledTile: tile, concealed: false };
      /* 喰い替え禁止：鳴いた牌と、両面で鳴いたときの反対側の筋 */
      p.kuikae = [tile.kind];
      if (tile.kind === start && start % 9 <= 5) p.kuikae.push(start + 3);
      if (tile.kind === start + 2 && start % 9 >= 1) p.kuikae.push(start - 1);
    }
    p.melds.push(meld);
    p.drawn = null;
    m.currentPlayerIndex = seat;
    m.lastDiscard = null;
    if (type === 'kan') {
      m.kanCount += 1;
      flipKanDora(m);
      p.kuikae = [];
      drawRinshan(m, p);
    } else {
      m.rinshan = false;
      m.phase = 'discard';
    }
    return { ok: true, type: type, meld: meld };
  }

  /* ================= 自分の手番の選択肢 ================= */

  /* リーチできるか。tiles：切るとテンパイになる牌の id */
  function canRiichi(m, seat) {
    const p = m.players[seat];
    if (m.phase !== 'discard' || seat !== m.currentPlayerIndex || !p.drawn) return { ok: false, reason: 'リーチできる場面ではありません', tiles: [] };
    if (p.riichi || p.riichiPending) return { ok: false, reason: 'すでにリーチしています', tiles: [] };
    if (!isMenzen(p)) return { ok: false, reason: '鳴いているとリーチできません', tiles: [] };
    if (p.score < RIICHI_COST) return { ok: false, reason: '持ち点が1,000点未満です', tiles: [] };
    if (m.wall.live.length < 4) return { ok: false, reason: '残りの牌が4枚未満です', tiles: [] };
    const all = handWithDrawn(p);
    const counts = MJ.shanten.countsOf(all);
    const tiles = [];
    const okByKind = {};
    all.forEach(function (t) {
      if (okByKind[t.kind] === undefined) {
        counts[t.kind]--;
        okByKind[t.kind] = MJ.shanten.calc(counts, { meldCount: p.melds.length }) === 0;
        counts[t.kind]++;
      }
      if (okByKind[t.kind]) tiles.push(t.id);
    });
    return tiles.length ? { ok: true, tiles: tiles } : { ok: false, reason: 'テンパイになる打牌がありません', tiles: [] };
  }

  function waitsKey(hand, meldCount) {
    return MJ.agari.waits(MJ.shanten.countsOf(hand), meldCount).join(',');
  }

  /* 暗槓できる種類。リーチ中は「ツモ牌で4枚になり、待ちが変わらない」場合だけ */
  function ankanOptions(m, seat) {
    const p = m.players[seat];
    if (m.phase !== 'discard' || seat !== m.currentPlayerIndex || !p.drawn) return [];
    if (m.kanCount >= MAX_KANS || !m.wall.live.length) return [];
    const counts = MJ.shanten.countsOf(handWithDrawn(p));
    const out = [];
    for (let k = 0; k < 34; k++) {
      if (counts[k] !== 4) continue;
      if (p.riichi) {
        if (p.drawn.kind !== k) continue;
        const after = p.hand.filter(function (t) { return t.kind !== k; });
        if (waitsKey(p.hand, p.melds.length) !== waitsKey(after, p.melds.length + 1) || !waitsKey(after, p.melds.length + 1)) continue;
      }
      out.push(k);
    }
    return out;
  }

  /* 加槓できる種類（ポンしている牌の4枚目を持っている） */
  function kakanOptions(m, seat) {
    const p = m.players[seat];
    if (m.phase !== 'discard' || seat !== m.currentPlayerIndex || !p.drawn || p.riichi) return [];
    if (m.kanCount >= MAX_KANS || !m.wall.live.length) return [];
    const all = handWithDrawn(p);
    return p.melds.filter(function (x) {
      return x.type === 'koutsu' && !x.concealed && all.some(function (t) { return t.kind === x.kind; });
    }).map(function (x) { return x.kind; });
  }

  /* 九種九牌：最初のツモで、鳴きがなく、么九牌が9種類以上 */
  function canKyuushu(m, seat) {
    const p = m.players[seat];
    if (!m.rules.abortiveDraws || !m.rules.abortiveDraws.kyushuKyuhai) return false;
    if (m.phase !== 'discard' || seat !== m.currentPlayerIndex || !p.drawn) return false;
    if (m.anyCall || p.discards.length > 0) return false;
    const counts = MJ.shanten.countsOf(handWithDrawn(p));
    return MJ.agari.YAOCHU.filter(function (k) { return counts[k] > 0; }).length >= 9;
  }

  /* 手番の選択肢をまとめて返す（画面・CPU用） */
  function turnOptions(m, seat) {
    const p = m.players[seat];
    const rc = canRiichi(m, seat);
    return {
      tsumo: tsumoResult(m, seat),
      riichiTiles: rc.ok ? rc.tiles : [],
      ankan: ankanOptions(m, seat),
      kakan: kakanOptions(m, seat),
      kyuushu: canKyuushu(m, seat),
      mustTsumogiri: p.riichi,
      kuikae: p.kuikae.slice()
    };
  }

  function declareAnkan(m, seat, kind) {
    if (ankanOptions(m, seat).indexOf(kind) < 0) return { ok: false, reason: '暗槓できません' };
    const p = m.players[seat];
    p.hand.push(p.drawn);
    p.drawn = null;
    const tiles = takeKinds(p, [kind, kind, kind, kind]);
    p.hand = MJ.handSorter.sort(p.hand);
    const meld = { type: 'kantsu', kind: kind, tiles: tiles, from: null, calledTile: null, concealed: true };
    p.melds.push(meld);
    breakIppatsu(m);
    m.kanCount += 1;
    flipKanDora(m);
    drawRinshan(m, p);
    return { ok: true, meld: meld };
  }

  /* 加槓。他家に槍槓のロン候補があれば call フェーズへ（全員見送れば加槓が成立） */
  function declareKakan(m, seat, kind) {
    if (kakanOptions(m, seat).indexOf(kind) < 0) return { ok: false, reason: '加槓できません' };
    const p = m.players[seat];
    p.hand.push(p.drawn);
    p.drawn = null;
    const tile = takeKinds(p, [kind])[0];
    p.hand = MJ.handSorter.sort(p.hand);
    m.pendingKakan = { seat: seat, kind: kind, tile: tile };
    m.lastDiscard = { seat: seat, tile: tile, chankan: true };
    const list = [];
    for (let k = 1; k <= 3; k++) {
      const s = (seat + k) % 4;
      if (ronResult(m, s, tile, { chankan: true })) list.push({ seat: s, type: 'ron', chankan: true });
    }
    if (list.length) {
      m.pendingActions = list;
      m.phase = 'call';
      return { ok: true, chankanCheck: true };
    }
    finishKakan(m);
    return { ok: true };
  }

  function finishKakan(m) {
    const k = m.pendingKakan;
    const p = m.players[k.seat];
    const meld = p.melds.find(function (x) { return x.type === 'koutsu' && x.kind === k.kind && !x.concealed; });
    meld.type = 'kantsu';
    meld.tiles.push(k.tile);
    meld.added = k.tile;
    m.pendingKakan = null;
    m.pendingActions = [];
    m.lastDiscard = null;
    breakIppatsu(m);
    m.kanCount += 1;
    flipKanDora(m);
    drawRinshan(m, p);
  }

  function declareKyuushu(m, seat) {
    if (!canKyuushu(m, seat)) return { ok: false, reason: '九種九牌ではありません' };
    endAbortive(m, '九種九牌', seat);
    return { ok: true };
  }

  /* ================= 和了 ================= */

  function redInMelds(p) {
    let n = 0;
    p.melds.forEach(function (x) { x.tiles.forEach(function (t) { if (t.isRed) n++; }); });
    return n;
  }

  function scoreContext(m, seat, isTsumo, extra) {
    const p = m.players[seat];
    const e = extra || {};
    return {
      isTsumo: isTsumo,
      isDealer: seat === m.dealerIndex,
      seatWind: seatWind(m, seat),
      roundWind: roundWind(m),
      doraKinds: doraKinds(m),
      uraDoraKinds: p.riichi ? uraIndicators(m).map(function (t) { return MJ.tiles.doraKindFromIndicator(t.kind); }) : [],
      riichi: p.riichi,
      ippatsu: p.riichi && p.ippatsu,
      rinshan: isTsumo && m.rinshan,
      chankan: !isTsumo && !!e.chankan,
      haitei: isTsumo && m.wall.live.length === 0 && !m.rinshan,
      houtei: !isTsumo && m.wall.live.length === 0 && !e.chankan,
      melds: p.melds,
      redInMelds: redInMelds(p),
      kuitan: m.rules.kuitan !== false
    };
  }

  function waitsOf(p) {
    return MJ.agari.waits(MJ.shanten.countsOf(p.hand), p.melds.length);
  }

  /*
   * フリテン：自分の待ち牌を1枚でも捨てている（捨て牌フリテン）、同じ巡目にロンを見送った（同巡内フリテン。
   * 自分のツモで解除）、リーチ後にロンを見送った（リーチ後フリテン。局が終わるまで解除されない）
   */
  function furitenInfo(m, seat) {
    const p = m.players[seat];
    const waits = waitsOf(p);
    const discarded = waits.some(function (k) { return p.discards.some(function (d) { return d.tile.kind === k; }); });
    return {
      tenpai: waits.length > 0,
      waits: waits,
      furiten: discarded || !!p.furitenTemp || !!p.riichiFuriten,
      temporary: !discarded && !p.riichiFuriten && !!p.furitenTemp
    };
  }

  function tsumoResult(m, seat) {
    if (m.phase !== 'discard' || seat !== m.currentPlayerIndex) return null;
    const p = m.players[seat];
    if (!p.drawn) return null;
    const counts = MJ.shanten.countsOf(p.hand.concat([p.drawn]));
    if (!MJ.agari.isAgari(counts, p.melds.length)) return null;
    const r = MJ.scoring.score(p.hand, p.drawn, scoreContext(m, seat, true));
    return r.ok ? r : null;
  }

  function ronResult(m, seat, tile, extra) {
    const p = m.players[seat];
    const counts = MJ.shanten.countsOf(p.hand.concat([tile]));
    if (!MJ.agari.isAgari(counts, p.melds.length)) return null;
    if (furitenInfo(m, seat).furiten) return null;
    const r = MJ.scoring.score(p.hand, tile, scoreContext(m, seat, false, extra));
    return r.ok ? r : null;
  }

  function declareTsumo(m, seat) {
    const r = tsumoResult(m, seat);
    if (!r) return { ok: false, reason: 'ツモ和了できません' };
    const p = m.players[seat];
    endWin(m, { type: 'tsumo', winner: seat, loser: null, score: r, winTile: p.drawn, hand: p.hand.slice() });
    return { ok: true, result: m.result };
  }

  /*
   * ロンの応答。pendingActions の先頭（放銃者の下家から順＝頭ハネ）から1人ずつ聞く。
   * 見送ると同巡内フリテン（リーチ中ならリーチ後フリテン）になり、次の候補へ。
   */
  function respondRon(m, seat, accept) {
    if (m.phase !== 'call' || !m.pendingActions.length) return { ok: false, reason: 'ロンの選択中ではありません' };
    const head = m.pendingActions[0];
    if (head.seat !== seat || head.type !== 'ron') return { ok: false, reason: m.players[head.seat].name + 'の選択を待っています' };
    const chankan = !!head.chankan;
    if (accept) {
      const p = m.players[seat];
      const tile = m.lastDiscard.tile;
      const r = ronResult(m, seat, tile, { chankan: chankan });
      if (!r) return { ok: false, reason: 'ロンできません' };
      const loserSeat = m.lastDiscard.seat;
      m.pendingActions = [];
      /* ロンされた宣言牌のリーチは不成立（供託しない） */
      m.players.forEach(function (x) { if (x.riichiPending) { x.riichiPending = false; } });
      endWin(m, { type: 'ron', winner: seat, loser: loserSeat, score: r, winTile: tile, hand: p.hand.slice(), chankan: chankan });
      return { ok: true, result: m.result };
    }
    const p = m.players[seat];
    p.furitenTemp = true;
    if (p.riichi) p.riichiFuriten = true;
    m.pendingActions.shift();
    if (!m.pendingActions.length) {
      if (chankan) finishKakan(m);
      else proceedAfterDiscard(m, m.lastDiscard.seat);
      return { ok: true, passed: true, roundEnded: m.phase === 'round-end' };
    }
    return { ok: true, passed: true };
  }

  function endWin(m, w) {
    const before = m.players.map(function (p) { return p.score; });
    const sticks = m.riichiSticks;
    const deltas = MJ.scoring.settle(w.score, { winner: w.winner, loser: w.loser, dealer: m.dealerIndex, honba: m.honba, riichiSticks: sticks });
    m.players.forEach(function (p, i) { p.score += deltas[i]; });
    m.riichiSticks = 0;
    const winner = m.players[w.winner];
    m.result = {
      type: w.type,
      label: roundLabel(m),
      honba: m.honba,
      riichiSticks: sticks,
      winner: w.winner,
      loser: w.loser,
      chankan: !!w.chankan,
      score: w.score,
      winTile: w.winTile,
      hand: MJ.handSorter.sort(w.hand),
      melds: winner.melds.slice(),
      doraIndicators: m.doraIndicators.slice(),
      uraIndicators: winner.riichi ? uraIndicators(m) : [],
      deltas: deltas,
      before: before,
      after: m.players.map(function (p) { return p.score; }),
      dealerKeeps: w.winner === m.dealerIndex
    };
    m.history.push({ label: m.result.label, honba: m.honba, type: w.type, winner: w.winner, loser: w.loser, deltas: deltas.slice() });
    m.phase = 'round-end';
  }

  /* ================= 流局 ================= */

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

  /* 途中流局（九種九牌）：点数移動なし、親は連荘、本場+1。供託は持ち越し */
  function endAbortive(m, reason, seat) {
    const scores = m.players.map(function (p) { return p.score; });
    m.result = {
      type: 'abortive',
      reason: reason,
      seat: seat,
      hand: handWithDrawn(m.players[seat]),
      label: roundLabel(m),
      honba: m.honba,
      deltas: [0, 0, 0, 0],
      before: scores,
      after: scores.slice(),
      dealerKeeps: true
    };
    m.history.push({ label: m.result.label, honba: m.honba, type: 'abortive', deltas: [0, 0, 0, 0] });
    m.phase = 'round-end';
  }

  /* ================= 次の局・終了 ================= */

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
      /* 本場：流局・途中流局・親の和了は+1、子の和了は0に戻す */
      honba: r.type === 'exhaustive' || r.type === 'abortive' || r.dealerKeeps ? m.honba + 1 : 0,
      renchan: !!r.dealerKeeps
    };
  }

  function nextRound(m) {
    if (m.phase !== 'round-end') throw new Error('局が終わっていません');
    const next = peekNext(m);
    m.roundCount += 1;
    if (next.ended) {
      m.phase = 'match-end';
      m.endReason = next.reason;
      /* 残った供託はトップが受け取る */
      m.leftoverSticks = m.riichiSticks;
      const rank = ranking(m);
      if (m.riichiSticks) {
        m.players[rank[0].seat].score += m.riichiSticks * RIICHI_COST;
        m.riichiSticks = 0;
      }
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

  function ranking(m) {
    return m.players
      .map(function (p) { return { seat: p.seat, name: p.name, score: p.score, order: (p.seat - m.initialDealer + 4) % 4 }; })
      .sort(function (a, b) { return b.score - a.score || a.order - b.order; })
      .map(function (r, i) { r.rank = i + 1; return r; });
  }

  /* 牌の総数（テスト・デバッグ用）。常に136枚。鳴かれた牌は河ではなく副露として数える */
  function tileTotal(m) {
    let n = m.wall.live.length + m.wall.dead.length;
    m.players.forEach(function (p) {
      n += p.hand.length + (p.drawn ? 1 : 0);
      n += p.discards.filter(function (d) { return !d.called; }).length;
      p.melds.forEach(function (x) { n += x.tiles.length; });
    });
    if (m.pendingKakan) n += 1;
    return n;
  }

  /* 見えている牌の枚数（自分の手牌・全員の河・副露・ドラ表示牌） */
  function visibleCounts(m, seat) {
    const tiles = handWithDrawn(m.players[seat]).concat(m.doraIndicators);
    m.players.forEach(function (p) {
      p.discards.forEach(function (d) { if (!d.called) tiles.push(d.tile); });
      p.melds.forEach(function (x) { if (!x.concealed || p.seat === seat) tiles.push.apply(tiles, x.tiles); else tiles.push(x.tiles[1], x.tiles[2]); });
    });
    return MJ.shanten.countsOf(tiles);
  }

  /* リーチ者に対する安全牌：本人の捨て牌＋リーチ後に誰かが捨てて通った牌 */
  function safeKindsAgainst(m, seat) {
    const target = m.players[seat];
    const safe = {};
    target.discards.forEach(function (d) { safe[d.tile.kind] = true; });
    if (target.riichi || target.riichiPending) {
      m.players.forEach(function (p) {
        p.discards.forEach(function (d) { if (d.seq > target.riichiSeq) safe[d.tile.kind] = true; });
      });
    }
    return Object.keys(safe).map(Number);
  }

  /* CPU判断に渡す局面情報 */
  function contextFor(m, seat) {
    const p = m.players[seat];
    const lastWind = m.rules.matchLength === 'hanchan' ? 1 : 0;
    const rank = ranking(m).find(function (r) { return r.seat === seat; }).rank;
    return {
      level: p.cpuLevel || 1,
      seat: seat,
      seatWind: seatWind(m, seat),
      roundWind: roundWind(m),
      doraKinds: doraKinds(m),
      meldCount: p.melds.length,
      melds: p.melds,
      isMenzen: isMenzen(p),
      riichi: p.riichi,
      forbidKinds: p.kuikae.slice(),
      wallLeft: m.wall ? m.wall.live.length : 0,
      visible: m.wall ? visibleCounts(m, seat) : MJ.ukeire.zeros(),
      kuitan: m.rules.kuitan !== false,
      isAllLast: m.roundWindIndex === lastWind && m.handNumber === 4,
      rank: rank,
      scores: m.players.map(function (x) { return x.score; }),
      opponents: m.players.filter(function (x) { return x.seat !== seat; }).map(function (x) {
        return { seat: x.seat, riichi: x.riichi || x.riichiPending, melds: x.melds.length, safe: m.wall ? safeKindsAgainst(m, x.seat) : [] };
      })
    };
  }

  MJ.gameEngine = {
    WINDS: WINDS,
    WIND_KANJI: WIND_KANJI,
    SEAT_LABEL: SEAT_LABEL,
    PLAYER_DEFS: PLAYER_DEFS,
    RIICHI_COST: RIICHI_COST,
    createMatch: createMatch,
    decideDealer: decideDealer,
    startRound: startRound,
    seatWind: seatWind,
    roundWind: roundWind,
    roundLabel: roundLabel,
    doraKinds: doraKinds,
    uraIndicators: uraIndicators,
    isMenzen: isMenzen,
    current: current,
    canDraw: canDraw,
    draw: draw,
    canDiscard: canDiscard,
    discard: discard,
    chiOptions: chiOptions,
    respondCall: respondCall,
    canRiichi: canRiichi,
    ankanOptions: ankanOptions,
    kakanOptions: kakanOptions,
    canKyuushu: canKyuushu,
    turnOptions: turnOptions,
    declareAnkan: declareAnkan,
    declareKakan: declareKakan,
    declareKyuushu: declareKyuushu,
    notenPayments: notenPayments,
    isTenpai: isTenpai,
    peekNext: peekNext,
    nextRound: nextRound,
    ranking: ranking,
    tileTotal: tileTotal,
    visibleCounts: visibleCounts,
    safeKindsAgainst: safeKindsAgainst,
    contextFor: contextFor,
    scoreContext: scoreContext,
    waitsOf: waitsOf,
    furitenInfo: furitenInfo,
    tsumoResult: tsumoResult,
    ronResult: ronResult,
    declareTsumo: declareTsumo,
    respondRon: respondRon
  };
})(window.MJ = window.MJ || {});
