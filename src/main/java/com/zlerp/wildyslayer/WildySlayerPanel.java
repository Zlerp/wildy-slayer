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

import com.zlerp.wildyslayer.SyncModels.GearPick;
import com.zlerp.wildyslayer.SyncModels.Player;
import com.zlerp.wildyslayer.SyncModels.Selection;
import com.zlerp.wildyslayer.SyncModels.Setup;
import com.zlerp.wildyslayer.SyncModels.SyncState;
import com.zlerp.wildyslayer.SyncModels.Task;
import java.awt.BorderLayout;
import java.awt.Color;
import java.awt.Dimension;
import java.awt.GridLayout;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import javax.annotation.Nullable;
import javax.inject.Inject;
import javax.inject.Singleton;
import javax.swing.JButton;
import javax.swing.JLabel;
import javax.swing.JPanel;
import javax.swing.SwingConstants;
import javax.swing.Timer;
import javax.swing.border.EmptyBorder;
import net.runelite.client.game.ItemManager;
import net.runelite.client.ui.ColorScheme;
import net.runelite.client.ui.FontManager;
import net.runelite.client.ui.PluginPanel;
import net.runelite.client.util.AsyncBufferedImage;
import net.runelite.client.util.LinkBrowser;

/**
 * The sidebar panel: sync status, the game's current task, the app's selection with one row per
 * gear slot (icon, name, where you have it), and the saved setups with an Apply button each.
 * Everything here runs on the Swing thread and never blocks.
 */
@Singleton
class WildySlayerPanel extends PluginPanel
{
	private static final List<String> SLOT_ORDER = Arrays.asList(
		"head", "cape", "neck", "ammo", "weapon", "body", "shield", "legs", "hands", "feet", "ring");

	private static final Color WORN_COLOR = ColorScheme.PROGRESS_COMPLETE_COLOR;
	private static final Color INVENTORY_COLOR = ColorScheme.GRAND_EXCHANGE_LIMIT;
	private static final Color BANK_COLOR = ColorScheme.GRAND_EXCHANGE_ALCH;
	private static final Color MISSING_COLOR = ColorScheme.PROGRESS_ERROR_COLOR;

	private static final int ICON_WIDTH = 36;
	private static final int ICON_HEIGHT = 32;
	private static final int STATUS_TICK_MS = 1000;

	private final WildySlayerPlugin plugin;
	private final ItemManager itemManager;

	private final JLabel statusLabel = new JLabel();
	private final JLabel taskLabel = new JLabel();
	private final JLabel selectionTaskLabel = new JLabel();
	private final JLabel selectionLocationLabel = new JLabel();
	private final JLabel selectionStyleLabel = new JLabel();
	private final JLabel selectionSetupLabel = new JLabel();
	private final JPanel gearRows = new JPanel(new GridLayout(0, 1, 0, 2));
	private final JPanel setupRows = new JPanel(new GridLayout(0, 1, 0, 2));
	private final JButton walkButton = new JButton("Walk there");

	private final Timer statusTimer = new Timer(STATUS_TICK_MS, e -> updateStatus());

	// What the rows were last built from, by content: the server's write times of the selection
	// and setups parts, and the owned item ids. Every push returns fresh objects, so identity
	// would rebuild the rows (and reload the icons) every couple of seconds while banking.
	private static final long NOT_BUILT = -1;
	private long builtSelectionAt = NOT_BUILT;
	private boolean builtSelectionPresent;
	private long builtSetupsAt = NOT_BUILT;
	private int builtSetupCount;
	private Set<Integer> builtWorn = Collections.emptySet();
	private Set<Integer> builtInventory = Collections.emptySet();
	private Set<Integer> builtBank = Collections.emptySet();

