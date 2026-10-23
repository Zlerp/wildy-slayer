/* Wildy Slayer: character lookup, task picker, gear recommender, supply calculator, saved setups,
   RuneLite sync. Plain JS, no build. Data: data.js (tasks), items.js (item stats + spells). Prices and
   images come through /api/slayer/* (Vercel functions that reach the OSRS Wiki); the RuneLite plugin
   and this page meet at /api/slayer/sync/ (shapes in runelite/PROTOCOL.md). */
(() => {
const { KIT } = window.WILDY;
const ITEMS = window.WILDY_ITEMS, SPELLS = window.WILDY_SPELLS;
/* Two task tables, one list. data.js: Krystilia's Wilderness tasks (ids = slug, unchanged so saved setups and the
   plugin's spot table keep working). slayer.js: every other master's tasks (ids = "slayer/" + slug; the plugin shows
   "-" for a task it does not know, which is fine: its spot table is Wilderness only). */
const MASTERS = (window.SLAYER?.MASTERS || []);
const MASTER = Object.fromEntries(MASTERS.map((m) => [m.id, m]));
const KRYS_IMPLIED = { dragon: { kind: "dragonfire", text: "Dragonfire hits up to 50 without an anti-dragon shield or antifire potion." } };
function normKrystilia(t) {
  const amount = t.amount, hazards = [{ kind: "pk", text: "Wilderness: player killers. Keep an escape ready, risk only what the tier allows." }];
  if (t.attr.includes("dragon")) hazards.push(KRYS_IMPLIED.dragon);
  if (/spider|Spindel|Venenatis/i.test(t.name + t.locations.map((l) => l.name).join(" "))) hazards.push({ kind: "poison", text: "Poison spiders and the spider bosses poison or venom you." });
  if (t.slug === "revenants") hazards.push({ kind: "magic", text: "Revenants hit with all three styles and are very accurate; a charged bracelet of ethereum cuts their damage by 75%." });
  const targets = t.targets.map((x) => ({ ...x, immune: {}, elem: null, poison: false, venom: false, attributes: t.attr }));
  const locations = t.locations.map((l) => ({ ...l, wildy: true, region: "Wilderness", masters: [] }));
  return { ...t, id: t.slug, master: "krystilia", krystilia: true, targets, locations, masters: { krystilia: { amount, extended: t.extended || null, weight: t.weight } }, hazards, need: [], bring: (t.gear || []).map((g) => ({ item: null, why: g })), mechanics: null, superior: null, combat: 0, verdictWhy: null };
}
function normGeneral(t) { return { ...t, id: "slayer/" + t.slug, master: null, krystilia: false, locations: t.locations.map((l) => ({ ...l, wildy: !!l.wildy })) }; }
const TASKS = [...window.WILDY.TASKS.map(normKrystilia), ...(window.SLAYER?.TASKS || []).map(normGeneral)];
const masterIds = (t) => Object.keys(t.masters);
const taskMasters = (t) => masterIds(t).map((id) => MASTER[id]?.name || id);
const API = "/api/slayer";
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const img = (name) => `${API}/img/?name=${encodeURIComponent(String(name).replace(/ /g, "_"))}`;
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
// server-supplied values are untrusted: num() yields a finite number or null, cnt() a list length or 0
const num = (v) => { const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN; return Number.isFinite(n) ? n : null; };
const cnt = (a) => (Array.isArray(a) ? a.length : 0);
const gp = (n) => n == null ? "—" : n >= 1e6 ? (n / 1e6).toFixed(n >= 1e7 ? 0 : 1) + "m" : n >= 1e4 ? Math.round(n / 1e3) + "k" : Math.round(n).toLocaleString();
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const SKILLS = ["attack", "strength", "defence", "ranged", "magic", "prayer", "hitpoints", "slayer", "agility"];
const SKILL_ICON = { attack: "Attack icon.png", strength: "Strength icon.png", defence: "Defence icon.png", ranged: "Ranged icon.png", magic: "Magic icon.png", prayer: "Prayer icon.png", hitpoints: "Hitpoints icon.png", slayer: "Slayer icon.png", agility: "Agility icon.png" };

/* ---------- state ---------- */
const S = {
  rsn: "", levels: { attack: 70, strength: 70, defence: 70, ranged: 70, magic: 70, prayer: 52, hitpoints: 70, slayer: 60, agility: 60 },
  master: "all", // "all" or a master id; filters the task list and picks which amounts/weights are shown
  task: null, loc: 0, target: null, style: null, tier: "mid", protect: true, cannon: false, offPray: true, pots: true, spell: null, amount: null,
  overrides: {}, // slot -> item name
  prices: {}, pricesAt: 0,
  filter: "all",
  useRl: true,   // adopt levels from the RuneLite plugin while paired
  ownOnly: null, // "Only gear I own"; null = not decided yet, becomes true the first time a bank syncs
};
try { Object.assign(S, JSON.parse(localStorage.getItem("wildy:state") || "{}"), { prices: {}, pricesAt: 0 }); } catch (_) {}
const persist = () => { try { localStorage.setItem("wildy:state", JSON.stringify({ rsn: S.rsn, levels: S.levels, master: S.master, task: S.task, loc: S.loc, target: S.target, style: S.style, tier: S.tier, protect: S.protect, cannon: S.cannon, offPray: S.offPray, pots: S.pots, spell: S.spell, amount: S.amount, overrides: S.overrides, useRl: S.useRl, ownOnly: S.ownOnly })); } catch (_) {} };
if (S.task && !TASKS.some((t) => t.id === S.task)) S.task = null;
if (S.master !== "all" && !MASTER[S.master] && S.master !== "krystilia") S.master = "all";
window.__wildy = {
  S, TASKS, MASTERS, ITEMS, calc: () => CALC, parseExport: (t) => parseExport(t), applyImport: (p) => applyImport(p),
  sync: () => ({ code: SYNC.code, version: SYNC.version, player: SYNC.player, selection: SYNC.selection, setups: setups(), lastPushed: SYNC.lastPushedSel, lastPushedAt: SYNC.lastPushedAt, error: SYNC.error, syncedAt: SYNC.syncedAt, appliedSelectionAt: SYNC.appliedSelectionAt, setupsWrote: SYNC.setupsWrote }),
  poll: () => poll(),
  pushNow: () => pushSelection(true),
};
let CALC = null;

/* ---------- combat level ---------- */
function combatLevel(l) {
  const base = 0.25 * (l.defence + l.hitpoints + Math.floor(l.prayer / 2));
  const melee = 0.325 * (l.attack + l.strength), range = 0.325 * Math.floor(1.5 * l.ranged), mage = 0.325 * Math.floor(1.5 * l.magic);
  return Math.floor(base + Math.max(melee, range, mage));
}

/* ---------- prices ---------- */
async function loadPrices() {
  try {
    const cached = JSON.parse(localStorage.getItem("wildy:prices") || "null");
    if (cached && Date.now() - cached.at < 10 * 60 * 1000) { S.prices = cached.prices; S.pricesAt = cached.at; return; }
  } catch (_) {}
  const ids = [...new Set(Object.values(ITEMS).map((i) => i.id).filter(Boolean))];
  const r = await fetch(`${API}/prices/?ids=${ids.join(",")}`);
  if (!r.ok) throw new Error("prices " + r.status);
  const d = await r.json();
  S.prices = {}; for (const [id, p] of Object.entries(d.prices)) S.prices[id] = p.high || p.low || 0;
  S.pricesAt = Date.now();
  try { localStorage.setItem("wildy:prices", JSON.stringify({ at: S.pricesAt, prices: S.prices })); } catch (_) {}
}
const price = (name) => { const it = ITEMS[name]; if (!it) return 0; if (!it.tradeable) return it.untrade || 0; return S.prices[it.id] || 0; };

/* ---------- hiscores ---------- */
async function lookup(name) {
  const msg = $("#lookup-msg");
  msg.textContent = "Looking up " + name + "…"; msg.className = "hint";
  try {
    const r = await fetch(`${API}/hiscore/?player=${encodeURIComponent(name)}`);
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || r.status);
    const by = {}; for (const s of d.skills) by[s.name.toLowerCase()] = Math.max(1, s.level);
    const unlocked = rlLevelsActive(); if (unlocked) S.useRl = false; // a lookup is an explicit choice: stop adopting RuneLite levels
    for (const k of SKILLS) if (by[k]) S.levels[k] = by[k];
    S.levels.hitpoints = Math.max(10, S.levels.hitpoints);
    S.rsn = name;
    msg.innerHTML = `<span class="ok">Loaded ${esc(name)} from the hiscores.</span>${unlocked ? ` <span class="muted">"Use RuneLite levels" is now off; tick it again to go back to the plugin's levels.</span>` : ""}`;
    persist(); renderStats(); renderLevels(); renderTasks(); renderAll(); if (unlocked) renderRl();
  } catch (e) {
    msg.innerHTML = `<span class="err">${esc(e.message)}.</span> Set your levels by hand below.`;
    $("#manual").open = true;
  }
}
function renderStats() {
  const l = S.levels;
  $("#stats").innerHTML = SKILLS.map((k) => `<span class="stat"><img src="${img(SKILL_ICON[k])}" alt="" />${k === "hitpoints" ? "HP" : k[0].toUpperCase() + k.slice(1, 3)} <b>${l[k]}</b></span>`).join("") + `<span class="stat cb">Combat <b>${combatLevel(l)}</b></span>`;
}
function renderLevels() {
  const box = $("#levels"), lock = rlLevelsActive();
  box.innerHTML = SKILLS.map((k) => `<label>${k}<input type="number" min="1" max="99" data-k="${k}" value="${S.levels[k]}"${lock ? " disabled" : ""} /></label>`).join("")
    + (lock ? `<p class="hint" style="grid-column:1/-1;margin:0">Levels come from RuneLite. Untick "Use RuneLite levels" to edit them by hand.</p>` : "");
  box.oninput = (e) => { const k = e.target.dataset.k; if (!k) return; S.levels[k] = clamp(parseInt(e.target.value, 10) || 1, 1, 99); persist(); renderStats(); renderMasters(); renderTasks(); renderAll(); };
}

/* ---------- tasks ---------- */
const task = () => TASKS.find((t) => t.id === S.task);
const hay = (t) => [t.name, t.attr.join(" "), t.style, t.verdict, t.krystilia ? "wilderness krystilia" : "", taskMasters(t).join(" "), t.locations.map((l) => l.name + " " + (l.region || "") + (l.multi ? " multi" : " single") + (l.cannon ? " cannon" : "")).join(" "), t.aoe ? "burst barrage aoe" : "", (t.hazards || []).map((h) => h.kind + " " + h.text).join(" "), (t.need || []).map((n) => n.item).join(" "), (t.bring || []).map((b) => b.item || b.why).join(" "), t.tips.join(" "), t.superior || ""].join(" ").toLowerCase();
// the task's amount range for the chosen master (or across every master that assigns it)
function amountFor(t, master = S.master) {
  const m = t.masters[master]; if (m?.amount) return m.amount;
  const all = Object.values(t.masters).map((x) => x.amount).filter(Boolean);
  if (!all.length) return t.amount || [1, 1];
  return [Math.min(...all.map((a) => a[0])), Math.max(...all.map((a) => a[1]))];
}
const masterOf = (t) => (S.master !== "all" && t.masters[S.master]) ? S.master : masterIds(t)[0];
const canGet = (m) => (!m.combat || combatLevel(S.levels) >= m.combat) && (!m.slayer || S.levels.slayer >= m.slayer);
function renderMasters() {
  const box = $("#master-chips"); if (!box) return;
  const order = ["all", ...MASTERS.map((m) => m.id)];
  box.innerHTML = order.map((id) => {
    if (id === "all") return `<button class="chip master" data-m="all" aria-pressed="${S.master === "all"}">All masters<small>${TASKS.length} tasks</small></button>`;
    const m = MASTER[id], n = TASKS.filter((t) => t.masters[id]).length, lock = !canGet(m);
    const req = [m.combat ? `${m.combat} cb` : "", m.slayer ? `${m.slayer} Slayer` : ""].filter(Boolean).join(", ") || "any level";
    return `<button class="chip master${lock ? " locked" : ""}" data-m="${id}" aria-pressed="${S.master === id}" title="${esc(m.where)}">${esc(m.name)}<small>${req} · ${m.points ? m.points + " pts" : "0 pts"} · ${n}</small></button>`;
  }).join("");
  $$("button", box).forEach((b) => b.addEventListener("click", () => { S.master = b.dataset.m; persist(); renderMasters(); renderTasks(); renderAll(); }));
  const note = $("#master-note"), m = MASTER[S.master];
  if (!m) note.innerHTML = `Every task from every master. Pick a master to see their amounts and weights; <b>Krystilia</b>'s tasks are the Wilderness ones.`;
  else note.innerHTML = `<b>${esc(m.name)}</b>${m.alt ? ` <span class="muted">(${esc(m.alt)})</span>` : ""}, ${esc(m.where)}. ${m.combat || m.slayer ? `Needs ${[m.combat ? m.combat + " combat" : "", m.slayer ? m.slayer + " Slayer" : ""].filter(Boolean).join(" and ")}${m.req ? " and " + esc(m.req) : ""}.` : m.req ? `Needs ${esc(m.req)}.` : "No requirements."} ${m.points} points a task, ${m.block} to block. <span class="muted">${esc(m.notes)} Get there: ${esc(m.tele)}.</span>${canGet(m) ? "" : ` <span class="err">Your levels are too low for this master.</span>`}`;
}
function renderTasks() {
  const q = ($("#task-q").value || "").toLowerCase().trim();
  const list = TASKS.filter((t) => {
    if (S.master !== "all" && !t.masters[S.master]) return false;
    if (q && !hay(t).includes(q)) return false;
    if (S.filter === "mine") return S.levels.slayer >= t.slayer && (!t.combat || combatLevel(S.levels) >= t.combat);
    if (S.filter === "do") return t.verdict === "do";
    if (S.filter === "block") return t.verdict !== "do";
    if (S.filter === "aoe") return t.aoe || t.locations.some((l) => l.cannon && l.multi);
    if (S.filter === "safe") return t.locations.some((l) => l.danger === 1 && !l.wildy);
    return true;
  }).sort((a, b) => a.name.localeCompare(b.name) || (a.krystilia ? 1 : -1));
  $("#task-grid").innerHTML = list.map((t) => {
    const locked = S.levels.slayer < t.slayer, amt = amountFor(t);
    return `<button class="task${locked ? " locked" : ""}" type="button" data-id="${esc(t.id)}" aria-pressed="${S.task === t.id}">
      ${t.krystilia ? `<span class="mk">Wildy</span>` : ""}<span class="v ${t.verdict}">${t.verdict === "do" ? "do" : t.verdict === "block" ? "block" : "skip"}</span>
      <img src="${img(t.image)}" alt="" loading="lazy" />
      <b>${esc(t.name)}</b>
      <small>${amt[0]}–${amt[1]}${t.slayer > 1 ? ` · ${t.slayer} Slayer` : ""}</small>
      <small>${t.locations[0].multi ? "Multi" : "Singles"}${t.locations.some((l) => l.cannon) ? " · Cannon" : ""}${(t.hazards || []).some((h) => h.kind === "poison" || h.kind === "venom") ? " · Poison" : ""}${(t.hazards || []).some((h) => h.kind === "dragonfire") ? " · Dragonfire" : ""}</small>
    </button>`;
  }).join("") || `<p class="hint">Nothing matches${S.master !== "all" ? ` for ${esc(MASTER[S.master]?.name || S.master)}` : ""}.</p>`;
  renderTaskBanner();
}
function pickTask(id, scroll = true) {
  if (S.task !== id) { S.task = id; S.loc = 0; S.target = null; S.overrides = {}; S.spell = null; S.amount = null; S.style = null; }
  persist(); renderTasks(); renderAll();
  if (scroll) $("#detail").scrollIntoView({ behavior: "smooth", block: "start" });
}

/* ---------- detail ---------- */
const HAZ = { poison: ["☠", "Poison"], venom: ["☠", "Venom"], dragonfire: ["🔥", "Dragonfire"], icebreath: ["❄", "Icy breath"], drain: ["⬇", "Stat drain"], prayer: ["⬇", "Prayer drain"], freeze: ["❄", "Freezes you"], teleport: ["✦", "Teleports you"], stun: ["✦", "Stuns"], magic: ["⚡", "Magic"], ranged: ["➶", "Ranged"], disease: ["☠", "Disease"], aggressive: ["‼", "Aggressive"], pk: ["⚔", "PKers"], special: ["✦", "Special"] };
// weakest sides of the target: lowest melee defence bonus, then how magic and ranged compare; plus the wiki's elemental weakness
function weaknesses(tg) {
  const melee = [["stab", tg.dstab], ["slash", tg.dslash], ["crush", tg.dcrush]].sort((a, b) => a[1] - b[1]);
  const sides = [["melee (" + melee[0][0] + ")", melee[0][1], "melee"], ["ranged", tg.drange, "ranged"], ["magic", tg.dmagic, "magic"]].sort((a, b) => a[1] - b[1]);
  return { melee, sides, elem: tg.elem || null, mageLvl: tg.mage, defLvl: tg.def };
}
const styleOf = (st) => String(st || "").toLowerCase();
function renderDetail() {
  const t = task(), box = $("#detail");
  if (!t) { box.classList.add("hidden"); return; }
  box.classList.remove("hidden");
  const loc = t.locations[S.loc] || t.locations[0];
  const tg = targetFor(t, loc);
  const m = masterOf(t), mm = t.masters[m] || {}, amt = amountFor(t, m);
  const w = weaknesses(tg);
  const yt = `https://www.youtube.com/results?search_query=${encodeURIComponent("osrs slayer " + t.name + " guide" + (t.krystilia ? " wilderness" : ""))}`;
  const wiki = `https://oldschool.runescape.wiki/w/${encodeURIComponent((tg.page || t.name).replace(/ /g, "_"))}`;
  const taskWiki = t.krystilia ? "https://oldschool.runescape.wiki/w/Krystilia/Strategies" : `https://oldschool.runescape.wiki/w/Slayer_task/${encodeURIComponent(t.name.replace(/ /g, "_"))}`;
  const attacks = styleOf(tg.style);
  const prot = /Protect/.test(t.pray);
  const helmWorn = !!CALC && CALC.t === t && Object.values(CALC.pick || {}).some((i) => i.tags.includes("helm"));
  const needRows = (t.need || []).map((n) => {
    const it = ITEMS[n.item];
    const covered = n.helm;
    return `<li class="need"><span class="ic">${it ? `<img src="${img(it.image)}" alt="" />` : "✓"}</span><div><b>Required: ${esc(n.item)}</b>${esc(n.why)}${covered ? `<small>A Slayer helmet covers this${helmWorn ? " (yours does)" : ""}.</small>` : ""}</div></li>`;
  });
  const bringRows = (t.bring || []).map((b) => { const it = b.item ? ITEMS[b.item] : null; return `<li class="info"><span class="ic">${it ? `<img src="${img(it.image)}" alt="" />` : "•"}</span><div>${b.item ? `<b>${esc(b.item)}</b>` : ""}${esc(b.why)}</div></li>`; });
  const hazRows = (t.hazards || []).map((h) => { const [ic, label] = HAZ[h.kind] || HAZ.special; return `<li><span class="ic">${ic}</span><div><b>${label}</b>${esc(h.text)}</div></li>`; });
  const poisonRow = tg.venom ? `<li><span class="ic">☠</span><div><b>Venom</b>${esc(tg.poisonNote || "Their hits can venom you")}: bring anti-venom, or wear a serpentine helm.</div></li>` : tg.poison && !(t.hazards || []).some((h) => h.kind === "poison") ? `<li><span class="ic">☠</span><div><b>Poison</b>${esc(tg.poisonNote || "Their hits can poison you")}: an antidote++ or anti-venom.</div></li>` : "";
  const immune = [tg.immune?.poison ? "immune to poison" : "", tg.immune?.venom ? "immune to venom" : "", tg.immune?.cannon ? "cannot be cannoned" : "", tg.immune?.thrall ? "thralls do nothing" : ""].filter(Boolean);
  const amounts = Object.entries(t.masters).map(([id, x]) => `<span class="${id === m ? "on" : ""}"><b>${esc(MASTER[id]?.name || id)}</b> ${x.amount ? x.amount[0] + "–" + x.amount[1] : "?"}${x.extended ? ` <span class="muted">(${x.extended[0]}–${x.extended[1]} ext.)</span>` : ""}${x.weight ? ` · w${x.weight}` : ""}</span>`).join("");
  box.innerHTML = `
    <h2 style="font-size:13px;color:var(--muted);letter-spacing:.1em;text-transform:uppercase">3. Where and how</h2>
    <div class="monster">
      <img src="${img(tg.image)}" alt="${esc(tg.name)}" />
      <div>
        <h2>${esc(t.name)}${t.krystilia ? ` <span class="badge warn">Wilderness</span>` : ""}</h2>
        <div class="badges">
          <span class="badge">${amt[0]}–${amt[1]} from ${esc(MASTER[m]?.name || m)}</span>
          <span class="badge ${t.verdict === "do" ? "good" : t.verdict === "block" ? "bad" : "warn"}">${t.verdict === "do" ? "Worth doing" : t.verdict === "block" ? "Usually blocked" : "Skip unless keen"}</span>
          ${mm.weight ? `<span class="badge">Weight ${mm.weight}</span>` : ""}
          ${t.slayer > 1 ? `<span class="badge ${S.levels.slayer >= t.slayer ? "good" : "bad"}">${t.slayer} Slayer</span>` : ""}
          ${t.combat ? `<span class="badge ${combatLevel(S.levels) >= t.combat ? "good" : "bad"}">${t.combat} Combat</span>` : ""}
          ${t.attr.map((a) => `<span class="badge info">${esc(a)}</span>`).join("")}
          ${t.superior ? `<span class="badge">Superior: ${esc(t.superior)}</span>` : ""}
        </div>
        ${t.unlock ? `<p class="hint">${esc(t.unlock)}</p>` : ""}
        ${t.verdictWhy ? `<p class="hint">${esc(t.verdictWhy)}</p>` : ""}
      </div>
    </div>
    ${Object.keys(t.masters).length > 1 ? `<div class="amounts">${amounts}</div>` : ""}
    ${t.targets.length > 1 ? `<div class="amounts targets">${t.targets.map((x, i) => `<button type="button" class="tgt${x === tg ? " on" : ""}" data-i="${i}">${esc(x.name)}${x.loc ? ` <span class="muted">${esc(x.loc)}</span>` : ""}</button>`).join("")}</div>` : ""}
    <div class="kv">
      <div><span>Target</span>${esc(tg.name)}</div>
      <div><span>Combat</span>${tg.cb}</div>
      <div><span>Hitpoints</span>${tg.hp}</div>
      <div><span>Defence</span>${tg.def}${tg.mage ? ` <span class="muted" style="display:inline;text-transform:none;letter-spacing:0">· Magic ${tg.mage}</span>` : ""}</div>
      <div><span>Def bonuses</span>stab ${tg.dstab} · slash ${tg.dslash} · crush ${tg.dcrush}<br/>magic ${tg.dmagic} · range ${tg.drange}</div>
      <div><span>Attacks with</span>${esc(tg.style)} · max ${tg.maxhit}${tg.breath ? ` (${tg.breath} breath)` : ""}</div>
      <div><span>Pray</span>${esc(t.pray)}</div>
      <div><span>Size</span>${tg.size}x${tg.size}${tg.size === 1 ? " (stacks for AoE)" : ""}</div>
    </div>
    <h3>Weak to</h3>
    <div class="weak">
      ${w.elem ? `<div class="hot"><span>Elemental weakness</span><b>${esc(w.elem.type)} spells</b><br/>+${w.elem.pct}% accuracy and damage with ${esc(w.elem.type)} spells (${w.elem.type === "Water" ? "Water and Ice" : w.elem.type === "Fire" ? "Fire and Smoke" : w.elem.type === "Earth" ? "Earth and Blood" : "Air and Shadow"}).</div>` : `<div><span>Elemental weakness</span><b>None</b><br/>No spell element gets a bonus.</div>`}
      <div class="hot"><span>Lowest defence</span><b>${esc(w.sides[0][0])}</b><br/>${w.sides.map((x) => `${esc(x[0])} ${x[1]}`).join(" · ")}</div>
      <div class="${w.melee[0][1] <= 0 ? "hot" : ""}"><span>Melee side</span><b>${esc(w.melee[0][0])} (${w.melee[0][1]})</b><br/>vs ${w.melee[1][0]} ${w.melee[1][1]}, ${w.melee[2][0]} ${w.melee[2][1]}</div>
      <div class="${tg.mage <= 1 && tg.dmagic <= 0 ? "hot" : tg.dmagic >= 100 ? "bad" : ""}"><span>Magic</span><b>${tg.mage <= 1 && tg.dmagic <= 0 ? "Very weak" : tg.dmagic >= 100 ? "Resists magic" : "Normal"}</b><br/>Magic level ${tg.mage}, magic defence ${tg.dmagic}</div>
      ${immune.length ? `<div class="bad"><span>Immune</span><b>${esc(immune.join(", "))}</b></div>` : ""}
    </div>
    <p><b>Best style: ${t.style}.</b> <span class="muted">${esc(t.styleWhy)}</span></p>
    <h3>What they do to you</h3>
    <ul class="haz">
      <li class="${prot ? "ok" : "info"}"><span class="ic">${prot ? "🛡" : "•"}</span><div><b>${esc(t.pray)}</b>They attack with ${esc(attacks)}, max hit ${tg.maxhit}${tg.breath ? `, breath ${tg.breath}` : ""}${/melee/.test(attacks) && !/magic|ranged|dragonfire|breath|\+/.test(attacks) ? ". Protect from Melee blocks all of it." : ""}</div></li>
      ${hazRows.join("")}${poisonRow}
      ${!hazRows.length && !poisonRow ? `<li class="ok"><span class="ic">✓</span><div><b>Nothing special</b>No poison, venom, dragonfire or drains.</div></li>` : ""}
    </ul>
    ${needRows.length || bringRows.length ? `<h3>What you need</h3><ul class="haz">${needRows.join("")}${bringRows.join("")}</ul>` : ""}
    ${t.mechanics ? `<div class="mech"><b>What to do:</b> ${esc(t.mechanics)}</div>` : ""}
    <h3>Spots</h3>
    <div class="locs">${t.locations.map((l, i) => `
      <button class="loc" type="button" data-i="${i}" aria-pressed="${i === S.loc}">
        <div>
          <b>${esc(l.name)}</b>${l.region && !l.wildy ? `<span class="region">${esc(l.region)}</span>` : ""}
          <div class="flags">
            <span class="badge ${l.multi ? "warn" : "good"}">${l.multi ? "Multi-combat" : "Single-way"}</span>
            <span class="badge ${l.cannon ? "good" : "bad"}">${l.cannon ? "Cannon OK" : "No cannon"}</span>
            ${l.wildy ? `<span class="badge warn">Wilderness</span>` : ""}
            ${l.task_only ? `<span class="badge info">Task only</span>` : ""}${l.boss ? `<span class="badge info">Boss</span>` : ""}
            ${(l.masters || []).includes("konar") ? `<span class="badge konar">Konar sends you here</span>` : ""}
            <span class="badge">Danger <span class="danger">${"●".repeat(l.danger)}${"○".repeat(3 - l.danger)}</span></span>
          </div>
          <p><b>Get there:</b> ${esc(l.tele)}</p>
          <p>${esc(l.notes)}</p>
        </div>
        ${l.wildy ? `<div class="wl">${esc(l.wildy === true ? l.wildyLevel || l.wildy : l.wildy)}<small>wildy</small></div>` : ""}
      </button>`).join("")}</div>
    ${S.master === "konar" && !t.krystilia && !(loc.masters || []).includes("konar") ? `<p class="hint err">Konar does not assign this spot. Pick one marked "Konar sends you here" for her task.</p>` : ""}
    <h3>Tips</h3>
    <ul class="tips">${t.tips.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>
    <div class="links">
      <a class="btn" href="${yt}" target="_blank" rel="noopener">▶ Watch a guide on YouTube</a>
      <a class="btn" href="${wiki}" target="_blank" rel="noopener">Wiki: ${esc(tg.page || t.name)}</a>
      <a class="btn" href="${taskWiki}" target="_blank" rel="noopener">${t.krystilia ? "Krystilia strategies" : "Wiki: the task"}</a>
    </div>`;
  $$(".loc", box).forEach((b) => b.addEventListener("click", () => { S.loc = +b.dataset.i; S.target = null; S.overrides = {}; persist(); renderAll(); }));
  $$(".tgt", box).forEach((b) => b.addEventListener("click", () => { S.target = +b.dataset.i; S.overrides = {}; persist(); renderAll(); }));
}
// the monster variant for a spot: the user's pick, else the main (non-alt) variant tied to the spot, else the general one
function targetFor(t, loc) {
  if (S.target != null && t.targets[S.target]) return t.targets[S.target];
  const at = (x) => x.loc && loc.name.toLowerCase().includes(x.loc.split(" / ")[0].toLowerCase());
  return t.targets.find((x) => at(x) && !x.alt) || t.targets.find((x) => !x.loc && !x.alt) || t.targets.find(at) || t.targets[0];
}

/* ---------- gear engine ---------- */
const SLOTS = ["head", "cape", "neck", "ammo", "weapon", "body", "shield", "legs", "hands", "feet", "ring"];
const WEAPON_AMMO = { "Magic shortbow": "arrow", "Magic shortbow (i)": "arrow", "Dark bow": "arrow", "Rune crossbow": "bolt", "Dragon crossbow": "bolt", "Dragon hunter crossbow": "bolt", "Karil's crossbow": "rack", "Toxic blowpipe": "dart", "Craw's bow": "none", "Webweaver bow": "none", "Venator bow": "none" };
const AMMO_KIND = (n) => /arrow/.test(n) ? "arrow" : /bolt rack/i.test(n) ? "rack" : /bolt/.test(n) ? "bolt" : /dart/.test(n) ? "dart" : "blessing";
const BOLT_MAX = { "Rune crossbow": ["Broad bolts", "Adamant bolts", "Runite bolts", "Diamond bolts (e)", "Ruby bolts (e)"], "Dragon crossbow": ["Broad bolts", "Adamant bolts", "Runite bolts", "Diamond bolts (e)", "Ruby bolts (e)", "Dragon bolts"], "Dragon hunter crossbow": ["Broad bolts", "Adamant bolts", "Runite bolts", "Diamond bolts (e)", "Ruby bolts (e)", "Dragon bolts"], "Armadyl crossbow": ["Broad bolts", "Adamant bolts", "Runite bolts", "Diamond bolts (e)", "Ruby bolts (e)", "Dragon bolts"] };
Object.assign(WEAPON_AMMO, { "Armadyl crossbow": "bolt", "Twisted bow": "arrow" });
function meets(it, l) { const r = it.req || {}; return (!r.att || l.attack >= r.att) && (!r.str || l.strength >= r.str) && (!r.def || l.defence >= r.def) && (!r.ran || l.ranged >= r.ran) && (!r.mag || l.magic >= r.mag) && (!r.pra || l.prayer >= r.pra) && (!r.sla || l.slayer >= r.sla) && (!r.hp || l.hitpoints >= r.hp); }
function attBest(st) { return Math.max(st.astab, st.aslash, st.acrush); }
function styleKey(style, st) { return style === "melee" ? attBest(st) : style === "ranged" ? st.arange : st.amagic; }
function score(it, style, ctx) {
  const st = it.stats || {}; let s = 0;
  // Wilderness: mostly magic defence (PKers freeze and teleblock you). Elsewhere: defence against what the monster actually attacks with.
  const ts = styleOf(ctx.tg?.style);
  const defv = ctx.wildy ? (st.dmagic * 0.6 + st.drange * 0.2 + st.dslash * 0.2) * 0.12
    : ((/magic/.test(ts) ? st.dmagic : 0) * 0.5 + (/ranged/.test(ts) ? st.drange : 0) * 0.5 + (/melee|stab|slash|crush/.test(ts) || !ts ? (st.dstab + st.dslash + st.dcrush) / 3 : 0) * 0.5) * 0.08;
  // melee: the item's best attack style against THIS target (its bonus minus the monster's defence on that side), so a stab
  // weapon beats a slash one on dragons and a crush one wins on gargoyles
  const tgd = ctx.tg || {};
  const attVs = ctx.tg ? Math.max(st.astab - (tgd.dstab || 0), st.aslash - (tgd.dslash || 0), st.acrush - (tgd.dcrush || 0)) : attBest(st);
  if (style === "melee") s = st.str * 10 + attVs * 4;
  else if (style === "ranged") s = st.rstr * 10 + st.arange * 4;
  else s = (st.mdmg || 0) * 25 + st.amagic * 4;
  if ((it.slot === "weapon" || it.slot === "2h") && it.speed && style !== "magic") s *= 4 / Math.max(2, style === "ranged" ? it.speed - 1 : it.speed); // a slow weapon is worth less: dark bow, 2h swords
  s += (st.prayer || 0) * 1.5 + defv;
  if (it.bonus) {
    const b = it.bonus;
    const mult = (b[style] || 1) * ((ctx.attr.includes("undead") && b.undead?.[style]) || 1) * ((ctx.attr.includes("demon") && b.demon?.[style]) || 1) * ((ctx.attr.includes("dragon") && b.dragon?.[style]) || 1) * ((ctx.wildy && b.wildy?.[style]) || 1) * ((ctx.multi && b.multi?.[style]) || 1);
    if (mult > 1) s += 120 * (mult - 1) * (it.slot === "weapon" || it.slot === "2h" ? 3 : 1);
  }
  if (it.tags.includes("powered") && style === "magic") s += 60 + (it.name.includes("Accursed") ? 70 : it.name.includes("Thammaron") ? 20 : it.name.includes("Swamp") ? 25 : 0);
  if (it.tags.includes("firestaff") && style === "magic") s += 10;
  if (style === "magic" && ctx.tg?.elem && it.tags.includes(ctx.tg.elem.type.toLowerCase() + "staff") && S.levels.magic >= 47) s += ctx.tg.elem.pct * 1.5; // elemental weakness: the matching staff beats a trident when the weakness is big
  if (it.tags.includes("iban") && style === "magic") s += 45;
  if (it.name.includes("Smoke battlestaff")) s += 15;
  if (ctx.fire && it.tags.includes("dragon")) s += 80;           // dragonfire: anti-dragon / dragonfire / wyvern shields
  if (ctx.ice && it.tags.includes("wyvern")) s += 120;           // icy breath: elemental, mind, DFS or ancient wyvern shield
  if (ctx.venom && it.tags.includes("venom")) s += 60;           // serpentine helm: immune to venom
  if (ctx.task.slug === "revenants" && it.tags.includes("revenant")) s += 150;
  if (ctx.req?.names.has(it.name) || (ctx.req?.helmOk && it.tags.includes("helm"))) s += 400; // a required item always wins its slot (a Slayer helmet counts for the head one)
  if (it.tags.includes("dragon") && !ctx.fire && !ctx.ice) s -= 50;
  if (it.tags.includes("wildy") && !ctx.wildy) s -= 30;         // Wilderness weapons lose their 50% outside it
  return s;
}
// equipment the task makes mandatory (need[] entries that are wearable). helm: a Slayer helmet satisfies the head item.
function requiredEquipment(t) {
  const bySlot = {}, names = new Set(); let helmOk = false;
  for (const n of t.need || []) {
    const it = ITEMS[n.item]; if (!it || !it.stats) continue;
    const slot = it.slot === "2h" ? "weapon" : it.slot;
    names.add(it.name);
    if (slot === "weapon" || slot === "ammo") continue;           // a required weapon (leaf-bladed, Wolfbane) only matters for its own style; candidates() handles those
    (bySlot[slot] = bySlot[slot] || new Set()).add(it.name);
    if (slot === "head" && n.helm) helmOk = true;
    if (it.name === "Mirror shield") { bySlot.shield.add("V's shield"); names.add("V's shield"); }
  }
  return { bySlot, names, helmOk };
}
function candidates(slot, style, ctx) {
  const l = S.levels;
  return Object.values(ITEMS).filter((it) => {
    if (!it.stats) return false;
    const sl = it.slot === "2h" ? "weapon" : it.slot;
    if (sl !== slot) return false;
    if (!it.styles.includes(style)) return false;
    if (it.tags.includes("ammo") || it.tags.includes("dart") || it.tags.includes("blessing") || it.tags.includes("util") || it.tags.includes("teleport") || it.tags.includes("escape")) return slot === "ammo";
    if (it.tags.includes("revenant") && ctx.task.slug !== "revenants") return false;
    if (it.name.includes("Salve") && !ctx.attr.includes("undead")) return false;
    if (it.name === "Amulet of avarice") return false;
    if (it.tags.includes("dragon") && !it.tags.includes("wyvern") && !ctx.fire) return false;   // anti-dragon / dragonfire shield only vs dragonfire
    if (it.tags.includes("wyvern") && !ctx.ice && !ctx.fire) return false;
    const req = ctx.req || { bySlot: {}, names: new Set() };
    if (it.tags.includes("slayerreq") && !req.names.has(it.name)) return false;                 // nose pegs and co. only when the task needs them
    if (it.tags.includes("vampyre") && !ctx.attr.includes("vampyre")) return false;
    if (req.bySlot[slot] && !req.bySlot[slot].has(it.name) && !(slot === "head" && req.helmOk && it.tags.includes("helm"))) return false;
    if (slot === "weapon" && req.bySlot.shield && it.slot === "2h") return false;               // a required shield rules out two-handers
    if (ctx.attr.includes("leafy")) {                                                             // turoth and kurask: leaf-bladed, broad ammo or Magic Dart only
      if (slot === "weapon" && style === "melee" && !it.tags.includes("leafy")) return false;
      if (slot === "weapon" && style === "ranged" && !["arrow", "bolt"].includes(WEAPON_AMMO[it.name] || "none")) return false;
      if (slot === "weapon" && style === "magic" && !it.tags.includes("slayerstaff")) return false;
      if (slot === "ammo" && !it.tags.includes("blessing") && !/^Broad/.test(it.name)) return false;
    }
    if (ctx.attr.includes("vampyre") && slot === "weapon" && style === "melee" && !it.tags.includes("vampyre")) return false;
    if (slot !== "ammo" && ownOnlyActive() && !owns(it)) return false; // ammo is bought, so it is never filtered, only marked
    return meets(it, l);
  });
}
function ammoFor(weapon, style, ctx) {
  if (style !== "ranged" || !weapon) return candidates("ammo", style, ctx).filter((a) => a.tags.includes("blessing"));
  const kind = WEAPON_AMMO[weapon.name] || "none";
  if (kind === "none") return candidates("ammo", style, ctx).filter((a) => a.tags.includes("blessing"));
  return candidates("ammo", style, ctx).filter((a) => AMMO_KIND(a.name) === kind && (kind !== "bolt" || (BOLT_MAX[weapon.name] || []).includes(a.name)));
}
const TIER_CAP = { budget: 150e3, mid: 750e3, high: 3e6, max: Infinity };
const TIER_TOTAL = { budget: 600e3, mid: 5e6, high: 30e6, max: Infinity };
function buildGear(style, ctx, overrides = S.overrides) {
  const cap = ctx.wildy ? (TIER_CAP[S.tier] ?? Infinity) : Infinity, capTotal = TIER_TOTAL[S.tier] ?? Infinity;
  const keep = ctx.wildy ? (S.protect ? 4 : 3) : 0;
  const pick = {};
  const pool = {};
  for (const slot of SLOTS) { if (slot === "ammo" || slot === "shield") continue; pool[slot] = candidates(slot, style, ctx).sort((a, b) => score(b, style, ctx) - score(a, style, ctx)); }
  // start cheapest viable per slot (by risk value)
  for (const slot of Object.keys(pool)) { const c = pool[slot]; if (!c.length) continue; pick[slot] = c.slice().sort((a, b) => price(a.name) - price(b.name) || score(b, style, ctx) - score(a, style, ctx))[0]; }
  const riskOf = (p) => { const vals = Object.values(p).map((i) => price(i.name)).sort((a, b) => b - a); return vals.slice(keep).reduce((s, v) => s + v, 0); };
  const totalOf = (p) => Object.values(p).reduce((s, i) => s + price(i.name), 0);
  // greedy upgrades: best score gain per gp of added risk, within the cap
  for (let iter = 0; iter < 60; iter++) {
    let best = null;
    for (const slot of Object.keys(pool)) {
      const cur = pick[slot]; if (!cur) continue;
      const cs = score(cur, style, ctx), baseRisk = riskOf(pick);
      for (const c of pool[slot]) {
        if (c === cur) continue;
        const gain = score(c, style, ctx) - cs; if (gain <= 0) continue;
        const trial = { ...pick, [slot]: c }; const r = riskOf(trial);
        if (r > cap || totalOf(trial) > capTotal) continue;
        const dr = Math.max(0, r - baseRisk);
        const eff = gain / (1 + dr / 20000);
        if (!best || eff > best.eff) best = { slot, c, eff };
      }
    }
    if (!best) break;
    pick[best.slot] = best.c;
  }
  // overrides
  for (const [slot, name] of Object.entries(overrides)) { if (name === "") delete pick[slot]; else if (ITEMS[name]) pick[slot] = ITEMS[name]; }
  // shield only with a one-handed weapon
  if (pick.weapon && pick.weapon.slot === "2h") delete pick.shield;
  else if (!overrides.shield) { const sh = candidates("shield", style, ctx).sort((a, b) => score(b, style, ctx) - score(a, style, ctx)).filter((s) => (riskOf({ ...pick, shield: s }) <= cap && totalOf({ ...pick, shield: s }) <= capTotal) || price(s.name) === 0); if (sh[0]) pick.shield = sh[0]; }
  if (overrides.shield && ITEMS[overrides.shield] && pick.weapon?.slot !== "2h") pick.shield = ITEMS[overrides.shield];
  // ammo
  if (!overrides.ammo) { const am = ammoFor(pick.weapon, style, ctx).sort((a, b) => score(b, style, ctx) - score(a, style, ctx)); if (am[0]) pick.ammo = am[0]; }
  else if (ITEMS[overrides.ammo]) pick.ammo = ITEMS[overrides.ammo];
  return { pick, pool, risk: riskOf(pick), keep };
}

/* ---------- combat maths ---------- */
function sumStats(pick) { const o = { astab: 0, aslash: 0, acrush: 0, amagic: 0, arange: 0, dstab: 0, dslash: 0, dcrush: 0, dmagic: 0, drange: 0, str: 0, rstr: 0, mdmg: 0, prayer: 0 }; for (const it of Object.values(pick)) for (const k in o) o[k] += (it.stats?.[k] || 0); return o; }
function accuracy(atk, def) { return atk > def ? 1 - (def + 2) / (2 * (atk + 1)) : atk / (2 * (def + 1)); }
function bestPrayer(style, lvl) {
  if (style === "melee") return lvl >= 70 ? { name: "Piety", acc: 1.2, dmg: 1.23, drain: 40 } : lvl >= 60 ? { name: "Chivalry", acc: 1.15, dmg: 1.18, drain: 24 } : lvl >= 34 ? { name: "Ultimate Strength + Incredible Reflexes", acc: 1.15, dmg: 1.15, drain: 40 } : lvl >= 31 ? { name: "Ultimate Strength", acc: 1, dmg: 1.15, drain: 20 } : null;
  if (style === "ranged") return lvl >= 74 ? { name: "Rigour", acc: 1.2, dmg: 1.23, drain: 40 } : lvl >= 44 ? { name: "Eagle Eye", acc: 1.15, dmg: 1.15, drain: 20 } : lvl >= 26 ? { name: "Hawk Eye", acc: 1.1, dmg: 1.1, drain: 10 } : null;
  return lvl >= 77 ? { name: "Augury", acc: 1.25, dmg: 1, drain: 40 } : lvl >= 45 ? { name: "Mystic Might", acc: 1.15, dmg: 1, drain: 20 } : lvl >= 27 ? { name: "Mystic Lore", acc: 1.1, dmg: 1, drain: 10 } : null;
}
function spellOptions(pick, ctx) {
  const w = pick.weapon, l = S.levels;
  const leafy = ctx.attr.includes("leafy");
  if (w?.tags.includes("powered") && !leafy) {
    const base = Math.floor(l.magic / 3) - (w.name.includes("Swamp") ? 2 : w.name.includes("Seas") ? 5 : w.name.includes("Accursed") || w.name.includes("Sanguinesti") ? 1 : 8);
    return [{ name: w.name + " (built-in)", max: Math.max(1, base), cost: {}, speed: 4, aoe: false, wildy: w.tags.includes("wildy"), elem: null }];
  }
  const weak = ctx.tg?.elem || null;
  const out = [];
  for (const [name, sp] of Object.entries(SPELLS)) {
    if (l.magic < sp.level) continue;
    if (name === "Iban Blast" && !w?.tags.includes("iban")) continue;
    if (name === "Crumble Undead" && !ctx.attr.includes("undead")) continue;
    if (sp.needs && !w?.tags.includes(sp.needs)) continue;
    if (leafy && name !== "Magic Dart") continue;
    const aoe = sp.book === "Ancient" && /Burst|Barrage/.test(name);
    const max = sp.dynamic === "dart" ? 10 + Math.floor(l.magic / 10) : sp.damage;
    const bonus = weak && sp.elem === weak.type ? weak.pct / 100 : 0;
    out.push({ name, max, cost: sp.cost, speed: 5, aoe, book: sp.book, level: sp.level, elem: sp.elem || null, bonus, eff: max * (1 + bonus) * (aoe && ctx.multi && ctx.tg?.size === 1 ? 2.5 : 1) });
  }
  return out.sort((a, b) => b.eff - a.eff);
}
// compute(style, opts): the full loadout + maths for one style. Default style is S.style || the task's.
// opts.strict: return { ok: false, why } instead of falling back when the style is not viable (used by the comparison strip).
// opts.overrides: slot overrides to apply (default S.overrides; the strip passes {} so another style's picks are not forced).
function compute(styleArg, opts = {}) {
  const t = task(); if (!t) return null;
  const loc = t.locations[S.loc] || t.locations[0];
  const tg = targetFor(t, loc);
  const ts = styleOf(tg.style), hz = (t.hazards || []).map((h) => h.kind);
  const ctx = { task: t, attr: t.attr, multi: loc.multi, wildy: !!loc.wildy, tg, fire: /dragonfire/.test(ts) || hz.includes("dragonfire"), ice: /icebreath/.test(ts) || hz.includes("icebreath"), venom: !!tg.venom || hz.includes("venom"), poison: !!tg.poison || hz.includes("poison"), req: requiredEquipment(t) };
  const own = ownOnlyActive();
  const viable = { melee: candidates("weapon", "melee", ctx).length > 0, ranged: candidates("weapon", "ranged", ctx).length > 0 && S.levels.ranged >= 30, magic: S.levels.magic >= 13 };
  const whyNot = (s) => s === "magic" ? "Needs 13 Magic" : s === "ranged" && S.levels.ranged < 30 ? "Needs 30 Ranged" : `No ${s} weapon ${own ? "in your bank" : "for your levels"}`;
  let style = styleArg || S.style || t.style, fallback = null;
  if (!viable[style]) {
    if (opts.strict) return { ok: false, t, loc, tg, style, viable, why: whyNot(style) };
    const l = S.levels; const order = [["melee", l.attack + l.strength], ["ranged", l.ranged * 2], ["magic", l.magic * 2]].filter((x) => viable[x[0]]).sort((a, b) => b[1] - a[1]); if (order.length) { fallback = style; style = order[0][0]; }
  }
  const gear = buildGear(style, ctx, opts.overrides || S.overrides);
  const pick = gear.pick, st = sumStats(pick), l = S.levels;
  let label = "";
  const pray = S.offPray ? bestPrayer(style, l.prayer) : null;
  const onTask = Object.values(pick).some((i) => i.tags.includes("slayer"));
  const helmMult = onTask ? (style === "melee" ? 7 / 6 : 1.15) : 1;
  const salve = Object.values(pick).find((i) => i.name.includes("Salve"));
  const salveMult = salve && t.attr.includes("undead") ? 1.2 : 1;
  const specialMult = Math.max(helmMult, salveMult);
  const wildyW = ctx.wildy && Object.values(pick).find((i) => i.tags.includes("wildy"));
  const demonbane = Object.values(pick).find((i) => i.tags.includes("demonbane")) && t.attr.includes("demon");
  const dragonbane = Object.values(pick).find((i) => i.tags.includes("dragonbane")) && t.attr.includes("dragon");
  const dragonMult = dragonbane ? (pick.weapon?.bonus?.dragon?.[style] || 1) : 1;
  let maxHit = 0, atkRoll = 0, defRoll = 0, speed = 4, spell = null, aoeTargets = 1;
  if (style === "melee") {
    const boost = S.pots ? Math.floor(5 + l.strength * 0.15) : 0, boostA = S.pots ? Math.floor(5 + l.attack * 0.15) : 0;
    const effStr = Math.floor((l.strength + boost) * (pray?.dmg || 1)) + 3 + 8;
    const effAtt = Math.floor((l.attack + boostA) * (pray?.acc || 1)) + 8;
    maxHit = Math.floor(0.5 + effStr * (st.str + 64) / 640);
    maxHit = Math.floor(maxHit * specialMult); if (wildyW) maxHit = Math.floor(maxHit * 1.5); if (demonbane) maxHit = Math.floor(maxHit * 1.7); if (dragonMult > 1) maxHit = Math.floor(maxHit * dragonMult);
    const bonus = { stab: st.astab, slash: st.aslash, crush: st.acrush };
    const best = Object.entries(bonus).sort((a, b) => (b[1] - tg["d" + b[0]]) - (a[1] - tg["d" + a[0]]))[0];
    atkRoll = Math.floor(effAtt * (best[1] + 64) * specialMult * (wildyW ? 1.5 : 1) * (demonbane ? 1.7 : 1) * dragonMult);
    defRoll = (tg.def + 9) * (tg["d" + best[0]] + 64);
    speed = pick.weapon?.speed || 4;
    label = best[0];
  } else if (style === "ranged") {
    const boost = S.pots ? Math.floor(4 + l.ranged * 0.10) : 0;
    const eff = Math.floor((l.ranged + boost) * (pray?.dmg || 1)) + 8;
    const effA = Math.floor((l.ranged + boost) * (pray?.acc || 1)) + 8;
    maxHit = Math.floor(0.5 + eff * (st.rstr + 64) / 640);
    maxHit = Math.floor(maxHit * specialMult); if (wildyW) maxHit = Math.floor(maxHit * 1.5); if (dragonMult > 1) maxHit = Math.floor(maxHit * dragonMult);
    atkRoll = Math.floor(effA * (st.arange + 64) * specialMult * (wildyW ? 1.5 : 1) * (dragonMult > 1 ? dragonMult + 0.05 : 1));
    if (pick.weapon?.name === "Twisted bow") { const mg = Math.min(250, tg.mage || 1); maxHit = Math.floor(maxHit * Math.min(2.5, Math.max(0.5, (250 + (3 * mg - 14) / 100 - Math.pow((3 * mg / 10 - 140), 2) / 100) / 100))); } // tbow scaling (wiki formula, capped)
    defRoll = (tg.def + 9) * (tg.drange + 64);
    speed = (pick.weapon?.speed || 5) - 1; // rapid
    if (pick.weapon?.name === "Webweaver bow") maxHit = Math.floor(maxHit * 1.1); // multi-hit spec-less approximation
    if (pick.weapon?.name === "Venator bow" && loc.multi && tg.size <= 2) aoeTargets = 2.2;
    label = "ranged";
  } else {
    const boost = S.pots ? 4 : 0;
    const opts = spellOptions(pick, ctx);
    spell = opts.find((o) => o.name === S.spell) || opts[0];
    const effA = Math.floor((l.magic + boost) * (pray?.acc || 1)) + 8;
    const mdmg = (st.mdmg || 0) / 100 + (pick.weapon?.name === "Staff of the Dead" ? 0.15 : 0) + (pick.weapon?.name === "Smoke battlestaff" && spell?.book === "Normal" ? 0.10 : 0) + (pick.shield?.name === "Tome of Fire" && /Fire/.test(spell?.name || "") ? 0.10 : 0);
    const elemB = 1 + (spell?.bonus || 0); // elemental weakness: +pct% accuracy and damage with the matching element
    maxHit = spell ? Math.floor(spell.max * (1 + mdmg) * (onTask ? 1.15 : 1) * salveMult * (spell.wildy && ctx.wildy ? 1.5 : 1) * elemB) : 0;
    atkRoll = Math.floor(effA * (st.amagic + 64) * (onTask ? 1.15 : 1) * (pick.weapon?.name === "Smoke battlestaff" && spell?.book === "Normal" ? 1.1 : 1) * (spell?.wildy && ctx.wildy ? 1.5 : 1) * elemB);
    defRoll = (tg.mage + 9) * (tg.dmagic + 64);
    speed = spell?.speed || 5;
    if (spell?.aoe && loc.multi && tg.size === 1) aoeTargets = /Barrage/.test(spell.name) ? 3 : 2.5;
    label = spell?.name || "magic";
  }
  const acc = accuracy(atkRoll, defRoll);
  const dpsSingle = acc * (maxHit + 1) / 2 / (speed * 0.6);
  const dps = dpsSingle * aoeTargets;
  // cannon
  const cannonOn = S.cannon && loc.cannon && !tg.immune?.cannon;
  let cannon = null;
  if (cannonOn) {
    const cAtk = style === "ranged" ? atkRoll : style === "melee" ? atkRoll : Math.floor((l.ranged + 8) * (st.arange + 64));
    const cAcc = accuracy(cAtk, (tg.def + 9) * (tg.drange + 64));
    const rate = loc.multi ? 1 / 1.2 : 1 / 2.4; // balls per second, assumption
    cannon = { acc: cAcc, rate, dps: rate * cAcc * 15.5 };
  }
  const range = amountFor(t, masterOf(t));
  const amount = S.amount || Math.round((range[0] + range[1]) / 2);
  const totalHp = amount * tg.hp;
  const combatDps = dps + (cannon?.dps || 0);
  const combatSec = totalHp / Math.max(0.1, combatDps);
  const sec = combatSec * 1.3 + amount * 1.5; // 30% overhead + walking/looting per kill
  const kills = amount;
  const supplies = buildSupplies({ t, loc, tg, style, pick, st, pray, spell, cannon, acc, maxHit, sec, combatSec, kills, aoeTargets, speed, dpsSingle, dps, ctx });
  return { ok: true, t, loc, tg, ctx, wildy: ctx.wildy, style, fallback, viable, whyNot, gear, pick, st, pray, onTask, maxHit, acc, speed, dps, dpsSingle, aoeTargets, cannon, amount, sec, combatSec, spell, supplies, styleLabel: label };
}

/* ---------- supplies ---------- */
// In the Wilderness: blighted restores, brews, karambwans, the escape kit, a PK buffer. Anywhere else: prayer potions,
// plain food, the task's required and recommended items (antifire, antidotes, rock hammers...), nothing PK-related.
function buildSupplies(c) {
  const { t, loc, tg, style, pick, st, pray, spell, cannon, sec, combatSec, kills, aoeTargets, speed, dpsSingle, dps, ctx } = c;
  const wildy = !!ctx.wildy;
  const l = S.levels, rows = [];
  const add = (name, qty, why, group) => { if (qty > 0) rows.push({ name, qty: Math.ceil(qty), why, group, each: price(name), img: ITEMS[name]?.image || name + ".png" }); };
  const has = (name) => rows.some((r) => r.name === name);
  const mins = sec / 60;
  // attacks by the player: share of damage done by the player
  const playerShare = dps / Math.max(0.01, dps + (cannon?.dps || 0));
  const playerDmg = kills * tg.hp * playerShare;
  const attacks = playerDmg / Math.max(0.1, (c.acc * (c.maxHit + 1) / 2) * aoeTargets); // number of attacks/casts
  if (style === "magic" && spell) {
    const wn = pick.weapon?.name || "";
    const staffFree = pick.weapon?.tags.includes("firestaff") ? ["Fire"] : [];
    if (wn === "Smoke battlestaff") staffFree.push("Air");
    for (const el of ["Water", "Earth", "Air"]) if (wn.includes(el) && !staffFree.includes(el)) staffFree.push(el);
    for (const [rune, n] of Object.entries(spell.cost || {})) { if (staffFree.includes(rune)) continue; add(rune + " rune", attacks * n * 1.1, `${n} per cast × ~${Math.ceil(attacks)} casts (+10%)`, "ammo"); }
    if (pick.weapon?.tags.includes("powered") && !/Sanguinesti/.test(wn)) add("Death rune", attacks / 100 * 1, `Charges: 1 death, 1 chaos, 5 fire + 10 coins per 100 casts`, "ammo"), add("Chaos rune", attacks / 100, "trident charges", "ammo"), add("Fire rune", attacks / 100 * 5, "trident charges", "ammo");
    if (/Sanguinesti/.test(wn)) add("Blood rune", attacks * 3 / 100, "3 blood runes per 100 casts", "ammo");
  }
  if (style === "ranged" && pick.ammo && !pick.ammo.tags.includes("blessing")) {
    const breakRate = pick.weapon?.name === "Toxic blowpipe" ? 1 / 3 : 0.2 + (pick.cape?.name?.startsWith("Ava") ? -0.08 : 0);
    const shots = attacks;
    add(pick.ammo.name, shots * Math.max(0.1, breakRate) * 1.15, `~${Math.ceil(shots)} shots, ${Math.round(Math.max(0.1, breakRate) * 100)}% lost (Ava's picks up the rest)`, "ammo");
  }
  if (cannon) { const balls = cannon.rate * combatSec * 1.1; add("Steel cannonball", balls, `${(cannon.rate * 60).toFixed(0)}/min fired over ${Math.round(combatSec / 60)} min of combat, ${Math.round(cannon.acc * 100)}% accuracy`, "cannon"); }
  // prayer
  let drain = 0; const prot = /Protect/.test(t.pray);
  if (prot) drain += 20 * mins; // protection prayer: 20 points/min base
  if (pray) drain += pray.drain * mins;
  if (wildy && S.protect) drain += 2 * mins; // Protect Item is cheap
  drain = drain / (1 + st.prayer / 30);
  const restoreDose = Math.floor(8 + l.prayer / 4), prayDose = Math.floor(7 + l.prayer / 4);
  if (wildy) add("Blighted super restore(4)", Math.max(0, drain - l.prayer) / restoreDose / 4, `${Math.round(drain)} prayer points over ${Math.round(mins)} min${pray ? " with " + pray.name : ""}; blighted = cheap and Wilderness-only`, "potions");
  else add("Prayer potion(4)", Math.max(0, drain - l.prayer) / prayDose / 4, `${Math.round(drain)} prayer points over ${Math.round(mins)} min${pray ? " with " + pray.name : ""}`, "potions");
  // food: incoming damage. A protection prayer only "covers" a monster that attacks with that one style.
  const atkStyle = styleOf(tg.style), prayLow = t.pray.toLowerCase();
  const pure = (re) => re.test(atkStyle) && atkStyle.split("+").every((p) => re.test(p));
  const protCovers = prot && ((/melee/.test(prayLow) && pure(/^melee$/)) || (/magic/.test(prayLow) && pure(/^magic(-melee)?$/)) || (/missiles|ranged/.test(prayLow) && pure(/^(magic-)?ranged$/)));
  let intake = 0;
  if (!protCovers) {
    const mAtk = (tg.cb * 0.6 + 9) * 64, pDef = (l.defence + 8) * ((/magic/.test(atkStyle) ? st.dmagic : /ranged/.test(atkStyle) ? st.drange : st.dslash) + 64);
    const mAcc = accuracy(mAtk, Math.max(1, pDef));
    intake = mAcc * (tg.maxhit + 1) / 2 / ((tg.speed || 4) * 0.6) * (loc.multi ? 1.8 : 1) * (prot ? 0.3 : 0.5); // you are not always being hit; a prayer blocks part of a mixed attacker
  }
  const foodHeal = l.hitpoints >= 80 ? 22 : 20, foodName = wildy ? (l.hitpoints >= 80 ? "Blighted manta ray" : "Shark") : (l.hitpoints >= 80 ? "Manta ray" : "Shark");
  const foodN = intake * combatSec / foodHeal;
  add(foodName, foodN + (wildy ? 6 : 3), protCovers ? (wildy ? "Prayer blocks the task's damage; this is the PK buffer" : "Prayer blocks the task's damage; a few in case") : `${intake.toFixed(2)} damage/s taken${wildy ? ", plus a PK buffer of 6" : ", plus 3 spare"}`, "food");
  if (wildy) { add("Blighted karambwan", Math.ceil(mins / 15) + 2, "Combo eats when a PKer lands a big hit", "food"); add("Saradomin brew(4)", 1 + Math.floor(mins / 60), "Survive a teleblock", "potions"); }
  // boosts
  if (S.pots) {
    if (style === "melee") add("Super combat potion(4)", Math.ceil(mins / 6) / 4 + 0.25, "one dose every ~6 min", "potions");
    if (style === "ranged") add("Ranging potion(4)", Math.ceil(mins / 6) / 4 + 0.25, "one dose every ~6 min", "potions");
    if (style === "magic") add("Magic potion(4)", Math.ceil(mins / 6) / 4 + 0.25, "one dose every ~6 min", "potions");
  }
  add("Stamina potion(4)", wildy ? Math.max(1, mins / 40) : (mins > 25 ? 1 : 0), wildy ? "Running there, running away" : "Running between spawns", "potions");
  // the task's own dangers
  const shieldBlocks = !!(pick.shield?.tags.includes("dragon") || pick.shield?.tags.includes("wyvern"));
  if (ctx.fire) {
    const superNeeded = !shieldBlocks;
    add(superNeeded ? "Extended super antifire(4)" : "Extended antifire(4)", Math.max(1, mins / 24), superNeeded ? "No dragonfire shield in this setup: a super antifire blocks dragonfire on its own" : "Shield plus antifire = dragonfire fully blocked", "potions");
  }
  const venomImmune = !!pick.head?.tags.includes("venom");
  if (ctx.venom && !venomImmune) add("Anti-venom+(4)", 1 + Math.floor(mins / 45), "They venom you; one dose cures and protects for a while", "potions");
  else if (ctx.poison && !venomImmune) add("Antidote++(4)", 1 + Math.floor(mins / 60), "They poison you", "potions");
  if (wildy && /spider|Spindel|Venenatis/i.test(t.name + loc.name) && !has("Anti-venom+(4)")) add("Anti-venom+(4)", 1, "Poison and venom", "potions");
  if (t.slug === "revenants") add("Revenant ether", 50, "Charge the bracelet of ethereum", "ammo");
  // required and recommended items that are not worn (worn ones are in the gear grid)
  const worn = new Set(Object.values(pick).map((i) => i.name));
  const helmWorn = Object.values(pick).some((i) => i.tags.includes("helm"));
  const PER_KILL = { "Ice cooler": 1, "Bag of salt": 1 };
  for (const n of t.need || []) {
    const it = ITEMS[n.item];
    if (it?.stats) { if (!["weapon", "2h", "ammo"].includes(it.slot) && !worn.has(n.item) && !(n.helm && helmWorn) && !(n.item === "Mirror shield" && worn.has("V's shield"))) rows.push({ name: n.item, qty: 1, why: n.why + " (required; not in this setup, so carry it)", group: "kit", each: price(n.item), img: it.image }); continue; }
    if (has(n.item)) continue;
    const q = PER_KILL[n.item] ? kills * PER_KILL[n.item] : /^Fungicide/.test(n.item) ? Math.ceil(kills / 10) : 1;
    rows.push({ name: n.item, qty: q, why: n.why, group: "kit", each: price(n.item), img: it?.image || (n.item === "Light source" ? "Bullseye lantern.png" : n.item + ".png") });
  }
  for (const b of t.bring || []) {
    if (!b.item || has(b.item) || worn.has(b.item)) continue;
    const it = ITEMS[b.item]; if (it?.stats) continue;
    rows.push({ name: b.item, qty: 1, why: b.why, group: "kit", each: price(b.item), img: it?.image || b.item + ".png" });
  }
  if (has("Anti-venom+(4)") && has("Antidote++(4)")) rows.splice(rows.findIndex((r) => r.name === "Antidote++(4)"), 1); // anti-venom covers poison too
  if (wildy) {
    if (/lockpick/i.test(loc.notes + (t.gear || []).join(" "))) add("Lockpick", 1, "Required for the door", "kit");
    if (/web|lever|knife/i.test(loc.tele + loc.notes)) add("Knife", 1, "Webs on the way", "kit");
    if (/axe to chop/i.test(t.tips.join(" "))) rows.push({ name: "Any axe", qty: 1, why: "Chop ent remains for logs", group: "kit", each: 0, img: "Rune axe.png" });
  }
  if (cannon) add("Dwarf cannon set", 1, wildy ? "Set up, leave it if a PKer shows up; never lost on death" : "Set it up where the spawns cluster", "cannon");
  if (wildy) for (const k of KIT) { if (k.cannon) continue; if (!k.always) continue; if (has(k.name)) continue; rows.push({ name: k.name, qty: k.name.includes("restore") ? 0 : 1, why: k.why, group: "kit", each: price(k.name), img: ITEMS[k.name]?.image || k.name + ".png" }); }
  const trips = Math.max(1, Math.ceil(rows.filter((r) => r.group === "food").reduce((s, r) => s + r.qty, 0) / (wildy ? 16 : 20)));
  return { rows: rows.filter((r) => r.qty > 0), trips, intake, protCovers, attacks, mins, wildy };
}

/* ---------- render loadout ---------- */
function renderLoadout() {
  const c = CALC = compute();
  const box = $("#loadout"), sup = $("#supplies");
  if (!c) { box.classList.add("hidden"); sup.classList.add("hidden"); return; }
  box.classList.remove("hidden"); sup.classList.remove("hidden");
  const t = c.t, loc = c.loc;
  const spellOpts = c.style === "magic" ? spellOptions(c.pick, c.ctx) : [];
  // three-style comparison: the selected style is the full calc, the other two are computed strictly with no overrides
  const trio = ["melee", "ranged", "magic"].map((s) => (s === c.style ? c : compute(s, { strict: true, overrides: {} })));
  const best = trio.filter((x) => x && x.ok).sort((a, b) => a.sec - b.sec)[0];
  const cap = (s) => s[0].toUpperCase() + s.slice(1);
  const cards = trio.map((x) => {
    const s = x.style, on = s === c.style;
    return `<button type="button" class="stylecard" data-s="${s}" aria-pressed="${on}"${x.ok ? "" : " disabled"}>
      <span class="sn">${cap(s)}${t.style === s ? `<i class="rec">recommended</i>` : ""}${x.ok && x === best ? `<span class="best">Best for your gear</span>` : ""}</span>
      ${x.ok ? `<span class="sv"><b>${x.maxHit}</b> max · <b>${Math.round(x.acc * 100)}%</b> hit · <b>${x.dps.toFixed(2)}</b> dps</span><span class="st"><b>${Math.round(x.sec / 60)} min</b> task${x.style === "magic" && x.spell ? ` · ${esc(x.spell.name)}` : x.pick?.weapon ? ` · ${esc(x.pick.weapon.name)}` : ""}</span>` : `<span class="why">${esc(x.why)}</span>`}
    </button>`;
  }).join("");
  $("#loadout-controls").innerHTML = `
    <div style="grid-column:1/-1">
      <div class="styles" id="style-segs">${cards}</div>
      ${c.fallback ? `<p class="err hint" style="margin:6px 0 0">${cap(c.fallback)} is recommended here, but ${ownOnlyActive() ? "nothing in your bank" : "your levels"} cannot use it yet, so this is a ${c.style} setup.</p>` : ""}
    </div>
    <label>${c.wildy ? "Risk tier" : "Gear budget"}<select id="tier">${(c.wildy ? [["budget", "Budget: risk under 150k"], ["mid", "Mid: risk under 750k"], ["high", "High: risk under 3m"], ["max", "Max: best you can wear"]] : [["budget", "Budget: under 600k worn"], ["mid", "Mid: under 5m worn"], ["high", "High: under 30m worn"], ["max", "Max: best you can wear"]]).map(([k, v]) => `<option value="${k}"${S.tier === k ? " selected" : ""}>${v}</option>`).join("")}</select></label>
    ${c.style === "magic" ? `<label>Spell<select id="spell">${spellOpts.map((o) => `<option value="${esc(o.name)}"${c.spell?.name === o.name ? " selected" : ""}>${esc(o.name)} (max ${o.max}${o.bonus ? ", +" + Math.round(o.bonus * 100) + "% weakness" : ""}${o.aoe ? ", AoE" : ""})</option>`).join("")}</select></label>` : ""}
    <label>Task amount<input id="amount" type="number" min="1" max="400" value="${c.amount}" style="width:100%" /></label>
    ${c.wildy ? `<label class="check"><input type="checkbox" id="protect"${S.protect ? " checked" : ""} />Protect Item (keep 4)</label>` : ""}
    <label class="check${loc.cannon && !c.tg.immune?.cannon ? "" : " muted"}"><input type="checkbox" id="cannon"${S.cannon && loc.cannon && !c.tg.immune?.cannon ? " checked" : ""}${loc.cannon && !c.tg.immune?.cannon ? "" : " disabled"} />Cannon${c.tg.immune?.cannon ? " (immune)" : loc.cannon ? "" : " (not allowed here)"}</label>
    <label class="check"><input type="checkbox" id="offpray"${S.offPray ? " checked" : ""} />Offensive prayer${c.pray ? ` (${c.pray.name})` : ""}</label>
    <label class="check"><input type="checkbox" id="pots"${S.pots ? " checked" : ""} />Boost potions</label>
    ${hasBank() ? `<label class="check"><input type="checkbox" id="ownonly"${ownOnlyActive() ? " checked" : ""} />Only gear I own</label>` : ""}`;
  $$("#style-segs button").forEach((b) => b.addEventListener("click", () => { if (b.disabled) return; S.style = b.dataset.s; S.overrides = {}; S.spell = null; persist(); renderLoadout(); }));
  $("#tier").onchange = (e) => { S.tier = e.target.value; S.overrides = {}; persist(); renderLoadout(); };
  const own = $("#ownonly"); if (own) own.onchange = (e) => { S.ownOnly = e.target.checked; S.overrides = {}; persist(); renderAll(); renderRl(); };
  $("#amount").onchange = (e) => { S.amount = clamp(parseInt(e.target.value, 10) || 1, 1, 400); persist(); renderLoadout(); };
  const pr = $("#protect"); if (pr) pr.onchange = (e) => { S.protect = e.target.checked; persist(); renderLoadout(); };
  $("#cannon").onchange = (e) => { S.cannon = e.target.checked; persist(); renderLoadout(); };
  $("#offpray").onchange = (e) => { S.offPray = e.target.checked; persist(); renderLoadout(); };
  $("#pots").onchange = (e) => { S.pots = e.target.checked; persist(); renderLoadout(); };
  const sp = $("#spell"); if (sp) sp.onchange = (e) => { S.spell = e.target.value; persist(); renderLoadout(); };

  // equipment grid
  const vals = Object.entries(c.pick).map(([slot, it]) => [slot, price(it.name)]).sort((a, b) => b[1] - a[1]);
  const keptSlots = new Set(vals.slice(0, c.gear.keep).filter((v) => v[1] > 0).map((v) => v[0]));
  const ctx = c.ctx;
  const bank = hasBank(), ownF = ownOnlyActive(), emptyOwn = [];
  $("#equip").innerHTML = SLOTS.map((slot) => {
    const it = c.pick[slot];
    const opts = slot === "ammo" ? ammoFor(c.pick.weapon, c.style, ctx) : slot === "shield" ? candidates("shield", c.style, ctx) : (c.gear.pool[slot] || []);
    const sorted = opts.slice().sort((a, b) => score(b, c.style, ctx) - score(a, c.style, ctx));
    const disabled = slot === "shield" && c.pick.weapon?.slot === "2h";
    if (ownF && !it && !disabled && slot !== "ammo" && !sorted.length) emptyOwn.push(slot);
    const mark = bank && it ? (owns(it) ? `<span class="own ok" title="In your bank, inventory or worn">✓</span>` : `<span class="own no" title="Not in your bank">✗</span>`) : "";
    return `<div class="slot ${slot === "head" ? "h" : slot}${it ? "" : " empty"}" title="${esc(it?.note || "")}">
      ${keptSlots.has(slot) ? `<span class="kept">KEPT</span>` : ""}${mark}
      ${it ? `<img src="${img(it.image)}" alt="" />` : `<span class="tag">${slot}</span>`}
      <span class="nm">${it ? esc(it.name) : disabled ? "two-handed" : emptyOwn.includes(slot) ? "none owned" : "—"}</span>
      ${it ? `<span class="pr">${it.tradeable ? gp(price(it.name)) : it.untrade ? "~" + gp(it.untrade) : "untradeable"}</span>` : ""}
      ${disabled ? "" : `<select aria-label="${slot}" data-slot="${slot}"><option value="">(none)</option>${sorted.map((o) => `<option value="${esc(o.name)}"${it?.name === o.name ? " selected" : ""}>${bank ? (owns(o) ? "✓ " : "✗ ") : ""}${esc(o.name)} · ${o.tradeable ? gp(price(o.name)) : "untr."}</option>`).join("")}</select>`}
    </div>`;
  }).join("");
  $$("#equip select").forEach((s) => s.addEventListener("change", (e) => { S.overrides[e.target.dataset.slot] = e.target.value; persist(); renderLoadout(); }));
  const eh = $("#equip-hint");
  if (emptyOwn.length) { eh.classList.remove("hidden"); eh.innerHTML = `Only gear you own is shown and nothing in your bank fits: <b>${emptyOwn.join(", ")}</b>. Those slots stay empty rather than guessing. <button class="btn small" type="button" id="own-off">Show all gear</button>`; $("#own-off").onclick = () => { S.ownOnly = false; S.overrides = {}; persist(); renderAll(); renderRl(); }; }
  else if (ownF) { eh.classList.remove("hidden"); eh.innerHTML = `Only gear you own (${(SYNC.player?.rsn ? esc(SYNC.player.rsn) + "'s" : "your")} bank, inventory and worn items, synced from RuneLite). ✓ owned · ✗ missing.`; }
  else { eh.classList.add("hidden"); eh.innerHTML = ""; }
  const total = Object.values(c.pick).reduce((s, i) => s + price(i.name), 0);
  const st = c.st;
  const atkLabel = c.style === "melee" ? `stab ${st.astab} · slash ${st.aslash} · crush ${st.acrush}` : c.style === "ranged" ? `ranged ${st.arange}` : `magic ${st.amagic}`;
  const strLabel = c.style === "melee" ? `strength ${st.str}` : c.style === "ranged" ? `ranged str ${st.rstr}` : `magic dmg +${st.mdmg}%`;
  $("#totals").innerHTML = `
    ${c.wildy ? `<div class="wide"><span>Risk if you die (${c.gear.keep} items kept${S.protect ? ", Protect Item on" : ""})</span><b class="big">${gp(c.gear.risk)}</b> <span class="muted" style="display:inline">of ${gp(total)} worn</span></div>` : `<div class="wide"><span>Worn value</span><b class="big">${gp(total)}</b> <span class="muted" style="display:inline">kept on death outside the Wilderness (Death's fee aside)</span></div>`}
    <div><span>Attack bonus</span>${atkLabel}</div>
    <div><span>Damage</span>${strLabel} · prayer +${st.prayer}</div>
    <div><span>Max hit</span><b class="big">${c.maxHit}</b> <span class="muted" style="display:inline">${esc(c.styleLabel)}</span></div>
    <div><span>Hit chance</span><b class="big">${Math.round(c.acc * 100)}%</b> <span class="muted" style="display:inline">vs ${esc(c.tg.name)}</span></div>
    <div><span>Your DPS</span>${c.dps.toFixed(2)}${c.aoeTargets > 1 ? ` <span class="muted" style="display:inline">(${c.dpsSingle.toFixed(2)} × ~${c.aoeTargets} stacked)</span>` : ""}</div>
    <div><span>Cannon DPS</span>${c.cannon ? c.cannon.dps.toFixed(2) + ` <span class="muted" style="display:inline">(${Math.round(c.cannon.acc * 100)}% acc)</span>` : "off"}</div>
    <div><span>Kill time</span>${(c.tg.hp / Math.max(0.1, c.dps + (c.cannon?.dps || 0))).toFixed(1)} s</div>
    <div><span>Task time</span><b class="big">${Math.round(c.sec / 60)} min</b> <span class="muted" style="display:inline">for ${c.amount}</span></div>
    ${c.wildy ? `<div class="wide"><span>Magic defence (PKers freeze and TB you)</span>${st.dmagic >= 40 ? '<b class="ok">' : st.dmagic >= 0 ? "<b>" : '<b class="err">'}${st.dmagic}</b> <span class="muted" style="display:inline">· ranged def ${st.drange} · melee def ${Math.round((st.dstab + st.dslash + st.dcrush) / 3)}</span></div>` : `<div class="wide"><span>Your defence vs their ${esc(c.tg.style)}</span><b>${/magic/.test(styleOf(c.tg.style)) ? "magic " + st.dmagic : /ranged/.test(styleOf(c.tg.style)) ? "ranged " + st.drange : "melee " + Math.round((st.dstab + st.dslash + st.dcrush) / 3)}</b> <span class="muted" style="display:inline">· magic ${st.dmagic} · ranged ${st.drange} · melee ${Math.round((st.dstab + st.dslash + st.dcrush) / 3)}</span></div>`}
    ${c.spell?.bonus ? `<div class="wide muted">${esc(c.spell.name)} gets +${Math.round(c.spell.bonus * 100)}% accuracy and damage from the target's ${esc(c.tg.elem.type)} weakness.</div>` : ""}
    ${c.ctx.req?.names.size ? `<div class="wide muted">Required for this task: ${[...c.ctx.req.names].filter((n) => n !== "V's shield").map(esc).join(", ")}${c.ctx.req.helmOk ? " (a Slayer helmet covers the head item)" : ""}.</div>` : ""}
    ${c.onTask ? "" : `<div class="wide muted">No slayer helm or black mask in this setup: that is 15–17% of your damage. Add one if you own it.</div>`}`;
  renderSupplies(c);
  renderPresets(); // keeps the "current" marker honest: a changed control means the state no longer matches the loaded setup
  schedulePush();
}
function renderSupplies(c) {
  const s = c.supplies;
  const groups = [["ammo", "Ammo and runes"], ["cannon", "Cannon"], ["potions", "Potions"], ["food", "Food"], ["kit", "Wilderness kit"]];
  let total = 0;
  const bank = hasBank();
  const ownMark = (name) => { if (!bank) return ""; const q = ownedQty(name); return q > 0 ? `<small class="own ok">✓ ${q.toLocaleString()} in bank</small>` : `<small class="own no">✗ not in bank</small>`; };
  const rows = groups.map(([g, label]) => { const rs = s.rows.filter((r) => r.group === g); if (!rs.length) return ""; return `<tr><th colspan="2">${label}</th><th class="num">each</th><th class="num">total</th></tr>` + rs.map((r) => { const t = r.each * r.qty; total += t; return `<tr><td><img src="${img(r.img)}" alt="" loading="lazy" />${esc(r.name)}${ownMark(r.name)}<small>${esc(r.why)}</small></td><td class="num">× ${r.qty.toLocaleString()}</td><td class="num">${r.each ? gp(r.each) : "—"}</td><td class="num">${t ? gp(t) : "—"}</td></tr>`; }).join(""); }).join("");
  // one-trip inventory preview
  const inv = [];
  const push = (name, n, imgName) => { for (let i = 0; i < n && inv.length < 28; i++) inv.push({ name, img: imgName }); };
  const perTrip = (name) => { const r = s.rows.find((x) => x.name === name); return r ? Math.ceil(r.qty / s.trips) : 0; };
  for (const k of ["Looting bag", "Royal seed pod", "Stamina potion(4)", "Blighted super restore(4)", "Prayer potion(4)", "Saradomin brew(4)"]) { const r = s.rows.find((x) => x.name === k); if (r) push(k, Math.min(perTrip(k) || 1, s.wildy ? 4 : 6), r.img); }
  for (const r of s.rows.filter((x) => x.group === "potions" && !["Stamina potion(4)", "Blighted super restore(4)", "Prayer potion(4)", "Saradomin brew(4)"].includes(x.name))) push(r.name, Math.min(perTrip(r.name), 2), r.img);
  if (c.cannon) { push("Dwarf cannon set", 4, "Dwarf multicannon.png"); push("Steel cannonball", 1, "Steel cannonball.png"); }
  for (const r of s.rows.filter((x) => x.group === "ammo")) push(r.name, 1, r.img);
  for (const r of s.rows.filter((x) => x.group === "kit" && !["Looting bag", "Royal seed pod", "Burning amulet(5)"].includes(x.name))) push(r.name, 1, r.img);
  const food = s.rows.filter((x) => x.group === "food");
  const foodSlots = Math.max(0, 28 - inv.length);
  const kara = food.find((f) => f.name.includes("karambwan"));
  const main = food.find((f) => !f.name.includes("karambwan"));
  const nk = kara ? Math.min(perTrip(kara.name), Math.floor(foodSlots / 3)) : 0;
  if (main) push(main.name, foodSlots - nk, main.img);
  if (kara) push(kara.name, nk, kara.img);
  const counts = inv.reduce((m, x) => (m[x.name] = (m[x.name] || 0) + 1, m), {});
  const cells = []; const seen = {};
  for (const x of inv) { seen[x.name] = (seen[x.name] || 0) + 1; cells.push(`<div title="${esc(x.name)}"><img src="${img(x.img)}" alt="${esc(x.name)}" loading="lazy" />${counts[x.name] > 1 && seen[x.name] === 1 ? `<i>${counts[x.name]}</i>` : ""}</div>`); }
  while (cells.length < 28) cells.push("<div></div>");
  $("#supplies-body").innerHTML = `
    <div class="sup">
      <div>
        <p class="hint" style="margin:0 0 8px">One trip of ${s.trips} (${Math.round(s.mins / s.trips)} min each). ${s.wildy ? "Wear the teleport jewellery." : "Bring a teleport back to the bank."}</p>
        <div class="inv">${cells.join("")}</div>
        <p class="assume">Assumptions: ${c.pray ? c.pray.name + " and " : ""}${/Protect/.test(c.t.pray) ? c.t.pray : "no protection prayer"} on${c.wildy && S.protect ? ", Protect Item on" : ""}; 30% time overhead for walking and looting; ${s.protCovers ? "prayer blocks the task's damage so food is only a " + (c.wildy ? "PK buffer" : "safety margin") : "you take " + s.intake.toFixed(2) + " damage/s while fighting"}${c.cannon ? "; the cannon fires about " + Math.round(c.cannon.rate * 60) + " balls a minute" : ""}${c.aoeTargets > 1 ? "; AoE hits ~" + c.aoeTargets + " targets per attack" : ""}. Prices: wiki real-time, ${S.pricesAt ? "loaded " + Math.round((Date.now() - S.pricesAt) / 60000) + " min ago" : "not loaded"}.</p>
      </div>
      <div>
        <table><tbody>${rows}<tr class="total"><td colspan="3">Supplies for the whole task</td><td class="num">${gp(total)}</td></tr></tbody></table>
      </div>
    </div>`;
}

/* ---------- saved setups ----------
   Each setup = { id: "s_xxxxxx", name, at, preset: snapshot(), selection: the pushed selection for that state }.
   localStorage ("wildy:presets") is the cache; while a code is set the list also lives on the server so the
   RuneLite plugin can list and apply them. Old flat presets ({ name, at, task, ... }) are wrapped on read. */
const SETUPS_KEY = "wildy:presets", MAX_SETUPS = 50;
const rid = () => { const a = new Uint8Array(6); crypto.getRandomValues(a); return "s_" + [...a].map((b) => "abcdefghijklmnopqrstuvwxyz0123456789"[b % 36]).join(""); };
function migrateSetup(p) {
  if (!p || typeof p !== "object") return null;
  if (p.preset && typeof p.preset === "object") return { id: typeof p.id === "string" && p.id ? p.id : rid(), name: String(p.name || "Setup"), at: +p.at || Date.now(), preset: p.preset, selection: p.selection || null };
  const { name, at, ...preset } = p;
  return { id: rid(), name: String(name || "Setup"), at: +at || Date.now(), preset, selection: null };
}
function setups() {
  try {
    const raw = JSON.parse(localStorage.getItem(SETUPS_KEY) || "[]");
    if (!Array.isArray(raw)) return [];
    const out = raw.map(migrateSetup).filter(Boolean);
    if (out.some((s, i) => s !== raw[i])) try { localStorage.setItem(SETUPS_KEY, JSON.stringify(out)); } catch (_) {}
    return out;
  } catch (_) { return []; }
}
function saveSetups(list, { push = true } = {}) {
  list = list.slice(0, MAX_SETUPS);
  try { localStorage.setItem(SETUPS_KEY, JSON.stringify(list)); } catch (_) {}
  renderPresets();
  if (push) pushSetups();
}
function snapshot() { return { rsn: S.rsn, levels: { ...S.levels }, master: S.master, task: S.task, loc: S.loc, target: S.target, style: S.style, tier: S.tier, protect: S.protect, cannon: S.cannon, offPray: S.offPray, pots: S.pots, spell: S.spell, amount: S.amount, overrides: { ...S.overrides } }; }
// what makes two states "the same setup" (levels and rsn do not count)
const presetKey = (p) => JSON.stringify([p.task ?? null, p.loc || 0, p.target ?? null, p.style || null, p.tier || "mid", !!p.protect, !!p.cannon, !!p.offPray, !!p.pots, p.spell || null, p.amount || null, p.overrides || {}]);
// presets come from localStorage, an imported file or the server row, so every field is checked before it reaches S
function cleanPreset(p) {
  p = p && typeof p === "object" ? p : {};
  const levels = {}; for (const k of SKILLS) { const v = num(p.levels?.[k]); if (v != null) levels[k] = clamp(Math.round(v), 1, 99); }
  const overrides = {}; for (const [slot, name] of Object.entries(p.overrides || {})) if (SLOTS.includes(slot) && typeof name === "string") overrides[slot] = name;
  const amount = num(p.amount);
  return {
    rsn: typeof p.rsn === "string" ? p.rsn.slice(0, 12) : null, levels,
    master: p.master === "all" || MASTER[p.master] ? p.master : null,
    task: TASKS.some((t) => t.id === p.task) ? p.task : null, loc: Math.max(0, Math.round(num(p.loc) || 0)), target: num(p.target) != null ? Math.max(0, Math.round(num(p.target))) : null,
    style: ["melee", "ranged", "magic"].includes(p.style) ? p.style : null, tier: typeof p.tier === "string" && Object.prototype.hasOwnProperty.call(TIER_CAP, p.tier) ? p.tier : null,
    protect: !!p.protect, cannon: !!p.cannon, offPray: !!p.offPray, pots: !!p.pots,
    spell: typeof p.spell === "string" ? p.spell : null, amount: amount ? clamp(Math.round(amount), 1, 400) : null, overrides, // spell is only ever compared with the computed options
  };
}
function applyPreset(raw) {
  const p = cleanPreset(raw);
  Object.assign(S, { rsn: p.rsn ?? S.rsn, levels: { ...S.levels, ...p.levels }, master: p.master || S.master, task: p.task, loc: p.loc, target: p.target, style: p.style, tier: p.tier || S.tier, protect: p.protect, cannon: p.cannon, offPray: p.offPray, pots: p.pots, spell: p.spell, amount: p.amount, overrides: p.overrides });
  if (rlLevelsActive()) adoptLevels(SYNC.player); // paired levels win over the ones saved in the setup
  $("#rsn").value = S.rsn || ""; persist(); renderStats(); renderLevels(); renderMasters(); renderTasks(); renderAll();
}
function newSetup(name) {
  const s = { id: rid(), name, at: Date.now(), preset: snapshot(), selection: null };
  if (CALC) { s.selection = buildSelection(CALC); s.selection.setupId = s.id; s.selection.setupName = s.name; }
  return s;
}
function renderPresets() {
  const list = setups(), active = activeSetup();
  $("#preset-list").innerHTML = list.map((s) => { const p = s.preset || {}; const t = TASKS.find((x) => x.id === p.task); return `<li${active?.id === s.id ? ' class="active"' : ""}><b>${esc(s.name)}<small>${esc(t?.name || "no task")} · ${esc(p.style || t?.style || "")} · ${esc(p.tier || "")}${p.rsn ? " · " + esc(p.rsn) : ""}${active?.id === s.id ? ' · <span class="ok">current</span>' : ""}</small></b><button class="btn small" type="button" data-load="${esc(s.id)}">Load</button><button class="btn small danger" type="button" data-del="${esc(s.id)}" aria-label="Delete">✕</button></li>`; }).join("") || `<li class="muted" style="border:0;background:none">No saved setups yet.</li>`;
  $$("#preset-list [data-load]").forEach((b) => b.addEventListener("click", () => { const s = setups().find((x) => x.id === b.dataset.load); if (!s) return; setActiveSetup(s); applyPreset(s.preset); renderPresets(); }));
  $$("#preset-list [data-del]").forEach((b) => b.addEventListener("click", () => saveSetups(setups().filter((x) => x.id !== b.dataset.del))));
}
// the setup the current state came from, or null once the user changed something; remembered across reloads in wildy:sync
function setActiveSetup(s) { SYNC.activeSetup = s ? { id: String(s.id), name: String(s.name) } : null; persistSync(); }
function activeSetup() {
  const a = SYNC.activeSetup; if (!a) return null;
  const s = setups().find((x) => x.id === a.id);
  if (!s || presetKey(s.preset) !== presetKey(snapshot())) { setActiveSetup(null); return null; }
  return s;
}

/* ---------- RuneLite sync (runelite/PROTOCOL.md) ----------
   One row per pairing code at /api/slayer/sync/. The plugin writes `player`, this page writes `selection`
   and `setups`; both poll GET every 5 s with the last version. */
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const SYNC = { code: null, version: 0, pulled: false, fresh: true, player: null, playerAt: null, selection: null, selectionAt: null, setupsAt: null, lastPushed: null, lastPushedSel: null, lastPushedAt: 0, setupsWrote: 0, appliedSelectionAt: 0, syncedAt: 0, error: null, timer: null, pushTimer: null, activeSetup: null, autoTask: null, liveText: "" };
const normCode = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const validCode = (c) => /^[A-Z0-9]{8}$/.test(c);
const fmtCode = (c) => (c ? c.slice(0, 4) + "-" + c.slice(4) : "————");
function genCode() { const a = new Uint8Array(8); crypto.getRandomValues(a); return [...a].map((b) => CODE_ALPHABET[b % 32]).join(""); }
const syncMeta = () => { try { return JSON.parse(localStorage.getItem("wildy:sync") || "{}") || {}; } catch (_) { return {}; } };
const persistSync = () => { try { localStorage.setItem("wildy:sync", JSON.stringify({ code: SYNC.code, appliedSelectionAt: SYNC.appliedSelectionAt, setupsWrote: SYNC.setupsWrote, activeSetup: SYNC.activeSetup })); } catch (_) {} };
const ago = (ts) => (ts ? `${Math.max(0, Math.round((Date.now() - ts) / 1000))}s ago` : "never");
const agoLong = (ts) => { const s = Math.max(0, Math.round((Date.now() - ts) / 1000)); return s < 90 ? `${s}s ago` : s < 5400 ? `${Math.round(s / 60)} min ago` : s < 172800 ? `${Math.round(s / 3600)} h ago` : `${Math.round(s / 86400)} d ago`; };

// ownership index from the synced bank + inventory + equipment
const OWNED = { ids: new Set(), names: new Set(), byName: new Map(), qtyByName: new Map() };
function normName(s) {
  let n = String(s || "").trim().toLowerCase();
  n = n.replace(/\s*\(\d+\)(?=\s*\(i\)$)/, "");                      // imbued charge count: "Black mask (10) (i)"
  n = n.replace(/\s*\(\d+\)$/, "");                                  // doses / charges: "(4)", " (3)"
  n = n.replace(/\s*\((uncharged|u|full|empty|used)\)$/, "");        // charge states
  n = n.replace(/\s(100|75|50|25|0)$/, "");                          // barrows degrade
  n = n.replace(/^(black|green|red|purple|turquoise|hydra|twisted|tztok|vampyric|tzkal|araxyte) slayer helmet/, "slayer helmet");
  return n;
}
function rebuildOwned() {
  OWNED.ids.clear(); OWNED.names.clear(); OWNED.byName.clear(); OWNED.qtyByName.clear();
  const p = SYNC.player; if (!p) return;
  const names = p.names || {};
  for (const list of [p.bank, p.inventory, p.equipment]) {
    if (!Array.isArray(list)) continue;
    for (const row of list) {
      const id = Array.isArray(row) ? +row[0] : +row?.id, qty = Array.isArray(row) ? +row[1] || 1 : +row?.qty || 1;
      if (!Number.isFinite(id)) continue;
      OWNED.ids.add(id);
      const nm = names[id]; if (!nm) continue;
      const k = normName(nm); OWNED.names.add(k);
      if (!OWNED.byName.has(k)) OWNED.byName.set(k, new Set()); OWNED.byName.get(k).add(id);
      OWNED.qtyByName.set(k, (OWNED.qtyByName.get(k) || 0) + qty);
    }
  }
}
const hasBank = () => !!SYNC.player && (OWNED.ids.size > 0);
const ownOnlyActive = () => !!S.ownOnly && hasBank();
const rlLevelsActive = () => S.useRl !== false && !!SYNC.player?.levels;
const owns = (it) => !!it && (OWNED.ids.has(it.id) || OWNED.names.has(normName(it.name)));
const ownedQty = (name) => { const it = ITEMS[name]; let q = OWNED.qtyByName.get(normName(name)) || 0; if (!q && it && OWNED.ids.has(it.id)) q = 1; return q; };
// every owned id whose normalised name matches, plus the items.js base id
function idsFor(it) { const out = [it.id]; for (const id of OWNED.byName.get(normName(it.name)) || []) if (!out.includes(id)) out.push(id); return out.filter((x) => Number.isFinite(x)); }
function idsForName(name) { const it = ITEMS[name]; if (it) return idsFor(it); return [...(OWNED.byName.get(normName(name)) || [])]; }

// plugin task -> Krystilia task slug (singular/plural tolerant); takes the task object or just its name.
// A boss task is resolved through the game's SlayerTaskSublist, so the plugin reports the boss's own name
// ("Callisto", "Vet'ion", ...) rather than "Bosses". Both map to the "bosses" slug, the boss names only when the
// master is Krystilia or unknown: other masters assign some of the same bosses outside the Wilderness.
const taskKey = (s) => String(s || "").toLowerCase().trim().replace(/s$/, "");
const BOSS_NAMES = /^(callisto|artio|vet'?ion|calvar'?ion|venenatis|spindel|chaos elemental|chaos fanatic|crazy archaeologist|scorpia|king black dragon)$/;
// VarbitID.SLAYER_MASTER values as the plugin reports them ("Krystilia" for 7, otherwise the number). Best effort for the
// others: a wrong guess only changes which master's amounts are shown, never the task itself.
const MASTER_VARBIT = { 1: "turael", 2: "mazchna", 3: "vannaka", 4: "chaeldar", 5: "duradel", 6: "nieve", 8: "konar", 9: "spria", 10: "mortimer" };
function masterFromPlugin(master) { if (master === "Krystilia") return "krystilia"; const id = MASTER_VARBIT[+master]; return id && MASTER[id] ? id : null; }
function matchTask(task) {
  const obj = task && typeof task === "object", name = obj ? task.name : task, master = obj ? task.master : null;
  if (!name || typeof name !== "string") return null;
  const k = taskKey(name), low = name.toLowerCase().trim(), wild = master === "Krystilia";
  const same = TASKS.filter((x) => taskKey(x.name) === k);
  let t = same.find((x) => x.krystilia === wild) || same.find((x) => master == null || !x.krystilia) || same[0];
  if (!t && (/\bboss/.test(low) || ((master == null || wild) && BOSS_NAMES.test(low)))) t = TASKS.find((x) => (wild || master == null) ? x.id === "bosses" : x.id === "slayer/bosses") || TASKS.find((x) => x.slug === "bosses");
  return t ? t.id : null;
}
function adoptLevels(p) {
  if (!p?.levels) return;
  for (const k of SKILLS) { const v = +p.levels[k]; if (Number.isFinite(v) && v > 0) S.levels[k] = clamp(Math.round(v), 1, 99); }
  S.levels.hitpoints = Math.max(10, S.levels.hitpoints);
  if (p.rsn) { S.rsn = String(p.rsn); const el = $("#rsn"); if (el) el.value = S.rsn; }
}
function selectPluginTask(scroll) {
  const pt = SYNC.player?.task, slug = matchTask(pt); if (!slug) return;
  if (S.task !== slug) { S.task = slug; S.loc = 0; S.target = null; S.overrides = {}; S.spell = null; S.amount = null; S.style = null; }
  const amt = num(pt.amount); if (amt > 0) S.amount = clamp(Math.round(amt), 1, 400);
  const pm = masterFromPlugin(pt.master), tt = TASKS.find((x) => x.id === slug); if (pm && tt?.masters[pm]) S.master = pm;
  persist(); renderMasters(); renderTasks(); renderAll();
  if (scroll) $("#detail").scrollIntoView({ behavior: "smooth", block: "start" });
}
function onPlayer(p) {
  SYNC.player = p; rebuildOwned();
  if (S.ownOnly == null && hasBank()) S.ownOnly = true;
  if (S.useRl !== false) adoptLevels(p);
  const slug = matchTask(p.task);
  if (slug && !S.task && SYNC.autoTask !== slug) { SYNC.autoTask = slug; selectPluginTask(false); }
  persist(); renderStats(); renderLevels(); renderTasks(); renderAll(); renderRl();
}
function renderTaskBanner() {
  const el = $("#rl-task"); if (!el) return;
  const pt = SYNC.player?.task;
  if (!pt || !pt.name) { el.classList.add("hidden"); el.innerHTML = ""; return; }
  const slug = matchTask(pt), t = TASKS.find((x) => x.id === slug), amount = num(pt.amount), pm = masterFromPlugin(pt.master);
  el.classList.remove("hidden");
  if (!t) { el.innerHTML = `<span>Your current task: <b>${esc(pt.name)}</b>${amount ? `, ${amount} left` : ""}</span><span class="muted">Not in this list.</span>`; return; }
  el.innerHTML = `<span>Your current task: <b>${esc(t.name)}</b>${t.krystilia ? " (Wilderness)" : ""}${pm ? ` from ${esc(MASTER[pm]?.name || pm)}` : ""}, ${amount ?? "?"} left</span>${S.task === slug ? `<span class="badge good">Selected</span>` : `<button class="btn" type="button" id="rl-select">Select it</button>`}`;
  const b = $("#rl-select"); if (b) b.onclick = () => selectPluginTask(true);
}
function toast(msg) { const el = $("#rl-toast"); if (!el) return; el.textContent = msg; el.classList.add("show"); clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove("show"), 4500); }

// --- selection: what this page pushes to the plugin
function buildSelection(c) {
  const t = c.t, ctx = { task: t, attr: t.attr, multi: c.loc.multi }, gear = {}, alts = {};
  for (const slot of SLOTS) {
    const it = c.pick[slot];
    if (it) gear[slot] = { name: it.name, ids: idsFor(it) };
    if (slot === "shield" && c.pick.weapon?.slot === "2h") continue;
    const opts = slot === "ammo" ? ammoFor(c.pick.weapon, c.style, ctx) : slot === "shield" ? candidates("shield", c.style, ctx) : (c.gear.pool[slot] || []);
    const next = opts.filter((o) => o !== it).sort((a, b) => score(b, c.style, ctx) - score(a, c.style, ctx)).slice(0, 2);
    if (next.length) alts[slot] = next.map((o) => ({ name: o.name, ids: idsFor(o) }));
  }
  const a = activeSetup(), wp = c.loc.wp;
  return {
    source: "app", at: Date.now(),
    task: t.id, taskName: t.name,
    loc: Math.max(0, t.locations.indexOf(c.loc)), locationName: c.loc.name,
    target: Array.isArray(wp) && wp.length >= 2 && Number.isFinite(+wp[0]) && Number.isFinite(+wp[1]) ? { x: +wp[0], y: +wp[1], plane: +wp[2] || 0 } : null,
    style: c.style, styleLabel: c.styleLabel,
    setupId: a ? a.id : null, setupName: a ? a.name : null,
    gear, alts,
    supplies: c.supplies.rows.map((r) => ({ name: r.name, ids: idsForName(r.name), qty: r.qty })),
  };
}
const comparable = (sel) => JSON.stringify({ ...sel, at: 0 });
function schedulePush() {
  clearTimeout(SYNC.pushTimer); SYNC.pushTimer = null;
  if (!SYNC.code || !CALC) return;
  SYNC.pushTimer = setTimeout(() => pushSelection(false), 2000); // PROTOCOL.md: both clients write with a 2 s debounce
}
async function pushSelection(force) {
  clearTimeout(SYNC.pushTimer); SYNC.pushTimer = null;
  if (!SYNC.code || !CALC) return null;
  const code = SYNC.code, sel = buildSelection(CALC), key = comparable(sel);
  if (!force && key === SYNC.lastPushed) return null;
  try {
    const r = await fetch(`${API}/sync/`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code, selection: sel }) });
    const d = await r.json().catch(() => null);
    if (!r.ok || !d?.ok) throw new Error(d?.error || "HTTP " + r.status);
    if (code !== SYNC.code) return d;
    SYNC.lastPushed = key; SYNC.lastPushedSel = sel; SYNC.lastPushedAt = Date.now(); SYNC.error = null; renderRlStatus();
    return d;
  } catch (e) { SYNC.error = "push failed: " + e.message; renderRlStatus(); return null; }
}
async function pushSetups() {
  if (!SYNC.code) return null;
  const code = SYNC.code, list = setups().slice(0, 60);
  try {
    const r = await fetch(`${API}/sync/`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code, setups: list }) });
    const d = await r.json().catch(() => null);
    if (!r.ok || !d?.ok) throw new Error(d?.error || "HTTP " + r.status);
    if (code !== SYNC.code) return d;
    SYNC.setupsWrote = d.version || Date.now(); SYNC.setupsAt = SYNC.setupsWrote; SYNC.error = null; persistSync(); renderRlStatus();
    return d;
  } catch (e) { SYNC.error = "setups push failed: " + e.message; renderRlStatus(); return null; }
}
function adoptSetups(list) {
  if (!Array.isArray(list)) return;
  const out = list.map(migrateSetup).filter(Boolean).slice(0, MAX_SETUPS);
  try { localStorage.setItem(SETUPS_KEY, JSON.stringify(out)); } catch (_) {}
  renderPresets();
}
// first pull for a code this browser has never synced with, both sides have setups: keep the union
// (server wins on the same id, local-only entries stay), newest first, and write it back so the server has it too
function mergeSetups(serverList, local) {
  const srv = (Array.isArray(serverList) ? serverList : []).map(migrateSetup).filter(Boolean);
  const have = new Set(srv.map((s) => s.id));
  const out = [...srv, ...local.filter((s) => !have.has(s.id))].sort((a, b) => b.at - a.at).slice(0, MAX_SETUPS);
  try { localStorage.setItem(SETUPS_KEY, JSON.stringify(out)); } catch (_) {}
  renderPresets(); pushSetups();
}
// the plugin applied a saved setup: mirror it here without echoing it back as an app selection
function applyPluginSelection(sel, at) {
  SYNC.appliedSelectionAt = at || Date.now(); persistSync();
  const list = setups(), s = list.find((x) => x.id === sel.setupId) || list.find((x) => sel.setupName && x.name === sel.setupName);
  if (!s) { toast(`RuneLite applied "${sel.setupName || "a setup"}", which this device does not have`); return; }
  setActiveSetup(s);
  applyPreset(s.preset); renderPresets();
  clearTimeout(SYNC.pushTimer); SYNC.pushTimer = null;
  if (CALC) { const mine = buildSelection(CALC); SYNC.lastPushed = comparable(mine); }
  toast("RuneLite applied: " + s.name);
}

// --- polling
async function poll() {
  const code = SYNC.code; if (!code) return null;
  try {
    const r = await fetch(`${API}/sync/?code=${code}${SYNC.version ? "&v=" + SYNC.version : ""}`, { cache: "no-store" });
    const d = await r.json().catch(() => null);
    if (!r.ok || !d || !d.ok) throw new Error(d?.error || "HTTP " + r.status);
    if (code !== SYNC.code) return d;
    SYNC.syncedAt = Date.now(); SYNC.error = null;
    if (!d.unchanged) {
      SYNC.version = d.version || 0;
      const first = !SYNC.pulled, fresh = SYNC.fresh; SYNC.pulled = true; SYNC.fresh = false;
      if (d.setupsAt && d.setupsAt > SYNC.setupsWrote && d.setupsAt !== SYNC.setupsAt) {
        SYNC.setupsAt = d.setupsAt;
        const local = first && fresh ? setups() : [];
        if (local.length && cnt(d.setups)) mergeSetups(d.setups, local); // new pairing with setups on both sides: union, not replace
        else adoptSetups(d.setups);
      }
      else if (first && !d.setupsAt && setups().length) pushSetups(); // first pairing: seed the server with this browser's list
      if (d.player && d.playerAt !== SYNC.playerAt) { SYNC.playerAt = d.playerAt; onPlayer(d.player); }
      else if (!d.player && SYNC.player && SYNC.player.source !== "import") { SYNC.player = null; SYNC.playerAt = null; rebuildOwned(); renderLevels(); renderTasks(); renderAll(); renderRl(); }
      SYNC.selection = d.selection || null; SYNC.selectionAt = d.selectionAt || null;
      if (d.selection && d.selection.source === "plugin" && d.selectionAt > SYNC.appliedSelectionAt) applyPluginSelection(d.selection, d.selectionAt);
    }
    renderRlStatus();
    return d;
  } catch (e) { SYNC.error = e.message; renderRlStatus(); return null; }
}
function startPolling() { stopPolling(); if (!SYNC.code) return; SYNC.timer = setInterval(() => { if (document.visibilityState === "visible") poll(); }, 5000); }
function stopPolling() { clearInterval(SYNC.timer); SYNC.timer = null; }
function setCode(code, { render = true } = {}) {
  code = normCode(code); if (!validCode(code)) return false;
  if (code === SYNC.code) return true;
  clearTimeout(SYNC.pushTimer);
  const keep = SYNC.player?.source === "import" ? SYNC.player : null;
  Object.assign(SYNC, { code, version: 0, pulled: false, fresh: true, player: keep, playerAt: null, selection: null, selectionAt: null, setupsAt: null, lastPushed: null, lastPushedSel: null, lastPushedAt: 0, setupsWrote: 0, appliedSelectionAt: 0, syncedAt: 0, error: null, pushTimer: null, activeSetup: null, autoTask: null });
  // same code as last time: this browser's setups mirror the server's, and the applied setup is still current
  const meta = syncMeta(); if (meta.code === code) { SYNC.fresh = false; SYNC.appliedSelectionAt = +meta.appliedSelectionAt || 0; SYNC.setupsWrote = +meta.setupsWrote || 0; if (meta.activeSetup && typeof meta.activeSetup.id === "string") SYNC.activeSetup = { id: meta.activeSetup.id, name: String(meta.activeSetup.name || "") }; }
  try { localStorage.setItem("wildy:code", code); } catch (_) {}
  persistSync(); rebuildOwned();
  if (render) { renderLevels(); renderTasks(); renderAll(); renderRl(); }
  startPolling(); poll();
  return true;
}

// --- RuneLite card
function renderRlStatus() {
  const st = $("#rl-status"); if (!st) return;
  const p = SYNC.player, code = SYNC.code;
  // html ticks every second ("synced 3s ago") in a plain element; live is the state only, plain text, announced once per change
  let html, live;
  if (!code) { live = "Pairing is off: this browser cannot store a code."; html = live; }
  else if (SYNC.error) { live = "Sync error: " + SYNC.error; html = `<span class="err">${esc(live)}</span>${SYNC.syncedAt ? ` <span class="muted">· last good sync ${ago(SYNC.syncedAt)}</span>` : ""}`; }
  else if (p?.source === "import") { live = `Using an imported export: ${p.rsn || "?"}, ${cnt(p.bank)} bank items`; html = `<span class="ok">Using your import</span> (${cnt(p.bank)} bank items). Pairing still works: enter <b>${fmtCode(code)}</b> in the plugin to switch to live sync.`; }
  else if (!p) { live = `Waiting for the plugin: enter ${fmtCode(code)} in the plugin's settings`; html = `Waiting for the plugin… enter <b>${fmtCode(code)}</b> in the plugin's settings${SYNC.syncedAt ? ` <span class="muted">· checked ${ago(SYNC.syncedAt)}</span>` : ""}`; }
  else { live = `Connected: ${p.rsn || "?"}, ${cnt(p.bank)} bank items`; html = `<span class="ok">Connected:</span> <b>${esc(p.rsn || "?")}</b>, ${cnt(p.bank)} bank items, synced ${ago(SYNC.syncedAt)}`; }
  if (st.innerHTML !== html) st.innerHTML = html;
  const lv = $("#rl-live"); if (lv && SYNC.liveText !== live) { SYNC.liveText = live; lv.textContent = live; }
}
function renderRl() {
  const codeEl = $("#rl-code"); if (!codeEl) return;
  codeEl.textContent = fmtCode(SYNC.code);
  renderRlStatus();
  const p = SYNC.player, box = $("#rl-player");
  if (!p) { box.classList.add("hidden"); box.innerHTML = ""; }
  else {
    box.classList.remove("hidden");
    box.innerHTML = `
      <div class="badges">
        <span class="badge">Combat ${num(p.combat) ?? combatLevel(S.levels)}</span>
        <span class="badge">${cnt(p.bank)} bank · ${cnt(p.inventory)} inventory · ${cnt(p.equipment)} worn</span>
        ${p.source === "import" ? `<span class="badge info">Imported file</span>` : ""}${num(p.bankAt) ? `<span class="badge">Bank seen ${agoLong(num(p.bankAt))}</span>` : `<span class="badge warn">Bank not seen yet: open it once in game</span>`}
        ${p.task?.name ? `<span class="badge info">Task: ${esc(p.task.name)} × ${num(p.task.amount) ?? "?"}</span>` : `<span class="badge">No slayer task</span>`}
        ${p.pluginVersion ? `<span class="badge">Plugin ${esc(p.pluginVersion)}</span>` : ""}
      </div>
      <div class="toggles">
        <label class="check"><input type="checkbox" id="rl-levels"${S.useRl !== false ? " checked" : ""} />Use ${p.source === "import" ? "imported" : "RuneLite"} levels</label>
        <label class="check"><input type="checkbox" id="rl-own"${ownOnlyActive() ? " checked" : ""}${hasBank() ? "" : " disabled"} />Only gear I own</label>
      </div>`;
    $("#rl-levels").onchange = (e) => { S.useRl = e.target.checked; if (S.useRl) adoptLevels(p); persist(); renderStats(); renderLevels(); renderTasks(); renderAll(); };
    $("#rl-own").onchange = (e) => { S.ownOnly = e.target.checked; S.overrides = {}; persist(); renderAll(); };
  }
  renderTaskBanner();
}
/* ---------- import a RuneLite export (no plugin needed) ----------
   Data Exporter (Plugin Hub): {"skills": {"Attack": {"level", "xp"}, ...}, "bank": [{"name", "id", "quantity"}], ...} per file or
   combined; its CSV is "Name,ID,Quantity" / "Skill,Level,XP". Bank Memory: "Item id<TAB>Item name<TAB>Item quantity" lines.
   The result becomes a synthetic player ({source: "import"}) that the gear and supply code treats exactly like a plugin sync. */
const IMPORT_KEY = "wildy:import";
function parseExport(text) {
  const out = { levels: {}, bank: [], names: {}, rsn: null };
  const addItem = (id, name, qty) => { id = +id; qty = +qty || 1; if (!Number.isFinite(id) || id < 0) return; out.bank.push([id, qty]); if (name) out.names[id] = String(name); };
  const addSkill = (name, level) => { const k = String(name || "").toLowerCase().trim(); const v = +level; if (SKILLS.includes(k) && Number.isFinite(v) && v > 0) out.levels[k] = clamp(Math.round(v), 1, 99); };
  const t = String(text || "").trim();
  if (!t) return out;
  let json = null; try { json = JSON.parse(t); } catch (_) {}
  // JSON Lines (the "Data Export" plugin writes one object per line): collect the lines into an array
  if (!json && /^\s*\{/.test(t)) { const arr = []; for (const l of t.split(/\r?\n/)) { const ln = l.trim(); if (!ln) continue; try { arr.push(JSON.parse(ln)); } catch (_) { arr.length = 0; break; } } if (arr.length) json = arr; }
  if (json) {
    const walk = (o) => {
      if (Array.isArray(o)) { for (const x of o) { if (x && typeof x === "object" && ("id" in x || "name" in x) && ("quantity" in x || "qty" in x)) addItem(x.id ?? ITEMS[x.name]?.id, x.name, x.quantity ?? x.qty); else if (x && typeof x === "object" && "name" in x && "level" in x) addSkill(x.name, x.level); else if (Array.isArray(x) && x.length >= 2 && Number.isFinite(+x[0])) addItem(x[0], null, x[1]); } return; }
      if (!o || typeof o !== "object") return;
      if (o.skills && typeof o.skills === "object" && !Array.isArray(o.skills)) for (const [k, v] of Object.entries(o.skills)) addSkill(k, typeof v === "object" ? v.level : v);
      if (o.levels && typeof o.levels === "object") for (const [k, v] of Object.entries(o.levels)) addSkill(k, v);
      for (const key of ["bank", "inventory", "equipment", "items"]) if (Array.isArray(o[key])) walk(o[key]);
      if (o.names && typeof o.names === "object") for (const [id, n] of Object.entries(o.names)) if (typeof n === "string") out.names[+id] = n;
      if (typeof o.rsn === "string") out.rsn = o.rsn; if (typeof o.player === "string") out.rsn = o.player;
      if (o.player && typeof o.player === "object") walk(o.player);
      // a lone skills object: {"Attack": {"level": 70}, ...}
      if (!o.skills && !o.levels) for (const [k, v] of Object.entries(o)) if (SKILLS.includes(String(k).toLowerCase()) && v && typeof v === "object" && "level" in v) addSkill(k, v.level);
    };
    walk(json);
    return out;
  }
  // text: TSV (Bank Memory) or CSV (Data Exporter); header row optional
  const lines = t.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const split = (l) => l.includes("\t") ? l.split("\t") : l.split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
  let head = split(lines[0]).map((h) => h.toLowerCase());
  let cols = null;
  if (head.some((h) => /item|name|id|quantity|skill|level/.test(h))) { cols = head; lines.shift(); }
  for (const l of lines) {
    const c = split(l); if (c.length < 2) continue;
    if (cols) {
      const g = (re) => { const i = cols.findIndex((h) => re.test(h)); return i >= 0 ? c[i] : undefined; };
      if (cols.some((h) => /skill/.test(h))) { addSkill(g(/skill/), g(/level/)); continue; }
      addItem(g(/id/) ?? ITEMS[g(/name/)]?.id, g(/name/), g(/quantity|qty|count/) ?? 1); continue;
    }
    // no header: guess by shape
    const nums = c.map((x) => Number.isFinite(+x) && x !== "");
    if (c.length >= 3 && nums[0] && !nums[1]) addItem(c[0], c[1], c[2]);                 // id, name, qty
    else if (c.length >= 3 && nums[0] && nums[1] && !nums[2]) addItem(c[0], c[2], c[1]);  // id, qty, name (Data Export CSV)
    else if (c.length >= 3 && !nums[0] && nums[1]) addItem(c[1], c[0], c[2]);           // name, id, qty
    else if (c.length === 2 && !nums[0] && nums[1]) { if (SKILLS.includes(c[0].toLowerCase())) addSkill(c[0], c[1]); else addItem(ITEMS[c[0]]?.id, c[0], c[1]); }
  }
  return out;
}
function applyImport(parsed, { merge = true } = {}) {
  const prev = merge && SYNC.player?.source === "import" ? SYNC.player : null;
  const levels = { ...(prev?.levels || {}), ...parsed.levels };
  const bank = parsed.bank.length ? parsed.bank : (prev?.bank || []);
  const names = { ...(prev?.names || {}), ...parsed.names };
  if (!Object.keys(levels).length && !bank.length) return null;
  const player = { source: "import", rsn: parsed.rsn || prev?.rsn || S.rsn || null, levels: Object.keys(levels).length ? levels : null, bank, inventory: [], equipment: [], names, bankAt: bank.length ? Date.now() : prev?.bankAt || null, importedAt: Date.now() };
  try { localStorage.setItem(IMPORT_KEY, JSON.stringify(player)); } catch (_) {}
  SYNC.playerAt = null; onPlayer(player);
  return player;
}
function clearImport() { try { localStorage.removeItem(IMPORT_KEY); } catch (_) {} if (SYNC.player?.source === "import") { SYNC.player = null; rebuildOwned(); if (S.ownOnly) S.ownOnly = null; persist(); renderLevels(); renderTasks(); renderAll(); renderRl(); } renderImport(); }
function restoreImport() { try { const p = JSON.parse(localStorage.getItem(IMPORT_KEY) || "null"); if (p && p.source === "import") { SYNC.player = p; rebuildOwned(); if (S.useRl !== false) adoptLevels(p); } } catch (_) {} }
function renderImport() {
  const msg = $("#import-msg"), clr = $("#import-clear"); if (!msg) return;
  const p = SYNC.player;
  if (p?.source === "import") { msg.innerHTML = `<span class="ok">Imported${p.rsn ? " " + esc(p.rsn) : ""}:</span> ${p.levels ? Object.keys(p.levels).length + " skills" : "no skills (use the hiscores lookup)"}, ${cnt(p.bank)} bank items, ${agoLong(p.importedAt)}. Gear below is built from what you own; untick "Only gear I own" to see everything.`; clr.classList.remove("hidden"); }
  else { msg.textContent = ""; clr.classList.add("hidden"); }
}
function initImport() {
  const go = $("#import-go"); if (!go) return;
  const run = async (texts) => {
    const parsed = { levels: {}, bank: [], names: {}, rsn: null };
    for (const tx of texts) { const p = parseExport(tx); Object.assign(parsed.levels, p.levels); parsed.bank.push(...p.bank); Object.assign(parsed.names, p.names); parsed.rsn = p.rsn || parsed.rsn; }
    if (!Object.keys(parsed.levels).length && !parsed.bank.length) { $("#import-msg").innerHTML = `<span class="err">Nothing recognised.</span> Expected Data Exporter JSON/CSV or a Bank Memory item list.`; return; }
    S.useRl = true; applyImport(parsed); renderImport(); toast(`Imported ${parsed.bank.length ? parsed.bank.length + " bank items" : ""}${parsed.bank.length && Object.keys(parsed.levels).length ? " and " : ""}${Object.keys(parsed.levels).length ? Object.keys(parsed.levels).length + " skills" : ""}`);
    $("#import-text").value = "";
  };
  go.addEventListener("click", () => run([$("#import-text").value]));
  $("#import-file").addEventListener("change", async (e) => { const files = [...e.target.files]; if (!files.length) return; run(await Promise.all(files.map((f) => f.text()))); e.target.value = ""; });
  // drag and drop: files dropped anywhere on the page import; the overlay shows while something is being dragged over
  const zone = $("#drop-zone"); let depth = 0;
  const hasFiles = (e) => e.dataTransfer && [...(e.dataTransfer.types || [])].includes("Files");
  document.addEventListener("dragenter", (e) => { if (!hasFiles(e)) return; e.preventDefault(); depth++; zone.classList.add("show"); });
  document.addEventListener("dragover", (e) => { if (!hasFiles(e)) return; e.preventDefault(); e.dataTransfer.dropEffect = "copy"; });
  document.addEventListener("dragleave", (e) => { if (!hasFiles(e)) return; depth = Math.max(0, depth - 1); if (!depth) zone.classList.remove("show"); });
  document.addEventListener("drop", async (e) => {
    if (!hasFiles(e)) return; e.preventDefault(); depth = 0; zone.classList.remove("show");
    const files = [...e.dataTransfer.files].filter((f) => f.size < 20e6); if (!files.length) return;
    $("#rl-import").open = true;
    run(await Promise.all(files.map((f) => f.text())));
    $("#runelite").scrollIntoView({ behavior: "smooth", block: "start" });
  });
  window.__wildy.importTexts = run;
  $("#import-clear").addEventListener("click", clearImport);
  renderImport();
}
function initSync() {
  const url = new URL(location.href), qc = url.searchParams.get("code");
  if (qc != null) { url.searchParams.delete("code"); try { history.replaceState(null, "", url.pathname + url.search + url.hash); } catch (_) {} }
  let code = normCode(qc);
  if (!validCode(code)) { try { code = normCode(localStorage.getItem("wildy:code")); } catch (_) { code = ""; } }
  if (!validCode(code)) code = genCode();
  restoreImport();
  setCode(code, { render: false }); renderRl(); renderPresets(); initImport(); // the restored active setup marks its row "current"
  $("#rl-copy").addEventListener("click", async () => { const c = fmtCode(SYNC.code); try { await navigator.clipboard.writeText(c); toast("Code copied: " + c); } catch (_) { try { const r = document.createRange(); r.selectNodeContents($("#rl-code")); const s = getSelection(); s.removeAllRanges(); s.addRange(r); } catch (__) {} toast("Select the code and copy it: " + c); } });
  $("#rl-new").addEventListener("click", () => { setCode(genCode()); toast("New code: " + fmtCode(SYNC.code) + ". Update the plugin's settings."); });
  $("#rl-form").addEventListener("submit", (e) => { e.preventDefault(); const v = normCode($("#rl-input").value); if (!validCode(v)) { toast("A code is 8 letters or digits, like ABCD-2345"); return; } setCode(v); $("#rl-input").value = ""; toast("Using code " + fmtCode(v)); });
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") { if (SYNC.code) { startPolling(); poll(); } } else stopPolling(); });
  setInterval(() => { if (document.visibilityState === "visible" && SYNC.code) renderRlStatus(); }, 1000);
}

/* ---------- wiring ---------- */
function renderAll() { renderDetail(); renderLoadout(); }
function init() {
  $("#rsn").value = S.rsn || "";
  renderStats(); renderLevels(); renderMasters(); renderTasks(); renderPresets(); renderAll();
  $("#rsn-form").addEventListener("submit", (e) => { e.preventDefault(); const v = $("#rsn").value.trim(); if (v) lookup(v); });
  $("#task-q").addEventListener("input", renderTasks);
  $("#task-filters").addEventListener("click", (e) => { const b = e.target.closest(".chip"); if (!b) return; S.filter = b.dataset.f; $$("#task-filters .chip").forEach((c) => c.setAttribute("aria-pressed", c === b)); renderTasks(); });
  $("#task-grid").addEventListener("click", (e) => { const b = e.target.closest(".task"); if (b) pickTask(b.dataset.id); });
  $("#preset-form").addEventListener("submit", (e) => { e.preventDefault(); const name = $("#preset-name").value.trim() || (task()?.name || "Setup") + " " + new Date().toLocaleDateString(); const s = newSetup(name); setActiveSetup(s); saveSetups([s, ...setups()]); $("#preset-name").value = ""; schedulePush(); });
  $("#preset-export").addEventListener("click", () => { const blob = new Blob([JSON.stringify(setups(), null, 2)], { type: "application/json" }); const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "wildy-slayer-setups.json"; a.click(); });
  $("#preset-import").addEventListener("change", async (e) => { const f = e.target.files[0]; if (!f) return; try { const arr = JSON.parse(await f.text()); if (!Array.isArray(arr)) throw new Error("not a setups file"); const inc = arr.map(migrateSetup).filter(Boolean); const have = new Set(inc.map((s) => s.id)); saveSetups([...inc, ...setups().filter((s) => !have.has(s.id))]); } catch (err) { alert("Could not import: " + err.message); } e.target.value = ""; });
  initSync();
  loadPrices().then(() => renderAll()).catch((e) => { console.warn(e); const el = $("#lookup-msg"); el.innerHTML += ` <span class="err">Prices unavailable right now.</span>`; });
}
init();
})();
