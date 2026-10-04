// University Simulator game engine: a small, pure state machine (Build Spec v2).
// No DOM access, so it runs in the browser and in Node tests alike.
// Every exported function takes a state and returns a new one.
//
// A journey is a series of chapters (Arrival, First Term, First Exams ...).
// Within a chapter, each week runs: dashboard (with at most one mini) -> that
// week's cards (core, situational, random-pool picks, wins) -> Friday -> next
// week. Each chapter draws a fixed budget of cards and minis, so runs stay
// short. At the end of a chapter comes the Semester Forecast.

export const TRACKERS = ['connection', 'buffer', 'help_seeking', 'family_obligation', 'confidence', 'debt', 'bunk_count'];
export const TAGS = ['help_seeker', 'avoider', 'borrower', 'planner', 'self_sacrificer', 'connector'];
const METERS = ['money', 'marks', 'wellbeing'];
const FINAL_TYPES = ['tests', 'results'];
// The player always keeps a little cash: no payment can take the last R50.
export const CASH_FLOOR = 50;
// Living costs never take more than this share of the money in hand.
const COST_CAP = { food: 0.7, transport: 0.3, data: 0.3, other: 0.3 };

const clamp = (n, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));
// Nobody gets 100%. Marks top out here, and gains above 75% count half:
// the last few percent are the hardest to earn.
export const MARKS_MAX = 92;
const MARKS_HARD = 75;
const clone = (s) => JSON.parse(JSON.stringify(s));
const roundTo = (n, step) => Math.round(n / step) * step;

export function findById(list, id) {
  return list.find((x) => x.id === id);
}

export const findEvent = (content, id) => content.eventIndex[id];
export const chapterOf = (content, id) => content.chapters[id];
export const currentChapter = (content, s) => content.chapters[s.chapter];

// Small seeded RNG, so a playthrough is reproducible from its seed.
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
const hash = (str) => [...str].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) | 0, 7);

// ---------- conditions ----------

const inRange = (v, r) => (r.gte === undefined || v >= r.gte) && (r.lte === undefined || v <= r.lte)
  && (r.gt === undefined || v > r.gt) && (r.lt === undefined || v < r.lt);

export const chapterHistory = (s, id = s.chapter) => s.history.filter((h) => h.chapter === id && !h.skipped);

// Times the player reached out in this chapter (choices + "any week" help).
export function helpCount(s, id = s.chapter) {
  return chapterHistory(s, id).filter((h) => h.tags?.includes('help_seeker')).length
    + (s.helpLog || []).filter((h) => h.chapter === id).length;
}

export function testsSummary(tests) {
  if (!tests?.length) return null;
  const sorted = [...tests].sort((a, b) => a.score - b.score);
  return { anyFail: tests.some((t) => !t.passed), worst: sorted[0], best: sorted[sorted.length - 1] };
}

// Spec conditions: setup keys, plus flags, trackers, meters, week and test results.
export function condOk(cond, s) {
  if (!cond) return true;
  for (const [k, v] of Object.entries(cond)) {
    switch (k) {
      case 'flags': if (!v.every((f) => s.flags.includes(f))) return false; break;
      case 'notFlags': if (v.some((f) => s.flags.includes(f))) return false; break;
      case 'trackers':
        for (const [name, range] of Object.entries(v)) if (!inRange(s.trackers[name] || 0, range)) return false;
        break;
      case 'moneyBelow': if (!(s.money < v)) return false; break;
      case 'helpMax': if (helpCount(s) > v) return false; break;
      case 'marksGte': if (s.marks < v) return false; break;
      case 'week': if (!v.includes(s.week)) return false; break;
      case 'habit': if (!v.includes(s.nightHabit)) return false; break;
      case 'tests': {
        const sum = testsSummary(s.results[s.chapter]);
        if (!sum) return false;
        if (v.anyFail !== undefined && sum.anyFail !== v.anyFail) return false;
        if (v.worstLt !== undefined && !(sum.worst.score < v.worstLt)) return false;
        if (v.bestGte !== undefined && !(sum.best.score >= v.bestGte)) return false;
        break;
      }
      default: if (!v.includes(s.setup[k])) return false;
    }
  }
  return true;
}

// ---------- variants: setup and state tweak a card's text and effects ----------

function applyVariants(obj, s) {
  const v = (obj.variants || []).find((x) => condOk(x.conditions, s));
  const out = { ...obj };
  delete out.variants;
  if (!v) return out;
  Object.assign(out, v);
  if (v.textAppend) {
    out.text = Object.fromEntries(Object.keys(obj.text).map((k) => [k, obj.text[k] + (v.textAppend[k] ?? v.textAppend.en)]));
  }
  if (v.effects) out.effects = { ...obj.effects, ...v.effects };
  out.conditions = obj.conditions;
  delete out.textAppend;
  return out;
}

