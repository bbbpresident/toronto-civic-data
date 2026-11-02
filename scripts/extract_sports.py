"""
Toronto's pro teams, season by season: regular-season record, whether they made the playoffs and
how far they went, and championships; and every player's regular-season totals with the team.
Writes lib/sports.json.

Only leagues that publish their records in an official, openly readable form are generated:
  - Blue Jays (MLB Stats API, statsapi.mlb.com): standings, postseason series; players from each
    season's full roster with year-by-year stats (only the splits for the Blue Jays are counted)
  - Maple Leafs, incl. Arenas and St. Patricks (NHL Records, records.nhl.com): seasons; players from
    the NHL stats API's franchise totals (api.nhle.com/stats/rest)
  - Toronto FC (MLS Stats API, stats-api.mlssoccer.com): standings, playoff matches; players from
    each season's per-club player statistics, summed
  - Raptors (NBA) and Tempo (WNBA) from ESPN's public site API — a secondary source, labelled as
    such everywhere it's shown (decided 2026-11-01): nba.com / wnba.com refuse scripted access and
    we don't get around that. Seasons from ESPN standings and the team's playoff schedule; players
    are everyone in any regular-season box score, with ESPN's season totals for the team only.
The Argonauts (CFL) are listed as unavailable: the CFL's stats service needs a key.

Aborts if a season's record is missing, a playoff result can't be determined, or a champion
count doesn't match the seasons marked champion.
"""
import json, os, sys, time
from datetime import date
from urllib.parse import quote

sys.path.insert(0, os.path.dirname(__file__))
from _common import TODAY, fetch, source, write

OUT = os.path.join(os.path.dirname(__file__), "..", "lib", "sports.json")


def get(url, tries=4):
    """JSON at `url`. The MLB API sometimes drops a request, so retry a few times before giving up."""
    for i in range(tries):
        try:
            return json.loads(fetch(url))
        except Exception:
            if i == tries - 1:
                raise
            time.sleep(2 * (i + 1))


def col(key, label, kind="int", asc=False, qualify=None):
    """A players-table column. kind: int, dec1, dec2, dec3 (e.g. .295), pct (0–1 shown as .912), ip (outs → innings), text.
    asc: lower is better (ERA, GAA). qualify: (key, min, words) — when sorting by this rate, players under the minimum go last."""
    c = {"key": key, "label": label, "kind": kind}
    if asc:
        c["asc"] = True
    if qualify:
        c["qualify"] = {"key": qualify[0], "min": qualify[1], "label": qualify[2]}
    return c


PO = ("po", "Playoff seasons")
TEAM_WINS = ("tw", "Team wins (their seasons)")


def group(id, label, columns, rows, sort, src, files, note=None):
    if not rows:
        sys.exit(f"players {id}: no rows")
    # Keep only what the table shows, plus the sample sizes its minimums need.
    keep = {"name", "url"} | {c["key"] for c in columns} | {c["qualify"]["key"] for c in columns if "qualify" in c}
    rows = [{k: v for k, v in r.items() if k in keep} for r in rows]
    g = {"id": id, "label": label, "columns": columns, "sort": sort, "rows": rows, "source": src, "files": files}
    if note:
        g["note"] = note
    return g


def runs(seasons, flags):
    """Playoff seasons, championship seasons and the team's regular-season wins among a player's seasons with the team."""
    got = [flags[x] for x in seasons if x in flags]
    return {"po": sum(1 for f in got if f[0]), "titles": sum(1 for f in got if f[1]), "tw": sum(f[2] for f in got)}


RUN_NOTE = (" Playoff seasons count the player's seasons with the team in which the team made the playoffs; being on the roster"
            " doesn't mean they played in the playoffs.")
TW_NOTE = " Team wins (their seasons) is the team's regular-season wins in the seasons the player was with the team."


def span(seasons):
    ys = sorted(seasons)
    if len(ys) == 1:
        return ys[0]
    # "2009–10 to 2017–18" for two-year seasons; "1993–2004" for single years.
    return f"{ys[0]} to {ys[-1]}" if "–" in ys[0] else f"{ys[0]}–{ys[-1]}"


# ── Blue Jays (MLB) ──────────────────────────────────────────────────────────

MLB = "https://statsapi.mlb.com/api/v1"
MLB_PUB, MLB_SITE = "MLB Advanced Media", "https://statsapi.mlb.com/"
JAYS = 141
MLB_ROUND = [("Wild Card", 1), ("Division Series", 2), ("Championship Series", 3), ("World Series", 4)]


def mlb_round(desc):
    for key, rank in MLB_ROUND:
        if key in desc:
            return rank
    sys.exit(f"MLB: unknown postseason round {desc!r}")


