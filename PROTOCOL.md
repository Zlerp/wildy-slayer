# Wildy Slayer sync protocol

One JSON endpoint of the app joins the RuneLite plugin and the web app:

    https://wildy-slayer.vercel.app/api/slayer/sync/

(The trailing slash is required; the site redirects without it.) Storage is one
row per pairing code in the `slayer_sync` table of the shared Supabase project
(row-level security on, no policies; only the serverless function, holding the
service key, touches it).

## Pairing code

Eight characters from `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (no 0/O/1/I), shown as
`XXXX-XXXX`. The web app generates one and keeps it in `localStorage`
(`wildy:code`); the player types it into the plugin's config (or opens the app
from the plugin, which passes `?code=` in the URL). The code is the only
credential, a bearer token: anyone holding it can read and write that row. The server
normalises codes with `toUpperCase().replace(/[^A-Z0-9]/g, "")` and requires
`^[A-Z0-9]{8}$`.

## Requests

### GET `?code=XXXXXXXX[&v=<version>]`

Returns the whole row:

```json
{ "ok": true, "code": "XXXXXXXX", "version": 1760500000000,
  "player": { ... } | null, "playerAt": 1760500000000 | null,
  "selection": { ... } | null, "selectionAt": ... | null,
  "setups": [ ... ], "setupsAt": ... | null,
  "now": 1760500001234 }
