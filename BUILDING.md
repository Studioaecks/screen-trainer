# Building the Screen Trainer release zips

There is nothing to compile. Screen Trainer is plain JavaScript run by Electron 45.3.0; a release is Electron's own
files for each system with this folder put in as `resources/app` (Windows, Linux) or
`Screen Trainer.app/Contents/Resources/app` (Mac).

On Linux or a Mac with `zip`, `unzip` and Node:

1. Download from https://github.com/electron/electron/releases/tag/v45.3.0 the four files
   `electron-v45.3.0-win32-x64.zip`, `-linux-x64.zip`, `-darwin-x64.zip`, `-darwin-arm64.zip`, and check them
   against that release's `SHASUMS256.txt` (`sha256sum -c --ignore-missing SHASUMS256.txt`).
2. Have `ScreenTrainer.exe` (the Windows program file with the icon; `electron.exe` renamed works too).
3. Run, from the repository folder:

   ```
   tools/build-release.sh <folder with the electron zips> <ScreenTrainer.exe> <folder with README.md, BUILDING.md, .gitignore and mods/> <out folder>
   ```

   The repository itself holds those last files at its top and the example mods in `examples/mods`; copy them into
   one folder (`mods` next to the three files) for the script.

It writes `ScreenTrainer-<version>-windows-x64.zip`, `-linux-x64.zip`, `-mac-arm64.zip`, `-mac-x64.zip`,
`-source.zip` and a SHA256 list. It stops if anything personal (sprites, sound banks, ROMs, saves, keys, forks)
is found in the source folder.

Before a release, run the checks: `node tools/playtest.js`, `node tools/guardiancheck.js`, `node tools/v07check.js`
and `node tools/v100check.js`. The Windows build is the tested one; the Mac and Linux builds are marked untested in
their READ ME FIRST until somebody has tried them.
