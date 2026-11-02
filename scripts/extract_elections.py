"""
Rebuilds lib/elections.json from the City of Toronto's official open-data files.

Every number the site shows comes out of this script, and every number carries
the URL of the exact file it was read from. Nothing is typed in by hand — to add an
election, add an ELECTIONS entry pointing at the City's files and re-run.

    python3 -m venv .venv && .venv/bin/pip install pandas openpyxl xlrd
    .venv/bin/python scripts/extract_elections.py

Checks (the script aborts if any fail):
  - every candidate row's subdivision cells sum to its "Total" cell
  - summed candidate votes equal the sum of the City's own "Ward N Totals" rows (where present)
"""
import io, json, os, subprocess, sys, warnings, zipfile
from datetime import date

import pandas as pd

warnings.filterwarnings("ignore")

CKAN = "https://ckan0.cf.opendata.inter.prod-toronto.ca/dataset"
RESULTS_DS = ("Elections – Official Results", "https://open.toronto.ca/dataset/election-results-official/", "96d35404-44d9-49d8-95bb-fb1e5489240d")
VOTERS_DS = ("Elections – Voter Statistics", "https://open.toronto.ca/dataset/elections-voter-statistics/", "7dc606ab-f042-4d90-99e2-9247cb5953d2")
BY_RESULTS_DS = ("Elections – Official By-Election Results", "https://open.toronto.ca/dataset/elections-official-by-election-results/", "97d72233-8681-4b3d-828e-4929d40d122c")
BY_VOTERS_DS = ("Elections – By-Election Voter Statistics", "https://open.toronto.ca/dataset/elections-by-election-voter-statistics/", "c1c7ea74-0088-484f-9508-2165d3dfd629")


def res(ds, resource_id, filename, member=None):
    """A file inside a CKAN dataset. `member` = path inside a zip, when the resource is one."""
    title, page, ds_id = ds
    return {"publisher": "City of Toronto — Open Data", "dataset": title, "datasetUrl": page, "fileUrl": f"{CKAN}/{ds_id}/resource/{resource_id}/download/{filename}", "member": member}


ELECTIONS = [
    {"id": "2003", "year": 2003, "kind": "general", "label": "2003 General Election",
     "turnout": res(VOTERS_DS, "030a7234-7ee0-46a0-94de-3a31fa58352a", "2003-voter-statistics.xls"),
     "mayor": res(RESULTS_DS, "1ed53c9d-a316-465e-96ce-e72be74f8aa9", "2003-results.zip", "2003 Results/2003_Toronto_Poll_by_Poll_Mayor.xls")},
    {"id": "2006", "year": 2006, "kind": "general", "label": "2006 General Election",
     "turnout": res(VOTERS_DS, "0b5691a6-7235-46d0-94a6-47f309605829", "2006-voter-statistics.xls"),
     "mayor": res(RESULTS_DS, "3fb1227c-a279-4523-a1aa-f00190ba717f", "2006-results.zip", "2006 Results/2006_Toronto_Poll_by_Poll_Mayor.xls")},
    {"id": "2010", "year": 2010, "kind": "general", "label": "2010 General Election",
     "turnout": res(VOTERS_DS, "4615e48b-11f1-4965-94f1-170401b674c4", "2010-voter-statistics.xls"),
     "mayor": res(RESULTS_DS, "6fbfaab0-bb84-442a-8e4b-1c14d4c10d6d", "2010-results.zip", "2010_Toronto_Poll_by_Poll_Mayor.xls")},
    {"id": "2014", "year": 2014, "kind": "general", "label": "2014 General Election",
     "turnout": res(VOTERS_DS, "a20ad5ef-c77c-4ea3-8144-e270c1f6f9d1", "2014-voter-statistics.xls"),
     "mayor": res(RESULTS_DS, "d59b5a52-33c3-4380-a136-82707e4d9aae", "2014-results.zip", "MAYOR.xls")},
    {"id": "2018", "year": 2018, "kind": "general", "label": "2018 General Election",
     "turnout": res(VOTERS_DS, "cb352fd3-7228-48f3-bac3-00c6f7c5dfa6", "2018-voter-statistics.zip", "2018_Voter_Turnout_Statistics_FINAL.XLSX"),
     "mayor": res(RESULTS_DS, "2fcd5f20-90f5-4dd0-88eb-22e978b9bf89", "2018-results.zip", "2018_Toronto_Poll_By_Poll_Mayor.xlsx")},
    {"id": "2022", "year": 2022, "kind": "general", "label": "2022 General Election",
     "turnout": res(VOTERS_DS, "631b7042-bd71-46b1-9c27-2d4119462ec7", "2022_voter_turnout_statistics_final.xlsx"),
     "mayor": res(RESULTS_DS, "3ad371de-7c51-45d3-9ea4-0b4efac5fc2b", "2022-results.zip", "2022_Toronto_Poll_By_Poll_Mayor.xlsx")},
    {"id": "2023-mayoral-by-election", "year": 2023, "kind": "by-election", "label": "2023 Mayoral By-Election",
     "turnout": res(BY_VOTERS_DS, "46ccd64f-4a40-41b3-b045-d13ab34e54eb", "2023-mayoral-by-election-voter-statistics-1.xlsx"),
     "mayor": res(BY_RESULTS_DS, "868f890d-5432-432b-823c-c6a6fafa2f63", "2023_office_of_the_mayor.xlsx")},
    # 2026 turnout: the City hasn't added a 2026 file to Elections – Voter Statistics yet.
    # When it does, add a "turnout" entry here and re-run.
    {"id": "2026", "year": 2026, "kind": "general", "label": "2026 General Election",
     "turnout": None,
     "mayor": res(RESULTS_DS, "8006f3bd-0a48-4e20-8cc4-4155a30cd203", "2026-results.zip", "2026-results/Poll_By_Poll_Mayor.xlsx")},
]

