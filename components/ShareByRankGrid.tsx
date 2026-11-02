import { shareByRank } from "@/lib/leaderboard";
import type { Election } from "@/lib/types";

// One row per mayoral race: the share of the mayoral vote won by the 1st…10th-place
// candidate and by everyone below 10th. Each row sums to 100% of that race's votes.
// Cells are shaded on a single blue ramp by share; the number is always printed.

const POSITIONS = 10;
const ordinal = (n: number) => `${n}${n === 1 ? "st" : n === 2 ? "nd" : n === 3 ? "rd" : "th"}`;

export default function ShareByRankGrid({ elections, onOpen }: { elections: Election[]; onOpen: (e: Election) => void }) {
  const rows = elections.map(e => ({ e, ...shareByRank(e, POSITIONS) }));
  const max = Math.max(...rows.flatMap(r => r.shares));
  const cell = (share: number): React.CSSProperties => ({
    padding: "8px 6px", textAlign: "right", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap",
    background: `rgba(57,135,229,${(0.08 + 0.72 * (share / max)).toFixed(3)})`,
    color: share / max > 0.35 ? "#ffffff" : "var(--text-primary)", borderLeft: "2px solid var(--surface)",
  });

  return (
    <div style={{ overflowX: "auto", border: "1px solid var(--border)", borderRadius: 12, background: "var(--surface)" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, minWidth: 640 }}>
        <thead>
          <tr style={{ color: "var(--text-secondary)" }}>
            <th style={{ padding: "8px 10px", textAlign: "left", fontWeight: 600 }}>Race</th>
            {Array.from({ length: POSITIONS }, (_, i) => (
              <th key={i} style={{ padding: "8px 6px", textAlign: "right", fontWeight: 600 }}>{ordinal(i + 1)}</th>
            ))}
            <th style={{ padding: "8px 6px", textAlign: "right", fontWeight: 600 }}>All others</th>
            <th style={{ padding: "8px 10px", textAlign: "right", fontWeight: 600 }}>Total</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ e, shares, others }) => (
            <tr key={e.id} style={{ borderTop: "2px solid var(--surface)" }}>
              <td style={{ padding: "8px 10px", whiteSpace: "nowrap" }}>
                <button onClick={() => onOpen(e)} style={{ background: "none", border: "none", padding: 0, color: "var(--blue)", cursor: "pointer", fontSize: 11, textDecoration: "underline", textUnderlineOffset: 2 }}>
                  {e.year}{e.kind === "by-election" ? " by-election" : ""}
                </button>
              </td>
              {shares.map((s, i) => {
                const c = e.mayor.candidates[i];
                return (
                  <td key={i} style={cell(s)} title={`${ordinal(i + 1)}: ${c.displayName}, ${c.votes.toLocaleString("en-CA")} votes (${s.toFixed(2)}%)`}>
                    {s.toFixed(1)}%
                  </td>
                );
              })}
              <td style={cell(others)} title={`${e.mayor.candidateCount - POSITIONS} other candidates combined`}>{others.toFixed(1)}%</td>
              <td style={{ padding: "8px 10px", textAlign: "right", color: "var(--text-secondary)", fontVariantNumeric: "tabular-nums" }}>
                {(shares.reduce((a, b) => a + b, 0) + others).toFixed(1)}%
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
