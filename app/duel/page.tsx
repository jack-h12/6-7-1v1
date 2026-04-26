"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { DuelRoom } from "./DuelRoom";
import { SoundToggle } from "@/components/SoundToggle";

/**
 * /duel — lobby: create a room, or join one.
 * Once a connection is established, renders <DuelRoom /> inline.
 */
export default function DuelLobby() {
  const [mode, setMode] = useState<"menu" | "host" | "guest">("menu");
  const [joinCode, setJoinCode] = useState("");
  const [autoJoin, setAutoJoin] = useState<string | null>(null);

  // Allow ?room=CODE to deep-link into a join.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const p = new URLSearchParams(window.location.search);
    const r = p.get("room");
    if (r) {
      setJoinCode(r);
      setAutoJoin(r);
      setMode("guest");
    }
  }, []);

  if (mode === "host") return <DuelRoom role="host" code={null} onExit={() => setMode("menu")} />;
  if (mode === "guest")
    return (
      <DuelRoom
        role="guest"
        code={autoJoin ?? joinCode.trim()}
        onExit={() => {
          setAutoJoin(null);
          setMode("menu");
        }}
      />
    );

  return (
    <main className="relative min-h-screen">
      <div className="absolute inset-0 bg-meme-gradient bg-[length:300%_300%] animate-gradient-pan opacity-25" />
      <div className="relative z-10 container mx-auto px-6 py-10 max-w-2xl">
        <header className="flex items-center justify-between">
          <Link href="/" className="font-display font-black text-xl meme-outline text-meme-yellow">
            ← 6-7
          </Link>
          <div className="font-display font-black tracking-widest text-white/80">DUEL</div>
          <SoundToggle />
        </header>

        <section className="mt-16 text-center">
          <h1 className="font-display font-black text-6xl meme-outline text-white">READY TO DUEL?</h1>
          <p className="mt-4 text-white/70 max-w-md mx-auto">
            Create a room and share the code, or join a friend&apos;s room. Both players run the
            10-second challenge at the same time. Highest reps wins.
          </p>
        </section>

        <section className="mt-12 grid md:grid-cols-2 gap-4">
          <button
            className="panel hover:bg-white/10 transition text-left p-6 group"
            onClick={() => setMode("host")}
          >
            <div className="text-4xl mb-2">🛡️</div>
            <div className="font-display font-black text-2xl">Create room</div>
            <div className="text-white/60 text-sm mt-1">Get a code, share it with your rival.</div>
          </button>

          <div className="panel p-6">
            <div className="text-4xl mb-2">⚔️</div>
            <div className="font-display font-black text-2xl">Join room</div>
            <div className="text-white/60 text-sm mt-1 mb-3">Enter the code your friend shared.</div>
            <input
              className="w-full rounded-xl bg-black/40 border-2 border-white/20 focus:border-meme-yellow focus:outline-none px-3 py-2 font-mono uppercase tracking-widest"
              placeholder="e.g. ABC123"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value)}
              maxLength={64}
            />
            <button
              className="btn-meme bg-meme-yellow text-black w-full mt-3 !text-xl !py-3"
              onClick={() => joinCode.trim() && setMode("guest")}
              disabled={!joinCode.trim()}
            >
              Join
            </button>
          </div>
        </section>
      </div>
    </main>
  );
}
