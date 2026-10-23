# Adds the all-masters gear and supplies to web/items.js from wiki infoboxes; requirements/tags curated here.
import sys, json, re, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from wiki import fetch, find_template, parse_params, clean, num, image_name
HERE = os.path.dirname(os.path.abspath(__file__))
ALL = ["melee", "ranged", "magic"]
# name: (styles, req, tags, untrade_value, note, bonus)
NEW = {
  # required slayer gear
  "Nose peg":          (ALL, {}, ["slayerreq"], None, "Blocks aberrant spectre breath (slayer helm does too).", None),
  "Facemask":          (ALL, {}, ["slayerreq"], None, "Dust and smoke devils (slayer helm does too).", None),
  "Earmuffs":          (ALL, {}, ["slayerreq"], None, "Banshees' scream (slayer helm does too).", None),
  "Spiny helmet":      (ALL, {"def": 5}, ["slayerreq"], None, "Wall beasts (slayer helm does too).", None),
  "Reinforced goggles":(ALL, {}, ["slayerreq"], None, "Sourhogs (slayer helm does too).", None),
  "Witchwood icon":    (ALL, {"sla": 35}, ["slayerreq"], None, "Cave horrors' scream; the slayer helm does NOT cover this.", None),
  "Mirror shield":     (ALL, {"def": 20, "sla": 25}, ["slayerreq"], None, "Cockatrice and basilisks; the slayer helm does NOT cover this.", None),
  "V's shield":        (ALL, {"def": 40}, ["slayerreq"], 50000, "Fremennik Exiles reward; counts as a mirror shield with real stats.", None),
  "Insulated boots":   (ALL, {}, ["slayerreq"], None, "Killerwatts.", None),
  "Boots of stone":    (ALL, {}, ["slayerreq"], None, "Karuulm Slayer Dungeon floor (or elite Kourend & Kebos diary).", None),
  "Slayer gloves":     (ALL, {}, ["slayerreq"], None, "Fever spiders.", None),
  "Leaf-bladed sword": (["melee"], {"att": 50, "sla": 55}, ["leafy"], None, "Hits turoth and kurask.", None),
  "Leaf-bladed spear": (["melee"], {"att": 50, "sla": 55}, ["leafy"], None, "Hits turoth and kurask; two-handed.", None),
  "Broad arrows":      (["ranged"], {"ran": 50, "sla": 55}, ["ammo", "leafy"], 60, "Hits turoth and kurask; Broader fletching to make.", None),
  "Dragon hunter lance":(["melee"], {"att": 78}, ["dragonbane"], None, "+20% accuracy and damage vs dragons, wyverns, drakes, hydras.", {"dragon": {"melee": 1.2}}),
  "Serpentine helm":   (["melee"], {"def": 75}, ["venom"], None, "Immune to poison and venom while charged.", None),
  "Dragonfire shield": (["melee"], {"def": 75}, ["dragon"], None, "Blocks dragonfire; charges from breath.", None),
  "Elemental shield":  (ALL, {}, ["dragon", "wyvern"], None, "Elemental Workshop I; reduces wyvern icy breath (not Ancient Wyverns).", None),
  "Mind shield":       (ALL, {"def": 20}, ["dragon", "wyvern"], None, "Elemental Workshop II; reduces wyvern icy breath.", None),
  "Ancient wyvern shield": (["magic"], {"def": 70, "mag": 70}, ["dragon", "wyvern"], None, "Blocks dragonfire and wyvern breath; magic shield.", None),
  "Wolfbane":          (["melee"], {}, ["slayerreq"], None, "Priest in Peril reward; stops werewolves transforming.", None),
  "Blisterwood flail": (["melee"], {"att": 50}, ["vampyre"], 0, "Sins of the Father; the only weapon that fully hurts vyres.", None),
  "Ivandis flail":     (["melee"], {"att": 40}, ["vampyre"], 0, "A Taste of Hope; hurts vyres (vampyre juvinates with the sickle).", None),
  # high tier staples (the Max budget tier)
  "Neitiznot faceguard":(["melee"], {"def": 70}, [], None, "Basilisk Knight jaw on a Neitiznot helm.", None),
  "Bandos chestplate": (["melee"], {"def": 65}, [], None, None, None),
  "Bandos tassets":    (["melee"], {"def": 65}, [], None, None, None),
  "Primordial boots":  (["melee"], {"def": 75, "str": 75}, [], None, None, None),
  "Ferocious gloves":  (["melee"], {"def": 80, "att": 80}, [], None, "Needs a hydra leather and the Alchemical Hydra's... just 80 Defence to wear.", None),
  "Amulet of torture": (["melee"], {}, [], None, None, None),
  "Infernal cape":     (["melee"], {}, [], 0, "Inferno reward.", None),
  "Abyssal tentacle":  (["melee"], {"att": 75}, [], None, "Degrades: 10,000 hits per kraken tentacle.", None),
  "Ghrazi rapier":     (["melee"], {"att": 80}, [], None, "Stab.", None),
  "Osmumten's fang":   (["melee"], {"att": 82}, ["fang"], None, "Stab; rolls accuracy twice.", None),
  "Armadyl helmet":    (["ranged"], {"def": 70, "ran": 70}, [], None, None, None),
  "Armadyl chestplate":(["ranged"], {"def": 70, "ran": 70}, [], None, None, None),
  "Armadyl chainskirt":(["ranged"], {"def": 70, "ran": 70}, [], None, None, None),
  "Pegasian boots":    (["ranged"], {"def": 75, "ran": 75}, [], None, None, None),
  "Karil's leathertop":(["ranged"], {"def": 70, "ran": 70}, [], None, "Barrows; degrades.", None),
  "Karil's leatherskirt":(["ranged"], {"def": 70, "ran": 70}, [], None, "Barrows; degrades.", None),
  "Saradomin d'hide body": (["ranged"], {"def": 40, "ran": 70}, [], None, None, None),
  "Saradomin chaps":   (["ranged"], {"ran": 70}, [], None, None, None),
  "Armadyl crossbow":  (["ranged"], {"ran": 70}, [], None, "One-handed; bolts.", None),
  "Twisted bow":       (["ranged"], {"ran": 85}, [], None, "Scales with the target's Magic level: monsters with high Magic melt.", None),
  "Ahrim's hood":      (["magic"], {"def": 70, "mag": 70}, [], None, "Barrows; degrades.", None),
  "Ahrim's robetop":   (["magic"], {"def": 70, "mag": 70}, [], None, "Barrows; degrades.", None),
  "Ahrim's robeskirt": (["magic"], {"def": 70, "mag": 70}, [], None, "Barrows; degrades.", None),
  "Infinity top":      (["magic"], {"def": 25, "mag": 50}, [], None, None, None),
  "Infinity bottoms":  (["magic"], {"def": 25, "mag": 50}, [], None, None, None),
  "Ancestral hat":     (["magic"], {"def": 65, "mag": 75}, [], None, None, None),
  "Ancestral robe top":(["magic"], {"def": 65, "mag": 75}, [], None, None, None),
  "Ancestral robe bottom":(["magic"], {"def": 65, "mag": 75}, [], None, None, None),
  "Eternal boots":     (["magic"], {"def": 75, "mag": 75}, [], None, None, None),
  "Tormented bracelet":(["magic"], {"mag": 75}, [], None, None, None),
  "Sanguinesti staff": (["magic"], {"mag": 82}, ["powered"], None, "Charges: blood runes. Heals you on hits sometimes.", None),
  "Imbued Zamorak cape": (["magic"], {}, [], 0, "Mage Arena II.", None),
  # supplies and tools (inventory items; priced by name)
  "Extended super antifire(4)": ([], {}, ["consumable"], None, None, None),
  "Antidote+(4)":      ([], {}, ["consumable"], None, None, None),
  "Rock hammer":       ([], {}, ["consumable"], None, None, None),
  "Bag of salt":       ([], {}, ["consumable"], None, None, None),
  "Ice cooler":        ([], {}, ["consumable"], None, None, None),
  "Fungicide spray 10":([], {}, ["consumable"], None, None, None),
  "Bug lantern":       ([], {}, ["consumable"], None, None, None),
  "Bullseye lantern":  ([], {}, ["consumable"], None, None, None),
  "Fishing explosive": ([], {}, ["consumable"], None, None, None),
  "Rope":              ([], {}, ["consumable"], None, None, None),
  "Tinderbox":         ([], {}, ["consumable"], None, None, None),
  "Crystal chime":     ([], {}, ["consumable"], 0, "The Path of Glouphrie; needed for warped creatures", None),
  "Seal of passage":   ([], {}, ["consumable"], 0, "Lunar Diplomacy; needed on Lunar Isle", None),
  "Bonecrusher":       ([], {}, ["consumable"], 0, "Morytania hard diary", None),
  "Divine super combat potion(4)": ([], {}, ["consumable"], None, None, None),
  "Waterskin(4)":      ([], {}, ["consumable"], None, None, None),
  "Spade":             ([], {}, ["consumable"], None, None, None),
  "Slayer bell":       ([], {}, ["consumable"], None, None, None),
  "Efaritay's aid":    ([], {}, ["consumable"], 0, "Lets any melee weapon hurt vampyre juvinates", None),
  "Shayzien helm (5)": ([], {}, ["consumable"], 0, "Blocks lizardman shaman acid", None),
  "Teleport anchoring scroll": ([], {}, ["consumable"], None, None, None),
  "Mystic water staff": (["magic"], {"mag": 40, "att": 40}, ["waterstaff"], None, "Free water runes; Water spells for Water-weak monsters.", None),
  "Mystic earth staff": (["magic"], {"mag": 40, "att": 40}, ["earthstaff"], None, "Free earth runes; Earth spells for Earth-weak monsters.", None),
  "Mystic air staff":   (["magic"], {"mag": 40, "att": 40}, ["airstaff"], None, "Free air runes; Air spells for Air-weak monsters.", None),
  "Bolt rack":         (["ranged"], {"ran": 70}, ["ammo"], None, "Karil's crossbow ammo; always breaks.", None),
  "Blessed d'hide body": ([], {}, [], None, None, None),  # placeholder removed below
}
NEW.pop("Blessed d'hide body")
def tonum(v):
    v = clean(v) if v is not None else None
    if v in (None, ""): return 0
    n = num(v); return n if n is not None else 0
