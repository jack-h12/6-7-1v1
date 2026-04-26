"use client";

import { Confetti } from "./Confetti";

interface Props {
  title: string;
  subtitle?: string;
  myScore: number;
  oppScore?: number;
  onPlayAgain?: () => void;
  onHome?: () => void;
  variant: "win" | "lose" | "tie" | "solo";
}

const variantClass = {
  win: "text-meme-yellow",
  lose: "text-meme-pink",
  tie: "text-meme-cyan",
  solo: "text-meme-yellow",
};

export function WinnerScreen({ title, subtitle, myScore, oppScore, onPlayAgain, onHome, variant }: Props) {
  return (
    <div className="absolute inset-0 z-20 grid place-items-center bg-meme-ink/85 backdrop-blur-sm">
      {variant === "win" && <Confetti />}
      <div className="panel text-center max-w-lg mx-auto">
        <div
          className={`font-display font-black text-6xl md:text-8xl meme-outline ${variantClass[variant]} animate-score-pop`}
        >
          {title}
        </div>
        {subtitle && <div className="mt-3 text-white/80 text-lg">{subtitle}</div>}
        <div className="mt-6 flex items-center justify-center gap-10 font-display font-black text-4xl">
          <div>
            <div className="text-sm text-white/60 tracking-widest">YOU</div>
            <div className="text-meme-yellow">{myScore}</div>
          </div>
          {typeof oppScore === "number" && (
            <>
              <div className="text-white/30 text-3xl">vs</div>
              <div>
                <div className="text-sm text-white/60 tracking-widest">OPP</div>
                <div className="text-meme-pink">{oppScore}</div>
              </div>
            </>
          )}
        </div>
        <div className="mt-8 flex gap-3 justify-center">
          {onPlayAgain && (
            <button className="btn-meme bg-meme-yellow text-black" onClick={onPlayAgain}>
              Play again
            </button>
          )}
          {onHome && (
            <button className="btn-meme bg-white text-black" onClick={onHome}>
              Home
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
