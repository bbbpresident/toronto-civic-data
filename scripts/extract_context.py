"""
Rebuilds lib/context.json: the outside figures that give budget numbers a sense of scale.

  - population      Statistics Canada, City of Toronto (census division 3520), July 1 estimates
  - cpi             Statistics Canada, consumer price index, Toronto, annual average
  - unitCosts       service volumes from Toronto Open Data (shelter person-nights, library
                    visits, fire incidents) to divide a program's budget by
  - mbn             MBNCanada performance measures the City reports for itself (Toronto Open Data)

Every value keeps the URL it came from. The pairing of a volume or MBNCanada area with budget
programs (by program name) is set here, in UNIT_COSTS and MBN_AREAS, and shown on the page.

    .venv/bin/python scripts/extract_context.py     (venv setup: see extract_elections.py)
"""
import csv, io, json, os, subprocess, sys
from collections import Counter
from datetime import date

csv.field_size_limit(sys.maxsize)

CKAN = "https://ckan0.cf.opendata.inter.prod-toronto.ca/dataset"
OPEN_DATA = "City of Toronto — Open Data"
STATCAN = "Statistics Canada"
WDS = "https://www150.statcan.gc.ca/t1/wds/rest/getDataFromVectorByReferencePeriodRange"


def fetch(url):
    # curl rather than urllib: python.org's macOS build ships without a CA bundle.
    return subprocess.run(["curl", "-sSfL", "--max-time", "600", url], check=True, capture_output=True).stdout


def rows(url):
    return csv.DictReader(io.StringIO(fetch(url).decode("utf-8-sig", errors="replace")))


def statcan_series(vector, table_title, table_url, locator, first=2012):
    url = f"{WDS}?vectorIds=%22{vector}%22&startRefPeriod={first}-01-01&endReferencePeriod={date.today().year}-12-31"
    data = json.loads(fetch(url))
    if data[0].get("status") != "SUCCESS":
        sys.exit(f"StatCan vector {vector}: {data}")
    values = {p["refPer"][:4]: p["value"] for p in data[0]["object"]["vectorDataPoint"] if p["value"] is not None}
    return {
        "values": values,
        "source": {"publisher": STATCAN, "dataset": table_title, "datasetUrl": table_url, "fileUrl": url, "member": None,
                   "locator": locator, "method": "Values as published, one per year."},
    }


# ── Unit costs ────────────────────────────────────────────────────────────────
# Each pairs a service volume with the budget program(s) that deliver it. Program names must
# match the budget files exactly; a year is only shown where both the program and a full
# year of volume exist.

def shelter_person_nights():
    files = {
        2024: f"{CKAN}/21c83b32-d5a8-4106-a54f-010dbe49f6f2/resource/6687de07-9c50-4c2a-838e-48ee125001c0/download/daily-shelter-overnight-service-occupancy-capacity-2024.csv",
        2025: f"{CKAN}/21c83b32-d5a8-4106-a54f-010dbe49f6f2/resource/77a0d39e-82fb-465e-a803-d6a73e98283b/download/daily-shelter-overnight-service-occupancy-capacity-2025.csv",
    }
    out = {}
    for year, url in files.items():
        total, days = 0, set()
        for r in rows(url):
            total += int(float(r["SERVICE_USER_COUNT"] or 0))
            days.add(r["OCCUPANCY_DATE"][:10])
        if len(days) < 365:
            sys.exit(f"shelter {year}: only {len(days)} days of data")
        out[str(year)] = {"value": total, "fileUrl": url, "locator": f"Sum of SERVICE_USER_COUNT over all programs and all {len(days)} days"}
    return out


def library_visits():
    url = f"{CKAN}/a4cdef6c-cf1e-43a8-909c-2112158f4e85/resource/9800b615-d7da-46cf-bb41-d26521e09853/download/tpl-visits-annual-by-branch.csv"
    totals, branches = Counter(), Counter()
    for r in rows(url):
        totals[r["Year"]] += int(float(r["Visits"] or 0))
        branches[r["Year"]] += 1
    return {y: {"value": v, "fileUrl": url, "locator": f"Sum of Visits across all {branches[y]} branches for {y}"} for y, v in totals.items()}


