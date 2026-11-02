"""
Rebuilds lib/people.json: who lives in Toronto and how they're doing.

  - population       StatCan July 1 estimates, City of Toronto (2001–)
  - census           five censuses, City-wide: immigrants, visible minorities, renters, seniors, median
                     household income. 2001–2016 from the City's Neighbourhood Profiles ("City of Toronto"
                     column); 2021 from the City's Ward Profiles ("Toronto" column), since the 2021
                     neighbourhood file has no City-wide column. Every value cites its file and row.
  - labour           unemployment / employment / participation rates of City residents (Toronto's Dashboard)
  - income           median total income, Toronto CMA, in constant dollars (StatCan 11-10-0239, 1976–)
  - food bank        people served by Daily Bread Food Bank programs (Toronto's Dashboard)

    .venv/bin/python scripts/extract_people.py
"""
import io, os, sys
import pandas as pd
from _common import (OPEN_DATA, city_population, csv_rows, dashboard_series, fetch, num, package, point, resource, series, source,
                     statcan_source, statcan_table, write)

OUT = os.path.join(os.path.dirname(__file__), "..", "lib", "people.json")

NP_PKG = "neighbourhood-profiles"
WP_PKG = "ward-profiles-25-ward-model"
WP_SHEET = "2021 One Variable"

# Rows are pinned by the file's own row id (Neighbourhood Profiles `_id`; Ward Profiles: 0-based sheet
# row) AND the exact label at that row — if a re-published file shifts, the label check aborts the run.
# Each indicator: list of (year, numerator rows, denominator rows). A row is (id, label). Sums are allowed.
CENSUS = {
    "immigrants": ("Immigrants", "percent", "Share of residents (in private households) who are immigrants.", {
        2006: ([(821, "Immigrants")], [(817, "Total population by immigrant status and place of birth - 20% sample data")]),
        2011: ([(834, "Immigrants")], [(832, "Total population in private households by immigrant status and period of immigration")]),
        2016: ([(1153, "Immigrants")], [(1151, "Total - Immigrant status and period of immigration for the population in private households - 25% sample data")]),
        2021: ([(145, "Immigrants")], [(143, "Total - Immigrant status and period of immigration for the population in private households - 25% sample data")]),
    }),
    "visibleMinority": ("Visible minorities", "percent", "Share of residents (in private households) in a visible minority group, as the census defines it.", {
        2006: ([(904, "Total visible minority population")], [(903, "Total population by visible minority groups - 20% sample data")]),
        2011: ([(997, "Total visible minority population")], [(996, "Total population in private households by visible minority")]),
        2016: ([(1337, "Total visible minority population")], [(1336, "Total - Visible minority for the population in private households - 25% sample data")]),
        2021: ([(1285, "Total visible minority population")], [(1284, "Total - Visible minority for the population in private households - 25% sample data")]),
    }),
    "renters": ("Households that rent", "percent", "Share of private households that rent their home.", {
        2001: ([(726, "Rented")], [(725, "Owned"), (726, "Rented")]),
        2006: ([(1176, "Rented")], [(1174, "Total number of occupied private dwellings by housing tenure - 20% sample data")]),
        2011: ([(1306, "Renter")], [(1304, "Total number of private households by tenure")]),
        2016: ([(1630, "Renter")], [(1628, "Total - Private households by tenure - 25% sample data")]),
        2021: ([(58, "Rented")], [(54, "Total - Tenure (includes band housing)")]),
    }),
    "seniors": ("Aged 65 and over", "percent", "Share of residents aged 65 or older.", {
        2001: ([(19, "65-69"), (20, "70-74"), (21, "75-79"), (22, "80-84"), (23, "85-89"), (24, "90-94"), (25, "95-99"), (26, "100+")], [(5, "Total - Age")]),
        2006: ([(19, "65 to 69 years"), (20, "70 to 74 years"), (21, "75 to 79 years"), (22, "80 to 84 years"), (23, "85 to 89 years"), (24, "90 to 94 years"), (25, "95 to 99 years"), (26, "100 years and over")], [(5, "Total - Age")]),
        2011: ([(28, "65 to 79 years"), (32, "80 to 99 years"), (37, "100 years and over")], [(8, "Total - Age")]),
        2016: ([(14, "Seniors (65+ years)")], [(3, "Population, 2016")]),
        2021: ([(32, "65 to 69 years"), (33, "70 to 74 years"), (34, "75 to 79 years"), (35, "80 to 84 years"), (36, "85 to 89 years"), (37, "90 years and over")], [(18, "Total - Age")]),
    }),
    "medianHouseholdIncome": ("Median household income", "dollars", "Median total income of households, in dollars of the year before each census (the income year). Not adjusted for inflation.", {
        2001: ([(522, "Median household income $")], None),
        2006: ([(576, "Median household income $")], None),
        2016: ([(1019, "Median total income of households in 2015 ($)")], None),
        2021: ([(1384, "Median total income of households in 2020 ($)")], None),
    }),
}
CENSUS_NOTES = {
    "medianHouseholdIncome": "2011 is missing: the City's 2011 profile has household income groups but no median.",
    "immigrants": "2001 is missing: the City's 2001 profile doesn't include immigrant status.",
    "visibleMinority": "2001 is missing: the City's 2001 profile doesn't include visible minority status.",
}


