"""
Rebuilds lib/budget.json (and lib/budget-programs.json, per-program detail) from the City of Toronto's approved operating budget open-data files.

Like extract_elections.py: every number comes out of the City's files and carries the URL
of the file it was read from. To add a year, add a BUDGETS entry and re-run.

    .venv/bin/python scripts/extract_budget.py     (venv setup: see extract_elections.py)

Conventions in the City's files: revenues are stored as negative amounts and expenses as
positive. This script flips revenues to positive so both read as dollars.

Checks (the script aborts if any fail):
  - every row is "Expenses" or "Revenues" (rows with any other marker must sum to $0)
  - category, sub-category and program breakdowns each sum back to the year's total
  - comparable groups (lib/budget-crosswalk.json): every row matches a rule, the groups sum to
    the year's total, and each document figure a rule cites is within 0.1% of the file
"""
import io, json, os, subprocess, sys, warnings
from datetime import date

import pandas as pd

warnings.filterwarnings("ignore")

CKAN = "https://ckan0.cf.opendata.inter.prod-toronto.ca/dataset/2c90a5d3-5598-4c02-abf2-169456c8f1f1/resource"
DATASET = {
    "publisher": "City of Toronto — Open Data",
    "dataset": "Budget – Operating Budget Program Summary by Expenditure Category",
    "datasetUrl": "https://open.toronto.ca/dataset/budget-operating-budget-program-summary-by-expenditure-category/",
}

# Approved budgets only. 2011–2013 are published as zips / recommended-only; not included yet.
BUDGETS = [
    (2014, "7e23b244-91a7-4e70-9baf-be231ff58d59", "approved-operating-budget-summary-2014.xlsx"),
    (2015, "4a87ff46-996b-4768-b833-69e023b1b4c4", "approved-operating-budget-summary-2015.xlsx"),
    (2016, "d55a2458-f116-456e-a3be-4a0d867fa190", "approved-operating-budget-summary-2016.xlsx"),
    (2017, "393dffb4-2f7a-4ff3-8443-e44796f08782", "approved-operating-budget-summary-2017.xlsx"),
    (2018, "8ff2e379-2bbf-43ab-83eb-2caa7717d85b", "approved-operating-budget-summary-2018.xlsx"),
    (2019, "27bc496e-1507-4d2e-b9f8-4392b1d44b5c", "approved-operating-budget-summary-2019.xlsx"),
    (2020, "4e58558a-4773-4cd0-a16a-de481f25cb4d", "2020-operating-open-data.xlsx"),
    (2021, "930502fa-87f1-4d71-8b71-4435df594b38", "2021-open-data2.xlsx"),
    (2022, "9e5f9a63-fdeb-46e4-9f5f-8143038de56d", "approved-operating-budget-summary-2022.xlsx"),
    (2023, "a6f7a8e8-e497-4f77-9881-daba429ea981", "approved-operating-budget-summary-2023.xlsx"),
    (2024, "ee996e45-c0a4-4b52-9d5d-a408b3f9cbfa", "approved-operating-budget-summary-2024.xlsx"),
    (2025, "f9def3c1-a97f-4d31-bc58-c0494d750b80", "approved-operating-budget-summary-2025.xlsx"),
    (2026, "7e700262-9e68-4fa8-97ab-2414a247d4f8", "approved-operating-budget-summary-2026.xlsx"),
]

# From 2022 the files' revenues exceed expenses, and the whole difference sits in these three
# programs (the rest of each file balances to within $1). The script measures this every run
# rather than asserting it; see gap_breakdown().
GAP_PROGRAMS = ["Toronto Water", "Solid Waste Management Services", "Toronto Parking Authority"]

BLANK = "(blank in source)"


def fetch(url):
    # curl rather than urllib: python.org's macOS build ships without a CA bundle.
    return io.BytesIO(subprocess.run(["curl", "-sSfL", "--max-time", "180", url], check=True, capture_output=True).stdout)


