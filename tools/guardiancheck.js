#!/usr/bin/env node
// Screen Trainer — checks for Mewtwo's abilities (guardian.js) without Windows.
//
//   node tools/guardiancheck.js            everything below, a second or two
//
// guardian.js reaches Windows only through one function, `run`. Here that function is replaced by a pretend
// computer (class Pretend): it answers PowerShell, powercfg, reg and ipconfig the way Windows does and keeps
// its own power plans and settings, so profiles can be applied and undone for real and compared.
// What this cannot tell you is whether real Windows answers the same way: for that, run the program's
// self-check on a Windows machine (tray > Developer > Run self-check), which records the real answers.
//
// Exit code 1 when a check fails.
'use strict';
const path = require('path'), os = require('os'), fs = require('fs'), http = require('http');
const G = require(path.join(__dirname, '..', 'guardian.js'));
const T = G._test;
let bad = 0, n = 0;
const check = (ok, msg) => { n++; if (!ok) { bad++; console.log('  PROBLEM  ' + msg); } };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const HEX = (v) => '0x' + v.toString(16).padStart(8, '0');
class Pretend {
  constructor(o = {}) {
    this.plans = o.plans || { [T.PLAN.balanced]: 'Balanced', [T.PLAN.high]: 'High performance', [T.PLAN.saver]: 'Power saver' };
    this.active = T.PLAN.balanced;
    this.proc = {}; for (const g of Object.keys(this.plans)) this.proc[g] = { [T.SET.boost]: { ac: 1, dc: 1 }, [T.SET.maxProc]: { ac: 100, dc: 100 } };
    if (o.noBoost) for (const g of Object.keys(this.plans)) delete this.proc[g][T.SET.boost];
    this.gameMode = o.gameMode === undefined ? null : o.gameMode;
    this.defender = Object.assign({ enabled: true, realtime: true, service: true, tamper: true, mode: 'Normal', sigAge: 0, sigVersion: '1.401.622.0', sigDate: '2026-11-11T03:12:00', quickAge: 2, fullAge: 4294967295 }, o.defender || {});
    this.firewall = o.firewall || [{ name: 'Domain', on: true }, { name: 'Private', on: true }, { name: 'Public', on: true }];
    this.pending = o.pending || [];
    this.calls = []; this.refuse = o.refuse || null; this.dns = 0; this.scans = 0; this.sigUpdates = 0;
  }
  snapshot() { return JSON.stringify({ active: this.active, proc: this.proc, gameMode: this.gameMode }); }
  qh() {
    let out = `Power Scheme GUID: ${this.active}  (${this.plans[this.active]})\n  Subgroup GUID: ${T.SUB_PROCESSOR}  (Processor power management)\n    GUID Alias: SUB_PROCESSOR\n`;
    for (const [guid, v] of Object.entries(this.proc[this.active])) out += `    Power Setting GUID: ${guid}  (a setting)\n      GUID Alias: X\n      Minimum Possible Setting: 0x00000000\n      Maximum Possible Setting: 0x00000064\n      Possible Settings increment: 0x00000001\n      Possible Settings units: %\n    Current AC Power Setting Index: ${HEX(v.ac)}\n    Current DC Power Setting Index: ${HEX(v.dc)}\n\n`;
    return out;
  }
  async run(file, args, opts) {
    const exe = path.basename(file).toLowerCase(), ok = (out) => ({ ok: true, code: 0, out, err: '', ms: 1 }), no = (err) => ({ ok: false, code: 1, out: '', err, ms: 1 });
    this.calls.push([exe, ...args].join(' ').slice(0, 200));
    if (this.refuse && this.refuse.test([exe, ...args].join(' '))) return no('Access is denied.');
    if (exe === 'powercfg.exe') {
      if (args[0] === '/list') return ok('\nExisting Power Schemes (* Active)\n-----------------------------------\n' + Object.entries(this.plans).map(([g, name]) => `Power Scheme GUID: ${g}  (${name})${g === this.active ? ' *' : ''}`).join('\n') + '\n');
      if (args[0] === '/qh') return ok(this.qh());
      if (args[0] === '/setactive') { const g = args[1] === 'SCHEME_CURRENT' ? this.active : args[1]; if (!this.plans[g]) return no('Invalid Parameters -- try "/?" for help'); this.active = g; return ok(''); }
      if (args[0] === '/setacvalueindex') { const g = args[1] === 'SCHEME_CURRENT' ? this.active : args[1], set = this.proc[g] && this.proc[g][args[3]]; if (!set || args[2] !== T.SUB_PROCESSOR) return no('The power scheme, subgroup or setting specified does not exist.'); set.ac = +args[4]; return ok(''); }
    }
    if (exe === 'reg.exe') {
      if (args[0] === 'add') { this.gameMode = +args[args.indexOf('/d') + 1]; return ok('The operation completed successfully.'); }
      if (args[0] === 'delete') { if (this.gameMode === null) return no('ERROR: The system was unable to find the specified registry key or value.'); this.gameMode = null; return ok('The operation completed successfully.'); }
    }
    if (exe === 'ipconfig.exe') { this.dns++; return ok('Successfully flushed the DNS Resolver Cache.'); }
    if (exe === 'cmd.exe') return ok('');
    if (exe === 'powershell.exe') {
      const i = args.indexOf('-File'), file = i >= 0 ? args[i + 1] : '', script = path.basename(file, '.ps1');
      if (!fs.existsSync(file)) return no('The argument does not exist: ' + file);
      if (script === 'security') return ok(JSON.stringify({ defender: this.defender, firewall: this.firewall.length === 1 ? this.firewall[0] : this.firewall, products: this.products || 'Windows Defender', threats: 0 }));
      if (script === 'updates') return ok(JSON.stringify({ os: { name: 'Microsoft Windows 11 Home', version: '10.0.26100', build: '26100', boot: '2026-11-10T08:00:00' }, reboot: false, lastPatch: { id: 'KB5044284', on: '2026-10-28T00:00:00' }, pending: this.pending }));
      if (script === 'system') return ok('WARNING: something chatty\n' + JSON.stringify({ cpu: { name: 'Pretend CPU', cores: 8, threads: 16, mhz: 3200 }, gpu: 'Pretend GPU', disks: { id: 'C:', size: 512e9, free: 200e9 }, battery: { pct: 80, status: 2 }, top: [{ name: 'chrome', n: 12, mb: 2100 }, { name: 'ScreenTrainer', n: 4, mb: 420 }], startup: [{ name: 'OneDrive', where: 'HKCU' }], gameMode: this.gameMode }));
      if (script === 'sigupdate') { this.sigUpdates++; this.defender.sigAge = 0; return ok('done'); }
      if (script === 'quickscan') { this.scans++; this.defender.quickAge = 0; return ok('done'); }
      if (script === 'winget') return ok('Name      Id          Version  Available  Source\n-------------------------------------------------\nFirefox   Mozilla.FF  131.0    132.0      winget\n1 upgrades available.\n');
    }
    return no('pretend computer: unknown command ' + exe);
  }
}
function use(pc, settings) {
  const st = Object.assign({ paused: false, fxLevel: 'chaos', weatherFreq: 3, legendEvents: 'rare', guardianAlerts: true }, settings || {});
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'st-guardian-'));
  const said = [];
  T.reset(); T.setWindows(true); T.setRun((f, a, o) => pc.run(f, a, o));
  G.init({ userDir: dir, safeStorage: null, shell: { openExternal: async (u) => { pc.calls.push('open ' + u); } }, getSettings: () => st, setSettings: (p) => Object.assign(st, p), say: (m) => said.push(m), noWatch: true });
  return { st, dir, said };
}

