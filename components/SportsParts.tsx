import Link from "next/link";
import { card, link } from "@/components/BudgetParts";
import { DataSourceCitation } from "@/components/SourceCitation";
import { fileLabel } from "@/lib/file-label";
import PlayerTable from "@/components/PlayerTable";
import ViewToggle from "@/components/ViewToggle";
import type { PlayerGroup, SportsSeason, SportsTeam } from "@/lib/types";

// The Sports section: a toggle per team, and two pages per team — its history (seasons newest
// first: record, playoffs, how far they went) and player records (sortable totals with the team).
// Server components, except the sortable table (components/PlayerTable.tsx).

export const TEAM_ORDER = ["jays", "raptors", "leafs", "tempo", "argos", "tfc", "sceptres", "rock"];
const SHORT: Record<string, string> = {
  jays: "Blue Jays", raptors: "Raptors", leafs: "Maple Leafs", tempo: "Tempo", argos: "Argonauts", tfc: "Toronto FC", sceptres: "Sceptres", rock: "Rock",
};
const GOLD = "#f2c14e";

export type TeamPageKind = "history" | "players";

export const teamHref = (id: string, kind: TeamPageKind) => (kind === "players" ? `/sports/${id}/players` : id === TEAM_ORDER[0] ? "/sports" : `/sports/${id}`);

/** Team chips; switching team keeps you on the same kind of page when that team has it. */
export function TeamToggle({ teams, current, kind }: { teams: SportsTeam[]; current: string; kind: TeamPageKind }) {
  return (
    <nav aria-label="Teams" style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
      {TEAM_ORDER.map(id => teams.find(t => t.id === id)!).map(t => {
        const on = t.id === current;
        return (
          <Link key={t.id} href={teamHref(t.id, kind === "players" && t.players ? "players" : "history")} aria-current={on ? "page" : undefined}
            style={{
              fontSize: 13, fontWeight: 600, padding: "7px 12px", borderRadius: 999, textDecoration: "none",
              border: `1px solid ${on ? "var(--blue)" : "var(--border)"}`, background: on ? "var(--surface-2)" : "var(--surface)",
              color: on ? "var(--text-primary)" : "var(--text-secondary)",
            }}>
            {SHORT[t.id]}{!t.available && <span style={{ opacity: 0.6 }}> · n/a</span>}
          </Link>
        );
      })}
    </nav>
  );
}

/** The label every page of a team carries when its data isn't from the league itself. */
/** When the figures were pulled, and that they're refreshed once a year (they're stored, not fetched live). */
export function RefreshNote({ generatedOn }: { generatedOn: string }) {
  return (
    <p style={{ fontSize: 11, color: "var(--text-secondary)", margin: "20px 0 0", lineHeight: 1.55 }}>
      These figures are stored with the site, not looked up live: pulled from the sources listed on this page on {generatedOn}, and refreshed
      once a year after each season ends (scripts/extract_sports.py). A season still being played shows as &ldquo;In progress&rdquo; and isn&apos;t counted
      in any total until it&apos;s over.
    </p>
  );
}

export function SecondaryNote({ team }: { team: SportsTeam }) {
  if (!team.secondarySource) return null;
  return (
    <p role="note" style={{ fontSize: 12, lineHeight: 1.5, margin: "0 0 12px", padding: "8px 12px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface-2)", color: "var(--text-secondary)" }}>
      <strong style={{ color: "var(--text-primary)" }}>Source: {team.secondarySource}, not the {team.league}.</strong>{" "}
      The {team.league} doesn&apos;t allow automated access to its own site, so these figures come from {team.secondarySource}&apos;s published data rather than the league&apos;s.
    </p>
  );
}

/** Team history / Player records, for teams that have both. */
export function TeamSubNav({ team, kind }: { team: SportsTeam; kind: TeamPageKind }) {
  if (!team.players) return null;
  const tab = (k: TeamPageKind, label: string) => (
    <Link href={teamHref(team.id, k)} aria-current={k === kind ? "page" : undefined}
      style={{
        fontSize: 14, fontWeight: 700, padding: "8px 2px", textDecoration: "none", borderBottom: `2px solid ${k === kind ? "var(--blue)" : "transparent"}`,
        color: k === kind ? "var(--text-primary)" : "var(--text-secondary)",
      }}>{label}</Link>
  );
  return (
    <nav aria-label={`${team.name} pages`} style={{ display: "flex", gap: 20, borderBottom: "1px solid var(--border)", marginBottom: 16 }}>
      {tab("history", "Team history")}{tab("players", "Player records")}
    </nav>
  );
}

