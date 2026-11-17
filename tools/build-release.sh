#!/usr/bin/env bash
# Screen Trainer — makes the release zips (1.0). Run on Linux or a Mac that has zip and unzip:
#
#   tools/build-release.sh <electron zips folder> <ScreenTrainer.exe> <extra folder> <out folder> [how-to folder]
#
#   <electron zips folder>  electron-v45.3.0-{win32-x64,linux-x64,darwin-x64,darwin-arm64}.zip from
#                           https://github.com/electron/electron/releases/tag/v45.3.0 (check them against SHASUMS256.txt)
#   <ScreenTrainer.exe>     the Windows program file with Screen Trainer's icon (electron.exe renamed works too)
#   <extra folder>          README.md, BUILDING.md, .gitignore and mods/ (README.txt and the example mod)
#   <out folder>            where the five zips go
#   [how-to folder]         optional: the folder holding clips/<topic>/NN-topic-*.{gif,mp4} (howto-media). The owner
#                           chose (1.0) to ship these how-to videos, which show real Pokemon pictures, in every zip
#                           (ScreenTrainer/howto/clips, locked in the program until a sprites folder is found) and in
#                           the source zip under docs/howto/clips for the GitHub page. Only .gif and .mp4 are copied.
#
# Every zip is empty of anything personal: only this source folder (resources/app) is packed, after the same NEVER
# list as the empty copy (shareexport.js) has been applied, and the script stops if a sprite, sound bank, ROM, save,
# key or fork turns up in it.
set -euo pipefail
EZ="$1"; EXE="$2"; EXTRA="$3"; OUT="$4"; HOWTO="${5:-}"
APP="$(cd "$(dirname "$0")/.." && pwd)"
V="$(node -p "require('$APP/package.json').version")"
EV=45.3.0
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
mkdir -p "$OUT"

# the source, cleaned
SRC="$WORK/src"; mkdir -p "$SRC"
(cd "$APP" && find . -type f ! -name 'fork.json' ! -path './node_modules/*' ! -path './.git/*' -print0 | while IFS= read -r -d '' f; do mkdir -p "$SRC/$(dirname "$f")"; cp "$f" "$SRC/$f"; done)
BAD="$(cd "$SRC" && find . -type f | grep -Ei '\.(stbank|gba|nds|gbc|gb|sav|stsave|unown|apk|aab|keystore|jks|pem|key)$|(^|/)(save|settings|guardian|mystream|online|optimize|mods|tidy|backup|sentinel)\.json$|(^|/)(sprites|sprites-master|sounds|backups|selfcheck|forks|howto)/' || true)"
if [ -n "$BAD" ]; then echo "Something personal is in the source folder, stopping:"; echo "$BAD"; exit 1; fi

# the how-to clips (optional): only .gif and .mp4 out of clips/<topic>/
CLIPS="$WORK/clips"; mkdir -p "$CLIPS"
if [ -n "$HOWTO" ]; then (cd "$HOWTO/clips" && find . -mindepth 2 -maxdepth 2 -type f \( -iname '*.gif' -o -iname '*.mp4' \) -print0 | while IFS= read -r -d '' f; do mkdir -p "$CLIPS/$(dirname "$f")"; cp "$f" "$CLIPS/$f"; done); fi
clips() { if [ -n "$(ls -A "$CLIPS")" ]; then mkdir -p "$1"; cp -R "$CLIPS/." "$1/"; fi; }

# source zip (the repository: the app folder is its root)
R="$WORK/screen-trainer-$V"; mkdir -p "$R"; cp -R "$SRC/." "$R/"; cp "$EXTRA/README.md" "$EXTRA/BUILDING.md" "$EXTRA/.gitignore" "$R/"; mkdir -p "$R/examples"; cp -R "$EXTRA/mods" "$R/examples/mods"; clips "$R/docs/howto/clips"
(cd "$WORK" && rm -f "$OUT/ScreenTrainer-$V-source.zip" && zip -qr -X "$OUT/ScreenTrainer-$V-source.zip" "screen-trainer-$V")

readme() {
  if [ -n "$(ls -A "$CLIPS")" ]; then
    node -e "process.stdout.write(require('$APP/shareexport.js').readme('$V'))" | sed \
      -e 's/This copy is empty on purpose\. It holds the program and nothing else: no pictures of Pok[^,]*mon, no game sounds,/This copy holds the program and its how-to videos, and no sprite files, no game sounds,/' \
      -e 's/It contains none of their pictures or sounds\./The program contains none of their pictures or sounds; the how-to videos show it running with them./'
    printf '\r\nHOW-TO VIDEOS\r\n  The "howto" folder next to the program holds short videos of every part of Screen Trainer. They unlock in\r\n  Pokedex > options > How-to videos once your sprites folder is found.\r\n'
  else node -e "process.stdout.write(require('$APP/shareexport.js').readme('$V'))"; fi
}

