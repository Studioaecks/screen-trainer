// Screen Trainer — the small, safe bridge between the windows and the main process.
// Everything a window may ask of the main process is listed here as window.st.<name>.
'use strict';
const { contextBridge, ipcRenderer } = require('electron');
const on = (ch) => (fn) => { ipcRenderer.on(ch, (_e, v) => fn(v)); };

contextBridge.exposeInMainWorld('st', {
  // overlay
  init: () => ipcRenderer.invoke('st:init'),
  hover: (b) => ipcRenderer.send('st:hover', !!b),
  blocked: (o) => ipcRenderer.send('st:blocked', o),       // the overlay has the mouse and the pointer moves on a Pokémon, yet no mouse event arrives: another window lies over it (src/game.js)
  note: (o) => ipcRenderer.send('st:note', o),             // something went wrong or was put right: written to the self-check folder's blackbox.log
  machines: () => ipcRenderer.invoke('st:machines'),
  save: (json) => ipcRenderer.send('st:save', json),
  sendState: (s) => ipcRenderer.send('st:state', s),
  openPanel: (tab) => ipcRenderer.send('st:open-panel', tab),
  pointPanel: (tab) => ipcRenderer.send('st:point-panel', tab),
  openField: () => ipcRenderer.send('st:open-field'),
  saveExport: () => ipcRenderer.invoke('st:save-export'), savePick: () => ipcRenderer.invoke('st:save-pick'), saveLoad: () => ipcRenderer.invoke('st:save-load'),      // (0.9.8) the game as a .stsave file
  onMyPointer: on('st:my-pointer'),                                   // (0.9.7) the mouse over the game is the player's own pointer: { css } or { css: '' }                 // open (or bring forward) the field window (0.9.5: two right-clicks on a team member)      // show this in the Pokédex if it is open, without bringing it forward (0.9.5)
  soundBank: () => ipcRenderer.invoke('st:sound-bank'),
  onSettings: on('st:settings'), onSprites: on('st:sprites'), onCursor: on('st:cursor'), onCmd: on('st:cmd'), onStateRequest: on('st:state-request'),
  onSound: on('st:sound'), onSoundBank: on('st:sound-bank-changed'),
  onGuardianAway: on('st:guardian-away'), onGuardianBack: on('st:guardian-back'),      // Mewtwo dives off for a long task and comes back with the answer (0.9.5)
  onGuardian: on('st:guardian'),                               // Mewtwo has something to say: { text, tone, seconds }
  onField: on('st:field'),
  onCovers: on('st:covers'),                                   // the parts of the field window that other windows cover, as rectangles on this screen (0.9.3)                                     // the field window's inside as a rectangle on this screen, or null (windowed mode)
  // the field window's camera (0.7): the field page reports a drag of the grass or a turn of the wheel, the overlay says what its camera shows
  fieldCam: (m) => ipcRenderer.send('st:field-cam', m), onFieldCam: on('st:field-cam'),
  fieldView: (v) => ipcRenderer.send('st:field-view', v), onFieldView: on('st:field-view'), fieldViewGet: () => ipcRenderer.invoke('st:field-view-get'),
  onBox: on('st:box'), boxShown: () => ipcRenderer.invoke('st:box-get'),      // is the Pokédex's Box on show? Then the field shows the Box (src/boxfield.js)
  openGuardian: () => ipcRenderer.send('st:open-guardian'),
  // (1.0) mods, forks and the Escape Rope
  modsView: (again) => ipcRenderer.invoke('st:mods-view', !!again), modsSet: (id, on) => ipcRenderer.invoke('st:mods-set', String(id), !!on), modsOff: () => ipcRenderer.invoke('st:mods-off'),
  modsFolder: () => ipcRenderer.invoke('st:mods-folder'), modsFx: () => ipcRenderer.invoke('st:mods-fx'), onMods: on('st:mods'),      // what the mods that are on change: { on: [names], spawns: { '25': 2, 'type:fire': 3 }, colors: { shell: '#…' } }
  forks: () => ipcRenderer.invoke('st:forks'), forkMake: (withSave) => ipcRenderer.invoke('st:fork-make', !!withSave), forkStart: (name) => ipcRenderer.invoke('st:fork-start', String(name)),
  forkTrash: (name) => ipcRenderer.invoke('st:fork-trash', String(name)), forkFolder: () => ipcRenderer.invoke('st:fork-folder'), onForks: on('st:forks'),
  ropeInfo: () => ipcRenderer.invoke('st:rope-info'), rope: () => ipcRenderer.invoke('st:rope'),
  howto: () => ipcRenderer.invoke('st:howto'), howtoPlay: (key, kind) => ipcRenderer.invoke('st:howto-play', key, kind),
  // both windows
  getSettings: () => ipcRenderer.invoke('st:settings-get'),
  setSettings: (patch) => ipcRenderer.invoke('st:settings-set', patch),
  // Pokédex window
  requestState: (full) => ipcRenderer.send('st:state-request', !!full),
  onState: on('st:state'), onTab: on('st:tab'),
  cmd: (c) => ipcRenderer.send('st:cmd', c),
  sound: (name) => ipcRenderer.send('st:sound', String(name)),
  sprites: () => ipcRenderer.invoke('st:sprites-get'),
  pickSprites: () => ipcRenderer.invoke('st:pick-sprites'),
  importRom: () => ipcRenderer.invoke('st:import-rom'),
  removeBank: () => ipcRenderer.invoke('st:remove-bank'),
  info: () => ipcRenderer.invoke('st:info'),
  panelBox: (open) => ipcRenderer.send('st:panel-box', !!open),
  exportInfo: () => ipcRenderer.invoke('st:export-info'),      // Android export: what would go into the app, and where it was last written
  exportApk: (o) => ipcRenderer.invoke('st:export-apk', o), onExportProgress: on('st:export-progress'),
  exportShare: () => ipcRenderer.invoke('st:export-share'), shareInfo: () => ipcRenderer.invoke('st:share-info'), onShareProgress: on('st:share-progress'),      // the empty copy for somebody else (shareexport.js)
  winMinimize: () => ipcRenderer.send('st:win-min'),           // the window that asks is the one that minimises or closes
  winClose: () => ipcRenderer.send('st:win-close'),
  // Mewtwo's window (guardian.js in the main process does the work and checks every value)
  guard: {
    status: (o) => ipcRenderer.invoke('st:g-status', o), act: (id, arg) => ipcRenderer.invoke('st:g-act', id, arg),
    profiles: () => ipcRenderer.invoke('st:g-profiles'), apply: (id) => ipcRenderer.invoke('st:g-apply', id), undo: () => ipcRenderer.invoke('st:g-undo'),
    saveCustom: (steps) => ipcRenderer.invoke('st:g-custom', steps), preview: (steps) => ipcRenderer.invoke('st:g-preview', steps),
    ai: () => ipcRenderer.invoke('st:g-ai'), aiSet: (cfg) => ipcRenderer.invoke('st:g-ai-set', cfg), aiDetect: () => ipcRenderer.invoke('st:g-ai-detect'), aiModels: () => ipcRenderer.invoke('st:g-ai-models'),
    ask: (history) => ipcRenderer.invoke('st:g-ask', history), log: () => ipcRenderer.invoke('st:g-log'),
    // 0.9.9: the AI watch (sentinel.js) and backups (backup.js)
    aiScan: () => ipcRenderer.invoke('st:g-ai-scan'), aiBlock: (id, on) => ipcRenderer.invoke('st:g-ai-block', id, on),
    bkStatus: () => ipcRenderer.invoke('st:g-bk-status'), bkSet: (p) => ipcRenderer.invoke('st:g-bk-set', p), bkTarget: () => ipcRenderer.invoke('st:g-bk-target'), bkAdd: () => ipcRenderer.invoke('st:g-bk-add'), bkHome: (dir) => ipcRenderer.invoke('st:g-bk-home', dir),
    bkMeasure: (dir) => ipcRenderer.invoke('st:g-bk-measure', dir), bkStart: () => ipcRenderer.invoke('st:g-bk-start'), bkStop: () => ipcRenderer.invoke('st:g-bk-stop'), bkOpen: () => ipcRenderer.invoke('st:g-bk-open'), onBkProgress: on('st:g-bk-progress'),
  },
  // Optimize, Rotom's window (optimize.js in the main process does the work, checks every value and refuses any other window)
  openOptimize: () => ipcRenderer.send('st:open-optimize'),
  opt: {
    status: () => ipcRenderer.invoke('st:o-status'), pick: () => ipcRenderer.invoke('st:o-pick'), propose: (mode) => ipcRenderer.invoke('st:o-propose', mode),
    proposeAi: () => ipcRenderer.invoke('st:o-ai'), apply: (id) => ipcRenderer.invoke('st:o-apply', id), undo: () => ipcRenderer.invoke('st:o-undo'),
    // 0.9.9: the big tidy-up (tidy.js)
    tStatus: () => ipcRenderer.invoke('st:t-status'), tPick: (what) => ipcRenderer.invoke('st:t-pick', what), tPropose: (o) => ipcRenderer.invoke('st:t-propose', o), tApply: (id) => ipcRenderer.invoke('st:t-apply', id), tUndo: () => ipcRenderer.invoke('st:t-undo'), onTProgress: on('st:t-progress'),
  },
  // Online visiting (0.8; online.js in the main process checks which window is asking and every value that comes in)
  visitOpen: (go) => ipcRenderer.send('ov:open', !!go),        // open the "online" window (a button in the options); go: and look for somebody to visit at once (the ball on the fountain)
  vOut: (m) => ipcRenderer.send('st:v-out', m), onVIn: on('st:v-in'),      // the stage: what the visitors do there comes in, what happens in the game goes out
  ov: {
    view: () => ipcRenderer.invoke('ov:view'), set: (patch) => ipcRenderer.invoke('ov:set', patch), onView: on('ov:view'),
    visit: (q) => ipcRenderer.send('ov:visit', q), leave: () => ipcRenderer.send('ov:leave'), blockHost: () => ipcRenderer.send('ov:block-host'),
    kick: (q) => ipcRenderer.send('ov:kick', q), say: (i) => ipcRenderer.send('ov:say', i),
    sayText: (t) => ipcRenderer.invoke('ov:say-text', t),     // (0.9.7) the host types to its visitors (online.js cleans it: one line, 120 characters)
    hub: (m) => ipcRenderer.send('ov:hub', m),                 // the online window: how its connection is doing, what the host's computer sent
    host: (m) => ipcRenderer.send('ov:host', m),               // MyStream's booth: how its visitors' connections are doing, what their computers sent
    openMyStream: () => ipcRenderer.send('ov:mystream'),
  },
  quit: () => ipcRenderer.send('st:quit'),
  openNotepad: () => ipcRenderer.send('st:open-notepad'), onSaveOffer: on('st:save-offer'),      // (0.9.8) Windows handed over a saved game: offer to load it             // (0.9.8) the Unown Notepad, from the Field Dex
  // the Unown Notepad (0.9.8; main.js checks that the asking window is a notepad; this page never sees a path)
  np: {
    hello: () => ipcRenderer.invoke('np:hello'), open: () => ipcRenderer.invoke('np:open'), save: (o) => ipcRenderer.invoke('np:save', o), unlock: (w) => ipcRenderer.invoke('np:unlock', w),
    dirty: (on) => ipcRenderer.send('np:dirty', !!on), closeOk: (ok) => ipcRenderer.send('np:close-ok', !!ok), onText: on('np:text'), onAskSave: on('np:ask-save'),
  },
  // MyStream (mystream.js in the main process checks which window is asking: the booth's requests are refused from any other page)
  openMyStream: () => ipcRenderer.send('st:open-mystream'),
  ms: {
    // the booth (mystream.html)
    view: () => ipcRenderer.invoke('ms:view'), set: (patch) => ipcRenderer.invoke('ms:set', patch), onView: on('ms:view'),
    windows: () => ipcRenderer.invoke('ms:windows'),                    // the windows that could be shown, with small pictures (Steam's are marked and can not be chosen)
    stageSource: () => ipcRenderer.invoke('ms:stage-source'), nudge: () => ipcRenderer.invoke('ms:nudge'),
    input: (ev) => ipcRenderer.send('ms:input', ev),                    // a click or pointer move on the picture of the stage: { t: 'move' | 'down' | 'up', x, y, b }
    mic: (open) => ipcRenderer.send('ms:mic', !!open), onTalkKey: on('ms:talk-key'),
    gameVolume: (id, vol) => ipcRenderer.invoke('ms:game-volume', id, vol),      // (1.0) a game's volume in the Windows mixer, 0 to 100; without vol: only read
    twClient: (id) => ipcRenderer.invoke('ms:tw-client', id), twLogin: () => ipcRenderer.invoke('ms:tw-login'), twCancel: () => ipcRenderer.invoke('ms:tw-cancel'), twOpen: () => ipcRenderer.invoke('ms:tw-open'),
    twLogout: () => ipcRenderer.invoke('ms:tw-logout'), twKey: (key) => ipcRenderer.invoke('ms:tw-key', key), twServer: (url) => ipcRenderer.invoke('ms:tw-server', url),
    liveReady: () => ipcRenderer.invoke('ms:live-ready'), whipOffer: (sdp) => ipcRenderer.invoke('ms:whip-offer', sdp), whipStop: () => ipcRenderer.invoke('ms:whip-stop'),
    recStart: (o) => ipcRenderer.invoke('ms:rec-start', o), recChunk: (bytes) => ipcRenderer.send('ms:rec-chunk', bytes), recStop: () => ipcRenderer.invoke('ms:rec-stop'), recShow: (file) => ipcRenderer.invoke('ms:rec-show', file), onRecError: on('ms:rec-error'),
    // Twitch chat (booth only) and the stream's desk
    chatLines: () => ipcRenderer.invoke('ms:chat-lines'), chatSend: (text) => ipcRenderer.invoke('ms:chat-send', text), onChat: on('ms:chat'),
    deskRefresh: () => ipcRenderer.invoke('ms:desk-refresh'), deskSearch: (q) => ipcRenderer.invoke('ms:desk-search', q), deskGame: (id) => ipcRenderer.invoke('ms:desk-game', id), deskMarker: (text) => ipcRenderer.invoke('ms:desk-marker', text), deskOpen: (what) => ipcRenderer.invoke('ms:desk-open', what),
    cursor: (i) => ipcRenderer.invoke('ms:cursor', i),                   // choose the owner's pointer (0.9.4; only one that was won)
    close: () => ipcRenderer.send('ms:close'),
    // the stage (stage.html)
    stageInit: () => ipcRenderer.invoke('ms:stage-init'), onStage: on('ms:stage'), onMic: on('ms:mic'),
    onPointer: on('ms:pointer'),                                        // where the owner's mouse is, for the stage (0.9.4: mystream.js, pointerFrame)
    stageInfo: (info) => ipcRenderer.send('ms:stage-info', info), mewtwo: (m) => ipcRenderer.send('ms:mewtwo', m),
  },
});
