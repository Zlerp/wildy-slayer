// GET /api/slayer/prices?ids=4151,1333  -> latest GE prices from the OSRS Wiki
// GET /api/slayer/prices?names=Abyssal whip|Rune scimitar -> id lookup + prices
const { upstream, cache, bad } = require("./_shared.js");

let mapping = null, mappingAt = 0;
async function getMapping() {
  if (mapping && Date.now() - mappingAt < 6 * 3600 * 1000) return mapping;
  const r = await upstream("https://prices.runescape.wiki/api/v1/osrs/mapping");
  if (!r.ok) throw new Error("mapping " + r.status);
  mapping = await r.json();
  mappingAt = Date.now();
  return mapping;
}

module.exports = async (req, res) => {
  try {
    let ids = String(req.query.ids || "").split(",").map((s) => parseInt(s, 10)).filter((n) => n > 0);
    const names = String(req.query.names || "").split("|").map((s) => s.trim()).filter(Boolean);
    const items = {};
    if (names.length) {
      const map = await getMapping();
      const byName = new Map(map.map((m) => [m.name.toLowerCase(), m]));
      for (const n of names) {
        const m = byName.get(n.toLowerCase());
        if (m) { items[m.id] = { id: m.id, name: m.name, icon: m.icon, limit: m.limit, highalch: m.highalch }; ids.push(m.id); }
      }
    }
    if (!ids.length) return bad(res, 400, "pass ids=1,2 or names=a|b");
    ids = [...new Set(ids)].slice(0, 400);
    const r = await upstream("https://prices.runescape.wiki/api/v1/osrs/latest");
    if (!r.ok) return bad(res, 502, "prices " + r.status);
    const latest = (await r.json()).data;
    const prices = {};
    for (const id of ids) {
      const p = latest[id];
      if (p) prices[id] = { high: p.high, low: p.low, highTime: p.highTime, lowTime: p.lowTime };
    }
    cache(res, 300);
    res.status(200).json({ prices, items, fetched: Date.now() });
  } catch (e) {
    bad(res, 502, "price api unreachable: " + e.message);
  }
};
