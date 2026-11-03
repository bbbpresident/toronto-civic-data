"""
Parking tickets (lib/parking.json): every parking ticket the City issued, one file per year since 2008.

  City of Toronto Open Data: parking-tickets (parking-tickets-<year>.zip; some years are split into parts or UTF-16)

Per year: tickets and the total of their set fines (the fine on the ticket, not what was paid). For the latest
year: the most common infractions, the most-ticketed streets and addresses, and tickets by weekday and hour.
"""
import collections, csv, datetime, io, os, re, sys, zipfile

sys.path.insert(0, os.path.dirname(__file__))
from _common import TODAY, fetch, open_data_source, package, point, ranking, series, write

PKG = "parking-tickets"
OUT = os.path.join(os.path.dirname(__file__), "..", "lib", "parking.json")
DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]


def rows_of(zbytes):
    z = zipfile.ZipFile(io.BytesIO(zbytes))
    last_header = None
    # Most years are one UTF-8 CSV; 2008 and 2010 are UTF-16; 2021 is split into parts named .000, .001, …
    for name in sorted(n for n in z.namelist() if not n.endswith("/") and re.search(r"\.(csv|txt|\d{3})$", n, re.I)):
        with z.open(name) as f:
            bom = f.read(2)
        enc = "utf-16" if bom in (b"\xff\xfe", b"\xfe\xff") else "utf-8-sig"
        reader = csv.reader(io.TextIOWrapper(z.open(name), enc, errors="replace"))
        header = None
        for row in reader:
            if any(c.strip().lower() == "date_of_infraction" for c in row):
                header = last_header = [c.strip().lower() for c in row]
                continue
            if header is None:
                if last_header is None or not row:
                    continue
                header = last_header  # a later part with no header row of its own
            if len(row) >= len(header) - 1:
                yield dict(zip(header, row))


def street_of(loc):
    s = re.sub(r"^\d+[A-Z]?\s+", "", (loc or "").strip().upper())
    return re.sub(r"\s+", " ", s)


def main():
    pkg = package(PKG)
    files = sorted(((int(m.group(1)), r) for r in pkg["resources"] if (m := re.fullmatch(r"parking-tickets-(\d{4})", r["name"].strip()))), key=lambda x: x[0])
    latest_year, latest_res = files[-1]
    counts, fines = {}, {}
    infr, streets, addrs, grid, months = collections.Counter(), collections.Counter(), collections.Counter(), collections.Counter(), collections.Counter()
    infr_fine = {}
    for year, res in files:
        n = total = 0
        for r in rows_of(fetch(res["url"])):
            d = (r.get("date_of_infraction") or "").strip()
            if len(d) < 8 or not d[:4].isdigit():
                continue
            f = (r.get("set_fine_amount") or "").strip()
            fine = float(f) if f.replace(".", "", 1).isdigit() else 0.0
            n += 1
            total += fine
            if year == latest_year:
                desc = re.sub(r"\s+", " ", (r.get("infraction_description") or "").strip().upper())
                infr[desc] += 1
                infr_fine.setdefault(desc, collections.Counter())[fine] += 1
                loc = (r.get("location2") or "").strip().upper()
                if loc:
                    addrs[re.sub(r"\s+", " ", loc)] += 1
                    streets[street_of(loc)] += 1
                try:
                    wd = datetime.date(int(d[:4]), int(d[4:6]), int(d[6:8])).weekday()
                except ValueError:
                    continue
                t = (r.get("time_of_infraction") or "").strip().zfill(4)
                if t.isdigit() and int(t[:2]) < 24:
                    grid[(wd, int(t[:2]))] += 1
                months[int(d[4:6])] += 1
        counts[year], fines[year] = n, total
        print(f"parking {year}: {n:,} tickets, ${total:,.0f}", file=sys.stderr)

    src_all = lambda what, how: {**open_data_source(pkg, latest_res["url"], what, how), "dataset": f"{pkg['title']} — {latest_year} file (and each earlier year's file)"}
    inputs = [open_data_source(pkg, r["url"], f"{y} file: all rows", "Counted with the other years as described.") for y, r in files[:-1]]
    yrs = [y for y, _ in files]
    S = {
        "tickets": series("tickets", "Parking tickets", "count", [point(y, counts[y]) for y in yrs], src_all("every row, by year of DATE_OF_INFRACTION", "Rows counted per year file."), inputs=inputs),
        "fines": series("fines", "Set fines on those tickets", "dollars", [point(y, round(fines[y])) for y in yrs], src_all("SET_FINE_AMOUNT, every row", "Sum of the set fine on each ticket. That's the fine as issued, not what was paid: tickets can be cancelled, disputed or paid late."), inputs=inputs),
    }
    lsrc = lambda what, how: open_data_source(pkg, latest_res["url"], what, how)
    common_fine = lambda d: infr_fine[d].most_common(1)[0][0]
    R = {
        "infractions": ranking("infractions", f"Most common tickets, {latest_year}", "count",
                               [{"label": d.capitalize(), "value": v, "sub": f"${common_fine(d):,.0f} fine"} for d, v in infr.most_common(12)],
                               lsrc("INFRACTION_DESCRIPTION, all rows", "Tickets counted per description; the fine shown is the most common SET_FINE_AMOUNT for it.")),
        "streets": ranking("streets", f"Most-ticketed streets, {latest_year}", "count",
                           [{"label": s.title(), "value": v} for s, v in streets.most_common(15)],
                           lsrc("LOCATION2, all rows", "Street name from LOCATION2 with the house number removed; tickets counted per street.")),
        "addresses": ranking("addresses", f"Most-ticketed addresses, {latest_year}", "count",
                             [{"label": a.title(), "value": v} for a, v in addrs.most_common(10)],
                             lsrc("LOCATION2, all rows", "Tickets counted per LOCATION2 exactly as written.")),
        "months": ranking("months", f"Tickets by month, {latest_year}", "count",
                          [{"label": m, "value": months[i + 1]} for i, m in enumerate(["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"])],
                          lsrc("DATE_OF_INFRACTION, all rows", "Tickets counted per month.")),
    }
    write(OUT, {"latestYear": latest_year, "series": S, "ranks": R,
                "grid": {"days": DAYS, "counts": [[grid[(d, h)] for h in range(24)] for d in range(7)],
                         "source": lsrc("DATE_OF_INFRACTION (weekday) and TIME_OF_INFRACTION (hour), all rows", "Tickets counted per weekday and hour.")}},
          "scripts/extract_parking.py")


if __name__ == "__main__":
    main()
