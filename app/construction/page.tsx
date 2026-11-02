import type { Metadata } from "next";
import PageNav from "@/components/PageNav";
import ConstructionList from "@/components/ConstructionList";
import { Shell, Header } from "@/components/SectionParts";
import { DataSourceCitation } from "@/components/SourceCitation";
import { card, link } from "@/components/BudgetParts";
import { CITY } from "@/lib/city";

export const metadata: Metadata = { title: "Where's the construction? · Toronto Civic Data" };

const COLORS = { CONSTRUCTION: "var(--s4)", ROAD_CLOSED: "var(--s5)" } as const;

export default function ConstructionPage() {
  const { items, mapUrl, source } = CITY.construction, w = CITY.wards;
  const closed = items.filter(i => i.type === "ROAD_CLOSED").length;
  const byWho = Object.entries(items.reduce<Record<string, number>>((a, i) => { if (i.by) a[i.by] = (a[i.by] ?? 0) + 1; return a; }, {}))
    .sort((a, b) => b[1] - a[1]).slice(0, 5);
  return (
    <Shell>
      <PageNav />
      <Header title="Where's the construction?">
        Every road restriction in effect when this snapshot was taken ({CITY.generatedOn}): {items.length.toLocaleString("en-CA")} in all,
        {" "}{(items.length - closed).toLocaleString("en-CA")} construction and {closed.toLocaleString("en-CA")} road closures.{" "}
        <a href={mapUrl} target="_blank" rel="noopener noreferrer" style={link}>The City&apos;s live map ↗</a>
      </Header>
      <section style={card} aria-label="Map of road restrictions">
        <svg viewBox={`0 0 ${w.width} ${w.height}`} width="100%" role="img" aria-label={`Map of Toronto's 25 wards with ${items.length} road restrictions marked`} style={{ display: "block" }}>
          {w.paths.map(p => <path key={p.ward} d={p.d} fill="var(--surface-2)" stroke="var(--border)" strokeWidth={1.2}><title>{`Ward ${p.ward}: ${p.name}`}</title></path>)}
          {items.map(i => (
            <circle key={i.id} cx={i.x} cy={i.y} r={3.2} fill={COLORS[i.type as keyof typeof COLORS] ?? "var(--s4)"} fillOpacity={0.85} stroke="var(--surface)" strokeWidth={0.8}>
              <title>{`${i.road || i.where}${i.until ? ` · until ${i.until}` : ""}`}</title>
            </circle>
          ))}
        </svg>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 16, marginTop: 10, fontSize: 12, color: "var(--text-secondary)" }}>
          <span><span aria-hidden style={{ display: "inline-block", width: 9, height: 9, borderRadius: 5, background: COLORS.CONSTRUCTION, marginRight: 6 }} />Construction</span>
          <span><span aria-hidden style={{ display: "inline-block", width: 9, height: 9, borderRadius: 5, background: COLORS.ROAD_CLOSED, marginRight: 6 }} />Road closed</span>
          <span>Hover a dot or a ward for its name.</span>
        </div>
      </section>
      {byWho.length > 0 && (
        <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: "14px 0 0", lineHeight: 1.6 }}>
          Who&apos;s doing the work: {byWho.map(([who, n], i) => <span key={who}>{who} ({n.toLocaleString("en-CA")}){i < byWho.length - 1 ? ", " : "."}</span>)}
        </p>
      )}
      <section style={{ ...card, marginTop: 14 }}>
        <h2 style={{ fontSize: 16, fontWeight: 800, margin: "0 0 10px" }}>Every restriction</h2>
        <ConstructionList items={items} />
      </section>
      <p style={{ fontSize: 11, color: "var(--text-secondary)", margin: "16px 0 8px", lineHeight: 1.55 }}>
        Road work changes daily; this is a snapshot. Positions are each restriction&apos;s point as the City lists it, on simplified ward boundaries.
      </p>
      <div style={{ display: "grid", gap: 10 }}>
        <DataSourceCitation source={source} label="Road restrictions" />
        <DataSourceCitation source={w.source} label="Ward boundaries" />
      </div>
    </Shell>
  );
}
