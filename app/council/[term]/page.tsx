import type { Metadata } from "next";
import { notFound } from "next/navigation";
import PageNav from "@/components/PageNav";
import CouncilTermView from "@/components/CouncilTerm";
import { Header, Shell } from "@/components/SectionParts";
import { TERMS, getTerm } from "@/lib/council";

export const dynamicParams = false;

export function generateStaticParams() {
  return TERMS.map(t => ({ term: t.term }));
}

export async function generateMetadata({ params }: PageProps<"/council/[term]">): Promise<Metadata> {
  const { term } = await params;
  return { title: `City Council ${term.replace("-", "–")} · Toronto Civic Data` };
}

export default async function CouncilTermPage({ params }: PageProps<"/council/[term]">) {
  const { term } = await params;
  const t = getTerm(term);
  if (!t) notFound();
  return (
    <Shell>
      <PageNav up={{ href: "/council", label: "City Council" }} />
      <Header title={`City Council, ${t.term.replace("-", "–")}`}>
        Recorded votes and attendance at City Council for the {t.term.replace("-", "–")}{" "}term, from the City Clerk&apos;s open data.
      </Header>
      <CouncilTermView t={t} />
    </Shell>
  );
}