function PlayerGroupSection({ g }: { g: PlayerGroup }) {
  return (
    <div style={{ marginTop: 12 }}>
      <PlayerTable label={g.label} columns={g.columns} rows={g.rows} sort={g.sort} />
      {g.note && <p style={{ fontSize: 11, color: "var(--text-secondary)", margin: "10px 0 0", lineHeight: 1.5 }}>{g.note}</p>}
      <div style={{ marginTop: 12 }}>
        <DataSourceCitation source={g.source} label={g.files.length > 1 ? `Source (latest of ${g.files.length} files)` : "Source"} />
        {g.files.length > 1 && (
          <details style={{ marginTop: 6, fontSize: 11, color: "var(--text-secondary)" }}>
            <summary style={{ cursor: "pointer" }}>All {g.files.length} files combined</summary>
            <ul style={{ margin: "6px 0 0", paddingLeft: 16, lineHeight: 1.6, overflowWrap: "anywhere" }}>
              {g.files.map(f => <li key={f}><a href={f} target="_blank" rel="noopener noreferrer" style={link}>{f.replace(/^https:\/\//, "")}</a></li>)}
            </ul>
          </details>
        )}
      </div>
    </div>
  );
}

export function PlayersView({ team }: { team: SportsTeam }) {
  return (
    <>
      <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: "0 0 4px", lineHeight: 1.55 }}>
        Every player&apos;s regular-season totals as a member of the {team.name}. Select a column to sort; select a name for the player&apos;s page on the league&apos;s site.
      </p>
      <section style={{ ...card, marginTop: 12 }}>
        {team.players!.length > 1
          ? <ViewToggle size="lg" label="Which players" storageKey={`players-${team.id}`}
              views={team.players!.map(g => ({ id: g.id, label: `${g.label} (${g.rows.length.toLocaleString("en-CA")})`, content: <PlayerGroupSection g={g} /> }))} />
          : <PlayerGroupSection g={team.players![0]} />}
      </section>
    </>
  );
}

export function Trophy({ size = 16, title }: { size?: number; title?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" role={title ? "img" : undefined} aria-hidden={title ? undefined : true} aria-label={title}
      style={{ flexShrink: 0, verticalAlign: "-3px" }}>
      <circle cx="12" cy="12" r="11" fill="none" stroke={GOLD} strokeWidth="1.6" />
      <path d="M8 6h8v3a4 4 0 0 1-8 0V6Zm-2 1h2v2a2 2 0 0 1-2-2Zm12 0h-2v2a2 2 0 0 0 2-2ZM11 13h2v2.5h2V17H9v-1.5h2V13Z" fill={GOLD} />
    </svg>
  );
}

const trophyLabel = (t: string, n: number) => (t === "World Series" ? `World Series title${n === 1 ? "" : "s"}` : `${t}${n === 1 ? "" : "s"}`);

function record(s: SportsSeason): string {
  return [`${s.wins}–${s.losses}`, s.ties ? `${s.ties} T` : null, s.otl ? `${s.otl} OTL` : null, s.draws != null ? `${s.draws} D` : null]
    .filter(Boolean).join(" · ");
}

// ── A team ──────────────────────────────────────────────────────────────────

const cols = "minmax(64px, 84px) minmax(0, 1fr) minmax(52px, 70px) minmax(0, 1.5fr)";
const head: React.CSSProperties = { fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-secondary)" };
const small: React.CSSProperties = { fontSize: 11, color: "var(--text-secondary)", lineHeight: 1.5 };

function Season({ s, team }: { s: SportsSeason; team: SportsTeam }) {
  return (
    <li style={{ borderTop: "1px solid var(--border)", padding: "10px 0", background: s.champion ? "linear-gradient(90deg, rgba(242,193,78,.08), transparent 60%)" : undefined }}>
      <div style={{ display: "grid", gridTemplateColumns: cols, gap: 10, alignItems: "baseline", fontSize: 13 }}>
        <span style={{ fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{s.season}</span>
        <span style={{ fontVariantNumeric: "tabular-nums", color: s.inProgress ? "var(--text-secondary)" : undefined }}>{s.inProgress ? "In progress" : record(s)}</span>
        <span style={{ color: s.playoffs ? "var(--text-primary)" : "var(--text-secondary)" }}>{s.inProgress || s.playoffs == null ? "—" : s.playoffs ? "Yes" : "No"}</span>
        <span style={{ display: "flex", gap: 6, alignItems: "baseline", minWidth: 0 }}>
          {s.champion && <Trophy title={`Won the ${team.trophy}`} />}
          <span style={{ fontWeight: s.champion ? 700 : 400, color: s.champion ? GOLD : s.result ? "var(--text-primary)" : "var(--text-secondary)" }}>
            {s.inProgress ? "" : s.result ?? ""}
          </span>
        </span>
      </div>
      {s.team && s.team !== team.name && <div style={{ ...small, marginTop: 2 }}>Played as the {s.team}</div>}
      {s.note && <div style={{ ...small, marginTop: 2 }}>⚠ {s.note}</div>}
    </li>
  );
}

export function TeamView({ team }: { team: SportsTeam }) {
  if (!team.available) {
    return (
      <section style={card}>
        <h2 style={{ fontSize: 18, fontWeight: 800, margin: "0 0 6px" }}>{team.name}</h2>
        <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: 0, lineHeight: 1.6 }}>
          Not available yet. {team.reason} We only show records that come from the league itself.
        </p>
        {team.url && <p style={{ fontSize: 13, margin: "10px 0 0" }}><a href={team.url} target="_blank" rel="noopener noreferrer" style={link}>The team&apos;s official site ↗</a></p>}
      </section>
    );
  }
  const seasons = team.seasons!, wins = team.championships!;
  const done = seasons.filter(s => !s.inProgress);
  const made = done.filter(s => s.playoffs).length;
  const first = seasons[seasons.length - 1].season;
  const sample = seasons.find(s => !s.inProgress) ?? seasons[0];

  return (
    <>
      <section style={{ ...card, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 16, alignItems: "center" }}>
        <div>
          <div style={head}>{team.league} · since {first}</div>
          <h2 style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.02em", margin: "4px 0 0" }}>{team.name}</h2>
          <p style={{ ...small, fontSize: 12, margin: "6px 0 0" }}>
            {done.length} completed seasons · made the playoffs in {made}
          </p>
        </div>
        <div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            <span style={{ fontSize: 44, fontWeight: 900, letterSpacing: "-0.03em", color: wins.length ? GOLD : "var(--text-primary)", lineHeight: 1 }}>{wins.length}</span>
            <span style={{ fontSize: 14, fontWeight: 700 }}>{trophyLabel(team.trophy, wins.length)}</span>
          </div>
          {wins.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 10px", marginTop: 8 }}>
              {[...wins].reverse().map(y => (
                <span key={y} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, fontVariantNumeric: "tabular-nums" }}>
                  <Trophy size={14} />{y}
                </span>
              ))}
            </div>
          )}
        </div>
      </section>

      <section style={{ ...card, marginTop: 12, paddingTop: 12 }}>
        <div style={{ display: "grid", gridTemplateColumns: cols, gap: 10, paddingBottom: 8 }}>
          <span style={head}>Season</span>
          <span style={head}>Record (W–L)</span>
          <span style={head}>Playoffs</span>
          <span style={head}>How far</span>
        </div>
        <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {seasons.map(s => <Season key={s.season} s={s} team={team} />)}
        </ul>
        <p style={{ ...small, margin: "10px 0 0" }}>
          Regular season only. {sample.ties != null || sample.otl != null ? "T = ties, OTL = overtime losses. " : ""}
          {sample.draws != null ? "D = draws." : ""}
        </p>
      </section>

      <div style={{ display: "grid", gap: 10, marginTop: 16 }}>
        {Object.entries(sample.sources).filter(([k, src]) => !(k === "playoffs" && src.fileUrl === sample.sources.record.fileUrl)).map(([k, src]) => {
          const key = k as keyof SportsSeason["sources"];
          const perSeason = seasons.filter(x => x.sources[key]).map(x => ({ season: x.season, url: x.sources[key]!.fileUrl }));
          const many = new Set(perSeason.map(x => x.url)).size > 1;
          return (
            <div key={k}>
              <DataSourceCitation source={many ? { ...src, locator: `${src.locator}. One file per season; this is the ${sample.season} file (${fileLabel(src.fileUrl, src.member)}).` } : src}
                label={k === "record" ? (sample.sources.playoffs?.fileUrl === src.fileUrl ? "Records and playoffs" : "Records") : "Playoffs"} />
              {many && (
                <details style={{ marginTop: 6, fontSize: 11, color: "var(--text-secondary)" }}>
                  <summary style={{ cursor: "pointer" }}>Each season&apos;s file ({perSeason.length})</summary>
                  <ul style={{ margin: "6px 0 0", paddingLeft: 16, lineHeight: 1.6 }}>
                    {perSeason.map(x => <li key={x.season}><a href={x.url} target="_blank" rel="noopener noreferrer" style={link}>{x.season}</a></li>)}
                  </ul>
                </details>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}
