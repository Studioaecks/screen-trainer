// Screen Trainer — Mewtwo's AI watch (0.9.9, owner's list 11-16 update 21, "rogue AI defences"). Main process.
//
// Mewtwo keeps an eye on the AI programs on this computer: assistants, agents, local model servers. It shows which are
// here (running, starting with Windows, listening for connections), says so when a new one turns up, and, when the
// owner asks, cuts one off from the internet with a Windows Firewall rule (and lets it out again).
//
// Rules:
//   1. Watching only reads (ps\aiwatch.ps1). Of everything Windows lists, only programs whose name is on the list
//      below are kept; no other program's name is stored, shown or logged.
//   2. Nothing is stopped, removed or changed by watching. Mewtwo reports; the owner decides.
//   3. Blocking is the one thing in Screen Trainer that needs administrator rights (the owner's decision, 2026-11-17).
//      It happens only on the owner's click, Windows asks the owner each time, and it does exactly one thing: two
//      firewall rules for that one program (ps\aiblock.ps1 says so at its top). Unblocking removes exactly those.
//      The program's path must be one this watch found itself, and of plain characters; it is handed to PowerShell as
//      an argument, never as script text.
//   4. Everything done is written to the log (deps.log) and can be undone (unblock).
'use strict';
const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');

// name: what it is called here. match: tested against the program's file name (without .exe), lower case.
const KNOWN = [
  ['Ollama', /^ollama/, 'runs AI models on this computer'], ['LM Studio', /^lm[ -]?studio|^lms$/, 'runs AI models on this computer'], ['Jan', /^jan$/, 'runs AI models on this computer'],
  ['GPT4All', /^gpt4all/, 'runs AI models on this computer'], ['KoboldCpp', /^kobold/, 'runs AI models on this computer'], ['llama.cpp', /^llama[-_]?(server|cli)?$/, 'runs AI models on this computer'],
  ['Msty', /^msty/, 'runs AI models on this computer'], ['AnythingLLM', /^anythingllm/, 'an AI workspace'], ['ComfyUI', /^comfyui/, 'makes pictures with AI'],
  ['Claude', /^claude/, 'an AI assistant (it can act on this computer if you let it)'], ['ChatGPT', /^chatgpt/, 'an AI assistant'], ['Copilot', /^copilot|^github ?copilot/, 'an AI assistant'],
  ['Gemini', /^gemini/, 'an AI assistant'], ['Grok', /^grok/, 'an AI assistant'], ['Perplexity', /^perplexity/, 'an AI assistant'], ['Cursor', /^cursor$/, 'a code editor with an AI agent'],
  ['Windsurf', /^windsurf/, 'a code editor with an AI agent'], ['Codeium', /^codeium/, 'an AI coding helper'], ['Tabnine', /^tabnine/, 'an AI coding helper'], ['Open Interpreter', /^interpreter|^open-interpreter/, 'an AI agent that runs commands'],
  ['AutoGPT', /^autogpt|^agentgpt/, 'an AI agent that acts by itself'], ['Aider', /^aider/, 'an AI coding agent'], ['Codex', /^codex/, 'an AI coding agent'], ['OpenClaw', /^openclaw|^clawdbot|^moltbot/, 'an AI agent that acts by itself'],
];
const PORTS = { 11434: 'Ollama', 1234: 'LM Studio', 5001: 'KoboldCpp', 7860: 'a Gradio AI page', 8188: 'ComfyUI', 4891: 'GPT4All', 1337: 'Jan' };
const SAFE_PATH = /^[A-Za-z]:\\[A-Za-z0-9 _.\-()\\]+\.exe$/;

let deps = { userDir: () => '', say: () => {}, log: () => {}, selfExe: '' }, state = null, last = null, busy = null, WIN = process.platform === 'win32';
const PS = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
let run = (args, timeout) => new Promise((resolve) => { execFile(PS, args, { windowsHide: true, timeout: timeout || 40000, maxBuffer: 16 * 1024 * 1024, encoding: 'utf8' }, (e, out) => resolve(String(out || ''))); });
const script = (n) => path.join(__dirname, 'ps', n + '.ps1');
const file = () => path.join(deps.userDir(), 'sentinel.json');
function load() { if (state) return state; let r = null; try { r = JSON.parse(fs.readFileSync(file(), 'utf8')); } catch (e) { r = null; } state = { seen: r && Array.isArray(r.seen) ? r.seen.filter((x) => typeof x === 'string').slice(0, 200) : [], first: !(r && Array.isArray(r.seen)) }; return state; }
function save() { try { fs.mkdirSync(deps.userDir(), { recursive: true }); fs.writeFileSync(file(), JSON.stringify({ seen: state.seen })); } catch (e) { /* kept for this run */ } }
function init(d) { deps = Object.assign(deps, d || {}); state = null; last = null; }
const lastJson = (out) => { const line = String(out || '').trim().split(/\r?\n/).pop() || ''; try { return JSON.parse(line); } catch (e) { return null; } };
const baseOf = (p) => path.basename(String(p || '')).replace(/\.exe$/i, '').toLowerCase();
const known = (p) => KNOWN.find((k) => k[1].test(baseOf(p))) || null;

