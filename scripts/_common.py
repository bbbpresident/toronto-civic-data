"""
Shared helpers for the series extractors (housing, safety, transit, people, schools, council).

Every figure an extractor writes goes through `source()` and `series()`, so each one carries
the publisher, the exact file URL, where in the file it came from, and how it was computed.

Set CIVIC_CACHE=/some/dir to keep downloads between runs while developing; without it every
run re-downloads (the published JSON should always come from a fresh pull).
"""
import csv, hashlib, io, json, os, subprocess, sys, zipfile
from datetime import date

csv.field_size_limit(sys.maxsize)

CKAN_API = "https://ckan0.cf.opendata.inter.prod-toronto.ca/api/3/action"
OPEN_DATA = "City of Toronto — Open Data"
STATCAN = "Statistics Canada"
TODAY = date.today()


def fetch(url):
    """Bytes at `url`. curl rather than urllib: python.org's macOS build ships without a CA bundle."""
    cache = os.environ.get("CIVIC_CACHE")
    if cache:
        path = os.path.join(cache, hashlib.sha1(url.encode()).hexdigest())
        if os.path.exists(path):
            with open(path, "rb") as f:
                return f.read()
    data = subprocess.run(["curl", "-sSfL", "--max-time", "900", url], check=True, capture_output=True).stdout
    if cache:
        os.makedirs(cache, exist_ok=True)
        with open(path, "wb") as f:
            f.write(data)
    return data


def csv_rows(url):
    return list(csv.DictReader(io.StringIO(fetch(url).decode("utf-8-sig", errors="replace"))))


# ── City of Toronto Open Data ────────────────────────────────────────────────

def package(name):
    r = json.loads(fetch(f"{CKAN_API}/package_show?id={name}"))
    if not r.get("success"):
        sys.exit(f"Open Data package {name}: {r}")
    return r["result"]


def resource(pkg, name):
    """The resource called `name` in a package dict; aborts if it isn't exactly one."""
    hits = [x for x in pkg["resources"] if x["name"].strip() == name]
    if len(hits) != 1:
        sys.exit(f"{pkg['name']}: expected one resource named {name!r}, found {[x['name'] for x in pkg['resources']]}")
    return hits[0]


def dataset_url(name):
    return f"https://open.toronto.ca/dataset/{name}/"


def open_data_source(pkg, file_url, locator, method):
    return source(OPEN_DATA, pkg["title"], dataset_url(pkg["name"]), file_url, locator, method)


# ── Statistics Canada ────────────────────────────────────────────────────────

def statcan_table(pid):
    """(rows, zip URL, table URL, title) for a StatCan table's full CSV download."""
    url = f"https://www150.statcan.gc.ca/n1/tbl/csv/{pid}-eng.zip"
    z = zipfile.ZipFile(io.BytesIO(fetch(url)))
    rows = list(csv.DictReader(io.StringIO(z.read(f"{pid}.csv").decode("utf-8-sig"))))
    meta = z.read(f"{pid}_MetaData.csv").decode("utf-8-sig")
    title = next(csv.reader(io.StringIO(meta.split("\n", 2)[1])))[0]
    return rows, url, f"https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid={pid}01", title


def statcan_source(pid, url, table_url, title, locator, method):
    return source(STATCAN, f"{title} (table {pid[:2]}-{pid[2:4]}-{pid[4:8]}-01)", table_url, url, locator, method, member=f"{pid}.csv")


# ── Output ───────────────────────────────────────────────────────────────────

def source(publisher, dataset, dataset_url_, file_url, locator, method, member=None, sheet=None):
    s = {"publisher": publisher, "dataset": dataset, "datasetUrl": dataset_url_, "fileUrl": file_url,
         "member": member, "locator": locator, "method": method}
    if sheet:
        s["sheet"] = sheet
    return s


def series(id, label, unit, points, src, geography=None, note=None, inputs=None):
    assert unit in ("count", "dollars", "percent"), unit
    if not points or all(p["value"] is None for p in points):
        sys.exit(f"series {id}: no values")
    # Trim empty periods at either end (e.g. years before a table's first published value).
    while points[0]["value"] is None:
        points = points[1:]
    while points[-1]["value"] is None:
        points = points[:-1]
    s = {"id": id, "label": label, "unit": unit, "points": points, "source": src}
    if geography:
        s["geography"] = geography
    if note:
        s["note"] = note
    if inputs:
        s["inputs"] = inputs
    return s


def point(period, value, note=None):
    p = {"period": str(period), "value": None if value is None else (round(value, 4) if isinstance(value, float) else value)}
    if note:
        p["note"] = note
    return p


def year_to_date_note(last_month):
    return f"Year to date (through {['January','February','March','April','May','June','July','August','September','October','November','December'][last_month - 1]})"


def write(path, obj, generator):
    out = {"generatedOn": TODAY.isoformat(), "generator": generator, **obj}
    tmp = path + ".tmp"
    with open(tmp, "w") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
    os.replace(tmp, path)
    print(f"wrote {path} ({os.path.getsize(path) // 1024} KB)", file=sys.stderr)


def num(s):
    s = (s or "").strip().replace(",", "")
    return float(s) if s not in ("", "..", "x", "F", "NA") else None


# ── Toronto's Dashboard (City Manager's Office key indicators) ───────────────
# One City dataset carrying ~56 indicators that divisions and agencies report, each with the
# original source named in `data_source_notes` (e.g. TTC, Toronto Real Estate Board, StatCan).

