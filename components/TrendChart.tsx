"use client";
import { useState } from "react";
import type { SeriesUnit } from "@/lib/types";
import { fmtAxis, fmtPeriod, fmtValue } from "@/lib/chart-format";

// The trend chart every series-based section uses: bars (yearly figures, a few series side by
// side) or lines (monthly figures, or several series over many years). One y-axis, always —
// series on one chart share a unit. Hovering a period shows its exact values; incomplete
// periods (a year to date, a carried-over value) are drawn faded and say why. A table view of
// the same numbers sits under every chart.
//
// Bars are HTML (so their tops can be rounded without distortion); lines are an SVG stretched to
// the plot area with non-scaling strokes. Hit targets are full-height columns, one per period.

export interface ChartSeries {
  id: string;
  label: string;
  points: { period: string; value: number | null; note?: string }[];
}

const COLORS = ["var(--s1)", "var(--s2)", "var(--s3)", "var(--s4)", "var(--s5)", "var(--s6)"];
const GUTTER = 52;

function niceStep(span: number) {
  const raw = span / 4, mag = 10 ** Math.floor(Math.log10(raw || 1));
  return [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => s >= raw) ?? raw;
}

export default function TrendChart({ series, unit, kind = "bar", height = 220, baseline = "zero", decimals, colorOffset = 0 }: {
  series: ChartSeries[];
  unit: SeriesUnit;
  kind?: "bar" | "line";
  height?: number;
  /** "auto" starts the axis near the data (rates that move within a narrow band); bars always start at zero. */
  baseline?: "zero" | "auto";
  decimals?: number;
  /** Start at a later palette slot, so a chart showing one series can match its color elsewhere. */
  colorOffset?: number;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const periods = [...new Set(series.flatMap(s => s.points.map(p => p.period)))].sort();
  const lookup = series.map(s => new Map(s.points.map(p => [p.period, p])));
  const values = series.flatMap(s => s.points.map(p => p.value)).filter((v): v is number => v != null);
  const color = (i: number) => COLORS[(i + colorOffset) % COLORS.length];

  const dataMax = Math.max(...values, 0), dataMin = Math.min(...values, 0);
  const autoBase = kind === "line" && baseline === "auto";
  const lo0 = autoBase ? Math.min(...values) : dataMin;
  const step = niceStep((dataMax - lo0) || dataMax || 1);
  const yMin = autoBase ? Math.floor(lo0 / step) * step - (lo0 % step === 0 ? step : 0) : Math.min(0, Math.floor(dataMin / step) * step);
  const yMax = Math.ceil(dataMax / step) * step || step;
  const grid = Array.from({ length: Math.round((yMax - yMin) / step) + 1 }, (_, i) => yMin + i * step);
  const y = (v: number) => ((v - yMin) / (yMax - yMin)) * height;

  const monthly = periods.every(p => /^\d{4}-\d{2}$/.test(p));
  // Label at most ~8 periods; for monthly series, label Januaries of every k-th year.
  const years = monthly ? [...new Set(periods.map(p => p.slice(0, 4)))] : [];
  const yearStep = Math.max(1, Math.ceil(years.length / 8));
  const labelStep = Math.max(1, Math.ceil(periods.length / 8));
  const xLabel = (p: string, i: number) => monthly
    ? (p.endsWith("-01") && (+p.slice(0, 4) - +years[0]) % yearStep === 0 ? p.slice(0, 4) : (i === 0 && !p.endsWith("-01") ? "" : null))
    : (i % labelStep === 0 || i === periods.length - 1 ? p : null);

  const n = periods.length;
  // Beside the hovered column, on whichever side has more room, so it never covers the point read.
  const tipAnchor = (i: number): React.CSSProperties =>
    i < n / 2 ? { left: `calc(${((i + 1) / n) * 100}% + 8px)` } : { right: `calc(${((n - i) / n) * 100}% + 8px)` };

  return (
    <div>
      {series.length > 1 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 14px", marginBottom: 10, fontSize: 12 }}>
          {series.map((s, i) => (
            <span key={s.id} style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "var(--text-secondary)" }}>
              <span aria-hidden style={{ width: kind === "line" ? 14 : 10, height: kind === "line" ? 3 : 10, borderRadius: 2, background: color(i) }} />
              {s.label}
            </span>
          ))}
        </div>
      )}

      <div style={{ position: "relative", height, marginLeft: GUTTER }}>
        {grid.map(g => (
          <div key={g} aria-hidden style={{ position: "absolute", left: 0, right: 0, bottom: y(g), borderTop: `1px solid ${g === 0 ? "var(--text-secondary)" : "var(--border)"}`, opacity: g === 0 ? 0.6 : 1 }}>
            <span style={{ position: "absolute", left: -GUTTER, top: -7, width: GUTTER - 6, textAlign: "right", fontSize: 10, color: "var(--text-secondary)" }}>{fmtAxis(g, unit)}</span>
          </div>
        ))}

        {kind === "line" && (
          <svg aria-hidden viewBox={`0 0 ${n} ${height}`} preserveAspectRatio="none" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", overflow: "visible" }}>
            {series.map((s, si) => {
              // Break the line at missing values rather than bridging them.
              const segs: string[] = [];
              let cur = "";
              periods.forEach((p, i) => {
                const v = lookup[si].get(p)?.value;
                if (v == null) { if (cur) segs.push(cur); cur = ""; return; }
                cur += `${cur ? "L" : "M"}${i + 0.5},${height - y(v)}`;
              });
              if (cur) segs.push(cur);
              return segs.map((d, k) => <path key={`${s.id}-${k}`} d={d} fill="none" stroke={color(si)} strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />);
            })}
          </svg>
        )}

        <div style={{ position: "absolute", inset: 0, display: "flex", gap: kind === "bar" ? (n > 30 ? 1 : 3) : 0 }} onMouseLeave={() => setHover(null)}>
          {periods.map((p, i) => {
            const on = hover === i;
            const pts = lookup.map(m => m.get(p));
            const faded = pts.some(pt => pt?.note);
            return (
              <div
                key={p}
                tabIndex={0}
                aria-label={`${fmtPeriod(p)}: ${series.map((s, si) => `${s.label} ${pts[si]?.value != null ? fmtValue(pts[si]!.value!, unit, decimals) : "n/a"}`).join(", ")}${faded ? ` (${pts.find(pt => pt?.note)?.note})` : ""}`}
                onMouseEnter={() => setHover(i)}
                onFocus={() => setHover(i)}
                onBlur={() => setHover(null)}
                style={{ flex: 1, minWidth: 0, height: "100%", position: "relative", display: "flex", alignItems: "flex-end", justifyContent: "center", gap: 2, background: on ? "rgba(255,255,255,0.05)" : "transparent", borderRadius: 4, outlineOffset: -2 }}
              >
                {kind === "bar" && series.map((s, si) => {
                  const v = pts[si]?.value;
                  if (v == null) return <span key={s.id} style={{ flex: 1, maxWidth: 22 }} />;
                  return (
                    <span key={s.id} style={{
                      flex: 1, maxWidth: 22, height: Math.max(1, y(Math.max(v, 0)) - y(0)), marginBottom: y(0),
                      background: color(si), borderRadius: "4px 4px 0 0",
                      opacity: (hover == null || on ? 1 : 0.55) * (pts[si]?.note ? 0.45 : 1), transition: "opacity 0.15s",
                    }} />
                  );
                })}
                {kind === "line" && on && series.map((s, si) => {
                  const v = pts[si]?.value;
                  return v == null ? null : (
                    <span key={s.id} aria-hidden style={{ position: "absolute", left: "50%", bottom: y(v) - 5, width: 10, height: 10, marginLeft: -5, borderRadius: "50%", background: color(si), boxShadow: "0 0 0 2px var(--surface)" }} />
                  );
                })}
              </div>
            );
          })}
        </div>

        {hover != null && (
          <div role="presentation" style={{
            position: "absolute", top: 4, zIndex: 5, ...tipAnchor(hover),
            background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 10px",
            fontSize: 11, whiteSpace: "nowrap", pointerEvents: "none", boxShadow: "0 6px 20px rgba(0,0,0,0.35)",
          }}>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>{fmtPeriod(periods[hover])}</div>
            {series.map((s, si) => {
              const pt = lookup[si].get(periods[hover]);
              return (
                <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 6, fontVariantNumeric: "tabular-nums" }}>
                  <span style={{ width: 8, height: 8, borderRadius: 2, background: color(si) }} />
                  {series.length > 1 && <span style={{ color: "var(--text-secondary)" }}>{s.label}</span>}
                  <span style={{ marginLeft: "auto", paddingLeft: 8 }}>{pt?.value != null ? fmtValue(pt.value, unit, decimals) : "n/a"}</span>
                </div>
              );
            })}
            {lookup.map(m => m.get(periods[hover])?.note).find(Boolean) && (
              <div style={{ color: "var(--text-secondary)", marginTop: 4, whiteSpace: "normal", maxWidth: 220 }}>{lookup.map(m => m.get(periods[hover])?.note).find(Boolean)}</div>
            )}
          </div>
        )}
      </div>

      <div aria-hidden style={{ display: "flex", marginLeft: GUTTER, paddingTop: 6, position: "relative", height: 18 }}>
        {periods.map((p, i) => {
          const l = xLabel(p, i);
          return (
            <div key={p} style={{ flex: 1, minWidth: 0, position: "relative" }}>
              {l && <span style={{ position: "absolute", left: "50%", transform: "translateX(-50%)", fontSize: 10, whiteSpace: "nowrap", color: hover === i ? "var(--text-primary)" : "var(--text-secondary)" }}>{l}</span>}
            </div>
          );
        })}
      </div>

      <details style={{ marginTop: 8 }}>
        <summary style={{ fontSize: 12, color: "var(--blue)", cursor: "pointer" }}>Show as table</summary>
        <div style={{ overflowX: "auto", maxHeight: 320, overflowY: "auto", marginTop: 8, border: "1px solid var(--border)", borderRadius: 10 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, fontVariantNumeric: "tabular-nums" }}>
            <thead>
              <tr style={{ color: "var(--text-secondary)", position: "sticky", top: 0, background: "var(--surface-2)" }}>
                <th style={{ textAlign: "left", padding: "6px 10px", fontWeight: 600 }}>Period</th>
                {series.map(s => <th key={s.id} style={{ textAlign: "right", padding: "6px 10px", fontWeight: 600 }}>{s.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {[...periods].reverse().map(p => {
                const note = lookup.map(m => m.get(p)?.note).find(Boolean);
                return (
                  <tr key={p} style={{ borderTop: "1px solid var(--border)" }}>
                    <td style={{ padding: "5px 10px", whiteSpace: "nowrap" }}>{fmtPeriod(p)}{note ? " *" : ""}</td>
                    {series.map((s, si) => {
                      const v = lookup[si].get(p)?.value;
                      return <td key={s.id} style={{ textAlign: "right", padding: "5px 10px" }}>{v != null ? fmtValue(v, unit, decimals) : "n/a"}</td>;
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {series.some(s => s.points.some(p => p.note)) && (
          <p style={{ fontSize: 11, color: "var(--text-secondary)", margin: "6px 0 0" }}>* {[...new Set(series.flatMap(s => s.points.map(p => p.note)).filter(Boolean))].join(" · ")}</p>
        )}
      </details>
    </div>
  );
}
