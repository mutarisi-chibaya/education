// First Year Sim (proposal edition): game engine and Semester Forecast.
// Pure functions over a plain state object, so it runs in the browser and in tests.
// A game week stands for about two real weeks: income arrives every game week,
// and the big grocery shop happens every second week (students arrive with week 1's food).

export const METERS = ['money', 'marks', 'wellbeing'];
export const TRACKERS = ['connection', 'help_seeking', 'family_obligation', 'debt'];
export const COPING = ['help_seeker', 'avoider', 'borrower', 'planner', 'self_sacrificer', 'connector'];
export const LEAKS = ['nights', 'takeaways', 'clothes', 'data', 'subscriptions'];
export const SPEND_ORDER = ['food', 'transport', 'data', 'other'];
export const WEEKS = 8;

export const findById = (list, id) => (list || []).find((x) => x.id === id);
export const roundTo = (n, step = 10) => Math.round(n / step) * step;
const clamp = (n) => Math.max(0, Math.min(100, Math.round(n)));

// Small seeded random generator so a playthrough is repeatable.
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- money ----------

export const funding = (content, setup) => findById(content.funding, setup.funding);
export const housing = (content, setup) => findById(content.housing, setup.housing);
export const weeklyIncome = (setup) => roundTo((setup.monthlyIncome || 0) / 2, 25);
export const lateWeeks = (content, setup) => funding(content, setup)?.lateWeeks ?? 3;

export function defaultMonthly(content, setup) {
  const f = funding(content, setup);
  if (!f) return 1650;
  return f.defaultMonthly + (setup.housing === 'commuting' ? f.commuterExtra || 0 : 0);
}

export function livingCosts(content, setup, week) {
  const c = housing(content, setup).weeklyCosts;
  return SPEND_ORDER
    .map((id) => ({ id, due: id === 'food' ? (week % 2 === 0 ? (c.food || 0) * 2 : 0) : c[id] || 0 }))
    .filter((x) => x.due > 0);
}

export const weeklyCosts = (content, setup) => Object.values(housing(content, setup).weeklyCosts).reduce((a, b) => a + b, 0);

// Pay what you can, in order. Money never goes below zero.
export function payCosts(money, items) {
  let left = Math.max(0, money);
  const lines = items.map((x) => {
    const paid = Math.min(x.due, left);
    left -= paid;
    return { ...x, paid, short: x.due - paid };
  });
  return { lines, money: left };
}

export function scaled(spec, setup) {
  if (!spec) return 0;
  const { share, min = 0, round = 50 } = spec;
  return Math.max(min, roundTo(share * (setup.monthlyIncome || 0), round));
}

// Cash flow with no events: when does money run out, on time and with a late allowance?
export function cashFlow(content, setup, late = 0) {
  const income = weeklyIncome(setup);
  let money = content.start.money;
  let runOut = null;
  const weeks = [];
  for (let w = 1; w <= WEEKS; w++) {
    if (w > late) money += w === late + 1 ? income * (late + 1) : income;
    const paid = payCosts(money, livingCosts(content, setup, w));
    money = paid.money;
    if (runOut === null && paid.lines.some((l) => l.short > 0)) runOut = w;
    weeks.push(money);
  }
  return { weeks, runOut, lowest: Math.min(...weeks) };
}

export function moneyForecast(content, setup) {
  const late = lateWeeks(content, setup);
  return {
    start: content.start.money,
    income: weeklyIncome(setup),
    costs: weeklyCosts(content, setup),
    late,
    onTime: cashFlow(content, setup, 0),
    lateFlow: cashFlow(content, setup, late),
  };
}

// ---------- conditions and text ----------

export function condOk(cond, s) {
  if (!cond) return true;
  for (const [k, v] of Object.entries(cond)) {
    if (k === 'flags') { if (!v.every((f) => s.flags.includes(f))) return false; continue; }
    if (k === 'notFlags') { if (v.some((f) => s.flags.includes(f))) return false; continue; }
    if (k === 'trackers') {
      for (const [t, r] of Object.entries(v)) {
        const val = s.trackers[t] || 0;
        if (r.lte !== undefined && val > r.lte) return false;
        if (r.gte !== undefined && val < r.gte) return false;
      }
      continue;
    }
    if (Array.isArray(v) && !v.includes(s.setup[k])) return false;
  }
  return true;
}

