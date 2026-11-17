// Screen Trainer — items: the catalogue, rare drops from wild Pokémon, the Bag, medicine, evolution items,
// special balls and held items. Rules only (no drawing): game.js shows the drops, battle.js calls the hooks.
//
// An item definition:  { n: name, tier: 1 common .. 4 very rare, text, use?, hold?, ball? }
//   use  — what happens when it is used on a team member from the Bag (see USE below)
//   hold — what it does while a team member holds it (see the hook functions at the bottom)
//   ball — a ball that is found and used up: { mult(wild, ctx) } catch-rate multiplier
// To add an item: add one line to the tables below. Its picture is sprites/items/<key>.png.
//
// Balls (since 0.4): the plain Poké Ball is the standard ball, unlimited and always there. Every better ball is
// found, and a find is a whole stack of BALL_STACK (10 to 100). The stack is used for the following throws until it
// runs out; then the throws go back to the plain Poké Ball, or to the next stack waiting in the Bag.
'use strict';

const Items = (() => {
  const D = DATA, X = typeof DATA_EXTRA !== 'undefined' ? DATA_EXTRA : { itemNames: {}, itemEvo: {}, wildItems: {}, dex: {} };
  const C = {};
  const pretty = (k) => k.split('-').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');
  const def = (key, tier, text, o) => { C[key] = Object.assign({ k: key, n: X.itemNames[key] || pretty(key), tier, text }, o); };

  // ---------------------------------------------------------------- medicine and other things you use
  for (const [k, t, hp] of [['potion', 1, 20], ['fresh-water', 1, 30], ['soda-pop', 1, 50], ['lemonade', 2, 70], ['super-potion', 2, 60], ['moomoo-milk', 2, 100], ['hyper-potion', 3, 120]]) def(k, t, `Restores ${hp} HP.`, { use: { type: 'heal', hp } });
  def('max-potion', 3, 'Restores all HP.', { use: { type: 'heal', pct: 1 } });
  def('full-restore', 4, 'Restores all HP and cures any status condition.', { use: { type: 'heal', pct: 1, cure: 'all' } });
  def('revive', 2, 'Revives a fainted partner with half its HP.', { use: { type: 'revive', pct: 0.5 } });
  def('max-revive', 3, 'Revives a fainted partner with all its HP.', { use: { type: 'revive', pct: 1 } });
  def('sacred-ash', 4, 'Revives a fainted partner with all its HP.', { use: { type: 'revive', pct: 1 } });
  def('full-heal', 2, 'Cures any status condition.', { use: { type: 'cure', st: 'all' } });
  for (const [k, st, word] of [['antidote', 'psn', 'poison'], ['burn-heal', 'brn', 'a burn'], ['ice-heal', 'frz', 'freezing'], ['awakening', 'slp', 'sleep'], ['paralyze-heal', 'par', 'paralysis']]) def(k, 1, `Cures ${word}.`, { use: { type: 'cure', st } });
  def('rare-candy', 3, 'Raises a partner by one level.', { use: { type: 'level' } });
  for (const [k, t, xp] of [['exp-candy-xs', 1, 100], ['exp-candy-s', 2, 800], ['exp-candy-m', 2, 3000], ['exp-candy-l', 3, 10000], ['exp-candy-xl', 4, 30000]]) def(k, t, `Gives ${xp.toLocaleString('en-US')} experience.`, { use: { type: 'xp', xp } });
  def('bottle-cap', 3, 'Hyper training: raises a partner\'s weakest individual strength to its best.', { use: { type: 'ivs', all: false } });
  def('gold-bottle-cap', 4, 'Hyper training: raises all of a partner\'s individual strengths to their best.', { use: { type: 'ivs', all: true } });
  D.natures.forEach((nat, i) => { const k = nat.n.toLowerCase() + '-mint'; if (X.itemNames[k]) def(k, 3, `Changes a partner's nature to ${nat.n}. Nature also decides leadership aptitude.`, { use: { type: 'nature', nat: i } }); });

  // ---------------------------------------------------------------- berries: eaten from the Bag, or by themselves when held
  for (const [k, t, o, text] of [
    ['oran-berry', 1, { hp: 10 }, 'Restores 10 HP. Held: eaten when HP drops to half.'], ['sitrus-berry', 2, { pct: 0.25 }, 'Restores a quarter of HP. Held: eaten when HP drops to half.'],
    ['lum-berry', 2, { cure: 'all' }, 'Cures any status condition. Held: eaten as soon as one strikes.'], ['cheri-berry', 1, { cure: 'par' }, 'Cures paralysis. Held: eaten as soon as it strikes.'],
    ['chesto-berry', 1, { cure: 'slp' }, 'Cures sleep. Held: eaten as soon as it strikes.'], ['pecha-berry', 1, { cure: 'psn' }, 'Cures poison. Held: eaten as soon as it strikes.'],
    ['rawst-berry', 1, { cure: 'brn' }, 'Cures a burn. Held: eaten as soon as it strikes.'], ['aspear-berry', 1, { cure: 'frz' }, 'Thaws a frozen partner. Held: eaten as soon as it strikes.'],
    ['persim-berry', 1, { cure: 'conf' }, 'Cures confusion. Held: eaten as soon as it strikes.'], ['berry-juice', 1, { hp: 20 }, 'Restores 20 HP. Held: drunk when HP drops to half.'],
  ]) def(k, t, text, { use: o.cure && !o.hp && !o.pct ? { type: 'cure', st: o.cure } : { type: 'heal', hp: o.hp, pct: o.pct }, hold: { berry: o } });

  // ---------------------------------------------------------------- held items
  const TYPE_ITEM = { 'silk-scarf': 'normal', 'black-belt': 'fighting', 'sharp-beak': 'flying', 'poison-barb': 'poison', 'soft-sand': 'ground', 'hard-stone': 'rock', 'silver-powder': 'bug', 'spell-tag': 'ghost', 'metal-coat': 'steel',
    charcoal: 'fire', 'mystic-water': 'water', 'miracle-seed': 'grass', magnet: 'electric', 'twisted-spoon': 'psychic', 'never-melt-ice': 'ice', 'dragon-fang': 'dragon', 'black-glasses': 'dark', 'fairy-feather': 'fairy', 'pixie-plate': 'fairy' };
  for (const k in TYPE_ITEM) def(k, 2, `Held: ${TYPE_ITEM[k][0].toUpperCase() + TYPE_ITEM[k].slice(1)}-type moves hit 20% harder.`, { hold: { boost: TYPE_ITEM[k] } });
  def('leftovers', 3, 'Held: restores a little HP every few seconds in battle.', { hold: { regen: 1 / 16 } });
  def('shell-bell', 3, 'Held: restores HP equal to an eighth of the damage dealt.', { hold: { drain: 1 / 8 } });
  def('lucky-egg', 4, 'Held: earns 50% more experience.', { hold: { xp: 1.5 } });
  def('exp-share', 3, 'Held: earns full experience even without joining the fight.', { hold: { share: true } });
  def('soothe-bell', 3, 'Held: affection grows twice as fast.', { hold: { aff: 2 } });
  def('scope-lens', 3, 'Held: lands critical hits more often.', { hold: { crit: 2 } });
  def('razor-claw', 3, 'Held: lands critical hits more often.', { hold: { crit: 2 } });
  def('quick-claw', 2, 'Held: attacks a little more often.', { hold: { haste: 0.85 } });
  def('focus-band', 2, 'Held: sometimes hangs on with 1 HP.', { hold: { endure: 0.1 } });
  def('focus-sash', 3, 'Held: survives one knockout blow from full HP, then is used up.', { hold: { sash: true } });
  def('bright-powder', 2, 'Held: attacks miss the holder a little more often.', { hold: { evade: 0.9 } });
  def('lax-incense', 2, 'Held: attacks miss the holder a little more often.', { hold: { evade: 0.9 } });
  def('wide-lens', 2, 'Held: moves are a little more accurate.', { hold: { acc: 1.1 } });
  def('muscle-band', 2, 'Held: physical moves hit 10% harder.', { hold: { phys: 1.1 } });
  def('wise-glasses', 2, 'Held: special moves hit 10% harder.', { hold: { spec: 1.1 } });
  def('expert-belt', 3, 'Held: super-effective moves hit 20% harder.', { hold: { expert: 1.2 } });
  def('life-orb', 4, 'Held: moves hit 30% harder, at the cost of some HP each hit.', { hold: { orb: 1.3 } });
  def('rocky-helmet', 3, 'Held: attackers that make contact get hurt.', { hold: { helmet: 1 / 6 } });
  def('eviolite', 3, 'Held: a partner that can still evolve takes a third less damage.', { hold: { eviolite: 1.5 } });
  def('kings-rock', 3, 'Held: hits may make the target flinch.', { hold: { flinch: 0.1 } });
  def('razor-fang', 3, 'Held: hits may make the target flinch.', { hold: { flinch: 0.1 } });
  def('everstone', 2, 'Held: the holder does not evolve.', { hold: { everstone: true } });
  def('amulet-coin', 3, 'Held: wild Pokémon leave items behind twice as often.', { hold: { luck: 2 } });
  def('luck-incense', 3, 'Held: wild Pokémon leave items behind twice as often.', { hold: { luck: 2 } });
  def('black-sludge', 2, 'Held: restores HP for Poison types, hurts everyone else.', { hold: { sludge: true } });
  def('smoke-ball', 2, 'Held: wild Pokémon are slower to pick a fight with the holder.', { hold: {} });
  // species items
  const only = (key, tier, species, text, hold) => def(key, tier, text, { hold: Object.assign({ only: species }, hold) });
  only('light-ball', 3, [25], 'Held by Pikachu: doubles Attack and Sp. Atk.', { phys: 2, spec: 2 });
  only('thick-club', 3, [104, 105], 'Held by Cubone or Marowak: doubles Attack.', { phys: 2 });
  only('stick', 2, [83, 865], 'Held by Farfetch\'d: lands critical hits far more often.', { crit: 4 });
  only('lucky-punch', 2, [113], 'Held by Chansey: lands critical hits far more often.', { crit: 4 });
  only('deep-sea-tooth', 3, [366], 'Held by Clamperl: doubles Sp. Atk.', { spec: 2 });
  only('deep-sea-scale', 3, [366], 'Held by Clamperl: doubles Sp. Def.', { spdef: 2 });
  only('metal-powder', 2, [132], 'Held by Ditto: raises Defense.', { pdef: 1.5 });
  only('soul-dew', 4, [380, 381], 'Held by Latias or Latios: Psychic and Dragon moves hit 20% harder.', { boost2: ['psychic', 'dragon'] });

  // ---------------------------------------------------------------- balls you find (the plain Poké Ball is the standard one and needs no entry)
  const ball = (key, tier, text, mult, extra) => def(key, tier, text, { ball: Object.assign({ mult }, extra) });
  ball('great-ball', 2, 'A good ball: half again as likely to catch as a Poké Ball.', () => 1.5);
  ball('ultra-ball', 3, 'A high-performance ball: twice as likely to catch as a Poké Ball.', () => 2);
  ball('master-ball', 4, 'Catches any wild Pokémon without fail.', () => 255);
  ball('quick-ball', 2, 'Works best on a Pokémon that has only just appeared.', (w, c) => (c.age < 12 ? 5 : 1));
  ball('dusk-ball', 2, 'Works best at night (8 pm to 6 am on your clock).', (w, c) => (c.hour >= 20 || c.hour < 6 ? 3 : 1));
  ball('net-ball', 2, 'Works best on Water and Bug types.', (w, c) => (c.types.includes('water') || c.types.includes('bug') ? 3.5 : 1));
  ball('dive-ball', 2, 'Works best on Water types.', (w, c) => (c.types.includes('water') ? 3.5 : 1));
  ball('nest-ball', 2, 'Works best on low-level Pokémon.', (w) => Math.max(1, Math.min(4, (41 - w.lvl) / 10)));
  ball('repeat-ball', 2, 'Works best on species you have caught before.', (w, c) => (c.caughtBefore ? 3.5 : 1));
  ball('timer-ball', 2, 'Works better the longer the Pokémon has been around.', (w, c) => Math.min(4, 1 + c.age / 30));
  ball('fast-ball', 2, 'Works best on fast Pokémon.', (w) => (D.dex[w.sp].s[5] >= 100 ? 4 : 1));
  ball('level-ball', 2, 'Works best when your leader far out-levels the target.', (w, c) => (c.leaderLvl >= w.lvl * 4 ? 8 : c.leaderLvl >= w.lvl * 2 ? 4 : c.leaderLvl > w.lvl ? 2 : 1));
  ball('heavy-ball', 2, 'Works best on heavy Pokémon.', (w) => { const kg = ((X.dex[w.sp] || [0, 0, 0])[2] || 0) / 10; return kg >= 300 ? 4 : kg >= 200 ? 2.5 : kg >= 100 ? 1.5 : 1; });
  ball('moon-ball', 2, 'Works best on Pokémon that evolve with a Moon Stone.', (w) => ((X.itemEvo['moon-stone'] || []).some((e) => e[0] === w.sp) ? 4 : 1));
  ball('dream-ball', 3, 'Works best on sleeping Pokémon.', (w) => (w.st === 'slp' ? 4 : 1));
  ball('luxury-ball', 3, 'A comfortable ball: the Pokémon starts out fonder of you and warms up faster.', () => 1, { aff: 120 });
  ball('friend-ball', 3, 'The Pokémon starts out very fond of you.', () => 1, { aff: 150 });
  ball('heal-ball', 2, 'Fully heals the Pokémon it catches.', () => 1, { heal: true });
  ball('premier-ball', 1, 'A rare ball made to mark an occasion. Works like a Poké Ball.', () => 1);

  // ---------------------------------------------------------------- evolution items (from the data set)
  for (const key in X.itemEvo) {
    const names = [...new Set(X.itemEvo[key].map((e) => D.dex[e[0]] && D.dex[e[0]].n).filter(Boolean))];
    const text = `Evolves ${names.slice(0, 4).join(', ')}${names.length > 4 ? ' and others' : ''}.`;
    if (C[key]) { C[key].use = { type: 'evo' }; C[key].text = text + ' ' + C[key].text; } else def(key, key.endsWith('-stone') ? 3 : 3, text, { use: { type: 'evo' } });
  }

  // ---------------------------------------------------------------- treasures: give one to a partner as a gift
  for (const [k, t, aff] of [['tiny-mushroom', 1, 3], ['big-mushroom', 2, 6], ['honey', 1, 5], ['pearl', 1, 4], ['big-pearl', 2, 8], ['stardust', 1, 4], ['star-piece', 2, 9], ['nugget', 3, 12], ['big-nugget', 4, 25], ['heart-scale', 2, 10],
    ['rare-bone', 2, 8], ['comet-shard', 4, 25], ['pretty-wing', 1, 3], ['balm-mushroom', 3, 14], ['pearl-string', 3, 16], ['shoal-shell', 1, 3], ['shoal-salt', 1, 3], ['red-shard', 1, 3], ['blue-shard', 1, 3], ['yellow-shard', 1, 3],
    ['green-shard', 1, 3], ['relic-copper', 2, 6], ['relic-silver', 3, 12], ['relic-gold', 4, 22], ['poke-doll', 2, 10], ['fluffy-tail', 2, 10], ['sweet-heart', 1, 6], ['lava-cookie', 2, 8], ['old-gateau', 2, 8], ['casteliacone', 2, 8],
    ['rage-candy-bar', 2, 8], ['lumiose-galette', 2, 8], ['shalour-sable', 2, 8], ['big-malasada', 2, 8], ['pewter-crunchies', 2, 8]]) def(k, t, 'A treasure. Give it to a partner as a gift to raise affection.', { use: { type: 'gift', aff } });

  /** definition of any item, including things only wild Pokémon carry (treated as small treasures) */
  const get = (key) => C[key] || (X.itemNames[key] ? (C[key] = { k: key, n: X.itemNames[key], tier: 2, text: 'A curio. Give it to a partner as a gift to raise affection.', use: { type: 'gift', aff: 4 } }) : null);
  const name = (key) => { const d = get(key); return d ? d.n : pretty(key); };
  const holdOf = (m) => { const d = m && m.item && C[m.item]; return d && d.hold && (!d.hold.only || d.hold.only.includes(m.sp)) ? d.hold : null; };

  // ---------------------------------------------------------------- drops
  // How rare things are. DROP is the chance that a beaten / caught wild creature leaves anything at all;
  // TIER_WEIGHT then decides how good it is (common, uncommon, rare, very rare).
  const DROP = { beaten: 0.03, caught: 0.05, horde: 0.02, alpha: 0.6, carried: 0.2 };
  const TIER_WEIGHT = [0, 68, 24, 7, 1];
  // Balls: BALL_FIND is the share of finds that are a stack of balls instead of an item; BALL_WEIGHT says which ball
  // (`other` is shared evenly among the remaining special balls); BALL_STACK is how many one find holds.
  const BALL_FIND = 0.3;
  const BALL_WEIGHT = { 'great-ball': 50, 'ultra-ball': 22, 'master-ball': 1, other: 27 };
  const BALL_STACK = [10, 100];
  let pools = null, ballPool = null;
  function pool(tier) {
    if (!pools) { pools = [[], [], [], [], []]; for (const k in C) if (!C[k].ball && (Sprites.item(k) || !Sprites.ready())) pools[C[k].tier].push(k); }
    return pools[tier];
  }
  const resetPools = () => { pools = null; ballPool = null; };
  /** a ball to find: weighted by BALL_WEIGHT, never below minTier */
  function randomBall(minTier = 1) {
    if (!ballPool) ballPool = Object.keys(C).filter((k) => C[k].ball && (Sprites.item(k) || !Sprites.ready()));
    const list = ballPool.filter((k) => C[k].tier >= minTier);
    if (!list.length) return null;
    const others = list.filter((k) => !(k in BALL_WEIGHT)).length || 1;
    return U.wpick(list, (k) => (k in BALL_WEIGHT ? BALL_WEIGHT[k] : BALL_WEIGHT.other / others));
  }
  /** how many balls one find holds: 10 to 100, but only 1 to 10 of the Master Ball (BALL_STACK_OF) */
  const BALL_STACK_OF = { 'master-ball': [1, 10] };
  const ballStack = (key) => { const r = BALL_STACK_OF[key] || BALL_STACK; return r[0] + U.rint(r[1] - r[0] + 1); };
  function randomItem(minTier = 1) {
    const tiers = [1, 2, 3, 4].filter((t) => t >= minTier && pool(t).length);
    if (!tiers.length) return null;
    return U.pick(pool(U.wpick(tiers, (t) => TIER_WEIGHT[t])));
  }
  /** what a beaten or caught wild creature leaves behind: a list of item keys, usually empty.
   *  ctx: { caught, alpha, shiny, legend, horde, luck } */
  function rollDrops(mon, ctx = {}) {
    const out = [], luck = ctx.luck || 1;
    // the item this species is known to carry in the games, at a fraction of its listed chance
    for (const [k, pct] of X.wildItems[mon.sp] || []) if (k !== 'poke-ball' && get(k) && U.chance(Math.min(0.3, (pct / 100) * DROP.carried) * luck)) { out.push(k); break; }
    const sure = ctx.shiny || ctx.legend, minTier = ctx.legend ? 3 : ctx.shiny || ctx.alpha ? 2 : 1;
    const chance = ctx.alpha ? DROP.alpha : ctx.caught ? DROP.caught : ctx.horde ? DROP.horde : DROP.beaten;
    if (sure || U.chance(chance * luck)) { const k = (U.chance(BALL_FIND) && randomBall(minTier)) || randomItem(minTier); if (k) out.push(k); }
    return out.slice(0, 2);
  }
  /** item-drop luck of the team (Amulet Coin / Luck Incense) */
  const teamLuck = (team) => (team.some((m) => { const h = holdOf(m); return h && h.luck; }) ? 2 : 1);

  // ---------------------------------------------------------------- the Bag
  const bag = () => (G.save.bag = G.save.bag || {});
  const count = (key) => bag()[key] || 0;
  function add(key, n = 1) {
    const d = get(key);
    if (!d) return false;
    const b = bag(); b[key] = Math.min(9999, (b[key] || 0) + n);
    const st = G.save.stats; st.items = (st.items || 0) + (d.ball ? 1 : n); (st.found = st.found || {})[key] = 1;     // a stack of balls is one find
    if (d.ball && !equippedBall()) G.save.ball = key;                // found balls are used for the next throws
    G.touch();
    return true;
  }
  function take(key, n = 1) {
    const b = bag();
    if (!(b[key] >= n)) return false;
    b[key] -= n;
    if (b[key] <= 0) { delete b[key]; if (G.save.ball === key) { const next = nextStack(); G.save.ball = next ? next.k : ''; } }
    G.touch();
    return true;
  }
  /** the stack that takes over when the equipped one runs out: the most ordinary first, so the best are kept longest */
  function nextStack() {
    const b = bag(), list = Object.keys(b).filter((k) => b[k] > 0 && C[k] && C[k].ball);
    if (!list.length) return null;
    list.sort((x, y) => C[x].tier - C[y].tier || b[y] - b[x] || (x < y ? -1 : 1));
    return C[list[0]];
  }

  const cures = (st, m, conf) => (st === 'all' ? !!m.st || conf : st === 'conf' ? conf : m.st === st);
  /** can this item be used on this creature right now?  actor is its on-screen actor, if it has one */
  function canUse(key, m, actor) {
    const d = get(key), u = d && d.use;
    if (!u || !m) return false;
    const mh = Mon.maxHp(m), conf = !!(actor && actor.vol && actor.vol.conf);
    switch (u.type) {
      case 'heal': return m.hp > 0 && (m.hp < mh || (!!u.cure && cures(u.cure, m, conf)));
      case 'cure': return m.hp > 0 && cures(u.st, m, conf);
      case 'revive': return m.hp <= 0;
      case 'level': case 'xp': return m.lvl < 100;
      case 'ivs': return m.iv.some((v) => v < 31);
      case 'nature': return m.nat !== u.nat;
      case 'gift': return (m.aff || 0) < 255;
      case 'evo': return !!evoTarget(key, m);
      default: return false;
    }
  }
  function evoTarget(key, m) {
    for (const e of X.itemEvo[key] || []) if (e[0] === m.sp && (!e[2] || (e[2] === 'f') === !!m.fem) && D.dex[e[1]]) return e[1];
    return 0;
  }
  /** use one from the Bag on a creature. Returns { ok, events?, text } — events are Mon.gainXp-style (level / move / evolve) */
  function use(key, m, actor) {
    if (!count(key) || !canUse(key, m, actor)) return { ok: false };
    const d = get(key), u = d.use, mh = Mon.maxHp(m), who = Mon.name(m);
    let events = [], text = '';
    switch (u.type) {
      case 'heal': {
        const before = m.hp;
        m.hp = Math.min(mh, m.hp + Math.max(1, Math.floor(u.pct ? mh * u.pct : u.hp)));
        if (u.cure) clearStatus(m, actor, u.cure);
        text = `${who} recovered ${m.hp - before} HP.`; break;
      }
      case 'cure': clearStatus(m, actor, u.st); text = `${who} is feeling better.`; break;
      case 'revive': m.hp = Math.max(1, Math.floor(mh * u.pct)); text = `${who} is back on its feet!`; break;
      case 'level': events = Mon.gainXp(m, D.exp[D.dex[m.sp].gr][m.lvl + 1] - m.xp, G.set.evolve !== false); text = `${who} grew to Lv. ${m.lvl}!`; break;
      case 'xp': events = Mon.gainXp(m, u.xp, G.set.evolve !== false); text = `${who} gained ${u.xp.toLocaleString('en-US')} experience.`; break;
      case 'ivs': {
        const r = m.hp / mh;
        if (u.all) m.iv = m.iv.map(() => 31); else { let lo = 0; for (let i = 1; i < 6; i++) if (m.iv[i] < m.iv[lo]) lo = i; m.iv[lo] = 31; }
        m.hp = m.hp <= 0 ? 0 : Math.max(1, Math.round(Mon.maxHp(m) * r)); text = `${who} trained hard!`; break;
      }
      case 'nature': { const r = m.hp / mh; m.nat = u.nat; m.hp = m.hp <= 0 ? 0 : Math.max(1, Math.round(Mon.maxHp(m) * r)); text = `${who} now has a ${D.natures[u.nat].n} nature.`; break; }
      case 'gift': m.aff = Math.min(255, (m.aff || 0) + u.aff * affMult(m)); text = `${who} loved the ${d.n}!`; break;
      case 'evo': events = [Mon.evolveTo(m, evoTarget(key, m))]; text = ''; break;
      default: return { ok: false };
    }
    take(key);
    return { ok: true, events, text, kind: u.type };
  }
  function clearStatus(m, actor, st) {
    if (st === 'all' || m.st === st) m.st = null;
    if (actor && actor.vol && (st === 'all' || st === 'conf')) actor.vol.conf = 0;
  }
  /** give an item to hold (the one it held goes back to the Bag) */
  function give(key, m) {
    const d = get(key);
    if (!d || !d.hold || !count(key) || !m) return false;
    if (m.item) add(m.item);
    take(key); m.item = key; G.touch();
    return true;
  }
  function unhold(m) { if (!m || !m.item) return false; add(m.item); m.item = null; G.touch(); return true; }

  /** the found ball the next throw uses, or null for the standard Poké Ball */
  function equippedBall() { const k = G.save.ball; return k && count(k) && C[k] && C[k].ball ? C[k] : null; }
  function ballMult(d, wildActor) {
    const m = wildActor.mon, lead = G.save.team[0];
    return d.ball.mult(m, { age: wildActor.age, hour: new Date().getHours(), types: D.dex[m.sp].t.map((t) => D.types[t]), caughtBefore: !!G.save.dex.caught[m.sp], leaderLvl: lead ? lead.lvl : 1 });
  }

  // ---------------------------------------------------------------- hooks for held items (all return the neutral value when nothing is held)
  /** damage multiplier for the attacker's item */
  function power(u, mv, type, phys, eff) {
    const h = holdOf(u.mon);
    if (!h) return 1;
    let x = 1;
    if (h.boost === type || (h.boost2 && h.boost2.includes(type))) x *= 1.2;
    if (phys && h.phys) x *= h.phys;
    if (!phys && h.spec) x *= h.spec;
    if (h.expert && eff > 1) x *= h.expert;
    if (h.orb) x *= h.orb;
    return x;
  }
  /** defence multiplier for the defender's item */
  function guard(t, phys) {
    const h = holdOf(t.mon);
    if (!h) return 1;
    let x = 1;
    if (h.eviolite && D.dex[t.mon.sp].ev) x *= h.eviolite;
    if (!phys && h.spdef) x *= h.spdef;
    if (phys && h.pdef) x *= h.pdef;
    return x;
  }
  const crit = (u) => { const h = holdOf(u.mon); return h && h.crit ? h.crit : 1; };
  const haste = (u) => { const h = holdOf(u.mon); return h && h.haste ? h.haste : 1; };
  const accuracy = (u, t) => { const a = holdOf(u.mon), b = holdOf(t.mon); return (a && a.acc ? a.acc : 1) * (b && b.evade ? b.evade : 1); };
  const xpMult = (m) => { const h = holdOf(m); return h && h.xp ? h.xp : 1; };
  const shares = (m) => { const h = holdOf(m); return !!(h && h.share); };
  const affMult = (m) => { const h = holdOf(m); return (h && h.aff ? h.aff : 1) * (m.ball === 'luxury-ball' ? 1.5 : 1); };
  /** after a hit landed: drain, recoil, flinch, helmet */
  function afterHit(u, t, dealt, mv) {
    const h = holdOf(u.mon), ht = holdOf(t.mon);
    if (h) {
      if (h.drain && G.alive(u)) Battle.heal(u, Math.max(1, dealt * h.drain));
      if (h.orb && G.alive(u)) G.hurt(u, Math.max(1, Math.floor(Mon.maxHp(u.mon) / 10)), null, { type: 'normal', dot: true, quiet: true });
      if (h.flinch && G.alive(t) && U.chance(h.flinch)) t.vol.flinch = true;
    }
    if (ht && ht.helmet && mv.f && mv.f.includes('contact') && G.alive(u)) G.hurt(u, Math.max(1, Math.floor(Mon.maxHp(u.mon) * ht.helmet)), null, { type: 'rock', dot: true });
  }
  /** a knockout blow is about to land: does the item save the holder at 1 HP? */
  function endures(t) {
    const h = holdOf(t.mon);
    if (!h) return false;
    if (h.endure && U.chance(h.endure)) { G.say(t, `hung on with its ${name(t.mon.item)}!`, { col: '#ffd76a', size: 11, dy: -12 }); return true; }
    if (h.sash && t.mon.hp >= Mon.maxHp(t.mon)) { G.say(t, 'hung on with its Focus Sash!', { col: '#ffd76a', size: 11, dy: -12 }); t.mon.item = null; G.touch(); return true; }
    return false;
  }
  /** held berries: called after damage and after a status condition lands */
  function berryCheck(a) {
    const h = holdOf(a.mon), b = h && h.berry;
    if (!b || !G.alive(a)) return;
    const m = a.mon, mh = Mon.maxHp(m), conf = !!a.vol.conf;
    let ate = false;
    if ((b.hp || b.pct) && m.hp <= mh / 2) { Battle.heal(a, b.pct ? mh * b.pct : b.hp); ate = true; }
    else if (b.cure && cures(b.cure, m, conf)) { clearStatus(m, a, b.cure); ate = true; }
    if (!ate) return;
    G.say(a, `ate its ${name(m.item)}!`, { col: '#9cf07a', size: 11, dy: -12 });
    if (typeof Sound !== 'undefined') Sound.play('berry', { x: a.x, vol: 0.5 });
    m.item = null; G.touch();
  }
  /** every battle turn */
  function endTurn(a) {
    const h = holdOf(a.mon);
    if (!h || !G.alive(a)) return;
    const mh = Mon.maxHp(a.mon);
    if (h.regen && a.mon.hp < mh) Battle.heal(a, mh * h.regen);
    if (h.sludge) { if (G.hasType(a, 'poison')) { if (a.mon.hp < mh) Battle.heal(a, mh / 16); } else G.hurt(a, Math.max(1, Math.floor(mh / 8)), null, { type: 'poison', dot: true }); }
    berryCheck(a);
  }

  /** the team shares medicine from the Bag during fights (setting: autoMedicine) */
  function autoCare() {
    if (G.set.autoMedicine === false || !G.leader()) return;
    const b = bag();
    const best = (test) => Object.keys(b).filter((k) => b[k] > 0 && C[k] && C[k].use && test(C[k].use, k)).sort((x, y) => C[x].tier - C[y].tier)[0];
    for (const a of G.team()) {
      if (G.now - (a.careT || -99) < 12) continue;
      const m = a.mon;
      let key = null;
      if (a.state === 'faint' && a.stateT > 3 && !(G.inTrainerBattle && G.inTrainerBattle()) && G.wilds().some((w) => w.aggro)) key = best((u) => u.type === 'revive');
      else if (G.alive(a) && (a.mode === 'fight' || G.now - a.lastHit < 3)) {
        if (m.hp / Mon.maxHp(m) <= 0.3) key = best((u) => u.type === 'heal');
        else if (m.st) key = best((u) => u.type === 'cure' && (u.st === 'all' || u.st === m.st));
      }
      if (!key) continue;
      a.careT = G.now;
      G.useItem(key, a.mon, true);
      return;                                       // one item per check
    }
  }

  /** everything the Pokédex window needs to draw the Bag */
  function view() {
    const b = bag(), team = G.save.team;
    return Object.keys(b).filter((k) => b[k] > 0 && get(k)).map((k) => {
      const d = get(k);
      return { key: k, name: d.n, n: b[k], tier: d.tier, text: d.text, icon: Sprites.item(k), kind: d.ball ? 'ball' : d.use && d.hold ? 'both' : d.hold ? 'held' : d.use ? d.use.type : 'misc',
        canHold: !!d.hold, isBall: !!d.ball, equipped: G.save.ball === k, targets: d.use ? team.filter((m) => canUse(k, m, G.actors.find((a) => a.mon === m))).map((m) => m.uid) : [] };
    }).sort((x, y) => (x.kind === y.kind ? x.name.localeCompare(y.name) : x.kind.localeCompare(y.kind)));
  }

  return { get, name, holdOf, rollDrops, randomItem, randomBall, ballStack, nextStack, BALL_STACK, BALL_STACK_OF, BALL_FIND, teamLuck, resetPools, add, take, count, canUse, use, give, unhold, equippedBall, ballMult, evoTarget,
    power, guard, crit, haste, accuracy, xpMult, shares, affMult, afterHit, endures, berryCheck, endTurn, autoCare, view, all: C };
})();
