# CLAUDE.md

@AGENTS.md

Toronto Civic Data — a public site of data about the City of Toronto: elections, City Council votes, the budget, housing, people (census, jobs, income), crime, road safety, transit and schools. No auth, no database: data is generated into JSON and ships with the build.

## Commands

```bash
npm run dev        # Next.js dev server
npm run build      # Production build (also type-checks)
npm run lint       # ESLint
npx tsc --noEmit   # Type-check — run before every commit

# Regenerate data from the City's open-data files
python3 -m venv .venv && .venv/bin/pip install pandas openpyxl xlrd
.venv/bin/python scripts/extract_elections.py
.venv/bin/python scripts/extract_budget.py
.venv/bin/python scripts/extract_context.py   # population, CPI, service volumes, MBNCanada (~250MB of downloads)
.venv/bin/python scripts/extract_council.py   # needs elections.json first (mayors); ~180MB of vote files
.venv/bin/python scripts/extract_housing.py
.venv/bin/python scripts/extract_safety.py    # crime.json + roads.json (~190MB, mostly the collisions table)
.venv/bin/python scripts/extract_transit.py
.venv/bin/python scripts/extract_people.py
.venv/bin/python scripts/extract_schools.py   # data.ontario.ca, one xlsx per school year
.venv/bin/python scripts/extract_sports.py    # MLB / NHL / MLS official APIs, ~150 requests (use CIVIC_CACHE)
# CIVIC_CACHE=/some/dir keeps downloads between runs while developing (scripts/_common.py)
```

No automated tests; the type-check and the extractor's reconciliation checks are the correctness gates.

## The rule

**Every figure shown has a source the reader can open — no exceptions.**

- Official numbers are **generated, never typed**. Each `scripts/extract_*.py` downloads the City of Toronto open-data files and writes `lib/<dataset>.json`, stamping each datum with its file URL, sheet/row locator and method. It aborts if row sums or ward totals don't reconcile. Never hand-edit the JSON.
- `lib/types.ts` makes `source` required on every datum type, so an unsourced number won't compile. Keep it that way for every new dataset.
- `lib/promises.json` (campaign promises) is the other hand-curated dataset. Quotes are verbatim from the candidate's platform as archived by the Internet Archive on/near election day; statuses (done / partly / in-progress / no-action-found / reversed) rest only on official records — Council votes from the voting-record file, City budgets, staff reports, City or City-agency (TTC, TPL) pages — never news. Promises whose outcome rests with another government go in `notAssessed` with the reason. **Run `scripts/check_promises.py` after every edit**: it fails if any quote isn't verbatim on its archived page or any cited vote doesn't match the voting record. The City's council site (secure.toronto.ca) refuses automated access; don't try to get around that — use toronto.ca/legdocs PDFs, City news releases and the voting-record file instead, or leave the promise unassessed.
- `lib/affiliations.ts` is the only other hand-curated data: party roles, each citing an official legislature record. The City's results files carry no party, so "—" means "none recorded", not "independent".
- Don't fill gaps with unofficial figures (e.g. news-reported turnout). Show "not yet published" and add the official file when it appears.

## Layout

