import budgetJson from "./budget.json";
import crosswalkJson from "./budget-crosswalk.json";
import type { BudgetCrosswalk, BudgetData, BudgetLine, BudgetYear, CrosswalkSide } from "@/lib/types";

// budget.json is generated — never edit it by hand. Re-run scripts/extract_budget.py.
// Import this only from server components: the file carries every year's full breakdown.
export const BUDGET_DATA = budgetJson as BudgetData;

export const BUDGET_YEARS: BudgetYear[] = [...BUDGET_DATA.years].sort((a, b) => a.year - b.year);

export function getBudgetYear(year: number): BudgetYear | undefined {
  return BUDGET_YEARS.find(y => y.year === year);
}

/** A revenue category's amount in every year, by exact name (null where that year's file has none). */
export function revenueCategoryHistory(name: string): { year: number; amount: number | null; fileUrl: string }[] {
  return BUDGET_YEARS.map(y => ({ year: y.year, amount: y.revenueByCategory.find(c => c.name === name)?.amount ?? null, fileUrl: y.source.fileUrl }));
}

export const CROSSWALK = crosswalkJson as BudgetCrosswalk;

/** One comparable group's amount in every year (null in years with no rows for it). */
export function groupHistory(side: CrosswalkSide, group: string): { year: number; amount: number | null; fileUrl: string }[] {
  return BUDGET_YEARS.map(y => ({ year: y.year, amount: y.comparable[side].find(g => g.group === group)?.amount ?? null, fileUrl: y.source.fileUrl }));
}

/** A year's comparable groups as budget lines, in the crosswalk's order, largest first. */
export function comparableLines(y: BudgetYear, side: CrosswalkSide): (BudgetLine & { group: string })[] {
  return CROSSWALK.groups[side].flatMap(g => {
    const c = y.comparable[side].find(x => x.group === g.id);
    return c ? [{ name: g.label, amount: c.amount, group: g.id }] : [];
  }).sort((a, b) => b.amount - a.amount);
}