def load(year, url):
    """The year's data sheet: has Program, Expense/Revenue and a column named for the year.
    Some files carry extra working sheets with the same headers; the data sheet is the largest."""
    xl = pd.ExcelFile(fetch(url))
    best = None
    for sheet in xl.sheet_names:
        cols = [str(c).strip() for c in pd.read_excel(xl, sheet_name=sheet, nrows=0).columns]
        if "Program" in cols and "Expense/Revenue" in cols and str(year) in cols:
            df = pd.read_excel(xl, sheet_name=sheet)
            df.columns = [str(c).strip() for c in df.columns]
            if best is None or len(df) > len(best[1]):
                best = (sheet, df)
    if best is None:
        sys.exit(f"{year}: no sheet with Program / Expense/Revenue / {year} columns")
    sheet, df = best
    df["amt"] = pd.to_numeric(df[str(year)], errors="coerce").fillna(0.0)
    for col in ("Program", "Category Name", "Sub-Category Name", "Service", "Activity", "Commitment item"):
        if col in df.columns:
            df[col] = df[col].fillna(BLANK).astype(str).str.strip()
    return sheet, df


def breakdown(rows, key, sign, sub_key=None):
    out = []
    for name, g in rows.groupby(key):
        item = {"name": name, "amount": int(round(sign * g["amt"].sum()))}
        if sub_key:
            item["sub"] = sorted(({"name": n, "amount": int(round(sign * s["amt"].sum()))} for n, s in g.groupby(sub_key)),
                                 key=lambda x: -x["amount"])
        out.append(item)
    return sorted(out, key=lambda x: -x["amount"])


def check_sum(year, label, items, total, tolerance):
    s = sum(i["amount"] for i in items)
    if abs(s - total) > tolerance:
        sys.exit(f"{year}: {label} sums to {s}, total is {total}")


def breakdown_deep(rows, keys, sign):
    """Nested breakdown over several columns, e.g. Category → Sub-Category → Commitment item."""
    out = []
    for name, g in rows.groupby(keys[0]):
        item = {"name": name, "amount": int(round(sign * g["amt"].sum()))}
        if len(keys) > 1:
            item["sub"] = breakdown_deep(g, keys[1:], sign)
        out.append(item)
    return sorted(out, key=lambda x: -x["amount"])


def check_deep(year, label, items, total):
    """Each level of a nested breakdown sums to its parent (within $1 of rounding per line)."""
    check_sum(year, label, items, total, len(items))
    for i in items:
        if "sub" in i:
            check_deep(year, f"{label} › {i['name']}", i["sub"], i["amount"])


CROSSWALK_PATH = os.path.join(os.path.dirname(__file__), "..", "lib", "budget-crosswalk.json")
MATCH_COLUMNS = {"program": "Program", "service": "Service", "category": "Category Name", "subCategory": "Sub-Category Name"}


def comparable(year, side, rows, sign, total, rules, documents=True):
    """Group one side's rows by the crosswalk: first matching rule wins. Returns
    [{group, amount, rules: [{id, amount}]}] in the crosswalk's group order. `documents=False`
    for one program's rows: a document's figure (a city-wide levy) is checked at city level."""
    rules = [r for r in rules if r["side"] == side and ("years" not in r or year in r["years"])]
    taken = pd.Series(False, index=rows.index)
    by_rule = {}
    for r in rules:
        m = ~taken
        for field, want in r["match"].items():
            col = MATCH_COLUMNS[field]
            if col not in rows.columns:
                m &= False
                continue
            m &= rows[col].isin(want if isinstance(want, list) else [want])
        if m.any():
            by_rule[r["id"]] = int(round(sign * rows.loc[m, "amt"].sum()))
            taken |= m
    left = rows.loc[~taken]
    if left["amt"].abs().sum() > 0.5:
        cols = [c for c in MATCH_COLUMNS.values() if c in left.columns]
        sys.exit(f"{year} {side}: no crosswalk rule matches\n{left.groupby(cols)['amt'].sum()}")
    for r in rules if documents else []:
        for doc in r.get("documents", []):
            if doc["year"] == year:
                got = by_rule.get(r["id"], 0)
                if abs(got - doc["amount"]) > doc["amount"] * 0.001:
                    sys.exit(f"{year}: rule {r['id']} gives {got}, but {doc['label']} says {doc['amount']}")
    groups = {}
    for r in rules:
        if r["id"] in by_rule:
            g = groups.setdefault(r["group"], {"group": r["group"], "amount": 0, "rules": []})
            g["amount"] += by_rule[r["id"]]
            g["rules"].append({"id": r["id"], "amount": by_rule[r["id"]]})
    out = list(groups.values())
    check_sum(year, f"comparable {side}", out, total, len(by_rule))
    return out


