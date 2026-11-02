import type { Metadata } from "next";
import PageNav from "@/components/PageNav";
import TodayGame from "@/components/TodayGame";
import { Shell } from "@/components/SectionParts";
import { QUESTIONS } from "@/lib/today";

export const metadata: Metadata = {
  title: "TOday · Toronto Civic Data",
  description: "Three questions about Toronto a day. How close can you get?",
};

/** Game #1. Changing it renumbers every game and moves everyone's saved scores. */
const LAUNCH = "2026-11-01";

export default function TodayPage() {
  return (
    <Shell>
      <PageNav />
      <header style={{ marginBottom: 16 }}>
        <h1 style={{ fontSize: 30, fontWeight: 800, letterSpacing: "-0.03em", margin: "0 0 6px" }}>TOday</h1>
        <p style={{ fontSize: 14, color: "var(--text-secondary)", margin: 0, lineHeight: 1.55 }}>
          Three questions about Toronto, the same for everyone, new each day at midnight. Guess as close as you can: up to 10
          points a level, 30 for a perfect day. Every answer opens its source.
        </p>
      </header>
      <TodayGame bank={QUESTIONS} launch={LAUNCH} />
      <details style={{ marginTop: 20, fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.6 }}>
        <summary style={{ cursor: "pointer" }}>How scoring works</summary>
        <ul style={{ margin: "8px 0 0", paddingLeft: 18 }}>
          <li><strong>Level 1</strong> (an answer from 1 to 10): 10 points for being within a quarter of the answer, minus a point for every half off, down to 1.</li>
          <li><strong>Level 2</strong> (1 to 1,000) and <strong>Level 3</strong> (no limit): scored by how many times off you are, so being off by 50 counts for less when the answer is 5,000 than when it&apos;s 60. Twice or half the answer scores 6 on level 2 and 7 on level 3; four times off (level 2) or ten times off (level 3) scores 1.</li>
          <li>Answer all three first; the answers are revealed together at the end.</li>
          <li>Grade for the day: A+ 30 · A 26–29 · B 22–25 · C 18–21 · D 13–17 · F under 13.</li>
          <li>🎯 10 · 🟩 8–9 · 🟨 5–7 · 🟥 1–4. Your guesses and streak are kept in this browser only.</li>
          <li>Answers are worked out from the same City and Statistics Canada files as the rest of this site, using the latest year available, so an answer can change when a new file comes out.</li>
        </ul>
      </details>
    </Shell>
  );
}
