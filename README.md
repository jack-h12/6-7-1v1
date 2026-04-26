# 6-7 Duel

A head-to-head meme-competition web app. Two players, ten seconds, webcam hand-tracking — highest "six-seven" reps wins.

Built with Next.js (App Router), TypeScript, Tailwind, MediaPipe Tasks Vision (hand landmarks), and PeerJS (serverless 1v1 WebRTC rooms).

## Run

```bash
npm install
npm run dev
# open http://localhost:3000
```

The app needs access to your webcam. Browsers require a secure context for camera access:
- `http://localhost` is treated as secure — dev works out of the box.
- For remote testing you need HTTPS. Easiest: `npx next dev --experimental-https` or run behind a tunnel like Cloudflare Tunnel / ngrok.

## Project structure

```
app/
  layout.tsx              root layout
  page.tsx                landing page
  globals.css             Tailwind entry + utility classes
  practice/page.tsx       single-player practice mode
  duel/
    page.tsx              lobby (create / join)
    DuelRoom.tsx          the match itself (PeerJS + gesture + scoreboard)
components/
  WebcamView.tsx          getUserMedia + overlay canvas
  Countdown.tsx           3..2..1..GO overlay
  TimerBar.tsx            time-remaining bar
  ScoreCounter.tsx        animated big score
  WinnerScreen.tsx        end-of-match overlay + confetti
  Confetti.tsx
  Leaderboard.tsx         localStorage-backed top 10
  SoundToggle.tsx         global sound on/off
lib/
  gestureLogic.ts         pure gesture state machine + tunable constants
  useHandTracking.ts      MediaPipe HandLandmarker hook (dynamic import, VIDEO mode)
  useMatchClock.ts        3-phase (idle/countdown/running/finished) rAF timer
  peerClient.ts           thin PeerJS wrapper (host / guest / message types)
  memes.ts                banter strings
```

## How the 6-7 detector works

The viral 6-7 motion is an alternating hand-weighing gesture (think "scales of justice"). MediaPipe gives 21 normalized landmarks per hand; we track the **wrist (landmark 0)** along the Y axis and run a state machine:

- Two hysteresis thresholds: `UP_ENTER = 0.42`, `DOWN_ENTER = 0.58` (normalized screen Y).
- States: `UP ↔ DOWN`, with a dead zone between the two thresholds so small jitter can't flip the state.
- **One rep** = a full `UP → DOWN → UP` cycle (completed when we re-enter the UP zone).
- **Anti-spam**: `MIN_FLIP_MS` (debounce), `MIN_AMPLITUDE` (cycle must span enough vertical distance), `MAX_REPS_PER_SEC` (hard cap).
- Combo ticks up while successive reps land within `COMBO_WINDOW_MS`; multipliers are a visual flair only — the base score is pure reps.

All constants live at the top of `lib/gestureLogic.ts`. If the detector feels too strict/loose for your camera framing, widen/narrow the thresholds:

```ts
export const GestureConfig = {
  UP_ENTER: 0.42,
  DOWN_ENTER: 0.58,
  MIN_FLIP_MS: 110,
  MIN_AMPLITUDE: 0.12,
  MAX_REPS_PER_SEC: 8,
  COMBO_WINDOW_MS: 600,
};
```

Two dashed guide lines are drawn directly on the webcam overlay so players can see the UP/DOWN zones and frame themselves accordingly.

## How 1v1 works

- **Host** clicks "Create room" and gets a long PeerJS peer ID as a room code. They share the code (or the auto-generated `?room=…` URL).
- **Guest** enters the code and PeerJS dials the host over WebRTC. No server of our own — the public PeerServer broker is used for signaling.
- Both sides mark "I'm ready"; the host then picks an absolute `startAt` (a few seconds in the future) and broadcasts it. Both clients schedule their 3-2-1-GO from the same wall-clock target so the 10-second windows align.
- During the match each client broadcasts its score at ~10 Hz and sends a `final` message on end. The winner screen shows once both finals have landed.
- "Play again" sends a `rematch` message; both clients reset to the lobby.

The opponent **video** isn't streamed — only their score/combo. This keeps bandwidth tiny and avoids WebRTC media setup. Easy to add later if you want face-cams.

For production: swap `new Peer(...)` for a self-hosted PeerServer (the free broker throttles and occasionally goes down).

## What's intentionally MVP

- Scores persist in `localStorage` only.
- No accounts / matchmaking / anti-cheat beyond the gesture-logic sanity checks.
- Sound effects are minimal WebAudio beeps rather than WAV files.
- Reconnect logic is thin — if the peer drops mid-match the room bails out with an error panel.

## Tuning tips

- Good lighting and a plain background dramatically improve hand detection.
- Keep the camera framed so your "up" and "down" positions sit above and below the two dashed lines — otherwise reps won't register.
- If you cheat by waving just your fingers, you'll fail the amplitude check — you must actually move your wrist.
