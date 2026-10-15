import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  newJourney, startChapter, backToMap, eventForWeek, openEvent, skipEvent, choose, acknowledge, advance, friday,
  nextWeek, setPhase, seekHelp, canSeekHelp, computeTests, resolveEvent, monthlyEssentials, eventAmount, condOk, TAGS,
  setHabit, activeSubscriptions, fridayTemptation, currentMini, answerMini, TRACKERS, affordableChoices, CASH_FLOOR, MARKS_MAX, setupGaps,
} from '../js/engine.js';
import { mergeContent, openDirectory, searchDirectory } from '../js/content.js';
import { checkPack } from '../tools/pack-check.mjs';
import { parseCsv } from '../tools/pack-lib.mjs';
import { MACHINE_LANGS, cardTexts, placeholders } from '../tools/translate.mjs';
import { LANGS } from '../js/i18n.js';
import { computeBudget, incomeTier, suggestedIncome } from '../js/budget.js';
import { termIndex, linkTerms } from '../js/glossary.js';
import { serviceText, cardVars } from '../js/plan.js';
import {
  moneyForecast, copingProfile, semesterForecast, spendingLeaks, bufferTarget, fairGame, nextChapterId, predictRisk,
} from '../js/forecast.js';

const read = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url)));
const core = read('../content/core.json');
const directory = read('../content/institutions/index.json');
const ids = directory.map((d) => d.id);
const institutions = ids.map((id) => read(`../content/institutions/${id}.json`));
const chapterIndex = read('../content/chapters/index.json');
const BUILT = chapterIndex.filter((c) => c.status === 'built').map((c) => c.id);
const chapterFiles = BUILT.map((id) => read(`../content/chapters/${id}.json`));
const en = read('../i18n/en.json');
const zu = read('../i18n/zu.json');
const realities = read('../content/realities.json');
const contentFor = (id, campus) => mergeContent(core, institutions.find((i) => i.id === id), chapterIndex, chapterFiles, campus);
const up = contentFor('sizwe'); // the demo campus pack

// The example student: from a village, NSFAS, private room near campus, no laptop.
const base = {
  institution: 'sizwe', campus: 'main', status: 'accepted', course: 'bsc', housing: 'private_rental', origin: 'village_rural', funding: 'nsfas',
  family_needs: 'yes', laptop: 'no', age_role: 'straight_from_school', monthlyIncome: 1650,
};
const choiceCards = (content, ids) => ids.filter((id) => content.eventIndex[id].choices).length;

const helpful = (ev) => ev.choices.find((c) => c.tags?.includes('help_seeker')) || ev.choices[0];
const avoidant = (ev) => ev.choices.find((c) => c.tags?.includes('avoider')) || ev.choices.find((c) => !c.tags?.includes('help_seeker')) || ev.choices[0];

// Play one chapter to its forecast. Returns the state and the card ids seen.
function playChapter(content, state, chapterId, pick, { fri = (step) => (step === 'habit' ? 'rarely' : 'no'), seek = false, skipNotes = false, mini = 0 } = {}) {
  let s = setPhase(startChapter(content, state, chapterId), 'dashboard');
  const seen = [];
  let guard = 0;
  while (s.phase !== 'forecast') {
    assert.ok(guard++ < 400, `${chapterId} did not finish`);
    if (s.phase === 'dashboard') {
      if (currentMini(content, s) && s.mini.choice === null) s = answerMini(content, s, mini);
      if (seek && s.money < 150 && canSeekHelp(content, s, 'food')) s = seekHelp(content, s, 'food');
      s = eventForWeek(content, s) ? openEvent(content, s) : advance(content, s);
    } else if (s.phase === 'note') {
      s = skipNotes ? skipEvent(content, s) : setPhase(s, 'event');
    } else if (s.phase === 'event') {
      const ev = eventForWeek(content, s);
      seen.push(ev.id);
      if (ev.choices) {
        // Like the UI: a choice you can't pay for can't be picked.
        const open = affordableChoices(s, ev);
        const want = pick(ev).id;
        s = choose(content, s, open.includes(want) ? want : open[0]);
      }
      else if (ev.type === 'results') s = nextWeek(content, s);
      else if (ev.type === 'tests') s = advance(content, s);
      else s = acknowledge(content, s);
    } else if (s.phase === 'outcome' || s.phase === 'support') {
      s = advance(content, s);
    } else if (s.phase === 'friday') {
      s = friday(content, s, fri(s.fridayStep));
    } else {
      assert.fail(`unexpected phase ${s.phase}`);
    }
  }
  return { s, seen };
}

function playJourney(content, setup, pick, opts = {}) {
  let s = newJourney(content, setup, { seed: opts.seed ?? 1 });
  const seen = {};
  for (const id of BUILT) {
    const r = playChapter(content, s, id, pick, opts);
    seen[id] = r.seen;
    s = backToMap(r.s);
  }
  return { s, seen };
}

function allSetups() {
  const out = [];
  for (const course of up.courses)
    for (const housing of up.housing)
      for (const funding of up.funding)
        for (const origin of ['same_city', 'village_rural'])
          for (const laptop of ['yes', 'no'])
            for (const age_role of ['straight_from_school', 'older_with_responsibilities'])
              out.push({ ...base, course: course.id, housing: housing.id, funding: funding.id, origin, laptop, age_role,
                family_needs: housing.id !== 'residence' ? 'yes' : 'no', monthlyIncome: funding.id === 'self' ? 600 : 2500 });
  return out;
}

test('every chapter completes for every setup combination, without dead ends, within its run budget', () => {
  for (const setup of allSetups()) {
    for (const pick of [helpful, avoidant]) {
      const { s, seen } = playJourney(up, setup, pick, { seed: 3 });
      for (const id of BUILT) {
        const { budget } = up.chapters[id];
        assert.ok(choiceCards(up, seen[id]) <= budget.cards, `${id}: ${choiceCards(up, seen[id])} cards, budget ${budget.cards}`);
        assert.ok(choiceCards(up, seen[id]) >= budget.cards - 2, `${id}: only ${choiceCards(up, seen[id])} cards`);
        assert.equal(s.miniLog.filter((m) => m.chapter === id).length, budget.minis, `${id}: minis`);
        assert.ok(seen[id].some((c) => up.eventIndex[c].type === 'win') || id !== 'finish_line');
      }
      assert.deepEqual([...s.completed].sort(), [...BUILT].sort());
      assert.ok(Number.isFinite(s.money) && s.marks >= 0 && s.marks <= MARKS_MAX, 'nobody reaches 100%');
      for (const id of BUILT) for (const t of s.results[id] || []) assert.ok(t.score <= MARKS_MAX);
      // Only the room scam can empty your pocket, and only until the next chapter starts.
      const low = s.flags.includes('scammed') ? -1 : 0;
      assert.ok(s.money > low && s.snapshots.every((x) => x.money > low), 'money never reaches zero');
      const cap = monthlyEssentials(up, setup) + 4 * setup.monthlyIncome;
      assert.ok(s.snapshots.every((x) => x.money <= cap), 'money never piles up unrealistically');
      for (const id of BUILT) {
        const tests = s.results[id];
        if (tests) assert.ok(tests.every((t) => Math.abs(t.score - tests[0].score) <= 25), 'module marks stay close together');
      }
    }
  }
});

test('every institution plays First Term and the forecast', () => {
  for (const inst of institutions) {
    const c = contentFor(inst.id);
    const { s } = playChapter(c, newJourney(c, { ...base, institution: inst.id }), 'first_term', helpful);
    const fc = semesterForecast(c, s);
    assert.equal(fc.top.length, 2);
    assert.equal(fc.target, 'first_exams');
  }
});