const findEvent = (content, id) => findById(content.events, id);

function applyVariants(base, s) {
  const out = { ...base };
  for (const v of base.variants || []) {
    if (!condOk(v.conditions, s)) continue;
    for (const [k, val] of Object.entries(v)) {
      if (k === 'conditions') continue;
      if (k === 'textAppend') {
        out.text = Object.fromEntries(Object.entries(out.text).map(([l, str]) => [l, str + (val[l] ?? val.en)]));
      } else out[k] = val;
    }
  }
  return out;
}

// The event as this player sees it: event and choice variants applied.
export function resolveEvent(content, s, id) {
  const ev = applyVariants(findEvent(content, id), s);
  if (ev.choices) ev.choices = ev.choices.map((c) => applyVariants(c, s));
  return ev;
}

export const eventAmount = (ev, s) => scaled(ev?.amount, s.setup);

// ---------- new game ----------

export function newGame(content, setup, seed = Date.now()) {
  const rand = rng(seed);
  const s = {
    v: 1,
    seed,
    setup,
    week: 1,
    money: content.start.money,
    marks: content.start.marks,
    wellbeing: content.start.wellbeing,
    trackers: Object.fromEntries(TRACKERS.map((t) => [t, 0])),
    flags: [],
    tags: Object.fromEntries(COPING.map((t) => [t, 0])),
    decisions: [],
    leaks: [],
    nightHabit: null, // 'often' | 'sometimes' | 'rarely', asked at the first Friday
    offered: [], // small spends already offered: { id, accepted }
    recurring: [],
    later: [],
    supportSeen: [],
    adapted: [],
    ledger: [],
    extras: {},
    phase: 'dash',
    queue: [],
    qi: 0,
    last: null,
    fridayStep: null,
    temptation: null,
    tests: null,
  };
  // Place each extra card in one random week from its list.
  for (const x of content.extras) {
    const week = x.weeks[Math.floor(rand() * x.weeks.length)];
    let id = x.id;
    if (x.pool) {
      const pool = content.events.filter((e) => e.pool === x.pool && condOk(e.conditions, s));
      id = pool[Math.floor(rand() * pool.length)]?.id;
    }
    if (id) (s.extras[week] ||= []).push(id);
  }
  s.queue = weekQueue(content, s);
  return s;
}

// This week's cards: the first main card whose conditions match, then any extras.
export function weekQueue(content, s) {
  if (s.week >= 7) return [];
  const main = (content.schedule[s.week] || []).find((id) => condOk(findEvent(content, id).conditions, s));
  const extras = (s.extras[s.week] || []).filter((id) => condOk(findEvent(content, id).conditions, s));
  return [main, ...extras].filter(Boolean).slice(0, 3);
}

export const isFridayWeek = (content, s) => content.friday.weeks.includes(s.week);

// Whether this week still has a Friday screen: the habit question once, then small spends.
export function fridayDue(content, s) {
  if (!isFridayWeek(content, s) || s.fridayStep === 'done') return false;
  return !s.nightHabit || Boolean(fridayTemptation(content, s));
}
export const currentEventId = (s) => s.queue[s.qi];

// ---------- effects ----------

// Money can't go below zero: pay what you can, and going without hurts wellbeing.
function changeMoney(s, amount) {
  if (amount >= 0) { s.money += amount; return { delta: amount, short: 0 }; }
  const paid = Math.min(s.money, -amount);
  const short = -amount - paid;
  s.money -= paid;
  if (short > 0) s.wellbeing = clamp(s.wellbeing - Math.min(10, Math.ceil(short / 100)));
  return { delta: -paid, short };
}

