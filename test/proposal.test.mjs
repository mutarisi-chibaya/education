// Backup app (proposal-app/): every setup can play all 8 weeks to the survival plan.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as E from '../proposal-app/js/engine.js';

const read = (p) => JSON.parse(readFileSync(new URL(`../proposal-app/${p}`, import.meta.url), 'utf8'));
const content = read('content/up.json');
const en = read('i18n/en.json');
const zu = read('i18n/zu.json');
const appJs = readFileSync(new URL('../proposal-app/js/app.js', import.meta.url), 'utf8');

function* setups() {
  for (const course of content.courses) for (const housing of content.housing) for (const origin of content.origins)
    for (const funding of content.funding) for (const laptop of [true, false]) for (const family_needs of [true, false])
      for (const monthlyIncome of [0, 800, null, 6000]) {
        const s = { institution: 'up', course: course.id, housing: housing.id, origin: origin.id, funding: funding.id, laptop, family_needs };
        yield { ...s, monthlyIncome: monthlyIncome ?? E.defaultMonthly(content, s) };
      }
}

const POLICIES = {
  first: (cs) => cs[0],
  last: (cs) => cs[cs.length - 1],
  help: (cs) => cs.find((c) => (c.tags || []).includes('help_seeker')) || cs[0],
};

const leftover = (str) => /\{\w+\}/.test(str);

function textVars(s, ev) {
  const course = E.findById(content.courses, s.setup.course);
  return { course: 'x', city: 'x', area: 'x', short: 'x', money: 'x', amount: 'x', half: 'x', mod1: course.modules[0].en, mod2: course.modules[1].en, ...(ev ? {} : {}) };
}
const fill = (str, v) => String(str).replace(/\{(\w+)\}/g, (m, k) => (v[k] !== undefined ? v[k] : m));

function play(setup, pick, check) {
  let s = E.newGame(content, setup, 12345);
  let steps = 0;
  while (s.phase !== 'plan') {
    assert.ok(steps++ < 200, 'game should end');
    assert.ok(s.money >= 0, `money never negative (week ${s.week}, ${s.phase})`);
    for (const k of ['marks', 'wellbeing']) assert.ok(s[k] >= 0 && s[k] <= 100, `${k} in range`);
    if (s.phase === 'dash') {
      if (s.week <= 6) assert.ok(s.queue.length > 0, `week ${s.week} has a main card`);
      s = E.openWeek(s);
    } else if (s.phase === 'event') {
      const ev = E.resolveEvent(content, s, E.currentEventId(s));
      assert.ok(ev.choices?.length >= 2, `${ev.id} has choices`);
      check?.(s, ev);
      s = E.choose(content, s, pick(ev.choices).id);
    } else if (s.phase === 'outcome' || s.phase === 'support') s = E.advance(content, s);
    else if (s.phase === 'friday') s = E.friday(content, s, s.fridayStep === 'habit' ? ['often', 'sometimes', 'rarely'][steps % 3] : 'yes');
    else if (s.phase === 'tests') s = E.testsDone(content, s);
    else if (s.phase === 'results') { assert.ok(E.resultTier(content, s)); s = { ...s, phase: 'forecast' }; }
    else if (s.phase === 'forecast') s = { ...s, phase: 'plan' };
    else assert.fail(`unknown phase ${s.phase}`);
  }
  return s;
}

test('every setup plays all 8 weeks to the plan, money never below zero', () => {
  let games = 0;
  for (const setup of setups()) {
    for (const pick of Object.values(POLICIES)) {
      const s = play(setup, pick);
      const fc = E.semesterForecast(content, s);
      assert.ok(fc.risk.weeks.length >= 1 && fc.risk.weeks.length <= 2);
      assert.ok(fc.risk.weeks.every((w) => w >= 1 && w <= 8));
      assert.ok(fc.steps.every((st) => st.support.length >= 1 && st.support.every((id) => content.support[id])));
      assert.ok(fc.services.length >= 3);
      assert.ok(fc.budget.lines.every((l) => l.amount >= 0));
      assert.ok(s.nightHabit, 'the going-out habit was asked');
      const accepted = s.offered.filter((o) => o.accepted).map((o) => o.id);
      assert.equal(new Set(accepted).size, accepted.length, 'no small spend is offered again once accepted');
      assert.ok(s.recurring.filter((r) => r.id === 'streaming').length <= 1, 'one streaming subscription at most');
      games += 1;
    }
  }
  assert.ok(games > 1000);
});

test('cards fill every placeholder in English and isiZulu', () => {
  const seen = new Set();
  for (const setup of setups()) {
    if (setup.monthlyIncome !== 800) continue;
    for (const pick of [...Object.values(POLICIES), (cs) => cs[2] || cs[0]]) play(setup, pick, (s, ev) => {
      seen.add(ev.id);
      const v = textVars(s, ev);
      for (const lang of ['en', 'zu']) {
        assert.ok(ev.title[lang] && ev.text[lang], `${ev.id} has ${lang}`);
        assert.ok(!leftover(fill(ev.title[lang], v)) && !leftover(fill(ev.text[lang], v)), `${ev.id} ${lang} text`);
        for (const c of ev.choices) {
          for (const f of ['label', 'outcome']) assert.ok(c[f]?.[lang] && !leftover(fill(c[f][lang], v)), `${ev.id}/${c.id} ${f} ${lang}`);
        }
      }
    });
  }
  // The proposal's weekly cards all appear for some setup.
  for (const id of ['FT-01', 'FT-02', 'FT-03', 'FT-04', 'FT-04D', 'FT-05', 'FT-06', 'FT-06B', 'FT-R2', 'FT-R4']) assert.ok(seen.has(id), `${id} reachable`);
});

test('the proposal example: late allowance runs out in week 2', () => {
  const f = E.moneyForecast(content, { funding: 'nsfas', housing: 'private_rental', monthlyIncome: 1650 });
  assert.equal(f.late, 3);
  assert.equal(f.lateFlow.runOut, 2);
  assert.equal(f.onTime.runOut, null);
});

test('isiZulu has every interface string, and the app only uses keys that exist', () => {
  assert.deepEqual(Object.keys(zu).sort(), Object.keys(en).sort());
  const used = [...appJs.matchAll(/\bt\('([\w.]+)'/g)].map((m) => m[1]);
  for (const k of used) assert.ok(k in en, `missing string ${k}`);
  for (const p of ['money', 'marks', 'wellbeing']) assert.ok(`meter.${p}` in en);
  for (const c of ['money', 'family', 'deadlines', 'tests', 'loneliness', 'registration']) assert.ok(`cause.${c}` in en && `step.${c}` in en);
  for (const s of E.COPING) assert.ok(`style.${s}` in en && `styleNote.${s}` in en);
  for (const l of E.LEAKS) assert.ok(`leak.${l}` in en);
});
