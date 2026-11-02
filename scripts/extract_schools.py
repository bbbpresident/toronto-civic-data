"""
Rebuilds lib/schools.json (board trends + school index) and lib/schools-detail.json (each Toronto
school's figures by year) from the Ontario Ministry of Education's School Information and Student
Demographics files (data.ontario.ca), one file per school year.

Toronto schools = rows whose Municipality is the City of Toronto. Board trends are computed from
the school rows and say how: enrolment is summed; test results are the median school's percentage.

Data quirks handled here, each checked rather than assumed:
  - Percentages come as "87 %", "87%", 0.87 or 87 depending on the file and column. Within one file's
    column, if any whole number above 1 appears, whole numbers are percents; otherwise numbers ≤ 1 are
    fractions. "%"-suffixed strings are always percents.
  - The 2019–20 and 2020–21 files repeat 2018–19 EQAO results (no tests during the pandemic). The
    sheet names say so ("EQAO1819"); those years' test results are kept but marked carried over.

    .venv/bin/python scripts/extract_schools.py
"""
import io, json, os, re, statistics, sys
from collections import defaultdict
import pandas as pd
from _common import fetch, source, write

LIB = os.path.join(os.path.dirname(__file__), "..", "lib")
PKG = "school-information-and-student-demographics"
API = "https://data.ontario.ca/api/3/action/package_show?id=" + PKG
DATASET_URL = "https://data.ontario.ca/dataset/" + PKG
PUBLISHER = "Government of Ontario — Ministry of Education (Ontario Data Catalogue)"
GLOSSARY = "http://www.app.edu.gov.on.ca/eng/sift/glossary.asp"

TESTS = {
    "g3Reading": "Percentage of Grade 3 Students Achieving the Provincial Standard in Reading",
    "g3Writing": "Percentage of Grade 3 Students Achieving the Provincial Standard in Writing",
    "g3Math": "Percentage of Grade 3 Students Achieving the Provincial Standard in Mathematics",
    "g6Reading": "Percentage of Grade 6 Students Achieving the Provincial Standard in Reading",
    "g6Writing": "Percentage of Grade 6 Students Achieving the Provincial Standard in Writing",
    "g6Math": "Percentage of Grade 6 Students Achieving the Provincial Standard in Mathematics",
    "osslt": "Percentage of Students That Passed the Grade 10 OSSLT on Their First Attempt",
}
PROFILE = {
    "notEnglish": "Percentage of Students Whose First Language Is Not English",
    "newToCanada": "Percentage of Students Who Are New to Canada from a Non-English Speaking Country",
    "specialEd": "Percentage of Students Receiving Special Education Services",
    "gifted": "Percentage of Students Identified as Gifted",
    "lowIncome": "Percentage of School-Aged Children Who Live in Low-Income Households",
    "parentsNoDegree": "Percentage of Students Whose Parents Have No Degree, Diploma or Certificate",
}
BOARD_MIN_SCHOOLS = 10


def files():
    r = json.loads(fetch(API))["result"]
    out = {}
    for res in r["resources"]:
        u = res["url"]
        if not u.endswith(".xlsx") or "_fr" in u or "finale_fr" in u:
            continue
        m = re.search(r"(20\d\d)_?(20\d\d|\d\d)", u.split("/")[-1])
        start = int(m.group(1))
        key = f"{start}–{str(start + 1)[2:]}"
        # Prefer a final file over a preliminary one for the same year.
        if key not in out or ("prelim" in out[key] and "prelim" not in u):
            out[key] = u
    return dict(sorted(out.items()))


def column_mode(values):
    vals = [v.strip() for v in values if isinstance(v, str)]
    return "int" if any(re.fullmatch(r"\d+", v) and int(v) > 1 for v in vals) else "frac"


def parse_pct(v, mode):
    if not isinstance(v, str) or not v.strip():
        return None
    s = v.strip()
    if "%" in s:
        return float(s.replace("%", "").strip())
    if re.fullmatch(r"\d+(\.\d+)?", s):
        x = float(s)
        return x if mode == "int" else x * 100
    return s  # a code as published (N/R, N/D, SP, NA …)