function applyEffects(s, effects, ev) {
  const before = { marks: s.marks, wellbeing: s.wellbeing };
  let money = { delta: 0, short: 0 };
  for (const [k, raw] of Object.entries(effects || {})) {
    let v = raw;
    if (typeof v === 'string') {
      const amount = eventAmount(ev, s);
      const sign = v.startsWith('-') ? -1 : 1;
      v = sign * (v.endsWith('half') ? roundTo(amount / 2, 50) : amount);
    }
    if (k === 'money') money = changeMoney(s, v);
    else if (k === 'marks' || k === 'wellbeing') s[k] = clamp(s[k] + v);
    else if (TRACKERS.includes(k)) s.trackers[k] = Math.max(0, (s.trackers[k] || 0) + v);
  }
  return { money: money.delta, short: money.short, marks: s.marks - before.marks, wellbeing: s.wellbeing - before.wellbeing };
}

const addFlags = (s, flags) => { for (const f of flags || []) if (!s.flags.includes(f)) s.flags.push(f); };
const seeSupport = (s, ids) => { for (const id of ids || []) if (!s.supportSeen.includes(id)) s.supportSeen.push(id); };

export function choose(content, s0, choiceId) {
  const s = structuredClone(s0);
  const id = currentEventId(s);
  const ev = resolveEvent(content, s, id);
  const c = findById(ev.choices, choiceId);
  if (!c) throw new Error(`No choice ${choiceId} on ${id}`);
  const deltas = applyEffects(s, c.effects, ev);
  for (const tag of c.tags || []) {
    s.tags[tag] = (s.tags[tag] || 0) + 1;
    if (tag === 'help_seeker') s.trackers.help_seeking += 1;
    if (tag === 'connector') s.trackers.connection += 1;
  }
  addFlags(s, c.flags);
  if (c.cancelRecurring) s.recurring = s.recurring.filter((r) => r.id !== c.cancelRecurring);
  if (c.recurring) s.recurring.push({ ...c.recurring, money: c.recurring.effects?.money ?? c.recurring.money });
  for (const l of c.later || []) s.later.push({ week: s.week + l.in, effects: l.effects, label: l.label });
  const support = [...new Set([...(c.support || [])])];
  seeSupport(s, support);
  if (ev.adaptive && !s.adapted.some((a) => a.id === id)) s.adapted.push({ id, week: s.week, text: ev.adaptive });
  const helpOffered = ev.choices.some((x) => (x.tags || []).includes('help_seeker'));
  s.decisions.push({ week: s.week, eventId: id, choiceId, tags: c.tags || [], helpOffered });
  s.last = { eventId: id, choiceId, deltas, support };
  s.phase = 'outcome';
  return s;
}

// After the outcome (and support cards), move on: next card, Friday, or end of week.
export function advance(content, s0) {
  const s = structuredClone(s0);
  if (s.phase === 'outcome' && s.last?.support.length) { s.phase = 'support'; return s; }
  s.qi += 1;
  if (s.qi < s.queue.length) { s.phase = 'event'; return s; }
  if (fridayDue(content, s)) { s.phase = 'friday'; s.fridayStep = s.nightHabit ? 'treat' : 'habit'; return s; }
  return endWeek(content, s);
}

export function fridayAmount(content, s) {
  return scaled(content.friday.amount, s.setup);
}

// Small spends come after the habit is set. Nothing accepted, and no
// subscription, is ever offered twice.
export function fridayTemptation(content, s) {
  if (!isFridayWeek(content, s) || !s.nightHabit || s.fridayStep === 'habit') return null;
  const offered = s.offered || [];
  if (offered.some((o) => o.week === s.week)) return null;
  const list = content.friday.temptations.filter((tm) => !offered.some((o) => o.id === tm.id && (o.accepted || tm.recurring)));
  return list.length ? list[(s.seed + offered.length) % list.length] : null;
}

export function setHabit(content, s0, habit) {
  if (!content.friday.habits[habit]) return s0;
  return { ...s0, nightHabit: habit };
}