test('First Term follows the spec spine, plus the textbook card, and four minis', () => {
  const { s, seen } = playChapter(up, newJourney(up, base, { seed: 2 }), 'first_term', helpful);
  const spine = seen.filter((id) => /^FT-0\d|^FT-RES/.test(id));
  assert.ok(seen.indexOf('FT-TB') === 1, 'the textbook card follows lecture shock');
  assert.deepEqual(spine, ['FT-01', 'FT-02', 'FT-03', 'FT-04', 'FT-05', 'FT-06B', 'FT-07', 'FT-RES']);
  assert.ok(choiceCards(up, seen) <= 9);
  assert.equal(s.miniLog.length, 4);
  assert.equal(new Set(s.miniLog.map((m) => m.id)).size, 4, 'no mini repeats');
  assert.ok(s.miniLog.every((m) => m.week > 1), 'a chapter never opens with an optional question');
  assert.ok(seen.some((id) => up.eventIndex[id].type === 'win'), 'at least one win');
  // Across seeds, the spare slot is shared between situational, random and friend cards.
  const extras = new Set();
  for (let seed = 1; seed <= 40; seed++) {
    const r = playChapter(up, newJourney(up, base, { seed }), 'first_term', helpful);
    for (const id of r.seen) if (up.eventIndex[id].pool) extras.add(up.eventIndex[id].pool);
  }
  for (const pool of ['ft_sit', 'surprise', 'ft_friend']) assert.ok(extras.has(pool), `${pool} never drawn`);
});

test('minis: one tap, two options, and never the three meters', () => {
  let s = setPhase(startChapter(up, newJourney(up, base), 'first_term'), 'dashboard');
  s = { ...s, mini: { id: 'MM-8AM', choice: null } };
  const skipped = answerMini(up, s, 1);
  assert.equal(skipped.trackers.bunk_count, 1);
  assert.equal(skipped.mini.choice, 1);
  assert.equal(answerMini(up, skipped, 0), skipped, 'a mini is answered once');
  for (const m of Object.values(up.miniIndex)) {
    for (const [i, c] of m.choices.entries()) {
      assert.ok(!('money' in c.effects) && !('marks' in c.effects) && !('wellbeing' in c.effects) && !c.leak, `${m.id} touches a meter`);
      const after = answerMini(up, { ...s, mini: { id: m.id, choice: null } }, i);
      assert.deepEqual([after.money, after.marks, after.wellbeing], [s.money, s.marks, s.wellbeing]);
    }
  }
  assert.ok(up.miniIndex['MM-SAFE'].conditions.habit, 'the safety mini follows a night out');
  for (const t of ['confidence', 'bunk_count']) assert.ok(TRACKERS.includes(t));
});

test('you can only pay for what you can afford, and always keep some cash', () => {
  const s0 = { ...setPhase(startChapter(up, newJourney(up, base), 'arrival'), 'event'), queue: ['ARR-04'], qi: 0 };
  const ev = eventForWeek(up, s0);
  assert.ok(affordableChoices(s0, ev).includes('self'));
  const poor = { ...s0, money: 400 };
  assert.ok(!affordableChoices(poor, ev).includes('self'));
  assert.equal(choose(up, poor, 'self'), poor, 'an unaffordable choice does nothing');
  assert.ok(choose(up, s0, 'self').money >= CASH_FLOOR);
  // A card where everything costs money still leaves the cheapest option open.
  const sx = { ...s0, money: 60, queue: ['SX-02'], qi: 0 };
  assert.deepEqual(affordableChoices(sx, eventForWeek(up, sx)), ['help']);
  assert.ok(choose(up, sx, 'help').money >= CASH_FLOOR);
});

test('a room scam takes everything you have', () => {
  // A scored scam card (ARR-03 itself is now a "what if"), as a university could add one.
  const real = structuredClone(up.eventIndex['ARR-03']);
  real.type = 'situational';
  real.choices.find((c) => c.id === 'take').takesAll = true;
  real.choices.find((c) => c.id === 'take').flags = ['scammed'];
  const scam = { ...up, eventIndex: { ...up.eventIndex, 'ARR-03': real } };
  const s0 = { ...setPhase(startChapter(scam, newJourney(scam, { ...base, housing: 'residence' }), 'arrival'), 'event'), queue: ['ARR-03'], qi: 0, money: 800 };
  assert.ok(affordableChoices(s0, eventForWeek(scam, s0)).includes('take'));
  const after = choose(scam, s0, 'take');
  assert.equal(after.money, 0);
  assert.equal(after.last.deltas.money, -800);
  assert.equal(after.trackers.debt, 1, 'you owe the rest of the deposit');
  assert.ok(after.flags.includes('scammed'));
  // First Term starts with that money returned.
  const ft = startChapter(scam, backToMap(after), 'first_term');
  assert.equal(ft.money, 800);
  assert.equal(ft.trackers.debt, 0);
  assert.ok(ft.ledger.some((l) => l.key === 'ledger.scamBack' && l.money === 800));
  assert.equal(startChapter(scam, backToMap(ft), 'first_exams').ledger.some((l) => l.key === 'ledger.scamBack'), false, 'returned once');
});

test('Prequel: applying yourself, and where to find funding', () => {
  const r = playChapter(up, newJourney(up, { ...base, status: 'deciding' }, { seed: 2 }), 'prequel', helpful);
  assert.ok(r.seen.includes('PRE-08'));
  for (const id of ['applications', 'funding_search', 'scams']) assert.ok(r.s.supportSeen.includes(id), id);
  assert.ok(r.seen.includes('PRE-09') && r.s.supportSeen.includes('verify_accom'), 'where to live, and residence scams');
  const home = playChapter(up, newJourney(up, { ...base, status: 'deciding', housing: 'commuting' }, { seed: 2 }), 'prequel', helpful);
  assert.ok(!home.seen.includes('PRE-09'), 'not asked of students who will live at home');
});

test('the marks meter matches the module marks after tests', () => {
  const { s } = playChapter(up, newJourney(up, base, { seed: 2 }), 'first_term', helpful);
  const tests = s.results.first_term;
  const avg = Math.round(tests.reduce((a, t) => a + t.score, 0) / tests.length);
  assert.ok(Math.abs(s.marks - avg) <= 12, `meter ${s.marks}, modules ${tests.map((t) => t.score)}`);
});

test('funding rules only show to funded students, and later years offer a support recap', () => {
  for (const [funding, expected] of [['nsfas', true], ['family', false], ['self', false]]) {
    const r = playChapter(up, newJourney(up, { ...base, funding }, { seed: 2 }), 'first_exams', helpful);
    assert.equal(r.seen.includes('EX-06'), expected, funding);
  }
  for (const id of up.chapters.middle_years.recap) assert.ok(up.support[id], `recap: ${id}`);
  assert.ok(up.eventIndex['MY-10'] && up.eventIndex['EX-09'] && up.eventIndex['LIFE-01'].content_note);
});

