import Link from "next/link";
import { MiniCalendar } from "@/components/EventsCalendar";
import { HUBS, SECTIONS, figure, type Section } from "@/lib/home";
import { CITY } from "@/lib/city";

// The home page (the "magazine" layout): the budget as the lead story, the City's events calendar
// and the daily game beside it, then twelve questions, one per section. Every figure links to the
// section that cites its source; sections and figures live in lib/home.ts.

const SECTION_FIGURE: Record<string, string | undefined> = {
  "/budget": "budget", "/elections": "turnout", "/council": "council", "/housing": "rent", "/people": "population",
  "/transit": "rides", "/schools": "students", "/crime": "crime", "/road-safety": "roads", "/sports": "titles",
  "/construction": "construction",
};
/** "TTC rides in a year" → "TTC rides in a year"; "People living…" → "people living…" (only the first letter, so names keep their capitals). */
const lower = (t: string) => (/^[A-Z][a-z]/.test(t) ? t[0].toLowerCase() + t.slice(1) : t);
const figFor = (s: Section) => (SECTION_FIGURE[s.href] ? figure(SECTION_FIGURE[s.href]!) : undefined);

const card: React.CSSProperties = { display: "block", borderRadius: 16, border: "1px solid var(--border)", background: "var(--surface)", color: "inherit", textDecoration: "none" };
const kicker: React.CSSProperties = { fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-secondary)" };

function HoverStyles() {
  return (
    <style>{`
      .hd-card{transition:transform 160ms ease,border-color 160ms ease,background 160ms ease}
      .hd-card:hover{transform:translateY(-2px);border-color:rgba(120,140,190,.55)}
      .hd-row:hover{background:var(--surface-2)}
      .hd-strip{scrollbar-width:thin}
      @media (min-width: 720px){.hd-lead{grid-column:span 2}}
      @media (prefers-reduced-motion: reduce){.hd-card{transition:none}.hd-card:hover{transform:none}}
    `}</style>
  );
}

function SourcesNote() {
  return (
    <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: "28px 0 0", lineHeight: 1.5 }}>
      Data about the City of Toronto. Every figure opens the page that cites its original source file.
    </p>
  );
}

function GameBanner({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/today" className="hd-card" style={{
      ...card, padding: compact ? "16px 18px" : "24px 22px", border: "1px solid var(--s6)",
      background: "linear-gradient(135deg, rgba(144,133,233,.22), rgba(57,135,229,.10) 60%, var(--surface))",
      display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap",
    }}>
      <div style={{ minWidth: 0, flex: "1 1 220px" }}>
        <div style={{ ...kicker, color: "var(--s6)" }}>Daily game</div>
        <div style={{ fontSize: compact ? 20 : 26, fontWeight: 800, letterSpacing: "-0.02em", margin: "4px 0" }}>TOday</div>
        <div style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.5 }}>Three questions about Toronto, new every day. How close can you get to 30?</div>
      </div>
      <div aria-hidden style={{ display: "flex", gap: 6 }}>
        {["Q1", "Q2", "Q3"].map((q, i) => (
          <div key={q} style={{ width: 40, height: compact ? 54 : 62, borderRadius: 8, background: "var(--surface-2)", position: "relative", overflow: "hidden" }}>
            <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: `${[45, 70, 55][i]}%`, background: "var(--s1)", opacity: 0.85 }} />
            <div style={{ position: "absolute", left: 4, right: 4, bottom: `${[60, 52, 74][i]}%`, height: 3, borderRadius: 2, background: "#ef4444" }} />
            <span style={{ position: "absolute", top: 3, left: 0, right: 0, textAlign: "center", fontSize: 9, fontWeight: 700, color: "var(--text-secondary)" }}>{q}</span>
          </div>
        ))}
      </div>
    </Link>
  );
}

// ── 2. Magazine ─────────────────────────────────────────────────────────────

function CalendarCard() {
  const ev = CITY.events;
  const items = ev.items.map(({ name, url, category, free, where, start, end }) => ({ name, url, category, free, where, start, end }));
  return (
    <section className="hd-card" style={{ ...card, padding: "16px 16px 14px", minWidth: 0 }} aria-labelledby="whats-on">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, marginBottom: 10 }}>
        <h2 id="whats-on" style={{ ...kicker, color: "var(--s6)", margin: 0 }}>What&apos;s on in Toronto</h2>
        <Link href="/events" style={{ fontSize: 12, fontWeight: 700, color: "var(--blue)", textDecoration: "none" }}>Full calendar →</Link>
      </div>
      <MiniCalendar from={ev.from} to={ev.to} items={items} days={ev.days} />
      <a href={ev.submitUrl} target="_blank" rel="noopener noreferrer" style={{ display: "inline-block", marginTop: 10, fontSize: 12, color: "var(--text-secondary)" }}>
        Hosting something? Add it to the City&apos;s calendar ↗
      </a>
    </section>
  );
}

export default function HomePage() {
  const budget = figure("budget"), tax = figure("propertytax");
  const features = SECTIONS.filter(s => !["/budget", "/today"].includes(s.href));
  return (
    <div style={{ maxWidth: 1040, margin: "0 auto" }}>
      <HoverStyles />
      <header style={{ borderBottom: "1px solid var(--border)", paddingBottom: 12, marginBottom: 20, display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
        <span style={{ fontSize: 22, fontWeight: 900, letterSpacing: "-0.03em" }}>Toronto Civic Data</span>
        <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>The city, in sourced numbers</span>
      </header>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 300px), 1fr))", gap: 14 }}>
        <Link href="/budget" className="hd-card hd-lead" style={{ ...card, padding: "26px 24px", minHeight: 240, display: "flex", flexDirection: "column", justifyContent: "space-between",
          background: "radial-gradient(120% 120% at 100% 0%, rgba(57,135,229,.25), var(--surface) 55%)" }}>
          <div style={{ ...kicker, color: "var(--s1)" }}>The budget</div>
          <div>
            <div style={{ fontSize: "clamp(40px, 9vw, 72px)", fontWeight: 900, letterSpacing: "-0.04em", lineHeight: 1 }}>{budget.value}</div>
            <h1 style={{ fontSize: "clamp(20px, 3.4vw, 28px)", fontWeight: 800, letterSpacing: "-0.02em", margin: "10px 0 6px", lineHeight: 1.2 }}>
              What the City plans to spend in {budget.period}. Where does it come from, and where does it go?
            </h1>
            <p style={{ fontSize: 14, color: "var(--text-secondary)", margin: 0 }}>{tax.value} of it comes from property tax. Read the breakdown →</p>
          </div>
        </Link>
        <div style={{ display: "grid", gap: 14, alignContent: "start", minWidth: 0 }}>
          <CalendarCard />
          <GameBanner compact />
        </div>
      </div>
      <h2 style={{ fontSize: 13, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", margin: "34px 0 12px" }}>Questions worth asking</h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 14 }}>
        {features.map(s => {
          const f = figFor(s);
          return (
            <Link key={s.href} href={s.href} className="hd-card" style={{ ...card, padding: "18px 18px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
              <span style={{ ...kicker, color: HUBS[s.hub].color }}>{s.title}</span>
              <span style={{ fontSize: 19, fontWeight: 800, letterSpacing: "-0.01em", lineHeight: 1.25 }}>{s.question}</span>
              {f && <span style={{ fontSize: 13, color: "var(--text-secondary)" }}><strong style={{ color: "var(--text-primary)" }}>{f.value}</strong> {lower(f.label)} ({f.period})</span>}
            </Link>
          );
        })}
      </div>
      <SourcesNote />
    </div>
  );
}

