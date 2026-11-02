import Link from "next/link";
import { fmtChange, fmtDollars, fmtMoney, fmtPerResident } from "@/lib/format";
import { CPI_BASE_YEAR, fmtMbnResult, inBaseYearDollars, perResident, type MbnBlock, type UnitCost } from "@/lib/context";
import { DataSourceCitation } from "@/components/SourceCitation";
import { Collapsible, card, link } from "@/components/BudgetParts";
import type { DataSource } from "@/lib/types";

// Server components that put a budget figure in context: per resident, change vs last year
// (before and after inflation), a multi-year trend, cost per unit of service, and MBNCanada
// measures. Each takes figures that already carry sources; none computes anything it can't cite.

/** "$5,890 per resident · vs 2023 +6.1% (+3.3% after inflation)" */
export function ContextNotes({ amount, year, prev }: { amount: number; year: number; prev?: { year: number; amount: number } }) {
  const pr = perResident(amount, year);
  const parts: React.ReactNode[] = [];
  parts.push(pr != null ? <span key="pr">{fmtPerResident(pr)} per resident</span> : <span key="pr">per resident: n/a for {year}</span>);
  if (prev && prev.amount) {
    const nominal = amount / prev.amount - 1;
    const a = inBaseYearDollars(amount, year), b = inBaseYearDollars(prev.amount, prev.year);
    parts.push(
      <span key="ch">
        vs {prev.year}: {fmtChange(nominal)}
        {a != null && b != null ? ` (${fmtChange(a / b - 1)} after inflation)` : ""}
      </span>,
    );
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2, marginTop: 6, fontSize: 11, color: "var(--text-secondary)" }}>
      {parts}
    </div>
  );
}

/** Small bars of a program's spending across the years its name appears; each bar links to that year. */
export function TrendBars({ points, current, hrefFor }: { points: { year: number; amount: number }[]; current: number; hrefFor: (y: number) => string }) {
  const max = Math.max(...points.map(p => p.amount), 1);
  const H = 90;
  return (
    <div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: H }}>
        {points.map(p => {
          const real = inBaseYearDollars(p.amount, p.year);
          const on = p.year === current;
          return (
            <Link
              key={p.year}
              href={hrefFor(p.year)}
              title={`${p.year}: ${fmtDollars(p.amount)}${real != null ? ` (${fmtMoney(real)} in ${CPI_BASE_YEAR} dollars)` : ""}`}
              aria-label={`${p.year}: ${fmtMoney(p.amount)}`}
              aria-current={on ? "page" : undefined}
              style={{ flex: 1, height: "100%", display: "flex", alignItems: "flex-end" }}
            >
              <span style={{ width: "100%", height: Math.max(2, (p.amount / max) * H), background: "var(--expense)", opacity: on ? 1 : 0.45, borderRadius: "3px 3px 0 0" }} />
            </Link>
          );
        })}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "var(--text-secondary)", marginTop: 4, fontVariantNumeric: "tabular-nums" }}>
        <span>{points[0].year} · {fmtMoney(points[0].amount)}</span>
        <span>{points[points.length - 1].year} · {fmtMoney(points[points.length - 1].amount)}</span>
      </div>
    </div>
  );
}

export interface HistoryPoint { year: number; amount: number | null; fileUrl: string | null }

/** One budget line's amount in every year's file. `amount` is null where that year's file has no
 *  line with this exact name: those years stay empty and aren't links. The current year is solid;
 *  each bar links to that year's page, and the table cites every year's file. */
