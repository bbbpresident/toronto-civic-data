"""
Rebuilds lib/crime.json and lib/roads.json from Toronto Police Service and City data on Open Data.

  crime.json   reported crimes by category and subtype with the number cleared (2014–), per 100,000
               residents (StatCan population), and homicides by type (2004–)
  roads.json   people killed or seriously injured in collisions (City Transportation Services, 2006–),
               and all police-reported collisions by type (2014–)

    .venv/bin/python scripts/extract_safety.py
"""
import csv, io, os, sys
from collections import Counter, defaultdict
from datetime import datetime, timezone
from _common import city_population, fetch, open_data_source, package, point, resource, series, write, TODAY

LIB = os.path.join(os.path.dirname(__file__), "..", "lib")
MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]


def csv_iter(url):
    return csv.DictReader(io.StringIO(fetch(url).decode("utf-8-sig", errors="replace")))


def through(d):
    return f"Year to date (through {MONTHS[d.month - 1]} {d.day})"


def per_100k(counts, pop, partial=None):
    return [point(y, counts[y] / pop[y] * 100000 if y in pop else None, partial if partial and y == max(counts) else None) for y in sorted(counts)]


# ── Crime ────────────────────────────────────────────────────────────────────

def crime(pop, pop_src):
    pkg = package("police-annual-statistical-report-reported-crimes")
    url = resource(pkg, "Reported Crimes")["url"]
    count, cleared = Counter(), Counter()
    cat_count, cat_cleared = defaultdict(Counter), defaultdict(Counter)
    sub = defaultdict(lambda: defaultdict(lambda: [0, 0]))
    for r in csv_iter(url):
        y, n, c = int(r["REPORT_YEAR"]), int(float(r["COUNT_"])), int(float(r["COUNT_CLEARED"] or 0))
        count[y] += n; cleared[y] += c
        cat_count[r["CATEGORY"]][y] += n; cat_cleared[r["CATEGORY"]][y] += c
        sub[(r["CATEGORY"], r["SUBTYPE"])][y][0] += n
        sub[(r["CATEGORY"], r["SUBTYPE"])][y][1] += c
    years = sorted(count)
    if years[-1] >= TODAY.year:
        sys.exit(f"Reported crimes include {years[-1]}, a year not yet over — handle a partial year before publishing")
    loc = "All rows"
    note = "The Police Service's file counts every reported offence, including reports later deemed unfounded and offences outside City limits."
    src = lambda method, locator=loc: open_data_source(pkg, url, locator, method)
    out = {}
    out["reported"] = series("reported", "Reported crimes", "count", [point(y, count[y]) for y in years], src("Sum of COUNT_ for each REPORT_YEAR."), note=note)
    out["reportedPer100k"] = series("reportedPer100k", "Per 100,000 residents", "count", per_100k(count, pop),
                                    src("Sum of COUNT_ for each REPORT_YEAR ÷ that year's July 1 population × 100,000."), note=note, inputs=[pop_src])
    out["clearanceRate"] = series("clearanceRate", "Share cleared", "percent", [point(y, cleared[y] / count[y] * 100) for y in years],
                                  src("Sum of COUNT_CLEARED ÷ sum of COUNT_ for each REPORT_YEAR."), note=note)
    cats = sorted(cat_count, key=lambda c: -sum(cat_count[c].values()))
    for i, c in enumerate(cats):
        out[f"cat{i}"] = series(f"cat{i}", c, "count", [point(y, cat_count[c][y]) for y in years], src("Sum of COUNT_ for each REPORT_YEAR.", f'CATEGORY = "{c}"'))
        out[f"catCleared{i}"] = series(f"catCleared{i}", c, "percent", [point(y, cat_cleared[c][y] / cat_count[c][y] * 100 if cat_count[c][y] else None) for y in years],
                                       src("Sum of COUNT_CLEARED ÷ sum of COUNT_ for each REPORT_YEAR.", f'CATEGORY = "{c}"'))
    subtypes = [{"category": c, "subtype": s, "years": {str(y): v for y, v in sorted(by.items())}} for (c, s), by in sub.items()]
    subtypes.sort(key=lambda x: (cats.index(x["category"]), -x["years"].get(str(years[-1]), [0])[0]))
    sub_src = src("Sum of COUNT_ and of COUNT_CLEARED for each CATEGORY, SUBTYPE and REPORT_YEAR.")

    # Homicides
    hpkg = package("police-annual-statistical-report-homicide")
    hurl = resource(hpkg, "Homicides")["url"]
    by_type = defaultdict(Counter)
    last = None
    for r in csv_iter(hurl):
        d = datetime.fromtimestamp(int(float(r["OCC_DATE"])) / 1000, tz=timezone.utc)  # epoch ms, UTC per the dataset notes
        by_type[r["HOMICIDE_TYPE"]][int(r["OCC_YEAR"])] += 1
        last = d if last is None or d > last else last
    hyears = sorted({y for c in by_type.values() for y in c})
    partial = through(last) if last.year == TODAY.year else None
    hsrc = lambda locator, method: open_data_source(hpkg, hurl, locator, method)
    for t in sorted(by_type, key=lambda t: -sum(by_type[t].values())):
        out[f"homicide{t}"] = series(f"homicide{t}", t, "count",
                                     [point(y, by_type[t][y], partial if y == TODAY.year else None) for y in hyears],
                                     hsrc(f'HOMICIDE_TYPE = "{t}"', "Rows counted per OCC_YEAR (one row per homicide)."))
    total = Counter({y: sum(by_type[t][y] for t in by_type) for y in hyears})
    out["homicides"] = series("homicides", "Homicides", "count", [point(y, total[y], partial if y == TODAY.year else None) for y in hyears],
                              hsrc("All rows", "Rows counted per OCC_YEAR (one row per homicide)."))
    out["homicidesPer100k"] = series("homicidesPer100k", "Per 100,000 residents", "count",
                                     [point(y, total[y] / pop[y] * 100000 if y in pop and y != TODAY.year else None) for y in hyears],
                                     hsrc("All rows", "Rows counted per OCC_YEAR ÷ that year's July 1 population × 100,000. The current, incomplete year is left out."),
                                     inputs=[pop_src])
    write(os.path.join(LIB, "crime.json"), {"series": out, "categories": cats, "subtypes": subtypes, "subtypeSource": sub_src}, "scripts/extract_safety.py")


