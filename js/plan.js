// Survival plan: built from setup answers and choices, rendered on screen,
// drawn to a canvas for saving/sharing, and summarised as text for family.

import { findById, choiceLog, eventAmount, chapterOf, testsSummary } from './engine.js';
import { semesterForecast, copingProfile } from './forecast.js';
import { computeBudget } from './budget.js';
import { t, tx, money } from './i18n.js';

const HIDDEN_CONTACTS = ['progression', 'family_budget', 'verify_accom'];

export function contactIds(content, s) {
  const ids = [...s.supportSeen];
  for (const id of content.plan.coreSupport) if (!ids.includes(id)) ids.push(id);
  return ids.filter((id) => !HIDDEN_CONTACTS.includes(id) && content.support[id]);
}

export function budgetFor(content, s) {
  return computeBudget(content, s.setup, s.budget || {});
}

// Headline + advice for the player's income tier.
export function tierAdvice(b) {
  const vars = { essentials: money(b.essentials), income: money(b.income), gap: money(b.gap), surplus: money(b.surplus) };
  return {
    tier: b.tier,
    title: t(`tier.${b.tier}.title`),
    body: t(`tier.${b.tier}.body`, vars),
    steps: b.tier === 'gap' ? [1, 2, 3, 4, 5].map((n) => t(`tier.gap.step${n}`)) : [],
  };
}

// Placeholders any card text can use: {course}, {mod1}, {money}, {city},
// {failed}, {worst}/{worstScore}, {best}/{bestScore}, {memory}...
export function cardVars(content, s, event) {
  const course = findById(content.courses, s.setup.course);
  const amount = s && event ? eventAmount(event, s) : 0;
  const sum = testsSummary(s?.results?.[s.chapter]);
  const failed = (s?.results?.[s.chapter] || []).filter((x) => !x.passed).map((x) => tx(x.name));
  return {
    course: course ? tx(course.label) : '',
    mod1: course ? tx(course.modules[0]) : '',
    mod2: course ? tx(course.modules[1]) : '',
    money: s ? money(s.money) : '',
    inst: tx(content.name),
    short: tx(content.short),
    area: tx(content.area),
    city: tx(content.city),
    amount: money(amount),
    rent: money(content.costs?.rent_private || 0),
    half: money(Math.round(amount / 2 / 50) * 50),
    failed: failed.join(' & ') || (course ? tx(course.modules[0]) : ''),
    worst: sum ? tx(sum.worst.name) : '',
    worstScore: sum ? sum.worst.score : '',
    best: sum ? tx(sum.best.name) : '',
    bestScore: sum ? sum.best.score : '',
    memory: s ? memoryLine(content, s) : '',
  };
}

// Cross-chapter memory: "In First Term you avoided help 3 times out of 5."
export function memoryLine(content, s) {
  const prev = [...(s.completed || [])].reverse().find((id) => id !== s.chapter);
  if (!prev) return '';
  const p = copingProfile(s, prev);
  if (!p.top) return '';
  return t('mem.line', { chapter: tx(chapterOf(content, prev).title), verb: t(`fc.verb.${p.top}`), n: p.counts[p.top], total: p.total });
}