export function resolveEvent(content, s, id) {
  const raw = findEvent(content, id);
  if (!raw) return null;
  const ev = applyVariants(raw, s);
  if (ev.choices) ev.choices = ev.choices.map((c) => applyVariants(c, s));
  return ev;
}

// ---------- money ----------

// A game week is about two real weeks.
export function weeklyIncome(setup) {
  return roundTo((setup.monthlyIncome || 0) / 2, 25);
}

export function weeklyCosts(content, setup) {
  const housing = findById(content.housing, setup.housing);
  return Object.values(housing.weeklyCosts).reduce((a, b) => a + b, 0);
}

export function monthlyEssentials(content, setup) {
  return weeklyCosts(content, setup) * 2;
}

// Living costs, paid in priority order. Groceries are the big monthly shop,
// bought on the first week of each month (a game week is about two real
// weeks); transport comes next; data and toiletries/other are the first
// things to be cut back when money is tight.
export const SPEND_ORDER = ['food', 'transport', 'data', 'other'];

export function livingCosts(content, setup, week) {
  const c = findById(content.housing, setup.housing).weeklyCosts;
  return SPEND_ORDER
    .map((id) => ({ id, due: id === 'food' ? (week % 2 === 1 ? (c.food || 0) * 2 : 0) : (c[id] || 0) }))
    .filter((x) => x.due > 0);
}

// Pay what you can, in order. Each cost is capped at a share of the money in
// hand, so living costs alone never empty the account.
export function payCosts(money, items) {
  let left = Math.max(0, money);
  const lines = items.map((x) => {
    const paid = Math.min(x.due, Math.floor(Math.max(0, left - CASH_FLOOR) * (COST_CAP[x.id] ?? 0.3)));
    left -= paid;
    return { ...x, paid, short: x.due - paid };
  });
  return { lines, money: left };
}

// When there's more than a month of basics in hand, half of the rest goes on
// everyday extras (clothes, outings, treats), as it does in real life. This
// keeps money from piling up unrealistically.
export function extrasSpend(content, setup, money) {
  const spare = money - monthlyEssentials(content, setup);
  return spare > 0 ? roundTo(spare / 2, 10) : 0;
}

// Lifestyle costs (family requests, nights out) scale with the player's
// income; essentials like food and rent don't.
export function scaledAmount(spec, setup) {
  if (!spec) return 0;
  const { share, min = 0, round = 50 } = spec;
  return Math.max(min, roundTo(share * (setup.monthlyIncome || 0), round));
}

export function eventAmount(event, s) {
  return scaledAmount(event?.amount, s.setup);
}

function resolveMoney(value, event, s) {
  if (typeof value === 'number' || value == null) return value || 0;
  const amount = eventAmount(event, s);
  const sign = value.startsWith('-') ? -1 : 1;
  const key = value.replace(/^-/, '');
  if (key === 'amount') return sign * amount;
  if (key === 'half') return sign * roundTo(amount / 2, 50);
  throw new Error(`Unknown money value ${value}`);
}

// Apply meter and tracker changes; return what actually changed.
// Money never goes below zero: you pay what you can, and going without the
// rest costs wellbeing instead (about 1 point per R100 short, up to 10).
function applyEffects(s, effects = {}) {
  const before = { money: s.money, marks: s.marks, wellbeing: s.wellbeing };
  const m = effects.money || 0;
  let short = 0;
  if (m < 0) {
    const paid = Math.min(-m, Math.max(0, s.money - CASH_FLOOR));
    short = -m - paid;
    s.money -= paid;
    if (short > 0) s.wellbeing = clamp(s.wellbeing - Math.min(10, Math.ceil(short / 100)));
  } else {
    s.money += m;
  }
  const gain = effects.marks || 0;
  s.marks = clamp(s.marks + (gain > 0 && s.marks >= MARKS_HARD ? Math.ceil(gain / 2) : gain), 0, MARKS_MAX);
  s.wellbeing = clamp(s.wellbeing + (effects.wellbeing || 0));
  for (const t of TRACKERS) {
    if (effects[t]) s.trackers[t] = Math.max(0, (s.trackers[t] || 0) + effects[t]);
  }
  s.trackers.buffer = Math.min(5, s.trackers.buffer);
  return {
    money: s.money - before.money,
    marks: s.marks - before.marks,
    wellbeing: s.wellbeing - before.wellbeing,
    short,
  };
}

function addLedger(s, entry, effects) {
  const applied = applyEffects(s, effects);
  s.ledger.push({ ...entry, ...applied });
}

function addLeak(s, kind, amount) {
  if (amount > 0) s.leaks.push({ chapter: s.chapter, week: s.week, kind, amount });
}

const addFlags = (s, flags = []) => { for (const f of flags) if (!s.flags.includes(f)) s.flags.push(f); };
const addSupport = (s, ids = []) => { for (const id of ids) if (!s.supportSeen.includes(id)) s.supportSeen.push(id); };

