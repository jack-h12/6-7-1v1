"use client";

import { useMemo } from "react";

const COLORS = ["#ff2ea6", "#00e5ff", "#ffe600", "#8a2be2", "#ffffff"];

export function Confetti({ count = 80 }: { count?: number }) {
  const pieces = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        left: Math.random() * 100,
        delay: Math.random() * 1.2,
        duration: 1.8 + Math.random() * 1.4,
        color: COLORS[i % COLORS.length],
        size: 6 + Math.random() * 10,
      })),
    [count]
  );
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 overflow-hidden z-40">
      {pieces.map((p, i) => (
        <span
          key={i}
          className="absolute animate-confetti-fall rounded-sm"
          style={{
            left: `${p.left}%`,
            top: "-10vh",
            width: p.size,
            height: p.size * 0.4,
            background: p.color,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.duration}s`,
          }}
        />
      ))}
    </div>
  );
}
