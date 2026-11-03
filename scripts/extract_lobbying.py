"""
Lobbying (lib/lobbying.json): who lobbies the City, about what, and whom, from the Lobbyist Registry.

  City of Toronto Open Data: lobbyist-registry ("Lobbyist Registry Activity", lobbyactivity.zip: active and closed
  subject-matter registrations as XML)

A "communication" is one reported contact (meeting, email, call…) between a lobbyist and a public office holder.
The registry lists each lobbyist at a contact separately, so contacts are de-duplicated by subject matter and
CommunicationGroupId (or date, office holder and method when there's no group id). Office holders are named only
when they're members of Council (elected); City staff are counted by office, not by name.
"""
import collections, io, os, re, sys, zipfile
import xml.etree.ElementTree as ET

sys.path.insert(0, os.path.dirname(__file__))
from _common import fetch, open_data_source, package, point, ranking, resource, series, write, year_to_date_note

PKG = "lobbyist-registry"
OUT = os.path.join(os.path.dirname(__file__), "..", "lib", "lobbying.json")
FIRST = 2011  # the file holds only a handful of contacts before 2011


def clean(s):
    return re.sub(r"\s+", " ", (s or "").strip())


def main():
    pkg = package(PKG)
    res = resource(pkg, "Lobbyist Registry Activity")
    z = zipfile.ZipFile(io.BytesIO(fetch(res["url"])))
    contacts = {}          # key → (year, month, poh type, poh name, office, method, subjects, client, sm type)
    registrations = collections.Counter()
    for member in z.namelist():
        for _, el in ET.iterparse(z.open(member)):
            if el.tag != "SM":
                continue
            sm, smtype = el.findtext("SMNumber"), clean(el.findtext("Type"))
            subjects = [clean(s) for s in (el.findtext("SubjectMatter") or "").split(";") if clean(s)]
            d0 = el.findtext("InitialApprovalDate") or ""
            if d0[:4].isdigit():
                registrations[int(d0[:4])] += 1
            client = next((clean(b.findtext("Name")) for b in el.iter("BENEFICIARY") if clean(b.findtext("Name"))), None) \
                or next((clean(f.findtext("Name")) for f in el.iter("Firm") if clean(f.findtext("Name"))), None)
            for c in el.iter("Communication"):
                d = c.findtext("CommunicationDate") or ""
                if not d[:4].isdigit():
                    continue
                g = clean(c.findtext("CommunicationGroupId"))
                poh = clean(c.findtext("POH_Name"))
                method = clean(c.findtext("CommunicationMethod"))
                key = (sm, g) if g else (sm, d, poh, method)
                contacts.setdefault(key, (int(d[:4]), d[:7], clean(c.findtext("POH_Type")), poh, clean(c.findtext("POH_Office")), method, subjects, client, smtype))
            el.clear()
    last = max(c[1] for c in contacts.values())
    ly, lm = int(last[:4]), int(last[5:])
    year = ly - 1 if lm < 12 else ly
    ytd = year_to_date_note(lm) if lm < 12 else None
    years = list(range(FIRST, ly + 1))
    per_year = collections.Counter(c[0] for c in contacts.values())
    src = lambda what, how: open_data_source(pkg, res["url"], what, how)
    dedup = "Contacts de-duplicated by SMNumber and CommunicationGroupId (or date, office holder and method)."
    S = {
        "contacts": series("contacts", "Reported lobbying contacts", "count", [point(y, per_year[y], ytd if y == ly else None) for y in years],
                           src("Communication elements with a CommunicationDate, active and closed files", f"Counted per year of CommunicationDate. {dedup}")),
        "registrations": series("registrations", "New subject-matter registrations", "count", [point(y, registrations[y], ytd if y == ly else None) for y in years],
                                src("SM elements, InitialApprovalDate", "Registrations counted per year first approved.")),
    }
    yr = [c for c in contacts.values() if c[0] == year]
    council = collections.Counter((c[3], c[4]) for c in yr if c[2] == "Member of Council" and c[3])
    names = collections.Counter()
    office_of = collections.defaultdict(collections.Counter)
    for (name, office), v in council.items():
        names[name] += v
        office_of[name][office] += v
    offices = collections.Counter(c[4] for c in yr if c[2] == "Employee of the City" and c[4])
    subjects = collections.Counter(s for c in yr for s in c[6])
    clients = collections.Counter(c[7] for c in yr if c[7])
    methods = collections.Counter("Other" if m.startswith("Other") else m for c in yr for m in c[5].split(";") if m)
    kinds = collections.Counter(c[8] for c in yr if c[8])
    R = {
        "council": ranking("council", f"Most-lobbied members of Council, {year}", "count",
                           [{"label": n, "value": v, "sub": office_of[n].most_common(1)[0][0] or None} for n, v in names.most_common(15)],
                           src(f"POH_Type = Member of Council, POH_Name and POH_Office, contacts in {year}", f"Contacts counted per member of Council. {dedup}")),
        "offices": ranking("offices", f"City offices lobbied most, {year}", "count",
                           [{"label": o, "value": v} for o, v in offices.most_common(12)],
                           src(f"POH_Type = Employee of the City, POH_Office, contacts in {year}", f"Contacts counted per office as written. {dedup}")),
        "subjects": ranking("subjects", f"What they lobbied about, {year}", "count",
                            [{"label": s, "value": v} for s, v in subjects.most_common(12)],
                            src(f"SubjectMatter of each contact's registration, contacts in {year}", f"A registration can list several subjects; each contact counts once for each. {dedup}")),
        "clients": ranking("clients", f"Who lobbied most, {year}", "count",
                           [{"label": cl, "value": v} for cl, v in clients.most_common(15)],
                           src(f"Beneficiary (client) name, or the in-house firm's name, contacts in {year}", f"Contacts counted per client or organization, by name as registered. {dedup}")),
        "methods": ranking("methods", f"How, {year}", "count",
                           [{"label": m, "value": v} for m, v in methods.most_common(6)],
                           src(f"CommunicationMethod, contacts in {year}", f"A contact listing several methods counts once for each. {dedup}")),
        "kinds": ranking("kinds", f"Who does the lobbying, {year}", "count",
                         [{"label": {"Consultant": "Consultant lobbyists (hired)", "In-house": "In-house lobbyists (employees)", "Voluntary": "Voluntary (unpaid)"}.get(k, k), "value": v} for k, v in kinds.most_common()],
                         src(f"Type of each contact's registration, contacts in {year}", f"Contacts counted per registration type. {dedup}")),
    }
    write(OUT, {"year": year, "lastMonth": last, "series": S, "ranks": R}, "scripts/extract_lobbying.py")


if __name__ == "__main__":
    main()