| Path | What |
|---|---|
| `app/page.tsx` | Home — `SECTIONS` lists each dataset page |
| `app/elections/page.tsx` | Turnout chart + data table; clicking an election opens its top 10 mayoral candidates |
| `app/budget/page.tsx` | Budget: revenue vs expenses per year (`components/BudgetChart.tsx`, client) + data table; each year links to its breakdown |
| `app/budget/[year]/page.tsx` | One year's breakdown (server, prerendered via `generateStaticParams`; unknown years 404). Year chips + prev/next to switch years. Top-level toggle money in / money out, each with its own view toggle (`components/ViewToggle.tsx`; choices persist in sessionStorage across years) |
| `app/budget/[year]/[program]/page.tsx` | One program in one year (~740 static pages): spending by service (→ activity) or by type (→ sub-type), and revenue booked to it. Reached by clicking any program row on the year page. Data from `lib/budget-programs.ts` (~2MB JSON, server-only) |
| `app/budget/comparable/page.tsx`, `components/ComparableParts.tsx` | Budget regrouped so each group means the same thing in every year: a chart per group plus the rule list. Also a "Comparable across years" view on each year page. Groups and rules: `lib/budget-crosswalk.json` |
| `components/BudgetParts.tsx` | Shared server pieces for the budget pages: `Lines` (bar list; rows with a `slug` link to the program page), `TopPrograms`, `Stat`, `Panel`, `YearChips`, `BudgetStyles` |
| `lib/context.ts`, `scripts/extract_context.py` | Outside figures for scale: StatCan population (City of Toronto, CD 3520) and Toronto CPI; service volumes (shelter person-nights, library visits, fire incidents); MBNCanada measures. Pairings to budget programs (by exact program name) live in the script's `UNIT_COSTS` / `MBN_AREAS`. Helpers return null for missing years — never extrapolate |
| `components/ContextParts.tsx` | `ContextNotes` (per resident, change vs last year before/after inflation), `TrendBars`, `UnitCostCard`, `MbnCard` |
| `app/elections/page.tsx` | Top-level toggle By election (turnout chart, share-by-finishing-position grid `components/ShareByRankGrid.tsx`, data table) / By person (`components/Leaderboards.tsx`: all-time votes, best single race). Leaderboards use every candidate (`mayor.candidates`); people are matched across races by normalized name (`lib/leaderboard.ts`) — no candidate IDs exist |
| `app/today/page.tsx`, `components/TodayGame.tsx` (client), `lib/today.ts` | TOday, the daily game: three questions (level 1 answers 1–10, level 2 1–1,000, level 3 uncapped), each scored 1–10 by closeness, 30 a day. Linked from the top of Home |
| `app/sports/page.tsx` (Blue Jays), `app/sports/[team]`, `app/sports/TeamPage.tsx`, `components/SportsParts.tsx`, `lib/sports.ts`, `scripts/extract_sports.py` | Sports: a toggle per team (links styled as chips, static pages); two pages per team — Team history (championship summary, every season newest first: record, playoffs, how far) and Player records (`app/sports/[team]/players`, `components/PlayerTable.tsx`: sortable/searchable totals with the team, grouped by a toggle — hitters/pitchers, skaters/goalies, field players/goalkeepers) |
| `components/PageNav.tsx` | Top of every data page: a Home button, plus an optional "up" link (`up={{ href, label }}`). Every new data page starts with it |
| `components/SourceCitation.tsx` | `DataSourceCitation` (open-data file citation), `PageSourceLink` (web-page citation) |
| `lib/elections.ts` | Typed access to the generated JSON |
| `lib/budget.ts`, `scripts/extract_budget.py` | Budget data + generator (writes `budget.json` and `budget-programs.json`). Add a `BUDGETS` entry for a new year. Program slugs come from the program name; years where a program is renamed don't link to each other. Import `lib/budget.ts` only from server components (the JSON is ~190KB) |
| `scripts/extract_elections.py` | The generator. Add an `ELECTIONS` entry to add an election (or 2026 turnout once the City publishes it) |

