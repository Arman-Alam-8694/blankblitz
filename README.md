# BlankBlitz

A fast, zero-login multiplayer word-guessing party game for the browser: 1v1 up to 4v4, or up to 4 teams.
Players enter a nickname, then **create a room** (shareable link plus 4-character code), **join with a code**, or hit **Quick Match**.

## Quick start

Requires **Node.js 20.11+** (22 LTS recommended).

```bash
npm install
npm run dev
```

Open http://localhost:5173. To play with friends on the same Wi-Fi, use the "Network" URL Vite prints (e.g. `http://192.168.x.x:5173`).
Testing alone? Open a second browser tab. Each tab gets its own seat.

| Command | What it does |
| --- | --- |
| `npm run dev` | API (port 3001, auto-reload) + Vite dev server (port 5173, proxies WebSockets) |
| `npm run build` | Builds the frontend into `frontend/dist` |
| `npm start` | Production server: API + built frontend on one port (`PORT`, default 3001) |
| `npm test` | Unit tests + end-to-end tests that play real matches over Socket.IO |
| `npm run typecheck` | Strict TypeScript check of all three packages |

## Project layout

```
shared/     Types, constants, zod schemas and typed socket events (used by both sides)
backend/    Node + Express + Socket.IO game server
  src/config.ts           Validated env config (fails fast on bad values)
  src/server.ts           HTTP + WebSocket bootstrap (also used by tests)
  src/http/app.ts         Security headers (helmet/CSP), /healthz, static SPA hosting
  src/socket/             Transport: validation, rate limits, per-IP connection caps
  src/rooms/Room.ts       Authoritative state machine for one room/match
  src/rooms/RoomManager.ts  Room registry, quick-match, single tick loop, GC
  src/game/board.ts       Pure board logic (guess, all-in, scoring, secret-safe views)
  src/bots/brain.ts       Bot AI (Low = casual, Medium = dictionary-driven, fallible)
  src/dictionary/         English word list (~114k words of 4–8 letters) + curated clue words
  test/                   Vitest unit + e2e tests
frontend/   React + Vite client (no UI framework; plain CSS)
  src/lib/                socket, store, session, router, focus arbitration, scorecard
  src/pages/ components/  Landing, Lobby, Selection, Game board, Chat, Team panel, Results
```

## Gameplay implemented

