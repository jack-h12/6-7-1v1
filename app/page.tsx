import Link from "next/link";
import { Leaderboard } from "@/components/Leaderboard";
import { SoundToggle } from "@/components/SoundToggle";

const RAIL_TEXT = "6767676767676767676767676767676767676767676767676767676767676767676767676767";

export default function Landing() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-meme-photo">
      {/* light wash so foreground text reads but the photo stays visible */}
      <div className="absolute inset-0 bg-black/20" />
      {/* subtle magenta vignette like the reference */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_55%,rgba(120,0,80,0.35)_100%)]" />

      {/* "67" rails */}
      <div className="rail-67 left">{RAIL_TEXT}</div>
      <div className="rail-67 right">{RAIL_TEXT}</div>
      <div className="rail-67-h top">{RAIL_TEXT}</div>
      <div className="rail-67-h bot">{RAIL_TEXT}</div>

      <div className="relative z-10 container mx-auto px-8 pt-10 pb-8 max-w-6xl">
        {/* Top nav */}
        <nav className="flex flex-wrap items-center justify-center gap-3 md:gap-4">
          <Link href="/duel" className="nav-pill">[Play Now]</Link>
          <span className="text-white/60 font-black">|</span>
          <Link href="/practice" className="nav-pill">[Practice Room]</Link>
          <span className="text-white/60 font-black">|</span>
          <a href="#leaderboard" className="nav-pill">[Most Brainrotted (Leaderboard)]</a>
          <span className="text-white/60 font-black">|</span>
          <a href="#how" className="nav-pill">[How to Play]</a>
          <div className="ml-auto hidden md:block"><SoundToggle /></div>
        </nav>

        {/* Hero */}
        <section className="mt-8 md:mt-10 text-center">
          <h1 className="font-display leading-[0.95] title-white text-4xl sm:text-5xl md:text-7xl lg:text-8xl tracking-tight">
            THE ULTIMATE 6-7 OFF
          </h1>

          <p className="mt-6 font-display neon-cyan-text text-xl md:text-3xl tracking-wide">
            1v1 6-7 OFF — WHO CAN DO MORE 6-7&apos;s IN 10 SECONDS!!
          </p>
          <p className="mt-2 font-display neon-cyan-text text-xl md:text-3xl tracking-wide">
            SEE WHO&apos;S BRAIN IS MORE ROTTED!!! <span aria-hidden>🔥🔥🔥</span>
          </p>

          <p className="mt-5 font-display text-lg md:text-2xl text-white tracking-wide" style={{ textShadow: "2px 2px 0 #000" }}>
            CAN YOU OUT-6-7 THEM IN 10 SECONDS?
          </p>

          <div className="mt-8 flex flex-col md:flex-row gap-4 justify-center items-center">
            <Link href="/duel" className="btn-invite">
              [SEND AN INVITE] <span aria-hidden>📨</span>
            </Link>
            <Link href="/practice" className="btn-invite-cyan">
              [PRACTICE ROOM] <span aria-hidden>🎯</span>
            </Link>
          </div>

          <div className="mt-3 text-xs md:text-sm text-white/70 font-mono">
            no sign-up · no dignity · webcam required
          </div>
        </section>

        {/* Feature row */}
        <section className="mt-12 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          <div className="neon-box-cyan p-5 text-center">
            <div className="font-display text-lg neon-cyan-text">POWER UP CAMERA</div>
            <div className="my-4 text-5xl" aria-hidden>📱</div>
            <div className="font-display text-sm tracking-wider text-white" style={{ textShadow: "1px 1px 0 #000" }}>
              POWER ON CAMERA!
            </div>
          </div>

          <div className="neon-box-cyan p-5 text-center">
            <div className="font-display text-lg neon-cyan-text">THE 6-7 PUMP MOTION</div>
            <div className="text-xs text-white/80 -mt-1">(Up & Down!)</div>
            <div className="my-4 text-5xl flex justify-center gap-2 items-center" aria-hidden>
              <span>🤚</span>
              <span className="text-base">↕</span>
              <span>🤚</span>
              <span className="text-base">↕</span>
              <span>🤚</span>
            </div>
            <div className="font-display text-xs tracking-wide text-white" style={{ textShadow: "1px 1px 0 #000" }}>
              Rapid vertical oscillation movement
            </div>
          </div>

          <div className="neon-box-cyan p-5 text-center">
            <div className="font-display text-lg neon-cyan-text">10 SECOND COUNTDOWN!</div>
            <div className="text-xs text-white/80 -mt-1">BE THE FASTEST!</div>
            <div className="my-4 text-5xl" aria-hidden>⏱️</div>
            <div className="font-display text-sm tracking-wide text-white" style={{ textShadow: "1px 1px 0 #000" }}>
              10 SECONDS TILL GLORY
            </div>
          </div>

          {/* Mock scoreboard card */}
          <div className="neon-box p-4">
            <div className="grid grid-cols-3 gap-2 items-center text-center">
              <div className="font-display text-xs neon-cyan-text">YOU</div>
              <div className="font-display text-xs neon-pink-text">6-7</div>
              <div className="font-display text-xs neon-pink-text">OPPONENT</div>

              <div className="text-3xl" aria-hidden>🧑🏽‍🦱</div>
              <div className="font-display text-2xl neon-yellow-text">10s</div>
              <div className="text-3xl" aria-hidden>🧒</div>

              <div className="rounded-md bg-cyan-500/30 border border-cyan-300/60 py-2 font-display text-cyan-100">0</div>
              <div></div>
              <div className="rounded-md bg-pink-500/30 border border-pink-300/60 py-2 font-display text-pink-100">0</div>
            </div>
          </div>
        </section>

        {/* How to play + leaderboard */}
        <section id="how" className="mt-10 grid md:grid-cols-2 gap-5">
          <div className="neon-box p-5">
            <div className="font-display text-xl mb-2 tracking-widest neon-pink-text">HOW TO PLAY (IT&apos;S COOKED)</div>
            <ol className="space-y-2 text-white/90 list-decimal list-inside text-sm font-mono">
              <li>Allow your webcam. We see you. You signed up for this.</li>
              <li>Pump your hand <b>UP / DOWN / UP / DOWN</b> like you&apos;re saying <span className="neon-yellow-text">six</span>… <span className="neon-pink-text">seven</span>…</li>
              <li>Each full crossover = +1 to the brainrot meter.</li>
              <li>10 seconds. Highest reps wins. Loser&apos;s brain is officially less rotted (sad).</li>
            </ol>
          </div>
          <div id="leaderboard">
            <Leaderboard />
          </div>
        </section>

        {/* Footer nav */}
        <footer className="mt-12 text-center">
          <div className="flex flex-wrap items-center justify-center gap-3 md:gap-4">
            <Link href="/duel" className="nav-pill">[Play Now]</Link>
            <span className="text-white/60 font-black">|</span>
            <Link href="/practice" className="nav-pill">[Practice Room]</Link>
            <span className="text-white/60 font-black">|</span>
            <a href="#leaderboard" className="nav-pill">[Most Brainrotted (Leaderboard)]</a>
            <span className="text-white/60 font-black">|</span>
            <a href="#how" className="nav-pill">[How to Play]</a>
          </div>
          <div className="md:hidden mt-4 flex justify-center"><SoundToggle /></div>
        </footer>
      </div>
    </main>
  );
}
