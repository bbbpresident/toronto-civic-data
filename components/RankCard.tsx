import { card } from "@/components/BudgetParts";
import { DataSourceCitation } from "@/components/SourceCitation";
import { fmtMoney } from "@/lib/format";
import type { Ranking } from "@/lib/types";

// A ranked (or ordered) list as horizontal bars: label and value on one line, a bar under it, an optional
// detail line. Cites its one source file underneath. Rows are shown in the order given (the extractor
// sorts them; month-by-month lists stay in calendar order).

export function fmtRank(v: number, unit: Ranking["unit"]): string {
  if (unit === "dollars") return Math.abs(v) >= 100_000 ? fmtMoney(v) : `$${v.toLocaleString("en-CA", { maximumFractionDigits: Math.abs(v) < 1000 ? 2 : 0 })}`;
  if (unit === "percent") return `${v.toFixed(1)}%`;
  if (unit === "minutes") return `${Math.round(v).toLocaleString("en-CA")} min`;
  return v.toLocaleString("en-CA");
}

export default function RankCard({ rank, blurb, color = "var(--s1)", highlight, children }: {
  rank: Ranking; blurb?: React.ReactNode; color?: string;
  /** Row labels to draw at full strength while the rest are lighter (e.g. the peak months). */
  highlight?: (row: Ranking["rows"][number], i: number) => boolean;
  children?: React.ReactNode;
}) {
  const max = Math.max(...rank.rows.map(r => Math.abs(r.value)), 1);
  return (
    <section style={{ ...card, marginTop: 14 }}>
      <h3 style={{ fontSize: 15, fontWeight: 700, margin: "0 0 4px" }}>{rank.title}</h3>
      {blurb && <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: "0 0 8px", lineHeight: 1.5 }}>{blurb}</p>}
      <ol style={{ listStyle: "none", margin: "8px 0 0", padding: 0, display: "grid", gap: 9 }}>
        {rank.rows.map((r, i) => (
          <li key={`${r.label}-${i}`} style={{ minWidth: 0 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 13, alignItems: "baseline" }}>
              <span style={{ minWidth: 0, overflowWrap: "anywhere" }}>{r.label}</span>
              <span style={{ fontWeight: 700, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{fmtRank(r.value, rank.unit)}</span>
            </div>
            <div aria-hidden style={{ height: 6, borderRadius: 3, background: "var(--surface-2)", marginTop: 4, overflow: "hidden" }}>
              <div style={{ width: `${(Math.abs(r.value) / max) * 100}%`, height: "100%", borderRadius: 3, background: color, opacity: !highlight || highlight(r, i) ? 1 : 0.45 }} />
            </div>
            {r.sub && <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 3 }}>{r.sub}</div>}
          </li>
        ))}
      </ol>
      {children}
      {rank.note && <p style={{ fontSize: 11, color: "var(--text-secondary)", margin: "10px 0 0", lineHeight: 1.5 }}>{rank.note}</p>}
      <div style={{ marginTop: 12 }}><DataSourceCitation source={rank.source} /></div>
    </section>
  );
}

/** Rankings side by side on wide screens, stacked on narrow ones. */
export function RankRow({ children }: { children: React.ReactNode }) {
  return <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 320px), 1fr))", gap: "0 14px" }}>{children}</div>;
}
