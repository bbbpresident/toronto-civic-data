import type { Metadata } from "next";
import Link from "next/link";
import PageNav from "@/components/PageNav";
import SeriesCard from "@/components/SeriesCard";
import RankCard, { RankRow } from "@/components/RankCard";
import { Header, KeyFigures, SectionTitle, Shell, change, latest } from "@/components/SectionParts";
import { link } from "@/components/BudgetParts";
import { INCOME } from "@/lib/income";

export const metadata: Metadata = { title: "How Much People Make · Toronto Civic Data" };

// Every figure comes from lib/income.json (scripts/extract_income.py): Statistics Canada, Job Bank, Ontario's
// public sector salary disclosure and the City's 2021 neighbourhood profiles. Each card cites its file.

export default function IncomePage() {
  const S = INCOME.series, R = INCOME.ranks, y = INCOME.sunshineYear;
  const wage = latest(S.wageMedian), men = latest(S.wageMen), women = latest(S.wageWomen);
  const sun = latest(S.sunTotal), sun0 = S.sunTotal.points[0];
  const rich = R.richest.rows[0], poor = R.poorest.rows[0];
  const groups = Object.values(S).filter(s => s.id.startsWith("sun_")).slice(0, 3);
  return (
    <Shell>
      <PageNav />
      <Header title="How much people make">
        What people earn in Toronto, from four official sources: Statistics Canada tax data for the region, what common jobs pay (Job Bank), the 2021 census
        by neighbourhood, and what City employees paid $100,000 or more earn (Ontario&apos;s Sunshine List).
      </Header>
      <KeyFigures items={[
        { label: `Median pay, ${wage.period}`, value: `$${wage.value!.toLocaleString("en-CA")}`, sub: `${change(S.wageMedian.points[0], wage)} since ${S.wageMedian.points[0].period}`,
          info: "The median of wages, salaries and commissions among tax filers in the Toronto region who had any. Includes part-time and part-year work." },
        { label: `Women vs men, ${men.period}`, value: `${Math.round((women.value! / men.value!) * 100)}¢`, sub: `on the dollar ($${women.value!.toLocaleString("en-CA")} vs $${men.value!.toLocaleString("en-CA")} median)` },
        { label: "Richest vs poorest neighbourhood", value: `${(rich.value / poor.value).toFixed(1)}×`, sub: `${rich.label} vs ${poor.label} (median household income, 2020)` },
        { label: `City employees paid $100K+, ${sun.period}`, value: sun.value!.toLocaleString("en-CA"), sub: `${sun0.value!.toLocaleString("en-CA")} in ${sun0.period}` },
      ]} />

      <SectionTitle>Across the Toronto region</SectionTitle>
      <SeriesCard title="Median pay each year" blurb="Wages, salaries and commissions of tax filers who had any, in the Toronto region (not adjusted for inflation)."
        series={[S.wageMedian]} kind="line" colorOffset={2} />
      <SeriesCard title="Women and men" series={[S.wageWomen, S.wageMen]} kind="line" />
      <RankRow>
        <RankCard rank={R.industries} color="var(--s3)" />
        <RankCard rank={R.ages} color="var(--s6)" blurb="Pay is highest between 35 and 54." />
      </RankRow>

      <SectionTitle>What jobs pay</SectionTitle>
      <RankCard rank={R.jobs} color="var(--s1)" blurb="Median hourly wage for some common jobs in the Toronto economic region, with the low and high end of the range. Each figure's survey and year is shown." />

      <SectionTitle>By neighbourhood (2021 census)</SectionTitle>
      <RankRow>
        <RankCard rank={R.richest} color="var(--s3)" />
        <RankCard rank={R.poorest} color="var(--s2)" />
      </RankRow>
      <RankCard rank={R.lowIncome} color="var(--s2)">
        <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: "10px 0 0" }}>
          Every neighbourhood&apos;s income is on <Link href="/map" style={link}>the map</Link>: choose Homes or Density and tap a neighbourhood.
        </p>
      </RankCard>

      <SectionTitle>City employees paid $100,000+</SectionTitle>
      <SeriesCard title="City of Toronto employees on the Sunshine List" blurb="The City and its agencies and boards: the TTC, Police, Toronto Community Housing, the Library and more."
        series={[S.sunTotal]} colorOffset={5} />
      <SeriesCard title="The three biggest employers" series={groups} kind="line" />
      <RankRow>
        <RankCard rank={R.sunEmployers} color="var(--s6)" />
        <RankCard rank={R.sunBands} color="var(--s4)" />
      </RankRow>
      <RankRow>
        <RankCard rank={R.sunTitles} color="var(--s5)" blurb="Job titles as each employer reports them." />
        <RankCard rank={R.sunTop} color="var(--s1)" blurb={`Median salary by job title in ${y}. People aren't named here, though the province's list does name them.`} />
      </RankRow>
      <SeriesCard title="Median salary of City employees on the list" series={[S.sunMedian]} kind="line" colorOffset={5} />
    </Shell>
  );
}
