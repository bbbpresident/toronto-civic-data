"""
How much people make (lib/income.json), from four official sources:

  Ontario Treasury Board Secretariat: Public Sector Salary Disclosure ("Sunshine List") — everyone paid $100,000 or
    more by an Ontario public-sector employer. 2011–2020 from data.ontario.ca (one package per year), 2021 on from
    ontario.ca (its file index, pssdfiles.json). Only employers named "City of Toronto …" (the City and its agencies:
    TTC, Police, Toronto Community Housing, the Library…). Shown by employer and job title — never by name.
  Employment and Social Development Canada: Job Bank wages ("Wages" on open.canada.ca), Toronto economic region
    (ER3530), for a set of common occupations (JOBS).
  Statistics Canada: tables 11-10-0073-01 (wages, salaries and commissions of tax filers by industry) and
    11-10-0072-01 (by age group and sex), geography "Toronto, Ontario".
  City of Toronto Open Data: neighbourhood-profiles (2021 census): median household income and low-income rates.
"""
import collections, csv, io, json, os, re, statistics, sys

sys.path.insert(0, os.path.dirname(__file__))
from _common import STATCAN, fetch, open_data_source, package, point, ranking, series, source, statcan_source, statcan_table, write

OUT = os.path.join(os.path.dirname(__file__), "..", "lib", "income.json")
PSSD_INDEX = "https://www.ontario.ca/public-sector-salary-disclosure_artifacts/pssdfiles.json"
PSSD_PAGE = "https://www.ontario.ca/page/public-sector-salary-disclosure"
TBS = "Government of Ontario — Treasury Board Secretariat"
FIRST_YEAR = 2011
# Employer name (after "City of Toronto –") → group shown
GROUPS = [("toronto transit commission", "TTC"), ("police", "Toronto Police"), ("community housing", "Toronto Community Housing"),
          ("public library", "Toronto Public Library")]
JOBS = ["31301", "21232", "72200", "72300", "72310", "63200", "64100", "65100", "65201", "41221", "41220", "42100", "42101", "73301", "73300",
        "11100", "41101", "31120", "32111", "42202", "13110", "75110", "63210", "32102", "33102", "62200", "65312", "21233", "41300", "12200"]


def ckan_ontario(name):
    r = json.loads(fetch(f"https://data.ontario.ca/api/3/action/package_show?id={name}"))
    if not r.get("success"):
        sys.exit(f"income: data.ontario.ca package {name} missing")
    return r["result"]


def rows_csv(url):
    raw = fetch(url)
    for enc in ("utf-8-sig", "cp1252", "latin-1"):
        try:
            return list(csv.DictReader(io.StringIO(raw.decode(enc))))
        except UnicodeDecodeError:
            continue


def col(row, *words):
    """The first column whose (lowercased) name contains every word."""
    for k in row:
        if k and all(w in k.lower() for w in words):
            return k
    return None


def money(v):
    v = re.sub(r"[^\d.\-]", "", v or "")
    try:
        return float(v)
    except ValueError:
        return None


def group_of(employer):
    e = employer.lower()
    if re.match(r"\s*toronto community housing", e):  # 2011 lists it without the "City of Toronto" prefix
        return "Toronto Community Housing"
    if not re.match(r"\s*city of toronto", e):
        return None
    rest = re.sub(r"^\s*city of toronto\s*[-–—]?\s*", "", e)
    if not rest:
        return "City of Toronto"
    return next((g for k, g in GROUPS if k in rest), "Other City agencies and boards")


