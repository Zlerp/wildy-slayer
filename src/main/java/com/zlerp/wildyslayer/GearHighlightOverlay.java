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
import java.awt.Graphics2D;
import java.awt.Rectangle;
import java.awt.image.BufferedImage;
import java.util.HashMap;
import java.util.Map;
import java.util.Set;
import javax.inject.Inject;
import javax.inject.Singleton;
import net.runelite.api.gameval.InterfaceID;
import net.runelite.api.widgets.WidgetItem;
import net.runelite.api.widgets.WidgetUtil;
import net.runelite.client.game.ItemManager;
import net.runelite.client.ui.overlay.WidgetItemOverlay;

/**
 * Outlines the items the app selected (gear, then alternatives, then supplies) in the bank,
 * inventory and equipment. Per frame it only does set lookups and draws cached outlines.
 */
@Singleton
class GearHighlightOverlay extends WidgetItemOverlay
{
	private final ItemManager itemManager;
	private final WildySlayerPlugin plugin;
	private final WildySlayerConfig config;

	// itemId -> canonical id; only touched on the client thread (render)
	private final Map<Integer, Integer> canonicalCache = new HashMap<>();

	@Inject
	GearHighlightOverlay(ItemManager itemManager, WildySlayerPlugin plugin, WildySlayerConfig config)
	{
		this.itemManager = itemManager;
		this.plugin = plugin;
		this.config = config;
		showOnBank();
		showOnInventory();
		showOnEquipment();
	}

	void reset()
	{
		canonicalCache.clear();
	}

	@Override
	public void renderItemOverlay(Graphics2D graphics, int itemId, WidgetItem widgetItem)
	{
		if (!plugin.hasHighlights() || widgetItem.getQuantity() <= 0)
		{
			// nothing selected, or a bank placeholder
			return;
		}

		int group = WidgetUtil.componentToInterface(widgetItem.getWidget().getId());
		if (group == InterfaceID.BANKMAIN || group == InterfaceID.SHARED_BANK)
		{
			if (!config.highlightBank())
			{
				return;
			}
		}
		else if (group == InterfaceID.WORNITEMS)
		{
			if (!config.highlightEquipment())
			{
				return;
			}
		}
		else if (!config.highlightInventory())
		{
			return;
		}

		Integer canonical = canonicalCache.get(itemId);
		if (canonical == null)
		{
			canonical = itemManager.canonicalize(itemId);
			canonicalCache.put(itemId, canonical);
		}

		Color color = colorFor(canonical);
		if (color == null)
		{
			return;
		}

		Rectangle bounds = widgetItem.getCanvasBounds();
		BufferedImage outline = itemManager.getItemOutline(itemId, widgetItem.getQuantity(), color);
		if (outline != null)
		{
			graphics.drawImage(outline, (int) bounds.getX(), (int) bounds.getY(), null);
		}
		graphics.setColor(color);
		graphics.drawRect(bounds.x, bounds.y, bounds.width - 1, bounds.height - 1);
	}

	private Color colorFor(int canonicalId)
	{
		Set<Integer> gear = plugin.getGearIds();
		if (gear.contains(canonicalId))
		{
			return config.gearColor();
		}
		if (config.showAlts() && plugin.getAltIds().contains(canonicalId))
		{
			return config.altColor();
		}
		if (config.showSupplies() && plugin.getSupplyIds().contains(canonicalId))
		{
			return config.supplyColor();
		}
		return null;
	}
}
