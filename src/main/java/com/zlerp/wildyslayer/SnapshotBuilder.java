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

import com.zlerp.wildyslayer.SyncModels.Player;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.TreeMap;
import javax.annotation.Nullable;
import javax.inject.Inject;
import net.runelite.api.Client;
import net.runelite.api.Item;
import net.runelite.api.ItemContainer;
import net.runelite.api.Skill;
import net.runelite.api.gameval.InventoryID;
import net.runelite.client.game.ItemManager;

/**
 * Builds the {@code player} payload from the local player's own state. Every method must run on
 * the client thread: item compositions and varps are only safe there.
 */
class SnapshotBuilder
{
	private final Client client;
	private final ItemManager itemManager;
	private final SlayerTaskReader taskReader;

	// The bank container only exists while the bank is open, so keep the last one we saw.
	private List<int[]> lastBank = Collections.emptyList();
	@Nullable
	private Long bankAt;

	@Inject
	SnapshotBuilder(Client client, ItemManager itemManager, SlayerTaskReader taskReader)
	{
		this.client = client;
		this.itemManager = itemManager;
		this.taskReader = taskReader;
	}

	/**
	 * Remember the bank contents; called from the ItemContainerChanged handler for the BANK container.
	 */
	void updateBank(ItemContainer bank)
	{
		lastBank = pairs(bank);
		bankAt = System.currentTimeMillis();
	}

	void clear()
	{
		lastBank = Collections.emptyList();
		bankAt = null;
	}

	Player build(boolean shareBank, boolean shareInventory, boolean shareEquipment)
	{
		Player player = new Player();
		player.pluginVersion = WildySlayerPlugin.PLUGIN_VERSION;
		player.at = System.currentTimeMillis();

		net.runelite.api.Player local = client.getLocalPlayer();
		player.rsn = local != null ? local.getName() : null;
		player.combat = local != null ? local.getCombatLevel() : 0;

		Map<String, Integer> levels = new LinkedHashMap<>();
		for (Skill skill : Skill.values())
		{
			levels.put(skill.getName().toLowerCase(Locale.ROOT), client.getRealSkillLevel(skill));
		}
		player.levels = levels;

		player.task = taskReader.read();

		if (shareBank)
		{
			ItemContainer bank = client.getItemContainer(InventoryID.BANK);
			if (bank != null)
			{
				updateBank(bank);
			}
			player.bank = lastBank;
			player.bankAt = bankAt;
		}
		else
		{
			player.bank = Collections.emptyList();
			player.bankAt = null;
		}
		player.inventory = shareInventory ? pairs(client.getItemContainer(InventoryID.INV)) : Collections.emptyList();
		player.equipment = shareEquipment ? pairs(client.getItemContainer(InventoryID.WORN)) : Collections.emptyList();

		Map<String, String> names = new TreeMap<>();
		addNames(names, player.bank);
		addNames(names, player.inventory);
		addNames(names, player.equipment);
		player.names = names;

		return player;
	}

	/**
	 * {@code [canonicalId, quantity]} pairs sorted by id; empty slots skipped, duplicates summed.
	 */
	List<int[]> pairs(@Nullable ItemContainer container)
	{
		if (container == null)
		{
			return Collections.emptyList();
		}
		Map<Integer, Long> byId = new TreeMap<>();
		for (Item item : container.getItems())
		{
			if (item == null)
			{
				continue;
			}
			int id = item.getId();
			int quantity = item.getQuantity();
			if (id <= 0 || quantity <= 0)
			{
				continue;
			}
			int canonical = itemManager.canonicalize(id);
			byId.merge(canonical, (long) quantity, Long::sum);
		}
		List<int[]> out = new ArrayList<>(byId.size());
		for (Map.Entry<Integer, Long> e : byId.entrySet())
		{
			out.add(new int[]{e.getKey(), (int) Math.min(Integer.MAX_VALUE, e.getValue())});
		}
		return Collections.unmodifiableList(out);
	}

	private void addNames(Map<String, String> names, List<int[]> pairs)
	{
		for (int[] pair : pairs)
		{
			String key = Integer.toString(pair[0]);
			if (!names.containsKey(key))
			{
				names.put(key, itemManager.getItemComposition(pair[0]).getName());
			}
		}
	}
}
