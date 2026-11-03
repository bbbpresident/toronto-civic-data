"""
The home page map's views: one file per view in public/layers/<id>.json (fetched by the map only when
that view is chosen), plus lib/layers.json, the list of views with their sources. Every feature comes
from an official dataset and carries that dataset's citation. Uses the same projection as the ward map
(extract_city.py), so all views and TOday's map line up.

  City of Toronto Open Data: tpl branch information, green-spaces, parks-and-recreation-facilities,
  cycling-network, school-locations-all-types, licensed-child-care-centres, fire-/ambulance-station-locations,
  police-facility-locations, public-art, city-operated EV charging, neighbourhoods + neighbourhood-profiles (2021 census, 158 model)
  TTC Routes and Schedules (GTFS): subway, streetcar and bus route paths (shapes.txt), subway stations
  Bike Share Toronto: GBFS station_information (linked from Open Data)
  lib/city.json: road restrictions (extract_city.py)

Needs openpyxl (the 2021 neighbourhood profiles are an xlsx). Aborts if a view comes back empty or a
census neighbourhood doesn't match a boundary.
"""
import csv, io, json, math, os, re, sys, zipfile

sys.path.insert(0, os.path.dirname(__file__))
from _common import fetch, open_data_source, package, source, write
import extract_city

ROOT = os.path.join(os.path.dirname(__file__), "..")
OUT_DIR = os.path.join(ROOT, "public", "layers")
INDEX = os.path.join(ROOT, "lib", "layers.json")
CKAN = "https://ckan0.cf.opendata.inter.prod-toronto.ca/api/3/action"
C = ["var(--s1)", "var(--s2)", "var(--s3)", "var(--s4)", "var(--s5)", "var(--s6)"]

wards = extract_city.wards()
PROJ = wards.pop("projection")


def xy(lon, lat):
    return [round((lon - PROJ["lon0"]) * PROJ["k"] * PROJ["scale"], 1), round((PROJ["lat1"] - lat) * PROJ["scale"], 1)]


def path_of(coords, tol=1.0, closed=False):
    pts = [tuple(xy(lon, lat)) for lon, lat in coords]
    pts = extract_city.simplify_ring(pts, tol) if closed else extract_city.simplify(pts, tol)
    if len(pts) < 2:
        return ""
    return "M" + "L".join(f"{x:g},{y:g}" for x, y in pts) + ("Z" if closed else "")


def records(pkg_name, resource_name=None):
    pkg = package(pkg_name)
    res = next(r for r in pkg["resources"] if (r["name"] == resource_name if resource_name else r.get("datastore_active")))
    out, offset = [], 0
    while True:
        url = f"{CKAN}/datastore_search?id={res['id']}&limit=32000&offset={offset}"
        page = json.loads(fetch(url))["result"]
        out += page["records"]
        offset += len(page["records"])
        if not page["records"] or offset >= page["total"]:
            break
    return pkg, f"{CKAN}/datastore_search?id={res['id']}", out


def point(r, lon_key=None, lat_key=None):
    if lon_key:
        try:
            return xy(float(r[lon_key]), float(r[lat_key]))
        except (TypeError, ValueError):
            return None
    g = json.loads(r["geometry"]) if r.get("geometry") else None
    if not g:
        return None
    c = g["coordinates"]
    if g["type"] == "MultiPoint":
        c = c[0]
    return xy(c[0], c[1])


index = []


