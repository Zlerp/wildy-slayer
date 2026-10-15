// Tiny Supabase PostgREST client for the Wildy Slayer sync endpoint.
// Uses the service-role key from the Vercel env (never shipped to the browser);
// slayer_sync has row-level security on with no policies, so the anon key
// cannot read or write it directly. Same pattern as api/trader/_db.js.
const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function configured() { return !!(URL_ && KEY); }

async function rest(path, { method = "GET", body, prefer, headers = {} } = {}) {
  if (!configured()) throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not configured");
  const r = await fetch(`${URL_}/rest/v1/${path}`, {
    method,
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json", ...(prefer ? { Prefer: prefer } : {}), ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`db ${method} ${path.split("?")[0]} ${r.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

module.exports = { configured, rest };