export function LineHistory({ name, points, current, color, hrefFor, missingWhat = `line named exactly “${name}”`, renamed = true }: {
  name: string; points: HistoryPoint[]; current: number; color: string; hrefFor: (y: number) => string;
  /** What the missing years' files lack, e.g. `program named exactly "Parks"`. */
  missingWhat?: string;
  /** Whether missing years are explained by names changing between files (false for comparable groups). */
  renamed?: boolean;
}) {
  const H = 80;
  const max = Math.max(...points.map(p => p.amount ?? 0), 1);
  const present = points.filter(p => p.amount != null);
  const missing = points.filter(p => p.amount == null).map(p => p.year);
  const firstP = present[0], lastP = present[present.length - 1];
  return (
    <div style={{ margin: "0 0 10px", padding: "10px 12px", borderRadius: 10, background: "var(--surface-2)" }}>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text-secondary)", marginBottom: 8 }}>
        {name}, by year
      </div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: H }}>
        {points.map(p => {
          const on = p.year === current;
          if (p.amount == null) {
            return <span key={p.year} title={`${p.year}: no ${missingWhat} in this year's file`} style={{ flex: 1, height: 2, borderTop: "1px dashed var(--border)" }} />;
          }
          const real = inBaseYearDollars(p.amount, p.year);
          return (
            <Link
              key={p.year}
              href={hrefFor(p.year)}
              title={`${p.year}: ${fmtDollars(p.amount)}${real != null ? ` (${fmtMoney(real)} in ${CPI_BASE_YEAR} dollars)` : ""}`}
              aria-label={`${p.year}: ${fmtMoney(p.amount)}`}
              aria-current={on ? "page" : undefined}
              style={{ flex: 1, height: "100%", display: "flex", alignItems: "flex-end" }}
            >
              <span style={{ width: "100%", height: Math.max(2, (Math.max(0, p.amount) / max) * H), background: color, opacity: on ? 1 : 0.45, borderRadius: "3px 3px 0 0" }} />
            </Link>
          );
        })}
      </div>
      <div aria-hidden style={{ display: "flex", gap: 3, marginTop: 4 }}>
        {points.map(p => (
          <span key={p.year} style={{ flex: 1, textAlign: "center", fontSize: 9, fontVariantNumeric: "tabular-nums", color: p.year === current ? "var(--text-primary)" : "var(--text-secondary)", fontWeight: p.year === current ? 700 : 400 }}>
            &rsquo;{String(p.year).slice(2)}
          </span>
        ))}
      </div>
      {firstP && lastP && firstP !== lastP && (
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--text-secondary)", marginTop: 6, fontVariantNumeric: "tabular-nums" }}>
          <span>{firstP.year} · {fmtMoney(firstP.amount!)}</span>
          <span>{lastP.year} · {fmtMoney(lastP.amount!)}</span>
        </div>
      )}
      {missing.length > 0 && (
        <p style={{ fontSize: 11, color: "var(--text-secondary)", margin: "6px 0 0", lineHeight: 1.5 }}>
          {renamed && <>Names change between the City&apos;s files.{" "}</>}The {missing.length === 1 ? "file" : "files"} for {missing.join(", ")}{" "}
          {missing.length === 1 ? "has" : "have"} no {missingWhat}, so {missing.length === 1 ? "that year is" : "those years are"} left empty.
        </p>
      )}
      <Collapsible label="Show as table, with each year's source file">
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, marginTop: 4 }}>
          <tbody>
            {present.map(p => (
              <tr key={p.year} style={{ borderTop: "1px solid var(--border)" }}>
                <td style={{ padding: "4px 0", fontVariantNumeric: "tabular-nums" }}>{p.year}</td>
                <td style={{ padding: "4px 8px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmtDollars(p.amount!)}</td>
                <td style={{ padding: "4px 0", textAlign: "right" }}>
                  {p.fileUrl && <a href={p.fileUrl} target="_blank" rel="noopener noreferrer" style={link}>{p.year} file ↗</a>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Collapsible>
    </div>
  );
}

export function UnitCostCard({ uc, expenses, budgetSource, series, hrefFor }: {
  uc: UnitCost; expenses: number; budgetSource: DataSource;
  series: { year: number; cost: number }[]; hrefFor: (y: number) => string;
}) {
  return (
    <section style={{ ...card, marginTop: 20 }}>
      <h2 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 8px" }}>Cost per {uc.unit}</h2>
      <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: "-0.02em" }}>≈ {fmtPerResident(uc.cost)}</div>
      <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: "4px 0 10px", fontVariantNumeric: "tabular-nums" }}>
        {fmtDollars(expenses)} budgeted ÷ {uc.volume.toLocaleString("en-CA")} {uc.volumeLabel} in {uc.year}
      </p>
      {series.length > 1 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 12px", fontSize: 12, marginBottom: 10 }}>
          {series.map(s => (
            <Link key={s.year} href={hrefFor(s.year)} style={{ color: s.year === uc.year ? "var(--text-primary)" : "var(--text-secondary)", textDecoration: "none", fontWeight: s.year === uc.year ? 700 : 400, fontVariantNumeric: "tabular-nums" }}>
              {s.year}: {fmtPerResident(s.cost)}
            </Link>
          ))}
        </div>
      )}
      <p style={{ fontSize: 11, color: "var(--text-secondary)", margin: "0 0 12px", lineHeight: 1.5 }}>{uc.caveat}</p>
      <div style={{ display: "grid", gap: 10 }}>
        <DataSourceCitation source={budgetSource} label="Budget" />
        <DataSourceCitation source={uc.volumeSource} label={uc.volumeLabel[0].toUpperCase() + uc.volumeLabel.slice(1)} />
      </div>
    </section>
  );
}

