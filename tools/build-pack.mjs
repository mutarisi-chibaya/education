// Turns a filled-in intake folder into a university's content pack.
//
//   node tools/build-pack.mjs intake/<folder>
//
// It writes content/institutions/<id>.json, lists it in the institution
// index and the offline cache, then runs the pack check. Nothing is
// published if the check finds errors. See intake/README.md for the sheets.
import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { POSITIONS, readCsv, readJson, text, list, writeDirectory } from './pack-lib.mjs';
import { checkPack } from './pack-check.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const folder = process.argv[2];
if (!folder || !existsSync(join(folder, 'university.csv'))) {
  console.error('Usage: node tools/build-pack.mjs intake/<folder>   (the folder needs university.csv)');
  process.exit(2);
}
const sheet = (name) => readCsv(join(folder, name));
const problems = [];
const num = (v, what) => { const n = Number(v); if (v && !Number.isFinite(n)) problems.push(`${what}: "${v}" is not a number`); return v ? n : undefined; };
const clean = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== '' && !(Array.isArray(v) && !v.length)));

// ---- university.csv: one row per setting ----
const u = Object.fromEntries(sheet('university.csv').map((r) => [r.key, r.value]));
const pair = (key) => (u[`${key}_en`] ? { en: u[`${key}_en`], ...(u[`${key}_zu`] ? { zu: u[`${key}_zu`] } : {}) } : undefined);
const id = u.id;
if (!id) { console.error('university.csv has no "id" row'); process.exit(2); }
const target = resolve(ROOT, `content/institutions/${id}.json`);
const previous = existsSync(target) ? readJson(target) : null;
const palette = (prefix) => {
  const c = clean({ brand: u[`${prefix}colour_brand`], brandInk: u[`${prefix}colour_brand_text`], accent: u[`${prefix}colour_accent`], accentInk: u[`${prefix}colour_accent_text`] });
  return Object.keys(c).length ? c : undefined;
};

// ---- buildings.csv ----
const maps = {};
for (const r of sheet('buildings.csv')) {
  const pos = POSITIONS[r.position];
  if (!pos) { problems.push(`buildings.csv: ${r.building_id} has position "${r.position}"; use one of ${Object.keys(POSITIONS).join(', ')}`); continue; }
  (maps[r.campus_id || ''] ||= []).push({
    id: r.building_id, name: text(r, 'name'), x: pos.x, y: pos.y, w: pos.w, h: pos.h,
    directions: text(r, 'directions') || { en: pos.en, zu: pos.zu },
  });
}

// ---- services.csv: blank campus_id means the whole university ----
const support = {};
for (const r of sheet('services.csv')) {
  const contacts = [];
  if (r.phone) contacts.push({ label: `${r.phone_label || r.name_en || r.service_id} ${r.phone}`, tel: r.phone.replace(/[^\d+]/g, '') });
  if (r.website) contacts.push(clean({ label: r.website.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, ''), url: r.website, preview: text(r, 'website_about') }));
  const entry = clean({
    name: text(r, 'name'), offers: text(r, 'offers'), reach: text(r, 'how_to_reach'),
    building: r.located_elsewhere_en ? null : r.building_id || undefined,
    room: text(r, 'room'), hours: text(r, 'hours'), away: text(r, 'located_elsewhere'),
    email: r.email, page: r.page_id, contacts,
    verified: Boolean(r.verified_by && r.last_checked), verified_by: r.verified_by, last_checked: r.last_checked || null,
  });
  if (r.located_elsewhere_en) entry.building = null;
  ((support[r.campus_id || ''] ||= {}))[r.service_id] = entry;
}

// ---- pages.csv and page-items.csv ----
const pages = {};
for (const r of sheet('pages.csv')) (pages[r.campus_id || ''] ||= {})[r.page_id] = clean({ title: text(r, 'title'), intro: text(r, 'intro'), note: text(r, 'note'), url: r.website, items: [] });
for (const r of sheet('page-items.csv')) {
  const page = pages[r.campus_id || '']?.[r.page_id];
  if (!page) { problems.push(`page-items.csv: page "${r.page_id}" is not in pages.csv`); continue; }
  (page.items ||= []).push({ name: r.name, detail: text(r, 'detail') });
}

