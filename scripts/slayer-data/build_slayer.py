# Builds web/slayer.js (all-masters task data) from curated/*.json (hand-written locations, hazards, items, strategy),
# the OSRS Wiki infoboxes of every target (via the production wiki proxy, cached under cache/pages/) and the masters'
# assignment tables (cache/master_tables.json from fetch_masters.py).
# usage: python3 -I build_slayer.py [--curated DIR] [--out FILE]   (run fetch_masters.py first, or keep its cached table)
import sys, json, re, glob, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from wiki import fetch, find_template, parse_params, clean, num, monster, slayer_task
HERE = os.path.dirname(os.path.abspath(__file__))
args = sys.argv[1:]
cur_dir = args[args.index("--curated") + 1] if "--curated" in args else os.path.join(HERE, "curated")
out_path = args[args.index("--out") + 1] if "--out" in args else os.path.normpath(os.path.join(HERE, "..", "..", "web", "slayer.js"))
TABLES = os.path.join(HERE, "cache", "master_tables.json")
warn = lambda *a: print("WARN", *a, file=sys.stderr)

MASTER_IDS = {"Turael": "turael", "Spria": "spria", "Mazchna": "mazchna", "Vannaka": "vannaka", "Chaeldar": "chaeldar", "Konar quo Maten": "konar", "Nieve": "nieve", "Duradel": "duradel", "Mortimer": "mortimer"}
MASTERS = [
  {"id": "turael", "name": "Turael", "alt": "Aya after While Guthix Sleeps", "where": "Burthorpe", "combat": 0, "slayer": 0, "req": None, "points": 0, "block": 40, "tele": "Games necklace to Burthorpe, or the Taverley/Burthorpe house portal", "notes": "Easy tasks and zero points. Also the free way to cancel another master's task (your streak resets)."},
  {"id": "spria", "name": "Spria", "alt": None, "where": "Draynor Village", "combat": 0, "slayer": 0, "req": "A Porcine of Interest", "points": 0, "block": 40, "tele": "Glory to Draynor Village", "notes": "Turael's tasks plus sourhogs, no points. Shares a block list with Turael."},
  {"id": "mazchna", "name": "Mazchna", "alt": "Achtryn during While Guthix Sleeps", "where": "Canifis", "combat": 20, "slayer": 0, "req": "Priest in Peril", "points": 6, "block": 50, "tele": "Kharyrll teleport (Ancients), fairy ring CKS, or the Salve Graveyard teleport and a short run", "notes": "Low-level tasks, 6 points each."},
  {"id": "vannaka", "name": "Vannaka", "alt": None, "where": "Edgeville Dungeon", "combat": 40, "slayer": 0, "req": None, "points": 8, "block": 60, "tele": "Glory to Edgeville, trapdoor east of the bank", "notes": "Mid-level tasks, 8 points. The only master besides Mortimer with infernal mages."},
  {"id": "chaeldar", "name": "Chaeldar", "alt": None, "where": "Zanaris (throne room)", "combat": 70, "slayer": 0, "req": "Lost City", "points": 10, "block": 70, "tele": "Fairy ring to Zanaris (or the Lumbridge swamp shed with a dramen staff)", "notes": "10 points per task; the first master with the high-level tasks."},
  {"id": "konar", "name": "Konar quo Maten", "alt": None, "where": "Mount Karuulm", "combat": 75, "slayer": 0, "req": None, "points": 18, "block": 80, "tele": "Rada's blessing 3+ to Mount Karuulm, or fairy ring CIR", "notes": "18 points (20 with the elite Kourend & Kebos diary), but every task names a location you must kill them in. Brimstone keys from kills on her tasks."},
  {"id": "nieve", "name": "Nieve", "alt": "Steve after Monkey Madness II", "where": "Tree Gnome Stronghold", "combat": 85, "slayer": 0, "req": None, "points": 12, "block": 90, "tele": "Slayer ring to the Stronghold Slayer Cave entrance, or the spirit tree", "notes": "12 points (15 with the elite Western Provinces diary). The usual choice for mid-game points."},
  {"id": "duradel", "name": "Duradel", "alt": "Kuradal after While Guthix Sleeps", "where": "Shilo Village", "combat": 100, "slayer": 50, "req": "Shilo Village", "points": 15, "block": 100, "tele": "Karamja gloves 3+ teleport, or fairy ring CKR and run", "notes": "15 points and the longest tasks: the end-game points master."},
  {"id": "krystilia", "name": "Krystilia", "alt": None, "where": "Edgeville", "combat": 0, "slayer": 0, "req": None, "points": 25, "block": 100, "tele": "Glory to Edgeville", "notes": "Every task is in the Wilderness: 25 points per task, Larran's keys, PKers. Separate streak from the other masters."},
  {"id": "mortimer", "name": "Mortimer", "alt": None, "where": "Wyrmscraig Cavern", "combat": 100, "slayer": 70, "req": "Fallen From Grace (partial)", "points": 0, "block": 120, "tele": "Wyrmscraig Cavern (reached during Fallen From Grace)", "notes": "Pick one of two offered tasks (three after 50). Points come only from a task's modifier (5-40). Only monsters with superior variants; skips cost 100 points and cannot be cancelled with Turael."},
]
# (tele text for a few masters is cleaned up below from the wiki infobox location)
def key(n):
    n = clean(n).lower().strip()
    n = re.sub(r"\s+", " ", n)
    if n in ("boss", "bosses"): return "bosses"
    n = re.sub(r"s$", "", n)
    return n

