import Link from "next/link";
import ViewToggle from "@/components/ViewToggle";
import { DataSourceCitation } from "@/components/SourceCitation";
import { card, link } from "@/components/BudgetParts";
import { KeyFigures, SectionTitle } from "@/components/SectionParts";
import { TERMS } from "@/lib/council";
import type { CouncilMember, CouncilTerm, CouncilVote } from "@/lib/types";

// One Council term: headline figures, how each member voted (attendance, missed votes, siding
// with the majority and with the mayor), and the closest votes with their full roll call.
// Server component; the sort toggle switches between tables rendered here.

const th: React.CSSProperties = { padding: "8px 10px", fontWeight: 600, textAlign: "right", whiteSpace: "nowrap", borderBottom: "1px solid var(--border)" };
const td: React.CSSProperties = { padding: "7px 10px", textAlign: "right", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" };
const pct = (v: number | null) => (v == null ? "—" : `${v.toFixed(1)}%`);

export function TermChips({ current }: { current: string }) {
  return (
    <nav aria-label="Council term" style={{ display: "flex", flexWrap: "wrap", gap: 6, margin: "0 0 20px" }}>
      {TERMS.map(t => {
        const on = t.term === current;
        return (
          <Link key={t.term} href={`/council/${t.term}`} aria-current={on ? "page" : undefined} className="yr-chip" style={{
            fontSize: 12, padding: "5px 10px", borderRadius: 999, textDecoration: "none", fontVariantNumeric: "tabular-nums",
            border: `1px solid ${on ? "var(--blue)" : "var(--border)"}`, background: on ? "rgba(96,165,250,0.14)" : "transparent",
            color: on ? "var(--text-primary)" : "var(--text-secondary)", fontWeight: on ? 700 : 500,
          }}>{t.term.replace("-", "–")}</Link>
        );
      })}
    </nav>
  );
}

function Bar({ value }: { value: number | null }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8, justifyContent: "flex-end" }}>
      <span aria-hidden style={{ width: 60, height: 6, borderRadius: 3, background: "var(--surface-2)", overflow: "hidden" }}>
        {value != null && <span style={{ display: "block", width: `${value}%`, height: "100%", background: "var(--s1)", borderRadius: 3 }} />}
      </span>
      <span style={{ minWidth: 44 }}>{pct(value)}</span>
    </span>
  );
}

