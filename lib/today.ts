import { BUDGET_DATA } from "@/lib/budget";
import { LATEST_POPULATION_YEAR, POPULATION_SOURCE, population } from "@/lib/context";
import { CRIME } from "@/lib/crime";
import { ELECTIONS } from "@/lib/elections";
import { HOUSING } from "@/lib/housing";
import { PEOPLE } from "@/lib/people";
import { ROADS } from "@/lib/roads";
import { SCHOOLS } from "@/lib/schools";
import { TERMS } from "@/lib/council";
import { TRANSIT } from "@/lib/transit";
import { fmtPeriod } from "@/lib/chart-format";
import { fmtMoney } from "@/lib/format";
import type { DataSource, Series } from "@/lib/types";
import { LAYERS } from "@/lib/layers";
import densityLayer from "@/public/layers/density.json";
import subwayLayer from "@/public/layers/subway.json";
import parksLayer from "@/public/layers/parks.json";

// TOday, the daily game: the question bank. Every answer is computed here from the generated
// datasets (never typed), and carries the files it came from. Five levels by the size of the
// answer (1–10, –100, –1,000, –10,000, uncapped), set automatically from the answer (levelOf);
// building this module throws if a level runs short of questions.
// Server-only: it reads the datasets; the page hands the finished questions to the client game.

export type Level = 1 | 2 | 3 | 4 | 5;

export interface TodayQuestion {
  /** Stable id: the day's pick is derived from it, so renaming one reshuffles the schedule. */
  id: string;
  level: Level;
  /** Questions sharing a topic never appear on the same day. */
  topic: string;
  /** The site section the question explores (budget, people, government…); also one per day. */
  area: string;
  prompt: string;
  answer: number;
  prefix?: string;
  suffix?: string;
  /** Decimals to show the answer with. */
  decimals: number;
  /** Shown after answering: the figure in context. */
  fact: string;
  /** How the answer was computed from the sources. */
  how: string;
  href: string;
  hrefLabel: string;
  sources: DataSource[];
}

export const RANGES: Record<Level, { min: number; max: number | null; label: string }> = {
  1: { min: 1, max: 10, label: "1 to 10" },
  2: { min: 1, max: 100, label: "1 to 100" },
  3: { min: 1, max: 1000, label: "1 to 1,000" },
  4: { min: 1, max: 10000, label: "1 to 10,000" },
  5: { min: 1, max: null, label: "No limit" },
};

/** A question's level is set by the size of its answer, so a data refresh that moves an answer moves the question. */
export function levelOf(answer: number): Level {
  return answer <= 10 ? 1 : answer <= 100 ? 2 : answer <= 1000 ? 3 : answer <= 10000 ? 4 : 5;
}

type Point = { period: string; value: number };

/** Points with a value that isn't marked incomplete. */
const complete = (s: Series) => s.points.filter(p => p.value != null && !p.note) as Point[];
const last = (s: Series) => complete(s)[complete(s).length - 1];
const most = (s: Series) => Math.max(...complete(s).map(p => p.value));

function at(s: Series, period: string): Point {
  const p = s.points.find(x => x.period === period && x.value != null && !x.note);
  if (!p) throw new Error(`today: ${s.id} has no complete value for ${period}`);
  return p as Point;
}