// The Semester Forecast as readable text, shared by the forecast screen,
// the survival plan, the image and the family summary.
export function forecastView(content, s) {
  const fc = semesterForecast(content, s);
  const [a, b] = fc.top.map((r) => r.week);
  const causes = fc.causes.map((c) => t(`fc.c.${c}`));
  const targetTitle = tx(chapterOf(content, fc.target).title);
  const p = fc.profile;
  const mp = fc.memory?.profile;
  const names = (n) => Object.fromEntries(Object.entries(n).map(([k, v]) => [k, tx(v)]).concat([['chapter', targetTitle]]));
  const fmt = (x) => ({ ...x.vars, ...Object.fromEntries((x.money || []).map((k) => [k, money(x.vars[k])])) });
  const l = fc.leaks;
  const gap = computeBudget(content, s.setup).gap;
  return {
    fc,
    leaks: l.total
      ? [t('fc.leaks', { total: money(l.total), month: money(l.perMonth), weeks: l.foodWeeks }),
        ...(gap > 0 && l.perMonth >= gap ? [t('fc.leaksGap', { gap: money(gap) })] : [])].join(' ')
      : t('fc.leaksNone'),
    targetTitle,
    highest: fc.isNext ? t('fc.highestNext', { a, b, chapter: targetTitle }) : t('fc.highest', { a, b }),
    cause: !causes.length ? '' : causes.length > 1 ? t('fc.cause2', { c1: causes[0], c2: causes[1] }) : t('fc.cause1', { c1: causes[0] }),
    pattern: p.top ? t('fc.pattern', { p: t(`fc.p.${p.top}`) }) : t('fc.patternNone'),
    count: p.top ? t('fc.count', { verb: t(`fc.verb.${p.top}`), n: p.counts[p.top], total: p.total }) : '',
    memory: mp?.top && p.top
      ? t('fc.memory', { prev: tx(chapterOf(content, fc.memory.chapterId).title), pastVerb: t(`fc.verb.${mp.top}`), n: mp.counts[mp.top], total: mp.total, nowVerb: t(`fc.verb.${p.top}`), m: p.counts[p.top], mtotal: p.total })
      : '',
    actions: fc.actions.map((x) => t(x.key, { ...fmt(x), ...names(x.names) })),
  };
}

export function buildPlan(content, s) {
  const course = findById(content.courses, s.setup.course);
  const housing = findById(content.housing, s.setup.housing);
  const funding = findById(content.funding, s.setup.funding);
  const vars = cardVars(content, s);

  const fits = (item) =>
    (!item.funding || item.funding.includes(s.setup.funding)) &&
    (!item.housing || item.housing.includes(s.setup.housing));

  const budget = budgetFor(content, s);
  const forecast = forecastView(content, s);
  const bufferItem = budget.items.find((i) => i.id === 'buffer');
  const target = forecast.fc.buffer.target;
  return {
    forecast,
    buffer: {
      target,
      body: t('plan.bufferBody', { target: money(target) }),
      save: bufferItem?.amount > 0
        ? t('plan.bufferSave', { amount: money(bufferItem.amount), months: Math.max(1, Math.ceil(target / bufferItem.amount)) })
        : t('plan.bufferStart'),
      tested: forecast.fc.buffer.tested
        ? t('plan.bufferTested', { result: t(forecast.fc.buffer.tested === 'ok' ? 'plan.bufferOk' : 'plan.bufferShort') }) : '',
    },
    inst: content.status === 'general' ? tx(content.name) : `${tx(content.short)} · ${tx(content.campus)}`,
    instName: tx(content.name),
    subtitle: [tx(course.label), tx(housing.label), tx(funding.label)].join(' · '),
    budget,
    advice: tierAdvice(budget),
    rentNote: tx(funding.rentNote),
    late: content.plan.latePlaybook.filter(fits).map((p) => tx(p.text)),
    dates: content.plan.dates.map((d) => ({ when: tx(d.when), what: tx(d.what) })),
    contacts: contactIds(content, s).map((id) => {
      const c = content.support[id];
      return {
        name: tx(c.name),
        reach: tx(c.reach, vars),
        phones: (c.contacts || []).filter((x) => x.tel).map((x) => x.label),
      };
    }),
    rehearsed: choiceLog(content, s)
      .filter((x) => x.choice)
      .map((x) => {
        const v = cardVars(content, s, x.event);
        return {
          week: x.week,
          event: tx(x.event.title, v),
          choice: tx(x.choice.label, v),
          tip: tx(x.choice.tip, v),
        };
      }),
  };
}

