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

import com.google.gson.JsonElement;
import java.util.List;
import java.util.Map;

/**
 * Gson models for the Wildy Slayer sync protocol (see PROTOCOL.md). Field names are the JSON keys.
 */
final class SyncModels
{
	private SyncModels()
	{
	}

	/** The {@code player} part: own-account data only, written by the plugin. */
	static final class Player
	{
		String rsn;
		int combat;
		String pluginVersion;
		long at;
		Map<String, Integer> levels;
		Task task;
		List<int[]> bank;
		Long bankAt;
		List<int[]> inventory;
		List<int[]> equipment;
		Map<String, String> names;
	}

	/** The current Slayer task, read from the same varps the core Slayer plugin uses. */
	static final class Task
	{
		String name;
		int amount;
		Integer initial;
		String location;
		String master;
	}

	/** A walk target for the Shortest Path plugin. */
	static final class Target
	{
		int x;
		int y;
		int plane;
	}

	/** One gear pick (or alternative): the app's item name plus every owned id that matches it. */
	static final class GearPick
	{
		String name;
		List<Integer> ids;
	}

	/** One "what to bring" row. */
	static final class Supply
	{
		String name;
		List<Integer> ids;
		Integer qty;
	}

	/** The {@code selection} part: written by the app, or by the plugin when it applies a saved setup. */
	static final class Selection
	{
		String source;
		long at;
		String task;
		String taskName;
		Integer loc;
		String locationName;
		Target target;
		String style;
		String styleLabel;
		String setupId;
		String setupName;
		Map<String, GearPick> gear;
		Map<String, List<GearPick>> alts;
		List<Supply> supplies;
	}

	/** One saved setup; {@code preset} is the app's own data and is passed through untouched. */
	static final class Setup
	{
		String id;
		String name;
		long at;
		JsonElement preset;
		Selection selection;
	}

	/** A GET response, or a POST response with {@code ?full=1}. */
	static final class SyncState
	{
		boolean ok;
		String error;
		String code;
		long version;
		Boolean unchanged;
		Player player;
		Long playerAt;
		Selection selection;
		Long selectionAt;
		List<Setup> setups;
		Long setupsAt;
		long now;
	}
}