```

An unknown code is not an error: `version` is `0` and the parts are null / `[]`.
When `v` equals the current `version` the body is just
`{ "ok": true, "version": ..., "unchanged": true, "now": ... }`, so pollers
send their last version every time. `version` is the server clock (ms) of the
last write, not a counter; compare for equality only.

### POST (JSON body) `[?full=1]`

```json
{ "code": "XXXXXXXX", "player": {...}, "selection": {...}, "setups": [...] }
```

Any subset of `player`, `selection`, `setups` may be present; each one given
replaces that part completely (parts are stored as separate columns, so the
plugin writing `player` never clobbers the app writing `selection`). Response
`{ "ok": true, "version", "now" }`, or the full GET body with `?full=1` (the
plugin uses this to push and pull in one round trip). Size limits: `player`
300 KB, `selection` 40 KB, `setups` 400 KB and at most 60 entries; over the
limit is a 413. Rows untouched for 120 days become eligible for deletion and
are removed by a best-effort prune that runs on about 1% of writes.

Both clients poll GET every 5 s by default (plugin: configurable, 3-60 s)
while active (the plugin only while logged in; the app only while the tab is
visible and a code is set), and write with a 2 s debounce.

## `player` (written by the plugin only)

Own-account data only; nothing about other players.

```json
{
  "rsn": "Zlerp", "combat": 112, "pluginVersion": "1.0.0", "at": 1760500000000,
  "levels": { "attack": 80, "strength": 85, "defence": 75, "ranged": 90, "magic": 88,
              "prayer": 70, "hitpoints": 86, "slayer": 72, "agility": 65, "...": "every skill, lower-case Skill.getName()" },
  "task": { "name": "Dust devils", "amount": 123, "initial": 150, "location": null, "master": "Krystilia" } | null,
  "bank": [[26674, 1], [11864, 1], [560, 2400]],
  "bankAt": 1760499000000,
  "inventory": [[995, 120000], [12695, 2]],
  "equipment": [[26674, 1]],
  "names": { "26674": "Slayer helmet (i)", "11864": "Slayer helmet", "560": "Death rune" }
}
```

* Item lists are `[itemId, quantity]` pairs with ids passed through
  `ItemManager.canonicalize` (unnoted, not placeholders), sorted by id.
  `bank` is the last bank the plugin saw (the bank container only exists
  while the bank is open); `bankAt` says when. `names` covers every id in the
  three lists (`ItemComposition.getName()`), so the app can match variants
  (coloured slayer helms, charged/uncharged, degraded barrows pieces) by name.
* `task` comes from the varps the core Slayer plugin reads
  (`VarPlayerID.SLAYER_COUNT`, `SLAYER_TARGET`, `SLAYER_AREA`, names through
  `DBTableID.SlayerTask` / `SlayerArea`); `master` is `"Krystilia"` when
  `VarbitID.SLAYER_MASTER == 7`, else the number as a string, or null.
* `levels` are real (unboosted) levels.
* Wilderness and PvP freeze: while `VarbitID.INSIDE_WILDERNESS` or
  `VarbitID.PVP_AREA_CLIENT` is 1, or `WorldType.isPvpWorld(client.getWorldType())`,
  the plugin does not refresh `inventory` or `equipment`: pushes keep the
  last lists taken outside those areas (and `names` keeps covering them), or
  send `[]` when none has been taken since login or plugin start (logging out
  and restarting the plugin forget them; a world hop does not). On leaving,
  it takes a fresh snapshot and pushes. After a login, hop or reconnect it
  pushes nothing until 2 game ticks after `LOGGED_IN`, since those varbits
  arrive after that event. `rsn`, `levels`, `task` and `bank` are otherwise
  unaffected.

## `selection` (written by the app; by the plugin when it applies a saved setup)

```json
{
  "source": "app" | "plugin", "at": 1760500000000,
  "task": "dust-devils", "taskName": "Dust devils",
  "loc": 0, "locationName": "Wilderness Slayer Cave",
  "target": { "x": 3439, "y": 10123, "plane": 0 } | null,
  "style": "magic", "styleLabel": "Ice Burst",
  "setupId": "s_k3j2x9" | null, "setupName": "Dusties burst" | null,
  "gear": { "head": { "name": "Slayer helmet (i)", "ids": [26674, 25177] }, "weapon": { "name": "Kodai wand", "ids": [21006] } },
  "alts": { "head": [ { "name": "Black mask (i)", "ids": [11784] } ] },
  "supplies": [ { "name": "Blighted super restore(4)", "ids": [24598], "qty": 6 } ]
}
```

* `gear` keys are the app's slots: head, cape, neck, ammo, weapon, body,
  shield, legs, hands, feet, ring. `ids` are resolved by the app against the
  synced bank/inventory/equipment names (every owned id whose normalised name
  matches the item, plus the item's base id from `items.js`), so the plugin
  only ever compares ids: it highlights a bank, inventory or equipment item when
  `canonicalize(id)` is in a `gear` id list (green), an `alts` list (yellow) or
  a `supplies` list (cyan). `alts` are the next-best scored candidates per
  slot (up to 2), `supplies` the "what to bring" rows with ids.
* Bounds the plugin enforces (anything beyond them is ignored): `gear` at most
  11 slots of 8 ids each, `alts` at most 22 entries in total of 8 ids each,
  `supplies` at most 40 entries of 8 ids each. A `gear` or `alts` id counts
  only when its canonical item is equipable per `ItemManager.getItemStats`
  (checked on the client thread); supply ids are not filtered that way, since
  potions, food and runes are not equipable. The side panel lists at most 60
  `setups` and cuts a sync error message (which may carry the server's
  `error` text) to 60 characters. So the server can only choose which of the
  player's own items get outlined.
* The plugin ignores `target`. It resolves the walk target from its bundled
  spot table (`Spots.java`, generated from `web/data.js`): `task` is looked up
  by slug, `loc` is an index into that task's `locations`, and the location's
  `wp: [x, y, plane]` becomes the `WorldPoint`. When `locationName` is set and
  differs from the table's name at `loc` (the app's list changed after that
  plugin build), the location is looked up by that name within the task
  instead; `locationName` is only a lookup key and is never shown. An unknown
  slug, an out-of-range index or an unmatched name means no target. The app's
  non-Wilderness tasks (from `web/slayer.js`) use `task` ids of the form
  `slayer/<slug>` on purpose: the plugin's table is Wilderness only, so for
  those the panel shows "-" for task and spot and no route, while the gear
  highlights and setups still work. Because
  released plugin builds keep their own table, a task's `locations` in
  `web/data.js` are append-only and slugs never change. The app keeps sending
  `target` (the same `wp`) for its own use.
* Names shown by the plugin: the task and location names come from the same
  table, never from `taskName` / `locationName`. The game-view overlay shows
  `style` only when it is `melee`, `ranged` or `magic`. Setup names are shown
  only in the side panel, trimmed to 40 characters.
* Shortest Path messages: **Show path** posts
  `PluginMessage("shortestpath", "path", {"target": new WorldPoint(x, y, plane)})`
  with the table's target. With *Auto path on new selection* on (**off by
  default**) the plugin also posts it when a selection newer than its first
  sync arrives, except while the player is in the Wilderness, a PvP area, on a
  PvP world or in an instance (`client.getTopLevelWorldView().isInstance()`).
  **Clear path** posts `PluginMessage("shortestpath", "clear")` and is enabled
  only after the plugin posted a route and has not cleared it since, and only
  until another plugin posts a `"shortestpath"` `"path"` or `"clear"` message;
  otherwise the button is disabled. A destination the player sets on the
  world map cannot be detected, so it would be cleared too. The plugin never
  sends Shortest Path a config override. Shortest Path only draws the route;
  nothing moves the player.

## `setups` (written by the app only)

```json
[ { "id": "s_k3j2x9", "name": "Dusties burst", "at": 1760500000000,
    "preset": { "task": "dust-devils", "loc": 0, "style": "magic", "tier": "mid", "protect": true,
                "cannon": false, "offPray": true, "pots": true, "spell": "Ice Burst", "amount": 120,
                "overrides": { "neck": "Occult necklace" } },
    "selection": { ...a selection object as above, "source": "app" } } ]
```

Newest first, at most 60. The plugin lists at most 60 of them in its side
panel (names trimmed to 40 characters); "Apply"
posts `setup.selection` back as the current `selection` with
`source: "plugin"`, `setupId`, `setupName` and a fresh `at`. The app, seeing a
plugin-sourced selection newer than what it last applied, loads that setup's
`preset` locally so both sides show the same thing.
