/**
 * 6-7 Gesture Detector — alternating two-hand state machine with role reversal.
 * ---------------------------------------------------------------------------
 * Rep rule:
 *   • One wrist crosses one boundary (top or bottom).
 *   • The OTHER wrist then crosses the OPPOSITE boundary.
 *   • Together that completes one rep.
 *
 * Alternation rule (kicks in after rep 1):
 *   • The wrist that crossed TOP last rep must next cross BOTTOM.
 *   • The wrist that crossed BOTTOM last rep must next cross TOP.
 *   Any edge that violates this is ignored — it cannot count toward a rep.
 *
 * Within a single rep, the two halves can arrive in either order; we just
 * require: different wrists, opposite boundaries.
 *
 * Robustness (each is REQUIRED, not optional):
 *   • EDGE detection — we fire a crossing event only on the frame where the
 *     wrist TRANSITIONED across the boundary (previous frame on one side,
 *     current frame on the other). Level-based hovering produces zero events.
 *   • PER-EDGE DEBOUNCE (EDGE_DEBOUNCE_MS): the same wrist+boundary edge
 *     cannot fire twice within the window, so jitter around a threshold
 *     can never multi-trigger.
 *   • EMA SMOOTHING of wrist Y values before any threshold check.
 *   • TIMEOUT RESET: if the second half of a rep doesn't arrive within
 *     STATE_TIMEOUT_MS, we drop the pending half and break the combo.
 *     The role-reversal expectation from the LAST COMPLETED rep is preserved.
 *   • MISSING-HAND TOLERANCE: null inputs are treated as "no new sample" —
 *     EMA and prev-Y are frozen for that hand, no phantom edges.
 *   • STRICT MATCHING: a wrong-hand / wrong-boundary event is ignored and
 *     logged, never partially advances the machine.
 */

export type Wrist = "left" | "right";
export type Boundary = "top" | "bottom";

export type GestureState = "WAIT_FIRST_HALF" | "WAIT_SECOND_HALF";

/** Which wrist must cross which boundary this rep, once alternation is established. */
interface ExpectedAssignment {
  topWrist: Wrist;
  bottomWrist: Wrist;
}

interface PendingEdge {
  wrist: Wrist;
  boundary: Boundary;
}

const otherWrist = (w: Wrist): Wrist => (w === "left" ? "right" : "left");
const otherBoundary = (b: Boundary): Boundary => (b === "top" ? "bottom" : "top");

export interface GestureConfigShape {
  /** Y above this = "TOP zone" (remember: in normalized image coords, 0 is top). */
  TOP_Y: number;
  /** Y below this = "BOTTOM zone". */
  BOTTOM_Y: number;
  /** Per-edge debounce — a given wrist+boundary edge cannot re-fire within this window. */
  EDGE_DEBOUNCE_MS: number;
  /** If a started rep doesn't complete within this, drop the pending half and break combo. */
  STATE_TIMEOUT_MS: number;
  /** If a wrist hasn't been seen for this long, treat the next sighting as a fresh start
   *  (no phantom edge from a stale prev-Y left over from before it went off-screen). */
  OFFSCREEN_RESUME_MS: number;
  /** Exponential-moving-average alpha applied to wrist Y (higher = snappier). */
  EMA_ALPHA: number;
  /** Window in which consecutive reps extend the combo counter (UI flair). */
  COMBO_WINDOW_MS: number;
}

export const GestureConfig: GestureConfigShape = {
  TOP_Y: 0.35,
  BOTTOM_Y: 0.65,
  EDGE_DEBOUNCE_MS: 150,
  OFFSCREEN_RESUME_MS: 150,
  STATE_TIMEOUT_MS: 1500,
  // Near-passthrough: this is a speed contest, so we eat almost no
  // smoothing latency. Per-edge debounce handles hover jitter; landmark
  // spikes are rare enough to ignore.
  EMA_ALPHA: 0.9,
  COMBO_WINDOW_MS: 900,
};

