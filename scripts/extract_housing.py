"""
Rebuilds lib/housing.json: rents, construction, prices, applications and housing need.

  - rents            CMHC average rents by unit size, via Statistics Canada table 34-10-0133 (Toronto CMA)
  - starts etc.      CMHC housing starts / completions / under construction, StatCan 34-10-0154 (Toronto CMA)
  - prices, permits, applications, social-housing wait list, shelter use (2007–, quarterly)
                     Toronto's Dashboard (City of Toronto Open Data), each measure naming its origin
  - shelter system   sites, programs, people, capacity and occupancy by month (2021–), from the City's
                     daily shelter & overnight service occupancy files (one per year)

    .venv/bin/python scripts/extract_housing.py
"""
import calendar, os, sys
from collections import defaultdict
from _common import (OPEN_DATA, csv_rows, dashboard_annual, dashboard_series, dataset_url, num, package, point, resource, series, source,
                     statcan_source, statcan_table, write, year_to_date_note, TODAY)

CMA = "Toronto region (CMA)"
OUT = os.path.join(os.path.dirname(__file__), "..", "lib", "housing.json")


def rents():
    rows, url, table_url, title = statcan_table("34100133")
    structure = "Row and apartment structures of three units and over"
    out = {}
    for unit, id in [("Bachelor units", "rentBachelor"), ("One bedroom units", "rent1br"), ("Two bedroom units", "rent2br"), ("Three bedroom units", "rent3br")]:
        hits = [r for r in rows if r["GEO"] == "Toronto, Ontario" and r["Type of structure"] == structure and r["Type of unit"] == unit]
        pts = [point(int(r["REF_DATE"]), num(r["VALUE"])) for r in sorted(hits, key=lambda r: r["REF_DATE"])]
        label = {"rentBachelor": "Bachelor", "rent1br": "1 bedroom", "rent2br": "2 bedroom", "rent3br": "3 bedroom"}[id]
        out[id] = series(id, label, "dollars", pts, statcan_source(
            "34100133", url, table_url, title,
            f'GEO = "Toronto, Ontario"; Type of structure = "{structure}"; Type of unit = "{unit}"',
            "Average monthly rent as published, one value per year."), CMA)
    return out


def construction():
    rows, url, table_url, title = statcan_table("34100154")
    tor = [r for r in rows if r["GEO"] == "Toronto, Ontario"]
    last = max(r["REF_DATE"] for r in tor if r["Housing estimates"] == "Housing starts" and num(r["VALUE"]) is not None)
    last_year, last_month = int(last[:4]), int(last[5:7])
    out = {}

    def annual(estimate, unit_type, id, label):
        by_year = defaultdict(list)
        for r in tor:
            if r["Housing estimates"] == estimate and r["Type of unit"] == unit_type and num(r["VALUE"]) is not None:
                by_year[int(r["REF_DATE"][:4])].append(num(r["VALUE"]))
        pts = []
        for y in sorted(by_year):
            n = len(by_year[y])
            if n < 12 and not (y == last_year and n == last_month):
                sys.exit(f"34-10-0154 {estimate}/{unit_type}: {y} has {n} months")
            pts.append(point(y, int(sum(by_year[y])), year_to_date_note(last_month) if n < 12 else None))
        return series(id, label, "count", pts, statcan_source(
            "34100154", url, table_url, title,
            f'GEO = "Toronto, Ontario"; Housing estimates = "{estimate}"; Type of unit = "{unit_type}"',
            "Sum of the monthly values for each calendar year."), CMA)

    out["starts"] = annual("Housing starts", "Total units", "starts", "Starts")
    out["completions"] = annual("Housing completions", "Total units", "completions", "Completions")
    for t, id, label in [("Single-detached units", "startsSingle", "Single-detached"), ("Semi-detached units", "startsSemi", "Semi-detached"),
                         ("Row units", "startsRow", "Row"), ("Apartment and other unit types", "startsApartment", "Apartment and other")]:
        out[id] = annual("Housing starts", t, id, label)

    # Under construction is a count at a point in time, so take December (or the latest month this year).
    uc = sorted((r for r in tor if r["Housing estimates"] == "Housing under construction" and r["Type of unit"] == "Total units" and num(r["VALUE"]) is not None), key=lambda r: r["REF_DATE"])
    by_year = {}
    for r in uc:
        by_year[int(r["REF_DATE"][:4])] = r
    pts = [point(y, int(num(r["VALUE"])), None if r["REF_DATE"].endswith("-12") else f"As of {r['REF_DATE']}") for y, r in sorted(by_year.items()) if r["REF_DATE"].endswith("-12") or y == last_year]
    out["underConstruction"] = series("underConstruction", "Under construction", "count", pts, statcan_source(
        "34100154", url, table_url, title, 'GEO = "Toronto, Ontario"; Housing estimates = "Housing under construction"; Type of unit = "Total units"',
        "The December value for each year (units under construction at year end); the current year shows its latest month."), CMA)
    return out