	@Inject
	WildySlayerPanel(WildySlayerPlugin plugin, ItemManager itemManager)
	{
		super();
		this.plugin = plugin;
		this.itemManager = itemManager;

		setBackground(ColorScheme.DARK_GRAY_COLOR);

		JLabel title = new JLabel("Wildy Slayer");
		title.setFont(FontManager.getRunescapeBoldFont());
		title.setForeground(ColorScheme.BRAND_ORANGE);
		add(title);

		statusLabel.setFont(FontManager.getRunescapeSmallFont());
		statusLabel.setForeground(ColorScheme.LIGHT_GRAY_COLOR);
		add(statusLabel);

		JPanel buttons = new JPanel(new GridLayout(2, 2, 4, 4));
		buttons.setBackground(ColorScheme.DARK_GRAY_COLOR);
		buttons.setBorder(new EmptyBorder(4, 0, 4, 0));
		buttons.add(button("Open app", () -> LinkBrowser.browse(plugin.appUrl())));
		buttons.add(button("Push now", plugin::requestPush));
		styleButton(walkButton);
		walkButton.addActionListener(e -> plugin.walkToSelection());
		buttons.add(walkButton);
		buttons.add(button("Clear path", plugin::clearPath));
		add(buttons);

		add(header("Your task"));
		taskLabel.setFont(FontManager.getRunescapeSmallFont());
		taskLabel.setForeground(ColorScheme.TEXT_COLOR);
		add(taskLabel);

		add(header("Selection"));
		for (JLabel label : new JLabel[]{selectionTaskLabel, selectionLocationLabel, selectionStyleLabel, selectionSetupLabel})
		{
			label.setFont(FontManager.getRunescapeSmallFont());
			label.setForeground(ColorScheme.TEXT_COLOR);
			add(label);
		}
		gearRows.setBackground(ColorScheme.DARK_GRAY_COLOR);
		add(gearRows);

		add(header("Saved setups"));
		setupRows.setBackground(ColorScheme.DARK_GRAY_COLOR);
		add(setupRows);

		// the plugin fills this in from startUp(); its own fields may not be injected yet while we are being built
		statusLabel.setText(wrap("Starting..."));
		taskLabel.setText(describeTask(null));
		selectionTaskLabel.setText(wrap("Nothing selected in the app yet"));
	}

	@Override
	public void onActivate()
	{
		refresh();
		statusTimer.start();
	}

	@Override
	public void onDeactivate()
	{
		statusTimer.stop();
	}

	/**
	 * Re-read the plugin's state. Swing thread only.
	 */
	void refresh()
	{
		updateStatus();

		Player snapshot = plugin.getLastSnapshot();
		// one object, so the selection, the setups and their timestamps belong to the same response
		SyncState remote = plugin.getRemoteState();
		Selection selection = remote != null ? remote.selection : null;
		long selectionAt = remote != null ? WildySlayerPlugin.selectionAt(remote) : 0;
		List<Setup> setups = remote != null && remote.setups != null ? remote.setups : Collections.emptyList();
		long setupsAt = remote != null ? WildySlayerPlugin.setupsAt(remote) : 0;

		taskLabel.setText(describeTask(snapshot));
		walkButton.setEnabled(selection != null && selection.target != null);

		Set<Integer> worn = idsOf(snapshot != null ? snapshot.equipment : null);
		Set<Integer> inventory = idsOf(snapshot != null ? snapshot.inventory : null);
		Set<Integer> bank = idsOf(snapshot != null ? snapshot.bank : null);

		boolean selectionChanged = selectionAt != builtSelectionAt || (selection != null) != builtSelectionPresent;
		boolean ownedChanged = !worn.equals(builtWorn) || !inventory.equals(builtInventory) || !bank.equals(builtBank);
		if (selectionChanged || ownedChanged)
		{
			builtSelectionAt = selectionAt;
			builtSelectionPresent = selection != null;
			builtWorn = worn;
			builtInventory = inventory;
			builtBank = bank;
			rebuildSelection(selection, worn, inventory, bank);
		}
		if (setupsAt != builtSetupsAt || setups.size() != builtSetupCount)
		{
			builtSetupsAt = setupsAt;
			builtSetupCount = setups.size();
			rebuildSetups(setups);
		}
		revalidate();
		repaint();
	}

