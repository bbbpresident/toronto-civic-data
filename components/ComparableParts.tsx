import Link from "next/link";
import { LineHistory } from "@/components/ContextParts";
import { Lines, link } from "@/components/BudgetParts";
import { fmtDollars } from "@/lib/format";
import { BUDGET_YEARS, CROSSWALK, comparableLines, getBudgetYear, groupHistory } from "@/lib/budget";
import { getProgram } from "@/lib/budget-programs";
import type { BudgetProgram, BudgetYear, CrosswalkBasis, CrosswalkRule, CrosswalkSide } from "@/lib/types";

// The "comparable across years" view of the budget: the City's rows regrouped by
// lib/budget-crosswalk.json so a group means the same thing in every year. Server components.

const COLOR: Record<CrosswalkSide, string> = { revenue: "var(--revenue)", expenses: "var(--expense)" };

export const BASIS: Record<CrosswalkBasis, string> = {
  files: "Shown in the City's files",
  sum: "Lines added together",
  document: "Shown in a City document",
  judgment: "Our judgment",
};

const note: React.CSSProperties = { fontSize: 11, color: "var(--text-secondary)", lineHeight: 1.5 };

function GroupHistory({ side, group, current }: { side: CrosswalkSide; group: string; current: number }) {
  const g = CROSSWALK.groups[side].find(x => x.id === group)!;
  return (
    <>
      <p style={{ ...note, margin: "0 0 8px" }}>{g.description}</p>
      <LineHistory name={g.label} points={groupHistory(side, group)} current={current} color={COLOR[side]} hrefFor={y => `/budget/${y}`}
        missingWhat="rows in this group" renamed={false} />
    </>
  );
}

/** One year's comparable groups; each expands to show the group across every year. */
export function ComparableView({ y, side }: { y: BudgetYear; side: CrosswalkSide }) {
  const lines = comparableLines(y, side);
  const groupOf = new Map(lines.map(l => [l.name, l.group]));
  return (
    <>
      <Lines lines={lines} total={side === "revenue" ? y.revenue : y.expenses} color={COLOR[side]}
        trend={l => <GroupHistory side={side} group={groupOf.get(l.name)!} current={y.year} />} />
      <p style={{ ...note, margin: "8px 0 0" }}>
        Groups that mean the same thing in every year, so years can be compared. Select one to see it by year.{" "}
        <Link href={`/budget/comparable#rules-${side}`} style={link}>How the groups are built</Link>
      </p>
    </>
  );
}

/** One program's lines in the comparable groups; each expands to that group for this program across
 *  every year whose file has a program of the same name. */
export function ProgramComparableView({ p, year, side }: { p: BudgetProgram; year: number; side: CrosswalkSide }) {
  const groups = CROSSWALK.groups[side];
  const lines = p.comparable[side].filter(g => g.amount !== 0)
    .map(g => ({ name: groups.find(x => x.id === g.group)!.label, amount: g.amount, group: g.group }))
    .sort((a, b) => b.amount - a.amount);
  const groupOf = new Map(lines.map(l => [l.name, l.group]));
  const history = (group: string) => BUDGET_YEARS.map(({ year: y }) => {
    const pp = getProgram(y, p.slug);
    return { year: y, amount: pp ? pp.comparable[side].find(g => g.group === group)?.amount ?? 0 : null, fileUrl: pp ? pp.source.fileUrl : null };
  });
  return (
    <>
      <Lines lines={lines} total={side === "revenue" ? p.revenue : p.expenses} color={COLOR[side]}
        trend={l => {
          const g = groups.find(x => x.id === groupOf.get(l.name))!;
          return (
            <>
              <p style={{ ...note, margin: "0 0 8px" }}>{g.description}</p>
              <LineHistory name={g.label} points={history(g.id)} current={year} color={COLOR[side]} hrefFor={y => `/budget/${y}/${p.slug}`}
                missingWhat={`program named exactly “${p.name}”`} />
            </>
          );
        }} />
      <p style={{ ...note, margin: "8px 0 0" }}>
        This program&apos;s lines sorted into groups that mean the same thing in every year. Select one to see it by year.{" "}
        <Link href={`/budget/comparable#rules-${side}`} style={link}>How the groups are built</Link>
      </p>
    </>
  );
}

/** Every group, each as a chart across all years, for the comparable overview page. */
export function ComparableCharts({ side, current }: { side: CrosswalkSide; current: number }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 12, marginTop: 12 }}>
      {CROSSWALK.groups[side].map(g => (
        <div key={g.id} style={{ minWidth: 0 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, margin: "0 0 4px" }}>{g.label}</h3>
          <GroupHistory side={side} group={g.id} current={current} />
        </div>
      ))}
    </div>
  );
}

function yearsLabel(r: CrosswalkRule): string {
  if (!r.years) return "Every year";
  const ys = [...r.years].sort((a, b) => a - b);
  const contiguous = ys.every((v, i) => i === 0 || v === ys[i - 1] + 1);
  return ys.length === 1 ? String(ys[0]) : contiguous ? `${ys[0]}–${ys[ys.length - 1]}` : ys.join(", ");
}

/** The crosswalk's rules for one side, grouped by the group they feed, with each rule's basis and evidence. */
export function RuleList({ side }: { side: CrosswalkSide }) {
  return (
    <div style={{ display: "grid", gap: 14 }}>
      {CROSSWALK.groups[side].map(g => (
        <section key={g.id}>
          <h3 style={{ fontSize: 13, fontWeight: 700, margin: "0 0 4px" }}>{g.label}</h3>
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {CROSSWALK.rules.filter(r => r.side === side && r.group === g.id).map(r => (
              <li key={r.id} style={{ borderTop: "1px solid var(--border)", padding: "8px 0", fontSize: 12, lineHeight: 1.55 }}>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "2px 10px", color: "var(--text-secondary)", fontSize: 11 }}>
                  <span style={{ fontWeight: 700, color: "var(--text-primary)" }}>{yearsLabel(r)}</span>
                  <span>{BASIS[r.basis]}</span>
                  <span style={{ overflowWrap: "anywhere" }}>
                    Matches {Object.entries(r.match).map(([k, v]) => `${k === "subCategory" ? "sub-category" : k} ${(Array.isArray(v) ? v : [v]).map(x => `“${x}”`).join(" or ")}`).join(", ")}
                  </span>
                </div>
                <div style={{ marginTop: 2 }}>{r.why}</div>
                {r.documents?.map(d => (
                  <div key={d.url} style={{ ...note, marginTop: 4 }}>
                    <a href={d.url} target="_blank" rel="noopener noreferrer" style={link}>{d.label} ↗</a>: &ldquo;{d.quote}&rdquo;
                    {" "}(the {d.year}{" "}file: {fmtDollars(ruleAmount(d.year, side, r.id))})
                  </div>
                ))}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function ruleAmount(year: number, side: CrosswalkSide, rule: string): number {
  return getBudgetYear(year)?.comparable[side].flatMap(g => g.rules).find(r => r.id === rule)?.amount ?? 0;
}
