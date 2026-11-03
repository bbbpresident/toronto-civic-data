import { card } from "@/components/BudgetParts";
import { DataSourceCitation } from "@/components/SourceCitation";
import type { DataSource } from "@/lib/types";

// A weekday × hour grid, shaded by count (one hue, light to dark). Each cell carries its number in a
// tooltip and in an accessible table underneath for screen readers.

export default function HeatGrid({ title, blurb, rows, counts, source, color = "var(--s1)" }: {
  title: string; blurb?: React.ReactNode; rows: string[]; counts: number[][]; source: DataSource; color?: string;
}) {
  const max = Math.max(...counts.flat(), 1);
  const hour = (h: number) => (h === 0 ? "12a" : h < 12 ? `${h}a` : h === 12 ? "12p" : `${h - 12}p`);
  return (
    <section style={{ ...card, marginTop: 14, position: "relative" }}>
      <h3 style={{ fontSize: 15, fontWeight: 700, margin: "0 0 4px" }}>{title}</h3>
      {blurb && <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: "0 0 10px", lineHeight: 1.5 }}>{blurb}</p>}
      <div aria-hidden style={{ display: "grid", gridTemplateColumns: "34px repeat(24, minmax(0, 1fr))", gap: 2, fontSize: 9, color: "var(--text-secondary)" }}>
        <span />
        {Array.from({ length: 24 }, (_, h) => <span key={h} style={{ textAlign: "center" }}>{h % 3 === 0 ? hour(h) : ""}</span>)}
        {rows.map((day, d) => (
          <div key={day} style={{ display: "contents" }}>
            <span style={{ alignSelf: "center", fontSize: 10 }}>{day.slice(0, 3)}</span>
            {counts[d].map((v, h) => (
              <span key={h} title={`${day} ${hour(h)}: ${v.toLocaleString("en-CA")}`}
                style={{ aspectRatio: "1", borderRadius: 3, background: color, opacity: 0.06 + 0.94 * (v / max) }} />
            ))}
          </div>
        ))}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: "flex-end", fontSize: 10, color: "var(--text-secondary)", marginTop: 8 }}>
        fewer {[0.1, 0.3, 0.55, 0.8, 1].map(o => <span key={o} style={{ width: 14, height: 10, borderRadius: 2, background: color, opacity: o }} />)} more
      </div>
      {/* Screen-reader copy of the grid. A table ignores width/overflow itself, so the wrapper hides it. */}
      <div style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)", whiteSpace: "nowrap" }}>
      <table>
        <caption>{title}</caption>
        <thead><tr><th>Day</th>{Array.from({ length: 24 }, (_, h) => <th key={h}>{hour(h)}</th>)}</tr></thead>
        <tbody>{rows.map((day, d) => <tr key={day}><th>{day}</th>{counts[d].map((v, h) => <td key={h}>{v}</td>)}</tr>)}</tbody>
      </table>
      </div>
      <div style={{ marginTop: 12 }}><DataSourceCitation source={source} /></div>
    </section>
  );
}