def jays():
    seasons = []
    for year in range(TODAY.year, 1976, -1):
        st_url = f"{MLB}/standings?leagueId=103&season={year}&standingsTypes=regularSeason"
        rec = [t for r in get(st_url)["records"] for t in r["teamRecords"] if t["team"]["id"] == JAYS]
        if not rec:
            if year == TODAY.year:
                continue  # season not started
            sys.exit(f"MLB {year}: no Blue Jays standings row")
        rec = rec[0]
        ps_url = f"{MLB}/schedule/postseason/series?sportId=1&season={year}"
        series = get(ps_url).get("series", [])
        ws = [s for s in series if "World Series" in s["games"][-1]["seriesDescription"]]
        complete = bool(ws) and ws[0]["games"][-1]["status"]["detailedState"] == "Final" and any(
            side.get("isWinner") for side in ws[0]["games"][-1]["teams"].values())
        mine = []
        for s in series:
            g = s["games"][-1]
            sides = g["teams"]
            if JAYS in (sides["away"]["team"]["id"], sides["home"]["team"]["id"]):
                me = sides["away"] if sides["away"]["team"]["id"] == JAYS else sides["home"]
                mine.append((mlb_round(g["seriesDescription"]), g["seriesDescription"], me.get("isWinner"), g["status"]["detailedState"]))
        if not series and year < TODAY.year:
            playoffs, result, champion = None, "No postseason was held", False
        elif not mine:
            playoffs, result, champion = (None, None, False) if not complete and year == TODAY.year else (False, None, False)
        else:
            rank, desc, won, state = max(mine)
            playoffs = True
            if state != "Final" or won is None:
                result, champion = f"Playing in the {desc}", False
            elif rank == 4 and won:
                result, champion = "Won the World Series", True
            else:
                result, champion = f"Lost in the {desc}", False
        seasons.append({
            "season": str(year), "wins": rec["wins"], "losses": rec["losses"],
            "inProgress": year == TODAY.year and not complete and playoffs is not True,
            "playoffs": playoffs, "result": result, "champion": champion,
            "sources": {
                "record": source(MLB_PUB, "MLB Stats API: standings", MLB_SITE, st_url, f"records[].teamRecords[] where team.id = {JAYS} (Toronto Blue Jays)", "Regular-season wins and losses as published."),
                "playoffs": source(MLB_PUB, "MLB Stats API: postseason series", MLB_SITE, ps_url, "series[] whose games include the Blue Jays; the last game's isWinner decides the series", "Furthest round reached; won or lost from the series' final game."),
            },
        })
        print(f"  jays {year}: {rec['wins']}-{rec['losses']} {result or ''}", file=sys.stderr)
    return seasons


# ── Maple Leafs (NHL) ────────────────────────────────────────────────────────

NHL_RESULTS = "https://records.nhl.com/site/api/franchise-season-results?cayenneExp=franchiseId=5"
NHL_PUB = "National Hockey League"


def leafs():
    rows = get(NHL_RESULTS)["data"]
    seasons = []
    for r in sorted((x for x in rows if x["gameTypeId"] == 2), key=lambda x: -x["seasonId"]):
        sid = r["seasonId"]
        first, end = sid // 10000, sid % 10000
        in_progress = end > TODAY.year or (end == TODAY.year and TODAY.month < 7)
        if r["inPlayoffs"]:
            if not r["seriesTitle"]:
                sys.exit(f"NHL {sid}: in playoffs but no round")
            if r["decision"] is None:
                result, champion = f"Playing in the {r['seriesTitle']}", False
            elif r["seriesTitle"] == "Stanley Cup Final" and r["decision"] == "W":
                result, champion = "Won the Stanley Cup", True
            else:
                result, champion = f"Lost in the {r['seriesTitle']}" if r["decision"] == "L" else f"{r['seriesTitle']}: {r['decision']}", False
            playoffs = True
        else:
            playoffs, result, champion = (None if in_progress else False), None, False
        rec = source(NHL_PUB, "NHL Records: franchise season results", "https://records.nhl.com/", NHL_RESULTS,
                     f"data[] where seasonId = {sid} and gameTypeId = 2 (regular season)",
                     "Wins, losses, ties and overtime losses as published; inPlayoffs, seriesTitle (last round reached) and decision (won or lost it).")
        srcs = {"record": rec, "playoffs": rec}
        seasons.append({
            "season": f"{first}–{str(end)[2:]}", "team": r["teamName"], "wins": r["wins"], "losses": r["losses"],
            **({"ties": r["ties"]} if r.get("ties") is not None else {}),
            **({"otl": r["overtimeLosses"]} if r.get("overtimeLosses") is not None else {}),
            "inProgress": in_progress and r["decision"] is None and not r["inPlayoffs"],
            "playoffs": playoffs, "result": result, "champion": champion, "sources": srcs,
        })
        print(f"  leafs {sid}: {r['wins']}-{r['losses']} {result or ''}", file=sys.stderr)
    return seasons


# ── Toronto FC (MLS) ─────────────────────────────────────────────────────────