// step 'habit': 'often' | 'sometimes' | 'rarely'; step 'treat': 'yes' | 'no'
export function friday(content, s0, choice) {
  const s = structuredClone(s0);
  if (s.fridayStep === 'habit') {
    const h = content.friday.habits[choice];
    s.nightHabit = choice;
    s.trackers.connection += h.connection || 0;
    s.fridayStep = 'done';
    return endWeek(content, s);
  }
  const tm = fridayTemptation(content, s);
  if (choice === 'yes') {
    const r = changeMoney(s, -tm.amount);
    s.leaks.push({ kind: tm.leak, amount: -r.delta, week: s.week });
    applyEffects(s, tm.effects);
    addFlags(s, tm.flags);
    if (tm.recurring) s.recurring.push({ id: tm.recurringId || tm.id, money: tm.recurring.money, label: tm.recurringLabel, leak: tm.leak });
  }
  s.offered.push({ id: tm.id, accepted: choice === 'yes', week: s.week });
  s.fridayStep = 'done';
  return endWeek(content, s);
}

// Friday nights are a habit, paid after the essentials. With no money left
// you stay in: no penalty, the money just isn't there.
function nightsOut(content, s, ledger) {
  const h = content.friday.habits[s.nightHabit];
  if (!h) return;
  if (h.weekly) { const d = applyEffects(s, h.weekly); ledger.push({ key: 'quietWeek', marks: d.marks, wellbeing: d.wellbeing }); }
  const nights = s.week % (h.every || 1) === 0 ? h.nights : 0;
  if (!nights) return;
  const cost = nights * fridayAmount(content, s);
  const paid = Math.min(cost, s.money);
  if (paid < cost) ledger.push({ key: 'nightsSkipped' });
  if (!paid) return;
  s.money -= paid;
  const d = applyEffects(s, { wellbeing: Math.round((h.effects.wellbeing || 0) * (paid / cost)) });
  s.leaks.push({ kind: content.friday.leak, amount: paid, week: s.week });
  ledger.push({ key: 'nights', money: -paid, wellbeing: d.wellbeing });
}

// Subscriptions and debit orders running now, with monthly and yearly cost.
export function activeSubscriptions(s) {
  return (s.recurring || [])
    .filter((r) => r.leak === 'subscriptions' && r.money < 0)
    .map((r) => ({ id: r.id, label: r.label, monthly: -r.money * 2, yearly: -r.money * 24 }));
}

// Campus support from the dashboard: once a semester, food support helps directly.
export function seekFood(content, s0) {
  const s = structuredClone(s0);
  const h = content.anytimeHelp.food;
  if (s.flags.includes('used_snapp')) return s;
  applyEffects(s, h.effects);
  addFlags(s, h.set);
  seeSupport(s, h.support);
  s.trackers.help_seeking += 1;
  s.tags.help_seeker += 1;
  s.recurring.push({ id: 'snapp', money: h.recurring.money, label: h.label });
  return s;
}

// ---------- end of week ----------

