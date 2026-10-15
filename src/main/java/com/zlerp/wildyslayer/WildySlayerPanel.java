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
import com.zlerp.wildyslayer.SyncModels.Setup;
import com.zlerp.wildyslayer.SyncModels.SyncState;
import com.zlerp.wildyslayer.SyncModels.Task;
import com.zlerp.wildyslayer.WildySlayerPlugin.GearRow;
import java.awt.BorderLayout;
import java.awt.Color;
import java.awt.Dimension;
import java.awt.GridLayout;
import java.util.Collections;
import java.util.HashSet;
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
 * Task and location names come from the bundled {@link Spots} table and item names from the game;
 * the only server text shown is setup names (at most {@link #MAX_SETUPS}, each trimmed to
 * {@link #MAX_SETUP_NAME} characters) and a sync error message (trimmed to {@link #MAX_ERROR}).
 * Everything here runs on the Swing thread and never blocks.
 */
@Singleton
class WildySlayerPanel extends PluginPanel
{
	private static final int MAX_SETUP_NAME = 40;
	/** The server keeps at most 60 setups (PROTOCOL.md); the panel lists no more than that. */
	static final int MAX_SETUPS = 60;
	/** Sync error messages can carry server text, so they are cut to this many characters. */
	static final int MAX_ERROR = 60;
	private static final String CLEAR_PATH_TIP = "Asks Shortest Path to clear its route (enabled after Show path)";
	private static final String CLEAR_PATH_DISABLED_TIP = "Enabled after Show path, until the route is cleared or another plugin sets one";

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
	private final JButton showPathButton = new JButton("Show path");
	private final JButton clearPathButton = new JButton("Clear path");

	private final Timer statusTimer = new Timer(STATUS_TICK_MS, e -> updateStatus());

	// What the rows were last built from, by content: the server's write times of the selection
	// and setups parts, and the owned item ids. Every push returns fresh objects, so identity
	// would rebuild the rows (and reload the icons) every couple of seconds while banking.
	private static final long NOT_BUILT = -1;
	private long builtSelectionAt = NOT_BUILT;
	private boolean builtSelectionPresent;
	// the plugin builds a new list only when the selection changes, so identity is enough here
	private List<GearRow> builtGearRows = Collections.emptyList();
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
		styleButton(showPathButton);
		showPathButton.setToolTipText("Draws a route to the selected spot in Shortest Path; never moves you");
		showPathButton.addActionListener(e -> plugin.showPathToSelection());
		buttons.add(showPathButton);
		styleButton(clearPathButton);
		clearPathButton.addActionListener(e -> plugin.clearPath());
		clearPathButton.setEnabled(false);
		clearPathButton.setToolTipText(CLEAR_PATH_DISABLED_TIP);
		buttons.add(clearPathButton);
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
		taskLabel.setText(describeTask(null, false));
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

		// read by the plugin from the game itself, so it shows whether or not sync is on
		taskLabel.setText(describeTask(plugin.getCurrentTask(), plugin.isLoggedIn()));
		showPathButton.setEnabled(WildySlayerPlugin.targetOf(selection) != null);
		boolean ownPath = plugin.hasPostedPath();
		clearPathButton.setEnabled(ownPath);
		clearPathButton.setToolTipText(ownPath ? CLEAR_PATH_TIP : CLEAR_PATH_DISABLED_TIP);
		List<GearRow> gearRowList = plugin.getGearRows();

		Set<Integer> worn = idsOf(snapshot != null ? snapshot.equipment : null);
		Set<Integer> inventory = idsOf(snapshot != null ? snapshot.inventory : null);
		Set<Integer> bank = idsOf(snapshot != null ? snapshot.bank : null);

		boolean selectionChanged = selectionAt != builtSelectionAt || (selection != null) != builtSelectionPresent
			|| gearRowList != builtGearRows;
		boolean ownedChanged = !worn.equals(builtWorn) || !inventory.equals(builtInventory) || !bank.equals(builtBank);
		if (selectionChanged || ownedChanged)
		{
			builtSelectionAt = selectionAt;
			builtSelectionPresent = selection != null;
			builtGearRows = gearRowList;
			builtWorn = worn;
			builtInventory = inventory;
			builtBank = bank;
			rebuildSelection(selection, gearRowList, worn, inventory, bank);
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
			text = "Error: " + clip(plugin.getSyncError(), MAX_ERROR);
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

	private static String describeTask(@Nullable Task task, boolean loggedIn)
	{
		if (!loggedIn)
		{
			return wrap("Log in to read your task");
		}
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

	private void rebuildSelection(@Nullable Selection selection, List<GearRow> rows, Set<Integer> worn, Set<Integer> inventory, Set<Integer> bank)
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

		Spots.TaskSpots task = Spots.task(selection.task);
		Spots.Spot spot = WildySlayerPlugin.spotOf(selection);
		selectionTaskLabel.setText(wrap("Task: " + (task != null ? task.name : "-")));
		selectionLocationLabel.setText(wrap("Where: " + (spot != null ? spot.name : "-")));
		selectionStyleLabel.setText(wrap("Style: " + orDash(WildySlayerPlugin.styleName(selection.style))));
		selectionSetupLabel.setText(wrap("Setup: " + orDash(setupName(selection.setupName))));

		// already ordered by slot, checked and capped by the plugin
		for (GearRow row : rows)
		{
			gearRows.add(gearRow(row, worn, inventory, bank));
		}
	}

	private JPanel gearRow(GearRow gearRow, Set<Integer> worn, Set<Integer> inventory, Set<Integer> bank)
	{
		List<Integer> ids = gearRow.ids;

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

		int nameIndex = iconId != null ? ids.indexOf(iconId) : -1;
		JLabel name = new JLabel(wrap(orDash(nameIndex >= 0 ? gearRow.names.get(nameIndex) : null)));
		name.setFont(FontManager.getRunescapeSmallFont());
		name.setForeground(ColorScheme.TEXT_COLOR);
		name.setToolTipText(gearRow.slot);
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
		int shown = 0;
		for (Setup setup : setups)
		{
			if (setup == null)
			{
				continue;
			}
			if (shown++ >= MAX_SETUPS)
			{
				break;
			}
			JPanel row = new JPanel(new BorderLayout(4, 0));
			row.setBackground(ColorScheme.DARKER_GRAY_COLOR);
			row.setBorder(new EmptyBorder(2, 4, 2, 4));

			String detail = "";
			if (setup.selection != null)
			{
				Spots.TaskSpots task = Spots.task(setup.selection.task);
				detail = (task != null ? task.name : "-") + ", " + orDash(WildySlayerPlugin.styleName(setup.selection.style));
			}
			JLabel name = new JLabel("<html><body style='width:110px'><b>" + escape(orDash(setupName(setup.name))) + "</b><br>" + escape(detail) + "</body></html>");
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
	 * A setup name from the server as the panel shows it: trimmed, at most {@link #MAX_SETUP_NAME} characters.
	 */
	@Nullable
	static String setupName(@Nullable String name)
	{
		return clip(name, MAX_SETUP_NAME);
	}

	/**
	 * Server text as the panel shows it: trimmed and cut to at most {@code max} code points.
	 */
	@Nullable
	static String clip(@Nullable String text, int max)
	{
		if (text == null)
		{
			return null;
		}
		String trimmed = text.trim();
		if (trimmed.codePointCount(0, trimmed.length()) <= max)
		{
			return trimmed;
		}
		return trimmed.substring(0, trimmed.offsetByCodePoints(0, max));
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
