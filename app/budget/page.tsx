import type { Metadata } from "next";
import Link from "next/link";
import PageNav from "@/components/PageNav";
import BudgetChart from "@/components/BudgetChart";
import { BUDGET_DATA, BUDGET_YEARS } from "@/lib/budget";
import { fmtDollars, fmtMoney, fmtPerResident } from "@/lib/format";
import { CPI_BASE_YEAR, CPI_SOURCE, LATEST_POPULATION_YEAR, POPULATION_SOURCE, inBaseYearDollars, perResident } from "@/lib/context";
import { DataSourceCitation } from "@/components/SourceCitation";
import type { ChartMode } from "@/components/BudgetChart";

export const metadata: Metadata = { title: "City Budget · Toronto Civic Data" };

// Every figure here comes from lib/budget.json, which carries the source file for each year.

const card: React.CSSProperties = { padding: "18px 16px 14px", borderRadius: 14, border: "1px solid var(--border)", background: "var(--surface)" };
const th: React.CSSProperties = { padding: "10px 12px", fontWeight: 600, borderBottom: "1px solid var(--border)" };
const td: React.CSSProperties = { padding: "9px 12px", fontVariantNumeric: "tabular-nums" };
const link: React.CSSProperties = { color: "var(--blue)", textDecoration: "underline", textUnderlineOffset: 2 };

export default function BudgetPage() {
  const modes: ChartMode[] = [
    { id: "dollars", label: "Dollars", unit: "money", points: BUDGET_YEARS.map(({ year, revenue, expenses }) => ({ year, revenue, expenses })) },
    {
      id: "per-resident", label: "Per resident", unit: "perResident",
      points: BUDGET_YEARS.map(({ year, revenue, expenses }) => ({ year, revenue: perResident(revenue, year), expenses: perResident(expenses, year) })),
      missingNote: `Statistics Canada hasn't published a population estimate after ${LATEST_POPULATION_YEAR} yet.`,
    },
    {
      id: "real", label: `Adjusted for inflation (${CPI_BASE_YEAR} $)`, unit: "money",
      points: BUDGET_YEARS.map(({ year, revenue, expenses }) => ({ year, revenue: inBaseYearDollars(revenue, year), expenses: inBaseYearDollars(expenses, year) })),
      missingNote: `Statistics Canada hasn't published a full-year price index after ${CPI_BASE_YEAR} yet.`,
    },
  ];
  const first = BUDGET_YEARS[0].year, last = BUDGET_YEARS[BUDGET_YEARS.length - 1].year;
  const gapYears = BUDGET_YEARS.filter(y => y.gap);

  return (
    <div style={{ maxWidth: 760, margin: "0 auto", paddingBottom: 48 }}>
      <PageNav />
      <header style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-0.03em", margin: "0 0 6px" }}>City budget</h1>
        <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: 0, lineHeight: 1.5 }}>
          The City&apos;s approved operating budget, {first}–{last}. Select a year to see where the money comes from and where it goes,
          or see every year side by side in{" "}<Link href="/budget/comparable" style={link}>groups that are comparable across years</Link>.
        </p>
      </header>

      <section style={card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
          <h2 style={{ fontSize: 14, fontWeight: 700, margin: 0 }}>Revenue and expenses</h2>
          <div style={{ display: "flex", gap: 12, fontSize: 11, color: "var(--text-secondary)" }}>
            <Swatch color="var(--revenue)" label="Revenue" />
            <Swatch color="var(--expense)" label="Expenses" />
          </div>
        </div>
        <BudgetChart modes={modes} />
      </section>

      <section style={{ marginTop: 28 }}>
        <h2 style={{ fontSize: 14, fontWeight: 700, margin: "0 0 10px" }}>Data table</h2>
        <div style={{ overflowX: "auto", border: "1px solid var(--border)", borderRadius: 12, background: "var(--surface)" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, minWidth: 660 }}>
            <thead>
              <tr style={{ color: "var(--text-secondary)", textAlign: "left" }}>
                <th style={th}>Year</th>
                <th style={{ ...th, textAlign: "right" }}>Revenue</th>
                <th style={{ ...th, textAlign: "right" }}>Expenses</th>
                <th style={{ ...th, textAlign: "right" }}>Difference</th>
                <th style={{ ...th, textAlign: "right" }}>Spending per resident</th>
                <th style={th}>Source</th>
              </tr>
            </thead>
            <tbody>
              {[...BUDGET_YEARS].reverse().map(y => (
                <tr key={y.year} style={{ borderBottom: "1px solid var(--border)" }}>
                  <td style={td}><Link href={`/budget/${y.year}`} style={link}>{y.year}</Link></td>
                  <td style={{ ...td, textAlign: "right" }}>{fmtDollars(y.revenue)}</td>
                  <td style={{ ...td, textAlign: "right" }}>{fmtDollars(y.expenses)}</td>
                  <td style={{ ...td, textAlign: "right", color: y.gap ? "var(--text-primary)" : "var(--text-secondary)" }}>
                    {y.gap ? fmtMoney(y.revenue - y.expenses) : "balanced"}
                  </td>
                  <td style={{ ...td, textAlign: "right" }}>{(() => { const pr = perResident(y.expenses, y.year); return pr ? fmtPerResident(pr) : <span style={{ color: "var(--text-secondary)" }}>n/a</span>; })()}</td>
                  <td style={td}><a href={y.source.fileUrl} target="_blank" rel="noopener noreferrer" style={link}>{y.year} file ↗</a></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section style={{ marginTop: 28, fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.6 }}>
        <h2 style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)", margin: "0 0 8px" }}>About this data</h2>
        <p style={{ margin: "0 0 8px" }}>
          From the City&apos;s{" "}
          <a href={BUDGET_DATA.dataset.datasetUrl} target="_blank" rel="noopener noreferrer" style={link}>{BUDGET_DATA.dataset.dataset}</a>{" "}
          dataset: one approved-budget file per year. These are gross operating figures as the files state them. They include inter-divisional charges and recoveries (money moving between City divisions), and don&apos;t include the capital budget.
        </p>
        {gapYears.length > 0 && (
          <p style={{ margin: "0 0 8px" }}>
            In {gapYears.map(y => y.year).join(", ")}, the files&apos; revenues and expenses differ. Each of those years&apos; pages shows which programs the difference sits in. The City&apos;s files don&apos;t explain it, so neither do we.
          </p>
        )}
        <p style={{ margin: "0 0 12px" }}>
          Per-resident figures divide by Statistics Canada&apos;s July 1 population estimate for the City of Toronto. Inflation-adjusted figures use Statistics Canada&apos;s consumer price index for the Toronto area, expressed in {CPI_BASE_YEAR} dollars.
        </p>
        <div style={{ display: "grid", gap: 10, marginBottom: 12 }}>
          <DataSourceCitation source={POPULATION_SOURCE} label="Population" />
          <DataSourceCitation source={CPI_SOURCE} label="Inflation" />
        </div>
        <p style={{ margin: 0 }}>
          Data generated {BUDGET_DATA.generatedOn} by <code>{BUDGET_DATA.generator}</code>.
        </p>
      </section>
    </div>
  );
}

function Swatch({ color, label }: { color: string; label: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
      <span style={{ width: 12, height: 12, borderRadius: 3, background: color }} />{label}
    </span>
  );
}
