import { BUDGET_YEARS } from "@/lib/budget";
import { CRIME } from "@/lib/crime";
import { ELECTIONS } from "@/lib/elections";
import { HOUSING } from "@/lib/housing";
import { PEOPLE } from "@/lib/people";
import { ROADS } from "@/lib/roads";
import { SCHOOLS } from "@/lib/schools";
import { SPORTS } from "@/lib/sports";
import { TERMS } from "@/lib/council";
import { TRANSIT } from "@/lib/transit";
import { CITY } from "@/lib/city";
import { fmtPeriod } from "@/lib/chart-format";
import { fmtMoney } from "@/lib/format";
import type { Series } from "@/lib/types";

// What the home page shows: the site's sections, grouped into hubs, and a set of headline figures.
// Every figure is read from the generated datasets (never typed) and links to the section page that
// shows it with its source file. Server-only.

export type Hub = "money" | "living" | "safety" | "play";

export const HUBS: Record<Hub, { title: string; blurb: string; color: string }> = {
  money: { title: "Money & government", blurb: "Where the City's money comes from and goes, and who decides.", color: "var(--s1)" },
  living: { title: "Living here", blurb: "Who lives here, what it costs, how we get around, where kids learn.", color: "var(--s3)" },
  safety: { title: "Safety", blurb: "Crime, and people hurt on our streets.", color: "var(--s2)" },
  play: { title: "Play", blurb: "A daily game, and every season of Toronto's teams.", color: "var(--s6)" },
};

export interface Section { href: string; title: string; blurb: string; hub: Hub; question: string }

export const SECTIONS: Section[] = [
  { href: "/budget", hub: "money", title: "City budget", question: "Where does the City's money go?", blurb: "The approved operating budget since 2014: revenue and expenses by year, with a full breakdown for each." },
  { href: "/elections", hub: "money", title: "Voter turnout", question: "How many of us actually vote?", blurb: "Municipal election turnout since 2003, with the top mayoral candidates for each race." },
  { href: "/promises", hub: "money", title: "Campaign promises", question: "Did mayors do what they said?", blurb: "Each mayor's platform, quoted word for word, and what City records show happened to each promise." },
  { href: "/council", hub: "money", title: "City Council", question: "How does Council vote?", blurb: "Every recorded Council vote and attendance since 2008: who sides with the mayor, who misses votes, and the closest calls." },
  { href: "/housing", hub: "living", title: "Housing", question: "What does it cost to live here?", blurb: "Rents since 1992, homes built since 1972, prices, permits, planning applications, the social housing wait list and shelter use." },
  { href: "/people", hub: "living", title: "People", question: "Who lives in Toronto?", blurb: "Population since 2001, five censuses of who lives here, jobs, income since 1976 and food bank use." },
  { href: "/transit", hub: "living", title: "Transit", question: "How many of us ride the TTC?", blurb: "TTC ridership since 2003, monthly since 2008, plus business-day trips, revenue and elevators." },
  { href: "/schools", hub: "living", title: "Schools", question: "How are our schools doing?", blurb: "Enrolment and provincial test results by board since 2017–18, and a page for every Toronto school." },
  { href: "/crime", hub: "safety", title: "Crime", question: "Is crime going up?", blurb: "Reported crime and how much is cleared since 2014, by category and offence, and homicides since 2004." },
  { href: "/road-safety", hub: "safety", title: "Road safety", question: "How safe are our streets?", blurb: "People killed or seriously injured on Toronto's streets since 2006, by how they were travelling, and all police-reported collisions." },
  { href: "/construction", hub: "living", title: "Construction", question: "Where's the construction?", blurb: "Every road restriction in the city on a map: construction and closures, who's doing the work, and until when." },
  { href: "/get-involved", hub: "money", title: "Get involved", question: "How do I have my say?", blurb: "The City's own forms: list your event, email the mayor, reach your councillor, ask 311, speak at a committee." },
  { href: "/today", hub: "play", title: "TOday", question: "How well do you know Toronto?", blurb: "Five questions a day about the city, 60 seconds each. How high can you climb?" },
  { href: "/sports", hub: "play", title: "Sports", question: "How have our teams done?", blurb: "The Blue Jays, Raptors, Maple Leafs, Tempo and Toronto FC: every season's record and playoff run, championships, and player records." },
];

export interface Figure {
  id: string;
  label: string;
  value: string;
  /** The period the value is for, e.g. "2025" or "Sep 2026". */
  period: string;
  href: string;
  hub: Hub;
  /** Recent history for a sparkline, oldest first (complete periods only). */
  trend?: number[];
  /** One plain sentence of context. */
  note?: string;
}