def sunshine():
    idx = json.loads(fetch(PSSD_INDEX))
    files = []
    for y in range(FIRST_YEAR, 2021):
        pkg = ckan_ontario(f"public-sector-salary-disclosure-{y}")
        res = next((r for r in pkg["resources"] if r["name"].startswith("All sectors") and r["url"].split("/")[-1].startswith("en")), None)
        if res:
            files.append((y, res["url"], {"publisher": TBS, "dataset": pkg["title"], "datasetUrl": f"https://data.ontario.ca/dataset/{pkg['name']}"}))
    for y in sorted(idx, key=int):
        if int(y) >= 2021 and "Compendium" in idx[y] and "csv" in idx[y]["Compendium"].get("en", {}):
            files.append((int(y), "https://www.ontario.ca" + idx[y]["Compendium"]["en"]["csv"],
                          {"publisher": TBS, "dataset": f"Public sector salary disclosure {y}", "datasetUrl": PSSD_PAGE}))
    by_year = {}
    for y, url, meta in files:
        rows = rows_csv(url)
        emp, sal, title = col(rows[0], "employer"), col(rows[0], "salary"), col(rows[0], "title")
        people = []
        for r in rows:
            g = group_of(r[emp] or "")
            s = money(r[sal])
            if g and s:
                people.append((g, s, re.sub(r"\s+", " ", (r[title] or "").strip())))
        by_year[y] = (people, url, meta)
        print(f"income: sunshine {y}: {len(people):,} City of Toronto employees", file=sys.stderr)
    years = sorted(by_year)
    latest = years[-1]
    people, lurl, lmeta = by_year[latest]
    src_l = lambda what, how: source(lmeta["publisher"], lmeta["dataset"], lmeta["datasetUrl"], lurl, what, how)
    inputs = [source(m["publisher"], m["dataset"], m["datasetUrl"], u, f"{y}: rows whose Employer begins 'City of Toronto'", "Counted as described.")
              for y, (p, u, m) in by_year.items() if y != latest]
    note = "The $100,000 threshold has been the same since 1996 and isn't adjusted for inflation, so more people cross it every year just from raises."
    group_names = ["City of Toronto", "TTC", "Toronto Police", "Toronto Community Housing", "Toronto Public Library", "Other City agencies and boards"]
    count = lambda y, g=None: sum(1 for p in by_year[y][0] if g is None or p[0] == g)
    S = {
        "sunTotal": series("sunTotal", "City employees paid $100,000+", "count", [point(y, count(y)) for y in years],
                           src_l("rows whose Employer begins 'City of Toronto' (the City and its agencies and boards), plus Toronto Community Housing, listed without the prefix in 2011", "Rows counted per year's file."), note=note, inputs=inputs),
        **{f"sun_{i}": series(f"sun_{i}", g, "count", [point(y, count(y, g)) for y in years],
                              src_l(f"Employer group: {g}", "Rows counted per year's file, grouped by employer name."), inputs=inputs)
           for i, g in enumerate(group_names)},
        "sunMedian": series("sunMedian", "Median salary of those on the list", "dollars", [point(y, round(statistics.median(p[1] for p in by_year[y][0]))) for y in years],
                            src_l("Salary paid, rows whose Employer begins 'City of Toronto'", "Median per year of everyone listed (all $100,000+)."), note=note, inputs=inputs),
    }
    titles = collections.defaultdict(list)
    for g, s, t in people:
        titles[t.title() if t.isupper() else t].append(s)
    bins = [(100_000, 125_000), (125_000, 150_000), (150_000, 200_000), (200_000, 300_000), (300_000, None)]
    R = {
        "sunEmployers": ranking("sunEmployers", f"Who's on the list, {latest}", "count",
                                [{"label": g, "value": count(latest, g)} for g in sorted(group_names, key=lambda g: -count(latest, g))],
                                src_l("Employer, rows beginning 'City of Toronto'", "Rows counted per employer group.")),
        "sunTitles": ranking("sunTitles", f"Most common job titles on the list, {latest}", "count",
                             [{"label": t, "value": len(v), "sub": f"median ${statistics.median(v):,.0f}"} for t, v in sorted(titles.items(), key=lambda kv: -len(kv[1]))[:15]],
                             src_l("Job Title and Salary paid, City of Toronto employers", "Rows counted per job title as written; median salary of each.")),
        "sunTop": ranking("sunTop", f"Best-paid job titles, {latest} (titles held by 5 or more people)", "dollars",
                          [{"label": t, "value": round(statistics.median(v)), "sub": f"{len(v)} people"} for t, v in sorted(((t, v) for t, v in titles.items() if len(v) >= 5), key=lambda kv: -statistics.median(kv[1]))[:12]],
                          src_l("Job Title and Salary paid, City of Toronto employers", "Median salary per job title, for titles held by at least 5 people (so no one person is singled out).")),
        "sunBands": ranking("sunBands", f"How far over $100,000, {latest}", "count",
                            [{"label": f"${lo // 1000}K to ${hi // 1000}K" if hi else f"${lo // 1000}K and up", "value": sum(1 for p in people if p[1] >= lo and (hi is None or p[1] < hi))} for lo, hi in bins],
                            src_l("Salary paid, City of Toronto employers", "People counted per salary band.")),
    }
    return S, R, latest