/** what Windows listed -> the AI programs among it (rule 1: nothing else is kept) */
function pick(raw) {
  const found = new Map(), self = String(deps.selfExe || '').toLowerCase();
  const add = (p, how, extra) => {
    if (typeof p !== 'string' || !p || p.toLowerCase() === self) return;
    const k = known(p); if (!k) return;
    const key = p.toLowerCase(), f = found.get(key) || { id: key, name: k[0], what: k[2], path: p, running: false, startup: false, port: 0, blocked: false, canBlock: SAFE_PATH.test(p) };
    f[how] = extra === undefined ? true : extra; found.set(key, f);
  };
  const byId = {};
  for (const p of Array.isArray(raw.running) ? raw.running : []) { if (p && p.path) { add(p.path, 'running'); byId[p.id] = p.path; } }
  for (const s of Array.isArray(raw.startup) ? raw.startup : []) { const m = /^"([^"]+\.exe)"|^(\S+\.exe)/i.exec(String((s && s.command) || '')); if (m) add(m[1] || m[2], 'startup'); }
  for (const l of Array.isArray(raw.listening) ? raw.listening : []) { const p = byId[l.id]; if (p && known(p)) add(p, 'port', l.port | 0); }
  for (const b of Array.isArray(raw.blocked) ? raw.blocked : []) { if (!b || !b.program) continue; const key = String(b.program).toLowerCase(), k = known(b.program); const f = found.get(key) || (k ? { id: key, name: k[0], what: k[2], path: b.program, running: false, startup: false, port: 0, canBlock: SAFE_PATH.test(b.program) } : null); if (f) { f.blocked = !!b.on; found.set(key, f); } }
  return [...found.values()].sort((a, b) => a.name.localeCompare(b.name) || a.path.localeCompare(b.path));
}
/** look now. quiet: do not speak. -> { ok, found, fresh: the ones never seen before } */
function scan(quiet) {
  if (busy) return busy;
  busy = (async () => {
    const s = load();
    if (!WIN) return { ok: false, found: [], fresh: [], text: 'The AI watch needs Windows.' };
    const raw = lastJson(await run(['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script('aiwatch')]));
    if (!raw) return { ok: false, found: last ? last.found : [], fresh: [], text: 'Windows did not answer.' };
    const found = pick(raw), fresh = found.filter((f) => !s.seen.includes(f.id));
    for (const f of found) f.isNew = !s.first && fresh.includes(f);
    if (fresh.length) { s.seen = [...new Set(s.seen.concat(fresh.map((f) => f.id)))].slice(-200); save(); }
    if (fresh.length && !s.first && !quiet) deps.say({ text: `A new AI program is on this computer: ${fresh.map((f) => f.name).slice(0, 3).join(', ')}. Click me, then "guard", to see it.`, tone: 'warn', seconds: 12 });
    s.first = false;
    last = { ok: true, at: Date.now(), found, fresh: fresh.map((f) => f.id) };
    return last;
  })().finally(() => { busy = null; });
  return busy;
}
/** block or unblock one program the watch found. Windows asks the owner (administrator prompt). */
async function block(id, on) {
  const f = last && last.found.find((x) => x.id === String(id || '').toLowerCase());
  if (!f) return { ok: false, text: 'Look again first: I do not see that program.' };
  if (!f.canBlock || !SAFE_PATH.test(f.path) || !fs.existsSync(f.path)) return { ok: false, text: 'Its path has characters I will not hand to Windows. Block it in Windows Firewall yourself.' };
  const r = lastJson(await run(['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script('aiblock'), '-Mode', on ? 'block' : 'unblock', '-Program', f.path], 120000)) || { ok: false, error: 'no answer' };
  const text = r.ok ? (on ? `${f.name} is cut off from the internet. It keeps running; "Unblock" lets it out again.` : `${f.name} can reach the internet again.`) : r.declined ? 'Windows was not allowed to do it, so nothing changed.' : 'It did not work: ' + String(r.error || '').slice(0, 160);
  deps.log(on ? `Block ${f.name} from the internet` : `Unblock ${f.name}`, !!r.ok, text);
  if (r.ok) await scan(true);
  return { ok: !!r.ok, text };
}
const status = () => (last ? { at: last.at, found: last.found } : { at: 0, found: [] });
module.exports = { init, scan, block, status, pick, known, KNOWN, PORTS, SAFE_PATH, _test: { setRun: (f) => { run = f; WIN = true; }, load } };
