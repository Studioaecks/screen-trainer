# Screen Trainer: notes for whoever changes this next

Read this first, whether you are a person or an AI agent. It says what the program is, where things live, what
must not break, and how to check a change without a Windows machine.

Version 1.0.0 (1.0: the Escape Rope, mods, forks, sound sliders, release zips: see "1.0" at the very end; `node tools/v100check.js` checks it. Every version since 0.8 has a section at the end. 0.8: online visiting, see "0.8" at the very end; `node tools/onlinecheck.js` checks it. 0.7.1: the overlay belongs to the field window, see "0.7.1" near the end. 0.7: see "0.7" at the very end; `node tools/v07check.js` checks it. 0.6: see "0.6" near the end. 0.5 added MyStream, the streaming studio: see "MyStream" near the end; `tools/mystreamcheck.js` checks it). Before that, 0.4 (see the project notes for what 0.4 added: field window, loitering, ball stacks, experience slider, folding options, Android export via apkexport.js + android/; `node tools/androidcheck.js` checks the export). Electron 45, plain JavaScript, no build step, no npm packages at runtime. Edit a file, restart
the program, see the change.

In a hurry? The three things to know: (1) the rules just below; (2) `node tools/playtest.js`,
`node tools/guardiancheck.js` and `node tools/v07check.js` must pass before a change ships; (3) after copying files to a real machine, the
program can restart and check itself on request, with nobody at the keyboard (see "Checking on the real machine").

## What it is

A transparent, click-through window that covers the whole screen. Wild Pokémon hop in from the edges, the
player's team fights and catches them, and a second window (the Pokédex device) shows the team, Box, Bag and
options. A third window belongs to Mewtwo, the XXL Super Alpha that stands on the overlay and looks after the
computer itself: Windows security, updates, tune-up profiles and questions.

## Rules that must stay true

These are the owner's requirements. A change that breaks one is wrong even if every test passes.

1. **Nothing but sprites and effects on the overlay.** No background, floor, walls, platforms or scenery of
   any kind. Field effects and weather are drawn as light on top of the desktop and fade away. (Since 0.7 the
   overlay draws Fountain Square, but only inside the field window's rectangle and only while that window is open:
   the owner asked for it there, as for the field itself. Outside the field the rule stands.)
2. **Clicks pass through** to the desktop unless the pointer is on a Pokémon, a dropped item, the ball
   button or Mewtwo.
3. **The player's clicks never knock a wild Pokémon out.** Only the team can.
4. **Old saves keep working.** `parseSave` in `src/overlay.js` repairs and extends whatever it is given. Add
   fields, never rename or remove them.
5. **Sprites and game sounds are never part of the program.** Sprites are read from the user's own
   `sprites` folder; sounds come from a sound bank built once from the user's own ROM. Do not copy either
   into this folder, and do not upload them anywhere.
6. **Settings are only the keys in `defaults.js`.** The main process drops anything else.
7. **The Pokédex device is an original design.** Keep it that way; do not restyle it as a replica of the
   device from the games. Themes (`theme` setting) change colours only.
