"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { HandLandmarker, HandLandmarkerResult } from "@mediapipe/tasks-vision";
import { GestureDetector, GestureSnapshot, HandLandmark } from "./gestureLogic";

/**
 * Loads MediaPipe Tasks Vision, runs HandLandmarker in VIDEO mode, classifies
 * each detected hand as "left" or "right" from the USER'S perspective, and
 * feeds both palm-center Y values per frame into the GestureDetector.
 *
 * Tracking point is the palm CENTER (centroid of landmarks 0, 5, 9, 13, 17 —
 * wrist + 4 MCP knuckles), not the wrist. The palm center is closer to the
 * actual mass of the hand, which is what the user sees flying around during
 * a fast 6-7. The wrist alone trails behind the visible hand and reads as
 * "lag" even when the model itself is keeping up.
 *
 * Per-hand velocity is tracked in normalized image units per millisecond and
 * exposed on the hands ref so the overlay can extrapolate the dot to "now"
 * — compensating for the ~20–30 ms between camera capture and overlay paint.
 */

const WASM_BASE =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task";

/**
 * MediaPipe Tasks Vision reports handedness from the user's perspective on
 * the raw video stream we hand it (the CSS `scale-x-[-1]` is display-only),
 * so its "Left"/"Right" already match the user's anatomical hands.
 */
function labelHand(
  palm: { x: number; y: number },
  raw: string | undefined,
): "left" | "right" {
  if (raw === "Left") return "left";
  if (raw === "Right") return "right";
  // No handedness for this frame — fall back to image x. In the raw
  // (unmirrored) image, a hand on the LEFT side (x<0.5) belongs to the
  // user's RIGHT hand under the selfie-mirror displayed to the user.
  return palm.x < 0.5 ? "right" : "left";
}

export interface UseHandTrackingOptions {
  enabled: boolean;
  videoRef: React.RefObject<HTMLVideoElement>;
  onRep?: (snapshot: GestureSnapshot) => void;
}

/** Tracked hand point + instantaneous velocity, used by the overlay for
 *  zero-lag extrapolation. */
export interface PalmPoint {
  /** Palm-center X in normalized image coords. */
  x: number;
  /** Palm-center Y in normalized image coords. */
  y: number;
  /** performance.now() timestamp this position was measured. */
  t: number;
  /** Velocity in normalized units per millisecond. */
  vx: number;
  vy: number;
}

export interface TrackedHands {
  left: HandLandmark[] | null;
  right: HandLandmark[] | null;
  /** Palm center + velocity for the user's left hand, or null if absent. */
  leftPalm: PalmPoint | null;
  /** Palm center + velocity for the user's right hand, or null if absent. */
  rightPalm: PalmPoint | null;
}

/** Palm-center landmarks cached for nearest-neighbour assignment across frames. */
interface PalmTrack {
  x: number;
  y: number;
  /** performance.now() timestamp the position was last updated. */
  t: number;
  /** EMA-smoothed velocity in normalized units per ms. */
  vx: number;
  vy: number;
}

/** EMA weight applied to each new instantaneous velocity sample. Lower = smoother
 *  but laggier reaction to direction changes. 0.4 keeps ~3 frames of history,
 *  enough to stop single-frame jitter from flinging the dot at swap turnarounds
 *  without smearing the response so much that the dot feels detached. */
const VELOCITY_EMA_ALPHA = 0.4;

/** How long a remembered palm position is allowed to influence assignment. */
const PALM_TRACK_TTL_MS = 800;

/** How long a hand can be undetected before we stop feeding its last-known Y
 *  into the gesture detector. Tuned to span MediaPipe's typical drop windows
 *  during fast 6-7 motion (often 200–400 ms when motion blur knocks tracking
 *  off) without bridging arbitrarily long disappearances. The detector rule
 *  (relative position flip) self-corrects on the next clean frame, so a stale
 *  Y can only over-count if it survives across a genuine pose change AND the
 *  visible hand crosses past the stale Y in the wrong direction — both rare. */
const STALE_Y_MAX_AGE_MS = 500;

/** MediaPipe hand landmarks that define the palm: wrist + 4 MCP knuckles.
 *  Their centroid sits near the geometric center of the hand and barely moves
 *  when fingers curl, so it's a much more stable tracking point than the wrist. */
const PALM_LANDMARKS = [0, 5, 9, 13, 17] as const;

function palmCenter(h: HandLandmark[]): { x: number; y: number } {
  let sx = 0;
  let sy = 0;
  for (const i of PALM_LANDMARKS) {
    sx += h[i].x;
    sy += h[i].y;
  }
  return { x: sx / PALM_LANDMARKS.length, y: sy / PALM_LANDMARKS.length };
}

const dist2 = (a: { x: number; y: number }, b: { x: number; y: number }) => {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
};

