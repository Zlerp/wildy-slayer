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

import com.google.inject.Provides;
import com.zlerp.wildyslayer.SyncModels.GearPick;
import com.zlerp.wildyslayer.SyncModels.Player;
import com.zlerp.wildyslayer.SyncModels.Selection;
import com.zlerp.wildyslayer.SyncModels.Setup;
import com.zlerp.wildyslayer.SyncModels.Supply;
import com.zlerp.wildyslayer.SyncModels.SyncState;
import com.zlerp.wildyslayer.SyncModels.Target;
import java.awt.image.BufferedImage;
import java.util.Collections;
import java.util.EnumMap;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;
import javax.annotation.Nullable;
import javax.inject.Inject;
import javax.swing.SwingUtilities;
import lombok.Getter;
import lombok.extern.slf4j.Slf4j;
import net.runelite.api.Client;
import net.runelite.api.GameState;
import net.runelite.api.Skill;
import net.runelite.api.coords.WorldPoint;
import net.runelite.api.events.GameStateChanged;
import net.runelite.api.events.ItemContainerChanged;
import net.runelite.api.events.StatChanged;
import net.runelite.api.events.VarbitChanged;
import net.runelite.api.gameval.InventoryID;
import net.runelite.api.gameval.VarPlayerID;
import net.runelite.api.gameval.VarbitID;
import net.runelite.client.callback.ClientThread;
import net.runelite.client.config.ConfigManager;
import net.runelite.client.eventbus.EventBus;
import net.runelite.client.eventbus.Subscribe;
import net.runelite.client.events.ConfigChanged;
import net.runelite.client.events.PluginMessage;
import net.runelite.client.plugins.Plugin;
import net.runelite.client.plugins.PluginDescriptor;
import net.runelite.client.ui.ClientToolbar;
import net.runelite.client.ui.NavigationButton;
import net.runelite.client.ui.overlay.OverlayManager;
import net.runelite.client.util.ImageUtil;

@Slf4j
@PluginDescriptor(
	name = "Wildy Slayer",
	description = "Syncs your own levels, bank and Slayer task to the Wildy Slayer web app, highlights the gear it picks in your bank, lists saved setups, and hands the chosen spot to Shortest Path",
	tags = {"slayer", "wilderness", "krystilia", "bank", "gear"}
)
public class WildySlayerPlugin extends Plugin
{
	static final String PLUGIN_VERSION = "1.0.0";
	static final String APP_PATH = "/";
	static final String SELECTION_SOURCE_PLUGIN = "plugin";

	private static final long PUSH_DEBOUNCE_MS = 2000;
	private static final long POLL_INITIAL_DELAY_MS = 1000;
	private static final int CODE_LENGTH = 8;
	private static final int NAV_PRIORITY = 7;

	// Shortest Path plugin message contract (see PROTOCOL.md)
	private static final String SHORTEST_PATH_NAMESPACE = "shortestpath";
	private static final String SHORTEST_PATH_PATH = "path";
	private static final String SHORTEST_PATH_CLEAR = "clear";
	private static final String SHORTEST_PATH_TARGET = "target";

	@Inject
	private Client client;

	@Inject
	private ClientThread clientThread;

	@Inject
	private OverlayManager overlayManager;

	@Inject
	private ClientToolbar clientToolbar;

	@Inject
	private EventBus eventBus;

	@Inject
	private ScheduledExecutorService executor;

	@Inject
	private WildySlayerConfig config;

	@Inject
	private SyncClient syncClient;

	@Inject
	private SnapshotBuilder snapshotBuilder;

	@Inject
	private GearHighlightOverlay gearOverlay;

	@Inject
	private WildySlayerInfoOverlay infoOverlay;

	@Inject
	private WildySlayerPanel panel;

	private NavigationButton navButton;

	// client thread only
	private final Map<Skill, Integer> realLevels = new EnumMap<>(Skill.class);

	// guarded by lock
	private final Object lock = new Object();
	private ScheduledFuture<?> pollFuture;
	private ScheduledFuture<?> pushFuture;
	private long lastPushAt;

	private volatile boolean loggedIn;
	private volatile long version;

