"use client";

import { useEffect, useRef, useState } from "react";

interface Props {
  seconds?: number;
  onDone: () => void;
  playSound?: boolean;
}

export function Countdown({ seconds = 3, onDone, playSound = true }: Props) {
  const [n, setN] = useState(seconds);

  // Keep the latest onDone without putting it in the effect deps — otherwise
  // a parent that re-renders every frame (e.g. driven by the hand-tracker)
  // would cancel and restart the setTimeout on every render and the countdown
  // would never advance.
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  const playSoundRef = useRef(playSound);
  playSoundRef.current = playSound;

  useEffect(() => {
    if (playSoundRef.current) beep(n === 0 ? 880 : 440, 140);
    if (n <= 0) {
      const t = setTimeout(() => onDoneRef.current(), 450);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setN((x) => x - 1), 1000);
    return () => clearTimeout(t);
  }, [n]);

  return (
    <div className="absolute inset-0 grid place-items-center bg-black/60 backdrop-blur-sm z-30 pointer-events-none">
      <div
        key={n}
        className="text-[20vmin] font-display font-black meme-outline text-meme-yellow animate-score-pop"
      >
        {n > 0 ? n : "GO!"}
      </div>
    </div>
  );
}

function beep(freq: number, ms: number) {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = freq;
    osc.type = "square";
    gain.gain.value = 0.07;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    setTimeout(() => {
      osc.stop();
      ctx.close().catch(() => {});
    }, ms);
  } catch {
    /* no-op */
  }
}
