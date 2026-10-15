/*
 * 何切る問題データ。
 *
 * 牌は "123m406p11z" 形式（0＝赤5、z は 1〜7 が東南西北白發中）。
 * candidates の shanten / ukeire / ukeireCount は js/ukeire.js の計算結果と一致している必要がある
 * （tests/specs/questions.spec.js で検証）。手で数えず、次のコマンドの出力を使うこと：
 *   node tools/question-tool.js Q001
 * 残り枚数は「4 − 手牌14枚 − ドラ表示牌 − visible」で計算する。
 *
 * grade:
 *   best        最有力
 *   good        有力
 *   situational 目的によって選択可能
 *   improve     改善余地あり（候補に無い打牌もこの扱い）
 *
 * reviewed が false の問題は、画面に「確認中」と表示される。
 * 推奨打牌と解説は生成時点のもので、人によるレビューを経ていない。
 */
(function (MJ) {
  'use strict';

  MJ.QUESTIONS = [
    {
      id: 'Q001',
      title: '孤立した字牌から整理する',
      difficulty: 'easy',
      hand: '23456m78p345678s4z',
      seatWind: 'south',
      roundWind: 'east',
      doraIndicators: ['1p'],
      turn: 4,
      visible: '',
      situation: '',
      candidates: [
        { discard: '4z', grade: 'best', shanten: 1, ukeireCount: 37, ukeire: ['1m', '2m', '3m', '4m', '5m', '6m', '7m', '6p', '7p', '8p', '9p'],
          note: '役のない北を切れば、萬子の5連続形と78筒がすべて生きます。' },
        { discard: '2m', grade: 'improve', shanten: 1, ukeireCount: 17, ukeire: ['3m', '6m', '6p', '9p', '4z'],
          note: '23456萬は「受入の広い5連続形」。ここを崩すと受入が半分以下になります。' },
        { discard: '7p', grade: 'improve', shanten: 1, ukeireCount: 17, ukeire: ['1m', '4m', '7m', '8p', '4z'],
          note: '両面の78筒を崩すのは損です。' }
      ],
      yakuTargets: ['立直', '断么九（2萬・8筒の引きしだい）', '平和'],
      explanation: '一向聴です。北は自風でも場風でもない孤立牌で、残しても雀頭候補にしかなりません。北を切ると、萬子の23456（1〜7萬の7種）と78筒（6筒・9筒）を受け入れられ、受入は11種37枚と最大になります。',
      perspectives: {
        value: '北を残しても役になりません。平和・断么九が見える手です。',
        defense: '序盤なので守備の影響は小さいです。',
        shape: '5連続形と両面を残すのが基本です。',
        turn: '4巡目。受入を最大にして速度を優先します。',
        dora: 'ドラは2筒。手の内にはありません。',
        situation: '特記事項なし。'
      },
      supplement: '字牌の中でも、役牌（三元牌・自風・場風）は重ねれば役になるため、オタ風（役にならない風牌）より後に切るのが基本です。',
      reviewed: false,
      reviewerNote: '受入はテストで計算と照合済み。評価・解説は未レビュー。',
      lastUpdated: '2026-10-15'
    },
    {
      id: 'Q002',
      title: '受入が同じなら変化の多い牌を残す',
      difficulty: 'easy',
      hand: '45m678m23p567p39s55z',
      seatWind: 'west',
      roundWind: 'east',
      doraIndicators: ['7m'],
      turn: 5,
      visible: '',
      situation: '',
      candidates: [
        { discard: '9s', grade: 'best', shanten: 1, ukeireCount: 19, ukeire: ['3m', '6m', '9m', '1p', '4p'],
          note: '3索を残すと、1〜5索を引いたときに新しい塔子ができます。' },
        { discard: '3s', grade: 'good', shanten: 1, ukeireCount: 19, ukeire: ['3m', '6m', '9m', '1p', '4p'],
          note: '受入は同じですが、9索は7索・8索しかくっつかず、変化が少なくなります。' },
        { discard: '8m', grade: 'improve', shanten: 2, ukeireCount: 66, ukeire: ['2m', '3m', '4m', '5m', '6m', '7m', '8m', '9m', '1p', '4p', '1s', '2s', '3s', '4s', '5s', '7s', '8s', '9s', '5z'],
          note: 'ドラの8萬を含む完成面子を崩すと、二向聴に戻ります。' }
      ],
      yakuTargets: ['役牌（白）', '立直'],
      explanation: '一向聴で、浮いている牌は3索と9索です。どちらを切っても受入は5種19枚で同じです。そこで「次にくっつく牌が多いほう」を残します。3索は1〜5索の5種とくっつきますが、9索は7・8索の2種だけです。',
      perspectives: {
        value: '白の対子があり、重なれば役牌がつきます。ドラ8萬は面子に組み込み済みです。',
        defense: '9索は端牌で、後から安全牌になりやすい牌でもあります。守備を重視するなら3索切りも選べます。',
        shape: '3索のほうが、くっつきで好形の塔子に変わりやすい牌です。',
        turn: '5巡目。まだ手変わりを待てる巡目です。',
        dora: 'ドラは8萬（手の内に1枚、面子として使用中）。',
        situation: '特記事項なし。'
      },
      supplement: '孤立牌の価値は、おおむね「字牌 ＜ 1・9 ＜ 2・8 ＜ 3〜7」の順です。',
      reviewed: false,
      reviewerNote: '受入はテストで計算と照合済み。評価・解説は未レビュー。',
      lastUpdated: '2026-10-15'
    },
    {
      id: 'Q003',
      title: '弱い塔子はペンチャンから外す',
      difficulty: 'normal',
      hand: '12m456m46p34s789s11z',
      seatWind: 'east',
      roundWind: 'east',
      doraIndicators: ['9p'],
      turn: 6,
      visible: '',
      situation: '',
      candidates: [
        { discard: '1m', grade: 'best', shanten: 1, ukeireCount: 12, ukeire: ['5p', '2s', '5s'],
          note: 'ペンチャン（12萬）を外します。残した2萬は3萬・4萬を引くと塔子に戻ります。' },
        { discard: '2m', grade: 'good', shanten: 1, ukeireCount: 12, ukeire: ['5p', '2s', '5s'],
          note: '受入は同じですが、1萬を残すと変化が少なくなります。' },
        { discard: '6p', grade: 'situational', shanten: 1, ukeireCount: 12, ukeire: ['3m', '2s', '5s'],
          note: 'カンチャン落としでも受入は同じです。ただし46筒は3筒・7筒を引くと両面になるため、ペンチャンより価値があります。' },
        { discard: '3s', grade: 'improve', shanten: 1, ukeireCount: 8, ukeire: ['3m', '5p'],
          note: '両面の34索を崩すのは、受入が減るだけで得がありません。' }
      ],
      yakuTargets: ['役牌（ダブ東）', '立直'],
      explanation: '面子2つ・塔子3つ（12萬・46筒・34索）・雀頭の東で、ブロックが1つ多い一向聴です。いま受入が同じなのは「12萬を外す」と「46筒を外す」です。カンチャンの46筒は3筒・7筒を引けば両面に変わりますが、ペンチャンの12萬は好形に変わりにくいので、ペンチャンから外します。',
      perspectives: {
        value: '親でダブ東の対子。東を重ねれば2翻つきます。',
        defense: '序盤なので守備の影響は小さいです。',
        shape: 'ペンチャン ＜ カンチャン ＜ 両面。弱い塔子から外します。',
        turn: '6巡目。好形変化を待つ余裕があります。',
        dora: 'ドラは1筒。手の内にはありません。',
        situation: '親番です。'
      },
      supplement: 'ブロック（面子・塔子・雀頭）が6つあるときは、一番弱い塔子を1つ外して5ブロックにするのが基本です。',
      reviewed: false,
      reviewerNote: '受入はテストで計算と照合済み。評価・解説は未レビュー。',
      lastUpdated: '2026-10-15'
    },
    {
      id: 'Q004',
      title: 'カンチャン落としは端の牌から',
      difficulty: 'normal',
      hand: '23m567m34p678p55s79s',
      seatWind: 'north',
      roundWind: 'east',
      doraIndicators: ['2z'],
      turn: 7,
      visible: '',
      situation: '',
      candidates: [
        { discard: '9s', grade: 'best', shanten: 1, ukeireCount: 16, ukeire: ['1m', '4m', '2p', '5p'],
          note: '9索から外すと、残る7索は5〜9索とくっつき、断么九にも向かいます。' },
        { discard: '7s', grade: 'good', shanten: 1, ukeireCount: 16, ukeire: ['1m', '4m', '2p', '5p'],
          note: '受入は同じですが、9索が残ると断么九が崩れ、くっつきも少なくなります。' },
        { discard: '2m', grade: 'improve', shanten: 1, ukeireCount: 12, ukeire: ['2p', '5p', '8s'],
          note: '両面の23萬を崩し、カンチャンを残すのは損です。' },
        { discard: '5s', grade: 'improve', shanten: 2, ukeireCount: 44, ukeire: ['1m', '2m', '3m', '4m', '2p', '3p', '4p', '5p', '5s', '6s', '7s', '8s', '9s'],
          note: '雀頭を崩すと二向聴に戻ります。' }
      ],
      yakuTargets: ['断么九', '平和', '立直'],
      explanation: '両面が2つ（23萬・34筒）とカンチャンの79索、雀頭の55索があり、ブロックが1つ多い形です。両面2つを残してカンチャンを外すのが受入最大です。外すときは、断么九を残せて、残った牌のくっつきも多い9索から切ります。',
      perspectives: {
        value: '9索を切れば断么九が見えます（23萬の待ちのうち、1萬で和了ると断么九はつきません）。',
        defense: '9索・7索とも、後で安全牌として使える保証はありません。',
        shape: '両面2つ＋雀頭の、いわゆる理想形の一向聴です。',
        turn: '7巡目。好形の一向聴を作ってリーチを目指します。',
        dora: 'ドラは西。手の内にはありません。',
        situation: '特記事項なし。'
      },
      supplement: '塔子を外すときは「残った1枚がまだ役に立つか」まで考えると、切る順番が決まります。',
      reviewed: false,
      reviewerNote: '受入はテストで計算と照合済み。評価・解説は未レビュー。',
      lastUpdated: '2026-10-15'
    },
    {
      id: 'Q005',
      title: '七対子の単騎待ちを選ぶ',
      difficulty: 'normal',
      hand: '1199m44p66p3s55s77s7z',
      seatWind: 'south',
      roundWind: 'east',
      doraIndicators: ['6m'],
      turn: 9,
      visible: '3s',
      situation: '3索が1枚、他家の河に見えています。',
      candidates: [
        { discard: '3s', grade: 'best', shanten: 0, ukeireCount: 3, ukeire: ['7z'],
          note: '中単騎は残り3枚。字牌は手の内で使いにくく、他家から出やすい待ちです。' },
        { discard: '7z', grade: 'good', shanten: 0, ukeireCount: 2, ukeire: ['3s'],
          note: '3索単騎は残り2枚。数牌の中張牌は他家の手に組み込まれやすく、出にくい待ちです。' }
      ],
      yakuTargets: ['七対子', '立直'],
      explanation: '対子が6組あり、七対子の聴牌です。3索か中のどちらかを切って単騎待ちを選びます。中は1枚も見えておらず残り3枚、3索は1枚見えていて残り2枚です。枚数でも、他家からの出やすさでも、中単騎が有利です。',
      perspectives: {
        value: '七対子（2翻）。リーチをかければ打点が上がります。',
        defense: '中を残すと、聴牌まで中を抱えることになります。',
        shape: '七対子は単騎待ちなので、「残り枚数」と「出やすさ」で選びます。',
        turn: '9巡目。聴牌したのでリーチを考えます。',
        dora: 'ドラは7萬。手の内にはありません。',
        situation: '3索が1枚見えていることが判断材料です。'
      },
      supplement: '七対子では、字牌や端牌の単騎、他家が切っている牌の筋などが出やすい待ちとされます。',
      reviewed: false,
      reviewerNote: '受入はテストで計算と照合済み。評価・解説は未レビュー。',
      lastUpdated: '2026-10-15'
    },
    {
      id: 'Q006',
      title: 'ノベタンで待ちを広げる',
      difficulty: 'normal',
      hand: '234m678m345p3456s7z',
      seatWind: 'west',
      roundWind: 'east',
      doraIndicators: ['4z'],
      turn: 8,
      visible: '',
      situation: '',
      candidates: [
        { discard: '7z', grade: 'best', shanten: 0, ukeireCount: 6, ukeire: ['3s', '6s'],
          note: '3456索の「ノベタン」で、3索・6索の2種6枚待ちになります。' },
        { discard: '3s', grade: 'improve', shanten: 0, ukeireCount: 3, ukeire: ['7z'],
          note: '中の単騎は残り3枚。ノベタンの半分です。' },
        { discard: '2m', grade: 'improve', shanten: 1, ukeireCount: 16, ukeire: ['2m', '5m', '3s', '6s', '7z'],
          note: '聴牌を崩す理由はありません。' }
      ],
      yakuTargets: ['断么九（中を切った場合）', '立直'],
      explanation: '中を切ると、234萬・678萬・345筒に3456索が残ります。3456索は「345＋6」「3＋456」のどちらにも見られるため、3索と6索の両方で和了れます（ノベタン）。待ちは2種6枚で、中単騎（3枚）の倍です。しかも中を切れば断么九が確定します。',
      perspectives: {
        value: '中を切れば断么九確定。リーチと合わせて2翻以上になります。',
        defense: '聴牌なのでリーチして押す局面です。',
        shape: '4枚の連続形は、両端どちらでも和了れるノベタン待ちになります。',
        turn: '8巡目。聴牌したらすぐにリーチできます。',
        dora: 'ドラは東。手の内にはありません。',
        situation: '特記事項なし。'
      },
      supplement: 'ノベタンは単騎待ちの一種なので平和はつきません。',
      reviewed: false,
      reviewerNote: '受入はテストで計算と照合済み。評価・解説は未レビュー。',
      lastUpdated: '2026-10-15'
    },
    {
      id: 'Q007',
      title: '赤ドラを残すか、受入を取るか',
      difficulty: 'hard',
      hand: '23m456m78p0p345s789s',
      seatWind: 'north',
      roundWind: 'east',
      doraIndicators: ['4p'],
      turn: 6,
      visible: '',
      situation: '',
      candidates: [
        { discard: '8p', grade: 'best', shanten: 1, ukeireCount: 33, ukeire: ['1m', '2m', '3m', '4m', '5m', '6m', '7m', '5p', '6p', '7p'],
          note: '赤5筒（ドラ）を残したまま、受入は37枚から4枚しか減りません。' },
        { discard: '5p', grade: 'situational', shanten: 1, ukeireCount: 37, ukeire: ['1m', '2m', '3m', '4m', '5m', '6m', '7m', '6p', '7p', '8p', '9p'],
          note: '受入は最大ですが、赤ドラ＋ドラで2翻分を手放します。速度だけを求める場面なら選べます。' },
        { discard: '2m', grade: 'improve', shanten: 1, ukeireCount: 20, ukeire: ['3m', '6m', '5p', '6p', '8p', '9p'],
          note: '両面の23萬を崩すのは受入が大きく減ります。' }
      ],
      yakuTargets: ['立直', '平和（形しだい）', 'ドラ・赤ドラ'],
      explanation: 'ドラは5筒で、手の内の5筒は赤です。この1枚で2翻あります。受入だけなら赤5筒を切るのが最大（37枚）ですが、8筒を切って57筒のカンチャンと23萬を残しても33枚です。わずか4枚の差で2翻を残せるので、8筒切りが有力です。',
      perspectives: {
        value: '赤5筒はドラ兼赤ドラで2翻。リーチだけでも満貫が見えます。',
        defense: '序盤なので守備の影響は小さいです。',
        shape: '57筒はカンチャンですが、4筒・6筒・7筒の引きで好形になります。',
        turn: '6巡目。打点を残す価値が高い巡目です。',
        dora: 'ドラは5筒。手の内の赤5筒が該当します。',
        situation: '特記事項なし。'
      },
      supplement: '受入が少し減っても打点が大きく上がるなら、打点を取るほうが期待値が高いことが多いです。',
      reviewed: false,
      reviewerNote: '受入はテストで計算と照合済み。評価・解説は未レビュー。',
      lastUpdated: '2026-10-15'
    },
    {
      id: 'Q008',
      title: '混一色に向けて他色から切る',
      difficulty: 'hard',
      hand: '1245789s3m5p11556z',
      seatWind: 'east',
      roundWind: 'east',
      doraIndicators: ['8s'],
      turn: 3,
      visible: '',
      situation: '',
      candidates: [
        { discard: '5p', grade: 'best', shanten: 2, ukeireCount: 12, ukeire: ['3s', '6s', '1z', '5z'],
          note: '混一色に不要な他色の牌を切ります。' },
        { discard: '3m', grade: 'best', shanten: 2, ukeireCount: 12, ukeire: ['3s', '6s', '1z', '5z'],
          note: '5筒と同じく他色の牌です。どちらから切っても差はありません。' },
        { discard: '6z', grade: 'situational', shanten: 2, ukeireCount: 12, ukeire: ['3s', '6s', '1z', '5z'],
          note: '受入は同じですが、發は重なれば役牌になり、混一色とも矛盾しません。他色を先に切ります。' },
        { discard: '1z', grade: 'improve', shanten: 3, ukeireCount: 53, ukeire: ['1m', '2m', '3m', '4m', '5m', '3p', '4p', '5p', '6p', '7p', '3s', '6s', '1z', '5z', '6z'],
          note: 'ダブ東の対子を崩すのは大損です。' }
      ],
      yakuTargets: ['混一色', '役牌（ダブ東・白）', '一気通貫'],
      explanation: '親で、索子が7枚にダブ東と白の対子があります。混一色（門前3翻）とダブ東・白で、満貫〜跳満が見える手です。受入はどれを切っても同じなので、混一色に使えない3萬と5筒から切ります。發も索子・字牌の混一色に使えるので、残しておきます。',
      perspectives: {
        value: 'ダブ東・白・混一色・ドラ9索の可能性。高打点を目指す手です。',
        defense: '混一色は河が偏るため、他家に警戒されやすい点に注意します。',
        shape: '12索・45索・789索。3索・6索の引きで両面が完成します。',
        turn: '3巡目。染め手を目指すのに十分な巡目です。',
        dora: 'ドラは9索（手の内に1枚、789索で使用中）。',
        situation: '親番です。'
      },
      supplement: '染め手を狙うときは、受入が同じなら他色の牌から切ると、手が染まった後の受入が減りません。',
      reviewed: false,
      reviewerNote: '受入はテストで計算と照合済み。評価・解説は未レビュー。',
      lastUpdated: '2026-10-15'
    },
    {
      id: 'Q009',
      title: '愚形聴牌を取るか、好形を待つか',
      difficulty: 'hard',
      hand: '4556m234p678p35s99s',
      seatWind: 'south',
      roundWind: 'east',
      doraIndicators: ['3z'],
      turn: 5,
      visible: '',
      situation: '',
      candidates: [
        { discard: '5m', grade: 'best', shanten: 0, ukeireCount: 4, ukeire: ['4s'],
          note: '4索カンチャン待ちで聴牌し、すぐにリーチをかけます。' },
        { discard: '3s', grade: 'situational', shanten: 1, ukeireCount: 36, ukeire: ['3m', '4m', '5m', '6m', '7m', '3s', '4s', '5s', '6s', '7s', '9s'],
          note: '聴牌を取らずに4556萬を残し、両面以上の聴牌を目指す選択です。' },
        { discard: '5s', grade: 'situational', shanten: 1, ukeireCount: 36, ukeire: ['3m', '4m', '5m', '6m', '7m', '1s', '2s', '3s', '4s', '5s', '9s'],
          note: '3索切りと同じ考え方です。受入の牌の種類が少し違います。' }
      ],
      yakuTargets: ['立直', '平和（聴牌を取らずに両面で聴牌した場合）'],
      explanation: '5萬を切ればすぐに4索のカンチャン待ちで聴牌します（残り4枚）。一方、聴牌を取らずに3索か5索を切ると、4556萬の受入が広い一向聴（36枚）になり、次に両面待ちの聴牌になりやすくなります。5巡目なら「先制リーチの価値」が高く、愚形でもすぐリーチが有力とされることが多いですが、評価は人によって分かれる局面です。',
      perspectives: {
        value: 'リーチのみの手。聴牌を崩しても打点は大きく上がりません。',
        defense: '先にリーチをかければ、他家に受けを強いることができます。',
        shape: 'カンチャン待ちは4枚。待たずに好形にすれば和了率は上がりますが、聴牌が遅れます。',
        turn: '5巡目。早い巡目のリーチは、愚形でも有効とされます。',
        dora: 'ドラは北。手の内にはありません。',
        situation: '特記事項なし。'
      },
      supplement: '同じ局面でも、巡目・点数状況・他家の動きで正解が変わります。この問題は「目的によって選択可能」の判断を学ぶ問題です。',
      reviewed: false,
      reviewerNote: '受入はテストで計算と照合済み。評価は意見が分かれるため要レビュー。',
      lastUpdated: '2026-10-15'
    },
    {
      id: 'Q010',
      title: 'リーチを受けたら現物で手を進める',
      difficulty: 'hard',
      hand: '34m567m46p789p35s88s',
      seatWind: 'west',
      roundWind: 'east',
      doraIndicators: ['6z'],
      turn: 11,
      visible: '1m2z8s4p6s7m',
      situation: '下家がリーチ。下家の河：1萬・南・8索・4筒・6索・7萬（リーチ宣言牌）',
      candidates: [
        { discard: '4p', grade: 'best', shanten: 1, ukeireCount: 15, ukeire: ['2m', '5m', '8m', '4s'],
          note: '4筒はリーチ者の現物。安全に切りながら一向聴を保てます。' },
        { discard: '3s', grade: 'good', shanten: 1, ukeireCount: 15, ukeire: ['2m', '5m', '8m', '5p'],
          note: '6索が通っているので3索は筋。現物ほどではありませんが比較的安全です。' },
        { discard: '5s', grade: 'good', shanten: 1, ukeireCount: 15, ukeire: ['2m', '5m', '8m', '5p'],
          note: '8索が通っているので5索は片筋（2索との筋は未確認）。3索よりやや危険です。' },
        { discard: '8s', grade: 'situational', shanten: 2, ukeireCount: 45, ukeire: ['2m', '3m', '4m', '5m', '6m', '7m', '8m', '4p', '5p', '6p', '9p', '3s', '4s', '5s', '8s'],
          note: '8索の対子は現物で2巡安全ですが、二向聴に戻ります。完全に降りるときの選択です。' },
        { discard: '6p', grade: 'improve', shanten: 1, ukeireCount: 15, ukeire: ['2m', '5m', '8m', '4s'],
          note: '受入は同じでも、6筒は無筋の危険牌です。' },
        { discard: '9p', grade: 'improve', shanten: 1, ukeireCount: 15, ukeire: ['2m', '5m', '8m', '4s'],
          note: '受入は同じでも、9筒は無筋です。' },
        { discard: '3m', grade: 'improve', shanten: 1, ukeireCount: 8, ukeire: ['5p', '4s'],
          note: '受入が減るうえ、3萬も安全ではありません。' }
      ],
      yakuTargets: ['立直（追っかけ）', '断么九（形しだい）'],
      explanation: '11巡目に下家からリーチを受けました。自分は一向聴で、4筒・6筒・9筒・3索・5索のどれを切っても受入は15枚で同じです。その中で4筒はリーチ者の河にある「現物」で、ロンされることがありません。受入を落とさずに安全に打てる4筒が最有力です。',
      perspectives: {
        value: 'リーチのみの見込み。無理に押すほどの打点はありません。',
        defense: '現物（4筒・8索）＞筋（3索、片筋の5索）＞無筋（6筒・9筒など）の順に安全です。',
        shape: '一向聴で、受入が同じ牌が5種類あります。',
        turn: '11巡目。残りの巡目は少なく、聴牌しても和了れる保証はありません。',
        dora: 'ドラは中。手の内にはありません。',
        situation: '下家のリーチ。現物は1萬・南・8索・4筒・6索・7萬です。',
      },
      supplement: 'CPU四人麻雀のCPUレベル3も、この問題と同じ「現物・字牌・筋・壁」の簡易評価で押し引きを判断しています。',
      reviewed: false,
      reviewerNote: '受入はテストで計算と照合済み。安全度の説明は未レビュー。',
      lastUpdated: '2026-10-15'
    }
  ];

  MJ.QUESTION_GRADES = {
    best: { label: '最有力', mark: '◎', rank: 3 },
    good: { label: '有力', mark: '○', rank: 2 },
    situational: { label: '目的によって選択可能', mark: '△', rank: 1 },
    improve: { label: '改善余地あり', mark: '✕', rank: 0 }
  };

  MJ.QUESTION_DIFFICULTY = {
    easy: '初級',
    normal: '中級',
    hard: '上級'
  };

  MJ.PERSPECTIVE_LABELS = {
    value: '打点',
    defense: '守備力',
    shape: '形の良さ',
    turn: '巡目',
    dora: 'ドラ',
    situation: '場況'
  };
})(window.MJ = window.MJ || {});
