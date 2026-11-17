// Screen Trainer — self-check (main process): the running program looks itself over and writes down what it finds.
//
// It answers the questions the headless tests in tools/ cannot: did the windows come up on this very computer,
// is the tray there, do the Pokédex controls work with real clicks, does Windows answer Mewtwo's questions?
// It changes nothing: the one setting it clicks (a generation button) is put back, and Mewtwo only reads.
//
// It also puts the field window up and takes it down again (unless it was already open), and folds one Options
// category shut and opens it; both are put back as they were.
//
//   where      a "selfcheck" folder next to the program folder (with the save when that is not writable);
//              each run gets a folder named by date and time: report.json, summary.txt, pictures of the program's
//              own windows (never of the desktop or of other programs)
//   how        tray > Developer > Run self-check, or start the program with --selfcheck, or put a file
//              request.json with { "run": "selfcheck" } into that folder (see watchRequests in main.js)
//
// To add a check: push one more `add(name, passed, detail)` in run() below.
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');

function dir(app, userDir) {
  const tryDir = (d) => { try { fs.mkdirSync(d, { recursive: true }); fs.accessSync(d, fs.constants.W_OK); return d; } catch (e) { return null; } };
  return (process.env.ST_SELFCHECK_DIR && tryDir(process.env.ST_SELFCHECK_DIR)) || (app.isPackaged && tryDir(path.join(path.dirname(process.execPath), '..', 'selfcheck'))) || tryDir(path.join(userDir, 'selfcheck')) || userDir;
}