export function familyText(plan) {
  const b = plan.budget;
  const lines = [
    t('family.intro', { inst: plan.instName }),
    '',
    t('family.budget', { in: money(b.income), essentials: money(b.essentials) }),
    ...(b.gap > 0 ? [t('family.gap', { gap: money(b.gap) })] : []),
    t('family.forecast', {
      weeks: plan.forecast.fc.top.map((r) => r.week).join(' & '),
      causes: plan.forecast.fc.causes.map((c) => t(`fc.c.${c}`)).join(', '),
    }),
    '',
    t('family.split'),
    ...b.items.filter((i) => i.pct > 0).map((i) => `• ${t(`budget.${i.id}`)}: ${i.pct}% (${money(i.amount)})`),
    `${t('plan.buffer')}: ${money(plan.buffer.target)}`,
    plan.forecast.leaks,
    '',
    t('fc.planIntro'),
    ...plan.forecast.actions.map((l) => `• ${l}`),
    '',
    t('family.late'),
    ...plan.late.slice(0, 5).map((l, i) => `${i + 1}. ${l}`),
    '',
    t('family.together'),
    '',
    t('family.contacts'),
    ...plan.contacts.map((c) => `• ${c.name}${c.phones.length ? ` (${c.phones.join(', ')})` : ''}`),
    '',
    `${t('app.title')}: ${t('app.tagline')} ${t('plan.examples')}`,
  ];
  return lines.join('\n');
}

// ---------- Canvas image ----------

const W = 1080;
const PAD = 64;
const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
const DEFAULT_COLORS = {
  bg: '#f7f4ee', ink: '#17202e', muted: '#5a6272', line: '#ddd6ca',
  brand: '#12355b', accent: '#f2a93b', good: '#1f7a4d', bad: '#b3261e',
  gapBg: '#fbe9e7', okBg: '#e6f3ec',
};
const C = { ...DEFAULT_COLORS };

// The saved plan image carries the university's colours too.
export function setPlanColors(colors = {}) {
  Object.assign(C, DEFAULT_COLORS, colors.brand ? { brand: colors.brand } : {}, colors.accent ? { accent: colors.accent } : {});
}

function wrap(ctx, text, maxWidth) {
  const words = String(text).split(/\s+/);
  const lines = [];
  let line = '';
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = w;
    } else line = test;
  }
  if (line) lines.push(line);
  return lines;
}

