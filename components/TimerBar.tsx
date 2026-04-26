interface TimerBarProps {
  remainingMs: number;
  totalMs: number;
}

export function TimerBar({ remainingMs, totalMs }: TimerBarProps) {
  const pct = Math.max(0, Math.min(100, (remainingMs / totalMs) * 100));
  const seconds = Math.max(0, remainingMs / 1000);
  const danger = pct < 30;
  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-2 font-display font-black text-xl">
        <span>TIME</span>
        <span className={danger ? "text-meme-pink" : "text-meme-yellow"}>{seconds.toFixed(1)}s</span>
      </div>
      <div className="h-5 rounded-full bg-white/10 border-2 border-black overflow-hidden">
        <div
          className={`h-full transition-[width] duration-100 ease-linear ${
            danger ? "bg-meme-pink" : "bg-meme-cyan"
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