function create(ctx) {
  const { app, BrowserWindow, screen, globalShortcut, guardian } = ctx;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const js = (win, code) => win.webContents.executeJavaScript(code, true);
  const until = async (fn, ms = 8000) => { const t0 = Date.now(); for (;;) { try { const v = await fn(); if (v) return v; } catch (e) { /* not yet */ } if (Date.now() - t0 > ms) return null; await sleep(150); } };
  /** Put the Pokédex over the middle of the field window, bring it to the front and look at the screen: is it the
   *  Pokédex that is seen there, and not Fountain Square or a Pokémon? Windows only. The picture of the screen is
   *  used for this one comparison; only the part that lies under the Pokédex is kept, as a picture for the report. */
  async function dexInFront(fw, folder) {
    if (process.platform !== 'win32' || !ctx.desktopCapturer || !ctx.openPanel) return null;
    const had = ctx.state().panel, wasOpen = !!had && !had.isDestroyed() && had.isVisible();
    ctx.openPanel('dex');
    const p = await until(() => { const x = ctx.state().panel; return x && !x.isDestroyed() && x.isVisible() ? x : null; }, 6000);
    if (!p) return { ok: false, note: 'the Pokédex did not open' };
    const keep = p.getBounds(), c = fw.getContentBounds();
    try {
      p.setPosition(Math.round(c.x + c.width / 2 - keep.width / 2), Math.round(c.y + c.height / 2 - keep.height / 2));
      p.show(); p.focus(); p.moveTop();
      await sleep(1200);
      const pb = p.getBounds(), d = ctx.screen.getDisplayMatching(pb), sf = d.scaleFactor || 1, inset = 56;
      // the part of the field's inside that lies well within the Pokédex's body
      const x0 = Math.max(c.x, pb.x + inset), y0 = Math.max(c.y, pb.y + inset), x1 = Math.min(c.x + c.width, pb.x + pb.width - inset), y1 = Math.min(c.y + c.height, pb.y + pb.height - inset);
      if (x1 - x0 < 60 || y1 - y0 < 60) return { ok: false, note: 'the Pokédex could not be put over the field' };
      const srcs = await ctx.desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: Math.round(d.size.width * sf), height: Math.round(d.size.height * sf) } });
      const src = srcs.find((s) => String(s.display_id) === String(d.id)) || srcs[0];
      const own = await p.webContents.capturePage();
      if (!src || src.thumbnail.isEmpty() || own.isEmpty()) return { ok: false, note: 'the screen could not be looked at' };
      const ks = src.thumbnail.getSize().width / d.size.width, ko = own.getSize().width / pb.width;
      const cut = (img, k, ox, oy) => img.crop({ x: Math.round((x0 - ox) * k), y: Math.round((y0 - oy) * k), width: Math.round((x1 - x0) * k), height: Math.round((y1 - y0) * k) });
      const onScreen = cut(src.thumbnail, ks, d.bounds.x, d.bounds.y), itself = cut(own, ko, pb.x, pb.y);
      const small = (img) => img.resize({ width: 48, height: 36, quality: 'good' }).toBitmap();
      const a = small(onScreen), b = small(itself);
      let sum = 0, far = 0; const n = Math.min(a.length, b.length) / 4;
      for (let i = 0; i < n; i++) { const dd = (Math.abs(a[i * 4] - b[i * 4]) + Math.abs(a[i * 4 + 1] - b[i * 4 + 1]) + Math.abs(a[i * 4 + 2] - b[i * 4 + 2])) / 3; sum += dd; if (dd > 60) far++; }
      const mean = n ? sum / n : 255, share = n ? far / n : 1;
      let pictureName = '';
      try { fs.writeFileSync(path.join(folder, 'pokedex-over-field.png'), onScreen.toPNG()); pictureName = 'pokedex-over-field.png'; } catch (e) { /* the numbers say it */ }
      return { ok: mean < 14 && share < 0.06, note: `what is seen there differs from the Pokédex by ${mean.toFixed(1)} of 255 on average, ${(share * 100).toFixed(0)}% of it clearly`, mean: +mean.toFixed(2), share: +share.toFixed(3), picture: pictureName, region: { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } };
    } finally {
      try { if (!p.isDestroyed()) { p.setBounds(keep); if (!wasOpen) p.close(); } } catch (e) { /* closed meanwhile */ }
    }
  }
  let lastPicture = null;
  async function picture(win, file) {
    try { const img = await win.webContents.capturePage(); if (img.isEmpty()) return false; fs.writeFileSync(file, img.toPNG()); lastPicture = img; return true; } catch (e) { return false; }
  }
  /** how solid (0..255) a captured picture is at a point given as shares of its width and height */
  function solidAt(img, fx, fy) {
    const sf = img.getScaleFactors()[0] || 1, size = img.getSize(sf), buf = img.toBitmap({ scaleFactor: sf }), px = buf.length / 4;
    const w = Math.round(Math.sqrt((px * size.width) / size.height)) || 1, h = Math.round(px / w), x = Math.min(w - 1, Math.max(0, Math.floor(fx * w))), y = Math.min(h - 1, Math.max(0, Math.floor(fy * h)));
    return buf[(y * w + x) * 4 + 3];
  }
  /** Is the body of a device window really painted? Looks at a picture of the window just inside the left edge of the element.
   *  (A Windows contrast theme once left the Pokédex without a body: gradients are dropped unless the page opts out.) */
  async function bodyDrawn(win, selector, file) {
    const at = await js(win, `(() => { const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return { fx: (r.x + 7) / innerWidth, fy: (r.y + r.height / 2) / innerHeight, forced: matchMedia('(forced-colors: active)').matches, adjust: getComputedStyle(document.documentElement).forcedColorAdjust, contrast: document.documentElement.dataset.contrast }; })()`);
    const ok = await picture(win, file), alpha = ok ? solidAt(lastPicture, at.fx, at.fy) : -1;
    return { ok: alpha >= 200, alpha, contrastTheme: at.forced, adjust: at.adjust, setting: at.contrast };
  }
  const click = async (win, x, y) => {
    const z = win.webContents.getZoomFactor(), p = { x: Math.round(x * z), y: Math.round(y * z), button: 'left', clickCount: 1 };
    win.webContents.sendInputEvent(Object.assign({ type: 'mouseDown' }, p)); win.webContents.sendInputEvent(Object.assign({ type: 'mouseUp' }, p));
    await sleep(450);
  };

  async function run(why) {
    const base = dir(app, ctx.userDir), stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19), folder = path.join(base, stamp);
    fs.mkdirSync(folder, { recursive: true });
    const checks = [], add = (name, ok, detail) => checks.push({ name, ok: !!ok, detail: detail === undefined ? '' : detail });
    const stage = async (name, fn) => { try { await fn(); } catch (e) { add(name, false, 'the check itself failed: ' + String((e && e.message) || e).slice(0, 300)); } };
    const s0 = ctx.state();
    const report = { why, at: new Date().toISOString(), version: ctx.version, electron: process.versions.electron, chrome: process.versions.chrome, node: process.versions.node,
      system: `${process.platform} ${os.release()} ${process.arch}`, packaged: app.isPackaged, program: process.execPath, argv: process.argv.slice(1), savedIn: ctx.userDir, folder,
      displays: screen.getAllDisplays().map((d) => ({ bounds: d.bounds, workArea: d.workArea, scaleFactor: d.scaleFactor, primary: d.id === screen.getPrimaryDisplay().id })),
      settings: s0.settings, checks };

    // ---- the overlay window
    await stage('overlay window', async () => {
      const w = s0.overlay, st = s0.settings;
      add('overlay window exists', !!w && !w.isDestroyed());
      if (!w || w.isDestroyed()) return;
      const b = w.getBounds(), all = screen.getAllDisplays(), d = (all[st.display] || screen.getPrimaryDisplay()).bounds;
      report.overlay = { bounds: b, visible: w.isVisible(), alwaysOnTop: w.isAlwaysOnTop(), focusable: w.isFocusable() };
      // (with display scaling such as 150%, Windows rounds sizes, so a pixel or two either way is expected)
      add('overlay covers the chosen display', Math.abs(b.x - d.x) <= 1 && Math.abs(b.y - d.y) <= 1 && Math.abs(b.width - d.width) <= 2 && b.height >= d.height - 2 && b.height <= d.height + 1, `${JSON.stringify(b)} on ${JSON.stringify(d)}`);
      add('overlay shown or hidden as set', w.isVisible() === !!st.visible, `set to ${st.visible ? 'shown' : 'hidden'}, is ${w.isVisible() ? 'shown' : 'hidden'}${w.isVisible() !== !!st.visible ? ' (an assistant that is controlling the desktop hides other programs\' windows while it works: then this is expected)' : ''}`);
      // (while the overlay belongs to the field window, staying on top is the field window's to do; the overlay follows it)
      const keeper = (w.getParentWindow && w.getParentWindow()) || w;
      add('overlay stays on top as set', keeper.isAlwaysOnTop() === !!st.alwaysOnTop, keeper === w ? '' : 'through the field window it belongs to');
      add('overlay never takes the keyboard', !w.isFocusable());
      const page = await until(() => js(w, 'typeof G !== "undefined" && !!G.save && typeof Events !== "undefined" && typeof Mewtwo !== "undefined"'));
      add('overlay page is running', !!page);
      if (!page) return;
      const o = await js(w, `({ W: G.W, H: G.H, scale: G.scale, sizeMode: G.set.sizeMode, team: G.save.team.length, box: G.save.box.length, pool: (G.pool || []).length, sprites: Sprites.ready(),
        actors: G.actors.map((a) => ({ name: Mon.name(a.mon), side: a.side, x: Math.round(a.x), y: Math.round(a.y), w: Math.round(a.w), h: Math.round(a.h), size: Size.label(a.mon), metres: +Size.metres(a.mon).toFixed(2), loaded: !!a.nw, waiting: !!a.await })),
        mewtwo: Mewtwo.present() ? Mewtwo.box() : null, helpers: Events.helperView ? Events.helperView() : { rotom: true, mewtwo: true, porygonz: true }, weather: G.weather ? G.weather.kind : null, visit: Events.view(), sound: Sound.status(),
        sizes: [...G.save.team, ...G.save.box].map((m) => m.sz), caught: Object.keys(G.save.dex.caught).length })`);
      report.overlayPage = o;
      add('team on screen matches the save', o.actors.filter((a) => a.side === 'team').length === o.team, `${o.actors.filter((a) => a.side === 'team').length} of ${o.team}`);
      add('every Pokémon in the save has a size', o.sizes.every((v) => v >= 0 && v <= 255), `${o.sizes.length} Pokémon`);
      add('sprites folder found', o.sprites && s0.spriteInfo && s0.spriteInfo.ok, s0.spriteInfo ? s0.spriteInfo.root : '');
      add('wild Pokémon available for the chosen generations', o.pool > 0, `${o.pool} species`);
      if (o.sprites) {
        await sleep(1500);
        const loaded = await js(w, 'G.actors.filter((a) => a.side === "team").every((a) => !!a.nw)');
        add('team sprites loaded and sized', loaded);
        // (0.7: Mewtwo stands guard once it has been met and caught; until then it is not there, and that is right)
        add('Mewtwo is on the screen once it has been caught and is switched on', st.guardian === false || !o.helpers.mewtwo ? !o.mewtwo : !!o.mewtwo && o.mewtwo.w > 0, o.mewtwo ? `${Math.round(o.mewtwo.w)} x ${Math.round(o.mewtwo.h)} px at ${Math.round(o.mewtwo.x)}, ${Math.round(o.mewtwo.y)}` : `not shown (${o.helpers.mewtwo ? 'caught' : 'not caught yet'})`);
        report.helpers = o.helpers;
      }
      report.pictures = report.pictures || [];
      if (await picture(w, path.join(folder, 'overlay.png'))) report.pictures.push('overlay.png');
    });

    // ---- tray, startup, hotkey, sound
    await stage('tray and startup', async () => {
      const st = s0.settings;
      if (process.platform === 'win32' || s0.tray) add('tray icon created', !!s0.tray);
      if (app.isPackaged) { const li = app.getLoginItemSettings({ path: process.execPath, args: ['--hidden'] }); report.startup = li; add('launch on startup registered as set', !!li.openAtLogin === !!st.autoStart, `openAtLogin ${li.openAtLogin}`); }
      if (st.hotkey && ctx.fork) add('a fork leaves the hotkey to the main game (1.0)', !globalShortcut.isRegistered(st.hotkey), `fork "${ctx.fork}"`);
      else if (st.hotkey) add('hotkey registered', globalShortcut.isRegistered(st.hotkey), st.hotkey);
      report.soundBank = s0.bankFound ? { file: s0.bankFound.file, source: s0.bankFound.source } : null;
    });

    // ---- the Pokédex window: every screen, and the generation buttons with a real click
    await stage('Pokédex window', async () => {
      const wasOpen = !!(s0.panel && !s0.panel.isDestroyed());
      ctx.openPanel('options');
      const w = await until(() => { const p = ctx.state().panel; return p && !p.isDestroyed() ? p : null; });
      add('Pokédex window opens', !!w);
      if (!w) return;
      const ready = await until(() => js(w, '!!document.querySelector("#optBody .set") || /Restart/.test((document.querySelector(".screen.on h2") || {}).textContent || "")'));
      const stale = await js(w, '/Restart/.test((document.querySelector(".screen.on h2") || {}).textContent || "")');
      add('Pokédex page matches the running program', !!ready && !stale, stale ? 'it shows the "restart" notice: the files are newer than the program that is running' : '');
      if (!ready || stale) return;
      await sleep(400);
      const b = w.getBounds();
      report.pokedex = { bounds: b, zoom: w.webContents.getZoomFactor(), theme: await js(w, 'document.documentElement.dataset.theme') };
      const ids = await js(w, '(() => { const all = [...document.querySelectorAll("[id]")].map((e) => e.id); return all.filter((id, i) => all.indexOf(id) !== i); })()');
      add('no element id is used twice', ids.length === 0, ids.join(', '));
      const tabs = await js(w, `(async () => { const out = {}; for (const k of document.querySelectorAll('#keys .key[data-tab]')) { k.click(); await new Promise((r) => setTimeout(r, 150)); const on = document.querySelector('.screen.on'); out[k.dataset.tab] = !!on && on.id === k.dataset.tab && document.getElementById('lcd').scrollTop === 0; } return out; })()`);
      add('every screen opens', Object.values(tabs).every(Boolean) && Object.keys(tabs).length >= 6, JSON.stringify(tabs));
      report.pictures = report.pictures || [];
      for (const tab of ['dex', 'party', 'trainer']) {
        await js(w, `document.querySelector('#keys .key[data-tab="${tab}"]').click()`); await sleep(500);
        if (tab !== 'dex') { if (await picture(w, path.join(folder, `pokedex-${tab}.png`))) report.pictures.push(`pokedex-${tab}.png`); continue; }
        const body = await bodyDrawn(w, '#device', path.join(folder, 'pokedex-dex.png'));
        report.pokedex.body = body; report.pictures.push('pokedex-dex.png');
        add('the Pokédex device is drawn with its body', body.ok || body.setting === 'system', `solid ${body.alpha} of 255${body.contrastTheme ? '; a Windows contrast theme is on, colours: ' + (body.setting === 'system' ? 'Windows\'' : 'the device\'s own') : ''}`);
      }
      // the categories of the Options screen fold shut and open again (with real clicks); the player's own folds are put back
      await js(w, 'document.querySelector(\'#keys .key[data-tab="options"]\').click()'); await sleep(300);
      const foldsBefore = (ctx.state().settings.optClosed || []).slice();
      ctx.setSettings({ optClosed: [] }); await sleep(350);
      const head = await js(w, `(() => { const b = document.querySelector('#optBody .fold[data-fold="sound"]'); if (!b) return null; b.scrollIntoView({ block: 'center' }); const r = b.getBoundingClientRect(); return { x: r.x + 40, y: r.y + r.height / 2, groups: document.querySelectorAll('#optBody .group').length }; })()`);
      if (head) {
        const shown = () => js(w, `(() => { const g = document.querySelector('#optBody .group[data-group="sound"]'); return { closed: g.classList.contains('closed'), rows: [...g.querySelectorAll('.set')].filter((e) => e.offsetParent !== null).length, expanded: g.querySelector('.fold').getAttribute('aria-expanded') }; })()`);
        const open0 = await shown();
        await click(w, head.x, head.y); const shut = await shown();
        add('an Options category folds shut with a click', !open0.closed && open0.rows > 0 && shut.closed && shut.rows === 0 && shut.expanded === 'false' && (ctx.state().settings.optClosed || []).includes('sound'), `${head.groups} categories; ${open0.rows} rows, then ${shut.rows}`);
        if (await picture(w, path.join(folder, 'pokedex-options-folded.png'))) report.pictures.push('pokedex-options-folded.png');
        await click(w, head.x, head.y); const open1 = await shown();
        add('and opens again', !open1.closed && open1.rows === open0.rows && open1.expanded === 'true');
      } else add('an Options category folds shut with a click', false, 'no fold button found');
      ctx.setSettings({ optClosed: [] }); await sleep(300);
      // the generation buttons: a real mouse click on one, and the screen must stay where it is
      const gensBefore = (ctx.state().settings.gens || []).slice(), target = gensBefore.includes(3) && gensBefore.length > 1 ? 3 : gensBefore.includes(3) ? 4 : 3;
      const at = await js(w, `(() => { const g = document.getElementById('gens'); g.scrollIntoView({ block: 'center' }); const r = g.querySelector('input[value="${target}"]').parentElement.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, frame: document.getElementById('lcd').scrollTop }; })()`);
      await click(w, at.x, at.y);
      const after = await js(w, '({ frame: document.getElementById("lcd").scrollTop, page: document.scrollingElement.scrollTop, list: document.getElementById("optBody").scrollTop, rows: document.querySelectorAll("#optBody .set").length, visible: (() => { const r = document.getElementById("gens").getBoundingClientRect(), l = document.getElementById("lcd").getBoundingClientRect(); return r.top >= l.top && r.bottom <= l.bottom; })() })');
      const gensAfter = (ctx.state().settings.gens || []).slice();
      add('a generation button switches its generation', gensAfter.includes(target) !== gensBefore.includes(target), `${JSON.stringify(gensBefore)} -> ${JSON.stringify(gensAfter)}`);
      add('the screen stays in place after clicking a generation', at.frame === 0 && after.frame === 0 && after.page === 0 && after.visible, JSON.stringify(after));
      if (await picture(w, path.join(folder, 'pokedex-options-after-generation-click.png'))) report.pictures.push('pokedex-options-after-generation-click.png');
      ctx.setSettings({ gens: gensBefore });                 // put the player's choice back
      await sleep(300);
      add('generations are back as the player had them', JSON.stringify(ctx.state().settings.gens) === JSON.stringify(gensBefore));
      ctx.setSettings({ optClosed: foldsBefore }); await sleep(200);
      const ids2 = await js(w, '(() => { const all = [...document.querySelectorAll("[id]")].map((e) => e.id); return all.filter((id, i) => all.indexOf(id) !== i); })()');
      add('the new Options rows are there, each id once', ids2.length === 0 && await js(w, '["xpRate", "maxLoiter", "field", "fieldSeed", "exportApk", "scale", "walkSpeed", "moveSpeed", "fieldSquare", "zooms", "boxFieldMax", "hints", "exportShare", "openImport", "openOnline"].every((id) => !!document.getElementById(id)) && document.getElementById("scale").min === "0.1"'), ids2.join(', '));
      await js(w, 'document.querySelector(\'#keys .key[data-tab="dex"]\').click()');
      if (!wasOpen) w.close();
    });

    // ---- the field window (windowed mode): put it up, see everyone called inside, take it down again
    await stage('field window', async () => {
      const w = ctx.state().overlay, was = !!ctx.state().settings.field;
      if (!w || w.isDestroyed() || !(await js(w, 'typeof G !== "undefined" && !!G.save && typeof G.setField === "function"'))) { add('the overlay knows about the field', false, 'the overlay page is older than this program'); return; }
      const look = () => js(w, `({ view: G.view, W: G.W, H: G.H, SW: G.SW, SH: G.SH, cam: G.cam || null, square: typeof Square !== 'undefined' ? Square.state() : null, pulling: G.pulling, open: document.getElementById('root').classList.contains('open'), team: G.actors.filter((a) => a.side === 'team').length,
        outside: G.actors.filter((a) => !a.await && a.state !== 'leave' && !a.hops).filter((a) => { const b = G.bounds(a); return a.x < b.x0 - 3 || a.x > b.x1 + 3 || a.y < b.y0 - 3 || a.y > b.y1 + 3; }).map((a) => Mon.name(a.mon)) })`);
      const before = await look();
      if (!was) { add('without the field the world is the whole screen', !before.view && before.W === before.SW && before.H === before.SH, JSON.stringify({ W: before.W, H: before.H })); ctx.setSettings({ field: true }); }
      const fw = await until(() => { const f = ctx.state().fieldWin; return f && !f.isDestroyed() && f.isVisible() ? f : null; });
      add('the field window opens', !!fw);
      if (!fw) { if (!was) ctx.setSettings({ field: false }); return; }
      const got = await until(async () => { const v = await look(); return v.view ? v : null; }, 7000), c = fw.getContentBounds(), o = w.getBounds();
      report.field = { window: fw.getBounds(), content: c, onTop: fw.isAlwaysOnTop(), view: got && got.view, rect: ctx.state().fieldRect };
      // (the part of the window's inside that lies on the overlay's screen: a field window hanging over the edge of the screen is cut off there, 0.9)
      const vis = { x: Math.max(c.x, o.x), y: Math.max(c.y, o.y), x1: Math.min(c.x + c.width, o.x + o.width), y1: Math.min(c.y + c.height, o.y + o.height) };
      add('the overlay keeps the game inside the field window', !!got && Math.abs(got.view.x - (vis.x - o.x)) <= 2 && Math.abs(got.view.y - (vis.y - o.y)) <= 2 && Math.abs(got.view.w - (vis.x1 - vis.x)) <= 2 && Math.abs(got.view.h - (vis.y1 - vis.y)) <= 2, got ? `${JSON.stringify(got.view)} for the window's inside ${JSON.stringify(c)}${vis.x1 - vis.x < c.width || vis.y1 - vis.y < c.height ? ' (part of it is off the screen)' : ''}` : 'the overlay was never told');
      // 0.7: the field's world is at least as large as the window (and as the MyStream stage, for Fountain Square), seen through a camera
      add('the field has its own world, seen through a camera', !!got && got.W >= got.view.w - 2 && got.H >= got.view.h - 2 && !!got.cam && got.cam.z > 0, got ? `world ${got.W} x ${got.H}, camera ${JSON.stringify(got.cam)}` : '');
      const sq = await until(async () => { const v = await look(); return v.square && (v.square.shown || ctx.state().settings.fieldSquare === false) ? v.square : null; }, 6000);
      add('Fountain Square stands in the field (unless it is switched off)', !!sq && (ctx.state().settings.fieldSquare === false ? !sq.shown : sq.shown && sq.blocks.includes('fountain') && sq.blocks.includes('yard')), sq ? `${sq.note}; in the way: ${sq.blocks.join(', ')}` : 'never built');
      const plan = await until(() => js(fw, 'window.fieldPlan && window.fieldPlan.view ? window.fieldPlan : null'));
      const teamN = await js(w, 'G.save.team.length');
      add('the ground is grown from the team, one share each', !!plan && plan.kind === 'team' && plan.species === teamN && plan.shares >= 6, plan ? `${plan.species} Pokémon, ${plan.shares} shares: ${plan.text}` : '');
      add('the field page draws the world the overlay\'s camera shows', !!plan && !!plan.view && !!got && Math.abs(plan.world.W - got.W) <= 1 && Math.abs(plan.view.z - got.cam.z) < 0.001, plan && plan.view ? JSON.stringify(plan.view).slice(0, 120) : 'the field page was never told');
      const settled = await until(async () => { const v = await look(); return v.view && !v.pulling && !v.outside.length ? v : null; }, 9000);
      const last = settled || (await look());
      add('everyone is called inside the field', !!settled, settled ? `${last.team} team members inside ${last.W} x ${last.H}` : `still outside: ${last.outside.join(', ')}`);
      add('sprites are cut off at the field\'s edge again', !last.open);
      report.pictures = report.pictures || [];
      if (await picture(fw, path.join(folder, 'field.png'))) { report.pictures.push('field.png'); add('the field is painted', solidAt(lastPicture, 0.5, 0.5) >= 250 && solidAt(lastPicture, 0.02, 0.02) >= 250); }
      if (await picture(w, path.join(folder, 'overlay-with-field.png'))) report.pictures.push('overlay-with-field.png');
      // What lies over what. 0.7.1 made the overlay belong to the field window; since 0.9.3 (fix 4) it never does: the
      // field window is an ordinary window, the overlay (only the Pokémon) stays on top of everything, and where another
      // window covers the field the scenery is cut away (ps\cover.ps1).
      const owner = w.getParentWindow();
      add('the field window is an ordinary window and the overlay its own, above it (0.9.3)', owner !== fw && !fw.isAlwaysOnTop(), owner === fw ? 'the overlay still belongs to the field window' : fw.isAlwaysOnTop() ? 'the field window is kept on top' : 'as it should be');
      const seen = await dexInFront(fw, folder);
      if (seen) { report.inFront = seen; if (seen.picture) report.pictures.push(seen.picture); add('the Pokédex in front of the field covers the fountain and the Pokémon', seen.ok, seen.note); }
      if (!was) {
        ctx.setSettings({ field: false });
        const down = await until(async () => { const v = await look(); return !v.view ? v : null; }, 6000);
        add('closing the field only drops the barriers', !!down && down.W === down.SW && down.team === last.team && !ctx.state().fieldWin, down ? `the world is ${down.W} x ${down.H} again, ${down.team} team members on the screen` : 'the field stayed');
      }
    });

    // ---- the Android export: what it would pack, and whether the tools to build it are on this computer (nothing is built here)
    // ---- online visiting (0.8): what is set, and that nothing is spoken to while it is switched off. (Whether a visit
    //      really works from this computer is a check of its own that goes online: request "online-check".)
    await stage('online visiting', async () => {
      const o = ctx.online && ctx.online();
      if (!o) { add('online visiting is part of the program', false); return; }
      const v = o.view();
      report.online = { mode: v.mode, hosting: v.hosting.on, stage: v.hosting.stage, visitors: v.hosting.visitors.length, visit: v.visit.state, blocked: v.blocked.length, name: v.name, pointers: v.cursors.filter((c) => c.won).map((c) => c.k) };
      add('online visiting is switched on only by the player', v.mode === 'off' ? !v.hosting.on && v.visit.state === 'idle' : true, v.mode === 'off' ? 'off: nothing is sent or looked for' : `on (${v.mode === 'open' ? 'anyone' : 'friends'})${v.hosting.on ? ', can be visited now' : v.hosting.stage ? '' : ', MyStream is not open'}`);
      add('a name is a class and a number, a friend code has ten characters', /^[A-Z][A-Za-z ]+ \d{4}$/.test(v.name) && /^[A-Z0-9]{5}-[A-Z0-9]{5}$/.test(v.code) && v.lines.length >= 12 && v.cursors.length >= 6, `${v.name}; ${v.cursors.filter((c) => c.won).length} of ${v.cursors.length} pointers won`);
      // the window itself (the friend code is covered for the picture: it is nobody's business but the player's)
      const had = o.window(), hub = o.open();
      const up = await until(() => js(hub, 'typeof Visit !== "undefined" && !!V && document.getElementById("cls").childElementCount > 0'), 9000);
      add('the online window opens', !!up);
      if (up) {
        const facts = await js(hub, '({ hostText: !!document.querySelector("#hostChat #hostText"), fields: document.querySelectorAll("input:not([type=radio]), textarea, [contenteditable]").length, warn: /IP address/.test(document.querySelector(".note.warn").textContent), mode: (document.querySelector("#modes input:checked") || {}).value, ids: [...document.querySelectorAll("[id]")].map((e) => e.id).filter((id, i, a) => a.indexOf(id) !== i) })');
        add('nothing in it takes typed words but a friend\'s code and the host\'s own words to its visitors, and it says that a visit shows the IP address', facts.fields === 2 && facts.hostText && facts.warn && facts.mode === v.mode && !facts.ids.length, JSON.stringify(facts));
        await js(hub, 'document.getElementById("code").textContent = "·····-·····"');
        await sleep(250);
        report.pictures = report.pictures || [];
        if (await picture(hub, path.join(folder, 'online.png'))) report.pictures.push('online.png');
        await js(hub, 'st.ov.view().then(take)');
      }
      if (!had && hub && !hub.isDestroyed()) hub.close();
    });

    await stage('Android export', async () => {
      if (!ctx.exportPlan) return;
      const p = ctx.exportPlan();
      report.export = { ok: p.ok, error: p.error, bytes: p.bytes, sprites: p.sprites, species: p.species, files: (p.entries || []).length, missingFiles: p.missingFiles || 0, tools: p.tools };
      add('the Android export finds the files it would pack', p.sprites > 0 && !(p.missingFiles > 0) && (p.entries || []).length > 20, `${(p.entries || []).length} files, ${Math.round(p.bytes / 1048576)} MB, ${p.sprites} pictures of ${p.species} species`);
      report.exportTools = p.tools && p.tools.ok ? `Android tools found: Java kit ${p.tools.jdk}; SDK ${p.tools.sdk} (build tools ${p.tools.buildTools}, ${p.tools.platform})` : 'Android tools not found on this computer: ' + ((p.tools && p.tools.missing) || []).join(' | ');
    });

    // ---- Mewtwo: what Windows answers (read only), and its window
    await stage('Mewtwo', async () => {
      const t0 = Date.now(), st = await guardian.status({ force: true });
      report.mewtwo = { ms: Date.now() - t0, status: st, profiles: guardian.profiles(), ai: guardian.aiView() };
      if (st.supported) {
        add('Mewtwo reads Windows security', !st.security.error && (!!st.security.defender || !!st.security.defenderError), st.security.error || st.security.defenderError || (st.security.defender ? `Defender ${st.security.defender.enabled ? 'on' : 'off'}, real-time ${st.security.defender.realtime ? 'on' : 'off'}` : ''));
        add('Mewtwo reads the firewall', Array.isArray(st.security.firewall) && st.security.firewall.length > 0, st.security.firewallError || JSON.stringify(st.security.firewall || null));
        add('Mewtwo reads Windows Update', !st.updates.error && !!st.updates.os, st.updates.error || st.updates.pendingError || (st.updates.pending ? `${st.updates.pending.length} waiting` : ''));
        add('Mewtwo reads the hardware', !st.system.error && !!st.system.cpu, st.system.error || (st.system.cpu ? st.system.cpu.name : ''));
        add('Mewtwo reads the power plans', !!(st.power && st.power.ok && st.power.active), st.power && st.power.ok ? `${st.power.activeName}; boost ${JSON.stringify(st.power.boost)}; max ${JSON.stringify(st.power.maxProc)}` : (st.power && st.power.error) || '');
      } else add('Mewtwo says its abilities need Windows', st.advice.length === 1);
      add('Mewtwo has something to say', st.advice.length > 0, st.advice.map((a) => `[${a.tone}] ${a.text}`).join(' | '));
      const wasOpen = !!(s0.guardWin && !s0.guardWin.isDestroyed());
      ctx.openGuardian();
      const w = await until(() => { const g = ctx.state().guardWin; return g && !g.isDestroyed() ? g : null; });
      add("Mewtwo's window opens", !!w);
      if (!w) return;
      const ready = await until(() => js(w, '!!document.querySelector("#watch .card")'), 20000);
      add("Mewtwo's window shows its findings", !!ready);
      const ids = await js(w, '(() => { const all = [...document.querySelectorAll("[id]")].map((e) => e.id); return all.filter((id, i) => all.indexOf(id) !== i); })()');
      add("no element id is used twice in Mewtwo's window", ids.length === 0, ids.join(', '));
      report.pictures = report.pictures || [];
      for (const tab of ['watch', 'tune', 'ask', 'guard', 'backup']) {
        await js(w, `document.querySelector('#tabs [data-tab="${tab}"]').click()`); await sleep(500);
        if (tab === 'guard') {      // (0.9.9) the AI watch: it only reads
          const seen = await until(() => js(w, '(() => { const b = document.querySelector("#guardBody [data-ai=scan]"); return b && !b.disabled && /Last looked/.test(document.getElementById("guardBody").textContent) ? [...document.querySelectorAll("#guardBody .entry.ai b")].map((e) => e.textContent) : null; })()'), 45000);
          add('Mewtwo looks for AI programs (read only)', Array.isArray(seen), Array.isArray(seen) ? (seen.join(', ') || 'none here') : 'no answer');
        }
        if (tab === 'backup') add("Mewtwo's backup tab is drawn", await js(w, '!!document.querySelector("#backupBody [data-bk=walk]") && document.querySelectorAll("#backupBody [data-bk=profile]").length === 4'));
        if (tab !== 'watch') { if (await picture(w, path.join(folder, `mewtwo-${tab}.png`))) report.pictures.push(`mewtwo-${tab}.png`); continue; }
        const body = await bodyDrawn(w, '#unit', path.join(folder, 'mewtwo-watch.png'));
        report.mewtwo.window = body; report.pictures.push('mewtwo-watch.png');
        add("Mewtwo's window is drawn with its body", body.ok || body.setting === 'system', `solid ${body.alpha} of 255`);
      }
      await js(w, 'document.querySelector(\'#tabs [data-tab="watch"]\').click()');
      if (!wasOpen) w.close();
    });
    // ---- (0.9.9) Rotom's window: the big tidy-up's first question. Nothing is chosen, looked through or moved.
    if (ctx.openOptimize) await stage('Rotom', async () => {
      const was = ctx.state().optWin, open0 = !!(was && !was.isDestroyed());
      ctx.openOptimize();
      const w = await until(() => { const o = ctx.state().optWin; return o && !o.isDestroyed() ? o : null; });
      add("Rotom's window opens", !!w);
      if (!w) return;
      const ready = await until(() => js(w, '!!document.querySelector("#big button")'), 15000);
      add("Rotom's window offers the big tidy-up", !!ready);
      await sleep(400);
      report.pictures = report.pictures || [];
      if (await picture(w, path.join(folder, 'rotom.png'))) report.pictures.push('rotom.png');
      if (!open0) w.close();
    });
    // ---- (1.0) what 1.0 added: the Field Dex top, the new Options, the mixer (read only), the Escape Rope's plan (read only), mods and forks
    await stage('1.0', async () => {
      const was = ctx.state().panel, open0 = !!(was && !was.isDestroyed());
      ctx.openPanel('options');
      const w = await until(() => { const p = ctx.state().panel; return p && !p.isDestroyed() ? p : null; });
      if (!w) { add('1.0: the Pokédex window opens', false); return; }
      await until(() => js(w, '!!document.getElementById("ropeGo")'), 8000);
      const top = await js(w, '(() => { const r = document.getElementById("readout"); return { text: r ? r.textContent : null, w: r ? Math.round(r.getBoundingClientRect().width) : -1 }; })()');
      add('1.0: "caught and seen" is gone from the top of the Field Dex', top && top.text === '' && top.w <= 2, JSON.stringify(top));
      const rows = await js(w, '["masterVolume","criesVolume","ropeGo","modsList","forkList","modsAgain","forkSave"].filter((id) => !document.getElementById(id))');
      add('1.0: the new Options are there (volume sliders, Escape Rope, mods, forks)', Array.isArray(rows) && rows.length === 0, rows && rows.length ? 'missing: ' + rows.join(', ') : '');
      await js(w, 'document.getElementById("modsList").scrollIntoView({ block: "center" })'); await sleep(500);
      if (await picture(w, path.join(folder, 'pokedex-mods.png'))) { report.pictures = report.pictures || []; report.pictures.push('pokedex-mods.png'); }
      if (ctx.extra) {
        const x = await ctx.extra();
        report.v100 = x;
        add('1.0: mods are read and checked', !!x.mods, x.mods ? `${x.mods.mods.length} in ${x.mods.dir}; ${x.mods.mods.filter((m) => m.on).length} on; ${x.mods.mods.filter((m) => !m.ok).length} with a mistake` : 'no answer');
        add('1.0: the Escape Rope knows what it would pack (read only)', !!(x.rope && x.rope.files > 0), x.rope ? `${x.rope.root}: ${x.rope.files} files, ${Math.round(x.rope.bytes / 1e6)} MB (${Math.round(x.rope.leanBytes / 1e6)} MB of it backups, shared copies, self-checks)` : 'no answer');
        add('1.0: forks', !!x.forks, x.forks ? (x.forks.fork ? `this is the fork "${x.forks.fork}"` : `${x.forks.list.length} fork(s) in ${x.forks.dir}`) : 'no answer');
        if (process.platform === 'win32') add('1.0: MyStream can read the Windows volume mixer (read only)', !!(x.mixer && x.mixer.ok), x.mixer ? (x.mixer.ok ? `${x.mixer.sessions} program(s) with a slider right now` : String(x.mixer.error || '')) : 'no answer');
      }
      // pictures for the how-to videos (nothing is changed or loaded): Save data, a saved game's preview, the Escape Rope's question
      const pic = async (win, name) => { if (await picture(win, path.join(folder, name))) { report.pictures = report.pictures || []; report.pictures.push(name); return true; } return false; };
      // (the category is shown with inline styles of its own (the page's CSP blocks a <style>), so the player's folds are not touched and nothing re-folds it meanwhile)
      await js(w, '(() => { const g = document.querySelector(\'#optBody .group[data-group="save"]\'); if (!g) return; g.querySelector(".gbody").style.setProperty("display", "block", "important"); const c = g.querySelector(".fold .chev"); if (c) c.style.setProperty("transform", "none", "important"); const sm = g.querySelector(".fold small"); if (sm) sm.style.setProperty("visibility", "hidden", "important"); g.scrollIntoView({ block: "start" }); })()');
      await sleep(500);
      add('1.0: a picture of Save data (saved games, Escape Rope)', await pic(w, 'pokedex-save.png'));
      const prev = ctx.savePreview ? ctx.savePreview() : null;
      if (prev) {
        await js(w, `window.__stOfferShown(${JSON.stringify(prev)})`); await sleep(300);
        await js(w, 'document.getElementById("saveNote").scrollIntoView({ block: "center" })'); await sleep(300);
        add('1.0: a picture of a saved game\'s preview (nothing is loaded)', await pic(w, 'pokedex-save-preview.png'), `${prev.summary.team} on the team, ${prev.summary.species} species`);
        await js(w, 'window.__stOfferShown(null)');
      }
      await js(w, '(() => { const g = document.querySelector(\'#optBody .group[data-group="save"]\'); if (!g) return; for (const el of [g.querySelector(".gbody"), g.querySelector(".fold .chev"), g.querySelector(".fold small")]) if (el) el.removeAttribute("style"); })()');
      if (ctx.ropeQuestion && ctx.BrowserWindow) {
        const q = ctx.ropeQuestion(), esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;');
        fs.writeFileSync(path.join(folder, 'escape-rope-question.txt'), [q.title, '', q.message, '', q.detail, '', q.checkboxLabel ? '[ ] ' + q.checkboxLabel : '', '', q.buttons.join('   ')].join('\r\n'));
        const html = `<!doctype html><meta charset="utf-8"><body style="margin:0;font:14px 'Segoe UI',sans-serif;background:#fff;color:#000"><div style="height:30px;line-height:30px;padding:0 12px;font-size:12px;border-bottom:1px solid #e5e5e5">${esc(q.title)}</div><div style="padding:16px 20px 12px 64px;position:relative"><div style="position:absolute;left:18px;top:16px;width:32px;height:32px;border-radius:50%;background:#0067c0;color:#fff;font:bold 22px/32px 'Segoe UI';text-align:center">?</div><div style="font-size:17px;color:#1c3d8f;margin-bottom:10px">${esc(q.message)}</div><div style="white-space:pre-wrap;line-height:1.4">${esc(q.detail)}</div></div><div style="background:#f0f0f0;padding:12px 16px;display:flex;align-items:center;gap:8px;border-top:1px solid #dfdfdf">${q.checkboxLabel ? `<label style="flex:1;font-size:13px"><input type="checkbox"> ${esc(q.checkboxLabel)}</label>` : '<span style="flex:1"></span>'}${q.buttons.map((b, i) => `<button style="min-width:96px;padding:4px 10px;font:13px 'Segoe UI';${i === q.defaultId ? 'border:2px solid #0067c0;' : ''}">${esc(b)}</button>`).join('')}</div></body>`;
        const qw = new ctx.BrowserWindow({ width: 640, height: 320, show: false, frame: false, webPreferences: { sandbox: true, contextIsolation: true, javascript: false } });
        try {
          await qw.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html)); await sleep(400);
          add('1.0: a picture of the Escape Rope\'s question (drawn from the same words, nothing packed)', await pic(qw, 'escape-rope-question.png'));
        } finally { qw.destroy(); }
      }
      if (!open0) w.close();
    });

    report.passed = checks.filter((c) => c.ok).length; report.failed = checks.filter((c) => !c.ok).length;
    const lines = [`Screen Trainer ${ctx.version} self-check, ${report.at} (${why})`, `${report.system}, Electron ${report.electron}`, `${report.passed} passed, ${report.failed} failed`, '',
      ...checks.map((c) => `${c.ok ? 'ok    ' : 'FAILED'}  ${c.name}${c.detail ? '   [' + String(c.detail).slice(0, 400) + ']' : ''}`), '', report.exportTools || '', 'Pictures: ' + (report.pictures || []).join(', ')];
    fs.writeFileSync(path.join(folder, 'report.json'), JSON.stringify(report, null, 2));
    fs.writeFileSync(path.join(folder, 'summary.txt'), lines.join('\r\n'));
    try { fs.writeFileSync(path.join(base, 'latest.txt'), [stamp, ...lines].join('\r\n')); } catch (e) { /* the dated folder has it */ }
    return { ok: report.failed === 0, dir: folder, stamp, passed: report.passed, failed: report.failed, checks };
  }
  return { run };
}

module.exports = { create, dir };
