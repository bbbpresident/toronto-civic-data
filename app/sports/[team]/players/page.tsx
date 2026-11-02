import type { Metadata } from "next";
import { notFound } from "next/navigation";
import TeamPage from "../../TeamPage";
import { SPORTS, getTeam } from "@/lib/sports";

export const dynamicParams = false;

export function generateStaticParams() {
  return SPORTS.teams.filter(t => t.players).map(t => ({ team: t.id }));
}

export async function generateMetadata(props: PageProps<"/sports/[team]/players">): Promise<Metadata> {
  const { team } = await props.params;
  return { title: `${getTeam(team)?.name ?? "Team"} player records · Sports · Toronto Civic Data` };
}

export default async function PlayersPage(props: PageProps<"/sports/[team]/players">) {
  const { team } = await props.params;
  if (!getTeam(team)?.players) notFound();
  return <TeamPage id={team} kind="players" />;
}
