// Checks one university's content pack before it is published.
//
//   node tools/pack-check.mjs <institution id>            check a pack
//   node tools/pack-check.mjs <institution id> --online   also test that links answer
//
// Errors block publishing (exit code 1); warnings are worth a look. The same
// check runs in `npm test` for every bundled pack.
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  newJourney, startChapter, backToMap, eventForWeek, openEvent, choose, acknowledge, advance, friday, nextWeek, setPhase,
  affordableChoices, currentMini, answerMini, TAGS,
} from '../js/engine.js';
import { mergeContent } from '../js/content.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => JSON.parse(readFileSync(resolve(ROOT, p), 'utf8'));

// What a university may reword on an existing card. Effects, flags and
// conditions are game rules and stay locked.
const CARD_FIELDS = ['title', 'text', 'research'];
const CHOICE_FIELDS = ['label', 'outcome', 'tip', 'support'];
const CARD_TYPES = ['core', 'situational', 'random', 'recurring', 'friend_story', 'what_if', 'win', 'light'];
const words = (s) => s.trim().split(/\s+/).length;
const sentences = (s) => (s.match(/[.!?]+(?=\s|$|")/g) || []).length;
const HEX = /^#[0-9a-f]{6}$/i;
const EMAIL = /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i;

// WCAG contrast ratio between two hex colours.
function contrast(a, b) {
  const lum = (hex) => {
    const [r, g, bl] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

function load() {
  const index = read('content/chapters/index.json');
  return { core: read('content/core.json'), index, chapters: index.filter((c) => c.status === 'built').map((c) => read(`content/chapters/${c.id}.json`)) };
}

// Play every chapter to its forecast, the way the tests do.
function playThrough(content, setup, pick) {
  let s = newJourney(content, setup, { seed: 7 });
  for (const ch of content.chapterOrder.filter((c) => c.status === 'built')) {
    s = setPhase(startChapter(content, s, ch.id), 'dashboard');
    for (let guard = 0; s.phase !== 'forecast'; guard++) {
      if (guard > 400) throw new Error(`${ch.id} does not finish`);
      if (s.phase === 'dashboard') {
        if (currentMini(content, s) && s.mini.choice === null) s = answerMini(content, s, 0);
        s = eventForWeek(content, s) ? openEvent(content, s) : advance(content, s);
      } else if (s.phase === 'note') s = setPhase(s, 'event');
      else if (s.phase === 'event') {
        const ev = eventForWeek(content, s);
        if (ev.choices) {
          const open = affordableChoices(s, ev);
          const want = pick(ev).id;
          s = choose(content, s, open.includes(want) ? want : open[0]);
        } else if (ev.type === 'results') s = nextWeek(content, s);
        else if (ev.type === 'tests') s = advance(content, s);
        else s = acknowledge(content, s);
      } else if (s.phase === 'friday') s = friday(content, s, s.fridayStep === 'habit' ? 'sometimes' : 'no');
      else s = advance(content, s);
    }
    s = backToMap(s);
  }
  return s;
}

export function checkPack(id, pack) {
  const errors = [];
  const warnings = [];
  const err = (m) => errors.push(m);
  const warn = (m) => warnings.push(m);
  const path = `content/institutions/${id}.json`;
  if (!pack && !existsSync(resolve(ROOT, path))) return { errors: [`${path} does not exist`], warnings };
  const inst = pack || read(path);
  const { core, index, chapters } = load();
  const demo = inst.status === 'demo';
  const allCards = [...core.events, ...chapters.flatMap((c) => c.events)];
  const allMinis = [...(core.minis || []), ...chapters.flatMap((c) => c.minis || [])];
  const cardById = Object.fromEntries(allCards.map((e) => [e.id, e]));
  const pools = new Set(allCards.map((e) => e.pool).filter(Boolean));

  const needText = (t, where, { zu = true } = {}) => {
    if (!t || (typeof t === 'object' && !t.en)) return err(`${where}: missing text`);
    if (typeof t === 'object' && zu && !t.zu) warn(`${where}: no isiZulu, English will show`);
    return undefined;
  };

  // ---- identity ----
  if (inst.id !== id) err(`id is "${inst.id}" but the file is ${id}.json`);
  if (!/^[a-z][a-z0-9-]{1,30}$/.test(inst.id || '')) err('id must be lower-case letters, digits and hyphens');
  needText(inst.name, 'name');
  if (!inst.short) err('short name is missing');
  if (!['demo', 'licensed'].includes(inst.status)) err(`status must be "demo" or "licensed", not "${inst.status}"`);
  if (!Number.isInteger(inst.version) || inst.version < 1) err('version must be a whole number, raised with every change');
  for (const k of ['rent_private', 'taxi_week']) if (!(inst.costs?.[k] > 0)) err(`costs.${k} must be a positive amount in rand`);
  if (!demo && !(inst.signedOff?.by && /^\d{4}-\d{2}-\d{2}$/.test(inst.signedOff?.date || ''))) err('a licensed pack needs signedOff.by and signedOff.date from Student Affairs');
  // An institution can bring its own courses (a college's programmes, for example).
  const knownCourses = new Set([...core.courses, ...(inst.courseList || [])].map((x) => x.id));
  for (const c of inst.courseList || []) {
    if (!/^[a-z][a-z0-9_]{1,20}$/.test(c.id || '')) err(`course "${c.id}" needs a short lower-case id`);
    needText(c.label, `course ${c.id} label`);
    if (c.modules?.length !== 2 || !c.modules.every((m) => m?.en)) err(`course "${c.id}" needs exactly two key modules`);
  }
  for (const c of inst.courses || []) if (!knownCourses.has(c)) err(`course "${c}" is not a known course`);
  if (!['university', 'tvet', 'private'].includes(inst.type || 'university')) err(`type must be university, tvet or private, not "${inst.type}"`);
  if (!demo) {
    if (!inst.licence?.tier || !/^\d{4}-\d{2}-\d{2}$/.test(inst.licence?.expires || '')) err('a licensed pack needs licence.tier and licence.expires');
    else if (Date.parse(inst.licence.expires) - Date.now() < 60 * 864e5) warn(`the licence expires on ${inst.licence.expires}`);
  }
  for (const h of inst.housing || []) if (!core.housing.some((x) => x.id === h)) err(`housing "${h}" is not a known option`);
  if (inst.housing && !inst.housing.length) err('at least one housing option is needed');

  // ---- branding ----
  for (const [mode, colors] of [['colors', inst.brand?.colors], ['colorsDark', inst.brand?.colorsDark]]) {
    if (!colors) { if (inst.brand && mode === 'colorsDark') warn('brand has no dark-mode colours: dark mode keeps the default palette'); continue; }
    for (const k of ['brand', 'brandInk', 'accent', 'accentInk']) if (!HEX.test(colors[k] || '')) err(`brand.${mode}.${k} must be a hex colour like #12355b`);
    if (HEX.test(colors.brand || '') && HEX.test(colors.brandInk || '') && contrast(colors.brand, colors.brandInk) < 4.5) err(`brand.${mode}: text on the brand colour is too hard to read (contrast ${contrast(colors.brand, colors.brandInk).toFixed(1)}, needs 4.5)`);
  }
  if (inst.brand?.logo && inst.brand.logo.length > 3) err('brand.logo is a monogram of at most 3 characters');

  // ---- services, per campus ----
  const campuses = inst.campuses?.length ? inst.campuses : [null];
  const seenCampus = new Set();
  for (const campus of campuses) {
    const where = campus ? `campus ${campus.id}` : 'university';
    if (campus) {
      if (seenCampus.has(campus.id)) err(`${where}: duplicate campus id`);
      seenCampus.add(campus.id);
      needText(campus.name, `${where}: name`);
      if (!campus.courses?.length) err(`${where}: lists no courses`);
      for (const c of campus.courses || []) if (!knownCourses.has(c)) err(`${where}: course "${c}" is not a known course`);
    }
    for (const sid of Object.keys({ ...inst.support, ...campus?.support })) if (!core.support[sid]) err(`${where}: "${sid}" is not a known service`);
    let content;
    try { content = mergeContent(core, inst, index, chapters, campus?.id); } catch (e) { err(`${where}: cannot be merged: ${e.message}`); continue; }
    const buildings = content.map?.buildings || [];
    if (content.map?.url && !/^https:\/\//.test(content.map.url)) err(`${where}: the campus map link must start with https://`);
    const ids = new Set();
    for (const b of buildings) {
      if (ids.has(b.id)) err(`${where}: building "${b.id}" appears twice`);
      ids.add(b.id);
      needText(b.name, `${where}: building ${b.id} name`);
      needText(b.directions, `${where}: building ${b.id} directions`);
      if (!(b.x >= 0 && b.y >= 0 && b.x + b.w <= 320 && b.y + b.h <= 232)) err(`${where}: building "${b.id}" is off the map`);
    }
    for (const [sid, s] of Object.entries(content.support)) {
      const at = `${where}: ${sid}`;
      if (s.building && !ids.has(s.building)) err(`${at}: building "${s.building}" is not on this campus's map`);
      if (s.page && !content.pages[s.page]) err(`${at}: page "${s.page}" does not exist`);
      if (s.email) {
        if (!EMAIL.test(s.email)) err(`${at}: "${s.email}" is not an email address`);
        else if (demo && !s.email.endsWith('.example')) err(`${at}: a fictional pack may only use ".example" email addresses`);
        else if (!demo && s.email.endsWith('.example')) err(`${at}: "${s.email}" is a placeholder address`);
      }
      const own = [...(inst.support?.[sid]?.contacts || []), ...(campus?.support?.[sid]?.contacts || [])];
      for (const c of own) {
        if (c.tel) {
          if (demo) err(`${at}: a fictional pack must not carry phone numbers`);
          if (!/^\+?\d{5,13}$/.test(c.tel)) err(`${at}: phone "${c.tel}" must be digits only`);
          if (!(s.verified && /^\d{4}-\d{2}-\d{2}$/.test(s.last_checked || ''))) err(`${at}: phone ${c.label} is not marked verified with a last_checked date`);
          else if (Date.now() - Date.parse(s.last_checked) > 366 * 864e5) warn(`${at}: phone was last checked on ${s.last_checked}, over a year ago`);
        }
        if (c.url && !/^https:\/\//.test(c.url)) err(`${at}: link "${c.url}" must start with https://`);
      }
    }
    for (const [pid, p] of Object.entries(content.pages)) {
      needText(p.title, `${where}: page ${pid} title`);
      if (!p.items?.length) err(`${where}: page ${pid} has no items`);
      if (p.url && !/^https:\/\//.test(p.url)) err(`${where}: page ${pid} link must start with https://`);
      if (!demo && !p.url) warn(`${where}: page ${pid} has no official web address`);
    }

    // ---- card changes ----
    const cards = { ...inst.cards, ...campus?.cards };
    for (const cid of [...(inst.cards?.off || []), ...(campus?.cards?.off || [])]) {
      if (!cardById[cid] && !allMinis.some((m) => m.id === cid)) err(`${where}: cannot switch off "${cid}": no such card`);
      if (cardById[cid]?.type === 'tests' || cardById[cid]?.type === 'results') err(`${where}: "${cid}" is a test or results card and cannot be switched off`);
    }
    for (const [cid, edit] of Object.entries({ ...inst.cards?.edit, ...campus?.cards?.edit })) {
      const card = cardById[cid];
      if (!card) { err(`${where}: cannot reword "${cid}": no such card`); continue; }
      for (const k of Object.keys(edit)) if (k !== 'choices' && !CARD_FIELDS.includes(k)) err(`${where}: ${cid}.${k} is a game rule and cannot be changed`);
      for (const [chid, ch] of Object.entries(edit.choices || {})) {
        if (!card.choices?.some((c) => c.id === chid)) err(`${where}: ${cid} has no choice "${chid}"`);
        for (const k of Object.keys(ch)) if (!CHOICE_FIELDS.includes(k)) err(`${where}: ${cid}/${chid}.${k} is a game rule and cannot be changed`);
      }
    }
    const added = Object.entries({ ...inst.cards?.add, ...campus?.cards?.add }).flatMap(([ch, list]) => list.map((e) => ({ ch, e })));
    for (const { ch, e } of added) {
      const at = `${where}: new card ${e.id || '(no id)'}`;
      if (ch !== 'core' && !chapters.some((c) => c.id === ch)) err(`${at}: unknown chapter "${ch}"`);
      if (!e.id || cardById[e.id]) err(`${at}: needs an id that no other card uses`);
      if (!CARD_TYPES.includes(e.type)) err(`${at}: type "${e.type}" is not allowed`);
      if (e.pool ? !pools.has(e.pool) : !(e.week >= 1 && e.week <= (chapters.find((c) => c.id === ch)?.weeks || 0))) err(`${at}: needs a known pool, or a week inside its chapter`);
      needText(e.title, `${at} title`);
      needText(e.text, `${at} text`);
      if (e.type !== 'win' && !(e.choices?.length >= 2 && e.choices.length <= 3)) err(`${at}: needs 2 or 3 choices`);
      if (e.choices && !e.choices.some((c) => !((c.effects?.money || 0) < 0))) err(`${at}: at least one choice must cost nothing`);
      for (const c of e.choices || []) {
        if (!c.id) err(`${at}: a choice has no id`);
        needText(c.label, `${at}/${c.id} label`);
        needText(c.outcome, `${at}/${c.id} outcome`);
        for (const t of c.tags || []) if (!TAGS.includes(t)) err(`${at}/${c.id}: unknown tag "${t}"`);
        for (const [k, v] of Object.entries(c.effects || {})) if (typeof v !== 'number' || (['marks', 'wellbeing'].includes(k) && Math.abs(v) > 20)) err(`${at}/${c.id}: effect ${k} must be a number, at most 20 for marks and wellbeing`);
      }
    }
    // Writing rules and support references, on the cards as this campus will show them.
    for (const e of Object.values(content.eventIndex)) {
      const changed = cards.edit?.[e.id] || added.some((a) => a.e.id === e.id);
      if (!changed) continue;
      if (e.text && words(e.text.en) > 40) err(`${where}: ${e.id} situation is ${words(e.text.en)} words (limit 40)`);
      for (const c of e.choices || []) {
        if (words(c.label.en) > 6) err(`${where}: ${e.id}/${c.id} label is over 6 words`);
        if (sentences(c.outcome.en) > 2) err(`${where}: ${e.id}/${c.id} outcome is over 2 sentences`);
        for (const sid of c.support || []) if (!content.support[sid]) err(`${where}: ${e.id}/${c.id} points to unknown service "${sid}"`);
      }
    }
    for (const ch of Object.values(content.chapters)) {
      if (!ch.events.some((e) => e.type === 'win')) err(`${where}: ${ch.id} has no win card left`);
      for (const slot of ch.slots || []) if (![...ch.events, ...content.events].some((e) => e.pool === slot.pool)) warn(`${where}: ${ch.id} pool "${slot.pool}" is now empty`);
    }

    // ---- no dead ends: play the whole journey on this campus ----
    if (!errors.length) {
      const helpful = (ev) => ev.choices.find((c) => c.tags?.includes('help_seeker')) || ev.choices[0];
      const avoidant = (ev) => ev.choices.find((c) => c.tags?.includes('avoider')) || ev.choices[0];
      for (const course of content.courses) {
        for (const housing of content.housing) {
          for (const [funding, pick] of [['nsfas', helpful], ['family', avoidant]]) {
            const setup = { institution: id, campus: campus?.id, status: 'accepted', course: course.id, housing: housing.id, origin: 'other_city', funding,
              family_needs: funding === 'family' ? 'no' : 'yes', laptop: 'no', age_role: 'straight_from_school', monthlyIncome: 1650 };
            try { playThrough(content, setup, pick); } catch (e) { err(`${where}: the journey breaks for ${course.id}/${housing.id}/${funding}: ${e.message}`); }
          }
        }
      }
    }
  }
  return { errors: [...new Set(errors)], warnings: [...new Set(warnings)], inst };
}

// Do the links answer? Only with --online, since it needs a connection.
async function checkLinks(inst) {
  const urls = new Set();
  JSON.stringify(inst, (k, v) => { if (k === 'url' && typeof v === 'string') urls.add(v); return v; });
  const dead = [];
  for (const url of urls) {
    try {
      const res = await fetch(url, { method: 'HEAD', redirect: 'follow', signal: AbortSignal.timeout(8000) });
      if (res.status >= 400 && res.status !== 405) dead.push(`${url} answered ${res.status}`);
    } catch (e) { dead.push(`${url} did not answer (${e.name})`); }
  }
  return dead;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [id, ...flags] = process.argv.slice(2);
  if (!id) { console.error('Usage: node tools/pack-check.mjs <institution id> [--online]'); process.exit(2); }
  const piped = flags.includes('--stdin') ? JSON.parse(readFileSync(0, 'utf8')) : undefined;
  const { errors, warnings, inst } = checkPack(id, piped);
  if (flags.includes('--json')) { console.log(JSON.stringify({ errors, warnings })); process.exit(0); }
  if (flags.includes('--online') && inst) errors.push(...(await checkLinks(inst)));
  for (const w of warnings) console.log(`  warning  ${w}`);
  for (const e of errors) console.log(`  ERROR    ${e}`);
  console.log(errors.length ? `\n${id}: ${errors.length} error(s). Not ready to publish.` : `\n${id}: ready to publish (${warnings.length} warning(s)).`);
  process.exit(errors.length ? 1 : 0);
}
