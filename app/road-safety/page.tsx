import type { Metadata } from "next";
import PageNav from "@/components/PageNav";
import SeriesCard from "@/components/SeriesCard";
import { Header, KeyFigures, SectionTitle, Shell, at, change, latest, show } from "@/components/SectionParts";
import { S } from "@/lib/roads";

export const metadata: Metadata = { title: "Road Safety · Toronto Civic Data" };

// Every figure comes from lib/roads.json (scripts/extract_safety.py); each card cites its files.

const USERS = ["pedestrian", "cyclist", "motorcyclist", "driver", "passenger", "other"];

export default function RoadSafetyPage() {
  const killed = latest(S.killed), serious = latest(S.seriouslyInjured);
  const killed0 = S.killed.points[0];
  const ped = latest(S.ksi_pedestrian);
  const ksiTotal = USERS.reduce((sum, u) => sum + (at(S[`ksi_${u}`], ped.period)?.value ?? 0), 0);
  return (
    <Shell>
      <PageNav />
      <Header title="Road safety">
        People killed or seriously injured in collisions on Toronto&apos;s streets since {killed0.period}, from the City&apos;s
        Transportation Services data, and every collision reported to police since 2014.
      </Header>

      <KeyFigures items={[
        { label: `People killed, ${killed.period}`, value: show(S.killed, killed), sub: `${killed0.value} in ${killed0.period}` },
        { label: `Seriously injured, ${serious.period}`, value: show(S.seriouslyInjured, serious), sub: `${change(S.seriouslyInjured.points[0], serious)} since ${S.seriouslyInjured.points[0].period}` },
        { label: `Pedestrians among those killed or seriously injured, ${ped.period}`, value: ksiTotal ? `${((ped.value! / ksiTotal) * 100).toFixed(0)}%` : "n/a", sub: `${ped.value} of ${ksiTotal} people` },
      ]} />

      <SectionTitle>Killed or seriously injured</SectionTitle>
      <SeriesCard title="People killed each year" series={[S.killed]} colorOffset={1} />
      <SeriesCard title="People seriously injured each year" series={[S.seriouslyInjured]} colorOffset={3} />
      <SeriesCard
        title="Killed or seriously injured, by how they were travelling"
        blurb="Each person counted once, by the road-user type the record gives them."
        series={USERS.map(u => S[`ksi_${u}`])} kind="line"
      />
      <SeriesCard title="People killed per 100,000 residents" series={[S.killedPer100k]} decimals={2} colorOffset={1} />

      <SectionTitle>All police-reported collisions</SectionTitle>
      <SeriesCard title="Collisions reported to police each year" series={[S.collisions_total]} />
      <SeriesCard
        title="Collisions by type"
        blurb="A collision can count in more than one type."
        series={[S.collisions_pd, S.collisions_ftr, S.collisions_injury]} kind="line"
      />
      <SeriesCard title="Collisions involving a pedestrian or cyclist" series={[S.collisions_pedestrian, S.collisions_bicycle]} kind="line" />
      <SeriesCard title="Collisions with a fatality" series={[S.collisions_fatal]} colorOffset={1} />
    </Shell>
  );
}
