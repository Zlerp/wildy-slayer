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

import com.google.gson.Gson;
import com.google.gson.JsonObject;
import com.google.gson.JsonSyntaxException;
import com.zlerp.wildyslayer.SyncModels.Player;
import com.zlerp.wildyslayer.SyncModels.Selection;
import com.zlerp.wildyslayer.SyncModels.SyncState;
import java.io.IOException;
import javax.annotation.Nullable;
import javax.inject.Inject;
import lombok.extern.slf4j.Slf4j;
import okhttp3.Call;
import okhttp3.Callback;
import okhttp3.HttpUrl;
import okhttp3.MediaType;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.RequestBody;
import okhttp3.Response;
import okhttp3.ResponseBody;

/**
 * Talks to the sync endpoint described in PROTOCOL.md. Every request goes through
 * {@link Call#enqueue(Callback)}, so nothing here blocks the calling thread; handlers run on
 * OkHttp's thread pool.
 */
@Slf4j
class SyncClient
{
	private static final String SYNC_PATH = "api/slayer/sync/";
	private static final MediaType JSON = MediaType.parse("application/json; charset=utf-8");

	interface Handler
	{
		void onResult(SyncState state);

		void onError(String message);
	}

	private final OkHttpClient okHttpClient;
	private final Gson gson;

	@Inject
	SyncClient(OkHttpClient okHttpClient, Gson gson)
	{
		this.okHttpClient = okHttpClient;
		// nulls inside a part are meaningful ("task": null means no task), so serialise them
		this.gson = gson.newBuilder().serializeNulls().create();
	}

	/**
	 * The sync endpoint for a configured base URL, or null when the URL does not parse.
	 */
	@Nullable
	static HttpUrl syncUrl(@Nullable String serverUrl)
	{
		if (serverUrl == null)
		{
			return null;
		}
		String base = serverUrl.trim();
		while (base.endsWith("/"))
		{
			base = base.substring(0, base.length() - 1);
		}
		if (base.isEmpty())
		{
			return null;
		}
		return HttpUrl.parse(base + "/" + SYNC_PATH);
	}

	/**
	 * GET the row for a code. Passing the last seen version makes the server answer
	 * {@code unchanged} when nothing moved.
	 */
	void fetch(String serverUrl, String code, long version, Handler handler)
	{
		HttpUrl base = syncUrl(serverUrl);
		if (base == null)
		{
			handler.onError("Bad server URL");
			return;
		}
		HttpUrl url = base.newBuilder()
			.addQueryParameter("code", code)
			.addQueryParameter("v", Long.toString(version))
			.build();
		Request request = new Request.Builder()
			.url(url)
			.get()
			.build();
		enqueue(request, handler);
	}

	/**
	 * POST the given parts with {@code ?full=1}, so the response carries the whole row. A part
	 * left null is not sent and therefore not replaced on the server.
	 */
	void push(String serverUrl, String code, @Nullable Player player, @Nullable Selection selection, Handler handler)
	{
		HttpUrl base = syncUrl(serverUrl);
		if (base == null)
		{
			handler.onError("Bad server URL");
			return;
		}
		JsonObject body = new JsonObject();
		body.addProperty("code", code);
		if (player != null)
		{
			body.add("player", gson.toJsonTree(player));
		}
		if (selection != null)
		{
			body.add("selection", gson.toJsonTree(selection));
		}
		HttpUrl url = base.newBuilder()
			.addQueryParameter("full", "1")
			.build();
		Request request = new Request.Builder()
			.url(url)
			.post(RequestBody.create(JSON, gson.toJson(body)))
			.build();
		enqueue(request, handler);
	}

	private void enqueue(Request request, Handler handler)
	{
		okHttpClient.newCall(request).enqueue(new Callback()
		{
			@Override
			public void onFailure(Call call, IOException e)
			{
				log.debug("Sync request to {} failed", request.url().encodedPath(), e);
				handler.onError("Network error: " + e.getMessage());
			}

			@Override
			public void onResponse(Call call, Response response)
			{
				try (Response r = response)
				{
					ResponseBody responseBody = r.body();
					String text = responseBody != null ? responseBody.string() : "";
					SyncState state = null;
					try
					{
						state = gson.fromJson(text, SyncState.class);
					}
					catch (JsonSyntaxException ex)
					{
						log.debug("Sync response was not JSON", ex);
					}

					if (!r.isSuccessful())
					{
						String detail = state != null && state.error != null ? ": " + state.error : "";
						handler.onError("HTTP " + r.code() + detail);
						return;
					}
					if (state == null)
					{
						handler.onError("Unreadable response");
						return;
					}
					if (!state.ok)
					{
						handler.onError(state.error != null ? state.error : "Server refused the request");
						return;
					}
					handler.onResult(state);
				}
				catch (IOException e)
				{
					log.debug("Reading sync response failed", e);
					handler.onError("Network error: " + e.getMessage());
				}
			}
		});
	}
}
