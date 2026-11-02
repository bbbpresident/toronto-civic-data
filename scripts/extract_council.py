"""
Rebuilds lib/council.json: how City Council voted and who showed up, by term (2006–2026).

  - votes        "Members of Toronto City Council – Voting Record", one file per term: one row per
                 member per recorded vote. Only votes at City Council itself are used (not committees).
  - attendance   "Members of Toronto City Council – Meeting Attendance", one file per term: one row per
                 member per meeting session. City Council sessions only.
  - mayors       the winner of each mayoral race held during the term, from lib/elections.json (run
                 extract_elections.py first). A vote's "mayor" is whichever of them is on its roll.

A vote is identified by (date/time, agenda item, motion type, vote description, result). The files
sometimes record two votes with identical fields; a member appearing twice splits them. Every vote's
Yes/No count must equal the tally in its own Result field ("Carried, 25-1") or the run aborts.

    .venv/bin/python scripts/extract_council.py
"""
import csv, io, json, os, re, sys
from collections import Counter, defaultdict
from _common import fetch, open_data_source, package, resource, write

LIB = os.path.join(os.path.dirname(__file__), "..", "lib")
TERMS = ["2006-2010", "2010-2014", "2014-2018", "2018-2022", "2022-2026"]
CLOSE_MARGIN = 2
CLOSEST_SHOWN = 25


def fix_mojibake(s):
    """Some files carry UTF-8 that was decoded as Latin-1 before publishing ("BailÃ£o" for "Bailão"). Undo only that."""
    if "Ã" not in s and "â€" not in s:
        return s
    try:
        return s.encode("cp1252").decode("utf-8")
    except (UnicodeEncodeError, UnicodeDecodeError):
        return s


def rows(url):
    reader = csv.DictReader(io.StringIO(fetch(url).decode("utf-8-sig", errors="replace")))
    for r in reader:
        yield {re.sub(r"[ /#\-]", "", k): fix_mojibake((v or "").strip()) for k, v in r.items()}


def norm(name):
    return re.sub(r"[^a-z]", "", name.lower())


def mayors_by_term():
    data = json.load(open(os.path.join(LIB, "elections.json")))
    out = defaultdict(list)
    for e in data["elections"]:
        w = e["mayor"]["top"][0]
        for t in TERMS:
            a, b = map(int, t.split("-"))
            if a <= e["year"] < b:
                out[t].append({"name": w["displayName"], "election": e["label"], "electionYear": e["year"], "source": e["mayor"]["source"]})
    return out


def term_votes(term, url):
    votes = defaultdict(dict)  # (key, occurrence) -> {name: vote}
    meta = {}
    seen = Counter()
    for r in rows(url):
        if r["Committee"] != "City Council":
            continue
        name = f'{r["FirstName"]} {r["LastName"]}'.strip()
        key = (r["DateTime"], r["AgendaItem"], r["MotionType"], r["VoteDescription"], r["Result"])
        occ = seen[(key, name)]
        seen[(key, name)] += 1
        votes[(key, occ)][name] = r["Vote"]
        meta[(key, occ)] = r
    out = []
    for k, roll in votes.items():
        r = meta[k]
        y = sum(v == "Yes" for v in roll.values())
        n = sum(v == "No" for v in roll.values())
        m = re.search(r"(\d+)-(\d+)", r["Result"])
        if not m or (int(m.group(1)), int(m.group(2))) != (y, n):
            sys.exit(f"{term}: vote on {r["AgendaItem"]} counts {y}-{n} but its Result says {r['Result']!r}")
        out.append({"item": r["AgendaItem"], "title": r["AgendaItemTitle"], "motion": r["MotionType"], "description": r["VoteDescription"],
                    "result": r["Result"], "carried": r["Result"].lower().startswith("carried"), "yes": y, "no": n,
                    "date": r["DateTime"][:10] if re.match(r"\d{4}-\d\d-\d\d", r["DateTime"]) else None, "roll": roll})
    return out


def attendance(url):
    present, total = Counter(), Counter()
    for r in rows(url):
        if r["Committee"] != "City Council":
            continue
        name = f'{r["FirstName"]} {r["LastName"]}'.strip()
        total[name] += 1
        present[name] += r["Present"] == "Y"
    return present, total


