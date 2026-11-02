import type { Metadata } from "next";
import PageNav from "@/components/PageNav";
import SeriesCard from "@/components/SeriesCard";
import ViewToggle from "@/components/ViewToggle";
import { DataSourceCitation } from "@/components/SourceCitation";
import { card } from "@/components/BudgetParts";
import { Header, KeyFigures, SectionTitle, Shell, at, change, latest, show } from "@/components/SectionParts";
import { CRIME, S } from "@/lib/crime";

export const metadata: Metadata = { title: "Crime · Toronto Civic Data" };

// Every figure comes from lib/crime.json (scripts/extract_safety.py); each card cites its files.

const th: React.CSSProperties = { padding: "8px 10px", fontWeight: 600, borderBottom: "1px solid var(--border)", textAlign: "right", whiteSpace: "nowrap" };
const td: React.CSSProperties = { padding: "7px 10px", fontVariantNumeric: "tabular-nums", textAlign: "right" };
const fmt = (n: number) => n.toLocaleString("en-CA");

export default function CrimePage() {
  const last = latest(S.reported), first = S.reported.points[0];
  const rate = latest(S.reportedPer100k), cleared = latest(S.clearanceRate), cleared0 = at(S.clearanceRate, first.period);
  const hom = latest(S.homicides);
  const cats = CRIME.categories.map((c, i) => ({ name: c, count: S[`cat${i}`], cleared: S[`catCleared${i}`] }));
  const homTypes = Object.keys(S).filter(k => k.startsWith("homicide") && k !== "homicides" && k !== "homicidesPer100k").map(k => S[k]);
  const y1 = last.period, y0 = first.period;

  return (
    <Shell>
      <PageNav />
      <Header title="Crime">
        Crimes reported to the Toronto Police Service each year since {y0}, how many were cleared, and homicides since 2004. The
        Police Service&apos;s reported-crime file counts every reported offence, including reports later found to be unfounded.
      </Header>

      <KeyFigures items={[
        { label: `Crimes reported, ${y1}`, value: show(S.reported, last), sub: `${change(first, last)} since ${y0}` },
        { label: `Per 100,000 residents, ${rate.period}`, value: show(S.reportedPer100k, rate, 0), sub: `${change(at(S.reportedPer100k, y0), rate)} since ${y0}` },
        { label: `Share cleared, ${cleared.period}`, value: show(S.clearanceRate, cleared), sub: cleared0 ? `${show(S.clearanceRate, cleared0)} in ${y0}` : undefined },
        { label: `Homicides, ${hom.period}`, value: show(S.homicides, hom) },
      ]} />

      <SectionTitle>Reported crime</SectionTitle>
      <section style={{ marginTop: 0 }}>
        <ViewToggle label="Measure" storageKey="crime-measure" views={[
          { id: "count", label: "Number reported", content: <SeriesCard title="Crimes reported each year" series={[S.reported]} /> },
          { id: "rate", label: "Per 100,000 residents", content: <SeriesCard title="Crimes reported per 100,000 residents" blurb="Reported crimes divided by the City's population that year (Statistics Canada)." series={[S.reportedPer100k]} decimals={0} /> },
        ]} />
      </section>
      <SeriesCard
        title="Reported crimes by category"
        blurb="The Police Service's six categories. Crimes against property (theft, fraud, break and enter, auto theft) make up most reports."
        series={cats.map(c => c.count)} kind="line"
      />

      <SectionTitle>How many were cleared</SectionTitle>
      <SeriesCard
        title="Share of reported crimes cleared"
        blurb="The number of offences the file records as cleared, divided by the number reported, for each year."
        series={[S.clearanceRate]} colorOffset={2}
      />
      <SeriesCard title="Share cleared, by category" series={cats.map(c => c.cleared)} kind="line" />

      <SectionTitle>By type of offence</SectionTitle>
      <section style={{ ...card, marginTop: 20 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 4px" }}>Offences reported, {y0}{" "}and {y1}</h2>
        <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: "0 0 12px", lineHeight: 1.5 }}>Each subtype as the Police Service names it, with the share cleared in {y1}.</p>
        <div style={{ overflowX: "auto", border: "1px solid var(--border)", borderRadius: 10 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, minWidth: 560 }}>
            <thead>
              <tr style={{ color: "var(--text-secondary)" }}>
                <th style={{ ...th, textAlign: "left" }}>Offence</th>
                <th style={th}>{y0}</th>
                <th style={th}>{y1}</th>
                <th style={th}>Change</th>
                <th style={th}>Cleared, {y1}</th>
              </tr>
            </thead>
            {CRIME.categories.map(c => (
              <tbody key={c}>
                <tr><td colSpan={5} style={{ padding: "10px 10px 4px", fontSize: 11, fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.04em" }}>{c}</td></tr>
                {CRIME.subtypes.filter(s => s.category === c).map(s => {
                  const a = s.years[y0]?.[0] ?? 0, b = s.years[y1]?.[0] ?? 0, cl = s.years[y1]?.[1] ?? 0;
                  return (
                    <tr key={s.subtype} style={{ borderTop: "1px solid var(--border)" }}>
                      <td style={{ ...td, textAlign: "left" }}>{s.subtype}</td>
                      <td style={td}>{fmt(a)}</td>
                      <td style={{ ...td, fontWeight: 600 }}>{fmt(b)}</td>
                      <td style={{ ...td, color: "var(--text-secondary)" }}>{a ? `${b >= a ? "+" : "−"}${Math.abs((b / a - 1) * 100).toFixed(0)}%` : "—"}</td>
                      <td style={td}>{b ? `${((cl / b) * 100).toFixed(0)}%` : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            ))}
          </table>
        </div>
        <div style={{ marginTop: 14 }}><DataSourceCitation source={CRIME.subtypeSource} /></div>
      </section>

      <SectionTitle>Homicides</SectionTitle>
      <SeriesCard title="Homicides each year, by type" blurb="As the Police Service classifies them. The current year is shown to date." series={homTypes} kind="line" />
      <SeriesCard title="Homicides per 100,000 residents" series={[S.homicidesPer100k]} decimals={2} colorOffset={1} />
    </Shell>
  );
}
