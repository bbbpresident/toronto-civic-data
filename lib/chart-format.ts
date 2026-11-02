import type { SeriesUnit } from "@/lib/types";

// Number and period formatting for series — shared by the client chart and server pages.

export function fmtValue(v: number, unit: SeriesUnit, decimals?: number): string {
  if (unit === "percent") return `${v.toFixed(decimals ?? 1)}%`;
  const d = decimals ?? (Number.isInteger(v) ? 0 : Math.abs(v) < 100 ? 2 : 0);
  const s = Math.abs(v).toLocaleString("en-CA", { minimumFractionDigits: d, maximumFractionDigits: d });
  return `${v < 0 ? "−" : ""}${unit === "dollars" ? "$" : ""}${s}`;
}

export function fmtAxis(v: number, unit: SeriesUnit): string {
  if (unit === "percent") return `${+v.toFixed(1)}%`;
  const a = Math.abs(v), pre = unit === "dollars" ? "$" : "";
  const c = a >= 1e9 ? `${+(a / 1e9).toFixed(1)}B` : a >= 1e6 ? `${+(a / 1e6).toFixed(1)}M` : a >= 1e4 ? `${+(a / 1e3).toFixed(0)}K` : a.toLocaleString("en-CA");
  return `${v < 0 ? "−" : ""}${pre}${c}`;
}

/** "2024-03" → "Mar 2024"; other period shapes are shown as written. */
export function fmtPeriod(p: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(p);
  if (!m) return p;
  return `${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][+m[2] - 1]} ${m[1]}`;
}
