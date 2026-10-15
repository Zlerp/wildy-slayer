# Wildy Slayer

An Old School RuneScape Wilderness Slayer helper and its RuneLite companion
plugin.

- **Web app**: https://wildy-slayer.vercel.app/ (source in `web/`, deployed by Vercel from `main`,
  root directory `web`). Look up your character, pick the Krystilia task, get
  the spot, the gear for your levels and what you own, the supplies and the
  cost at today's prices. Serverless functions in `web/api/slayer/` proxy the
  hiscores, wiki images and prices, and `web/api/slayer/sync.js` is the sync
  endpoint the plugin talks to (one row per pairing code in Supabase).
- **RuneLite plugin**: this repository root is a standard RuneLite plugin
  Gradle project (`build.gradle`, `src/`, `runelite-plugin.properties`), so it
  can be submitted to the Plugin Hub as is. Until then it runs in a RuneLite
  development client (`./gradlew run`); install page: https://wildy-slayer.vercel.app/plugin/.
- **Wire format** between the two: [PROTOCOL.md](PROTOCOL.md).

Started in the [playground](https://github.com/Zlerp/playground) and
graduated here. Game data from the OSRS Wiki (CC BY-NC-SA 3.0).

## RuneLite plugin

Companion plugin for the [Wildy Slayer](https://wildy-slayer.vercel.app/)
web app. It syncs **your own** levels, bank, inventory, equipment and current
Slayer task to the app, so the app can pick gear you actually own; it outlines
the gear the app chose in your bank, inventory and equipment tab; it lists the
setups you saved in the app with an **Apply** button each; and it hands the
chosen spot to the [Shortest Path](https://github.com/Skretzo/shortest-path)
plugin, which draws the route.

The wire format is in [PROTOCOL.md](PROTOCOL.md).

### What it does

- **Sync (opt-in, off by default).** While you are logged in, the plugin pushes
  a snapshot of your character to the server at most once every 2 seconds, and
  polls the server every 5 seconds (configurable) for the selection and setups
  the app wrote. Everything is keyed by an 8-character pairing code.
- **Bank highlights.** Items in the app's pick are outlined green, the
  next-best alternatives yellow, the "what to bring" supplies cyan. Each of the
  three is a toggle, as is each of bank / inventory / equipment.
- **Side panel.** Sync status, the game's current task, the app's selection
  (task, spot, style, setup) with one row per gear slot showing the item icon,
  its name and whether it is **Worn**, in your **Inventory**, in the **Bank** or
  **Missing**, and the list of saved setups.
- **Shortest Path.** "Walk there" sends the selection's target to the Shortest
  Path plugin; "Clear path" clears it. With *Auto path on new selection* on, a
  selection made in the app after the plugin's first sync is pathed
  automatically; whatever was already selected when it started is not.
  Shortest Path only draws a route on the map; nothing moves your character.
- **Info overlay.** A small on-screen box with the task, spot and setup name
  (toggleable).

### Install

The plugin is not on the Plugin Hub yet. Current RuneLite only turns on developer mode, which sideloading needs, when the client was **not** started by the RuneLite launcher and Java assertions are on (`RuneLite.java`: `options.has("developer-mode") && RuneLiteProperties.getLauncherVersion() == null`, then an `-ea` check). So a jar dropped into `~/.runelite/sideloaded-plugins/` is never loaded by the RuneLite you install from runelite.net or start from the Jagex Launcher, whatever its settings. Until the plugin is on the Plugin Hub, you run it in a development client built from this source.

**Run it from source**

1. Java 17. macOS with Homebrew: `brew install --cask temurin@17`; otherwise
   Temurin 17 from https://adoptium.net. If several JDKs are installed, on macOS
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
   delete it when done. See
   [Using Jagex Accounts](https://github.com/runelite/runelite/wiki/Using-Jagex-Accounts).
5. Install Shortest Path from the Plugin Hub inside that client.

**Plugin Hub**

Once it has had real-world use, the plan is to submit it to the
[Plugin Hub](https://github.com/runelite/plugin-hub), after which it installs
from the normal client's plugin list and none of the above is needed.

### Pairing

1. Open the web app and read the pairing code it shows (`XXXX-XXXX`). The app
   generates one per browser and remembers it.
2. In RuneLite, open the Wildy Slayer plugin settings, paste the code into
   **Pairing code** (with or without the dash), and tick **Enable sync**. The
   client warns you that this sends data to a third-party server; accept it.
3. Log in. The panel's status line goes from "Syncing..." to "Synced Ns ago".
   The app now sees your levels, task and bank; pick a task in the app and the
   plugin outlines the gear next time you open the bank.

"Open app" in the panel opens the web app with your code in the URL. Anyone
holding the code can read and write that pairing, so treat it like a
password; the config field is marked secret and the panel never shows it.

### Rules

How the plugin complies with Jagex's third-party client guidelines and the
RuneLite Plugin Hub rules (as listed in the plugin template's `AGENTS.md`):

| Rule | How this plugin complies |
| --- | --- |
| Java 11, no reflection, no JNI/JNA, no native memory, no external processes, no dynamic code loading, no Java serialization | Plain Java 11 (`options.release.set(11)`); only RuneLite's API, OkHttp, Gson and Swing. Nothing is loaded, spawned or serialized. |
| No injecting input, no automation | The plugin never clicks, types, walks or sends anything to the game server. Shortest Path only draws a route; the player walks it. |
| No new menu entries that send actions to the server; no menu removal | No menu entries are added or removed anywhere. |
| No interface changes (unhiding components, moving click zones, click-through) | Nothing in the game interface is moved, hidden or shown; the overlay only draws outlines on top of items. |
| No PvP information (opponent info, level-range indicators, group summaries, scouting) | The plugin reads and shows nothing about other players. It has no PvP features at all. |
| No combat helpers (prayer switching, attack prediction, counters, boss mechanics) | No prayer, attack or boss information is read, shown or sent. The panel shows gear, a location and setup names only. |
| No exposing player information over HTTP; no crowdsourcing data about other players | Only the local player's own data is sent, only when the user enables sync, only to the server they configured. No data about other players is ever collected. |
| Third-party server features must be opt-in and carry the IP warning | **Enable sync** is off by default and carries the exact warning: "This feature submits your IP address to a 3rd-party server not controlled or verified by RuneLite developers". Nothing is sent until it is on. |
| No credential storage; no plugins built on player-provided IDs for their entire functionality | No game credentials are touched. The pairing code is a secret config value for the opt-in sync feature. Reading and showing the current task works without it; the highlights, setups and "Walk there" act on the selection the web app wrote under that code (the code pairs two clients of the same user; it is not an account or player identifier). |
| Specific config group; gameval constants; `LinkBrowser` for URLs; OkHttp + injected Gson; no blocking IO on the client thread; cleanup on shutdown | Group `wildy-slayer`; `InventoryID`, `VarPlayerID`, `VarbitID`, `DBTableID`, `InterfaceID` from `net.runelite.api.gameval`; `LinkBrowser.browse`; `OkHttpClient` and `Gson` are injected, every request uses `enqueue`; the snapshot is built on the client thread and the network runs on OkHttp's pool; overlays, the sidebar button and scheduled tasks are removed in `shutDown()`. |
| Permissive license; no build artifacts committed; no `META-INF/services` plugin file | BSD 2-Clause; `.gitignore` from the template; the plugin is declared in `runelite-plugin.properties` only. |

### Privacy

- The plugin sends data about **your own account only**: display name, combat
  level, real skill levels, current Slayer task, and the ids and quantities of
  the items in your bank, inventory and equipment. Each of the three can be
  turned off; the next push (within a couple of seconds) then sends an empty
  list, so it leaves the server too. Nothing about other players is read or
  sent.
- Data goes only to the **Server URL** you configured, together with your
  pairing code, and only while **Enable sync** is on. Sync is **off by
  default**.
- The server keeps one row per pairing code and prunes rows untouched for 120
  days. Change the code in the app to start a fresh row.
- The plugin writes nothing to disk; its only persisted state is RuneLite's
  own config for the settings above.

### Development

The project is laid out like RuneLite's
[example-plugin](https://github.com/runelite/example-plugin) so it can be
lifted into its own repository unchanged:

```
build.gradle, settings.gradle, gradlew, gradle/   # Gradle wrapper build, Java 11
runelite-plugin.properties                       # Plugin Hub manifest
src/main/java/com/zlerp/wildyslayer/
  WildySlayerPlugin        events, debounced push, poll, Shortest Path messages
  WildySlayerConfig        the settings (Sync, Highlights, Shortest Path, Display)
  SyncClient               GET/POST to /api/slayer/sync/ via OkHttp enqueue
  SyncModels               Gson models matching PROTOCOL.md
  SnapshotBuilder          builds the player payload on the client thread
  SlayerTaskReader         current task from the Slayer varps and DB tables
  GearHighlightOverlay     outlines in bank / inventory / equipment
  WildySlayerPanel         the sidebar panel
  WildySlayerInfoOverlay   the on-screen summary
src/main/resources/com/zlerp/wildyslayer/icon.png
src/test/java/com/zlerp/wildyslayer/WildySlayerPluginTest   ./gradlew run entry point
```

Only the user can confirm behaviour in-game; a clean start is not a passing
test. Things to check on a real client: the warning dialog on enabling sync,
the status line after login, outlines appearing in the bank after picking a
task in the app, a saved setup applied from the panel showing up in the app,
and "Walk there" drawing a Shortest Path route.
