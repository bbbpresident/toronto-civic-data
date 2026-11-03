import type { Metadata } from "next";
import PageNav from "@/components/PageNav";
import TodayGame from "@/components/TodayGame";
import { TIERS } from "@/lib/today-rules";
import { PLACES } from "@/lib/places";

// The map question uses stations and neighbourhoods for now; other kinds stay in lib/places.json until tested.
const MAP_PLACES = PLACES.places.filter(p => p.kind === "station" || p.kind === "neighbourhood");
const MAP = { width: PLACES.map.width, height: PLACES.map.height, paths: PLACES.map.paths, kmPerUnit: PLACES.map.kmPerUnit };
import { Shell } from "@/components/SectionParts";
import { CHOICE_QUESTIONS, QUESTIONS } from "@/lib/today";

export const metadata: Metadata = {
  title: "416 · Toronto Civic Data",
  description: "416: a daily Toronto game. 4 questions. 1 minute. 6ix tiers.",
};

/** Game #1. Changing it renumbers every game and moves everyone's saved scores. */
const LAUNCH = "2026-11-01";

export default function TodayPage() {
  return (
    <Shell>
      <PageNav />
      <header style={{ marginBottom: 16 }}>
        <h1 style={{ fontSize: 30, fontWeight: 800, letterSpacing: "-0.03em", margin: "0 0 6px" }}>416</h1>
        <p style={{ fontSize: 14, color: "var(--text-secondary)", margin: 0, lineHeight: 1.55 }}>
          4 questions. 1 minute. 6ix tiers.
        </p>
      </header>
      <TodayGame bank={{ choice: CHOICE_QUESTIONS, levels: QUESTIONS }} launch={LAUNCH} map={MAP} places={MAP_PLACES} sources={{ place: PLACES.sources, outline: PLACES.map.source }} />
      <details style={{ marginTop: 20, fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.6 }}>
        <summary style={{ cursor: "pointer" }}>How scoring works</summary>
        <ul style={{ margin: "8px 0 0", paddingLeft: 18 }}>
          <li>One 60-second clock for all four questions. If it runs out, whatever you&apos;ve entered on the current question is locked in and any questions left score 0.</li>
          <li><strong>Q1, multiple choice</strong>: 1,000 if right, 0 if wrong.</li>
          <li><strong>Q2 (1 to 100) and Q4 (no limit)</strong>: scored by how many times off you are, so being off by 50 counts for less when the answer is 5,000 than when it&apos;s 60. 1 point at 3× off (Q2) or 10× off (Q4).</li>
          <li><strong>Q3, the map</strong>: find a TTC subway station or a Toronto neighbourhood on a blank map. 1,000 points within 150 m (or anywhere inside the neighbourhood), about 780 at 1 km off, 370 at 4 km, 80 at 10 km.</li>
          <li><strong>Speed</strong>: finish all four with 20 or more seconds left and you keep every point. After that each second costs 1.25% of your points, down to ×0.75 at the buzzer. A perfect 4,000 is possible.</li>
          <li>Tiers out of 4,000: {TIERS.slice().reverse().map((t, i, a) => <span key={t.name}>{t.name} {t.min.toLocaleString("en-CA")}{i < a.length - 1 ? " · " : ""}</span>)}.</li>
          <li>🎯 950+ · 🟩 750+ · 🟨 450+ · 🟥 under 450 · ⬛ no answer. Your guesses, clock and streak are kept in this browser only.</li>
          <li>Answers are worked out from the same City and Statistics Canada files as the rest of this site, using the latest year available, so an answer can change when a new file comes out.</li>
        </ul>
      </details>
    </Shell>
  );
}
