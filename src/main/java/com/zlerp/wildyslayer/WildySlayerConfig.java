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

import java.awt.Color;
import net.runelite.client.config.Config;
import net.runelite.client.config.ConfigGroup;
import net.runelite.client.config.ConfigItem;
import net.runelite.client.config.ConfigSection;
import net.runelite.client.config.Range;
import net.runelite.client.config.Units;

@ConfigGroup(WildySlayerConfig.GROUP)
public interface WildySlayerConfig extends Config
{
	String GROUP = "wildy-slayer";

	String KEY_SYNC_ENABLED = "syncEnabled";
	String KEY_SYNC_CODE = "syncCode";
	String KEY_SERVER_URL = "serverUrl";
	String KEY_POLL_SECONDS = "pollSeconds";
	String KEY_SHOW_INFO_OVERLAY = "showInfoOverlay";
	String KEY_SHARE_BANK = "shareBank";
	String KEY_SHARE_INVENTORY = "shareInventory";
	String KEY_SHARE_EQUIPMENT = "shareEquipment";

	String DEFAULT_SERVER_URL = "https://wildy-slayer.vercel.app";

	// bounds of the poll interval; the plugin clamps a stored value to them, since @Range is only a UI hint
	int MIN_POLL_SECONDS = 3;
	int MAX_POLL_SECONDS = 60;

	@ConfigSection(
		name = "Sync",
		description = "Pairing with the Wildy Slayer web app. Off by default; nothing leaves the client until you enable it.",
		position = 0
	)
	String syncSection = "sync";

	@ConfigSection(
		name = "Highlights",
		description = "Outline the gear the app picked in your bank, inventory and equipment.",
		position = 1
	)
	String highlightSection = "highlights";

	@ConfigSection(
		name = "Shortest Path",
		description = "Hand the chosen spot to the Shortest Path plugin.",
		position = 2
	)
	String pathSection = "shortestPath";

	@ConfigSection(
		name = "Display",
		description = "On-screen summary of the task and selection.",
		position = 3
	)
	String displaySection = "display";

	// ---- Sync ----

	@ConfigItem(
		keyName = KEY_SYNC_ENABLED,
		name = "Enable sync",
		description = "Send your RSN, levels, Slayer task, bank, inventory and equipment to the Wildy Slayer server, and fetch the gear it picks.",
		warning = "This feature submits your IP address to a 3rd-party server not controlled or verified by RuneLite developers",
		position = 0,
		section = syncSection
	)
	default boolean syncEnabled()
	{
		return false;
	}

	@ConfigItem(
		keyName = KEY_SYNC_CODE,
		name = "Pairing code",
		description = "The 8-character code shown in the Wildy Slayer web app (with or without the dash). Anyone holding it can read and write that pairing.",
		secret = true,
		position = 1,
		section = syncSection
	)
	default String syncCode()
	{
		return "";
	}

	@ConfigItem(
		keyName = KEY_SERVER_URL,
		name = "Server URL",
		description = "Base URL of the Wildy Slayer web app.",
		position = 2,
		section = syncSection
	)
	default String serverUrl()
	{
		return DEFAULT_SERVER_URL;
	}

	@Range(min = MIN_POLL_SECONDS, max = MAX_POLL_SECONDS)
	@Units(Units.SECONDS)
	@ConfigItem(
		keyName = KEY_POLL_SECONDS,
		name = "Poll interval",
		description = "How often to ask the server for a new selection while logged in.",
		position = 3,
		section = syncSection
	)
	default int pollSeconds()
	{
		return 5;
	}

	@ConfigItem(
		keyName = KEY_SHARE_BANK,
		name = "Share bank",
		description = "Include your bank (as last seen) in the sync, so the app can pick gear you own.",
		position = 4,
		section = syncSection
	)
	default boolean shareBank()
	{
		return true;
	}

	@ConfigItem(
		keyName = KEY_SHARE_INVENTORY,
		name = "Share inventory",
		description = "Include your inventory in the sync. In the Wilderness, PvP areas and PvP worlds it is not re-read; the last one seen outside is sent.",
		position = 5,
		section = syncSection
	)
	default boolean shareInventory()
	{
		return true;
	}

	@ConfigItem(
		keyName = KEY_SHARE_EQUIPMENT,
		name = "Share equipment",
		description = "Include your worn equipment in the sync. In the Wilderness, PvP areas and PvP worlds it is not re-read; the last one seen outside is sent.",
		position = 6,
		section = syncSection
	)
	default boolean shareEquipment()
	{
		return true;
	}

	// ---- Highlights ----

	@ConfigItem(
		keyName = "highlightBank",
		name = "Highlight in bank",
		description = "Outline the selected gear, alternatives and supplies in the bank.",
		position = 0,
		section = highlightSection
	)
	default boolean highlightBank()
	{
		return true;
	}

	@ConfigItem(
		keyName = "highlightInventory",
		name = "Highlight in inventory",
		description = "Outline the selected gear, alternatives and supplies in the inventory.",
		position = 1,
		section = highlightSection
	)
	default boolean highlightInventory()
	{
		return true;
	}

	@ConfigItem(
		keyName = "highlightEquipment",
		name = "Highlight on equipment",
		description = "Outline the selected gear on the worn equipment tab.",
		position = 2,
		section = highlightSection
	)
	default boolean highlightEquipment()
	{
		return true;
	}

	@ConfigItem(
		keyName = "gearColor",
		name = "Gear colour",
		description = "Outline colour for the gear the app selected.",
		position = 3,
		section = highlightSection
	)
	default Color gearColor()
	{
		return Color.GREEN;
	}

	@ConfigItem(
		keyName = "altColor",
		name = "Alternative colour",
		description = "Outline colour for the next-best alternatives per slot.",
		position = 4,
		section = highlightSection
	)
	default Color altColor()
	{
		return Color.YELLOW;
	}

	@ConfigItem(
		keyName = "supplyColor",
		name = "Supply colour",
		description = "Outline colour for the supplies on the app's \"what to bring\" list.",
		position = 5,
		section = highlightSection
	)
	default Color supplyColor()
	{
		return Color.CYAN;
	}

	@ConfigItem(
		keyName = "showAlts",
		name = "Show alternatives",
		description = "Also outline the alternative picks.",
		position = 6,
		section = highlightSection
	)
	default boolean showAlts()
	{
		return true;
	}

	@ConfigItem(
		keyName = "showSupplies",
		name = "Show supplies",
		description = "Also outline the supplies.",
		position = 7,
		section = highlightSection
	)
	default boolean showSupplies()
	{
		return true;
	}

	// ---- Shortest Path ----

	@ConfigItem(
		keyName = "autoPath",
		name = "Auto path on new selection",
		description = "When a new selection with a location arrives from the app, ask the Shortest Path plugin to draw the route there. Never in the Wilderness, a PvP area, on a PvP world or in an instance. Only draws a path; never moves you.",
		position = 0,
		section = pathSection
	)
	default boolean autoPath()
	{
		return false;
	}

	// ---- Display ----

	@ConfigItem(
		keyName = KEY_SHOW_INFO_OVERLAY,
		name = "Show info overlay",
		description = "Show a small overlay with your current task and the task, spot and combat style picked in the app.",
		position = 0,
		section = displaySection
	)
	default boolean showInfoOverlay()
	{
		return true;
	}
}