| `scripts/_common.py` | Shared helpers for the series extractors: `fetch` (optional `CIVIC_CACHE`), Open Data `package`/`resource`, `statcan_table` (full-table CSV zip), `source`/`series`/`point`, `city_population`, and Toronto's Dashboard helpers (`dashboard_series`, `dashboard_annual`) |
| `lib/types.ts` → `Series` | The common shape for trend data: `{id, label, unit, geography?, points[{period, value, note?}], source, inputs?, note?}`. `note` on a point marks an incomplete/carried-over period (drawn faded); `inputs` cites extra files a derived value used (e.g. population for per-100k) |
| `components/TrendChart.tsx` (client) + `components/SeriesCard.tsx` (server) | The chart every series section uses: bars or lines, one axis, hover tooltip, legend for ≥2 series, table view. SeriesCard adds title/blurb/geography/notes and merges citations that share a file. Formatters live in `lib/chart-format.ts` (server-safe). Palette: `--s1…--s6` in globals.css (dataviz dark steps, validated) |
| `components/SectionParts.tsx` | `Shell`, `Header`, `SectionTitle`, `KeyFigures`, `latest()` (last complete point), `at`, `show`, `change` |
| `app/housing`, `app/crime`, `app/road-safety`, `app/transit`, `app/people` | Series pages over `lib/<name>.json`. People also has `CensusTable` (each census value cites its own file + rows) |
| `app/schools`, `app/schools/[id]` | Board trends (summed enrolment; median school's test %), `SchoolFinder` (client search over the index), and ~830 static school pages from `lib/schools-detail.json` (~2MB, server-only) |
| `app/promises`, `app/promises/[campaign]`, `components/PromiseParts.tsx` | Campaign promises: overview with a status tally per campaign, and a page per campaign (promises grouped by status, each with its quote, summary and evidence links; a "Not assessed" list). Status labels/colours/definitions in `lib/promises.ts` (`STATUS`) |
| `app/council`, `app/council/[term]`, `components/CouncilTerm.tsx` | Per term: votes, carried/unanimous/close, member table (missed, with majority, with the mayor, attendance), 25 closest votes with roll calls |

Adding a dataset: a generator script under `scripts/` that records sources, its JSON + typed accessor in `lib/`, source-required types in `lib/types.ts`, a page under `app/`, a tile in `SECTIONS`, and `<PageNav />` at the top of the page.

## Data notes

- Turnout = Number Voted ÷ Total Eligible Electors from each voter-statistics file's Grand Total row. The file's own "% Voted" is shown alongside (it's often rounded, and from 2022 counts declined ballots).
- Mayoral votes = each candidate's ward "Total" cells summed across ward sheets.
- Budget: approved operating budget files, gross. Revenues are stored negative in the City's files; the extractor flips them. Category names change across years (e.g. "Property Tax" in 2014–15, later under "Other Revenue › Taxation"), so each year shows the City's own labels. From 2022 revenue exceeds expenses by ~$1B; the extractor measures that the whole difference sits in Toronto Water / Solid Waste / Parking Authority (`gap.explained`) and the page says so without guessing why.
- Comparable groups: `lib/budget-crosswalk.json` is hand-maintained. Rules apply in order, first match wins, matching on program / service / category / sub-category. Every rule states its basis (`files`, `sum`, `document` with the figure and a quote, or `judgment`, said as such) and why. `extract_budget.py` aborts if a row matches no rule, a year's groups don't sum to its file, or a document figure is >0.1% off the file. When a new year's file adds or renames a category, the extractor will stop: add a rule with evidence, never a guess. Sub-category names are the stable key across the 2019+ regroupings. Property tax: "Property Tax" program (2014–15), service (2016–17), then "Non-Program Taxation Tax Levy" (2018+, tied to the annual Tax Levy By-law totals).
- Program pages go three levels deep from 2019 (Category › Sub-Category › Commitment item, the City's finest accounting line); `Lines` skips single-child levels that would repeat their parent. Line names are the City's abbreviations, shown as written. There is no headcount/FTE data in the budget files, and no City-wide staffing dataset on Open Data (police is the exception: `toronto-police-staffing-by-command`, `police-annual-statistical-report-personnel-by-rank`).
- Context: per resident = amount ÷ StatCan July 1 population for that year; "after inflation" uses the Toronto CMA annual CPI, expressed in the latest full CPI year's dollars. Years StatCan hasn't published (e.g. 2026) show n/a. Unit costs = program budget ÷ an actual service volume — approximate (plan vs actual; programs do more than the counted service), and each card says so. MBNCanada open data is Toronto-only and ends 2020; program pages show the budget year or the nearest year, labelled. MBN results are formatted as $ only when the measure name says "Cost" and % only when it starts with "Percent". Data quirks: the fire resource labelled "2011-2018" holds only 2011 (per-year files are used); fire incidents jump in 2022 in the City's data.
- Names are shown as the City lists them (surname first) plus a "Given Surname" form, reordered only when unambiguous (comma, or exactly two words).

- Toronto's Dashboard (`toronto-s-dashboard-key-indicators`) is a City dataset of ~56 indicators that divisions/agencies report; each row names its origin in `data_source_notes` (TTC, Toronto Real Estate Board, StatCan LFS, Daily Bread…), which goes into the locator. Measure names carry trailing spaces — match on `.strip()`. Rates (`value_type` p) are fractions → ×100.
- StatCan rents/starts/income are the Toronto **CMA** (labelled "Toronto region"); population is the City (CD 3520). Never mix the two silently — set `geography`.
- Council: a vote = rows sharing date/time, agenda item, motion type, vote description and result; duplicates are split when a member repeats. Every vote's Yes/No count must match its own Result tally (the extractor aborts otherwise — all 17,681 match). The 2006–2010 file only covers 2008–2010. Mayors come from elections.json winners in the term window. The 2018 file has double-encoded UTF-8 ("BailÃ£o"), repaired only where that pattern appears. Per-item links to the City's council site aren't used: they 403 for automated checks, so they couldn't be verified.
- Crime: the TPS file counts every reported offence, including unfounded ones and ones outside the City. Homicide/collision dates are epoch ms.
- Schools: percentages arrive as "87 %", 0.87 or 87 depending on file and column (see `column_mode`). 2019–20 and 2020–21 repeat 2018–19 EQAO results (sheet names say "EQAO1819") and are marked. 2020–21 school rows sum ~⅓ lower and list no virtual schools — shown as the file gives it. Codes (N/R, N/D, SP) are shown as published; their definitions are in the Ministry glossary, not the dataset.
- Census (People): 2001–2016 from Neighbourhood Profiles' "City of Toronto" column; 2021 from Ward Profiles' "Toronto" column (the 2021 neighbourhood file has no City column). Rows are pinned by id **and** exact label in `CENSUS` — a re-published file that shifts rows aborts the run.
- Shelter system (Housing): from `daily-shelter-overnight-service-occupancy-capacity`, one file per year (2021–) plus the current-year file; one row per program per night. Monthly values = average night (counts) or occupied ÷ actual capacity over the month (occupancy). The 2021/2022 files write dates YY-MM-DD; each file must hold only its own year or the run aborts. The 2017–2020 predecessor (`daily-shelter-occupancy`) is no longer on Open Data. Multi-file series cite the current file and list the rest via `inputs`, which SeriesCard shows as a compact "Combined with" line.
- TTC Operating Statistics pages (ttc.ca, 2014–) are parsed from HTML; station counts are skipped (counting method changes year to year).

- TOday: every answer is **computed** in `lib/today.ts` from the generated datasets, never typed, and carries its source files plus a "how it was worked out" line. Building the module throws if an answer leaves its level's range (a data refresh that breaks a question stops the build). Questions say their year explicitly and use the latest complete period, so answers move when data is refreshed. The day's pick runs in the browser: `LAUNCH` (app/today/page.tsx) is game #1, the date is Toronto's, and each level is a queue shuffled by a hash of question ids, replayed from day 1, with no topic or area (the section the question links to) twice in a day. Adding, removing or renaming a question reshuffles future days. Guesses and streaks are in localStorage only. Keep questions to headline figures (totals, shares, changes, per-resident), never single votes or single schools.

- Sports: only leagues with an official, openly readable source are generated — MLB Stats API (Jays: standings, postseason series), NHL Records (Leafs since 1917–18, incl. Arenas/St. Patricks), MLS Stats API (TFC: standings, Cup Playoffs matches). nba.com/wnba.com refuse scripted access (don't get around that). **Raptors and Tempo come from ESPN's public site API — the one stated exception to the original-source rule (user decision, 2026-11-01)**: `secondarySource: "ESPN"` puts a "Source: ESPN, not the league" note on every page of those teams, and every citation's publisher reads "ESPN (not the league)". Seasons: ESPN standings + the team's postseason (type 3) / play-in (type 5) schedule; players: everyone in any regular-season box score, with numbers from ESPN's per-player season totals for that team only (ESPN's box scores have gaps — summing them came out ~5% short — so they're used only to find who played). ESPN's standings and game results disagree for some seasons (e.g. 1999–2000); those rows show the standings with a note giving both. The CFL API needs a key (api.cfl.ca/key-request, which didn't respond as of 2026-11-02), so the Argonauts show "not available"; so do the Sceptres (PWHL: licensed stats provider, no ESPN coverage) and the Rock (NLL: third-party stats app; ESPN has only the current season). Playoff results use the league's own round names; where an old MLS file leaves a round unnamed the text says only what the file supports. A drawn MLS final is decided by `result_penalty` from the match record. Player records: MLB = each season's fullSeason roster hydrated with yearByYear hitting/pitching stats, counting only team-141 splits (ERA and AVG recomputed from the summed parts); NHL = stats API franchise totals plus per-season rows (for seasons and playoff counts); MLS = per-season club player stats summed. Rate columns carry a `qualify` minimum (sorted last below it) and `asc` where lower is better. Seasons in progress show only "In progress" (no record) and are excluded from every player total, team-wins and playoff count (`flags_of` drops them; NHL queries cap `seasonId` at the last completed season). Refresh once a year after each season: rerun the script with CIVIC_CACHE pointing at an empty dir, check, commit. Each leaderboard: Seasons, GP, Wins, Playoffs + three sport stats, with short headers (HR, AVG, IP, K, SV%, SO, GA/GP…) and the full name in `title` (hover). **Wins = regular-season games the player played that the team won** (user's definition, 2026-11-02), from game-level data: MLB per-game logs (`stats=gameLog`, `isWin`), NHL per-game skater/goalie rows joined to team per-game results on gameId, MLS lineups (`starting`) + substitution key_events joined to match scores, ESPN box scores (a line with minutes) joined to the game winner. Seasons and playoffs are per table (a skater's seasons never leak into his goalie row — the Red Horner bug). `group()` aborts on impossible rows (playoffs > seasons, GP < seasons, wins > GP). Seasons display by starting year ("2009 to 2017"). `group()` strips row fields the table doesn't show. No salaries: none of these leagues publishes them in its data.
- Program comparable groups: `extract_budget.py` also runs each program's rows through the crosswalk (`comparable` in budget-programs.json, sums checked, document figures checked only city-wide), which powers the "Comparable across years" view on program pages (e.g. Police salaries and benefits 2014–2026 across the 2021 Salaries/Benefits split).

## Gotcha: dropped spaces in JSX text

In a few places a space right after `{expr}` or `</em>` inside JSX text was missing from the rendered HTML (e.g. "The 2015file"), despite being in the source. When a sentence mixes text and expressions, write the space as `{" "}` and check the rendered page (`curl … | sed 's/<!-- -->//g'`).

## Styling

Inline `style={{}}` with CSS variables from `app/globals.css` (`--surface`, `--surface-2`, `--border`, `--text-primary`, `--text-secondary`, `--blue`, and `--revenue`/`--expense` — dataviz palette slots validated on `--surface`). Charts are hand-built (no chart library): thin bars, 4px rounded tops, recessive grid, hover tooltip, and a table view for every chart.
