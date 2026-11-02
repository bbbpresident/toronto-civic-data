import type { Level } from "@/lib/today";

// TOday's scoring and tiers, shared by the game (client) and its page (server). Type-only import of
// Level, so this module stays free of the question bank's datasets.

// ── Scoring: 1–1,000 a question, 5,000 a day ────────────────────────────────

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

/** The day's tier by total score. The bottom few roast you; the top ones are Toronto slang that praise you. */
export const TIERS: { min: number; name: string; line: string }[] = [
  { min: 5000, name: "You Are the 6ix", line: "A perfect day. The city is you." },
  { min: 4500, name: "6ix God", line: "You run the city." },
  { min: 4000, name: "Wallahi, Different", line: "That score is different." },
  { min: 3500, name: "Say Less", line: "You know your city. Respect." },
  { min: 3000, name: "Certified 416", line: "Real Torontonian behaviour." },
  { min: 2500, name: "Bare Decent", line: "You know a ting or two about this city." },
  { min: 2000, name: "Mans Is Trying", line: "Halfway there, ahlie?" },
  { min: 1500, name: "Tourist", line: "You sure you didn't just land at Pearson?" },
  { min: 1000, name: "Left-Side Escalator Stander", line: "Everyone behind you is cheesed." },
  { min: 500, name: "Waste Yute", line: "Silly. Go look at a map of the city." },
  { min: 0, name: "Wasteman", line: "Nize it. That was rough, styll." },
];
export const tierOf = (total: number) => TIERS.find(t => total >= t.min)!;

