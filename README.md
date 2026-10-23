# Wildy Slayer

An Old School RuneScape Wilderness Slayer helper and its RuneLite companion
plugin.

- **Web app**: https://wildy-slayer.vercel.app/ (source in `web/`, deployed by Vercel from `main`,
  root directory `web`). Look up your character, pick your Slayer master
  (Turael through Duradel, Konar, Krystilia and Mortimer) and the task, and
  get what the monster is weak to (elemental weakness and its lowest
  defence), what it does to you (poison, venom, dragonfire, icy breath, stat
  drains), what you must bring (nose peg, mirror shield, boots of stone,
  antifire, anti-venom...), what to do, the spots (Konar's assignable ones
  flagged), the gear for your levels and what you own, the supplies and the
  cost at today's prices. Krystilia's Wilderness tasks are hand-curated in
  `web/data.js`; every other master's tasks are in `web/slayer.js`, built by
  `scripts/slayer-data/` from curated JSON plus each target's OSRS Wiki
  infobox and the masters' assignment tables. Serverless functions in
  `web/api/slayer/` proxy the hiscores, wiki pages, images and prices, and
  `web/api/slayer/sync.js` is the sync endpoint the plugin talks to (one row
  per pairing code in Supabase).
  Without the plugin, the "Your bank, levels and setups" card imports a
  **Data Exporter** JSON/CSV (skills and bank) or a **Bank Memory** tab-separated
  item list, dropped on the page, picked as files or pasted, and uses it exactly
  like a plugin sync. Sign in (Supabase email and password, shared playground
  project, table `slayer_profiles` under row-level security) and the import and
  the saved setups follow you to every device; without an account they stay in
  that browser.
- **RuneLite plugin**: this repository root is a standard RuneLite plugin
  Gradle project (`build.gradle`, `src/`, `runelite-plugin.properties`),
  submitted to the Plugin Hub (pending review). Install page:
  https://wildy-slayer.vercel.app/plugin/.
- **Wire format** between the two: [PROTOCOL.md](PROTOCOL.md).

