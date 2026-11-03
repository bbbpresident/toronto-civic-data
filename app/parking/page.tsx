import type { Metadata } from "next";
import PageNav from "@/components/PageNav";
import SeriesCard from "@/components/SeriesCard";
import RankCard, { RankRow } from "@/components/RankCard";
import HeatGrid from "@/components/HeatGrid";
import { Header, KeyFigures, SectionTitle, Shell, at, change, latest } from "@/components/SectionParts";
import { fmtMoney } from "@/lib/format";
import { PARKING } from "@/lib/parking";

export const metadata: Metadata = { title: "Parking Tickets · Toronto Civic Data" };

// Every figure comes from lib/parking.json (scripts/extract_parking.py); each card cites its files.

export default function ParkingPage() {
  const S = PARKING.series, R = PARKING.ranks, y = PARKING.latestYear;
  const t = latest(S.tickets), f = at(S.fines, t.period)!, t0 = S.tickets.points[0], f0 = S.fines.points[0];
  const top = R.infractions.rows[0];
  return (
    <Shell>
      <PageNav />
      <Header title="Parking tickets">
        Every parking ticket the City has issued since {t0.period}, from its yearly ticket files: how many, what for, where and when.
        Fines are the amount set on each ticket, not what was actually paid.
      </Header>
      <KeyFigures items={[
        { label: `Parking tickets, ${t.period}`, value: t.value!.toLocaleString("en-CA"), sub: `About ${Math.round(t.value! / 365).toLocaleString("en-CA")} a day` },
        { label: `Set fines on them, ${f.period}`, value: fmtMoney(f.value!), sub: `${change(f0, f)} since ${f0.period}` },
        { label: `Average fine, ${t.period}`, value: `$${Math.round(f.value! / t.value!)}`, sub: `$${Math.round(f0.value! / t0.value!)} in ${t0.period}` },
        { label: `Most common ticket, ${y}`, value: top.label, sub: `${top.value.toLocaleString("en-CA")} tickets` },
      ]} />

      <SectionTitle>Over the years</SectionTitle>
      <SeriesCard title="Parking tickets each year" series={[S.tickets]} />
      <SeriesCard title="Set fines on those tickets" blurb="Fewer tickets than in 2008, but each one costs more." series={[S.fines]} colorOffset={1} />

      <SectionTitle>When and where, {y}</SectionTitle>
      <HeatGrid title={`When tickets are written, ${y}`} blurb="Tickets by day of the week and hour. Weekday business hours are busiest; there's a lull around 5 to 6 a.m."
        rows={PARKING.grid.days} counts={PARKING.grid.counts} source={PARKING.grid.source} />
      <RankRow>
        <RankCard rank={R.infractions} color="var(--s2)" blurb="As the ticket describes it, with the usual fine." />
        <RankCard rank={R.streets} color="var(--s6)" />
      </RankRow>
      <RankRow>
        <RankCard rank={R.addresses} color="var(--s4)" blurb="Single addresses, as written on the ticket." />
        <RankCard rank={R.months} color="var(--s3)" />
      </RankRow>
    </Shell>
  );
}
