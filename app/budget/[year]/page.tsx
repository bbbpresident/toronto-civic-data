import type { Metadata } from "next";
import Link from "next/link";
import PageNav from "@/components/PageNav";
import ViewToggle from "@/components/ViewToggle";
import { notFound } from "next/navigation";
import { BUDGET_YEARS, getBudgetYear, revenueCategoryHistory } from "@/lib/budget";
import { fmtMoney } from "@/lib/format";
import { DataSourceCitation } from "@/components/SourceCitation";
import type { BudgetYear } from "@/lib/types";
import { ContextNotes, LineHistory } from "@/components/ContextParts";
import { ComparableView } from "@/components/ComparableParts";
import { CPI_SOURCE, POPULATION_SOURCE } from "@/lib/context";
import { BudgetStyles, Lines, Panel, Stat, TopPrograms, YearChips, card, link } from "@/components/BudgetParts";

// One year's breakdown. Prerendered for every year in budget.json; other years 404.
// Every figure comes from that year's entry, which carries its source file.

export const dynamicParams = false;

export function generateStaticParams() {
  return BUDGET_YEARS.map(y => ({ year: String(y.year) }));
}

export async function generateMetadata(props: PageProps<"/budget/[year]">): Promise<Metadata> {
  const { year } = await props.params;
  return { title: `${year} City Budget · Toronto Civic Data` };
}

export default async function BudgetYearPage(props: PageProps<"/budget/[year]">) {
  const { year } = await props.params;
  const b = getBudgetYear(Number(year));
  if (!b) notFound();
  const prev = BUDGET_YEARS.find(y => y.year === b.year - 1);

  return (
    <div style={{ maxWidth: 760, margin: "0 auto", paddingBottom: 48 }}>
      <BudgetStyles />
      <PageNav up={{ href: "/budget", label: "All years" }} />
      <YearChips label="Budget year" years={BUDGET_YEARS.map(y => y.year)} current={b.year} hrefFor={y => `/budget/${y}`} />

      <header style={{ marginBottom: 18 }}>
        <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-0.03em", margin: "0 0 4px" }}>{b.label}</h1>
        <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: 0 }}>
          {b.programCount} programs, divisions and agencies ·{" "}
          <a href={b.source.fileUrl} target="_blank" rel="noopener noreferrer" style={link}>source file ↗</a>
        </p>
      </header>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
        <Stat label="Revenue" value={b.revenue} color="var(--revenue)" notes={<ContextNotes amount={b.revenue} year={b.year} prev={prev && { year: prev.year, amount: prev.revenue }} />} />
        <Stat label="Expenses" value={b.expenses} color="var(--expense)" notes={<ContextNotes amount={b.expenses} year={b.year} prev={prev && { year: prev.year, amount: prev.expenses }} />} />
      </div>

      <GapNote b={b} />

      <section style={{ ...card, marginTop: 20 }}>
        <ViewToggle size="lg" label="Revenue or expenses" storageKey="budget-side" views={[
          {
            id: "revenue", label: "Where the money comes from", swatch: "var(--revenue)", content: (
              <Panel title="Revenue" total={b.revenue}>
                <ViewToggle label="Show revenue" storageKey="budget-revenue-view" views={[
                  {
                    id: "category", label: "By category", content: (
                      <>
                        <Lines lines={b.revenueByCategory} total={b.revenue} color="var(--revenue)" trend={l => (
                          <LineHistory name={l.name} points={revenueCategoryHistory(l.name)} current={b.year} color="var(--revenue)" hrefFor={y => `/budget/${y}`} />
                        )} />
                        <p style={{ fontSize: 11, color: "var(--text-secondary)", margin: "8px 0 0", lineHeight: 1.5 }}>Select a category to see it by year.</p>
                        {!b.hasSubCategories && (
                          <p style={{ fontSize: 11, color: "var(--text-secondary)", margin: "8px 0 0", lineHeight: 1.5 }}>
                            The {b.year}{" "}file has no sub-categories (they appear in the City&apos;s files from 2019). Switch to By program to see which programs the revenue is booked to.
                          </p>
                        )}
                      </>
                    ),
                  },
                  { id: "program", label: `By program (${b.revenueByProgram.length})`, content: <TopPrograms lines={b.revenueByProgram} total={b.revenue} color="var(--revenue)" hrefBase={`/budget/${b.year}`} /> },
                  { id: "comparable", label: "Comparable across years", content: <ComparableView y={b} side="revenue" /> },
                ]} />
              </Panel>
            ),
          },
          {
            id: "expenses", label: "Where the money goes", swatch: "var(--expense)", content: (
              <Panel title="Expenses" total={b.expenses}>
                <ViewToggle label="Show expenses" storageKey="budget-expense-view" views={[
                  { id: "program", label: `By program (${b.expensesByProgram.length})`, content: <TopPrograms lines={b.expensesByProgram} total={b.expenses} color="var(--expense)" hrefBase={`/budget/${b.year}`} /> },
                  { id: "type", label: "By type of spending", content: <Lines lines={b.expensesByCategory} total={b.expenses} color="var(--expense)" /> },
                  { id: "comparable", label: "Comparable across years", content: <ComparableView y={b} side="expenses" /> },
                ]} />
              </Panel>
            ),
          },
        ]} />
      </section>

      <div style={{ marginTop: 24 }}>
        <div style={{ display: "grid", gap: 10 }}>
          <DataSourceCitation source={b.source} label="Budget figures" />
          <DataSourceCitation source={POPULATION_SOURCE} label="Per-resident figures: population" />
          <DataSourceCitation source={CPI_SOURCE} label="After-inflation changes: consumer price index" />
        </div>
      </div>

      <YearPager b={b} />
    </div>
  );
}