export function endWeek(content, s0) {
  const s = structuredClone(s0);
  const ledger = [];
  const late = lateWeeks(content, s.setup);
  const income = weeklyIncome(s.setup);
  const inc = funding(content, s.setup)?.incomeLabel || { en: 'Income' };
  // Income: the first payments are late; the back pay arrives together.
  const nextWeek = s.week + 1;
  if (nextWeek <= WEEKS) {
    if (nextWeek > late) {
      const amount = nextWeek === late + 1 ? income * (late + 1) : income;
      s.money += amount;
      ledger.push({ label: inc, money: amount, kind: nextWeek === late + 1 ? 'backpay' : 'income' });
    } else ledger.push({ label: inc, money: 0, kind: 'late' });
  }
  for (const r of s.recurring) {
    const res = changeMoney(s, r.money);
    if (r.money < 0 && r.leak) s.leaks.push({ kind: r.leak, amount: -res.delta, week: s.week });
    ledger.push({ label: r.label, money: res.delta });
  }
  for (const l of s.later.filter((x) => x.week === s.week)) {
    const d = applyEffects(s, l.effects);
    ledger.push({ label: l.label, marks: d.marks, wellbeing: d.wellbeing });
  }
  // Living costs, groceries first. What can't be paid is cut, and that hurts.
  const paid = payCosts(s.money, livingCosts(content, s.setup, s.week));
  s.money = paid.money;
  for (const line of paid.lines) {
    ledger.push({ cost: line.id, money: -line.paid, short: line.short });
    if (!line.short) continue;
    const frac = line.short / line.due;
    if (line.id === 'food') {
      s.wellbeing = clamp(s.wellbeing - (s.flags.includes('used_snapp') ? 4 : Math.ceil(8 * frac)));
      if (frac > 0.25) addFlags(s, ['went_without']);
    } else if (line.id === 'transport') s.marks = clamp(s.marks - Math.ceil(3 * frac));
    else s.wellbeing = clamp(s.wellbeing - Math.ceil(2 * frac));
  }
  nightsOut(content, s, ledger);
  s.week += 1;
  s.ledger = ledger;
  s.qi = 0;
  s.fridayStep = null;
  s.last = null;
  s.queue = weekQueue(content, s);
  s.phase = s.week === 7 ? 'tests' : s.week === 8 ? 'results' : 'dash';
  if (s.week === 7) s.tests = runTests(content, s);
  return s;
}

export function openWeek(s0) {
  const s = structuredClone(s0);
  s.phase = s.queue.length ? 'event' : 'friday';
  if (!s.queue.length) s.fridayStep = s.nightHabit ? 'treat' : 'habit';
  return s;
}

// ---------- tests and results ----------

export function runTests(content, s) {
  const cfg = content.tests;
  const course = findById(content.courses, s.setup.course);
  return course.modules.map((name, i) => {
    const mods = cfg.modifiers.filter((m) => {
      if (m.modules && !m.modules.includes(i)) return false;
      if (m.conditions && !condOk(m.conditions, s)) return false;
      if (m.unless) return !s.flags.includes(m.unless);
      return s.flags.includes(m.flag);
    });
    const score = clamp(s.marks + (s.wellbeing - 50) * cfg.wellbeingWeight + mods.reduce((a, m) => a + m.value, 0) + (i === 0 ? 2 : -2));
    return { name, score, passed: score >= cfg.passMark, mods: mods.map((m) => ({ label: m.label, value: m.value })) };
  });
}

export function testsDone(content, s0) {
  const s = structuredClone(s0);
  s.marks = clamp(Math.round(s.tests.reduce((a, t) => a + t.score, 0) / s.tests.length));
  return endWeek(content, s);
}

export function resultTier(content, s) {
  const passed = s.tests.filter((t) => t.passed).length;
  return content.results.tiers.find((t) => passed >= t.minPassed);
}

// ---------- Semester Forecast ----------

export function spendingLeaks(s) {
  const byKind = Object.fromEntries(LEAKS.map((k) => [k, 0]));
  for (const l of s.leaks) byKind[l.kind] = (byKind[l.kind] || 0) + l.amount;
  const total = Object.values(byKind).reduce((a, b) => a + b, 0);
  return { byKind, total, perMonth: roundTo(total / (WEEKS / 2), 10) };
}

export function copingProfile(s) {
  const offered = s.decisions.filter((d) => d.helpOffered);
  const alone = offered.filter((d) => d.tags.some((t) => ['avoider', 'self_sacrificer'].includes(t))).length;
  const asked = offered.filter((d) => d.tags.includes('help_seeker')).length;
  const ranked = COPING.map((t) => [t, s.tags[t] || 0]).sort((a, b) => b[1] - a[1]);
  let style = ranked[0][1] ? ranked[0][0] : 'planner';
  if (alone >= 2 && alone > asked) style = 'avoider';
  else if (asked >= 2 && asked >= alone) style = 'help_seeker';
  return { style, alone, asked, offered: offered.length, counts: Object.fromEntries(ranked) };
}