// Lays out the plan; with draw=false it only measures the height.
function layout(ctx, plan, draw) {
  let y = 0;
  const inner = W - PAD * 2;

  const text = (str, { size = 30, weight = 400, color = C.ink, x = PAD, width = inner, lh = 1.35 } = {}) => {
    ctx.font = `${weight} ${size}px ${FONT}`;
    ctx.fillStyle = color;
    for (const l of wrap(ctx, str, width)) {
      y += size * lh;
      if (draw) ctx.fillText(l, x, y - size * (lh - 1) * 0.5 - size * 0.2);
    }
  };
  const gap = (h) => { y += h; };
  const heading = (str) => {
    gap(44);
    if (draw) { ctx.fillStyle = C.accent; ctx.fillRect(PAD, y + 6, 10, 34); }
    text(str, { size: 36, weight: 700, color: C.brand, x: PAD + 26, width: inner - 26 });
    gap(10);
  };
  const row = (cells, { bold = false, colors = [] } = {}) => {
    ctx.font = `${bold ? 700 : 400} 30px ${FONT}`;
    y += 46;
    if (draw) {
      const xs = [PAD, W - PAD - 260, W - PAD];
      cells.forEach((c, i) => {
        ctx.fillStyle = colors[i] || C.ink;
        ctx.textAlign = i === 0 ? 'left' : 'right';
        ctx.fillText(c, xs[i], y - 12);
      });
      ctx.textAlign = 'left';
      ctx.fillStyle = C.line;
      ctx.fillRect(PAD, y, inner, 2);
    }
  };

  // Header band
  const headerH = 250;
  if (draw) {
    ctx.fillStyle = C.brand;
    ctx.fillRect(0, 0, W, headerH);
    ctx.fillStyle = C.accent;
    ctx.fillRect(0, headerH - 10, W, 10);
  }
  gap(40);
  text(t('app.title').toUpperCase(), { size: 26, weight: 700, color: C.accent });
  text(t('plan.title'), { size: 56, weight: 800, color: '#ffffff' });
  text(`${plan.inst} · ${plan.subtitle}`, { size: 26, color: '#d6e2f0' });
  y = headerH;

  heading(t('plan.forecast'));
  text(plan.forecast.highest, { size: 32, weight: 700 });
  text(plan.forecast.cause, { size: 28 });
  text(plan.forecast.pattern, { size: 28 });
  gap(6);
  plan.forecast.actions.forEach((l, i) => { text(`${i + 1}.  ${l}`, { size: 28 }); gap(4); });
  gap(6);
  text(plan.forecast.leaks, { size: 25, color: C.muted });

  heading(t('plan.buffer'));
  text(money(plan.buffer.target), { size: 40, weight: 800, color: C.brand });
  text(plan.buffer.body, { size: 26 });
  text(plan.buffer.save, { size: 26 });
  if (plan.buffer.tested) text(plan.buffer.tested, { size: 24, color: C.muted });

  const b = plan.budget;
  heading(t('plan.budget'));
  row([t('plan.incomeLabel'), '', money(b.income)], { bold: true });
  for (const i of b.items) {
    row([`${t(`budget.${i.id}`)}${i.belowMin ? '  ⚠' : ''}`, `${i.pct}%`, money(i.amount)],
      { colors: [C.ink, C.muted, i.belowMin ? C.bad : C.ink] });
  }
  gap(16);
  const advice = () => {
    gap(18);
    text(plan.advice.title, { size: 30, weight: 700, x: PAD + 24, width: inner - 48, color: b.tier === 'gap' ? C.bad : C.good });
    text(plan.advice.body, { size: 25, x: PAD + 24, width: inner - 48 });
    plan.advice.steps.forEach((s, i) => text(`${i + 1}. ${s}`, { size: 25, x: PAD + 24, width: inner - 48 }));
    gap(18);
  };
  if (draw) {
    // Measure the advice first so its tinted box can be drawn behind it.
    const top = y;
    draw = false;
    advice();
    const bottom = y;
    draw = true;
    y = top;
    ctx.fillStyle = b.tier === 'gap' ? C.gapBg : C.okBg;
    ctx.fillRect(PAD, top, inner, bottom - top);
  }
  advice();
  gap(10);
  text(plan.rentNote, { size: 24, color: C.muted });

  heading(t('plan.late'));
  plan.late.forEach((l, i) => { text(`${i + 1}.  ${l}`, { size: 28 }); gap(6); });

  heading(t('plan.dates'));
  for (const d of plan.dates) {
    text(d.when, { size: 26, weight: 700, color: C.brand });
    text(d.what, { size: 28 });
    gap(8);
  }

  heading(t('plan.contacts'));
  for (const c of plan.contacts) {
    text(c.name, { size: 30, weight: 700 });
    if (c.phones.length) text(c.phones.join('  ·  '), { size: 28, weight: 700, color: C.good });
    text(c.reach, { size: 24, color: C.muted });
    gap(12);
  }

  gap(30);
  if (draw) { ctx.fillStyle = C.line; ctx.fillRect(PAD, y, inner, 2); }
  gap(10);
  text(`${t('app.title')} · ${t('app.tagline')} ${t('plan.examples')}`, { size: 22, color: C.muted });
  gap(PAD);
  return y;
}

export function renderPlanCanvas(plan) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  canvas.width = W;
  canvas.height = 10;
  const height = Math.ceil(layout(ctx, plan, false));
  canvas.height = height;
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, W, height);
  ctx.textBaseline = 'alphabetic';
  layout(ctx, plan, true);
  return canvas;
}

export function planImageBlob(plan) {
  return new Promise((resolve) => renderPlanCanvas(plan).toBlob(resolve, 'image/png'));
}