MLS = "https://stats-api.mlssoccer.com"
MLS_PUB, MLS_SITE = "Major League Soccer", "https://www.mlssoccer.com/stats/"
REG, CUP, TFC = "MLS-COM-000001", "MLS-COM-000002", "MLS-CLU-00000M"


def tfc():
    reg = {s["season"]: s["season_id"] for s in get(f"{MLS}/competitions/{REG}/seasons")["seasons"]}
    cup = {s["season"]: s["season_id"] for s in get(f"{MLS}/competitions/{CUP}/seasons")["seasons"]}
    seasons = []
    for year in sorted((y for y in reg if 2007 <= y <= TODAY.year), reverse=True):
        st_url = f"{MLS}/competitions/{REG}/seasons/{reg[year]}/standings"
        rows = [e for t in get(st_url)["tables"] for e in t["entries"] if e["club_id"] == TFC]
        if not rows:
            if year == TODAY.year:
                continue
            sys.exit(f"MLS {year}: no Toronto FC standings row")
        e = rows[0]
        playoffs, result, champion, ps_url, unfinished = False, None, False, None, False
        if year in cup:
            ps_url = f"{MLS}/matches/seasons/{cup[year]}?competition_id={CUP}&match_date[gte]={year}-01-01&match_date[lte]={year + 1}-01-31"
            matches = get(ps_url.replace("[", "%5B").replace("]", "%5D")).get("schedule", [])
            unfinished = any(m["match_status"] != "finalWhistle" for m in matches)
            mine = sorted((m for m in matches if TFC in (m["home_team_id"], m["away_team_id"])), key=lambda m: m["planned_kickoff_time"])
            if mine:
                playoffs = True
                last = mine[-1]
                # Older files leave the round unnamed; say only what the file supports.
                rnd = last["section_name"] or ("first round" if last["match_day"] == min(m["match_day"] for m in matches) else None)
                if last["match_status"] != "finalWhistle":
                    result = f"Playing in the {rnd or 'playoffs'}"
                elif last["match_type"] == "Final":
                    detail = get(f"{MLS}/matches/{last['match_id']}")["match_information"]
                    home = last["home_team_id"] == TFC
                    g = (detail["home_team_goals"], detail["away_team_goals"])
                    pens = (detail.get("home_team_penalty_goals"), detail.get("away_team_penalty_goals"))
                    mine_g, their_g = (g if home else g[::-1])
                    if mine_g == their_g:
                        if pens[0] is None:
                            sys.exit(f"MLS {year}: drawn final without penalties")
                        mine_g, their_g = (pens if home else pens[::-1])
                    champion = mine_g > their_g
                    result = "Won MLS Cup" if champion else "Lost in MLS Cup"
                else:
                    result = f"Lost in the {rnd}" if rnd else "Lost in the playoffs (the league's file doesn't name the round)"
        srcs = {"record": source(MLS_PUB, "MLS Stats API: regular-season standings", MLS_SITE, st_url, f"tables[].entries[] where club_id = {TFC} (Toronto FC)", "Wins, draws and losses as published.")}
        if ps_url:
            srcs["playoffs"] = source(MLS_PUB, "MLS Stats API: Cup Playoffs matches", MLS_SITE, ps_url, "schedule[] matches involving Toronto FC; section_name is the round",
                                      "Last round Toronto FC played in; for the final, the score (and penalty shootout, from the match record) decides it.")
        seasons.append({
            "season": str(year), "wins": e["wins"], "losses": e["losses"], "draws": e["draws"],
            "inProgress": year == TODAY.year and e["games_played"] < max(x["games_played"] for t in get(st_url)["tables"] for x in t["entries"]),
            "playoffs": playoffs, "result": result, "champion": champion, "sources": srcs,
        })
        print(f"  tfc {year}: {e['wins']}-{e['losses']}-{e['draws']} {result or ''}", file=sys.stderr)
    return seasons


# ── Players ──────────────────────────────────────────────────────────────────