def km_of(coords):
    """Length of a line of (lon, lat) points, in km (haversine)."""
    total = 0.0
    for (lo1, la1), (lo2, la2) in zip(coords, coords[1:]):
        p1, p2 = math.radians(la1), math.radians(la2)
        a = math.sin((p2 - p1) / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(math.radians(lo2 - lo1) / 2) ** 2
        total += 6371.0088 * 2 * math.asin(math.sqrt(a))
    return total


def area_km2_of(polys):
    """Area of polygons [[outer, holes…], …] of (lon, lat), in km², in the map's projection (near equal-area at city scale)."""
    def ring(r):
        pts = [xy(lon, lat) for lon, lat in r]
        return abs(sum(x1 * y2 - x2 * y1 for (x1, y1), (x2, y2) in zip(pts, pts[1:] + pts[:1]))) / 2
    return sum(ring(p[0]) - sum(ring(h) for h in p[1:]) for p in polys) * (111.32 / PROJ["scale"]) ** 2


def ordinal(n):
    return f"{n}{'th' if 10 <= n % 100 <= 20 else {1: 'st', 2: 'nd', 3: 'rd'}.get(n % 10, 'th')}"


def ranks(values):
    """1 = largest; ties share a rank."""
    order = sorted(set(v for v in values if v is not None), reverse=True)
    pos = {v: i + 1 for i, v in enumerate(order)}
    return [pos.get(v) for v in values]


def n0(v):
    return f"{round(v):,}"


# Short names for the map's buttons (the blurb says the rest).
SHORT = {"subway": "Rapid transit", "streetcar": "Streetcars", "bus": "Buses", "cycling": "Bike lanes", "bikeshare": "Bike Share",
         "parks": "Green space", "facilities": "Facilities", "libraries": "Libraries", "schools": "Schools", "childcare": "Child care",
         "emergency": "Emergency", "ev": "EV chargers", "art": "Public art", "construction": "Construction", "homes": "Homes", "density": "Density"}


def save(view, title, blurb, group, data, sources, note=None):
    title = SHORT.get(view, title)
    if not data.get("items"):
        sys.exit(f"layers: {view} is empty")
    data = {"id": view, "title": title, **data}
    os.makedirs(OUT_DIR, exist_ok=True)
    with open(os.path.join(OUT_DIR, f"{view}.json"), "w") as f:
        json.dump(data, f, separators=(",", ":"), ensure_ascii=False)
    size = os.path.getsize(os.path.join(OUT_DIR, f"{view}.json"))
    index.append({"id": view, "title": title, "blurb": blurb, "group": group, "count": len(data["items"]), "bytes": size, "sources": sources, **({"note": note} if note else {})})
    print(f"  {view}: {len(data['items'])} features, {size // 1024} KB", file=sys.stderr)


def simple_points(view, title, blurb, group, pkg_name, name_of, group_of=None, groups=None, lonlat=None, note=None, extra=None, info=None, rank_by=None, rank_words=None):
    """Points from one dataset. info(r) gives the facts shown when a point is tapped; rank_by(r) adds "Nth <rank_words> of M"."""
    pkg, url, rows = records(pkg_name)
    items, infos, rank_vals = [], [], []
    for r in rows:
        p = point(r, *(lonlat or (None, None)))
        if not p:
            continue
        g = group_of(r) if group_of else 0
        if g is None:
            continue
        item = [p[0], p[1], g, name_of(r)]
        if extra:
            item.append(extra(r))
        items.append(item)
        infos.append(info(r) if info else "")
        rank_vals.append(rank_by(r) if rank_by else None)
    if rank_by:
        rk, m = ranks(rank_vals), sum(1 for v in rank_vals if v is not None)
        infos = [f"{t}{' · ' if t else ''}{ordinal(k)} {rank_words} of {m:,}" if k else t for t, k in zip(infos, rk)]
    save(view, title, blurb, group, {"type": "points", "groups": groups or [{"label": title, "color": C[0]}], "items": items, "info": infos},
         [open_data_source(pkg, url, "all records with a location", "Each record's point as published.")], note)


def main():
    # ── TTC (GTFS) ──────────────────────────────────────────────────────────
    pkg = package("ttc-routes-and-schedules")
    zres = next(r for r in pkg["resources"] if r["format"].upper() == "ZIP")
    z = zipfile.ZipFile(io.BytesIO(fetch(zres["url"])))
    read = lambda f: csv.DictReader(io.TextIOWrapper(z.open(f), "utf-8-sig"))
    routes = {r["route_id"]: r for r in read("routes.txt")}
    shape_of_route = {}
    for t in read("trips.txt"):
        shape_of_route.setdefault(t["route_id"], set()).add(t["shape_id"])
    shapes = {}
    for s in read("shapes.txt"):
        shapes.setdefault(s["shape_id"], []).append((int(s["shape_pt_sequence"]), float(s["shape_pt_lon"]), float(s["shape_pt_lat"])))
    gtfs_src = lambda what: {**open_data_source(pkg, zres["url"], what, "Each route's longest path from shapes.txt, simplified for drawing; "
                                                "length measured on the full path; stops counted on a trip that follows it."), "member": "shapes.txt"}
    trip_route, trip_shape = {}, {}
    for t in read("trips.txt"):
        trip_route[t["trip_id"]], trip_shape[t["trip_id"]] = t["route_id"], t["shape_id"]
    trip_stops, stop_routes = {}, {}
    for st in read("stop_times.txt"):
        trip_stops[st["trip_id"]] = trip_stops.get(st["trip_id"], 0) + 1
        stop_routes.setdefault(st["stop_id"], set()).add(trip_route.get(st["trip_id"]))
    stops_on_shape = {}
    for t, n in trip_stops.items():
        sh = trip_shape.get(t)
        stops_on_shape[sh] = max(stops_on_shape.get(sh, 0), n)

    # Rapid transit: the subway (route_type 1) plus the LRT lines, which the TTC files as route_type 0 (Lines 5 and 6).
    is_rapid = lambda r: r["route_type"] == "1" or (r["route_type"] == "0" and r["route_long_name"].startswith("Line "))

    def route_lines(route_type, tol, keep=lambda r: True, noun="routes"):
        items, groups, facts = [], [], []
        for rid, r in sorted(routes.items(), key=lambda kv: (len(kv[1]["route_short_name"]), kv[1]["route_short_name"])):
            if (r["route_type"] != route_type and route_type != "rapid") or rid not in shape_of_route or not keep(r):
                continue
            sid = max((s for s in shape_of_route[rid] if s in shapes), key=lambda s: len(shapes[s]), default=None)
            if not sid:
                continue
            longest = shapes[sid]
            coords = [(lon, lat) for _, lon, lat in sorted(longest)]
            label = r["route_long_name"] if r["route_long_name"].startswith("Line ") else f"{r['route_short_name']} {r['route_long_name']}".strip()
            color = f"#{r['route_color']}" if r.get("route_color") and r["route_color"] not in ("000000", "FFFFFF") else None
            groups.append({"label": label, "color": color or (C[0] if route_type == "3" else C[1])})
            items.append([len(groups) - 1, label, path_of(coords, tol)])
            facts.append((km_of(coords), stops_on_shape.get(sid, 0)))
        rk = ranks([round(k, 2) for k, _ in facts])
        info = [f"{k:.1f} km long · {n} stops · {ordinal(r)} longest of {len(facts)} {noun}" for (k, n), r in zip(facts, rk)]
        return items, groups, info

    items, groups, info = route_lines("rapid", 0.8, is_rapid, "lines")
    # stations: platforms averaged per station (Bloor + Yonge = Bloor-Yonge)
    subway = {rid for rid, r in routes.items() if is_rapid(r)}
    trip_ids = set()
    for t in read("trips.txt"):
        if t["route_id"] in subway:
            trip_ids.add(t["trip_id"])
    stop_ids = {st["stop_id"] for st in read("stop_times.txt") if st["trip_id"] in trip_ids}
    stations, station_lines = {}, {}
    for s in read("stops.txt"):
        if s["stop_id"] in stop_ids:
            name = re.split(r"\s+-\s+", s["stop_name"])[0].strip()
            name = re.sub(r"\s*\b((East|West|North|South)bound|LRT) Platform\b", "", name, flags=re.I)  # LRT stops name each platform
            base = re.sub(r"\s+Station$", "", name.strip(), flags=re.I).title().replace("'S", "'s")
            base = {"Bloor": "Bloor-Yonge", "Yonge": "Bloor-Yonge", "Tmu": "TMU"}.get(base, base)
            stations.setdefault(base, []).append((float(s["stop_lon"]), float(s["stop_lat"])))
            for rid in stop_routes.get(s["stop_id"], ()):
                if rid in subway:
                    station_lines.setdefault(base, set()).add(routes[rid]["route_short_name"])
    stops = [[*xy(sum(p[0] for p in v) / len(v), sum(p[1] for p in v) / len(v)), f"{k} Station"] for k, v in sorted(stations.items())]
    def lines_of(k):
        ls = sorted(station_lines.get(k, ()), key=lambda x: int(x) if x.isdigit() else 99)
        return f"Line {ls[0]}" if len(ls) == 1 else f"Lines {', '.join(ls[:-1])} and {ls[-1]} (interchange)" if ls else ""
    stop_info = [lines_of(k) for k, _ in sorted(stations.items())]
    save("subway", "TTC rapid transit", "Subway Lines 1, 2 and 4 and LRT Lines 5 (Eglinton) and 6 (Finch West), in their own colours, with every station.", "Getting around",
         {"type": "lines", "groups": groups, "items": items, "stops": stops, "info": info, "stopInfo": stop_info},
         [gtfs_src("routes with route_type 1 (subway) and the route_type 0 routes named 'Line …' (LRT Lines 5 and 6); stations from stops.txt")])
    items, groups, info = route_lines("0", 1.0, lambda r: not is_rapid(r))
    save("streetcar", "Streetcar routes", "Every streetcar route's path.", "Getting around", {"type": "lines", "groups": groups, "items": items, "info": info},
         [gtfs_src("routes with route_type 0 (streetcar), other than LRT Lines 5 and 6")])
    items, groups, info = route_lines("3", 1.6)
    for g in groups:
        g["color"] = C[0]
    save("bus", "Bus routes", "Every bus route's path (one per route).", "Getting around", {"type": "lines", "groups": groups, "items": items, "uniform": True, "info": info},
         [gtfs_src("routes with route_type 3 (bus)")])

    # ── Cycling ─────────────────────────────────────────────────────────────
    pkg, url, rows = records("cycling-network")
    kinds = {"Trail": ("Trails", C[2]), "Lane": ("Bike lanes", C[0]), "Track": ("Cycle tracks (separated)", C[5]), "Sharrow": ("Shared lanes (sharrows)", C[3])}
    order = list(kinds)
    items, info = [], []
    for r in rows:
        infra = r.get("INFRA_HIGHORDER") or ""
        k = next((k for k in order if k.lower() in infra.lower()), None)
        if not k or not r.get("geometry"):
            continue
        g = json.loads(r["geometry"])
        lines = g["coordinates"] if g["type"] == "MultiLineString" else [g["coordinates"]]
        yr = lambda f: str(r.get(f) or "").strip() if str(r.get(f) or "").strip() not in ("", "None", "0") else None
        for line in lines:
            d = path_of(line, 0.8)
            if d:
                km = km_of(line)
                inst = yr("INSTALLED")
                # [kind, street, path, installed year (0 if none), km]: the year and length drive the map's "watch it grow" playback
                items.append([order.index(k), (r.get("STREET_NAME") or "").strip(), d, int(inst) if inst and inst.isdigit() else 0, round(km, 3)])
                info.append(" · ".join(x for x in [f"{km * 1000:,.0f} m" if km < 1 else f"{km:.1f} km", infra.strip(),
                                                    f"installed {yr('INSTALLED')}" if yr("INSTALLED") else "", f"upgraded {yr('UPGRADED')}" if yr("UPGRADED") else ""] if x))
    save("cycling", "Bike lanes and trails", "The cycling network: trails, bike lanes, separated cycle tracks and shared lanes.", "Getting around",
         {"type": "lines", "groups": [{"label": kinds[k][0], "color": kinds[k][1]} for k in order], "items": items, "info": info},
         [open_data_source(pkg, url, "all segments, grouped by INFRA_HIGHORDER", "Each segment's line, simplified for drawing.")])

    # ── Bike Share (GBFS) ───────────────────────────────────────────────────
    bpkg = package("bike-share-toronto")
    gbfs_url = next(r["url"] for r in bpkg["resources"] if "gbfs" in r["name"])
    feeds = json.loads(fetch(gbfs_url))["data"]["en"]["feeds"]
    si_url = next(f["url"] for f in feeds if f["name"] == "station_information")
    st = json.loads(fetch(si_url))["data"]["stations"]
    st = [x for x in st if x.get("lon")]
    items = [[*xy(x["lon"], x["lat"]), 0, x["name"]] for x in st]
    caps = [x.get("capacity") for x in st]
    rk = ranks(caps)
    info = [f"{c} docks · {ordinal(k)} biggest of {len(st):,}" if c else "" for c, k in zip(caps, rk)]
    save("bikeshare", "Bike Share stations", "Every Bike Share Toronto station.", "Getting around",
         {"type": "points", "groups": [{"label": "Bike Share station", "color": C[2]}], "items": items, "info": info},
         [source("Bike Share Toronto (via City of Toronto Open Data)", bpkg["title"], f"https://open.toronto.ca/dataset/{bpkg['name']}/", si_url,
                 "data.stations[]", "Each station's location and capacity (docks) as published in the GBFS station_information feed.")])

    # ── Parks ───────────────────────────────────────────────────────────────
    pkg, url, rows = records("green-spaces")
    items, areas = [], []
    for r in rows:
        g = json.loads(r["geometry"]) if r.get("geometry") else None
        if not g:
            continue
        polys = g["coordinates"] if g["type"] == "MultiPolygon" else [g["coordinates"]]
        d = "".join(path_of(p[0], 1.0, closed=True) for p in polys)
        if d.count("L") >= 3:
            items.append([0, (r.get("AREA_NAME") or "").title(), d])
            areas.append(area_km2_of(polys) * 100)  # hectares
    rk = ranks([round(a, 2) for a in areas])
    info = [f"{a:,.1f} hectares ({a / 100:.2f} km²) · {ordinal(k)} largest of {len(areas):,}" if a >= 1 else f"{a * 10000:,.0f} m² · {ordinal(k)} largest of {len(areas):,}"
            for a, k in zip(areas, rk)]
    save("parks", "Parks and green space", "Every park and green space the City maps.", "Green space and recreation",
         {"type": "areas", "groups": [{"label": "Park / green space", "color": C[2]}], "items": items, "info": info},
         [open_data_source(pkg, url, "all green spaces", "Outlines simplified (1 px) for drawing; tiny slivers dropped. Area measured on the full outline.")])

    # ── Facilities ──────────────────────────────────────────────────────────
    pkg, url, rows = records("parks-and-recreation-facilities")
    amen = ["Tennis Court", "Basketball Court", "Sports Field", "Pickleball Court", "Ball Diamond", "Playground", "Dog Off-Leash Area",
            "Skateboarding", "Outdoor Fitness Equipment", "Outdoor Ping Pong/Table Tennis", "Washroom", "Cricket Pitch Field", "Outdoor Track", "Wi-Fi"]
    types = ["Park", "Community Centre", "Civic Centre"]
    items, info = [], []
    for r in rows:
        p = point(r)
        have = [re.sub(r"\s*\(\d+\)$", "", a).strip() for a in re.split(r",\s*", r.get("AMENITIES") or "")]
        mask = sum(1 << i for i, a in enumerate(amen) if a in have)
        if p:
            items.append([p[0], p[1], types.index(r["TYPE"]) if r.get("TYPE") in types else 0, (r.get("ASSET_NAME") or "").title(), mask])
            listed = [a for a in re.split(r",\s*", r.get("AMENITIES") or "") if a and a != "None"]
            info.append(f"Has: {', '.join(listed)}" if listed else "No amenities listed")
    save("facilities", "Public facilities", "Parks and community centres, filterable by what they have: courts, fields, playgrounds and more.", "Green space and recreation",
         {"type": "points", "groups": [{"label": t, "color": c} for t, c in zip(types, [C[2], C[0], C[5]])], "items": items, "amenities": amen, "info": info},
         [open_data_source(pkg, url, "all parks and community centres", "Each location's point and its AMENITIES list as published.")])

    # ── Services (points) ───────────────────────────────────────────────────
    simple_points("libraries", "Libraries", "Every Toronto Public Library branch.", "Services", "library-branch-general-information",
                  lambda r: f"{r['BranchName']} branch", group_of=lambda r: 0 if str(r.get("PhysicalBranch")) in ("1", "True", "true") else None, lonlat=("Long", "Lat"),
                  info=lambda r: " · ".join(x for x in [f"{int(float(r['SquareFootage'])):,} sq ft" if str(r.get("SquareFootage") or "").replace(".", "").isdigit() else "",
                                                        f"at this site since {r['PresentSiteYear']}" if str(r.get("PresentSiteYear") or "").isdigit() else ""] if x),
                  rank_by=lambda r: float(r["SquareFootage"]) if str(r.get("SquareFootage") or "").replace(".", "").isdigit() else None, rank_words="largest")
    school_types = {"Public": ("Public (English)", C[0]), "Catholic": ("Catholic (English)", C[1]), "French": ("French-language", C[5]), "Private": ("Private", C[3])}
    def school_group(r):
        d = (r.get("SCHOOL_TYPE_DESC") or "")
        for i, k in enumerate(school_types):
            if k.lower() in d.lower():
                return i
        return 4
    simple_points("schools", "Schools", "Every school, by type.", "Services", "school-locations-all-types", lambda r: (r.get("NAME") or "").title(),
                  group_of=school_group, groups=[{"label": v[0], "color": v[1]} for v in school_types.values()] + [{"label": "Other", "color": C[4]}],
                  info=lambda r: " · ".join(x for x in [r.get("SCHOOL_TYPE_DESC"), r.get("BOARD_NAME"), (r.get("SCHOOL_LEVEL") or "").title(), (r.get("ADDRESS_FULL") or "")]
                                            if x and x not in ("None", "")))
    simple_points("childcare", "Licensed child care", "Every licensed child care centre.", "Services", "licensed-child-care-centres",
                  lambda r: (r.get("LOC_NAME") or "").strip(), extra=lambda r: int(r.get("TOTSPACE") or 0),
                  info=lambda r: " · ".join(x for x in [f"{int(r.get('TOTSPACE') or 0):,} spaces", r.get("AUSPICE") or "",
                                                        "fee subsidy available" if r.get("subsidy") == "Y" else "", (r.get("ADDRESS") or "").title()] if x),
                  rank_by=lambda r: int(r.get("TOTSPACE") or 0), rank_words="largest")
    # emergency services: three datasets
    items, srcs, info = [], [], []
    for g, (pkg_name, name_of, info_of) in enumerate((
            ("fire-station-locations", lambda r: f"Fire Station {r.get('STATION')}",
             lambda r: " · ".join(x for x in [f"built {r['YEAR_BUILD']}" if str(r.get("YEAR_BUILD") or "").isdigit() else "", r.get("ADDRESS") or ""] if x)),
            ("ambulance-station-locations", lambda r: r.get("EMS_NAME") or "Ambulance station", lambda r: (r.get("ADDRESS_FULL") or "").strip()),
            ("police-facility-locations", lambda r: r.get("FACILITY") or "Police facility", lambda r: (r.get("ADDRESS") or "").strip()))):
        pkg, url, rows = records(pkg_name)
        for r in rows:
            p = point(r)
            if p:
                items.append([*p, g, name_of(r)])
                info.append(info_of(r))
        srcs.append(open_data_source(pkg, url, "all records", "Each station's point as published."))
    save("emergency", "Fire, ambulance and police", "Fire stations, ambulance stations and police facilities.", "Services",
         {"type": "points", "groups": [{"label": "Fire station", "color": C[1]}, {"label": "Ambulance station", "color": C[4]}, {"label": "Police facility", "color": C[0]}], "items": items, "info": info}, srcs)
    simple_points("ev", "City EV chargers", "City-operated electric vehicle charging stations.", "Services", "city-operated-electric-vehicle-charging-station-map",
                  lambda r: (r.get("Location") or "").strip(),
                  info=lambda r: " · ".join(x for x in [f"{r['Level2_Charging_Ports']} Level 2 ports" if str(r.get("Level2_Charging_Ports") or "0") not in ("0", "None") else "",
                                                        f"{r['Level3_Charging_Ports']} Level 3 (fast) ports" if str(r.get("Level3_Charging_Ports") or "0") not in ("0", "None") else "",
                                                        r.get("Type") or ""] if x))
    simple_points("art", "Public art", "Public art and monuments across the city.", "Services", "public-art",
                  lambda r: f"{(r.get('TITLE') or 'Untitled').strip()}{' by ' + r['ARTIST'].strip() if r.get('ARTIST') and r['ARTIST'] != 'None' else ''}",
                  lonlat=("LONGITUDE", "LATITUDE"),
                  info=lambda r: " · ".join(x for x in [str(r.get("YEAR") or ""), r.get("ARTWORK_TYPE") or "", r.get("MEDIUM") or "", r.get("ADDRESS") or ""] if x and x != "None"))

    # ── Construction (from lib/city.json; same projection) ──────────────────
    with open(os.path.join(ROOT, "lib", "city.json")) as f:
        city = json.load(f)
    cons = city["construction"]
    items = [[i["x"], i["y"], 1 if i["type"] == "ROAD_CLOSED" else 0, i["road"] or i["where"]] for i in cons["items"]]
    info = [" · ".join(x for x in [i["where"], f"by {i['by']}" if i.get("by") else "", f"from {i['from']}" if i.get("from") else "",
                                   f"until {i['until']}" if i.get("until") else ""] if x) for i in cons["items"]]
    save("construction", "Construction and closures", f"Road restrictions in effect on {city['generatedOn']}.", "Housing and the city",
         {"type": "points", "groups": [{"label": "Construction", "color": C[3]}, {"label": "Road closed", "color": C[4]}], "items": items, "info": info}, [cons["source"]],
         "Refreshed weekly with the rest of the city data.")

    # ── Homes by neighbourhood (2021 census) ────────────────────────────────
    import openpyxl
    npkg = package("neighbourhood-profiles")
    nres = next(r for r in npkg["resources"] if "2021" in r["name"] and r["format"].upper() == "XLSX")
    wb = openpyxl.load_workbook(io.BytesIO(fetch(nres["url"])), read_only=True, data_only=True)
    ws = wb.worksheets[0]
    rows_x = list(ws.iter_rows(values_only=True))
    header = [str(h).strip() if h else "" for h in rows_x[0]]
    def row(label_re):
        hits = [r for r in rows_x if r[0] and re.match(label_re, str(r[0]).strip())]
        if not hits:
            sys.exit(f"layers: census row not found: {label_re}")
        return hits[0]
    population = row(r"^Total - Age groups of the population")
    total = row(r"^Total - Occupied private dwellings by structural type of dwelling")
    single = row(r"^Single-detached house$")
    tall = row(r"^Apartment in a building that has five or more storeys$")
    _, _, nrows = records("neighbourhoods")
    # The census file and the boundaries spell some names differently ("O`Connor Parkview" / "O'Connor-Parkview"),
    # so match ignoring punctuation and spacing.
    norm = lambda n: re.sub(r"[^a-z0-9]", "", n.lower())
    shapes_by = {norm(r["AREA_NAME"]): (r["AREA_NAME"].strip(), r["geometry"]) for r in nrows}
    def area_km2(polys):
        """Area from the City's boundary (unsimplified), in the map's projection (cos-latitude scaled, near equal-area at this size)."""
        a = 0.0
        for poly in polys:
            ring = [xy(lon, lat) for lon, lat in poly[0]]
            a += abs(sum(x1 * y2 - x2 * y1 for (x1, y1), (x2, y2) in zip(ring, ring[1:] + ring[:1]))) / 2
            for hole in poly[1:]:
                h = [xy(lon, lat) for lon, lat in hole]
                a -= abs(sum(x1 * y2 - x2 * y1 for (x1, y1), (x2, y2) in zip(h, h[1:] + h[:1]))) / 2
        return a * (111.32 / PROJ["scale"]) ** 2

    items, dens, unmatched = [], [], []
    for ci, name in enumerate(header):
        if ci == 0 or not name or name == "City of Toronto":
            continue
        if norm(name) not in shapes_by:
            unmatched.append(name)
            continue
        name, geom = shapes_by[norm(name)]
        g = json.loads(geom)
        polys = g["coordinates"] if g["type"] == "MultiPolygon" else [g["coordinates"]]
        tot = float(total[ci] or 0)
        if not tot:
            continue
        d = "".join(path_of(p[0], 1.0, closed=True) for p in polys)
        items.append([name, d, round(float(tall[ci] or 0) / tot * 100, 1), round(float(single[ci] or 0) / tot * 100, 1)])
        km2 = area_km2(polys)
        dens.append([name, d, round(float(population[ci] or 0) / km2) if km2 else 0, round(km2, 2), int(population[ci] or 0)])
    if unmatched or len(items) != 158:
        sys.exit(f"layers: census neighbourhoods without a boundary: {unmatched} ({len(items)} matched)")
    rt, rs = ranks([it[2] for it in items]), ranks([it[3] for it in items])
    homes_info = [f"{it[2]}% in 5+ storey apartments ({ordinal(a)} of 158) · {it[3]}% single-detached houses ({ordinal(b)} of 158)" for it, a, b in zip(items, rt, rs)]
    save("homes", "Homes by neighbourhood", "The share of homes in apartment buildings of 5+ storeys, or in single-detached houses (2021 census).", "Housing and the city",
         {"type": "choropleth", "measures": [{"label": "Apartments, 5+ storeys", "color": C[5]}, {"label": "Single-detached houses", "color": C[2]}], "items": items, "info": homes_info},
         [open_data_source(npkg, nres["url"], "rows 'Total - Occupied private dwellings by structural type of dwelling', 'Single-detached house', "
                           "'Apartment in a building that has five or more storeys'", "Each neighbourhood's count ÷ its total occupied private dwellings × 100."),
          open_data_source(package("neighbourhoods"), f"{CKAN}/package_show?id=neighbourhoods", "all 158 neighbourhoods", "Outlines simplified for drawing.")],
         "The census can't tell condos from rental apartments: 'apartments, 5+ storeys' includes both.")

    save("density", "Population density", "People per square kilometre in each neighbourhood (2021 census).", "Housing and the city",
         {"type": "choropleth", "measures": [{"label": "People per km²", "color": C[0], "bins": [0, 4000, 8000, 12000, 20000], "unit": "/km²"}],
          "items": [[n, d, v] for n, d, v, _, _ in dens],
          "info": [f"{p:,} people on {a} km² · {ordinal(k)} densest of {len(dens)}" for (n, _, _, a, p), k in zip(dens, ranks([x[2] for x in dens]))]},
         [open_data_source(npkg, nres["url"], "row 'Total - Age groups of the population - 25% sample data' (each neighbourhood's population)",
                           "Population ÷ land area. The profile has no area, so area is computed here from the City's neighbourhood boundary."),
          open_data_source(package("neighbourhoods"), f"{CKAN}/package_show?id=neighbourhoods", "all 158 neighbourhoods", "Each boundary's area (unsimplified), for the density.")],
         "Population is the census's own count for each neighbourhood (from its 25% sample, so rounded); area is measured from the City's boundary, water included where a boundary takes it in.")

    write(INDEX, {"map": {"width": wards["width"], "height": wards["height"], "paths": [p["d"] for p in wards["paths"]], "source": wards["source"]}, "views": index},
          "scripts/extract_layers.py")


if __name__ == "__main__":
    main()
