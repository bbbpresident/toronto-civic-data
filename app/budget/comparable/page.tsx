import type { Metadata } from "next";
import PageNav from "@/components/PageNav";
import ViewToggle from "@/components/ViewToggle";
import { BudgetStyles, card, link } from "@/components/BudgetParts";
import { BASIS, ComparableCharts, RuleList } from "@/components/ComparableParts";
import { BUDGET_DATA, BUDGET_YEARS } from "@/lib/budget";
import { CPI_BASE_YEAR } from "@/lib/context";

export const metadata: Metadata = { title: "Budget, comparable across years · Toronto Civic Data" };

// The budget regrouped so each group means the same thing in every year. Groups and rules come
// from lib/budget-crosswalk.json; the amounts from lib/budget.json (scripts/extract_budget.py),
// each year's from that year's file.

export default function ComparableBudgetPage() {
  const first = BUDGET_YEARS[0].year, last = BUDGET_YEARS[BUDGET_YEARS.length - 1].year;
  return (
    <div style={{ maxWidth: 760, margin: "0 auto", paddingBottom: 48 }}>
      <BudgetStyles />
      <PageNav up={{ href: "/budget", label: "All years" }} />
      <header style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-0.03em", margin: "0 0 6px" }}>Comparable across years</h1>
        <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: 0, lineHeight: 1.55 }}>
          The City&apos;s budget files rename and regroup their categories from year to year, so the same money can sit under a
          different name. Here every year&apos;s rows are sorted into the same groups, {first}–{last}, using the rules listed below.
          Each year&apos;s groups add up exactly to that year&apos;s file, and each bar&apos;s table links the file it comes from.
        </p>
      </header>

      <section style={card}>
        <ViewToggle size="lg" label="Revenue or expenses" storageKey="comparable-side" views={[
          { id: "revenue", label: "Where the money comes from", swatch: "var(--revenue)", content: <ComparableCharts side="revenue" current={last} /> },
          { id: "expenses", label: "Where the money goes", swatch: "var(--expense)", content: <ComparableCharts side="expenses" current={last} /> },
        ]} />
        <p style={{ fontSize: 11, color: "var(--text-secondary)", margin: "12px 0 0", lineHeight: 1.5 }}>
          Each chart has its own scale. Select a bar to open that year&apos;s budget. Not adjusted for inflation; hover a bar for the
          amount in {CPI_BASE_YEAR}{" "}dollars where available.
        </p>
      </section>

      <h2 style={{ fontSize: 16, fontWeight: 700, margin: "28px 0 6px" }}>How the groups are built</h2>
      <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: "0 0 12px", lineHeight: 1.6 }}>
        Each rule sorts some of a year&apos;s rows into a group; the first rule that matches a row wins. Each rule says why it&apos;s
        safe:{" "}
        {Object.values(BASIS).map((b, i, a) => <span key={b}>&ldquo;{b}&rdquo;{i < a.length - 1 ? ", " : "."}</span>)}{" "}
        The script that builds this data stops if any row matches no rule, if a year&apos;s groups don&apos;t add up to its file, or if
        a document&apos;s figure is more than 0.1% away from the file.
      </p>
      <section id="rules-revenue" style={{ ...card, scrollMarginTop: 16 }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, margin: "0 0 10px" }}>Revenue</h3>
        <RuleList side="revenue" />
      </section>
      <section id="rules-expenses" style={{ ...card, marginTop: 12, scrollMarginTop: 16 }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, margin: "0 0 10px" }}>Expenses</h3>
        <RuleList side="expenses" />
      </section>

      <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: "20px 0 0", lineHeight: 1.6 }}>
        From the City&apos;s{" "}
        <a href={BUDGET_DATA.dataset.datasetUrl} target="_blank" rel="noopener noreferrer" style={link}>{BUDGET_DATA.dataset.dataset}</a>{" "}
        dataset. Rules: <code>lib/budget-crosswalk.json</code>; data generated {BUDGET_DATA.generatedOn} by <code>{BUDGET_DATA.generator}</code>.
      </p>
    </div>
  );
}