def jays_players(flags):
    hit, pit, files = {}, {}, {"hitting": [], "pitching": []}
    for year in [y for y in range(1977, TODAY.year + 1) if str(y) in flags]:
        for g, store in (("hitting", hit), ("pitching", pit)):
            url = f"{MLB}/teams/{JAYS}/roster?season={year}&rosterType=fullSeason&hydrate=person(stats(type=yearByYear,group={g}))"
            roster = get(url).get("roster", [])
            if not roster:
                continue
            files[g].append(url)
            for r in roster:
                person = r["person"]
                if person["id"] in store:
                    continue
                splits = [sp for st in person.get("stats", []) if st["group"]["displayName"] == g
                          for sp in st["splits"] if sp.get("team", {}).get("id") == JAYS and sp["season"] in flags]
                pos = (person.get("primaryPosition") or r["position"])["abbreviation"]
                store[person["id"]] = {"name": person["fullName"], "pos": pos, "splits": splits}
        print(f"  jays players {year}", file=sys.stderr)

    def total(splits, key):
        return sum(sp["stat"].get(key) or 0 for sp in splits)

    hitters = []
    for pid, p in hit.items():
        sp = p["splits"]
        if p["pos"] == "P" or not sp or total(sp, "gamesPlayed") == 0:
            continue
        ab, h = total(sp, "atBats"), total(sp, "hits")
        ys = {x["season"] for x in sp}
        hitters.append({"name": p["name"], "url": f"https://www.mlb.com/player/{pid}", "seasons": span(ys), **runs(ys, flags),
                        "pos": p["pos"], "gp": total(sp, "gamesPlayed"), "ab": ab, "h": h, "hr": total(sp, "homeRuns"),
                        "rbi": total(sp, "rbi"), "avg": round(h / ab, 3) if ab else None})
    pitchers = []
    for pid, p in pit.items():
        sp = p["splits"]
        if not sp or total(sp, "gamesPlayed") == 0:
            continue
        outs, er = total(sp, "outs"), total(sp, "earnedRuns")
        strikes = None if any(x["stat"].get("strikes") is None for x in sp) else total(sp, "strikes")
        ys = {x["season"] for x in sp}
        pitchers.append({"name": p["name"], "url": f"https://www.mlb.com/player/{pid}", "seasons": span(ys), **runs(ys, flags),
                         "gp": total(sp, "gamesPlayed"), "w": total(sp, "wins"), "l": total(sp, "losses"), "sv": total(sp, "saves"),
                         "ip": outs, "so": total(sp, "strikeOuts"), "strikes": strikes,
                         "era": round(er * 27 / outs, 2) if outs else None, "sho": total(sp, "shutouts")})
    how = "Each season's full Blue Jays roster with every player's year-by-year stats; only the splits for team id 141 (the Blue Jays) are added up. "
    return [
        group("hitters", "Hitters", [col("seasons", "Seasons", "text"), col("gp", "Games"), col(*TEAM_WINS), col(*PO),
                                     col("hr", "Home runs"), col("rbi", "RBI"), col("avg", "Batting average", "dec3", qualify=("ab", 1000, "1,000 at bats"))], hitters, "hr",
              source(MLB_PUB, "MLB Stats API: roster with year-by-year hitting stats", MLB_SITE, files["hitting"][-1], "roster[].person.stats[] splits where team.id = 141",
                     how + "Average = hits ÷ at bats. Pitchers (primary position P) are in the pitchers table."), files["hitting"],
              "Regular season only. Players whose primary position is pitcher are listed under Pitchers." + RUN_NOTE + TW_NOTE),
        group("pitchers", "Pitchers", [col("seasons", "Seasons", "text"), col("gp", "Games"), col("w", "Wins"), col(*PO),
                                       col("ip", "Innings pitched", "ip"), col("so", "Strikeouts"), col("era", "ERA", "dec2", asc=True, qualify=("ip", 300, "100 innings"))], pitchers, "so",
              source(MLB_PUB, "MLB Stats API: roster with year-by-year pitching stats", MLB_SITE, files["pitching"][-1], "roster[].person.stats[] splits where team.id = 141",
                     how + "ERA = earned runs × 27 ÷ outs recorded. Strikes thrown is shown only when every one of the player's Blue Jays seasons records it."), files["pitching"],
              "Regular season only. Wins are the pitcher's own wins." + RUN_NOTE),
    ]


NHL_STATS = "https://api.nhle.com/stats/rest/en"


