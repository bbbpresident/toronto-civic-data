// Toronto civic data — shared types.
//
// The rule for this section: every figure shown has a source the reader can open. The types
// enforce it — a datum without a `source` won't compile — so keep `source` required on any
// new type added here.

/** Where a figure came from. `fileUrl` is the exact file; `locator` says where in it. */
export interface DataSource {
  publisher: string;
  dataset: string;
  datasetUrl: string;
  fileUrl: string;
  /** Path inside the download when it's a zip. */
  member: string | null;
  sheet?: string;
  locator: string;
  /** How a derived number (a percentage, a sum) was computed from the file. */
  method: string;
}

/** A citation to a web page (a legislature member record, a report). */
export interface PageSource {
  publisher: string;
  title: string;
  url: string;
  /** ISO date the page was checked to say what we quote from it. */
  accessed: string;
}

export interface Turnout {
  eligibleElectors: number;
  numberVoted: number;
  /** numberVoted / eligibleElectors × 100, computed by the extractor. */
  turnoutPct: number;
  /** The "% Voted" cell as the City's file states it (often rounded, sometimes a string). */
  publishedPct: number | string;
  source: DataSource;
}

export interface MayorCandidate {
  rank: number;
  /** Exactly as the City's file lists it (surname first). */
  nameAsListed: string;
  displayName: string;
  votes: number;
  sharePct: number;
}

export interface MayorResult {
  totalVotes: number;
  candidateCount: number;
  top: MayorCandidate[];
  /** Every candidate, ranked. Same source as `top`. */
  candidates: Omit<MayorCandidate, "sharePct">[];
  source: DataSource;
}

export interface Election {
  id: string;
  year: number;
  kind: "general" | "by-election";
  label: string;
  /** null until the City publishes voter statistics for the election. */
  turnout: Turnout | null;
  mayor: MayorResult;
}

export interface ElectionsData {
  generatedOn: string;
  generator: string;
  elections: Election[];
}

/** A party role documented by an official record. Not a ballot label — Toronto's results list none. */
export interface Affiliation {
  party: string;
  /** What the record documents, with dates, so timing relative to the race is visible. */
  role: string;
  source: PageSource;
}

// ── Budget ───────────────────────────────────────────────────────────────────

/** One line of a breakdown, in dollars (revenues already flipped positive). */
export interface BudgetLine {
  name: string;
  amount: number;
  /** Sub-category lines; present from 2019, when the City's files added that column. */
  sub?: BudgetLine[];
  /** On program lines: the program's page, /budget/[year]/[slug]. */
  slug?: string;
}

/** Revenue minus expenses when it isn't ~$0, measured against the programs it sits in. */
export interface BudgetGap {
  gap: number;
  programs: { name: string; net: number }[];
  /** Revenue minus expenses for every other program combined. */
  restNet: number;
  /** True when restNet is under $1,000 — i.e. the gap really is in `programs`. */
  explained: boolean;
}

export interface BudgetYear {
  year: number;
  label: string;
  revenue: number;
  expenses: number;
  gap: BudgetGap | null;
  programCount: number;
  hasSubCategories: boolean;
  revenueByCategory: BudgetLine[];
  expensesByCategory: BudgetLine[];
  expensesByProgram: BudgetLine[];
  revenueByProgram: BudgetLine[];
  /** Totals by the crosswalk's groups (lib/budget-crosswalk.json), with the amount each rule matched. */
  comparable: { revenue: ComparableGroup[]; expenses: ComparableGroup[] };
  source: DataSource;
}

export interface ComparableGroup {
  group: string;
  amount: number;
  rules: { id: string; amount: number }[];
}

export type CrosswalkSide = "revenue" | "expenses";

/** files: the City's files show it · sum: adding up lines the files keep separate ·
 *  document: a City document shows it · judgment: our call, stated as such. */
export type CrosswalkBasis = "files" | "sum" | "document" | "judgment";

export interface CrosswalkRule {
  id: string;
  side: CrosswalkSide;
  group: string;
  years?: number[];
  match: Partial<Record<"program" | "service" | "category" | "subCategory", string | string[]>>;
  basis: CrosswalkBasis;
  why: string;
  documents?: { year: number; label: string; url: string; amount: number; quote: string }[];
}

export interface BudgetCrosswalk {
  about: string;
  groups: Record<CrosswalkSide, { id: string; label: string; description: string }[]>;
  rules: CrosswalkRule[];
}

