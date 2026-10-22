# slayer-data: the all-masters task table

`web/slayer.js` is generated. Edit the curated JSON, rerun the build, commit both.

```sh
cd scripts/slayer-data
python3 -I fetch_masters.py      # masters' assignment tables -> cache/master_tables.json (needs the production wiki proxy)
python3 -I build_slayer.py       # curated/*.json + wiki infoboxes -> ../../web/slayer.js (warnings on stderr)
python3 -I fetch_items.py        # new gear/supplies -> cache/items_new.json, then merge into web/items.js (see CLAUDE.md)
python3 -I wiki.py "Gargoyle@Basement"   # inspect a monster infobox / version
```

- `curated/g1..g4.json`: one object per task: slug, name, image, attributes, superior, targets
  (wiki page + version label + the spot where that variant is fought), locations (region, multi,
  cannon, wildy, danger, task_only, which masters assign the spot, how to get there, notes),
  style and why, prayer, hazards (poison, venom, dragonfire, icebreath, drain, prayer, freeze,
  teleport, stun, magic, ranged, disease, aggressive, pk, special), need (required items; `helm`
  when a Slayer helmet covers it), bring, mechanics, tips, verdict. Item names must match
  `web/items.js` to get prices and icons.
- The build fills every target's combat stats, poison/venom, immunities and elemental weakness
  from its infobox (`drange` = defence vs standard ammo), reads each task's level requirements
  from `Slayer task/<name>` (falling back to the masters' unlock text), and attaches per-master
  amounts, extended amounts and weights. It flags "Baby ..." style variants as `alt` so they are
  never the default target, and warns when a Konar location in the wiki table has no curated spot.
- Wiki pages are cached under `cache/`; delete a file to refetch it.
