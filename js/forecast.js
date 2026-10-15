// Semester Forecast: how the app "thinks". Pure functions, runs offline.
// Runs at the end of every chapter and remembers earlier chapters:
//   1. Money forecast   – week-by-week cash flow from setup, on time and late.
//   2. Spending leaks   – Friday nights and small spends.
//   3. Coping profile   – the top coping tag across this chapter's choices.
//   4. Risk weeks       – the next chapter's cards (their forecast_tags) weighted
//                         by this player's vulnerabilities: money, marks,
//                         connection, debt, family pressure...
//   5. Memory           – compares this chapter's pattern with the last one.
//   6. Fair game        – how the starting setup changed the difficulty.
// These are transparent, research-based rules, not a trained model; a pilot
// with consented play data is what would let us train one.

import {
  TAGS, findById, weeklyIncome, weeklyCosts, monthlyEssentials, chapterOf, chapterHistory, condOk, livingCosts, payCosts, extrasSpend,
} from './engine.js';
import { computeBudget } from './budget.js';

export const LATE_WEEKS = 2;
const roundTo = (n, step) => Math.round(n / step) * step;

// ---------- 1. money forecast ----------

export function lateWeeksFor(content, setup) {
  return findById(content.funding, setup.funding)?.lateWeeks || LATE_WEEKS;
}

// Two weeks of basics: enough to absorb a stolen phone or a late payment.
export function bufferTarget(content, setup) {
  return roundTo(monthlyEssentials(content, setup) / 2, 50);
}

// Mirrors the game: income, then living costs paid in priority order.
// "Runs out" is the first week you can't cover all your living costs.
export function cashFlow(content, setup, { lateWeeks = 0, weeks = 8 } = {}) {
  const income = weeklyIncome(setup);
  let money = content.start.money;
  let missed = 0;
  let runOut = null;
  const out = [];
  for (let w = 1; w <= weeks; w++) {
    if (w <= lateWeeks) missed += 1;
    else if (missed) { money += income * (missed + 1); missed = 0; }
    else money += income;
    const paid = payCosts(money, livingCosts(content, setup, w));
    money = paid.money - extrasSpend(content, setup, paid.money);
    if (runOut === null && paid.lines.some((l) => l.short > 0)) runOut = w;
    out.push(money);
  }
  return { weeks: out, runOut, lowest: Math.min(...out) };
}

export function moneyForecast(content, setup) {
  const lateWeeks = lateWeeksFor(content, setup);
  return {
    label: findById(content.funding, setup.funding)?.incomeLabel, // what this student's money is called
    start: content.start.money,
    income: weeklyIncome(setup),
    costs: weeklyCosts(content, setup),
    lateWeeks,
    onTime: cashFlow(content, setup),
    late: cashFlow(content, setup, { lateWeeks }),
  };
}

// ---------- 2. spending leaks ----------

export const LEAKS = ['nights', 'takeaways', 'clothes', 'data', 'subscriptions'];

export function spendingLeaks(content, s, chapterId = s.chapter) {
  const byKind = Object.fromEntries(LEAKS.map((k) => [k, 0]));
  const leaks = (s.leaks || []).filter((l) => !chapterId || l.chapter === chapterId);
  for (const l of leaks) byKind[l.kind] = (byKind[l.kind] || 0) + l.amount;
  const total = Object.values(byKind).reduce((a, b) => a + b, 0);
  const weeks = chapterOf(content, chapterId)?.weeks || 8;
  const housing = findById(content.housing, s.setup.housing);
  return {
    byKind,
    total,
    perMonth: roundTo(total / Math.max(1, weeks / 2), 10), // a game week is about two real weeks
    foodWeeks: Math.round(total / ((housing.weeklyCosts.food || 1) / 2)),
  };
}

// ---------- 3. coping profile ----------

const TAG_PRIORITY = ['avoider', 'help_seeker', 'borrower', 'self_sacrificer', 'planner', 'connector'];

