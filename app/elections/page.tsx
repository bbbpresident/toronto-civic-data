"use client";
import { useEffect, useRef, useState } from "react";
import PageNav from "@/components/PageNav";
import ViewToggle from "@/components/ViewToggle";
import ShareByRankGrid from "@/components/ShareByRankGrid";
import Leaderboards from "@/components/Leaderboards";
import { ELECTIONS, ELECTIONS_DATA } from "@/lib/elections";
import { getAffiliation } from "@/lib/affiliations";
import type { Election } from "@/lib/types";
import { DataSourceCitation, PageSourceLink } from "@/components/SourceCitation";

// Every figure on this page comes from lib/elections.json, which carries the source file for
// each one; affiliations come from lib/affiliations.ts, each with its own record. Don't render a number here
// that doesn't arrive with a source.

// Scale tops out at the next 20% step above the highest turnout, never below 60%.
const Y_MAX = Math.max(60, Math.ceil(Math.max(...ELECTIONS.map(e => e.turnout?.turnoutPct ?? 0)) / 20) * 20);
const GRID = Array.from({ length: Y_MAX / 20 + 1 }, (_, i) => i * 20);
const CHART_H = 220;

const fmtInt = (n: number) => n.toLocaleString("en-CA");
const fmtPct = (n: number, d = 1) => `${n.toFixed(d)}%`;

// By-elections share the series colour but carry a stripe, so they're distinguishable without colour.
const BY_ELECTION_FILL = "repeating-linear-gradient(135deg, var(--blue) 0 4px, rgba(96,165,250,0.45) 4px 7px)";