- **Modes**: `Blitz` (all teams guess at once) and `Spotlight` (teams take turns while the rest spectate live). Both work for any format from 1v1 to 4v4 and for 2–4 teams.
- **Rotation**: each team sets words for the next team, so nobody guesses their own words.
- **Round flow**: 15s word selection, then a 3s countdown, then guessing, then a reveal with points, then the next round. The match ends with a summary.
- **Words per round**: 1, 3, 4, or *one per player* (group rounds: each player picks a word). Rounds default to 5 for single-word play and 3 for multi-word play.
- **Dictionary guardrail**: custom words are checked against an English word list. Optional category clue or a **custom hint** (it can't contain the word). Any slot left empty when the timer runs out gets a random word from the room's **difficulty**: Easy (everyday), Medium (less common), Hard (rare and tricky), or Mixed. Bots pick from the same tier.
- **Pick time**: 10–60s (host setting). The round starts as soon as everyone has locked in.
- **Guessing**: guess a letter on the selected word. A correct letter reveals every place it appears. A wrong letter costs 1 attempt (attempts are shared across the board).
- **All-In solve**: type the whole word. Right means the word is solved and you get a bonus. Wrong costs 2 attempts.
- **Scoring**: per word, 100 + 2 × seconds left (+50 for an all-in). Clearing the whole board adds 10 × attempts left.
- **Live opponent progress**: letters (`3 / 5 letters`) or words solved, plus attempts and timer. Opponents' letters are never sent to your browser.
- **Team input control**: Open, Captain (captain can hand over), or Relay shot-clock (rotates each guess; running out of time costs 1 attempt).
- **Ghost previews**: players without input rights who type or hover letters show them live to teammates.
- **Team votes** (more than 50% of the other connected human teammates): revoke/restore input, team mute, vote kick (replaced by a Medium bot mid-match).
- **Bots**: `[BOT]` badge. Low guesses every 2.5–4.8s, Medium every 1.1–2.2s. Bots hold back when they share a team with humans.
- **Keyboard UX**: hover the board, then type A–Z. ←/→ switch word, Enter starts an all-in. Hovering the chat moves typing to the chat. If the chat box has unsent text, hovering the board won't take focus back (you have to click). On phones there's an on-screen keyboard.
- **Chat**: private team chat during rounds, lobby chat between rounds.
- **Reconnects**: refreshing or dropping the connection keeps your seat for 60s, using a per-tab session token.
- **Match summary**: 1-click emoji scorecard plus room link for WhatsApp/Discord.
- **Voice**: built-in team and lobby voice with P2P, TURN, and server-relay fallback. See below.
- **Rooms**: 10-character codes. **Private** rooms also have a 6-character password, which the invite link carries in its `#k=` part (never sent to the server's logs), so friends join with one click. Typing the code requires the password too. **Public** rooms are listed in *Open rooms*. **Random join** puts you in the public room closest to filling up, in your chat language, or makes a new one.
- **Chat language**: a room setting used to filter public rooms. Game words are always English.
- **Profiles**: 16 built-in SVG avatars (no downloads), or optional **Sign in with Google** to use your Google photo. The email is never requested or stored.
- **Light/dark mode** and **sound effects** (synthesised with Web Audio, no audio files), both toggled in the top-right corner.

## Security, reliability and scalability notes

- **Server-authoritative**: clients only send intents. Every payload is checked with zod schemas from `shared/`. Secret words stay on the server until revealed, and each player gets their own filtered snapshot (covered by tests).
- **Abuse limits**: per-socket token-bucket rate limits (events, chat, ghosts), per-IP join limit (makes guessing room codes slow), per-IP connection cap, 8 KB max message size, capped room count.
- **Input hygiene**: nicknames and chat are NFKC-normalised, with control, zero-width and bidi characters removed. React escapes all output (no `innerHTML`).
- **Mid-round joiners** (e.g. a second tab) can't see words their new team already chose, or that team's chat from the current round.
- **Google sign-in**: ID tokens are verified server-side (signature, issuer, audience, expiry). Only Google-hosted HTTPS photos are accepted. The app issues its own HMAC-signed token, so Google is only contacted at sign-in.
- **Sessions**: random 192-bit seat tokens, never broadcast. Public player IDs are separate. Kicked tokens are banned from that room.
- **HTTP**: helmet with a strict CSP, `frame-ancestors 'none'`, no `x-powered-by`.
- **Reliability**: one tick loop for all rooms. Every handler and room tick is wrapped in try/catch, so a single bad event or room can't crash the process. Empty rooms are garbage-collected. Graceful shutdown on SIGTERM. Failed startup exits non-zero.
- **Scaling**: state is in-memory, which is plenty for one small instance (thousands of concurrent players). To scale out, run several instances with sticky sessions and route each room code to one instance (e.g. `@socket.io/redis-adapter` plus a code→node map). `RoomManager` is the only place that needs to change.

## Free hosting

One process serves everything (frontend, API, WebSockets, voice relay), so deploy it to **one host**. Any free Node host with WebSocket support works (Render, Railway, Fly.io, Koyeb). `render.yaml` is a ready Render Blueprint.

- Build command: `npm ci --include=dev && npm run build` (Vite is a devDependency)
- Start command: `npm start`
- Env: `TRUST_PROXY=1` (most PaaS sit behind a proxy). The platform sets `PORT`.

A `Dockerfile` is included for container hosts. It has **not** been test-built yet (Docker wasn't running when it was written).

## Voice chat

Built in, with no third-party service required. The host turns **In-game voice → On**, then each player clicks **🎙️ Join voice**.

**Channels (PRD):** during word selection and play you hear only your team. In the lobby and between rounds everyone hears everyone. Switching channels just swaps tracks on links that are already open, so it's instant and doesn't renegotiate.

**Transport ladder, chosen automatically for each pair of players:**

| Step | Path | When | Cost |
| --- | --- | --- | --- |
| 1 | WebRTC P2P (Opus, about 32 kbps) via public STUN | Most home Wi-Fi / 4G | Free |
| 2 | WebRTC via **TURN** (optional, `TURN_*` env) | Strict NAT, corporate Wi-Fi, some mobile carriers | Self-hosted coturn or a free TURN tier |
| 3 | **Server relay** over the game's WebSocket (16 kHz µ-law, sent only while speaking) | Anything P2P/TURN can't reach | Your server's bandwidth only |

**Fault tolerance:**
- **Failed link:** a link that drops for 4s, or fails, gets an ICE restart. If it isn't connected within 12s, that pair switches to the relay, keeps retrying P2P every 20s, and switches back automatically.
- **Reconnect:** if the network drops, the client rejoins voice by itself and every link is rebuilt under a new session. Stale signals are rejected by the server.
- **Mic problems:**
  - Blocked mic, no mic, or a plain-HTTP LAN address: you can still listen. Browsers only allow the mic on HTTPS or localhost.
  - Unanswered permission prompt: you join listen-only after 8s, and the mic is used automatically if you allow it later.
  - Unplugged mic: it's re-acquired.
- **Glare-safe:** "perfect negotiation" handles both sides offering at once, and only one side creates the audio m-line, so devices without any audio input still connect.
- **Congestion:** relay audio is sent as volatile (dropped rather than queued). The playback jitter buffer starts at 60ms and is capped at 300ms of latency.
- **Not over-trusting the server:** the server never touches P2P media. It only authorises signalling and relays audio between players in the same channel. It also enforces self-mute and team-mute votes on relayed audio.

**Controls:** mute/unmute your mic, leave voice, and per-player *Mute for me* plus a volume slider (click their 🎙️). Speaking indicators show who's talking. ⇄ marks a player reached via the relay.

**Support switch:** add `?voice=relay` to a room URL to force the relay path in that tab. `window.__bbVoice.debug()` prints the link states.

**Scale notes:** voice is a full mesh, which suits ≤ 8 players (up to 16 works). Relay traffic is about 17 kbps up per active speaker, times the number of listeners on the relay. For bigger rooms the next step would be an SFU (e.g. LiveKit or mediasoup, both self-hostable).

## Configuration

See `.env.example`. Everything is optional.
