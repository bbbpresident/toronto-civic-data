import type { Level } from "@/lib/today";

// 416's scoring and tiers, shared by the game (client) and its page (server). Type-only import of
// Level, so this module stays free of the question bank's datasets.

// ── Scoring: up to 1,000 a question, 4,000 a day ────────────────────────────

export const MAX = 4000;

/** Level 1 is scored on distance (each 0.5 off costs 100 points). The others on ratio, because being off
 *  by 50 means little at 5,000 and a lot at 60; the ratio that bottoms out at 1 point widens with the
 *  range (3× off at level 2, 4× at 3, 6× at 4, 10× at 5). No answer (time ran out, nothing entered) scores 0. */
export const BOTTOM: Record<Exclude<Level, 1>, number> = { 2: 3, 3: 4, 4: 6, 5: 10 };

export function score(level: Level, guess: number | null, answer: number): number {
  if (guess == null) return 0;
  const raw = level === 1
    ? 1000 - 200 * Math.abs(guess - answer)
    : 1000 - (999 * Math.abs(Math.log(guess / answer))) / Math.log(BOTTOM[level]);
  return Math.min(1000, Math.max(1, Math.round(raw)));
}

export const mark = (s: number) => (s >= 950 ? "🎯" : s >= 750 ? "🟩" : s >= 450 ? "🟨" : s > 0 ? "🟥" : "⬛");

// ── Time: a speed multiplier on the accuracy points ─────────────────────────

/** Finish with FREE_SECONDS or more left (all four in 40 seconds) and you keep every point. After that each
 *  second costs 1.25%, down to ×0.75 if the clock runs out. So 4,000 is reachable; time only takes away. */
export const FREE_SECONDS = 20, SLOWEST = 0.75;
export const speedOf = (secondsLeft: number) =>
  secondsLeft >= FREE_SECONDS ? 1 : SLOWEST + (1 - SLOWEST) * Math.max(0, secondsLeft) / FREE_SECONDS;
/** Points lost to time (zero or negative). */
export const timePenalty = (secondsLeft: number, accuracy: number) => Math.round(accuracy * speedOf(secondsLeft)) - accuracy;

/** The day's tier by total score (out of 4,000), in the user's words (2026-11-02): the bottom ones roast you, the top ones hype you up. */
export const TIERS: { min: number; name: string; line: string }[] = [
  { min: 3600, name: "????", line: "olivia chow said come reach. you da next mayor fo sho" },
  { min: 3000, name: "wallahi", line: "that's how you're moving? sheeeesh" },
  { min: 2400, name: "say less", line: "my man with the literacy still" },
  { min: 1600, name: "lowkey a baddie", line: "you're out here lookin sweet. keep doing you." },
  { min: 800, name: "you finna link up?", line: "at the library. phone down. notebook out. educate yourself brudda" },
  { min: 0, name: "dunno fam", line: "I do not know you, and you don't know shit. excuse yourself." },
];
export const tierOf = (total: number) => TIERS.find(t => total >= t.min)!;


// ── Map question ─────────────────────────────────────────────────────

/** 1,000 within 150 m (or anywhere inside an area); then it falls off with distance: ~780 at 1 km, ~370 at 4 km, ~80 at 10 km. */
export function mapScore(km: number | null): number {
  if (km == null) return 0;
  if (km <= 0.15) return 1000;
  return Math.max(1, Math.round(1000 * Math.exp(-km / 4)));
}

type Pt = [number, number];

function inRing(p: Pt, ring: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > p[1]) !== (yj > p[1]) && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** The point of a place nearest a guess (the guess itself when it's inside an outline), and the distance to it in map units. */
export function nearest(guess: Pt, place: { point?: Pt; rings?: Pt[][] }): { at: Pt; d: number } {
  if (place.point) return { at: place.point, d: Math.hypot(guess[0] - place.point[0], guess[1] - place.point[1]) };
  const rings = place.rings ?? [];
  if (rings.some(r => inRing(guess, r))) return { at: guess, d: 0 };
  let best = { at: guess, d: Infinity };
  for (const r of rings) for (let i = 1; i < r.length; i++) {
    const a = r[i - 1], b = r[i], dx = b[0] - a[0], dy = b[1] - a[1];
    const t = Math.max(0, Math.min(1, ((guess[0] - a[0]) * dx + (guess[1] - a[1]) * dy) / ((dx * dx + dy * dy) || 1)));
    const at: Pt = [a[0] + t * dx, a[1] + t * dy], d = Math.hypot(guess[0] - at[0], guess[1] - at[1]);
    if (d < best.d) best = { at, d };
  }
  return best;
}

/** Distance in map units from a guess to a place: to its point, or 0 inside its outline / to the nearest edge. */
export function distanceTo(guess: Pt, place: { point?: Pt; rings?: Pt[][] }): number {
  return nearest(guess, place).d;
}
