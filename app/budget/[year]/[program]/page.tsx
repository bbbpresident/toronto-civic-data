import type { Metadata } from "next";
import { notFound } from "next/navigation";
import PageNav from "@/components/PageNav";
import ViewToggle, { type View } from "@/components/ViewToggle";
import { DataSourceCitation } from "@/components/SourceCitation";
import { BudgetStyles, Lines, Panel, Stat, YearChips, card } from "@/components/BudgetParts";
import { fmtMoney } from "@/lib/format";
import { allProgramParams, getProgram, programYears } from "@/lib/budget-programs";
import { BUDGET_YEARS, getBudgetYear } from "@/lib/budget";
import { CPI_SOURCE, POPULATION_SOURCE, mbnFor, unitCost } from "@/lib/context";
import { ContextNotes, LineHistory, MbnCard, TrendBars, UnitCostCard } from "@/components/ContextParts";
import { ProgramComparableView } from "@/components/ComparableParts";

// One program's budget for one year: its spending by service and by type, and the revenue
// booked to it. Prerendered for every program in every year; anything else 404s.
// Every figure comes from that program's rows in the year's file (see its `source`).

export const dynamicParams = false;

export function generateStaticParams() {
  return allProgramParams();
}

export async function generateMetadata(props: PageProps<"/budget/[year]/[program]">): Promise<Metadata> {
  const { year, program } = await props.params;
  const p = getProgram(Number(year), program);
  return { title: `${p?.name ?? "Program"} · ${year} City Budget · Toronto Civic Data` };
}

