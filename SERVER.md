# Screen Trainer: a server of your own (groundwork, 0.9.9)

Online visiting needs no server of the owner's: players find each other through notes on free public message boards
and then connect directly (AGENTS.md, "0.8"). That stays the default. Since 0.9.9 both outside services can be
replaced by the owner's own, without changing the program. Nothing here is switched on by itself.

Both settings live in `%APPDATA%\Screen Trainer\online.json` (close the program, edit, start it again). `sanitize` in
`online.js` is their only gate: anything that does not fit is dropped and the built-in services are used.

## 1. Where players find each other: `boards`

    "boards": ["wss://play.example.org:8084/mqtt"]

- Up to six addresses, each a secure web socket (`wss://`) of an MQTT 3.1.1 broker. Empty or absent: the three public
  boards in `onlinenet.js` (`BOARDS`).
- Any broker will do (Mosquitto, EMQX, NanoMQ) with a web-socket listener behind TLS. The program uses QoS 0, no
  retained messages, no login, and only topics under `screentrainer1/`. A broker for this alone can be limited to
  that prefix and to small messages (4 KB is plenty).
- **Everyone who wants to meet must use the same boards.** A player on the owner's board is invisible to players on
  the public ones, which is the point of a private server: hand the address to friends along with the friend code.
- What crosses a board: who is open (a room name derived from the friend code, never the code), knocks, and the two
  sealed connection notes. No Pokémon, no chat, no picture: those go directly between the two computers.

## 2. How the two computers reach each other: `ice`

    "ice": [
      { "urls": ["stun:play.example.org:3478"] },
      { "urls": ["turn:play.example.org:3478?transport=udp", "turns:play.example.org:5349"], "username": "trainer", "credential": "..." }
    ]

- Up to four entries; `stun:`, `turn:` and `turns:` addresses only. Empty or absent: Google's and Cloudflare's public
  STUN, and no TURN (two players behind strict routers then cannot connect).
- A TURN server (coturn is the usual one) relays the visit when a direct connection is impossible. It carries the
  picture of the stage (up to 1.8 Mbit a visitor), so it costs traffic; STUN costs next to nothing.
- The host's entries are used by the host's end, the visitor's by the visitor's end: each side needs the setting.
  The credential is stored as written in `online.json`; use one made for this, not a password used elsewhere.

## 3. What a real dedicated server would add (not built)

A list of who is online, accounts, bans that survive a new identity, visits while the host's PC is off. Where it
would plug in:

- `onlinenet.js` is the only file that talks to a board. A server with its own protocol replaces `Boards` there;
  the host's and visitor's hello (`host`, `visit`) keep their shape (knock, sealed offer, sealed answer).
- `online.js` checks everything a stranger's computer sends (`input`, `gift`, `line`, `cleanText`). A server must
  never be trusted more than a stranger: keep those checks on the receiving computer.
- Rule 10 of AGENTS.md stands: nothing goes online unless the owner switched it on; a visitor cannot type.
- `onlinenet.js` `VERSION` separates programs that cannot talk to each other; raise it when the notes change.
