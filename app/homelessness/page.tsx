import type { Metadata } from "next";
import Link from "next/link";
import PageNav from "@/components/PageNav";
import SeriesCard from "@/components/SeriesCard";
import RankCard, { RankRow } from "@/components/RankCard";
import { Header, KeyFigures, SectionTitle, Shell, at, change, latest, periodLabel } from "@/components/SectionParts";
import { link } from "@/components/BudgetParts";
import { HOMELESSNESS } from "@/lib/homelessness";
import { HOUSING } from "@/lib/housing";

export const metadata: Metadata = { title: "Homelessness · Toronto Civic Data" };

// Every figure comes from lib/homelessness.json (scripts/extract_homelessness.py) or, for shelter capacity and
// occupancy, lib/housing.json (scripts/extract_housing.py); each card cites its files.

export default function HomelessnessPage() {
  const S = HOMELESSNESS.series, R = HOMELESSNESS.ranks, H = HOUSING.series;
  const now = latest(S.active);
  const ago = at(S.active, `${+now.period.slice(0, 4) - 1}${now.period.slice(4)}`);
  const housed = latest(S.yearHoused), inflow = at(S.yearIn, housed.period)!;
  const first = S.active.points[0];
  return (
    <Shell>
      <PageNav />
      <Header title="Homelessness">
        People experiencing homelessness who use the City&apos;s shelter system, month by month since {periodLabel(first)}: how many, who they are, and how many
        find housing. From the City&apos;s Shelter System Flow data, plus nightly shelter use from its occupancy files.
      </Header>
      <KeyFigures items={[
        { label: `Actively homeless, ${periodLabel(now)}`, value: now.value!.toLocaleString("en-CA"), sub: ago ? `${change(ago, now)} from a year earlier` : undefined,
          info: "People who used a City-funded overnight service at least once in the last three months and didn't move into permanent housing." },
        { label: `Moved into housing, ${housed.period}`, value: housed.value!.toLocaleString("en-CA"), sub: `${inflow.value!.toLocaleString("en-CA")} newly identified that year` },
        { label: `Chronically homeless, ${periodLabel(now)}`, value: R.groups.rows.find(r => r.label === "Chronic")!.value.toLocaleString("en-CA"), sub: "One of the City's population groups" },
      ]} />

      <SectionTitle>How many</SectionTitle>
      <SeriesCard title="People actively homeless, each month" series={[S.active]} kind="line" colorOffset={1} />
      <SeriesCard title="Some groups within that" blurb="Groups overlap: a refugee family with a teenager counts in Refugees, Families and Youth."
        series={[S.group_0, S.group_1, S.group_3, S.group_4]} kind="line" />

      <SectionTitle>Coming in, moving out</SectionTitle>
      <SeriesCard title="Newly identified vs moved into housing, each year" series={[S.yearIn, S.yearHoused]} />
      <SeriesCard title="Every month" series={[S.flow_newly_identified, S.flow_moved_to_housing, S.flow_returned_from_housing]} kind="line" />

      <SectionTitle>Who, {periodLabel(now)}</SectionTitle>
      <RankCard rank={R.groups} color="var(--s2)" />
      <RankRow>
        <RankCard rank={R.ages} color="var(--s6)" />
        <RankCard rank={R.genders} color="var(--s3)" />
      </RankRow>

      <SectionTitle>Shelters, night by night</SectionTitle>
      <SeriesCard title="People in the shelter system on an average night" series={[H.shelterPeople]} kind="line" colorOffset={1}>
        <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: "8px 0 0" }}>Capacity and more on the <Link href="/housing" style={link}>housing page</Link>.</p>
      </SeriesCard>
      <SeriesCard title="How full the shelters are" series={[H.shelterOccBeds, H.shelterOccRooms]} kind="line" />
    </Shell>
  );
}