	// Auto-path baseline, taken from the server clock: the selectionAt of the first full response
	// after startUp or a re-pairing. Only selections newer than it are pathed automatically.
	private volatile boolean selectionBaselineSet;
	private volatile long lastHandledSelectionAt;

	@Getter
	@Nullable
	private volatile Player lastSnapshot;

	@Getter
	@Nullable
	private volatile Selection selection;

	/** The last full response applied, so the panel reads selection, setups and their server timestamps together. */
	@Getter
	@Nullable
	private volatile SyncState remoteState;

	@Getter
	private volatile Set<Integer> gearIds = Collections.emptySet();

	@Getter
	private volatile Set<Integer> altIds = Collections.emptySet();

	@Getter
	private volatile Set<Integer> supplyIds = Collections.emptySet();

	@Getter
	@Nullable
	private volatile String syncError;

	@Getter
	private volatile long lastSyncAt;

	private final SyncClient.Handler stateHandler = new SyncClient.Handler()
	{
		@Override
		public void onResult(SyncState state)
		{
			applyState(state);
		}

		@Override
		public void onError(String message)
		{
			log.debug("Sync error: {}", message);
			syncError = message;
			refreshPanel();
		}
	};

	@Provides
	WildySlayerConfig provideConfig(ConfigManager configManager)
	{
		return configManager.getConfig(WildySlayerConfig.class);
	}

	@Override
	protected void startUp()
	{
		overlayManager.add(gearOverlay);
		if (config.showInfoOverlay())
		{
			overlayManager.add(infoOverlay);
		}

		final BufferedImage icon = ImageUtil.loadImageResource(getClass(), "icon.png");
		navButton = NavigationButton.builder()
			.tooltip("Wildy Slayer")
			.icon(icon)
			.priority(NAV_PRIORITY)
			.panel(panel)
			.build();
		clientToolbar.addNavigation(navButton);

		// selections already on the server when we start are not auto-pathed; "Walk there" covers them
		resetSelectionBaseline();
		loggedIn = client.getGameState() == GameState.LOGGED_IN;

		startPolling();
		if (loggedIn)
		{
			requestPush();
		}
		refreshPanel();
		log.info("Wildy Slayer started");
	}

	@Override
	protected void shutDown()
	{
		overlayManager.remove(gearOverlay);
		overlayManager.remove(infoOverlay);
		if (navButton != null)
		{
			clientToolbar.removeNavigation(navButton);
			navButton = null;
		}

		stopPolling();
		cancelPush();

		snapshotBuilder.clear();
		realLevels.clear();
		gearOverlay.reset();
		clearRemoteState();
		resetSelectionBaseline();
		lastSnapshot = null;
		version = 0;
		loggedIn = false;
		refreshPanel();
		log.info("Wildy Slayer stopped");
	}

	// ---- game events (client thread) ----

	@Subscribe
	public void onGameStateChanged(GameStateChanged event)
	{
		GameState state = event.getGameState();
		if (state == GameState.LOGGED_IN)
		{
			loggedIn = true;
			requestPush();
		}
		else if (state == GameState.LOGIN_SCREEN)
		{
			// a different account may log in next: forget this one's bank and task
			loggedIn = false;
			realLevels.clear();
			snapshotBuilder.clear();
			lastSnapshot = null;
		}
		else if (state == GameState.HOPPING || state == GameState.CONNECTION_LOST)
		{
			loggedIn = false;
			realLevels.clear();
		}
		refreshPanel();
	}

	@Subscribe
	public void onItemContainerChanged(ItemContainerChanged event)
	{
		int id = event.getContainerId();
		if (id == InventoryID.BANK)
		{
			snapshotBuilder.updateBank(event.getItemContainer());
			if (config.shareBank())
			{
				requestPush();
			}
		}
		else if (id == InventoryID.INV)
		{
			if (config.shareInventory())
			{
				requestPush();
			}
		}
		else if (id == InventoryID.WORN)
		{
			if (config.shareEquipment())
			{
				requestPush();
			}
		}
	}

	@Subscribe
	public void onStatChanged(StatChanged event)
	{
		// only real (unboosted) level changes matter to the app
		Integer previous = realLevels.put(event.getSkill(), event.getLevel());
		if (previous == null || previous != event.getLevel())
		{
			requestPush();
		}
	}

