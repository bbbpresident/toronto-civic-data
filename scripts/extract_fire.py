"""
Fire incidents (lib/fire.json): every fire Toronto Fire Services responded to that counts as a fire under the
Ontario Fire Marshal's definition, 2011 on — how many, the harm, the causes, and whether smoke alarms worked.

  City of Toronto Open Data: fire-incidents ("Fire Incidents Data.csv")

Final_Incident_Type 01 (fire) and 02 (explosion) appear every year; 03 (no-loss outdoor fires) only from 2018, so
those are kept as their own series and left out of the cause rankings (their cause fields are blank). The City
says some incidents are withheld for privacy and that incomplete rows may be under investigation.
"""
import collections, datetime, os, re, statistics, sys

sys.path.insert(0, os.path.dirname(__file__))
from _common import csv_rows, open_data_source, package, point, ranking, resource, series, write

PKG = "fire-incidents"
OUT = os.path.join(os.path.dirname(__file__), "..", "lib", "fire.json")


def label(v):
    """'11 - Stove, Range-top burner' → 'Stove, range-top burner'; blanks → None."""
    v = re.sub(r"\s+", " ", (v or "").strip())
    v = re.sub(r"^\d+\s*-\s*", "", v)
    v = re.sub(r"\s*\(do not use for fire incidents\)", "", v, flags=re.I)
    if v.count("(") > v.count(")"):
        v += ")"  # some labels are cut off in the file
    return v[0].upper() + v[1:] if v else None


def num(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return 0.0


def main():
    pkg = package(PKG)
    res = resource(pkg, "Fire Incidents Data.csv")
    rows = [r for r in csv_rows(res["url"]) if r["TFS_Alarm_Time"][:4].isdigit()]
    years = sorted({r["TFS_Alarm_Time"][:4] for r in rows})
    year = years[-1]
    kind = lambda r: r["Final_Incident_Type"][:2]
    fires = collections.Counter(r["TFS_Alarm_Time"][:4] for r in rows if kind(r) in ("01", "02"))
    outdoor = collections.Counter(r["TFS_Alarm_Time"][:4] for r in rows if kind(r) == "03")
    hurt, loss, displaced = collections.Counter(), collections.Counter(), collections.Counter()
    resp = collections.defaultdict(list)
    for r in rows:
        y = r["TFS_Alarm_Time"][:4]
        hurt[y] += num(r["Civilian_Casualties"])
        loss[y] += num(r["Estimated_Dollar_Loss"])
        try:
            a = datetime.datetime.fromisoformat(r["TFS_Alarm_Time"]); b = datetime.datetime.fromisoformat(r["TFS_Arrival_Time"])
            m = (b - a).total_seconds() / 60
            if 0 <= m < 120:
                resp[y].append(m)
        except ValueError:
            pass
    src = lambda what, how: open_data_source(pkg, res["url"], what, how)
    first_outdoor = min(y for y in years if outdoor[y])
    S = {
        "fires": series("fires", "Fires and explosions", "count", [point(y, fires[y]) for y in years],
                        src("rows with Final_Incident_Type 01 (Fire) or 02 (Explosion)", "Counted per year of TFS_Alarm_Time.")),
        "outdoor": series("outdoor", "No-loss outdoor fires", "count", [point(y, outdoor[y] if y >= first_outdoor else None) for y in years],
                          src("rows with Final_Incident_Type 03 (no-loss outdoor fire)", f"Counted per year; these appear in the file only from {first_outdoor}.")),
        "casualties": series("casualties", "Civilian casualties", "count", [point(y, int(hurt[y])) for y in years],
                             src("Civilian_Casualties, all rows", "Summed per year. The file doesn't separate deaths from injuries.")),
        "loss": series("loss", "Estimated dollar loss", "dollars", [point(y, round(loss[y])) for y in years],
                       src("Estimated_Dollar_Loss, all rows", "Summed per year (Toronto Fire Services' estimate at the time).")),
        "response": series("response", "Median minutes from alarm to arrival", "count", [point(y, round(statistics.median(resp[y]), 1)) for y in years],
                           src("TFS_Alarm_Time and TFS_Arrival_Time, all rows", "Arrival minus alarm, in minutes; the median per year (gaps under 0 or over 2 hours left out).")),
    }
    yr = [r for r in rows if r["TFS_Alarm_Time"][:4] == year and kind(r) in ("01", "02")]
    count = lambda col, skip=(): collections.Counter(l for r in yr if (l := label(r[col])) and l not in skip)
    alarms = count("Smoke_Alarm_at_Fire_Origin")
    R = {
        "causes": ranking("causes", f"Possible causes, {year}", "count", [{"label": c, "value": v} for c, v in count("Possible_Cause").most_common(8)],
                          src(f"Possible_Cause, {year} fires and explosions", "Counted per cause; blanks left out.")),
        "sources": ranking("sources", f"What started them, {year}", "count",
                           [{"label": c, "value": v} for c, v in count("Ignition_Source", ("Undetermined", "Under Investigation", "Other")).most_common(12)],
                           src(f"Ignition_Source, {year} fires and explosions", "Counted per ignition source; blanks, undetermined, other and under investigation left out.")),
        "places": ranking("places", f"Where, {year}", "count", [{"label": c, "value": v} for c, v in count("Property_Use").most_common(12)],
                          src(f"Property_Use, {year} fires and explosions", "Counted per property use, with the code numbers removed.")),
        "alarms": ranking("alarms", f"Smoke alarms where the fire started, {year}", "count", [{"label": c, "value": v} for c, v in alarms.most_common()],
                          src(f"Smoke_Alarm_at_Fire_Origin, {year} fires and explosions", "Counted per answer; fires with no answer (mostly outside buildings) left out.")),
    }
    write(OUT, {"latestYear": year, "series": S, "ranks": R}, "scripts/extract_fire.py")


if __name__ == "__main__":
    main()