export interface GestureTick {
  /** Y of the user's RIGHT wrist this frame, or null if the hand is not visible. */
  rightY: number | null;
  /** Y of the user's LEFT wrist this frame, or null if the hand is not visible. */
  leftY: number | null;
  /** performance.now() timestamp for this frame. */
  t: number;
}

export interface GestureLogEntry {
  t: number;
  msg: string;
}

export interface GestureSnapshot {
  reps: number;
  combo: number;
  comboMultiplier: number;
  lastEventAt: number;
  state: GestureState;
  /** At least one wrist visible this frame. */
  handVisible: boolean;
  leftVisible: boolean;
  rightVisible: boolean;
  /** EMA-smoothed values for on-screen debug rendering. */
  smoothedLeftY: number | null;
  smoothedRightY: number | null;
  /** Rolling transition log (newest last). */
  log: GestureLogEntry[];
}

/** Hand landmark type — kept for WebcamView overlay rendering. */
export interface HandLandmark {
  x: number;
  y: number;
  z?: number;
}

const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));
const LOG_CAP = 16;

export class GestureDetector {
  // --- state ---
  private state: GestureState = "WAIT_FIRST_HALF";
  private stateEnteredAt = 0;
  /** First half of the current rep, captured but not yet completed. */
  private pending: PendingEdge | null = null;
  /** After rep 1, what wrist must cross top vs. bottom this rep. Null only before first rep. */
  private expected: ExpectedAssignment | null = null;

  // --- score / combo (UI) ---
  private reps = 0;
  private combo = 0;
  private comboExpiresAt = 0;
  private lastEventAt = 0;

  // --- smoothing: EMA-filtered wrist Y values ---
  private smoothedLeft: number | null = null;
  private smoothedRight: number | null = null;

  // --- edge detection: previous frame's smoothed Y ---
  private prevLeft: number | null = null;
  private prevRight: number | null = null;

  // --- per-wrist last-sample timestamps for off-screen resume detection ---
  private lastLeftSampleAt = 0;
  private lastRightSampleAt = 0;

  // --- per-edge debounce (four possible edges) ---
  private lastEdgeAt: Record<`${Wrist}-${Boundary}`, number> = {
    "right-top": 0,
    "right-bottom": 0,
    "left-top": 0,
    "left-bottom": 0,
  };

  // --- log ring buffer ---
  private log: GestureLogEntry[] = [];

  public onRep?: (snapshot: GestureSnapshot) => void;
  public onLog?: (entry: GestureLogEntry) => void;

  constructor(private readonly config: GestureConfigShape = { ...GestureConfig }) {}

  configure(partial: Partial<GestureConfigShape>) {
    Object.assign(this.config, partial);
  }

  reset() {
    this.state = "WAIT_FIRST_HALF";
    this.stateEnteredAt = 0;
    this.pending = null;
    this.expected = null;
    this.reps = 0;
    this.combo = 0;
    this.comboExpiresAt = 0;
    this.lastEventAt = 0;
    this.smoothedLeft = this.smoothedRight = null;
    this.prevLeft = this.prevRight = null;
    this.lastLeftSampleAt = 0;
    this.lastRightSampleAt = 0;
    this.lastEdgeAt = { "right-top": 0, "right-bottom": 0, "left-top": 0, "left-bottom": 0 };
    this.log = [];
    this.pushLog(0, "reset → WAIT_FIRST_HALF");
  }