def main():
    years = files()
    print("files:", "\n  ".join(f"{k} {v}" for k, v in years.items()), file=sys.stderr)
    schools = {}
    detail = defaultdict(dict)
    year_meta = {}
    for sy, url in years.items():
        book = pd.ExcelFile(io.BytesIO(fetch(url)))
        sheet = book.sheet_names[0]
        df = pd.read_excel(book, sheet_name=sheet, dtype=str)
        tor = df[df["Municipality"].fillna("").str.contains("Toronto")]
        if len(tor) < 700:
            sys.exit(f"{sy}: only {len(tor)} Toronto schools — check the Municipality filter")
        eq = re.search(r"EQAO(\d\d)(\d\d)", sheet)
        carried = eq and f"20{eq.group(1)}–{eq.group(2)}" != sy
        year_meta[sy] = {"fileUrl": url, "sheet": sheet, "eqaoCarriedFrom": f"20{eq.group(1)}–{eq.group(2)}" if carried else None}
        modes = {c: column_mode(tor[c].dropna().tolist()) for c in list(TESTS.values()) + list(PROFILE.values()) if c in tor}
        for _, r in tor.iterrows():
            sid = str(r["School Number"]).strip()
            enrol = r["Enrolment"]
            rec = {"enrolment": int(enrol) if isinstance(enrol, str) and enrol.strip().isdigit() else (enrol.strip() if isinstance(enrol, str) else None)}
            for k, c in {**TESTS, **PROFILE}.items():
                rec[k] = parse_pct(r[c], modes[c]) if c in tor else None
            detail[sid][sy] = rec
            schools[sid] = {  # latest year's details win (years are processed in order)
                "id": sid, "name": str(r["School Name"]).strip(), "board": str(r["Board Name"]).strip(), "level": str(r["School Level"]).strip(),
                "language": str(r["School Language"]).strip(), "grades": str(r["Grade Range"]).strip(), "area": str(r["City"]).strip(),
                "street": str(r["Street"]).strip(), "postal": str(r["Postal Code"]).strip(),
            }
        print(f"  {sy}: {len(tor)} schools, EQAO carried from {year_meta[sy]['eqaoCarriedFrom']}" if carried else f"  {sy}: {len(tor)} schools", file=sys.stderr)

    # Board trends
    by_board = defaultdict(set)
    for sid, s in schools.items():
        by_board[s["board"]].add(sid)
    boards = sorted((b for b, ids in by_board.items() if len(ids) >= BOARD_MIN_SCHOOLS), key=lambda b: -len(by_board[b]))
    trends = []
    for b in boards:
        t = {"board": b, "schools": len(by_board[b]), "enrolment": {}, "tests": {k: {} for k in TESTS}}
        for sy in years:
            rows = [detail[sid][sy] for sid in by_board[b] if sy in detail[sid]]
            enr = [r["enrolment"] for r in rows if isinstance(r["enrolment"], int)]
            t["enrolment"][sy] = {"value": sum(enr), "schools": len(enr)}
            for k in TESTS:
                vals = [r[k] for r in rows if isinstance(r[k], float)]
                t["tests"][k][sy] = {"value": round(statistics.median(vals), 1), "schools": len(vals)} if vals else None
        trends.append(t)

    def src(sy, locator, method):
        m = year_meta[sy]
        return source(PUBLISHER, f"School information and student demographics — {sy}", DATASET_URL, m["fileUrl"], locator, method, sheet=m["sheet"])

    sources = {sy: {
        "enrolment": src(sy, 'Rows where Municipality is the City of Toronto, grouped by "Board Name"; column "Enrolment"', "Sum of school enrolments (each rounded to the nearest 5 by the Ministry)."),
        "tests": src(sy, 'Rows where Municipality is the City of Toronto, grouped by "Board Name"; the test\'s "Percentage of … Achieving the Provincial Standard" column', "Median of the schools' published percentages. Schools without a percentage (codes such as N/R, N/D) are left out; the count used is shown."),
        "school": src(sy, 'The school\'s row ("School Number")', "Values as published; percentages normalised to 0–100."),
    } for sy in years}

    index = sorted(schools.values(), key=lambda s: s["name"])
    write(os.path.join(LIB, "schools.json"), {
        "schoolYears": list(years), "yearMeta": year_meta, "boards": trends, "schools": index, "sources": sources,
        "tests": TESTS, "profile": PROFILE, "glossaryUrl": GLOSSARY,
    }, "scripts/extract_schools.py")
    write(os.path.join(LIB, "schools-detail.json"), {"schools": detail}, "scripts/extract_schools.py")


if __name__ == "__main__":
    main()
