// Monthly budget as percentages of the player's real income.
// Essentials have a realistic minimum in rand (food costs what it costs), so
// a small income can't be "budgeted" into enough: the plan names that gap
// honestly instead of pretending a split fixes it.

import { findById, monthlyEssentials } from './engine.js';

export const ESSENTIALS = ['food', 'transport', 'data', 'other'];
const roundTo = (n, step) => Math.round(n / step) * step;

export function suggestedIncome(content, setup) {
  const funding = findById(content.funding, setup.funding);
  if (!funding) return 0;
  const extra = setup.housing === 'commuting' ? funding.commuterExtra || 0 : 0;
  return funding.defaultMonthly + extra;
}

// gap: can't cover basics · tight: just covers them · ok: some room · strong: plenty
export function incomeTier(ratio) {
  if (ratio < 1) return 'gap';
  if (ratio < 1.15) return 'tight';
  if (ratio < 2) return 'ok';
  return 'strong';
}

function suggestedPct(income, mins, family) {
  const essentials = ESSENTIALS.reduce((a, k) => a + mins[k], 0);
  const amounts = {};
  if (income <= essentials) {
    for (const k of ESSENTIALS) amounts[k] = (mins[k] * income) / essentials;
    amounts.family = 0;
    amounts.buffer = 0;
    amounts.fun = 0;
  } else {
    const surplus = income - essentials;
    for (const k of ESSENTIALS) amounts[k] = mins[k];
    amounts.family = family ? surplus * 0.25 : 0;
    amounts.buffer = surplus * (family ? 0.45 : 0.6);
    amounts.fun = surplus * (family ? 0.3 : 0.4);
  }
  // When basics are affordable, round them up so whole percentages never
  // dip below the minimum; the buffer absorbs the difference.
  const covered = income > essentials;
  const pct = Object.fromEntries(Object.entries(amounts).map(([k, v]) => {
    const raw = (v / income) * 100;
    return [k, covered && ESSENTIALS.includes(k) ? Math.ceil(raw) : Math.round(raw)];
  }));
  const diff = 100 - Object.values(pct).reduce((a, b) => a + b, 0);
  const pool = covered ? ['buffer', 'fun', 'family'] : Object.keys(pct);
  const largest = pool.reduce((a, b) => ((pct[a] ?? -1) >= (pct[b] ?? -1) ? a : b));
  pct[largest] += diff;
  return pct;
}

export function computeBudget(content, setup, overrides = {}) {
  const housing = findById(content.housing, setup.housing);
  const income = Math.max(0, overrides.income ?? setup.monthlyIncome ?? 0);
  const mins = Object.fromEntries(ESSENTIALS.map((k) => [k, (housing.weeklyCosts[k] || 0) * 2]));
  mins.family = 0;
  mins.buffer = 0;
  mins.fun = 0;
  const essentials = monthlyEssentials(content, setup);
  const ratio = essentials ? income / essentials : 1;

  const cats = [...ESSENTIALS, ...(setup.family_needs === 'yes' ? ['family'] : []), 'buffer', 'fun'];
  const suggested = income > 0 ? suggestedPct(income, mins, setup.family_needs === 'yes') : Object.fromEntries(cats.map((k) => [k, 0]));
  const items = cats.map((id) => {
    const pct = Math.max(0, overrides.pct?.[id] ?? suggested[id] ?? 0);
    const amount = roundTo((income * pct) / 100, 10);
    return { id, pct, amount, min: mins[id], essential: ESSENTIALS.includes(id), belowMin: mins[id] > 0 && amount < mins[id] * 0.95 };
  });
  const totalPct = items.reduce((a, b) => a + b.pct, 0);
  return {
    income,
    essentials,
    ratio,
    tier: incomeTier(ratio),
    gap: Math.max(0, essentials - income),
    surplus: Math.max(0, income - essentials),
    items,
    totalPct,
    unallocated: 100 - totalPct,
  };
}
