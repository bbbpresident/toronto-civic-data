"""
Homelessness (lib/homelessness.json): people using the City's shelter system each month since 2018 — how many are
actively homeless, who they are, and how many come in and move out.

  City of Toronto Open Data: toronto-shelter-system-flow (one row per month and population group)

Nightly shelter capacity and occupancy are already on the housing page (lib/housing.json, extract_housing.py);
the homelessness page reads those series from there.
"""
import datetime, os, sys

sys.path.insert(0, os.path.dirname(__file__))
from _common import csv_rows, open_data_source, package, point, ranking, resource, series, write

PKG = "toronto-shelter-system-flow"
OUT = os.path.join(os.path.dirname(__file__), "..", "lib", "homelessness.json")
GROUPS = ["Chronic", "Refugees", "Non-refugees", "Families", "Youth", "Single Adult", "Indigenous"]
AGES = [("ageunder16", "Under 16"), ("age16-24", "16 to 24"), ("age25-34", "25 to 34"), ("age35-44", "35 to 44"), ("age45-54", "45 to 54"), ("age55-64", "55 to 64"), ("age65over", "65 and over")]
GENDERS = [("gender_male", "Men"), ("gender_female", "Women"), ("gender_transgender,non-binary_or_two_spirit", "Transgender, non-binary or Two-Spirit")]
FLOWS = [("newly_identified", "Newly identified"), ("returned_from_housing", "Returned from housing"), ("returned_to_shelter", "Returned to shelter"),
         ("moved_to_housing", "Moved to housing"), ("became_inactive", "Became inactive")]


def main():
    pkg = package(PKG)
    res = resource(pkg, "toronto-shelter-system-flow.csv")
    rows = csv_rows(res["url"])
    month = lambda s: datetime.datetime.strptime(s, "%b-%y").strftime("%Y-%m")
    by = {(month(r["date(mmm-yy)"]), r["population_group"]): r for r in rows}
    months = sorted({m for m, _ in by})
    groups = {g for _, g in by}
    missing = set(GROUPS) - groups
    if missing or "All Population" not in groups:
        sys.exit(f"shelter flow: missing groups {missing}")
    last = months[-1]
    v = lambda m, g, col: int(float(by[(m, g)][col])) if (m, g) in by and by[(m, g)][col] not in ("", None) else None
    src = lambda what, how: open_data_source(pkg, res["url"], what, how)
    note = "Counts people who used an overnight service in the City's shelter system (shelters, respite sites, hotel programs) in the last three months and weren't recorded as moving into housing. It doesn't count people sleeping outdoors or using services the City doesn't fund: the City estimates, from its most recent Street Needs Assessment, that about 18% of people experiencing homelessness aren't in this data."
    S = {
        "active": series("active", "Actively homeless", "count", [point(m, v(m, "All Population", "actively_homeless")) for m in months],
                         src("actively_homeless, population_group = All Population", "As published, per month."), note=note),
        **{f"group_{i}": series(f"group_{i}", g, "count", [point(m, v(m, g, "actively_homeless")) for m in months],
                                src(f"actively_homeless, population_group = {g}", "As published, per month. Groups overlap: a person can be in more than one."))
           for i, g in enumerate(GROUPS)},
        **{f"flow_{k}": series(f"flow_{k}", label, "count", [point(m, v(m, "All Population", k)) for m in months],
                               src(f"{k}, population_group = All Population", "As published, per month."))
           for k, label in FLOWS},
    }
    yearly = lambda col: {y: sum(v(m, "All Population", col) or 0 for m in months if m[:4] == y) for y in sorted({m[:4] for m in months})}
    lm = int(last[5:])
    R = {
        "groups": ranking("groups", "Who's actively homeless", "count",
                          [{"label": g, "value": v(last, g, "actively_homeless")} for g in GROUPS],
                          src("actively_homeless for each population_group, latest month", "As published. Groups overlap, so they don't add up to the total.")),
        "ages": ranking("ages", "By age", "count", [{"label": label, "value": v(last, "All Population", k)} for k, label in AGES],
                        src("age columns, population_group = All Population, latest month", "As published.")),
        "genders": ranking("genders", "By gender", "count", [{"label": label, "value": v(last, "All Population", k)} for k, label in GENDERS],
                           src("gender columns, population_group = All Population, latest month", "As published.")),
    }
    full = [y for y in yearly("newly_identified") if not (y == last[:4] and lm < 12)]
    S["yearIn"] = series("yearIn", "Newly identified", "count", [point(y, yearly("newly_identified")[y]) for y in full],
                         src("newly_identified, population_group = All Population", "Monthly counts summed per calendar year (complete years only)."))
    S["yearHoused"] = series("yearHoused", "Moved to housing", "count", [point(y, yearly("moved_to_housing")[y]) for y in full],
                             src("moved_to_housing, population_group = All Population", "Monthly counts summed per calendar year (complete years only)."))
    write(OUT, {"lastMonth": last, "series": S, "ranks": R}, "scripts/extract_homelessness.py")


if __name__ == "__main__":
    main()