	private void updateStatus()
	{
		String text;
		Color color = ColorScheme.LIGHT_GRAY_COLOR;
		if (!plugin.syncConfigured())
		{
			text = plugin.code() == null ? "Not paired: enter the code from the app" : "Sync is off: enable it in the settings";
		}
		else if (plugin.getSyncError() != null)
		{
			text = "Error: " + plugin.getSyncError();
			color = MISSING_COLOR;
		}
		else if (!plugin.isLoggedIn())
		{
			text = "Paired, waiting for login";
		}
		else if (plugin.getLastSyncAt() == 0)
		{
			text = "Syncing...";
		}
		else
		{
			long ago = Math.max(0, (System.currentTimeMillis() - plugin.getLastSyncAt()) / 1000);
			text = "Synced " + ago + "s ago";
			color = WORN_COLOR;
		}
		statusLabel.setText(wrap(text));
		statusLabel.setForeground(color);
	}

	private static String describeTask(@Nullable Player snapshot)
	{
		if (snapshot == null)
		{
			return wrap("Log in to read your task");
		}
		Task task = snapshot.task;
		if (task == null)
		{
			return wrap("No Slayer task");
		}
		StringBuilder sb = new StringBuilder(task.name).append(": ").append(task.amount).append(" left");
		if (task.location != null)
		{
			sb.append(" at ").append(task.location);
		}
		if (task.master != null)
		{
			sb.append(" (").append(task.master).append(')');
		}
		return wrap(sb.toString());
	}

	private void rebuildSelection(@Nullable Selection selection, Set<Integer> worn, Set<Integer> inventory, Set<Integer> bank)
	{
		gearRows.removeAll();
		if (selection == null)
		{
			selectionTaskLabel.setText(wrap("Nothing selected in the app yet"));
			selectionLocationLabel.setText("");
			selectionStyleLabel.setText("");
			selectionSetupLabel.setText("");
			return;
		}

		selectionTaskLabel.setText(wrap("Task: " + orDash(selection.taskName)));
		selectionLocationLabel.setText(wrap("Where: " + orDash(selection.locationName)));
		selectionStyleLabel.setText(wrap("Style: " + orDash(selection.styleLabel != null ? selection.styleLabel : selection.style)));
		selectionSetupLabel.setText(wrap("Setup: " + orDash(selection.setupName)));

		if (selection.gear == null || selection.gear.isEmpty())
		{
			return;
		}

		Set<String> slots = new LinkedHashSet<>();
		for (String slot : SLOT_ORDER)
		{
			if (selection.gear.containsKey(slot))
			{
				slots.add(slot);
			}
		}
		slots.addAll(selection.gear.keySet());

		for (String slot : slots)
		{
			GearPick pick = selection.gear.get(slot);
			if (pick == null)
			{
				continue;
			}
			gearRows.add(gearRow(slot, pick, worn, inventory, bank));
		}
	}

	private JPanel gearRow(String slot, GearPick pick, Set<Integer> worn, Set<Integer> inventory, Set<Integer> bank)
	{
		List<Integer> ids = pick.ids != null ? pick.ids : new ArrayList<>();

		String status;
		Color color;
		Integer iconId = firstIn(ids, worn);
		if (iconId != null)
		{
			status = "Worn";
			color = WORN_COLOR;
		}
		else if ((iconId = firstIn(ids, inventory)) != null)
		{
			status = "Inventory";
			color = INVENTORY_COLOR;
		}
		else if ((iconId = firstIn(ids, bank)) != null)
		{
			status = "Bank";
			color = BANK_COLOR;
		}
		else
		{
			status = "Missing";
			color = MISSING_COLOR;
			iconId = ids.isEmpty() ? null : ids.get(0);
		}

		JPanel row = new JPanel(new BorderLayout(4, 0));
		row.setBackground(ColorScheme.DARKER_GRAY_COLOR);
		row.setBorder(new EmptyBorder(2, 4, 2, 4));

		JLabel icon = new JLabel();
		icon.setPreferredSize(new Dimension(ICON_WIDTH, ICON_HEIGHT));
		icon.setHorizontalAlignment(SwingConstants.CENTER);
		if (iconId != null)
		{
			AsyncBufferedImage image = itemManager.getImage(iconId);
			if (image != null)
			{
				image.addTo(icon);
			}
		}
		row.add(icon, BorderLayout.WEST);

		JLabel name = new JLabel(wrap(orDash(pick.name)));
		name.setFont(FontManager.getRunescapeSmallFont());
		name.setForeground(ColorScheme.TEXT_COLOR);
		name.setToolTipText(slot);
		row.add(name, BorderLayout.CENTER);

		JLabel where = new JLabel(status);
		where.setFont(FontManager.getRunescapeSmallFont());
		where.setForeground(color);
		row.add(where, BorderLayout.EAST);
		return row;
	}

