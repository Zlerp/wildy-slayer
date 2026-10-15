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

import com.zlerp.wildyslayer.SyncModels.Task;
import java.util.List;
import javax.annotation.Nullable;
import javax.inject.Inject;
import net.runelite.api.Client;
import net.runelite.api.gameval.DBTableID;
import net.runelite.api.gameval.VarPlayerID;
import net.runelite.api.gameval.VarbitID;

/**
 * Reads the current Slayer task the same way the core Slayer plugin does: amount, target and
 * area varps resolved through the SlayerTask / SlayerArea DB tables. Client thread only.
 */
class SlayerTaskReader
{
	/**
	 * The SLAYER_TARGET value that means "a boss task, see SLAYER_TARGET_BOSSID"; taken from
	 * [proc,helper_slayer_current_assignment], as the core Slayer plugin does. There is no
	 * gameval constant for it.
	 */
	private static final int BOSS_TASK_ID = 98;

	/**
	 * The {@link VarbitID#SLAYER_MODIFIER_ID} value for the additive modifier (a flat +/- on the
	 * assigned amount), mirrored from the core SlayerPlugin. There is no gameval constant for it.
	 */
	private static final int SLAYER_MODIFIER_ADDITIVE = 2;

	/**
	 * Krystilia's value in {@link VarbitID#SLAYER_MASTER}. There is no gameval constant for it.
	 */
	static final int SLAYER_MASTER_KRYSTILIA = 7;

	static final String KRYSTILIA = "Krystilia";

	private final Client client;

	@Inject
	SlayerTaskReader(Client client)
	{
		this.client = client;
	}

	/**
	 * The current task, or null when there is none or the DB tables cannot resolve it.
	 */
	@Nullable
	Task read()
	{
		int amount = client.getVarpValue(VarPlayerID.SLAYER_COUNT);
		if (amount <= 0)
		{
			return null;
		}

		int taskId = client.getVarpValue(VarPlayerID.SLAYER_TARGET);
		int taskDBRow;
		if (taskId == BOSS_TASK_ID)
		{
			List<Integer> bossRows = client.getDBRowsByValue(
				DBTableID.SlayerTaskSublist.ID,
				DBTableID.SlayerTaskSublist.COL_TASK_SUBTABLE_ID,
				0,
				client.getVarbitValue(VarbitID.SLAYER_TARGET_BOSSID));
			if (bossRows.isEmpty())
			{
				return null;
			}
			taskDBRow = (Integer) client.getDBTableField(bossRows.get(0), DBTableID.SlayerTaskSublist.COL_TASK, 0)[0];
		}
		else
		{
			List<Integer> taskRows = client.getDBRowsByValue(DBTableID.SlayerTask.ID, DBTableID.SlayerTask.COL_ID, 0, taskId);
			if (taskRows.isEmpty())
			{
				return null;
			}
			taskDBRow = taskRows.get(0);
		}

		String taskName = (String) client.getDBTableField(taskDBRow, DBTableID.SlayerTask.COL_NAME_UPPERCASE, 0)[0];

		String location = null;
		int areaId = client.getVarpValue(VarPlayerID.SLAYER_AREA);
		if (areaId > 0)
		{
			List<Integer> areaRows = client.getDBRowsByValue(DBTableID.SlayerArea.ID, DBTableID.SlayerArea.COL_AREA_ID, 0, areaId);
			if (!areaRows.isEmpty())
			{
				location = (String) client.getDBTableField(areaRows.get(0), DBTableID.SlayerArea.COL_AREA_NAME_IN_HELPER, 0)[0];
			}
		}

		int initialAmount = client.getVarpValue(VarPlayerID.SLAYER_COUNT_ORIGINAL);
		if (client.getVarbitValue(VarbitID.SLAYER_MODIFIER_ID) == SLAYER_MODIFIER_ADDITIVE)
		{
			// SLAYER_MODIFIER_NEGATIVE is a boolean varbit (0/1), read the same way as the core SlayerPlugin
			boolean isNegative = client.getVarbitValue(VarbitID.SLAYER_MODIFIER_NEGATIVE) != 0;
			int modifierValue = client.getVarbitValue(VarbitID.SLAYER_MODIFIER_VALUE);
			initialAmount += isNegative ? -modifierValue : modifierValue;
		}

		Task task = new Task();
		task.name = taskName;
		task.amount = amount;
		task.initial = initialAmount > 0 ? initialAmount : null;
		task.location = location;
		task.master = masterName(client.getVarbitValue(VarbitID.SLAYER_MASTER));
		return task;
	}

	@Nullable
	static String masterName(int master)
	{
		if (master == SLAYER_MASTER_KRYSTILIA)
		{
			return KRYSTILIA;
		}
		return master > 0 ? Integer.toString(master) : null;
	}
}
