import Link from "next/link";
import { fmtDollars, fmtMoney } from "@/lib/format";
import type { BudgetLine } from "@/lib/types";

// Building blocks shared by the budget year page and the per-program page. All server
// components; render <BudgetStyles /> once per page for the disclosure/hover CSS.

export const card: React.CSSProperties = { padding: "16px", borderRadius: 14, border: "1px solid var(--border)", background: "var(--surface)" };
export const link: React.CSSProperties = { color: "var(--blue)", textDecoration: "underline", textUnderlineOffset: 2 };

const PROGRAMS_SHOWN = 12;

export function BudgetStyles() {
  return (
    <style>{`
      .bd-sum{list-style:none;cursor:pointer}
      .bd-sum::-webkit-details-marker{display:none}
      .bd-sum .bd-caret{display:inline-block;transition:transform .15s}
      details[open]>.bd-sum .bd-caret{transform:rotate(90deg)}
      .yr-chip:hover{border-color:var(--text-secondary)}
      .bd-link{display:block;color:inherit;text-decoration:none;border-radius:6px;margin:0 -6px;padding:0 6px}
      .bd-link:hover{background:rgba(255,255,255,0.04)}
      .bd-link:hover .bd-name{text-decoration:underline;text-underline-offset:2px}
    `}</style>
  );
}

/** A row of year links; `current` is highlighted. */
export function YearChips({ years, current, hrefFor, label }: { years: number[]; current: number; hrefFor: (y: number) => string; label: string }) {
  return (
    <nav aria-label={label} style={{ display: "flex", flexWrap: "wrap", gap: 6, margin: "0 0 20px" }}>
      {years.map(y => {
        const on = y === current;
        return (
          <Link
            key={y}
            href={hrefFor(y)}
            aria-current={on ? "page" : undefined}
            className="yr-chip"
            style={{
              fontSize: 12, padding: "5px 10px", borderRadius: 999, textDecoration: "none", fontVariantNumeric: "tabular-nums",
              border: `1px solid ${on ? "var(--blue)" : "var(--border)"}`,
              background: on ? "rgba(96,165,250,0.14)" : "transparent",
              color: on ? "var(--text-primary)" : "var(--text-secondary)", fontWeight: on ? 700 : 500,
            }}
          >
            {y}
          </Link>
        );
      })}
    </nav>
  );
}

export function Stat({ label, value, color, notes }: { label: string; value: number; color: string; notes?: React.ReactNode }) {
  return (
    <div style={{ ...card, borderLeft: `3px solid ${color}` }}>
      <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: "-0.02em" }}>{fmtMoney(value)}</div>
      <div style={{ fontSize: 11, color: "var(--text-secondary)", fontVariantNumeric: "tabular-nums" }}>{fmtDollars(value)}</div>
      {notes}
    </div>
  );
}

