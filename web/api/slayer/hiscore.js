// GET /api/slayer/hiscore?player=NAME -> OSRS hiscores (skills + activities)
const { upstream, cache, bad } = require("./_shared.js");

module.exports = async (req, res) => {
  const player = String(req.query.player || "").trim();
  if (!player || player.length > 12 || !/^[\w\- ]+$/.test(player)) return bad(res, 400, "player must be 1-12 letters, digits, spaces, - or _");
  const url = `https://secure.runescape.com/m=hiscore_oldschool/index_lite.json?player=${encodeURIComponent(player)}`;
  try {
    const r = await upstream(url);
    if (r.status === 404) return bad(res, 404, "No player with that name on the hiscores");
    if (!r.ok) return bad(res, 502, `hiscores returned ${r.status}`);
    const data = await r.json();
    cache(res, 300);
    res.status(200).json({ player, skills: data.skills, activities: data.activities, fetched: Date.now() });
  } catch (e) {
    bad(res, 502, "hiscores unreachable: " + e.message);
  }
};