def slugify(name):
    s = name.lower().replace("&", " and ").replace("'", "").replace("’", "")
    return "-".join("".join(c if c.isalnum() else " " for c in s).split())


def program_breakdown(year, name, rows, sub, url, sheet, rules):
    """One program's spending by service (→ activity) and by type (→ sub-type), and the
    revenue booked to it by category. Service/Activity exist from 2015 (Activity not in 2016)."""
    kinds = rows["Expense/Revenue"].astype(str).str.strip()
    exp, rev = rows[kinds == "Expenses"], rows[kinds == "Revenues"]
    expenses, revenue = int(round(exp["amt"].sum())), int(round(-rev["amt"].sum()))
    has_service = "Service" in rows.columns
    activity = "Activity" if "Activity" in rows.columns else None
    by_service = breakdown(exp.fillna({"Service": BLANK, **({activity: BLANK} if activity else {})}), "Service", 1, activity) if has_service else None
    # Commitment item — the City's finest line (e.g. Salaries › Permanent Salaries › overtime) — exists from 2019.
    commit = "Commitment item" if "Commitment item" in rows.columns else None
    type_keys = ["Category Name"] + ([sub] if sub else []) + ([commit] if commit else [])
    by_type = breakdown_deep(exp, type_keys, 1)
    rev_cat = breakdown_deep(rev, type_keys, -1)
    for label, items, total in (("services", by_service or [], expenses), ("types", by_type, expenses), ("revenue", rev_cat, revenue)):
        if items:
            check_deep(year, f"{name} {label}", items, total)
    # The program's rows in the crosswalk's groups, so its lines compare across years (e.g.
    # "Salaries And Benefits" splits into "Salaries" and "Benefits" from 2021).
    groups = {side: [{"group": g["group"], "amount": g["amount"]} for g in comparable(year, side, part, sign, total, rules, documents=False)]
              for side, part, sign, total in (("expenses", exp, 1, expenses), ("revenue", rev, -1, revenue))}
    return {
        "slug": slugify(name), "name": name, "expenses": expenses, "revenue": revenue,
        "expensesByService": by_service, "expensesByCategory": by_type, "revenueByCategory": rev_cat, "comparable": groups,
        "source": {
            **DATASET, "fileUrl": url, "member": None, "sheet": sheet,
            "locator": f"Sheet “{sheet}”, column “{year}”, the {len(rows):,} rows where Program = “{name}”",
            "method": "Expenses = sum of this program’s “Expenses” rows, grouped by the file’s "
                      + ("Service" + (" and Activity" if activity else "") + " columns, and by " if has_service else "")
                      + "Category Name" + (", Sub-Category Name" if sub else "") + (" and Commitment item" if commit else "")
                      + ". Revenue = this program’s “Revenues” rows (stored negative; shown positive), grouped the same way. "
                      + "Line names are as written in the file.",
        },
    }


def gap_breakdown(df, revenue, expenses):
    gap = revenue - expenses
    if abs(gap) < 1_000_000:
        return None
    nets = [{"name": p, "net": int(round(-df.loc[df["Program"] == p, "amt"].sum()))} for p in GAP_PROGRAMS]
    rest = float(-df.loc[~df["Program"].isin(GAP_PROGRAMS), "amt"].sum())
    # Only describe the gap as "in these programs" when that's what the file shows.
    return {"gap": int(gap), "programs": nets, "restNet": round(rest, 2), "explained": bool(abs(rest) < 1_000)}


