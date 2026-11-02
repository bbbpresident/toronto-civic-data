import type { Metadata } from "next";
import PageNav from "@/components/PageNav";
import SeriesCard from "@/components/SeriesCard";
import CensusTable from "@/components/CensusTable";
import { Header, KeyFigures, SectionTitle, Shell, change, latest, periodLabel, show } from "@/components/SectionParts";
import { PEOPLE, S } from "@/lib/people";

export const metadata: Metadata = { title: "People · Toronto Civic Data" };

// Every figure comes from lib/people.json (scripts/extract_people.py); each card and census value cites its file.

export default function PeoplePage() {
  const pop = latest(S.population), pop0 = S.population.points[0];
  const unemp = latest(S.unemployment);
  const census = (id: string) => PEOPLE.census.find(c => c.id === id)!;
  const imm = census("immigrants").values.at(-1)!, vm = census("visibleMinority").values.at(-1)!;
  return (
    <Shell>
      <PageNav />
      <Header title="People">
        Who lives in Toronto and how they&apos;re doing: population since {pop0.period}, what five censuses show, jobs, income and food
        bank use.
      </Header>

      <KeyFigures items={[
        { label: `Population, ${pop.period}`, value: `${((pop.value ?? 0) / 1e6).toFixed(2)}M`, sub: `${change(pop0, pop)} since ${pop0.period}` },
        { label: `Unemployment rate, ${periodLabel(unemp)}`, value: show(S.unemployment, unemp), sub: "City residents, 3-month average" },
        { label: `Immigrants, ${imm.year} census`, value: `${imm.value.toFixed(0)}%`, sub: "of residents" },
        { label: `Visible minorities, ${vm.year} census`, value: `${vm.value.toFixed(0)}%`, sub: "of residents" },
      ]} />

      <SectionTitle>Population</SectionTitle>
      <SeriesCard title="Population each year" blurb="Statistics Canada's July 1 estimate for the City of Toronto." series={[S.population]} />
      <CensusTable indicators={PEOPLE.census} />

      <SectionTitle>Work</SectionTitle>
      <SeriesCard
        title="Unemployment rate"
        blurb="City of Toronto residents, from Statistics Canada's Labour Force Survey: a seasonally adjusted three-month moving average, as the City reports it."
        series={[S.unemployment]} kind="line" baseline="auto" colorOffset={1}
      />
      <SeriesCard
        title="Employment and participation rates"
        blurb="Participation: the share of residents 15 and older working or looking for work. Employment: the share working."
        series={[S.participation, S.employmentRate]} kind="line" baseline="auto"
      />

      <SectionTitle>Income and need</SectionTitle>
      <SeriesCard title="Median income" blurb="Half of people with income in the Toronto region received more than this and half less. Statistics Canada expresses every year in the same dollars." series={[S.medianIncome]} colorOffset={2} />
      <SeriesCard title="People served by Daily Bread Food Bank programs, by month" series={[S.foodBank]} kind="line" colorOffset={3} />
    </Shell>
  );
}