tables = json.load(open(TABLES))
# per task key: { master: {amount, extended, weight, unlock, locations[]} }
by_task = {}
for mname, d in tables.items():
    mid = MASTER_IDS[mname]
    hdr = [re.sub(r'^.*\|', '', h).strip().lower() for h in d["header"]]
    for t in d["tasks"]:
        cells = t["cells"]
        if mname == "Mortimer":
            # Monster | Amount | Extended amount | Weight | Unlock | ...
            if len(cells) < 5 or not re.match(r"^\d+-\d+$", cells[1] or ""): continue
            row = {"amount": cells[1], "extended": cells[2], "weight": cells[3], "unlock": cells[4], "locations": []}
        else:
            row = {}
            for h, c in zip(hdr, cells):
                c = re.sub(r'^data-sort-value="[^"]*"\s*\|', "", c).strip()
                if h == "monster": row["monster"] = c
                elif h == "amount": row["amount"] = c
                elif h.startswith("extended"): row["extended"] = c
                elif h.startswith("unlock"): row["unlock"] = c
                elif h == "weight": row["weight"] = c
                elif h.startswith("possible locations"): row["locations"] = [x.strip() for x in c.split("*") if x.strip()]
            row.setdefault("locations", [])
        name = cells[0]
        k = key(name)
        ent = by_task.setdefault(k, {})
        rng = lambda s: [int(x) for x in re.findall(r"\d+", s or "")[:2]] or None
        amt = rng(row.get("amount")); 
        if amt and len(amt) == 1: amt = [amt[0], amt[0]]
        ext = rng(row.get("extended"))
        if ext and len(ext) == 1: ext = [ext[0], ext[0]]
        ent[mid] = {"amount": amt, "extended": ext, "weight": num(row.get("weight")), "unlock": row.get("unlock"), "locations": row.get("locations", []), "name": name}

tasks = []
files = sorted(f for f in glob.glob(cur_dir + "/*.json") if not os.path.basename(f).startswith("_"))
seen = set()
for f in files:
    for t in json.load(open(f)):
        if t["slug"] in seen: warn("duplicate slug", t["slug"], f); continue
        seen.add(t["slug"])
        t["_file"] = os.path.basename(f)
        tasks.append(t)
print(len(tasks), "curated tasks from", len(files), "files", file=sys.stderr)

STYLE_MAP = [("dragonfire", "dragonfire"), ("icy breath", "icebreath"), ("magical melee", "magic-melee"), ("magical ranged", "magic-ranged"), ("ranged melee", "ranged"), ("melee", "melee"), ("stab", "melee"), ("slash", "melee"), ("crush", "melee"), ("ranged", "ranged"), ("magic", "magic"), ("typeless", "typeless")]
def style_of(s):
    s = (s or "").lower()
    parts = []
    for word in re.split(r"[,/]| and ", s):
        word = word.strip()
        if not word: continue
        for k, v in STYLE_MAP:
            if k in word: 
                if v not in parts: parts.append(v)
                break
    return "+".join(parts) if parts else (s or "melee")
def first_int(s):
    m = re.search(r"\d+", s or ""); return int(m.group(0)) if m else 0
