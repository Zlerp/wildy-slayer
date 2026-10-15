// GET /api/slayer/img?name=Abyssal_whip.png -> OSRS Wiki image, cached at the edge
const { upstream, bad } = require("./_shared.js");

module.exports = async (req, res) => {
  const name = String(req.query.name || "").replace(/ /g, "_");
  if (!name || name.length > 120 || !/^[\w\-'().,!%+&]+\.(png|gif|jpg|webp)$/i.test(name)) return bad(res, 400, "name must be a wiki image file name");
  try {
    const r = await upstream(`https://oldschool.runescape.wiki/images/${encodeURIComponent(name).replace(/%2F/g, "/")}`);
    if (!r.ok) return bad(res, r.status === 404 ? 404 : 502, "image " + r.status);
    const buf = Buffer.from(await r.arrayBuffer());
    res.setHeader("Content-Type", r.headers.get("content-type") || "image/png");
    res.setHeader("Cache-Control", "public, s-maxage=2592000, max-age=86400, immutable");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.status(200).send(buf);
  } catch (e) {
    bad(res, 502, "wiki unreachable: " + e.message);
  }
};
