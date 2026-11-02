"""
What's happening in the city, for the home page and its pages: the City's Festivals & Events
calendar (upcoming events), current road restrictions (construction and closures), and the ward
boundaries to draw them on a map. Writes lib/city.json.

All three are City of Toronto Open Data:
  - festivals-events: the calendar's JSON feed (~235 MB; one row per event occurrence)
  - road-restrictions: CART road restrictions v3 (JSON), real time
  - city-wards: the 25-ward boundaries (WGS84 GeoJSON), simplified and projected to SVG paths here

These change daily, unlike the rest of the site: rerun this (and commit) to refresh — see CLAUDE.md.
Aborts if a feed comes back empty or a ward count isn't 25.
"""
import json, math, os, re, sys
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.dirname(__file__))
from _common import TODAY, fetch, open_data_source, package, resource, write

OUT = os.path.join(os.path.dirname(__file__), "..", "lib", "city.json")
EVENT_DAYS = 120          # how far ahead the calendar reaches
ONGOING_DAYS = 4          # events spanning more days than this are "ongoing", not listed on every day
TZ = timezone(timedelta(hours=-5))


# ── Events ───────────────────────────────────────────────────────────────────

def first_location(e):
    locs = e.get("event_locations") or []
    if not locs:
        return None
    l = locs[0]
    name = (l.get("location_name") or "").strip()
    addr = (l.get("location_address") or "").strip()
    return name or addr.split(",")[0] or None


def events():
    pkg = package("festivals-events")
    res = next(r for r in pkg["resources"] if r["format"].upper() == "JSON")
    rows = json.loads(fetch(res["url"])).get("value", [])
    if not rows:
        sys.exit("festivals-events: feed is empty")
    start = TODAY
    end = TODAY + timedelta(days=EVENT_DAYS)
    items, index, days, ongoing = [], {}, {}, []
    for e in rows:
        if e.get("event_status") != "Approved" or not e.get("calendar_date"):
            continue
        cal = datetime.fromisoformat(e["calendar_date"]).date()
        if not (start <= cal <= end):
            continue
        s = datetime.fromisoformat(e["event_startdate"]) if e.get("event_startdate") else None
        f = datetime.fromisoformat(e["event_enddate"]) if e.get("event_enddate") else None
        span_days = (f.date() - s.date()).days if s and f else 0
        key = (e.get("event_name") or "").strip(), (s.date().isoformat() if s else "")
        if key not in index:
            index[key] = len(items)
            items.append({
                "name": key[0],
                "start": s.date().isoformat() if s else None,
                "end": f.date().isoformat() if f else None,
                "category": (e.get("event_category") or [None])[0],
                "free": e.get("free_event") == "Yes",
                "where": first_location(e),
                "url": e.get("event_website") or None,
                "about": (e.get("short_description") or "").strip() or None,
            })
            if span_days > ONGOING_DAYS:
                ongoing.append(index[key])
        i = index[key]
        if span_days <= ONGOING_DAYS:
            day = cal.isoformat()
            times = days.setdefault(day, [])
            if i not in times:
                times.append(i)
    if not items:
        sys.exit("festivals-events: no events in the window")
    ongoing.sort(key=lambda i: items[i]["end"] or "")
    print(f"events: {len(items)} in {EVENT_DAYS} days ({len(ongoing)} ongoing), {len(days)} days with events", file=sys.stderr)
    return {
        "from": start.isoformat(), "to": end.isoformat(), "items": items, "days": days, "ongoing": ongoing,
        "calendarUrl": "https://www.toronto.ca/explore-enjoy/festivals-events/festivals-events-calendar/",
        "submitUrl": "https://www.toronto.ca/explore-enjoy/festivals-events/festivals-events-calendar/festivals-and-events-calendar-submission/",
        "source": open_data_source(pkg, res["url"], f"value[] rows with calendar_date {start} to {end} and event_status Approved",
                                   f"One entry per event (name + start date). Events lasting more than {ONGOING_DAYS} days are listed as ongoing "
                                   "instead of on each day. Name, dates, category, free flag, first location and website as published."),
    }


# ── Wards → SVG paths ────────────────────────────────────────────────────────

W = 1000  # SVG width; height follows the city's shape


def simplify(pts, tol):
    """Douglas–Peucker on projected points."""
    if len(pts) < 3:
        return pts
    (x1, y1), (x2, y2) = pts[0], pts[-1]
    dx, dy = x2 - x1, y2 - y1
    norm = math.hypot(dx, dy) or 1e-9
    i, dmax = 0, -1.0
    for k in range(1, len(pts) - 1):
        d = abs(dy * pts[k][0] - dx * pts[k][1] + x2 * y1 - y2 * x1) / norm
        if d > dmax:
            i, dmax = k, d
    if dmax <= tol:
        return [pts[0], pts[-1]]
    return simplify(pts[: i + 1], tol)[:-1] + simplify(pts[i:], tol)