/** Heading row inside a top-level panel: what's being broken down and its total. */
export function Panel({ title, total, children }: { title: string; total: number; children: React.ReactNode }) {
  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>{title}</h2>
        <span style={{ fontSize: 15, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{fmtMoney(total)}</span>
      </div>
      {children}
    </>
  );
}

export function Collapsible({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <details style={{ marginTop: 10 }}>
      <summary className="bd-sum" style={{ fontSize: 12, color: "var(--blue)", padding: "4px 0" }}>
        <span className="bd-caret">▸</span> {label}
      </summary>
      {children}
    </details>
  );
}

/** The largest programs, with the rest behind a "N more programs" disclosure. Each links to its own page. */
export function TopPrograms({ lines, total, color, hrefBase }: { lines: BudgetLine[]; total: number; color: string; hrefBase: string }) {
  return (
    <>
      <Lines lines={lines.slice(0, PROGRAMS_SHOWN)} total={total} color={color} hrefBase={hrefBase} />
      {lines.length > PROGRAMS_SHOWN && (
        <Collapsible label={`${lines.length - PROGRAMS_SHOWN} more programs`}>
          <Lines lines={lines.slice(PROGRAMS_SHOWN)} total={total} color={color} hrefBase={hrefBase} />
        </Collapsible>
      )}
    </>
  );
}

/** Horizontal bars as a share of `total`. Lines with sub-lines expand; lines with a slug link to `${hrefBase}/${slug}`.
 *  `trend` adds content (e.g. the line's history) shown when a line expands, making every line expandable. */
export function Lines({ lines, total, color, hrefBase, trend }: { lines: BudgetLine[]; total: number; color: string; hrefBase?: string; trend?: (l: BudgetLine) => React.ReactNode }) {
  const max = Math.max(...lines.map(l => Math.abs(l.amount)), 1);
  return (
    <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
      {lines.map(l => {
        const kids = childrenOf(l);
        const extra = trend?.(l);
        const expandable = kids.length > 1 || !!extra;
        const href = hrefBase && l.slug ? `${hrefBase}/${l.slug}` : null;
        const row = <LineRow line={l} total={total} max={max} color={color} expandable={expandable} linked={!!href} />;
        return (
          <li key={l.name} style={{ borderTop: "1px solid var(--border)" }}>
            {href ? (
              <Link href={href} className="bd-link" aria-label={`${l.name}: ${fmtMoney(l.amount)}. See its breakdown.`}>{row}</Link>
            ) : expandable ? (
              <details>
                <summary className="bd-sum">{row}</summary>
                {extra}
                {kids.length > 1 && <SubLines lines={kids} />}
              </details>
            ) : row}
          </li>
        );
      })}
    </ul>
  );
}

/** A line's breakdown, skipping single-child levels that would just repeat the parent
 *  (e.g. Federal Subsidies › Federal Subsidies › Fed Grants/Subs). */
function childrenOf(line: BudgetLine): BudgetLine[] {
  let kids = line.sub ?? [];
  while (kids.length === 1 && kids[0].sub) kids = kids[0].sub;
  return kids;
}

/** Nested sub-lines (sub-category, then commitment item); any with their own breakdown expand again. */
function SubLines({ lines }: { lines: BudgetLine[] }) {
  return (
    <ul style={{ listStyle: "none", margin: "0 0 8px", padding: "0 0 0 18px" }}>
      {lines.map(s => {
        const kids = childrenOf(s);
        const row = (
          <span style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 12, color: "var(--text-secondary)", padding: "3px 0" }}>
            <span>
              {kids.length > 1 && <span className="bd-caret" style={{ marginRight: 6, fontSize: 10 }}>▸</span>}
              {s.name}
            </span>
            <span style={{ fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }} title={fmtDollars(s.amount)}>{fmtMoney(s.amount)}</span>
          </span>
        );
        return (
          <li key={s.name}>
            {kids.length > 1 ? (
              <details>
                <summary className="bd-sum">{row}</summary>
                <SubLines lines={kids} />
              </details>
            ) : row}
          </li>
        );
      })}
    </ul>
  );
}

function LineRow({ line, total, max, color, expandable, linked }: { line: BudgetLine; total: number; max: number; color: string; expandable: boolean; linked: boolean }) {
  const share = total ? (line.amount / total) * 100 : 0;
  return (
    <div style={{ padding: "8px 0" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 13 }}>
        <span style={{ minWidth: 0 }}>
          {expandable && <span className="bd-caret" style={{ color: "var(--text-secondary)", marginRight: 6, fontSize: 11 }}>▸</span>}
          <span className="bd-name">{line.name}</span>
        </span>
        <span style={{ whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }} title={fmtDollars(line.amount)}>
          {fmtMoney(line.amount)} <span style={{ color: "var(--text-secondary)", fontSize: 11 }}>{share.toFixed(1)}%</span>
          {linked && <span aria-hidden style={{ color: "var(--text-secondary)", marginLeft: 8 }}>›</span>}
        </span>
      </div>
      <div aria-hidden style={{ height: 4, marginTop: 5, borderRadius: 2, background: "var(--border)", overflow: "hidden" }}>
        <div style={{ width: `${Math.max(0, (line.amount / max) * 100)}%`, height: "100%", background: color, borderRadius: 2 }} />
      </div>
    </div>
  );
}
