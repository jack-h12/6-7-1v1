"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { WebcamView } from "@/components/WebcamView";
import { Countdown } from "@/components/Countdown";
import { TimerBar } from "@/components/TimerBar";
import { ScoreCounter } from "@/components/ScoreCounter";
import { WinnerScreen } from "@/components/WinnerScreen";
import { useSound } from "@/components/SoundToggle";
import { useHandTracking } from "@/lib/useHandTracking";
import { GestureConfig } from "@/lib/gestureLogic";
import { DuelClient, DuelMessage, DuelRole } from "@/lib/peerClient";
import { WIN_TAGLINES, LOSE_TAGLINES, TIE_TAGLINES, pick } from "@/lib/memes";
import { saveLeaderboardEntry } from "@/components/Leaderboard";

type Phase = "connecting" | "lobby" | "countdown" | "running" | "finished";

const DURATION_MS = 10_000;
const SCORE_BROADCAST_HZ = 10;

interface Props {
  role: DuelRole;
  code: string | null;
  onExit: () => void;
}

/**
 * Full-lifecycle duel room:
 *  connecting -> lobby (both mark ready) -> countdown -> running -> finished
 *
 * Host is the clock authority: it picks an absolute startAt when both sides
 * are ready and broadcasts it. Guest schedules its countdown off the same
 * wall-clock target so the 10-second windows align.
 */
