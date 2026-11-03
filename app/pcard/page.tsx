import type { Metadata } from "next";
import PageNav from "@/components/PageNav";
import SeriesCard from "@/components/SeriesCard";
import RankCard, { RankRow } from "@/components/RankCard";
import { Header, KeyFigures, SectionTitle, Shell, at, change, latest } from "@/components/SectionParts";
import { fmtPeriod } from "@/lib/chart-format";
import { fmtMoney } from "@/lib/format";
import { PCARD } from "@/lib/pcard";

export const metadata: Metadata = { title: "PCard Spending · Toronto Civic Data" };

// Every figure comes from lib/pcard.json (scripts/extract_pcard.py); each card cites its file.

export default function PCardPage() {
  const S = PCARD.series, R = PCARD.ranks, y = PCARD.latestYear;
  const spend = latest(S.spend), buys = at(S.purchases, spend.period)!;
  const first = S.spend.points[0];
  const chains = Object.values(S).filter(s => s.id.startsWith("fam_") && ["Amazon", "The Home Depot", "Canadian Tire", "Costco"].includes(s.label));
  return (
    <Shell>
      <PageNav />
      <Header title="What City staff buy on the company card">
        City staff buy supplies, equipment, licences and services on City purchasing cards (PCards). This is every purchase since {first.period}, from
        the City&apos;s monthly file (through {fmtPeriod(PCARD.lastMonth)}): who spends, where, and the biggest single buys.
      </Header>
      <KeyFigures items={[
        { label: `Spent on PCards, ${spend.period}`, value: fmtMoney(spend.value!), sub: `${change(first, spend)} since ${first.period}` },
        { label: `Purchases, ${spend.period}`, value: buys.value!.toLocaleString("en-CA"), sub: `About ${Math.round(buys.value! / 365).toLocaleString("en-CA")} a day` },
        { label: `Average purchase, ${spend.period}`, value: `$${Math.round(spend.value! / buys.value!).toLocaleString("en-CA")}`, sub: "Total ÷ purchases (refunds netted in)" },
      ]} />

      <SectionTitle>Over the years</SectionTitle>
      <SeriesCard title="Spent on PCards each year" series={[S.spend]} />
      <SeriesCard title="Purchases each year" series={[S.purchases]} colorOffset={2} />

      <SectionTitle>Where the money went, {y}</SectionTitle>
      <RankRow>
        <RankCard rank={R.merchants} blurb="Store numbers removed and chain locations combined (every Home Depot counts as one)." />
        <RankCard rank={R.familiar} color="var(--s3)" blurb="A few household names, across all their locations." />
      </RankRow>
      <SeriesCard title="Some familiar names over the years" series={chains} kind="line" />
      <RankRow>
        <RankCard rank={R.divisions} color="var(--s6)" />
        <RankCard rank={R.types} color="var(--s4)" blurb="The card network's category for each shop." />
      </RankRow>
      <RankCard rank={R.biggest} color="var(--s2)" blurb="The card is for small purchases, but some are large: software licences, repairs, permits. The file's free-text purpose isn't shown, because it sometimes names people." />
    </Shell>
  );
}
