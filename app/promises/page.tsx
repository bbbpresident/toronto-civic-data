import type { Metadata } from "next";
import Link from "next/link";
import PageNav from "@/components/PageNav";
import { card } from "@/components/BudgetParts";
import { Header, Shell } from "@/components/SectionParts";
import { MethodNote, Tally } from "@/components/PromiseParts";
import { CAMPAIGNS } from "@/lib/promises";

export const metadata: Metadata = { title: "Campaign Promises · Toronto Civic Data" };

// Overview of each mayoral campaign's assessed promises. Data: lib/promises.json (hand-curated).

export default function PromisesPage() {
  return (
    <Shell>
      <PageNav />
      <Header title="Campaign promises">
        What each winning mayoral candidate promised, quoted from their own platform, and what official City records show happened.
        Statuses are checked against Council votes, budgets and City reports only.
      </Header>
      <MethodNote />
      <div style={{ display: "grid", gap: 12, marginTop: 16 }}>
        {CAMPAIGNS.map(c => (
          <Link key={c.id} href={`/promises/${c.id}`} style={{ ...card, display: "block", color: "inherit", textDecoration: "none" }}>
            <div style={{ fontSize: 16, fontWeight: 700 }}>{c.mayor} →</div>
            <div style={{ fontSize: 12, color: "var(--text-secondary)", margin: "2px 0 12px" }}>{c.election}</div>
            <Tally c={c} />
          </Link>
        ))}
      </div>
      <p style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 16, lineHeight: 1.5 }}>
        The further back a campaign, the less of its platform survives in the Internet Archive and the fewer City records are online, so
        older campaigns have fewer assessed promises. Each campaign page says what&apos;s missing.
      </p>
    </Shell>
  );
}
