/**
 * 6-7 Gesture Detector — relative-position counter.
 * ---------------------------------------------------------------------------
 * Rep rule:
 *   • Both hands visible. The "higher" hand is the one whose center Y is
 *     smaller. A rep is counted each time the higher hand SWAPS, provided the
 *     vertical separation at the moment of the swap is at least MIN_SEPARATION.
 *   • Holding the same configuration does not double-count; only the swap.
 *
 * Why relative instead of fixed TOP/BOTTOM zones: fast motion blurs the
 * landmarks and the hands often don't sit in any one zone long enough for a
 * fixed-zone check to fire. Relative position fires the moment the scales tip
 * the other way, which is what the user actually does on each rep.
 *
 * The TOP_Y / BOTTOM_Y values are kept for the on-screen guide rails only.
 */

export type Wrist = "left" | "right";
export type Boundary = "top" | "bottom";

/** Kept for type compatibility with consumers; detector is always IDLE now. */
export type GestureState = "IDLE" | "ARMED";

export interface GestureConfigShape {
  /** Y above this = "TOP zone" — kept only for the on-screen guide rails. */
  TOP_Y: number;
  /** Y below this = "BOTTOM zone" — kept only for the on-screen guide rails. */
  BOTTOM_Y: number;
  /** Retained for back-compat; unused. */
  EDGE_DEBOUNCE_MS: number;
  /** If a wrist hasn't been seen for this long, treat the next sighting as a fresh start. */
  OFFSCREEN_RESUME_MS: number;
  /** EMA alpha applied to wrist Y (1 = no smoothing, just passthrough). */
  EMA_ALPHA: number;
  /** Window in which consecutive reps extend the combo counter (UI flair). */
  COMBO_WINDOW_MS: number;
  /**
   * Minimum vertical distance between the two hand centers (normalized image
   * coords) required at the moment of a swap for it to count as a rep.
   * Prevents jitter from registering when hands are at nearly equal height.
   */
  MIN_SEPARATION: number;
  /**
   * Minimum time between counted reps. A natural fast 6-7 is ~5–7 reps/sec,
   * so 80 ms keeps the cap above hand-speed without admitting jitter bursts.
   */
  MIN_REP_INTERVAL_MS: number;
}

export const GestureConfig: GestureConfigShape = {
  TOP_Y: 0.35,
  BOTTOM_Y: 0.65,
  EDGE_DEBOUNCE_MS: 50,
  OFFSCREEN_RESUME_MS: 150,
  EMA_ALPHA: 1.0,
  COMBO_WINDOW_MS: 900,
  MIN_SEPARATION: 0.08,
  MIN_REP_INTERVAL_MS: 80,
};

export interface GestureTick {
  /** Smallest (highest on screen) landmark Y of the right hand, or null if absent. */
  rightMinY: number | null;
  /** Largest (lowest on screen) landmark Y of the right hand, or null if absent. */
  rightMaxY: number | null;
  leftMinY: number | null;
  leftMaxY: number | null;
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
  handVisible: boolean;
  leftVisible: boolean;
  rightVisible: boolean;
  smoothedLeftY: number | null;
  smoothedRightY: number | null;
  log: GestureLogEntry[];
}

export interface HandLandmark {
  x: number;
  y: number;
  z?: number;
}

const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));
const LOG_CAP = 16;

export class GestureDetector {
  // --- score / combo (UI) ---
  private reps = 0;
  private combo = 0;
  private comboExpiresAt = 0;
  private lastEventAt = 0;

  // --- latest per-hand vertical extents (any landmark) ---
  private leftMinY: number | null = null;
  private leftMaxY: number | null = null;
  private rightMinY: number | null = null;
  private rightMaxY: number | null = null;

  // --- which hand was on top at the last frame where both were visible ---
  // Used to detect SWAPS (transitions). Null when we have no prior reading.
  private prevHigher: Wrist | null = null;
  // --- timestamp of the last counted rep (for MIN_REP_INTERVAL_MS) ---
  private lastRepAt = 0;

  // --- log ring buffer ---
  private log: GestureLogEntry[] = [];

  public onRep?: (snapshot: GestureSnapshot) => void;
  public onLog?: (entry: GestureLogEntry) => void;