8. **Mewtwo never harms the computer.** `guardian.js` states its own rules at the top: no administrator
   rights, fixed command lines, nothing deleted, every change asked for by the user, logged and undoable,
   and an AI can only propose a profile. `tools/guardiancheck.js` enforces them; keep it passing.
   **One exception since 0.9.9 (the owner's decision):** `sentinel.js` may block one AI program's internet with
   `ps\aiblock.ps1`, which asks Windows for administrator rights on the owner's click, each time, and adds or
   removes only its own two firewall rules. Nothing else may ever ask for administrator rights.
9. **A friendly legendary visitor is never part of a fight** (`G.peaceful`), **and every visitor can be
   caught.**
10. **Nothing goes online unless the owner switched it on, and no visitor can type.** Online visiting
    (`online.js`) is off until its mode is set; with it off no message board is contacted. From a visitor only
    numbers travel: places, clicks, a line's number, Pokémon as numbers (its team since 0.9.7). Names and chat
    lines are made by each program from its own lists. **Since 0.9.7 (the owner's decision) the host may type to
    its own visitors** (`hostText`, one cleaned line of at most 120 characters); nothing typed by a visitor ever
    reaches anyone, so nobody but the streamer can put words on a stream. Do not add a text field on the visitor's
    side. A visitor can point, hit a wild Pokémon, throw a ball and pet: nothing else of the host's
    (`src/visitors.js`); its team stands on the host's field only as copies (`Rivals.guest`).

## Where things are

| File | What it does |
|---|---|
| `main.js` | Main process: overlay window, Pokédex window, Mewtwo's window, tray menu, settings and save files, startup, hotkey, sound bank import, save backup on a new version, restart and self-check requests |
| `preload.js` | Every call a window may make to the main process, as `window.st.<name>` (Mewtwo's are `window.st.guard.<name>`) |
| `defaults.js` | Every setting with its default, and range checks (applied on load and on every change) |
| `guardian.js` | Mewtwo's abilities: reads Windows security, updates, hardware and power plans; the fixed list of actions; tune-up profiles with exact undo; questions answered by itself or by a connected AI |
| `ps/*.ps1` | The six PowerShell scripts Mewtwo may run. Plain ASCII, readable, four of them read-only |
| `selfcheck.js` | The running program looks itself over and writes a report with pictures of its own windows |
| `guardian.html`, `guardian.css`, `src/guardian-ui.js` | Mewtwo's window: watch, tune (profiles and the walkthrough), ask, log |
| `spritescan.js` | Finds the user's sprites folder and lists what is in it (Pokémon, items, icons, types, badges, marks, ribbons) |
| `soundbank.js` | Builds, finds and loads the sound bank. Also a command-line tool |
| `overlay.html` | The overlay page. Its `<script>` list is the load order; the playtests read it |
| `panel.html`, `panel.css`, `src/panel.js` | The Pokédex window: dex, team, bag, trainer, options, help, and the slide-out Box |
| `src/data.js` | Generated game data: species, moves, type chart, natures, learnsets, evolutions. Do not edit by hand |
| `src/data-extra.js` | Generated: item names, evolution items, items wild species carry, dex entries. Built by `tools/build-extra-data.js` |
| `src/core.js` | `G`, the one shared game object: state, save shape, small helpers |
| `src/size.js` | Sizes: each Pokémon's size value and class (S, M, L, XL), and how large a species is drawn from its real height. All the numbers to tune are at the top |
| `src/mon.js` | A single Pokémon: stats, experience, evolution, catch formula, leadership, affection |
| `src/sprites.js` | Picture lookup for both windows. Every function returns a file URL or `null` |
| `src/items.js` | Item catalogue, drop rates, Bag, medicine, held-item effects, special balls |
| `src/honors.js` | Marks given at catch, ribbons, the 16 badges |
| `src/battle.js` | Move choice, damage, status, weather, terrain, hazards, screens |
| `src/fx.js` | Particles, beams, field-effect and weather drawing |
| `src/notify.js` | Notification cards |
| `src/game.js` | The loop: spawning, movement, hop in and out, obedience, input, petting (and the little healing it gives), catching, drops, drawing, commands from the Pokédex window |
| `src/events.js` | What happens by itself: random weather, and legendary visits (friendly, aggressive, evasive) |
| `src/mewtwo.js` | Mewtwo on the overlay: where it stands, dragging, its speech card. Deliberately not one of `G.actors` |
| `src/overlay.js` | Start-up of the overlay page: loads save and settings, wires the bridges |
| `src/sound.js` | Sound in the overlay: effects, cries, music, battle music, mute, volumes |
| `src/audio-worker.js`, `src/audio-core.js` | Renders sound off the main thread |
| `src/m4a.js` | Player for the Game Boy Advance sound format, and the sound bank format |
| `src/soundmap.js` | Which bank entry plays for which game event; the music playlist |
| `src/tunes.js` | Built-in synthesised sounds and music, used when there is no sound bank |
| `src/square.js` | Fountain Square in the field window (the stage builds its own in `src/stage.js`), and the button on the fountain's top |
| `src/boxfield.js` | The Box Field: while the Box is open the field shows the Pokémon in it |
| `src/showdown.js` | Reads a team in Pokémon Showdown's text format and makes Pokémon of it (used by the Pokédex window and by the game) |
| `optimize.js`, `optimize.html`, `optimize.css`, `src/optimize-ui.js` | Optimize, Rotom's folder organizer: the part that touches files (its six rules are at its top), and its window |
| `shareexport.js` | The empty copy: the program zipped for somebody else, with nothing of the owner's in it |
| `onlinenet.js` | Online visiting, plain Node: the notes two players leave each other on public message boards (a small MQTT client, several boards at once), the keys and seals, the host's and the visitor's side of saying hello |
| `online.js` | Online visiting, main process: settings (`online.json`), the "online" window, who may come in, and the checking of everything a stranger's computer sends (its rules are at its top) |
| `visit.html`, `visit.css`, `src/visit.js` | The "online" window: the buttons, and the visitor's end of a visit (`Visit`) |
| `src/online-host.js` | The host's end of the connections, in MyStream's booth page (`OnlineHost`) |
| `src/visitors.js` | On the stage: the visitors' pointers, what their clicks may do, sharing a catch (`Visitors`); and `Online`, what the fountain's ball does at home |
| `src/machine.js` | State machines said out loud (0.9): `Machine.make`, `.go`, `.history`, `Machine.tick`, `Machine.report`. Loaded by the game pages and by `main.js`. The table of every machine is in the 0.9 section |
| `pointers.css` | The pointers, drawn in CSS: on the stage and as the choice in the online window |
| `tools/onlinecheck.js`, `tools/onlinecheck-live.js`, `tools/standin-board.js` | Checks for online visiting: headless against two stand-in message boards, and (under Electron) the real program visiting itself |
| `tools/statecheck.js` | Checks for the machines, the pointer, `G.sanity` and the touchable Box Field: `node tools/statecheck.js` |
| `stfiles.js`, `src/unown.js`, `notepad.html`, `notepad.css`, `src/notepad.js`, `tools/v098check.js` | (0.9.8) The program's own sealed files (.stsave saved games, .unown notes); Living Unown; the Unown Notepad; the checks for 0.9.8 |
| `escaperope.js`, `zipper.js`, `mods.js`, `forks.js`, `ps/appvolume.ps1`, `tools/v100check.js` | (1.0) The Escape Rope; the zip writer for big folders (ZIP64, streamed); mods (data only, checked); forks; a game's own volume for MyStream; the checks for 1.0 |
| `tidy.js`, `src/tidy-ui.js`, `backup.js`, `sentinel.js`, `ps/aiwatch.ps1`, `ps/aiblock.ps1`, `src/guardian-more.js`, `SERVER.md`, `tools/v099check.js` | (0.9.9) Rotom's big tidy-up and its walkthrough; Mewtwo's backups; Mewtwo's AI watch and its two scripts; the guard and backup tabs; how to use a server of one's own; the checks for 0.9.9 |
| `pointers.js`, `tools/v097check.js` | (0.9.7) The 205 pointers to be won, shared by the main process and the pages (`Pointers.view`, `.paint`, `.cursorCss`); the checks for 0.9.7 |
| `tools/v096check.js` | The checks for 0.9.6: healers mend the team, the fountain heals |
| `tools/v095check.js` | The checks for 0.9.5's quick wins (settings, spawning, moves, balls, right-clicks, Mewtwo's dive, the windows' files) |
| `ps/pointer.ps1`, `tools/v094check.js` | MyStream's helper that reads where the games' windows on the stage are and the size of the Windows pointer (0.9.4); the checks for the owner's pointer on the stage |
| `square.css` | The fountain, its places and the fountain's button: shared by the stage and the overlay |
| `tools/playtest.js` | Headless playtests (see below) |
| `tools/v07check.js` | What 0.7 changed and added: the rules headless, and (under Electron) the field window, the Pokédex, the Box Field, Rotom's window |
| `tools/guardiancheck.js` | Mewtwo's abilities against a pretend Windows computer: reading, every profile applied and undone, refused input, both AI wire formats, the script files |
| `tools/soundcheck.js` | Checks that every sound name has a sound and that the bank plays |
| `tools/build-extra-data.js` | Regenerates `src/data-extra.js` from the PokeAPI CSV tables |
| `fonts/` | DotGothic16 and Jersey 20, both under the SIL Open Font License (texts included) |

User data is in `%APPDATA%\Screen Trainer\`: `settings.json`, `save.json`, `guardian.json` (Mewtwo: AI choice,
the user's own profile, what the profile in effect changed, the log), `backups\before-<version>\` (the save
and settings as they were before that version first ran) and `sounds.stbank` if a ROM was imported from inside
the program. A bank in a `sounds` folder next to the program folder is found too.

## How the pieces talk

- The **overlay** runs the game. The **Pokédex window** only displays and sends requests.
- Pokédex window to game: `st.cmd({ type, ... })`. The list of commands is the `switch` in `G.command` at the
  end of `src/game.js` (`arrange`, `useItem`, `giveItem`, `takeItem`, `equipBall`, `tossItem`, `rename`,
  `release`, `music`, `reset`, and others).
- Game to Pokédex window: `G.snapshot()` in `src/game.js`, sent about once a second while the window is open.
  The Box is only included when it changed (`G.boxEpoch`) or when asked for in full.
- Settings: either window calls `st.setSettings({ key: value })`; the main process saves and sends the full
  settings object to both windows.
- Sounds made by the Pokédex window are played by the overlay (`st.sound(name)`), so there is one audio
  engine and one mute switch.
- Mewtwo's window calls `st.guard.*`; each call is one `ipcMain.handle('st:g-…')` line in `main.js` that passes
  plain values to `guardian.js`, which validates all of them. Main process to overlay: `st:guardian`
  `{ text, tone, seconds }` makes Mewtwo speak.
- `game.js` calls into `src/events.js` at a few marked places (`Events.update`, `.ai`, `.pet`, `.catchMult`,
  `.caught`, `.brokeFree`, `.tag`) and into `src/mewtwo.js` for the pointer (`Mewtwo.hit`, `.down`, `.move`, `.up`).

## Checking a change

All of these run with plain Node. None needs Electron, Windows, a screen or a sound card.

```
node tools/playtest.js                  rule checks, feature checks and four simulated players, a few minutes in total
node tools/playtest.js rules            only the rule checks, a few seconds
node tools/playtest.js features         sizes, petting, weather and legendary visits, under a minute
node tools/playtest.js slowmo           frame-by-frame watch for popping, clipping and jitter
node tools/playtest.js nerd --hours 2 --save-out save.json
node tools/playtest.js oldman --save-in save.json       start the simulated players from a real save
node tools/guardiancheck.js             Mewtwo's abilities against a pretend Windows computer, a few seconds
node tools/v07check.js                  what 0.7 changed and added: walking round things, Trainer battle rules, ground and marks, helpers, import, Optimize, the empty copy
node tools/onlinecheck.js               online visiting without windows: the notes, the keys, who is let in, what is accepted from a stranger (stand-in boards, nothing leaves the computer)
node tools/soundcheck.js                every sound name has a built-in sound and a bank mapping
node tools/soundcheck.js "..\..\..\sounds\firered.stbank"      also renders everything in the bank
```

No Node on the machine? The program's own executable can stand in for it: set the environment variable
`ELECTRON_RUN_AS_NODE=1`, then run `..\..\ScreenTrainer.exe tools\playtest.js --json report.json`.

Add `--sprites "<path to sprites>"` to the playtests so real picture sizes are used. Exit code 1 means a
crash or a broken invariant. The runs:

- `features`: what 0.3 added. Size classes come out in the intended shares; every species is drawn to scale
  within the floor and the cap; an old save gains stable sizes; petting mends a little and stops a second after
  the last pet; weather follows the slider, lasts, and costs nobody health; a friendly visitor is never hit or
  targeted and its trust raises the catch chance; an evasive one gets away from the pointer and tires; an
  aggressive one attacks; all three are caught by a ball; visits come about as often as the setting says.
- `rules`: checks two of the rules above head-on. Rapid clicking with no team never knocks a wild Pokémon
  out; with "Hands off my target" on, nothing but the clicks hurts the clicked Pokémon and it leaves the
  team alone (a control run with the option off confirms the check can see the difference).
- `oldman`: barely interested, looks over every few minutes, slow inaccurate clicks.
- `child`: every setting at maximum, clicks and drags everything, sends nonsense commands, resets the save.
- `nerd`: builds the strongest team, uses items, hunts alphas and legendaries, rearranges constantly.
- `slowmo`: 1/240 s steps, measures each sprite every frame: pop-in, pop-out, off-screen while idle, facing
  flip-flops, teleports, clipped name tags, shiver.

Every simulated second also checks invariants (`Sim.check`): positions and health are numbers in range, the
team on screen matches the save, every Pokémon has a size, every sprite is drawn exactly as `src/size.js` says
and never outgrows the screen, at most one visitor at a time, Mewtwo is on the screen.

Results for each version are in the project notes, not here, so this file does not go stale.

## Checking on the real machine

The tools above cannot see a real Windows desktop. The program can:

- **Self-check.** Tray > Developer > Run self-check, or start with `--selfcheck`. It checks the overlay window
  (covers the display, on top, never focused), the tray, startup and hotkey, opens the Pokédex and clicks through
  every screen, clicks a generation button with a real mouse event and verifies the screen stayed put (then puts
  the setting back), asks Windows everything Mewtwo asks (read only) and opens Mewtwo's window. It writes
  `report.json`, `summary.txt` and pictures of the program's own windows to `selfcheck\<date and time>\` next to
  the program folder (`latest.txt` there is the newest summary). `report.json` holds Windows' real answers to
  Mewtwo's questions: that is how to find out whether a script in `ps/` works on real Windows.
- **Requests left as a file.** Put `request.json` into that `selfcheck` folder with `{ "run": "selfcheck" }` or
  `{ "run": "restart" }`. The running program takes it within five seconds, deletes it, and writes `result.json`.
  Nothing else can be asked for this way. So an agent that can only copy files to the machine can: copy the new
  files, request a restart, request a self-check, read the report.
- A page that is newer than the running program shows a "restart" notice (`API` in `main.js` goes up when a
  window needs something new from the main process).

Still to be checked by eye, because no tool here can: click-through, drawing over the taskbar, the tray menu
itself, dragging the frameless windows, and how things actually sound.

## How to add things

- **A setting:** add it to `DEFAULTS` in `defaults.js` (with a range check in `sanitize` if it is not a plain
  switch), read it as `G.set.<name>`, add one row to the `OPTIONS` table in `src/panel.js`.
- **A size tweak:** the tables at the top of `src/size.js` (`CLASSES`, `MULT`, `DRAW`). `features` checks the
  shares and the scale.
- **Weather:** how often is `WEATHER_MIN`, which kinds `WEATHER_KINDS`, both in `src/events.js`.
- **A legendary's temperament or the weather it brings:** `TEMPER` and `BRINGS` in `src/events.js`. How a kind
  behaves is the function of that name there; how catchable it is, `catchMult`.
- **One of Mewtwo's abilities:** one entry in `ACTIONS` in `guardian.js` (`changes: true` if it alters the
  computer) and a button in `src/guardian-ui.js` (`actBtn(id, label)`). If it must ask PowerShell, add a script
  to `ps/`, add its name to `SCRIPTS`, and teach the pretend computer in `tools/guardiancheck.js` to answer it.
- **A tune-up profile or a step in one:** `PROFILES`, `STEP_CHOICES` and `STEP_TEXT` in `guardian.js`; a step also
  needs its apply and its undo in `applyProfile` / `undoInner`, and a question in `QUESTIONS` in
  `src/guardian-ui.js`. `guardiancheck` applies and undoes every profile on five kinds of pretend PC.
- **Another AI service:** one entry in `PROVIDERS` in `guardian.js` (`kind: 'openai'` or `'anthropic'`).
- **A theme:** a `:root[data-theme="…"]` block of variables in `panel.css` and `guardian.css`, one choice in the
  `theme` row of `OPTIONS`, and the name in `sanitize`.
- **An item:** one `def(...)` line in `src/items.js`. Its picture is `sprites/items/<key>.png`. How often
  things drop is `DROP` and `TIER_WEIGHT` near the top of the drop section of that file.
- **A sound:** give the event a name, call `snd('<name>', actor)` or `Sound.play('<name>')`, add the name to
  `SFX` in both `src/soundmap.js` (bank entry) and `src/tunes.js` (built-in fallback). `tools/soundcheck.js`
  fails if either is missing.
- **A music track:** add it to `MUSIC` in `src/soundmap.js`.
- **A badge, ribbon or mark:** the tables in `src/honors.js`.
- **A Pokédex screen:** a `<section class="screen">` in `panel.html`, a key in `#keys`, a render function in
  `src/panel.js`. Element ids must be unique across the whole page.
- **Another game's sounds:** a table for its game code in `GAMES` in `src/soundmap.js`.

## Things that have bitten before

- An element id used twice in `panel.html` makes the second control dead without any error. (The self-check
  looks for duplicates.)
- **Windows contrast themes strip gradients.** With a contrast theme on (Settings > Accessibility > Contrast
  themes), the browser engine drops every gradient and shadow and repaints backgrounds in one system colour. Both
  device windows are drawn with gradients, so they lost their bodies: text and outlines floating over the desktop.
  Seen on the owner's PC. `forced-color-adjust: none` on `:root` (end of `panel.css`, `guardian.css`, top of
  `overlay.html`) keeps the program's own colours; setting `contrast: 'system'` hands them to Windows and a small
  block of system-colour rules gives the devices a solid body. The self-check looks at a picture of each window
  for a solid body. To see it without Windows: attach the debugger to a window and send
  `Emulation.setEmulatedMedia` with `{ features: [{ name: 'forced-colors', value: 'active' }] }`.
- **Another antivirus puts Defender in passive mode**: `AntivirusEnabled` stays true, real-time protection reads
  false, `AMRunningMode` contains "Passive". That is normal and must not raise an alarm (`standby` in `advise`).
- While an assistant controls the desktop through the Claude app, windows of programs it was not given are hidden,
  Screen Trainer's included; the self-check's "overlay shown or hidden as set" then fails and says why.
- **A hidden control must sit inside the list that scrolls.** The generation buttons used invisible checkboxes
  positioned against the screen frame; focusing one scrolled the frame (which has no scrollbar) and blanked the
  whole screen. They now lie over their own button, the frames use `overflow: clip`, and `panel.js` resets a
  frame that scrolls anyway.
- The playtest hands the overlay the same settings object it later changes. Real settings arrive as a fresh copy
  over IPC. `boot()` therefore passes a copy; keep it that way or "did this setting change?" tests always say no.
- Sprites are sized by `G.sizeActor` from `src/size.js`, not by `scale × natural size` any more. Anything that
  needs an actor's pixels-per-sprite-pixel reads `G.sizeOf(a)`.
- Scripts handed to PowerShell as `-EncodedCommand` look like malware to antivirus tools. Mewtwo's are files in
  `ps/`, run with `-File`. They must stay ASCII: Windows PowerShell reads a file without a BOM as ANSI.
- `powercfg` output is in the Windows display language. `guardian.js` reads only GUIDs and hex numbers from it.
- Lookup tables that a window can index by name (`ACTIONS`, `PROFILES`, `PROVIDERS`) have no prototype, so
  `"constructor"` or `"__proto__"` find nothing.
- `safeStorage.isEncryptionAvailable()` is deprecated in Electron 45 (it still works and prints one warning).
  When the Electron version moves on, switch `guardian.js` to the asynchronous call it names.
- The Anthropic `anthropic-version` header is a constant in `guardian.js`. If calls to Claude start failing with
  a version error, check it against https://docs.claude.com/en/api/messages.
- Sprites load asynchronously. A new actor waits off-screen (`a.await`) until its picture has a size, then
  hops in. Do not place actors by size before `G.sizeActor` has run.
- Movement uses hysteresis on purpose (`a.settled`, `ARRIVE`, the facing timers in `setFace` and `setBack`).
  Removing it brings the jitter back; run `slowmo` after touching movement.
- The save is written on catches, evolutions, commands and every 20 seconds when something changed. Keep
  per-frame code away from `G.saveNow`.
- When nothing is moving the overlay drops to a slow tick and skips canvas work. Anything new that animates
  must count as "something is drawn" or it will stutter when the screen is otherwise still.
- If files are replaced while the program runs, the Pokédex window shows a restart notice because the
  running main process is still the old one. That is intended.
- The Pokédex window is transparent and fixed-size. Change its size only with `setBounds` (see
  `setPanelBox` in `main.js`). Do not switch `resizable` on and off: on Windows that has altered the frame of
  transparent windows in some Electron versions.
- Battle music rests for up to a minute after a fight and carries on where it stopped if the next fight is
  the same kind (`BATTLE_KEEP` in `src/sound.js`). Without that, the opening bars repeat every half minute.

## MyStream (0.5)

A streaming and recording studio that opens from the Pokédex ("stream" key), the tray menu or `--mystream`.
The owner's wish: stream several idle desktop games at once on one calm picture, never the desktop.

**Two windows, on purpose** (`mystream.js` in the main process owns both and explains itself at the top):

- the **stage** (`stage.html`, `stage.css`, `src/stage.js`, `src/fountain.js`): a hidden page, exactly 1280 x 720.
  It is the only thing viewers see: grass (`Field.draw` with nothing caught), the fountain, the game windows the
  owner switched on, the game itself, sticky notes, a "talking" sign. It is never shown on the desktop.
- the **booth** (`mystream.html`, `mystream.css`, `src/booth.js`, `src/whip.js`): the window the owner works in.
  It shows a capture of the stage page and all controls. Nothing in it is streamed.

What goes to Twitch or into a recording is a capture of the stage *page* (`webContents.getMediaSourceId`, asked for
by the booth), not of the screen. That is why resizing, minimising or covering the booth, or opening other
programs, changes nothing for viewers.

**The game moves.** It can only run in one page. While MyStream is open, `main.js` closes the overlay and the
stage runs the game (same scripts as `overlay.html`; `tools/mystreamcheck.js` checks the lists match). The save
file is the handover both ways. In `main.js`, `game()` is the window the game runs in: send game messages to
`game()`, never to `overlay` directly. On the stage the sprite scale is brought down to the stage's height
(`gameSettings`). The ordinary self-check refuses to run while MyStream is open; ask for `mystream-check`.

**Rules (the owner's, and what keeps a stream safe to leave running). `tools/mystreamcheck.js` enforces them.**

1. Only the stage is captured. No screen capture anywhere; the display-capture handler hands out the stage page only.
2. A window is on the stage only if the owner switched it on (tab "games"). Screen Trainer's own windows and
   windows recognised as Steam's (`STEAM_TITLE`) can never be switched on. Sources are remembered by title.
3. What Mewtwo says is never readable on the stage: `Mewtwo.say` hands the words to `StageHost.mask`, the stage
   shows scrambled letters under a blur, the booth shows the real words. Mewtwo's window is not capturable.
4. Twitch tokens and the stream key stay in the main process, encrypted with safeStorage (kept for one session
   only where that is unavailable). The booth gets `view()`, which has no secrets. The key is only ever sent to
   Twitch's video host (`whipAllowed`).
5. Going live and recording start only from the booth (going live takes two clicks). The request file can open,
   close and check MyStream; it cannot start a stream.
6. Overlay rule 1 (no scenery) still holds for the overlay. The stage has scenery because the owner asked for
   it there, as with the field window.

**How it is put together**

- Layout lives in `%APPDATA%\Screen Trainer\mystream.json` (`sanitize` in `mystream.js` is its only gate). Places
  are shares of the stage (0..1). A new game is placed once by `place()`: as large as on the real screen, on the
  bottom edge; a full-screen see-through game therefore fills the stage exactly.
- A game window arrives as a video of that one window (`getUserMedia`, `chromeMediaSourceId`). See-through
  overlay games arrive with a black background; `guessKey` looks at the picture's edge and a small WebGL shader
  removes it (a 2D-canvas fallback does the same without a graphics card).
- The fountain stands in the game's `#world` with a z-index at its base row, so sprites pass in front and behind.
  Its ball and statues are read from the owner's sprites folder at run time (rule 5 of the overlay rules).
- Twitch: device-code login (needs the owner's own Client ID, registered as "Public"), `helix/streams/key`,
  `helix/channels` for the title. Video goes out as WebRTC with one HTTP request (WHIP) to
  `g.webrtc.live-video.net:4443/v2/offer`; Twitch treats that endpoint as experimental. `src/whip.js` builds the
  offer, the main process posts it with the key. If Twitch ever drops WHIP, the place for an RTMPS sender is
  beside `whipOffer`: encode with WebCodecs in the booth, send chunks to the main process as recording does.
- Recording: `MediaRecorder` in the booth (H.264 + AAC in MP4 on Windows), chunks over IPC, written by the main
  process to `Videos\MyStream`. Length 5 seconds to an hour (`recSeconds`, one of `REC_LENGTHS`; `recMinutes` is kept for 0.6).
- Sound: a Web Audio mix in the booth. The microphone's track is disabled and its gain 0 unless talking.
  "The computer's sound" is Windows loopback and is everything the computer plays; off by default.

**Checking**

- `node tools/mystreamcheck.js` (reading checks) and `xvfb-run -a electron --no-sandbox tools/mystreamcheck.js`
  (the real program with a stand-in game window, stand-in Twitch and a stand-in viewer: 67 checks). Add
  `--ignore-gpu-blocklist --enable-unsafe-swiftshader` to exercise the WebGL path on a machine without a GPU.
  `ST_TEST_SPRITES=<folder>` gives it sprites, `ST_TEST_PICTURES=<folder>` saves pictures of every tab.
- On the real machine, by request file: `{ "run": "mystream-check" }` writes `selfcheck\<time>-mystream\`
  (`mystream.txt`, pictures of the stage and booth, one raw picture per game window) and `latest-mystream.txt`.
  Options: `"find": ["word"]` lists window titles containing a word (no other title is written down),
  `"attach": ["word"]` switches matching games on first, `"record": 4` makes a short test recording into the
  report folder, `"stay": true` leaves MyStream open. Also `{ "run": "mystream" }` and `{ "run": "mystream-close" }`.

**Things that have bitten**

- `<body>` must stay transparent on the stage: its background paints over negative z-index layers (the ground,
  games behind the Pokémon).
- `const G` is not `window.G`. Test with `typeof G !== 'undefined'`.
- Windows gave the frameless stage window 722 pixels of height for 720 asked; `open()` measures and corrects.
- `--use-fake-ui-for-media-stream` breaks the capture of the stage page in tests. `--use-fake-device-for-media-stream` is fine.
- A second copy of the program quits at once (single-instance lock): kill an old test run before starting the next,
  or the old one answers the request file.
- A video element outside the page gets no `requestVideoFrameCallback`; game-window videos sit in their tile, unseen.
- The mouse pointer is drawn into a captured window's picture by the engine. Over a full-screen see-through
  game the pointer is therefore visible on the stage nearly always. Since 0.9.4 the stage paints it out (see "0.9.4").
- On the owner's laptop the hidden stage runs at the display's 165 Hz. Harmless, but a frame limit would save power.

## 0.6

Built from the owner's `MyStream - Updates.txt`. What was done and what is still open is in the project notes
(`screen-trainer-0.6.md`); the parts of the code that changed:

- **Android: nothing is locked any more.** The owner changed the rule: the app shows every option. `locked.json` is
  only the starting point; `src/android.js` keeps the options on the device (`settings.json`), runs every change
  through `defaults.js` (loaded into the page by a three-line shim in `android.html`), and holds `PHONE_FIXED` to one
  value. `src/panel.js` hides the PC-only rows when `info.android` and the group `phone` on the PC. Only packed
  generations can be chosen (`locked.gens`).
- **Android touch.** A finger on a team Pokémon, Mewtwo, an item or the ball button is passed on exactly like a mouse
  button: down at once, moves, up. Do not go back to "pick again when the finger has moved": on a real phone a drag
  begins with a hold, and the old long-press opened the team page instead. `reach()` forgives a near miss.
- **Android with the screen off.** `G.frame` runs on requestAnimationFrame, which stops when nothing is shown.
  `keepGoing()` in `src/android.js` steps `G.update` from a timer by the time that really passed (`G.frameAt` tells it
  whether frames are arriving). The shell's `Keep.java` (a foreground service with a wake lock, started by
  `AndroidHost.keep(true)`, setting `bgTrain`) keeps Android from putting the app to sleep. `MainActivity.onPause`
  no longer pauses the web view while that service runs.
- **`android/stubs/`** are stand-ins for the Android classes so `tools/androidcheck.js` can compile the shell without
  the SDK. They are not packed. (On the owner's PC they lie zipped in `android/stubs.zip`: unpack it there to run the check.) The real compile is the export on a PC with the SDK: request `{ "run": "export-apk" }`
  and read `android\export-log.txt`.
- **`tools/androidpage.js`** (Electron): the Android page driven with touch events, 17 checks. Attach the debugger
  only after the page has loaded, and pass `no-proxy-server`, or it hangs.
- **Stage: notes** are at the level of `#stBack` (`stage.css`). **Fountain**: three canvases (`Fountain.ROWS`), and
  `G.blocks` (ellipses that feet are eased out of, end of `stepActor` in `src/game.js`; only the stage sets any).
  **Remove black**: `fillMask` in `src/stage.js` flood-fills from the picture's edge on a quarter-size copy four times
  a second; the shader keeps background-coloured pixels that are not joined to the edge.
- **Weather**: `FX.drawMarks` (snow patches, puddles; they count as "something is drawn" through `FX.busy`), setting
  `weatherFixed` handled by `stepFixed` in `src/events.js`.
- **Windows that Windows does not offer (ROG OMNI).** `desktopCapturer` leaves out tool windows and owned windows, which
  is what a desktop pet is ("Virtual Pet", window "ASUSMascot", style 0x80088). They can still be captured by handle:
  `listWindows` in `mystream.js` adds them (`hidden: true`, media id `window:<handle>:0`) from `ps\windows.ps1 -Mode list`.
  `SYS_CLASS` / `SYS_PROC` keep Windows' own furniture out: the desktop itself (`Progman`) is such a window and must
  never be offered or captured. PowerShell is only started when it can matter (see the comment there).
- **"Keep games off my desktop" (`cfg.tuck`, per game `desk`).** `syncTuck` in `mystream.js` moves the window of each game
  on the stage to x = 20000 with `ps\windows.ps1 -Mode move` and back. Where a window belongs is saved in `cfg.away`
  *before* it is moved; a leftover entry is only acted on if handle, program and class still match. `close()` brings
  everything back. Checked on the laptop: `{ "run": "mystream-check", "tuck": true }`; `"probe": ["word"]` lists what
  Windows says about matching windows.
- `ps\windows.ps1` belongs to MyStream, not to Mewtwo: it is not in `SCRIPTS` in `guardian.js`. It compiles a few
  lines of C# with `Add-Type` (that is how PowerShell reaches `SetWindowPos`); that worked under AVG on the owner's PC.
- **Field Dex on the stage.** `DEX_TITLE` in `mystream.js`: while the Pokédex window is open, `listWindows` offers it
  as a "window" with media id `tab:dex`; `dexMedia()` turns that into `tab:<w>x<h>:<id>` (a capture of the window's own
  page, one id per window and size), and `startTile` in `src/stage.js` captures it with `chromeMediaSource: 'tab'`.
  `markDex` and `info.myStream` put the class `onstream` on the Pokédex page while MyStream is open; `panel.css` blurs
  paths under it. Add anything else that could identify the owner to that rule, never anything about Pokémon.
- **Pokédex**: `entryHtml` in `src/panel.js` draws a Pokémon's page for team and Box alike (`shown` is whose page it
  is); every part carries a `title` hint. Keep that up when adding to it.
- **The stage's ground** is `Field.plan` of the current team's species (`drawGround` in `src/stage.js`).
- **Places round the fountain**: `src/stations.js` (it explains itself at the top). It wraps `G.onDown/onMove/onUp/update`
  on the stage only. Day Care guests are `save.daycare` (repaired in `parseSave`); they are not on the team and the
  Pokédex window does not show them yet. `Stations._test` is for `tools/mystreamcheck.js`.
- **The order on the stage** (`cfg.order` in `mystream.js`, back to front: `'fountain'`, `'trainer'`, game ids). The stage gives
  `#root` (the Pokémon), `#stPlaces` (fountain and places, their own layer now, no longer inside `#world`) and each game's
  own `.stLayer` a z-index from it (`applyOrder` in `src/stage.js`). The booth shows it as numbers counted from the front.
- **Breeding** is `src/breed.js` (rules) with `src/data-breed.js` (generated by `tools/build-breed-data.js` from the PokeAPI
  CSV tables). `node tools/breedcheck.js` holds 30 known cases; keep it passing. **Eggs** being carried are `save.eggs`
  in `src/game.js` (`stepEggs`, `G.hatch`, `G.teamRoom`): the time left is never shown anywhere, by the owner's wish.
  Both new files are in the script lists of `overlay.html`, `stage.html` and `android.html`.
- **Mega Evolution and Dynamax**: `src/forms.js` with `src/data-forms.js` (generated by `tools/build-forms-data.js`). A Mega
  form stands in for the species through `Mon.setForm` (so `Mon.stats` and `G.types` follow by themselves); the picture
  is the form's id (`G.loadSprite` looks at `a.form`), `a.grow` enlarges in `G.sizeActor`. Dynamax doubles health with
  `mon.hpx`. Nothing of it is saved; `Forms.end` must always run (it does when the actor goes). The playtest's size
  invariant knows `a.grow`.
- **Trainer battles and Gym Leaders**: `src/rivals.js`. A rival's Pokémon are wild-side actors with `a.rival`; `game.js` asks
  about that mark in `G.wantCatch`, `think` (who the team targets), `wildAI` (no cowering or fleeing), `G.trimLoiter`,
  `G.throwBall` and `G.onDown` (a click is an order). **Badges are no longer given for the task alone**
  (`Honors.checkBadges` gives none): the task makes the Gym Leader come (`Honors.nextGym`), winning gives the badge.
- The three new script files are in the lists of `overlay.html`, `stage.html` and `android.html`.
- **What a hit looks like**: `FX.impact` and `FX.gather` in `src/fx.js` (one `case` per type), called from `resolveHit`
  and `fire` in `src/battle.js`. `FX.onShake` is set by `src/overlay.js`. They scale with the "Attack effects" setting.
- **Twitch chat and the desk** (`mystream.js`, "Twitch chat and the stream's desk"): chat is IRC over a web socket opened in
  the main process (`chatStart`, `chatIn`, `chatSend`), anonymous for reading when the login has no chat scopes
  (`twScopes`); the booth only gets lines and shows them as text. The desk reads `helix/streams` and `helix/channels`,
  sets the category, adds markers, and opens Twitch's own Stream Manager in the browser. The checks use a stand-in web
  socket server inside `tools/mystreamcheck.js`.

## 0.7

Built from the owner's `Fixes and updates11-13.txt`. What was done and what is still open is in the project notes
(`screen-trainer-0.7.md`); the parts of the code that changed:

- **Three more rules that must stay true.** (10) Rotom's rules at the top of `optimize.js`: one chosen folder, names
  only, move never delete or overwrite, only the plan that was shown, everything undoable, an AI only suggests folder
  names. (11) The empty copy (`shareexport.js`) never contains sprites, sounds, ROMs, saves, settings, keys or logins.
  (12) Nothing connects to anyone unless the owner switches online play on (there is none yet: keep it that way when
  there is). `tools/v07check.js` enforces 10 and 11.
- **Speeds.** `G.walkRate()` and `G.moveRate()` in `src/game.js` (settings `walkSpeed`, `moveSpeed`). `G.host` is a hook
  for online play: a visited Trainer's values would go there.
- **Walking round things.** `steer` in `src/game.js`: when something in `G.blocks` lies between an actor and its goal it
  walks to a point further round the rim, on a side chosen once (`a.round`) and never one that leads out of the world.
  The old "ease out and slide along" only eases out now. `waypoint` throws a spot again when it falls outside the world
  or inside a block (clamping put everyone on the edges). Run `slowmo` after touching either.
- **Drop-in.** `G.dropIn(a, x, y)` marks an awaiting actor to be set down at a place (`a.await.drop`, then `a.fall`):
  used when a guest is taken out of the Day Care and when an egg hatches.
- **Trainer battles** (`src/rivals.js`, and `G.inTrainerBattle()`): no reviving while one is on (`stepActor`,
  `G.useItem`, `Items.autoCare`, the Poké Center in `src/stations.js`); wild Pokémon keep clear (`keepClear`, and
  `G.enemiesOf` leaves them out, so sweeping moves do not reach them); a click is an order (`order` resets the leader's
  obedience clock so `think` rolls at once). A Gym Leader who leaves with the badge sets `save.gymRetry`; the badge
  button is `syncButton` / `Rivals.hit` / `Rivals.rematch`, picked up by `G.pick` as `{ kind: 'gym' }`.
- **The field window is a camera now** (`src/overlay.js`: `layout`, `applyCam`, `onFieldCam`). `G.cam = { x, y, z }`, or
  null everywhere else. The world is at least `Square.MAP` (1280 x 720). `#root` stays the view's rectangle; its children
  carry the camera as a transform. **Anything that turns a pointer into a place uses `G.toWorld`, anything on the
  screen that follows a place uses `G.toScreen`**; do not add `G.vx` by hand any more. The field page reports drags and
  wheel turns (`st.fieldCam`), the overlay answers with what it shows (`st.fieldView`), and `field.html` draws its ground
  with the same transform. `G.mapWorld(k, bx, by)` moves and scales every position when the world jumps.
  The zoom last used is the setting `fieldZoomAt`. 0 means "never zoomed": the window then starts at the lowest allowed
  level at which the field still fills it (a 320 x 228 window starts at 0.5, a 760 x 500 one at 0.75), so a small window
  does not open onto nothing but the fountain.
- **Fountain Square in the field window**: `src/square.js` builds it into `#stPlaces` (inside `#root` on the overlay);
  `src/stations.js` now centres on `G.W`, `G.H` and reports hits (`Stations.hit`, `.grabbing`) because the overlay only
  takes the mouse over something `G.pick` finds (`{ kind: 'place' }`).
- **The ground** (`Field.partyPlan`, `Field.typeAt` in `src/field.js`): equal shares for the Pokémon that are there.
  `G.groundList()` says who (the team, or the Box Field's list); `G.groundType(x, y)` and `G.onGroundOf(a, type)` are what
  `src/battle.js` asks for the 1.3 times. `G.hasGround()` is false on the plain overlay. `G.leaveMark` makes the marks
  moves leave (zones of kind `'mark'`, drawn by `FX.drawZone`). The Android page still uses the old `Field.plan`.
- **The Box Field** (`src/boxfield.js`): `G.update` asks `BoxField.step` first and returns while it is up. The main
  process says whether the Box is on show (`st:box`, `syncBox` in `main.js`).
- **The three helpers** (`src/events.js`, "the three helpers"): `save.helpers`, `Events.startHelper`, `.helperCaught`
  (called first thing by `G.catch`), `.helperView` (the Pokédex shows the keys from `state.helpers`). `src/mewtwo.js`
  only builds Mewtwo once `helpers.mewtwo` is set. The playtest's `lead()` and `tools/v07check.js`'s `fresh()` start
  with all three at home; a persona run meets them. A helper is "Super XXL": size 255, `a.grow = 1.6`, and
  `G.sizeActor` draws it at least 0.18 of the world's shorter side (a Rotom is 30 cm), never past the 0.62 cap.
- **Two old movement flaws the slow-motion playtest found on the way**: `G.hopTo` now starts from where a lunging
  Pokémon is drawn (it used to drop the lunge and jump back first), and `fight()` keeps a ranged fighter backing off
  until 30 px past the line where it started to (`a.backing`), so neighbours nudging it over that line no longer make it
  step back and stop every other frame. The playtest's "off screen while idle" does not count a lunge as idle.
- **Pokédex window**: `showTab('party:<uid>')`; `applyTurn` (dragging a picture); `#tip` (hints drawn by the page: a
  `title` is moved to `data-hint` while the pointer is on its element); setting `hints` and
  `:root[data-hints="hover"]` in `panel.css`; the import screen (`#import`, `importRead`, `importDraw`); `renderKeys`.
- **MyStream**: `recSeconds` and `REC_LENGTHS` replace `recMinutes` (still written, for 0.6).
- The self-check knows the camera, Fountain Square and that Mewtwo may not have been caught yet.
- **Checking**: `xvfb-run -a electron --no-sandbox tools/v07check.js` needs `ST_TEST_SPRITES`. A folder of plain
  coloured shapes named like a sprites folder is enough (`pokemon/<n>.png`, `pokemon/back`, `pokemon/shiny`,
  `items/<key>.png`, `badges/<n>.png`); leave `pokemon/149.png` out and the stand-in shape is checked too.
- **Not built in 0.7**: online visiting (it came in 0.8: `Square.down` calls `Online.button()`, which `src/visitors.js`
  defines), a camera for the stage, 3D pictures.

## 0.7.1 (what lies over what)

The owner's first play test of 0.7: "the fountain is drawing in front of the Field Dex". Until then the overlay was
pushed to the very top of the screen once a second while the field window was open. That was unnoticed while the
overlay only carried Pokémon; with Fountain Square on it, scenery covered every window that lay over the field.

- **The overlay belongs to the field window while the game is inside it** (`tieOverlay` in `main.js`,
  `overlay.setParentWindow(fieldWin)`). Windows keeps an owned window directly above its owner, so whatever is in front
  of the field window is in front of the Pokémon and the fountain as well. It is let go (`untieOverlay`) before the field
  window closes, because Windows closes owned windows with their owner, and whenever there is no field rectangle
  (field minimised or hidden): the Pokémon then have the whole screen and the overlay is its own master again.
  Should the overlay be closed along with something all the same, `createOverlay` runs again (`keepOverlay` says
  whether it was closed on purpose, as when MyStream takes the game).
- **"Stay on top" belongs to the field window while it is open** (`applyTopmost`); the owned overlay follows by itself.
  Never call `overlay.setAlwaysOnTop` while `tied`: Windows changes the owner along with an owned window. The level is
  `pop-up-menu`: with `floating` Electron parks the window behind the taskbar, and on Windows 11 it then is no longer
  topmost at all (the self-check of 0.7.0 reported the field window as an ordinary window although the setting was on).
  The Pokédex, Mewtwo's window and Optimize are made topmost alongside, so that they can come in front of a field that
  stays on top.
- The self-check puts the Pokédex over the field window, takes a picture of the screen and compares what is seen there
  with the Pokédex's own picture (`dexInFront` in `selfcheck.js`, Windows only; only that part of the screen is kept).

## 0.8 (online visiting)

The owner's list asked for it and he chose "direct, no server". What that became:

- **Who meets whom, and where.** A player with MyStream open can be visited; visitors see the MyStream stage (so only
  what the host put on it) and play on it. Up to three visitors (`MAX_VISITORS`), four players. Modes: off (default),
  friends (a ten-character friend code), open (random visitors too). The ball on top of the fountain opens the "online"
  window and, when visiting is on, goes looking for a random host; for a visitor on a stage it is the way home.
- **Finding each other** (`onlinenet.js`): notes on free public MQTT boards over secure web sockets, three at once
  (`BOARDS`), every note on all of them, acted on once. Topics: `screentrainer1/lobby` (who is open?),
  `.../r/<room>` (a host's door), `.../v/<visit id>` (a visitor's letter box). The room name and a proof are derived
  from the friend code with scrypt, so a room name read off a board cannot be turned back into the code and a knock
  without the code opens nothing in friends mode. Offer and answer (which hold the addresses) are sealed with a key the
  two agree on (ECDH P-256, HKDF, AES-256-GCM). Offers are complete before they are sent (no trickle), so a visit is
  two notes each way.
- **The visit** is WebRTC, directly between the two computers: the booth's picture of the stage one way (video only,
  never sound, never the microphone; 24 pictures a second, 1.8 Mbit at most), a data channel named `st` both ways.
  STUN from Google and Cloudflare, no TURN: two players behind strict routers will not connect ("direct, no
  server"). **Each side can learn the other's IP address**; the window says so where the mode is chosen.
- **What crosses, and who checks it.** Visitor to host: `p` (pointer), `c` (click, button 0 or 2), `say` (a line's
  number), `bye`. Host to visitor: `hi`, `who`, `say`, `catch` (a Pokémon as numbers), `helper`, `home`. The pages
  only carry; `online.js` checks and counts everything (`input`, `fromHub`, `gift`, `line`): ranges, rates (45 pointer
  moves and 8 clicks a second, a line every 1.5 s, a gift every 1.2 s and 400 a visit). `src/game.js` builds a gifted
  Pokémon anew from those numbers (`case 'gift'`, through `Showdown.build`); it is marked `vis: 1`.
- **What a visitor's click may do** is decided in one place, `click` in `src/visitors.js`: the fountain's ball (home),
  `G.poke`, `G.throwBall(a, { by, x })` (a plain Poké Ball of the visitor's own: nothing leaves the host's Bag),
  `G.pet`, `Events.pet`. Not: drags, the Bag, drops, the Day Care, the pipe, trade pads, Mewtwo, the badge button, a
  rival's team, any window.
- **Shared catches**: `G.catch` calls `Visitors.caught`; a helper caught on the stage goes to the visitors as well
  (`Events.helperCaught` -> `Visitors.helper` -> `Events.visitHelper` on their side).
- **Names, lines, pointers**: `CLASSES`, `LINES`, `CURSORS` in `online.js`. A name is a class plus four digits from
  the identity's tag; the identity itself (`pid`) never leaves the computer. Pointers are rewards counted from the
  game's own state (`gameStats` in `main.js`); the other side cannot check that a pointer was won, and need not.
- **Blocking** is by tag, kept in `online.json`: a blocked visitor is told "no room", a blocked host is passed over.
  Somebody who throws their identity away gets a new tag: blocking stops the casual, not the determined.
- **Windows**: the host's end is `src/online-host.js` in the booth page (it needs the booth's picture:
  `window.boothStageTrack`); MyStream tells visitors before it closes (`beforeClose` -> `hostLeaving`).
- **Checking**: `node tools/onlinecheck.js` (31 checks, two stand-in boards), the same file under Electron with
  `ST_TEST_SPRITES` (the program visits itself: `ST_TEST_BOARDS` points it at the stand-ins and allows that), and on a
  real machine the request `{ "run": "online-check" }`: the program visits itself over the real boards with a friend
  code made for the occasion, and reports each step (`check` in `online.js`). That is the only check that goes online.
- **Not built**: sound for visitors; visiting from the Android app; (the host's own pointer on the stage came in 0.9.4) anything
  that needs a server (a list of who is online, accounts, a ban that survives a new identity).

## 0.9 (state machines said out loud, and "a Pokémon can always be clicked")

The owner reported Pokémon that could not be clicked and asked for every implicit state machine to be found. What was
found on the real machine first, because it explains the rest:

- **The overlay could lie BEHIND the field window.** Since 0.7.1 the overlay belongs to the field window (owner and
  owned). Windows keeps an owned window above its owner only when the owner is *moved* in the stack; an overlay that
  was *shown* after the field window was already in place (program start, MyStream closing: a race between two
  `ready-to-show`) kept its old place, below. Measured with `ps\windows.ps1`: field at 0, overlay at 1. The field
  was then empty until something happened to move the field window (a click on the grass, opening the Pokédex).
- **Nothing in the Box Field took the mouse.** With the Box out the field shows the Box and the game waits; a click on
  one of those Pokémon did nothing, by design of 0.7. The owner wants them touchable.
- **One number that is not a number froze one Pokémon.** `G.pick` compares against `a.x`, `a.jy`, `a.w` ...; with a
  NaN in any of them every comparison fails, the Pokémon is never "the one under the pointer", and its picture stays
  where it last was (CSS drops a transform with NaN in it). Others carry on. No source of such a NaN was found in
  57 simulated hours; `G.sanity` now puts it right and writes down which field it was, so the source can be found.

### The helper: `src/machine.js`

One small file, loaded by the game pages (plain script, before `core.js`) and by the main process (`require`).
`Machine.make(name, { about, initial, states: { s: { about, to, max, then } }, change })` gives `.state`, `.is()`,
`.go(to, why)`, `.history` (last 24 changes with time and reason), `.refused`, `.rescued`. A change the table forbids
is refused and counted, never thrown (the checks set `Machine.strict`). A state with `max` seconds and `then` is left
by `Machine.tick(now)` when it overstays: a state that should pass cannot stay for ever. `Machine.report()` lists all.

### The machines, and the state still kept in plain variables

| Name | Where | States | What moves it | Cannot get stuck because |
|---|---|---|---|---|
| `layer` (machine) | `main.js` | none, own, field, hidden | `syncLayer()` from `tieOverlay`, `untieOverlay`, `applyVisible`, overlay made or closed, and once a second | it is derived from the facts every second; **the keeper** (same timer) puts the overlay directly above the field window (`moveAbove`) while tied, on top every 4 s while not |
| `home` (machine) | `main.js` | overlay, stage, moving | `syncLayer()`; MyStream's `beforeOpen` / `afterClose` | `moving` lasts 25 s at most: then the overlay is made again if neither page runs the game |
| `play` (machine) | `src/game.js` | playing, box | `step()` every frame from `BoxField.step` | derived every frame |
| `pointer` (machine) | `src/game.js` | through, over, held, guard, place | `pointerStep()` every frame; tells the window (`st.hover`) on every change **and again every 2 s** | `pointerStep` runs even when the game's step threw; held states end after 90 s; a mouse move with no button held lets go (`G.letGo`); a held Pokémon that left is let go |
| actor state | `src/game.js`, `a.state` + flags `await`, `balled`, `dragging`, `vol.away`, `busy`, `gone` | idle, roam, enter, faint, captured, leave ... | `stepActor` | `G.sanity()` once a second: NaN numbers, `balled` with no ball, `away` over 8 s, `await` over 45 s, `dragging` with empty hand, pictures without a Pokémon. One actor's step throwing no longer stops the others (`actorFailed`) |
| Box Field | `src/boxfield.js`, `wantOn`, `on`, `hand` | off, on (+ a Pokémon in hand) | main says whether the Box is on show (`st:box`); `step` enters and leaves | `hand` is dropped on leave and by `G.letGo` |
| mouse click-through | `main.js`, `captureNow` | falls through, overlay takes it | `st:hover` | re-sent every 2 s; reset when the overlay closes |
| field window | `main.js`, `fieldWin`, `fieldRect`, `fieldGoing` | closed, open, hidden, minimised | window events → `syncField()` | derived from the window on every event |
| Box on show | `main.js`, `boxShown` | in, out | panel show/hide/minimize/close → `syncBox()` | derived on every event |
| the game's camera | `src/overlay.js`, `G.view`, `G.cam` | none, field camera | `G.setField`, `onFieldCam`, `layout` | a layer added later asks for the camera (`G.applyCam`) |
| grass drag | `field.html`, `pan` | idle, panning | mousedown / mouseup / blur | ends on blur |
| Mewtwo drag | `src/mewtwo.js`, `drag` | idle, dragging | down / up | part of `pointer` ("guard") |
| Day Care hand | `src/stations.js`, `grab`, `busyTrade`, `ask` | idle, guest or egg in hand, a trade running, asking once more | wraps `G.onDown/onMove/onUp/update` | part of `pointer` ("place"); **note the wrapping**: Stations replaces those four functions, so it is the outermost handler |
| rival | `src/rivals.js`, `R.phase` | none, wait, battle, leave | `Rivals.update` with timers `R.t` | each phase has its own timeout already |
| events | `src/events.js`, `cur`, `weatherIn`, `helperIn` | no event, weather, a legendary visit (`cur.out`) | countdowns | countdowns |
| sound | `src/sound.js`, `sceneNow`/`sceneWant`, `ctx.state` | roam, battle (+ suspended) | `Sound.scene` four times a second | wanted vs. now, re-evaluated |
| MyStream | `mystream.js`, `opening`, `closing`, `live.on`, `rec`, `pending`, `tuckBusy` | closed, opening, open, closing; live; recording; Twitch login pending | promises | `opening`/`closing` are promises with `finally`; open failure runs `afterClose` |
| stream out | `src/booth.js` `liveWanted`/`liveState`/`liveTries`, `src/whip.js` `state` | off, starting, live, retrying | booth buttons, WHIP callbacks | retry counter with a limit |
| online visit | `online.js`, `visit.state` | idle, looking, connecting, there | already explicit, with `visit.why` | timeouts in `onlinenet.js` |
| online boards | `onlinenet.js`, `state` per board | off, connecting, on | websocket events, `retryT` | retry timer |
| Pokédex window | `src/panel.js`, `tab`, `sel`, `drag`, `armed`, `boxBusy` | which tab; a drag; "release" armed | clicks | `armed` clears on tab change |
| busy flags | `main.js`, `checking`, `exporting`, `sharing` | idle, busy | promises with `finally` | `finally` |

Decision taken (and why not more): the two machines that span two processes (`layer`, `pointer`) and the two that
decide whether the game is anywhere at all (`home`, `play`) are real `Machine`s now, with history and rescue. The
others stay as they are **and are in the table**, because each already has a single owner and a way out; rewriting 14
working modules into one framework would have risked exactly what the owner asked not to risk. `G.sanity()` covers
the per-Pokémon flags without touching the 1,500 lines that set them. New state: make a `Machine` if two windows or
two processes have to agree on it, or if an event that ends it can go missing; otherwise a row in this table.

### Reading the state (for an agent that can only copy files)

- `{ "run": "state" }` in `selfcheck\request.json` writes `selfcheck\state.json`: every machine with its history, the
  kept states by name (`main.kept`), the windows as Electron sees them, **the real stack of windows front to back**
  (`stack`; other programs by name only, never their titles), the last 200 things the pointer did on the game page
  (`page.trace`: mouse taken / let through, every button down with what it hit or what was nearest, ups, let go,
  blocked, put right, errors) and every Pokémon with `clickAtItsMiddleMeans`. `"pointer"` is the same report.
- `{ "run": "state", "pin": 60 }` also holds the first team member under the pointer for 60 game seconds
  (`"who": "wild"`, `"n": 2` choose another): a click made with computer use is then sure to be on a Pokémon.
  `"pin": 0` lets it go. (Moving the pointer and clicking at once misses: the overlay needs about 60 ms to notice
  the pointer. Move, wait 0.3 s, click.)
- `selfcheck\blackbox.log`: one JSON line for everything that went wrong or was put right since the program was
  installed (errors, `put right`, `blocked`, `covered`, `placed`, `rescued`, `let go`, and a `stack` line when clicks
  were blocked). Read this first when the owner says "it stopped answering".
- `st.blocked`: the page has the mouse, the pointer moves on a Pokémon (the main process says so), and no mouse event
  of its own arrives → another window lies on the overlay. Main puts the overlay back unless the window on top is
  one of ours (the Field Dex over the field is meant to cover).
- `node tools/statecheck.js`: 39 checks of all of the above, headless, a few seconds.

### Also in 0.9

- Box Field Pokémon: click = pat (hop, hearts, cry; nothing about the Pokémon changes), right-click = the Pokédex
  opens on it (`box:<uid>` → the page's `boxmon:<uid>`), drag = carried to another spot.
- The field window no longer grows by four pixels at every start on a screen scaled to 112.5 % (`fieldGrow`).
- After the field window closes, the Pokédex is no longer left "always on top".
- The Box Field's layer gets the field window's camera when it is first made (it was drawn unzoomed until the first drag).

## 0.9.1 (clicks that land where they are seen)

The owner's play test of 0.9: "after opening and closing the field window Pokémon are not able to be clicked" and
"Pokémon outside a resized field window can be clicked". Both are about the mouse; nothing else changed.

- **Only what can be seen takes the mouse.** `G.inView(sx, sy)` in `src/core.js`: true on the plain overlay and the
  stage, and in the field window only inside the window's rectangle (or while `G.pulling`, when Pokémon are drawn
  outside it on their way in). `G.pick` asks it first and, outside, finds nothing but Mewtwo and the badge button
  (they stand on the screen). The Box Field (`pointerStep`, `G.onDown`) asks it too. Since 0.7 the world in the field
  window is at least `Square.MAP` and the window may show a small part of it: **anything new that the pointer can hit
  in the world must go through `G.pick` or ask `G.inView`.**
- **A press that never arrived** (`src/overlay.js`, the `mouseup` listener). The overlay lets the mouse through until
  the page says the pointer is on something (`st.hover`); a button pressed before Windows has the switch goes to the
  window behind and only the release reaches the page. The play test's `page.trace` showed it: four `up` and no `down`
  on Walrein. A release with no press of its own on something `G.pick` (or `BoxField.pick`) finds is taken as the whole
  click: `G.onDown` then `G.onUp`, noted in the trace as `lost press`.
- **Linger** (`pointerStep` in `src/game.js`, `LINGER` = 0.18 game seconds): a Pokémon that walks out from under a
  pointer that stays where it was (within 24 px) keeps the mouse that long. A pointer that moves away lets go at once,
  so the desktop beside a Pokémon is not held.
- **Main process**: `refreshMouse()` says `setIgnoreMouseEvents` again after every tie and untie (a change of owner
  rewrites the window's styles), and the field window's `closed` puts the overlay on top at once
  (`placeOverlay('the field window closed')`) instead of at the keeper's next fourth beat. `fieldGoing` is cleared
  there too.
- `node tools/v091check.js`: 16 checks, headless, a few seconds (four of them fail on 0.9.0).
- The camera and dragging the grass stay. The owner offered to remove them if they were the cause; they were not.
  Should the owner want the 0.6 field window back (world = the window, Pokémon kept inside it while resizing), the
  pieces are `layout` / `applyCam` / `onFieldCam` in `src/overlay.js`, `st:field-cam` in `main.js` and the drag in
  `field.html`; Fountain Square (`Square.MAP`, 1280 x 720) would then have to be scaled to the window.

## 0.9.2 (dragging team Pokémon)

Owner: "sometimes Team Pokémon aren't able to be dragged" (laptop + external monitor). The traces of a long session
held 83 `lost press` notes and not one real `down`: Windows gave the overlay the moves and the release but never the
press, so 0.9.1's rescue made every click a tap and no drag could begin. A freshly started program did get presses
(a live drag after `restart` worked), so it comes and goes; the cause on Windows' side was not pinned down (suspects:
Chromium's answer to WM_MOUSEACTIVATE for a window that cannot be activated, the overlay being owned by the field
window, the Pokédex being the active window).

- `src/overlay.js`, `pressFromMove`: a `mousemove` with the left button held (`e.buttons & 1`), no press of its own
  seen, the button up on the move before (so it went down here, not elsewhere before the pointer came over), the
  overlay holding the mouse, and something `G.pick` / `BoxField.pick` finds where the pointer last was with the
  button up (`upAt`): that is the press. `G.onDown` there, noted `lost press` ("a drag from where it went down"); the
  release then arrives as an ordinary one.
- `desktop` in overlay.js became `isDesktop()` (asked each time), so a check can set `st.blocked` after the page is up.
- `tools/playtest.js`: the pretend window keeps its listeners (`window._listeners`), so a check can send the page a
  mouse event. `tools/v091check.js` now sends the lost-press events: a release alone pats; a held move drags and the
  release sets the Pokémon down; a button pressed elsewhere and dragged over a Pokémon does not pick it up (21 checks).

## 0.9.3 (fixes 3, 5, 6, 7, 8 of "fixes and updates11-16")

- **Fix 7**: `fillOptions` (src/panel.js) skipped any control with the focus; the "Show the field" box keeps the focus
  after a click, so closing the field with its X left it ticked. Tick boxes are now always set; only text boxes and
  sliders being used are left alone.
- **Fix 5**: `fieldOnOverlay` (main.js) sends the whole content rectangle of the field window, also the part past the
  edge of the overlay's screen (it used to send the intersection, so the world and camera were fitted to a smaller
  field than the one field.html draws). It is still null when less than `FIELD.least` of it is on the screen.
- **Fix 3**: `Rivals.leave` holds the Trainer in place for `R.hold` (≥ 3 s, ~0.35 s a word) with its words up, then
  it walks to `R.out` at a slower pace; removed at `hold + 4.5` s.
- **Fix 6, looks**: `m.look` (string, absent for most) is a form that only changes the picture. `Mon.pickLook` /
  `LOOKS` / `KEEPS` / `FEMALE_LOOK` / `Mon.lookName` in src/mon.js; chosen in `Mon.create`, kept or re-chosen in
  `Mon.evolveTo`. `spritescan.js` now also indexes files named `<species>-<look>`; `Sprites.resolve/views/still` take a
  look and find it whatever the set calls it (`lookKey`: hyphens and a trailing `-sweet` ignored), falling back to the
  plain picture. Callers pass `m.look`: core.js (actors), game.js (`monView`, which also sends `species` with the look
  and `look`), boxfield.js, stations.js. Forms that change types or stats (regional forms, ids 10001+) are NOT looks.
- **Fix 8**: `caughtBall()` in game.js draws a 9 px Poké Ball before a wild Pokémon's name tag when
  `save.dex.caught[sp]`; the arrival line no longer says "(not caught yet)". The low-health flee roll in `wildAI` needs
  `a.age > 30` and says "ran away!" (a hurt newcomer used to leave within seconds of arriving).
- `node tools/v093check.js` (15 checks). `tools/v07check.js` update 6 changed to match.
- **Open (before fix 4 was done the same day)**: fix 4 (field window in the ordinary order of windows, only the Pokémon on top: the scenery of Fountain
  Square lives on the overlay, so it has to move into field.html or be hidden when covered) and fixes 1-2 (the OS
  pointer is drawn into every captured game: `getUserMedia` with `chromeMediaSource: 'desktop'` ignores
  `cursor: 'never'`; `getDisplayMedia` through `session.setDisplayMediaRequestHandler` may honour it — to be tried).
- **Fix 4 (later the same day)**: the overlay is never tied to the field window any more (`tieOverlay`: `want =
  false`); the field window is never topmost (`applyTopmost`), and the overlay is put on top every second while the
  field is open. `ps\cover.ps1` (started by `coverWatch()` in main.js while there is a `fieldRect`; one PowerShell
  process, per-monitor DPI aware, ends with the field window or the program) prints the parts of the field window
  covered by visible, uncloaked, not click-through windows above it. main.js turns them into DIP rectangles on the
  overlay page (`st:covers`); src/overlay.js `applyCovers()` subtracts them from the view and sets a `clip-path` on
  `#ground` and `#stPlaces` and `FX.setClip` (src/fx.js: weather particles and splashes are marked `wx` and drawn
  inside the clip; battle effects are not). `G.covered(sx, sy)`; `G.pick` does not hit Fountain Square there. The
  fountain's front layer now lies under the Pokémon (the clip makes `#stPlaces` a stacking context): accepted by the
  owner. `pointerReport` shows `covers`. `tools/guardiancheck.js` knows `cover.ps1`. The flee age is 3 s (owner).

## 0.9.4 (fixes 1 and 2 of "fixes and updates11-16": the pointers in MyStream)

The owner: several mouse pointers on the stream (fix 1, "mouse visibility toggles for each game"), and the owner's own
custom pointer should be what viewers see, with an options menu and an arrow on the edge pointing to the mouse (fix 2).

- **Why there were several.** Chromium draws Windows' pointer into every captured window's picture while the mouse is
  over that window. `cursor: 'never'` is ignored by `getUserMedia` *and* by `getDisplayMedia` through
  `setDisplayMediaRequestHandler` (tried on the owner's PC with Electron 45: same picture either way). So the engine
  cannot be asked; the stage now paints the pointer out itself.
- **Where the mouse is in each game's picture**: `pointerFrame()` in `mystream.js` (pure, exported, checked by
  `tools/v094check.js`). Electron gives the mouse (`screen.getCursorScreenPoint`, turned into screen pixels with
  `dipToScreenPoint`); `ps\pointer.ps1` (one PowerShell process while MyStream shows game windows, started by
  `pointerHelper()`, handles passed as `-Handles`, restarted when they change, backs off if it keeps ending; it only
  reads) prints the games' window rectangles (DWM extended frame bounds = what a window capture shows) and the hot spot
  and size of the current Windows pointer. `pointerTick()` (30 times a second while MyStream is open) sends the stage
  `ms:pointer` `{ tiles: { sourceId: [x0, y0, x1, y1] }, host: { at, x, y, a, via }, key }` when it changes.
- **Painting it out**: `frameOf()` in `src/stage.js`. Each game tile keeps `t.cc`, a canvas the size of the picture:
  while the pointer is not in the picture it is refreshed every third picture; while it is, everything outside the
  pointer's box (this one and the last one: the picture and the news of the mouse do not arrive together) is copied in
  and the box keeps what was there before. The tile then draws from `t.cc` instead of the video (WebGL, the slow path,
  `fillMask` and `guessKey` all take `src`). Per game `s.mouse` ('hide' by default, 'show' leaves Windows' pointer in);
  the booth's games list has the "mouse: hidden / shown" button. Known limit: what lies under a pointer held still does
  not move until the pointer does.
  No copy is made for a tile until its window's place is known (`ptr.known`, from `pointerFrame`'s `known`): the first
  try on the owner's PC had the mouse over the game when MyStream opened, and the first copy kept Windows' pointer. If
  the pointer is over the game when it becomes known, its box is filled from the rows above and below (`t.filled`). The
  box is also sent a little before the pointer arrives (`NEAR`, 90 screen pixels), so no copy is taken as it comes in.
- **Tried on the owner's PC (2026-11-16)** with a pink stand-in window: the raw capture shows Windows' arrow, the stage
  does not. With "Keep games off my desktop" on, a game's window is at x = 30000 and the mouse never reaches it, so only
  games set to "on my desktop too" (or the option off) get Windows' pointer at all. The `mystream-check` report's
  `pointer` holds `last` (mouse in DIP and screen pixels, the primary display, whether the mouse is on the booth) and
  `displays`. The owner's booth fills the second screen, so the edge arrow could not be brought up there by moving the
  mouse; `pointerFrame` is checked headless for it.
- **The owner's pointer**: drawn by `src/stage.js` ("the owner's own pointer") as `#hostPointer` (a `.vp` from
  `pointers.css`, scaled by `cfg.pointer.size`) and `#hostEdge` (the arrow on the rim, in the pointer's colours), on the
  body above everything (not in `#screen`, which hides with the Pokémon). Where: playing on the booth's picture → there
  (`boothPoint`, from `ms:input`); mouse on the booth otherwise → nothing; over a game window whose tile is live → the
  same spot in that tile, wherever the owner put the tile (smallest window wins); anywhere else → the stage stands for
  the main display (as wide as the stage, from its top, as `place()` puts a full-screen game). Off the stage → the arrow,
  on the line from the stage's middle. Over a game whose mouse is "shown" the owner's pointer is left out (`via`).
  Pure picture: it takes no clicks.
- **Choosing it**: MyStream's new "pointer" tab (`renderPointer` in `src/booth.js`): show it, size (100–300 %), the edge
  arrow, and which pointer. The pointer itself is the one `online.js` keeps (`cfg.cursor`, only one that was won):
  `ms:cursor` → `ctx.setCursor` → `ov.set({ cursor })`; `ov.pointer()`, `ov.cursorNow()` are new. Settings:
  `cfg.pointer = { show, size, edge }` in `mystream.json` (`sanitize`).
- `API` in main.js is 8 (new preload calls `st.ms.cursor`, `st.ms.onPointer`). `tools/guardiancheck.js` knows
  `pointer.ps1`. The MyStream self-check (`mystream-check`) reports `pointer` (the last frame, the helper, the window
  rectangles, what the stage drew) and checks that the games' windows are watched.
- `node tools/v094check.js` (30 checks, headless). The live parts of `tools/mystreamcheck.js` and `tools/v07check.js`
  need a development Electron (`electron tools/...`), which the owner's PC does not have; the packaged program cannot
  run them (`require('electron')` fails under `ELECTRON_RUN_AS_NODE`).

## 0.9.5 (the quick wins of "fixes and updates11-16": requested updates 1, 2, 3, 5, 9, 10, 11, 12, 15, 16, 18)

The owner's decisions for the road to 1.0 are in the project notes; for this file: online chat will let the **host**
type, visitors only get ready-made lines (rule 10 is amended for the host side only, in 0.9.7); Rotom puts old folders
in the Recycle Bin, never deletes; a local AI comes last before 1.0.

- **Spawning (12, 16)**: `spawnWeight(id, nCaught)` in `src/game.js` is now the one place that says how likely a species
  is (it was inline in `spawnWild`). `variety` (0-10) flattens the catch-rate weighting (`w ** (1 - 0.09 v)`) and makes
  the last `RECENT` (6) species less likely (`G.recentSpawns`). `timeSpawns` + `G.timeOfDay()` ('night' 21:00-05:00, ''
  when off) + `G.isNocturnal(id)` (Ghost, Dark, and `NIGHT`, a list of national numbers): night ×6 for night-time
  Pokémon and ×0.35 for the rest, by day ×0.4 for night-time ones. Groups: `groupFreq` → `GROUP_ODDS` ('sometimes' =
  0.16, as before), `groupMax` (2-10): a group is groupMax-2 to groupMax strong. `G.spawnWild` is exposed for checks.
- **Click strength (18)**: `clickPower` multiplies `G.poke`'s damage (still `noKO`: rule 3); `befriendPower` shortens or
  lengthens the 1.2 s between trust points in `Events.pet` (src/events.js). The milestones (healing at 4, gift at 8)
  stay where they were.
- **Moves (5)**: `Mon.movesAvailable(m)` (its species' level-up moves up to its level, plus what it knows),
  `Mon.setMove(m, slot, id)` (swaps a known move; refuses a move it can not learn and leaving no damaging move),
  `m.mvKeep` (save field, repaired in `parseSave`): moves the owner chose. `Mon.learn` never forgets a kept move and
  returns false when all four are kept (no "learned" event then). Pokédex: a click on a move (`pickMove`) opens
  `pickerHtml` under the moves (computed in the page from `DATA`), a click there sends `{ type: 'setMove' }`.
  `monView` moves carry `id` and `keep` (✓ in the list).
- **Battle orders on the leader's page (3)**: `ordersHtml()` in `src/panel.js`, shown for the leader only; it writes the
  very settings of Options (`battleStyle`, `autoBattle`, `handsOff`) through `push`.
- **Field key (2)**: `#fieldKey` in the device's top bar toggles the setting `field`; `renderDeck` keeps it lit.
- **Balls (9)**: a double-click on a ball in the Bag sends `equipBall` with `on: true` (always "use these", never off).
- **Two right-clicks (10)**: `teamRight` in `src/game.js`: the Pokédex waits `RIGHT_TWICE` (0.33 s) for a second
  right-click on the same team member; two open the field window (`st.openField` → `st:open-field`, accepted from the
  overlay only, so not from the MyStream stage).
- **Full size (11)**: setting `fieldMax`, written on the field window's `maximize` / `unmaximize`, used when it opens.
- **Box Field (15)**: a pat calls `st.pointPanel('box:<uid>')` → `st:point-panel` → `openPanel(tab, quiet)`: shown in
  the Pokédex if it is open, without bringing it forward or taking the keyboard.
- **Mewtwo's dive (1)**: actions with `long: true` in `guardian.js` (protection update, quick scan, updates check, apps
  check; `guardian.isLong`, `.moveOf`). `st:g-act` in main.js sends `st:guardian-away` before and `st:guardian-back`
  with the answer after. `Mewtwo.away / back` in `src/mewtwo.js`: it calls its move, then `.guard.diving` (overlay.css:
  transition to past the bottom right corner; upright since 0.9.6, the owner found the 135° turn goofy); `place()` and `hit()` do nothing while `gone`; it always comes
  back (`BACK_ANYWAY`, 50 minutes). Works on the MyStream stage too (same page scripts).
- The Pokédex title shows the version (`#brandVer`, 0.9.4); it will be written in Living Unown in 0.9.8.
- `selfcheck.js`: the field-window line now checks 0.9.3's arrangement (overlay its own, field window ordinary); it still
  checked 0.7.1's and failed since 0.9.3.
- `node tools/v095check.js` (40 checks). `tools/v094check.js` accepts later versions.

## 0.9.6 (healing: requested updates 7 and 8 of "fixes and updates11-16")

Update 6 (attacking an online visitor's team) turned out to mean visitors bringing their own team onto the stage: it
moved to 0.9.7 with the chat. Mewtwo's dive is upright now (overlay.css `.guard.diving`).

- **Healers (8)**, `src/battle.js`: `ALLY_HEAL` (Heal Pulse and Floral Healing 50 % to one ally, never the user; Life Dew,
  Jungle Healing and Lunar Blessing 25 % to every ally near by), `mendable(u, k, reach)` (worst first), `allyHeal`.
  **Bug fixed on the way:** Heal Pulse and Floral Healing (target 10, "selected Pokémon") were aimed at the foe like any
  move and the per-target loop healed whoever was hit: the foe. `doStatus` now hands every `ALLY_HEAL` move to
  `allyHeal` first; `chooseMove` scores them by the worst ally (85 under 45 %, 22 under 70 %, else 0); `supported` knows
  them (Jungle Healing and Lunar Blessing are category 13). `Battle.mend(u)` is for outside a fight: an ally move on a
  teammate under 60 %, Pollen Puff on a teammate, or its own healing move (target 7, `hl`) under 50 %. `mendTick` in
  `src/game.js` asks it every 1.3 s from `teamAI`'s out-of-battle part, then rests `9 / G.moveRate()` seconds.
- **The fountain (7)**, `src/game.js` ("the fountain heals"): `fountainOf()` is the `G.blocks` entry named
  `'fountain'` (Fountain Square in the field window, the MyStream stage; none on the plain overlay). `wantsFountain(a)`:
  under 50 % out of a fight, under 25 % in one, never in a Trainer battle, not with `roam: 'stay'`, not while fetching or
  dragged. `startDrink` picks a spot on the rim on its side (water types: in the basin, `pass`), `drinkStep` walks there
  (gives up after 25 s), then heals `DRINK.team` (12 %/s, and cures status) or `DRINK.wild` (6 %/s) with water sparkles,
  until full ("feels refreshed!"). `teamAI` calls it before fighting; a drinker called into a fight at 50 % or more, or
  in a Trainer battle, stops. Loiterers under 50 % go now and then (`loiterAI`, half of their idle choices); the one
  `G.trainerTarget` points at or the mouse is on stops; `unsettle` stops it. `a.drink` is the state; `G.drinking(a)`.
- `node tools/v096check.js` (22 checks).

## 0.9.7 (online and the fountain: requested updates 4, 6 and 14 of "fixes and updates11-16")

- **Pointers (4)**: `pointers.js` (UMD: `require`d by `online.js` and `main.js`, a plain script in `stage.html`,
  `mystream.html`, `visit.html`). 205 pointers: the eight of 0.8 first, in their order, then by type (18 × 4 tiers of
  species caught), by region (9 × 25/50/75/100 %), species in all, catches, shinies, each badge, legendaries, alphas,
  pets, items, Trainers beaten, friendly battles won, catches made together, a shiny of each type. **A pointer travels as
  its number: only ever append.** Won by `G.pointerStats()` (src/game.js, in every snapshot as `ptr`; main.js keeps it in
  `gameStats`). `Pointers.paint(el, i)` sets `--a`, `--b`, `--edge` (pointers.css draws every pointer from those);
  `Pointers.cursorCss(i)` is the same arrow as an SVG cursor: main.js `sendMyPointer()` sends it (`st:my-pointer`) to the
  game page and the field window when the setting `myCursor` is on ("My pointer is the mouse", Options > Overlay), when
  the pointer changes (`ctx.pointerChanged` from online.js) and when either page is ready. The pointer lists in the
  online window and MyStream's pointer tab show the won ones first and scroll.
- **Visitors' pointers (4)**: as large as the owner's (`window.__ptrScale`, from `cfg.pointer.size`), follow more
  closely (glide `dt * 26`, the visitor sends a move every 20 ms, online.js lets 75 a second through), and off the
  picture they are an arrow on the rim (`.vEdge`, src/visitors.js `place`): the visitor's window sends the point where
  the mouse left the picture (clamped to the allowed range) instead of (-30, -30).
- **Chat (4)**: `LINES` has 16 more (Yes, No, OK!, Accept, Deny, Not now, Wait a moment, Ready!, Battle?, ...), appended.
  The host's own words: `hostText` (online.js; `cleanText`: control, bidi and zero-width characters out, one line, 120)
  from the online window's `#hostChat` (`ov.sayText` → `ov:say-text`, also allowed from the booth page for later); they
  show over the fountain on the host's stage (`Visitors.speak(0, …)`, up to 120 characters, wrapped) and in each
  visitor's window as text (`visit.js` `heard`, `textContent` only). The self-check now expects two text fields in the
  online window (the friend code and `#hostText`).
- **Visitors' teams and friendly battles (6)**: the visitor's online.js sends its team after `hi` (`sendTeam`: the game's
  `G.teamGift()` through `gift()`, as `{ t: 'team', list }`); the booth page passes messages up to 1600 characters now;
  the host's online.js takes one at most every 10 s, 30 a visit, six Pokémon, each through `gift()` again, and sends the
  stage `{ t: 'team', slot, list }`. src/visitors.js `teams()` puts one visitor's team at a time on the field with
  `Rivals.guest(slot, name, list, colour)` (src/rivals.js): a rival team of kind `'guest'`, built anew with
  `Showdown.build`, `a.guest = slot`, no pointer of its own (`R.el` hidden; `R.x/y` follow `Visitors.where(slot)`),
  no LINGER. A double-click on one of them starts a friendly battle with the rules of a Trainer battle; `won()` counts
  `save.stats.friendly`, no prize; a lost one is only a toast. The visitor is told (`Rivals` → `st.vOut({ t: 'duel' })`
  → online.js `fromStage` → `{ t: 'duel', s }` → the visitor's window shows a line). After a battle the team rests
  `TEAM_REST` (25 s) and comes back healthy; another waiting visitor gets a turn after `TEAM_TURN` (240 s) without a
  battle; `Rivals.guestGone(slot)` when the visitor leaves. A guest team keeps random Trainers away while it stands
  (one `R` at a time).
- **Protocol**: `onlinenet.js` `VERSION` 2 (programs before 0.9.7 cannot meet 0.9.7 ones: the window says to update),
  a pointer number may be up to 1023.
- **The fountain (14)**: src/fountain.js keeps its 0.6 design in design units and draws it `S` = 1.25 times finer
  (`px`/`oval` scale and round each edge, so no gaps): 220 × 188 squares, 25 % larger on the field, still K = 2 screen
  pixels a square. New: seams between the wall's stones, carved studs on the rim and round the bowl, a second ring and
  fluting on the column, moss, lily pads (one with a flower), coins on the bottom (they flash now and then), three fish
  under the water. `Fountain.TOP` is where the ball on top is (src/square.js and src/stage.js place its button from it).
  The Day Care moved 24 px up (src/stations.js) to stay clear of the jet.
- `API` is 9. `node tools/v097check.js` (31 checks, a friendly battle from start to end on the pretend page). The live
  online check (`{ "run": "online-check" }`) now also checks that the visitor's team arrives and the host's words go out;
  on the owner's PC: all 8 steps passed (2026-11-17).

## 0.9.8 (saved games and Living Unown: requested updates 19 and 17 of "fixes and updates11-16")

- **The two file kinds**, `stfiles.js` (main process only): a header (`STSAVE1\n` or `UNOWN01\n`, then a flags byte:
  locked or not), a 16-byte salt, a 12-byte IV, the GCM tag, and the content as JSON, deflated, sealed with
  AES-256-GCM. The key comes from `APP_KEY` (in the source), the kind, the salt and, for a locked note, the word
  (scrypt). Header and flags are authenticated, so any changed byte is refused (`why: 'broken'`). Honest limits: an
  unlocked file is readable by anyone who has this program (that is "only Screen Trainer can read it"); a locked note
  is not readable without its word by anyone. Never written anywhere but where the owner chooses.
- **Saved games (19)**: Options > Save data > "Save game…" (`st:save-export`: the game flushes, save.json is packed:
  the owner's 31 KB save is 8 KB) and "Load a saved game…" (`st:save-pick` reads and summarises it; the page shows team,
  Box, species, badges and asks; `st:save-load`: save.json goes to `backups\before-load-<time>\`, the file becomes
  save.json, the game page reloads). `loadingSave` blocks `st:save` from the game page until it has asked `st:init`
  again (or 20 s), or the old page's last save would undo the load. Offered after "Reset save" (`#savePickAgain`) and on
  the Help screen (`#helpLoad`, the first-run screen). A .stsave handed over by Windows starts the game and offers it
  (`offerSave` → `st:save-offer`).
- **Living Unown (17)**, `src/unown.js` (a plain script; `require`-able for the checks): `Unown.glyph(ch)` — A to Z, !
  and ? from the owner's own Unown (201 and its looks; `spriteFor` refuses a look the folder lacks, since `Sprites.still`
  would fall back to the plain "A"), trimmed to the letter when loaded; every other character drawn here: thick ink with
  a rim, an eye where the stroke is widest (a two-pass distance map, `eyeSpot`), a round body for a character too thin
  for an eye, emoji as their ink silhouette. `Unown.living(canvas, { cw, lh, size, pad, calm, stagger, halo })`: one
  actor per character; `setText` keeps the actors of the unchanged start and end (`diff`) so only new letters hop in
  (`HOP` 0.32 s, staggered for a paste or a file) and removed ones drop away; `layout` gives row, column, sentence and
  paragraph; the loiter offset is the letter's own sway plus its sentence's and its paragraph's slow drift ("loosely
  together"); the pupil follows the mouse while it moved in the last 3 s ("being read"), else looks about; blinks; a
  bored little hop every 6-22 s.
- **The Unown Notepad (17)**: `notepad.html` / `notepad.css` / `src/notepad.js`, opened by the Field Dex's "notes" key
  (`st:open-notepad`) or by Windows. A see-through `textarea` (monospace, letter-spacing, line-height, `wrap="off"`, so
  columns are exact) takes the typing, caret, selection, undo and clipboard; the canvas under it draws the Unown at the
  same places, scrolled with it. "Read plainly" (Ctrl+R) shows the letters. Known limit: an emoji is wider than a column
  in the text box, so the caret drifts a little behind one on its line. main.js: `notes` (per window: file, dirty,
  pending locked file), `np:hello` (sprites, and the file it was opened with), `np:open`, `np:save` (dialog when there
  is no file yet; the page never names a path), `np:unlock`, `np:dirty`; closing with unsaved changes asks Save / Don't
  save / Cancel. Notes are written only where the owner saves them.
- **Windows "Open with"**: `stfiles.fileArg(argv)`. At start: a .unown → `notepadOnly`: settings and sprites are read,
  only the notepad opens; when the last notepad closes the program quits. The rest of the start is `startGame()` (run
  once, `gameStarted`). In `second-instance`: a .unown opens a notepad; anything else starts the game first if a
  notepad-only start is running. Windows asks the owner which program opens a .unown the first time; nothing is
  registered by the program.
- **The Field Dex title in Living Unown**: `brandUnown()` in src/panel.js draws ".brand" ("Screen Trainer field dex
  v…") with a light `halo`; `.brand.unown:not(:hover)` makes the plain letters transparent, `:hover` hides the canvas.
  `.brand` is `-webkit-app-region: no-drag` (a drag region gets no hover).
- Request `{ "run": "notepad-check" }`: opens a notepad, types a few lines, saves pictures (`notepad.png`,
  `notepad-plain.png`) to `selfcheck\<time>-notepad\`, reports `Notepad.state()`, closes without saving. On the
  owner's PC: 79 Unown, 6 sentences, 2 paragraphs (2026-11-17).
- `API` is 10. `node tools/v098check.js` (28 checks).

## 0.9.8.1 (the Unown Notepad: a page, and its Living Background)

The owner's idea, with a note of his own for "love" (`Downloads\IdeaFor-love.unown`, opened with `stfiles.readNote`):
a blank page is grass; a recognised word transforms the ground, slowly, spreading from the word; more words settle into
a cohesive / fighting / merging background. And the page has a fixed size "like in Word", with defined borders.

- **The page**: `notepad.html` is now `#land` (ground canvas), `#unown` (letters), `#desk` (scrolls) > `#sheet` >
  `#text`. `COLS` 64 × `LINES` 28 in src/notepad.js; the sheet is `COLS * cw + padding` wide, the text box is as high
  as whole pages (`retext`). It wraps with `white-space: break-spaces; word-break: break-all` and `Unown.layout(chars,
  tab, cols)` wraps at the same column (a full line carries on, spaces included), so the Unown stand where the caret is.
  The canvases cover the window; everything is drawn at `view()` (the desk's scroll less the sheet's place).
- **The ground**: `src/unownland.js`. `UnownLand.seeds(chars, places)` finds the words of `WORDS` (15 grounds, about 300
  words; `DICT`), each with a `key` (`love#2`) so that `born` in notepad.js keeps the time it has had to spread while the
  text changes. `UnownLand.draw(g, t, { x, y, w, h, ox, oy, cell, seeds })` paints squares of 6 px into an ImageData
  the size of the visible page, 12 times a second: for each square the seed whose front (`SPEED` 34 px/s from the word)
  has reached it and is nearest wins (with a slow `WOBBLE`); the front itself comes "blade by blade" (dithered); where
  two grounds meet, `FOES` (fire/water, love/war, sun/night ...) flicker back and forth, the others dither into each
  other. A ground is `THEMES[k]`: four colours, specks (`deco`, `rate`, `twinkle`), a `sheen` that drifts with the
  breeze, `tall` (strands instead of specks), `hold` (stands its ground better). `CALM` pulls every square toward the
  ground's middle colour so the writing can be read; the Unown get a stronger white glow (`halo`, `haloSize`).
  Love is drawn from the owner's note: velvety emerald, a golden late-afternoon sheen, tall tangled strands, clover,
  chamomile and blossoms, `hold: 14`.
- View > "Living Background" switches it off (paper); "Read plainly" shows paper too. The notepad window opens
  1250 × 820 so the page fits.
- The version is "0.9.8.1" (four parts: Electron takes it as it is; the older checks accept it).
  `{ "run": "notepad-check", "wait": ms }` types a text with living words and waits before the picture.
  `node tools/v0981check.js` (15 checks).

## 0.9.9 (Rotom's big tidy-up, Mewtwo's guard and backups, server groundwork: requested updates 20, 21, 13)

The owner's decisions (2026-11-17): Rotom's own undo is the safety net (no Windows restore point); the AI watch may
block ("watch and block"); a backup holds only what the owner selected, by a walkthrough or a simple profile plus any
folder; pictures are sorted by date and name (looking inside waits for the local AI, update 22).

- **Rotom's big tidy-up (20)**: `tidy.js` (main process; its seven rules are at its top; the old one-folder Optimize in
  `optimize.js` stays beside it). `init({ userDir, protectedDirs, homes, trash })`; `propose(answers)` → a plan with an
  id (`dests`, moves, `unsure` with reasons, `candidates`, `kept`); `apply(id, { dissolve }, onProgress)`; `undo()`.
  Only the chosen roots less the ignored folders; names, sizes and dates only; moves, never deletes or overwrites,
  never across drives. A folder is a **unit**: 'never' (a program, a project, a game: `.exe` + data, `package.json`,
  `.git` ...) is not taken apart at all, 'ask' (an album, a backup-like name, large, has subfolders) only when the
  owner ticked it; an emptied ticked folder goes to the Recycle Bin (`deps.trash` = `shell.trashItem`). `offLimits`
  keeps Windows, the program folders, AppData, Screen Trainer's own folders and anything that *holds* one out (a root
  itself may hold one: Desktop holds the program). State and the undo list: `tidy.json`. main.js: `st:t-*`; the page
  may only name folders that were chosen in Windows' dialog (`tidyChosen`) or are presets. `src/tidy-ui.js` is the
  walkthrough in `optimize.html` (`#big`); it fires `rotom-busy` / `rotom-carry`, which `src/optimize-ui.js` turns into
  parcels and Jolteon's glow. The game gets `st:cmd { type: 'tidy', on }`: `G.tidying` sends the team to the world's
  edge (900 game seconds at most, then they come back whatever happened).
- **Mewtwo's backups (21)**: `backup.js` (six rules at its top). Writes only under `<target>\Screen Trainer backup\
  <computer>\`; copies what is new or changed (size, time within 2.5 s) as `.stpart` then renames; never deletes on the
  drive; never follows links. Screen Trainer's own data = the top-level `*.json` of the user folder (not `backup.json`,
  not the engine's caches) and `my game.stsave`. `due()` is the weekly reminder (asks at most once a day; `auto` off by
  default). main.js: `st:g-bk-*`, `runBackup()` (Mewtwo dives as for a long action), `patrolMore()` (90 s after start,
  then every 30 min: AI scan and `due`).
- **Mewtwo's AI watch (21)**: `sentinel.js` (four rules at its top). `ps\aiwatch.ps1` only reads (processes, startup
  commands, listeners on AI ports, our own firewall rules); `pick()` keeps only programs on `KNOWN` (no other
  program's name is stored, shown or logged); new ones are announced once (`sentinel.json`). `block(id, on)` runs
  `ps\aiblock.ps1`, **the one elevated script** (rule 8 above): it re-runs itself with `-Verb RunAs`, checks the path
  with the same pattern as `SAFE_PATH`, and adds or removes two rules named `Screen Trainer Mewtwo block - <exe>`.
  `tools/guardiancheck.js` checks it on its own (`ELEVATED`); `aiwatch.ps1` is one of `OTHERS`. Known limit: a
  Microsoft Store program's path changes with every update, so its block lapses then.
- **Mewtwo's window**: tabs "guard" and "backup" are drawn by `src/guardian-more.js` (loaded after
  `src/guardian-ui.js`, which still owns `show(name)`).
- **Server groundwork (13)**: `online.json` `boards` (already there) and new `ice` (`cleanIce` in `online.js`:
  stun/turn/turns only, four at most); `src/online-host.js` and `src/visit.js` use them when given. `SERVER.md`.
- The self-check opens the two new tabs (the AI watch really looks: read only) and Rotom's window (`rotom.png`).
- `API` is 11. `node tools/v099check.js` (70 checks; the tidy-up and the backup really move and copy files, in a
  pretend home in the temp folder). **Not done on the owner's files**: no real tidy-up, no real backup, no firewall
  rule; the owner tries those.

## 1.0 (the owner's list for 1.0: the Field Dex top, sound sliders, saved games, the Escape Rope, mods, forks, GitHub zips)

The owner's decision (2026-11-17): one day of refining, then 1.0. The local AI (requested update 22) waits until after.

- **Field Dex top**: `#readout` stays as an empty spacer (`.readout:empty` takes no room); "caught / seen" is on the
  Trainer screen only.
- **Sound**: settings `masterVolume` (the master gain in `src/sound.js`, before mute) and `criesVolume` (cries are
  scaled by `criesVolume / 0.8`, so 0.8 is as before). MyStream: each source has `vol` (null = never touched, else
  0-100); `ms:game-volume` -> `appVolume()` -> `ps\appvolume.ps1` (`-Mode get|set|probe`: the program that owns the
  window, by name, every session of it on every active render device, ISimpleAudioVolume through `Add-Type` C#; never
  the endpoint volume). `volumesAfterAttach()` sets a game's volume again when its window turns up. Booth: `pcVol`
  (0-150 %) and `micVol` (0-200 %) as gains in the booth's mix (`pcGain`, `micLevel()`). `tools/guardiancheck.js`
  lists appvolume.ps1 among `OTHERS` (checked for ASCII and forbidden commands).
- **Saved games in the tray**: "Saved games" > Save game (`exportSave()`, behind `st:save-export` as before), Load
  (`loadSaveFromTray()` -> `offerSave`, the same path as a file opened from Windows).
- **The Escape Rope** (`escaperope.js`, four rules at its top; `zipper.js` writes): `home(exeDir)` is the folder that
  holds the program folder when it looks like ours, else the program folder (never all of Downloads). `plan` / `run`;
  the save goes in as `Escape Rope - my game\my game.stsave` plus settings.json. main.js `escapeRope()`: save dialog,
  a confirmation that names the folder, size and free space (checkbox: leave out backup-v*, share, selfcheck), then
  `quitting = true`, every window destroyed, the tray shows progress and can stop, the zip is shown, `app.quit()`.
  At start, with no save.json, a rope save next to the program is offered (`offerSave`) and its settings are taken if
  there are none. `zipper.write` streams 1 MB pieces, writes every header at an explicit position, fills CRC and sizes
  in afterwards, ZIP64 when needed (tried with 70 001 entries and a 4.4 GB file), `.part` until whole.
- **Mods** (`mods.js`, five rules at its top): `mods\<folder>\mod.json`, format `screen-trainer-mod/1`: `settings`
  (keys of DEFAULTS less `BLOCKED`; a value must come through `sanitize` unchanged), `spawns` (species 1-1025 or
  `type:<name>`, 0-20, multiplied in `spawnWeight` via `G.modSpawn`), `theme.colors` (only the panel.css colour
  variables in `THEME_VARS`, values matched against a colour pattern; set as inline `--var` on the Field Dex root).
  State in `<userData>\mods.json` (`on` in switch-on order, `before`: the setting values before any mod). Off by
  default; `--no-mods` or "All mods off" switches all off; a mod that breaks while on is switched off at the next
  read. IPC `st:mods-*`, page event `st:mods` (`G.modSpawn` in src/overlay.js, colours in src/panel.js).
  `modsLib.readme()` is written into the folder the first time it is opened. The release zip has an example mod.
- **Forks** (`forks.js`, four rules at its top): `forks\<name>\app` (a copy of resources\app with `fork.json`) and
  `forks\<name>\data`. At the very top of main.js (before any other module): a fork sets its name, `userData` to its
  data folder and `ST_SELFCHECK_DIR` to its own; the main program, given `--fork=<dir>` that `startArg` accepts
  (exactly one level under forks\), `require`s that fork's main.js and returns (a top-level return: CommonJS). A fork
  never registers startup (`applyAutoStart`) or the hotkey (`applyHotkey`), and cannot make forks. Started with
  `spawn(process.execPath, ['--fork=...'], { detached })`. Thrown away with `shell.trashItem`.
- **Release zips** (`tools/build-release.sh`, run on Linux or a Mac with zip and unzip): Windows x64 (the owner's
  ScreenTrainer.exe plus Electron 45.3.0's files), Linux x64 and Mac arm64/x64 (Electron 45.3.0, untested, unsigned),
  and the source. Each has `mods\README.txt` and the example mod, and nothing of the owner's.
- Self-check stage "1.0": the empty readout, the new Options rows, the mods list, the Escape Rope's plan (read only),
  forks, and `appvolume.ps1 -Mode probe` (counts mixer sessions, read only). `API` is 12.
- `node tools/v100check.js` (57 checks). Failures that were already there in 0.9.9 and are unchanged: v096check
  "healer chooses Heal Pulse", onlinecheck "pointers are won", androidcheck "Mewtwo's window stays on the PC", v07check
  "right-click opens the Pokédex on that Pokémon"; v099check stops on Linux (it expects Windows paths).

- How-to videos (`howto.js`, Options > How-to videos): the clips are NOT part of the program, because they show real
  Pokémon pictures. They sit beside it in `howto\clips\<topic>\NN-topic-{gif.gif,10s.mp4,30s.mp4}` (the folder they are
  made in, `howto-media`, works too). The list stays locked until the sprites folder is found (`spriteInfo.ok`), and
  `st:howto-play` opens only an .mp4 or .gif that `howto.list` found, in the computer's own player. The empty copy and
  the app source never carries them (`build-release.sh` stops on a `howto/` folder inside it). The owner chose (1.0)
  to ship them in the release zips anyway: `build-release.sh`'s 5th argument (the howto-media folder) puts them in
  `ScreenTrainer/howto/clips` of every zip and in `docs/howto/clips` of the source zip, where README.md shows them.
- The self-check's 1.0 stage also takes three pictures for the how-to videos, changing and loading nothing:
  `pokedex-save.png` (Save data shown with a temporary style, the player's folds untouched), `pokedex-save-preview.png`
  (a preview of the current game packed in memory, through `window.__stOfferShown`; its Load button finds nothing
  picked) and `escape-rope-question.png` + `.txt` (the Escape Rope's question, drawn in a hidden window from the same
  `ropeQuestion()` words the real Windows box uses).
