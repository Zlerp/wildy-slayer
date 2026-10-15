/*
 * Copyright (c) 2026, Zach Perlman
 * All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 *
 * 1. Redistributions of source code must retain the above copyright notice, this
 *    list of conditions and the following disclaimer.
 * 2. Redistributions in binary form must reproduce the above copyright notice,
 *    this list of conditions and the following disclaimer in the documentation
 *    and/or other materials provided with the distribution.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
 * ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
 * WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT OWNER OR CONTRIBUTORS BE LIABLE FOR
 * ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
 * (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
 * LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
 * ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
 * SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */
package com.zlerp.wildyslayer;

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
 * <p>Generated from web/data.js by scripts/gen_spots.mjs (37 tasks, 69 locations).
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

	static final int TASK_COUNT = 37;
	static final int SPOT_COUNT = 69;

	private static final Map<String, TaskSpots> TASKS;

	static
	{
		Map<String, TaskSpots> m = new HashMap<>();
		task(m, "abyssal-demons", "Abyssal demons",
			spot("Wilderness Slayer Cave", 3343, 10163, 0));
		task(m, "ankou", "Ankou",
			spot("Wilderness Slayer Cave", 3361, 10076, 0),
			spot("The Forgotten Cemetery", 2977, 3748, 0));
		task(m, "aviansies", "Aviansies",
			spot("Wilderness God Wars Dungeon", 3016, 3739, 0));
		task(m, "bandits", "Bandits",
			spot("Bandit Camp", 3038, 3691, 0));
		task(m, "bears", "Bears",
			spot("North-west of Ferox Enclave", 3108, 3662, 0),
			spot("West of the Graveyard of Shadows", 3103, 3677, 0),
			spot("Artio (Hunter's End)", 3116, 3677, 0));
		task(m, "black-demons", "Black demons",
			spot("Edgeville Dungeon (Wilderness part)", 3088, 9961, 0),
			spot("Wilderness Slayer Cave", 3359, 10114, 0));
		task(m, "black-dragons", "Black dragons",
			spot("Lava Maze Dungeon", 3048, 10266, 0),
			spot("Wilderness Slayer Cave", 3361, 10159, 0));
		task(m, "black-knights", "Black Knights",
			spot("South of the Silk Chasm", 3313, 3769, 0),
			spot("Lava Maze", 3042, 3856, 0));
		task(m, "bloodveld", "Bloodveld",
			spot("Wilderness God Wars Dungeon", 3016, 3739, 0));
		task(m, "chaos-druids", "Chaos druids",
			spot("Edgeville Dungeon (Wilderness part)", 3111, 9936, 0),
			spot("Chaos Temple (Elder Chaos druids)", 3235, 3615, 0));
		task(m, "dark-warriors", "Dark warriors",
			spot("Dark Warriors' Fortress", 3028, 3632, 0));
		task(m, "dust-devils", "Dust devils",
			spot("Wilderness Slayer Cave", 3439, 10123, 0));
		task(m, "earth-warriors", "Earth warriors",
			spot("Edgeville Dungeon (Wilderness part)", 3123, 9988, 0));
		task(m, "ents", "Ents",
			spot("Forests north and east of the Chaos Temple", 3305, 3614, 0),
			spot("Forest south of the Lava Maze", 3211, 3690, 0));
		task(m, "fire-giants", "Fire giants",
			spot("Deep Wilderness Dungeon", 3047, 10344, 0));
		task(m, "greater-demons", "Greater demons",
			spot("Wilderness Slayer Cave", 3428, 10151, 0),
			spot("Demonic Ruins", 3282, 3880, 0),
			spot("Lava Maze Dungeon", 3028, 10250, 0));
		task(m, "green-dragons", "Green dragons",
			spot("West of the Dark Warriors' Fortress", 2982, 3618, 0),
			spot("Wilderness Slayer Cave", 3410, 10065, 0),
			spot("North of the Graveyard of Shadows", 3144, 3707, 0),
			spot("South-west of the Bone Yard / south of Lava Maze", 3098, 3821, 0));
		task(m, "hellhounds", "Hellhounds",
			spot("Wilderness Slayer Cave", 3440, 10085, 0),
			spot("North-east of the Deserted Keep (resource area side)", 3172, 3944, 0),
			spot("Vet'ion / Calvar'ion", 3179, 3684, 0));
		task(m, "hill-giants", "Hill Giants",
			spot("Near the Bone Yard hunter area", 3307, 3669, 0),
			spot("Deep Wilderness Dungeon", 3045, 10311, 0));
		task(m, "ice-giants", "Ice giants",
			spot("Wilderness Slayer Cave", 3342, 10056, 0),
			spot("Frozen Waste Plateau", 2954, 3894, 0));
		task(m, "ice-warriors", "Ice warriors",
			spot("Frozen Waste Plateau", 2952, 3874, 0));
		task(m, "jellies", "Jellies",
			spot("Wilderness Slayer Cave", 3430, 10104, 0));
		task(m, "lava-dragons", "Lava dragons",
			spot("Lava Dragon Isle", 3205, 3834, 0));
		task(m, "lesser-demons", "Lesser demons",
			spot("Wilderness Slayer Cave", 3337, 10134, 0),
			spot("South of the Demonic Ruins", 3311, 3845, 0),
			spot("KBD lair cage / Muddy chest", 3014, 3848, 0));
		task(m, "magic-axes", "Magic axes",
			spot("Magic Axe Hut", 3191, 3959, 0));
		task(m, "mammoths", "Mammoths",
			spot("West of the Chaos Temple", 3171, 3594, 0));
		task(m, "moss-giants", "Moss giants",
			spot("South-east of the Lava Maze", 3145, 3812, 0));
		task(m, "nechryael", "Nechryael",
			spot("Wilderness Slayer Cave", 3337, 10107, 0));
		task(m, "pirates", "Pirates",
			spot("Chaos Temple (Zombie pirates)", 3237, 3607, 0),
			spot("Pirates' Hideout", 3041, 3953, 0));
		task(m, "revenants", "Revenants",
			spot("Revenant Caves", 3216, 10128, 0));
		task(m, "rogues", "Rogues",
			spot("Rogues' Castle", 3285, 3933, 0),
			spot("East of the Mage Arena", 3076, 3916, 0));
		task(m, "scorpions", "Scorpions",
			spot("Scorpion Pit (Scorpia's cave)", 3233, 10341, 0),
			spot("West of the Air Obelisk", 3047, 3567, 0),
			spot("Lava Maze (King Scorpions)", 3070, 3836, 0));
		task(m, "skeletons", "Skeletons",
			spot("Wilderness Agility Course (south part)", 2997, 3939, 0),
			spot("Bone Yard", 3252, 3737, 0),
			spot("Edgeville Dungeon (Wilderness part)", 3108, 9954, 0),
			spot("Southern Wilderness mine", 3018, 3592, 0),
			spot("Calvar'ion / Vet'ion", 3179, 3684, 0));
		task(m, "spiders", "Spiders",
			spot("Edgeville Dungeon (Wilderness part)", 3122, 9955, 0),
			spot("Eastern Ruins (Abandoned Farm)", 3164, 3734, 0),
			spot("Lava Maze Dungeon (also by the KBD lever)", 3051, 10257, 0),
			spot("Spindel / Venenatis", 3184, 3745, 0));
		task(m, "spiritual-creatures", "Spiritual creatures",
			spot("Wilderness God Wars Dungeon", 3016, 3739, 0));
		task(m, "zombies", "Zombies",
			spot("Chaos Temple (Zombie pirates)", 3237, 3607, 0),
			spot("Graveyard of Shadows", 3165, 3672, 0),
			spot("Eastern Ruins", 3156, 3731, 0));
		task(m, "bosses", "Wilderness bosses",
			spot("Artio / Calvar'ion / Spindel (singles-plus lairs)", 3116, 3677, 0));
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