def leafs_players(flags):
    """flags: NHL seasonId (int) → (playoffs, champion)."""
    last_done = max(flags)  # flags hold completed seasons only
    q = "isAggregate=true&isGame=false&limit=-1&cayenneExp=" + quote(f"franchiseId=5 and gameTypeId=2 and seasonId<={last_done}")
    qs = q.replace("isAggregate=true", "isAggregate=false")
    sk_url, go_url = f"{NHL_STATS}/skater/summary?{q}", f"{NHL_STATS}/goalie/summary?{q}"
    sk_s_url, go_s_url = f"{NHL_STATS}/skater/summary?{qs}", f"{NHL_STATS}/goalie/summary?{qs}"
    sk, go, sk_s, go_s = get(sk_url), get(go_url), get(sk_s_url), get(go_s_url)
    for name, d in (("skaters", sk), ("goalies", go), ("skater seasons", sk_s), ("goalie seasons", go_s)):
        if len(d["data"]) != d["total"]:
            sys.exit(f"NHL {name}: got {len(d['data'])} of {d['total']}")
    seasons_of = {}
    for r in sk_s["data"] + go_s["data"]:
        seasons_of.setdefault(r["playerId"], set()).add(r["seasonId"])
    def extra(pid):
        ys = seasons_of.get(pid)
        if not ys:
            sys.exit(f"NHL player {pid}: in franchise totals but no season rows")
        lbl = lambda sid: f"{sid // 10000}–{str(sid % 10000)[2:]}"
        first, last = min(ys), max(ys)
        return {"seasons": lbl(first) if first == last else f"{lbl(first)} to {lbl(last)}", **runs(ys, flags)}
    skaters = [{"name": r["skaterFullName"], "url": f"https://www.nhl.com/player/{r['playerId']}", **extra(r["playerId"]), "pos": r["positionCode"], "gp": r["gamesPlayed"],
                "g": r["goals"], "a": r["assists"], "pts": r["points"], "pim": r["penaltyMinutes"]} for r in sk["data"]]
    goalies = [{"name": r["goalieFullName"], "url": f"https://www.nhl.com/player/{r['playerId']}", **extra(r["playerId"]), "gp": r["gamesPlayed"], "w": r["wins"], "l": r["losses"],
                "t": r["ties"], "otl": r["otLosses"], "so": r["shutouts"], "gaa": r["goalsAgainstAverage"], "svpct": r["savePct"]} for r in go["data"]]
    how = "The NHL stats API's career totals for the franchise (franchiseId 5: Arenas, St. Patricks, Maple Leafs), regular season, as published."
    return [
        group("skaters", "Skaters", [col("seasons", "Seasons", "text"), col("gp", "Games"), col(*TEAM_WINS), col(*PO),
                                     col("g", "Goals"), col("a", "Assists"), col("pts", "Points")], skaters, "pts",
              source(NHL_PUB, "NHL stats API: skater summary, franchise totals", "https://www.nhl.com/stats/", sk_url, "data[], one row per player", how), [sk_url, sk_s_url],
              "Regular season only, completed seasons (the season in progress isn't counted). Seasons are first to last with the franchise (from the per-season rows, the second file)." + RUN_NOTE + TW_NOTE),
        group("goalies", "Goalies", [col("seasons", "Seasons", "text"), col("gp", "Games"), col("w", "Wins"), col(*PO),
                                     col("svpct", "Save %", "pct", qualify=("gp", 50, "50 games")), col("so", "Shutouts"),
                                     col("gaa", "GAA", "dec2", asc=True, qualify=("gp", 50, "50 games"))], goalies, "w",
              source(NHL_PUB, "NHL stats API: goalie summary, franchise totals", "https://www.nhl.com/stats/", go_url, "data[], one row per player", how), [go_url, go_s_url],
              "Regular season only. GAA = goals against average. Saves weren't recorded in the earliest seasons, so save % covers only the games the NHL has shot data for." + RUN_NOTE),
    ]


def tfc_players(flags):
    reg = {s["season"]: s["season_id"] for s in get(f"{MLS}/competitions/{REG}/seasons")["seasons"]}
    acc, files, missing = {}, [], []
    for year in [y for y in range(2007, TODAY.year + 1) if str(y) in flags]:
        url = f"{MLS}/statistics/players/competitions/{REG}/seasons/{reg[year]}?club_id={TFC}"
        rows, token = [], None
        try:
            while True:
                page = get(url + (f"&page_token={quote(token)}" if token else ""))
                rows += page.get("player_statistics", [])
                token = page.get("next_page_token")
                if not token:
                    break
        except Exception:
            rows = []
        if not rows:
            missing.append(year)
            continue
        files.append(url)
        for r in rows:
            if r.get("team_id") not in (None, TFC):
                continue
            a = acc.setdefault(r["player_id"], {"name": f"{r['player_first_name']} {r['player_last_name']}".strip(), "gk": False, "seasons": set(),
                                                "gp": 0, "min": 0, "g": 0, "a": 0, "cs": 0, "sv": 0, "ga": 0})
            a["gk"] |= bool(r.get("goal_keeper"))
            if (r.get("matches_played") or 0) > 0:
                a["seasons"].add(str(year))
            for k, f in (("gp", "matches_played"), ("min", "normalized_player_minutes"), ("g", "goals"), ("a", "assists"),
                         ("cs", "clean_sheets"), ("sv", "goalkeeper_saves"), ("ga", "goals_conceded")):
                a[k] += r.get(f) or 0
        print(f"  tfc players {year}: {len(rows)}", file=sys.stderr)
    field = [{"name": a["name"], "seasons": span(a["seasons"]), **runs(a["seasons"], flags), "gp": a["gp"], "min": a["min"], "g": a["g"], "a": a["a"]}
             for a in acc.values() if not a["gk"] and a["gp"] > 0]
    keepers = [{"name": a["name"], "seasons": span(a["seasons"]), **runs(a["seasons"], flags), "gp": a["gp"], "cs": a["cs"], "ga": a["ga"],
                "gapg": round(a["ga"] / a["gp"], 2)}
               for a in acc.values() if a["gk"] and a["gp"] > 0]
    gap = f" The league's file has no player statistics for Toronto FC in {', '.join(map(str, missing))}, so those seasons aren't counted." if missing else ""
    how = "Each season's MLS regular-season player statistics for Toronto FC (all pages), added up per player."
    return [
        group("field", "Field players", [col("seasons", "Seasons", "text"), col("gp", "Games"), col(*TEAM_WINS), col(*PO), col("g", "Goals"), col("a", "Assists")],
              field, "g", source(MLS_PUB, "MLS Stats API: player statistics by club and season", MLS_SITE, files[-1], "player_statistics[] (all pages)", how), files,
              "Regular season only." + gap + RUN_NOTE + TW_NOTE),
        group("keepers", "Goalkeepers", [col("seasons", "Seasons", "text"), col("gp", "Games"), col(*TEAM_WINS), col(*PO), col("cs", "Shutouts (clean sheets)"),
                                         col("gapg", "Goals allowed per game", "dec2", asc=True, qualify=("gp", 20, "20 games"))],
              keepers, "cs", source(MLS_PUB, "MLS Stats API: player statistics by club and season", MLS_SITE, files[-1], "player_statistics[] (all pages)", how), files,
              "Regular season only. A clean sheet (shutout) is a match without conceding; goals allowed per game = goals conceded ÷ games." + gap + RUN_NOTE + TW_NOTE),
    ]


