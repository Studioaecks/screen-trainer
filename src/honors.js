// Screen Trainer — marks, ribbons and badges: small honours that use the mark, ribbon and badge sprites.
//   mark   — one per Pokémon, decided when it is caught (time of day on your clock, weather, luck, alpha ...)
//   ribbon — earned by a Pokémon for what it achieves on your team
//   badge  — earned by you, the trainer, for milestones
// Rules only; game.js announces them and the Pokédex window shows them.
'use strict';

const Honors = (() => {
  const MARKS = {
    'alpha-mark': 'the Alpha', 'rare-mark': 'the Recluse', 'uncommon-mark': 'the Sociable', 'jumbo-mark': 'the Great', 'mini-mark': 'the Teeny',
    'lunchtime-mark': 'the Peckish', 'sleepy-time-mark': 'the Sleepy', 'dusk-mark': 'the Dozy', 'dawn-mark': 'the Early Riser',
    'rainy-mark': 'the Sodden', 'sandstorm-mark': 'the Sandswept', 'snowy-mark': 'the Snow Frolicker', 'blizzard-mark': 'the Shivering', 'dry-mark': 'the Parched',
    'rowdy-mark': 'the Rowdy', 'absent-minded-mark': 'the Spacey', 'jittery-mark': 'the Anxious', 'excited-mark': 'the Giddy', 'charismatic-mark': 'the Radiant', 'calmness-mark': 'the Serene',
    'intense-mark': 'the Feisty', 'zoned-out-mark': 'the Daydreamer', 'joyful-mark': 'the Joyful', 'angry-mark': 'the Furious', 'smiley-mark': 'the Beaming', 'teary-mark': 'the Teary-Eyed',
    'upbeat-mark': 'the Chipper', 'peeved-mark': 'the Grumpy', 'intellectual-mark': 'the Scholar', 'ferocious-mark': 'the Rampaging', 'crafty-mark': 'the Opportunist', 'scowling-mark': 'the Stern',
    'kindly-mark': 'the Kindhearted', 'flustered-mark': 'the Easily Flustered', 'pumped-up-mark': 'the Driven', 'zero-energy-mark': 'the Apathetic', 'prideful-mark': 'the Arrogant',
    'unsure-mark': 'the Reluctant', 'humble-mark': 'the Humble', 'thorny-mark': 'the Pompous', 'vigor-mark': 'the Lively', 'slump-mark': 'the Worn-Out',
  };
  const PERSONALITY = Object.keys(MARKS).slice(14);
  const WEATHER = { rain: 'rainy-mark', sand: 'sandstorm-mark', snow: 'snowy-mark', hail: 'blizzard-mark', sun: 'dry-mark' };
  const label = (key) => key.replace(/-mark$|-ribbon$/, '').split('-').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ') + (key.endsWith('-mark') ? ' Mark' : ' Ribbon');

  /** the mark a freshly caught creature carries, or null (most have none) */
  function markFor(mon, ctx = {}) {
    if (mon.alpha) return 'alpha-mark';
    if (U.chance(1 / 400)) return 'rare-mark';
    if (ctx.weather && WEATHER[ctx.weather] && U.chance(0.5)) return WEATHER[ctx.weather];
    const bySize = typeof Size !== 'undefined' ? Size.markFor(mon) : null;       // the very largest and the very smallest
    if (bySize) return bySize;
    if (U.chance(1 / 30)) return 'uncommon-mark';
    if (U.chance(1 / 12)) { const h = ctx.hour === undefined ? new Date().getHours() : ctx.hour; return h >= 20 || h < 5 ? 'sleepy-time-mark' : h < 10 ? 'dawn-mark' : h < 16 ? 'lunchtime-mark' : 'dusk-mark'; }
    if (U.chance(1 / 25)) return U.pick(PERSONALITY);
    return null;
  }

  const RIBBONS = [
    { k: 'training-ribbon', text: 'Reached level 50.', test: (m) => m.lvl >= 50 },
    { k: 'effort-ribbon', text: 'Reached level 100.', test: (m) => m.lvl >= 100 },
    { k: 'best-friends-ribbon', text: 'Reached five hearts of affection.', test: (m) => (m.aff || 0) >= 255 },
    { k: 'footprint-ribbon', text: 'Grew thirty levels at your side.', test: (m) => typeof m.metLvl === 'number' && m.lvl - m.metLvl >= 30 },
    { k: 'skillful-battler-ribbon', text: 'Took part in 100 wins.', test: (m) => (m.wins || 0) >= 100 },
    { k: 'expert-battler-ribbon', text: 'Took part in 500 wins.', test: (m) => (m.wins || 0) >= 500 },
    { k: 'champion-ribbon', text: 'Led the team to leadership level 10.', test: (m) => Mon.leadLevel(m) >= 10 },
  ];
  /** ribbons this creature has just earned (added to m.rb) */
  function checkRibbons(m) {
    const got = [];
    for (const r of RIBBONS) if (!(m.rb || []).includes(r.k) && r.test(m)) { (m.rb = m.rb || []).push(r.k); got.push(r); }
    return got;
  }

  const species = (sv) => Object.keys(sv.dex.caught).length;
  const anyone = (sv, fn) => [...sv.team, ...sv.box].some(fn);
  // id = picture number in sprites/badges
  const BADGES = [
    { id: 1, n: 'Boulder Badge', text: 'Catch your first partner.', test: (sv) => sv.stats.caught >= 1 },
    { id: 2, n: 'Cascade Badge', text: 'Catch 10 different species.', test: (sv) => species(sv) >= 10 },
    { id: 3, n: 'Thunder Badge', text: 'Fill your team with six partners.', test: (sv) => sv.team.length >= 6 },
    { id: 4, n: 'Rainbow Badge', text: 'Catch 30 different species.', test: (sv) => species(sv) >= 30 },
    { id: 5, n: 'Soul Badge', text: 'Reach five hearts with a partner.', test: (sv) => anyone(sv, (m) => (m.aff || 0) >= 255) },
    { id: 6, n: 'Marsh Badge', text: 'Catch a shiny Pokémon.', test: (sv) => sv.stats.shiny >= 1 },
    { id: 7, n: 'Volcano Badge', text: 'Catch an alpha Pokémon.', test: (sv) => (sv.stats.alpha || 0) >= 1 },
    { id: 8, n: 'Earth Badge', text: 'Raise a leader to leadership level 5.', test: (sv) => anyone(sv, (m) => Mon.leadLevel(m) >= 5) },
    { id: 9, n: 'Zephyr Badge', text: 'Catch 75 different species.', test: (sv) => species(sv) >= 75 },
    { id: 10, n: 'Hive Badge', text: 'Find 20 different items.', test: (sv) => Object.keys(sv.stats.found || {}).length >= 20 },
    { id: 11, n: 'Plain Badge', text: 'Catch 150 different species.', test: (sv) => species(sv) >= 150 },
    { id: 12, n: 'Fog Badge', text: 'Catch a legendary Pokémon.', test: (sv) => (sv.stats.legend || 0) >= 1 },
    { id: 13, n: 'Storm Badge', text: 'Raise all six team members to level 50.', test: (sv) => sv.team.length >= 6 && sv.team.every((m) => m.lvl >= 50) },
    { id: 14, n: 'Mineral Badge', text: 'Raise a partner to level 100.', test: (sv) => anyone(sv, (m) => m.lvl >= 100) },
    { id: 15, n: 'Glacier Badge', text: 'Catch 300 different species.', test: (sv) => species(sv) >= 300 },
    { id: 16, n: 'Rising Badge', text: 'Raise a leader to leadership level 10.', test: (sv) => anyone(sv, (m) => Mon.leadLevel(m) >= 10) },
  ];
  // Since 0.6 a badge is won from its Gym Leader (src/rivals.js), in this order as in the games. The task in `test` is
  // what makes that leader come: the next badge you do not have, once its task is done.
  const LEADER = [null, 'Brock', 'Misty', 'Lt. Surge', 'Erika', 'Koga', 'Sabrina', 'Blaine', 'Giovanni', 'Falkner', 'Bugsy', 'Whitney', 'Morty', 'Chuck', 'Jasmine', 'Pryce', 'Clair'];
  /** the badge whose Gym Leader may come next, or null */
  const nextGym = (sv) => { const b = BADGES.find((x) => !(sv.badges || {})[x.id]); try { return b && b.test(sv) ? b : null; } catch (e) { return null; } };
  /** badges just earned (recorded in save.badges) */
  function checkBadges(sv) {
    const got = [];
    sv.badges = sv.badges || {};
    // (until 0.5 a badge was given here as soon as its task was done; now its Gym Leader has to be beaten)
    return got;
  }
  const badgeView = (sv) => BADGES.map((b) => ({ id: b.id, name: b.n, leader: LEADER[b.id], text: `${b.text} Then beat Gym Leader ${LEADER[b.id]}, who comes by for a battle once that is done and you hold the badges before this one.`, earned: (sv.badges || {})[b.id] || 0, icon: Sprites.badge(b.id), retry: (sv.gymRetry | 0) === b.id && !(sv.badges || {})[b.id] }));
  const monView = (m) => ({
    mark: m.mark ? { key: m.mark, name: label(m.mark), title: MARKS[m.mark] || '', icon: Sprites.mark(m.mark) } : null,
    ribbons: (m.rb || []).map((k) => { const r = RIBBONS.find((x) => x.k === k); return { key: k, name: label(k), text: r ? r.text : '', icon: Sprites.ribbon(k) }; }),
  });

  return { MARKS, RIBBONS, BADGES, LEADER, nextGym, markFor, checkRibbons, checkBadges, badgeView, monView, label };
})();
