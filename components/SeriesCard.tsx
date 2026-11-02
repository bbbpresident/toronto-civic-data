import TrendChart from "@/components/TrendChart";
import { DataSourceCitation } from "@/components/SourceCitation";
import { card } from "@/components/BudgetParts";
import type { DataSource, Series } from "@/lib/types";

// A titled chart of one or more sourced series, with each distinct source cited underneath and
// any series notes (publisher caveats, method) shown. Series on one card must share a unit.
// Only labels and points go to the client chart; sources render on the server.

export default function SeriesCard({ title, blurb, series, kind = "bar", baseline, decimals, labels, colorOffset, children }: {
  title: string;
  blurb?: React.ReactNode;
  series: Series[];
  kind?: "bar" | "line";
  baseline?: "zero" | "auto";
  decimals?: number;
  /** Override series labels for this chart (e.g. shorter legend text). */
  labels?: Record<string, string>;
  colorOffset?: number;
  children?: React.ReactNode;
}) {
  const units = new Set(series.map(s => s.unit));
  if (units.size !== 1) throw new Error(`SeriesCard "${title}": series must share one unit`);
  // One citation per file + method; series that differ only in where they sit in the file share it,
  // with each one's location listed. When the series also draw on several other files (e.g. one per
  // year), those are listed compactly as links — each with its location and method on hover — rather
  // than as a full citation apiece.
  const inputs = [...new Map(series.flatMap(s => s.inputs ?? []).map(src => [src.fileUrl, src])).values()];
  const compactInputs = inputs.length > 1;
  const cites = series.flatMap(s => [
    { label: s.label, source: s.source },
    ...(compactInputs ? [] : (s.inputs ?? []).map(src => ({ label: src.dataset, source: src }))),
  ]);
  const groups = new Map<string, { labels: string[]; source: DataSource; locators: { label: string; locator: string }[] }>();
  for (const c of cites) {
    const k = `${c.source.fileUrl}|${c.source.method}`;
    const g = groups.get(k) ?? { labels: [], source: c.source, locators: [] };
    if (!g.locators.some(l => l.locator === c.source.locator)) g.locators.push({ label: c.label, locator: c.source.locator });
    if (!g.labels.includes(c.label)) g.labels.push(c.label);
    groups.set(k, g);
  }
  const sources = [...groups.values()].map(g => ({
    label: g.labels.length > 2 ? `${g.labels.length} series` : g.labels.join(", "),
    source: g.locators.length > 1 ? { ...g.source, locator: g.locators.map(l => `${l.label}: ${l.locator}`).join(" · ") } : g.source,
  }));
  const geos = [...new Set(series.map(s => s.geography).filter(Boolean))];
  const notes = [...new Set(series.map(s => s.note).filter(Boolean))];
  return (
    <section style={{ ...card, marginTop: 20 }}>
      <h2 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 4px" }}>{title}</h2>
      {geos.length > 0 && <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.04em", color: "var(--text-secondary)", textTransform: "uppercase", marginBottom: 4 }}>{geos.join(" · ")}</div>}
      {blurb && <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: "0 0 14px", lineHeight: 1.5 }}>{blurb}</p>}
      <div style={{ paddingTop: 8 }}>
        <TrendChart
          series={series.map(s => ({ id: s.id, label: labels?.[s.id] ?? s.label, points: s.points }))}
          unit={series[0].unit} kind={kind} baseline={baseline} decimals={decimals} colorOffset={colorOffset}
        />
      </div>
      {children}
      {notes.length > 0 && (
        <ul style={{ fontSize: 11, color: "var(--text-secondary)", margin: "12px 0 0", paddingLeft: 16, lineHeight: 1.5 }}>
          {notes.map(n => <li key={n}>{n}</li>)}
        </ul>
      )}
      <div style={{ display: "grid", gap: 10, marginTop: 14 }}>
        {sources.map((c, i) => <DataSourceCitation key={i} source={c.source} label={sources.length > 1 ? c.label : "Source"} />)}
        {compactInputs && (
          <div style={{ fontSize: 12, lineHeight: 1.6, color: "var(--text-secondary)", borderLeft: "2px solid var(--border)", paddingLeft: 10, overflowWrap: "anywhere" }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 2 }}>Combined with</div>
            {inputs.map((src, i) => (
              <span key={src.fileUrl}>
                {i > 0 && " · "}
                <a href={src.fileUrl} target="_blank" rel="noopener noreferrer" title={`${src.publisher}. Location: ${src.locator}. Method: ${src.method}`}
                  style={{ color: "var(--blue)", textDecoration: "underline", textUnderlineOffset: 2 }}>{src.dataset}</a>
              </span>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
