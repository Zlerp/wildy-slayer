# Shared wiki helpers: cached fetch through the production proxy, infobox parsing with version support.
import json, re, sys, os, time, urllib.parse, urllib.request
# Wiki helpers: cached fetch through the production proxy (the sandbox cannot reach the wiki directly), infobox parsing with version support.
SP = os.path.join(os.path.dirname(os.path.abspath(__file__)), "cache") + "/"
BASE = "https://wildy-slayer.vercel.app/api/slayer/wiki/?page="
os.makedirs(SP + "pages", exist_ok=True)
def fetch(page):
    fn = SP + "pages/" + re.sub(r"[^A-Za-z0-9]+", "_", page) + ".json"
    if os.path.exists(fn): return json.load(open(fn))
    for i in range(5):
        try:
            with urllib.request.urlopen(BASE + urllib.parse.quote(page), timeout=60) as r:
                d = json.load(r)
                if "wikitext" in d: json.dump(d, open(fn, "w")); return d
                return d
        except urllib.error.HTTPError as e:
            if e.code == 404: d = {"error": "not found", "page": page}; json.dump(d, open(fn, "w")); return d
            print("retry", page, e, file=sys.stderr); time.sleep(2 + i)
        except Exception as e:
            print("retry", page, e, file=sys.stderr); time.sleep(2 + i)
    return {"error": "unreachable", "page": page}

def find_template(text, name):
    """Return the wikitext of the first {{name ...}} template, braces balanced."""
    m = re.search(r"\{\{\s*" + re.escape(name) + r"\s*[\n|]", text, re.I)
    if not m: return None
    i = m.start(); depth = 0; j = i
    while j < len(text):
        if text.startswith("{{", j): depth += 1; j += 2; continue
        if text.startswith("}}", j):
            depth -= 1; j += 2
            if depth == 0: return text[i:j]
            continue
        j += 1
    return None

def parse_params(tpl):
    """Split a template into {param: value} honouring nested braces/brackets."""
    body = tpl.strip()[2:-2]
    parts = []; depth = 0; cur = ""
    i = 0
    while i < len(body):
        c = body[i]
        if body.startswith("{{", i) or body.startswith("[[", i): depth += 1; cur += body[i:i+2]; i += 2; continue
        if body.startswith("}}", i) or body.startswith("]]", i): depth -= 1; cur += body[i:i+2]; i += 2; continue
        if c == "|" and depth == 0: parts.append(cur); cur = ""; i += 1; continue
        cur += c; i += 1
    parts.append(cur)
    out = {}
    for p in parts[1:]:
        if "=" not in p: continue
        k, v = p.split("=", 1)
        out[k.strip().lower()] = v.strip()
    return out

def versions(params):
    vs = {}
    for k, v in params.items():
        m = re.match(r"version(\d+)$", k)
        if m: vs[int(m.group(1))] = v
    return vs

def get(params, key, ver=None):
    """Value of key for a version (number): key<ver>, else key."""
    if ver is not None and (key + str(ver)) in params: return params[key + str(ver)]
    return params.get(key)

def clean(v):
    if v is None: return None
    v = re.sub(r"<!--.*?-->", "", v, flags=re.S)
    v = re.sub(r"<ref[^>]*/>", "", v); v = re.sub(r"<ref[^>]*>.*?</ref>", "", v, flags=re.S)
    v = re.sub(r"\[\[([^\]|]*)\|([^\]]*)\]\]", r"\2", v); v = re.sub(r"\[\[([^\]]*)\]\]", r"\1", v)
    v = re.sub(r"\{\{[^}]*\}\}", "", v); v = re.sub(r"<[^>]+>", "", v)
    return v.strip()

def num(v):
    v = clean(v)
    if v is None: return None
    m = re.search(r"-?\d+(\.\d+)?", v.replace(",", ""))
    return float(m.group(0)) if m and "." in m.group(0) else (int(m.group(0)) if m else None)

def image_name(v):
    v = v or ""
    m = re.search(r"File:([^\]|]+)", v)
    return m.group(1).strip() if m else None

def monster(page, ver=None, name_hint=None):
    """Parse Infobox Monster of a page; ver = version number or version label (e.g. 'Normal')."""
    d = fetch(page)
    if "wikitext" not in d: return {"error": d.get("error", "?"), "page": page}
    w = d["wikitext"]
    tpl = find_template(w, "Infobox Monster")
    if not tpl: return {"error": "no infobox", "page": page}
    p = parse_params(tpl)
    vs = versions(p)
    vnum = None
    if ver is not None:
        if isinstance(ver, int): vnum = ver
        else:
            for n, label in vs.items():
                if clean(label).lower() == str(ver).lower(): vnum = n
            if vnum is None:
                for n, label in vs.items():
                    if str(ver).lower() in clean(label).lower(): vnum = n; break
    if vnum is None and vs: vnum = min(vs)
    g = lambda k: get(p, k, vnum)
    style = clean(g("attack style")) or ""
    out = {
        "page": d.get("title", page), "version": clean(vs.get(vnum)) if vnum else None, "versions": [clean(x) for _, x in sorted(vs.items())],
        "name": clean(g("name")) or page, "image": image_name(g("image")),
        "cb": num(g("combat")), "hp": num(g("hitpoints")), "att": num(g("att")), "str": num(g("str")), "def": num(g("def")), "mage": num(g("mage")), "range": num(g("range")),
        "dstab": num(g("dstab")), "dslash": num(g("dslash")), "dcrush": num(g("dcrush")), "dmagic": num(g("dmagic")),
        "dlight": num(g("dlight")), "dstandard": num(g("dstandard")), "dheavy": num(g("dheavy")), "drange": num(g("drange")),
        "attbns": num(g("attbns")), "strbns": num(g("strbns")), "amagic": num(g("amagic")), "mbns": num(g("mbns")), "arange": num(g("arange")), "rngbns": num(g("rngbns")),
        "maxhit": clean(g("max hit")), "style": style, "speed": num(g("attack speed")), "size": num(g("size")),
        "attributes": clean(g("attributes")) or "", "slaylvl": num(g("slaylvl")), "slayxp": num(g("slayxp")), "cat": clean(g("cat")),
        "aggressive": clean(g("aggressive")), "poisonous": clean(g("poisonous")), "venomous": clean(g("venomous")) if g("venomous") else None,
        "poisonres": num(g("poisonresistance")) if g("poisonresistance") is not None else None, "venomres": num(g("venomresistance")) if g("venomresistance") is not None else None,
        "immunepoison": clean(g("immunepoison")), "immunevenom": clean(g("immunevenom")), "immunecannon": clean(g("immunecannon")), "immunethrall": clean(g("immunethrall")),
        "elemtype": clean(g("elementalweaknesstype")), "elempct": num(g("elementalweaknesspercent")),
        "members": clean(g("members")), "id": num(g("id")), "examine": clean(g("examine")),
        "assignedby": clean(g("assignedby")),
    }
    return out

def slayer_task(name):
    d = fetch("Slayer task/" + name)
    if "wikitext" not in d: return {"error": d.get("error", "?"), "page": name}
    tpl = find_template(d["wikitext"], "Infobox Slayer")
    if not tpl: return {"error": "no infobox", "page": name, "text": d["wikitext"][:3000]}
    p = {k: clean(v) for k, v in parse_params(tpl).items()}
    p["_text"] = d["wikitext"]
    return p

if __name__ == "__main__":
    for arg in sys.argv[1:]:
        page, _, ver = arg.partition("@")
        print(json.dumps(monster(page, ver or None), indent=1))
