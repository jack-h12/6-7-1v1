"use client";

import { useEffect, useRef } from "react";
import { useSound } from "./SoundToggle";

const SRC = "/Skrilla - Doot Doot (6 7) (Official Music Video).mp3";
const START_AT = 16;

export function HomeSong() {
  const { on } = useSound();
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    // Media-fragment URI: the browser starts playback at 16s natively, before
    // any JS seek runs. This is the only approach that reliably starts at 16s
    // on iOS Safari, where setting currentTime is a no-op until metadata
    // loads, and metadata only loads after the gesture-triggered play().
    const a = new Audio(`${SRC}#t=${START_AT}`);
    a.preload = "auto";
    a.volume = 0.5;
    audioRef.current = a;

    // Defensive fallback for any browser that ignores the media fragment:
    // if playback begins at ~0, snap forward once metadata is available.
    const ensureStart = () => {
      if (a.readyState < 1) return;
      if (a.currentTime < START_AT - 0.5) {
        try { a.currentTime = START_AT; } catch {}
      }
    };
    a.addEventListener("loadedmetadata", ensureStart);
    a.addEventListener("playing", ensureStart);

    // Loop back to 0:16 instead of 0:00.
    a.loop = false;
    const onEnded = () => {
      try {
        a.currentTime = START_AT;
        a.play().catch(() => {});
      } catch {}
    };
    a.addEventListener("ended", onEnded);

    const tryPlay = () => {
      const audio = audioRef.current;
      if (!audio) return;
      audio.play().catch(() => {});
    };

    tryPlay();

    // Fallback: most browsers block autoplay until a user gesture.
    const onGesture = () => {
      tryPlay();
      window.removeEventListener("pointerdown", onGesture);
      window.removeEventListener("keydown", onGesture);
    };
    window.addEventListener("pointerdown", onGesture);
    window.addEventListener("keydown", onGesture);

    return () => {
      a.removeEventListener("loadedmetadata", ensureStart);
      a.removeEventListener("playing", ensureStart);
      a.removeEventListener("ended", onEnded);
      window.removeEventListener("pointerdown", onGesture);
      window.removeEventListener("keydown", onGesture);
      a.pause();
      audioRef.current = null;
    };
  }, []);

  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    if (on) {
      a.muted = false;
      a.play().catch(() => {});
    } else {
      a.muted = true;
    }
  }, [on]);

  return null;
}