// ---------- journey ----------

export function newJourney(content, setup, { seed = Math.floor(Math.random() * 2 ** 31) } = {}) {
  return {
    v: 6,
    contentId: content.id,
    setup: { ...setup },
    seed,
    money: content.start.money,
    marks: content.start.marks,
    wellbeing: content.start.wellbeing,
    trackers: Object.fromEntries(TRACKERS.map((t) => [t, 0])),
    flags: [],
    history: [],
    supportSeen: [],
    leaks: [],
    fridays: [],
    nightHabit: null, // 'often' | 'sometimes' | 'rarely', asked at the first Friday
    offered: [], // small spends already offered: { id, accepted }
    recurring: [],
    scheduled: [],
    results: {},
    snapshots: [],
    started: [],
    completed: [],
    chapterStart: {},
    used: [],
    cards: 0, // choice cards drawn in the current chapter, against its budget
    miniWeeks: [],
    mini: null, // this week's mini: { id, choice, deltas }
    minisSeen: [],
    miniLog: [],
    chapter: null,
    week: 0,
    queue: [],
    qi: 0,
    fridayStep: null,
    slots: [],
    followUps: {},
    ledger: [],
    missedPay: 0,
    phase: 'map',
    last: null,
    budget: {},
  };
}

// "Any week" cards: plan which week each pool would like a pick. The list is
// in priority order (a weighted shuffle), because the chapter's card budget
// usually leaves room for only one or two of them.
function planSlots(chapter, seed) {
  const r = rng(seed);
  const taken = {};
  return (chapter.slots || [])
    .map((slot, i) => ({ slot, i, key: r() ** (1 / (slot.weight || 1)) }))
    .sort((a, b) => b.key - a.key)
    .map(({ slot, i }) => {
      const free = slot.weeks.filter((w) => (taken[w] || 0) < 1);
      const options = free.length ? free : slot.weeks;
      const week = options[Math.floor(r() * options.length)];
      taken[week] = (taken[week] || 0) + 1;
      return { week, last: Math.max(...slot.weeks), pool: slot.pool, i };
    });
}

// Which breaks show a mini. A chapter never opens with one: minis only come
// between steps, so the first break that can hold one is before step 2.
function planMinis(chapter, seed) {
  const r = rng(seed);
  const weeks = Array.from({ length: chapter.weeks - 1 }, (_, i) => i + 2);
  for (let i = weeks.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [weeks[i], weeks[j]] = [weeks[j], weeks[i]];
  }
  return weeks.slice(0, chapter.budget?.minis || 0).sort((a, b) => a - b);
}

export function startChapter(content, state, chapterId) {
  const s = clone(state);
  const chapter = chapterOf(content, chapterId);
  // Replaying a chapter replaces its earlier run in the record.
  s.history = s.history.filter((h) => h.chapter !== chapterId);
  s.leaks = s.leaks.filter((l) => l.chapter !== chapterId);
  s.fridays = s.fridays.filter((f) => f.chapter !== chapterId);
  s.snapshots = s.snapshots.filter((x) => x.chapter !== chapterId);
  s.helpLog = (s.helpLog || []).filter((h) => h.chapter !== chapterId);
  const replayed = s.miniLog.filter((m) => m.chapter === chapterId).map((m) => m.id);
  s.minisSeen = s.minisSeen.filter((id) => !replayed.includes(id));
  s.miniLog = s.miniLog.filter((m) => m.chapter !== chapterId);
  delete s.results[chapterId];
  const chapterEvents = new Set(chapter.events.map((e) => e.id));
  s.used = s.used.filter((u) => !chapterEvents.has(u.id) && u.chapter !== chapterId);

  s.chapter = chapterId;
  s.week = 1;
  s.ledger = [];
  s.last = null;
  s.missedPay = 0;
  s.followUps = {};
  s.scheduled = [];
  s.cards = 0;
  s.mini = null;
  // Part-time wages and food vouchers belong to the chapter they started in.
  s.recurring = s.recurring.filter((x) => !((x.effects?.money || 0) > 0));

  // Between chapters: unpaid balances become debt, and a break restores a little.
  if (s.started.length) {
    if (s.money < 0) {
      addLedger(s, { key: 'ledger.carriedDebt' }, { money: -s.money, debt: 1 });
    }
    // A new chapter brings new modules: marks move halfway back to the start level.
    const fresh = Math.round((s.marks + content.start.marks) / 2) - s.marks;
    addLedger(s, { key: 'ledger.break' }, { wellbeing: 10, marks: Math.max(0, fresh) });
  }
  // The scam made its point: the money it took is returned, so the next
  // chapter starts on a fair footing.
  if (s.scamLoss) {
    addLedger(s, { key: 'ledger.scamBack' }, { money: s.scamLoss, debt: -1 });
    s.scamLoss = 0;
  }
  if (!s.started.includes(chapterId)) s.started.push(chapterId);
  s.chapterStart[chapterId] = { money: s.money, marks: s.marks, wellbeing: s.wellbeing, trackers: { ...s.trackers } };
  s.slots = planSlots(chapter, s.seed ^ hash(chapterId));
  s.miniWeeks = planMinis(chapter, s.seed ^ hash(`${chapterId}:minis`));
  beginWeek(content, s);
  s.phase = 'intro';
  return s;
}