def np_files():
    pkg = package(NP_PKG)
    files = {}
    for y in (2001, 2006, 2011, 2016):
        res = resource(pkg, f"neighbourhood-profiles-{y}-140-model.csv")
        rows = csv_rows(res["url"])
        label_col = "Characteristic" if "Characteristic" in rows[0] else "Attribute"
        files[y] = (pkg, res["url"], {int(r["_id"]): (r[label_col].strip(), r["City of Toronto"]) for r in rows}, label_col)
    return files


def wp_file():
    pkg = package(WP_PKG)
    res = resource(pkg, "2023-WardProfiles-2011-2021-CensusData")
    df = pd.read_excel(io.BytesIO(fetch(res["url"])), sheet_name=WP_SHEET, header=None, dtype=str)
    return pkg, res["url"], {i: (str(df.iat[i, 0]).strip(), df.iat[i, 1]) for i in range(len(df))}


def census(np, wp):
    out = []
    for id, (label, unit, desc, years) in CENSUS.items():
        values = []
        for y, (num_rows, den_rows) in sorted(years.items()):
            if y == 2021:
                pkg, url, table = wp
                where = lambda rid: f"row {rid + 1}"
                col, sheet, ds = 'column B ("Toronto")', WP_SHEET, f"{pkg['title']} — 2021 Census"
            else:
                pkg, url, table, label_col = np[y]
                where = lambda rid: f"_id {rid}"
                col, sheet, ds = 'column "City of Toronto"', None, f"{pkg['title']} — {y} Census"

            def take(rows):
                total = 0.0
                for rid, want in rows:
                    got, val = table.get(rid, (None, None))
                    if got != want:
                        sys.exit(f"census {id} {y}: row {rid} is {got!r}, expected {want!r} — the file changed; re-pin the row")
                    total += num(val)
                return total

            n = take(num_rows)
            d = take(den_rows) if den_rows else None
            value = n / d * 100 if d else n
            fmt = lambda rows: " + ".join(f'{where(r)} "{l}"' for r, l in rows)
            locator = f"{col}; " + (f"{fmt(num_rows)} ÷ {fmt(den_rows)}" if den_rows else fmt(num_rows))
            method = f"{' + '.join(l for _, l in num_rows)} ÷ {' + '.join(l for _, l in den_rows)} × 100." if den_rows else "Value as published."
            values.append({"year": y, "value": round(value, 2), "numerator": n if d else None, "denominator": d,
                           "source": source(OPEN_DATA, ds, f"https://open.toronto.ca/dataset/{pkg['name']}/", url, locator, method, sheet=sheet)})
        out.append({"id": id, "label": label, "unit": unit, "description": desc, "note": CENSUS_NOTES.get(id), "values": values})
    return out


def income():
    rows, url, table_url, title = statcan_table("11100239")
    want = {"GEO": "Toronto, Ontario", "Age group": "15 years and over", "Gender": "Total - Gender", "Income source": "Total income",
            "Statistics": "Median income (excluding zeros)"}
    hits = sorted((r for r in rows if all(r[k] == v for k, v in want.items())), key=lambda r: r["REF_DATE"])
    uom = {r["UOM"] for r in hits}
    if len(uom) != 1:
        sys.exit(f"11-10-0239: expected one unit, got {uom}")
    dollars = uom.pop()
    return series("medianIncome", f"Median income ({dollars})", "dollars", [point(int(r["REF_DATE"]), num(r["VALUE"])) for r in hits],
                  statcan_source("11100239", url, table_url, title, "; ".join(f'{k} = "{v}"' for k, v in want.items()),
                                 f"Values as published, in {dollars} (StatCan's inflation adjustment)."),
                  "Toronto region (CMA)", "Individuals aged 15 and over with income; StatCan adjusts every year to the same dollars.")


def main():
    out = {}
    print("… population", file=sys.stderr)
    pop, pop_src = city_population()
    out["population"] = series("population", "Population", "count", [point(y, int(v)) for y, v in sorted(pop.items())], pop_src)
    print("… labour (Toronto's Dashboard)", file=sys.stderr)
    out["unemployment"] = dashboard_series("Unemployment Rate (Toronto Residents)", "unemployment", "Unemployment rate", "percent")
    out["employmentRate"] = dashboard_series("Employment Rate (Toronto Residents)", "employmentRate", "Employment rate", "percent")
    out["participation"] = dashboard_series("Participation Rate (Toronto Residents)", "participation", "Participation rate", "percent")
    out["foodBank"] = dashboard_series("Food Bank Usage", "foodBank", "People served", "count")
    print("… income (StatCan)", file=sys.stderr)
    out["medianIncome"] = income()
    print("… census profiles", file=sys.stderr)
    data = census(np_files(), wp_file())
    write(OUT, {"series": out, "census": data}, "scripts/extract_people.py")


if __name__ == "__main__":
    main()