export function copingProfile(s, chapterId = s.chapter) {
  const counts = Object.fromEntries(TAGS.map((t) => [t, 0]));
  let total = 0;
  for (const h of chapterHistory(s, chapterId)) {
    if (!h.tags?.length) continue;
    total += 1;
    for (const t of h.tags) counts[t] = (counts[t] || 0) + 1;
  }
  counts.help_seeker += (s.helpLog || []).filter((h) => h.chapter === chapterId).length;
  const top = total ? TAG_PRIORITY.reduce((a, t) => (counts[t] > counts[a] ? t : a), TAG_PRIORITY[0]) : null;
  return { counts, total, top: top && counts[top] ? top : null };
}

// ---------- 4. risk weeks for the next chapter ----------

export const CAUSES = ['money_shortfall', 'test_stress', 'loneliness', 'wellbeing', 'family_pressure', 'housing', 'funding_risk', 'debt', 'career'];

// Money is only a risk of its own when it is short: an income that barely
// covers the basics, or little left right now.
export function moneyTight(content, s) {
  return ['gap', 'tight'].includes(computeBudget(content, s.setup).tier) || s.money < 300;
}

// How exposed this player is to each kind of risk, from their numbers and choices.
export function vulnerabilities(content, s) {
  const profile = copingProfile(s);
  const leaks = spendingLeaks(content, s);
  const income = s.setup.monthlyIncome || 0;
  const gap = computeBudget(content, s.setup).gap;
  const tight = moneyTight(content, s);
  const tr = s.trackers;
  const all = Object.fromEntries(TAGS.map((t) => [t, 0]));
  for (const h of s.history) for (const t of h.tags || []) all[t] += 1;
  return {
    money_shortfall: (tight ? 1 : 0) + (s.money < 300 ? 2 : 0) + (gap > 0 ? 2 : 0) + (leaks.perMonth > income * 0.1 ? 1 : 0)
      + (all.borrower ? 1 : 0) + (tight && tr.buffer === 0 ? 1 : 0) + (tr.debt > 0 ? 1 : 0),
    test_stress: 1 + (s.marks < 55 ? 2 : 0) + (profile.top === 'avoider' ? 1 : 0) + (tr.help_seeking === 0 ? 1 : 0) + (tr.bunk_count >= 2 ? 1 : 0),
    loneliness: 1 + (tr.connection <= 1 ? 2 : 0) + (s.setup.origin !== 'same_city' ? 1 : 0),
    wellbeing: 1 + (s.wellbeing < 50 ? 2 : 0) + (profile.top === 'avoider' || profile.top === 'self_sacrificer' ? 1 : 0),
    family_pressure: (s.setup.family_needs === 'yes' ? 2 : 0) + (s.setup.age_role === 'older_with_responsibilities' ? 1 : 0) + tr.family_obligation,
    housing: s.setup.housing === 'private_rental' || s.setup.housing === 'commuting' ? 2 : 1,
    funding_risk: 1 + (s.flags.includes('failed_module') ? 2 : 0) + (['nsfas', 'bursary'].includes(s.setup.funding) ? 1 : 0),
    debt: tr.debt * 2,
    career: 1 + (tr.help_seeking < 2 ? 1 : 0),
  };
}

// Would this card plausibly happen to this player? Test results aren't known
// yet for a future chapter, so they're estimated from current marks.
function plausible(cond, s) {
  if (!cond) return true;
  const { tests, ...rest } = cond;
  if (!condOk(rest, s)) return false;
  if (tests) {
    if (tests.anyFail === true && s.marks >= 55) return false;
    if (tests.anyFail === false && s.marks < 55) return false;
    if (tests.worstLt !== undefined && s.marks >= 65) return false;
    if (tests.bestGte !== undefined && s.marks < 65) return false;
  }
  return true;
}