// ---------- week lifecycle ----------

// Run budgets (spec section 6). Only cards with choices count; wins, tests and
// results don't. Core cards and "spine" alternates always show; situational
// and random cards fill whatever room is left, at most one a week.
const hasChoices = (e) => Boolean(e?.choices);
const isMandatory = (e) => e.type === 'core' || Boolean(e.slot);
const cardBudget = (chapter) => chapter.budget?.cards ?? Infinity;

// Fixed-week choice cards still to come. Later flags and test results aren't
// known yet, so cards that depend on them are assumed to happen.
function cardsAhead(content, s) {
  const groups = new Set();
  const optionalWeeks = new Set();
  let mandatory = 0;
  for (const e of currentChapter(content, s).events) {
    if (!e.week || e.week <= s.week || e.pool || !hasChoices(e)) continue;
    const { tests, week, ...rest } = e.conditions || {};
    if (!condOk(rest, s)) continue;
    if (!isMandatory(e)) { optionalWeeks.add(e.week); continue; }
    if (e.slot) {
      const key = `${e.week}:${e.slot}`;
      if (groups.has(key)) continue;
      groups.add(key);
    }
    mandatory += 1;
  }
  return { mandatory, optional: optionalWeeks.size };
}

function weekCards(content, s) {
  const chapter = currentChapter(content, s);
  const seenSlots = new Set();
  const now = [];
  for (const e of chapter.events) {
    if (e.week !== s.week || e.pool) continue;
    if (e.slot && seenSlots.has(e.slot)) continue;
    if (!condOk(e.conditions, s)) continue;
    if (e.slot) seenSlots.add(e.slot);
    now.push(e);
  }
  const ahead = cardsAhead(content, s);
  let count = s.cards + now.filter((e) => hasChoices(e) && isMandatory(e)).length;
  let optional = 0;
  const keep = now.filter((e) => {
    if (!hasChoices(e) || isMandatory(e)) return true;
    if (optional >= 1 || count + ahead.mandatory >= cardBudget(chapter)) return false;
    optional += 1;
    count += 1;
    return true;
  });
  return { ids: keep.map((e) => e.id), optional, room: cardBudget(chapter) - count - ahead.mandatory - ahead.optional };
}

function poolCards(content, s, pool) {
  const used = new Set(s.used.map((u) => u.id));
  return [...currentChapter(content, s).events, ...content.events]
    .filter((e) => e.pool === pool && !used.has(e.id) && condOk(e.conditions, s));
}

function pickFromPool(content, s, slot) {
  const pool = poolCards(content, s, slot.pool);
  if (!pool.length) return null;
  const r = rng(s.seed ^ hash(`${s.chapter}:${slot.i}:${s.week}`));
  const total = pool.reduce((a, e) => a + (e.weight || 1), 0);
  let x = r() * total;
  for (const e of pool) {
    x -= e.weight || 1;
    if (x <= 0) return e.id;
  }
  return pool[pool.length - 1].id;
}

// Start of a week: income lands, delayed consequences arrive, cards are queued.
function beginWeek(content, s) {
  const chapter = currentChapter(content, s);
  if (chapter.economy) {
    const funding = findById(content.funding, s.setup.funding);
    const income = weeklyIncome(s.setup);
    if (chapter.lateAllowance && funding.lateWeeks && s.week <= funding.lateWeeks) {
      s.missedPay += 1;
      s.ledger.push({ key: 'ledger.notPaid', label: funding.incomeLabel, money: 0, marks: 0, wellbeing: 0 });
    } else if (s.missedPay > 0) {
      const amount = income * (s.missedPay + 1);
      s.missedPay = 0;
      addLedger(s, { key: 'ledger.backPay', label: funding.incomeLabel }, { money: amount });
    } else {
      addLedger(s, { key: 'ledger.income', label: funding.incomeLabel }, { money: income });
    }
    for (const r of s.recurring) {
      addLedger(s, { label: r.label }, r.effects);
      if (r.leak) addLeak(s, r.leak, -(r.effects.money || 0));
    }
  }
  for (const item of s.scheduled.filter((x) => x.week === s.week)) {
    addLedger(s, { label: item.label }, item.effects);
  }
  s.scheduled = s.scheduled.filter((x) => x.week !== s.week);

  // Queue this week's cards: spine and conditional cards, random-pool picks,
  // follow-ups, then test/results cards last.
  const fixed = weekCards(content, s);
  const cards = fixed.ids;
  if (!fixed.optional && fixed.room > 0) {
    // The highest-priority slots that can still fire share the room that's left.
    const open = s.slots.filter((x) => !x.done && s.week <= x.last && poolCards(content, s, x.pool).length);
    const slot = open.slice(0, fixed.room).find((x) => x.week <= s.week);
    if (slot) {
      cards.push(pickFromPool(content, s, slot));
      s.used.push({ id: cards[cards.length - 1], chapter: s.chapter });
      slot.done = true;
    }
  }
  cards.push(...(s.followUps[s.week] || []));
  s.cards += cards.filter((id) => hasChoices(findEvent(content, id))).length;
  s.mini = s.miniWeeks.includes(s.week) ? pickMini(content, s) : null;
  const isFinal = (id) => FINAL_TYPES.includes(findEvent(content, id)?.type);
  s.queue = [...cards.filter((id) => !isFinal(id)), ...cards.filter(isFinal)];
  s.qi = 0;
  s.fridayStep = null;
}