def fire_incidents():
    base = f"{CKAN}/d6ec31d0-da5c-4223-9610-75c9294574b7/resource"
    files = [
        # The resource labelled "2011-2018" only contains 2011, so use the single-year files.
        f"{base}/699832cd-17b1-4ec3-ae9c-35eaf86e2387/download/basic-incidents-details-2014-4326.csv",
        f"{base}/036a677d-7cc1-4d1f-b91b-169125d79497/download/basic-incidents-details-2015-4326.csv",
        f"{base}/b0a1d576-7c2f-4469-a71e-bd9d44f69b78/download/basic-incidents-details-2016-4326.csv",
        f"{base}/c627f4a2-4f25-45f6-905c-cd9585adf20f/download/basic-incidents-details-2017-4326.csv",
        f"{base}/f673fd5d-fc89-4597-9036-94ec7a26dc71/download/basic-incidents-details-2018-4326.csv",
        f"{base}/260dad35-5af0-4ceb-8b7b-7f34bb17b3fe/download/basic-incidents-details-2019-4326.csv",
        f"{base}/68bda920-4f44-4454-b0e4-b5928d5e3105/download/basic-incidents-details-2020-4326.csv",
        f"{base}/b543eafd-11b4-4eda-8fa2-8e022a1fadba/download/basic-incidents-details-2021-4326.csv",
        f"{base}/8be92356-188c-4dc5-86de-928b8ead0475/download/basic-incidents-details-2022-4326.csv",
        f"{base}/f1fbf1cc-240e-4c83-8783-fef6f528e1d2/download/basic-incidents-details-2023-onward-4326.csv",
    ]
    seen, by_year, file_of, months = set(), Counter(), {}, {}
    for url in files:
        for r in rows(url):
            num, t = r["INCIDENT_NUMBER"], r["TFS_Alarm_Time"]
            if not num or not t or num in seen:
                continue
            seen.add(num)
            by_year[t[:4]] += 1
            file_of.setdefault(t[:4], url)
            months.setdefault(t[:4], set()).add(t[5:7])
    # Keep only years with incidents in every month (the newest file's last year may be partial).
    return {y: {"value": n, "fileUrl": file_of[y], "locator": f"Unique INCIDENT_NUMBERs with a TFS_Alarm_Time in {y}"}
            for y, n in by_year.items() if len(months[y]) == 12 and int(y) >= 2014}


UNIT_COSTS = [
    {"id": "shelter", "programs": ["Toronto Shelter and Support Services"],
     "unit": "person per night", "volumeLabel": "person-nights in City shelter and overnight services",
     "dataset": "Daily Shelter & Overnight Service Occupancy & Capacity",
     "datasetUrl": "https://open.toronto.ca/dataset/daily-shelter-overnight-service-occupancy-capacity/",
     "caveat": "The program also funds services beyond shelter beds, and the budget is a plan while occupancy is what happened, so this is an approximate cost per person-night.",
     "load": shelter_person_nights},
    {"id": "library", "programs": ["Toronto Public Library"],
     "unit": "in-person visit", "volumeLabel": "in-person branch visits",
     "dataset": "Library Visits", "datasetUrl": "https://open.toronto.ca/dataset/library-visits/",
     "caveat": "The library budget also pays for online services, collections and programs, so this overstates the cost of a visit. Branch closures in 2020–21 cut visits sharply.",
     "load": library_visits},
    {"id": "fire", "programs": ["Fire Services", "Toronto Fire Services"],
     "unit": "emergency incident", "volumeLabel": "emergency incidents responded to",
     "dataset": "Fire Services Emergency Incident Basic Detail",
     "datasetUrl": "https://open.toronto.ca/dataset/fire-services-emergency-incident-basic-detail/",
     "caveat": "Fire Services also does prevention, inspection and training, so this is the program's whole budget spread over the incidents it responded to.",
     "load": fire_incidents},
]

# ── MBNCanada ─────────────────────────────────────────────────────────────────

MBN_FILES = {
    2016: f"{CKAN}/0ff0cb64-9373-44d3-985c-f8d24bf270ab/resource/61a6045b-6e18-47ac-a581-0db4206c2ffc/download/measures-2016.csv",
    2017: f"{CKAN}/0ff0cb64-9373-44d3-985c-f8d24bf270ab/resource/75ed7c7d-1882-466c-a6f0-05b715fcad2f/download/measures-2017.csv",
    2018: f"{CKAN}/0ff0cb64-9373-44d3-985c-f8d24bf270ab/resource/b417b2de-1487-4ad5-8e92-26809aea7f3c/download/measures-2018.csv",
    2019: f"{CKAN}/0ff0cb64-9373-44d3-985c-f8d24bf270ab/resource/89b9d2dc-81e8-4ae2-8eca-e64d506747ff/download/measures-2019.csv",
    2020: f"{CKAN}/0ff0cb64-9373-44d3-985c-f8d24bf270ab/resource/2846ef0d-dfce-4d7b-9673-491904220fc4/download/measures-2020.csv",
}

