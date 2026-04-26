"use client";

import { useEffect, useState } from "react";
import { getSupabase } from "@/lib/supabase";

export interface LeaderboardEntry {
  name: string;
  score: number;
  mode: "practice" | "duel";
  at: number;
}

const KEY = "sixseven:leaderboard:v1";

const SEED: LeaderboardEntry[] = [
  { name: "memelord42", score: 47, mode: "duel", at: Date.now() - 1000 * 60 * 60 * 2 },
  { name: "six7king",   score: 42, mode: "practice", at: Date.now() - 1000 * 60 * 60 * 5 },
  { name: "anon",       score: 38, mode: "duel", at: Date.now() - 1000 * 60 * 60 * 8 },
  { name: "wristwrecker", score: 33, mode: "practice", at: Date.now() - 1000 * 60 * 60 * 20 },
  { name: "tiktokfrozen", score: 29, mode: "duel", at: Date.now() - 1000 * 60 * 60 * 26 },
];

function loadLocal(): LeaderboardEntry[] {
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

function saveLocal(entry: LeaderboardEntry) {
  if (typeof window === "undefined") return;
  const current = loadLocal();
  const next = [...current, entry].sort((a, b) => b.score - a.score).slice(0, 10);
  localStorage.setItem(KEY, JSON.stringify(next));
}

/** Save a score. If the user is signed in, writes to Supabase; otherwise local. */
export async function saveLeaderboardEntry(entry: LeaderboardEntry) {
  saveLocal(entry);
  const supa = getSupabase();
  if (!supa) return;
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return;
  const display =
    (user.user_metadata?.display_name as string | undefined) ??
    (user.user_metadata?.full_name as string | undefined) ??
    user.email?.split("@")[0] ??
    entry.name;
  await supa.from("scores").insert({
    user_id: user.id,
    name: display,
    score: entry.score,
    mode: entry.mode,
  });
}

async function loadRemote(limit: number): Promise<LeaderboardEntry[] | null> {
  const supa = getSupabase();
  if (!supa) return null;
  const { data, error } = await supa
    .from("scores")
    .select("name,score,mode,created_at")
    .order("score", { ascending: false })
    .limit(limit);
  if (error || !data) return null;
  return data.map((r: any) => ({
    name: r.name,
    score: r.score,
    mode: r.mode,
    at: new Date(r.created_at).getTime(),
  }));
}

export function Leaderboard({ limit = 5 }: { limit?: number }) {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [source, setSource] = useState<"global" | "local">("local");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const remote = await loadRemote(limit);
      if (cancelled) return;
      if (remote && remote.length) {
        setEntries(remote);
        setSource("global");
      } else {
        setEntries(loadLocal());
        setSource("local");
      }
    })();
    return () => { cancelled = true; };
  }, [limit]);

  return (
    <div className="panel">
      <div className="flex items-center justify-between mb-3">
        <div className="font-display font-black text-xl tracking-widest">LEADERBOARD</div>
        <div className="text-[10px] uppercase tracking-widest text-white/40">
          {source === "global" ? "global" : "local"}
        </div>
      </div>
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
