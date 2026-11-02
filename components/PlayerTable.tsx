"use client";

import { useMemo, useState } from "react";
import type { PlayerColumn, PlayerRow } from "@/lib/types";

// A sortable, searchable table of player totals. Click a column header to sort by it (again to
// reverse); numbers sort high-to-low first (low-to-high where lower is better, like ERA), names
// A–Z. Blanks always sort last, and so do players short of a rate stat's minimum sample.

const PAGE = 100;

function show(v: PlayerRow[string], kind: PlayerColumn["kind"]): string {
  if (v == null || v === "") return "—";
  if (typeof v === "string") return v;
  switch (kind) {
    case "dec1": return v.toFixed(1);
    case "dec2": return v.toFixed(2);
    case "dec3": case "pct": return v.toFixed(3).replace(/^0(?=\.)/, "");
    case "ip": return `${Math.floor(v / 3).toLocaleString("en-CA")}.${v % 3}`;
    default: return v.toLocaleString("en-CA");
  }
}

export default function PlayerTable({ label, columns, rows, sort }: { label: string; columns: PlayerColumn[]; rows: PlayerRow[]; sort: string }) {
  const [key, setKey] = useState(sort);
  const [desc, setDesc] = useState(true);
  const [query, setQuery] = useState("");
  const [all, setAll] = useState(false);

  const active = columns.find(c => c.key === key);
  const sorted = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q ? rows.filter(r => r.name.toLowerCase().includes(q)) : rows;
    const qual = active?.qualify;
    const short = (r: PlayerRow) => !!qual && Number(r[qual.key] ?? 0) < qual.min;
    return [...list].sort((a, b) => {
      if (short(a) !== short(b)) return short(a) ? 1 : -1;
      const x = a[key], y = b[key];
      if (x == null || x === "") return y == null || y === "" ? 0 : 1;
      if (y == null || y === "") return -1;
      const c = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y));
      return (desc ? -c : c) || a.name.localeCompare(b.name);
    });
  }, [rows, key, desc, query, active]);

  function sortBy(c: PlayerColumn) {
    if (c.key === key) setDesc(d => !d);
    else { setKey(c.key); setDesc(!(c.kind === "text" || c.asc)); }
  }

  const shown = all ? sorted : sorted.slice(0, PAGE);
  const th: React.CSSProperties = { padding: 0, textAlign: "right", fontWeight: 600, whiteSpace: "nowrap", borderBottom: "1px solid var(--border)" };
  const btn = (active: boolean): React.CSSProperties => ({
    all: "unset", cursor: "pointer", display: "block", padding: "8px 8px", width: "100%", boxSizing: "border-box",
    fontSize: 11, letterSpacing: "0.04em", textTransform: "uppercase", color: active ? "var(--text-primary)" : "var(--text-secondary)",
  });
  const cols: (PlayerColumn & { name?: boolean })[] = [{ key: "name", label: "Player", kind: "text", name: true }, ...columns];

  return (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <input type="search" value={query} onChange={e => { setQuery(e.target.value); setAll(false); }} placeholder="Find a player"
          aria-label={`Find a player in ${label}`}
          style={{ fontSize: 14, padding: "8px 12px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface-2)", color: "var(--text-primary)", minWidth: 0, flex: "1 1 200px", maxWidth: 320 }} />
        <span style={{ fontSize: 12, color: "var(--text-secondary)" }} aria-live="polite">
          {sorted.length.toLocaleString("en-CA")} players{active?.qualify ? `; players with fewer than ${active.qualify.label} are listed last` : ""}
        </span>
      </div>
      <div style={{ overflowX: "auto", border: "1px solid var(--border)", borderRadius: 12 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, fontVariantNumeric: "tabular-nums" }}>
          <caption className="sr-only" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>
            {label}, sorted by {cols.find(c => c.key === key)?.label} {desc ? "descending" : "ascending"}
          </caption>
          <thead style={{ background: "var(--surface-2)" }}>
            <tr>
              {cols.map(c => {
                const active = c.key === key;
                return (
                  <th key={c.key} scope="col" aria-sort={active ? (desc ? "descending" : "ascending") : "none"}
                    style={{ ...th, textAlign: c.kind === "text" ? "left" : "right", ...(c.name ? { position: "sticky", left: 0, background: "var(--surface-2)", zIndex: 1 } : {}) }}>
                    <button type="button" onClick={() => sortBy(c)} style={{ ...btn(active), textAlign: c.kind === "text" ? "left" : "right" }}>
                      {c.label}{active ? (desc ? " ↓" : " ↑") : ""}
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {shown.map((r, i) => (
              <tr key={`${r.name}-${r.url ?? i}`} style={{ borderTop: i ? "1px solid var(--border)" : undefined }}>
                {cols.map(c => c.name ? (
                  <th key="name" scope="row" style={{ textAlign: "left", fontWeight: 600, padding: "7px 8px", whiteSpace: "nowrap", position: "sticky", left: 0, background: "var(--surface)" }}>
                    {r.url ? <a href={r.url} target="_blank" rel="noopener noreferrer" style={{ color: "inherit", textDecoration: "none" }}>{r.name}</a> : r.name}
                  </th>
                ) : (
                  <td key={c.key} style={{ textAlign: c.kind === "text" ? "left" : "right", padding: "7px 8px", whiteSpace: "nowrap", color: r[c.key] == null ? "var(--text-secondary)" : undefined }}>
                    {show(r[c.key], c.kind)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {sorted.length > PAGE && (
        <button type="button" onClick={() => setAll(a => !a)}
          style={{ marginTop: 10, fontSize: 13, fontWeight: 600, padding: "8px 14px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text-primary)", cursor: "pointer" }}>
          {all ? `Show the top ${PAGE}` : `Show all ${sorted.length.toLocaleString("en-CA")}`}
        </button>
      )}
    </div>
  );
}
