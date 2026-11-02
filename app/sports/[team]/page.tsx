import type { Metadata } from "next";
import { notFound } from "next/navigation";
import TeamPage from "../TeamPage";
import { TEAM_ORDER } from "@/components/SportsParts";
import { getTeam } from "@/lib/sports";

export const dynamicParams = false;

// The first team's history is /sports itself; /sports/[first] renders it too so every team has the same paths.
export function generateStaticParams() {
  return TEAM_ORDER.map(team => ({ team }));
}

export async function generateMetadata(props: PageProps<"/sports/[team]">): Promise<Metadata> {
  const { team } = await props.params;
  return { title: `${getTeam(team)?.name ?? "Team"} · Sports · Toronto Civic Data` };
}

export default async function SportsTeamPage(props: PageProps<"/sports/[team]">) {
  const { team } = await props.params;
  if (!getTeam(team)) notFound();
  return <TeamPage id={team} />;
}
