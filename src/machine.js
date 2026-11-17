// Screen Trainer — state machines, said out loud (0.9).
//
// Until 0.9 the program kept its "what is going on right now" in loose flags: a `tied` here, a `lastCapture` there,
// a `drag` that was set on mouse down and cleared on mouse up. That works until one of the two halves goes missing
// (a mouse up that never arrives, a window shown after its place in the stack was decided), and then nothing says
// which state the program believes it is in. A Machine is the same flags with a name:
//
//   const Layer = Machine.make('layer', {
//     about: 'where the overlay window lies',
//     initial: 'own',
//     states: {
//       own:   { about: 'its own window, above everything while "Stay on top" is set', to: ['field', 'none'] },
//       field: { about: 'belongs to the field window and lies directly above it', to: ['own', 'none'] },
//       none:  { about: 'no overlay: the game is on the MyStream stage', to: ['own', 'field'] },
//     },
//   });
//   Layer.go('field', 'the field window was shown');      // true when the state changed
//   Layer.is('field');  Layer.state;  Layer.since;  Layer.history;
//
//   - Every change is kept with its time and its reason (the last 24): Machine.report() lists every machine of this
//     page or process, and the request { "run": "state" } writes them all to the self-check folder (main.js).
//   - A change the table does not allow is not made and is counted (`refused`): nothing is thrown while the game
//     runs. The checks (tools/statecheck.js) set Machine.strict and then it throws.
//   - A state may say how long it can last: { max: seconds, then: 'state' }. Machine.tick(now) moves a machine that
//     overstayed to `then` and counts it (`rescued`): a state that should pass cannot stay for ever.
//   - `to` left out means: any state may follow (a machine that only names what is going on).
//
// The same file is loaded by the pages (a plain script) and by the main process (require). AGENTS.md has the table
// of every machine and of the state that is still kept in plain flags.
'use strict';

const Machine = (() => {
  const all = new Map();
  const clock = () => Date.now();
  const api = { strict: false };

  /** def: { about, initial, states: { name: { about, to: [names], max: seconds, then: name } }, change: (to, from, why, machine) => {} } */
  api.make = (name, def) => {
    const states = def.states || {};
    if (!states[def.initial]) throw new Error(`machine ${name}: no state "${def.initial}"`);
    for (const k of Object.keys(states)) {
      for (const t of states[k].to || []) if (!states[t]) throw new Error(`machine ${name}: "${k}" leads to "${t}", which is not a state`);
      if (states[k].then && !states[states[k].then]) throw new Error(`machine ${name}: "${k}" falls back to "${states[k].then}", which is not a state`);
    }
    const m = {
      name, about: def.about || '', state: def.initial, since: clock(), why: 'start', detail: '', history: [], refused: 0, rescued: 0, lastRefused: '',
      is: (...names) => names.includes(m.state),
      can: (to) => !!states[to] && (to === m.state || !states[m.state].to || states[m.state].to.includes(to)),
      /** go to another state. why: a few words for the history. false when it is already there or the table forbids it */
      go: (to, why, detail) => {
        if (to === m.state) { if (detail !== undefined) m.detail = detail; return false; }
        if (!m.can(to)) {
          m.refused++; m.lastRefused = `${m.state} -> ${to}${why ? ' (' + why + ')' : ''}`;
          if (api.strict) throw new Error(`machine ${name}: ${m.lastRefused} is not allowed`);
          return false;
        }
        const from = m.state, now = clock();
        m.history.push({ at: now, from, to, why: why || '', after: Math.round((now - m.since) / 100) / 10 });
        if (m.history.length > 24) m.history.shift();
        m.state = to; m.since = now; m.why = why || ''; m.detail = detail === undefined ? '' : detail;
        if (def.change) { try { def.change(to, from, why || '', m); } catch (e) { m.lastRefused = 'change handler: ' + String(e && e.message); if (api.strict) throw e; } }
        return true;
      },
      /** seconds in the present state */
      age: (now) => ((now || clock()) - m.since) / 1000,
      describe: () => ({ name, about: m.about, state: m.state, means: (states[m.state] && states[m.state].about) || '', for: Math.round(m.age() * 10) / 10, why: m.why, detail: m.detail, refused: m.refused, lastRefused: m.lastRefused, rescued: m.rescued, states: Object.keys(states), history: m.history.slice() }),
      _states: states,
    };
    all.set(name, m);
    return m;
  };
  /** move every machine that overstayed a state with a time limit. Returns what was rescued (for the log). */
  api.tick = (now) => {
    const out = [];
    for (const m of all.values()) {
      const s = m._states[m.state];
      if (s && s.max > 0 && s.then && m.age(now) > s.max) { const from = m.state; m.rescued++; if (m.go(s.then, `more than ${s.max} s in "${from}"`)) out.push({ machine: m.name, from, to: s.then }); }
    }
    return out;
  };
  api.get = (name) => all.get(name) || null;
  api.report = () => [...all.values()].map((m) => m.describe());
  api.reset = () => all.clear();                           // (the checks start clean)
  return api;
})();
if (typeof module !== 'undefined') module.exports = Machine;