// ---------- minis: one tap on the week dashboard ----------

// The chapter's own minis first, then the shared ones, never repeating one
// the player has already answered while fresh ones are left.
function pickMini(content, s) {
  const chapter = currentChapter(content, s);
  const ok = (m) => condOk(m.conditions, s);
  const fresh = (m) => !s.minisSeen.includes(m.id);
  const own = (chapter.minis || []).filter(ok);
  const shared = chapter.economy ? (content.minis || []).filter(ok) : [];
  const pool = [own.filter(fresh), shared.filter(fresh), [...own, ...shared]].find((list) => list.length);
  if (!pool) return null;
  const r = rng(s.seed ^ hash(`${s.chapter}:mini:${s.week}`));
  return { id: pool[Math.floor(r() * pool.length)].id, choice: null };
}

export function currentMini(content, s) {
  return s.mini ? content.miniIndex[s.mini.id] || null : null;
}

export function answerMini(content, state, index) {
  const mini = currentMini(content, state);
  const picked = mini?.choices[index];
  if (!picked || state.mini.choice !== null) return state;
  const s = clone(state);
  // Minis are not the main story: they move the hidden trackers, never the meters.
  applyEffects(s, Object.fromEntries(Object.entries(picked.effects || {}).filter(([k]) => TRACKERS.includes(k))));
  addFlags(s, picked.flags);
  s.mini = { ...s.mini, choice: index };
  if (!s.minisSeen.includes(mini.id)) s.minisSeen.push(mini.id);
  s.miniLog.push({ chapter: s.chapter, week: s.week, id: mini.id, choice: index });
  return s;
}

function snapshot(s) {
  s.snapshots.push({ chapter: s.chapter, week: s.week, money: s.money, marks: s.marks, wellbeing: s.wellbeing });
}

// End of a week: living costs, then the knock-on effects of neglect.
// Going without hurts less once you've reached out: the gap is real, but you're not alone.
function endWeek(content, s) {
  if (currentChapter(content, s).economy) {
    const { lines, money } = payCosts(s.money, livingCosts(content, s.setup, s.week));
    s.money = money;
    for (const l of lines) {
      if (l.paid) s.ledger.push({ key: `ledger.cost.${l.id}`, money: -l.paid, marks: 0, wellbeing: 0 });
    }
    // Going without hurts in proportion to how much was missing.
    const missing = (ids) => {
      const ls = lines.filter((l) => ids.includes(l.id));
      const due = ls.reduce((a, l) => a + l.due, 0);
      return due ? ls.reduce((a, l) => a + l.short, 0) / due : 0;
    };
    const supported = s.flags.includes('used_food_support');
    const food = missing(['food']);
    if (food > 0) {
      addLedger(s, { key: 'ledger.cutFood' }, { wellbeing: -Math.ceil((supported ? 4 : 8) * food) });
      if (food > 0.25) addFlags(s, ['went_without']);
    }
    const transport = missing(['transport']);
    if (transport > 0) addLedger(s, { key: 'ledger.cutTransport' }, { marks: -Math.ceil(3 * transport) });
    const extras = missing(['data', 'other']);
    if (extras > 0) addLedger(s, { key: 'ledger.cutExtras' }, { wellbeing: -Math.ceil(2 * extras) });
  }
  if (currentChapter(content, s).economy) {
    nightsOut(content, s);
    const extras = extrasSpend(content, s.setup, s.money);
    if (extras) {
      s.money -= extras;
      s.ledger.push({ key: 'ledger.extras', money: -extras, marks: 0, wellbeing: 0 });
    }
  }
  if (s.wellbeing < 35) addLedger(s, { key: 'ledger.lowWellbeing' }, { marks: -3 });
}