def maxhit_of(s):
    # "10 (Slash), 50 (Dragonfire)" -> main (non-breath) max and breath max
    s = s or ""
    nums = [(int(a), (b or "").lower()) for a, b in re.findall(r"(\d+)\+?\s*(?:\(([^)]*)\))?", s)]
    if not nums: return 0, None
    breath = [n for n, lab in nums if "fire" in lab or "breath" in lab]
    main = [n for n, lab in nums if not ("fire" in lab or "breath" in lab)]
    return (max(main) if main else nums[0][0]), (max(breath) if breath else None)

out_tasks = []
for t in tasks:
    k = key(t["name"])
    masters = by_task.get(k)
    if not masters:
        # try slug-based key
        alt = key(t["slug"].replace("-", " "))
        masters = by_task.get(alt)
    if not masters: warn(t["slug"], "not in any master table (name", t["name"], ")")
    masters = masters or {}
    st = slayer_task(t["name"])
    if "error" in st:
        # try singular / other casing
        for cand in [t["name"].rstrip("s"), t["name"].title(), t["name"].capitalize()]:
            st = slayer_task(cand)
            if "error" not in st: break
    sl = cb = None; other = None
    if "error" not in st:
        sl = num(st.get("skillreq")) if st.get("skillreq") and "none" not in st.get("skillreq").lower() else None
        cb = num(st.get("combatreq")) if st.get("combatreq") and "none" not in st.get("combatreq").lower() else None
        other = st.get("otherreq") if st.get("otherreq") and "none" not in st.get("otherreq").lower() else None
    else:
        warn(t["slug"], "no Slayer task page:", st.get("error"))
    if sl is None:
        # derive from the master tables' unlock text
        for m in masters.values():
            mm = re.search(r"(\d+) Slayer(?! reward)", m.get("unlock") or "")
            if mm: sl = int(mm.group(1)); break
    if cb is None:
        for m in masters.values():
            mm = re.search(r"(\d+) Combat", m.get("unlock") or "")
            if mm: cb = int(mm.group(1)); break
    targets = []
    for tg in t["targets"]:
        mo = monster(tg["page"], tg.get("ver"))
        if "error" in mo: warn(t["slug"], "target", tg["page"], tg.get("ver"), mo["error"]); continue
        if tg.get("ver") and mo.get("version") and clean(tg["ver"]).lower() != (mo["version"] or "").lower() and str(tg["ver"]).lower() not in (mo["version"] or "").lower():
            warn(t["slug"], "version mismatch", tg["page"], tg.get("ver"), "->", mo.get("version"), mo.get("versions"))
        mh, breath = maxhit_of(mo["maxhit"])
        drange = mo["dstandard"] if mo["dstandard"] is not None else (mo["drange"] if mo["drange"] is not None else 0)
        pois = (mo.get("poisonous") or "").lower()
        venom = "venom" in pois or (mo.get("venomous") or "").lower().startswith("yes")
        poison = pois.startswith("yes") and not venom
        targets.append({
            "name": tg.get("name") or mo["name"], "page": mo["page"], "cb": mo["cb"] or 0, "hp": mo["hp"] or 1, "def": mo["def"] or 1,
            "dstab": mo["dstab"] or 0, "dslash": mo["dslash"] or 0, "dcrush": mo["dcrush"] or 0, "dmagic": mo["dmagic"] or 0, "drange": drange or 0,
            "dlight": mo["dlight"], "dheavy": mo["dheavy"],
            "mage": mo["mage"] or 1, "att": mo["att"] or 1, "maxhit": max(1, mh), "breath": breath, "style": style_of(mo["style"]), "speed": mo["speed"] or 4, "size": int(mo["size"] or 1),
            "image": mo["image"] or (mo["name"] + ".png"), "loc": tg.get("loc"),
            "attributes": sorted(set(re.sub(r"\d+$", "", a.strip().lower()) for a in (mo["attributes"] or "").split(",") if a.strip())),
            "poison": poison, "venom": venom, "poisonNote": clean(mo.get("poisonous")) if pois and not pois.startswith("no") else None,
            "immune": {"poison": (mo.get("poisonres") or 0) >= 100 or (mo.get("immunepoison") or "").lower().startswith("yes"), "venom": (mo.get("venomres") or 0) >= 100 or (mo.get("immunevenom") or "").lower().startswith("yes"), "cannon": (mo.get("immunecannon") or "").lower().startswith("yes"), "thrall": (mo.get("immunethrall") or "").lower().startswith("yes")},
            "elem": {"type": mo["elemtype"].strip().capitalize(), "pct": mo["elempct"]} if mo.get("elemtype") else None,
            "slaylvl": mo.get("slaylvl"), "slayxp": mo.get("slayxp"),
            # alt: a weaker side variant (babies, hatchlings, spawns): shown in the target picker, never the default
            "alt": bool(re.match(r"^(baby|small|young|hatchling|cub|spawn|offspring|fledgeling|grizzly bear cub|bear cub)\b", (tg.get("name") or mo["name"]).lower()) or "avoid" in (tg.get("name") or "").lower()),
        })
    if not targets: warn(t["slug"], "NO TARGETS RESOLVED"); continue
    # masters: amounts/weights
    mast = {}
    for mid, m in masters.items():
        if m["amount"]: mast[mid] = {"amount": m["amount"], "extended": m["extended"], "weight": m["weight"]}
        # Konar location check
        if mid == "konar":
            for ln in m["locations"]:
                if ln.lower() == "varies": continue
                hit = any(ln.lower().split(" (")[0] in L["name"].lower() or L["name"].lower().split(" (")[0] in ln.lower() for L in t["locations"])
                if not hit: warn(t["slug"], "Konar location missing from curated locations:", ln)
    unlock_bits = []
    if other: unlock_bits.append(re.sub(r"\s+", " ", other).rstrip(".") + ".")
    if t.get("unlock") and (not other or t["unlock"].lower()[:12] not in other.lower()): unlock_bits.append(t["unlock"])
    attrs = sorted(set(re.sub(r"\d+$", "", a) for a in t.get("attr", [])) | set(a for tg in targets for a in tg["attributes"]))
    RENAME = {"Fungicide spray": "Fungicide spray 10"}
    for lst in (t.get("need", []), t.get("bring", [])):
        for e in lst:
            if e.get("item") in RENAME: e["item"] = RENAME[e["item"]]
    out_tasks.append({
        "slug": t["slug"], "name": t["name"], "image": t.get("image") or targets[0]["image"], "slayer": int(sl or 1), "combat": int(cb or 0),
        "unlock": " ".join(unlock_bits) or None, "attr": attrs, "superior": t.get("superior"),
        "masters": mast, "targets": targets, "locations": t["locations"],
        "style": t["style"], "styleWhy": t["styleWhy"], "pray": t["pray"], "hazards": t.get("hazards", []), "need": t.get("need", []), "bring": t.get("bring", []),
        "mechanics": t.get("mechanics"), "tips": t.get("tips", []), "verdict": t.get("verdict", "do"), "verdictWhy": t.get("verdictWhy"), "aoe": bool(t.get("aoe")),
    })
    for L in t["locations"]:
        for kreq in ["name", "region", "multi", "cannon", "wildy", "danger", "task_only", "masters", "tele", "notes"]:
            if kreq not in L: warn(t["slug"], "location", L.get("name"), "missing", kreq)