module.exports = { Pretend };          // the pretend computer is also handy for showing Mewtwo's window without Windows
if (require.main === module) (async () => {
  // ---- 0. the script files Mewtwo hands to PowerShell
  console.log('the PowerShell scripts');
  {
    const dir = path.join(__dirname, '..', 'ps'), files = fs.readdirSync(dir).sort();
    // one more script lives there since 0.6 and is not Mewtwo's: windows.ps1, which MyStream uses to list windows and to move a game's window (mystream.js)
    const OTHERS = ['windows.ps1', 'cover.ps1', 'pointer.ps1', 'aiwatch.ps1', 'appvolume.ps1'];      // (0.9.9: aiwatch.ps1 is sentinel.js's, read-only; 1.0: appvolume.ps1 is MyStream's, a game's own volume)
    const ELEVATED = ['aiblock.ps1'];      // (0.9.9, the owner's decision: the one script that asks Windows for administrator rights, to add or remove one firewall rule for one program; checked on its own below)
    // (and since 0.9.3 cover.ps1: main.js asks it what covers the field window; since 0.9.4 pointer.ps1: MyStream asks where the games' windows are. Both only read where windows are.)
    {
      const t = fs.readFileSync(path.join(dir, 'aiblock.ps1'), 'utf8');
      check(/^[\x09\x0a\x0d\x20-\x7e]*$/.test(t), 'aiblock.ps1 must be plain ASCII');
      check(!/Remove-Item|\bdel\b|\brm\b|Invoke-Expression|\biex\b|Invoke-WebRequest|DownloadString|Start-BitsTransfer|Set-MpPreference|Add-MpPreference|Set-ExecutionPolicy|Stop-Process|Stop-Service|Set-Service|New-Service|schtasks|bcdedit|Format-|Clear-Disk|Set-ItemProperty|New-ItemProperty|Remove-ItemProperty|EncodedCommand|Set-NetFirewallProfile|Disable-NetFirewallRule|Set-NetFirewallRule|netsh/i.test(t), 'aiblock.ps1 does more than its two firewall rules');
      check((t.match(/New-NetFirewallRule -DisplayName \$name /g) || []).length === 2 && (t.match(/Remove-NetFirewallRule/g) || []).length === 1 && /Get-NetFirewallRule -DisplayName \$name [^|]*\| Remove-NetFirewallRule/.test(t) && (t.match(/-Verb RunAs/g) || []).length === 1, 'aiblock.ps1 should add two rules of its own name, remove only those, and ask for administrator rights once');
      check(/\$Program -notmatch '\^\[A-Za-z\]:/.test(t), 'aiblock.ps1 must check the program path itself');
    }
    check(same(files.filter((f) => !OTHERS.includes(f) && !ELEVATED.includes(f)), T.SCRIPTS.map((n) => n + '.ps1').sort()), 'the ps folder should hold exactly the scripts guardian.js knows (and windows.ps1, cover.ps1, pointer.ps1): ' + files.join(', '));
    const readers = ['security', 'updates', 'system', 'winget'];
    // nothing that deletes, downloads, runs other code, changes Defender or asks for administrator rights
    const never = /Remove-Item|\bdel\b|\brm\b|Invoke-Expression|\biex\b|Invoke-WebRequest|DownloadString|Start-BitsTransfer|Set-MpPreference|Add-MpPreference|Remove-MpThreat|Set-ExecutionPolicy|-Verb\s+RunAs|Stop-Process|Stop-Service|Set-Service|New-Service|schtasks|bcdedit|Format-|Clear-Disk|Set-ItemProperty|New-ItemProperty|Remove-ItemProperty|EncodedCommand/i;
    const writes = /Update-MpSignature|Start-MpScan|Set-|New-Item|Out-File|Add-Content|Set-Content/i;
    for (const f of OTHERS.filter((x) => files.includes(x))) {
      const text = fs.readFileSync(path.join(dir, f), 'utf8');
      check(/^[\x09\x0a\x0d\x20-\x7e]*$/.test(text), `${f} must be plain ASCII`);
      check(!never.test(text), `${f} contains a command that has no business there: ${(never.exec(text) || [])[0]}`);
    }
    for (const n of T.SCRIPTS) {
      const text = fs.readFileSync(T.scriptFile(n), 'utf8');
      check(/^[\x09\x0a\x0d\x20-\x7e]*$/.test(text), `${n}.ps1 must be plain ASCII`);
      check(!never.test(text), `${n}.ps1 contains a command that has no business there: ${(never.exec(text) || [])[0]}`);
      if (readers.includes(n)) check(!writes.test(text), `${n}.ps1 is a reading script but contains a command that changes something: ${(writes.exec(text) || [])[0]}`);
      check((text.match(/\{/g) || []).length === (text.match(/\}/g) || []).length && (text.match(/\(/g) || []).length === (text.match(/\)/g) || []).length, `${n}.ps1 has unbalanced brackets`);
    }
    // every name guardian.js reads from the JSON is written by the script that should provide it
    for (const [n, names] of [['security', ['defender', 'enabled', 'realtime', 'sigAge', 'quickAge', 'firewall', 'products', 'threats', 'defenderError', 'firewallError']], ['updates', ['os', 'build', 'reboot', 'lastPatch', 'pending', 'pendingError', 'title']], ['system', ['cpu', 'cores', 'threads', 'gpu', 'disks', 'free', 'size', 'battery', 'pct', 'status', 'top', 'mb', 'startup', 'gameMode']]]) {
      const text = fs.readFileSync(T.scriptFile(n), 'utf8');
      for (const name of names) check(new RegExp('(\\$o\\.|\\b)' + name + '\\s*=').test(text), `${n}.ps1 never sets "${name}", which guardian.js reads`);
    }
  }

  // ---- 1. reading
  console.log('reading the pretend computer');
  {
    const pc = new Pretend({ firewall: [{ name: 'Public', on: true }] }); use(pc);
    const s = await G.status();
    check(s.supported && s.security.defender.enabled && s.security.firewall.length === 1 && s.security.products.length === 1, 'security answers are not read correctly (one-item lists must stay lists)');
    check(s.updates.os.build === '26100' && Array.isArray(s.updates.pending), 'update answers are not read correctly');
    check(s.system.cpu.cores === 8 && s.system.disks.length === 1 && s.system.gpu.length === 1 && s.system.top.length === 2, 'system answers are not read correctly (chatty warnings before the JSON must be skipped)');
    check(s.power.ok && s.power.plans.length === 3 && s.power.active === T.PLAN.balanced && same(s.power.boost, { ac: 1, dc: 1 }) && same(s.power.maxProc, { ac: 100, dc: 100 }), 'power plans or processor settings are not read correctly: ' + JSON.stringify(s.power));
    check(s.advice.length === 1 && s.advice[0].tone === 'ok', 'a healthy computer should get one calm line, got: ' + JSON.stringify(s.advice));
    check(typeof s.vitals.load === 'number' && s.vitals.memTotal > 0, 'vitals are missing');
  }
  {
    const pc = new Pretend({ defender: { realtime: false, sigAge: 12, quickAge: 4294967295 }, firewall: [{ name: 'Private', on: true }, { name: 'Public', on: false }], pending: [{ title: 'Update A', downloaded: true }] }); use(pc);
    const s = await G.status(), texts = s.advice.map((a) => a.text).join(' | ');
    check(s.advice[0].tone === 'bad' && /Real-time protection is off/.test(texts) && /12 days old/.test(texts) && /No quick scan has ever/.test(texts) && /firewall is off for: Public/.test(texts) && /1 Windows update is waiting/.test(texts), 'problems are not all pointed out: ' + texts);
    check(s.advice.every((a) => !a.act || G.ACTIONS[a.act]), 'advice names an ability that does not exist');
  }
  {  // another antivirus is the active one and Defender is in passive mode: that is normal, not an alarm (seen on a real PC)
    const pc = new Pretend({ defender: { realtime: false, mode: 'SxS Passive Mode', quickAge: 30, sigAge: 9 } });
    pc.products = ['Windows Defender', 'AVG Antivirus']; use(pc);
    const s = await G.status(), texts = s.advice.map((a) => `[${a.tone}] ${a.text}`).join(' | ');
    check(!s.advice.some((a) => a.tone === 'bad' || /Real-time|definitions|quick scan/i.test(a.text)) && /AVG Antivirus is guarding/.test(texts), 'Defender in passive mode behind another antivirus must not raise an alarm: ' + texts);
    check(/AVG Antivirus is the antivirus guarding/.test((await G.ask([{ role: 'user', content: 'am I protected?' }])).text), 'Mewtwo\'s own answer should name the active antivirus');
  }
  check(same(G.parseSetting('Power Setting GUID: ' + T.SET.boost + ' (x)\n Possible Setting Index: 000\n Current AC Power Setting Index: 0x00000002\n Current DC Power Setting Index: 0x00000000\n', T.SET.boost), { ac: 2, dc: 0 }), 'boost mode with named choices is not read');
  check(G.parseSetting('nothing here', T.SET.boost) === null, 'a missing setting should read as null');
  check(G.parsePlans('Energieschema-GUID: ' + T.PLAN.balanced + '  (Ausbalanciert) *').length === 1, 'power plans in another Windows language are not read');

  // ---- 2. every profile, applied and undone, on several kinds of PC
  console.log('profiles: apply and undo');
  for (const [label, mk] of [['desktop', () => new Pretend()], ['laptop with only Balanced', () => new Pretend({ plans: { [T.PLAN.balanced]: 'Balanced' } })], ['no boost setting', () => new Pretend({ noBoost: true })], ['Game Mode off', () => new Pretend({ gameMode: 0 })], ['Windows refuses writes', () => new Pretend({ refuse: /setacvalueindex|reg\.exe add/ })]]) {
    for (const id of ['gaming', 'overclock', 'everyday', 'custom']) {
      const pc = mk(), env = use(pc), st0 = JSON.stringify(env.st), pc0 = pc.snapshot();
      if (id === 'custom') check(G.saveCustom({ plan: 'saver', boost: 0, maxProc: 80, gameMode: false, flushDns: true, quiet: true }).ok, 'could not save a custom profile');
      const r = await G.applyProfile(id);
      check(r.ok, `${label}/${id}: did not apply: ${r.text}`);
      check(Array.isArray(r.did) && Array.isArray(r.skipped) && r.did.length + r.skipped.length > 0 || id === 'everyday', `${label}/${id}: says nothing about what it did`);
      const mid = await G.status({ force: true });
      check(mid.applied && mid.applied.id === id, `${label}/${id}: not reported as in effect`);
      const u = await G.undoProfile();
      check(u.ok && pc.snapshot() === pc0 && JSON.stringify(env.st) === st0, `${label}/${id}: undo did not put everything back\n     before ${pc0}\n     after  ${pc.snapshot()}\n     settings ${JSON.stringify(env.st)}`);
      check(!(await G.undoProfile()).ok, `${label}/${id}: undo twice should say there is nothing to undo`);
    }
  }
  {  // what the two named profiles actually do on an ordinary desktop
    const pc = new Pretend(), env = use(pc);
    await G.applyProfile('gaming');
    check(pc.active === T.PLAN.high && pc.gameMode !== 0 && pc.dns === 1 && env.st.paused === true && env.st.fxLevel === 'low', 'Online gaming does not do what it says');
    await G.applyProfile('overclock');                    // switching profiles undoes the first one first
    check(pc.active === T.PLAN.high && pc.proc[T.PLAN.high][T.SET.boost].ac === 2 && pc.gameMode === null && env.st.paused === false, 'Limited overclock does not do what it says, or the profile before it was not undone');
    check(pc.proc[T.PLAN.high][T.SET.boost].dc === 1 && pc.proc[T.PLAN.balanced][T.SET.boost].ac === 1, 'Limited overclock touched battery values or another plan');
    await G.undoProfile();
    check(pc.snapshot() === new Pretend().snapshot(), 'two profiles in a row did not undo cleanly');
    check(G.log().length >= 3 && G.log()[0].what.startsWith('Undid'), 'profile changes are not in the log');
    check(!pc.calls.some((c) => /runas|-verb|bcdedit|schtasks|remove-item|del /i.test(c)), 'a command that has no business here was run');
  }

  // ---- 3. only clean input reaches a command line
  console.log('input that must be refused');
  {
    const pc = new Pretend(); use(pc);
    const before = pc.calls.length;
    for (const evil of ['; calc.exe', '381b4222-f694-41f0-9685-ff5bb260df2e & calc', '../../x', '', null, 42, { a: 1 }, 'SCHEME_CURRENT']) { const r = await G.act('power.plan', evil); check(!r.ok, 'accepted a power plan that is not one: ' + JSON.stringify(evil)); }
    check(!pc.calls.slice(before).some((c) => /setactive/.test(c)), 'a bad power plan reached powercfg');
    check(!(await G.act('rm -rf', 1)).ok && !(await G.act('__proto__')).ok && !(await G.act('constructor')).ok && !(await G.act(null)).ok, 'an unknown ability was accepted');
    check(!(await G.applyProfile('constructor')).ok && !(await G.applyProfile('__proto__')).ok && !(await G.applyProfile({})).ok, 'an unknown profile was accepted');
    check(G.aiSet({ provider: 'constructor' }).provider === 'none' && G.aiSet({ provider: '__proto__' }).provider === 'none', 'an unknown AI service was accepted');
    check(same(G.cleanSteps({ plan: 'format c:', boost: 99, maxProc: '100', gameMode: 'true', flushDns: 'yes', quiet: 1, evil: 'x' }), { plan: 'keep', boost: 'keep', maxProc: 100, gameMode: true, flushDns: false, quiet: false }), 'cleanSteps lets unknown values through: ' + JSON.stringify(G.cleanSteps({ plan: 'format c:', boost: 99, maxProc: '100', gameMode: 'true', flushDns: 'yes', quiet: 1, evil: 'x' })));
    check(G.cleanSteps(null) === null && G.cleanSteps('x') === null, 'cleanSteps should refuse things that are not profiles');
    const p = G.extractProposal('Here you go.\nPROFILE {"plan":"high","boost":2,"maxProc":100,"gameMode":true,"flushDns":false,"quiet":true,"run":"calc"}');
    check(p.text === 'Here you go.' && p.proposal && p.proposal.steps.plan === 'high' && !('run' in p.proposal.steps) && p.proposal.does.length === 5, 'a profile proposed by an AI is not read or not cleaned');
    check(G.extractProposal('PROFILE {oops').proposal === null && G.extractProposal('no profile here').proposal === null, 'a broken proposal should simply be ignored');
    const r = await G.act('open.update'); check(r.ok && pc.calls.includes('open ms-settings:windowsupdate'), 'opening a Windows settings page failed');
  }
  { const pc = new Pretend(); use(pc); const a = await G.act('defender.quickscan'), b = await G.act('defender.update'), c = await G.act('net.flushdns'), d = await G.act('apps.check'), e = await G.act('updates.check');
    check(a.ok && pc.scans === 1 && b.ok && pc.sigUpdates === 1 && c.ok && pc.dns === 1 && d.ok && d.items.length === 1 && e.ok && /up to date/.test(e.text), 'an ability did not run: ' + JSON.stringify([a, b, c, d, e].map((x) => x.text)));
    check(G.log().length === 3, 'abilities that change something must be logged, the others not'); }
  { T.reset(); T.setWindows(false); G.init({ userDir: fs.mkdtempSync(path.join(os.tmpdir(), 'st-guardian-')), noWatch: true });
    const s = await G.status(); check(!s.supported && s.advice.length === 1 && !(await G.act('net.flushdns')).ok && !(await G.applyProfile('gaming')).ok, 'on another system the abilities must say they need Windows'); }

  // ---- 4. asking: Mewtwo's own answers, and the two wire formats against a local stand-in service
  console.log('asking');
  {
    const pc = new Pretend({ defender: { sigAge: 9 } }); use(pc);
    for (const q of ['who are you?', 'am I safe from viruses?', 'any updates?', 'can you overclock my pc?', 'my game lags', 'why is it slow', 'how much disk space', 'battery?', 'what starts at boot', 'tell me a story']) {
      const r = await G.ask([{ role: 'user', content: q }]);
      check(r.ok && r.by === 'Mewtwo' && r.text.length > 40 && !/undefined|NaN|\[object/.test(r.text), `own answer to "${q}" is broken: ${r.text}`);
    }
    check(/9 days old/.test((await G.ask([{ role: 'user', content: 'security?' }])).text), 'own answers should use what was read');
    check(!(await G.ask([])).ok && !(await G.ask([{ role: 'assistant', content: 'hi' }])).ok, 'an empty question should be turned down');
  }
  {
    const seen = [];
    const server = http.createServer((req, res) => {
      let body = ''; req.on('data', (c) => { body += c; }); req.on('end', () => {
        seen.push({ url: req.url, method: req.method, headers: req.headers, body: body ? JSON.parse(body) : null });
        res.setHeader('content-type', 'application/json');
        if (req.headers.authorization === 'Bearer wrong' || req.headers['x-api-key'] === 'wrong') { res.statusCode = 401; res.end(JSON.stringify({ error: { message: 'bad key' } })); }
        else if (req.url === '/v1/models') res.end(JSON.stringify({ data: [{ id: 'qwen-test' }] }));
        else if (req.url === '/v1/chat/completions') res.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: '<think>hm</think>All is well.\nPROFILE {"plan":"balanced","boost":1,"maxProc":99,"gameMode":"keep","flushDns":false,"quiet":false}' } }] }));
        else if (req.url === '/v1/messages') res.end(JSON.stringify({ type: 'message', content: [{ type: 'thinking', thinking: 'x' }, { type: 'text', text: 'I see nothing amiss.' }] }));
        else { res.statusCode = 404; res.end('{}'); }
      });
    });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    const base = `http://127.0.0.1:${server.address().port}/v1`;
    const pc = new Pretend(); use(pc);
    let v = G.aiSet({ provider: 'local', url: base + '/', model: 'qwen-test' });
    check(v.provider === 'local' && v.url === base && v.share === true && !v.hasKey, 'local AI settings are not kept: ' + JSON.stringify(v));
    check(same((await G.aiModels()).models, ['qwen-test']), 'the model list of a local server is not read');
    let r = await G.ask([{ role: 'user', content: 'How is my PC?' }]);
    const sent = seen[seen.length - 1];
    check(r.ok && r.text === 'All is well.' && r.proposal && r.proposal.steps.maxProc === 99, 'the OpenAI-style answer is not read: ' + JSON.stringify(r));
    check(sent.url === '/v1/chat/completions' && sent.body.model === 'qwen-test' && sent.body.messages[0].role === 'system' && /Pretend CPU/.test(sent.body.messages[0].content) && sent.body.messages[1].content === 'How is my PC?' && !sent.headers.authorization, 'the OpenAI-style request is wrong');
    G.aiSet({ share: false }); await G.ask([{ role: 'user', content: 'hello' }]);
    check(!/Pretend CPU|chrome/.test(seen[seen.length - 1].body.messages[0].content), 'details of the computer were sent although sharing is off');
    // a keyed service in OpenAI format, pointed at the stand-in
    v = G.aiSet({ provider: 'custom', url: base, model: 'm', key: 'sekrit' });
    check(v.hasKey && v.share === false && !JSON.stringify(v).includes('sekrit'), 'the key must be held but never handed back to the window; sharing starts off for a service that is not on this PC');
    await G.ask([{ role: 'user', content: 'hi' }]);
    check(seen[seen.length - 1].headers.authorization === 'Bearer sekrit', 'the key is not sent as a Bearer token');
    G.aiSet({ key: 'wrong' }); r = await G.ask([{ role: 'user', content: 'is my pc safe' }]);
    check(!r.ok && /did not accept the API key/.test(r.text) && /Microsoft Defender is on/.test(r.text), 'a refused key should be explained, with Mewtwo\'s own answer after it: ' + r.text);
    // the Anthropic wire format, by pointing the claude provider's address at the stand-in for this check only
    const real = G.PROVIDERS.claude.url; G.PROVIDERS.claude.url = base;
    v = G.aiSet({ provider: 'claude', key: 'k-123' });
    check(v.model === 'claude-haiku-5-5' && v.hasKey, 'Claude defaults are missing');
    r = await G.ask([{ role: 'assistant', content: 'stray' }, { role: 'user', content: 'first' }, { role: 'assistant', content: 'second' }, { role: 'user', content: 'third' }]);
    const m = seen[seen.length - 1];
    check(r.ok && r.text === 'I see nothing amiss.' && m.url === '/v1/messages' && m.headers['x-api-key'] === 'k-123' && m.headers['anthropic-version'] && m.body.max_tokens > 0 && typeof m.body.system === 'string' && m.body.messages.length === 3 && m.body.messages[0].role === 'user', 'the Claude request or answer is wrong: ' + JSON.stringify(r));
    G.PROVIDERS.claude.url = real;
    G.aiSet({ provider: 'none' });
    check(!G.aiView().hasKey, 'switching the AI off should forget the key');
    server.close();
    const dead = G.aiSet({ provider: 'local', url: 'http://127.0.0.1:9/v1', model: 'x' }); r = await G.ask([{ role: 'user', content: 'updates?' }]);
    check(dead.provider === 'local' && !r.ok && /Nothing is listening/.test(r.text) && /Windows/.test(r.text), 'an unreachable local server should be explained: ' + r.text);
  }
  // the key never lands in guardian.json in the clear
  {
    const pc = new Pretend(), env = use(pc);
    G.aiSet({ provider: 'grok', key: 'xai-PLAINTEXT' });
    const file = path.join(env.dir, 'guardian.json'), text = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
    check(!text.includes('xai-PLAINTEXT'), 'the API key was written to disk unencrypted');
    check(G.aiView().hasKey && !G.aiView().keySaved, 'without Windows\' own encryption the key should be kept for this session only');
  }

  // ---- 5. the background watch
  { const pc = new Pretend({ defender: { realtime: false } }), env = use(pc); await G.patrol(); check(env.said.length === 1 && env.said[0].tone === 'bad', 'Mewtwo should speak up about a serious finding');
    const pc2 = new Pretend(), env2 = use(pc2); await G.patrol(); check(env2.said.length === 0, 'Mewtwo should stay quiet when all is well');
    const pc3 = new Pretend({ defender: { realtime: false } }), env3 = use(pc3, { guardianAlerts: false }); await G.patrol(); check(env3.said.length === 0, 'Mewtwo should stay quiet when alerts are switched off'); }

  console.log(bad ? `\n${bad} of ${n} checks failed.` : `\nAll ${n} checks passed.`);
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
