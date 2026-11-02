"use client";

import { useMemo, useState } from "react";
import type { RoadRestriction } from "@/lib/types";

// The construction page's searchable list (road, area or who's doing the work).
export default function ConstructionList({ items }: { items: RoadRestriction[] }) {
  const [q, setQ] = useState("");
  const [all, setAll] = useState(false);
  const hits = useMemo(() => {
    const t = q.trim().toLowerCase();
    return t ? items.filter(i => `${i.road} ${i.where} ${i.district ?? ""} ${i.by ?? ""}`.toLowerCase().includes(t)) : items;
  }, [q, items]);
  const shown = all ? hits : hits.slice(0, 60);
  return (
    <div>
      <input type="search" value={q} onChange={e => { setQ(e.target.value); setAll(false); }} placeholder="Search a street, area or utility" aria-label="Search road restrictions"
        style={{ width: "100%", boxSizing: "border-box", fontSize: 14, padding: "9px 12px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface-2)", color: "var(--text-primary)" }} />
      <p aria-live="polite" style={{ fontSize: 12, color: "var(--text-secondary)", margin: "8px 0 4px" }}>{hits.length.toLocaleString("en-CA")} restrictions, ending soonest first</p>
      <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {shown.map(i => (
          <li key={i.id} style={{ padding: "9px 0", borderTop: "1px solid var(--border)", fontSize: 13 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
              <strong>{i.road || i.where}</strong>
              <span style={{ fontSize: 11, color: i.type === "ROAD_CLOSED" ? "var(--s5)" : "var(--s4)", fontWeight: 700, whiteSpace: "nowrap" }}>{i.type === "ROAD_CLOSED" ? "Road closed" : "Construction"}</span>
            </div>
            <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2, lineHeight: 1.45 }}>
              {i.where}{i.district ? ` · ${i.district}` : ""}{i.by ? ` · ${i.by}` : ""}{i.until ? ` · until ${i.until}` : ""}
            </div>
          </li>
        ))}
      </ul>
      {hits.length > 60 && (
        <button type="button" onClick={() => setAll(a => !a)} style={{ marginTop: 8, fontSize: 13, fontWeight: 600, padding: "8px 14px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text-primary)", cursor: "pointer" }}>
          {all ? "Show fewer" : `Show all ${hits.length.toLocaleString("en-CA")}`}
        </button>
      )}
    </div>
  );
}