  /**
   * Feed one detection frame. Missing hands pass `null` for that wrist.
   */
  update(tick: GestureTick): GestureSnapshot {
    const { rightY, leftY, t } = tick;
    const cfg = this.config;

    // --- 1. EMA SMOOTHING (only where a fresh sample exists) ---
    // If a wrist disappeared (off-screen) for longer than OFFSCREEN_RESUME_MS,
    // we snap smoothed/prev to the new sample so the resume frame cannot fire
    // a phantom edge driven by stale prev-Y from before the disappearance.
    if (rightY != null) {
      const y = clamp(rightY, 0, 1);
      const gap = this.lastRightSampleAt > 0 ? t - this.lastRightSampleAt : 0;
      if (this.smoothedRight == null) {
        this.smoothedRight = y;
      } else if (gap > cfg.OFFSCREEN_RESUME_MS) {
        this.smoothedRight = y;
        this.prevRight = y;
        this.pushLog(t, `right wrist resumed after ${gap.toFixed(0)}ms — snap`);
      } else {
        this.smoothedRight = this.smoothedRight * (1 - cfg.EMA_ALPHA) + y * cfg.EMA_ALPHA;
      }
      this.lastRightSampleAt = t;
    }
    if (leftY != null) {
      const y = clamp(leftY, 0, 1);
      const gap = this.lastLeftSampleAt > 0 ? t - this.lastLeftSampleAt : 0;
      if (this.smoothedLeft == null) {
        this.smoothedLeft = y;
      } else if (gap > cfg.OFFSCREEN_RESUME_MS) {
        this.smoothedLeft = y;
        this.prevLeft = y;
        this.pushLog(t, `left wrist resumed after ${gap.toFixed(0)}ms — snap`);
      } else {
        this.smoothedLeft = this.smoothedLeft * (1 - cfg.EMA_ALPHA) + y * cfg.EMA_ALPHA;
      }
      this.lastLeftSampleAt = t;
    }

    // --- 2. TIMEOUT RESET — pending half didn't get its partner in time ---
    if (
      this.state === "WAIT_SECOND_HALF" &&
      this.stateEnteredAt > 0 &&
      t - this.stateEnteredAt > cfg.STATE_TIMEOUT_MS
    ) {
      this.pushLog(t, `timeout after ${cfg.STATE_TIMEOUT_MS}ms → WAIT_FIRST_HALF`);
      this.state = "WAIT_FIRST_HALF";
      this.stateEnteredAt = t;
      this.pending = null;
      this.combo = 0;
      // Freeze prev to current smoothed so the first post-reset frame
      // doesn't generate a phantom edge from a stale comparison.
      this.prevLeft = this.smoothedLeft;
      this.prevRight = this.smoothedRight;
    }

    // --- 3. EDGE DETECTION — all four wrist+boundary edges feed handleEdge ---
    this.checkEdge("right", "top", this.prevRight, this.smoothedRight, t);
    this.checkEdge("right", "bottom", this.prevRight, this.smoothedRight, t);
    this.checkEdge("left", "top", this.prevLeft, this.smoothedLeft, t);
    this.checkEdge("left", "bottom", this.prevLeft, this.smoothedLeft, t);

    // --- 4. Advance prev only where we had a fresh sample this frame ---
    if (rightY != null) this.prevRight = this.smoothedRight;
    if (leftY != null) this.prevLeft = this.smoothedLeft;

    // --- 5. Combo expiry (cosmetic) ---
    if (this.combo > 0 && t > this.comboExpiresAt) this.combo = 0;

    return this.snapshot(rightY != null, leftY != null);
  }

  private checkEdge(wrist: Wrist, boundary: Boundary, prev: number | null, now: number | null, t: number) {
    if (!crossedInto(boundary, prev, now, this.config)) return;
    const key = `${wrist}-${boundary}` as const;
    if (t - this.lastEdgeAt[key] < this.config.EDGE_DEBOUNCE_MS) {
      this.pushLog(t, `debounced ${wrist}→${boundary}`);
      return;
    }
    this.lastEdgeAt[key] = t;
    this.handleEdge(wrist, boundary, t);
  }

