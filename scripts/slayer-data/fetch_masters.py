import json, re, sys, urllib.parse, urllib.request, os, time
# Parses every master's assignment table (amounts, extended amounts, weights, unlock text, Konar locations) from the wiki.
os.makedirs(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'cache', 'masters'), exist_ok=True)
SP = os.path.join(os.path.dirname(os.path.abspath(__file__)), "cache") + "/"
BASE = "https://wildy-slayer.vercel.app/api/slayer/wiki/?page="
def fetch(page):
    fn = SP + "masters/" + re.sub(r"[^A-Za-z0-9]+", "_", page) + ".json"
    if os.path.exists(fn): return json.load(open(fn))
    for i in range(4):
        try:
            with urllib.request.urlopen(BASE + urllib.parse.quote(page), timeout=60) as r:
                d = json.load(r); json.dump(d, open(fn, "w")); return d
        except Exception as e:
            print("retry", page, e, file=sys.stderr); time.sleep(2)
    raise SystemExit("failed " + page)
MASTERS = ["Turael", "Spria", "Mazchna", "Vannaka", "Chaeldar", "Konar quo Maten", "Nieve", "Duradel", "Mortimer"]
def strip(s):
    s = re.sub(r"<!--.*?-->", "", s, flags=re.S)
    s = re.sub(r"\{\{CiteTwitter[^}]*\}\}", "", s)
    s = re.sub(r"\{\{SCP\|([^|}]+)\|([^|}]+)\}\}", r"\2 \1", s)
    s = re.sub(r"\[\[([^\]|]*)\|([^\]]*)\]\]", r"\2", s)
    s = re.sub(r"\[\[([^\]]*)\]\]", r"\1", s)
    s = re.sub(r"\{\{\+=\|weight\|(\d+)[^}]*\}\}", r"\1", s)
    s = re.sub(r"\{\{[^}]*\}\}", "", s)
    s = re.sub(r"<ref[^>]*>.*?</ref>", "", s, flags=re.S)
    s = re.sub(r"<[^>]+>", "", s)
    s = re.sub(r"'''?", "", s)
    return re.sub(r"\s+", " ", s).strip()
out = {}
for m in MASTERS:
    w = fetch(m)["wikitext"]
    i = w.find("==Tasks==")
    if i < 0: i = w.find("==Assignments==")
    sec = w[i:]
    j = sec.find("\n==", 5); sec = sec[:j] if j > 0 else sec
    tr = re.search(r"\{\{:([^}]+)\}\}", sec)
    if tr and "{|" not in sec:
        sec = fetch(tr.group(1))["wikitext"]
    tbl = sec[sec.find("{|"):sec.rfind("|}")]
    rows = re.split(r"\n\|-\s*\n", tbl)
    header = [strip(h) for h in re.findall(r"^!(.*)$", rows[0], re.M)]
    print(m, header, file=sys.stderr)
    tasks = []
    for r in rows[1:]:
        cells = re.split(r"\n\|", "\n" + r.strip())
        cells = [c for c in cells if c.strip() != ""]
        if len(cells) < 3: continue
        tasks.append({"cells": [strip(c) for c in cells], "raw": r[:400]})
    out[m] = {"header": header, "tasks": tasks}
json.dump(out, open(SP + "master_tables.json", "w"), indent=1)
for m, d in out.items():
    print("\n##", m, d["header"], len(d["tasks"]))
    for t in d["tasks"]: print("  ", " | ".join(t["cells"]))