type Point = { period: string; value: number };
const complete = (s: Series) => s.points.filter(p => p.value != null && !p.note) as Point[];
const last = (s: Series) => complete(s)[complete(s).length - 1];
const n0 = (v: number) => Math.round(v).toLocaleString("en-CA");
const compact = (v: number) => (v >= 1e6 ? `${+(v / 1e6).toFixed(v >= 1e7 ? 0 : 2)}M` : n0(v));

function trend(s: Series, n: number): number[] {
  return complete(s).slice(-n).map(p => p.value);
}

const BUDGET = BUDGET_YEARS[BUDGET_YEARS.length - 1];
const TAX = BUDGET.comparable.revenue.find(g => g.group === "property-tax")!.amount;
const VOTED = [...ELECTIONS].reverse().find(e => e.turnout)!;
const SCHOOL_YEAR = SCHOOLS.schoolYears[SCHOOLS.schoolYears.length - 1];
const STUDENTS = SCHOOLS.boards.reduce((a, b) => a + (b.enrolment[SCHOOL_YEAR]?.value ?? 0), 0);
const TITLES = SPORTS.teams.reduce((a, t) => a + (t.championships?.length ?? 0), 0);
const TERM = TERMS[TERMS.length - 1];
const H = HOUSING.series, P = PEOPLE.series, T = TRANSIT.series, C = CRIME.series, R = ROADS.series;

export const FIGURES: Figure[] = [
  { id: "population", hub: "living", label: "People living in Toronto", value: n0(last(P.population).value), period: last(P.population).period,
    href: "/people", trend: trend(P.population, 15), note: "Statistics Canada estimate, July 1." },
  { id: "budget", hub: "money", label: "City operating budget", value: fmtMoney(BUDGET.expenses), period: String(BUDGET.year),
    href: `/budget/${BUDGET.year}`, trend: BUDGET_YEARS.map(y => y.expenses), note: "Planned spending, all City programs and agencies." },
  { id: "propertytax", hub: "money", label: "Comes from property tax", value: `${Math.round((TAX / BUDGET.revenue) * 100)}%`, period: String(BUDGET.year),
    href: "/budget/comparable", note: `${fmtMoney(TAX)} of ${fmtMoney(BUDGET.revenue)} in revenue.` },
  { id: "rides", hub: "living", label: "TTC rides in a year", value: compact(last(T.annualRides).value), period: last(T.annualRides).period,
    href: "/transit", trend: trend(T.annualRides, 15) },
  { id: "rent", hub: "living", label: "Average 1-bedroom rent", value: `$${n0(last(H.rent1br).value)}`, period: last(H.rent1br).period,
    href: "/housing", trend: trend(H.rent1br, 20), note: "A month, Toronto region." },
  { id: "homeprice", hub: "living", label: "Average home price", value: fmtMoney(last(H.homePrice).value), period: fmtPeriod(last(H.homePrice).period),
    href: "/housing", trend: trend(H.homePrice, 60) },
  { id: "shelter", hub: "living", label: "People in shelters, a night", value: n0(last(H.shelterPeople).value), period: fmtPeriod(last(H.shelterPeople).period),
    href: "/housing", trend: trend(H.shelterPeople, 36), note: "Average night over the month." },
  { id: "turnout", hub: "money", label: "Voted in the last election with results", value: `${VOTED.turnout!.turnoutPct.toFixed(1)}%`, period: VOTED.label,
    href: "/elections", trend: ELECTIONS.filter(e => e.turnout && e.kind === "general").map(e => e.turnout!.turnoutPct) },
  { id: "council", hub: "money", label: "Recorded Council votes", value: n0(TERM.votes), period: `${TERM.term.replace("-", "–")} term`,
    href: `/council/${TERM.term}` },
  { id: "crime", hub: "safety", label: "Crimes reported to police", value: n0(last(C.reported).value), period: last(C.reported).period,
    href: "/crime", trend: trend(C.reported, 12) },
  { id: "roads", hub: "safety", label: "People killed on our roads", value: n0(last(R.killed).value), period: last(R.killed).period,
    href: "/road-safety", trend: trend(R.killed, 20) },
  { id: "students", hub: "living", label: "Students in public schools", value: n0(STUDENTS), period: SCHOOL_YEAR,
    href: "/schools", note: "Toronto's four public school boards." },
  { id: "construction", hub: "living", label: "Road restrictions in effect", value: n0(CITY.construction.items.length), period: `as of ${CITY.generatedOn}`,
    href: "/construction", note: "Construction and road closures, from the City's live feed." },
  { id: "titles", hub: "play", label: "Championships won", value: String(TITLES), period: "All time",
    href: "/sports", note: "World Series, Stanley Cups, NBA and MLS titles." },
];

export const figure = (id: string) => FIGURES.find(f => f.id === id)!;