function MemberTable({ members }: { members: CouncilMember[] }) {
  return (
    <div style={{ overflowX: "auto", border: "1px solid var(--border)", borderRadius: 10, marginTop: 8 }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, minWidth: 640 }}>
        <thead>
          <tr style={{ color: "var(--text-secondary)" }}>
            <th style={{ ...th, textAlign: "left" }}>Member</th>
            <th style={th}>Votes cast</th>
            <th style={th} title="Votes the member was recorded absent for, out of all votes on their roll">Missed</th>
            <th style={th} title="Votes on the winning side, out of Yes/No votes cast">With majority</th>
            <th style={th} title="Same vote as the mayor, out of votes where both voted Yes or No">With the mayor</th>
            <th style={th} title="City Council sessions present, out of sessions listed for the member">Attendance</th>
          </tr>
        </thead>
        <tbody>
          {members.map(m => (
            <tr key={m.name} style={{ borderTop: "1px solid var(--border)" }}>
              <td style={{ ...td, textAlign: "left", fontWeight: 600 }}>
                {m.name}{m.isMayor && <span style={{ fontSize: 10, fontWeight: 700, color: "var(--text-secondary)", marginLeft: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>Mayor</span>}
              </td>
              <td style={td}>{m.cast.toLocaleString("en-CA")}</td>
              <td style={td}>{pct(m.missedPct)}</td>
              <td style={td}>{pct(m.withMajorityPct)}</td>
              <td style={td}>{m.isMayor ? <span style={{ color: "var(--text-secondary)" }}>—</span> : <Bar value={m.withMayorPct} />}</td>
              <td style={td}>{pct(m.attendancePct)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Roll({ v }: { v: CouncilVote }) {
  const group = (want: (x: string) => boolean) => Object.entries(v.roll).filter(([, x]) => want(x)).map(([n]) => n);
  const yes = group(x => x === "Yes"), no = group(x => x === "No"), away = group(x => x !== "Yes" && x !== "No");
  return (
    <div style={{ display: "grid", gap: 6, marginTop: 8, fontSize: 12, lineHeight: 1.5 }}>
      <div><strong>Yes ({yes.length}):</strong> <span style={{ color: "var(--text-secondary)" }}>{yes.join(", ")}</span></div>
      <div><strong>No ({no.length}):</strong> <span style={{ color: "var(--text-secondary)" }}>{no.join(", ")}</span></div>
      {away.length > 0 && <div><strong>Absent ({away.length}):</strong> <span style={{ color: "var(--text-secondary)" }}>{away.join(", ")}</span></div>}
    </div>
  );
}

export default function CouncilTermView({ t }: { t: CouncilTerm }) {
  const byMayor = [...t.members].sort((a, b) => Number(b.isMayor) - Number(a.isMayor) || (b.withMayorPct ?? -1) - (a.withMayorPct ?? -1));
  const byMissed = [...t.members].sort((a, b) => (b.missedPct ?? -1) - (a.missedPct ?? -1));
  const [a, b] = t.term.split("-").map(Number);
  const partial = t.firstYear > a + 1;
  return (
    <>
      <TermChips current={t.term} />
      {partial && (
        <p style={{ ...card, fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.5, margin: "0 0 14px" }}>
          The City&apos;s voting file for {a}–{b}{" "}only has votes from agenda items numbered {t.firstYear}–{t.lastYear}, so this term is
          incomplete.
        </p>
      )}
      <KeyFigures items={[
        {
          label: "Recorded votes at City Council", value: t.votes.toLocaleString("en-CA"), sub: `Agenda items from ${t.firstYear}–${t.lastYear}`,
          info: "Every vote at full City Council where each member's Yes or No was recorded in the City Clerk's voting record — on items, motions and amendments. One agenda item can have several votes (for example, an amendment and then the final item). Votes at committees aren't counted.",
        },
        {
          label: "Carried", value: `${((t.carried / t.votes) * 100).toFixed(0)}%`, sub: `${t.carried.toLocaleString("en-CA")} of ${t.votes.toLocaleString("en-CA")}`,
          info: "The share of recorded votes that passed — the City's result for the vote says \"Carried\". The rest were lost, including ties.",
        },
        {
          label: "Unanimous", value: `${((t.unanimous / t.votes) * 100).toFixed(0)}%`, sub: "Everyone voting was on the same side",
          info: "Votes where every member who voted was on the same side: all Yes or all No. Members recorded as absent don't count either way.",
        },
        {
          label: `Decided by ${t.closeMargin} votes or fewer`, value: t.close.toLocaleString("en-CA"),
          info: `Votes where the Yes and No counts were within ${t.closeMargin} of each other — for example 13–11, 12–11 or a 12–12 tie. Some votes need a two-thirds majority to pass, so a close count isn't always a close result. The closest ones are listed below.`,
        },
      ]} />

      <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: "14px 0 0", lineHeight: 1.6 }}>
        Mayor{t.mayors.length > 1 ? "s" : ""} this term:{" "}
        {t.mayors.map((m, i) => (
          <span key={m.name}>
            {i > 0 && "; "}<strong style={{ color: "var(--text-primary)" }}>{m.name}</strong>{" "}
            (won the <a href={m.source.fileUrl} target="_blank" rel="noopener noreferrer" style={link} title={`${m.source.publisher}: ${m.source.dataset}`}>{m.election}</a>)
          </span>
        ))}
        . For each vote, the mayor is whichever of them is on that vote&apos;s roll.
      </p>

      <SectionTitle>How members voted</SectionTitle>
      <section style={{ ...card, marginTop: 12 }}>
        <ViewToggle label="Sort" storageKey="council-sort" views={[
          { id: "mayor", label: "With the mayor", content: <MemberTable members={byMayor} /> },
          { id: "missed", label: "Most missed", content: <MemberTable members={byMissed} /> },
          { id: "name", label: "A–Z", content: <MemberTable members={t.members} /> },
        ]} />
        <p style={{ fontSize: 11, color: "var(--text-secondary)", margin: "10px 0 0", lineHeight: 1.5 }}>
          Members are listed by name as the file gives it. Someone who joined or left mid-term is measured only on votes and sessions
          they were listed for. Missed votes count &ldquo;Absent&rdquo; and &ldquo;Absent (Interest Declared)&rdquo;.
        </p>
      </section>

      <SectionTitle>Closest votes</SectionTitle>
      <section style={{ ...card, marginTop: 12 }}>
        <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: "0 0 8px", lineHeight: 1.5 }}>
          The {t.closest.length}{" "}narrowest votes of the term (ties first). The agenda item number can be looked up on the City&apos;s
          council website.
        </p>
        <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {t.closest.map((v, i) => (
            <li key={`${v.item}-${i}`} style={{ borderTop: "1px solid var(--border)", padding: "10px 0" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline" }}>
                <div style={{ fontSize: 13, fontWeight: 600, minWidth: 0 }}>{v.title}</div>
                <div style={{ fontSize: 13, fontWeight: 700, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>{v.yes}–{v.no}</div>
              </div>
              <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 2, lineHeight: 1.5 }}>
                {v.item}{v.date ? ` · ${v.date}` : ""} · {v.motion} · {v.result}
                {v.mayorName && <> · Mayor {v.mayorName}: {v.mayorVote}</>}
              </div>
              <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 4, lineHeight: 1.5 }}>{v.description}</div>
              <details style={{ marginTop: 4 }}>
                <summary style={{ fontSize: 11, color: "var(--blue)", cursor: "pointer" }}>Roll call</summary>
                <Roll v={v} />
              </details>
            </li>
          ))}
        </ul>
      </section>

      <div style={{ display: "grid", gap: 10, marginTop: 20 }}>
        <DataSourceCitation source={t.source} label="Votes" />
        <DataSourceCitation source={t.attendanceSource} label="Attendance" />
      </div>
    </>
  );
}