// Friday nights are a habit, paid after the essentials. If there's no money
// left, you stay in: no penalty, the money just isn't there.
function nightsOut(content, s) {
  const h = content.friday?.habits?.[s.nightHabit];
  if (!h) return;
  if (h.weekly) addLedger(s, { key: 'ledger.quietWeek' }, h.weekly);
  const nights = s.week % (h.every || 1) === 0 ? h.nights : 0;
  if (!nights) return;
  const cost = nights * fridayAmount(content, s);
  const paid = Math.min(cost, Math.max(0, s.money - CASH_FLOOR));
  if (paid < cost) s.ledger.push({ key: 'ledger.nightsSkipped', money: 0, marks: 0, wellbeing: 0 });
  if (!paid) return;
  const ch = currentChapter(content, s);
  const beforeTests = ch.tests && s.week === ch.tests.week - 1 && s.nightHabit === 'often';
  addLedger(s, { key: 'ledger.nights' }, {
    money: -paid,
    wellbeing: Math.round((h.effects.wellbeing || 0) * (paid / cost)),
    marks: beforeTests ? -2 : 0,
  });
  addLeak(s, content.friday.leak, paid);
}

export function eventForWeek(content, s) {
  const id = s.queue?.[s.qi];
  return id ? resolveEvent(content, s, id) : null;
}

export function setPhase(state, phase) {
  return { ...state, phase };
}

// Open the current card: sensitive cards show a content note first.
export function openEvent(content, state) {
  const ev = eventForWeek(content, state);
  return setPhase(state, ev?.content_note ? 'note' : 'event');
}

// From the content note: skip the card entirely.
export function skipEvent(content, state) {
  const s = clone(state);
  const ev = eventForWeek(content, s);
  s.history.push({ chapter: s.chapter, week: s.week, eventId: ev.id, skipped: true, tags: [] });
  return advance(content, s);
}

// ---------- what the player can afford ----------

export function choiceCost(event, choice, s) {
  const m = (event.effects?.money || 0) + resolveMoney(choice.effects?.money, event, s);
  return m < 0 ? -m : 0;
}

// Choices the player has the money for. If none is affordable, the cheapest
// stays open (you pay what you can), so a card is never a dead end.
export function affordableChoices(s, event) {
  const costs = event.choices.map((c) => ({ id: c.id, cost: choiceCost(event, c, s) }));
  // "takesAll" choices (the room scam) are always open: they take everything you have.
  const ok = costs.filter((c, i) => c.cost === 0 || c.cost <= s.money - CASH_FLOOR || event.choices[i].takesAll);
  const list = ok.length ? ok : [costs.reduce((a, b) => (b.cost < a.cost ? b : a))];
  return list.map((c) => c.id);
}

export function canAffordTreat(content, s) {
  const t = fridayTemptation(content, s);
  return Boolean(t) && t.amount <= s.money - CASH_FLOOR;
}

export function choose(content, state, choiceId) {
  const s = clone(state);
  const event = eventForWeek(content, s);
  const choice = findById(event.choices, choiceId);
  if (!choice) throw new Error(`Unknown choice ${choiceId} for ${event.id}`);
  if (!affordableChoices(s, event).includes(choiceId)) return state;

  const effects = { ...(event.effects || {}), ...choice.effects };
  effects.money = (event.effects?.money || 0) + resolveMoney(choice.effects?.money, event, s);
  // Friend's-story cards are never scored on the meters.
  if (event.type === 'friend_story') for (const m of METERS) delete effects[m];
  const tags = choice.tags || [];
  if (tags.includes('help_seeker')) effects.help_seeking = (effects.help_seeking || 0) + 1;
  if (tags.includes('connector')) effects.connection = (effects.connection || 0) + 1;
  // Confidence grows by asking and shrinks by staying quiet.
  if (tags.includes('help_seeker')) effects.confidence = (effects.confidence || 0) + 1;
  if (tags.includes('avoider')) effects.confidence = (effects.confidence || 0) - 1;

  // Surprise expenses: an emergency buffer softens the hit.
  let bufferSaved = 0;
  if (event.surprise && effects.money < 0 && s.trackers.buffer > 0) {
    bufferSaved = roundTo(-effects.money * Math.min(0.6, s.trackers.buffer * 0.15), 10);
    effects.money += bufferSaved;
    effects.buffer = (effects.buffer || 0) - 1;
  }

  // A scam takes every rand you have, and leaves you owing the rest.
  let taken = 0;
  if (choice.takesAll && effects.money < 0) {
    taken = Math.min(-effects.money, Math.max(0, s.money));
    if (taken < -effects.money) effects.debt = (effects.debt || 0) + 1;
    s.money -= taken;
    s.scamLoss = (s.scamLoss || 0) + taken;
    effects.money = 0;
  }
  const deltas = applyEffects(s, effects);
  deltas.money -= taken;
  addFlags(s, choice.flags);
  for (const l of choice.later || []) s.scheduled.push({ week: s.week + l.in, effects: l.effects, label: l.label });
  if (choice.recurring) s.recurring.push({ ...choice.recurring });
  if (choice.cancelRecurring) s.recurring = s.recurring.filter((r) => r.id !== choice.cancelRecurring);
  if (choice.followUp) {
    const w = s.week + choice.followUp.in;
    s.followUps[w] = [...(s.followUps[w] || []), choice.followUp.event];
  }

  let buffer = null;
  if (event.surprise && (deltas.money < 0 || deltas.short > 0)) {
    buffer = deltas.short > 0 ? 'short' : 'ok';
    addFlags(s, [buffer === 'ok' ? 'buffer_ok' : 'buffer_short']);
  }

  const support = [...(event.support || []), ...(choice.support || [])];
  addSupport(s, support);
  s.history.push({ chapter: s.chapter, week: s.week, eventId: event.id, choiceId, tags: event.type === 'friend_story' ? [] : tags });
  s.last = { eventId: event.id, choiceId, deltas, support, buffer, bufferSaved };
  s.phase = 'outcome';
  return s;
}

