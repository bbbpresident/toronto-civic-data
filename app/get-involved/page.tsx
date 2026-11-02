import type { Metadata } from "next";
import PageNav from "@/components/PageNav";
import { Shell, Header } from "@/components/SectionParts";
import { PageSourceLink } from "@/components/SourceCitation";
import { card } from "@/components/BudgetParts";
import { ACTIONS } from "@/lib/get-involved";

export const metadata: Metadata = { title: "Get involved · Toronto Civic Data" };

export default function GetInvolvedPage() {
  return (
    <Shell>
      <PageNav />
      <Header title="Get involved">
        The City&apos;s own forms and contacts for taking part: listing an event, reaching the mayor or your councillor, asking for a service,
        and speaking at City Hall. Every link goes to toronto.ca.
      </Header>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 300px), 1fr))", gap: 12 }}>
        {ACTIONS.map(a => (
          <section key={a.title} style={{ ...card, display: "flex", flexDirection: "column", gap: 8 }}>
            <h2 style={{ fontSize: 16, fontWeight: 800, margin: 0 }}>{a.title}</h2>
            <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: 0, lineHeight: 1.55, flex: 1 }}>{a.blurb}</p>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
              <a href={a.href} target={a.href.startsWith("mailto:") ? undefined : "_blank"} rel="noopener noreferrer"
                style={{ fontSize: 14, fontWeight: 700, padding: "8px 14px", borderRadius: 10, background: "var(--blue)", color: "#0b0e15", textDecoration: "none" }}>
                {a.cta}{a.href.startsWith("mailto:") ? "" : " ↗"}
              </a>
              <PageSourceLink source={a.source} />
            </div>
          </section>
        ))}
      </div>
      <p style={{ fontSize: 11, color: "var(--text-secondary)", margin: "18px 0 0", lineHeight: 1.55 }}>Links checked {ACTIONS[0].source.accessed}. Know a City form that belongs here? Tell us.</p>
    </Shell>
  );
}