const MBN_HEADLINE = 4;

export function MbnCard({ block }: { block: MbnBlock }) {
  // Cost measures first — they answer "is this a lot?" most directly.
  const sorted = [...block.measures].sort((a, b) => Number(/\bCost/i.test(b.name)) - Number(/\bCost/i.test(a.name)));
  const head = sorted.slice(0, MBN_HEADLINE), rest = sorted.slice(MBN_HEADLINE);
  const fileUrl = block.measures[0]?.fileUrl;
  return (
    <section style={{ ...card, marginTop: 20 }}>
      <h2 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 4px" }}>City-reported measures: {block.area}</h2>
      <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: "0 0 10px", lineHeight: 1.5 }}>
        From the City&apos;s submission to MBNCanada (the Municipal Benchmarking Network) for {block.year}.
        {!block.exactYear && <> The City&apos;s open data has these measures for 2016–2020 only, so this is the nearest year to the budget shown.</>}
      </p>
      <MeasureList measures={head} />
      {rest.length > 0 && (
        <Collapsible label={`${rest.length} more measures`}>
          <MeasureList measures={rest} />
        </Collapsible>
      )}
      <p style={{ fontSize: 11, color: "var(--text-secondary)", margin: "12px 0 0", lineHeight: 1.5 }}>
        Values are as the City reported them; dollars and percentages are shown only where the measure&apos;s name says so.{" "}
        <a href={block.datasetUrl} target="_blank" rel="noopener noreferrer" style={link}>{block.dataset}</a>
        {fileUrl && <> · <a href={fileUrl} target="_blank" rel="noopener noreferrer" style={link}>{block.year} file ↗</a></>}
      </p>
    </section>
  );
}

function MeasureList({ measures }: { measures: MbnBlock["measures"] }) {
  return (
    <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
      {measures.map(m => (
        <li key={m.number} style={{ borderTop: "1px solid var(--border)", padding: "8px 0", display: "flex", justifyContent: "space-between", gap: 12 }}>
          <span style={{ fontSize: 13, minWidth: 0 }}>
            {m.name}
            <span style={{ display: "block", fontSize: 11, color: "var(--text-secondary)", fontVariantNumeric: "tabular-nums" }}>
              {m.numerator != null && m.denominator != null ? `${m.numerator.toLocaleString("en-CA")} ÷ ${m.denominator.toLocaleString("en-CA")} · ` : ""}{m.number}
            </span>
          </span>
          <span style={{ fontSize: 14, fontWeight: 700, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>{fmtMbnResult(m)}</span>
        </li>
      ))}
    </ul>
  );
}
