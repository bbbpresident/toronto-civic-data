import { card } from "@/components/BudgetParts";
import { fmtValue, fmtPeriod } from "@/lib/chart-format";
import type { Series, SeriesPoint } from "@/lib/types";

// Page furniture shared by the series-based sections: the page shell and header, a row of
// headline figures, and helpers to pick the latest complete value of a series.

export function Shell({ children }: { children: React.ReactNode }) {
  return <div style={{ maxWidth: 760, margin: "0 auto", paddingBottom: 48 }}>{children}</div>;
}

export function Header({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <header style={{ marginBottom: 20 }}>
      <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-0.03em", margin: "0 0 6px" }}>{title}</h1>
      <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: 0, lineHeight: 1.55 }}>{children}</p>
    </header>
  );
}

export function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 style={{ fontSize: 13, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text-secondary)", margin: "36px 0 0" }}>{children}</h2>;
}

/** `info` explains the figure in plain words; it shows on hover or keyboard focus. */
export interface Figure { label: string; value: string; sub?: React.ReactNode; info?: string }

/** Headline numbers. Each must come from a series shown (and cited) further down the page. */
export function KeyFigures({ items }: { items: Figure[] }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10 }}>
      <style>{`
        .kf{position:relative}
        .kf[tabindex]{cursor:help}
        .kf-tip{display:none;position:absolute;left:0;right:0;top:calc(100% + 6px);z-index:10;padding:10px 12px;border-radius:10px;
          background:var(--surface-2);border:1px solid var(--border);box-shadow:0 8px 24px rgba(0,0,0,.4);
          font-size:12px;line-height:1.5;color:var(--text-primary);font-weight:400}
        .kf:hover .kf-tip,.kf:focus-visible .kf-tip{display:block}
        .kf-i{display:inline-flex;align-items:center;justify-content:center;width:14px;height:14px;margin-left:5px;border-radius:50%;
          border:1px solid var(--text-secondary);font-size:9px;font-weight:700;vertical-align:1px}
      `}</style>
      {items.map((f, i) => {
        const tipId = `kf-tip-${i}-${f.label.replace(/\W+/g, "-")}`;
        return (
          <div key={f.label} className="kf" tabIndex={f.info ? 0 : undefined} aria-describedby={f.info ? tipId : undefined} style={{ ...card, padding: "14px 14px 12px" }}>
            <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 4, lineHeight: 1.35 }}>
              {f.label}{f.info && <span className="kf-i" aria-hidden>i</span>}
            </div>
            <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: "-0.02em", fontVariantNumeric: "tabular-nums" }}>{f.value}</div>
            {f.sub && <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 2, lineHeight: 1.4 }}>{f.sub}</div>}
            {f.info && <div id={tipId} role="tooltip" className="kf-tip">{f.info}</div>}
          </div>
        );
      })}
    </div>
  );
}

/** The latest point with a value that isn't marked incomplete. */
export function latest(s: Series): SeriesPoint {
  const pts = s.points.filter(p => p.value != null && !p.note);
  return pts[pts.length - 1];
}

export function at(s: Series, period: string): SeriesPoint | undefined {
  return s.points.find(p => p.period === period && p.value != null);
}

/** "$2,045 (2025)" */
export function show(s: Series, p: SeriesPoint | undefined, decimals?: number): string {
  return p && p.value != null ? fmtValue(p.value, s.unit, decimals) : "n/a";
}

export function periodLabel(p: SeriesPoint | undefined): string {
  return p ? fmtPeriod(p.period) : "";
}

/** "+12.3%" change from a to b. */
export function change(a: SeriesPoint | undefined, b: SeriesPoint | undefined): string {
  if (!a?.value || b?.value == null) return "";
  const c = (b.value / a.value - 1) * 100;
  return `${c >= 0 ? "+" : "−"}${Math.abs(c).toFixed(1)}%`;
}