Started in the [playground](https://github.com/Zlerp/playground) and
graduated here. Game data from the OSRS Wiki (CC BY-NC-SA 3.0).

## RuneLite plugin

Syncs your levels, items and Slayer task with the
[Wildy Slayer](https://wildy-slayer.vercel.app/) web app, outlines its gear
picks in your bank and routes to the spot via
[Shortest Path](https://github.com/Skretzo/shortest-path). The app can then
pick gear you actually own; the plugin outlines that gear in your bank,
inventory and equipment tab, lists the setups you saved in the app with an
**Apply** button each, and asks Shortest Path to draw the route to the chosen
spot. Nothing moves your character.

The wire format is in [PROTOCOL.md](PROTOCOL.md).

### What it does

- **Sync (opt-in, off by default).** While you are logged in, the plugin pushes
  a snapshot of your own character to the server at most once every 2 seconds
  after something in it changes, and polls the server every 5 seconds
  (configurable, 3 to 60) for the selection and setups the app wrote.
  Everything is keyed by an 8-character pairing code. In the Wilderness, in a
  PvP area and on a PvP world your inventory and equipment are **not**
  refreshed or sent: pushes keep the last inventory and equipment taken
  outside those areas (empty lists if none has been taken since you logged in
  or the plugin started), and a fresh snapshot goes out when you leave. After
  a login, hop or reconnect nothing is pushed until the client has read
  whether you are in such an area. Levels, task and bank sync as usual there.
- **Bank highlights.** Items in the app's pick are outlined green, the
  next-best alternatives yellow, the "what to bring" supplies cyan.
  Alternatives and supplies can each be turned off, as can outlining in each
  of bank / inventory / equipment. Only items
  you have are outlined, and gear and alternative picks count only for items
  RuneLite's item stats mark as equipable.
- **Side panel.** Sync status, the game's current task (read from the game,
  so it shows without pairing too), the app's selection
  (task, spot, style, setup) with one row per gear slot showing the item icon,
  its name and whether it is **Worn**, in your **Inventory**, in the **Bank** or
  **Missing**, and the list of saved setups (at most 60).
- **Shortest Path.** **Show path** asks the Shortest Path plugin to draw the
  route to the selected spot. The spot's coordinates come from a table bundled
  in the plugin (built from the app's task data), looked up by the selected
  task and location; coordinates from the server are ignored. **Clear path**
  is enabled only after this plugin has drawn a route and has not cleared it
  since, and only until another plugin sets or clears a Shortest Path route;
  it asks Shortest Path to clear its current route. A destination you set
  yourself on the world map cannot be detected, so Clear path would clear
  that one too. *Auto path on new selection* is **off by default**; when you
  turn it on, a selection made in the app after the plugin's first sync is
  pathed automatically, except while you are in the Wilderness, a PvP area, on
  a PvP world or in an instance, or in the first ticks after a login or hop.
  Shortest Path only draws a route on the map; nothing moves your character.
- **Info overlay.** A small on-screen box with your current task (no pairing
  needed) and the selected task, spot and style (melee, ranged or magic).
  Toggleable.

### Install

**From the Plugin Hub**

1. In RuneLite, open the configuration panel (wrench icon), click
   **Plugin Hub**, search for **Wildy Slayer** and install it.
2. Also install **Shortest Path** from the Plugin Hub; **Show path** needs it.

The plugin has been submitted to the
[Plugin Hub](https://github.com/runelite/plugin-hub) and is pending review;
until it is accepted it does not show up in the search. The normal RuneLite
client does not load sideloaded jars, so until then the only way to run it is
a development client built from this source (see [Development](#development)).

### Pairing

1. Open the web app and read the pairing code it shows (`XXXX-XXXX`). The app
   generates one per browser and remembers it.
2. In RuneLite, open the Wildy Slayer plugin settings, paste the code into
   **Pairing code** (with or without the dash), and tick **Enable sync**. The
   client warns you that this sends data to a third-party server; accept it.
3. Log in. The panel's status line goes from "Syncing..." to "Synced Ns ago".
   The app now sees your levels, task and bank; open your bank once so the
   plugin can read it, pick a task in the app, and the plugin outlines the
   gear next time the bank is open.

"Open app" in the panel opens the web app with your code in the URL. The
pairing code is a bearer token: anyone holding it can read and write that
pairing's synced data, like the app key of other sync plugins such as Mystix.
Treat it like a password; the config field is marked secret and the panel
never shows it. "New code" in the app starts a fresh row.

### Rules

How the plugin complies with Jagex's third-party client guidelines and the
RuneLite Plugin Hub rules (as listed in [AGENTS.md](AGENTS.md), copied from
RuneLite's plugin template):

| Rule | How this plugin complies |
| --- | --- |
| Java 11, no reflection, no JNI/JNA, no native memory, no external processes, no dynamic code loading, no Java serialization | Plain Java 11 (`options.release.set(11)`); only RuneLite's API, OkHttp, Gson and Swing. Nothing is loaded, spawned or serialized; the server only ever returns JSON data. |
| No injecting input, no automation | The plugin never clicks, types, walks or sends anything to the game server. **Show path** and the opt-in auto path only ask Shortest Path to draw a route; the player walks it. Auto path is off by default and never fires in the Wilderness, a PvP area, on a PvP world or in an instance. |
| No new menu entries that send actions to the server; no menu removal | No menu entries are added or removed anywhere. |
| No interface changes (unhiding components, moving click zones, click-through) | Nothing in the game interface is moved, hidden or shown; the overlays only draw outlines on top of items and a small info box. |
| No PvP information (opponent info, level-range indicators, group summaries, scouting) | The plugin reads and shows nothing about other players and has no PvP features. In the Wilderness, PvP areas and on PvP worlds it does not refresh or send your inventory and equipment (pushes keep the last snapshot taken outside them, or empty lists if none has been taken since you logged in or the plugin started), and it does not auto path there. After a login, hop or reconnect it pushes and auto paths nothing until it has read whether you are in such an area. Your RSN, levels, task and last-seen bank still sync there. |
| No combat helpers (prayer switching, attack prediction, counters, boss mechanics) | No prayer switching, attack timing or style prediction, counters or boss-mechanic information is read, shown or sent (a boss Slayer task's name is shown like any other task). The panel shows sync status, your task, the selected task, spot, style and gear, and setup names. |
| Server-driven behaviour stays bounded | The server can only choose which of **your own** items get outlined: gear and alternative ids count only for items RuneLite's item stats mark as equipable, and the lists are capped (11 gear slots x 8 ids, 22 alternatives x 8 ids, 40 supplies x 8 ids). Walk targets come only from the spot table bundled in the plugin, by task and location index (the location name the app sends is used only as a lookup key when the index no longer matches it, and is never shown); coordinates from the server are ignored and an unknown task, index or name gives no target. The game-view overlay shows names from that table and the style only if it is melee, ranged or magic; text from the server (at most 60 setup names, each trimmed to 40 characters, and sync error messages trimmed to 60) appears only in the side panel. **Clear path** is enabled only after this plugin drew a route and before it or another plugin cleared or replaced it, and the plugin never changes Shortest Path's settings. |
| No exposing player information over HTTP; no crowdsourcing data about other players | The plugin runs no local server. Only the local player's own data is sent, only while the user has sync on, only to the server URL they configured, under their own pairing code; the Plugin Hub listing carries the 3rd-party warning quoted under [Privacy](#privacy). No data about other players is ever collected. |
| Third-party server features must be opt-in and carry the IP warning | **Enable sync** is off by default and carries the exact warning: "This feature submits your IP address to a 3rd-party server not controlled or verified by RuneLite developers". Nothing is sent until it is on. |
| No credential storage; no plugins built on player-provided IDs for their entire functionality | No game credentials are touched. The pairing code is a bearer token for the opt-in sync feature: anyone holding it can read and write that pairing's synced data, like the app key of the accepted Mystix plugin, so it is a secret config field and the panel never shows it. It pairs two clients of the same user; it is not an account or player identifier, and the panel and info overlay read and show your current Slayer task from the game without it. |
| Specific config group; gameval constants; `LinkBrowser` for URLs; OkHttp + injected Gson; no blocking IO on the client thread; cleanup on shutdown | Group `wildy-slayer`; `InventoryID`, `VarPlayerID`, `VarbitID`, `DBTableID`, `InterfaceID` from `net.runelite.api.gameval`; `LinkBrowser.browse`; `OkHttpClient` and `Gson` are injected, every request uses `enqueue`; the snapshot is built on the client thread and the network runs on OkHttp's pool; callbacks that arrive after `shutDown()` are dropped; overlays, the sidebar button, scheduled tasks and client-thread state are cleared in `shutDown()`. |
| Permissive license; no build artifacts committed; no `META-INF/services` plugin file | BSD 2-Clause; `.gitignore` from the template; the plugin is declared in `runelite-plugin.properties` only. |

### Privacy

The Plugin Hub listing carries this warning:

> This plugin submits your IP address, RSN, skill levels, Slayer task, and bank, inventory and equipment contents to a 3rd-party server not controlled or verified by RuneLite developers.

- **What is sent.** Data about **your own account only**: your RSN (display
  name), combat level, real skill levels, current Slayer task (name, amount
  left and assigned, area, master), and the ids, quantities and names of the
  items in your bank (as last seen), inventory and equipment, plus the plugin
  version and a timestamp. The server sees your IP address with every request.
  Bank, inventory and equipment can each be turned off (**Share bank**,
  **Share inventory**, **Share equipment**); the next push then sends an empty
  list, so it leaves the server too. Nothing about other players is read or
  sent.
- **When.** Only while **Enable sync** is on (it is **off by default**) and
  you are logged in: a push at most once every 2 seconds after your levels,
  task, bank, inventory or equipment change, and a poll every 5 seconds
  (configurable) that sends only the pairing code. Turning sync off stops
  both.
- **Wilderness and PvP.** While you are in the Wilderness, a PvP area or on a
  PvP world, the plugin does not refresh or send your inventory and
  equipment; pushes keep the last inventory and equipment taken outside those
  areas (empty lists if none has been taken since you logged in or the plugin
  started), and a fresh snapshot is sent when you leave. After a login, hop or
  reconnect nothing is pushed until the plugin has read whether you are in
  such an area. Your RSN, levels, task and bank are sent there as everywhere
  else.
- **Where.** Only to the **Server URL** you configured (default
  `https://wildy-slayer.vercel.app`, a Vercel function that stores one row per
  pairing code in a Supabase Postgres table), together with your pairing code.
  The function does not store your IP address.
- **Retention.** The server keeps one row per pairing code. Rows become
  eligible for deletion after 120 days untouched (`PRUNE_DAYS` in
  `web/api/slayer/sync.js`) and are removed by a best-effort periodic prune
  that runs on a small share of writes. Turning sync off does not delete the
  row; "New code" in the app starts a fresh one, and the old one is removed
  the same way once it has been untouched for 120 days.
- The plugin writes nothing to disk; its only persisted state is RuneLite's
  own config for the settings above.

### Development

For contributors. The project is laid out like RuneLite's
[example-plugin](https://github.com/runelite/example-plugin), and
[AGENTS.md](AGENTS.md) (RuneLite's rules for plugin authors) applies to every
change.

**Run it in a development client**

Current RuneLite only turns on developer mode, which sideloading needs, when
the client was **not** started by the RuneLite launcher and Java assertions
are on, so a jar in `~/.runelite/sideloaded-plugins/` is never loaded by the
normal client. To run unreleased changes, build a development client from
this source:

1. Java 17 (the plugin itself targets Java 11). macOS with Homebrew:
   `brew install --cask temurin@17`; otherwise Temurin 17 from
   https://adoptium.net. If several JDKs are installed, on macOS
   `export JAVA_HOME=$(/usr/libexec/java_home -v 17)` first.
2. `git clone https://github.com/Zlerp/wildy-slayer` (or Code, Download ZIP).
3. In that folder: `chmod +x gradlew` once, then `./gradlew run`
   (Windows: `gradlew.bat run`). The first run downloads Gradle and the
   RuneLite client. A RuneLite window opens with **Wildy Slayer** loaded.
4. Log in. A username and password account logs in as usual. A **Jagex
   account** needs a one-time credentials file: start your normal RuneLite from
   the Jagex Launcher with the client argument `--insecure-write-credentials`
   (launcher configuration window: `RuneLite --configure`, launcher 2.6.3 or
   newer), log in once, and it writes `~/.runelite/credentials.properties`,
   which the development client then uses. Treat that file as a password and
   delete it (and remove the argument) when done. See
   [Using Jagex Accounts](https://github.com/runelite/runelite/wiki/Using-Jagex-Accounts).
5. Install Shortest Path from the Plugin Hub inside that client.

**Layout**

```
build.gradle, settings.gradle, gradlew, gradle/   # Gradle wrapper build, Java 11
runelite-plugin.properties                       # Plugin Hub manifest
src/main/java/com/zlerp/wildyslayer/
  WildySlayerPlugin        events, debounced push, poll, Shortest Path messages
  WildySlayerConfig        the settings (Sync, Highlights, Shortest Path, Display)
  Spots                    bundled spot table (task slug, names, walk targets), generated from web/data.js
  SyncClient               GET/POST to /api/slayer/sync/ via OkHttp enqueue
  SyncModels               Gson models matching PROTOCOL.md
  SnapshotBuilder          builds the player payload on the client thread
  SlayerTaskReader         current task from the Slayer varps and DB tables
  GearHighlightOverlay     outlines in bank / inventory / equipment
  WildySlayerPanel         the sidebar panel
  WildySlayerInfoOverlay   the on-screen summary
src/main/resources/com/zlerp/wildyslayer/icon.png
src/test/java/com/zlerp/wildyslayer/
  WildySlayerPluginTest    ./gradlew run entry point
  SpotsTest                spot table, target lookup, name and text bounds
  PluginVersionTest        runelite-plugin.properties version == PLUGIN_VERSION
scripts/gen_spots.mjs                            # regenerates Spots.java from web/data.js
```

`Spots.java` mirrors the tasks and locations (with their `wp` walk targets)
in `web/data.js`. Regenerate it whenever a task or location there changes,
with `node scripts/gen_spots.mjs` (`node scripts/gen_spots.mjs --check` exits
1 when it is stale): the plugin takes walk targets and the names it shows
from it, never from the server. Plugin builds already released keep their
own table, so a task's locations in `data.js` are append-only (new ones at
the end, none removed or reordered) and task slugs never change.

On each Plugin Hub update bump `version` in `runelite-plugin.properties` and
`PLUGIN_VERSION` in `WildySlayerPlugin` together; `PluginVersionTest` fails
when they differ.

Only the user can confirm behaviour in-game; a clean start is not a passing
test. Things to check on a real client: the warning dialog on enabling sync,
the status line after login, outlines appearing in the bank after picking a
task in the app, a saved setup applied from the panel showing up in the app,
**Show path** drawing a Shortest Path route, **Clear path** clearing it and
then turning disabled (also after another plugin such as Quest Helper sets a
route), auto path staying quiet in the Wilderness, the inventory and
equipment the app shows staying frozen while you are in the Wilderness and
updating when you leave, logging in and hopping worlds inside the Wilderness
without the app's inventory and equipment changing, the panel and overlay
showing your task with sync off, and gear outlines appearing for a selection
made right after the client started.
