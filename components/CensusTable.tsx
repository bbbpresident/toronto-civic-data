import { DataSourceCitation } from "@/components/SourceCitation";
import { card } from "@/components/BudgetParts";
import type { CensusIndicator } from "@/lib/types";

// City-wide census indicators across census years. Each value links to the exact file it came
// from (hover for the rows and method); the full citations sit in a disclosure under each row.

const fmt = (v: number, unit: CensusIndicator["unit"]) => unit === "percent" ? `${v.toFixed(1)}%` : `$${Math.round(v).toLocaleString("en-CA")}`;

export default function CensusTable({ indicators }: { indicators: CensusIndicator[] }) {
  const years = [...new Set(indicators.flatMap(i => i.values.map(v => v.year)))].sort();
  return (
    <section style={{ ...card, marginTop: 20 }}>
      <h2 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 4px" }}>The census, every five years</h2>
      <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: "0 0 12px", lineHeight: 1.5 }}>
        City-wide figures from the City&apos;s census profiles. Each value links to its file; hover it for the exact rows and how it
        was computed. A dash means that year&apos;s profile doesn&apos;t include the figure.
      </p>
      <div style={{ overflowX: "auto", border: "1px solid var(--border)", borderRadius: 10 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, minWidth: 560, fontVariantNumeric: "tabular-nums" }}>
          <thead>
            <tr style={{ color: "var(--text-secondary)" }}>
              <th style={{ textAlign: "left", padding: "8px 10px", fontWeight: 600, position: "sticky", left: 0, background: "var(--surface)" }}>&nbsp;</th>
              {years.map(y => <th key={y} style={{ textAlign: "right", padding: "8px 10px", fontWeight: 600 }}>{y}</th>)}
            </tr>
          </thead>
          <tbody>
            {indicators.map(ind => (
              <tr key={ind.id} style={{ borderTop: "1px solid var(--border)", verticalAlign: "top" }}>
                <td style={{ padding: "8px 10px", minWidth: 150, maxWidth: 220, position: "sticky", left: 0, background: "var(--surface)", boxShadow: "1px 0 0 var(--border)" }}>
                  <div style={{ fontWeight: 600 }}>{ind.label}</div>
                  <div style={{ fontSize: 11, color: "var(--text-secondary)", lineHeight: 1.4 }}>{ind.description}{ind.note ? ` ${ind.note}` : ""}</div>
                  <details style={{ marginTop: 4 }}>
                    <summary style={{ fontSize: 11, color: "var(--blue)", cursor: "pointer" }}>Sources</summary>
                    <div style={{ display: "grid", gap: 8, marginTop: 6 }}>
                      {ind.values.map(v => <DataSourceCitation key={v.year} source={v.source} label={String(v.year)} />)}
                    </div>
                  </details>
                </td>
                {years.map(y => {
                  const v = ind.values.find(x => x.year === y);
                  return (
                    <td key={y} style={{ textAlign: "right", padding: "8px 10px", whiteSpace: "nowrap" }}>
                      {v ? (
                        <a href={v.source.fileUrl} target="_blank" rel="noopener noreferrer" title={`${v.source.locator}. ${v.source.method}`}
                          style={{ color: "var(--text-primary)", textDecoration: "underline", textDecorationColor: "var(--border)", textUnderlineOffset: 3 }}>
                          {fmt(v.value, ind.unit)}
                        </a>
                      ) : <span style={{ color: "var(--text-secondary)" }}>—</span>}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
