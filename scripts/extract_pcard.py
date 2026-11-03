"""
PCard spending (lib/pcard.json): every purchase City staff made on City purchasing cards (PCards) since 2011.

  City of Toronto Open Data: pcard-expenditures ("PCard Expenses.csv")

Amounts are Transaction Amt. (CAD); credits (refunds) are negative and netted in. The Purpose column is never
shown: it's free text that sometimes names staff or residents. Merchant names have store numbers removed and a
few chains' locations combined (CHAINS), so "THE HOME DEPOT #7013" and "#7078" count as one merchant.
"""
import collections, os, re, sys

sys.path.insert(0, os.path.dirname(__file__))
from _common import csv_rows, open_data_source, package, point, ranking, resource, series, write, year_to_date_note

PKG = "pcard-expenditures"
OUT = os.path.join(os.path.dirname(__file__), "..", "lib", "pcard.json")
# prefix (after store numbers are removed) → one merchant
CHAINS = [("AMZN", "Amazon"), ("AMAZON", "Amazon"), ("THE HOME DEPOT", "The Home Depot"), ("HOME DEPOT", "The Home Depot"), ("CANADIAN TIRE", "Canadian Tire"),
          ("WWW.CANADIANTIRE", "Canadian Tire"), ("WALMART", "Walmart"), ("WAL-MART", "Walmart"), ("COSTCO", "Costco"), ("STAPLES", "Staples"), ("TIM HORTONS", "Tim Hortons"),
          ("STARBUCKS", "Starbucks"), ("MTO TSD SO", "MTO TSD SO (all offices)"), ("UBER", "Uber"), ("APPLE", "Apple"),
          ("BEST BUY", "Best Buy"), ("LOBLAWS", "Loblaws"), ("METRO ", "Metro"), ("NO FRILLS", "No Frills"), ("SHOPPERS DRUG", "Shoppers Drug Mart"), ("RONA", "RONA"),
          ("PIZZA PIZZA", "Pizza Pizza"), ("DOLLARAMA", "Dollarama"), ("ULINE", "Uline"), ("PRESTO", "PRESTO"), ("ZOOM", "Zoom")]
FAMILIAR = ["Amazon", "The Home Depot", "Canadian Tire", "Walmart", "Costco", "Staples", "Tim Hortons", "Starbucks", "Pizza Pizza", "Uber", "Dollarama"]


def merchant(name):
    n = re.sub(r"\s+", " ", (name or "").upper().strip())
    n = re.split(r"\s*#", n)[0].strip()
    n = re.sub(r"(\s+\d{2,})+$", "", n).strip()
    for prefix, label in CHAINS:
        if n.startswith(prefix):
            return label
    return n.title()


def main():
    pkg = package(PKG)
    res = resource(pkg, "PCard Expenses.csv")
    rows = [r for r in csv_rows(res["url"]) if re.match(r"\d{4}-\d{2}", r["Transaction Date"] or "")]
    last = max(r["Transaction Date"][:7] for r in rows)
    ly, lm = last[:4], int(last[5:])
    years = sorted({r["Transaction Date"][:4] for r in rows if r["Transaction Date"][:4] >= "2011"})
    full = [y for y in years if not (y == ly and lm < 12)]
    latest = full[-1]
    amt = lambda r: float(r["Transaction Amt."] or 0)
    spend, count = collections.Counter(), collections.Counter()
    div, merch, mtype, gl, fam = collections.Counter(), collections.Counter(), collections.Counter(), collections.Counter(), collections.Counter()
    merch_n = collections.Counter()
    biggest = []
    for r in rows:
        y = r["Transaction Date"][:4]
        if y < "2011":
            continue
        a = amt(r)
        spend[y] += a
        count[y] += 1
        m = merchant(r["Merchant Name"])
        if m in FAMILIAR:
            fam[(m, y)] += a
        if y == latest:
            div[r["Division"].strip().title()] += a
            merch[m] += a
            merch_n[m] += 1
            mtype[(r["Merchant Type Description"] or "").strip()] += a
            biggest.append((a, m, r["Division"].strip().title(), (r["G/L Account Description"] or "").strip()))
    ytd = year_to_date_note(lm) if lm < 12 else None
    src = lambda what, how: open_data_source(pkg, res["url"], what, how)
    S = {
        "spend": series("spend", "Spent on PCards", "dollars", [point(y, round(spend[y]), ytd if y == ly else None) for y in years],
                        src("Transaction Amt., all rows, by year of Transaction Date", "Summed per year; refunds (negative amounts) netted in.")),
        "purchases": series("purchases", "Purchases", "count", [point(y, count[y], ytd if y == ly else None) for y in years],
                            src("all rows, by year of Transaction Date", "Rows counted per year (refunds included).")),
        **{f"fam_{i}": series(f"fam_{i}", m, "dollars", [point(y, round(fam[(m, y)]), ytd if y == ly else None) for y in years],
                              src(f"Merchant Name beginning {', '.join(p for p, l in CHAINS if l == m)}", "Transaction Amt. summed per year across the chain's locations."))
           for i, m in enumerate(FAMILIAR)},
    }
    title = lambda s: s if not s.isupper() else s.title()
    biggest.sort(key=lambda b: -b[0])
    R = {
        "divisions": ranking("divisions", f"Which divisions spend the most, {latest}", "dollars",
                             [{"label": d, "value": round(v)} for d, v in div.most_common(12)],
                             src(f"Division and Transaction Amt., rows dated {latest}", "Summed per division, using the Division names as written: a division renamed partway through the year appears under both names.")),
        "merchants": ranking("merchants", f"Where the money went, {latest}", "dollars",
                             [{"label": m, "value": round(v), "sub": f"{merch_n[m]:,} purchases"} for m, v in merch.most_common(15)],
                             src(f"Merchant Name and Transaction Amt., rows dated {latest}", "Summed per merchant, with store numbers removed and a few chains' locations combined.")),
        "types": ranking("types", f"What kind of shops, {latest}", "dollars",
                         [{"label": title(t) or "Not given", "value": round(v)} for t, v in mtype.most_common(12)],
                         src(f"Merchant Type Description and Transaction Amt., rows dated {latest}", "Summed per merchant type.")),
        "familiar": ranking("familiar", f"Some familiar names, {latest}", "dollars",
                            sorted([{"label": m, "value": round(fam[(m, latest)])} for m in FAMILIAR], key=lambda r: -r["value"]),
                            src(f"Merchant Name and Transaction Amt., rows dated {latest}", "Summed across each chain's locations (merchant names beginning with the chain's name).")),
        "biggest": ranking("biggest", f"The biggest single purchases, {latest}", "dollars",
                           [{"label": m, "value": round(a, 2), "sub": f"{d} · {g.capitalize() if g and g != 'None' else 'no category given'}"} for a, m, d, g in biggest[:10]],
                           src(f"rows dated {latest}, highest Transaction Amt.", "As published: merchant, division and G/L Account Description (the Purpose text isn't shown).")),
    }
    write(OUT, {"lastMonth": last, "latestYear": latest, "series": S, "ranks": R}, "scripts/extract_pcard.py")


if __name__ == "__main__":
    main()