SHELTER_PKG = "daily-shelter-overnight-service-occupancy-capacity"
SHELTER_TYPES = [("Shelter", "Shelter"), ("Motel/Hotel Shelter", "Hotel shelter"), ("24-Hour Respite Site", "24-hour respite")]
SECTORS = [("Men", "Men"), ("Women", "Women"), ("Mixed Adult", "Mixed adult"), ("Youth", "Youth"), ("Families", "Families")]


def shelter_system():
    """Monthly figures from the City's daily list of overnight programs (one row per program per night, 2021–)."""
    pkg = package(SHELTER_PKG)
    files = [(str(y), resource(pkg, f"{SHELTER_PKG}-{y}")) for y in range(2021, TODAY.year) if any(x["name"] == f"{SHELTER_PKG}-{y}" for x in pkg["resources"])]
    files.append((str(TODAY.year), resource(pkg, "Daily shelter overnight occupancy")))
    day = defaultdict(lambda: {"sites": set(), "programs": set(), "people": 0, "beds": 0, "rooms": 0, "occBeds": 0, "occRooms": 0,
                                "sector": defaultdict(int), "type": defaultdict(set)})
    for label, res in files:
        for r in csv_rows(res["url"]):
            d = r["OCCUPANCY_DATE"][:10]
            d = d if len(d) == 10 else "20" + d[:8]  # the 2021 and 2022 files write dates as YY-MM-DD
            if d[:4] != label:  # each file holds one calendar year
                sys.exit(f"shelter file {label}: unexpected date {r['OCCUPANCY_DATE']!r}")
            x = day[d]
            x["sites"].add(r["LOCATION_ID"]); x["programs"].add(r["PROGRAM_ID"])
            x["people"] += num(r["SERVICE_USER_COUNT"]) or 0
            x["beds"] += num(r["CAPACITY_ACTUAL_BED"]) or 0
            x["rooms"] += num(r["CAPACITY_ACTUAL_ROOM"]) or 0
            x["occBeds"] += num(r["OCCUPIED_BEDS"]) or 0
            x["occRooms"] += num(r["OCCUPIED_ROOMS"]) or 0
            x["sector"][r["SECTOR"]] += num(r["SERVICE_USER_COUNT"]) or 0
            x["type"][r["OVERNIGHT_SERVICE_TYPE"]].add(r["LOCATION_ID"])
    months = defaultdict(list)
    for d in sorted(day):
        months[d[:7]].append(day[d])
    last = max(day)
    last_full = int(last[8:10]) == calendar.monthrange(int(last[:4]), int(last[5:7]))[1]

    def pts(fn, how="mean"):
        out = []
        for m, ds in sorted(months.items()):
            note = f"Partial month: through {last}" if m == last[:7] and not last_full else None
            if how == "mean":
                v = sum(fn(x) for x in ds) / len(ds)
            else:  # ratio of sums
                a, b = zip(*(fn(x) for x in ds))
                v = sum(a) / sum(b) * 100 if sum(b) else None
            out.append(point(m, round(v, 1) if v is not None else None, note))
        return out

    cur_label, cur_res = files[-1]
    inputs = [source(OPEN_DATA, f"{lab} file", dataset_url(SHELTER_PKG), res["url"], "All rows", "Combined with the other years' files as described in the main citation.")
              for lab, res in files[:-1]]
    src = lambda locator, method: source(OPEN_DATA, f"{pkg['title']} — {cur_label} file (and earlier years, listed)", dataset_url(SHELTER_PKG), cur_res["url"], locator, method)
    avg = "For each night, the value across all programs listed that night; then the average over the month's nights."
    note = "Every overnight service the City tracks in its shelter system (shelters, hotel programs, respite sites, warming centres and others). Capacity is actual capacity: beds or rooms usable that night."
    out = {
        "shelterSites": series("shelterSites", "Sites", "count", pts(lambda x: len(x["sites"])), src("Distinct LOCATION_ID per OCCUPANCY_DATE", avg), note=note, inputs=inputs),
        "shelterPrograms": series("shelterPrograms", "Programs", "count", pts(lambda x: len(x["programs"])), src("Distinct PROGRAM_ID per OCCUPANCY_DATE", avg), note=note, inputs=inputs),
        "shelterPeople": series("shelterPeople", "People per night", "count", pts(lambda x: x["people"]), src("Sum of SERVICE_USER_COUNT per OCCUPANCY_DATE", avg), note=note, inputs=inputs),
        "shelterBeds": series("shelterBeds", "Beds (actual capacity)", "count", pts(lambda x: x["beds"]), src("Sum of CAPACITY_ACTUAL_BED per OCCUPANCY_DATE (bed-based programs)", avg), note=note, inputs=inputs),
        "shelterRooms": series("shelterRooms", "Rooms (actual capacity)", "count", pts(lambda x: x["rooms"]), src("Sum of CAPACITY_ACTUAL_ROOM per OCCUPANCY_DATE (room-based programs)", avg), note=note, inputs=inputs),
        "shelterOccBeds": series("shelterOccBeds", "Beds occupied", "percent", pts(lambda x: (x["occBeds"], x["beds"]), "ratio"),
                                 src("OCCUPIED_BEDS and CAPACITY_ACTUAL_BED", "Sum of occupied beds ÷ sum of actual bed capacity over every night of the month."), note=note, inputs=inputs),
        "shelterOccRooms": series("shelterOccRooms", "Rooms occupied", "percent", pts(lambda x: (x["occRooms"], x["rooms"]), "ratio"),
                                  src("OCCUPIED_ROOMS and CAPACITY_ACTUAL_ROOM", "Sum of occupied rooms ÷ sum of actual room capacity over every night of the month."), note=note, inputs=inputs),
    }
    for key, label in SECTORS:
        id = "shelterSector" + key.replace(" ", "")
        out[id] = series(id, label, "count", pts(lambda x, k=key: x["sector"][k]), src(f'SECTOR = "{key}"; sum of SERVICE_USER_COUNT per OCCUPANCY_DATE', avg), note=note, inputs=inputs)
    for key, label in SHELTER_TYPES:
        id = "shelterType" + label.replace(" ", "").replace("-", "")
        out[id] = series(id, label, "count", pts(lambda x, k=key: len(x["type"][k])), src(f'OVERNIGHT_SERVICE_TYPE = "{key}"; distinct LOCATION_ID per OCCUPANCY_DATE', avg),
                         note="A site running more than one type of program counts once under each type.", inputs=inputs)
    return out


