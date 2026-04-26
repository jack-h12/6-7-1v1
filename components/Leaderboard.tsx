"use client";

import { useEffect, useState } from "react";

export interface LeaderboardEntry {
  name: string;
  score: number;
  mode: "practice" | "duel";
  at: number;
}

const KEY = "sixseven:leaderboard:v1";

// Seeded mock data so the board isn't empty on first visit.
const SEED: LeaderboardEntry[] = [
  { name: "memelord42", score: 47, mode: "duel", at: Date.now() - 1000 * 60 * 60 * 2 },
  { name: "six7king",   score: 42, mode: "practice", at: Date.now() - 1000 * 60 * 60 * 5 },
  { name: "anon",       score: 38, mode: "duel", at: Date.now() - 1000 * 60 * 60 * 8 },
  { name: "wristwrecker", score: 33, mode: "practice", at: Date.now() - 1000 * 60 * 60 * 20 },
  { name: "tiktokfrozen", score: 29, mode: "duel", at: Date.now() - 1000 * 60 * 60 * 26 },
];

export function loadLeaderboard(): LeaderboardEntry[] {
  if (typeof window === "undefined") return SEED;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return SEED;
    const parsed = JSON.parse(raw) as LeaderboardEntry[];
    return Array.isArray(parsed) && parsed.length ? parsed : SEED;
  } catch {
    return SEED;
  }
}

export function saveLeaderboardEntry(entry: LeaderboardEntry) {
  if (typeof window === "undefined") return;
  const current = loadLeaderboard();
  const next = [...current, entry].sort((a, b) => b.score - a.score).slice(0, 10);
  localStorage.setItem(KEY, JSON.stringify(next));
}

export function Leaderboard({ limit = 5 }: { limit?: number }) {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  useEffect(() => setEntries(loadLeaderboard()), []);
  return (
    <div className="panel">
      <div className="font-display font-black text-xl mb-3 tracking-widest">LEADERBOARD</div>
      <ol className="space-y-2">
        {entries.slice(0, limit).map((e, i) => (
          <li
            key={`${e.at}-${e.name}-${i}`}
            className="flex items-center justify-between text-sm font-mono bg-white/5 rounded-lg px-3 py-2"
          >
            <span className="flex items-center gap-3">
              <span className="font-display font-black text-meme-yellow w-5">{i + 1}</span>
              <span>{e.name}</span>
              <span className="text-white/40 text-xs uppercase">{e.mode}</span>
            </span>
            <span className="font-display font-black text-meme-cyan">{e.score}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