export function useHandTracking({ enabled, videoRef, onRep }: UseHandTrackingOptions) {
  const detectorRef = useRef<GestureDetector>(new GestureDetector());
  const landmarkerRef = useRef<HandLandmarker | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastVideoTimeRef = useRef(-1);
  // Last-known palm-center positions used for sticky left/right assignment
  // when MediaPipe's per-frame handedness flickers under fast motion.
  const lastLeftRef = useRef<PalmTrack | null>(null);
  const lastRightRef = useRef<PalmTrack | null>(null);
  // Per-frame hand landmarks live in a ref, NOT in React state, so the
  // overlay can paint at full camera framerate without paying for a render
  // cycle each frame (which would add ~16-50ms of perceived latency).
  const handsRef = useRef<TrackedHands>({
    left: null,
    right: null,
    leftPalm: null,
    rightPalm: null,
  });
  const lastSnapshotRef = useRef<GestureSnapshot | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<GestureSnapshot>(() =>
    detectorRef.current.snapshot(false, false)
  );

  useEffect(() => {
    detectorRef.current.onRep = onRep;
  }, [onRep]);

  const reset = useCallback(() => {
    detectorRef.current.reset();
    lastLeftRef.current = null;
    lastRightRef.current = null;
    handsRef.current = { left: null, right: null, leftPalm: null, rightPalm: null };
    const fresh = detectorRef.current.snapshot(false, false);
    lastSnapshotRef.current = fresh;
    setSnapshot(fresh);
  }, []);

  // Push snapshot to React state ONLY when a UI-visible field changes.
  // Per-frame churn in smoothedY values isn't user-visible — skipping it
  // saves a full render cycle every video frame.
  const publishSnapshot = useCallback((snap: GestureSnapshot) => {
    const prev = lastSnapshotRef.current;
    const changed =
      !prev ||
      prev.reps !== snap.reps ||
      prev.combo !== snap.combo ||
      prev.comboMultiplier !== snap.comboMultiplier ||
      prev.state !== snap.state ||
      prev.handVisible !== snap.handVisible ||
      prev.leftVisible !== snap.leftVisible ||
      prev.rightVisible !== snap.rightVisible;
    if (changed) {
      lastSnapshotRef.current = snap;
      setSnapshot(snap);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    (async () => {
      try {
        const vision = await import("@mediapipe/tasks-vision");
        const fileset = await vision.FilesetResolver.forVisionTasks(WASM_BASE);
        const landmarker = await vision.HandLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: MODEL_URL, delegate: "GPU" },
          runningMode: "VIDEO",
          // Require BOTH hands — strict alternation needs to see each wrist.
          numHands: 2,
          // Pushed well below MediaPipe's default 0.5 because fast 6-7 motion
          // blurs frames and the model's confidence collapses mid-swing. The
          // gesture detector only needs Y position (not landmark precision),
          // so trading accuracy for tracking stickiness is the right call —
          // losing the hand entirely costs us a missed rep, while a noisy
          // landmark just produces a slightly wobbly Y that the swap rule
          // shrugs off.
          minHandDetectionConfidence: 0.1,
          minHandPresenceConfidence: 0.1,
          minTrackingConfidence: 0.1,
        });
        if (cancelled) {
          landmarker.close();
          return;
        }
        landmarkerRef.current = landmarker;
        setReady(true);

        const loop = () => {
          if (cancelled) return;
          const video = videoRef.current;
          const lm = landmarkerRef.current;
          if (video && lm && video.readyState >= 2 && !video.paused) {
            const t = performance.now();
            if (video.currentTime !== lastVideoTimeRef.current) {
              lastVideoTimeRef.current = video.currentTime;
              try {
                const res: HandLandmarkerResult = lm.detectForVideo(video, t);
                const lms = (res.landmarks ?? []) as HandLandmark[][];
                const hd = res.handedness ?? [];

                // Expire stale palm tracks so a long disappearance can't
                // misclassify a hand that reappeared somewhere unexpected.
                if (lastLeftRef.current && t - lastLeftRef.current.t > PALM_TRACK_TTL_MS) {
                  lastLeftRef.current = null;
                }
                if (lastRightRef.current && t - lastRightRef.current.t > PALM_TRACK_TTL_MS) {
                  lastRightRef.current = null;
                }

                let leftHand: HandLandmark[] | null = null;
                let rightHand: HandLandmark[] | null = null;
                // Pre-compute palm centers once per detected hand — used for
                // assignment, velocity tracking, and the gesture detector.
                const palms = lms.map((h) => palmCenter(h));

                if (lms.length === 2) {
                  // Two hands detected — assign by minimum total distance to
                  // last-known positions when available; otherwise fall back to
                  // MediaPipe handedness, then to image x-position.
                  const p0 = palms[0];
                  const p1 = palms[1];
                  const pl = lastLeftRef.current;
                  const pr = lastRightRef.current;
                  if (pl && pr) {
                    const same = dist2(p0, pl) + dist2(p1, pr);
                    const swap = dist2(p0, pr) + dist2(p1, pl);
                    if (same <= swap) { leftHand = lms[0]; rightHand = lms[1]; }
                    else { leftHand = lms[1]; rightHand = lms[0]; }
                  } else {
                    for (let i = 0; i < 2; i++) {
                      const label = labelHand(palms[i], hd[i]?.[0]?.categoryName);
                      if (label === "left" && !leftHand) leftHand = lms[i];
                      else if (label === "right" && !rightHand) rightHand = lms[i];
                    }
                    // If both ended up on the same side, split by image x.
                    if (!leftHand || !rightHand) {
                      const idx = palms[0].x <= palms[1].x ? [0, 1] : [1, 0];
                      // raw image: smaller x = user's right hand
                      rightHand = lms[idx[0]];
                      leftHand = lms[idx[1]];
                    }
                  }
                } else if (lms.length === 1) {
                  // One hand — prefer last-known nearest, then handedness.
                  const p = palms[0];
                  const pl = lastLeftRef.current;
                  const pr = lastRightRef.current;
                  if (pl && pr) {
                    if (dist2(p, pl) <= dist2(p, pr)) leftHand = lms[0];
                    else rightHand = lms[0];
                  } else if (pl) {
                    leftHand = lms[0];
                  } else if (pr) {
                    rightHand = lms[0];
                  } else {
                    const label = labelHand(p, hd[0]?.[0]?.categoryName);
                    if (label === "left") leftHand = lms[0];
                    else rightHand = lms[0];
                  }
                }

                // Resolve the palm center belonging to each assigned hand.
                const leftPalm = leftHand ? palms[lms.indexOf(leftHand)] : null;
                const rightPalm = rightHand ? palms[lms.indexOf(rightHand)] : null;

                // Velocity = (current - last) / dt, smoothed with an EMA over
                // recent frames. Used by the overlay to extrapolate the dot
                // forward by inference latency. Smoothing matters most at 6-7
                // swap turnarounds, where instantaneous velocity flips sign and
                // a raw single-frame estimate would fling the dot past the turn.
                const computeVel = (
                  cur: { x: number; y: number } | null,
                  prev: PalmTrack | null,
                ) => {
                  if (!cur || !prev) return { vx: 0, vy: 0 };
                  const dt = t - prev.t;
                  if (dt <= 0 || dt > 100) return { vx: 0, vy: 0 };
                  const instVx = (cur.x - prev.x) / dt;
                  const instVy = (cur.y - prev.y) / dt;
                  const a = VELOCITY_EMA_ALPHA;
                  return {
                    vx: a * instVx + (1 - a) * prev.vx,
                    vy: a * instVy + (1 - a) * prev.vy,
                  };
                };
                const leftVel = computeVel(leftPalm, lastLeftRef.current);
                const rightVel = computeVel(rightPalm, lastRightRef.current);

                // Snapshot prior tracks before they're overwritten — used below
                // to fill in a stale Y for whichever hand MediaPipe dropped this
                // frame, so the gesture detector can still see a swap when the
                // visible hand crosses the missing hand's last-known position.
                const priorLeft = lastLeftRef.current;
                const priorRight = lastRightRef.current;

                if (leftPalm) {
                  lastLeftRef.current = { x: leftPalm.x, y: leftPalm.y, t, vx: leftVel.vx, vy: leftVel.vy };
                }
                if (rightPalm) {
                  lastRightRef.current = { x: rightPalm.x, y: rightPalm.y, t, vx: rightVel.vx, vy: rightVel.vy };
                }

                // Synchronous ref update — overlay reads this without waiting
                // for a React render.
                handsRef.current = {
                  left: leftHand,
                  right: rightHand,
                  leftPalm: leftPalm
                    ? { x: leftPalm.x, y: leftPalm.y, t, vx: leftVel.vx, vy: leftVel.vy }
                    : null,
                  rightPalm: rightPalm
                    ? { x: rightPalm.x, y: rightPalm.y, t, vx: rightVel.vx, vy: rightVel.vy }
                    : null,
                };

                // If a hand is undetected this frame but was seen recently,
                // feed its last-known Y to the detector. Mid-swap motion blur
                // drops the fast-moving hand for 1–3 frames; without this the
                // rep stalls until re-acquisition and lands ~30–80 ms late.
                const fallbackY = (
                  current: { y: number } | null,
                  prior: PalmTrack | null,
                ) => {
                  if (current) return current.y;
                  if (prior && t - prior.t < STALE_Y_MAX_AGE_MS) return prior.y;
                  return null;
                };
                const snap = detectorRef.current.update({
                  rightY: fallbackY(rightPalm, priorRight),
                  leftY: fallbackY(leftPalm, priorLeft),
                  t,
                });
                publishSnapshot(snap);
              } catch (e) {
                // eslint-disable-next-line no-console
                console.warn("handLandmarker.detectForVideo", e);
              }
            }
          }
          rafRef.current = requestAnimationFrame(loop);
        };
        rafRef.current = requestAnimationFrame(loop);
      } catch (e: any) {
        // eslint-disable-next-line no-console
        console.error("Hand tracking init failed", e);
        setError(e?.message ?? "Failed to load hand tracker");
      }
    })();

    return () => {
      cancelled = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      if (landmarkerRef.current) {
        try { landmarkerRef.current.close(); } catch {}
        landmarkerRef.current = null;
      }
      setReady(false);
    };
  }, [enabled, videoRef]);

  return { ready, error, snapshot, reset, detector: detectorRef, handsRef };
}