# ── Raptors and Tempo (ESPN: a secondary source, labelled as such) ───────────

ESPN_PUB = "ESPN (not the league)"
ESPN_SITE = "https://www.espn.com/"
ESPN_API = "https://site.api.espn.com/apis/site/v2/sports/basketball"
ESPN_WEB = "https://site.web.api.espn.com/apis/common/v3/sports/basketball"


def espn_season_label(league, year):
    return str(year) if league == "wnba" else f"{year - 1}–{str(year)[2:]}"


def espn_in_progress(league, year):
    if league == "wnba":
        return year == TODAY.year and TODAY.month < 11
    return year > TODAY.year or (year == TODAY.year and TODAY.month < 7)


def espn_playoffs(league, team_id, year):
    """(playoffs, result, champion, url) from the team's postseason (type 3) and play-in (type 5) schedule."""
    url = f"{ESPN_API}/{league}/teams/{team_id}/schedule?season={year}&seasontype=3"
    events = get(url).get("events", [])
    live = espn_in_progress(league, year)
    # A finished season counts only completed games (e.g. 2019–20 lists games that were never played).
    games = [e for e in events if e["competitions"][0]["status"]["type"]["completed"] or live]
    if not games:
        pin_url = f"{ESPN_API}/{league}/teams/{team_id}/schedule?season={year}&seasontype=5"
        if get(pin_url).get("events"):
            return False, "Lost in the play-in tournament", False, pin_url
        return (None if espn_in_progress(league, year) else False), None, False, url

    def rnd(e):
        notes = e["competitions"][0].get("notes") or []
        head = notes[0]["headline"] if notes else ""
        name = head.split(" - Game")[0].split(" - GAME")[0].strip()
        words = [w if w.isupper() and w in ("NBA", "WNBA") else w[:1].upper() + w[1:].lower() for w in name.split()]
        name = " ".join(words)
        # ESPN words the same round several ways; use one form ("East 1st Round" → "Eastern Conference 1st Round").
        for short, full in (("East ", "Eastern Conference "), ("West ", "Western Conference ")):
            if name.startswith(short):
                name = full + name[len(short):]
        name = name.replace("First Round", "1st Round").replace("Semi-Finals", "Semifinals")
        return None if name in ("", "Playoffs") else name

    games.sort(key=lambda e: e["date"])
    last = rnd(games[-1])
    if last:
        in_round = [e for e in games if rnd(e) == last]
    else:
        last_opp = next(c["id"] for c in games[-1]["competitions"][0]["competitors"] if c["id"] != str(team_id))
        in_round = [e for e in games if any(c["id"] == last_opp for c in e["competitions"][0]["competitors"])]
    won = sum(1 for e in in_round for c in e["competitions"][0]["competitors"] if c["id"] == str(team_id) and c.get("winner"))
    lost = len(in_round) - won
    unfinished = any(not e["competitions"][0]["status"]["type"]["completed"] for e in in_round)
    if unfinished:
        return True, f"Playing in the {last or 'playoffs'}", False, url
    if last and last.startswith(("NBA Finals", "WNBA Finals")) and won > lost:
        return True, f"Won the {last}", True, url
    if not last:
        # Older seasons have no round names: count the series (opponents, in order) instead.
        opp = lambda e: next(c["id"] for c in e["competitions"][0]["competitors"] if c["id"] != str(team_id))
        series = []
        for e in games:
            if not series or series[-1] != opp(e):
                series.append(opp(e))
        return True, f"Lost in round {len(series)} of the playoffs", False, url
    return True, f"Lost in the {last}", False, url


