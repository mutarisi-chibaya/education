// Builds the playable content pack for one institution: shared content
// (core.json), the chapter files (one per journey chapter), and the
// institution's own file, which only overrides what differs. All cards, minis
// and tips are data, not code.
//
// Packs are bundled with the app, so it plays offline. When a server is
// reachable it may supply a newer pack (GET packs/{institution}); if it is
// down, asleep or slow, the bundled pack is used silently.

const roundTo = (n, step) => Math.round(n / step) * step;
const PACK_TIMEOUT = 2500;

// A campus phone number is only shown while its verification is fresh. After
// this many days without a re-check it is hidden, and the card falls back to
// "how to reach it" and the national lines, which are always kept.
const STALE_DAYS = 400;

function mergeSupport(core, own = {}, now = Date.now()) {
  const out = {};
  for (const [id, base] of Object.entries(core)) {
    const mine = own[id] || {};
    const fresh = mine.last_checked && now - Date.parse(mine.last_checked) < STALE_DAYS * 864e5;
    const local = (mine.contacts || []).filter((c) => !c.tel || fresh);
    out[id] = {
      ...base,
      ...mine,
      verified: Boolean(mine.verified ?? base.verified),
      // Local contacts first, national lines (NSFAS, SADAG, Higher Health) always kept.
      contacts: [...local, ...(base.contacts || [])],
    };
    if (!out[id].contacts.length) delete out[id].contacts;
  }
  return out;
}

// Pack costs are per real week; a game week is about two real weeks.
function weeklyCostsFor(h, inst) {
  const index = inst.costIndex || 1;
  const costs = Object.fromEntries(Object.entries(h.weeklyCosts).map(([k, v]) => [k, roundTo(v * index, 25)]));
  if (h.id === 'commuting' && inst.costs?.taxi_week) costs.transport = inst.costs.taxi_week * 2;
  return costs;
}

// ---------- a university's own changes to the cards ----------
//
// "cards" in an institution (or campus) file can switch cards off, reword
// them, and add its own:
//   { "off": ["ARR-03"],
//     "edit": { "FT-02": { "title": {...}, "choices": { "gym": { "label": {...} } } } },
//     "add": { "first_term": [ { ...card } ] } }
// Only wording can be edited. Effects, flags and conditions are game rules;
// tools/pack-check.mjs rejects a pack that tries to change them.

function mergeCards(a = {}, b = {}) {
  const add = { ...a.add };
  for (const [ch, list] of Object.entries(b.add || {})) add[ch] = [...(add[ch] || []), ...list];
  return { off: [...(a.off || []), ...(b.off || [])], edit: { ...a.edit, ...b.edit }, add };
}

function editCard(card, edit) {
  if (!edit) return card;
  const { choices, ...rest } = edit;
  const out = { ...card, ...rest };
  if (choices && card.choices) out.choices = card.choices.map((c) => (choices[c.id] ? { ...c, ...choices[c.id] } : c));
  return out;
}

function applyCards(events, cards, where) {
  const off = new Set(cards.off || []);
  return [...events.filter((e) => !off.has(e.id)).map((e) => editCard(e, cards.edit?.[e.id])), ...(cards.add?.[where] || [])];
}

// A university can have several campuses. A campus is one more layer: it can
// change the map, where each service is, local costs, demo pages and which
// courses are offered. Everything it doesn't mention comes from the university.
function withCampus(inst, campusId) {
  const campus = (inst.campuses || []).find((c) => c.id === campusId) || inst.campuses?.[0] || null;
  if (!campus) return { inst, campus: null };
  const ids = new Set([...Object.keys(inst.support || {}), ...Object.keys(campus.support || {})]);
  return {
    campus,
    inst: {
      ...inst,
      campus: campus.name,
      costs: { ...inst.costs, ...campus.costs },
      map: campus.map || inst.map,
      pages: { ...inst.pages, ...campus.pages },
      cards: mergeCards(inst.cards, campus.cards),
      support: Object.fromEntries([...ids].map((id) => [id, { ...inst.support?.[id], ...campus.support?.[id] }])),
    },
  };
}

