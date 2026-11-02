import type { Metadata } from "next";
import PageNav from "@/components/PageNav";
import CouncilTermView from "@/components/CouncilTerm";
import { Header, Shell } from "@/components/SectionParts";
import { TERMS } from "@/lib/council";

export const metadata: Metadata = { title: "City Council · Toronto Civic Data" };

// The current term; other terms live at /council/[term]. Data: lib/council.json (scripts/extract_council.py).

export default function CouncilPage() {
  const t = TERMS[TERMS.length - 1];
  return (
    <Shell>
      <PageNav />
      <Header title="City Council">
        Every recorded vote at City Council since 2008 and every member&apos;s attendance, from the City Clerk&apos;s open data. Pick a
        term to see how often each member voted, sided with the mayor or the majority, and showed up — and the closest calls.
      </Header>
      <CouncilTermView t={t} />
    </Shell>
  );
}
