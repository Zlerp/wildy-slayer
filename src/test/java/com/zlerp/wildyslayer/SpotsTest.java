package com.zlerp.wildyslayer;

import com.zlerp.wildyslayer.SyncModels.Selection;
import com.zlerp.wildyslayer.SyncModels.Target;
import net.runelite.api.coords.WorldPoint;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;
import org.junit.Test;

public class SpotsTest
{
	@Test
	public void tableIsComplete()
	{
		assertEquals(Spots.TASK_COUNT, Spots.all().size());
		int spots = 0;
		for (Spots.TaskSpots task : Spots.all().values())
		{
			spots += task.spots.size();
		}
		assertEquals(Spots.SPOT_COUNT, spots);
	}

	@Test
	public void targetComesFromTheTableNotTheServer()
	{
		Selection sel = new Selection();
		sel.task = "dust-devils";
		sel.loc = 0;
		sel.target = new Target();
		sel.target.x = 1;
		sel.target.y = 2;
		sel.target.plane = 3;
		assertEquals(new WorldPoint(3439, 10123, 0), WildySlayerPlugin.targetOf(sel));
		assertEquals("Wilderness Slayer Cave", Spots.spot("dust-devils", 0).name);
		assertEquals("Dust devils", Spots.task("dust-devils").name);
	}

	@Test
	public void unknownTaskOrIndexHasNoTarget()
	{
		Selection sel = new Selection();
		sel.task = "not-a-task";
		sel.loc = 0;
		assertNull(WildySlayerPlugin.targetOf(sel));
		sel.task = "dust-devils";
		sel.loc = 99;
		assertNull(WildySlayerPlugin.targetOf(sel));
		sel.loc = -1;
		assertNull(WildySlayerPlugin.targetOf(sel));
		sel.loc = null;
		assertNull(WildySlayerPlugin.targetOf(sel));
		assertNull(WildySlayerPlugin.targetOf(null));
	}

	@Test
	public void locationNameGuardsAgainstAMovedList()
	{
		Selection sel = new Selection();
		sel.task = "ankou";
		sel.loc = 0;
		sel.locationName = "Wilderness Slayer Cave";
		assertEquals(new WorldPoint(3361, 10076, 0), WildySlayerPlugin.targetOf(sel));
		// the app's list was reordered after this build: the name finds the right spot
		sel.locationName = "The Forgotten Cemetery";
		assertEquals(new WorldPoint(2977, 3748, 0), WildySlayerPlugin.targetOf(sel));
		assertEquals("The Forgotten Cemetery", WildySlayerPlugin.spotOf(sel).name);
		// a location this build does not know: no target rather than the wrong one
		sel.locationName = "Somewhere new";
		assertNull(WildySlayerPlugin.targetOf(sel));
		sel.loc = 5;
		assertNull(WildySlayerPlugin.targetOf(sel));
		sel.locationName = "The Forgotten Cemetery";
		assertEquals(new WorldPoint(2977, 3748, 0), WildySlayerPlugin.targetOf(sel));
	}

	@Test
	public void onlyKnownStylesAreShown()
	{
		assertEquals("Melee", WildySlayerPlugin.styleName("melee"));
		assertEquals("Ranged", WildySlayerPlugin.styleName("ranged"));
		assertEquals("Magic", WildySlayerPlugin.styleName("magic"));
		assertNull(WildySlayerPlugin.styleName("Ice Burst"));
		assertNull(WildySlayerPlugin.styleName(null));
	}

	@Test
	public void setupNamesAreTrimmed()
	{
		assertEquals("Dusties burst", WildySlayerPanel.setupName("  Dusties burst "));
		StringBuilder longName = new StringBuilder();
		for (int i = 0; i < 100; i++)
		{
			longName.append('x');
		}
		assertEquals(40, WildySlayerPanel.setupName(longName.toString()).length());
		assertNull(WildySlayerPanel.setupName(null));
	}

	@Test
	public void serverErrorsAreClipped()
	{
		StringBuilder longError = new StringBuilder("storage error: ");
		for (int i = 0; i < 500; i++)
		{
			longError.append('y');
		}
		assertEquals(WildySlayerPanel.MAX_ERROR, WildySlayerPanel.clip(longError.toString(), WildySlayerPanel.MAX_ERROR).length());
		assertEquals("HTTP 400", WildySlayerPanel.clip(" HTTP 400 ", WildySlayerPanel.MAX_ERROR));
	}
}