test('campuses: each has its own map, courses, costs and service locations', () => {
  const inst = institutions.find((i) => i.id === 'sizwe');
  assert.deepEqual(inst.campuses.map((c) => c.id), ['main', 'education', 'health']);
  assert.deepEqual(up.courses.map((c) => c.id), ['bsc', 'bcom', 'ba', 'beng']);
  assert.equal(up.campusId, 'main');
  for (const [campus, course] of [['education', 'bed'], ['health', 'bhsc']]) {
    const c = contentFor('sizwe', campus);
    assert.deepEqual(c.courses.map((x) => x.id), [course]);
    assert.notDeepEqual(c.map.buildings.map((b) => b.id), up.map.buildings.map((b) => b.id));
    assert.notEqual(c.costs.rent_private, up.costs.rent_private);
    for (const [id, s] of Object.entries(c.support)) {
      // Every service is either in a building on this campus's map, or says where else it is.
      if (s.building) assert.ok(c.map.buildings.some((b) => b.id === s.building), `${campus}.${id}: ${s.building} is not on this campus`);
      else if (up.support[id].building) assert.ok(s.away?.en.startsWith('Main Campus'), `${campus}.${id}: no location`);
    }
    assert.ok(c.support.financial_aid_office.away && c.support.financial_aid_office.email, 'university-wide office keeps its email');
    assert.equal(c.support.food_programme.name.en, up.support.food_programme.name.en, 'names come from the university');
    // The whole journey plays on every campus, and only the smaller campuses can meet the shuttle card.
    const setup = { ...base, campus, course };
    for (const pick of [helpful, avoidant]) {
      const { s } = playJourney(c, setup, pick, { seed: 3 });
      assert.deepEqual([...s.completed].sort(), [...BUILT].sort());
    }
    assert.ok(condOk(c.eventIndex['FT-S7'].conditions, newJourney(c, setup)));
  }
  assert.ok(!condOk(up.eventIndex['FT-S7'].conditions, newJourney(up, base)));
});