  constructor(private readonly config: GestureConfigShape = { ...GestureConfig }) {}

  configure(partial: Partial<GestureConfigShape>) {
    Object.assign(this.config, partial);
  }

  reset() {
    this.reps = 0;
    this.combo = 0;
    this.comboExpiresAt = 0;
    this.lastEventAt = 0;
    this.leftMinY = this.leftMaxY = this.rightMinY = this.rightMaxY = null;
    this.prevHigher = null;
    this.lastRepAt = 0;
    this.log = [];
    this.pushLog(0, "reset");
  }

  update(tick: GestureTick): GestureSnapshot {
    const { rightMinY, rightMaxY, leftMinY, leftMaxY, t } = tick;
    this.rightMinY = rightMinY != null ? clamp(rightMinY, 0, 1) : null;
    this.rightMaxY = rightMaxY != null ? clamp(rightMaxY, 0, 1) : null;
    this.leftMinY = leftMinY != null ? clamp(leftMinY, 0, 1) : null;
    this.leftMaxY = leftMaxY != null ? clamp(leftMaxY, 0, 1) : null;

    this.checkSwap(t);

    if (this.combo > 0 && t > this.comboExpiresAt) this.combo = 0;

    const rightVisible = rightMinY != null;
    const leftVisible = leftMinY != null;
    return this.snapshot(rightVisible, leftVisible);
  }

  private checkSwap(t: number) {
    const lMin = this.leftMinY;
    const lMax = this.leftMaxY;
    const rMin = this.rightMinY;
    const rMax = this.rightMaxY;
    if (lMin == null || lMax == null || rMin == null || rMax == null) {
      // Don't reset prevHigher on a single missing frame — under fast motion
      // MediaPipe drops a hand briefly, and forgetting which side was higher
      // would let the next visible swap go uncounted (or double-counted).
      return;
    }
    // Hand "center" Y = midpoint of its vertical extent. Robust to which
    // landmark happens to be highest/lowest each frame.
    const leftY = (lMin + lMax) / 2;
    const rightY = (rMin + rMax) / 2;
    const sep = Math.abs(leftY - rightY);
    const cfg = this.config;

    // Determine current "higher" hand. With low separation we can't tell, so
    // we don't update prevHigher — that way the next clear pose is judged
    // against the last clear pose, not against an ambiguous middle frame.
    if (sep < cfg.MIN_SEPARATION) return;
    const currentHigher: Wrist = leftY < rightY ? "left" : "right";

    if (this.prevHigher == null) {
      // First clear reading — establish baseline without scoring.
      this.prevHigher = currentHigher;
      return;
    }
    if (currentHigher === this.prevHigher) return;

    // Rate-limit: prevents jitter bursts from inflating the counter beyond
    // physically plausible hand speed.
    if (t - this.lastRepAt < cfg.MIN_REP_INTERVAL_MS) {
      this.prevHigher = currentHigher;
      return;
    }

    this.reps += 1;
    this.lastRepAt = t;
    if (t < this.comboExpiresAt) this.combo += 1;
    else this.combo = 1;
    this.comboExpiresAt = t + cfg.COMBO_WINDOW_MS;
    this.lastEventAt = t;
    this.prevHigher = currentHigher;
    this.pushLog(
      t,
      `rep=${this.reps} ✓ (higher=${currentHigher}, sep=${sep.toFixed(2)})`,
    );
    this.onRep?.(this.snapshot(true, true));
  }

  private pushLog(t: number, msg: string) {
    const entry = { t, msg };
    this.log.push(entry);
    if (this.log.length > LOG_CAP) this.log.shift();
    this.onLog?.(entry);
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
      state: "IDLE",
      handVisible: rightVisible || leftVisible,
      rightVisible,
      leftVisible,
      smoothedLeftY:
        this.leftMinY != null && this.leftMaxY != null
          ? (this.leftMinY + this.leftMaxY) / 2
          : null,
      smoothedRightY:
        this.rightMinY != null && this.rightMaxY != null
          ? (this.rightMinY + this.rightMaxY) / 2
          : null,
      log: this.log.slice(),
    };
  }

  get score(): number {
    return this.reps;
  }
}
