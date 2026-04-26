"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { WebcamView } from "@/components/WebcamView";
import { Countdown } from "@/components/Countdown";
import { TimerBar } from "@/components/TimerBar";
import { ScoreCounter } from "@/components/ScoreCounter";
import { WinnerScreen } from "@/components/WinnerScreen";
import { SoundToggle, useSound } from "@/components/SoundToggle";
import { useHandTracking } from "@/lib/useHandTracking";
import { useMatchClock } from "@/lib/useMatchClock";
import { GestureConfig } from "@/lib/gestureLogic";
import { MILESTONES, ILLEGAL_CALLOUTS, WIN_TAGLINES, pick } from "@/lib/memes";
import { saveLeaderboardEntry } from "@/components/Leaderboard";

export default function PracticePage() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const flashTimer = useRef<number | null>(null);
  const { on: soundOn } = useSound();
  const playingRef = useRef(false);

  const clock = useMatchClock({ durationMs: 10_000 });

  const onRep = useCallback((snap: { reps: number; combo: number }) => {
    if (!playingRef.current) return;
    if (soundOn) blip();
    if (MILESTONES[snap.reps]) {
      showFlash(MILESTONES[snap.reps]);
    } else if (snap.combo >= 3 && snap.combo % 5 === 0) {
      showFlash(`6-7 COMBO x${snap.combo}`);
    }
  }, [soundOn]);

  // Integration point: the hook now returns classified `hands` (left/right)
  // instead of a single landmark array. Everything else is unchanged.
  const { ready, error, snapshot, reset, handsRef } = useHandTracking({
    enabled: true,
    videoRef,
    onRep,
  });

  const showFlash = (msg: string) => {
    setFlash(msg);
    if (flashTimer.current) window.clearTimeout(flashTimer.current);
    flashTimer.current = window.setTimeout(() => setFlash(null), 900);
  };

  // Drop fake reps captured before/after the running phase.
  useEffect(() => {
    playingRef.current = clock.phase === "running";
  }, [clock.phase]);

  // Freeze the score at the instant the match ends so the WinnerScreen value
  // doesn't drift if the player keeps moving.
  const [frozenReps, setFrozenReps] = useState(0);
  const prevPhase = useRef(clock.phase);
  useEffect(() => {
    if (prevPhase.current !== "finished" && clock.phase === "finished") {
      setFrozenReps(snapshot.reps);
      if (snapshot.reps > 0) {
        saveLeaderboardEntry({ name: "you", score: snapshot.reps, mode: "practice", at: Date.now() });
      }
    }
    prevPhase.current = clock.phase;
  }, [clock.phase, snapshot.reps]);

  const startRunning = () => {
    // Reset right before reps count — ensures any twitches during the 3..2..1 don't register.
    reset();
    clock.beginRunning();
  };

  const handleStart = () => {
    reset();
    clock.start();
  };

  const handleReset = () => {
    reset();
    clock.reset();
  };

  // Illegal-technique callout: if the hand is suspiciously out of view for too long while running.
  const lastSeenRef = useRef(performance.now());
  useEffect(() => {
    if (snapshot.handVisible) lastSeenRef.current = performance.now();
  }, [snapshot.handVisible]);
  useEffect(() => {
    if (clock.phase !== "running") return;
    const id = window.setInterval(() => {
      if (performance.now() - lastSeenRef.current > 1500) {
        showFlash(pick(ILLEGAL_CALLOUTS));
        lastSeenRef.current = performance.now();
      }
    }, 600);
    return () => window.clearInterval(id);
  }, [clock.phase]);

  const elapsedSec = useMemo(() => (clock.durationMs - clock.remainingMs) / 1000, [clock.durationMs, clock.remainingMs]);
  const rps = clock.phase === "running" && elapsedSec > 0.2 ? snapshot.reps / elapsedSec : 0;

  return (
    <main className="relative min-h-screen">
      <div className="absolute inset-0 bg-meme-gradient bg-[length:300%_300%] animate-gradient-pan opacity-20" />
      <div className="relative z-10 container mx-auto px-4 py-6 max-w-5xl">
        <header className="flex items-center justify-between">
          <Link href="/" className="font-display font-black text-xl meme-outline text-meme-yellow">
            ← 6-7
          </Link>
          <div className="font-display font-black tracking-widest text-white/80">PRACTICE</div>
          <SoundToggle />
        </header>

        <section className="mt-6 grid lg:grid-cols-[1fr_340px] gap-6">
          <div className="relative">
            {/* Integration point: pass classified two-hand result + state to the overlay. */}
            <WebcamView
              ref={videoRef}
              active
              handsRef={handsRef}
              topLine={GestureConfig.TOP_Y}
              bottomLine={GestureConfig.BOTTOM_Y}
              state={snapshot.state}
              className="aspect-[4/3] w-full"
            />

            {clock.phase === "countdown" && (
              <Countdown seconds={3} onDone={startRunning} playSound={soundOn} />
            )}

            {clock.phase === "finished" && (
              <WinnerScreen
                variant="solo"
                title={`${frozenReps}!`}
                subtitle={frozenReps >= 20 ? pick(WIN_TAGLINES) : "Not bad. Try a duel next."}
                myScore={frozenReps}
                onPlayAgain={handleStart}
                onHome={() => (window.location.href = "/")}
              />
            )}

            {flash && clock.phase === "running" && (
              <div className="absolute top-6 left-1/2 -translate-x-1/2 z-20">
                <div className="font-display font-black text-4xl meme-outline text-meme-pink animate-score-pop">
                  {flash}
                </div>
              </div>
            )}

            {!snapshot.handVisible && clock.phase === "running" && (
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 bg-black/70 border-2 border-meme-pink rounded-full px-4 py-1 text-meme-pink font-display font-black">
                SHOW YOUR HAND 🖐️
              </div>
            )}
          </div>

          <aside className="flex flex-col gap-4">
            <div className="panel">
              <ScoreCounter
                score={snapshot.reps}
                label="REPS"
                combo={snapshot.combo}
                comboMultiplier={snapshot.comboMultiplier}
              />
              <div className="mt-4">
                <TimerBar remainingMs={clock.remainingMs} totalMs={clock.durationMs} />
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2 text-center">
                <div className="panel py-3">
                  <div className="text-xs text-white/60">REPS/SEC</div>
                  <div className="font-display font-black text-2xl">{rps.toFixed(1)}</div>
                </div>
                <div className="panel py-3">
                  <div className="text-xs text-white/60">COMBO</div>
                  <div className="font-display font-black text-2xl">x{snapshot.combo}</div>
                </div>
              </div>
            </div>

            <div className="panel">
              <div className="font-display font-black tracking-widest text-sm text-white/60 mb-2">CONTROLS</div>
              <div className="flex gap-2">
                {clock.phase === "idle" && (
                  <button className="btn-meme bg-meme-yellow text-black flex-1 !text-xl !py-3" onClick={handleStart} disabled={!ready}>
                    {ready ? "GO!" : "Loading…"}
                  </button>
                )}
                {clock.phase !== "idle" && (
                  <button className="btn-meme bg-white text-black flex-1 !text-lg !py-3" onClick={handleReset}>
                    Reset
                  </button>
                )}
              </div>
              {error && <div className="text-meme-pink text-xs mt-2">{error}</div>}
              {!snapshot.handVisible && clock.phase === "idle" && ready && (
                <div className="mt-3 text-xs text-white/60">
                  Raise one hand in front of the camera. Keep it visible from wrist to fingertips.
                </div>
              )}
            </div>

            <div className="panel text-xs text-white/60 leading-relaxed">
              <b className="text-white/80">The motion:</b> alternate your hand <span className="text-meme-cyan">up</span> and{" "}
              <span className="text-meme-pink">down</span>, crossing both dashed lines on the video. Each full
              cycle = one rep. Tiny wiggles don&apos;t count.
            </div>
          </aside>
        </section>
      </div>
    </main>
  );
}

function blip() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 660;
    osc.type = "square";
    gain.gain.value = 0.04;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    setTimeout(() => {
      osc.stop();
      ctx.close().catch(() => {});
    }, 60);
  } catch {/* no-op */}
}
