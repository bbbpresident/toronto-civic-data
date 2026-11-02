import type { Metadata } from "next";
import Link from "next/link";
import PageNav from "@/components/PageNav";
import SeriesCard from "@/components/SeriesCard";
import { link } from "@/components/BudgetParts";
import { Header, KeyFigures, SectionTitle, Shell, at, change, latest, periodLabel, show } from "@/components/SectionParts";
import { S } from "@/lib/transit";

export const metadata: Metadata = { title: "Transit · Toronto Civic Data" };

// Every figure comes from lib/transit.json (scripts/extract_transit.py); each card cites its files.

export default function TransitPage() {
  const rides = latest(S.annualRides), rides2019 = at(S.annualRides, "2019");
  const weekday = latest(S.weekdayRidership), elev = latest(S.elevators), elev0 = S.elevators.points[0];
  const recovery = rides2019?.value && rides.value ? (rides.value / rides2019.value) * 100 : null;
  return (
    <Shell>
      <PageNav />
      <Header title="Transit">
        TTC ridership since {S.annualRides.points[0].period}, month by month since 2008, and what the TTC reports each year about an
        average business day. For what the City spends on the TTC, see the{" "}
        <Link href="/budget" style={link}>City budget</Link>.
      </Header>

      <KeyFigures items={[
        { label: `Rides, ${rides.period}`, value: `${((rides.value ?? 0) / 1e6).toFixed(0)}M`, sub: recovery ? `${recovery.toFixed(0)}% of 2019's ${((rides2019!.value ?? 0) / 1e6).toFixed(0)}M` : undefined },
        { label: `Average weekday ridership, ${periodLabel(weekday)}`, value: show(S.weekdayRidership, weekday) },
        { label: `Elevators in service, ${elev.period}`, value: show(S.elevators, elev), sub: `${elev0.value} in ${elev0.period} (${change(elev0, elev)})` },
      ]} />

      <SectionTitle>Ridership</SectionTitle>
      <SeriesCard title="Rides each year" blurb="Peak and off-peak rides added together." series={[S.annualRides]} />
      <SeriesCard title="Peak and off-peak rides" series={[S.ridesOffPeak, S.ridesPeak]} kind="line" />
      <SeriesCard title="Rides each month" series={[S.monthlyRidership]} kind="line" />
      <SeriesCard title="Average weekday ridership, by month" series={[S.weekdayRidership]} kind="line" colorOffset={2} />

      <SectionTitle>An average business day</SectionTitle>
      <SeriesCard
        title="Daily trips on an average business day"
        blurb='From the TTC&apos;s annual Operating Statistics. "Fares collected" counts paying riders; "including transfers" adds the transfers they make along the way.'
        series={[S.businessDayFares, S.businessDayBoardings]}
      />
      <SeriesCard title="Busiest single day of the year" series={[S.busiestDay]} colorOffset={3} />

      <SectionTitle>Money and access</SectionTitle>
      <SeriesCard title="Ridership revenue" blurb="Ridership revenues as reported by the TTC, summed by year." series={[S.ridershipRevenue]} colorOffset={1} />
      <SeriesCard title="Elevators in service on the rail system" series={[S.elevators]} colorOffset={2} />
    </Shell>
  );
}
