// GET /api/slayer/wiki?page=Krystilia -> the page's wikitext (for infobox data)
// GET /api/slayer/wiki?page=Krystilia&html=1 -> rendered HTML of the page
const { upstream, cache, bad } = require("./_shared.js");

module.exports = async (req, res) => {
  const page = String(req.query.page || "").trim();
  if (!page || page.length > 200) return bad(res, 400, "page required");
  const prop = req.query.html ? "text" : "wikitext";
  const url = `https://oldschool.runescape.wiki/api.php?action=parse&format=json&redirects=1&prop=${prop}&page=${encodeURIComponent(page)}`;
  try {
    const r = await upstream(url);
    if (!r.ok) return bad(res, 502, "wiki " + r.status);
    const data = await r.json();
    if (data.error) return bad(res, 404, data.error.info || "not found");
    const body = prop === "text" ? data.parse.text["*"] : data.parse.wikitext["*"];
    cache(res, 3600);
    res.status(200).json({ title: data.parse.title, [prop]: body, fetched: Date.now() });
  } catch (e) {
    bad(res, 502, "wiki unreachable: " + e.message);
  }
};