// ── Pieces ────────────────────────────────────────────────────────────────────

function GapNote({ b }: { b: BudgetYear }) {
  const diff = b.revenue - b.expenses;
  if (!b.gap) {
    return <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: "12px 0 0" }}>Revenue and expenses balance in this file.</p>;
  }
  const more = diff > 0 ? "revenue exceeds expenses" : "expenses exceed revenue";
  return (
    <div style={{ ...card, marginTop: 12, fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.6 }}>
      <strong style={{ color: "var(--text-primary)" }}>In this file, {more} by {fmtMoney(Math.abs(diff))}.</strong>{" "}
      {b.gap.explained ? (
        <>
          The difference is in {b.gap.programs.filter(p => p.net !== 0).length === 1 ? "one program" : "these programs"}, each shown as its revenue minus its expenses:
          <ul style={{ margin: "6px 0", paddingLeft: 18 }}>
            {b.gap.programs.filter(p => p.net !== 0).map(p => (
              <li key={p.name}><span style={{ color: "var(--text-primary)" }}>{p.name}</span>: {p.net > 0 ? "+" : ""}{fmtMoney(p.net)}</li>
            ))}
          </ul>
          Every other program combined nets to {b.gap.restNet < 0 ? "−" : ""}${Math.abs(b.gap.restNet).toFixed(2)}. The City&apos;s file doesn&apos;t say why.
        </>
      ) : (
        <>The City&apos;s file doesn&apos;t say why.</>
      )}
    </div>
  );
}

function YearPager({ b }: { b: BudgetYear }) {
  const i = BUDGET_YEARS.findIndex(y => y.year === b.year);
  const prev = BUDGET_YEARS[i - 1], next = BUDGET_YEARS[i + 1];
  const btn: React.CSSProperties = { fontSize: 13, color: "var(--blue)", textDecoration: "none", padding: "8px 12px", border: "1px solid var(--border)", borderRadius: 10 };
  return (
    <div style={{ display: "flex", justifyContent: "space-between", marginTop: 24 }}>
      {prev ? <Link href={`/budget/${prev.year}`} style={btn}>← {prev.year}</Link> : <span />}
      {next ? <Link href={`/budget/${next.year}`} style={btn}>{next.year} →</Link> : <span />}
    </div>
  );
}
