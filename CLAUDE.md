@AGENTS.md

# wildy-slayer

Zach's Wilderness Slayer helper: a static web app (`web/`) and a RuneLite
plugin (repository root). Same loop as the playground: the user talks, Claude
builds, tests, ships to `main`, verifies live and hands back the URL. Never
ask whether to deploy.

## Layout

- `web/`: the site Vercel serves (project `wildy-slayer`, team
  `zlerps-projects`, root directory `web`, framework none, production
  https://wildy-slayer.vercel.app/). Plain HTML, JS and CSS, no build step. `web/api/slayer/*.js`
  are Vercel serverless functions (hiscore, img, prices, wiki proxies and the
  `sync` endpoint). `web/vercel.json` sets `trailingSlash: true`, so API
  routes are called as `/api/slayer/x/`. `web/pwa.js` + `web/sw.js` make it
  installable. `web/plugin/` is the plugin's install page.
- Repository root: the RuneLite plugin, laid out exactly like
  runelite/example-plugin (`build.gradle`, `settings.gradle`, Gradle wrapper,
  `runelite-plugin.properties`, `src/main/java/com/zlerp/wildyslayer/`). Keep
  it Plugin Hub compliant: Java 11, no reflection, no input injection, no
  menu entries, nothing about other players, sync opt-in with the mandated
  warning string. Rules are listed in README.md; `AGENTS.md` (imported above)
  is RuneLite's own rule list, copied unchanged from the example-plugin.
- Plugin invariants (keep code, README "Rules" and PROTOCOL.md in step):
  inventory/equipment frozen in the Wilderness, PvP areas and PvP worlds,
  and nothing pushed until 2 ticks after a login/hop/reconnect; walk targets
  and shown task/location names only from `Spots.java` (generated from
  `web/data.js`; `selection.target` is ignored); auto path off by default and
  never in Wilderness/PvP/instances; "Show path", and "Clear path" enabled
  only after we drew a route and until we or another plugin cleared or
  replaced it; server-driven highlights capped, gear/alt ids must be
  equipable; server text in the panel bounded (60 setups, names 40 chars,
  errors 60 chars).
- `Spots.java`: regenerate with `node scripts/gen_spots.mjs` whenever a task
  or location in `web/data.js` changes (`--check` exits 1 when stale). Per-task
  `locations` in `data.js` are append-only (add at the end; never remove or
  reorder) and task slugs never change: released plugin builds resolve
  `selection.loc` against their own copy of the table.
- Version: on each Plugin Hub update bump `version` in
  `runelite-plugin.properties` and `PLUGIN_VERSION` in `WildySlayerPlugin`
  together (`PluginVersionTest` checks they match).
- `PROTOCOL.md`: the sync wire format. Change it on both sides or not at all.

## Services

- Sync storage: table `slayer_sync` in the shared Supabase project
  `opfnasumfsdvfyzytqlv` (row-level security on, no policies). The function
  reads `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` from the Vercel
  project's env (production and preview).
- Vercel: pushes to `main` deploy production; `?teamId=team_5aPlADHwZtwuCWXoiRKTbbnN`
  on every API call. Force a deploy: `POST /v13/deployments` with
  `{"name":"wildy-slayer","project":"prj_yeFWpHiVnyZXEigAMSd3KQrGNp0I","target":"production","gitSource":{"type":"github","ref":"main","repoId":1420117501}}`.
- The sandbox cannot reach oldschool.runescape.wiki; use the production proxy
  `/api/slayer/wiki/?page=` when game data is needed.

## Testing

- Web: serve `web/` at a local root with the sync handler in-process (the
  playground scratchpad's `test/wildy-sync-server.mjs` pattern: real
  `api/slayer/sync.js` + in-memory DB stub, other `/api/slayer/*` proxied to
  production) and run Playwright on desktop and iPhone 13 viewports. The page
  exposes `window.__wildy` (`S`, `TASKS`, `ITEMS`, `calc()`, `sync()`,
  `poll()`, `pushNow()`).
- Plugin: repo.runelite.net is blocked from the sandbox, so Gradle cannot
  resolve the client jar. Compile against the RuneLite sources instead:
  `git clone --depth 1 https://github.com/runelite/runelite`, delombok
  `runelite-api` and `runelite-client` with lombok 1.18.30, add stubs for
  `net.runelite.http.api.*`, `net.runelite.discord.*`, `com.apple.eawt.*`,
  `net.runelite.rlawt.*`, then `javac --release 11 -proc:full
  -processorpath lombok.jar -XDshould-stop.ifError=FLOW -implicit:class
  -sourcepath api:client:stubs -cp <Maven Central deps>` on `src/main/java`.
  Zero errors in plugin files is the bar; jar only `com/zlerp/wildyslayer/**`
  plus resources into a scratch jar to check packaging (do not publish it: current
  RuneLite never loads sideloaded jars when started by its launcher, see README
  Development). If the environment
  allows repo.runelite.net, `./gradlew jar` is the real build.
- Nothing in-game can be verified from the sandbox and automating the game is
  forbidden; tell the user what to test in RuneLite.

## Definition of done

Push to `main`, wait for the Vercel deployment to be READY, load
https://wildy-slayer.vercel.app/ and https://wildy-slayer.vercel.app/plugin/ in headless Chromium (desktop and phone, zero
console errors, prices loaded, pairing block shows a code), check
`/api/slayer/sync/?code=ZZZZ9999` answers `{"ok":true,"version":0,...}`, and
report the URL. Keep the playground's index card for this app pointing here.