# MBNCanada program area → budget program names (all names the program has had in the files).
MBN_AREAS = {
    "Child Care": ["Children's Services"],
    "Emergency Shelters": ["Shelter, Support & Housing Administration", "Toronto Shelter and Support Services"],
    "EMS (CF)": ["Toronto Paramedic Services"],
    "Fire and Rescue Services": ["Fire Services", "Toronto Fire Services"],
    "Libraries": ["Toronto Public Library"],
    "Long Term Care": ["Long-Term Care Homes & Services", "Seniors Services and Long-Term Care"],
    "Police": ["Toronto Police Service"],
    "Social Assistance": ["Toronto Employment & Social Services", "Toronto Employment and Social Services"],
    "Transit": ["Toronto Transit Commission - Conventional"],
    "Waste Management": ["Solid Waste Management Services"],
    "Water (CF)": ["Toronto Water"],
    "Wastewater (CF)": ["Toronto Water"],
    "Parks": ["Parks, Forestry & Recreation", "Parks, Recreation and Forestry", "Parks and Recreation"],
    "Sports and Recreation": ["Parks, Forestry & Recreation", "Parks, Recreation and Forestry", "Parks and Recreation"],
    "Roads (CF)": ["Transportation Services"],
    "Building Permits and Inspections": ["Toronto Building"],
    "Planning": ["City Planning"],
    "Culture": ["Economic Development & Culture", "Economic Development and Culture"],
    "POA (Court Services)": ["Court Services"],
    "Parking": ["Toronto Parking Authority"],
    "Clerks": ["City Clerk's Office"],
}


def num(s):
    try:
        return float(s) if s not in ("", None) else None
    except ValueError:
        return None


def mbn_measures():
    areas = {a: {"programs": progs, "years": {}} for a, progs in MBN_AREAS.items()}
    for year, url in MBN_FILES.items():
        for r in rows(url):
            area, name = r["Program Area"].strip(), r["Measure Name"].strip()
            if area not in areas or r.get("Municipality", "").strip() != "Toronto" or r.get("Publicly Reportable", "").strip() != "Yes":
                continue
            if r["Measure Category"].strip() == "Statistic" or name.startswith("Override"):
                continue
            result = num(r["Result"])
            if result is None:
                continue
            areas[area]["years"].setdefault(str(year), []).append({
                "number": r["Measure Number"].strip(), "name": name, "category": r["Measure Category"].strip(),
                "numerator": num(r["Numerator"]), "denominator": num(r["Denominator"]), "result": result,
                "fileUrl": url,
            })
    return {a: v for a, v in areas.items() if v["years"]}


def main():
    out = {"generatedOn": date.today().isoformat(), "generator": "scripts/extract_context.py"}
    print("… population, CPI", file=sys.stderr)
    out["population"] = statcan_series(
        1591053123, "Table 17-10-0152-01 — Population estimates, July 1, by census division, 2021 boundaries",
        "https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid=1710015201",
        "Vector v1591053123: Toronto (census division 3520, the City of Toronto), total gender, all ages")
    out["cpi"] = statcan_series(
        41695186, "Table 18-10-0005-01 — Consumer Price Index, annual average, not seasonally adjusted",
        "https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid=1810000501",
        "Vector v41695186: Toronto (census metropolitan area), all-items, 2002=100")
    out["unitCosts"] = []
    for u in UNIT_COSTS:
        print("…", u["id"], file=sys.stderr)
        volumes = u["load"]()
        out["unitCosts"].append({k: v for k, v in u.items() if k != "load"} | {"publisher": OPEN_DATA, "volumes": volumes})
    print("… MBNCanada", file=sys.stderr)
    out["mbn"] = {
        "publisher": OPEN_DATA, "dataset": "MBNCanada Performance Measures",
        "datasetUrl": "https://open.toronto.ca/dataset/mbncanada-performance-measures/",
        "areas": mbn_measures(),
    }
    path = os.path.join(os.path.dirname(__file__), "..", "lib", "context.json")
    with open(path + ".tmp", "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
        f.write("\n")
    os.replace(path + ".tmp", path)
    print("wrote", os.path.normpath(path), file=sys.stderr)


if __name__ == "__main__":
    main()
