import { card, link } from "@/components/BudgetParts";
import { STATUS, STATUS_ORDER, VOTING_RECORD_URL } from "@/lib/promises";
import type { Campaign, CampaignPromise, PromiseStatus } from "@/lib/types";

// Pieces of the campaign-promise pages: status badge, a campaign's status tally, one promise
// with its evidence, and the method note every page carries.

export function StatusBadge({ status }: { status: PromiseStatus }) {
  const s = STATUS[status];
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 700, padding: "3px 9px", borderRadius: 999, border: `1px solid ${s.color}`, color: "var(--text-primary)", whiteSpace: "nowrap" }}>
      <span aria-hidden style={{ color: s.color }}>{s.icon}</span>{s.label}
    </span>
  );
}

export function Tally({ c }: { c: Campaign }) {
  if (!c.promises.length) return <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: 0, lineHeight: 1.5 }}>No promises assessed: platform not found in the archive.</p>;
  const counts = STATUS_ORDER.map(s => [s, c.promises.filter(p => p.status === s).length] as const).filter(([, n]) => n > 0);
  const total = c.promises.length;
  return (
    <div>
      <div aria-hidden style={{ display: "flex", gap: 2, height: 8, borderRadius: 4, overflow: "hidden" }}>
        {counts.map(([s, n]) => <span key={s} style={{ flex: n, background: STATUS[s].color, opacity: s === "no-action-found" ? 0.5 : 1 }} />)}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 12px", marginTop: 8, fontSize: 12, color: "var(--text-secondary)" }}>
        {counts.map(([s, n]) => (
          <span key={s}><span aria-hidden style={{ color: STATUS[s].color }}>{STATUS[s].icon}</span> {STATUS[s].label}: <strong style={{ color: "var(--text-primary)" }}>{n}</strong></span>
        ))}
        <span>· {total} assessed{c.notAssessed.length > 0 ? `, ${c.notAssessed.length} group${c.notAssessed.length === 1 ? "" : "s"} of promises not assessed` : ""}</span>
      </div>
    </div>
  );
}

export function PromiseCard({ p, c }: { p: CampaignPromise; c: Campaign }) {
  return (
    <article id={p.id} style={{ ...card, marginTop: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text-secondary)" }}>{p.topic}</span>
        <StatusBadge status={p.status} />
      </div>
      <blockquote style={{ margin: 0, padding: "2px 0 2px 12px", borderLeft: "3px solid var(--border)", fontSize: 14, lineHeight: 1.55 }}>
        &ldquo;{p.quote}&rdquo;
        <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 4 }}>
          {p.context && <>{p.context} · </>}
          <a href={p.platformUrl ?? c.platform?.url} target="_blank" rel="noopener noreferrer" style={link}>Campaign platform (archived) ↗</a>
        </div>
      </blockquote>
      <p style={{ fontSize: 13, lineHeight: 1.55, margin: "12px 0 0" }}>{p.summary}</p>
      {p.evidence.length > 0 && (
        <ul style={{ listStyle: "none", margin: "10px 0 0", padding: 0, display: "grid", gap: 8 }}>
          {p.evidence.map((e, i) => (
            <li key={i} style={{ fontSize: 12, lineHeight: 1.5, color: "var(--text-secondary)", borderLeft: "2px solid var(--border)", paddingLeft: 10, overflowWrap: "anywhere" }}>
              {e.text}{" "}
              {e.vote ? (
                <a href={VOTING_RECORD_URL} target="_blank" rel="noopener noreferrer" style={link}
                  title={`Members of Toronto City Council – Voting Record, ${e.vote.term}: item ${e.vote.item}${e.vote.date ? `, ${e.vote.date}` : ""}, ${e.vote.motion} — ${e.vote.result}`}>
                  Council vote {e.vote.item}{e.vote.date ? `, ${e.vote.date}` : ""} ↗
                </a>
              ) : (
                <a href={e.source.url} target="_blank" rel="noopener noreferrer" style={link} title={`${e.source.publisher} (checked ${e.source.accessed})`}>
                  {e.source.publisher}: {e.source.title} ↗
                </a>
              )}
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}

export function MethodNote() {
  return (
    <details style={{ ...card, marginTop: 16 }}>
      <summary style={{ fontSize: 13, fontWeight: 700, cursor: "pointer" }}>How promises are checked</summary>
      <div style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.6, marginTop: 10 }}>
        <p style={{ margin: "0 0 8px" }}>
          Unlike the rest of this site, this section is compiled research, not a published dataset. Each promise is quoted word for word
          from the candidate&apos;s own platform page as archived by the Internet Archive on or near election day. Each status rests only
          on official records: Council votes (from the City Clerk&apos;s voting record), City budgets, staff reports and City or City
          agency (TTC, Toronto Public Library) pages — not news coverage.
        </p>
        <p style={{ margin: "0 0 8px" }}>
          Only promises of something the City itself can do are assessed. Promises whose outcome rests with another government, and
          promises we haven&apos;t researched yet, are listed separately with the reason. A script checks that every quote appears
          verbatim on its archived page and that every cited vote matches the City&apos;s voting record.
        </p>
        <ul style={{ margin: 0, paddingLeft: 16 }}>
          {STATUS_ORDER.map(s => <li key={s}><strong style={{ color: "var(--text-primary)" }}>{STATUS[s].label}</strong>: {STATUS[s].definition}</li>)}
        </ul>
      </div>
    </details>
  );
}
