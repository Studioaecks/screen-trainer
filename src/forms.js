// Screen Trainer — Mega Evolution and Dynamax (0.6).
//
// When the team fights to knock out (battle orders "knock out for experience", or a wild Pokémon the orders do not
// want caught), a team member whose charge is full changes for a while:
//   Mega Evolution   if its species has a Mega or Primal form and the owner's sprite set has that picture (the file
//                    named by the form's id). It takes the form's own base stats and types (src/data-forms.js) and
//                    its picture. Lasts MEGA_SECONDS, or until the fighting has been over for a few seconds.
//   Gigantamax       if the species has a Gigantamax form and the sprite set has its picture: that picture, very large.
//   Dynamax          everything else: the Pokémon itself, very large.
//                    Both double its health for DMAX_SECONDS (three turns, as in the games), then it shrinks back.
// One team member at a time is changed, as one per battle in the games. Each Pokémon then recharges for CHARGE_SECONDS;
// the thin bar under its health bar shows the charge (and, while changed, the time left).
// Option: Catching and the team > "Mega Evolution and Dynamax" (setting megaDynamax).
//
// Nothing here is saved: a form lives on the actor (a.form, a.grow, a.charge) and in Mon's table of stand-in species
// (Mon.setForm). Forms.end puts everything back, also when the actor leaves in the middle of it.
'use strict';

const Forms = (() => {
  const F = typeof FORM_DATA !== 'undefined' ? FORM_DATA : { mega: {}, gmax: {} };
  const CHARGE_SECONDS = 200, MEGA_SECONDS = 45, DMAX_SECONDS = 18, CALM = 6, GROW = { mega: 1.15, dmax: 2.2, gmax: 2.5 };
  let active = null;                                       // the actor that is changed right now
  /** what this Pokémon would do: { kind: 'mega' | 'gmax' | 'dmax', form } */
  function option(m) {
    const megas = (F.mega[m.sp] || []).filter((f) => Sprites.available(f.id));
    if (megas.length) return { kind: 'mega', form: megas[megas.length > 1 ? (parseInt(String(m.uid).slice(-2), 36) || 0) % megas.length : 0] };      // Charizard and Mewtwo have two: each individual has its own
    const g = F.gmax[m.sp];
    if (g && Sprites.available(g)) return { kind: 'gmax', form: { id: g, n: 'Gigantamax ' + DATA.dex[m.sp].n } };
    return { kind: 'dmax', form: null };
  }
  function start(a) {
    const m = a.mon, o = option(m);
    active = a;
    G.lastBattle = G.now;                                   // a fight is on from this moment (update() ends a form once the fighting has been over for a while)
    a.form = { kind: o.kind, id: o.form ? o.form.id : 0, name: o.form ? o.form.n : 'Dynamax ' + Mon.name(m), t: o.kind === 'mega' ? MEGA_SECONDS : DMAX_SECONDS, total: o.kind === 'mega' ? MEGA_SECONDS : DMAX_SECONDS };
    a.grow = GROW[o.kind]; a.charge = 0;
    if (o.kind === 'mega') Mon.setForm(m, Object.assign(Object.create(DATA.dex[m.sp]), { s: o.form.s, t: o.form.t }));
    else { m.hpx = 2; m.hp = Math.max(1, m.hp * 2); a.hpShown = m.hp; a.el.classList.add('dmax'); }
    if (a.form.id) G.loadSprite(a); else G.sizeActor(a);
    const c = G.center(a), col = o.kind === 'mega' ? '#ffd24a' : '#ff3b6b';
    FX.ring(c.x, c.y, 8, a.w * 1.6 + 40, col, 0.8, 5, 0.4); FX.ring(c.x, c.y, 4, a.w * 2.4 + 60, '#ffffff', 0.5, 3); FX.sparkle(c.x, c.y, 22, col, a.w * 0.8 + 20);
    G.say(a, o.kind === 'mega' ? `${a.form.name}!` : o.kind === 'gmax' ? 'Gigantamax!' : 'Dynamax!', { col, size: 15 });
    Sound.play('evolve');
    a.flash = 0.5; a._sk = '';
  }
  function end(a, quiet) {
    if (!a || !a.form) return;
    const m = a.mon, f = a.form;
    a.form = null; a.grow = 0; a.charge = 0;
    if (active === a) active = null;
    if (f.kind === 'mega') Mon.setForm(m, null);
    else { delete m.hpx; m.hp = m.hp > 0 ? Math.max(1, Math.ceil(m.hp / 2)) : 0; a.hpShown = m.hp; if (a.el) a.el.classList.remove('dmax'); }
    if (a.gone) return;
    if (f.id) G.loadSprite(a); else G.sizeActor(a);
    a._sk = '';
    if (!quiet) { const c = G.center(a); FX.puff ? FX.puff(c.x, c.y, 8, '#ffffff') : FX.dust(a.x, a.y, 6, 4); G.say(a, f.kind === 'mega' ? 'changed back.' : 'returned to its size.', { col: '#d9e6ff', size: 11 }); }
  }
  /** every frame, from G.update */
  function update(dt) {
    const onOpt = G.set.megaDynamax !== false;
    if (active) {
      const a = active;
      if (a.gone || !a.form || !G.save.team.includes(a.mon)) { end(a, true); active = null; }
      else { a.form.t -= dt; if (!onOpt || a.form.t <= 0 || a.state === 'faint' || a.mon.hp <= 0 || G.now - G.lastBattle > CALM) end(a); }
    }
    if (!onOpt) return;
    for (const a of G.actors) {
      if (a.side !== 'team' || a.gone || a.await) continue;
      if (!a.form) a.charge = Math.min(1, (a.charge === undefined ? U.rand(0.2, 0.7) : a.charge) + dt / CHARGE_SECONDS);
      if (active || a.form || a.charge < 1 || a.state === 'faint' || a.dragging || a.mode !== 'fight') continue;
      const t = a.target;
      if (!t || t.gone || t.side !== 'wild' || !G.targetable(t) || G.wantCatch(t)) continue;
      start(a);
    }
  }
  /** for the name tag: null, or { r: 0..1, col, on } */
  function bar(a) {
    if (a.side !== 'team' || G.set.megaDynamax === false || a.charge === undefined) return null;
    if (a.form) return { r: Math.max(0, a.form.t / a.form.total), col: a.form.kind === 'mega' ? '#ffd24a' : '#ff3b6b', on: true };
    return { r: a.charge, col: a.charge >= 1 ? '#f29bff' : '#9a6bd6', on: false };
  }
  return { update, option, start, end, bar, active: () => active, CHARGE_SECONDS, MEGA_SECONDS, DMAX_SECONDS };
})();
if (typeof module !== 'undefined') module.exports = Forms;