export default function ElectionsPage() {
  const [open, setOpen] = useState<Election | null>(null);
  const [hover, setHover] = useState<string | null>(null);

  return (
    <div style={{ maxWidth: 760, margin: "0 auto", padding: "0 4px 48px" }}>
      {/* Bar value labels shrink on phones so eight columns' labels don't run together. */}
      <style>{`.to-bar-val{font-size:11px}@media (max-width:520px){.to-bar-val{font-size:9px;letter-spacing:-0.02em}}`}</style>
      <PageNav />
      <header style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-0.03em", color: "var(--text-primary)", margin: "0 0 6px" }}>
          Voter turnout in municipal elections
        </h1>
        <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: 0, lineHeight: 1.5 }}>
          Every figure links to the City of Toronto file it came from. Select an election to see its top 10 mayoral candidates, or switch to By person for the all-time leaderboard.
        </p>
      </header>

      <ViewToggle size="lg" label="View" storageKey="elections-view" views={[
        {
          id: "election", label: "By election", content: (
            <>
          {/* ── Chart ─────────────────────────────────────────────────────────── */}
          <section style={{ padding: "18px 16px 14px", borderRadius: 14, border: "1px solid var(--border)", background: "var(--surface)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
              <h2 style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>Turnout, % of eligible electors</h2>
              <Legend />
            </div>

            <div style={{ position: "relative", height: CHART_H, marginLeft: 30 }}>
              {GRID.map(g => (
                <div key={g} aria-hidden style={{ position: "absolute", left: 0, right: 0, bottom: (g / Y_MAX) * CHART_H, borderTop: `1px solid ${g === 0 ? "var(--text-secondary)" : "var(--border)"}`, opacity: g === 0 ? 0.6 : 1 }}>
                  <span style={{ position: "absolute", left: -30, top: -7, width: 24, textAlign: "right", fontSize: 10, color: "var(--text-secondary)" }}>{g}%</span>
                </div>
              ))}

              <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "flex-end", gap: 6, padding: "0 2px" }}>
                {ELECTIONS.map(e => (
                  <Bar key={e.id} e={e} hovered={hover === e.id} onHover={h => setHover(h ? e.id : null)} onOpen={() => setOpen(e)} />
                ))}
              </div>
            </div>

            <div style={{ display: "flex", gap: 6, marginLeft: 30, padding: "6px 2px 0" }}>
              {ELECTIONS.map(e => (
                <div key={e.id} style={{ flex: 1, minWidth: 0, textAlign: "center", fontSize: 11, color: "var(--text-secondary)", lineHeight: 1.25 }}>
                  {e.year}
                  {e.kind === "by-election" && <div style={{ fontSize: 9 }}>by-elec.</div>}
                </div>
              ))}
            </div>
          </section>

          {/* ── Table view (accessible equivalent of the chart, with per-row sources) ── */}
          <section style={{ marginTop: 28 }}>
            <h2 style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)", margin: "0 0 10px" }}>Data table</h2>
            <div style={{ overflowX: "auto", border: "1px solid var(--border)", borderRadius: 12, background: "var(--surface)" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, minWidth: 520 }}>
                <thead>
                  <tr style={{ color: "var(--text-secondary)", textAlign: "left" }}>
                    {["Election", "Turnout", "Voted", "Eligible electors", "Source"].map((h, i) => (
                      <th key={h} style={{ padding: "10px 12px", fontWeight: 600, borderBottom: "1px solid var(--border)", textAlign: i > 0 && i < 4 ? "right" : "left" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ELECTIONS.map(e => (
                    <tr key={e.id} style={{ borderBottom: "1px solid var(--border)" }}>
                      <td style={{ padding: "9px 12px" }}>
                        <button onClick={() => setOpen(e)} style={{ background: "none", border: "none", padding: 0, color: "var(--blue)", cursor: "pointer", fontSize: 12, textDecoration: "underline", textUnderlineOffset: 2 }}>
                          {e.label}
                        </button>
                      </td>
                      {e.turnout ? (
                        <>
                          <td style={{ padding: "9px 12px", textAlign: "right", color: "var(--text-primary)", fontVariantNumeric: "tabular-nums" }}>{fmtPct(e.turnout.turnoutPct, 2)}</td>
                          <td style={{ padding: "9px 12px", textAlign: "right", color: "var(--text-primary)", fontVariantNumeric: "tabular-nums" }}>{fmtInt(e.turnout.numberVoted)}</td>
                          <td style={{ padding: "9px 12px", textAlign: "right", color: "var(--text-primary)", fontVariantNumeric: "tabular-nums" }}>{fmtInt(e.turnout.eligibleElectors)}</td>
                          <td style={{ padding: "9px 12px" }}>
                            <a href={e.turnout.source.fileUrl} target="_blank" rel="noopener noreferrer" style={{ color: "var(--blue)", textDecoration: "underline", textUnderlineOffset: 2 }}>
                              {e.turnout.source.dataset} ↗
                            </a>
                          </td>
                        </>
                      ) : (
                        <td colSpan={4} style={{ padding: "9px 12px", color: "var(--text-secondary)" }}>
                          Not yet published by the City (results are available — open the election)
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

              {/* ── Share by finishing position ─────────────────────────────── */}
              <section style={{ marginTop: 28 }}>
                <h2 style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)", margin: "0 0 4px" }}>Share of the mayoral vote by finishing position</h2>
                <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: "0 0 10px", lineHeight: 1.5 }}>
                  Each row is one race and adds up to 100% of the votes cast for mayor. Hover a cell for the candidate.
                </p>
                <ShareByRankGrid elections={ELECTIONS} onOpen={setOpen} />
              </section>
            </>
          ),
        },
        {
          id: "person", label: "By person", content: (
            <section>
              <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: "0 0 4px", lineHeight: 1.5 }}>
                Every mayoral candidate in {ELECTIONS.length} races ({ELECTIONS[0].year}–{ELECTIONS[ELECTIONS.length - 1].year}, including the {ELECTIONS.filter(e => e.kind === "by-election").map(e => e.year).join(", ")}{" "}by-election). The City&apos;s files have no candidate ID, so a person is everyone listed under the same name; hover a name to see how it was listed.
              </p>
              <Leaderboards elections={ELECTIONS} onOpen={setOpen} />
            </section>
          ),
        },
      ]} />

      <Methodology />

      {open && <ResultsModal e={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

// ── Chart pieces ──────────────────────────────────────────────────────────────

function Legend() {
  const swatch: React.CSSProperties = { width: 12, height: 12, borderRadius: 3, display: "inline-block", flexShrink: 0 };
  return (
    <div style={{ display: "flex", gap: 12, flexWrap: "wrap", fontSize: 11, color: "var(--text-secondary)" }}>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><span style={{ ...swatch, background: "var(--blue)" }} />General</span>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><span style={{ ...swatch, background: BY_ELECTION_FILL }} />By-election</span>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><span style={{ ...swatch, border: "1.5px dashed var(--text-secondary)" }} />Not yet published</span>
    </div>
  );
}

function Bar({ e, hovered, onHover, onOpen }: { e: Election; hovered: boolean; onHover: (h: boolean) => void; onOpen: () => void }) {
  const t = e.turnout;
  const pct = t?.turnoutPct ?? null;
  const height = pct != null ? (pct / Y_MAX) * CHART_H : CHART_H * 0.35;
  const label = pct != null
    ? `${e.label}: turnout ${fmtPct(pct)} (${fmtInt(t!.numberVoted)} of ${fmtInt(t!.eligibleElectors)} eligible electors). Open mayoral results.`
    : `${e.label}: turnout not yet published by the City. Open mayoral results.`;

  return (
    // The hit target is the full column height, wider than the mark itself.
    <button
      onClick={onOpen}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
      onFocus={() => onHover(true)}
      onBlur={() => onHover(false)}
      aria-label={label}
      style={{ flex: 1, minWidth: 0, height: "100%", position: "relative", display: "flex", flexDirection: "column", justifyContent: "flex-end", alignItems: "center", background: "none", border: "none", padding: 0, cursor: "pointer" }}
    >
      <span className="to-bar-val" style={{ fontWeight: 600, color: pct != null ? "var(--text-primary)" : "var(--text-secondary)", marginBottom: 4, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
        {pct != null ? fmtPct(pct) : "Pending"}
      </span>
      <span
        style={{
          width: "100%", maxWidth: 52, height, borderRadius: "4px 4px 0 0",
          background: pct == null ? "transparent" : e.kind === "by-election" ? BY_ELECTION_FILL : "var(--blue)",
          border: pct == null ? "1.5px dashed var(--text-secondary)" : "none",
          borderBottom: "none",
          opacity: hovered ? 1 : 0.85,
          boxShadow: hovered ? "0 0 0 2px var(--surface), 0 0 0 3px var(--blue)" : "none",
          transition: "opacity 0.15s, box-shadow 0.15s",
        }}
      />
      {hovered && (
        <span role="presentation" style={{
          position: "absolute", bottom: height + 26, left: "50%", transform: "translateX(-50%)", zIndex: 5,
          background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 8, padding: "7px 9px",
          fontSize: 11, color: "var(--text-primary)", whiteSpace: "nowrap", textAlign: "left", pointerEvents: "none",
          boxShadow: "0 6px 20px rgba(0,0,0,0.35)",
        }}>
          <div style={{ fontWeight: 700, marginBottom: 2 }}>{e.label}</div>
          {t ? (
            <>
              <div>Turnout {fmtPct(t.turnoutPct, 2)}</div>
              <div style={{ color: "var(--text-secondary)" }}>{fmtInt(t.numberVoted)} voted / {fmtInt(t.eligibleElectors)}</div>
            </>
          ) : (
            <div style={{ color: "var(--text-secondary)" }}>Turnout not yet published</div>
          )}
          <div style={{ color: "var(--text-secondary)", marginTop: 3 }}>Click for top 10 mayoral candidates</div>
        </span>
      )}
    </button>
  );
}

// ── Modal ─────────────────────────────────────────────────────────────────────

function ResultsModal({ e, onClose }: { e: Election; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const maxShare = e.mayor.top[0]?.sharePct ?? 100;

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (ev: KeyboardEvent) => { if (ev.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, zIndex: 100, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "6vh 12px", overflowY: "auto" }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="toronto-modal-title"
        onClick={ev => ev.stopPropagation()}
        style={{ width: "100%", maxWidth: 640, background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 16, padding: "20px 18px", boxShadow: "0 20px 60px rgba(0,0,0,0.5)", backdropFilter: "blur(14px)" }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 14 }}>
          <div>
            <h2 id="toronto-modal-title" style={{ fontSize: 18, fontWeight: 800, color: "var(--text-primary)", margin: "0 0 4px", letterSpacing: "-0.02em" }}>
              {e.label} — Mayor
            </h2>
            <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: 0 }}>
              Top 10 of {e.mayor.candidateCount} candidates · {fmtInt(e.mayor.totalVotes)} votes cast for mayor
              {e.turnout ? ` · turnout ${fmtPct(e.turnout.turnoutPct, 2)}` : " · turnout not yet published"}
            </p>
          </div>
          <button ref={closeRef} onClick={onClose} aria-label="Close" style={{ background: "none", border: "1px solid var(--border)", borderRadius: 8, color: "var(--text-secondary)", cursor: "pointer", fontSize: 14, width: 30, height: 30, flexShrink: 0 }}>
            ✕
          </button>
        </div>

        <ol style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {e.mayor.top.map(c => {
            const aff = getAffiliation(c.displayName);
            return (
              <li key={c.nameAsListed} style={{ display: "grid", gridTemplateColumns: "22px 1fr auto", gap: "4px 10px", padding: "10px 0", borderTop: "1px solid var(--border)", alignItems: "start" }}>
                <span style={{ fontSize: 12, color: "var(--text-secondary)", fontVariantNumeric: "tabular-nums", paddingTop: 1 }}>{c.rank}</span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>{c.displayName}</div>
                  <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>Listed as “{c.nameAsListed}”</div>
                  <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 3 }}>
                    {aff ? (
                      <>
                        <span style={{ color: "var(--text-primary)" }}>{aff.party}</span> — {aff.role} <PageSourceLink source={aff.source} />
                      </>
                    ) : (
                      <span aria-label="No affiliation recorded">Affiliation: —</span>
                    )}
                  </div>
                  <div aria-hidden style={{ height: 4, marginTop: 6, borderRadius: 2, background: "var(--border)", overflow: "hidden" }}>
                    <div style={{ width: `${(c.sharePct / maxShare) * 100}%`, height: "100%", background: "var(--blue)", borderRadius: 2 }} />
                  </div>
                </div>
                <div style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>{fmtInt(c.votes)}</div>
                  <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>{fmtPct(c.sharePct, 2)}</div>
                </div>
              </li>
            );
          })}
        </ol>

        <div style={{ display: "grid", gap: 12, marginTop: 16, paddingTop: 14, borderTop: "1px solid var(--border)" }}>
          <DataSourceCitation source={e.mayor.source} label="Vote counts" />
          {e.turnout ? (
            <DataSourceCitation source={e.turnout.source} label={`Turnout (the City's file states ${typeof e.turnout.publishedPct === "number" ? fmtPct(e.turnout.publishedPct, 2) : e.turnout.publishedPct})`} />
          ) : (
            <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: 0 }}>
              Turnout: the City hasn&apos;t published {e.year} voter statistics in its Elections – Voter Statistics dataset yet. This page will show it once it&apos;s published, and won&apos;t use unofficial figures.
            </p>
          )}
          <p style={{ fontSize: 11, color: "var(--text-secondary)", margin: 0, lineHeight: 1.5 }}>
            The City&apos;s results file lists candidates with no party. An affiliation appears only when an official legislature record documents a party role (dates shown, so you can see whether it came before or after this race). “—” means none recorded here, not “independent”.
          </p>
        </div>
      </div>
    </div>
  );
}

function Methodology() {
  return (
    <section style={{ marginTop: 28, fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.6 }}>
      <h2 style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)", margin: "0 0 8px" }}>About this data</h2>
      <p style={{ margin: "0 0 8px" }}>
        Turnout is computed as <em>Number Voted ÷ Total Eligible Electors</em>{" "}from the Grand Total row of each City voter-statistics file. The files&apos; own “% Voted” cell is sometimes rounded (e.g. 2022 shows 30%), and from 2022 the City&apos;s readme says it also counts declined ballots, so small differences from published headline figures are expected. Each election&apos;s detail view shows the file&apos;s own figure next to ours.
      </p>
      <p style={{ margin: "0 0 8px" }}>
        Mayoral vote counts are summed from the City&apos;s poll-by-poll results across all ward sheets. The build checks that each row&apos;s subdivisions add up to its total, and that candidate totals match the City&apos;s own ward-total rows.
      </p>
      <p style={{ margin: "0 0 8px" }}>
        The leaderboards and the finishing-position grid use every candidate&apos;s total from those same results files. Shares are each candidate&apos;s votes ÷ all votes cast for mayor in that race. People are matched across races by name, since the files have no candidate ID, so two different people with the same name would be counted together, and someone listed under a changed name (e.g. a shortened first name) would appear twice.
      </p>
      <p style={{ margin: 0 }}>
        Data generated {ELECTIONS_DATA.generatedOn} by <code>{ELECTIONS_DATA.generator}</code> from City of Toronto Open Data.
      </p>
    </section>
  );
}