	@Subscribe
	public void onVarbitChanged(VarbitChanged event)
	{
		int varp = event.getVarpId();
		int varbit = event.getVarbitId();
		if (varp == VarPlayerID.SLAYER_COUNT || varp == VarPlayerID.SLAYER_TARGET || varp == VarPlayerID.SLAYER_AREA
			|| varp == VarPlayerID.SLAYER_COUNT_ORIGINAL
			|| varbit == VarbitID.SLAYER_MASTER || varbit == VarbitID.SLAYER_TARGET_BOSSID
			|| varbit == VarbitID.SLAYER_MODIFIER_ID || varbit == VarbitID.SLAYER_MODIFIER_VALUE
			|| varbit == VarbitID.SLAYER_MODIFIER_NEGATIVE)
		{
			requestPush();
		}
	}

	@Subscribe
	public void onConfigChanged(ConfigChanged event)
	{
		if (!WildySlayerConfig.GROUP.equals(event.getGroup()))
		{
			return;
		}

		switch (event.getKey())
		{
			case WildySlayerConfig.KEY_SYNC_ENABLED:
				if (config.syncEnabled())
				{
					// fetch the row in full again, and do not path what was selected while sync was off
					version = 0;
					resetSelectionBaseline();
					startPolling();
					requestPush();
				}
				else
				{
					stopPolling();
					cancelPush();
					clearRemoteState();
				}
				break;
			case WildySlayerConfig.KEY_SYNC_CODE:
			case WildySlayerConfig.KEY_SERVER_URL:
				// a different pairing: forget what the old one said and fetch fresh
				version = 0;
				clearRemoteState();
				resetSelectionBaseline();
				stopPolling();
				startPolling();
				requestPush();
				break;
			case WildySlayerConfig.KEY_POLL_SECONDS:
				stopPolling();
				startPolling();
				break;
			case WildySlayerConfig.KEY_SHARE_BANK:
			case WildySlayerConfig.KEY_SHARE_INVENTORY:
			case WildySlayerConfig.KEY_SHARE_EQUIPMENT:
				// the next push sends [] for a list that was just turned off, so it leaves the server
				requestPush();
				break;
			case WildySlayerConfig.KEY_SHOW_INFO_OVERLAY:
				overlayManager.remove(infoOverlay);
				if (config.showInfoOverlay())
				{
					overlayManager.add(infoOverlay);
				}
				break;
			default:
				break;
		}
		refreshPanel();
	}

	// ---- pairing ----

	/**
	 * The pairing code as the server wants it: upper-case, letters and digits only, 8 long.
	 * Null when the configured value is not a usable code.
	 */
	@Nullable
	static String normalizeCode(@Nullable String raw)
	{
		if (raw == null)
		{
			return null;
		}
		StringBuilder sb = new StringBuilder(CODE_LENGTH);
		for (char ch : raw.toUpperCase(Locale.ROOT).toCharArray())
		{
			if ((ch >= 'A' && ch <= 'Z') || (ch >= '0' && ch <= '9'))
			{
				sb.append(ch);
			}
		}
		return sb.length() == CODE_LENGTH ? sb.toString() : null;
	}

	@Nullable
	String code()
	{
		return normalizeCode(config.syncCode());
	}

	boolean syncConfigured()
	{
		return config.syncEnabled() && code() != null;
	}

	boolean isLoggedIn()
	{
		return loggedIn;
	}

	String appUrl()
	{
		String base = config.serverUrl().trim();
		while (base.endsWith("/"))
		{
			base = base.substring(0, base.length() - 1);
		}
		String code = code();
		return base + APP_PATH + (code != null ? "?code=" + code : "");
	}

	// ---- push (debounced, snapshot on the client thread, network on OkHttp's pool) ----

	/**
	 * Ask for the player payload to be pushed. Calls within the debounce window coalesce into one.
	 */
	void requestPush()
	{
		if (!syncConfigured())
		{
			return;
		}
		synchronized (lock)
		{
			if (pushFuture != null && !pushFuture.isDone())
			{
				return;
			}
			long delay = Math.max(0, lastPushAt + PUSH_DEBOUNCE_MS - System.currentTimeMillis());
			pushFuture = executor.schedule(this::pushNow, delay, TimeUnit.MILLISECONDS);
		}
	}