export interface BudgetData {
  generatedOn: string;
  generator: string;
  dataset: { publisher: string; dataset: string; datasetUrl: string };
  years: BudgetYear[];
}

/** One program's slice of a year's file. */
export interface BudgetProgram {
  slug: string;
  name: string;
  expenses: number;
  revenue: number;
  /** By Service (→ Activity). null for 2014, whose file has no Service column. */
  expensesByService: BudgetLine[] | null;
  expensesByCategory: BudgetLine[];
  revenueByCategory: BudgetLine[];
  /** This program's rows in the crosswalk's groups (lib/budget-crosswalk.json), so lines compare across years. */
  comparable: Record<CrosswalkSide, { group: string; amount: number }[]>;
  source: DataSource;
}

export interface BudgetProgramsData {
  generatedOn: string;
  generator: string;
  years: Record<string, BudgetProgram[]>;
}

// ── Context (outside figures that give budget numbers a scale) ───────────────

export interface ContextSeries {
  values: Record<string, number>;
  source: DataSource;
}

export interface UnitCostDef {
  id: string;
  /** Budget program names (exact, all names the program has had) this volume belongs to. */
  programs: string[];
  unit: string;
  volumeLabel: string;
  dataset: string;
  datasetUrl: string;
  publisher: string;
  caveat: string;
  volumes: Record<string, { value: number; fileUrl: string; locator: string }>;
}

export interface MbnMeasure {
  number: string;
  name: string;
  category: string;
  numerator: number | null;
  denominator: number | null;
  result: number;
  fileUrl: string;
}

export interface ContextData {
  generatedOn: string;
  generator: string;
  population: ContextSeries;
  cpi: ContextSeries;
  unitCosts: UnitCostDef[];
  mbn: {
    publisher: string;
    dataset: string;
    datasetUrl: string;
    areas: Record<string, { programs: string[]; years: Record<string, MbnMeasure[]> }>;
  };
}

// ── Time series (housing, crime, road safety, transit, people, schools) ─────

/** How a series' values are formatted. `percent` values are 0–100, not fractions. */
export type SeriesUnit = "count" | "dollars" | "percent";

export interface SeriesPoint {
  /** "2024" for a year, "2024-03" for a month, "2024 Q1" for a quarter, "2024–25" for a school year. */
  period: string;
  value: number | null;
  /** Set when the period is incomplete (e.g. the current year to date) or carried over. */
  note?: string;
}

/** One sourced line of figures. Every series carries its own source — keep it required. */
export interface Series {
  id: string;
  label: string;
  unit: SeriesUnit;
  /** What area the figures cover, when it isn't the City itself (e.g. "Toronto region (CMA)"). */
  geography?: string;
  points: SeriesPoint[];
  source: DataSource;
  /** Other files a derived value was computed from (e.g. population for a per-100,000 rate). */
  inputs?: DataSource[];
  /** A caveat from the publisher or about the method, shown under the chart. */
  note?: string;
}

/** A generated dataset made of series, plus any section-specific extras. */
export interface SeriesData {
  generatedOn: string;
  generator: string;
  series: Record<string, Series>;
}

// ── Crime ────────────────────────────────────────────────────────────────────

export interface CrimeSubtype {
  category: string;
  subtype: string;
  /** year → [reported, cleared] */
  years: Record<string, [number, number]>;
}

export interface CrimeData extends SeriesData {
  categories: string[];
  subtypes: CrimeSubtype[];
  subtypeSource: DataSource;
}

// ── People (census) ──────────────────────────────────────────────────────────

/** One census year's City-wide value, with the file and rows it came from. */
export interface CensusValue {
  year: number;
  value: number;
  numerator: number | null;
  denominator: number | null;
  source: DataSource;
}

export interface CensusIndicator {
  id: string;
  label: string;
  unit: "percent" | "dollars";
  description: string;
  note: string | null;
  values: CensusValue[];
}

export interface PeopleData extends SeriesData {
  census: CensusIndicator[];
}

// ── Schools ──────────────────────────────────────────────────────────────────

export interface SchoolInfo {
  id: string;
  name: string;
  board: string;
  level: string;
  language: string;
  grades: string;
  /** The file's "City" column — often the former municipality (North York, Scarborough…). */
  area: string;
  street: string;
  postal: string;
}

/** A number (percentages 0–100), a code exactly as published ("N/R", "N/D", "SP"…), or blank. */
export type SchoolValue = number | string | null;

export interface BoardTrend {
  board: string;
  schools: number;
  enrolment: Record<string, { value: number; schools: number }>;
  tests: Record<string, Record<string, { value: number; schools: number } | null>>;
}

