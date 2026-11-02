import type { Metadata } from "next";
import { notFound } from "next/navigation";
import PageNav from "@/components/PageNav";
import { DataSourceCitation } from "@/components/SourceCitation";
import { card, link } from "@/components/BudgetParts";
import { Shell } from "@/components/SectionParts";
import { PROFILE_LABELS, SCHOOLS, TEST_LABELS, getSchool, schoolYears } from "@/lib/schools";
import type { SchoolValue } from "@/lib/types";

// One school's figures for every school year it appears in, straight from the Ministry's files
// (lib/schools-detail.json). Codes (N/R, N/D, SP…) are shown exactly as published.

export const dynamicParams = false;

export function generateStaticParams() {
  return SCHOOLS.schools.map(s => ({ id: s.id }));
}

export async function generateMetadata({ params }: PageProps<"/schools/[id]">): Promise<Metadata> {
  const { id } = await params;
  return { title: `${getSchool(id)?.name ?? "School"} · Toronto Civic Data` };
}

const th: React.CSSProperties = { padding: "7px 10px", fontWeight: 600, textAlign: "right", whiteSpace: "nowrap", borderBottom: "1px solid var(--border)" };
const td: React.CSSProperties = { padding: "6px 10px", textAlign: "right", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" };

function cell(v: SchoolValue, pct: boolean) {
  if (v == null) return <span style={{ color: "var(--text-secondary)" }}>—</span>;
  if (typeof v === "string") return <span style={{ color: "var(--text-secondary)" }} title="Code as published by the Ministry">{v}</span>;
  return pct ? `${Math.round(v)}%` : v.toLocaleString("en-CA");
}

export default async function SchoolPage({ params }: PageProps<"/schools/[id]">) {
  const { id } = await params;
  const school = getSchool(id);
  if (!school) notFound();
  const data = schoolYears(id);
  const years = SCHOOLS.schoolYears.filter(y => data[y]);
  const has = (k: string) => years.some(y => data[y][k] != null);
  const rows: [string, string, boolean][] = [
    ["enrolment", "Enrolment", false],
    ...Object.keys(TEST_LABELS).filter(has).map(k => [k, `${TEST_LABELS[k]}: % meeting the standard`, true] as [string, string, boolean]),
    ...Object.keys(PROFILE_LABELS).filter(has).map(k => [k, `${PROFILE_LABELS[k]} (%)`, true] as [string, string, boolean]),
  ];

  return (
    <Shell>
      <PageNav up={{ href: "/schools", label: "All schools" }} />
      <header style={{ marginBottom: 18 }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, letterSpacing: "-0.02em", margin: "0 0 6px" }}>{school.name}</h1>
        <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: 0, lineHeight: 1.55 }}>
          {school.board} · {school.level} · {school.language} · grades{" "}{school.grades}<br />
          {school.street}, {school.area}{" "}{school.postal}
        </p>
      </header>

      <section style={card}>
        <div style={{ overflowX: "auto", border: "1px solid var(--border)", borderRadius: 10 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, minWidth: 640 }}>
            <thead>
              <tr style={{ color: "var(--text-secondary)" }}>
                <th style={{ ...th, textAlign: "left" }}>&nbsp;</th>
                {years.map(y => <th key={y} style={th}>{y}{SCHOOLS.yearMeta[y].eqaoCarriedFrom ? " *" : ""}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map(([k, label, pct]) => (
                <tr key={k} style={{ borderTop: "1px solid var(--border)" }}>
                  <td style={{ ...td, textAlign: "left", whiteSpace: "normal", minWidth: 200 }}>{label}</td>
                  {years.map(y => {
                    const repeat = k in TEST_LABELS && SCHOOLS.yearMeta[y].eqaoCarriedFrom;
                    return <td key={y} style={{ ...td, opacity: repeat ? 0.5 : 1 }}>{cell(data[y][k], pct)}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {years.some(y => SCHOOLS.yearMeta[y].eqaoCarriedFrom) && (
          <p style={{ fontSize: 11, color: "var(--text-secondary)", margin: "10px 0 0" }}>
            * No provincial tests were given; the Ministry&apos;s file for this year repeats the {SCHOOLS.yearMeta[years.find(y => SCHOOLS.yearMeta[y].eqaoCarriedFrom)!].eqaoCarriedFrom}{" "}test results (faded).
          </p>
        )}
        <p style={{ fontSize: 11, color: "var(--text-secondary)", margin: "8px 0 0", lineHeight: 1.5 }}>
          Enrolment is rounded to the nearest 5 and percentages are randomly rounded by the Ministry; figures for fewer than 10 students
          aren&apos;t reported. Codes are shown as published — see the Ministry&apos;s{" "}
          <a href={SCHOOLS.glossaryUrl} target="_blank" rel="noopener noreferrer" style={link}>glossary</a>.
        </p>
        <details style={{ marginTop: 12 }}>
          <summary style={{ fontSize: 12, color: "var(--blue)", cursor: "pointer" }}>Sources ({years.length} files)</summary>
          <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
            {years.map(y => <DataSourceCitation key={y} source={{ ...SCHOOLS.sources[y].school, locator: `The row with School Number ${id}` }} label={y} />)}
          </div>
        </details>
      </section>
    </Shell>
  );
}
