import Link from "next/link";

// Sections of the site. Add one here as each dataset lands (demographics, education, budget…).
const SECTIONS = [
  { href: "/budget", title: "City budget", blurb: "The approved operating budget since 2014: revenue and expenses by year, with a full breakdown for each." },
  { href: "/elections", title: "Voter turnout", blurb: "Municipal election turnout since 2003, with the top mayoral candidates for each race." },
  { href: "/promises", title: "Campaign promises", blurb: "Each mayor's platform, quoted word for word, and what City records show happened to each promise." },
  { href: "/council", title: "City Council", blurb: "Every recorded Council vote and attendance since 2008: who sides with the mayor, who misses votes, and the closest calls." },
  { href: "/housing", title: "Housing", blurb: "Rents since 1992, homes built since 1972, prices, permits, planning applications, the social housing wait list and shelter use." },
  { href: "/people", title: "People", blurb: "Population since 2001, five censuses of who lives here, jobs, income since 1976 and food bank use." },
  { href: "/crime", title: "Crime", blurb: "Reported crime and how much is cleared since 2014, by category and offence, and homicides since 2004." },
  { href: "/road-safety", title: "Road safety", blurb: "People killed or seriously injured on Toronto's streets since 2006, by how they were travelling, and all police-reported collisions." },
  { href: "/transit", title: "Transit", blurb: "TTC ridership since 2003, monthly since 2008, plus business-day trips, revenue and elevators." },
  { href: "/sports", title: "Sports", blurb: "The Blue Jays, Maple Leafs and Toronto FC season by season: records, playoff runs and championships." },
  { href: "/schools", title: "Schools", blurb: "Enrolment and provincial test results by board since 2017–18, and a page for every Toronto school." },
];

export default function Home() {
  return (
    <div style={{ maxWidth: 760, margin: "0 auto" }}>
      <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: "-0.03em", margin: "0 0 6px" }}>Toronto Civic Data</h1>
      <p style={{ fontSize: 14, color: "var(--text-secondary)", margin: "0 0 28px", lineHeight: 1.5 }}>
        Data about the City of Toronto. Every figure links to its original source.
      </p>
      <Link href="/today" style={{ display: "block", padding: "16px 18px", borderRadius: 14, border: "1px solid var(--blue)", background: "var(--surface-2)", color: "inherit", textDecoration: "none", marginBottom: 20 }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--blue)", marginBottom: 4 }}>Daily game</div>
        <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 4 }}>TOday →</div>
        <div style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.5 }}>Three questions about Toronto, new every day. How close can you get to 30?</div>
      </Link>
      <div style={{ display: "grid", gap: 12 }}>
        {SECTIONS.map(s => (
          <Link key={s.href} href={s.href} style={{ display: "block", padding: "16px 18px", borderRadius: 14, border: "1px solid var(--border)", background: "var(--surface)", color: "inherit", textDecoration: "none" }}>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>{s.title} →</div>
            <div style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.5 }}>{s.blurb}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
