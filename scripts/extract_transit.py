"""
Rebuilds lib/transit.json: TTC ridership, revenue and accessibility.

  - annual rides (peak / off-peak, 2003–), monthly ridership, average weekday ridership, ridership revenue
                Toronto's Dashboard (City of Toronto Open Data), as reported by the TTC
  - average business-day trips, busiest day, elevators (2014–)
                the TTC's own Operating Statistics page for each year (ttc.ca)

    .venv/bin/python scripts/extract_transit.py
"""
import html, os, re, sys
from _common import dashboard, dashboard_annual, dashboard_measure, dashboard_series, fetch, open_data_source, point, series, source, write

OUT = os.path.join(os.path.dirname(__file__), "..", "lib", "transit.json")
TTC = "Toronto Transit Commission"
OPSTATS = "https://www.ttc.ca/transparency-and-accountability/Operating-Statistics"
NUM = r"([\d,]{5,})"


def page_lines(url):
    t = fetch(url).decode("utf-8", errors="replace")
    t = re.sub(r"<script.*?</script>|<style.*?</style>", "", t, flags=re.S)
    t = re.sub(r"</tr>|<br\s*/?>|</p>|</li>|</h\d>|</div>", "\n", t)
    t = html.unescape(re.sub(r"<[^>]+>", " ", t))
    t = re.sub(r"[ \t\xa0]+", " ", t)
    return [l.strip() for l in t.split("\n") if l.strip()]


def operating_statistics():
    index = fetch(OPSTATS).decode("utf-8", errors="replace")
    links = sorted(set(re.findall(r'href="(https://www\.ttc\.ca/transparency-and-accountability/Operating-Statistics/[^"]*?(20\d\d))"', index)), key=lambda x: x[1])
    if len(links) < 10:
        sys.exit(f"TTC Operating Statistics: expected a page per year, found {links}")
    fares, boardings, busiest, elevators = [], [], [], []
    for url, year in links:
        L = page_lines(url)
        f = [re.search(NUM, l).group(1) for l in L if "Revenue Passengers (Fares Collected)" in l and re.search(NUM, l)]
        b = [re.search(NUM, l).group(1) for l in L if "Revenue Passengers and Transfer Fares" in l and re.search(NUM, l)]
        h = [re.search(NUM, l).group(1) for l in L if re.search(r"(?i)highest (one|1)-day ridership", l) and re.search(NUM, l)]
        e = [re.search(r"Number of Elevators\D*(\d+)", l).group(1) for l in L if l.startswith("Number of Elevators")]
        if not f or not b or not e:
            sys.exit(f"TTC {year}: couldn't find the System Quick Facts figures on {url}")
        n = lambda s: int(s.replace(",", ""))
        fares.append((year, url, n(f[0])))
        boardings.append((year, url, n(b[0])))
        busiest.append((year, url, n(h[0]) if h else None))
        elevators.append((year, url, int(e[0])))

    def mk(id, label, rows, locator, note=None):
        # Each year comes from its own page; the source points at the index of pages and names the pattern.
        src = source(TTC, "Operating Statistics (one page per year)", OPSTATS, OPSTATS, locator,
                     "Value as published on each year's page: " + ", ".join(f"{y} {u}" for y, u, _ in rows))
        return series(id, label, "count", [point(y, v) for y, u, v in rows], src, note=note)

    return {
        "businessDayFares": mk("businessDayFares", "Fares collected", fares, '"1. System Quick Facts" › Daily Trips (Average Business Day) › "Revenue Passengers (Fares Collected)" (first, system-wide figure)'),
        "businessDayBoardings": mk("businessDayBoardings", "Including transfers", boardings, '"1. System Quick Facts" › Daily Trips (Average Business Day) › "Revenue Passengers and Transfer Fares" (first, system-wide figure)'),
        "busiestDay": mk("busiestDay", "Busiest day", busiest, '"1. System Quick Facts" › "highest 1-day ridership"', "2018's page doesn't state a busiest day."),
        "elevators": mk("elevators", "Elevators in service", elevators, '"Rail Transit Quick Facts" › "Number of Elevators"'),
    }


def annual_rides():
    """Peak + off-peak rides per year (the Dashboard states both in thousands)."""
    pkg, url, _ = dashboard()
    peak = {r["year"]: float(r["measure_value"]) * 1000 for r in dashboard_measure("TTC Annual Passenger Rides Peak (000s)")}
    off = {r["year"]: float(r["measure_value"]) * 1000 for r in dashboard_measure("TTC Annual Passenger Rides Non-Peak (000s)")}
    years = sorted(set(peak) & set(off))
    src = open_data_source(pkg, url, 'measure_name = "TTC Annual Passenger Rides Peak (000s)" and "TTC Annual Passenger Rides Non-Peak (000s)"; origin as stated in the file: Source: Toronto Transit Commission',
                           "Peak + non-peak for each year, × 1,000 (the file states both in thousands).")
    return series("annualRides", "Annual rides", "count", [point(int(y), peak[y] + off[y]) for y in years], src,
                  note="The file's definitions: peak is the weekday a.m. rush (start of service to 08:59) and p.m. rush (15:00–18:59); off-peak is weekdays 09:00–14:59 and 19:00 to end of service, plus weekends and holidays.")


def main():
    out = {}
    print("… Toronto's Dashboard", file=sys.stderr)
    out["annualRides"] = annual_rides()
    out["ridesPeak"] = dashboard_series("TTC Annual Passenger Rides Peak (000s)", "ridesPeak", "Peak", "count", scale=1000)
    out["ridesOffPeak"] = dashboard_series("TTC Annual Passenger Rides Non-Peak (000s)", "ridesOffPeak", "Off-peak", "count", scale=1000)
    out["monthlyRidership"] = dashboard_series("TTC Monthly Ridership", "monthlyRidership", "Monthly ridership", "count",
                                               note="The TTC notes that January and December figures may include an extra partial week.")
    out["weekdayRidership"] = dashboard_series("TTC Average Weekday Ridership", "weekdayRidership", "Average weekday ridership", "count")
    out["ridershipRevenue"] = dashboard_annual("TTC Ridership Revenues", "ridershipRevenue", "Ridership revenue", "dollars")
    print("… TTC Operating Statistics pages", file=sys.stderr)
    out.update(operating_statistics())
    write(OUT, {"series": out}, "scripts/extract_transit.py")


if __name__ == "__main__":
    main()
