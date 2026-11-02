"use client";
import { useState } from "react";
import Link from "next/link";
import { fmtDollars, fmtMoney, fmtPerResident } from "@/lib/format";

// Grouped bars: revenue and expenses per year, in one of several measures (total dollars,
// per resident, inflation-adjusted). Each year's group links to its breakdown. Receives only
// the precomputed series, not budget.json, so the client bundle stays small. A null value
// means the measure isn't available for that year (e.g. no population estimate yet).

export interface ChartPoint { year: number; revenue: number | null; expenses: number | null }
export interface ChartMode { id: string; label: string; unit: "money" | "perResident"; points: ChartPoint[]; missingNote?: string }

const CHART_H = 240;

function niceStep(max: number) {
  const raw = max / 4, mag = 10 ** Math.floor(Math.log10(raw));
  return [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => s >= raw) ?? raw;
}

export default function BudgetChart({ modes }: { modes: ChartMode[] }) {
  const [modeId, setModeId] = useState(modes[0].id);
  const [hover, setHover] = useState<number | null>(null);
  const mode = modes.find(m => m.id === modeId) ?? modes[0];
  const years = mode.points;
  const fmt = (v: number) => (mode.unit === "money" ? fmtMoney(v) : fmtPerResident(v));
  const fmtExact = (v: number) => (mode.unit === "money" ? fmtDollars(v) : fmtPerResident(v));
  const fmtAxis = (v: number) => (mode.unit === "money" ? `$${v / 1e9}B` : `$${v.toLocaleString("en-CA")}`);

  const max = Math.max(...years.flatMap(y => [y.revenue ?? 0, y.expenses ?? 0]));
  const step = niceStep(max);
  const yMax = Math.ceil(max / step) * step;
  const grid = Array.from({ length: Math.round(yMax / step) + 1 }, (_, i) => i * step);
  const h = (v: number) => (v / yMax) * CHART_H;

  return (
    <div>
      <style>{`.bc-yr{font-size:11px}@media (max-width:560px){.bc-yr{font-size:9px;letter-spacing:-0.03em}}`}</style>

      <div role="radiogroup" aria-label="Measure" style={{ display: "inline-flex", flexWrap: "wrap", padding: 3, gap: 2, borderRadius: 10, border: "1px solid var(--border)", background: "var(--background)", marginBottom: 14 }}>
        {modes.map(m => {
          const on = m.id === mode.id;
          return (
            <button key={m.id} role="radio" aria-checked={on} onClick={() => setModeId(m.id)} style={{
              fontSize: 12, fontWeight: 600, padding: "6px 12px", borderRadius: 7, border: "none", cursor: "pointer",
              background: on ? "var(--surface-2)" : "transparent", color: on ? "var(--text-primary)" : "var(--text-secondary)",
              boxShadow: on ? "0 0 0 1px var(--border)" : "none",
            }}>{m.label}</button>
          );
        })}
      </div>

      <div style={{ position: "relative", height: CHART_H, marginLeft: 44 }}>
        {grid.map(g => (
          <div key={g} aria-hidden style={{ position: "absolute", left: 0, right: 0, bottom: h(g), borderTop: `1px solid ${g === 0 ? "var(--text-secondary)" : "var(--border)"}`, opacity: g === 0 ? 0.6 : 1 }}>
            <span style={{ position: "absolute", left: -44, top: -7, width: 38, textAlign: "right", fontSize: 10, color: "var(--text-secondary)" }}>{fmtAxis(g)}</span>
          </div>
        ))}

        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "flex-end", gap: 4, padding: "0 2px" }}>
          {years.map((y, i) => {
            const on = hover === y.year;
            const missing = y.revenue == null || y.expenses == null;
            const diff = !missing ? y.revenue! - y.expenses! : 0;
            const label = missing
              ? `${y.year}: ${mode.label.toLowerCase()} not available. Open the ${y.year} breakdown.`
              : `${y.year}: revenue ${fmt(y.revenue!)}, expenses ${fmt(y.expenses!)}. Open the ${y.year} breakdown.`;
            return (
              // The whole column is the hit target, not just the bars.
              <Link
                key={y.year}
                href={`/budget/${y.year}`}
                onMouseEnter={() => setHover(y.year)}
                onMouseLeave={() => setHover(null)}
                onFocus={() => setHover(y.year)}
                onBlur={() => setHover(null)}
                aria-label={label}
                style={{ flex: 1, minWidth: 0, height: "100%", position: "relative", display: "flex", alignItems: "flex-end", justifyContent: "center", gap: 2, borderRadius: 6, background: on ? "rgba(255,255,255,0.04)" : "transparent" }}
              >
                {missing ? (
                  <span style={{ fontSize: 9, color: "var(--text-secondary)", marginBottom: 4 }}>n/a</span>
                ) : (
                  <>
                    <span style={{ flex: 1, maxWidth: 22, height: h(y.revenue!), background: "var(--revenue)", borderRadius: "4px 4px 0 0", opacity: hover == null || on ? 1 : 0.55, transition: "opacity 0.15s" }} />
                    <span style={{ flex: 1, maxWidth: 22, height: h(y.expenses!), background: "var(--expense)", borderRadius: "4px 4px 0 0", opacity: hover == null || on ? 1 : 0.55, transition: "opacity 0.15s" }} />
                  </>
                )}
                {on && (
                  <span role="presentation" style={{
                    position: "absolute", bottom: missing ? 24 : h(Math.max(y.revenue!, y.expenses!)) + 10, zIndex: 5,
                    // Anchor toward the chart's middle so the tooltip never runs off a narrow screen.
                    ...(i < years.length * 0.35 ? { left: 0 } : i > years.length * 0.65 ? { right: 0 } : { left: "50%", transform: "translateX(-50%)" }),
                    background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 10px",
                    fontSize: 11, color: "var(--text-primary)", whiteSpace: "nowrap", pointerEvents: "none", boxShadow: "0 6px 20px rgba(0,0,0,0.35)",
                  }}>
                    <div style={{ fontWeight: 700, marginBottom: 4 }}>{y.year} · {mode.label.toLowerCase()}</div>
                    {missing ? (
                      <div style={{ color: "var(--text-secondary)" }}>{mode.missingNote ?? "Not available for this year"}</div>
                    ) : (
                      <>
                        <TipRow color="var(--revenue)" label="Revenue" value={fmtExact(y.revenue!)} />
                        <TipRow color="var(--expense)" label="Expenses" value={fmtExact(y.expenses!)} />
                        {mode.unit === "money" && Math.abs(diff) >= 1e6 && <div style={{ color: "var(--text-secondary)", marginTop: 3 }}>Revenue − expenses: {fmtMoney(diff)}</div>}
                      </>
                    )}
                    <div style={{ color: "var(--text-secondary)", marginTop: 4 }}>Click for the full breakdown</div>
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      </div>
      <div style={{ display: "flex", gap: 4, marginLeft: 44, padding: "6px 2px 0" }}>
        {years.map(y => (
          <div key={y.year} className="bc-yr" style={{ flex: 1, minWidth: 0, textAlign: "center", color: hover === y.year ? "var(--text-primary)" : "var(--text-secondary)" }}>
            {y.year}
          </div>
        ))}
      </div>
      {mode.missingNote && years.some(y => y.revenue == null) && (
        <p style={{ fontSize: 11, color: "var(--text-secondary)", margin: "10px 0 0" }}>n/a: {mode.missingNote}</p>
      )}
    </div>
  );
}

function TipRow({ color, label, value }: { color: string; label: string; value: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, fontVariantNumeric: "tabular-nums" }}>
      <span style={{ width: 8, height: 8, borderRadius: 2, background: color }} />
      <span style={{ color: "var(--text-secondary)", minWidth: 56 }}>{label}</span>
      <span>{value}</span>
    </div>
  );
}