def simplify_ring(pts, tol):
    """A closed ring starts and ends at the same point, so split it at its farthest point and simplify each half."""
    if len(pts) < 4:
        return pts
    x0, y0 = pts[0]
    far = max(range(len(pts)), key=lambda i: (pts[i][0] - x0) ** 2 + (pts[i][1] - y0) ** 2)
    return simplify(pts[: far + 1], tol)[:-1] + simplify(pts[far:], tol)


def wards():
    pkg = package("city-wards")
    res = resource(pkg, "City Wards Data - 4326.geojson")
    gj = json.loads(fetch(res["url"]))
    feats = gj["features"]
    if len(feats) != 25:
        sys.exit(f"city-wards: expected 25 wards, got {len(feats)}")
    rings = []
    for f in feats:
        g = f["geometry"]
        polys = g["coordinates"] if g["type"] == "MultiPolygon" else [g["coordinates"]]
        rings.append((f["properties"], [p[0] for p in polys]))
    lons = [x for _, rs in rings for r in rs for x, _ in r]
    lats = [y for _, rs in rings for r in rs for _, y in r]
    lon0, lon1, lat0, lat1 = min(lons), max(lons), min(lats), max(lats)
    k = math.cos(math.radians((lat0 + lat1) / 2))
    scale = W / ((lon1 - lon0) * k)
    h = (lat1 - lat0) * scale

    def proj(lon, lat):
        return ((lon - lon0) * k * scale, (lat1 - lat) * scale)

    paths = []
    for props, rs in rings:
        d = ""
        for r in rs:
            pts = simplify_ring([proj(x, y) for x, y in r], 0.6)
            if len(pts) < 4:
                sys.exit(f"city-wards: ward {props.get('AREA_SHORT_CODE')} simplified to {len(pts)} points")
            d += "M" + "L".join(f"{x:.1f},{y:.1f}" for x, y in pts) + "Z"
        name = props.get("AREA_NAME") or props.get("AREA_DESC") or ""
        num = props.get("AREA_SHORT_CODE") or props.get("AREA_LONG_CODE")
        paths.append({"ward": str(num), "name": name, "d": d})
    projection = {"lon0": lon0, "lat1": lat1, "k": k, "scale": scale}
    return {
        "width": W, "height": round(h, 1), "paths": paths, "projection": projection,
        "source": open_data_source(pkg, res["url"], "features[] (25 wards)", "Boundaries simplified (Douglas–Peucker, 0.6 px) and projected to SVG for drawing; not for measuring."),
    }


# ── Road restrictions ────────────────────────────────────────────────────────

def option(v):
    """Some fields hold a fragment of embedded JSON ({"tabledata":[{"Option":"Toronto Water"…); take the Option."""
    if not v:
        return None
    m = re.search(r'"Option"\s*:\s*"([^"]+)"', v)
    return m.group(1) if m else v


def construction(proj):
    pkg = package("road-restrictions")
    res = resource(pkg, "Road Restrictions (Version 3) - JSON")
    rows = json.loads(fetch(res["url"])).get("Closure", [])
    if not rows:
        sys.exit("road-restrictions: feed is empty")
    now = datetime.now(timezone.utc).timestamp() * 1000
    items = []
    for c in rows:
        try:
            lat, lon = float(c["latitude"]), float(c["longitude"])
        except (TypeError, ValueError, KeyError):
            continue
        st = int(c["startTime"]) if c.get("startTime") else None
        en = int(c["endTime"]) if c.get("endTime") else None
        if st and st > now:
            continue  # not started yet
        x = (lon - proj["lon0"]) * proj["k"] * proj["scale"]
        y = (proj["lat1"] - lat) * proj["scale"]
        items.append({
            "id": c["id"], "type": c.get("type"), "road": (c.get("road") or "").strip(), "where": (c.get("name") or "").strip(),
            "district": (c.get("district") or "").title() or None, "by": option(c.get("workEventType")),
            "about": (c.get("description") or "").strip() or None,
            "from": datetime.fromtimestamp(st / 1000, TZ).date().isoformat() if st else None,
            "until": datetime.fromtimestamp(en / 1000, TZ).date().isoformat() if en else None,
            "x": round(x, 1), "y": round(y, 1),
        })
    items.sort(key=lambda i: (i["until"] or "9999", i["road"]))
    print(f"construction: {len(items)} current of {len(rows)} listed", file=sys.stderr)
    return {
        "items": items,
        "mapUrl": "https://www.toronto.ca/services-payments/streets-parking-transportation/road-restrictions-closures/restrictions-map/",
        "source": open_data_source(pkg, res["url"], "Closure[] that have started (startTime ≤ when generated)",
                                   "Each restriction's road, location, type (construction or road closed), who's doing the work, dates and point as published."),
    }


def main():
    w = wards()
    write(OUT, {"events": events(), "construction": construction(w.pop("projection")), "wards": w}, "scripts/extract_city.py")


if __name__ == "__main__":
    main()
