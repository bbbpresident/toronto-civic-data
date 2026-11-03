import type { Metadata } from "next";
import PageNav from "@/components/PageNav";
import SeriesCard from "@/components/SeriesCard";
import RankCard, { RankRow } from "@/components/RankCard";
import { Header, KeyFigures, SectionTitle, Shell, latest } from "@/components/SectionParts";
import { fmtMoney } from "@/lib/format";
import { FIRE } from "@/lib/fire";

export const metadata: Metadata = { title: "Fires · Toronto Civic Data" };

// Every figure comes from lib/fire.json (scripts/extract_fire.py); each card cites its file.

export default function FirePage() {
  const S = FIRE.series, R = FIRE.ranks, y = FIRE.latestYear;
  const f = latest(S.fires), hurt = latest(S.casualties), loss = latest(S.loss), resp = latest(S.response);
  const alarms = R.alarms.rows, total = alarms.reduce((a, r) => a + r.value, 0);
  const worked = alarms.find(r => r.label === "Smoke alarm present and operated")?.value ?? 0;
  return (
    <Shell>
      <PageNav />
      <Header title="Fires">
        Every fire Toronto Fire Services responded to since {S.fires.points[0].period}{" "}that counts as a fire under the Ontario Fire Marshal&apos;s rules,
        through {y}: how many, the harm and damage, what started them, and whether smoke alarms worked.
      </Header>
      <KeyFigures items={[
        { label: `Fires and explosions, ${f.period}`, value: f.value!.toLocaleString("en-CA"), sub: `Plus ${latest(S.outdoor).value!.toLocaleString("en-CA")} no-loss outdoor fires` },
        { label: `Civilian casualties, ${hurt.period}`, value: String(hurt.value), sub: "People hurt or killed (the file doesn't separate them)" },
        { label: `Estimated damage, ${loss.period}`, value: fmtMoney(loss.value!) },
        { label: `Typical time to arrive, ${resp.period}`, value: `${resp.value} min`, sub: "Median, from alarm to first truck on scene" },
      ]} />

      <SectionTitle>Over the years</SectionTitle>
      <SeriesCard title="Fires each year" blurb="No-loss outdoor fires (a grass or dumpster fire with no damage) are only in the file from 2018, so they're shown separately."
        series={[S.fires, S.outdoor]} colorOffset={1} />
      <SeriesCard title="Civilian casualties each year" series={[S.casualties]} colorOffset={1} />
      <SeriesCard title="Estimated dollar loss each year" series={[S.loss]} colorOffset={4} />
      <SeriesCard title="Typical minutes from alarm to arrival" series={[S.response]} decimals={1} kind="line" />

      <SectionTitle>Causes, {y}</SectionTitle>
      <RankRow>
        <RankCard rank={R.sources} color="var(--s2)" blurb="Cooking and vehicles lead. Fires where the source is undetermined aren't listed." />
        <RankCard rank={R.places} color="var(--s4)" />
      </RankRow>
      <RankRow>
        <RankCard rank={R.causes} color="var(--s6)" />
        <RankCard rank={R.alarms} color="var(--s3)" blurb={`A smoke alarm went off in ${Math.round((worked / total) * 100)}% of the fires where the file says.`} />
      </RankRow>
    </Shell>
  );
}