export function DuelRoom({ role, code, onExit }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const { on: soundOn } = useSound();

  const [phase, setPhase] = useState<Phase>("connecting");
  const [hostCode, setHostCode] = useState<string | null>(null);
  const [connErr, setConnErr] = useState<string | null>(null);
  const [myReady, setMyReady] = useState(false);
  const [oppReady, setOppReady] = useState(false);
  const [oppScore, setOppScore] = useState(0);
  const [oppCombo, setOppCombo] = useState(0);
  const [oppFinal, setOppFinal] = useState<number | null>(null);
  const [myFinal, setMyFinal] = useState<number | null>(null);
  const [remainingMs, setRemainingMs] = useState(DURATION_MS);

  const clientRef = useRef<DuelClient | null>(null);
  const startAtRef = useRef<number | null>(null);
  const playingRef = useRef(false);
  const lastBroadcastRef = useRef(0);

  // Gesture tracking.
  const onRep = useCallback(() => {
    // reps are read from snapshot directly; sound cue here for feedback
    if (playingRef.current && soundOn) blip();
  }, [soundOn]);

  // Integration point: hook now exposes `hands` (classified left/right) instead of a single landmark list.
  const { ready: trackerReady, error: trackerErr, snapshot, reset: resetDetector, handsRef } = useHandTracking({
    enabled: true,
    videoRef,
    onRep,
  });

  // -------- Peer setup --------
  useEffect(() => {
    let cancelled = false;
    const client = new DuelClient({
      onMessage: (msg) => handleMessage(msg),
      onDisconnect: () => {
        if (!cancelled) setConnErr("Opponent disconnected.");
      },
      onError: (e) => {
        if (!cancelled) setConnErr(e.message);
      },
    });
    clientRef.current = client;

    (async () => {
      try {
        if (role === "host") {
          const id = await client.createAsHost();
          if (cancelled) return;
          setHostCode(id);
          setPhase("lobby");
        } else {
          if (!code) throw new Error("No room code provided");
          await client.joinAsGuest(code);
          if (cancelled) return;
          setPhase("lobby");
        }
      } catch (e: any) {
        if (!cancelled) setConnErr(e?.message ?? String(e));
      }
    })();

    return () => {
      cancelled = true;
      client.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role, code]);

  const handleMessage = (msg: DuelMessage) => {
    switch (msg.type) {
      case "ready":
        setOppReady(true);
        break;
      case "start":
        startAtRef.current = msg.startAt;
        scheduleCountdown(msg.startAt);
        break;
      case "score":
        setOppScore(msg.reps);
        setOppCombo(msg.combo);
        break;
      case "final":
        setOppFinal(msg.reps);
        break;
      case "rematch":
        resetMatch();
        break;
    }
  };

  // Host: if both are ready, schedule the start.
  useEffect(() => {
    if (role !== "host") return;
    if (phase !== "lobby") return;
    if (!myReady || !oppReady) return;
    const startAt = Date.now() + 2500; // small buffer so countdown 3..2..1 feels right
    clientRef.current?.send({ type: "start", startAt, durationMs: DURATION_MS });
    startAtRef.current = startAt;
    scheduleCountdown(startAt);
  }, [role, phase, myReady, oppReady]);

  const scheduleCountdown = (startAt: number) => {
    const delay = Math.max(0, startAt - Date.now() - 3000); // start the 3-count so it lands at startAt
    window.setTimeout(() => setPhase("countdown"), delay);
  };

  const onCountdownDone = () => {
    const startAt = startAtRef.current ?? Date.now();
    // snap to absolute start: if clocks drift, align the running window.
    const now = Date.now();
    const offset = Math.max(0, startAt - now);
    window.setTimeout(() => {
      resetDetector();
      playingRef.current = true;
      setPhase("running");
      runLoop(startAt);
    }, offset);
  };

  // Running loop: timer + score broadcast.
  const runLoop = (startAt: number) => {
    const tick = () => {
      const elapsed = Date.now() - startAt;
      const rem = Math.max(0, DURATION_MS - elapsed);
      setRemainingMs(rem);
      if (rem <= 0) {
        playingRef.current = false;
        const finalReps = snapshotRepsRef.current;
        setMyFinal(finalReps);
        clientRef.current?.send({ type: "final", reps: finalReps });
        setPhase("finished");
        return;
      }
      // broadcast at SCORE_BROADCAST_HZ
      const now = performance.now();
      if (now - lastBroadcastRef.current > 1000 / SCORE_BROADCAST_HZ) {
        lastBroadcastRef.current = now;
        clientRef.current?.send({
          type: "score",
          reps: snapshotRepsRef.current,
          combo: snapshotComboRef.current,
        });
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };

  // Keep latest reps/combo in refs so runLoop doesn't need them as deps.
  const snapshotRepsRef = useRef(0);
  const snapshotComboRef = useRef(0);
  useEffect(() => {
    snapshotRepsRef.current = snapshot.reps;
    snapshotComboRef.current = snapshot.combo;
  }, [snapshot.reps, snapshot.combo]);

  // Save leaderboard once when the match ends, using the frozen score.
  const savedRef = useRef(false);
  useEffect(() => {
    if (phase === "finished" && myFinal != null && !savedRef.current) {
      savedRef.current = true;
      if (myFinal > 0) saveLeaderboardEntry({ name: "you", score: myFinal, mode: "duel", at: Date.now() });
    }
    if (phase !== "finished") savedRef.current = false;
  }, [phase, myFinal]);

  const markReady = () => {
    setMyReady(true);
    clientRef.current?.send({ type: "ready" });
  };

  const requestRematch = () => {
    clientRef.current?.send({ type: "rematch" });
    resetMatch();
  };

  const resetMatch = () => {
    setOppScore(0);
    setOppCombo(0);
    setOppFinal(null);
    setMyFinal(null);
    setMyReady(false);
    setOppReady(false);
    setRemainingMs(DURATION_MS);
    resetDetector();
    playingRef.current = false;
    startAtRef.current = null;
    setPhase("lobby");
  };

  const shareLink = useMemo(() => {
    if (!hostCode || typeof window === "undefined") return null;
    return `${window.location.origin}/duel?room=${encodeURIComponent(hostCode)}`;
  }, [hostCode]);

  const copyShare = async () => {
    if (!shareLink) return;
    try { await navigator.clipboard.writeText(shareLink); } catch {}
  };

  // During the match, show the live score; once finished, show the frozen final.
  const myScore = myFinal ?? snapshot.reps;
  const winner: "win" | "lose" | "tie" | null =
    phase === "finished" && oppFinal != null && myFinal != null
      ? myFinal > oppFinal ? "win" : myFinal < oppFinal ? "lose" : "tie"
      : null;

  return (
    <main className="relative min-h-screen">
      <div className="absolute inset-0 bg-meme-gradient bg-[length:300%_300%] animate-gradient-pan opacity-15" />
      <div className="relative z-10 container mx-auto px-4 py-6 max-w-6xl">
        <header className="flex items-center justify-between">
          <button onClick={onExit} className="font-display font-black text-xl meme-outline text-meme-yellow">
            ← Leave
          </button>
          <div className="font-display font-black tracking-widest text-white/80">
            1v1 · {role.toUpperCase()}
          </div>
          <div className="w-20 text-right text-xs text-white/50">
            {clientRef.current?.connected ? "connected" : "…"}
          </div>
        </header>

        {/* Error overlay */}
        {connErr && (
          <div className="mt-6 panel border-meme-pink text-meme-pink">
            <div className="font-display font-black">Connection error</div>
            <div className="text-white/80 text-sm mt-1">{connErr}</div>
            <button className="btn-meme bg-white text-black mt-3 !text-lg !py-2" onClick={onExit}>
              Back
            </button>
          </div>
        )}

        {!connErr && (
          <section className="mt-6 grid lg:grid-cols-2 gap-4">
            {/* Local player */}
            <div className="relative">
              <div className="mb-2 flex justify-between font-display font-black">
                <span className="text-meme-yellow">YOU</span>
                <span className="text-xs text-white/50">
                  {trackerReady ? "tracker ready" : "loading tracker…"}
                </span>
              </div>
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
              {phase === "countdown" && (
                <Countdown seconds={3} onDone={onCountdownDone} playSound={soundOn} />
              )}
              <div className="mt-3 panel">
                <ScoreCounter
                  score={myScore}
                  label="YOU"
                  combo={snapshot.combo}
                  comboMultiplier={snapshot.comboMultiplier}
                  accent="yellow"
                />
              </div>
            </div>

            {/* Opponent player (we don't stream video — just their score bubble) */}
            <div className="relative">
              <div className="mb-2 flex justify-between font-display font-black">
                <span className="text-meme-pink">OPPONENT</span>
                <span className="text-xs text-white/50">
                  {oppReady ? "ready ✓" : phase === "lobby" ? "not ready" : ""}
                </span>
              </div>
              <div className="aspect-[4/3] w-full rounded-2xl border-4 border-black bg-black/60 grid place-items-center relative overflow-hidden">
                <div className="absolute inset-0 bg-meme-gradient bg-[length:300%_300%] animate-gradient-pan opacity-25" />
                <div className="relative text-center p-6">
                  <div className="text-8xl md:text-9xl font-display font-black meme-outline text-meme-pink animate-score-pop" key={oppScore}>
                    {phase === "finished" && oppFinal != null ? oppFinal : oppScore}
                  </div>
                  <div className="mt-3 text-white/70 tracking-widest font-display font-black">OPP SCORE</div>
                  {oppCombo >= 3 && phase === "running" && (
                    <div className="mt-2 font-display font-black text-meme-yellow text-xl animate-shake">
                      COMBO x{oppCombo}
                    </div>
                  )}
                </div>
              </div>
              <div className="mt-3 panel">
                <TimerBar remainingMs={remainingMs} totalMs={DURATION_MS} />
              </div>
            </div>

            {/* Lobby overlay */}
            {phase === "lobby" && (
              <div className="lg:col-span-2 panel text-center">
                {role === "host" && (
                  <>
                    <div className="text-sm text-white/60 tracking-widest">ROOM CODE</div>
                    <div className="font-mono text-3xl font-black my-2 text-meme-yellow break-all">
                      {hostCode ?? "…"}
                    </div>
                    {shareLink && (
                      <button
                        onClick={copyShare}
                        className="text-xs text-white/60 underline hover:text-white"
                      >
                        Copy share link
                      </button>
                    )}
                  </>
                )}
                {role === "guest" && <div className="text-white/70">Connected to host.</div>}

                <div className="mt-4 flex items-center justify-center gap-4">
                  <div className={`panel px-4 py-2 ${myReady ? "border-meme-yellow" : ""}`}>
                    YOU · {myReady ? "READY ✓" : "…"}
                  </div>
                  <div className="text-white/40">vs</div>
                  <div className={`panel px-4 py-2 ${oppReady ? "border-meme-pink" : ""}`}>
                    OPP · {oppReady ? "READY ✓" : "waiting"}
                  </div>
                </div>

                <div className="mt-6">
                  <button
                    onClick={markReady}
                    disabled={myReady || !trackerReady}
                    className="btn-meme bg-meme-yellow text-black disabled:opacity-50"
                  >
                    {myReady ? "Waiting for opponent…" : trackerReady ? "I'm ready" : "Loading camera…"}
                  </button>
                </div>
                {trackerErr && (
                  <div className="mt-3 text-meme-pink text-sm">{trackerErr}</div>
                )}
              </div>
            )}

            {/* Finished overlay */}
            {phase === "finished" && winner && (
              <WinnerScreen
                variant={winner}
                title={winner === "win" ? "W!" : winner === "lose" ? "L." : "TIE"}
                subtitle={
                  winner === "win" ? pick(WIN_TAGLINES) :
                  winner === "lose" ? pick(LOSE_TAGLINES) :
                  pick(TIE_TAGLINES)
                }
                myScore={myScore}
                oppScore={oppFinal ?? oppScore}
                onPlayAgain={requestRematch}
                onHome={() => (window.location.href = "/")}
              />
            )}

            {phase === "finished" && oppFinal == null && (
              <div className="lg:col-span-2 panel text-center">
                <div className="font-display font-black text-xl">Waiting for opponent&apos;s final score…</div>
              </div>
            )}
          </section>
        )}
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
    setTimeout(() => { osc.stop(); ctx.close().catch(() => {}); }, 60);
  } catch {/* no-op */}
}
