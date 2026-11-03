import type { Metadata } from "next";
import PageNav from "@/components/PageNav";
import SeriesCard from "@/components/SeriesCard";
import RankCard, { RankRow } from "@/components/RankCard";
import HeatGrid from "@/components/HeatGrid";
import { Header, KeyFigures, SectionTitle, Shell, latest } from "@/components/SectionParts";
import { THREE11 } from "@/lib/three11";

export const metadata: Metadata = { title: "311 Requests · Toronto Civic Data" };

// Every figure comes from lib/three11.json (scripts/extract_311.py); each card cites its files.

export default function Three11Page() {
  const S = THREE11.series, R = THREE11.ranks, y = THREE11.latestYear;
  const n = latest(S.requests), top = R.types.rows[0], ward = R.wards.rows[0];
  return (
    <Shell>
      <PageNav />
      <Header title="What Toronto calls 311 about">
        Every service request residents have made to 311 since {S.requests.points[0].period}: broken bins, potholes, dead raccoons, uncleared sidewalks.
        What people ask for, which City division handles it, where, and when.
      </Header>
      <KeyFigures items={[
        { label: `Service requests, ${n.period}`, value: n.value!.toLocaleString("en-CA"), sub: `About ${Math.round(n.value! / 365).toLocaleString("en-CA")} a day` },
        { label: `Most common request, ${y}`, value: top.label, sub: `${top.value.toLocaleString("en-CA")} requests` },
        { label: `Most requests, ${y}`, value: ward.label.replace(/\s*\(Ward \d+\)$/, ""), sub: `${ward.value.toLocaleString("en-CA")} requests · ${ward.label.match(/Ward \d+/)?.[0] ?? ""}` },
      ]} />

      <SectionTitle>Over the years</SectionTitle>
      <SeriesCard title="Service requests each year" blurb="Requests residents started (the City's own work orders aren't in this file)." series={[S.requests]} colorOffset={3} />

      <SectionTitle>What and who, {y}</SectionTitle>
      <RankRow>
        <RankCard rank={R.types} color="var(--s3)" blurb="Request types as 311 files them." />
        <RankCard rank={R.divisions} color="var(--s6)" />
      </RankRow>

      <SectionTitle>Where and when, {y}</SectionTitle>
      <HeatGrid title={`When requests come in, ${y}`} blurb="Requests by day of the week and the hour they were made."
        rows={THREE11.grid.days} counts={THREE11.grid.counts} source={THREE11.grid.source} color="var(--s3)" />
      <RankRow>
        <RankCard rank={R.wards} color="var(--s1)" />
        <RankCard rank={R.months} color="var(--s4)" />
      </RankRow>
    </Shell>
  );
}