def espn_team(league, team_id, first_year):
    seasons, schedules = [], {}
    for year in range(TODAY.year + 1, first_year - 1, -1):
        st_url = f"https://site.api.espn.com/apis/v2/sports/basketball/{league}/standings?season={year}"
        d = get(st_url)
        entry = next((e for c in d.get("children", []) for e in c["standings"]["entries"] if e["team"]["id"] == str(team_id)), None)
        if not entry:
            if year > TODAY.year or (league == "wnba" and year == TODAY.year + 1):
                continue
            sys.exit(f"ESPN {league} {year}: no standings row for team {team_id}")
        stat = {x["name"]: x.get("value") for x in entry["stats"]}
        wins, losses = int(stat["wins"]), int(stat["losses"])
        if wins + losses == 0:
            continue  # season listed but not started
        playoffs, result, champion, ps_url = espn_playoffs(league, team_id, year)
        label = espn_season_label(league, year)
        games = [e for e in get(f"{ESPN_API}/{league}/teams/{team_id}/schedule?season={year}&seasontype=2").get("events", [])
                 if e["competitions"][0]["status"]["type"]["completed"]]
        gw = sum(1 for e in games for c in e["competitions"][0]["competitors"] if c["id"] == str(team_id) and c.get("winner"))
        mismatch = (gw, len(games) - gw) != (wins, losses) and not espn_in_progress(league, year)
        seasons.append({
            "season": label, "wins": wins, "losses": losses, "inProgress": espn_in_progress(league, year) and not playoffs,
            **({"note": f"ESPN's standings ({wins}–{losses}) and its game-by-game results ({gw}–{len(games) - gw}) disagree for this season; the standings are shown."} if mismatch else {}),
            "playoffs": playoffs, "result": result, "champion": champion,
            "sources": {
                "record": source(ESPN_PUB, "ESPN site API: standings", ESPN_SITE, st_url, f"children[].standings.entries[] where team.id = {team_id}", "Regular-season wins and losses as ESPN publishes them."),
                "playoffs": source(ESPN_PUB, "ESPN site API: team schedule (postseason / play-in)", ESPN_SITE, ps_url,
                                   "events[]; the round is the game's notes headline, the result is who won the most games in the last round", "Last round reached and whether they won it."),
            },
        })
        schedules[label] = year
        print(f"  {league} {label}: {wins}-{losses} {result or ''}", file=sys.stderr)
    return seasons, schedules


def espn_players(league, team_id, schedules, flags):
    """Who played: everyone listed in any regular-season box score. Their numbers: ESPN's season totals,
    counting only the rows for this team (ESPN's box scores have gaps, so they aren't summed)."""
    ids, files = {}, []
    for label, year in sorted(schedules.items(), key=lambda kv: kv[1]):
        sched_url = f"{ESPN_API}/{league}/teams/{team_id}/schedule?season={year}&seasontype=2"
        games = [e for e in get(sched_url).get("events", []) if e["competitions"][0]["status"]["type"]["completed"]]
        for e in games:
            box = get(f"{ESPN_API}/{league}/summary?event={e['id']}").get("boxscore", {}).get("players", [])
            for t in box:
                if t["team"]["id"] == str(team_id):
                    for a in t["statistics"][0]["athletes"]:
                        if a["athlete"].get("id"):
                            ids.setdefault(a["athlete"]["id"], a["athlete"].get("displayName") or a["athlete"].get("shortName"))
        print(f"  {league} roster {label}: {len(games)} games, {len(ids)} players so far", file=sys.stderr)
    rows, no_page = [], []
    for aid, name in ids.items():
        url = f"{ESPN_WEB}/{league}/athletes/{aid}/stats?seasontype=2"
        try:
            cats = {c["name"]: c for c in get(url).get("categories", [])}
        except Exception:
            no_page.append(name)  # ESPN has no stats page for this player id
            continue
        tot, avg = cats.get("totals"), cats.get("averages")
        if not tot or not avg:
            continue
        gp_at = {(r["season"]["year"], r.get("teamId")): int(r["stats"][avg["names"].index("gamesPlayed")] or 0) for r in avg["statistics"]}
        mine = [r for r in tot["statistics"] if r.get("teamId") == str(team_id) and espn_season_label(league, r["season"]["year"]) in flags]
        if not mine:
            continue
        val = lambda r, k: int(float(r["stats"][tot["names"].index(k)] or 0))
        seasons = {espn_season_label(league, r["season"]["year"]) for r in mine}
        gp = sum(gp_at.get((r["season"]["year"], str(team_id)), 0) for r in mine)
        if gp == 0:
            continue
        files.append(url)
        rows.append({"name": name, "url": f"https://www.espn.com/{league}/player/_/id/{aid}", "seasons": span(seasons), **runs(seasons, flags),
                     "gp": gp, "pts": sum(val(r, "points") for r in mine), "reb": sum(val(r, "totalRebounds") for r in mine),
                     "ast": sum(val(r, "assists") for r in mine)})
    print(f"  {league} players: {len(rows)}", file=sys.stderr)
    return [group("players", "Players", [col("seasons", "Seasons", "text"), col("gp", "Games"), col(*TEAM_WINS), col(*PO),
                                         col("pts", "Points"), col("reb", "Rebounds"), col("ast", "Assists")], rows, "pts",
                  source(ESPN_PUB, "ESPN site API: player season stats", ESPN_SITE, files[0],
                         f"categories totals/averages, statistics[] rows where teamId = {team_id}",
                         "Players: everyone in any regular-season box score for the team. Numbers: each player's ESPN season totals for this team only, "
                         "added up (games played from the averages table, matched by season and team)."), files,
                  "Regular season only. Source: ESPN, not the league — nba.com and wnba.com don't allow scripted access."
                  + (f" {len(no_page)} player{'s' if len(no_page) != 1 else ''} in the box scores ({', '.join(sorted(no_page))}) "
                     f"{'have' if len(no_page) != 1 else 'has'} no ESPN stats page and {'aren' if len(no_page) != 1 else 'isn'}'t included." if no_page else "")
                  + RUN_NOTE + TW_NOTE)]

