"""
TTC delays (lib/delays.json): every delay the TTC logged on the subway, buses and streetcars since 2025, from its
monthly delay files; the most-delayed lines, routes and stations, and why.

  City of Toronto Open Data: ttc-subway-delay-data, ttc-bus-delay-data, ttc-streetcar-delay-data
    ("TTC <Mode> Delay Data since 2025.csv" and each package's "Code Descriptions.csv")

Only rows with Min Delay above 0 count as delays (many logged incidents caused none). Subway rows count only when
Line is a single line (YU = Line 1, BD = Line 2, SRT = Line 3, SHP = Line 4); bus and streetcar rows are grouped
by route number, named with the most common spelling in the file.
"""
import collections, os, re, sys

sys.path.insert(0, os.path.dirname(__file__))
from _common import csv_rows, open_data_source, package, point, ranking, resource, series, write

OUT = os.path.join(os.path.dirname(__file__), "..", "lib", "delays.json")
MODES = [("subway", "Subway", "ttc-subway-delay-data"), ("bus", "Bus", "ttc-bus-delay-data"), ("streetcar", "Streetcar", "ttc-streetcar-delay-data")]
SUBWAY = {"YU": "Line 1 Yonge-University", "BD": "Line 2 Bloor-Danforth", "SRT": "Line 3 Scarborough", "SHP": "Line 4 Sheppard"}
ACRONYMS = {"Ttc": "TTC", "Paa": "PAA", "Bd": "BD", "Yu": "YU", "Srt": "SRT", "Atc": "ATC", "Cbtc": "CBTC", "Ems": "EMS"}


def fix(text):
    """Some descriptions are UTF-8 read as Latin-1 in the City's file ("â€“" for "–"); undo that, then sentence case."""
    if "â" in text:
        try:
            text = text.encode("cp1252", errors="ignore").decode("utf-8")
        except UnicodeDecodeError:
            text = text.encode("latin-1", errors="ignore").decode("utf-8", errors="ignore")
    return text


def tidy(text):
    return " ".join(ACRONYMS.get(w, w) for w in text.split(" "))


MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]


def main():
    S, R, meta = {}, {}, {}
    for key, mode, pkg_name in MODES:
        pkg = package(pkg_name)
        res = resource(pkg, f"TTC {mode} Delay Data since 2025.csv")
        cres = resource(pkg, "Code Descriptions.csv")
        codes = {c["CODE"].strip(): fix(c["DESCRIPTION"].strip()) for c in csv_rows(cres["url"])}
        rows = [r for r in csv_rows(res["url"]) if float(r["Min Delay"] or 0) > 0]
        last = max(r["Date"][:7] for r in rows)
        full_years = sorted({r["Date"][:4] for r in rows if r["Date"][:4] < last[:4] or last[5:] == "12"})
        year = full_years[-1]
        src = lambda what, how: open_data_source(pkg, res["url"], what, how)

        def line_of(r):
            if key == "subway":
                return SUBWAY.get(r["Line"].strip())
            m = re.match(r"(\d+)", r["Line"].strip())
            return m.group(1) if m else None

        names = collections.defaultdict(collections.Counter)
        mins, n, stations, causes, monthly = collections.Counter(), collections.Counter(), collections.Counter(), collections.Counter(), collections.Counter()
        for r in rows:
            d = float(r["Min Delay"])
            monthly[r["Date"][:7]] += d
            if r["Date"][:4] != year:
                continue
            ln = line_of(r)
            if ln:
                mins[ln] += d
                n[ln] += 1
                if key != "subway":
                    names[ln][re.sub(r"\s+", " ", r["Line"].strip().upper())] += 1
            causes[codes.get(r["Code"].strip(), r["Code"].strip() or "Not given")] += d
            if key == "subway" and r["Station"].strip():
                stations[re.sub(r"\s+", " ", r["Station"].strip().upper())] += d
        label = lambda ln: ln if key == "subway" else tidy(re.sub(r"^(\d+)\s*", r"\1 ", names[ln].most_common(1)[0][0]).title())
        top = 4 if key == "subway" else 15 if key == "bus" else 10
        lines_what = "Line (single-line values only)" if key == "subway" else "Line, grouped by route number"
        R[f"{key}_lines"] = ranking(f"{key}_lines", f"Most-delayed {'lines' if key == 'subway' else 'routes'}, {year}", "minutes",
                                    [{"label": label(ln), "value": round(v), "sub": f"{n[ln]:,} delays"} for ln, v in mins.most_common(top)],
                                    src(f"Min Delay and {lines_what}, {year} rows with a delay", "Minutes of delay summed per line; delays counted."))
        R[f"{key}_causes"] = ranking(f"{key}_causes", f"Top causes, {year}", "minutes",
                                     [{"label": tidy(c.capitalize()), "value": round(v)} for c, v in causes.most_common(8)],
                                     {**src(f"Code (described in Code Descriptions.csv) and Min Delay, {year} rows with a delay", "Minutes of delay summed per cause."), "member": None})
        if key == "subway":
            R["stations"] = ranking("stations", f"Stations with the most delay, {year}", "minutes",
                                    [{"label": tidy(s.title().replace("Station", "").strip()), "value": round(v)} for s, v in stations.most_common(12)],
                                    src(f"Station and Min Delay, {year} rows with a delay", "Minutes of delay summed per Station as written."))
        months = sorted(monthly)
        S[f"{key}_monthly"] = series(f"{key}_monthly", mode, "count", [point(m, round(monthly[m])) for m in months],
                                     src("Min Delay, every row with a delay", "Minutes of delay summed per month."))
        meta[key] = {"year": year, "lastMonth": last, "codes": open_data_source(pkg, cres["url"], "CODE → DESCRIPTION", "Used to name each delay code."),
                     "minutes": round(sum(mins.values()) if key != "subway" else sum(v for v in mins.values())), "delays": sum(n.values())}
        print(f"delays {key}: {year}, {meta[key]['delays']:,} delays, {meta[key]['minutes']:,} min", file=sys.stderr)
    write(OUT, {"modes": meta, "series": S, "ranks": R}, "scripts/extract_delays.py")


if __name__ == "__main__":
    main()
