import type { Metadata } from "next";
import PageNav from "@/components/PageNav";
import SeriesCard from "@/components/SeriesCard";
import RankCard, { RankRow } from "@/components/RankCard";
import { Header, KeyFigures, SectionTitle, Shell, at } from "@/components/SectionParts";
import { LOBBYING } from "@/lib/lobbying";

export const metadata: Metadata = { title: "Lobbying · Toronto Civic Data" };

// Every figure comes from lib/lobbying.json (scripts/extract_lobbying.py); each card cites its file.

export default function LobbyingPage() {
  const S = LOBBYING.series, R = LOBBYING.ranks, y = String(LOBBYING.year);
  const contacts = at(S.contacts, y)!, regs = at(S.registrations, y)!, top = R.council.rows[0];
  return (
    <Shell>
      <PageNav />
      <Header title="Who lobbies City Hall">
        Lobbyists must register what they lobby the City about and report each contact with a councillor or City official. From the City&apos;s Lobbyist
        Registry: who lobbies, about what, and whom.
      </Header>
      <KeyFigures items={[
        { label: `Reported lobbying contacts, ${y}`, value: contacts.value!.toLocaleString("en-CA"), sub: "Meetings, emails, calls and letters",
          info: "Each contact between a lobbyist and a public office holder, counted once even when several lobbyists took part." },
        { label: `New registrations, ${y}`, value: regs.value!.toLocaleString("en-CA"), sub: "Subject matters lobbyists signed up to lobby on" },
        { label: `Most-lobbied member of Council, ${y}`, value: top.label, sub: `${top.value} contacts${top.sub ? ` · ${top.sub}` : ""}` },
      ]} />

      <SectionTitle>Over the years</SectionTitle>
      <SeriesCard title="Reported lobbying contacts each year" series={[S.contacts]} colorOffset={5} />
      <SeriesCard title="New subject-matter registrations each year" series={[S.registrations]} colorOffset={3} />

      <SectionTitle>Whom they lobby, {y}</SectionTitle>
      <RankRow>
        <RankCard rank={R.council} color="var(--s6)" blurb="Elected members only. Contacts with a councillor's staff aren't counted here." />
        <RankCard rank={R.offices} color="var(--s4)" blurb="City staff are counted by office, not named. Offices are as the lobbyist wrote them, so one division can appear twice." />
      </RankRow>

      <SectionTitle>Who lobbies, and about what, {y}</SectionTitle>
      <RankRow>
        <RankCard rank={R.clients} color="var(--s1)" blurb="The client a consultant lobbied for, or the organization of an in-house lobbyist." />
        <RankCard rank={R.subjects} color="var(--s3)" />
      </RankRow>
      <RankRow>
        <RankCard rank={R.kinds} color="var(--s5)" />
        <RankCard rank={R.methods} color="var(--s2)" />
      </RankRow>
    </Shell>
  );
}
