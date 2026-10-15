// Generates src/main/java/com/zlerp/wildyslayer/Spots.java from web/data.js.
// usage: node scripts/gen_spots.mjs [repo-root] [--check]
//   repo-root defaults to this script's parent folder; --check exits 1 when Spots.java is stale.
// Evaluates data.js in a sandbox with a fake window object, then writes one entry per task
// (slug, display name) and its locations in order (name, wp x/y/plane).
// Older plugin builds look locations up by index (and by name when the index no longer matches),
// so per-task locations in data.js are append-only and task slugs never change.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const args = process.argv.slice(2);
const check = args.includes("--check");
const root = args.find((a) => !a.startsWith("--")) || path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataPath = path.join(root, "web/data.js");
const outPath = path.join(root, "src/main/java/com/zlerp/wildyslayer/Spots.java");

const sandbox = { window: {} };
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(dataPath, "utf8"), sandbox, { filename: dataPath });
const tasks = sandbox.window.WILDY && sandbox.window.WILDY.TASKS;
if (!Array.isArray(tasks) || tasks.length === 0) throw new Error("window.WILDY.TASKS missing");

const javaString = (s) => {
  if (typeof s !== "string" || s.length === 0) throw new Error("expected a non-empty string, got " + JSON.stringify(s));
  let out = "";
  for (const ch of s) {
    const c = ch.codePointAt(0);
    if (ch === "\\") out += "\\\\";
    else if (ch === "\"") out += "\\\"";
    else if (c < 0x20 || c > 0x7e) {
      if (c > 0xffff) throw new Error("non-BMP character in " + s);
      out += "\\u" + c.toString(16).padStart(4, "0");
    } else out += ch;
  }
  return "\"" + out + "\"";
};
const int = (v, what) => {
  if (!Number.isInteger(v)) throw new Error(what + " is not an integer: " + JSON.stringify(v));
  return String(v);
};

const slugs = new Set();
let locationCount = 0;
const lines = [];
for (const t of tasks) {
  if (slugs.has(t.slug)) throw new Error("duplicate slug " + t.slug);
  slugs.add(t.slug);
  const locs = Array.isArray(t.locations) ? t.locations : [];
  const spotLines = locs.map((l, i) => {
    locationCount++;
    if (!Array.isArray(l.wp) || l.wp.length !== 3) throw new Error(`${t.slug}[${i}] has no wp`);
    const [x, y, plane] = l.wp;
    return `\t\t\tspot(${javaString(l.name)}, ${int(x, t.slug + " x")}, ${int(y, t.slug + " y")}, ${int(plane, t.slug + " plane")})`;
  });
  lines.push(`\t\ttask(m, ${javaString(t.slug)}, ${javaString(t.name)}` + (spotLines.length ? ",\n" + spotLines.join(",\n") : "") + ");");
}

const header = fs.readFileSync(path.join(root, "src/main/java/com/zlerp/wildyslayer/WildySlayerConfig.java"), "utf8").split("package ")[0];

const java = `${header}package com.zlerp.wildyslayer;

import java.util.Arrays;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import javax.annotation.Nullable;
import net.runelite.api.coords.WorldPoint;

/**
 * Every task's locations and walk targets, bundled with the plugin. The app's selection only
 * names a task slug and a location index; names and the Shortest Path target always come from
 * this table, never from the server.
 *
 * <p>Generated from web/data.js by scripts/gen_spots.mjs (${tasks.length} tasks, ${locationCount} locations).
 * Do not edit by hand.
 */
final class Spots
{
	/** One location of a task: its display name and walk target. */
	static final class Spot
	{
		final String name;
		final WorldPoint target;

		private Spot(String name, WorldPoint target)
		{
			this.name = name;
			this.target = target;
		}
	}

	/** One task: its display name and its locations in the app's order. */
	static final class TaskSpots
	{
		final String name;
		final List<Spot> spots;

		private TaskSpots(String name, List<Spot> spots)
		{
			this.name = name;
			this.spots = spots;
		}
	}

	static final int TASK_COUNT = ${tasks.length};
	static final int SPOT_COUNT = ${locationCount};

	private static final Map<String, TaskSpots> TASKS;

	static
	{
		Map<String, TaskSpots> m = new HashMap<>();
${lines.join("\n")}
		TASKS = Collections.unmodifiableMap(m);
	}

	private Spots()
	{
	}

	/** The task for an app slug, or null when the slug is unknown. */
	@Nullable
	static TaskSpots task(@Nullable String slug)
	{
		return slug != null ? TASKS.get(slug) : null;
	}

	/** The location at an index of a task, or null when the slug or index is unknown. */
	@Nullable
	static Spot spot(@Nullable String slug, @Nullable Integer loc)
	{
		TaskSpots task = task(slug);
		if (task == null || loc == null || loc < 0 || loc >= task.spots.size())
		{
			return null;
		}
		return task.spots.get(loc);
	}

	/** Every task, keyed by slug. */
	static Map<String, TaskSpots> all()
	{
		return TASKS;
	}

	private static void task(Map<String, TaskSpots> m, String slug, String name, Spot... spots)
	{
		m.put(slug, new TaskSpots(name, Collections.unmodifiableList(Arrays.asList(spots))));
	}

	private static Spot spot(String name, int x, int y, int plane)
	{
		return new Spot(name, new WorldPoint(x, y, plane));
	}
}
`;

if (check) {
  const current = fs.existsSync(outPath) ? fs.readFileSync(outPath, "utf8") : "";
  if (current !== java) { console.error("Spots.java is out of date"); process.exit(1); }
} else {
  fs.writeFileSync(outPath, java);
}
console.log(JSON.stringify({ tasks: tasks.length, locations: locationCount, out: outPath }));
