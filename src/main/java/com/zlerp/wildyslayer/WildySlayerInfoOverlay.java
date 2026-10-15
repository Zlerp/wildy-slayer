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
import com.zlerp.wildyslayer.SyncModels.Selection;
import com.zlerp.wildyslayer.SyncModels.Task;
import java.awt.Color;
import java.awt.Dimension;
import java.awt.Graphics2D;
import javax.inject.Inject;
import javax.inject.Singleton;
import net.runelite.api.Client;
import net.runelite.api.GameState;
import net.runelite.client.ui.overlay.OverlayPanel;
import net.runelite.client.ui.overlay.OverlayPosition;
import net.runelite.client.ui.overlay.components.LineComponent;
import net.runelite.client.ui.overlay.components.TitleComponent;

/**
 * A small on-screen summary: the game's current task, and the spot and setup the app chose.
 * Gear, location and setup names only.
 */
@Singleton
class WildySlayerInfoOverlay extends OverlayPanel
{
	private final Client client;
	private final WildySlayerPlugin plugin;
	private final WildySlayerConfig config;

	@Inject
	WildySlayerInfoOverlay(Client client, WildySlayerPlugin plugin, WildySlayerConfig config)
	{
		super(plugin);
		this.client = client;
		this.plugin = plugin;
		this.config = config;
		setPosition(OverlayPosition.TOP_LEFT);
	}

	@Override
	public Dimension render(Graphics2D graphics)
	{
		if (!config.showInfoOverlay() || client.getGameState() != GameState.LOGGED_IN)
		{
			return null;
		}

		Player snapshot = plugin.getLastSnapshot();
		Task task = snapshot != null ? snapshot.task : null;
		Selection selection = plugin.getSelection();
		if (task == null && selection == null)
		{
			return null;
		}

		panelComponent.getChildren().add(TitleComponent.builder()
			.text("Wildy Slayer")
			.color(Color.ORANGE)
			.build());

		if (task != null)
		{
			panelComponent.getChildren().add(LineComponent.builder()
				.left("Task")
				.right(task.name + " x" + task.amount)
				.build());
		}

		if (selection != null)
		{
			if (selection.locationName != null)
			{
				panelComponent.getChildren().add(LineComponent.builder()
					.left("Spot")
					.right(selection.locationName)
					.build());
			}
			String setup = selection.setupName != null ? selection.setupName : selection.styleLabel;
			if (setup != null)
			{
				panelComponent.getChildren().add(LineComponent.builder()
					.left("Setup")
					.right(setup)
					.build());
			}
		}

		return super.render(graphics);
	}
}