UNAVAILABLE_WHY = {
    "nba": "The NBA publishes team records on nba.com, which refuses scripted access, so we can't generate them from the official source yet.",
    "wnba": "The WNBA publishes team records on wnba.com, which refuses scripted access, so we can't generate them from the official source yet.",
    "cfl": "The CFL's stats service isn't openly accessible, so we can't generate the Argonauts' records from the official source yet.",
}


def team(id, name, league, sport, trophy, seasons=None, unavailable=None, url=None, players=None, secondary=None):
    t = {"id": id, "name": name, "league": league, "sport": sport, "trophy": trophy, "url": url}
    if secondary:
        t["secondarySource"] = secondary
    if seasons is None:
        t["available"] = False
        t["reason"] = unavailable
        return t
    t["available"] = True
    t["seasons"] = seasons
    t["championships"] = [s["season"] for s in seasons if s["champion"]]
    t["players"] = players
    return t


def flags_of(seasons, key=lambda s: s["season"]):
    # Seasons in progress don't count toward any player total (the page shows them as "In progress" only).
    return {key(s): (bool(s["playoffs"]), s["champion"], s["wins"]) for s in seasons if not s["inProgress"]}


def main():
    jays_s, leafs_s, tfc_s = jays(), leafs(), tfc()
    raps_s, raps_sched = espn_team("nba", 28, 1996)
    tempo_s, tempo_sched = espn_team("wnba", 131935, 2026)
    # "1966–67" → NHL seasonId 19661967 (NHL seasons always span two consecutive years).
    leafs_flags = flags_of(leafs_s, key=lambda s: int(s["season"][:4]) * 10001 + 1)
    teams = [
        team("jays", "Toronto Blue Jays", "MLB", "Baseball", "World Series", jays_s, url="https://www.mlb.com/bluejays", players=jays_players(flags_of(jays_s))),
        team("raptors", "Toronto Raptors", "NBA", "Basketball", "NBA championship", raps_s, url="https://www.nba.com/raptors",
             players=espn_players("nba", 28, raps_sched, flags_of(raps_s)), secondary="ESPN"),
        team("leafs", "Toronto Maple Leafs", "NHL", "Hockey", "Stanley Cup", leafs_s, url="https://www.nhl.com/mapleleafs", players=leafs_players(leafs_flags)),
        team("tempo", "Toronto Tempo", "WNBA", "Basketball", "WNBA championship", tempo_s, url="https://www.wnba.com",
             players=espn_players("wnba", 131935, tempo_sched, flags_of(tempo_s)), secondary="ESPN"),
        team("argos", "Toronto Argonauts", "CFL", "Football", "Grey Cup", unavailable=UNAVAILABLE_WHY["cfl"], url="https://www.argonauts.ca"),
        team("tfc", "Toronto FC", "MLS", "Soccer", "MLS Cup", tfc_s, url="https://www.torontofc.ca", players=tfc_players(flags_of(tfc_s))),
    ]
    # Sanity checks against figures the leagues state elsewhere would be guesses; instead check
    # internal consistency: every champion season has a playoff run and a result saying so.
    for t in teams:
        for s in t.get("seasons", []):
            if s["champion"] and not (s["playoffs"] and s["result"] and s["result"].startswith("Won")):
                sys.exit(f"{t['id']} {s['season']}: champion without a winning playoff result")
            if s["playoffs"] and not s["result"]:
                sys.exit(f"{t['id']} {s['season']}: made the playoffs but no result")
    write(OUT, {"teams": teams}, "scripts/extract_sports.py")


if __name__ == "__main__":
    main()