# Windows x64
W="$WORK/win/ScreenTrainer"; P="$W/Screen Trainer"; mkdir -p "$P"
unzip -q "$EZ/electron-v$EV-win32-x64.zip" -d "$P"
rm -f "$P/electron.exe" "$P/resources/default_app.asar"; cp "$EXE" "$P/ScreenTrainer.exe"
mkdir -p "$P/resources/app"; cp -R "$SRC/." "$P/resources/app/"; cp -R "$EXTRA/mods" "$W/mods"; clips "$W/howto/clips"
readme > "$W/READ ME FIRST.txt"
(cd "$WORK/win" && rm -f "$OUT/ScreenTrainer-$V-windows-x64.zip" && zip -qr -X "$OUT/ScreenTrainer-$V-windows-x64.zip" ScreenTrainer)

# Linux x64 (untested)
L="$WORK/linux/ScreenTrainer"; P="$L/Screen Trainer"; mkdir -p "$P"
unzip -q "$EZ/electron-v$EV-linux-x64.zip" -d "$P"
mv "$P/electron" "$P/screentrainer"; rm -f "$P/resources/default_app.asar"
mkdir -p "$P/resources/app"; cp -R "$SRC/." "$P/resources/app/"; cp -R "$EXTRA/mods" "$L/mods"; clips "$L/howto/clips"
printf '#!/bin/sh\n# Screen Trainer on Linux (untested). --no-sandbox because an unzipped Electron cannot use its setuid sandbox helper.\ncd "$(dirname "$0")" && exec ./screentrainer --no-sandbox "$@"\n' > "$P/start.sh"; chmod +x "$P/start.sh" "$P/screentrainer"
{ readme | sed -e 's/ScreenTrainer\.exe/Screen Trainer\/start.sh/g' -e 's/%APPDATA%\\Screen Trainer/~\/.config\/Screen Trainer/g'
  printf '\r\nLINUX (NOT TESTED)\r\n  This build has not been tried yet. The overlay needs a desktop with a compositor (most have one). Mewtwo,\r\n  Rotom'"'"'s big tidy-up and putting other programs'"'"' windows on the MyStream stage only work on Windows.\r\n  Start it with Screen Trainer/start.sh (chmod +x it if your unzip lost that).\r\n'; } > "$L/READ ME FIRST.txt"
(cd "$WORK/linux" && rm -f "$OUT/ScreenTrainer-$V-linux-x64.zip" && zip -qry -X "$OUT/ScreenTrainer-$V-linux-x64.zip" ScreenTrainer)

# Mac arm64 and x64 (untested, unsigned)
for A in arm64 x64; do
  M="$WORK/mac-$A/ScreenTrainer"; mkdir -p "$M"
  unzip -q "$EZ/electron-v$EV-darwin-$A.zip" -d "$WORK/mac-$A/e"
  mv "$WORK/mac-$A/e/Electron.app" "$M/Screen Trainer.app"
  RES="$M/Screen Trainer.app/Contents/Resources"; rm -f "$RES/default_app.asar"
  mkdir -p "$RES/app"; cp -R "$SRC/." "$RES/app/"; cp -R "$EXTRA/mods" "$M/mods"; clips "$M/howto/clips"
  { readme | sed -e 's/start ScreenTrainer\.exe/open "Screen Trainer.app"/g' -e 's/ScreenTrainer\.exe/Screen Trainer.app/g' -e 's/%APPDATA%\\Screen Trainer/~\/Library\/Application Support\/Screen Trainer/g'
    printf '\r\nMAC (NOT TESTED, NOT SIGNED)\r\n  This build has not been tried yet and is not signed by Apple. The first time: right-click "Screen Trainer.app" >\r\n  Open > Open. If macOS says it is damaged, open Terminal in this folder and run:\r\n      xattr -cr "Screen Trainer.app"\r\n  and if it still refuses:  codesign --force --deep --sign - "Screen Trainer.app"\r\n  Mewtwo, Rotom'"'"'s big tidy-up and putting other programs'"'"' windows on the MyStream stage only work on Windows.\r\n'; } > "$M/READ ME FIRST.txt"
  (cd "$WORK/mac-$A" && rm -f "$OUT/ScreenTrainer-$V-mac-$A.zip" && zip -qry -X "$OUT/ScreenTrainer-$V-mac-$A.zip" ScreenTrainer)
done

(cd "$OUT" && sha256sum ScreenTrainer-$V-*.zip > "ScreenTrainer-$V-SHA256.txt" 2>/dev/null || shasum -a 256 ScreenTrainer-$V-*.zip > "ScreenTrainer-$V-SHA256.txt")
ls -la "$OUT"