export function nextChapterId(content, id) {
  const order = content.chapterOrder.filter((c) => c.status === 'built').map((c) => c.id);
  const i = order.indexOf(id);
  return i >= 0 && i + 1 < order.length ? order[i + 1] : null;
}

export function predictRisk(content, s, targetId) {
  const ch = chapterOf(content, targetId);
  const vul = vulnerabilities(content, s);
  return Array.from({ length: ch.weeks }, (_, i) => {
    const week = i + 1;
    const seen = new Set();
    const events = [];
    let optional = 0;
    for (const e of ch.events) {
      if (e.week !== week || e.pool || ['win', 'what_if'].includes(e.type)) continue;
      if (e.slot && seen.has(e.slot)) continue;
      if (!plausible(e.conditions, s)) continue;
      // Like the game: at most one optional choice card a week, the first that fits.
      const extra = e.choices && e.type !== 'core' && !e.slot;
      if (extra && optional >= 1) continue;
      if (extra) optional += 1;
      if (e.slot) seen.add(e.slot);
      events.push(e);
    }
    const byCause = {};
    for (const e of events) for (const tag of e.forecast_tags || []) byCause[tag] = (byCause[tag] || 0) + (vul[tag] ?? 1);
    if (ch.tests?.week === week) byCause.test_stress = (byCause.test_stress || 0) + vul.test_stress;
    const total = Object.values(byCause).reduce((a, b) => a + b, 0);
    const cause = Object.keys(byCause).reduce((a, k) => (byCause[k] > (byCause[a] ?? -1) ? k : a), null);
    return { week, total, cause, events: events.map((e) => e.title) };
  });
}

// ---------- the forecast ----------

export function semesterForecast(content, s) {
  const chapterId = s.chapter;
  const next = nextChapterId(content, chapterId);
  const target = next || chapterId;
  const money = moneyForecast(content, s.setup);
  const leaks = spendingLeaks(content, s, chapterId);
  const profile = copingProfile(s, chapterId);
  const risks = predictRisk(content, s, target);
  const max = Math.max(...risks.map((r) => r.total), 1);
  const top = [...risks].sort((a, b) => b.total - a.total || a.week - b.week).slice(0, 2).sort((a, b) => a.week - b.week);
  const causes = [...new Set([...top].sort((a, b) => b.total - a.total).map((r) => r.cause).filter(Boolean))];
  const prevId = [...s.completed].reverse().find((id) => id !== chapterId);
  return {
    chapterId,
    target,
    isNext: Boolean(next),
    money,
    leaks,
    buffer: {
      target: bufferTarget(content, s.setup),
      level: s.trackers.buffer,
      tested: s.flags.includes('buffer_short') ? 'short' : s.flags.includes('buffer_ok') ? 'ok' : null,
    },
    profile,
    memory: prevId ? { chapterId: prevId, profile: copingProfile(s, prevId) } : null,
    risks: risks.map((r) => ({ ...r, level: r.total / max >= 0.75 ? 'high' : r.total / max >= 0.4 ? 'medium' : 'low' })),
    top,
    causes,
    actions: actionsFor(content, s, top, causes, profile, leaks, target),
  };
}