	private void cancelPush()
	{
		synchronized (lock)
		{
			if (pushFuture != null)
			{
				pushFuture.cancel(false);
				pushFuture = null;
			}
		}
	}

	private void pushNow()
	{
		synchronized (lock)
		{
			lastPushAt = System.currentTimeMillis();
			// changes arriving from here on schedule a fresh push instead of being coalesced into this one
			pushFuture = null;
		}
		clientThread.invoke(() ->
		{
			if (client.getGameState() != GameState.LOGGED_IN || !syncConfigured())
			{
				return true;
			}
			net.runelite.api.Player local = client.getLocalPlayer();
			if (local == null || local.getName() == null)
			{
				// right after login the player is not populated yet; try again next tick
				return false;
			}
			Player player = snapshotBuilder.build(config.shareBank(), config.shareInventory(), config.shareEquipment());
			lastSnapshot = player;
			log.debug("Pushing snapshot: {} bank, {} inventory, {} equipment, task {}",
				player.bank.size(), player.inventory.size(), player.equipment.size(), player.task != null ? player.task.name : null);
			syncClient.push(config.serverUrl(), code(), player, null, stateHandler);
			return true;
		});
	}

	// ---- poll ----

	private void startPolling()
	{
		if (!syncConfigured())
		{
			return;
		}
		synchronized (lock)
		{
			if (pollFuture != null)
			{
				return;
			}
			// @Range is only a UI hint; a hand-edited profile could hold 0, which scheduleWithFixedDelay rejects
			int seconds = Math.min(WildySlayerConfig.MAX_POLL_SECONDS, Math.max(WildySlayerConfig.MIN_POLL_SECONDS, config.pollSeconds()));
			long period = TimeUnit.SECONDS.toMillis(seconds);
			pollFuture = executor.scheduleWithFixedDelay(this::poll, POLL_INITIAL_DELAY_MS, period, TimeUnit.MILLISECONDS);
		}
	}

	private void stopPolling()
	{
		synchronized (lock)
		{
			if (pollFuture != null)
			{
				pollFuture.cancel(false);
				pollFuture = null;
			}
		}
	}

	private void poll()
	{
		if (!loggedIn || !syncConfigured())
		{
			return;
		}
		syncClient.fetch(config.serverUrl(), code(), version, stateHandler);
	}

	// ---- state from the server (OkHttp thread) ----

	/**
	 * Synchronized so a poll response and a push response in flight at the same time are applied
	 * one after the other, each as a whole.
	 */
	private synchronized void applyState(SyncState state)
	{
		lastSyncAt = System.currentTimeMillis();
		syncError = null;

		if (Boolean.TRUE.equals(state.unchanged))
		{
			refreshPanel();
			return;
		}

		version = state.version;
		Selection newSelection = state.selection;
		selection = newSelection;
		remoteState = state;
		rebuildHighlights(newSelection);

		long selectionAt = selectionAt(state);
		if (!selectionBaselineSet)
		{
			// first full response since startUp or re-pairing: whatever is selected now predates us
			selectionBaselineSet = true;
			lastHandledSelectionAt = selectionAt;
		}
		else if (newSelection != null && selectionAt > lastHandledSelectionAt)
		{
			lastHandledSelectionAt = selectionAt;
			log.debug("New selection {} at {} ({})", newSelection.taskName, newSelection.locationName, newSelection.source);
			if (config.autoPath() && newSelection.target != null && loggedIn)
			{
				postPath(newSelection.target);
			}
		}

		refreshPanel();
	}

	/**
	 * When the server last wrote the selection part (server clock), falling back to the selection's
	 * own timestamp; 0 when there is no selection.
	 */
	static long selectionAt(SyncState state)
	{
		if (state.selectionAt != null)
		{
			return state.selectionAt;
		}
		return state.selection != null ? state.selection.at : 0;
	}

	/**
	 * When the server last wrote the setups part (server clock); 0 when unknown.
	 */
	static long setupsAt(SyncState state)
	{
		return state.setupsAt != null ? state.setupsAt : 0;
	}

	private void resetSelectionBaseline()
	{
		selectionBaselineSet = false;
		lastHandledSelectionAt = 0;
	}