test('licensing: a university changes its cards, courses, housing and look without touching the others', () => {
  const kc = contentFor('karoo-coast');
  // Its own look and its own offer.
  assert.equal(kc.brand.logo, 'KC');
  assert.match(kc.brand.colors.brand, /^#[0-9a-f]{6}$/);
  assert.equal(up.brand, null, 'Sizwe keeps the default look');
  assert.deepEqual(kc.housing.map((h) => h.id), ['private_rental', 'commuting']);
  assert.deepEqual(kc.courses.map((c) => c.id), ['bsc', 'bcom', 'ba']);
  assert.equal(kc.campuses.length, 0, 'one campus: no campus question');
  // Cards switched off, reworded and added, for this university only.
  assert.ok(!kc.eventIndex['ARR-03'] && !kc.eventIndex['FT-S5']);
  assert.ok(up.eventIndex['ARR-03'] && up.eventIndex['FT-S5']);
  assert.equal(kc.eventIndex['FT-02'].title.en, 'Clubs Fair');
  assert.equal(up.eventIndex['FT-02'].title.en, 'Societies Day');
  const res = (c) => c.eventIndex['PRE-09'].choices.find((x) => x.id === 'res');
  assert.equal(res(kc).label.en, 'Look for accredited private rooms');
  assert.deepEqual(res(kc).effects, res(up).effects, 'rules are untouched');
  assert.ok(kc.eventIndex['KC-01'] && !up.eventIndex['KC-01']);
  assert.equal(kc.support.food_programme.name.en, 'Karoo Coast Pantry');
  // The whole journey still plays.
  const setup = { ...base, institution: 'karoo-coast', campus: undefined, housing: 'private_rental' };
  for (const pick of [helpful, avoidant]) assert.deepEqual([...playJourney(kc, setup, pick, { seed: 3 }).s.completed].sort(), [...BUILT].sort());
});

test('pack check: bundled packs pass, and unsafe packs are refused', () => {
  for (const id of ids) assert.deepEqual(checkPack(id).errors, [], id);
  const kc = institutions.find((i) => i.id === 'karoo-coast');
  const broken = (change) => { const p = JSON.parse(JSON.stringify(kc)); change(p); return checkPack('karoo-coast', p).errors.join(' | '); };
  const phone = [{ label: 'Clinic 012 345 6789', tel: '0123456789' }];
  assert.match(broken((p) => { p.support.health.contacts = phone; }), /must not carry phone numbers/);
  assert.match(broken((p) => { p.support.health.email = 'clinic@gmail.com'; }), /only use "\.example"/);
  assert.match(broken((p) => { p.support.health.building = 'nowhere'; }), /not on this campus's map/);
  assert.match(broken((p) => { p.support.nonsense = {}; }), /not a known service/);
  assert.match(broken((p) => { p.cards.edit['FT-02'].choices = { gym: { effects: { money: 500 } } }; }), /game rule and cannot be changed/);
  assert.match(broken((p) => { p.cards.off.push('FT-07'); }), /cannot be switched off/);
  assert.match(broken((p) => { p.cards.off.push('NOPE-1'); }), /no such card/);
  assert.match(broken((p) => { p.cards.add.first_term[0].choices[0].label.en = 'A label that is far too long for a button'; }), /over 6 words/);
  assert.match(broken((p) => { p.brand.colors.brandInk = '#0b5d5e'; }), /too hard to read/);
  assert.match(broken((p) => { p.status = 'licensed'; delete p.signedOff; }), /signedOff/);
  // A licensed pack needs real addresses, and verified, dated phone numbers.
  const licensed = (change) => broken((p) => {
    p.status = 'licensed';
    p.licence = { tier: 'standard', expires: '2099-12-31' };
    for (const s of Object.values(p.support)) if (s.email) s.email = s.email.replace('karoocoast.example', 'karoocoast.ac.za');
    change(p);
  });
  assert.equal(licensed(() => {}), '');
  assert.match(licensed((p) => { p.support.health.contacts = phone; p.support.health.verified = false; }), /not marked verified/);
  assert.equal(licensed((p) => { p.support.health.contacts = phone; p.support.health.verified = true; p.support.health.last_checked = '2026-10-01'; }), '');
});

test('scale: a directory of hundreds, searched and grouped, with one pack per phone', () => {
  // The directory entry for each pack is in step with the pack itself.
  for (const d of directory) {
    const inst = institutions.find((i) => i.id === d.id);
    assert.deepEqual([d.version, d.name, d.status, d.type], [inst.version, inst.name, inst.status, inst.type || 'university'], d.id);
    assert.ok(JSON.stringify(d).length < 800, 'a directory entry stays small');
  }
  // 300 made-up entries: universities, TVET and private colleges across provinces.
  const provinces = ['Gauteng', 'Limpopo', 'KwaZulu-Natal', 'Eastern Cape', 'Western Cape'];
  const big = Array.from({ length: 300 }, (_, i) => ({
    id: `inst-${i}`, name: { en: `Institution ${i}` }, short: `I${i}`, type: ['university', 'tvet', 'private'][i % 3],
    province: provinces[i % 5], status: 'licensed', version: 1, licence: { tier: 'standard', expires: i % 10 === 0 ? '2020-01-01' : '2099-01-01' },
  }));
  const open = openDirectory(big, '2026-10-03');
  assert.equal(open.length, 270, 'lapsed licences drop out of the list');
  assert.equal(searchDirectory(open, 'institution 42').length, 1);
  assert.equal(searchDirectory(open, 'limpopo').length, 0, 'searches names, not provinces');
  assert.equal(searchDirectory(open, '42 institution').length, 1);
  assert.equal(searchDirectory(open, '   ').length, 270);
  assert.ok(JSON.stringify(big).length < 80 * 1024, 'the whole directory is a small download');
});

test('an institution can bring its own courses, and stale phone numbers are hidden', () => {
  const kc = JSON.parse(JSON.stringify(institutions.find((i) => i.id === 'karoo-coast')));
  kc.type = 'tvet';
  kc.courseList = [{ id: 'n4_eng', label: { en: 'N4 Engineering Studies', zu: 'N4 Izifundo Zobunjiniyela' }, modules: [{ en: 'Mathematics N4', zu: 'iZibalo N4' }, { en: 'Engineering Science N4', zu: 'Isayensi Yobunjiniyela N4' }] }];
  kc.courses = ['n4_eng'];
  assert.deepEqual(checkPack('karoo-coast', kc).errors, []);
  const c = mergeContent(core, kc, chapterIndex, chapterFiles);
  assert.deepEqual(c.courses.map((x) => x.id), ['n4_eng']);
  const { s } = playJourney(c, { ...base, institution: 'karoo-coast', campus: undefined, course: 'n4_eng', housing: 'commuting' }, helpful, { seed: 3 });
  assert.equal(s.results.first_term[0].name.en, 'Mathematics N4');
  // A campus phone number shows while its check is fresh, and is hidden once it is stale.
  kc.support.health = { ...kc.support.health, contacts: [{ label: 'Clinic 012 345 6789', tel: '0123456789' }], verified: true, last_checked: '2026-10-01' };
  const at = (date) => mergeContent(core, kc, chapterIndex, chapterFiles, undefined, Date.parse(date)).support;
  assert.ok(at('2026-12-01').health.contacts.some((x) => x.tel === '0123456789'));
  assert.ok(!(at('2028-03-01').health.contacts || []).some((x) => x.tel === '0123456789'));
  assert.ok(at('2028-03-01').counselling.contacts.some((x) => x.tel), 'national lines are always kept');
});

test('intake sheets: CSV with quotes, commas and comment rows', () => {
  const rows = parseCsv('a,b\n# a note\n"one, two","say ""hi"""\n\nlast,\n');
  assert.deepEqual(rows, [{ a: 'one, two', b: 'say "hi"' }, { a: 'last', b: '' }]);
});

test('a saved game whose course, housing or campus has left the pack is caught before it is played', () => {
  assert.deepEqual(setupGaps(up, base), []);
  assert.deepEqual(setupGaps(up, { ...base, course: 'a-course-since-removed' }), ['course']);
  assert.deepEqual(setupGaps(up, { ...base, housing: 'living_at_home', funding: 'gone' }), ['housing', 'funding']);
  assert.deepEqual(setupGaps(up, { ...base, campus: 'a-campus-since-closed' }), ['campus']);
  // A one-campus university never asks which campus, so a missing answer there is not a gap.
  const { campus, ...noCampus } = base;
  assert.deepEqual(setupGaps(contentFor('karoo-coast'), { ...noCampus, institution: 'karoo-coast', housing: contentFor('karoo-coast').housing[0].id }), []);
});

test('commuters skip the first night alone', () => {
  const home = playChapter(up, newJourney(up, { ...base, housing: 'commuting' }), 'arrival', helpful);
  assert.ok(home.seen.includes('ARR-01C') && !home.seen.includes('ARR-01'));
  const res = playChapter(up, newJourney(up, { ...base, housing: 'residence' }), 'arrival', helpful);
  assert.ok(res.seen.includes('ARR-01') && !res.seen.includes('ARR-01C'));
  assert.ok(!up.housing.some((h) => h.id === 'living_at_home'));
});

test('forecast advice fits the student: the food programme only when money is short, a set amount for home only when home needs it', () => {
  const comfortable = { ...base, funding: 'family', family_needs: 'no', monthlyIncome: 8000 };
  const rich = semesterForecast(up, playChapter(up, newJourney(up, comfortable), 'arrival', helpful).s).actions.map((a) => a.key);
  assert.ok(!rich.includes('fc.act.money') && !rich.includes('fc.act.moneyNsfas'), rich.join());
  assert.ok(!rich.includes('fc.act.family'), rich.join());
  const short = semesterForecast(up, playChapter(up, newJourney(up, { ...base, monthlyIncome: 900 }), 'arrival', helpful).s);
  assert.ok(short.actions.some((a) => a.key === 'fc.act.moneyNsfas'));
});

test('older students with responsibilities meet their own cards, not the school-leaver ones', () => {
  const older = { ...base, age_role: 'older_with_responsibilities' };
  const arr = playChapter(up, newJourney(up, older), 'arrival', helpful);
  assert.ok(arr.seen.includes('ARR-08') && !arr.seen.includes('ARR-07'));
  assert.match(resolveEvent(up, arr.s, 'ARR-02').text.en, /mature and part-time students/);
  const ft = playChapter(up, backToMap(arr.s), 'first_term', helpful);
  assert.ok(ft.seen.includes('FT-OLD'));
  const young = playChapter(up, newJourney(up, base), 'arrival', helpful);
  assert.ok(young.seen.includes('ARR-07') && !young.seen.includes('ARR-08'));
  assert.doesNotMatch(resolveEvent(up, young.s, 'ARR-02').text.en, /mature/);
});

test('res overbooking is a "what if" before the first night in res, and never costs the student', () => {
  const take = (ev) => (ev.id === 'ARR-03' ? ev.choices.find((c) => c.id === 'take') : helpful(ev));
  const start = newJourney(up, { ...base, housing: 'residence' });
  const r = playChapter(up, start, 'arrival', take);
  assert.ok(r.seen.indexOf('ARR-03') < r.seen.indexOf('ARR-01'), r.seen.join());
  const first = resolveEvent(up, r.s, 'ARR-01');
  assert.equal(first.title.en, 'Your first night in res');
  assert.match(first.text.en, /no overbooking/);
  // Choosing the scam in the rehearsal takes no money and leaves no scam behind.
  const s = { ...setPhase(startChapter(up, start, 'arrival'), 'event'), queue: ['ARR-03'], qi: 0, money: 800 };
  assert.deepEqual(affordableChoices(s, eventForWeek(up, s)), ['take', 'check', 'ask'], 'every answer is open, whatever you have');
  const after = choose(up, s, 'take');
  assert.equal(after.money, s.money);
  assert.ok(!after.flags.includes('scammed') && after.trackers.debt === s.trackers.debt);
});

test('confidence rises by asking and falls by staying quiet', () => {
  const s = { ...setPhase(startChapter(up, newJourney(up, base), 'first_term'), 'event'), queue: ['FT-01'], qi: 0 };
  assert.equal(choose(up, s, 'class').trackers.confidence, 1);
  const quiet = choose(up, { ...s, trackers: { ...s.trackers, confidence: 2 } }, 'quiet');
  assert.equal(quiet.trackers.confidence, 1);
});

test('Prequel: following friends is remembered in Arrival and Bounce Back', () => {
  const follow = (ev) => (ev.id === 'PRE-02' ? ev.choices.find((c) => c.id === 'follow') : helpful(ev));
  const pre = playChapter(up, newJourney(up, { ...base, status: 'deciding' }, { seed: 2 }), 'prequel', follow);
  assert.ok(pre.s.flags.includes('came_with_friend'));
  assert.ok(pre.seen.includes('PRE-04') && pre.seen.includes('PRE-W1'));
  const arr = playChapter(up, backToMap(pre.s), 'arrival', helpful);
  assert.ok(!arr.seen.includes('ARR-07'), 'you did not arrive alone');
  assert.ok(arr.seen.includes('ARR-02') && arr.s.flags.includes('went_to_oweek'));
  const bb = resolveEvent(up, { ...arr.s, chapter: 'bounce_back' }, 'BB-04');
  assert.match(bb.title.en, /friend you came with/);
});

test('adaptive cards: connection, debt and help-seeking change what you meet', () => {
  const lonely = playChapter(up, newJourney(up, base, { seed: 2 }), 'first_term',
    (ev) => (ev.id === 'FT-02' ? ev.choices.find((c) => c.id === 'skip') : avoidant(ev)));
  assert.ok(lonely.seen.includes('FT-06') && !lonely.seen.includes('FT-06B'), 'low connection → loneliness card');
  assert.ok(lonely.seen.includes('FT-05T'), 'never asked for help → tutor check-in');

  const broke = playChapter(up, newJourney(up, { ...base, monthlyIncome: 800 }, { seed: 2 }), 'first_term', avoidant);
  assert.ok(broke.seen.includes('FT-04L'), 'went without food and never asked for help → loan offer');
  const helped = playChapter(up, newJourney(up, base, { seed: 2 }), 'first_term', helpful);
  assert.ok(helped.seen.includes('FT-04') && !helped.seen.includes('FT-04L'), 'demo path keeps the family request');
});

test('First Exams: failing sets failed_module, which Bounce Back and Finish Line remember', () => {
  let s = newJourney(up, { ...base, monthlyIncome: 500 }, { seed: 4 });
  for (const id of ['first_term', 'first_exams']) s = backToMap(playChapter(up, s, id, avoidant, { fri: (st) => (st === 'habit' ? 'often' : 'yes') }).s);
  assert.ok(s.flags.includes('failed_module'));
  const bb = playChapter(up, s, 'bounce_back', avoidant);
  assert.ok(bb.seen.includes('BB-01') && bb.seen.includes('BB-02'));
  assert.ok(bb.s.flags.includes('repeating_module'));
  const fl = playChapter(up, backToMap(bb.s), 'finish_line', avoidant);
  assert.ok(fl.seen.includes('FL-04') || fl.seen.includes('FL-05'), 'debt or funding thread returns in the final year');
});

test('helpers pass, and win cards appear', () => {
  const { s, seen } = playJourney(up, { ...base, monthlyIncome: 3000, laptop: 'yes' }, helpful, { seed: 5 });
  assert.ok(!s.flags.includes('failed_module'));
  assert.ok(seen.first_exams.includes('EX-W1'));
  assert.ok(seen.finish_line.includes('FL-W1'));
  assert.ok(seen.arrival.includes('ARR-W1'));
});

test('friend stories are never scored on the meters', () => {
  const c = up;
  let s = setPhase(startChapter(c, newJourney(c, base), 'first_term'), 'event');
  s.queue = ['FT-F2'];
  s.qi = 0;
  const before = { money: s.money, marks: s.marks, wellbeing: s.wellbeing };
  const after = choose(c, s, 'support');
  assert.deepEqual({ money: after.money, marks: after.marks, wellbeing: after.wellbeing }, before);
  assert.equal(after.trackers.help_seeking, s.trackers.help_seeking + 1);
  assert.deepEqual(after.history.at(-1).tags, []);
});

test('content notes can skip a card entirely', () => {
  const s0 = setPhase(startChapter(up, newJourney(up, base), 'first_term'), 'dashboard');
  const s = { ...s0, queue: ['FT-F5'], qi: 0 };
  const opened = openEvent(up, s);
  assert.equal(opened.phase, 'note');
  const skipped = skipEvent(up, opened);
  assert.ok(skipped.history.find((h) => h.eventId === 'FT-F5').skipped);
  assert.ok(!skipped.history.some((h) => h.eventId === 'FT-F5' && h.choiceId));
});

test('trackers, coping tags and the buffer', () => {
  const { s } = playChapter(up, newJourney(up, base, { seed: 2 }), 'first_term', helpful);
  assert.ok(s.trackers.help_seeking >= 4);
  assert.equal(copingProfile(s, 'first_term').top, 'help_seeker');
  const solo = playChapter(up, newJourney(up, base, { seed: 2 }), 'first_term', avoidant).s;
  assert.equal(copingProfile(solo, 'first_term').top, 'avoider');
  for (const t of TAGS) assert.ok(t in copingProfile(s, 'first_term').counts);
  // Skipping temptations builds a buffer, which softens surprise expenses.
  assert.ok(s.trackers.buffer > 0);
  assert.ok(s.trackers.confidence > solo.trackers.confidence);
});

test('surprise costs are softened by a buffer', () => {
  const s0 = setPhase(startChapter(up, newJourney(up, base), 'first_term'), 'event');
  const noBuffer = choose(up, { ...s0, queue: ['SX-01'], qi: 0 }, 'replace');
  const withBuffer = choose(up, { ...s0, queue: ['SX-01'], qi: 0, trackers: { ...s0.trackers, buffer: 4 } }, 'replace');
  assert.equal(noBuffer.last.deltas.money, -800);
  assert.ok(withBuffer.last.deltas.money > -800 && withBuffer.last.bufferSaved > 0);
});

test('Friday choices and small spends feed the spending-leak forecast', () => {
  const spender = playChapter(up, newJourney(up, base), 'first_term', helpful, { fri: (st) => (st === 'habit' ? 'often' : 'yes') }).s;
  const leaks = spendingLeaks(up, spender, 'first_term');
  assert.ok(leaks.total > 300 && leaks.byKind.nights > 0);
  assert.equal(spender.nightHabit, 'often');
  assert.ok(spender.fridays.length <= 2, 'Friday screens come up at most twice per chapter');
  assert.ok(spender.fridays.filter((f) => f.habit).length === 1, 'the going-out habit is asked once');
  const nightWeeks = new Set(spender.leaks.filter((l) => l.kind === 'nights').map((l) => l.week));
  assert.ok(nightWeeks.size >= 3, 'the habit is charged in most weeks, not just Friday weeks');
  assert.ok(spender.trackers.connection >= 3, 'going out builds connection');
  assert.ok(semesterForecast(up, spender).actions.some((a) => a.key === 'fc.act.leaks'));
});

test('forecast: next chapter risk weeks, cross-chapter memory', () => {
  let s = newJourney(up, base, { seed: 2 });
  s = backToMap(playChapter(up, s, 'first_term', avoidant).s);
  const r = playChapter(up, s, 'first_exams', helpful);
  const fc = semesterForecast(up, r.s);
  assert.equal(fc.target, 'bounce_back');
  assert.equal(fc.memory.chapterId, 'first_term');
  assert.equal(fc.memory.profile.top, 'avoider');
  assert.equal(nextChapterId(up, 'finish_line'), null);
  assert.equal(predictRisk(up, r.s, 'first_term').length, 8);
});

test('money forecast and budget', () => {
  const f = moneyForecast(up, base);
  assert.equal(f.lateWeeks, 3);
  // The late-money line names the student's own funding, not "allowance" for everyone.
  assert.equal(f.label.en, 'NSFAS allowance');
  assert.equal(moneyForecast(up, { ...base, funding: 'family' }).label.en, 'Money from family');
  for (const l of [en, zu]) for (const k of ['money.lateRunOut', 'money.lateOk']) assert.ok(l[k].includes('{label}'), k);
  assert.ok(f.late.runOut && f.late.runOut <= 2);
  assert.equal(f.onTime.runOut, null);
  assert.equal(incomeTier(0.97), 'gap');
  for (const monthlyIncome of [500, 1650, 2500, 10000]) assert.equal(computeBudget(up, { ...base, monthlyIncome }).totalPct, 100);
  assert.ok(suggestedIncome(up, { ...base, housing: 'commuting' }) > suggestedIncome(up, base));
  // Pack costs: taxi_week is per real week; a game week is about two.
  assert.equal(up.housing.find((h) => h.id === 'commuting').weeklyCosts.transport, up.costs.taxi_week * 2);
  assert.equal(bufferTarget(up, base), Math.round(monthlyEssentials(up, base) / 2 / 50) * 50);
  const ev = up.eventIndex['FT-04'];
  assert.equal(eventAmount(ev, newJourney(up, { ...base, monthlyIncome: 8000 })), 2000);
});

test('fair game: harder setups say so, and name the supports', () => {
  const hard = fairGame(up, newJourney(up, base));
  const easy = fairGame(up, newJourney(up, { ...base, origin: 'same_city', funding: 'family', laptop: 'yes', housing: 'residence', family_needs: 'no', monthlyIncome: 6000 }));
  assert.equal(hard.level, 'heavier');
  assert.equal(easy.level, 'lighter');
  assert.ok(hard.supports.includes('devices') && hard.supports.includes('food_programme'));
  assert.ok(easy.advantages.length > hard.advantages.length);
});

test('conditions engine', () => {
  const s = { ...newJourney(up, base), chapter: 'first_term', week: 3 };
  assert.ok(condOk({ origin: ['village_rural'], laptop: ['no'] }, s));
  assert.ok(!condOk({ flags: ['joined_sports'] }, s));
  assert.ok(condOk({ trackers: { connection: { lte: 1 } } }, s));
  assert.ok(condOk({ week: [3] }, s));
  assert.ok(!condOk({ habit: ['often'] }, s) && condOk({ habit: ['often'] }, { ...s, nightHabit: 'often' }));
  assert.ok(!condOk({ tests: { anyFail: true } }, s), 'no results yet');
});

test('content: every support card, flag and pool referenced exists', () => {
  const all = [...core.events, ...chapterFiles.flatMap((c) => c.events)];
  const idsSeen = new Set();
  for (const e of all) { assert.ok(!idsSeen.has(e.id), `duplicate id ${e.id}`); idsSeen.add(e.id); }
  const setFlags = new Set(['buffer_ok', 'buffer_short', 'failed_module', 'recovered', 'used_food_support', 'anytime_food', 'went_without']);
  for (const tm of core.friday.temptations) for (const f of tm.flags || []) setFlags.add(f);
  for (const e of all) {
    for (const id of e.support || []) assert.ok(core.support[id], `${e.id}: missing support ${id}`);
    for (const c of e.choices || []) {
      for (const id of c.support || []) assert.ok(core.support[id], `${e.id}: missing support ${id}`);
      for (const f of c.flags || []) setFlags.add(f);
      for (const v of c.variants || []) for (const f of v.flags || []) setFlags.add(f);
      for (const t of c.tags || []) assert.ok(TAGS.includes(t), `${e.id}: unknown tag ${t}`);
      if (c.followUp) assert.ok(idsSeen.has(c.followUp.event), `${e.id}: missing follow-up`);
    }
  }
  for (const e of all) for (const f of e.conditions?.flags || []) assert.ok(setFlags.has(f), `${e.id}: flag ${f} is never set`);
  for (const c of chapterFiles) {
    for (const slot of c.slots || []) assert.ok(all.some((e) => e.pool === slot.pool), `${c.id}: empty pool ${slot.pool}`);
    for (const m of c.tests?.modifiers || []) if (m.flag) assert.ok(setFlags.has(m.flag), `${c.id}: modifier ${m.flag} never set`);
  }
  for (const inst of institutions) for (const id of Object.keys(inst.support)) assert.ok(core.support[id], `${inst.id}: ${id}`);
  for (const s of Object.values(up.support)) assert.equal(typeof s.verified, 'boolean');
  for (const e of all) if (e.realities && e.realities !== 'index') assert.ok(realities.topics.some((x) => x.id === e.realities), `${e.id}: topic`);
  for (const e of all) assert.ok(['core', 'situational', 'random', 'recurring', 'friend_story', 'what_if', 'win', 'light', 'tests', 'results'].includes(e.type), `${e.id}: type ${e.type}`);
});

// Writing rules (spec section 4). The chapter tables list more choices for these three cards.
const WIDE = { 'FT-01': 4, 'FT-02': 5, 'EX-02': 4, 'BB-03': 4, 'MY-01': 4, 'ARR-04': 4, 'FT-TB': 4 };
const words = (s) => s.trim().split(/\s+/).length;
const sentences = (s) => (s.match(/[.!?]+(?=\s|$|")/g) || []).length;

test('content validation: word limits and choice counts', () => {
  const problems = [];
  const cards = [...core.events, ...chapterFiles.flatMap((c) => c.events)];
  for (const e of cards) {
    const texts = [e.text, ...(e.variants || []).map((v) => v.text)].filter(Boolean).map((x) => x.en);
    for (const v of e.variants || []) if (v.textAppend) texts.push(e.text.en + v.textAppend.en);
    for (const x of texts) if (words(x) > 40) problems.push(`${e.id}: situation is ${words(x)} words`);
    if (!e.choices) continue;
    const max = WIDE[e.id] || 3;
    if (e.choices.length < 2 || e.choices.length > max) problems.push(`${e.id}: ${e.choices.length} choices`);
    for (const c of e.choices) {
      for (const l of [c.label, ...(c.variants || []).map((v) => v.label)].filter(Boolean)) if (words(l.en) > 6) problems.push(`${e.id}/${c.id}: label "${l.en}"`);
      for (const o of [c.outcome, ...(c.variants || []).map((v) => v.outcome)].filter(Boolean)) if (sentences(o.en) > 2) problems.push(`${e.id}/${c.id}: outcome has ${sentences(o.en)} sentences`);
      if (c.tip && sentences(c.tip.en) > 2) problems.push(`${e.id}/${c.id}: tip is too long`);
    }
  }
  const minis = [...core.minis, ...chapterFiles.flatMap((c) => c.minis || [])];
  const miniIds = new Set();
  for (const m of minis) {
    if (miniIds.has(m.id)) problems.push(`${m.id}: duplicate mini`);
    miniIds.add(m.id);
    if (m.type !== 'mini' || m.choices.length !== 2) problems.push(`${m.id}: a mini has exactly 2 choices`);
    if (words(m.text.en) > 40) problems.push(`${m.id}: text too long`);
    for (const c of m.choices) {
      if (words(c.label.en) > 6) problems.push(`${m.id}: label "${c.label.en}"`);
      if (sentences(c.outcome.en) > 2) problems.push(`${m.id}: outcome is not one line`);
    }
  }
  for (const c of chapterFiles) {
    assert.ok(c.budget?.cards > 0 && c.budget.minis >= 0, `${c.id}: budget`);
    const own = (c.minis || []).filter((m) => !m.conditions).length + (c.economy ? core.minis.length : 0);
    assert.ok(own >= c.budget.minis, `${c.id}: not enough minis`);
    assert.ok(c.events.some((e) => e.type === 'win'), `${c.id}: no win`);
  }
  assert.deepEqual(problems, []);
});

test('legal: no real university names, and phone numbers only for verified national services', () => {
  const files = ['../content/core.json', '../content/realities.json', '../i18n/en.json', '../i18n/zu.json',
    ...ids.map((id) => `../content/institutions/${id}.json`), ...BUILT.map((id) => `../content/chapters/${id}.json`)];
  const real = /University of (Pretoria|Cape Town|Johannesburg|KwaZulu|the Witwatersrand)|\b(Wits|UCT|UKZN|Tuks|Hatfield|Braamfontein)\b/i;
  for (const f of files) assert.ok(!real.test(readFileSync(new URL(f, import.meta.url), 'utf8')), `${f} names a real university`);
  assert.deepEqual(ids, ['sizwe', 'karoo-coast']);
  // Fictional campus services never carry phone numbers, and their example
  // email addresses use the reserved ".example" domain, which nobody can own.
  for (const inst of institutions) {
    for (const [id, s] of Object.entries(inst.support)) {
      assert.ok(!s.contacts, `${inst.id}.${id} has contacts`);
      if (s.email) assert.match(s.email, /^[a-z]+@[a-z]+\.example$/, `${id}: ${s.email}`);
      if (s.building) assert.ok(inst.map.buildings.some((b) => b.id === s.building), `${inst.id}.${id}: building`);
      for (const c of inst.campuses || []) assert.ok(!c.support?.[id]?.contacts && !c.support?.[id]?.email, `${c.id}.${id}: campus contact`);
      if (s.page) assert.ok(inst.pages[s.page], `${id}: page`);
      assert.ok(core.support[id], `${id} is not a support card`);
    }
    assert.ok(!/\d{3}[ -]?\d{3}[ -]?\d{4}/.test(JSON.stringify(inst)), 'no phone numbers in a fictional pack');
  }
  const national = new Set(['0800067327', '0800567567', '0800363636', '0800428428', '10111']);
  const tels = [...Object.values(core.support).flatMap((s) => s.contacts || []), ...realities.contacts].filter((c) => c.tel);
  for (const c of tels) assert.ok(national.has(c.tel), `unverified number ${c.label}`);
  for (const s of Object.values(core.support)) if ((s.contacts || []).some((c) => c.tel)) assert.ok(s.verified && s.last_checked, 'national lines are verified and dated');
  for (const c of realities.contacts) assert.ok(c.last_checked);
});

test('Campus Realities: at least three topics, each with all five parts', () => {
  assert.ok(realities.topics.length >= 3);
  for (const x of realities.topics) {
    for (const part of ['recognise', 'you', 'friend', 'rights']) assert.ok(x[part].length >= 3, `${x.id}.${part}`);
    assert.ok(x.scenario.choices.length >= 2 && x.scenario.choices.every((c) => c.feedback && !c.effects), 'never scored');
    for (const label of x.contacts) assert.ok(realities.contacts.some((c) => c.label === label), `${x.id}: ${label}`);
  }
});

test('content: every text has English and isiZulu', () => {
  const missing = [];
  const walk = (node, path) => {
    if (node && typeof node === 'object' && !Array.isArray(node) && 'en' in node) {
      if (!node.zu) missing.push(path);
      return;
    }
    if (node && typeof node === 'object') for (const [k, v] of Object.entries(node)) walk(v, `${path}.${k}`);
  };
  walk(core, 'core');
  chapterFiles.forEach((c) => walk(c, c.id));
  chapterIndex.forEach((c) => walk(c, `index.${c.id}`));
  realities.topics.forEach((x) => walk(x.title, `realities.${x.id}`)); // body text is English until reviewed
  institutions.forEach((inst) => walk(inst, inst.id));
  assert.deepEqual(missing, []);
  assert.deepEqual(Object.keys(en).filter((k) => !(k in zu)), []);
});

test('service worker precaches every content file', () => {
  const sw = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
  // Institution packs are never precached: a phone only downloads the one it chooses.
  for (const id of ids) assert.ok(!sw.includes(`./content/institutions/${id}.json`), `sw.js precaches ${id}.json`);
  assert.ok(sw.includes('fys-packs') && sw.includes('content\\/institutions'));
  for (const id of BUILT) assert.ok(sw.includes(`./content/chapters/${id}.json`), `sw.js misses chapter ${id}`);
  assert.ok(sw.includes('./content/realities.json'));
  for (const f of ['main', 'engine', 'i18n', 'plan', 'pdf', 'budget', 'content', 'forecast', 'charts', 'server']) assert.ok(sw.includes(`./js/${f}.js`));
});

test('living costs: capped at a share of your money, and spare money gets spent', () => {
  const s0 = setPhase(startChapter(up, newJourney(up, base), 'first_term'), 'dashboard');
  // Week 1, allowance not yet paid: groceries take at most 70% of what you have.
  const s1 = nextWeek(up, { ...s0, queue: [], qi: 0 });
  const line = (k) => s1.ledger.find((l) => l.key === k);
  assert.ok(-line('ledger.cost.food').money <= s0.money * 0.7);
  assert.ok(line('ledger.cutFood'), 'you bought less than a full shop');
  assert.ok(s1.money >= CASH_FLOOR, 'living costs never empty the account');
  // With plenty of money, everything is paid, nothing is cut, and half the spare goes on extras.
  const rich = nextWeek(up, { ...s0, money: 5000, queue: [], qi: 0 });
  assert.ok(!rich.ledger.some((l) => l.key.startsWith('ledger.cut')));
  assert.ok(rich.ledger.some((l) => l.key === 'ledger.extras'));
  assert.ok(rich.money < 5000 - 1450);
  const f = moneyForecast(up, base);
  assert.ok(f.late.weeks.every((m) => m > 0) && f.onTime.weeks.every((m) => m > 0));
});

test('Friday nights: a habit you can change, never pushing money below zero', () => {
  let s = startChapter(up, newJourney(up, { ...base, monthlyIncome: 0 }), 'first_term');
  s = setHabit(up, s, 'often');
  assert.equal(s.nightHabit, 'often');
  for (let i = 0; i < 4; i++) s = nextWeek(up, setPhase(s, 'dashboard'));
  assert.ok(s.money >= 0);
  assert.ok(s.ledger.some((l) => l.key === 'ledger.nightsSkipped') || s.money > 0, 'with no money left you stay in');
  assert.equal(setHabit(up, s, 'nonsense').nightHabit, 'often');
});

test('small spends: nothing accepted is offered again, and subscriptions only once', () => {
  let s = startChapter(up, newJourney(up, base), 'first_term');
  s = { ...s, nightHabit: 'sometimes' };
  const shown = [];
  for (const chapterId of ['first_term', 'first_exams', 'bounce_back', 'middle_years', 'finish_line']) {
    s = startChapter(up, backToMap(s), chapterId);
    for (let w = 1; w <= 8; w++) {
      const tm = fridayTemptation(up, { ...s, week: w });
      if (!tm) continue;
      shown.push(tm.id);
      s = { ...s, offered: [...s.offered, { id: tm.id, accepted: true }] };
    }
  }
  assert.ok(shown.length >= 3);
  assert.equal(new Set(shown).size, shown.length, 'no accepted spend comes back');
});

test('a streaming subscription charges every week until it is cancelled', () => {
  let s = startChapter(up, newJourney(up, base), 'first_term');
  // Everything else was already accepted, so the next small spend is streaming.
  const others = up.friday.temptations.filter((x) => x.id !== 'streaming').map((x) => ({ id: x.id, accepted: true }));
  const week = up.chapters.first_term.fridayWeeks.find((w) => fridayTemptation(up, { ...s, week: w, offered: others }));
  s = { ...s, week, offered: others, nightHabit: 'rarely', fridayStep: 'treat' };
  assert.equal(fridayTemptation(up, s).id, 'streaming');
  s = friday(up, s, 'yes');
  assert.ok(s.flags.includes('streaming_sub'));
  assert.ok(activeSubscriptions(s).some((x) => x.id === 'streaming' && x.yearly > 1000));
  assert.equal(fridayTemptation(up, { ...s, week }), null, 'never offered again');
  const card = { ...s, queue: ['SUB-01'], qi: 0, phase: 'event' };
  assert.ok(!activeSubscriptions(choose(up, card, 'cancel')).some((x) => x.id === 'streaming'));
  assert.ok(activeSubscriptions(choose(up, card, 'share')).some((x) => x.id === 'streaming_shared'));
});

test('services: named by the need, each pointing at a real support card', () => {
  const seen = new Set();
  for (const x of core.services) {
    assert.ok(core.support[x.support], `${x.support} is not a support card`);
    assert.ok(!seen.has(x.support), `${x.support} is listed twice`);
    seen.add(x.support);
    assert.ok(x.icon && words(x.need.en) <= 7, `${x.support}: "${x.need.en}"`);
    for (const h of x.housing || []) assert.ok(core.housing.some((o) => o.id === h), `${x.support}: housing ${h}`);
  }
  for (const id of ['food_programme', 'counselling', 'supp_exams']) assert.ok(seen.has(id), id);
});

test('sharing a service: the university, the service, one line and the link, and nothing personal', () => {
  const url = 'https://example.org/?uni=sizwe&campus=main&service=food_programme';
  const text = serviceText(up, 'food_programme', url);
  const lines = text.split('\n');
  assert.ok(lines[0].includes('Sizwe University'), 'names the university');
  assert.ok(lines[1].includes(up.support.food_programme.name.en) && lines[1].includes("I'm hungry"));
  assert.equal(sentences(lines[2]), 1, 'one line of description');
  assert.equal(lines.at(-1), url);
  // The message is built from the pack alone: no journey state goes in.
  assert.equal(serviceText.length, 3);
  assert.ok(serviceText(contentFor('karoo-coast'), 'counselling', url).startsWith('Karoo Coast University'));
});

test('glossary: the first mention of a word is tappable, whole words only, and text stays escaped', () => {
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
  const index = termIndex(core.glossary, 'en');
  const html = linkTerms('A supp & a supplementary exam. Credits at accredited res.', index, esc);
  assert.equal((html.match(/data-id="supp"/g) || []).length, 1, 'linked once');
  assert.ok(html.includes('>supp</button>') && html.includes('&#38;'));
  assert.ok(html.includes('data-id="credits"') && html.includes('data-id="accredited"'));
  assert.ok(!linkTerms('myNSFAS', index, esc).includes('<button'), 'not inside another word');
  assert.equal(linkTerms('<b>hi</b>', index, esc), esc('<b>hi</b>'));
  // isiZulu cards match isiZulu words; languages without their own list use the English ones.
  assert.ok(linkTerms('Izivivinyo ezengeziwe ziyeza.', termIndex(core.glossary, 'zu'), esc).includes('data-id="supp"'));
  assert.ok(linkTerms('A bursary.', termIndex(core.glossary, 'af'), esc).includes('data-id="bursary"'));
  for (const [id, g] of Object.entries(core.glossary)) assert.ok(g.match.en.length && sentences(g.def.en) <= 3, id);
  // Every card that mentions a supp explains it.
  const texts = JSON.stringify(chapterFiles.find((c) => c.id === 'first_exams').events.find((e) => e.id === 'EX-SU'));
  assert.ok(/supplementary exam/.test(texts) && /perusal/.test(texts));
});

test('First Exams results: everyone meets a supp code on a third module, and the fail card follows the real marks', () => {
  const s = startChapter(up, newJourney(up, base, { seed: 1 }), 'first_exams');
  const withWorst = (score) => ({ ...s, results: { first_exams: [{ name: { en: 'A' }, score, passed: score >= 50 }, { name: { en: 'B' }, score: 70, passed: true }] } });
  const shown = (score) => ['EX-W1', 'EX-05', 'EX-SU'].filter((id) => condOk(up.eventIndex[id].conditions, withWorst(score)));
  assert.deepEqual(shown(62), ['EX-W1', 'EX-SU']);
  assert.deepEqual(shown(45), ['EX-05', 'EX-SU']);
  assert.deepEqual(shown(20), ['EX-05', 'EX-SU']);
  // The supp is on a module outside the two that are scored, so it is never a failed key module.
  const v = cardVars(up, withWorst(62), up.eventIndex['EX-SU']);
  assert.ok(v.mod3 && ![v.mod1, v.mod2].includes(v.mod3));
  for (const c of core.courses) assert.ok(c.otherModule?.en && !c.modules.some((m) => m.en === c.otherModule.en), c.id);
  assert.ok(up.eventIndex['EX-SU'].choices.every((c) => !c.flags));
  // Each university shows its own code, and its own page of what the codes mean.
  assert.equal(v.suppCode, '999');
  const kc = contentFor('karoo-coast');
  assert.equal(cardVars(kc, { ...withWorst(45), setup: { ...base, course: kc.courses[0].id } }, kc.eventIndex['EX-SU']).suppCode, 'SUP');
  for (const c of [up, kc]) assert.ok(c.pages[c.support.supp_exams.page].items.some((i) => i.name.startsWith(c.suppCode)));
  for (const pick of [helpful, avoidant]) {
    const runs = allSetups().slice(0, 40).map((setup) => playJourney(up, setup, pick));
    for (const r of runs) {
      assert.ok(r.seen.first_exams.includes('EX-SU'), 'every run meets the supp card');
      assert.equal(r.seen.first_exams.includes('EX-05'), r.s.results.first_exams.some((x) => !x.passed), 'the fail card only after a real fail');
    }
  }
  // After a fail, the advice names what to check: what it blocks, funding, and repeating.
  for (const id of ['options', 'advisor']) assert.match(up.eventIndex['EX-05'].choices.find((c) => c.id === id).outcome.en, /blocks.*fund.*repeat/s);
});

test('languages: every language has the whole interface, and the machine-translated ones have the card text', () => {
  assert.deepEqual(LANGS.filter((l) => l.machine).map((l) => l.id), MACHINE_LANGS);
  assert.ok(LANGS.every((l) => !l.beta), 'no language is marked beta');
  const texts = cardTexts();
  for (const lang of MACHINE_LANGS) {
    const ui = read(`../i18n/${lang}.json`);
    assert.deepEqual(Object.keys(en).filter((k) => !ui[k]), [], `${lang}: interface strings`);
    for (const k of Object.keys(en)) assert.equal(placeholders(ui[k]), placeholders(en[k]), `${lang}: ${k}`);
    const cards = read(`../content/lang/${lang}.json`);
    // A string that came back broken is left out and shows in English: only a handful may.
    const missing = texts.filter((s) => !cards[s]);
    assert.ok(missing.length <= texts.length * 0.02, `${lang}: ${missing.length} card texts untranslated, e.g. ${missing[0]}`);
    for (const [src, out] of Object.entries(cards)) assert.equal(placeholders(out), placeholders(src), `${lang}: ${src.slice(0, 40)}`);
  }
});

test('Before You Apply has its own money: first year starts fresh, and a later replay does not touch university money', () => {
  const spend = (ev) => [...ev.choices].sort((a, b) => (a.effects?.money || 0) - (b.effects?.money || 0))[0];
  const pre = playChapter(up, newJourney(up, { ...base, status: 'deciding' }, { seed: 2 }), 'prequel', spend);
  assert.ok(pre.s.money < core.start.money, 'application costs were paid');
  const arrival = startChapter(up, backToMap(pre.s), 'arrival');
  assert.equal(arrival.chapterStart.arrival.money, core.start.money, 'first year opens on a fresh amount');
  // Straight into first year, with no prequel: nothing changes.
  assert.equal(startChapter(up, newJourney(up, base, { seed: 2 }), 'first_term').chapterStart.first_term.money, core.start.money);
  // Replaying the prequel later: its own amount again, and the university money is waiting afterwards.
  const term = backToMap(playChapter(up, backToMap(arrival), 'first_term', helpful).s);
  const again = startChapter(up, term, 'prequel');
  assert.equal(again.chapterStart.prequel.money, up.chapters.prequel.startMoney);
  const exams = startChapter(up, backToMap(playChapter(up, term, 'prequel', spend).s), 'first_exams');
  assert.equal(exams.chapterStart.first_exams.money, Math.max(0, term.money));
});

test('applying: each demo university has its own "how to apply" page on the applications card', () => {
  for (const c of [up, contentFor('karoo-coast')]) {
    const p = c.pages[c.support.applications.page];
    assert.ok(p.items.length >= 4 && p.title.en.includes(c.short), c.id);
  }
  assert.ok(up.eventIndex['PRE-03'].choices.some((x) => x.support?.includes('applications')));
});