def jobbank():
    pkg = json.loads(fetch("https://open.canada.ca/data/api/3/action/package_show?id=adad580f-76b0-4502-bd05-20c125de9116"))["result"]
    res = pkg["resources"][0]
    rows = rows_csv(res["url"])
    tor = {r["NOC_CNP"].replace("NOC_", ""): r for r in rows if r["ER_Code_Code_RE"] == "ER3530"}
    picked = [tor[c] for c in JOBS if c in tor and money(tor[c]["Median_Wage_Salaire_Median"]) and tor[c]["Annual_Wage_Flag_Salaire_annuel"] != "1"]
    picked.sort(key=lambda r: -money(r["Median_Wage_Salaire_Median"]))
    name = res["name"]["en"] if isinstance(res["name"], dict) else res["name"]
    src = source("Employment and Social Development Canada — Job Bank", f"Wages ({name})", "https://open.canada.ca/data/en/dataset/adad580f-76b0-4502-bd05-20c125de9116", res["url"],
                 "rows with ER_Code_Code_RE = ER3530 (Toronto economic region), selected NOC codes",
                 "Median_Wage_Salaire_Median as published (hourly), with Low and High wages; each row's data source and reference period shown.")
    fmt = lambda v: f"${money(v):,.2f}"
    return ranking("jobs", "What common jobs pay, per hour (median)", "dollars",
                   [{"label": r["NOC_Title_eng"], "value": money(r["Median_Wage_Salaire_Median"]),
                     "sub": f"{fmt(r['Low_Wage_Salaire_Minium'])} low to {fmt(r['High_Wage_Salaire_Maximal'])} high · {r['Data_Source_E']}, {r['Reference_Period']}"} for r in picked],
                   src)


def statcan():
    S, R = {}, {}
    rows, url, turl, title = statcan_table("11100073")
    tor = [r for r in rows if r["GEO"] == "Toronto, Ontario"]
    stat = "Median wages, salaries and commissions"
    ind = [r for r in tor if r["Statistics"] == stat and r["VALUE"]]
    years = sorted({r["REF_DATE"] for r in ind})
    ly = years[-1]
    sex_col = next((k for k in tor[0] if k.lower() in ("sex", "gender")), None)  # this table has none (it gives % male / % female instead)
    both = lambda r: sex_col is None or r[sex_col] in ("Both sexes", "Total - Gender", "Total, all persons")
    allind = {r["REF_DATE"]: float(r["VALUE"]) for r in ind if r["Main industry based on the North American Industry Classification System (NAICS)"] == "All industries" and both(r)}
    src = lambda what, how: statcan_source("11100073", url, turl, title, what, how)
    S["wageMedian"] = series("wageMedian", "Median wages, salaries and commissions", "dollars", [point(y, allind.get(y)) for y in years],
                             src(f"GEO = Toronto, Ontario; All industries; {stat}", "As published."), geography="Toronto, Ontario (Statistics Canada)")
    latest_ind = [(r["Main industry based on the North American Industry Classification System (NAICS)"], float(r["VALUE"])) for r in ind
                  if r["REF_DATE"] == ly and both(r) and r["Main industry based on the North American Industry Classification System (NAICS)"] not in ("All industries", "Not available")]
    R["industries"] = ranking("industries", f"Median pay by industry, {ly}", "dollars", [{"label": re.sub(r"\s*\[\d+\]$", "", n), "value": round(v)} for n, v in sorted(latest_ind, key=lambda x: -x[1])],
                              src(f"GEO = Toronto, Ontario; {stat}; each industry; {ly}", "As published: the median of wages, salaries and commissions among tax filers who had any."))
    rows, url, turl, title = statcan_table("11100072")
    tor = [r for r in rows if r["GEO"] == "Toronto, Ontario" and r["Statistics"] == stat and r["VALUE"]]
    sex_col = next(k for k in tor[0] if k.lower() in ("sex", "gender"))
    src2 = lambda what, how: statcan_source("11100072", url, turl, title, what, how)
    ly2 = max(r["REF_DATE"] for r in tor)
    ages = [(r["Age group"], float(r["VALUE"])) for r in tor if r["REF_DATE"] == ly2 and r[sex_col] == "Both sexes" and r["Age group"] != "Ages 15 years and over"]
    R["ages"] = ranking("ages", f"Median pay by age, {ly2}", "dollars", [{"label": a, "value": round(v)} for a, v in ages],
                        src2(f"GEO = Toronto, Ontario; Both sexes; {stat}; each age group; {ly2}", "As published."))
    for sx, key in (("Males", "wageMen"), ("Females", "wageWomen")):
        pts = {r["REF_DATE"]: float(r["VALUE"]) for r in tor if r[sex_col] == sx and r["Age group"] == "Ages 15 years and over"}
        S[key] = series(key, "Men" if sx == "Males" else "Women", "dollars", [point(y, pts.get(y)) for y in sorted(pts)],
                        src2(f"GEO = Toronto, Ontario; {sx}; Ages 15 years and over; {stat}", "As published."), geography="Toronto, Ontario (Statistics Canada)")
    return S, R