// Plan steps tied to the riskiest weeks, naming the real services.
function actionsFor(content, s, top, causes, profile, leaks, target) {
  const weekOf = (cause) => top.find((r) => r.cause === cause)?.week;
  const name = (id) => content.support[id]?.name;
  const chapter = chapterOf(content, target).title;
  const out = [];
  const add = (key, vars = {}, names = {}, moneyKeys = []) => out.push({ key, vars: { chapter, ...vars }, names, money: moneyKeys });
  for (const cause of causes) {
    const week = weekOf(cause);
    switch (cause) {
      case 'money_shortfall':
        // The food programme is for students whose money is short; others are told to keep some aside.
        if (!moneyTight(content, s)) add('fc.act.moneyOk', { week });
        else add(s.setup.funding === 'nsfas' ? 'fc.act.moneyNsfas' : 'fc.act.money', { week }, { food: name('food_programme'), funding: name('financial_aid_office') });
        break;
      case 'test_stress': add('fc.act.academic', { week }, { coach: name('coach') }); break;
      case 'loneliness': add('fc.act.lonely', { week }, { societies: name('societies'), counselling: name('counselling') }); break;
      case 'wellbeing': add('fc.act.wellbeing', { week }, { counselling: name('counselling') }); break;
      case 'family_pressure':
        // A set amount for home only fits a student whose family needs money from them.
        add(s.setup.family_needs === 'yes' || s.setup.age_role === 'older_with_responsibilities' ? 'fc.act.family' : 'fc.act.familyTalk', { week });
        break;
      case 'housing': add(s.setup.housing === 'commuting' ? 'fc.act.commute' : 'fc.act.housing', { week }); break;
      case 'funding_risk': add('fc.act.funding', { week }, { advisor: name('advisor'), funding: name('financial_aid_office') }); break;
      case 'debt': add('fc.act.debt', { week }, { fees: name('fees') }); break;
      case 'career': add('fc.act.career', { week }, { careers: name('careers') }); break;
      default: break;
    }
  }
  const income = s.setup.monthlyIncome || 0;
  if (leaks.perMonth >= Math.max(150, income * 0.1)) add('fc.act.leaks', { month: leaks.perMonth }, {}, ['month']);
  if (s.flags.includes('buffer_short') || s.trackers.buffer === 0) add('fc.act.buffer', { target: bufferTarget(content, s.setup) }, {}, ['target']);
  if (profile.top === 'avoider') add('fc.act.solo', { n: profile.counts.avoider, total: profile.total });
  return out;
}

// ---------- 6. fair game ----------

// What made this player's start harder or easier, and what levels the field.
export const FAIR_FACTORS = [
  { id: 'nsfas', when: (s) => s.setup.funding === 'nsfas', supports: ['food_programme', 'financial_aid_office'] },
  { id: 'gap', when: (s, c) => computeBudget(c, s.setup).gap > 0, supports: ['food_programme', 'financial_aid_office'] },
  { id: 'far', when: (s) => s.setup.origin !== 'same_city', supports: ['mentor', 'societies'] },
  { id: 'rural', when: (s) => s.setup.origin === 'village_rural', supports: ['orientation', 'advisor'] },
  { id: 'laptop', when: (s) => s.setup.laptop === 'no', supports: ['devices'] },
  { id: 'commute', when: (s) => s.setup.housing === 'commuting', supports: ['commuters'] },
  { id: 'private', when: (s) => s.setup.housing === 'private_rental', supports: ['verify_accom'] },
  { id: 'family', when: (s) => s.setup.family_needs === 'yes', supports: ['family_budget'] },
  { id: 'carer', when: (s) => s.setup.age_role === 'older_with_responsibilities', supports: ['advisor'] },
];
export const FAIR_ADVANTAGES = [
  { id: 'laptopYes', when: (s) => s.setup.laptop === 'yes' },
  { id: 'local', when: (s) => s.setup.origin === 'same_city' },
  { id: 'home', when: (s) => s.setup.housing === 'residence' },
  { id: 'covered', when: (s, c) => computeBudget(c, s.setup).ratio >= 1.15 },
];

export function fairGame(content, s) {
  const pressures = FAIR_FACTORS.filter((f) => f.when(s, content));
  const advantages = FAIR_ADVANTAGES.filter((f) => f.when(s, content));
  const supports = [...new Set(pressures.flatMap((f) => f.supports))].filter((id) => content.support[id]);
  const level = pressures.length >= 4 ? 'heavier' : pressures.length >= 2 ? 'moderate' : 'lighter';
  return { pressures: pressures.map((f) => f.id), advantages: advantages.map((f) => f.id), supports, level };
}
