"use client";
import { useState } from "react";
import Link from "next/link";

// Type-to-filter list of Toronto schools; each links to its page. Receives only the index
// (name, board, level, area), not the yearly figures.

export interface SchoolRow { id: string; name: string; board: string; level: string; area: string }

const SHOWN = 40;

export default function SchoolFinder({ schools }: { schools: SchoolRow[] }) {
  const [q, setQ] = useState("");
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
  const hits = terms.length ? schools.filter(s => terms.every(t => `${s.name} ${s.board} ${s.area} ${s.level}`.toLowerCase().includes(t))) : [];
  return (
    <div>
      <input
        type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Search by school name, board or area"
        aria-label="Search Toronto schools"
        style={{ width: "100%", padding: "10px 12px", fontSize: 14, borderRadius: 10, border: "1px solid var(--border)", background: "var(--background)", color: "var(--text-primary)" }}
      />
      {terms.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: 11, color: "var(--text-secondary)", marginBottom: 6 }}>{hits.length}{" "}school{hits.length === 1 ? "" : "s"}{hits.length > SHOWN ? ` · showing the first ${SHOWN}` : ""}</div>
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {hits.slice(0, SHOWN).map(s => (
              <li key={s.id} style={{ borderTop: "1px solid var(--border)" }}>
                <Link href={`/schools/${s.id}`} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "8px 2px", color: "inherit", textDecoration: "none" }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "var(--blue)" }}>{s.name}</span>
                  <span style={{ fontSize: 11, color: "var(--text-secondary)", textAlign: "right", whiteSpace: "nowrap" }}>{s.board} · {s.level} · {s.area}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
