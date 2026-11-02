import PageNav from "@/components/PageNav";
import { Shell, Header } from "@/components/SectionParts";
import { PlayersView, RefreshNote, SecondaryNote, TeamSubNav, TeamToggle, TeamView, type TeamPageKind } from "@/components/SportsParts";
import { SPORTS, getTeam } from "@/lib/sports";

// One team's page in the Sports section: its history (/sports for the first team, /sports/[team])
// or its player records (/sports/[team]/players).
export default function TeamPage({ id, kind = "history" }: { id: string; kind?: TeamPageKind }) {
  const team = getTeam(id)!;
  return (
    <Shell>
      <PageNav />
      <Header title="Sports">
        Toronto&apos;s pro teams: each season&apos;s record, playoff run and championships, and every player&apos;s totals with the team.
        Figures come from each league&apos;s own published data, except where a team&apos;s page says otherwise.
      </Header>
      <TeamToggle teams={SPORTS.teams} current={id} kind={kind} />
      <TeamSubNav team={team} kind={kind} />
      <SecondaryNote team={team} />
      {kind === "players" ? <PlayersView team={team} /> : <TeamView team={team} />}
      <RefreshNote generatedOn={SPORTS.generatedOn} />
    </Shell>
  );
}