export function mergeContent(core, university, chapterIndex, chapterFiles, campusId, now = Date.now()) {
  const { inst, campus } = withCampus(university, campusId);
  const cards = mergeCards(inst.cards);
  const off = new Set(cards.off);
  const coreEvents = applyCards(core.events, cards, 'core');
  chapterFiles = chapterFiles.map((c) => ({ ...c, events: applyCards(c.events, cards, c.id), minis: (c.minis || []).filter((m) => !off.has(m.id)) }));
  const chapters = Object.fromEntries(chapterFiles.map((c) => [c.id, c]));
  const order = chapterIndex.map((c) => ({ ...c, ...(chapters[c.id] ? { title: chapters[c.id].title, subtitle: chapters[c.id].subtitle } : {}) }));
  const eventIndex = {};
  for (const e of coreEvents) eventIndex[e.id] = { ...e, chapter: null };
  for (const c of chapterFiles) for (const e of c.events) eventIndex[e.id] = { ...e, chapter: c.id };
  const miniIndex = {};
  const coreMinis = (core.minis || []).filter((m) => !off.has(m.id));
  for (const m of coreMinis) miniIndex[m.id] = m;
  for (const c of chapterFiles) for (const m of c.minis || []) miniIndex[m.id] = { ...m, chapter: c.id };
  return {
    ...core,
    id: inst.id,
    version: packVersion(core, inst),
    name: inst.name,
    short: inst.short,
    campus: inst.campus,
    area: inst.area,
    city: inst.city,
    status: inst.status,
    events: coreEvents,
    minis: coreMinis,
    brand: inst.brand || null,
    campusId: campus?.id || null,
    campuses: university.campuses || [],
    // A campus, or a university, can offer only some courses and housing options.
    // An institution can also bring courses of its own (`courseList`).
    courses: [...core.courses.filter((c) => !(inst.courseList || []).some((x) => x.id === c.id)), ...(inst.courseList || [])]
      .filter((c) => (campus?.courses || inst.courses || [c.id]).includes(c.id)),
    type: inst.type || 'university',
    costs: inst.costs || {},
    // The code a student sees when admitted to a supplementary exam: every university has its own.
    suppCode: inst.suppCode || core.suppCode,
    map: inst.map || null,
    pages: inst.pages || {},
    housing: core.housing.filter((h) => !inst.housing || inst.housing.includes(h.id)).map((h) => ({ ...h, weeklyCosts: weeklyCostsFor(h, inst) })),
    support: mergeSupport(core.support, inst.support, now),
    chapters,
    chapterOrder: order,
    eventIndex,
    miniIndex,
  };
}

// One number for the whole pack, stored with the saved game.
export function packVersion(core, inst) {
  return (core.version || 0) * 1000 + (inst.version || 0);
}

// Browser loaders (cached by the service worker for offline play).
async function getJson(url, timeout) {
  const ctrl = timeout ? new AbortController() : null;
  const timer = ctrl ? setTimeout(() => ctrl.abort(), timeout) : null;
  try {
    const res = await fetch(url, ctrl ? { signal: ctrl.signal } : undefined);
    if (!res.ok) throw new Error(`Failed to load ${url}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

// The shared content and a short directory of institutions. An institution's
// own pack is only downloaded when a student chooses it (loadInstitution),
// so a phone never carries the other campuses.
export async function loadCatalogue() {
  const [core, directory, chapterIndex, realities] = await Promise.all([
    getJson('content/core.json'),
    getJson('content/institutions/index.json'),
    getJson('content/chapters/index.json'),
    getJson('content/realities.json'),
  ]);
  const chapterFiles = await Promise.all(chapterIndex.filter((c) => c.status === 'built').map((c) => getJson(`content/chapters/${c.id}.json`)));
  return { core, directory, institutions: [], chapterIndex, chapterFiles, realities };
}

export async function loadInstitution(catalogue, id) {
  const have = catalogue.institutions.find((i) => i.id === id);
  if (have) return have;
  if (!catalogue.directory.some((d) => d.id === id)) throw new Error(`Unknown institution ${id}`);
  const inst = await getJson(`content/institutions/${encodeURIComponent(id)}.json`);
  catalogue.institutions.push(inst);
  return inst;
}

// Institutions a student can choose today: a lapsed licence drops out of the list.
export function openDirectory(directory, today = new Date().toISOString().slice(0, 10)) {
  return directory.filter((d) => !d.licence?.expires || d.licence.expires >= today);
}

// Search by the institution's name or short name. Every word typed has to
// start a word of the name, so "cape tech" finds "Cape Peninsula University
// of Technology" and "uni 4" does not find "University 14".
export function searchDirectory(directory, query, lang = 'en') {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return directory;
  return directory.filter((d) => {
    const names = [d.name?.[lang], d.name?.en, d.short?.en || d.short].filter((x) => typeof x === 'string')
      .join(' ').toLowerCase().split(/[^\p{L}\p{N}]+/u);
    return words.every((w) => names.some((n) => n.startsWith(w)));
  });
}

// Ask the server for a newer pack. Returns an updated catalogue, or null to
// keep the bundled one (server down, asleep, slow, or nothing newer). `latest`
// is the version the server's short directory reported: when the phone already
// has it, the pack itself is not downloaded, which saves the student's data.
export async function fetchNewerPack(catalogue, id, latest) {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return null;
  try {
    const bundled = catalogue.institutions.find((i) => i.id === id);
    if (bundled && latest !== undefined && !(latest > packVersion(catalogue.core, bundled))) return null;
    const pack = await getJson(`packs/${encodeURIComponent(id)}`, PACK_TIMEOUT);
    const src = pack?.source;
    if (!bundled || !src?.core || !src.institution || !Array.isArray(src.chapters)) return null;
    if (!(pack.version > packVersion(catalogue.core, bundled))) return null;
    return {
      ...catalogue,
      core: src.core,
      institutions: catalogue.institutions.map((i) => (i.id === id ? src.institution : i)),
      chapterIndex: src.chapterIndex || catalogue.chapterIndex,
      chapterFiles: src.chapters,
    };
  } catch {
    return null;
  }
}