// Research-based rules, not a trained model: score each week of a real first
// semester from this player's money, choices and setup, then take the top two.
export function riskWeeks(content, s) {
  const m = moneyForecast(content, s.setup);
  const has = (f) => s.flags.includes(f);
  const avoid = (s.tags.avoider || 0) + (s.tags.self_sacrificer || 0);
  const failed = (s.tests || []).some((t) => !t.passed);
  const risks = [];
  const add = (week, cause, score) => { if (score > 0) risks.push({ week, cause, score }); };
  if (m.lateFlow.runOut) add(m.lateFlow.runOut, 'money', 3 + (has('borrowed_from_friend') ? 1 : 0) + (has('skipped_meals') ? 1 : 0) + (has('went_without') ? 1 : 0));
  else add(3, 'money', s.money < 300 ? 1.5 : 0.5);
  if (s.setup.family_needs) add(4, 'family', 1 + s.trackers.family_obligation + (has('sent_all') ? 1 : 0));
  add(5, 'deadlines', 1 + (has('crammed') || has('dropped_mod2') ? 1.5 : 0) + (s.setup.laptop ? 0 : 1));
  add(7, 'tests', 1 + avoid * 0.5 + (has('coached') ? 0 : 1) + (failed ? 2 : 0));
  add(6, 'loneliness', 0.5 + (has('joined_nothing') ? 2 : 0) + (s.setup.origin !== 'same_city' ? 1 : 0) + (s.wellbeing < 50 ? 1 : 0) + (has('pushed_through') ? 1 : 0));
  add(1, 'registration', has('wrong_module') ? 2 : 0.3);
  const top = risks.sort((a, b) => b.score - a.score).filter((r, i, all) => all.findIndex((x) => x.week === r.week) === i).slice(0, 2);
  return { top, weeks: top.map((r) => r.week).sort((a, b) => a - b), causes: top.map((r) => r.cause) };
}

const CAUSE_SUPPORT = {
  money: ['food', 'src_funding'],
  family: ['family_budget'],
  deadlines: ['coach', 'devices'],
  tests: ['coach', 'advisor'],
  loneliness: ['counselling', 'societies', 'mentor'],
  registration: ['advisor', 'mentor'],
};

export function bufferTarget(content, setup) {
  return Math.max(200, roundTo(housing(content, setup).weeklyCosts.food || 0, 50));
}

export function monthlyBudget(content, setup) {
  const c = housing(content, setup).weeklyCosts;
  const income = setup.monthlyIncome || 0;
  const lines = SPEND_ORDER.map((id) => ({ id, amount: (c[id] || 0) * 2 }));
  if (setup.family_needs) lines.push({ id: 'family', amount: roundTo(income * 0.1, 50) });
  const buffer = bufferTarget(content, setup);
  const spent = lines.reduce((a, b) => a + b.amount, 0);
  lines.push({ id: 'buffer', amount: Math.min(roundTo(buffer / 4, 10), Math.max(0, income - spent)) });
  const left = income - lines.reduce((a, b) => a + b.amount, 0);
  lines.push({ id: 'fun', amount: Math.max(0, left) });
  return { income, lines, gap: Math.max(0, -left), buffer };
}

export function playbook(content, setup) {
  const housingKey = setup.housing === 'private_rental' ? 'private' : setup.housing;
  return content.plan.latePlaybook.filter((p) => (!p.funding || p.funding.includes(setup.funding)) && (!p.housing || p.housing.includes(housingKey)));
}

export function semesterForecast(content, s) {
  const money = moneyForecast(content, s.setup);
  const risk = riskWeeks(content, s);
  const coping = copingProfile(s);
  const leaks = spendingLeaks(s);
  const steps = risk.top.map((r) => ({ cause: r.cause, week: r.week, support: CAUSE_SUPPORT[r.cause].filter((id) => content.support[id]) }));
  const services = [...new Set([...steps.flatMap((x) => x.support), ...content.plan.coreSupport, ...s.supportSeen, 'counselling'])]
    .filter((id) => content.support[id]);
  return { money, risk, coping, leaks, steps, services, budget: monthlyBudget(content, s.setup), adapted: s.adapted, playbook: playbook(content, s.setup) };
}