_downloads = {}


def fetch(src):
    """Returns a readable spreadsheet (bytes buffer) for a source entry."""
    url = src["fileUrl"]
    if url not in _downloads:
        # curl rather than urllib: python.org's macOS build ships without a CA bundle.
        _downloads[url] = subprocess.run(["curl", "-sSfL", "--max-time", "120", url], check=True, capture_output=True).stdout
    data = _downloads[url]
    if src["member"]:
        with zipfile.ZipFile(io.BytesIO(data)) as z:
            data = z.read(src["member"])
    return io.BytesIO(data)


def cell_num(x):
    if isinstance(x, (int, float)) and not pd.isna(x):
        return x
    return None


def extract_turnout(src):
    """Reads the City's own 'Grand Total' row: Total Eligible Electors and Number Voted."""
    buf = fetch(src)
    xl = pd.ExcelFile(buf)
    for sheet in xl.sheet_names:
        df = pd.read_excel(xl, sheet_name=sheet, header=None)
        hdr = next((i for i in range(min(10, len(df)))
                    if any(isinstance(x, str) and x.replace("\n", " ").strip() == "Number Voted" for x in df.iloc[i])), None)
        if hdr is None:
            continue
        cols = {str(x).replace("\n", " ").strip(): j for j, x in enumerate(df.iloc[hdr]) if isinstance(x, str)}
        rows = [i for i in range(len(df)) if str(df.iat[i, 0]).strip().lower() == "grand total"]
        if len(rows) != 1:
            sys.exit(f"{src['fileUrl']}: expected one Grand Total row, found {len(rows)}")
        r = rows[0]
        eligible = int(df.iat[r, cols["Total Eligible Electors"]])
        voted = int(df.iat[r, cols["Number Voted"]])
        published = df.iat[r, cols["% Voted"]]
        return {
            "eligibleElectors": eligible,
            "numberVoted": voted,
            "turnoutPct": round(voted / eligible * 100, 2),
            "publishedPct": published if isinstance(published, str) else round(float(published) * 100, 2),
            "source": {**src, "sheet": sheet, "locator": f"Sheet “{sheet}”, Grand Total row (row {r + 1})",
                       "method": "Turnout = Number Voted ÷ Total Eligible Electors, both from the Grand Total row."},
        }
    sys.exit(f"{src['fileUrl']}: no turnout sheet found")