out = {}
for name, (styles, req, tags, untrade, note, bonus) in NEW.items():
    w = fetch(name).get("wikitext", "")
    it = find_template(w, "Infobox Item")
    if not it: print("NO ITEM INFOBOX", name, file=sys.stderr); continue
    d = parse_params(it)
    def g(k):
        for kk in (k, k + "1"): 
            if kk in d: return d[kk]
        return None
    iid = num(g("id"))
    if iid is None and "id" in d: iid = num(d["id"].split(",")[0])
    tradeable = (clean(g("tradeable")) or "").lower().startswith("yes")
    img = image_name(g("image")) or (name + ".png")
    b = find_template(w, "Infobox Bonuses")
    obj = {"name": name, "slot": "inv", "image": img, "id": iid, "tradeable": tradeable, "styles": styles, "req": req, "tags": tags}
    if b and styles:
        p = parse_params(b)
        KEYS = ["astab","aslash","acrush","amagic","arange","dstab","dslash","dcrush","dmagic","drange","str","rstr","mdmg","prayer"]
        # Versioned infoboxes (dstab1/dstab2 ...: Uncharged/Charged, Undamaged/100/75/...): take the version a player wears,
        # the one labelled Charged/Undamaged/Active (else the one with the most defence), never the bare key that is absent.
        vers = sorted(int(m.group(1)) for m in (re.match(r"version(\d+)$", k) for k in p) if m)
        best = None
        if vers:
            labels = {v: clean(p.get("version%d" % v, "")).lower() for v in vers}
            pref = [v for v in vers if re.search(r"charged|undamaged|active|new|^100$", labels[v]) and not re.search(r"uncharged|inactive|broken", labels[v])]
            best = pref[0] if pref else max(vers, key=lambda v: sum(abs(tonum(p.get(k + str(v)))) for k in KEYS))
        def field(k):
            if p.get(k) not in (None, ""): return p.get(k)
            return p.get(k + str(best)) if best is not None else None
        st = {k: tonum(field(k)) for k in KEYS}
        slot = clean(p.get("slot")) or "inv"
        obj.update({"slot": slot, "stats": st, "speed": num(field("speed")) if field("speed") else None, "untrade": untrade if not tradeable else None, "note": note, "bonus": bonus})
    else:
        if note: obj["note"] = note
        if not tradeable: obj["untrade"] = untrade or 0
    out[name] = obj
    print(name, obj["slot"], obj["id"], "tradeable" if tradeable else "UNTRADEABLE", obj.get("stats", {}).get("str") if obj.get("stats") else "", file=sys.stderr)
json.dump(out, open(os.path.join(HERE, "cache", "items_new.json"), "w"), indent=1)
print(len(out), "items parsed")