const n0 = (v: number) => Math.round(v).toLocaleString("en-CA");
const n1 = (v: number) => v.toLocaleString("en-CA", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const daysIn = (year: number) => (new Date(Date.UTC(year, 1, 29)).getUTCMonth() === 1 ? 366 : 365);
const where = (s: Series) => (s.geography ? ` (${s.geography.replace(" (CMA)", "")})` : "");

// ── Datasets, resolved once ─────────────────────────────────────────────────

const BUDGET = BUDGET_DATA.years[BUDGET_DATA.years.length - 1];
const FIRST_BUDGET = BUDGET_DATA.years[0];
/** Latest budget year with a StatCan population, for per-resident figures. */
const POP_BUDGET = [...BUDGET_DATA.years].reverse().find(y => population(y.year) != null)!;
const POP = population(LATEST_POPULATION_YEAR)!;

function group(y: typeof BUDGET, side: "revenue" | "expenses", id: string): number {
  const g = y.comparable[side].find(x => x.group === id);
  if (!g) throw new Error(`today: ${y.year} has no comparable group ${side}/${id}`);
  return g.amount;
}

function program(y: typeof BUDGET, name: string) {
  const p = y.expensesByProgram.find(l => l.name === name);
  if (!p) throw new Error(`today: ${y.year} budget has no program "${name}"`);
  return p;
}

const H = HOUSING.series, P = PEOPLE.series, C = CRIME.series, R = ROADS.series, T = TRANSIT.series;
const census = (id: string) => {
  const c = PEOPLE.census.find(x => x.id === id);
  if (!c) throw new Error(`today: no census indicator ${id}`);
  return { ...c, latest: c.values[c.values.length - 1] };
};
const GENERALS = ELECTIONS.filter(e => e.kind === "general");
const LAST_GENERAL = GENERALS[GENERALS.length - 1];
const BY_ELECTION = [...ELECTIONS].reverse().find(e => e.kind === "by-election");
const TERM = TERMS[TERMS.length - 1];
const SCHOOL_YEAR = SCHOOLS.schoolYears[SCHOOLS.schoolYears.length - 1];
const TDSB = SCHOOLS.boards.find(b => b.board === "Toronto DSB")!;

// ── The questions ───────────────────────────────────────────────────────────

type Draft = Omit<TodayQuestion, "level" | "decimals" | "area"> & { decimals?: number };

const LEVEL_1: Draft[] = [
  (() => {
    const tax = group(BUDGET, "revenue", "property-tax");
    return {
      id: "propertytax-share", topic: "property-tax",
      prompt: `Out of every $10 the City's ${BUDGET.year} operating budget brings in, how many dollars come from property tax?`,
      answer: (tax / BUDGET.revenue) * 10, prefix: "$",
      fact: `Property tax brings in ${fmtMoney(tax)} of ${fmtMoney(BUDGET.revenue)}. The rest is mostly provincial and federal money, user fees, other revenue and draws from reserves.`,
      how: `Property tax revenue ÷ total revenue in the ${BUDGET.year} approved operating budget × 10.`,
      href: "/budget/comparable", hrefLabel: "Where the City's money comes from", sources: [BUDGET.source],
    };
  })(),
  (() => {
    const pay = group(BUDGET, "expenses", "salaries-benefits");
    return {
      id: "salaries-share", topic: "salaries",
      prompt: `What percentage of the City's ${BUDGET.year} planned spending goes to staff salaries and benefits?`,
      answer: (pay / BUDGET.expenses) * 100, suffix: "%", decimals: 1,
      fact: `Salaries and benefits are ${fmtMoney(pay)} of ${fmtMoney(BUDGET.expenses)} in planned spending: the biggest single kind of cost.`,
      how: `Salaries and benefits ÷ total expenses in the ${BUDGET.year} approved operating budget × 100.`,
      href: "/budget/comparable", hrefLabel: "Where the City's money goes", sources: [BUDGET.source],
    };
  })(),
  (() => {
    const now = group(BUDGET, "revenue", "property-tax"), then = group(FIRST_BUDGET, "revenue", "property-tax");
    return {
      id: "propertytax-growth", topic: "property-tax",
      prompt: `The City expects to raise how many times as much property tax in ${BUDGET.year} as it did in ${FIRST_BUDGET.year}?`,
      answer: now / then, suffix: "×",
      fact: `${fmtMoney(then)} in ${FIRST_BUDGET.year}, ${fmtMoney(now)} in ${BUDGET.year} (not adjusted for inflation).`,
      how: `Property tax revenue in the ${BUDGET.year} budget ÷ the same in the ${FIRST_BUDGET.year} budget.`,
      href: "/budget/comparable", hrefLabel: "Property tax by year", sources: [BUDGET.source, FIRST_BUDGET.source],
    };
  })(),
  (() => {
    const police = program(BUDGET, "Toronto Police Service"), tpl = program(BUDGET, "Toronto Public Library");
    return {
      id: "police-vs-library", topic: "police-budget",
      prompt: `In the ${BUDGET.year} budget, Toronto Police Service gets how many times as much as Toronto Public Library?`,
      answer: police.amount / tpl.amount, suffix: "×",
      fact: `Police: ${fmtMoney(police.amount)}. Libraries: ${fmtMoney(tpl.amount)}.`,
      how: `Gross expenses of the two programs in the ${BUDGET.year} approved operating budget, divided.`,
      href: `/budget/${BUDGET.year}`, hrefLabel: `The ${BUDGET.year} budget by program`, sources: [BUDGET.source],
    };
  })(),
  ...ELECTIONS.filter(e => e.turnout).slice(-4).map((e, i) => ({
    id: `turnout-${e.id}`, topic: `election-${e.id}`,
    ...(i < 2
      ? { prompt: `In Toronto's ${e.label}, out of every 10 eligible voters, how many voted?`, answer: e.turnout!.turnoutPct / 10 }
      : { prompt: `In Toronto's ${e.label}, what percentage of eligible voters voted?`, answer: e.turnout!.turnoutPct, suffix: "%", decimals: 1 }),
    fact: `${n0(e.turnout!.numberVoted)} of ${n0(e.turnout!.eligibleElectors)} eligible electors voted: ${e.turnout!.turnoutPct.toFixed(1)}%.`,
    how: "Number voted ÷ eligible electors, from the Grand Total row of the City's voter statistics.",
    href: "/elections", hrefLabel: "Turnout in every election since 2003", sources: [e.turnout!.source],
  })),
  (() => {
    const p = last(P.unemployment);
    return {
      id: "unemployment", topic: "jobs",
      prompt: `What percentage of Toronto residents in the labour force were unemployed in ${fmtPeriod(p.period)}?`,
      answer: p.value, suffix: "%",
      fact: `${p.value.toFixed(1)}% in ${fmtPeriod(p.period)} (Statistics Canada, seasonally adjusted three-month average).`,
      how: "The value as published in the file.",
      href: "/people", hrefLabel: "Jobs since 2007", sources: [P.unemployment.source],
    };
  })(),
  ...([
    ["immigrants", "What percentage of people living in Toronto in the {y} census were immigrants?", "pct"],
    ["visibleMinority", "What percentage of people living in Toronto in the {y} census belonged to a visible minority?", "pct"],
    ["renters", "Out of every 10 Toronto households in the {y} census, how many rented their home?", "ten"],
    ["seniors", "Out of every 10 people living in Toronto in the {y} census, how many were 65 or older?", "ten"],
  ] as const).map(([id, prompt, mode]) => {
    const c = census(id);
    return {
      id: `census-${id}`, topic: `census-${id}`,
      prompt: prompt.replace("{y}", String(c.latest.year)),
      ...(mode === "pct" ? { answer: c.latest.value, suffix: "%", decimals: 1 } : { answer: c.latest.value / 10 }),
      fact: `${c.latest.value.toFixed(1)}% in ${c.latest.year}; ${c.values[0].value.toFixed(1)}% in ${c.values[0].year}.`,
      how: mode === "pct" ? "The census percentage." : "The census percentage ÷ 10.",
      href: "/people", hrefLabel: "Five censuses of who lives here", sources: [c.latest.source],
    };
  }),
  (() => {
    const s = H.rent2br, a = s.points.find(p => p.value != null) as Point, b = last(s);
    return {
      id: "rent-growth", topic: "rent",
      prompt: `A two-bedroom apartment in the Toronto region rents for how many times what it did in ${a.period}?`,
      answer: b.value / a.value, suffix: "×",
      fact: `Average rent: $${n0(a.value)} a month in ${a.period}, $${n0(b.value)} in ${b.period}.`,
      how: `Average two-bedroom rent in ${b.period} ÷ the same in ${a.period}.`,
      href: "/housing", hrefLabel: "Rents since 1992", sources: [s.source],
    };
  })(),
  (() => {
    const s = H.homePrice, b = last(s), a = at(s, `2009-${b.period.slice(5)}`);
    return {
      id: "homeprice-growth", topic: "home-price",
      prompt: `The average Toronto home sold for how many times as much in ${fmtPeriod(b.period)} as in ${fmtPeriod(a.period)}?`,
      answer: b.value / a.value, suffix: "×",
      fact: `$${n0(a.value)} in ${fmtPeriod(a.period)}; $${n0(b.value)} in ${fmtPeriod(b.period)}.`,
      how: "Average price in the later month ÷ the same month in 2009.",
      href: "/housing", hrefLabel: "Home prices since 2009", sources: [s.source],
    };
  })(),
  (() => {
    const s = P.foodBank, b = last(s), a = at(s, `2007-${b.period.slice(5)}`);
    return {
      id: "foodbank-growth", topic: "food-bank",
      prompt: `Daily Bread Food Bank served how many times as many people in ${fmtPeriod(b.period)} as in ${fmtPeriod(a.period)}?`,
      answer: b.value / a.value, suffix: "×",
      fact: `${n0(a.value)} people in ${fmtPeriod(a.period)}; ${n0(b.value)} in ${fmtPeriod(b.period)}.`,
      how: "People served in the later month ÷ the same month in 2007.",
      href: "/people", hrefLabel: "Food bank use since 2007", sources: [s.source],
    };
  })(),
  (() => {
    const p = last(C.clearanceRate);
    return {
      id: "clearance", topic: "crime",
      prompt: `Out of every 10 crimes reported to Toronto police in ${p.period}, how many does the police file record as cleared?`,
      answer: p.value / 10,
      fact: `${p.value.toFixed(1)}% were cleared in ${p.period}; in ${C.clearanceRate.points[0].period} it was ${C.clearanceRate.points[0].value!.toFixed(1)}%.`,
      how: "Crimes cleared ÷ crimes reported × 10.",
      href: "/crime", hrefLabel: "Crime and clearance since 2014", sources: [C.clearanceRate.source],
    };
  })(),
  (() => {
    const p = last(C.homicidesPer100k);
    return {
      id: "homicide-rate", topic: "homicide",
      prompt: `How many homicides were there in Toronto in ${p.period} for every 100,000 residents?`,
      answer: p.value,
      fact: `${n1(p.value)} per 100,000: ${n0(at(C.homicides, p.period).value)} homicides.`,
      how: "Homicides ÷ population × 100,000.",
      href: "/crime", hrefLabel: "Homicides since 2004", sources: [C.homicidesPer100k.source, ...(C.homicidesPer100k.inputs ?? [])],
    };
  })(),
  (() => {
    const all = last(T.annualRides), off = at(T.ridesOffPeak, all.period);
    return {
      id: "ttc-offpeak", topic: "ttc-rides",
      prompt: `What percentage of TTC rides in ${all.period} were off-peak rather than peak?`,
      answer: (off.value / all.value) * 100, suffix: "%", decimals: 1,
      fact: `${n0(off.value)} of ${n0(all.value)} rides were off-peak (“Non-Peak” in the file).`,
      how: "Off-peak rides ÷ annual rides × 100.",
      href: "/transit", hrefLabel: "TTC ridership since 2003", sources: [T.annualRides.source],
    };
  })(),
  (() => {
    const yr = last(R.ksi_pedestrian).period;
    const total = Object.values(R).filter(s => s.id.startsWith("ksi_")).reduce((a, s) => a + at(s, yr).value, 0);
    const ped = at(R.ksi_pedestrian, yr).value;
    return {
      id: "ksi-pedestrian", topic: "road-safety",
      prompt: `What percentage of people killed or seriously injured on Toronto's roads in ${yr} were pedestrians?`,
      answer: (ped / total) * 100, suffix: "%", decimals: 1,
      fact: `${n0(ped)} of the ${n0(total)} people killed or seriously injured were on foot.`,
      how: "Pedestrians ÷ everyone killed or seriously injured (all ways of travelling) × 100.",
      href: "/road-safety", hrefLabel: "Road safety since 2006", sources: [R.ksi_pedestrian.source],
    };
  })(),
  (() => {
    const all = last(H.starts), apt = at(H.startsApartment, all.period);
    return {
      id: "starts-apartment", topic: "housing-starts",
      prompt: `Out of every 10 new homes started in the Toronto region in ${all.period}, how many were apartments?`,
      answer: (apt.value / all.value) * 10,
      fact: `${n0(apt.value)} of ${n0(all.value)} housing starts were apartments and other multi-unit buildings.`,
      how: "Apartment and other starts ÷ all starts × 10.",
      href: "/housing", hrefLabel: "Homes built since 1972", sources: [H.starts.source],
    };
  })(),
  (() => {
    const boards = SCHOOLS.boards.filter(b => b.enrolment[SCHOOL_YEAR]);
    const all = boards.reduce((a, b) => a + b.enrolment[SCHOOL_YEAR].value, 0), tdsb = TDSB.enrolment[SCHOOL_YEAR].value;
    return {
      id: "tdsb-share", topic: "schools",
      prompt: `What percentage of students in Toronto's four public school boards in ${SCHOOL_YEAR} were at the Toronto District School Board?`,
      answer: (tdsb / all) * 100, suffix: "%", decimals: 1,
      fact: `${n0(tdsb)} of ${n0(all)} students. The others are at the Catholic board and the two French-language boards.`,
      how: `TDSB enrolment ÷ the four boards' enrolment combined × 100 (${boards.map(b => b.board).join(", ")}).`,
      href: "/schools", hrefLabel: "Enrolment by board", sources: [SCHOOLS.sources[SCHOOL_YEAR].enrolment],
    };
  })(),
  {
    id: "council-unanimous", topic: "council",
    prompt: `What percentage of recorded City Council votes in the ${TERM.term.replace("-", "–")} term were unanimous (everyone who voted, voting the same way)?`,
    answer: (TERM.unanimous / TERM.votes) * 100, suffix: "%", decimals: 1,
    fact: `${n0(TERM.unanimous)} of ${n0(TERM.votes)} recorded votes were unanimous.`,
    how: "Unanimous votes ÷ recorded votes × 100.",
    href: `/council/${TERM.term}`, hrefLabel: `Council's ${TERM.term.replace("-", "–")} term`, sources: [TERM.source],
  },
  (() => {
    const all = last(H.shelterPeople), fam = at(H.shelterSectorFamilies, all.period);
    return {
      id: "shelter-families", topic: "shelter",
      prompt: `On an average night in ${fmtPeriod(all.period)}, out of every 10 people in Toronto's shelter system, how many were in families?`,
      answer: (fam.value / all.value) * 10,
      fact: `About ${n0(fam.value)} of ${n0(all.value)} people a night were in family programs.`,
      how: "Average nightly people in family-sector programs ÷ all people in shelter programs × 10.",
      href: "/housing", hrefLabel: "The shelter system", sources: [H.shelterPeople.source],
    };
  })(),
];

const perResident = (name: string, label: string, topic: string): Draft => {
  const p = program(POP_BUDGET, name), pop = population(POP_BUDGET.year)!;
  return {
    id: `per-resident-${p.slug ?? name}`, topic,
    prompt: `In ${POP_BUDGET.year}, how much did the City budget per resident for ${label}?`,
    answer: p.amount / pop, prefix: "$",
    fact: `${fmtMoney(p.amount)} for ${n0(pop)} residents.`,
    how: `The program's gross expenses in the ${POP_BUDGET.year} approved operating budget ÷ Statistics Canada's ${POP_BUDGET.year} population.`,
    href: `/budget/${POP_BUDGET.year}/${p.slug}`, hrefLabel: `${name}, ${POP_BUDGET.year}`, sources: [POP_BUDGET.source, POPULATION_SOURCE],
  };
};

const LEVEL_2: Draft[] = [
  perResident("Toronto Police Service", "the Toronto Police Service", "police-budget"),
  perResident("Toronto Transit Commission - Conventional", "the TTC (conventional service, not Wheel-Trans)", "ttc-budget"),
  perResident("Toronto Shelter and Support Services", "shelters and support services", "shelter"),
  perResident("Toronto Fire Services", "Toronto Fire Services", "fire"),
  perResident("Toronto Public Library", "Toronto Public Library", "library"),
  perResident("Children's Services", "children's services (including child care)", "children"),
  (() => {
    const p = last(C.homicides);
    return {
      id: "homicides", topic: "homicide",
      prompt: `How many homicides were there in Toronto in ${p.period}?`,
      answer: p.value,
      fact: `${n0(p.value)} homicides in ${p.period}. The most since 2004 was ${n0(most(C.homicides))}.`,
      how: "The count in the file for the year.",
      href: "/crime", hrefLabel: "Homicides since 2004", sources: [C.homicides.source],
    };
  })(),
  (() => {
    const p = last(R.killed);
    return {
      id: "road-deaths", topic: "road-safety",
      prompt: `How many people were killed in traffic collisions on Toronto's roads in ${p.period}?`,
      answer: p.value,
      fact: `${n0(p.value)} people were killed and ${n0(at(R.seriouslyInjured, p.period).value)} seriously injured.`,
      how: "The count in the file for the year.",
      href: "/road-safety", hrefLabel: "Road safety since 2006", sources: [R.killed.source],
    };
  })(),
  (() => {
    const p = last(C.reported), d = daysIn(+p.period);
    return {
      id: "crimes-per-day", topic: "crime",
      prompt: `On an average day in ${p.period}, how many crimes were reported to Toronto police?`,
      answer: p.value / d,
      fact: `${n0(p.value)} crimes were reported over the year.`,
      how: `Reported crimes in ${p.period} ÷ ${d} days.`,
      href: "/crime", hrefLabel: "Reported crime since 2014", sources: [C.reported.source],
    };
  })(),
  (() => {
    const p = last(R.collisions_total), d = daysIn(+p.period);
    return {
      id: "collisions-per-day", topic: "collisions",
      prompt: `On an average day in ${p.period}, how many traffic collisions were reported to Toronto police?`,
      answer: p.value / d,
      fact: `${n0(p.value)} collisions over the year, most of them property damage only.`,
      how: `Reported collisions in ${p.period} ÷ ${d} days.`,
      href: "/road-safety", hrefLabel: "Collisions since 2014", sources: [R.collisions_total.source],
    };
  })(),
  ...[LAST_GENERAL, BY_ELECTION].filter(e => e != null).map(e => ({
    id: `candidates-${e.id}`, topic: `election-${e.id}`,
    prompt: `How many people ran for mayor in Toronto's ${e.label}?`,
    answer: e.mayor.candidateCount,
    fact: `${e.mayor.candidateCount} candidates. ${e.mayor.top[0].displayName} won with ${n0(e.mayor.top[0].votes)} votes.`,
    how: "Candidates with votes in the City's official results.",
    href: "/elections", hrefLabel: "Every mayoral race since 2003", sources: [e.mayor.source],
  })),
  (() => {
    const p = last(T.elevators);
    return {
      id: "ttc-elevators", topic: "ttc-stations",
      prompt: `How many elevators were in service in TTC stations in ${p.period}?`,
      answer: p.value,
      fact: `${n0(p.value)} in ${p.period}; ${n0(T.elevators.points[0].value!)} in ${T.elevators.points[0].period}.`,
      how: "The count from the TTC's operating statistics for the year.",
      href: "/transit", hrefLabel: "TTC elevators by year", sources: [T.elevators.source],
    };
  })(),
  (() => {
    const p = at(T.annualRides, String(LATEST_POPULATION_YEAR)), pop = POP;
    return {
      id: "ttc-rides-per-resident", topic: "ttc-rides",
      prompt: `In ${p.period}, how many TTC rides were taken for every Toronto resident?`,
      answer: p.value / pop,
      fact: `${n0(p.value)} rides; ${n0(pop)} residents. (Visitors and commuters from outside the city ride too.)`,
      how: `Annual TTC rides ÷ Statistics Canada's ${p.period} population for the City of Toronto.`,
      href: "/transit", hrefLabel: "TTC ridership since 2003", sources: [T.annualRides.source, POPULATION_SOURCE],
    };
  })(),
  {
    id: "tdsb-schools", topic: "schools",
    prompt: `How many schools did the Toronto District School Board report enrolment for in ${SCHOOL_YEAR}?`,
    answer: TDSB.enrolment[SCHOOL_YEAR].schools,
    fact: `${n0(TDSB.enrolment[SCHOOL_YEAR].schools)} schools with ${n0(TDSB.enrolment[SCHOOL_YEAR].value)} students.`,
    how: "Schools listed for the board with an enrolment figure in the Ministry of Education's file.",
    href: "/schools", hrefLabel: "Every Toronto school", sources: [SCHOOLS.sources[SCHOOL_YEAR].enrolment],
  },
  (() => {
    const p = last(H.shelterSites);
    return {
      id: "shelter-sites", topic: "shelter",
      prompt: `How many sites did Toronto's shelter system operate, on an average night in ${fmtPeriod(p.period)}?`,
      answer: p.value,
      fact: `About ${n0(p.value)} sites, sheltering about ${n0(at(H.shelterPeople, p.period).value)} people a night.`,
      how: "Average nightly count of distinct shelter locations over the month.",
      href: "/housing", hrefLabel: "The shelter system", sources: [H.shelterSites.source],
    };
  })(),
  (() => {
    const tax = group(POP_BUDGET, "revenue", "property-tax"), pop = population(POP_BUDGET.year)!;
    return {
      id: "propertytax-per-resident-month", topic: "property-tax",
      prompt: `The City's ${POP_BUDGET.year} property tax works out to how much per resident, per month?`,
      answer: tax / pop / 12, prefix: "$",
      fact: `${fmtMoney(tax)} ÷ ${n0(pop)} residents ÷ 12. It's paid on homes and businesses alike, so this is an average, not a bill.`,
      how: `Property tax revenue in the ${POP_BUDGET.year} budget ÷ Statistics Canada's ${POP_BUDGET.year} population ÷ 12.`,
      href: "/budget/comparable", hrefLabel: "Property tax by year", sources: [POP_BUDGET.source, POPULATION_SOURCE],
    };
  })(),
];

const LEVEL_3: Draft[] = [
  {
    id: "population", topic: "population",
    prompt: `How many people lived in the City of Toronto in ${LATEST_POPULATION_YEAR}?`,
    answer: POP,
    fact: `${n0(POP)} people (Statistics Canada estimate, July 1).`,
    how: "The value as published.",
    href: "/people", hrefLabel: "Population since 2001", sources: [POPULATION_SOURCE],
  },
  {
    id: "budget-total", topic: "budget-total",
    prompt: `How much does the City plan to spend in its ${BUDGET.year} operating budget?`,
    answer: BUDGET.expenses, prefix: "$",
    fact: `${fmtMoney(BUDGET.expenses)} in gross expenses, across ${BUDGET.programCount} programs and agencies.`,
    how: "Total gross expenses in the approved operating budget file.",
    href: `/budget/${BUDGET.year}`, hrefLabel: `The ${BUDGET.year} budget`, sources: [BUDGET.source],
  },
  {
    id: "budget-per-resident", topic: "budget-total",
    prompt: `In ${POP_BUDGET.year}, how much did the City's operating budget plan to spend per resident?`,
    answer: POP_BUDGET.expenses / population(POP_BUDGET.year)!, prefix: "$",
    fact: `${fmtMoney(POP_BUDGET.expenses)} ÷ ${n0(population(POP_BUDGET.year)!)} residents.`,
    how: `Gross expenses in the ${POP_BUDGET.year} approved operating budget ÷ Statistics Canada's ${POP_BUDGET.year} population.`,
    href: `/budget/${POP_BUDGET.year}`, hrefLabel: `The ${POP_BUDGET.year} budget`, sources: [POP_BUDGET.source, POPULATION_SOURCE],
  },
  {
    id: "propertytax-total", topic: "property-tax",
    prompt: `How much does the City expect to raise from property tax in ${BUDGET.year}?`,
    answer: group(BUDGET, "revenue", "property-tax"), prefix: "$",
    fact: `${fmtMoney(group(BUDGET, "revenue", "property-tax"))}, about ${Math.round((group(BUDGET, "revenue", "property-tax") / BUDGET.revenue) * 100)}% of the operating budget's revenue.`,
    how: "Property tax revenue in the approved operating budget file.",
    href: "/budget/comparable", hrefLabel: "Property tax by year", sources: [BUDGET.source],
  },
  ...([["Toronto Police Service", "the Toronto Police Service", "police-budget"], ["Toronto Transit Commission - Conventional", "the TTC (conventional service, not Wheel-Trans)", "ttc-budget"]] as const).map(([name, label, topic]) => {
    const p = program(BUDGET, name);
    return {
      id: `program-${p.slug}`, topic,
      prompt: `How much does the City's ${BUDGET.year} operating budget plan to spend on ${label}?`,
      answer: p.amount, prefix: "$",
      fact: `${fmtMoney(p.amount)} in gross expenses, ${((p.amount / BUDGET.expenses) * 100).toFixed(1)}% of the budget.`,
      how: "The program's gross expenses in the approved operating budget file.",
      href: `/budget/${BUDGET.year}/${p.slug}`, hrefLabel: `${name}, ${BUDGET.year}`, sources: [BUDGET.source],
    };
  }),
  (() => {
    const p = last(T.annualRides);
    return {
      id: "ttc-annual-rides", topic: "ttc-rides",
      prompt: `How many rides were taken on the TTC in ${p.period}?`,
      answer: p.value,
      fact: `${n0(p.value)} rides. The most in this data was ${n0(most(T.annualRides))}.`,
      how: "The value as published.",
      href: "/transit", hrefLabel: "TTC ridership since 2003", sources: [T.annualRides.source],
    };
  })(),
  (() => {
    const p = last(T.weekdayRidership);
    return {
      id: "ttc-weekday", topic: "ttc-rides",
      prompt: `How many rides were taken on the TTC on an average weekday in ${fmtPeriod(p.period)}?`,
      answer: p.value,
      fact: `${n0(p.value)} rides on an average weekday.`,
      how: "The value as published.",
      href: "/transit", hrefLabel: "Monthly ridership", sources: [T.weekdayRidership.source],
    };
  })(),
  (() => {
    const p = last(H.homePrice);
    return {
      id: "home-price", topic: "home-price",
      prompt: `What was the average price of a home sold in Toronto in ${fmtPeriod(p.period)}?`,
      answer: p.value, prefix: "$",
      fact: `$${n0(p.value)}.`,
      how: "The value as published.",
      href: "/housing", hrefLabel: "Home prices since 2009", sources: [H.homePrice.source],
    };
  })(),
  (() => {
    const p = last(H.rent1br);
    return {
      id: "rent-1br", topic: "rent",
      prompt: `What was the average monthly rent for a one-bedroom apartment in the Toronto region in ${p.period}?`,
      answer: p.value, prefix: "$",
      fact: `$${n0(p.value)} a month${where(H.rent1br)}.`,
      how: "The value as published.",
      href: "/housing", hrefLabel: "Rents since 1992", sources: [H.rent1br.source],
    };
  })(),
  (() => {
    const p = last(H.shelterPeople);
    return {
      id: "shelter-people", topic: "shelter",
      prompt: `On an average night in ${fmtPeriod(p.period)}, how many people stayed in Toronto's shelter system?`,
      answer: p.value,
      fact: `About ${n0(p.value)} people a night, in about ${n0(at(H.shelterSites, p.period).value)} sites.`,
      how: "People in all shelter programs each night, averaged over the month.",
      href: "/housing", hrefLabel: "The shelter system", sources: [H.shelterPeople.source],
    };
  })(),
  (() => {
    const p = last(H.socialHousingWaitlist);
    return {
      id: "social-housing-waitlist", topic: "social-housing",
      prompt: `How many households were on Toronto's social housing wait list in ${p.period}?`,
      answer: p.value,
      fact: `${n0(p.value)} in ${p.period}; ${n0(H.socialHousingWaitlist.points[0].value!)} in ${H.socialHousingWaitlist.points[0].period}.`,
      how: "The value as published.",
      href: "/housing", hrefLabel: "The wait list since 2007", sources: [H.socialHousingWaitlist.source],
    };
  })(),
  (() => {
    const p = last(C.reported);
    return {
      id: "crimes-reported", topic: "crime",
      prompt: `How many crimes were reported to Toronto police in ${p.period}?`,
      answer: p.value,
      fact: `${n0(p.value)}, about ${n0(at(C.reportedPer100k, p.period).value)} for every 100,000 residents.`,
      how: "Count of reported offences in the file for the year.",
      href: "/crime", hrefLabel: "Reported crime since 2014", sources: [C.reported.source],
    };
  })(),
  {
    id: `winner-votes-${LAST_GENERAL.id}`, topic: `election-${LAST_GENERAL.id}`,
    prompt: `How many votes did the winner of Toronto's ${LAST_GENERAL.label.replace("General Election", "mayoral election")} get?`,
    answer: LAST_GENERAL.mayor.top[0].votes,
    fact: `${LAST_GENERAL.mayor.top[0].displayName}: ${n0(LAST_GENERAL.mayor.top[0].votes)} of ${n0(LAST_GENERAL.mayor.totalVotes)} votes for mayor (${LAST_GENERAL.mayor.top[0].sharePct.toFixed(1)}%).`,
    how: "The winner's ward totals summed across the City's official results.",
    href: "/elections", hrefLabel: "Every mayoral race since 2003", sources: [LAST_GENERAL.mayor.source],
  },
  (() => {
    const p = last(P.foodBank);
    return {
      id: "foodbank-people", topic: "food-bank",
      prompt: `How many people did Daily Bread Food Bank programs serve in ${fmtPeriod(p.period)}?`,
      answer: p.value,
      fact: `${n0(p.value)} people, counting every household member.`,
      how: "The value as published.",
      href: "/people", hrefLabel: "Food bank use since 2007", sources: [P.foodBank.source],
    };
  })(),
  (() => {
    const p = last(H.permitValue);
    return {
      id: "permit-value", topic: "permits",
      prompt: `What was the total value of construction covered by building permits the City issued in ${p.period}?`,
      answer: p.value, prefix: "$",
      fact: `${fmtMoney(p.value)}, ${fmtMoney(at(H.permitValueResidential, p.period).value)} of it residential.`,
      how: "The value as published.",
      href: "/housing", hrefLabel: "Building permits since 2007", sources: [H.permitValue.source],
    };
  })(),
  (() => {
    const p = last(T.ridershipRevenue);
    return {
      id: "ttc-fare-revenue", topic: "ttc-budget",
      prompt: `How much did the TTC collect in ridership revenue (fares) in ${p.period}?`,
      answer: p.value, prefix: "$",
      fact: `${fmtMoney(p.value)} from riders.`,
      how: "The value as published.",
      href: "/transit", hrefLabel: "TTC revenue by year", sources: [T.ridershipRevenue.source],
    };
  })(),
  (() => {
    const c = census("medianHouseholdIncome");
    return {
      id: "median-household-income", topic: "census-income",
      prompt: `What was the median household income in Toronto in the ${c.latest.year} census?`,
      answer: c.latest.value, prefix: "$",
      fact: `$${n0(c.latest.value)}: half of households had more, half less.`,
      how: "The value as published in the census profile.",
      href: "/people", hrefLabel: "Five censuses of who lives here", sources: [c.latest.source],
    };
  })(),
  (() => {
    const boards = SCHOOLS.boards.filter(b => b.enrolment[SCHOOL_YEAR]);
    const all = boards.reduce((a, b) => a + b.enrolment[SCHOOL_YEAR].value, 0);
    return {
      id: "students", topic: "schools",
      prompt: `How many students were enrolled in Toronto's four public school boards in ${SCHOOL_YEAR}?`,
      answer: all,
      fact: `${n0(all)} students: ${boards.map(b => `${b.board} ${n0(b.enrolment[SCHOOL_YEAR].value)}`).join(", ")}.`,
      how: "Enrolment summed over each board's schools in the Ministry of Education's file.",
      href: "/schools", hrefLabel: "Enrolment by board", sources: [SCHOOLS.sources[SCHOOL_YEAR].enrolment],
    };
  })(),
  (() => {
    const p = last(H.underConstruction);
    return {
      id: "under-construction", topic: "housing-starts",
      prompt: `How many homes were under construction in the Toronto region at the end of ${p.period}?`,
      answer: p.value,
      fact: `${n0(p.value)} homes under construction; ${n0(at(H.completions, p.period).value)} were completed during the year.`,
      how: "The value as published.",
      href: "/housing", hrefLabel: "Homes built since 1972", sources: [H.underConstruction.source],
    };
  })(),
];

const AREAS: Record<string, string> = {
  budget: "budget", people: "people", elections: "government", council: "government", housing: "housing",
  crime: "safety", "road-safety": "safety", transit: "transit", schools: "schools", map: "map",
};

function areaOf(href: string): string {
  const a = AREAS[href.split("/")[1]];
  if (!a) throw new Error(`today: no area for ${href}`);
  return a;
}


// Mostly 1,000–10,000 answers (the fourth question).
const MORE: Draft[] = [
  (() => {
    const p = last(H.rent2br);
    return {
      id: "rent-2br", topic: "rent",
      prompt: `What was the average monthly rent for a two-bedroom apartment in the Toronto region in ${p.period}?`,
      answer: p.value, prefix: "$",
      fact: `$${n0(p.value)} a month, against $${n0(last(H.rent1br).value)} for a one-bedroom.`,
      how: "The value as published.",
      href: "/housing", hrefLabel: "Rents since 1992", sources: [H.rent2br.source],
    };
  })(),
  {
    id: "council-votes", topic: "council",
    prompt: `How many recorded votes did City Council hold in the ${TERM.term.replace("-", "–")} term?`,
    answer: TERM.votes,
    fact: `${n0(TERM.votes)} recorded votes, ${n0(TERM.carried)} of them carried.`,
    how: "Distinct recorded votes in the City's voting-record file for the term.",
    href: `/council/${TERM.term}`, hrefLabel: `Council's ${TERM.term.replace("-", "–")} term`, sources: [TERM.source],
  },
  (() => {
    const p = last(R.collisions_pedestrian);
    return {
      id: "collisions-pedestrian", topic: "collisions",
      prompt: `How many traffic collisions involving a pedestrian were reported to Toronto police in ${p.period}?`,
      answer: p.value,
      fact: `${n0(p.value)} collisions involving a pedestrian, of ${n0(at(R.collisions_total, p.period).value)} in all.`,
      how: "The count in the file for the year.",
      href: "/road-safety", hrefLabel: "Collisions since 2014", sources: [R.collisions_pedestrian.source],
    };
  })(),
  (() => {
    const p = last(R.collisions_bicycle);
    return {
      id: "collisions-bicycle", topic: "collisions",
      prompt: `How many traffic collisions involving a cyclist were reported to Toronto police in ${p.period}?`,
      answer: p.value,
      fact: `${n0(p.value)} collisions involving a cyclist.`,
      how: "The count in the file for the year.",
      href: "/road-safety", hrefLabel: "Collisions since 2014", sources: [R.collisions_bicycle.source],
    };
  })(),
  (() => {
    const p = last(H.adjustmentApps);
    return {
      id: "adjustment-apps", topic: "planning",
      prompt: `How many applications did Toronto's Committee of Adjustment (minor variances to zoning, like a bigger addition) receive in ${p.period}?`,
      answer: p.value,
      fact: `${n0(p.value)} applications, against ${n0(at(H.planningApps, p.period).value)} Community Planning applications.`,
      how: "The value as published.",
      href: "/housing", hrefLabel: "Planning applications since 2007", sources: [H.adjustmentApps.source],
    };
  })(),
  (() => {
    const tax = group(POP_BUDGET, "revenue", "property-tax"), pop = population(POP_BUDGET.year)!;
    return {
      id: "propertytax-per-resident-year", topic: "property-tax",
      prompt: `The City's ${POP_BUDGET.year} property tax works out to how much per resident for the year?`,
      answer: tax / pop, prefix: "$",
      fact: `${fmtMoney(tax)} ÷ ${n0(pop)} residents. It's paid on homes and businesses alike, so this is an average, not a bill.`,
      how: `Property tax revenue in the ${POP_BUDGET.year} budget ÷ Statistics Canada's ${POP_BUDGET.year} population.`,
      href: "/budget/comparable", hrefLabel: "Property tax by year", sources: [POP_BUDGET.source, POPULATION_SOURCE],
    };
  })(),
  (() => {
    const p = last(H.shelterBeds);
    return {
      id: "shelter-beds", topic: "shelter",
      prompt: `How many beds did Toronto's shelter system have available, on an average night in ${fmtPeriod(p.period)}?`,
      answer: p.value,
      fact: `About ${n0(p.value)} beds (actual capacity), ${last(H.shelterOccBeds).value.toFixed(1)}% of them occupied. Families are mostly in rooms, counted separately.`,
      how: "Average nightly bed capacity (actual) over the month.",
      href: "/housing", hrefLabel: "The shelter system", sources: [H.shelterBeds.source],
    };
  })(),
  (() => {
    const p = last(C.reportedPer100k);
    return {
      id: "crime-per-100k", topic: "crime",
      prompt: `How many crimes were reported to Toronto police in ${p.period} for every 100,000 residents?`,
      answer: p.value,
      fact: `About ${n0(p.value)} per 100,000; in ${C.reportedPer100k.points[0].period} it was ${n0(C.reportedPer100k.points[0].value!)}.`,
      how: "Reported crimes ÷ population × 100,000.",
      href: "/crime", hrefLabel: "Reported crime since 2014", sources: [C.reportedPer100k.source, ...(C.reportedPer100k.inputs ?? [])],
    };
  })(),
];

function finish(drafts: Draft[]): Record<Level, TodayQuestion[]> {
  const out: Record<Level, TodayQuestion[]> = { 1: [], 2: [], 3: [], 4: [], 5: [] };
  const ids = new Set<string>();
  for (const d of drafts) {
    if (!Number.isFinite(d.answer) || d.answer < 1) throw new Error(`today: question "${d.id}" has answer ${d.answer}`);
    if (ids.has(d.id)) throw new Error(`today: duplicate question id "${d.id}"`);
    ids.add(d.id);
    const level = levelOf(d.answer);
    out[level].push({ ...d, level, area: areaOf(d.href), decimals: d.decimals ?? (level === 1 ? 1 : 0) });
  }
  // Each level needs enough questions that a day's five can always avoid repeating a topic or area.
  for (const l of [1, 2, 3, 4, 5] as Level[]) {
    if (out[l].length < 8) throw new Error(`today: level ${l} has only ${out[l].length} questions: ${out[l].map(q => q.id).join(", ")}`);
  }
  return out;
}

export const QUESTIONS = finish([...LEVEL_1, ...LEVEL_2, ...LEVEL_3, ...MORE]);

// ── Multiple choice (416's first question) ──────────────────────────────────
// Four options, each with a value computed from the data; the right answer is the biggest (or the
// smallest) value. Option order is shuffled by a hash of the question and the option, so it's the same
// for everyone and never typed.

export interface ChoiceQuestion {
  id: string;
  topic: string;
  area: string;
  prompt: string;
  options: string[];
  correct: number;
  fact: string;
  how: string;
  href: string;
  hrefLabel: string;
  sources: DataSource[];
}

type ChoiceDraft = Omit<ChoiceQuestion, "area" | "options" | "correct" | "fact"> & {
  choices: { label: string; value: number }[];
  best: "max" | "min";
  fmt: (v: number) => string;
  factLead?: string;
};

function fnv(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0;
  return h;
}

const layerSources = (id: string) => LAYERS.views.find(v => v.id === id)?.sources ?? [];
const bySize = <T,>(xs: T[], v: (x: T) => number) => [...xs].sort((a, b) => v(b) - v(a));

const DENS = densityLayer as unknown as { items: [string, string, number][] };
const SUBWAY = subwayLayer as unknown as { groups: { label: string }[]; items: [number, string, string][]; info: string[] };
const PARKS = parksLayer as unknown as { items: [number, string, string][]; info: string[] };
const km = (s: string) => parseFloat(s);              // "38.9 km long · …" → 38.9
const ha = (s: string) => parseFloat(s.replace(/,/g, "")); // "1,060.6 hectares …" → 1060.6

const CHOICES: ChoiceDraft[] = [
  (() => {
    const names = ["Toronto Police Service", "Children's Services", "Toronto Fire Services", "Toronto Public Library"];
    return {
      id: "mc-budget-programs", topic: "police-budget", best: "max" as const, fmt: fmtMoney,
      prompt: `Which of these gets the most money in the City's ${BUDGET.year} operating budget?`,
      choices: names.map(n => ({ label: n.replace(/^Toronto /, ""), value: program(BUDGET, n).amount })),
      how: `Each program's gross expenses in the ${BUDGET.year} approved operating budget.`,
      href: `/budget/${BUDGET.year}`, hrefLabel: `The ${BUDGET.year} budget by program`, sources: [BUDGET.source],
    };
  })(),
  {
    id: "mc-revenue", topic: "property-tax", best: "max", fmt: fmtMoney,
    prompt: `Where does the City's ${BUDGET.year} operating budget get the most money?`,
    choices: [["property-tax", "Property tax"], ["provincial", "The Province of Ontario"], ["user-fees", "User fees, licences and permits"], ["federal", "The Government of Canada"]]
      .map(([g, label]) => ({ label, value: group(BUDGET, "revenue", g) })),
    how: `Each group's revenue in the ${BUDGET.year} approved operating budget, grouped the same way every year (see “Comparable across years”).`,
    href: "/budget/comparable", hrefLabel: "Where the City's money comes from", sources: [BUDGET.source],
  },
  (() => {
    const sorted = bySize(DENS.items, it => it[2]);
    const pick = [0, 35, 80, 130].map(i => sorted[i]);
    return {
      id: "mc-densest", topic: "density", best: "max" as const, fmt: (v: number) => `${n0(v)} people per km²`,
      prompt: "Which of these neighbourhoods is the most densely populated?",
      choices: pick.map(it => ({ label: it[0], value: it[2] })),
      how: "Each neighbourhood's 2021 census population ÷ its land area (measured from the City's boundary).",
      href: "/map", hrefLabel: "Population density on the map", sources: layerSources("density"),
    };
  })(),
  (() => {
    const lines = SUBWAY.items.map((it, i) => ({ label: SUBWAY.groups[it[0]].label.replace(/ \(.*\)$/, "").replace(/^Line (\d) (.*)$/, "Line $1 ($2)"), value: km(SUBWAY.info[i]) }));
    const four = bySize(lines, l => l.value).slice(0, 4);
    return {
      id: "mc-longest-line", topic: "ttc-lines", best: "max" as const, fmt: (v: number) => `${v.toFixed(1)} km`,
      prompt: "Which of these TTC rapid transit lines is the longest?",
      choices: four,
      how: "Each line's length measured along its full path in the TTC's schedule data (GTFS shapes).",
      href: "/map", hrefLabel: "Rapid transit on the map", sources: layerSources("subway"),
    };
  })(),
  (() => {
    const es = ELECTIONS.filter(e => e.turnout).slice(-4);
    return {
      id: "mc-turnout", topic: "turnout", best: "max" as const, fmt: (v: number) => `${v.toFixed(1)}% turnout`,
      prompt: "In which of these Toronto elections did the biggest share of eligible voters vote?",
      choices: es.map(e => ({ label: e.label, value: e.turnout!.turnoutPct })),
      how: "Number voted ÷ eligible electors, from each election's voter statistics.",
      href: "/elections", hrefLabel: "Turnout in every election since 2003", sources: es.map(e => e.turnout!.source),
    };
  })(),
  (() => {
    const named = PARKS.items.map((it, i) => ({ label: it[1], value: ha(PARKS.info[i]) })).filter(p => p.label && !/^unnamed/i.test(p.label));
    const seen = new Set<string>(), uniq = bySize(named, p => p.value).filter(p => !seen.has(p.label) && seen.add(p.label));
    return {
      id: "mc-largest-park", topic: "parks", best: "max" as const, fmt: (v: number) => `${v.toFixed(0)} hectares`,
      prompt: "Which of these parks is the biggest?",
      choices: [2, 6, 12, 25].map(i => uniq[i]),
      how: "Each park's area measured on its outline in the City's Green Spaces data.",
      href: "/map", hrefLabel: "Green space on the map", sources: layerSources("parks"),
    };
  })(),
  (() => {
    const yr = last(C.reported).period;
    const cats = CRIME.categories.map((name, i) => ({ label: name, value: at(C[`cat${i}`], yr).value }));
    return {
      id: "mc-crime-type", topic: "crime", best: "max" as const, fmt: (v: number) => `${n0(v)} reported`,
      prompt: `Which kind of crime was reported most to Toronto police in ${yr}?`,
      choices: bySize(cats, c => c.value).slice(0, 4),
      how: `Reported offences in ${yr}, by the police service's own categories.`,
      href: "/crime", hrefLabel: "Crime by category", sources: [C.cat0.source],
    };
  })(),
  (() => {
    const yr = last(R.ksi_pedestrian).period;
    const modes = [["ksi_pedestrian", "Pedestrians"], ["ksi_cyclist", "Cyclists"], ["ksi_motorcyclist", "Motorcyclists"], ["ksi_driver", "Drivers"]];
    return {
      id: "mc-ksi-mode", topic: "road-safety", best: "max" as const, fmt: (v: number) => `${n0(v)} killed or seriously injured`,
      prompt: `Who made up the most people killed or seriously injured on Toronto's roads in ${yr}?`,
      choices: modes.map(([k, label]) => ({ label, value: at(R[k], yr).value })),
      how: `People killed or seriously injured in ${yr}, by how they were travelling.`,
      href: "/road-safety", hrefLabel: "Road safety by how people travel", sources: [R.ksi_pedestrian.source],
    };
  })(),
  (() => {
    const yr = last(H.starts).period;
    const kinds = [["startsApartment", "Apartments"], ["startsSingle", "Single-detached houses"], ["startsSemi", "Semi-detached houses"], ["startsRow", "Row houses"]];
    return {
      id: "mc-starts-type", topic: "housing-starts", best: "max" as const, fmt: (v: number) => `${n0(v)} started`,
      prompt: `What kind of new home was started most in the Toronto region in ${yr}?`,
      choices: kinds.map(([k, label]) => ({ label, value: at(H[k], yr).value })),
      how: `Housing starts in ${yr} by type of dwelling (Toronto region).`,
      href: "/housing", hrefLabel: "Homes built since 1972", sources: [H.starts.source],
    };
  })(),
  (() => {
    const pts = complete(T.annualRides), top = bySize(pts, p => p.value)[0], lastP = pts[pts.length - 1];
    const others = [pts[0], pts.find(p => p.period === "2020") ?? pts[1], lastP].filter(p => p.period !== top.period);
    const four = [top, ...others].slice(0, 4);
    return {
      id: "mc-ttc-peak-year", topic: "ttc-rides", best: "max" as const, fmt: (v: number) => `${(v / 1e6).toFixed(0)} million rides`,
      prompt: "In which of these years did the TTC carry the most riders?",
      choices: four.map(p => ({ label: p.period, value: p.value })),
      how: "Annual rides as the TTC reports them.",
      href: "/transit", hrefLabel: "TTC ridership since 2003", sources: [T.annualRides.source],
    };
  })(),
];

function finishChoices(drafts: ChoiceDraft[]): ChoiceQuestion[] {
  return drafts.map(d => {
    if (d.choices.length !== 4 || d.choices.some(c => !c || !Number.isFinite(c.value))) throw new Error(`today: choice question "${d.id}" needs four options with values`);
    const best = d.best === "max" ? Math.max(...d.choices.map(c => c.value)) : Math.min(...d.choices.map(c => c.value));
    if (d.choices.filter(c => c.value === best).length !== 1) throw new Error(`today: choice question "${d.id}" has a tie for the answer`);
    const order = [...d.choices].sort((a, b) => fnv(`${d.id}:${a.label}`) - fnv(`${d.id}:${b.label}`));
    const winner = order.find(c => c.value === best)!;
    const { choices: _c, best: _b, fmt, factLead, ...rest } = d;
    void _c; void _b;
    return {
      ...rest, area: areaOf(d.href), options: order.map(c => c.label), correct: order.indexOf(winner),
      fact: `${factLead ?? ""}${bySize(order, c => (d.best === "max" ? c.value : -c.value)).map(c => `${c.label}: ${fmt(c.value)}`).join(" · ")}.`,
    };
  });
}

export const CHOICE_QUESTIONS = finishChoices(CHOICES);
