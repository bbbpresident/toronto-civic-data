"""
Checks lib/promises.json, the one hand-curated dataset besides lib/affiliations.ts.

  - every promise quote appears verbatim on its campaign's archived platform page
    (whitespace normalised; the archive's raw "id_" copy is fetched, so no toolbar text)
  - every cited Council vote exists in the City's voting-record file for that term, with the
    stated date, motion type and result (and description, when given)
  - statuses are from the fixed set, and every status except "no-action-found" has evidence

Exits non-zero on any failure. Run after every edit:

    .venv/bin/python scripts/check_promises.py
"""
import csv, html, io, json, os, re, sys
from _common import fetch, package, resource

LIB = os.path.join(os.path.dirname(__file__), "..", "lib")
STATUSES = {"done", "partly", "in-progress", "no-action-found", "reversed"}


def page_text(url):
    raw = re.sub(r"(web\.archive\.org/web/\d+)/", r"\1id_/", url)
    b = fetch(raw)
    try:
        h = b.decode("utf-8")
    except UnicodeDecodeError:
        h = b.decode("cp1252", errors="replace")  # older campaign sites (e.g. 2006) are Windows-1252
    h = re.sub(r"(?is)<(script|style)[^>]*>.*?</\1>", " ", h)
    t = html.unescape(re.sub(r"<[^>]+>", " ", h))
    return re.sub(r"\s+", " ", t.replace("\xa0", " "))


_votes = {}


def votes(term):
    if term not in _votes:
        pkg = package("members-of-toronto-city-council-voting-record")
        url = resource(pkg, f"member-voting-record-{term}.csv")["url"]
        rows = csv.DictReader(io.StringIO(fetch(url).decode("utf-8-sig", errors="replace")))
        norm = lambda k: re.sub(r"[ /#\-]", "", k)
        _votes[term] = [{norm(k): (v or "").strip() for k, v in r.items()} for r in rows]
    return _votes[term]


def main():
    data = json.load(open(os.path.join(LIB, "promises.json")))
    problems = []
    for c in data["campaigns"]:
        if not c["promises"]:
            if not c.get("missingPlatform"):
                problems.append(f"{c['id']}: no promises and no missingPlatform reason")
            continue
        texts = {}
        for p in c["promises"]:
            where = f"{c['id']}/{p['id']}"
            url = p.get("platformUrl") or c["platform"]["url"]
            if url not in texts:
                texts[url] = page_text(url)
            if re.sub(r"\s+", " ", p["quote"]) not in texts[url]:
                problems.append(f"{where}: quote not found verbatim on {url}")
            if p["status"] not in STATUSES:
                problems.append(f"{where}: unknown status {p['status']!r}")
            if p["status"] != "no-action-found" and not p["evidence"]:
                problems.append(f"{where}: status {p['status']} needs evidence")
            for e in p["evidence"]:
                if "vote" in e:
                    v = e["vote"]
                    hits = [r for r in votes(v["term"]) if r["Committee"] == "City Council" and r["AgendaItem"] == v["item"]
                            and r["DateTime"].startswith(v.get("date", "")) and r["MotionType"] == v["motion"] and r["Result"] == v["result"]
                            and v.get("description", "") in r["VoteDescription"]]
                    if not hits:
                        problems.append(f"{where}: vote {v} not in the {v['term']} voting record")
                elif not e.get("source", {}).get("url"):
                    problems.append(f"{where}: evidence without a source: {e['text'][:60]}")
        print(f"{c['id']}: {len(c['promises'])} promises checked", file=sys.stderr)
    if problems:
        print("\n".join(problems), file=sys.stderr)
        sys.exit(1)
    print("all promises check out", file=sys.stderr)


if __name__ == "__main__":
    main()
