"""
TOday's Sunday map question: a bank of well-known Toronto places to find on a blank map, each with its
location from an official source. Writes lib/places.json.

  - landmarks, parks: City of Toronto Open Data, Places of Interest and Toronto Attractions (points)
  - neighbourhoods: Open Data, Neighbourhoods (the City's 158, outlines)
  - districts: Open Data, Business Improvement Areas (a curated list of well-known ones, outlines)
  - subway stations: TTC Routes and Schedules (GTFS), every stop on subway lines 1, 2 and 4, averaged per station
  - beaches: Open Data, Toronto Beaches Water Quality (one point per beach)
The blank map is the 25-ward outline from extract_city.py's ward boundaries, in the same projection, so
places sit where they belong. Aborts if a curated name isn't found or a kind comes back empty.
"""
import csv, io, json, math, os, re, sys, zipfile

sys.path.insert(0, os.path.dirname(__file__))
from _common import fetch, open_data_source, package, write
import extract_city

OUT = os.path.join(os.path.dirname(__file__), "..", "lib", "places.json")
CKAN = "https://ckan0.cf.opendata.inter.prod-toronto.ca/api/3/action"

LANDMARK_CATEGORIES = {"Landmark", "Attraction", "Museum", "Gallery", "Sports / Entertainment Venue", "Garden / Conservatory", "Transportation"}
PARK_CATEGORIES = {"Nature/ Park", "Featured Park"}
DISTRICTS = [
    "Kensington Market", "Chinatown", "Korea Town", "Little Italy", "Little Portugal Toronto", "Greektown on the Danforth",
    "Gerrard India Bazaar", "Corso Italia", "Liberty Village", "Bloor-Yorkville", "Church-Wellesley Village", "Financial District",
    "Leslieville", "Roncesvalles Village", "The Junction", "The Beach", "Queen Street West", "West Queen West", "Ossington Avenue",
    "Cabbagetown", "Parkdale Village", "Bloor West Village", "Forest Hill Village", "Old Town Toronto", "Riverside District",
    "Trinity-Bellwoods", "CityPlace and Fort York", "Mirvish Village", "The Kingsway", "Yonge & St. Clair", "Midtown Yonge",
    "Yonge North York", "Downtown Yonge", "Danforth Village", "Harbord Street",
]
DISPLAY = {"Korea Town": "Koreatown", "Little Portugal Toronto": "Little Portugal"}
# The TTC's schedule data names each platform: Bloor-Yonge appears as "Bloor" (Line 1) and "Yonge" (Line 2).
STATION_MERGE = {"Bloor Station": "Bloor-Yonge Station", "Yonge Station": "Bloor-Yonge Station"}
STATION_CASE = {"Tmu Station": "TMU Station"}


def in_ring(x, y, ring):
    inside = False
    for (x1, y1), (x2, y2) in zip(ring, ring[1:] + ring[:1]):
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1:
            inside = not inside
    return inside


def records(pkg_name):
    pkg = package(pkg_name)
    res = next(r for r in pkg["resources"] if r.get("datastore_active"))
    url = f"{CKAN}/datastore_search?id={res['id']}&limit=32000"
    return pkg, url, json.loads(fetch(url))["result"]["records"]


