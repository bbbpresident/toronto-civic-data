"use client";
import { useState } from "react";
import ViewToggle from "@/components/ViewToggle";
import { getAffiliation } from "@/lib/affiliations";
import { PageSourceLink } from "@/components/SourceCitation";
import { people, raceResults, type PersonRecord } from "@/lib/leaderboard";
import type { Election } from "@/lib/types";

// Mayoral leaderboards: all-time votes per person, and the biggest single-race results.
// Built from every candidate in every race (elections.json), so totals include races where
// someone finished outside the top 10.

const SHOWN = 25;
const fmtInt = (n: number) => n.toLocaleString("en-CA");
const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : n % 10 === 1 ? "st" : n % 10 === 2 ? "nd" : n % 10 === 3 ? "rd" : "th"}`;
const raceLabel = (e: Election) => `${e.year}${e.kind === "by-election" ? " by-election" : ""}`;

const th: React.CSSProperties = { padding: "10px 10px", fontWeight: 600, borderBottom: "1px solid var(--border)", textAlign: "left", whiteSpace: "nowrap" };
const td: React.CSSProperties = { padding: "9px 10px", fontVariantNumeric: "tabular-nums", verticalAlign: "top" };
const chip: React.CSSProperties = { fontSize: 11, padding: "2px 7px", borderRadius: 999, border: "1px solid var(--border)", background: "transparent", cursor: "pointer", fontVariantNumeric: "tabular-nums" };

export default function Leaderboards({ elections, onOpen }: { elections: Election[]; onOpen: (e: Election) => void }) {
  return (
    <>
    <style>{`.lb-races-inline{display:none}@media (max-width:600px){.lb-races-col{display:none}.lb-races-inline{display:block}}`}</style>
    <ViewToggle label="Leaderboard" storageKey="leaderboard-view" views={[
      { id: "all-time", label: "All time", content: <AllTime elections={elections} onOpen={onOpen} /> },
      { id: "single", label: "Best single election", content: <SingleElection elections={elections} onOpen={onOpen} /> },
    ]} />
    </>
  );
}

function Name({ name, listed }: { name: string; listed: string[] }) {
  const aff = getAffiliation(name);
  return (
    <>
      <div style={{ fontWeight: 600 }} title={`Listed as: ${[...new Set(listed)].join(", ")}`}>{name}</div>
      {aff && <div style={{ fontSize: 10, color: "var(--text-secondary)" }} title={aff.role}>{aff.party} <PageSourceLink source={aff.source} /></div>}
    </>
  );
}

function AllTime({ elections, onOpen }: { elections: Election[]; onOpen: (e: Election) => void }) {
  const [all, setAll] = useState(false);
  const list = people(elections);
  const rows = all ? list : list.slice(0, SHOWN);
  return (
    // No minimum width: on phones the Races column folds under the name, so four columns fit.
    <Board minWidth={0} footer={list.length > SHOWN && <ShowAll all={all} total={list.length} onToggle={() => setAll(a => !a)} />}>
      <thead>
        <tr style={{ color: "var(--text-secondary)" }}>
          <th style={th}>#</th>
          <th style={th}>Candidate</th>
          <th style={{ ...th, textAlign: "right" }}>Total votes</th>
          <th style={{ ...th, textAlign: "right" }}>Wins</th>
          <th style={th} className="lb-races-col">Races (finish)</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((p, i) => (
          <tr key={p.key} style={{ borderTop: "1px solid var(--border)" }}>
            <td style={{ ...td, color: "var(--text-secondary)" }}>{i + 1}</td>
            <td style={td}>
              <Name name={p.displayName} listed={p.races.map(r => r.nameAsListed)} />
              {/* On phones the Races column is hidden and the chips sit under the name instead. */}
              <div className="lb-races-inline" style={{ marginTop: 6 }}><RaceChips races={p.races} onOpen={onOpen} /></div>
            </td>
            <td style={{ ...td, textAlign: "right", fontWeight: 600 }}>{fmtInt(p.totalVotes)}</td>
            <td style={{ ...td, textAlign: "right", color: p.wins ? "var(--text-primary)" : "var(--text-secondary)" }}>{p.wins}</td>
            <td style={td} className="lb-races-col"><RaceChips races={p.races} onOpen={onOpen} /></td>
          </tr>
        ))}
      </tbody>
    </Board>
  );
}

function RaceChips({ races, onOpen }: { races: PersonRecord["races"]; onOpen: (e: Election) => void }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
      {[...races].sort((a, b) => a.election.year - b.election.year).map(r => (
        <button key={r.election.id} onClick={() => onOpen(r.election)} title={`${fmtInt(r.votes)} votes, ${r.sharePct.toFixed(2)}%`}
          style={{ ...chip, color: r.rank === 1 ? "var(--text-primary)" : "var(--text-secondary)", borderColor: r.rank === 1 ? "var(--blue)" : "var(--border)" }}>
          {raceLabel(r.election)} · {ordinal(r.rank)}
        </button>
      ))}
    </div>
  );
}

function SingleElection({ elections, onOpen }: { elections: Election[]; onOpen: (e: Election) => void }) {
  const [all, setAll] = useState(false);
  const list = raceResults(elections).sort((a, b) => b.votes - a.votes);
  const rows = all ? list : list.slice(0, SHOWN);
  return (
    <Board footer={list.length > SHOWN && <ShowAll all={all} total={list.length} onToggle={() => setAll(a => !a)} />}>
      <thead>
        <tr style={{ color: "var(--text-secondary)" }}>
          <th style={th}>#</th>
          <th style={th}>Candidate</th>
          <th style={th}>Race</th>
          <th style={{ ...th, textAlign: "right" }}>Votes</th>
          <th style={{ ...th, textAlign: "right" }}>Share</th>
          <th style={{ ...th, textAlign: "right" }}>Finish</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={`${r.election.id}-${r.nameAsListed}`} style={{ borderTop: "1px solid var(--border)" }}>
            <td style={{ ...td, color: "var(--text-secondary)" }}>{i + 1}</td>
            <td style={td}><Name name={r.displayName} listed={[r.nameAsListed]} /></td>
            <td style={td}>
              <button onClick={() => onOpen(r.election)} style={{ ...chip, color: "var(--blue)" }}>{raceLabel(r.election)}</button>
            </td>
            <td style={{ ...td, textAlign: "right", fontWeight: 600 }}>{fmtInt(r.votes)}</td>
            <td style={{ ...td, textAlign: "right" }}>{r.sharePct.toFixed(2)}%</td>
            <td style={{ ...td, textAlign: "right", color: r.rank === 1 ? "var(--text-primary)" : "var(--text-secondary)" }}>{ordinal(r.rank)}</td>
          </tr>
        ))}
      </tbody>
    </Board>
  );
}

function Board({ children, footer, minWidth = 560 }: { children: React.ReactNode; footer?: React.ReactNode; minWidth?: number }) {
  return (
    <>
      <div style={{ overflowX: "auto", border: "1px solid var(--border)", borderRadius: 12, background: "var(--surface)" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, minWidth }}>{children}</table>
      </div>
      {footer}
    </>
  );
}

function ShowAll({ all, total, onToggle }: { all: boolean; total: number; onToggle: () => void }) {
  return (
    <button onClick={onToggle} style={{ marginTop: 10, fontSize: 12, color: "var(--blue)", background: "none", border: "none", padding: 0, cursor: "pointer" }}>
      {all ? `Show top ${SHOWN}` : `Show all ${total}`}
    </button>
  );
}
