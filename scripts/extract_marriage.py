"""
Marriage licences (lib/marriage.json): licences issued each month at the City's four civic centres since 2011.

  City of Toronto Open Data: marriage-licence-statistics ("Marriage Licence Statistics" — the resource that runs
  later of the two published; columns CIVIC_CENTRE, MARRIAGE_LICENSES, TIME_PERIOD)
"""
import collections, os, sys

sys.path.insert(0, os.path.dirname(__file__))
from _common import csv_rows, open_data_source, package, point, ranking, resource, series, write, year_to_date_note

PKG = "marriage-licence-statistics"
OUT = os.path.join(os.path.dirname(__file__), "..", "lib", "marriage.json")
CENTRES = {"TO": "Toronto City Hall", "NY": "North York", "SC": "Scarborough", "ET": "Etobicoke"}
MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]


def main():
    pkg = package(PKG)
    res = resource(pkg, "Marriage Licence Statistics.csv")
    rows = csv_rows(res["url"])
    unknown = {r["CIVIC_CENTRE"] for r in rows} - set(CENTRES)
    if unknown:
        sys.exit(f"marriage: unknown civic centres {unknown}")
    by_month, by_centre_year = collections.Counter(), collections.Counter()
    for r in rows:
        by_month[r["TIME_PERIOD"]] += int(r["MARRIAGE_LICENSES"])
        by_centre_year[(r["CIVIC_CENTRE"], r["TIME_PERIOD"][:4])] += int(r["MARRIAGE_LICENSES"])
    months = sorted(by_month)
    last = months[-1]
    years = sorted({m[:4] for m in months})
    ly, lm = last[:4], int(last[5:])
    ytd = year_to_date_note(lm) if lm < 12 else None
    yearly = lambda y: sum(v for m, v in by_month.items() if m[:4] == y)
    src = lambda what, how: open_data_source(pkg, res["url"], what, how)
    full = [y for y in years if not (y == ly and ytd)]
    S = {
        "yearly": series("yearly", "Marriage licences", "count", [point(y, yearly(y), ytd if y == ly else None) for y in years],
                         src("MARRIAGE_LICENSES, all rows", "Summed per year across the four civic centres.")),
        "monthly": series("monthly", "Marriage licences", "count", [point(m, by_month[m]) for m in months],
                          src("MARRIAGE_LICENSES, all rows", "Summed per month across the four civic centres.")),
        **{f"centre_{c}": series(f"centre_{c}", name, "count", [point(y, by_centre_year[(c, y)], ytd if y == ly else None) for y in years],
                                  src(f"rows with CIVIC_CENTRE = {c}", "Summed per year."))
           for c, name in CENTRES.items()},
    }
    avg_years = [y for y in full if y not in ("2020", "2021")]
    avg = {i: sum(by_month.get(f"{y}-{i:02d}", 0) for y in avg_years) / len(avg_years) for i in range(1, 13)}
    R = {
        "seasons": ranking("seasons", f"An average month, {avg_years[0]}–{avg_years[-1]} (not counting 2020 and 2021)", "count",
                           [{"label": MONTHS[i - 1], "value": round(avg[i])} for i in range(1, 13)],
                           src("MARRIAGE_LICENSES, all rows", f"Each calendar month's total averaged over {', '.join(avg_years)}; 2020 and 2021 (the first years of the COVID-19 pandemic) are left out: both were far below every other year.")),
        "busiest": ranking("busiest", "Busiest months on record", "count",
                           [{"label": f"{MONTHS[int(m[5:]) - 1]} {m[:4]}", "value": v} for m, v in sorted(by_month.items(), key=lambda kv: -kv[1])[:8]],
                           src("MARRIAGE_LICENSES, all rows", "Monthly totals across the four civic centres, highest first.")),
    }
    write(OUT, {"lastMonth": last, "centres": CENTRES, "series": S, "ranks": R}, "scripts/extract_marriage.py")


if __name__ == "__main__":
    main()