def main():
    wards = extract_city.wards()
    proj = wards.pop("projection")
    k, scale, lon0, lat1 = proj["k"], proj["scale"], proj["lon0"], proj["lat1"]

    def xy(lon, lat):
        return [round((lon - lon0) * k * scale, 1), round((lat1 - lat) * scale, 1)]

    def rings_of(geom):
        g = json.loads(geom) if isinstance(geom, str) else geom
        polys = g["coordinates"] if g["type"] == "MultiPolygon" else [g["coordinates"]]
        out = []
        for poly in polys:
            pts = [tuple(xy(lon, lat)) for lon, lat in poly[0]]
            simple = extract_city.simplify_ring(pts, 1.0)
            if len(simple) >= 4:
                out.append([[x, y] for x, y in simple])
        return out

    # Toronto's outline (the ward rings, parsed back from the SVG paths), to drop places outside the city.
    ward_rings = [[tuple(map(float, pt.split(","))) for pt in ring.split("L")] for d in (p["d"] for p in wards["paths"])
                  for ring in d.strip("Z").split("Z") if ring for ring in [ring.lstrip("M")]]
    near_km = 0.5  # beaches are sampled a few metres out in the lake, so "in the city" includes 500 m past the shoreline

    def seg_dist(px, py, a, b):
        dx, dy = b[0] - a[0], b[1] - a[1]
        t = max(0, min(1, ((px - a[0]) * dx + (py - a[1]) * dy) / ((dx * dx + dy * dy) or 1)))
        return math.hypot(px - (a[0] + t * dx), py - (a[1] + t * dy))

    def in_city(pt):
        if any(in_ring(pt[0], pt[1], r) for r in ward_rings):
            return True
        near = min(seg_dist(pt[0], pt[1], r[i - 1], r[i]) for r in ward_rings for i in range(1, len(r)))
        return near * (111.32 / scale) <= near_km

    places, sources = [], {}

    # Landmarks and parks (points)
    pkg, url, rows = records("places-of-interest-and-toronto-attractions")
    for kind, cats in (("landmark", LANDMARK_CATEGORIES), ("park", PARK_CATEGORIES)):
        n = 0
        for r in rows:
            name = (r.get("NAME") or "").strip()
            if r.get("CATEGORY") not in cats or not name or re.match(r"^\d", name):
                continue
            lon, lat = json.loads(r["geometry"])["coordinates"]
            places.append({"id": f"{kind}-{r['_id']}", "kind": kind, "name": name, "point": xy(lon, lat)})
            n += 1
        if not n:
            sys.exit(f"places: no {kind}s")
        sources[kind] = open_data_source(pkg, url, f"records with CATEGORY in {sorted(cats)}", "Each place's point as published (names starting with a street number left out).")

    # Neighbourhoods (outlines)
    pkg, url, rows = records("neighbourhoods")
    if len(rows) != 158:
        sys.exit(f"places: expected 158 neighbourhoods, got {len(rows)}")
    for r in rows:
        places.append({"id": f"neighbourhood-{r['AREA_SHORT_CODE']}", "kind": "neighbourhood", "name": r["AREA_NAME"].strip(), "rings": rings_of(r["geometry"])})
    sources["neighbourhood"] = open_data_source(pkg, url, "all 158 neighbourhoods", "Outlines simplified (Douglas–Peucker, 1 px) and projected onto the ward map.")

    # Districts: well-known business improvement areas (outlines)
    pkg, url, rows = records("business-improvement-areas")
    by_name = {r["AREA_NAME"].strip(): r for r in rows}
    missing = [d for d in DISTRICTS if d not in by_name]
    if missing:
        sys.exit(f"places: districts not found: {missing}")
    for d in DISTRICTS:
        r = by_name[d]
        places.append({"id": f"district-{r['AREA_SHORT_CODE']}", "kind": "district", "name": DISPLAY.get(d, d), "rings": rings_of(r["geometry"])})
    sources["district"] = open_data_source(pkg, url, f"{len(DISTRICTS)} business improvement areas chosen as well-known districts", "Outlines simplified and projected onto the ward map.")

    # Beaches (one point per beach)
    pkg, url, rows = records("toronto-beaches-water-quality")
    beaches = {}
    for r in rows:
        if r.get("beachName") and r.get("geometry") and r["beachName"] not in beaches:
            lon, lat = json.loads(r["geometry"])["coordinates"]
            beaches[r["beachName"].strip()] = (lon, lat)
    for i, (name, (lon, lat)) in enumerate(sorted(beaches.items())):
        places.append({"id": f"beach-{i}", "kind": "beach", "name": name, "point": xy(lon, lat)})
    sources["beach"] = open_data_source(pkg, url, "the first sampling point listed for each beachName", "One point per beach (where the City samples its water).")

    # Subway stations: every stop on routes of type 1 (subway), averaged per station name
    pkg = package("ttc-routes-and-schedules")
    zres = next(r for r in pkg["resources"] if r["format"].upper() == "ZIP")
    z = zipfile.ZipFile(io.BytesIO(fetch(zres["url"])))
    read = lambda f: csv.DictReader(io.TextIOWrapper(z.open(f), "utf-8-sig"))
    subway_routes = {r["route_id"] for r in read("routes.txt") if r["route_type"] == "1"}
    trips = {r["trip_id"] for r in read("trips.txt") if r["route_id"] in subway_routes}
    stop_ids = {r["stop_id"] for r in read("stop_times.txt") if r["trip_id"] in trips}
    stations = {}
    for s in read("stops.txt"):
        if s["stop_id"] in stop_ids:
            base = re.split(r"\s+-\s+", s["stop_name"])[0].strip()
            base = re.sub(r"\s+Station$", "", base, flags=re.I).title().replace("'S", "'s") + " Station"
            base = STATION_CASE.get(base, base)
            base = STATION_MERGE.get(base, base)
            stations.setdefault(base, []).append((float(s["stop_lon"]), float(s["stop_lat"])))
    if len(stations) < 60:
        sys.exit(f"places: only {len(stations)} subway stations")
    for i, (name, pts) in enumerate(sorted(stations.items())):
        lon = sum(p[0] for p in pts) / len(pts)
        lat = sum(p[1] for p in pts) / len(pts)
        places.append({"id": f"station-{i}", "kind": "station", "name": name, "point": xy(lon, lat)})
    sources["station"] = {**open_data_source(pkg, zres["url"], "stops.txt rows served by trips on routes with route_type 1 (Lines 1, 2 and 4)",
                                             "Each station's platforms averaged into one point. Bloor and Yonge platforms are one station (Bloor-Yonge); "
                                             "stations outside Toronto (in Vaughan) are left out."), "member": "stops.txt"}

    outside = [p["name"] for p in places if p.get("point") and not in_city(p["point"])]
    if outside:
        print(f"places: dropped, outside Toronto: {outside}", file=sys.stderr)
    places = [p for p in places if not (p.get("point") and not in_city(p["point"]))]
    counts = {}
    for p in places:
        counts[p["kind"]] = counts.get(p["kind"], 0) + 1
    print(f"places: {counts}", file=sys.stderr)
    write(OUT, {
        "map": {"width": wards["width"], "height": wards["height"], "paths": [p["d"] for p in wards["paths"]],
                "kmPerUnit": round(111.32 / scale, 5), "source": wards["source"]},
        "places": places, "sources": sources,
    }, "scripts/extract_places.py")


if __name__ == "__main__":
    main()
