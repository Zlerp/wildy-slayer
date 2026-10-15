// Wildy Slayer <-> RuneLite sync. One row per pairing code; see
// wildy-slayer/runelite/PROTOCOL.md for the shapes.
//   GET  /api/slayer/sync/?code=XXXXXXXX[&v=<version>]
//   POST /api/slayer/sync/[?full=1]   { code, player?, selection?, setups? }
const DB = require("./_db.js");

const TABLE = "slayer_sync";
const COLS = "code,version,player,player_at,selection,selection_at,setups,setups_at";
const LIMITS = { player: 300_000, selection: 40_000, setups: 400_000 };
const MAX_SETUPS = 60;
const PRUNE_DAYS = 120;

function normCode(s) { return String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, ""); }
function validCode(c) { return /^[A-Z0-9]{8}$/.test(c); }
const ms = (iso) => (iso ? new Date(iso).getTime() : null);
const q = (s) => encodeURIComponent(s);

function nostore(res) { res.setHeader("Cache-Control", "no-store"); }
function send(res, code, body) { nostore(res); res.status(code).json(body); }
function fail(res, code, error) { send(res, code, { ok: false, error }); }

function shape(row, now) {
  if (!row) return { ok: true, version: 0, player: null, playerAt: null, selection: null, selectionAt: null, setups: [], setupsAt: null, now };
  return {
    ok: true, code: row.code, version: Number(row.version) || 0,
    player: row.player || null, playerAt: ms(row.player_at),
    selection: row.selection || null, selectionAt: ms(row.selection_at),
    setups: Array.isArray(row.setups) ? row.setups : [], setupsAt: ms(row.setups_at),
    now,
  };
}

async function read(code) {
  const rows = await DB.rest(`${TABLE}?code=eq.${q(code)}&select=${COLS}`);
  return rows && rows.length ? rows[0] : null;
}

// Merge the given parts into the row. PATCH only touches the columns we send,
// so the plugin writing `player` never clobbers the app writing `selection`.
async function write(code, parts, now) {
  const iso = new Date(now).toISOString();
  const patch = { version: now, updated_at: iso };
  if (parts.player !== undefined) { patch.player = parts.player; patch.player_at = iso; }
  if (parts.selection !== undefined) { patch.selection = parts.selection; patch.selection_at = iso; }
  if (parts.setups !== undefined) { patch.setups = parts.setups; patch.setups_at = iso; }
  const updated = await DB.rest(`${TABLE}?code=eq.${q(code)}&select=${COLS}`, { method: "PATCH", body: patch, prefer: "return=representation" });
  if (updated && updated.length) return updated[0];
  const inserted = await DB.rest(`${TABLE}?select=${COLS}`, { method: "POST", body: [{ code, created_at: iso, ...patch }], prefer: "resolution=merge-duplicates,return=representation" });
  return inserted && inserted.length ? inserted[0] : await read(code);
}

async function prune(now) {
  const cutoff = new Date(now - PRUNE_DAYS * 86400e3).toISOString();
  try { await DB.rest(`${TABLE}?updated_at=lt.${q(cutoff)}`, { method: "DELETE", prefer: "return=minimal" }); } catch (_) { /* best effort */ }
}

function sizeOf(v) { return Buffer.byteLength(JSON.stringify(v)); }

function parseBody(req) {
  const b = req.body;
  if (b == null || b === "") return {};
  if (typeof b === "string") { try { return JSON.parse(b); } catch (_) { return null; } }
  if (Buffer.isBuffer(b)) { try { return JSON.parse(b.toString("utf8")); } catch (_) { return null; } }
  return typeof b === "object" ? b : null;
}

module.exports = async (req, res) => {
  if (!DB.configured()) return fail(res, 503, "sync storage not configured");
  const now = Date.now();
  if (req.method === "GET") {
    const code = normCode(req.query.code);
    if (!validCode(code)) return fail(res, 400, "code must be 8 letters or digits");
    try {
      const row = await read(code);
      const version = row ? Number(row.version) || 0 : 0;
      const v = req.query.v != null && req.query.v !== "" ? Number(req.query.v) : null;
      if (v != null && v === version) return send(res, 200, { ok: true, version, unchanged: true, now });
      return send(res, 200, shape(row, now));
    } catch (e) { return fail(res, 502, "storage error: " + e.message); }
  }
  if (req.method === "POST") {
    const body = parseBody(req);
    if (!body) return fail(res, 400, "body must be JSON");
    const code = normCode(body.code || req.query.code);
    if (!validCode(code)) return fail(res, 400, "code must be 8 letters or digits");
    const parts = {};
    for (const part of ["player", "selection", "setups"]) {
      if (!(part in body)) continue;
      const v = body[part];
      if (part === "setups") {
        if (!Array.isArray(v)) return fail(res, 400, "setups must be an array");
        if (v.length > MAX_SETUPS) return fail(res, 413, `at most ${MAX_SETUPS} setups`);
      } else if (v !== null && (typeof v !== "object" || Array.isArray(v))) return fail(res, 400, `${part} must be an object or null`);
      if (v !== null && sizeOf(v) > LIMITS[part]) return fail(res, 413, `${part} too large`);
      parts[part] = v;
    }
    if (!Object.keys(parts).length) return fail(res, 400, "nothing to write: send player, selection or setups");
    try {
      const row = await write(code, parts, now);
      if (now % 100 === 0) await prune(now);
      if (req.query.full) return send(res, 200, shape(row, now));
      return send(res, 200, { ok: true, version: Number(row.version) || now, now });
    } catch (e) { return fail(res, 502, "storage error: " + e.message); }
  }
  res.setHeader("Allow", "GET, POST");
  return fail(res, 405, "GET or POST");
};
module.exports.normCode = normCode;
module.exports.validCode = validCode;