def neighbourhoods():
    import openpyxl
    npkg = package("neighbourhood-profiles")
    nres = next(r for r in npkg["resources"] if "2021" in r["name"] and r["format"].upper() == "XLSX")
    ws = openpyxl.load_workbook(io.BytesIO(fetch(nres["url"])), read_only=True, data_only=True).worksheets[0]
    rows_x = list(ws.iter_rows(values_only=True))
    header = [str(h).strip() if h else "" for h in rows_x[0]]
    def row(label_re):
        hits = [r for r in rows_x if r[0] and re.match(label_re, str(r[0]).strip())]
        if not hits:
            sys.exit(f"income: census row not found: {label_re}")
        return hits[0]
    hh = row(r"^Median total income of household in 2020")
    lim = row(r"^Prevalence of low income based on the Low-income measure, after tax \(LIM-AT\)")
    nb = [(name, float(hh[i]), float(lim[i])) for i, name in enumerate(header) if i and name and name != "City of Toronto" and hh[i] not in (None, "")]
    if len(nb) != 158:
        sys.exit(f"income: expected 158 neighbourhoods, got {len(nb)}")
    src = lambda what, how: open_data_source(npkg, nres["url"], what, how)
    hh_src = src("row 'Median total income of household in 2020 ($)', each neighbourhood", "As published (2021 census, 2020 incomes).")
    lim_src = src("row 'Prevalence of low income based on the Low-income measure, after tax (LIM-AT) (%)', each neighbourhood", "As published (2021 census, 2020 incomes).")
    by_hh = sorted(nb, key=lambda x: -x[1])
    by_lim = sorted(nb, key=lambda x: -x[2])
    R = {
        "richest": ranking("richest", "Highest median household income", "dollars", [{"label": n, "value": v} for n, v, _ in by_hh[:12]], hh_src),
        "poorest": ranking("poorest", "Lowest median household income", "dollars", [{"label": n, "value": v} for n, v, _ in by_hh[::-1][:12]], hh_src),
        "lowIncome": ranking("lowIncome", "Highest share of people in low income", "percent", [{"label": n, "value": l} for n, _, l in by_lim[:12]], lim_src,
                             "Low income here is Statistics Canada's low-income measure after tax (LIM-AT): household income below half the national median, adjusted for household size."),
    }
    return R


def main():
    S, R, sun_year = sunshine()
    R["jobs"] = jobbank()
    s2, r2 = statcan()
    S.update(s2); R.update(r2)
    r3 = neighbourhoods()
    R.update(r3)
    write(OUT, {"sunshineYear": sun_year, "series": S, "ranks": R}, "scripts/extract_income.py")


if __name__ == "__main__":
    main()