// Cards without choices (wins, follow-ups): apply their effects and move on.
export function acknowledge(content, state) {
  const s = clone(state);
  const ev = eventForWeek(content, s);
  applyEffects(s, { ...ev.effects, ...(ev.type === 'win' ? { confidence: 1 } : {}) });
  addFlags(s, ev.flags);
  addSupport(s, ev.support);
  s.history.push({ chapter: s.chapter, week: s.week, eventId: ev.id, tags: [] });
  return advance(content, s);
}

// ---------- tests ----------

export function computeTests(content, s, chapterId = s.chapter) {
  const cfg = chapterOf(content, chapterId)?.tests;
  if (!cfg) return [];
  const course = findById(content.courses, s.setup.course);
  return course.modules.map((name, i) => {
    const factors = [
      { key: 'tests.base', value: s.marks },
      { key: 'tests.wellbeing', value: Math.round((s.wellbeing - 50) * cfg.wellbeingWeight) },
    ];
    for (const m of cfg.modifiers) {
      const applies = (m.flag ? s.flags.includes(m.flag) : true)
        && (!m.conditions || condOk(m.conditions, s))
        && (!m.unless || !s.flags.includes(m.unless))
        && (!m.modules || m.modules.includes(i));
      // The choice behind a modifier already moved the marks meter, so it counts half here.
      if (applies) factors.push({ label: m.label, value: Math.round(m.value / 2) || Math.sign(m.value) });
    }
    const score = clamp(factors.reduce((a, f) => a + f.value, 0), 0, MARKS_MAX);
    return { name, score, passed: score >= cfg.passMark, factors };
  });
}

function recordTests(content, s) {
  const cfg = currentChapter(content, s).tests;
  const tests = computeTests(content, s);
  s.results[s.chapter] = tests;
  // The marks meter now shows what the tests showed: the average of the modules.
  s.marks = clamp(Math.round(tests.reduce((a, t) => a + t.score, 0) / tests.length), 0, MARKS_MAX);
  const anyFail = tests.some((t) => !t.passed);
  if (cfg.recoverFlag && s.flags.includes('failed_module') && !anyFail) addFlags(s, [cfg.recoverFlag]);
  if (cfg.failFlag && anyFail) addFlags(s, [cfg.failFlag]);
}

export function computeResults(content, s) {
  const tests = s.results[s.chapter] || computeTests(content, s);
  const passed = tests.filter((t) => t.passed).length;
  const tiers = [...content.results.tiers].sort((a, b) => b.minPassed - a.minPassed);
  const tier = tiers.find((t) => passed >= t.minPassed);
  return {
    tests,
    passed,
    tier,
    progression: content.results.progression[s.setup.funding],
    progressionAll: content.results.progression.all,
  };
}

// ---------- Friday mini-choices ----------

// Friday weeks come up a couple of times per chapter, not every week. The first
// one asks about your going-out habit; after that, about half of them offer a
// small spend. Nothing you've accepted, and no subscription, is offered twice.
export function isFridayWeek(content, s) {
  const ch = currentChapter(content, s);
  return Boolean(content.friday && ch?.fridayWeeks?.includes(s.week));
}

export function fridayTemptation(content, s) {
  if (!isFridayWeek(content, s)) return null;
  const ch = currentChapter(content, s);
  if ((ch.fridayWeeks.indexOf(s.week) + s.started.length) % 2) return null;
  const offered = s.offered || [];
  const list = content.friday.temptations.filter((tm) => !offered.some((o) => o.id === tm.id && (o.accepted || tm.recurring)));
  return list.length ? list[offered.length % list.length] : null;
}

// Whether this week still has a Friday screen to show.
export function fridayDue(content, s) {
  if (!isFridayWeek(content, s) || s.fridayStep === 'done') return false;
  return !s.nightHabit || Boolean(fridayTemptation(content, s));
}

