"""
311 service requests (lib/three11.json): every service request residents made to 311 since 2010 — what about,
which division handles it, where, and when.

  City of Toronto Open Data: 311-service-requests-customer-initiated (one zip per year, a CSV inside)

Per year: requests. For the latest complete year: the most common request types, the divisions that handle
them, requests by ward and month, and by weekday and hour.
"""
import collections, csv, datetime, io, os, re, sys, zipfile

sys.path.insert(0, os.path.dirname(__file__))
from _common import TODAY, fetch, open_data_source, package, point, ranking, series, write, year_to_date_note

PKG = "311-service-requests-customer-initiated"
OUT = os.path.join(os.path.dirname(__file__), "..", "lib", "three11.json")
DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]


def rows_of(zbytes):
    z = zipfile.ZipFile(io.BytesIO(zbytes))
    for name in z.namelist():
        if name.endswith("/") or not name.lower().endswith((".csv", ".txt")):
            continue
        with z.open(name) as f:
            bom = f.read(2)
        enc = "utf-16" if bom in (b"\xff\xfe", b"\xfe\xff") else "utf-8-sig"
        yield from csv.DictReader(io.TextIOWrapper(z.open(name), enc, errors="replace"))


def main():
    pkg = package(PKG)
    files = sorted(((int(m.group(1)), r) for r in pkg["resources"] if (m := re.search(r"(20\d\d)", r["name"])) and r["format"].upper() == "ZIP"), key=lambda x: x[0])
    counts, last_date = {}, ""
    latest_full = None
    per_file = {}
    for year, res in files:
        n = 0
        types, divs, wards, months, grid = collections.Counter(), collections.Counter(), collections.Counter(), collections.Counter(), collections.Counter()
        for r in rows_of(fetch(res["url"])):
            d = (r.get("Creation Date") or "").strip()
            if not re.match(r"\d{4}-\d{2}-\d{2}", d):
                continue
            n += 1
            last_date = max(last_date, d[:10])
            types[re.sub(r"\s+", " ", (r.get("Service Request Type") or "").strip())] += 1
            divs[(r.get("Division") or "").strip()] += 1
            wards[(r.get("Ward") or "").strip()] += 1
            months[int(d[5:7])] += 1
            try:
                wd = datetime.date(int(d[:4]), int(d[5:7]), int(d[8:10])).weekday()
                grid[(wd, int(d[11:13]))] += 1
            except ValueError:
                pass
        counts[year] = n
        per_file[year] = (types, divs, wards, months, grid, res)
        print(f"311 {year}: {n:,}", file=sys.stderr)
    ly, lm = int(last_date[:4]), int(last_date[5:7])
    full = [y for y in counts if not (y == ly and (lm < 12))]
    latest_full = full[-1]
    types, divs, wards, months, grid, lres = per_file[latest_full]
    ytd = year_to_date_note(lm) if lm < 12 else None
    _, cur_res = files[-1]
    inputs = [open_data_source(pkg, r["url"], f"{y} file: all rows", "Counted with the other years as described.") for y, r in files[:-1]]
    S = {"requests": series("requests", "311 service requests", "count", [point(y, counts[y], ytd if y == ly else None) for y, _ in files],
                            {**open_data_source(pkg, cur_res["url"], "every row, by year file", "Rows counted per year."), "dataset": f"{pkg['title']} — {files[-1][0]} file (and each earlier year's file)"},
                            inputs=inputs)}
    src = lambda what, how: open_data_source(pkg, lres["url"], what, how)
    ward_rows = [(w, v) for w, v in wards.most_common() if re.search(r"\(\d+\)$", w)]
    R = {
        "types": ranking("types", f"What people called about most, {latest_full}", "count", [{"label": t, "value": v} for t, v in types.most_common(15)],
                         src("Service Request Type, all rows", "Requests counted per type as written.")),
        "divisions": ranking("divisions", f"Which divisions handle them, {latest_full}", "count", [{"label": d or "Not given", "value": v} for d, v in divs.most_common(10)],
                             src("Division, all rows", "Requests counted per division.")),
        "wards": ranking("wards", f"Requests by ward, {latest_full}", "count", [{"label": re.sub(r"\s*\((\d+)\)$", lambda m: f" (Ward {int(m.group(1))})", w), "value": v} for w, v in ward_rows[:25]],
                         src("Ward, all rows", "Requests counted per ward; rows without a ward left out.")),
        "months": ranking("months", f"Requests by month, {latest_full}", "count", [{"label": m, "value": months[i + 1]} for i, m in enumerate(MONTHS)],
                          src("Creation Date, all rows", "Requests counted per month.")),
    }
    write(OUT, {"latestYear": latest_full, "lastDate": last_date, "series": S, "ranks": R,
                "grid": {"days": DAYS, "counts": [[grid[(d, h)] for h in range(24)] for d in range(7)],
                         "source": src("Creation Date (weekday and hour), all rows", "Requests counted per weekday and hour created.")}},
          "scripts/extract_311.py")


if __name__ == "__main__":
    main()
