import type { Metadata } from "next";
import PageNav from "@/components/PageNav";
import SeriesCard from "@/components/SeriesCard";
import RankCard, { RankRow } from "@/components/RankCard";
import { Header, KeyFigures, SectionTitle, Shell, latest } from "@/components/SectionParts";
import { fmtPeriod } from "@/lib/chart-format";
import { MARRIAGE } from "@/lib/marriage";

export const metadata: Metadata = { title: "Marriage Licences · Toronto Civic Data" };

// Every figure comes from lib/marriage.json (scripts/extract_marriage.py); each card cites its file.

export default function MarriagePage() {
  const S = MARRIAGE.series, R = MARRIAGE.ranks;
  const y = latest(S.yearly), cur = S.yearly.points[S.yearly.points.length - 1];
  const peak = [...R.seasons.rows].sort((a, b) => b.value - a.value);
  const top3 = new Set(peak.slice(0, 3).map(r => r.label));
  const low = S.yearly.points.find(p => p.period === "2020");
  return (
    <Shell>
      <PageNav />
      <Header title="Marriage licences">
        Marriage licences issued at the City&apos;s four civic centres each month since {S.monthly.points[0].period.slice(0, 4)}, through {fmtPeriod(MARRIAGE.lastMonth)}.
        When Toronto gets married, and where it picks up the paperwork.
      </Header>
      <KeyFigures items={[
        { label: `Licences issued, ${y.period}`, value: y.value!.toLocaleString("en-CA"), sub: `About ${Math.round(y.value! / 52)} a week` },
        ...(cur.note ? [{ label: `${cur.period} so far`, value: cur.value!.toLocaleString("en-CA"), sub: cur.note }] : []),
        { label: "Busiest month, on average", value: peak[0].label, sub: `${peak[0].value.toLocaleString("en-CA")} licences vs ${peak[peak.length - 1].value.toLocaleString("en-CA")} in ${peak[peak.length - 1].label}` },
        ...(low ? [{ label: "Pandemic low, 2020", value: low.value!.toLocaleString("en-CA"), sub: "The fewest of any year" }] : []),
      ]} />

      <SectionTitle>Over the years</SectionTitle>
      <SeriesCard title="Marriage licences each year" series={[S.yearly]} colorOffset={5} />
      <SeriesCard title="Every month" blurb="The summer peaks, and the gap when the pandemic hit in 2020." series={[S.monthly]} kind="line" colorOffset={5} />

      <SectionTitle>Wedding season</SectionTitle>
      <RankRow>
        <RankCard rank={R.seasons} color="var(--s6)" highlight={r => top3.has(r.label)} blurb="Summer is wedding season: the three busiest months are darker." />
        <RankCard rank={R.busiest} color="var(--s3)" />
      </RankRow>

      <SectionTitle>Where</SectionTitle>
      <SeriesCard title="Licences by civic centre" blurb="Where couples picked up their licence (not where they live or married)."
        series={Object.keys(MARRIAGE.centres).map(c => S[`centre_${c}`])} kind="line" />
    </Shell>
  );
}
