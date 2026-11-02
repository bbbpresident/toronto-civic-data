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

/** The day's tier by total score, in the user's words (2026-11-02): the bottom ones roast you, the top ones hype you up. */
export const TIERS: { min: number; name: string; line: string }[] = [
  { min: 5000, name: "????", line: "olivia chow said come reach. you da next mayor fo sho" },
  { min: 4500, name: "kinda sus", line: "you a nerd or something?" },
  { min: 4000, name: "wallahi", line: "that's how you're moving? sheeeesh" },
  { min: 3500, name: "say less", line: "my man with the literacy still" },
  { min: 3000, name: "lowkey a baddie", line: "you're out here lookin sweet. keep doing you." },
  { min: 2000, name: "yeah eh?", line: "my mans with the 8th grade wisdom. I see you." },
  { min: 1000, name: "you finna link up?", line: "at the library. phone down. notebook out. educate yourself brudda" },
  { min: 0, name: "dunno fam", line: "I do not know you, and you don't know shit. excuse yourself." },
];
export const tierOf = (total: number) => TIERS.find(t => total >= t.min)!;