export default async function ProgramPage(props: PageProps<"/budget/[year]/[program]">) {
  const { year: yearParam, program: slug } = await props.params;
  const year = Number(yearParam);
  const p = getProgram(year, slug);
  if (!p) notFound();
  const years = programYears(slug);
  const history = years.map(y => ({ year: y, amount: getProgram(y, slug)!.expenses }));
  const prev = history.find(h => h.year === year - 1);
  const prevRevenue = prev ? getProgram(prev.year, slug)!.revenue : 0;
  const city = getBudgetYear(year)!;
  const rank = city.expensesByProgram.findIndex(l => l.name === p.name) + 1;
  const uc = unitCost(p.name, year, p.expenses);
  const ucSeries = years.flatMap(y => {
    const pp = getProgram(y, slug)!, u = unitCost(pp.name, y, pp.expenses);
    return u ? [{ year: y, cost: u.cost }] : [];
  });
  const mbn = mbnFor(p.name, year);
  const hrefFor = (y: number) => `/budget/${y}/${slug}`;
  const revenueHistory = BUDGET_YEARS.map(({ year: y }) => {
    const pp = getProgram(y, slug);
    return { year: y, amount: pp ? pp.revenue : null, fileUrl: pp ? pp.source.fileUrl : null };
  });

  // A by-service view only adds something when the program has more than one service
  // (about 40% of programs have a single service, which would just repeat the total).
  const spending: View[] = [
    ...(p.expensesByService && p.expensesByService.length > 1
      ? [{ id: "service", label: `By service (${p.expensesByService.length})`, content: <Lines lines={p.expensesByService} total={p.expenses} color="var(--expense)" /> }]
      : []),
    { id: "type", label: "By type of spending", content: <Lines lines={p.expensesByCategory} total={p.expenses} color="var(--expense)" /> },
    { id: "comparable", label: "Comparable across years", content: <ProgramComparableView p={p} year={year} side="expenses" /> },
  ];
  const revenueViews: View[] = [
    { id: "category", label: "By category", content: <Lines lines={p.revenueByCategory} total={p.revenue} color="var(--revenue)" /> },
    { id: "comparable", label: "Comparable across years", content: <ProgramComparableView p={p} year={year} side="revenue" /> },
  ];

  const sides: View[] = [];
  if (p.expenses !== 0) {
    sides.push({
      id: "expenses", label: "Where its money goes", swatch: "var(--expense)", content: (
        <Panel title="Spending" total={p.expenses}>
          {spending.length > 1
            ? <ViewToggle label="Show spending" storageKey="program-expense-view" views={spending} />
            : <div style={{ marginTop: 8 }}>{spending[0].content}</div>}
          {!p.expensesByService && (
            <p style={{ fontSize: 11, color: "var(--text-secondary)", margin: "8px 0 0", lineHeight: 1.5 }}>
              The {year}{" "}file doesn&apos;t split programs into services (that column appears from 2015).
            </p>
          )}
        </Panel>
      ),
    });
  }
  if (p.revenue !== 0) {
    sides.push({
      id: "revenue", label: "Revenue booked to it", swatch: "var(--revenue)", content: (
        <Panel title="Revenue booked to this program" total={p.revenue}>
          <ViewToggle label="Show revenue" storageKey="program-revenue-view" views={revenueViews} />
          {years.length > 1 && (
            <div style={{ marginTop: 14 }}>
              <LineHistory name="Revenue booked to it" points={revenueHistory} current={year} color="var(--revenue)" hrefFor={hrefFor} missingWhat={`program named exactly “${p.name}”`} />
            </div>
          )}
        </Panel>
      ),
    });
  }

  return (
    <div style={{ maxWidth: 760, margin: "0 auto", paddingBottom: 48 }}>
      <BudgetStyles />
      <PageNav up={{ href: `/budget/${year}`, label: `${year} budget` }} />
      <YearChips label={`${p.name} by year`} years={years} current={year} hrefFor={y => `/budget/${y}/${slug}`} />

      <header style={{ marginBottom: 18 }}>
        <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: "0 0 4px" }}>{year} approved operating budget</p>
        <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-0.03em", margin: 0 }}>{p.name}</h1>
      </header>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
        <Stat label="Spending" value={p.expenses} color="var(--expense)" notes={<ContextNotes amount={p.expenses} year={year} prev={prev} />} />
        <Stat label="Revenue booked to this program" value={p.revenue} color="var(--revenue)" notes={<ContextNotes amount={p.revenue} year={year} prev={prev && { year: prev.year, amount: prevRevenue }} />} />
      </div>

      {p.expenses > 0 && (
        <section style={{ ...card, marginTop: 20 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 10px" }}>How big is this?</h2>
          <ul style={{ margin: "0 0 14px", paddingLeft: 18, fontSize: 13, lineHeight: 1.7 }}>
            {rank > 0 && <li>#{rank} of {city.expensesByProgram.length} programs by spending in {year}</li>}
            <li>{((p.expenses / city.expenses) * 100).toFixed(1)}% of all City operating spending ({fmtMoney(city.expenses)})</li>
          </ul>
          {history.length > 1 && (
            <>
              <h3 style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-secondary)", margin: "0 0 8px" }}>
                Spending by year
              </h3>
              <TrendBars points={history} current={year} hrefFor={hrefFor} />
            </>
          )}
        </section>
      )}

      <section style={{ ...card, marginTop: 20 }}>
        {sides.length > 1
          ? <ViewToggle size="lg" label="Spending or revenue" storageKey="program-side" views={sides} />
          : sides[0]?.content}
      </section>

      {uc && <UnitCostCard uc={uc} expenses={p.expenses} budgetSource={p.source} series={ucSeries} hrefFor={hrefFor} />}
      {mbn.map(block => <MbnCard key={block.area} block={block} />)}

      <p style={{ fontSize: 11, color: "var(--text-secondary)", margin: "16px 0 0", lineHeight: 1.5 }}>
        Program names change between the City&apos;s files, so the years above are the ones whose file uses the exact name “{p.name}”.
      </p>

      <div style={{ marginTop: 16 }}>
        <div style={{ display: "grid", gap: 10 }}>
          <DataSourceCitation source={p.source} label="Budget figures" />
          <DataSourceCitation source={POPULATION_SOURCE} label="Per-resident figures: population" />
          <DataSourceCitation source={CPI_SOURCE} label="After-inflation changes: consumer price index" />
        </div>
      </div>
    </div>
  );
}