export interface SchoolsData {
  generatedOn: string;
  generator: string;
  schoolYears: string[];
  yearMeta: Record<string, { fileUrl: string; sheet: string; eqaoCarriedFrom: string | null }>;
  boards: BoardTrend[];
  schools: SchoolInfo[];
  sources: Record<string, { enrolment: DataSource; tests: DataSource; school: DataSource }>;
  /** field id → the file's column name */
  tests: Record<string, string>;
  profile: Record<string, string>;
  glossaryUrl: string;
}

export interface SchoolsDetail {
  generatedOn: string;
  generator: string;
  /** school number → school year → field → value */
  schools: Record<string, Record<string, Record<string, SchoolValue>>>;
}

// ── Council ──────────────────────────────────────────────────────────────────

export interface CouncilMember {
  name: string;
  isMayor: boolean;
  votesOnRoll: number;
  cast: number;
  missedPct: number | null;
  withMajorityPct: number | null;
  withMayorPct: number | null;
  withMayorVotes: number;
  attendancePct: number | null;
  sessions: number;
}

export interface CouncilVote {
  item: string;
  title: string;
  motion: string;
  description: string;
  result: string;
  carried: boolean;
  yes: number;
  no: number;
  date: string | null;
  roll: Record<string, string>;
  mayorName: string | null;
  mayorVote: string | null;
}

export interface CouncilTerm {
  term: string;
  firstYear: number;
  lastYear: number;
  votes: number;
  carried: number;
  unanimous: number;
  close: number;
  closeMargin: number;
  mayors: { name: string; election: string; electionYear: number; source: DataSource }[];
  members: CouncilMember[];
  closest: CouncilVote[];
  source: DataSource;
  attendanceSource: DataSource;
}

export interface CouncilData {
  generatedOn: string;
  generator: string;
  terms: CouncilTerm[];
}

// ── Campaign promises (hand-curated: lib/promises.json, checked by scripts/check_promises.py) ──

export type PromiseStatus = "done" | "partly" | "in-progress" | "no-action-found" | "reversed";

/** A recorded Council vote, as it appears in the City's voting-record file for `term`. */
export interface PromiseVote {
  term: string;
  item: string;
  /** Absent for terms whose voting file records no dates (2010–2018). */
  date?: string;
  motion: string;
  result: string;
  description?: string;
}

/** Each piece of evidence cites an official record: a City (or City agency) page, or a recorded vote. */
export type PromiseEvidence = { text: string; source: PageSource; vote?: never } | { text: string; vote: PromiseVote; source?: never };

export interface CampaignPromise {
  id: string;
  topic: string;
  /** Verbatim from the archived platform page. */
  quote: string;
  /** The archived page the quote is on, when it isn't the campaign's main platform page. */
  platformUrl?: string;
  /** What the quote refers to, when the sentence alone doesn't say. */
  context?: string;
  status: PromiseStatus;
  summary: string;
  evidence: PromiseEvidence[];
}

export interface Campaign {
  id: string;
  mayor: string;
  election: string;
  electionYear: number;
  /** The Council term whose voting record the vote evidence comes from (none before 2006). */
  votingTerm?: string;
  /** The main archived platform page; absent when no platform could be found in the archive. */
  platform?: PageSource;
  /** Why the campaign has no assessed promises, when it has none. */
  missingPlatform?: string;
  /** What the archive does and doesn't hold for this campaign, shown on its page. */
  archiveNote?: string;
  /** ISO date the records were last checked. */
  checked: string;
  promises: CampaignPromise[];
  notAssessed: { promise: string; reason: string }[];
}

export interface PromisesData {
  note: string;
  campaigns: Campaign[];
}

// ── Sports (generated: scripts/extract_sports.py) ────────────────────────────

export interface SportsSeason {
  /** "2025" or, for seasons spanning two years, "2024–25". */
  season: string;
  /** The team's name that season when it differs by era (e.g. Toronto Arenas). */
  team?: string;
  wins: number;
  losses: number;
  ties?: number;
  /** Overtime losses (NHL, from 1999–2000). */
  otl?: number;
  /** Draws (soccer). */
  draws?: number;
  inProgress: boolean;
  /** null when it can't be said yet (season in progress) or no postseason was held. */
  playoffs: boolean | null;
  /** How far they went, in the league's words (e.g. "Lost in the AL Championship Series"). */
  result: string | null;
  champion: boolean;
  /** A caveat about this season's figures (e.g. the source contradicting itself). */
  note?: string;
  /** The file behind each part of the row. NHL records and playoffs share one file. */
  sources: { record: DataSource; playoffs?: DataSource };
}

