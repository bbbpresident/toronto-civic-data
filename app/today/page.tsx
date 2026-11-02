import type { Metadata } from "next";
import PageNav from "@/components/PageNav";
import TodayGame from "@/components/TodayGame";
import { TIERS } from "@/lib/today-rules";
import { Shell } from "@/components/SectionParts";
import { QUESTIONS } from "@/lib/today";

export const metadata: Metadata = {
  title: "TOday · Toronto Civic Data",
  description: "Five questions about Toronto a day, 60 seconds each. Climb the CN Tower: how close can you get to 5,000?",
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
          Five questions about Toronto, the same for everyone, new each day at midnight. You get 60 seconds for each. Guess as close as you
          can: up to 1,000 points a question, 5,000 for a perfect day, then climb the CN Tower and find out your tier. Every answer opens its source.
        </p>
      </header>
      <TodayGame bank={QUESTIONS} launch={LAUNCH} />
      <details style={{ marginTop: 20, fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.6 }}>
        <summary style={{ cursor: "pointer" }}>How scoring works</summary>
        <ul style={{ margin: "8px 0 0", paddingLeft: 18 }}>
          <li>Five questions, each with a bigger range: 1 to 10, 1 to 100, 1 to 1,000, 1 to 10,000, then no limit. 60 seconds each; when time runs out, whatever you&apos;ve entered is locked in (nothing entered scores 0).</li>
          <li><strong>Question 1</strong>: 1,000 points for being within 0.25 of the answer, minus 100 for every half off. <strong>Questions 2–5</strong>: scored by how many times off you are, so being off by 50 counts for less when the answer is 5,000 than when it&apos;s 60. 1 point at 3× off (question 2), 4× (3), 6× (4) or 10× (5).</li>
          <li>Tiers out of 5,000: {TIERS.slice().reverse().map((t, i, a) => <span key={t.name}>{t.name} {t.min.toLocaleString("en-CA")}{i < a.length - 1 ? " · " : ""}</span>)}.</li>
          <li>🎯 950+ · 🟩 750+ · 🟨 450+ · 🟥 under 450 · ⬛ no answer. Your guesses, timers and streak are kept in this browser only.</li>
          <li>Answers are worked out from the same City and Statistics Canada files as the rest of this site, using the latest year available, so an answer can change when a new file comes out.</li>
        </ul>
      </details>
    </Shell>
  );
}