def main():
    vpkg = package("members-of-toronto-city-council-voting-record")
    apkg = package("members-of-toronto-city-council-meeting-attendance")
    mayors = mayors_by_term()
    terms = []
    for term in TERMS:
        print(f"… {term}", file=sys.stderr)
        vurl = resource(vpkg, f"member-voting-record-{term}.csv")["url"]
        aurl = resource(apkg, f"councillors-meeting-attendance-{term}.csv")["url"]
        votes = term_votes(term, vurl)
        present, sessions = attendance(aurl)
        mayor_keys = {norm(m["name"]): m["name"] for m in mayors[term]}
        if not mayor_keys:
            sys.exit(f"{term}: no mayoral race in elections.json falls in this term")

        members = sorted({n for v in votes for n in v["roll"]})
        stats = {n: Counter() for n in members}
        for v in votes:
            mayor = next((n for n in v["roll"] if norm(n) in mayor_keys), None)
            mv = v["roll"].get(mayor) if mayor else None
            winner = "Yes" if v["carried"] else "No"
            v["mayorName"], v["mayorVote"] = mayor, mv
            for n, vote in v["roll"].items():
                s = stats[n]
                if vote in ("Yes", "No"):
                    s["cast"] += 1
                    s["withMajority"] += vote == winner
                    if mv in ("Yes", "No") and n != mayor:
                        s["mayorBoth"] += 1
                        s["withMayor"] += vote == mv
                else:
                    s["absent"] += 1  # "Absent" and "Absent (Interest Declared)"
        if not any(norm(n) in mayor_keys for n in members):
            sys.exit(f"{term}: none of {list(mayor_keys.values())} appears on a roll")

        table = []
        for n in members:
            s = stats[n]
            on_roll = s["cast"] + s["absent"]
            table.append({
                "name": n, "isMayor": norm(n) in mayor_keys, "votesOnRoll": on_roll, "cast": s["cast"],
                "missedPct": round(s["absent"] / on_roll * 100, 1) if on_roll else None,
                "withMajorityPct": round(s["withMajority"] / s["cast"] * 100, 1) if s["cast"] else None,
                "withMayorPct": round(s["withMayor"] / s["mayorBoth"] * 100, 1) if s["mayorBoth"] else None,
                "withMayorVotes": s["mayorBoth"],
                "attendancePct": round(present[n] / sessions[n] * 100, 1) if sessions[n] else None,
                "sessions": sessions[n],
            })
        table.sort(key=lambda m: m["name"].split()[-1])

        years = sorted(int(v["item"][:4]) for v in votes if v["item"][:4].isdigit())
        close = [v for v in votes if v["yes"] and v["no"] and abs(v["yes"] - v["no"]) <= CLOSE_MARGIN]
        closest = sorted(close, key=lambda v: (abs(v["yes"] - v["no"]), -(int(v["item"][:4]) if v["item"][:4].isdigit() else 0), v["item"]))[:CLOSEST_SHOWN]
        for v in closest:
            v["roll"] = {k: v["roll"][k] for k in sorted(v["roll"])}
        terms.append({
            "term": term, "firstYear": years[0], "lastYear": years[-1], "votes": len(votes),
            "carried": sum(v["carried"] for v in votes), "unanimous": sum(not (v["yes"] and v["no"]) for v in votes),
            "close": len(close), "closeMargin": CLOSE_MARGIN, "mayors": mayors[term], "members": table, "closest": closest,
            "source": open_data_source(vpkg, vurl, 'Rows where Committee = "City Council"',
                                       "Each vote is one set of rows sharing Date/Time, Agenda Item #, Motion Type, Vote Description and Result. "
                                       "Missed = Absent ÷ votes on the member's roll. With majority = votes on the winning side ÷ Yes/No votes cast. "
                                       "With the mayor = same vote as the mayor ÷ votes where both voted Yes or No."),
            "attendanceSource": open_data_source(apkg, aurl, 'Rows where Committee = "City Council"', "Sessions marked Present = Y ÷ sessions listed for the member."),
        })
    write(os.path.join(LIB, "council.json"), {"terms": terms}, "scripts/extract_council.py")


if __name__ == "__main__":
    main()
