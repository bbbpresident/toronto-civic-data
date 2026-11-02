/** $19.32B / $975.8M / $12,345 — compact dollars for charts and headlines. */
export function fmtMoney(n: number): string {
  const sign = n < 0 ? "−" : "";
  const a = Math.abs(n);
  if (a >= 1e9) return `${sign}$${(a / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `${sign}$${(a / 1e6).toFixed(1)}M`;
  return `${sign}$${Math.round(a).toLocaleString("en-CA")}`;
}

/** Exact dollars, for tooltips and tables where the reader may check against the source. */
export function fmtDollars(n: number): string {
  return `${n < 0 ? "−" : ""}$${Math.abs(Math.round(n)).toLocaleString("en-CA")}`;
}

/** Per-resident dollars: $5,890 / $33.41 / $0.42. */
export function fmtPerResident(n: number): string {
  return `$${n.toLocaleString("en-CA", { minimumFractionDigits: n < 100 ? 2 : 0, maximumFractionDigits: n < 100 ? 2 : 0 })}`;
}

/** +6.1% / −2.4% */
export function fmtChange(fraction: number): string {
  const pct = fraction * 100;
  return `${pct >= 0 ? "+" : "−"}${Math.abs(pct).toFixed(1)}%`;
}
