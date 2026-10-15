// Survival plan: built from setup answers and choices, rendered on screen,
// drawn to a canvas for saving/sharing, and summarised as text for family.

import { findById, choiceLog, eventAmount, chapterOf, testsSummary } from './engine.js';
import { semesterForecast, copingProfile } from './forecast.js';
import { computeBudget } from './budget.js';
import { t, tx, money } from './i18n.js';
import { imagesToPdf, A4_RATIO } from './pdf.js';

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
// {mod3}, {failed}, {suppCode}, {worst}/{worstScore}, {best}/{bestScore}, {memory}...
export function cardVars(content, s, event) {
  const course = findById(content.courses, s.setup.course);
  const amount = s && event ? eventAmount(event, s) : 0;
  const sum = testsSummary(s?.results?.[s.chapter]);
  const failed = (s?.results?.[s.chapter] || []).filter((x) => !x.passed).map((x) => tx(x.name));
  return {
    course: course ? tx(course.label) : '',
    mod1: course ? tx(course.modules[0]) : '',
    mod2: course ? tx(course.modules[1]) : '',
    // A module outside the two that are scored: students carry more than two.
    mod3: tx(course?.otherModule || content.otherModule),
    money: s ? money(s.money) : '',
    inst: tx(content.name),
    short: tx(content.short),
    area: tx(content.area),
    city: tx(content.city),
    amount: money(amount),
    rent: money(content.costs?.rent_private || 0),
    half: money(Math.round(amount / 2 / 50) * 50),
    failed: failed.join(' & ') || (course ? tx(course.modules[0]) : ''),
    suppCode: content.suppCode || '',
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
  // "Before First Term starts" reads better than "before week 1 of First Term".
  const when = (week) => (week > 1 ? t('fc.when.week', { week, chapter: targetTitle }) : t('fc.when.start', { chapter: targetTitle }));
  const fmt = (x) => ({ ...x.vars, when: when(x.vars.week), ...Object.fromEntries((x.money || []).map((k) => [k, money(x.vars[k])])) });
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
      const b = content.map?.buildings.find((x) => x.id === c.building);
      return {
        name: tx(c.name),
        reach: tx(c.reach, vars).replace(/:\s*$/, '.'),
        phones: (c.contacts || []).filter((x) => x.tel).map((x) => x.label),
        place: b ? [tx(b.name), tx(c.room), tx(c.hours)].filter(Boolean).join(' · ') : tx(c.away),
        email: c.email || '',
      };
    }),
    chapter: tx(chapterOf(content, s.chapter).title),
    rehearsed: choiceLog(content, s)
      .filter((x) => x.choice)
      .map((x) => {
        const v = cardVars(content, s, x.event);
        const ch = chapterOf(content, s.chapter);
        return {
          week: x.week,
          when: t('unit.label', { unit: tx(ch.unit), n: x.week, total: ch.weeks }),
          event: tx(x.event.title, v),
          choice: tx(x.choice.label, v),
          tip: tx(x.choice.tip, v),
        };
      }),
  };
}