# tasks in the master tables but not curated
curated_keys = {key(t["name"]) for t in tasks}
for k, ms in by_task.items():
    if k not in curated_keys and k != "bosses": warn("not curated:", k, "(", ", ".join(ms.keys()), ")")
out_tasks.sort(key=lambda t: (t["slayer"], t["name"]))
js = ["// All-masters Slayer task data for the Wildy Slayer app. Generated by the scratchpad's tools/build_slayer.py from",
      "// curated JSON (locations, hazards, required items, strategy) + OSRS Wiki infoboxes (every target's combat stats,",
      "// attributes, poison/venom, elemental weakness; drange = defence vs standard ammo) + each master's assignment table",
      "// (amounts, extended amounts, weights). Krystilia's tasks stay in data.js. Regenerate rather than hand-edit.",
      "window.SLAYER = {",
      "MASTERS: " + json.dumps(MASTERS, ensure_ascii=False) + ",",
      "TASKS: ["]
for t in out_tasks: js.append(json.dumps(t, ensure_ascii=False) + ",")
js.append("]};")
open(out_path, "w").write("\n".join(js) + "\n")
print(json.dumps({"tasks": len(out_tasks), "targets": sum(len(t["targets"]) for t in out_tasks), "locations": sum(len(t["locations"]) for t in out_tasks), "out": out_path}))