DASHBOARD_PKG = "toronto-s-dashboard-key-indicators"
_dash = None


def dashboard():
    global _dash
    if _dash is None:
        pkg = package(DASHBOARD_PKG)
        res = resource(pkg, "Toronto's Dashboard - Key metrics")
        _dash = (pkg, res["url"], csv_rows(res["url"]))
    return _dash


def dashboard_measure(name):
    """Rows for one measure, sorted by period. Names in the file sometimes carry trailing spaces."""
    _, _, rows = dashboard()
    hits = sorted((r for r in rows if r["measure_name"].strip() == name), key=lambda r: (int(r["year"]), int(r["period_number_in_year"])))
    if not hits:
        sys.exit(f"Toronto's Dashboard: no measure named {name!r}")
    return hits


def _dash_period(r):
    y, p = int(r["year"]), int(r["period_number_in_year"])
    return {"m": f"{y}-{p:02d}", "q": f"{y} Q{p}", "s": f"{y} S{p}", "y": f"{y}"}[r["interval_type"]]


def _dash_value(r):
    v = num(r["measure_value"])
    return None if v is None else (v * 100 if r["value_type"] == "p" else v)


def _dash_origin(rows):
    notes = {r["data_source_notes"].strip() for r in rows if r["data_source_notes"].strip()}
    return " ".join(sorted(notes))


def dashboard_series(name, id, label, unit, geography=None, note=None, scale=1):
    """A measure as published, one point per period (month / quarter / year)."""
    pkg, url, _ = dashboard()
    rows = dashboard_measure(name)
    pts = [point(_dash_period(r), None if _dash_value(r) is None else _dash_value(r) * scale) for r in rows]
    method = "Values as published, one per period." + (f" Multiplied by {scale:,} (the measure is stated in thousands)." if scale != 1 else "") \
        + (" The file stores this rate as a fraction; shown ×100 as a percent." if rows[0]["value_type"] == "p" else "")
    src = open_data_source(pkg, url, f'measure_name = "{name}"; origin as stated in the file: {_dash_origin(rows)}', method)
    return series(id, label, unit, pts, src, geography, note)


def dashboard_annual(name, id, label, unit, how="sum", geography=None, note=None, scale=1):
    """A monthly or quarterly measure rolled up to calendar years. The current, incomplete year is kept but marked."""
    pkg, url, _ = dashboard()
    rows = dashboard_measure(name)
    per_year = {"m": 12, "q": 4, "s": 2}[rows[0]["interval_type"]]
    by_year = {}
    for r in rows:
        v = _dash_value(r)
        if v is not None:
            by_year.setdefault(int(r["year"]), []).append((int(r["period_number_in_year"]), v * scale))
    pts = []
    for y in sorted(by_year):
        vals = by_year[y]
        agg = sum(v for _, v in vals) if how == "sum" else sum(v for _, v in vals) / len(vals)
        partial = len(vals) < per_year
        if partial and y < TODAY.year:
            continue  # a past year with missing periods: don't present a partial total as the year's
        unit_name = {"m": "month", "q": "quarter", "s": "half"}[rows[0]["interval_type"]]
        pts.append(point(y, agg, f"Partial year: {len(vals)} of {per_year} {unit_name}s" if partial else None))
    word = "Sum" if how == "sum" else "Average"
    src = open_data_source(pkg, url, f'measure_name = "{name}"; origin as stated in the file: {_dash_origin(rows)}',
                           f"{word} of the {'monthly' if per_year == 12 else 'quarterly'} values for each calendar year. Past years missing any period are left out.")
    return series(id, label, unit, pts, src, geography, note)


# ── Population (for per-resident rates) ──────────────────────────────────────

WDS = "https://www150.statcan.gc.ca/t1/wds/rest/getDataFromVectorByReferencePeriodRange"
POP_VECTOR = 1591053123  # the WDS endpoint takes the number without the "v"
POP_TABLE_URL = "https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid=1710015201"


def city_population(first=2001):
    """({year: population}, source) — StatCan July 1 estimates for the City of Toronto (census division 3520)."""
    url = f"{WDS}?vectorIds=%22{POP_VECTOR}%22&startRefPeriod={first}-01-01&endReferencePeriod={TODAY.year}-12-31"
    data = json.loads(fetch(url))
    if data[0].get("status") != "SUCCESS":
        sys.exit(f"StatCan vector v{POP_VECTOR}: {data}")
    values = {int(p["refPer"][:4]): p["value"] for p in data[0]["object"]["vectorDataPoint"] if p["value"] is not None}
    src = source(STATCAN, "Population estimates, July 1, by census division, 2021 boundaries (table 17-10-0152-01)", POP_TABLE_URL, url,
                 f"Vector v{POP_VECTOR}: Toronto (census division 3520, the City of Toronto), total gender, all ages", "Values as published, one per year.")
    return values, src


def ranking(id, title, unit, rows, src, note=None):
    """A ranked (or ordered) list: rows of {label, value, sub?}. Used for top-N lists and breakdowns."""
    assert unit in ("count", "dollars", "percent", "minutes"), unit
    if not rows:
        sys.exit(f"ranking {id}: no rows")
    r = {"id": id, "title": title, "unit": unit, "rows": rows, "source": src}
    if note:
        r["note"] = note
    return r