export function fridayAmount(content, s) {
  return scaledAmount(content.friday.amount, s.setup);
}

export function setHabit(content, state, habit) {
  if (!content.friday?.habits?.[habit]) return state;
  return { ...state, nightHabit: habit };
}

// step 'habit': 'often' | 'sometimes' | 'rarely'; step 'treat': 'yes' | 'no'
export function friday(content, state, choice) {
  const s = clone(state);
  const f = content.friday;
  if (s.fridayStep === 'habit') {
    const h = f.habits[choice];
    s.nightHabit = choice;
    if (h.connection) applyEffects(s, { connection: h.connection });
    s.fridays.push({ chapter: s.chapter, week: s.week, habit: choice, treat: null });
    if (fridayTemptation(content, s)) { s.fridayStep = 'treat'; return s; }
    s.fridayStep = 'done';
    return advance(content, s);
  }
  const t = fridayTemptation(content, s);
  const yes = choice === 'yes' && canAffordTreat(content, s);
  if (yes) {
    applyEffects(s, { ...t.effects, money: -t.amount });
    addLeak(s, t.leak, t.amount);
    addFlags(s, t.flags);
    if (t.recurring) s.recurring.push({ id: t.recurringId || t.id, effects: t.recurring, label: t.recurringLabel, leak: t.leak });
  } else {
    applyEffects(s, { buffer: 1 }); // the money you didn't spend becomes a little buffer
  }
  s.offered = [...(s.offered || []), { id: t.id, accepted: yes }];
  const entry = s.fridays.find((x) => x.chapter === s.chapter && x.week === s.week);
  if (entry) entry.treat = yes ? t.id : 'no';
  else s.fridays.push({ chapter: s.chapter, week: s.week, treat: yes ? t.id : 'no' });
  s.fridayStep = 'done';
  return advance(content, s);
}

// Subscriptions and debit orders running now, with monthly and yearly cost.
export function activeSubscriptions(s) {
  return (s.recurring || [])
    .filter((r) => r.leak === 'subscriptions' && (r.effects?.money || 0) < 0)
    .map((r) => ({ id: r.id, label: r.label, monthly: -r.effects.money * 2, yearly: -r.effects.money * 24 }));
}

// After a card: next queued card, then Friday, then next week.
export function advance(content, state) {
  const s = clone(state);
  const current = eventForWeek(content, s);
  if (current?.type === 'tests' && !s.results[s.chapter]) {
    recordTests(content, s);
    s.history.push({ chapter: s.chapter, week: s.week, eventId: current.id, tags: [] });
  }
  s.last = null;
  if (s.qi + 1 < (s.queue || []).length) {
    s.qi += 1;
    return openEvent(content, s);
  }
  if (fridayDue(content, s)) {
    s.fridayStep = s.fridayStep || (s.nightHabit ? 'treat' : 'habit');
    s.phase = 'friday';
    return s;
  }
  return nextWeek(content, s);
}

// ---------- help in any week ----------

export function canSeekHelp(content, s, kind) {
  return Boolean(content.anytimeHelp?.[kind]) && !s.flags.includes(`anytime_${kind}`);
}

export function seekHelp(content, state, kind) {
  if (!canSeekHelp(content, state, kind)) return state;
  const s = clone(state);
  const help = content.anytimeHelp[kind];
  addLedger(s, { label: help.label }, { ...help.effects, help_seeking: 1 });
  addFlags(s, [...(help.set || []), `anytime_${kind}`]);
  if (help.recurring) s.recurring.push({ effects: help.recurring, label: help.label });
  s.helpLog = [...(s.helpLog || []), { chapter: s.chapter, week: s.week, kind }];
  addSupport(s, help.support);
  return s;
}

export function nextWeek(content, state) {
  const s = clone(state);
  const chapter = currentChapter(content, s);
  s.ledger = [];
  s.last = null;
  if (s.week >= chapter.weeks) {
    endWeek(content, s); // the last week's living costs are paid too
    s.ledger = [];
    snapshot(s);
    if (!s.completed.includes(s.chapter)) s.completed.push(s.chapter);
    if (chapter.tests) addSupport(s, ['progression']);
    s.phase = 'forecast';
    return s;
  }
  endWeek(content, s);
  snapshot(s);
  s.week += 1;
  beginWeek(content, s);
  s.phase = 'dashboard';
  return s;
}

export function backToMap(state) {
  return { ...state, chapter: null, phase: 'map', queue: [], qi: 0 };
}

// Choices the player made, joined with the content they came from.
export function choiceLog(content, s, chapterId = s.chapter) {
  return chapterHistory(s, chapterId).map((h) => {
    const event = resolveEvent(content, { ...s, chapter: chapterId }, h.eventId);
    const choice = event && h.choiceId ? findById(event.choices || [], h.choiceId) : null;
    return { week: h.week, event, choice };
  }).filter((x) => x.event);
}
