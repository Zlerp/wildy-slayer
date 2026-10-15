// Shared helpers for the Wilderness Slayer helper's serverless functions.
// These run on Vercel, where the OSRS hiscores, the OSRS Wiki and its price
// API are reachable; the browser (and the Claude sandbox) cannot call those
// hosts directly, so everything goes through here with CDN caching.
const UA = "wildy-slayer/1.0 (https://wildy-slayer.vercel.app/; contact: https://github.com/Zlerp/wildy-slayer/issues)";

async function upstream(url, init = {}) {
  const res = await fetch(url, { ...init, headers: { "User-Agent": UA, ...(init.headers || {}) } });
  return res;
}

function cache(res, seconds) {
  res.setHeader("Cache-Control", `public, s-maxage=${seconds}, stale-while-revalidate=${seconds * 4}, max-age=60`);
  res.setHeader("Access-Control-Allow-Origin", "*");
}

function bad(res, code, msg) {
  res.setHeader("Cache-Control", "no-store");
  res.status(code).json({ error: msg });
}

module.exports = { upstream, cache, bad, UA };