# ── Road safety ──────────────────────────────────────────────────────────────

ROAD_USERS = [("pedestrian", "Pedestrians"), ("cyclist", "Cyclists"), ("motorcyclist", "Motorcyclists"), ("driver", "Drivers"), ("passenger", "Passengers")]


def roads(pop, pop_src):
    pkg = package("motor-vehicle-collisions-involving-killed-or-seriously-injured-persons")
    url = resource(pkg, "Motor Vehicle Collisions with KSI Data")["url"]
    killed, serious = Counter(), Counter()
    by_user = defaultdict(Counter)
    last = None
    for r in csv_iter(url):
        d = datetime.fromisoformat(r["accdate"][:19])
        last = d if last is None or d > last else last
        y = d.year
        if r["injury"] == "Fatal":
            killed[y] += 1
        elif r["injury"] == "Major":
            serious[y] += 1
        else:
            continue
        user = r["road_user"]
        by_user[user if user in dict(ROAD_USERS) else "other"][y] += 1
    years = sorted(set(killed) | set(serious))
    partial = through(last) if last.year == TODAY.year else None
    pn = lambda y: partial if y == TODAY.year else None
    src = lambda locator, method: open_data_source(pkg, url, locator, method)
    note = ("One row per person involved in a collision where someone was killed or seriously injured, on the City's right-of-way. "
            "Killed = injury \"Fatal\"; seriously injured = injury \"Major\".")
    out = {}
    out["killed"] = series("killed", "Killed", "count", [point(y, killed[y], pn(y)) for y in years], src('injury = "Fatal"', "People (rows) counted per year of accdate."), note=note)
    out["seriouslyInjured"] = series("seriouslyInjured", "Seriously injured", "count", [point(y, serious[y], pn(y)) for y in years], src('injury = "Major"', "People (rows) counted per year of accdate."), note=note)
    out["killedPer100k"] = series("killedPer100k", "Killed per 100,000 residents", "count",
                                  [point(y, killed[y] / pop[y] * 100000 if y in pop and y != TODAY.year else None) for y in years],
                                  src('injury = "Fatal"', "People counted per year ÷ that year's July 1 population × 100,000. The current, incomplete year is left out."), inputs=[pop_src])
    for key, label in ROAD_USERS + [("other", "Other")]:
        out[f"ksi_{key}"] = series(f"ksi_{key}", label, "count", [point(y, by_user[key][y], pn(y)) for y in years],
                                   src(f'injury in ("Fatal", "Major"); road_user = {"one of other, owner, other_micromobility" if key == "other" else repr(key)}',
                                       "People (rows) counted per year of accdate."), note=note)

    # All police-reported collisions (2014–)
    cpkg = package("police-annual-statistical-report-traffic-collisions")
    curl = resource(cpkg, "Traffic Collisions")["url"]
    kinds = {"total": Counter(), "injury": Counter(), "fatal": Counter(), "ftr": Counter(), "pd": Counter(), "pedestrian": Counter(), "bicycle": Counter()}
    clast = None
    for r in csv_iter(curl):
        if not r["OCC_YEAR"]:
            continue
        y = int(float(r["OCC_YEAR"]))
        if r["OCC_DATE"]:
            d = datetime.fromtimestamp(int(float(r["OCC_DATE"])) / 1000, tz=timezone.utc)  # epoch ms
            clast = d if clast is None or d > clast else clast
        kinds["total"][y] += 1
        if r["INJURY_COLLISIONS"] == "YES": kinds["injury"][y] += 1
        if (r["FATALITIES"] or "0").strip() not in ("", "0"): kinds["fatal"][y] += 1
        if r["FTR_COLLISIONS"] == "YES": kinds["ftr"][y] += 1
        if r["PD_COLLISIONS"] == "YES": kinds["pd"][y] += 1
        if r["PEDESTRIAN"] == "YES": kinds["pedestrian"][y] += 1
        if r["BICYCLE"] == "YES": kinds["bicycle"][y] += 1
    cyears = [y for y in sorted(kinds["total"]) if y >= 2014]
    cpartial = through(clast) if clast and clast.year == TODAY.year else None
    csrc = lambda locator: open_data_source(cpkg, curl, locator, "Occurrences (rows) counted per OCC_YEAR.")
    cnote = "One row per collision occurrence reported to police. A collision can be in more than one category (e.g. injury and fail to remain)."
    labels = {"total": ("All collisions", "All rows"), "injury": ("Injury", "INJURY_COLLISIONS = YES"), "fatal": ("Fatal", "FATALITIES ≥ 1"),
              "ftr": ("Fail to remain", "FTR_COLLISIONS = YES"), "pd": ("Property damage", "PD_COLLISIONS = YES"),
              "pedestrian": ("Involving a pedestrian", "PEDESTRIAN = YES"), "bicycle": ("Involving a cyclist", "BICYCLE = YES")}
    for k, (label, locator) in labels.items():
        out[f"collisions_{k}"] = series(f"collisions_{k}", label, "count",
                                        [point(y, kinds[k][y], cpartial if y == TODAY.year else None) for y in cyears], csrc(locator), note=cnote)
    write(os.path.join(LIB, "roads.json"), {"series": out}, "scripts/extract_safety.py")


def main():
    pop, pop_src = city_population()
    print("… crime", file=sys.stderr)
    crime(pop, pop_src)
    print("… road safety", file=sys.stderr)
    roads(pop, pop_src)


if __name__ == "__main__":
    main()