  /** Handle a crossing event against the state machine. */
  private handleEdge(wrist: Wrist, boundary: Boundary, t: number) {
    // After rep 1: only the two edges that match this rep's role assignment count.
    if (this.expected) {
      const requiredWrist = boundary === "top" ? this.expected.topWrist : this.expected.bottomWrist;
      if (wrist !== requiredWrist) {
        this.pushLog(t, `ignored ${wrist}→${boundary} (alternation: need ${requiredWrist}→${boundary})`);
        return;
      }
    }

    if (this.state === "WAIT_FIRST_HALF") {
      this.pending = { wrist, boundary };
      this.state = "WAIT_SECOND_HALF";
      this.stateEnteredAt = t;
      this.pushLog(t, `${wrist.toUpperCase()}→${boundary.toUpperCase()} (first half) → WAIT_SECOND_HALF`);
      return;
    }

    // WAIT_SECOND_HALF — must be the OTHER wrist on the OPPOSITE boundary.
    const p = this.pending!;
    if (wrist !== otherWrist(p.wrist) || boundary !== otherBoundary(p.boundary)) {
      this.pushLog(
        t,
        `ignored ${wrist}→${boundary} (need ${otherWrist(p.wrist)}→${otherBoundary(p.boundary)})`,
      );
      return;
    }

    // Valid completion — score it.
    const topWrist: Wrist = boundary === "top" ? wrist : p.wrist;
    const bottomWrist: Wrist = boundary === "bottom" ? wrist : p.wrist;
    this.reps += 1;
    if (t < this.comboExpiresAt) this.combo += 1;
    else this.combo = 1;
    this.comboExpiresAt = t + this.config.COMBO_WINDOW_MS;
    this.lastEventAt = t;
    // Next rep must reverse roles.
    this.expected = { topWrist: bottomWrist, bottomWrist: topWrist };
    this.pending = null;
    this.state = "WAIT_FIRST_HALF";
    this.stateEnteredAt = t;
    this.pushLog(
      t,
      `${wrist.toUpperCase()}→${boundary.toUpperCase()} ✓ rep=${this.reps} ` +
        `next: top=${this.expected.topWrist} bottom=${this.expected.bottomWrist}`,
    );
    this.onRep?.(this.snapshot(true, true));
  }

  private pushLog(t: number, msg: string) {
    const entry = { t, msg };
    this.log.push(entry);
    if (this.log.length > LOG_CAP) this.log.shift();
    this.onLog?.(entry);
    // Console trace for deterministic debugging
    if (typeof console !== "undefined") {
      // eslint-disable-next-line no-console
      console.log(`[6-7 gesture @${t.toFixed(0)}] ${msg}`);
    }
  }

  private comboMultiplier(): number {
    if (this.combo >= 20) return 4;
    if (this.combo >= 10) return 3;
    if (this.combo >= 5) return 2;
    return 1;
  }

  snapshot(rightVisible: boolean, leftVisible: boolean): GestureSnapshot {
    return {
      reps: this.reps,
      combo: this.combo,
      comboMultiplier: this.comboMultiplier(),
      lastEventAt: this.lastEventAt,
      state: this.state,
      handVisible: rightVisible || leftVisible,
      rightVisible,
      leftVisible,
      smoothedLeftY: this.smoothedLeft,
      smoothedRightY: this.smoothedRight,
      log: this.log.slice(),
    };
  }

  get score(): number {
    return this.reps;
  }
}

/**
 * Return true when y CROSSED INTO the given zone between prev and now.
 *   "top" zone:    y < TOP_Y  → requires prev >= TOP_Y and now < TOP_Y
 *   "bottom" zone: y > BOTTOM_Y → requires prev <= BOTTOM_Y and now > BOTTOM_Y
 * Returns false when prev is null (no baseline yet) or the sample vanished.
 */
function crossedInto(
  zone: Boundary,
  prev: number | null,
  now: number | null,
  cfg: GestureConfigShape
): boolean {
  if (prev == null || now == null) return false;
  if (zone === "top") return prev >= cfg.TOP_Y && now < cfg.TOP_Y;
  return prev <= cfg.BOTTOM_Y && now > cfg.BOTTOM_Y;
}
