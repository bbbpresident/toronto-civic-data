import type { Metadata } from "next";
import { notFound } from "next/navigation";
import PageNav from "@/components/PageNav";
import { card } from "@/components/BudgetParts";
import { Header, SectionTitle, Shell } from "@/components/SectionParts";
import { MethodNote, PromiseCard, Tally } from "@/components/PromiseParts";
import { CAMPAIGNS, STATUS, STATUS_ORDER, getCampaign } from "@/lib/promises";

export const dynamicParams = false;

export function generateStaticParams() {
  return CAMPAIGNS.map(c => ({ campaign: c.id }));
}

export async function generateMetadata({ params }: PageProps<"/promises/[campaign]">): Promise<Metadata> {
  const { campaign } = await params;
  const c = getCampaign(campaign);
  return { title: `${c?.mayor ?? "Campaign"} promises · Toronto Civic Data` };
}

export default async function CampaignPage({ params }: PageProps<"/promises/[campaign]">) {
  const { campaign } = await params;
  const c = getCampaign(campaign);
  if (!c) notFound();
  const sorted = [...c.promises].sort((a, b) => STATUS[a.status].order - STATUS[b.status].order);
  return (
    <Shell>
      <PageNav up={{ href: "/promises", label: "All campaigns" }} />
      <Header title={`${c.mayor}: campaign promises`}>
        From the {c.election} platform, quoted as archived on or before election day, with what City records show since. Records
        checked{" "}{c.checked}.
      </Header>
      <section style={card}>
        <Tally c={c} />
        {(c.missingPlatform || c.archiveNote) && (
          <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: "12px 0 0", lineHeight: 1.55 }}>{c.missingPlatform ?? c.archiveNote}</p>
        )}
        {c.platform && (
          <p style={{ fontSize: 12, margin: "8px 0 0" }}>
            <a href={c.platform.url} target="_blank" rel="noopener noreferrer" style={{ color: "var(--blue)", textDecoration: "underline", textUnderlineOffset: 2 }}>{c.platform.title} ↗</a>
          </p>
        )}
      </section>
      <MethodNote />

      {STATUS_ORDER.filter(s => sorted.some(p => p.status === s)).map(s => (
        <div key={s}>
          <SectionTitle>{STATUS[s].label}</SectionTitle>
          {sorted.filter(p => p.status === s).map(p => <PromiseCard key={p.id} p={p} c={c} />)}
        </div>
      ))}

      {c.notAssessed.length > 0 && (
        <>
          <SectionTitle>Not assessed</SectionTitle>
          <section style={{ ...card, marginTop: 12 }}>
            <ul style={{ margin: 0, paddingLeft: 16, fontSize: 13, lineHeight: 1.6 }}>
              {c.notAssessed.map(n => (
                <li key={n.promise} style={{ marginBottom: 6 }}>{n.promise} <span style={{ color: "var(--text-secondary)" }}>— {n.reason}</span></li>
              ))}
            </ul>
          </section>
        </>
      )}
    </Shell>
  );
}