export interface SportsTeam {
  id: string;
  name: string;
  league: string;
  sport: string;
  trophy: string;
  url: string | null;
  available: boolean;
  /** Why there's no data, when `available` is false. */
  reason?: string;
  /** Set when the data comes from a secondary source rather than the league (e.g. "ESPN"); shown on every page. */
  secondarySource?: string;
  seasons?: SportsSeason[];
  championships?: string[];
  /** Player records: each player's regular-season totals with the team, in groups (hitters/pitchers…). */
  players?: PlayerGroup[] | null;
}

export type PlayerColumnKind = "int" | "dec1" | "dec2" | "dec3" | "pct" | "ip" | "text";

export interface PlayerColumn {
  key: string;
  /** Short header (HR, AVG). */
  label: string;
  /** Full name, shown on hover and read by screen readers. */
  title?: string;
  /** dec3 shows .295; pct shows a 0–1 rate as .912; ip turns outs into innings (123.1 = 123⅓). */
  kind: PlayerColumnKind;
  /** Lower is better (ERA, GAA): the first click sorts ascending. */
  asc?: boolean;
  /** A rate stat's minimum sample: when sorting by it, rows where `key` < `min` go last. */
  qualify?: { key: string; min: number; label: string };
}

export type PlayerRow = { name: string; url?: string } & Record<string, string | number | null | undefined>;

export interface PlayerGroup {
  id: string;
  label: string;
  columns: PlayerColumn[];
  /** Column key the table is sorted by at first (descending). */
  sort: string;
  rows: PlayerRow[];
  /** The latest file, with how the totals were built; `files` lists every file combined. */
  source: DataSource;
  files: string[];
  note?: string;
}

export interface SportsData {
  generatedOn: string;
  generator: string;
  teams: SportsTeam[];
}

// ── What's on in the city (generated: scripts/extract_city.py) ──────────────

export interface CityEvent {
  name: string;
  start: string | null;
  end: string | null;
  category: string | null;
  free: boolean;
  where: string | null;
  url: string | null;
  about: string | null;
}

export interface CityEvents {
  from: string;
  to: string;
  items: CityEvent[];
  /** "YYYY-MM-DD" → indexes into items (events of up to a few days). */
  days: Record<string, number[]>;
  /** Indexes of longer-running events (exhibitions, seasonal programs), soonest-ending first. */
  ongoing: number[];
  calendarUrl: string;
  submitUrl: string;
  source: DataSource;
}

export interface RoadRestriction {
  id: string;
  type: string | null;
  road: string;
  where: string;
  district: string | null;
  by: string | null;
  about: string | null;
  from: string | null;
  until: string | null;
  /** Position on the ward map (SVG units). */
  x: number;
  y: number;
}

export interface CityData {
  generatedOn: string;
  generator: string;
  events: CityEvents;
  construction: { items: RoadRestriction[]; mapUrl: string; source: DataSource };
  wards: { width: number; height: number; paths: { ward: string; name: string; d: string }[]; source: DataSource };
}

// ── TOday's map questions (generated: scripts/extract_places.py) ─────────────

export type PlaceKind = "landmark" | "park" | "neighbourhood" | "district" | "beach" | "station";

export interface Place {
  id: string;
  kind: PlaceKind;
  name: string;
  /** Position on the blank map (SVG units), for points… */
  point?: [number, number];
  /** …or the outline, for areas (one or more rings of [x, y]). */
  rings?: [number, number][][];
}

export interface PlacesData {
  generatedOn: string;
  generator: string;
  map: { width: number; height: number; paths: string[]; kmPerUnit: number; source: DataSource };
  places: Place[];
  sources: Record<PlaceKind, DataSource>;
}

// ── Rankings (top-N lists and breakdowns) ───────────────────────────────────

/** A ranked or ordered list from one file (scripts/_common.py `ranking`). */
export interface Ranking {
  id: string;
  title: string;
  unit: "count" | "dollars" | "percent" | "minutes";
  rows: { label: string; value: number; sub?: string | null }[];
  source: DataSource;
  note?: string;
}

/** A dataset of series plus rankings (pcard, parking, marriage, homelessness, delays, lobbying). */
export interface RankedData extends SeriesData {
  ranks: Record<string, Ranking>;
}
