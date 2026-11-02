import type { Metadata } from "next";
import PageNav from "@/components/PageNav";
import SeriesCard from "@/components/SeriesCard";
import { Header, KeyFigures, SectionTitle, Shell, at, change, latest, periodLabel, show } from "@/components/SectionParts";
import { S } from "@/lib/housing";

export const metadata: Metadata = { title: "Housing · Toronto Civic Data" };

// Every figure comes from lib/housing.json (scripts/extract_housing.py); each card cites its files.

export default function HousingPage() {
  const rent = latest(S.rent2br), rent10 = at(S.rent2br, String(+rent.period - 10));
  const price = latest(S.homePrice), starts = latest(S.starts), wait = latest(S.socialHousingWaitlist);
  return (
    <Shell>
      <PageNav />
      <Header title="Housing">
        What it costs to rent and buy, how much is being built, and how many people are waiting for housing help. Rents and
        construction figures cover the whole Toronto region (the census metropolitan area); prices, permits, applications and the wait
        list are the City&apos;s own figures.
      </Header>

      <KeyFigures items={[
        { label: `Average 2-bedroom rent, ${rent.period}`, value: show(S.rent2br, rent), sub: rent10 ? `${change(rent10, rent)} since ${rent10.period} · Toronto region` : "Toronto region" },
        { label: `Average home price, ${periodLabel(price)}`, value: show(S.homePrice, price), sub: "City of Toronto" },
        { label: `Housing starts, ${starts.period}`, value: show(S.starts, starts), sub: "Toronto region" },
        { label: `Social housing wait list, ${periodLabel(wait)}`, value: show(S.socialHousingWaitlist, wait), sub: "City of Toronto" },
      ]} />

      <SectionTitle>Renting</SectionTitle>
      <SeriesCard
        title="Average monthly rent by unit size"
        blurb="CMHC average rents for row and apartment buildings of three or more units, as published by Statistics Canada. Not adjusted for inflation."
        series={[S.rentBachelor, S.rent1br, S.rent2br, S.rent3br]} kind="line"
      />

      <SectionTitle>Building</SectionTitle>
      <SeriesCard
        title="Homes started and completed each year"
        blurb="CMHC counts of housing units started and completed, summed over each year's months."
        series={[S.starts, S.completions]} kind="line"
      />
      <SeriesCard
        title="What kind of homes are being started"
        blurb="Housing starts by CMHC's type of unit."
        series={[S.startsApartment, S.startsSingle, S.startsRow, S.startsSemi]} kind="line"
      />
      <SeriesCard title="Homes under construction at year end" series={[S.underConstruction]} />
      <SeriesCard
        title="Construction value of building permits issued"
        blurb="The estimated cost of the work in the permits the City issued each year. Residential is part of the all-permits total, not in addition to it."
        series={[S.permitValue, S.permitValueResidential]} kind="line"
      />
      <SeriesCard
        title="Planning applications received"
        blurb="Applications received by City Planning each year: Community Planning applications and Committee of Adjustment applications, as the City counts them."
        series={[S.adjustmentApps, S.planningApps]} kind="line"
      />

      <SectionTitle>Buying</SectionTitle>
      <SeriesCard title="Average home price, by month" blurb="The City of Toronto's monthly average home price, as reported by the Toronto Real Estate Board." series={[S.homePrice]} kind="line" />
      <SeriesCard title="Homes sold each year" series={[S.homeSales]} />

      <SectionTitle>Housing need</SectionTitle>
      <SeriesCard title="Waiting list for social housing" blurb="The size of the waiting list for social housing in the City of Toronto, each quarter, as reported by the City's Housing Secretariat." series={[S.socialHousingWaitlist]} kind="line" />
      <SeriesCard
        title="People staying in shelters, average per night, since 2007"
        blurb="The average number of people using the City's shelter and overnight services each night, by quarter, from the City's dashboard summary. This is the longest record; the shelter-system charts below go into more detail but start in 2021."
        series={[S.shelterSingles, S.shelterFamilies]} kind="line"
      />

      <SectionTitle>The shelter system, since 2021</SectionTitle>
      <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: "10px 0 0", lineHeight: 1.55 }}>
        From the City&apos;s daily list of every overnight program it tracks: shelters, hotel programs, respite sites, warming centres and
        others. Each month shows the average night. A <em>site</em>{" "}is one address; a <em>program</em>{" "}is one service, and a site can
        run several. People-per-night totals here cover more types of service than the dashboard summary above, so the two don&apos;t
        match exactly. The City&apos;s earlier file (2017–2020) is no longer published, so this record starts in 2021.
      </p>
      <SeriesCard title="Shelter sites and programs" series={[S.shelterSites, S.shelterPrograms]} kind="line" />
      <SeriesCard
        title="People per night, and the beds and rooms available"
        blurb="As the City describes it, beds are typically counted in programs with shared sleeping areas, and rooms in programs where a room isn't shared between households, typically family and hotel programs. A room can hold more than one person, so people can exceed beds plus rooms."
        series={[S.shelterPeople, S.shelterBeds, S.shelterRooms]} kind="line"
      />
      <SeriesCard
        title="How full the system is"
        blurb="Occupied beds and rooms as a share of those usable that night (beds or rooms out of service for repairs, outbreaks or similar aren't counted as available)."
        series={[S.shelterOccBeds, S.shelterOccRooms]} kind="line" baseline="auto"
      />
      <SeriesCard
        title="People per night, by who the program serves"
        blurb="Each program serves one group, as the City classifies it."
        series={[S.shelterSectorMixedAdult, S.shelterSectorFamilies, S.shelterSectorMen, S.shelterSectorWomen, S.shelterSectorYouth]} kind="line"
      />
      <SeriesCard
        title="Sites by type of service"
        blurb="The three most common types of overnight service. Warming centres, surge sites and the other types each have fewer sites."
        series={[S.shelterTypeShelter, S.shelterTypeHotelshelter, S.shelterType24hourrespite]} kind="line"
      />
    </Shell>
  );
}