	private void rebuildHighlights(@Nullable Selection sel)
	{
		Set<Integer> gear = new HashSet<>();
		Set<Integer> alts = new HashSet<>();
		Set<Integer> supplies = new HashSet<>();
		if (sel != null)
		{
			if (sel.gear != null)
			{
				for (GearPick pick : sel.gear.values())
				{
					addIds(gear, pick != null ? pick.ids : null);
				}
			}
			if (sel.alts != null)
			{
				for (List<GearPick> picks : sel.alts.values())
				{
					if (picks == null)
					{
						continue;
					}
					for (GearPick pick : picks)
					{
						addIds(alts, pick != null ? pick.ids : null);
					}
				}
			}
			if (sel.supplies != null)
			{
				for (Supply supply : sel.supplies)
				{
					addIds(supplies, supply != null ? supply.ids : null);
				}
			}
		}
		gearIds = Collections.unmodifiableSet(gear);
		altIds = Collections.unmodifiableSet(alts);
		supplyIds = Collections.unmodifiableSet(supplies);
	}

	private static void addIds(Set<Integer> into, @Nullable List<Integer> ids)
	{
		if (ids == null)
		{
			return;
		}
		for (Integer id : ids)
		{
			if (id != null)
			{
				into.add(id);
			}
		}
	}

	boolean hasHighlights()
	{
		return !gearIds.isEmpty() || !altIds.isEmpty() || !supplyIds.isEmpty();
	}

	private void clearRemoteState()
	{
		selection = null;
		remoteState = null;
		gearIds = Collections.emptySet();
		altIds = Collections.emptySet();
		supplyIds = Collections.emptySet();
		syncError = null;
		lastSyncAt = 0;
	}

	// ---- panel actions (Swing thread) ----

	/**
	 * Post the saved setup's selection back as the current selection, with this plugin as the source.
	 * The full response then refreshes highlights and the panel.
	 */
	void applySetup(Setup setup)
	{
		if (!syncConfigured())
		{
			syncError = "Not paired";
			refreshPanel();
			return;
		}
		if (setup.selection == null)
		{
			syncError = "Setup has no selection";
			refreshPanel();
			return;
		}
		Selection src = setup.selection;
		Selection sel = new Selection();
		sel.source = SELECTION_SOURCE_PLUGIN;
		sel.at = System.currentTimeMillis();
		sel.task = src.task;
		sel.taskName = src.taskName;
		sel.loc = src.loc;
		sel.locationName = src.locationName;
		sel.target = src.target;
		sel.style = src.style;
		sel.styleLabel = src.styleLabel;
		sel.setupId = setup.id;
		sel.setupName = setup.name;
		sel.gear = src.gear;
		sel.alts = src.alts;
		sel.supplies = src.supplies;
		log.debug("Applying setup {} ({})", setup.name, setup.id);
		syncClient.push(config.serverUrl(), code(), null, sel, stateHandler);
	}

	/**
	 * "Walk there": draw a Shortest Path route to the current selection's target.
	 */
	void walkToSelection()
	{
		Selection sel = selection;
		if (sel != null && sel.target != null)
		{
			postPath(sel.target);
		}
	}

	void clearPath()
	{
		clientThread.invokeLater(() -> eventBus.post(new PluginMessage(SHORTEST_PATH_NAMESPACE, SHORTEST_PATH_CLEAR)));
	}

	// ---- Shortest Path ----

	/**
	 * Hands a target to the Shortest Path plugin, which only draws a route on the map; this plugin
	 * never moves the player.
	 */
	private void postPath(Target target)
	{
		WorldPoint point = new WorldPoint(target.x, target.y, target.plane);
		Map<String, Object> data = new HashMap<>();
		data.put(SHORTEST_PATH_TARGET, point);
		clientThread.invokeLater(() ->
		{
			if (client.getGameState() == GameState.LOGGED_IN)
			{
				eventBus.post(new PluginMessage(SHORTEST_PATH_NAMESPACE, SHORTEST_PATH_PATH, data));
			}
		});
	}

	// ---- panel ----

	private void refreshPanel()
	{
		SwingUtilities.invokeLater(panel::refresh);
	}
}