	private void rebuildSetups(List<Setup> setups)
	{
		setupRows.removeAll();
		if (setups.isEmpty())
		{
			JLabel none = new JLabel(wrap("No saved setups. Save one in the app."));
			none.setFont(FontManager.getRunescapeSmallFont());
			none.setForeground(ColorScheme.LIGHT_GRAY_COLOR);
			setupRows.add(none);
			return;
		}
		for (Setup setup : setups)
		{
			if (setup == null)
			{
				continue;
			}
			JPanel row = new JPanel(new BorderLayout(4, 0));
			row.setBackground(ColorScheme.DARKER_GRAY_COLOR);
			row.setBorder(new EmptyBorder(2, 4, 2, 4));

			String detail = setup.selection != null
				? orDash(setup.selection.taskName) + ", " + orDash(setup.selection.styleLabel != null ? setup.selection.styleLabel : setup.selection.style)
				: "";
			JLabel name = new JLabel("<html><body style='width:110px'><b>" + escape(orDash(setup.name)) + "</b><br>" + escape(detail) + "</body></html>");
			name.setFont(FontManager.getRunescapeSmallFont());
			name.setForeground(ColorScheme.TEXT_COLOR);
			row.add(name, BorderLayout.CENTER);

			JButton apply = button("Apply", () -> plugin.applySetup(setup));
			row.add(apply, BorderLayout.EAST);
			setupRows.add(row);
		}
	}

	// ---- helpers ----

	private static JLabel header(String text)
	{
		JLabel label = new JLabel(text);
		label.setFont(FontManager.getRunescapeBoldFont());
		label.setForeground(ColorScheme.TEXT_COLOR);
		label.setBorder(new EmptyBorder(8, 0, 2, 0));
		return label;
	}

	private static JButton button(String text, Runnable action)
	{
		JButton button = new JButton(text);
		styleButton(button);
		button.addActionListener(e -> action.run());
		return button;
	}

	private static void styleButton(JButton button)
	{
		button.setFont(FontManager.getRunescapeSmallFont());
		button.setFocusPainted(false);
	}

	private static Set<Integer> idsOf(@Nullable List<int[]> pairs)
	{
		Set<Integer> ids = new HashSet<>();
		if (pairs != null)
		{
			for (int[] pair : pairs)
			{
				if (pair != null && pair.length > 0)
				{
					ids.add(pair[0]);
				}
			}
		}
		return ids;
	}

	@Nullable
	private static Integer firstIn(List<Integer> ids, Set<Integer> owned)
	{
		for (Integer id : ids)
		{
			if (id != null && owned.contains(id))
			{
				return id;
			}
		}
		return null;
	}

	private static String orDash(@Nullable String s)
	{
		return s == null || s.isEmpty() ? "-" : s;
	}

	/**
	 * Wrap text in HTML so a JLabel line-breaks inside the 225 px panel.
	 */
	private static String wrap(String text)
	{
		return "<html><body style='width:190px'>" + escape(text) + "</body></html>";
	}

	private static String escape(String text)
	{
		return text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;");
	}
}