def display_name(listed):
    """Source lists surname first ('Miller, David', 'TORY JOHN', 'Tory John'). Reorders to
    'Given Surname' only when the split is unambiguous (a comma, or exactly two words);
    'DI PAOLA ROCCO' stays in listed order rather than guessing. The page shows the listed
    form alongside either way."""
    parts = listed.split()
    if "," in listed:
        surname, given = [p.strip() for p in listed.split(",", 1)]
        name = f"{given} {surname}"
    elif len(parts) == 2:
        name = f"{parts[1]} {parts[0]}"
    else:
        name = listed
    return name.title() if name.isupper() else name


def extract_mayor(src):
    """Sums each candidate's per-ward 'Total' cell across every ward sheet."""
    buf = fetch(src)
    xl = pd.ExcelFile(buf)
    votes, ward_totals, ward_sheets = {}, 0, 0
    for sheet in xl.sheet_names:
        df = pd.read_excel(xl, sheet_name=sheet, header=None)
        hdr = None
        for i in range(min(10, len(df))):
            row = df.iloc[i].tolist()
            vals = [x for x in row if not (isinstance(x, float) and pd.isna(x))]
            if vals and str(vals[-1]).strip() == "Total" and str(row[0]).strip() in ("Name", "Subdivision"):
                hdr = i
                break
        if hdr is None:
            continue
        ward_sheets += 1
        tcol = max(j for j, x in enumerate(df.iloc[hdr]) if str(x).strip() == "Total")
        for i in range(hdr + 1, len(df)):
            name, total = df.iat[i, 0], cell_num(df.iat[i, tcol])
            if not isinstance(name, str) or not name.strip() or total is None:
                continue
            subs = pd.to_numeric(df.iloc[i, 1:tcol], errors="coerce").fillna(0).sum()
            if abs(subs - total) > 0.5:
                sys.exit(f"{src['fileUrl']} [{sheet}] row {i + 1}: subdivisions sum to {subs}, Total says {total}")
            if "total" in name.lower():
                ward_totals += int(total)
            else:
                votes[name.strip()] = votes.get(name.strip(), 0) + int(total)
    total_votes = sum(votes.values())
    if ward_totals and ward_totals != total_votes:
        sys.exit(f"{src['fileUrl']}: candidate sum {total_votes} != ward totals {ward_totals}")
    ranked = sorted(votes.items(), key=lambda kv: -kv[1])
    return {
        "totalVotes": total_votes,
        "candidateCount": len(votes),
        "top": [{"rank": n + 1, "nameAsListed": name, "displayName": display_name(name), "votes": v,
                 "sharePct": round(v / total_votes * 100, 2)} for n, (name, v) in enumerate(ranked[:10])],
        # Every candidate, for all-time totals and the share held by candidates outside the top 10.
        "candidates": [{"rank": n + 1, "nameAsListed": name, "displayName": display_name(name), "votes": v}
                       for n, (name, v) in enumerate(ranked)],
        "source": {**src, "locator": f"“Total” column of each candidate row, summed across all {ward_sheets} ward sheets",
                   "method": "Votes = sum of the candidate's ward Totals. Share = votes ÷ all votes cast for mayor in the file."
                             + (" Cross-checked against the City's own ward-totals rows." if ward_totals else "")},
    }


def main():
    out = {"generatedOn": date.today().isoformat(), "generator": "scripts/extract_elections.py", "elections": []}
    for e in ELECTIONS:
        print("…", e["label"], file=sys.stderr)
        out["elections"].append({
            "id": e["id"], "year": e["year"], "kind": e["kind"], "label": e["label"],
            "turnout": extract_turnout(e["turnout"]) if e["turnout"] else None,
            "mayor": extract_mayor(e["mayor"]),
        })
    path = os.path.join(os.path.dirname(__file__), "..", "lib", "elections.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)
        f.write("\n")
    print("wrote", os.path.normpath(path), file=sys.stderr)


if __name__ == "__main__":
    main()
