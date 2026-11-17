SCREEN TRAINER MODS
===================

A mod is a folder in here with one file in it, mod.json. Screen Trainer reads the folders when it starts and when
you press "look again" (Pokédex > options > Mods and forks). Every mod is off until you switch it on there, and
switching it off puts back everything it changed. A mod with a mistake is not used; the Options screen says what
the mistake is. A mod is data only: nothing in it is ever run.

mod.json looks like this (only "format", "id" and "name" are needed, plus at least one change):

{
  "format": "screen-trainer-mod/1",
  "id": "shiny-hunt",
  "name": "Shiny hunt",
  "version": "1.0",
  "author": "Your name",
  "description": "Shinies 1 in 20, wild Pokemon twice as often, more Eevee and Dragon types.",
  "settings": { "shinyOdds": 20, "spawnEvery": 12 },
  "spawns": { "133": 5, "type:dragon": 2 },
  "theme": { "name": "Ember", "colors": { "shell": "#a8322d", "shell-hi": "#d0594d", "shell-lo": "#6e1d1a", "lcd": "#f3e3c8" } }
}

WHAT EACH PART DOES
  format       always "screen-trainer-mod/1"
  id           letters a-z, digits and dashes, 2 to 40 (the same as the folder name is best)
  name         up to 60 characters
  version      up to 20 characters
  author       up to 60 characters
  description  up to 400 characters
  settings     starting values for options, e.g. { "shinyOdds": 50, "spawnEvery": 10 } (only options from the Options screen, in their ranges)
  spawns       how often wild Pokémon come, as a multiplier from 0 (never) to 20: { "25": 5, "type:dragon": 2 }
  theme        Field Dex colours: { "name": "Ember", "colors": { "shell": "#a8322d", "lcd": "#f3e3c8" } }

settings  The names are the ones in settings.json (%APPDATA%\Screen Trainer). Values must be in the same range
          the Options screen allows. These cannot be changed by a mod: autoStart, hotkey, spritesPath, display, visible, firstRun, optClosed, guardian, guardianAlerts, guardianX, guardianY, boxOpen, field, fieldX, fieldY, fieldW, fieldH, fieldMax, fieldZoomAt, musicTrack.
spawns    1 is as usual, 2 twice as likely, 0.5 half, 0 never. A number is a Pokedex number; "type:" and one of
          normal, fighting, flying, poison, ground, rock, bug, ghost, steel, fire, water, grass, electric, psychic, ice, dragon, dark, fairy changes every Pokemon of that type. Two mods multiply.
theme     Field Dex colours: shell, shell-hi, shell-lo, tray, bezel, lcd, lcd-dim, ink, ink2, line, key, key-lo, amber, berry, ok, on-ink, xp, btn-hi, go-hi, tint, glaze. "tint" and "glaze" are three numbers "r, g, b";
          the others are colours like "#a8322d" or "rgb(168, 50, 45)". The last mod switched on wins.

Something went wrong? Pokedex > options > Mods and forks > "All mods off", or start Screen Trainer with --no-mods.
To try bigger changes to the program itself without danger, make a fork there instead.