// What a student sends a friend about one service: the university (the friend
// may be at another campus), the service, one line on what it offers and a
// link that opens the card. Only what is on the card, nothing about the sender.
export function serviceText(content, id, url) {
  const s = content.support[id];
  const need = content.services?.find((x) => x.support === id)?.need;
  const inst = content.campuses?.length > 1 ? `${tx(content.name)}, ${tx(content.campus)}` : tx(content.name);
  const offers = tx(s.offers, { short: tx(content.short), area: tx(content.area) });
  return [
    inst,
    need ? `${tx(s.name)} (${tx(need)})` : tx(s.name),
    offers.match(/^.+?[.!?](?=\s|$)/)?.[0] || offers,
    '',
    t('svc.shareLink'),
    url,
  ].join('\n');
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

  // One phone screen: the forecast, the buffer, the budget and the numbers to
  // call. The rest of the plan (late money, dates, every contact) stays in the app.
  heading(t('plan.forecast'));
  text(plan.forecast.highest, { size: 32, weight: 700 });
  text(plan.forecast.cause, { size: 28 });
  gap(6);
  plan.forecast.actions.slice(0, 3).forEach((l, i) => { text(`${i + 1}.  ${l}`, { size: 28 }); gap(4); });

  heading(t('plan.buffer'));
  text(money(plan.buffer.target), { size: 40, weight: 800, color: C.brand });
  text(plan.buffer.save, { size: 26 });

  const b = plan.budget;
  heading(t('plan.budget'));
  row([t('plan.incomeLabel'), '', money(b.income)], { bold: true });
  for (const i of b.items) {
    row([`${t(`budget.${i.id}`)}${i.belowMin ? '  ⚠' : ''}`, `${i.pct}%`, money(i.amount)],
      { colors: [C.ink, C.muted, i.belowMin ? C.bad : C.ink] });
  }
  gap(16);
  const advice = () => {
    gap(14);
    text(plan.advice.title, { size: 30, weight: 700, x: PAD + 24, width: inner - 48, color: b.tier === 'gap' ? C.bad : C.good });
    gap(14);
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

  const phones = plan.contacts.filter((c) => c.phones.length).slice(0, 4);
  if (phones.length) {
    heading(t('plan.contacts'));
    for (const c of phones) {
      text(c.name, { size: 28, weight: 700 });
      text(c.phones.join('  ·  '), { size: 28, weight: 700, color: C.good });
      gap(8);
    }
  }

  gap(30);
  if (draw) { ctx.fillStyle = C.line; ctx.fillRect(PAD, y, inner, 2); }
  gap(10);
  text(t('plan.imageMore'), { size: 24, color: C.ink });
  text(`${t('app.title')} · ${t('plan.examples')}`, { size: 22, color: C.muted });
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

// ---------- PDF: the whole plan on A4 pages ----------

const PW = 1240; // 150 dpi across an A4 page
const PH = Math.round(PW * A4_RATIO);
const M = 96;

// The full plan, laid out on as many pages as it needs. A line that would run
// past the bottom starts a new page, and a heading never sits alone at the foot.
export function renderPlanPages(plan, { savedOn = '' } = {}) {
  const pages = [];
  const inner = PW - M * 2;
  const bottom = PH - M - 30;
  let ctx;
  let y = 0;
  const newPage = () => {
    const canvas = document.createElement('canvas');
    canvas.width = PW;
    canvas.height = PH;
    ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, PW, PH);
    ctx.textBaseline = 'alphabetic';
    pages.push(canvas);
    y = M;
  };
  const room = (h) => { if (y + h > bottom) newPage(); };
  const gap = (h) => { y += h; };
  const text = (str, { size = 25, weight = 400, color = C.ink, x = M, width = inner, lh = 1.42, italic = false } = {}) => {
    if (!str) return;
    const font = `${italic ? 'italic ' : ''}${weight} ${size}px ${FONT}`;
    ctx.font = font;
    for (const line of wrap(ctx, str, width)) {
      room(size * lh);
      ctx.font = font;
      ctx.fillStyle = color;
      y += size * lh;
      ctx.fillText(line, x, y - size * (lh - 1) * 0.5 - size * 0.2);
    }
  };
  const heading = (str) => {
    room(150);
    gap(40);
    ctx.fillStyle = C.accent;
    ctx.fillRect(M, y + 8, 8, 32);
    text(str, { size: 32, weight: 700, color: C.brand, x: M + 22, width: inner - 22 });
    gap(10);
  };
  const numbered = (items) => items.forEach((l, i) => { text(`${i + 1}.`, { size: 25, weight: 700 }); y -= 25 * 1.42; text(l, { x: M + 38, width: inner - 38 }); gap(6); });

  // Header band on the first page
  newPage();
  ctx.fillStyle = C.brand;
  ctx.fillRect(0, 0, PW, 250);
  ctx.fillStyle = C.accent;
  ctx.fillRect(0, 242, PW, 8);
  y = 40;
  text(t('app.title').toUpperCase(), { size: 24, weight: 700, color: C.accent });
  text(t('plan.title'), { size: 54, weight: 800, color: '#ffffff' });
  text(`${plan.inst} · ${plan.chapter}`, { size: 25, color: '#d6e2f0' });
  text([plan.subtitle, savedOn].filter(Boolean).join(' · '), { size: 22, color: '#d6e2f0' });
  y = 260;

  heading(t('plan.forecast'));
  text(plan.forecast.highest, { size: 29, weight: 700 });
  text([plan.forecast.cause, plan.forecast.pattern].filter(Boolean).join(' '));
  if (plan.forecast.memory) text(plan.forecast.memory, { color: C.muted, italic: true });
  gap(10);
  text(t('fc.planIntro'), { weight: 700 });
  numbered(plan.forecast.actions);
  text(plan.forecast.leaks, { size: 23, color: C.muted });

  heading(t('plan.buffer'));
  text(money(plan.buffer.target), { size: 40, weight: 800, color: C.brand });
  text(plan.buffer.body);
  text(plan.buffer.save);
  if (plan.buffer.tested) text(plan.buffer.tested, { size: 23, color: C.muted });

  const b = plan.budget;
  heading(t('plan.budget'));
  const row = (cells, { bold = false, colors = [] } = {}) => {
    room(46);
    y += 46;
    ctx.font = `${bold ? 700 : 400} 25px ${FONT}`;
    const xs = [M, PW - M - 240, PW - M];
    cells.forEach((c, i) => {
      ctx.fillStyle = colors[i] || C.ink;
      ctx.textAlign = i === 0 ? 'left' : 'right';
      ctx.fillText(c, xs[i], y - 13);
    });
    ctx.textAlign = 'left';
    ctx.fillStyle = C.line;
    ctx.fillRect(M, y, inner, 2);
  };
  row([t('plan.incomeLabel'), '', money(b.income)], { bold: true });
  for (const i of b.items) row([`${t(`budget.${i.id}`)}${i.belowMin ? '  ⚠' : ''}`, `${i.pct}%`, money(i.amount)], { colors: [C.ink, C.muted, i.belowMin ? C.bad : C.ink] });
  gap(20);
  text(plan.advice.title, { size: 27, weight: 700, color: b.tier === 'gap' ? C.bad : C.good });
  text(plan.advice.body);
  if (plan.advice.steps.length) numbered(plan.advice.steps);
  text(plan.rentNote, { size: 23, color: C.muted });

  heading(t('plan.late'));
  numbered(plan.late);

  heading(t('plan.dates'));
  for (const d of plan.dates) { text(d.when, { weight: 700, color: C.brand }); text(d.what); gap(8); }

  heading(t('plan.contacts'));
  for (const c of plan.contacts) {
    room(110);
    text(c.name, { size: 26, weight: 700 });
    if (c.phones.length) text(c.phones.join('  ·  '), { weight: 700, color: C.good });
    text([c.place, c.email].filter(Boolean).join(' · '), { size: 23 });
    text(c.reach, { size: 23, color: C.muted });
    gap(14);
  }

  if (plan.rehearsed.length) {
    heading(t('plan.rehearsed'));
    for (const r of plan.rehearsed) {
      room(110);
      text(`${r.when} · ${r.event}`, { weight: 700 });
      text(`→ ${r.choice}`);
      if (r.tip) text(r.tip, { size: 23, color: C.muted, italic: true });
      gap(12);
    }
  }

  // Footer on every page, now that the page count is known.
  pages.forEach((canvas, i) => {
    const c = canvas.getContext('2d');
    c.fillStyle = C.line;
    c.fillRect(M, PH - M + 10, inner, 2);
    c.font = `400 20px ${FONT}`;
    c.fillStyle = C.muted;
    c.fillText(`${t('app.title')} · ${t('plan.examples')}`, M, PH - M + 46);
    c.textAlign = 'right';
    c.fillText(`${i + 1} / ${pages.length}`, PW - M, PH - M + 46);
    c.textAlign = 'left';
  });
  return pages;
}

export async function planPdfBlob(plan, opts) {
  const pages = await Promise.all(renderPlanPages(plan, opts).map(async (canvas) => {
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9));
    return { jpeg: new Uint8Array(await blob.arrayBuffer()), width: canvas.width, height: canvas.height };
  }));
  return imagesToPdf(pages);
}