def main():
    out = {}
    print("… shelter system (daily occupancy files)", file=sys.stderr)
    out.update(shelter_system())
    print("… rents", file=sys.stderr)
    out.update(rents())
    print("… starts and completions", file=sys.stderr)
    out.update(construction())
    print("… Toronto's Dashboard measures", file=sys.stderr)
    out["homePrice"] = dashboard_series("Average Home Price (City of Toronto)", "homePrice", "Average home price", "dollars")
    out["homeSales"] = dashboard_annual("Number of Home Sales (City of Toronto)", "homeSales", "Home sales", "count")
    out["permitValue"] = dashboard_annual("Construction Value of Building Permits Issued (All Types)", "permitValue", "All permits", "dollars")
    out["permitValueResidential"] = dashboard_annual("Construction Value of Building Permits Issued (Residential)", "permitValueResidential", "Residential", "dollars")
    out["planningApps"] = dashboard_annual("Community Planning Number of Applications", "planningApps", "Community Planning applications", "count")
    out["adjustmentApps"] = dashboard_annual("Committee of Adjustment Number of Applications", "adjustmentApps", "Committee of Adjustment applications", "count")
    out["socialHousingWaitlist"] = dashboard_series("Size of Waiting List for Social Housing (Total Number)", "socialHousingWaitlist", "On the wait list", "count")
    out["shelterSingles"] = dashboard_series("Shelter & Overnight Services Use - Singles (Average Individuals Per Night)", "shelterSingles", "Single adults", "count")
    out["shelterFamilies"] = dashboard_series("Shelter & Overnight Services Use - Families (Average Individuals Per Night)", "shelterFamilies", "People in families", "count")
    write(OUT, {"series": out}, "scripts/extract_housing.py")


if __name__ == "__main__":
    main()
