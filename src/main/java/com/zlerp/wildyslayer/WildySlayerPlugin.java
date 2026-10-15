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
import com.zlerp.wildyslayer.SyncModels.Task;
import java.awt.image.BufferedImage;
import java.util.ArrayList;
import java.util.Arrays;
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
import net.runelite.api.WorldType;
import net.runelite.api.WorldView;
import net.runelite.api.coords.WorldPoint;
import net.runelite.api.events.GameStateChanged;
import net.runelite.api.events.GameTick;
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
import net.runelite.client.game.ItemManager;
import net.runelite.client.game.ItemStats;
import net.runelite.client.plugins.Plugin;
import net.runelite.client.plugins.PluginDescriptor;
import net.runelite.client.ui.ClientToolbar;
import net.runelite.client.ui.NavigationButton;
import net.runelite.client.ui.overlay.OverlayManager;
import net.runelite.client.util.ImageUtil;

@Slf4j
@PluginDescriptor(
	name = "Wildy Slayer",
	description = "Syncs your levels, items and Slayer task with the Wildy Slayer web app, outlines its gear picks in your bank and routes to the spot via Shortest Path",
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

	/**
	 * Game ticks to wait after LOGGED_IN (login, hop, reconnect) before reading the Wilderness and
	 * PvP varbits: they arrive after that event, so until then the client is not settled and
	 * nothing is pushed.
	 */
	private static final int SETTLE_TICKS = 2;

	/** The app's gear slots (PROTOCOL.md); only these keys of a selection's gear and alts are read. */
	static final List<String> GEAR_SLOTS = Collections.unmodifiableList(Arrays.asList(
		"head", "cape", "neck", "ammo", "weapon", "body", "shield", "legs", "hands", "feet", "ring"));

	// Bounds on what the server can make the plugin highlight (gear entries are bounded by GEAR_SLOTS)
	private static final int MAX_ALT_ENTRIES = 22;
	private static final int MAX_SUPPLY_ENTRIES = 40;
	private static final int MAX_IDS_PER_ENTRY = 8;

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
	private ItemManager itemManager;

	@Inject
	private SyncClient syncClient;

	@Inject
	private SnapshotBuilder snapshotBuilder;

	@Inject
	private SlayerTaskReader taskReader;

	@Inject
	private GearHighlightOverlay gearOverlay;

	@Inject
	private WildySlayerInfoOverlay infoOverlay;

	@Inject
	private WildySlayerPanel panel;

	private NavigationButton navButton;

	/** Set first thing in startUp and cleared first thing in shutDown; late callbacks check it and do nothing. */
	private volatile boolean running;

	// client thread only
	private final Map<Skill, Integer> realLevels = new EnumMap<>(Skill.class);

	/**
	 * Client thread only. False from logging in, hopping or a lost connection until
	 * {@link #SETTLE_TICKS} ticks after LOGGED_IN, so the Wilderness and PvP varbits are current
	 * before anything is pushed.
	 */
	private boolean settled;
	private int settleTicksLeft = -1;

	/**
	 * The route this plugin last handed to Shortest Path. Cleared when this plugin clears it, and
	 * when another plugin sets or clears a Shortest Path route ({@link #onPluginMessage}).
	 */
	@Nullable
	private volatile WorldPoint postedPath;

	/** The Shortest Path message this plugin is posting right now, so {@link #onPluginMessage} can skip it. */
	@Nullable
	private volatile PluginMessage ownMessage;

	/** The game's current Slayer task, read on the client thread; shown with sync on or off. */
	@Getter
	@Nullable
	private volatile Task currentTask;

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

	/** The selection's gear after the client-side checks, one row per slot, for the panel. */
	@Getter
	private volatile List<GearRow> gearRows = Collections.emptyList();

	// which selection the highlights were last built for (guarded by this, like applyState)
	private static final long NOT_BUILT = -1;
	private long highlightsBuiltAt = NOT_BUILT;
	private boolean highlightsBuiltPresent;
	// bumped for every queued rebuild and by clearRemoteState; a rebuild publishes only if still current
	private long highlightsGen;

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
			if (!running)
			{
				return;
			}
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
		running = true;
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

		// selections already on the server when we start are not auto-pathed; "Show path" covers them
		resetSelectionBaseline();
		loggedIn = client.getGameState() == GameState.LOGGED_IN;

		startPolling();
		clientThread.invoke(() ->
		{
			if (!running)
			{
				return;
			}
			// the first push goes out from onGameTick once settled
			settled = false;
			settleTicksLeft = client.getGameState() == GameState.LOGGED_IN ? SETTLE_TICKS : -1;
			refreshTask();
			refreshPanel();
		});
		refreshPanel();
		log.info("Wildy Slayer started");
	}

	@Override
	protected void shutDown()
	{
		running = false;
		overlayManager.remove(gearOverlay);
		overlayManager.remove(infoOverlay);
		if (navButton != null)
		{
			clientToolbar.removeNavigation(navButton);
			navButton = null;
		}

		stopPolling();
		cancelPush();

		clientThread.invoke(() ->
		{
			snapshotBuilder.clear();
			realLevels.clear();
			gearOverlay.reset();
			settled = false;
			settleTicksLeft = -1;
			postedPath = null;
			currentTask = null;
		});
		clearRemoteState();
		resetSelectionBaseline();
		lastSnapshot = null;
		currentTask = null;
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
			if (settled)
			{
				// a region load: the varbits are current
				requestPush();
			}
			else
			{
				// just logged in, hopped or reconnected: the varbits arrive after this event, so
				// wait a couple of ticks before reading the area or pushing anything
				settleTicksLeft = SETTLE_TICKS;
			}
		}
		else if (state != GameState.LOADING)
		{
			// logging in, hopping, reconnecting or logged out: nothing is pushed until settled again
			loggedIn = false;
			settled = false;
			settleTicksLeft = -1;
			realLevels.clear();
			if (state == GameState.LOGIN_SCREEN)
			{
				// a different account may log in next: forget this one's bank, items and task
				snapshotBuilder.clear();
				lastSnapshot = null;
				currentTask = null;
			}
		}
		refreshPanel();
	}

	@Subscribe
	public void onGameTick(GameTick tick)
	{
		if (settleTicksLeft > 0 && --settleTicksLeft == 0)
		{
			settleTicksLeft = -1;
			settled = true;
			refreshTask();
			// item stats may have finished loading since the selection's highlights were built
			rebuildHighlightsNow();
			requestPush();
			refreshPanel();
		}
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
			// frozen in the Wilderness and PvP areas: the payload keeps the snapshot taken outside
			if (config.shareInventory() && !inPvpArea())
			{
				requestPush();
			}
		}
		else if (id == InventoryID.WORN)
		{
			if (config.shareEquipment() && !inPvpArea())
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
		if (varbit == VarbitID.INSIDE_WILDERNESS || varbit == VarbitID.PVP_AREA_CLIENT)
		{
			// left the Wilderness or a PvP area: send a fresh inventory and equipment snapshot. Not
			// while unsettled: a varcache reset during a hop or login is not leaving the area.
			if (settled && client.getGameState() == GameState.LOGGED_IN && !inPvpArea())
			{
				requestPush();
			}
			return;
		}
		if (varp == VarPlayerID.SLAYER_COUNT || varp == VarPlayerID.SLAYER_TARGET || varp == VarPlayerID.SLAYER_AREA
			|| varp == VarPlayerID.SLAYER_COUNT_ORIGINAL
			|| varbit == VarbitID.SLAYER_MASTER || varbit == VarbitID.SLAYER_TARGET_BOSSID
			|| varbit == VarbitID.SLAYER_MODIFIER_ID || varbit == VarbitID.SLAYER_MODIFIER_VALUE
			|| varbit == VarbitID.SLAYER_MODIFIER_NEGATIVE)
		{
			refreshTask();
			refreshPanel();
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

	/**
	 * In the Wilderness, a PvP area or on a PvP world: inventory and equipment are not refreshed or
	 * pushed there, and nothing is auto-pathed. Client thread only.
	 */
	private boolean inPvpArea()
	{
		return client.getVarbitValue(VarbitID.INSIDE_WILDERNESS) == 1
			|| client.getVarbitValue(VarbitID.PVP_AREA_CLIENT) == 1
			|| WorldType.isPvpWorld(client.getWorldType());
	}

	/** Client thread only. */
	private boolean inInstance()
	{
		WorldView worldView = client.getTopLevelWorldView();
		return worldView != null && worldView.isInstance();
	}

	/**
	 * Re-read the game's current Slayer task for the panel and overlay. Needs no pairing. Client
	 * thread only.
	 */
	private void refreshTask()
	{
		GameState state = client.getGameState();
		currentTask = state == GameState.LOGGED_IN || state == GameState.LOADING ? taskReader.read() : null;
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
		if (!running || !syncConfigured())
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
		if (!running)
		{
			return;
		}
		synchronized (lock)
		{
			lastPushAt = System.currentTimeMillis();
			// changes arriving from here on schedule a fresh push instead of being coalesced into this one
			pushFuture = null;
		}
		clientThread.invoke(() ->
		{
			if (!running || client.getGameState() != GameState.LOGGED_IN || !syncConfigured())
			{
				return true;
			}
			if (!settled)
			{
				// just logged in, hopped or reconnected: the Wilderness/PvP varbits may still read 0;
				// onGameTick pushes once they are in
				return true;
			}
			net.runelite.api.Player local = client.getLocalPlayer();
			if (local == null || local.getName() == null)
			{
				// right after login the player is not populated yet; try again next tick
				return false;
			}
			Player player = snapshotBuilder.build(config.shareBank(), config.shareInventory(), config.shareEquipment(), inPvpArea());
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
		if (!running || !loggedIn || !syncConfigured())
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
		if (!running)
		{
			return;
		}
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

		long selectionAt = selectionAt(state);
		if (selectionAt != highlightsBuiltAt || (newSelection != null) != highlightsBuiltPresent)
		{
			// item stats and compositions are only safe on the client thread
			highlightsBuiltAt = selectionAt;
			highlightsBuiltPresent = newSelection != null;
			long gen = ++highlightsGen;
			clientThread.invoke(() -> rebuildHighlights(newSelection, gen));
		}

		if (!selectionBaselineSet)
		{
			// first full response since startUp or re-pairing: whatever is selected now predates us
			selectionBaselineSet = true;
			lastHandledSelectionAt = selectionAt;
		}
		else if (newSelection != null && selectionAt > lastHandledSelectionAt)
		{
			lastHandledSelectionAt = selectionAt;
			log.debug("New selection {} #{} ({})", newSelection.task, newSelection.loc, newSelection.source);
			WorldPoint target = targetOf(newSelection);
			if (config.autoPath() && target != null && loggedIn)
			{
				postPath(target, true);
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

	/**
	 * The spot a selection names, from the bundled {@link Spots} table by task slug and location
	 * index. When the selection also carries a {@code locationName} that differs from the table's
	 * name at that index (the app's list changed since this build), the location is looked up by
	 * that name within the same task instead, and there is no spot when none matches. The name is
	 * only a lookup key and is never shown. Null when the task or location is unknown.
	 */
	@Nullable
	static Spots.Spot spotOf(@Nullable Selection sel)
	{
		if (sel == null)
		{
			return null;
		}
		Spots.Spot byIndex = Spots.spot(sel.task, sel.loc);
		if (sel.locationName == null || (byIndex != null && byIndex.name.equals(sel.locationName)))
		{
			return byIndex;
		}
		Spots.TaskSpots task = Spots.task(sel.task);
		if (task != null)
		{
			for (Spots.Spot spot : task.spots)
			{
				if (spot.name.equals(sel.locationName))
				{
					return spot;
				}
			}
		}
		return null;
	}

	/**
	 * The walk target for a selection: the {@link #spotOf} spot's target from the bundled table.
	 * The server's own {@code target} is ignored. Null when there is no spot.
	 */
	@Nullable
	static WorldPoint targetOf(@Nullable Selection sel)
	{
		Spots.Spot spot = spotOf(sel);
		return spot != null ? spot.target : null;
	}

	/**
	 * The display name of a selection's combat style, or null unless it is melee, ranged or magic.
	 */
	@Nullable
	static String styleName(@Nullable String style)
	{
		if (style == null)
		{
			return null;
		}
		switch (style)
		{
			case "melee":
				return "Melee";
			case "ranged":
				return "Ranged";
			case "magic":
				return "Magic";
			default:
				return null;
		}
	}

	/**
	 * Rebuild the highlights for the current selection right away, if there is one. Client thread only.
	 */
	private void rebuildHighlightsNow()
	{
		Selection sel;
		long gen;
		synchronized (this)
		{
			if (remoteState == null)
			{
				return;
			}
			sel = remoteState.selection;
			gen = ++highlightsGen;
		}
		rebuildHighlights(sel, gen);
	}

	/**
	 * Turn the selection's id lists into highlight sets, keeping only what passes the client-side
	 * checks: gear and alternative ids must be equipable items, and every list is capped. The sets
	 * are built outside the lock and published only if {@code gen} is still current, so a rebuild
	 * queued before sync was turned off, re-paired or superseded never puts old highlights back.
	 * Client thread only.
	 */
	private void rebuildHighlights(@Nullable Selection sel, long gen)
	{
		if (!running)
		{
			return;
		}
		Set<Integer> gear = new HashSet<>();
		Set<Integer> alts = new HashSet<>();
		Set<Integer> supplies = new HashSet<>();
		List<GearRow> rows = new ArrayList<>();
		if (sel != null)
		{
			if (sel.gear != null)
			{
				for (String slot : GEAR_SLOTS)
				{
					GearPick pick = sel.gear.get(slot);
					List<Integer> ids = itemIds(pick != null ? pick.ids : null, true);
					if (ids.isEmpty())
					{
						continue;
					}
					gear.addAll(ids);
					List<String> names = new ArrayList<>(ids.size());
					for (int id : ids)
					{
						names.add(itemManager.getItemComposition(id).getName());
					}
					rows.add(new GearRow(slot, ids, names));
				}
			}
			if (sel.alts != null)
			{
				int entries = 0;
				for (String slot : GEAR_SLOTS)
				{
					List<GearPick> picks = sel.alts.get(slot);
					if (picks == null)
					{
						continue;
					}
					for (GearPick pick : picks)
					{
						if (entries++ >= MAX_ALT_ENTRIES)
						{
							break;
						}
						alts.addAll(itemIds(pick != null ? pick.ids : null, true));
					}
				}
			}
			if (sel.supplies != null)
			{
				int count = Math.min(sel.supplies.size(), MAX_SUPPLY_ENTRIES);
				for (int i = 0; i < count; i++)
				{
					Supply supply = sel.supplies.get(i);
					supplies.addAll(itemIds(supply != null ? supply.ids : null, false));
				}
			}
		}
		synchronized (this)
		{
			if (!running || gen != highlightsGen)
			{
				// shut down, remote state cleared, or a newer rebuild was queued after this one
				return;
			}
			gearIds = Collections.unmodifiableSet(gear);
			altIds = Collections.unmodifiableSet(alts);
			supplyIds = Collections.unmodifiableSet(supplies);
			gearRows = Collections.unmodifiableList(rows);
		}
		refreshPanel();
	}

	/**
	 * The first {@link #MAX_IDS_PER_ENTRY} ids of a list that are real item ids, and with
	 * {@code equipable} only those whose item is equipable. Client thread only.
	 */
	private List<Integer> itemIds(@Nullable List<Integer> ids, boolean equipable)
	{
		List<Integer> out = new ArrayList<>();
		if (ids == null)
		{
			return out;
		}
		int itemCount = client.getItemCount();
		int count = Math.min(ids.size(), MAX_IDS_PER_ENTRY);
		for (int i = 0; i < count; i++)
		{
			Integer id = ids.get(i);
			if (id == null || id <= 0 || id >= itemCount || out.contains(id))
			{
				continue;
			}
			if (equipable)
			{
				ItemStats stats = itemManager.getItemStats(id);
				if (stats == null || !stats.isEquipable())
				{
					continue;
				}
			}
			out.add(id);
		}
		return out;
	}

	boolean hasHighlights()
	{
		return !gearIds.isEmpty() || !altIds.isEmpty() || !supplyIds.isEmpty();
	}

	private synchronized void clearRemoteState()
	{
		selection = null;
		remoteState = null;
		highlightsBuiltAt = NOT_BUILT;
		highlightsBuiltPresent = false;
		highlightsGen++;
		gearIds = Collections.emptySet();
		altIds = Collections.emptySet();
		supplyIds = Collections.emptySet();
		gearRows = Collections.emptyList();
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
	 * "Show path": ask Shortest Path to draw a route to the current selection's spot. Works
	 * anywhere, since the player asked for it.
	 */
	void showPathToSelection()
	{
		WorldPoint target = targetOf(selection);
		if (target != null)
		{
			postPath(target, false);
		}
	}

	/**
	 * True after this plugin asked Shortest Path for a route, until this plugin clears it or another
	 * plugin sets or clears a Shortest Path route. A destination the player sets on the world map
	 * cannot be seen.
	 */
	boolean hasPostedPath()
	{
		return postedPath != null;
	}

	/**
	 * "Clear path": asks Shortest Path to clear its route, only while {@link #hasPostedPath()};
	 * otherwise does nothing.
	 */
	void clearPath()
	{
		clientThread.invokeLater(() ->
		{
			if (!running || postedPath == null)
			{
				return;
			}
			postOwn(new PluginMessage(SHORTEST_PATH_NAMESPACE, SHORTEST_PATH_CLEAR));
			postedPath = null;
			refreshPanel();
		});
	}

	/**
	 * Another plugin (Quest Helper, for example) setting or clearing a Shortest Path route means the
	 * route on screen is no longer ours, so "Clear path" must not clear it.
	 */
	@Subscribe
	public void onPluginMessage(PluginMessage event)
	{
		if (event == ownMessage || !SHORTEST_PATH_NAMESPACE.equals(event.getNamespace()))
		{
			return;
		}
		String name = event.getName();
		if ((SHORTEST_PATH_PATH.equals(name) || SHORTEST_PATH_CLEAR.equals(name)) && postedPath != null)
		{
			postedPath = null;
			refreshPanel();
		}
	}

	// ---- Shortest Path ----

	/**
	 * Hands a target to the Shortest Path plugin, which only draws a route on the map; this plugin
	 * never moves the player. Only the target is sent, never a config override. An automatic
	 * request is dropped in the Wilderness, a PvP area, on a PvP world, or in an instance, and
	 * right after a login, hop or reconnect, before those can be read.
	 */
	private void postPath(WorldPoint target, boolean automatic)
	{
		Map<String, Object> data = new HashMap<>();
		data.put(SHORTEST_PATH_TARGET, target);
		clientThread.invokeLater(() ->
		{
			if (!running || client.getGameState() != GameState.LOGGED_IN)
			{
				return;
			}
			if (automatic && (!settled || inPvpArea() || inInstance()))
			{
				log.debug("Not auto-pathing: unsettled, or in the Wilderness, a PvP area or an instance");
				return;
			}
			postOwn(new PluginMessage(SHORTEST_PATH_NAMESPACE, SHORTEST_PATH_PATH, data));
			postedPath = target;
			refreshPanel();
		});
	}

	/** Post a message on the event bus (synchronous), marked as ours for {@link #onPluginMessage}. Client thread only. */
	private void postOwn(PluginMessage message)
	{
		ownMessage = message;
		try
		{
			eventBus.post(message);
		}
		finally
		{
			ownMessage = null;
		}
	}

	// ---- panel ----

	private void refreshPanel()
	{
		SwingUtilities.invokeLater(panel::refresh);
	}

	/** One gear slot of the selection as the panel shows it: accepted ids and the game's name for each. */
	static final class GearRow
	{
		final String slot;
		final List<Integer> ids;
		final List<String> names;

		GearRow(String slot, List<Integer> ids, List<String> names)
		{
			this.slot = slot;
			this.ids = Collections.unmodifiableList(ids);
			this.names = Collections.unmodifiableList(names);
		}
	}
}
