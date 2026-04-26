"use client";

import { useEffect, useRef, useState } from "react";

interface Props {
  score: number;
  label?: string;
  combo?: number;
  comboMultiplier?: number;
  accent?: "pink" | "cyan" | "yellow";
}

const accentMap = {
  pink: "text-meme-pink",
  cyan: "text-meme-cyan",
  yellow: "text-meme-yellow",
};

export function ScoreCounter({ score, label = "SCORE", combo = 0, comboMultiplier = 1, accent = "yellow" }: Props) {
  const [pop, setPop] = useState(false);
  const last = useRef(score);
  useEffect(() => {
    if (score > last.current) {
      setPop(true);
      const t = setTimeout(() => setPop(false), 180);
      last.current = score;
      return () => clearTimeout(t);
    }
    last.current = score;
  }, [score]);

  return (
    <div className="text-center select-none">
      <div className="font-display font-black tracking-widest text-white/70 text-lg">{label}</div>
      <div
        className={`font-display font-black text-[22vmin] leading-none meme-outline ${accentMap[accent]} ${
          pop ? "animate-score-pop" : ""
        }`}
      >
        {score}
      </div>
      {combo >= 2 && (
        <div className="mt-2 font-display font-black text-meme-pink text-2xl animate-shake">
          6-7 COMBO x{combo}
          {comboMultiplier > 1 && <span className="text-white/80"> · {comboMultiplier}x</span>}
        </div>
      )}
    </div>
  );
}
