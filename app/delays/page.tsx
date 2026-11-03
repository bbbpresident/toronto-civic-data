import type { Metadata } from "next";
import PageNav from "@/components/PageNav";
import SeriesCard from "@/components/SeriesCard";
import RankCard, { RankRow } from "@/components/RankCard";
import { Header, KeyFigures, SectionTitle, Shell } from "@/components/SectionParts";
import { DataSourceCitation } from "@/components/SourceCitation";
import { fmtPeriod } from "@/lib/chart-format";
import { DELAYS } from "@/lib/delays";

export const metadata: Metadata = { title: "TTC Delays · Toronto Civic Data" };

// Every figure comes from lib/delays.json (scripts/extract_delays.py); each card cites its files.

export default function DelaysPage() {
  const S = DELAYS.series, R = DELAYS.ranks, M = DELAYS.modes, y = M.subway.year;
  const hours = (m: number) => `${Math.round(m / 60).toLocaleString("en-CA")} hours`;
  return (
    <Shell>
      <PageNav />
      <Header title="Most-delayed TTC lines">
        Every delay the TTC logged on the subway, buses and streetcars since 2025 (through {fmtPeriod(M.subway.lastMonth)}): the lines, routes and stations
        with the most minutes of delay, and the reasons the TTC gave. Only incidents that caused a delay count.
      </Header>
      <KeyFigures items={[
        { label: `Subway delays, ${y}`, value: M.subway.delays.toLocaleString("en-CA"), sub: `${hours(M.subway.minutes)} of delay` },
        { label: `Bus delays, ${y}`, value: M.bus.delays.toLocaleString("en-CA"), sub: `${hours(M.bus.minutes)} of delay` },
        { label: `Streetcar delays, ${y}`, value: M.streetcar.delays.toLocaleString("en-CA"), sub: `${hours(M.streetcar.minutes)} of delay` },
        { label: `Most-delayed route, ${y}`, value: R.bus_lines.rows[0].label, sub: `${R.bus_lines.rows[0].value.toLocaleString("en-CA")} minutes` },
      ]} />

      <SectionTitle>Subway, {y}</SectionTitle>
      <RankRow>
        <RankCard rank={R.subway_lines} color="var(--s5)" blurb="Line 5 (Eglinton) and Line 6 (Finch West) aren't in the TTC's subway delay file." />
        <RankCard rank={R.stations} color="var(--s5)" blurb="BD after a name means the Line 2 platforms." />
      </RankRow>
      <RankCard rank={R.subway_causes} color="var(--s2)" blurb="The TTC's own delay codes, as described in its code list." />

      <SectionTitle>Buses, {y}</SectionTitle>
      <RankRow>
        <RankCard rank={R.bus_lines} color="var(--s1)" />
        <RankCard rank={R.bus_causes} color="var(--s2)" blurb="Diversions log the most minutes by far." />
      </RankRow>

      <SectionTitle>Streetcars, {y}</SectionTitle>
      <RankRow>
        <RankCard rank={R.streetcar_lines} color="var(--s4)" />
        <RankCard rank={R.streetcar_causes} color="var(--s2)" />
      </RankRow>

      <SectionTitle>Month by month</SectionTitle>
      <SeriesCard title="Minutes of delay each month" blurb="Buses log far more minutes: there are many more of them, on more routes."
        series={[S.bus_monthly, S.streetcar_monthly, S.subway_monthly]} kind="line" />
      <div style={{ display: "grid", gap: 10, marginTop: 14 }}>
        {(["subway", "bus", "streetcar"] as const).map(k => <DataSourceCitation key={k} source={M[k].codes} label={`${k[0].toUpperCase()}${k.slice(1)} delay codes`} />)}
      </div>
    </Shell>
  );
}
