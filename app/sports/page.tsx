import type { Metadata } from "next";
import TeamPage from "./TeamPage";
import { TEAM_ORDER } from "@/components/SportsParts";

export const metadata: Metadata = { title: "Sports · Toronto Civic Data" };

export default function SportsPage() {
  return <TeamPage id={TEAM_ORDER[0]} />;
}