// ---- cards.csv: switch off or reword; extra-cards.json: the university's own cards ----
const cards = {};
for (const r of sheet('cards.csv')) {
  const c = (cards[r.campus_id || ''] ||= { off: [], edit: {} });
  if (r.action === 'off') c.off.push(r.card_id);
  else if (r.action === 'edit') {
    const [kind, choiceId, field] = r.field.split(':');
    const value = text(r, 'text');
    const edit = (c.edit[r.card_id] ||= {});
    if (kind === 'choice') ((edit.choices ||= {})[choiceId] ||= {})[field] = value;
    else edit[kind] = value;
  } else problems.push(`cards.csv: action "${r.action}" for ${r.card_id}; use "off" or "edit"`);
}
const extra = existsSync(join(folder, 'extra-cards.json')) ? readJson(join(folder, 'extra-cards.json')) : null;
if (extra) (cards[''] ||= { off: [], edit: {} }).add = extra;
const cardsFor = (key) => (cards[key] ? clean({ off: cards[key].off, edit: Object.keys(cards[key].edit).length ? cards[key].edit : undefined, add: cards[key].add }) : undefined);

// ---- campuses.csv (optional: leave it out for a one-campus university) ----
const campuses = sheet('campuses.csv').map((r) => clean({
  id: r.campus_id, name: text(r, 'name'), desc: text(r, 'description'), courses: list(r.courses),
  costs: clean({ rent_private: num(r.rent_private, `${r.campus_id} rent`), taxi_week: num(r.taxi_week, `${r.campus_id} taxi`) }),
  map: maps[r.campus_id] ? { buildings: maps[r.campus_id] } : undefined,
  support: support[r.campus_id], pages: pages[r.campus_id], cards: cardsFor(r.campus_id),
}));
for (const key of Object.keys({ ...maps, ...support, ...pages })) if (key && !campuses.some((c) => c.id === key)) problems.push(`campus "${key}" is used in a sheet but is not in campuses.csv`);

const pack = clean({
  id,
  version: (previous?.version || 0) + 1,
  name: pair('name'),
  short: u.short,
  campus: pair('tagline'),
  city: pair('city'),
  area: u.area || u.short,
  status: u.status || 'licensed',
  type: u.type || 'university',
  province: u.province || undefined,
  licence: u.licence_tier || u.licence_expires ? clean({ tier: u.licence_tier, expires: u.licence_expires }) : undefined,
  courseList: sheet('courses.csv').map((r) => ({ id: r.course_id, label: text(r, 'label'), modules: [text(r, 'module1'), text(r, 'module2')], ...(text(r, 'module3') ? { otherModule: text(r, 'module3') } : {}) })),
  costIndex: 1,
  costs: clean({ rent_private: num(u.rent_private, 'rent_private'), taxi_week: num(u.taxi_week, 'taxi_week') }),
  suppCode: u.supp_code,
  courses: list(u.courses),
  housing: list(u.housing),
  brand: clean({ name: u.brand_name, logo: u.logo_text, colors: palette(''), colorsDark: palette('dark_') }),
  signedOff: clean({ by: u.signed_off_by, date: u.signed_off_date }),
  map: maps[''] ? { buildings: maps[''] } : undefined,
  support: support[''] || {},
  pages: pages[''],
  cards: cardsFor(''),
  campuses,
});
if (!Object.keys(pack.brand || {}).length) delete pack.brand;
if (!Object.keys(pack.signedOff || {}).length) delete pack.signedOff;

if (problems.length) {
  for (const p of problems) console.log(`  ERROR    ${p}`);
  console.log(`\n${id}: the intake sheets have ${problems.length} problem(s). Nothing was written.`);
  process.exit(1);
}

// Write it, check it, and only keep it if the check passes.
const before = previous ? readFileSync(target, 'utf8') : null;
writeFileSync(target, `${JSON.stringify(pack, null, 2)}\n`);
const { errors, warnings } = checkPack(id);
for (const w of warnings) console.log(`  warning  ${w}`);
for (const e of errors) console.log(`  ERROR    ${e}`);
if (errors.length) {
  if (before) writeFileSync(target, before); else unlinkSync(target);
  console.log(`
${id}: ${errors.length} error(s). The pack was not published.`);
  process.exit(1);
}

// List it in the directory. Phones download the pack itself only when a
// student chooses this institution, and refresh it quietly after that.
writeDirectory(ROOT);
console.log(`\n${id}: version ${pack.version} published to content/institutions/${id}.json (${warnings.length} warning(s)).`);