def main():
    out = {"generatedOn": date.today().isoformat(), "generator": "scripts/extract_budget.py", "dataset": DATASET, "years": []}
    programs = {"generatedOn": out["generatedOn"], "generator": out["generator"], "years": {}}
    with open(CROSSWALK_PATH, encoding="utf-8") as f:
        crosswalk = json.load(f)
    for year, resource_id, filename in BUDGETS:
        print("…", year, file=sys.stderr)
        url = f"{CKAN}/{resource_id}/download/{filename}"
        sheet, df = load(year, url)
        kinds = df["Expense/Revenue"].astype(str).str.strip()
        stray = df.loc[~kinds.isin(["Expenses", "Revenues"]), "amt"].sum()
        if abs(stray) > 0.5:
            sys.exit(f"{year}: rows marked neither Expenses nor Revenues sum to {stray}")
        exp, rev = df[kinds == "Expenses"], df[kinds == "Revenues"]
        expenses, revenue = int(round(exp["amt"].sum())), int(round(-rev["amt"].sum()))
        sub = "Sub-Category Name" if "Sub-Category Name" in df.columns else None

        rev_cat = breakdown(rev, "Category Name", -1, sub)
        exp_cat = breakdown(exp, "Category Name", 1, sub)
        exp_prog = breakdown(exp, "Program", 1)
        rev_prog = breakdown(rev, "Program", -1)
        # Rounding each group to whole dollars can drift the sum by under $1 per group.
        for label, items, total in (("revenue categories", rev_cat, revenue), ("expense categories", exp_cat, expenses),
                                    ("expense programs", exp_prog, expenses), ("revenue programs", rev_prog, revenue)):
            check_sum(year, label, items, total, len(items))
            for i in items:
                if "sub" in i:
                    check_sum(year, f"{label} › {i['name']}", i["sub"], i["amount"], len(i["sub"]))

        # Some files carry filler rows whose every amount is $0 (Program "0" in 2021, blank in 2024).
        progs = [program_breakdown(year, name, rows, sub, url, sheet, crosswalk["rules"]) for name, rows in df.groupby("Program")
                 if rows["amt"].abs().sum() > 0]
        slugs = [pr["slug"] for pr in progs]
        if len(set(slugs)) != len(slugs):
            sys.exit(f"{year}: two programs share a slug")
        slug_of = {pr["name"]: pr["slug"] for pr in progs}
        for line in exp_prog + rev_prog:
            line["slug"] = slug_of[line["name"]]
        programs["years"][str(year)] = sorted(progs, key=lambda pr: -pr["expenses"])

        out["years"].append({
            "year": year,
            "label": f"{year} Approved Operating Budget",
            "revenue": revenue,
            "expenses": expenses,
            "gap": gap_breakdown(df, revenue, expenses),
            "programCount": len(progs),
            "hasSubCategories": sub is not None,
            "revenueByCategory": rev_cat,
            "expensesByCategory": exp_cat,
            "expensesByProgram": exp_prog,
            "revenueByProgram": rev_prog,
            "comparable": {
                "revenue": comparable(year, "revenue", rev, -1, revenue, crosswalk["rules"]),
                "expenses": comparable(year, "expenses", exp, 1, expenses, crosswalk["rules"]),
            },
            "source": {
                **DATASET, "fileUrl": url, "member": None, "sheet": sheet,
                "locator": f"Sheet “{sheet}”, column “{year}”, {len(df):,} rows",
                "method": "Revenue = sum of “Revenues” rows (stored negative in the file; shown positive). "
                          "Expenses = sum of “Expenses” rows. Breakdowns group those rows by the file’s own "
                          "Category Name" + (", Sub-Category Name" if sub else "") + " and Program columns.",
            },
        })
    for name, data in (("budget.json", out), ("budget-programs.json", programs)):
        path = os.path.join(os.path.dirname(__file__), "..", "lib", name)
        with open(path + ".tmp", "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, separators=(",", ":") if name == "budget-programs.json" else None,
                      indent=None if name == "budget-programs.json" else 1)
            f.write("\n")
        os.replace(path + ".tmp", path)
        print("wrote", os.path.normpath(path), file=sys.stderr)


if __name__ == "__main__":
    main()
