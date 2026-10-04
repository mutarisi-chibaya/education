// First Year Sim (proposal edition): screens and interaction.
// Flow: intro (3 screens) → setup → money forecast → 8 weeks → tests → results
// → Semester Forecast → survival plan. Progress is saved on this device only.

import * as E from './engine.js';

const SAVE_KEY = 'fys-proposal:save';
const LANG_KEY = 'fys-proposal:lang';
const LANGS = [{ id: 'en', label: 'English', code: 'EN' }, { id: 'zu', label: 'isiZulu', code: 'ZU' }];
const SETUP_STEPS = ['institution', 'course', 'housing', 'origin', 'funding', 'money', 'laptop', 'family_needs'];

const app = document.getElementById('app');
const topRight = document.getElementById('topbar-right');

let content = null;
let strings = {};
let fallback = {};
let lang = 'en';
let screen = 'intro'; // intro | setup | mf | game
let introStep = 0;
let setupStep = 0;
let setup = {};
let s = null; // game state
let overlay = null; // 'help'
let aiText = null;
let aiState = 'idle'; // idle | loading | done | off

// ---------- helpers ----------

const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode: play without saving */ } },
  del(k) { try { localStorage.removeItem(k); } catch { /* ignore */ } },
};

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fill = (str, vars = {}) => String(str).replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined ? vars[k] : m));
const t = (key, vars) => fill(strings[key] ?? fallback[key] ?? key, vars);
const tx = (obj, vars) => (obj == null ? '' : fill(typeof obj === 'string' ? obj : obj[lang] ?? obj.en ?? '', vars));
const money = (n) => `R${String(Math.round(Math.abs(n))).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')}`;
const signed = (n) => (n > 0 ? `+${money(n)}` : n < 0 ? `−${money(n)}` : 'R0');
const cta = (inner) => `<div class="cta">${inner}</div>`;

async function getJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load ${url}`);
  return res.json();
}

async function setLang(id) {
  lang = LANGS.some((l) => l.id === id) ? id : 'en';
  strings = lang === 'en' ? fallback : await getJson(`i18n/${lang}.json`).catch(() => fallback);
  document.documentElement.lang = lang;
  store.set(LANG_KEY, lang);
}

function save() {
  if (s) store.set(SAVE_KEY, { setup, s });
}

const inst = () => content.institution;
const course = () => E.findById(content.courses, setup.course);
const label = (list, id) => tx(E.findById(list, id)?.label);

function vars(ev) {
  const amount = ev ? E.eventAmount(ev, s) : 0;
  const mods = course()?.modules || [];
  return {
    course: label(content.courses, setup.course),
    city: tx(inst().city),
    area: inst().area,
    short: inst().short,
    money: money(s?.money ?? 0),
    amount: money(amount),
    half: money(E.roundTo(amount / 2, 50)),
    mod1: tx(mods[0]),
    mod2: tx(mods[1]),
  };
}

function delta(n, kind) {
  if (!n) return '';
  const text = kind === 'money' ? signed(n) : `${n > 0 ? '+' : '−'}${Math.abs(n)}`;
  return `<span class="delta ${n > 0 ? 'up' : 'down'}"><span class="sr">${esc(t(`meter.${kind}`))}</span>${esc(text)}<span class="unit">${kind === 'money' ? '' : ` ${esc(t(`meter.${kind}`))}`}</span></span>`;
}

// ---------- top bar ----------

function renderTopbar() {
  const cur = LANGS.find((l) => l.id === lang);
  topRight.innerHTML = `<div class="lang-menu">
    <button class="lang-btn" data-action="lang-toggle" aria-haspopup="listbox" aria-expanded="false" aria-label="${esc(t('lang.choose'))}: ${esc(cur.label)}">
      <span aria-hidden="true">🌐</span><span class="lang-cur">${esc(cur.label)}</span><span class="lang-code">${cur.code}</span>
      <svg class="chev" width="12" height="8" viewBox="0 0 12 8" aria-hidden="true"><path d="M1 1.5l5 5 5-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
    </button>
    <div class="lang-pop" hidden>
      <p class="lang-pop-title">${esc(t('lang.choose'))}</p>
      <ul role="listbox" aria-label="${esc(t('lang.choose'))}">
        ${LANGS.map((l) => `<li><button role="option" aria-selected="${l.id === lang}" class="lang-opt ${l.id === lang ? 'on' : ''}" data-action="lang-pick" data-id="${l.id}">
          <span class="lang-badge" aria-hidden="true">${l.code}</span><span class="lang-name">${esc(l.label)}</span>
          <span class="tick" aria-hidden="true">${l.id === lang ? '✓' : ''}</span></button></li>`).join('')}
      </ul>
    </div>
  </div>`;
}

function setLangMenu(open) {
  const menu = topRight.querySelector('.lang-menu');
  if (!menu) return;
  menu.querySelector('.lang-pop').hidden = !open;
  menu.querySelector('.lang-btn').setAttribute('aria-expanded', String(open));
  menu.classList.toggle('open', open);
  if (open) menu.querySelector('.lang-opt.on')?.focus();
}

function hud() {
  const meter = (k, val, pct) => `<div class="meter m-${k} ${pct < 30 ? 'low' : ''}">
    <span class="m-name">${esc(t(`meter.${k}`))}</span><span class="m-val">${esc(val)}</span>
    <span class="track"><span style="width:${Math.max(2, Math.min(100, pct))}%"></span></span></div>`;
  const moneyPct = Math.min(100, (s.money / Math.max(1, setup.monthlyIncome || 1650)) * 100);
  return `<div class="hud" aria-label="${esc(t('dash.week', { n: Math.min(s.week, 8) }))}">
    <div class="hud-week"><strong>${esc(t('dash.week', { n: Math.min(s.week, 8) }))}</strong>
      <span class="weekdots" aria-hidden="true">${Array.from({ length: 8 }, (_, i) => `<span class="${i + 1 < s.week ? 'done' : i + 1 === s.week ? 'now' : ''}"></span>`).join('')}</span></div>
    <div class="meters">${meter('money', money(s.money), moneyPct)}${meter('marks', `${s.marks}%`, s.marks)}${meter('wellbeing', `${s.wellbeing}%`, s.wellbeing)}</div>
  </div>`;
}

// ---------- intro ----------

function introNav(last) {
  return cta(`<div class="dots" aria-hidden="true">${[0, 1, 2].map((i) => `<span class="${i === introStep ? 'on' : ''}"></span>`).join('')}</div>
    <div class="btn-row">
      ${introStep > 0 ? `<button class="btn primary big" data-action="intro-back">← ${esc(t('intro.back'))}</button>` : ''}
      <button class="btn primary big" data-action="${last ? 'start-setup' : 'intro-next'}">${esc(t(last ? 'intro.start' : 'intro.next'))} →</button>
    </div>
    ${s && s.phase !== 'plan' ? `<button class="link" data-action="resume">${esc(t('intro.resume', { n: Math.min(s.week, 8) }))}</button>` : ''}`);
}

function renderIntro() {
  if (introStep === 0) {
    return `<section class="screen intro centred">
      <div class="centred-body">
        <div class="logo big" aria-hidden="true"><span></span><span></span><span></span></div>
        <p class="tag">${esc(t('intro.1.tag'))}</p>
        <h1 class="hero-title">${esc(t('app.title'))}</h1>
        <p class="hero-sub">${esc(t('intro.1.title'))}</p>
        <blockquote class="hook">${esc(t('intro.1.hook'))}<cite>${esc(t('intro.1.src'))}</cite></blockquote>
        <p class="lead">${esc(t('intro.1.body'))}</p>
      </div>
      ${introNav(false)}
    </section>`;
  }
  if (introStep === 1) {
    const icons = ['🧑‍🎓', '📅', '📊', '🤝'];
    return `<section class="screen intro">
      <p class="tag">${esc(t('intro.2.tag'))}</p>
      <h1>${esc(t('intro.2.title'))}</h1>
      <ol class="steps">${[1, 2, 3, 4].map((n) => `<li><span class="step-num" aria-hidden="true">${icons[n - 1]}</span><p>${esc(t(`intro.2.s${n}`))}</p></li>`).join('')}</ol>
      ${introNav(false)}
    </section>`;
  }
  return `<section class="screen intro centred">
    <div class="centred-body">
      <p class="tag">${esc(t('intro.3.tag'))}</p>
      <h1>${esc(t('intro.3.title'))}</h1>
      <p class="lead">${esc(t('intro.3.body'))}</p>
      <div class="sample card">
        <p><strong>${esc(t('fc.highest2', { a: 2, b: 6 }))}</strong> ${esc(t('fc.cause2', { a: t('cause.money'), b: t('cause.tests') }))}</p>
        <p>${esc(t('fc.pattern', { style: t('style.avoider') }))}</p>
      </div>
      <p class="fine">${esc(t('intro.3.note'))}</p>
    </div>
    ${introNav(true)}
  </section>`;
}

// ---------- setup ----------

function option(key, value, title, desc, extra = '') {
  const on = setup[key] === value;
  return `<button class="option ${on ? 'on' : ''}" data-action="pick" data-key="${key}" data-value="${esc(String(value))}" aria-pressed="${on}">
    <span class="opt-title">${esc(title)} ${extra}</span>${desc ? `<span class="opt-desc">${esc(desc)}</span>` : ''}</button>`;
}

function renderSetup() {
  const key = SETUP_STEPS[setupStep];
  const v = { area: inst().area };
  let title = t(`setup.${key === 'family_needs' ? 'family' : key}`);
  let hint = '';
  let body = '';
  if (key === 'institution') {
    hint = t('setup.institutionHint');
    body = `<div class="options">${option('institution', 'up', tx(inst().name), tx(inst().campus), `<span class="pill">${esc(t('setup.pilot'))}</span>`)}</div>`;
  } else if (key === 'course') body = `<div class="options">${content.courses.map((c) => option('course', c.id, tx(c.label), c.modules.map((m) => tx(m)).join(' · '))).join('')}</div>`;
  else if (key === 'housing') body = `<div class="options">${content.housing.map((h) => option('housing', h.id, tx(h.label), tx(h.desc, v))).join('')}</div>`;
  else if (key === 'origin') body = `<div class="options">${content.origins.map((o) => option('origin', o.id, tx(o.label), tx(o.desc))).join('')}</div>`;
  else if (key === 'funding') body = `<div class="options">${content.funding.map((f) => option('funding', f.id, tx(f.label), tx(f.desc))).join('')}</div>`;
  else if (key === 'money') {
    hint = t('setup.moneyHint');
    const amount = setup.monthlyIncome ?? E.defaultMonthly(content, setup);
    body = `<div class="money-input card">
        <label for="income">${esc(t('setup.moneyLabel'))}</label>
        <div class="income-field"><span aria-hidden="true">R</span><input id="income" type="number" inputmode="numeric" min="0" step="50" value="${amount}"></div>
        <div class="chips">${[...new Set([E.defaultMonthly(content, setup), ...content.incomePresets])].sort((a, b) => a - b)
          .map((p) => `<button class="chip ${p === amount ? 'on' : ''}" data-action="preset" data-value="${p}">${money(p)}</button>`).join('')}</div>
        <p class="fine">${esc(tx(E.funding(content, setup)?.rentNote))} ${esc(t('examples'))}</p>
      </div>`;
    return setupFrame(title, hint, body, `<button class="btn primary big" data-action="money-next">${esc(t('setup.moneyUse'))} →</button>`);
  } else if (key === 'laptop') body = `<div class="options">${option('laptop', true, t('setup.laptopYes'))}${option('laptop', false, t('setup.laptopNo'))}</div>`;
  else if (key === 'family_needs') body = `<div class="options">${option('family_needs', true, t('setup.familyYes'))}${option('family_needs', false, t('setup.familyNo'))}</div>`;
  return setupFrame(title, hint, body);
}

function setupFrame(title, hint, body, ctaHtml = '') {
  const total = SETUP_STEPS.length;
  return `<section class="screen setup">
    <div class="progress">
      <button class="back" data-action="setup-back" aria-label="${esc(t('setup.back'))}">←</button>
      <div class="bar"><span style="width:${(setupStep / total) * 100}%"></span></div>
      <span class="progress-label">${esc(t('setup.step', { n: setupStep + 1, total }))}</span>
    </div>
    <h1>${esc(title)}</h1>
    ${hint ? `<p class="lead">${esc(hint)}</p>` : ''}
    ${body}
    ${ctaHtml ? cta(ctaHtml) : ''}
  </section>`;
}

// ---------- money forecast chart ----------

function moneyChart(f) {
  const W = 640; const H = 240; const pad = { l: 56, r: 16, t: 16, b: 34 };
  const series = [
    { key: 'on', data: f.onTime.weeks, name: t('mf.legendOn') },
    { key: 'late', data: f.lateFlow.weeks, name: t('mf.legendLate', { n: f.late }) },
  ];
  const max = Math.max(500, ...series.flatMap((x) => x.data));
  const x = (i) => pad.l + (i * (W - pad.l - pad.r)) / 7;
  const y = (v) => pad.t + (1 - v / max) * (H - pad.t - pad.b);
  const ticks = [0, max / 2, max].map((v) => E.roundTo(v, 100));
  return `<figure class="chart">
    <div class="legend">${series.map((sr) => `<span class="key k-${sr.key}"><span class="swatch"></span>${esc(sr.name)}</span>`).join('')}</div>
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(t('fc.money'))}">
      ${ticks.map((v) => `<g class="grid"><line x1="${pad.l}" x2="${W - pad.r}" y1="${y(v)}" y2="${y(v)}"/><text x="${pad.l - 8}" y="${y(v) + 4}" text-anchor="end">${money(v)}</text></g>`).join('')}
      ${Array.from({ length: 8 }, (_, i) => `<text class="axis" x="${x(i)}" y="${H - 10}" text-anchor="middle">${i + 1}</text>`).join('')}
      ${series.map((sr) => `<polyline class="line l-${sr.key}" points="${sr.data.map((v, i) => `${x(i)},${y(v)}`).join(' ')}"/>
        ${sr.data.map((v, i) => `<circle class="pt p-${sr.key}" cx="${x(i)}" cy="${y(v)}" r="5"><title>${esc(sr.name)} · ${esc(t('mf.week', { n: i + 1 }))}: ${money(v)}</title></circle>`).join('')}`).join('')}
    </svg>
    <figcaption class="sr">${series.map((sr) => `${esc(sr.name)}: ${sr.data.map((v, i) => `${t('mf.week', { n: i + 1 })} ${money(v)}`).join(', ')}`).join('. ')}</figcaption>
  </figure>`;
}

function moneyLines(f) {
  return {
    late: f.lateFlow.runOut ? t('mf.late', { n: f.late, week: f.lateFlow.runOut }) : t('mf.lateOk', { n: f.late }),
    onTime: f.onTime.runOut ? t('mf.onTime', { week: f.onTime.runOut }) : t('mf.onTimeOk'),
  };
}

function renderMoneyForecast() {
  const f = E.moneyForecast(content, setup);
  const l = moneyLines(f);
  return `<section class="screen mf">
    <p class="tag">${esc(t('mf.tag'))}</p>
    <h1>${esc(l.late)}</h1>
    <p class="lead">${esc(l.onTime)}</p>
    <div class="card">${moneyChart(f)}</div>
    <p class="fine">${esc(t('mf.detail', { income: money(f.income), costs: money(f.costs), start: money(f.start) }))} ${esc(t('examples'))}</p>
    ${cta(`<button class="btn primary big" data-action="begin">${esc(t('mf.start'))} →</button>`)}
  </section>`;
}

// ---------- weekly screens ----------

function ledgerList(entries) {
  const inc = E.funding(content, setup)?.incomeLabel;
  return `<ul class="ledger">${entries.map((e) => {
    let name = e.cost ? t(`ledger.${e.cost}`) : e.key ? t(`ledger.${e.key}`) : tx(e.label);
    if (e.kind === 'late') name = `${tx(inc)}: ${t('ledger.late')}`;
    if (e.kind === 'backpay') name = `${tx(inc)} (${t('ledger.backpay')})`;
    const parts = [e.money ? `<span class="delta ${e.money > 0 ? 'up' : 'down'}">${signed(e.money)}</span>` : '',
      e.short ? `<span class="delta down">${esc(t('ledger.short', { short: money(e.short) }))}</span>` : '',
      delta(e.marks, 'marks'), delta(e.wellbeing, 'wellbeing')].join('');
    return `<li><span>${esc(name)}</span><span class="deltas">${parts || '<span class="delta zero">R0</span>'}</span></li>`;
  }).join('')}</ul>`;
}

function renderDash() {
  const lowMoney = s.money < 300 && !s.flags.includes('used_snapp');
  return `<section class="screen dash centred">
    <div class="centred-body">
      <p class="tag">${esc(tx(inst().name))}</p>
      <h1>${esc(t('dash.week', { n: s.week }))}</h1>
      ${s.ledger.length ? `<h2 class="sub">${esc(t('dash.since'))}</h2><div class="card flat">${ledgerList(s.ledger)}</div>` : ''}
      ${lowMoney ? `<div class="nudge help"><span>${esc(t('dash.lowMoney'))}</span><button class="btn small" data-action="food">${esc(t('dash.food'))}</button></div>` : ''}
      ${E.fridayDue(content, s) ? `<p class="fine">🎉 ${esc(t('dash.fridayNote'))}</p>` : ''}
      ${s.nightHabit ? habitPicker() : ''}
      <button class="link" data-action="help">${esc(t('dash.help'))}</button>
    </div>
    ${cta(`<button class="btn primary big" data-action="open-week">${esc(t(s.queue.length ? 'dash.go' : 'dash.goFriday'))} →</button>`)}
  </section>`;
}

// Change the going-out habit any week; the cost comes off at the end of the week.
function habitPicker() {
  return `<div class="habit-picker" role="group" aria-label="${esc(t('dash.habit'))}">
    <span class="habit-label">🎶 ${esc(t('dash.habit'))}</span>
    <span class="chips">${['often', 'sometimes', 'rarely'].map((h) => `<button class="chip ${s.nightHabit === h ? 'on' : ''}" data-action="habit" data-id="${h}" aria-pressed="${s.nightHabit === h}">${esc(t(`habit.${h}`))}</button>`).join('')}</span>
  </div>`;
}

function crisisLinks() {
  return ['counselling', 'higher_health'].flatMap((id) => content.support[id]?.contacts || []).map(contactLink).join('');
}

function contactLink(c) {
  if (c.tel) return `<a class="contact" href="tel:${esc(c.tel)}"><span aria-hidden="true">📞</span> ${esc(tx(c.label))}</a>`;
  return `<a class="contact" href="${esc(c.url)}" target="_blank" rel="noopener"><span aria-hidden="true">🔗</span> ${esc(tx(c.label))}</a>`;
}

function renderEvent() {
  const id = E.currentEventId(s);
  const ev = E.resolveEvent(content, s, id);
  const v = vars(ev);
  const soft = ev.sensitive || ev.content_note;
  return `<section class="screen event">
    <article class="card event-card ${ev.surprise ? 'surprise' : ''} ${soft ? 'soft' : ''}">
      <p class="tag">${esc(ev.surprise ? t('event.surprise') : t('dash.week', { n: s.week }))}</p>
      <h1>${esc(tx(ev.title, v))}</h1>
      <p>${esc(tx(ev.text, v))}</p>
      ${ev.tradeoff ? `<p class="note">${esc(t('event.tradeoff'))}</p>` : ''}
    </article>
    ${soft ? `<div class="sensitive" role="note"><p>${esc(t('event.sensitive'))}</p><div class="contacts">${crisisLinks()}</div></div>` : ''}
    <div class="choices">
      ${ev.choices.map((c, i) => `<button class="choice ${c.support?.length ? 'help' : ''}" data-action="choose" data-id="${c.id}">
        <span class="key" aria-hidden="true">${i + 1}</span>
        <span class="choice-text">${esc(tx(c.label, v))}${c.support?.length ? ` <span class="badge">${esc(t('event.helpBadge'))}</span>` : ''}</span>
      </button>`).join('')}
    </div>
    <p class="fine center keys-tip">${esc(t('event.keys'))}</p>
  </section>`;
}

function nextLabel() {
  const more = s.qi + 1 < s.queue.length || E.fridayDue(content, s);
  return t(more ? 'common.continue' : 'common.nextWeek');
}

function renderOutcome() {
  const ev = E.resolveEvent(content, s, s.last.eventId);
  const c = E.findById(ev.choices, s.last.choiceId);
  const d = s.last.deltas;
  const v = vars(ev);
  const hasSupport = s.last.support.length > 0;
  return `<section class="screen outcome">
    <article class="card">
      <p class="tag">${esc(t('outcome.tag'))}</p>
      <h1>${esc(tx(c.label, v))}</h1>
      <div class="deltas big">${d.money ? `<span class="delta ${d.money > 0 ? 'up' : 'down'}">${signed(d.money)}</span>` : ''}${delta(d.marks, 'marks')}${delta(d.wellbeing, 'wellbeing')}</div>
      <p>${esc(tx(c.outcome, v))}</p>
      ${d.short ? `<p class="nudge warn">${esc(t('outcome.short', { short: money(d.short) }))}</p>` : ''}
      ${c.lesson ? `<div class="lesson"><strong>${esc(t('outcome.lesson'))}</strong> ${esc(tx(c.lesson, v))}</div>` : ''}
    </article>
    ${cta(`<button class="btn primary big" data-action="advance">${esc(hasSupport ? t('outcome.support') : nextLabel())} →</button>`)}
  </section>`;
}

function supportCard(id) {
  const sc = content.support[id];
  const v = { short: inst().short, area: inst().area };
  return `<article class="card support-card">
    <p class="tag">${esc(t('support.tag', { short: inst().short }))}</p>
    <h2>${esc(tx(sc.name, v))}</h2>
    <h3>${esc(t('support.offers'))}</h3><p>${esc(tx(sc.offers, v))}</p>
    <h3>${esc(t('support.reach'))}</h3><p>${esc(tx(sc.reach, v))}</p>
    ${sc.contacts?.length ? `<div class="contacts">${sc.contacts.map(contactLink).join('')}</div>` : ''}
    ${sc.verified ? '' : `<p class="fine">${esc(t('support.unverified'))}</p>`}
  </article>`;
}

function renderSupport() {
  return `<section class="screen support">
    ${s.last.support.map(supportCard).join('')}
    <p class="saved center">✓ ${esc(t('support.saved'))}</p>
    ${cta(`<button class="btn primary big" data-action="advance">${esc(nextLabel())} →</button>`)}
  </section>`;
}

function renderHelp() {
  const ids = ['food', 'src_funding', 'coach', 'counselling', 'advisor', 'mentor', 'devices', 'societies'].filter((id) => content.support[id]);
  return `<section class="screen support">
    <p class="tag">${esc(t('help.title'))}</p>
    <h1>${esc(t('help.title'))}</h1>
    <p class="lead">${esc(t('help.lead'))}</p>
    ${ids.map(supportCard).join('')}
    ${cta(`<button class="btn primary big" data-action="close-help">← ${esc(t('help.close'))}</button>`)}
  </section>`;
}

function renderFriday() {
  if (s.fridayStep === 'habit') {
    const night = E.fridayAmount(content, s);
    const cost = { often: money(night * 4), sometimes: money(night * 2), rarely: money(night) };
    return `<section class="screen event">
      <article class="card event-card friday-card">
        <p class="tag">${esc(t('dash.week', { n: s.week }))}</p>
        <h1>${esc(t('friday.habitTitle'))} 🎶</h1>
        <p>${esc(t('friday.habitText', { amount: money(night) }))}</p>
        <p class="note">${esc(t('friday.habitNote'))}</p>
      </article>
      <div class="choices">
        ${['often', 'sometimes', 'rarely'].map((h, i) => `<button class="choice" data-action="friday" data-id="${h}"><span class="key" aria-hidden="true">${i + 1}</span>
          <span class="choice-text">${esc(t(`friday.${h}`))}<span class="sub-note">${esc(t(`friday.${h}Note`, { amount: cost[h] }))}</span></span></button>`).join('')}
      </div>
    </section>`;
  }
  const tm = E.fridayTemptation(content, s);
  const amount = money(tm.amount);
  return `<section class="screen event">
    <article class="card event-card friday-card">
      <p class="tag">${esc(t('friday.title'))}</p>
      <h1>${esc(t('friday.treatTitle'))}</h1>
      <p>${esc(tx(tm.text, { amount }))}</p>
    </article>
    <div class="choices">
      <button class="choice" data-action="friday" data-id="yes"><span class="key" aria-hidden="true">1</span><span class="choice-text">${esc(t('friday.yes', { amount }))}</span></button>
      <button class="choice" data-action="friday" data-id="no"><span class="key" aria-hidden="true">2</span><span class="choice-text">${esc(t('friday.no'))}</span></button>
    </div>
  </section>`;
}

function renderTests() {
  const card = content.testsCard;
  const v = vars();
  return `<section class="screen tests">
    <p class="tag">${esc(t('dash.week', { n: 7 }))}</p>
    <h1>${esc(tx(card.title))}</h1>
    <p class="lead">${esc(tx(card.text))}</p>
    ${s.tests.map((x) => `<article class="card test ${x.passed ? 'pass' : 'fail'}">
      <div class="test-head"><h2>${esc(tx(x.name))}</h2><span class="score">${x.score}%</span></div>
      <p class="test-verdict">${esc(t(x.passed ? 'tests.pass' : 'tests.fail'))}</p>
      <h3>${esc(t('tests.why'))}</h3>
      ${x.mods.length ? `<ul class="mods">${x.mods.map((m) => `<li><span>${esc(tx(m.label, v))}</span><span class="delta ${m.value > 0 ? 'up' : 'down'}">${m.value > 0 ? '+' : '−'}${Math.abs(m.value)}</span></li>`).join('')}</ul>` : `<p class="fine">${esc(t('tests.none'))}</p>`}
    </article>`).join('')}
    ${cta(`<button class="btn primary big" data-action="tests-done">${esc(t('tests.continue'))} →</button>`)}
  </section>`;
}

function renderResults() {
  const tier = E.resultTier(content, s);
  const card = content.resultsCard;
  const v = vars();
  const prog = content.results.progression;
  return `<section class="screen results">
    <p class="tag">${esc(t('dash.week', { n: 8 }))} · ${esc(tx(card.title))}</p>
    <h1>${esc(tx(tier.title))}</h1>
    <p class="lead">${esc(tx(tier.body))}</p>
    <div class="score-row">${s.tests.map((x) => `<div class="score-tile ${x.passed ? 'pass' : 'fail'}"><span>${esc(tx(x.name))}</span><strong>${x.score}%</strong></div>`).join('')}</div>
    <div class="card"><p>${esc(tx(prog[setup.funding], v))}</p><p>${esc(tx(prog.all, v))}</p></div>
    ${cta(`<button class="btn primary big" data-action="to-forecast">${esc(t('results.forecast'))} →</button>`)}
  </section>`;
}

// ---------- Semester Forecast + survival plan ----------

function riskHeadline(fc) {
  const w = fc.risk.weeks;
  const c = fc.risk.causes.map((x) => t(`cause.${x}`));
  return {
    weeks: w.length > 1 ? t('fc.highest2', { a: w[0], b: w[1] }) : t('fc.highest1', { a: w[0] }),
    cause: c.length > 1 ? t('fc.cause2', { a: c[0], b: c[1] }) : t('fc.cause1', { a: c[0] }),
  };
}

function renderForecast() {
  const fc = E.semesterForecast(content, s);
  const h = riskHeadline(fc);
  const l = moneyLines(fc.money);
  const foodWeek = (E.housing(content, setup).weeklyCosts.food || 1) / 2;
  const leakWeeks = Math.max(1, Math.round(fc.leaks.perMonth / foodWeek));
  const cp = fc.coping;
  return `<section class="screen forecast">
    <p class="tag">${esc(t('fc.tag'))}</p>
    <h1>${esc(t('fc.title'))}</h1>
    <div class="card headline">
      <p class="big-line">${esc(h.weeks)}</p>
      <p>${esc(h.cause)}</p>
      <p>${esc(t('fc.pattern', { style: t(`style.${cp.style}`) }))}</p>
      <div class="risk-strip" aria-hidden="true">${Array.from({ length: 8 }, (_, i) => `<span class="${fc.risk.weeks.includes(i + 1) ? 'hot' : ''}">${i + 1}</span>`).join('')}</div>
    </div>
    <div class="fc-grid">
      <article class="card">
        <h2>💸 ${esc(t('fc.money'))}</h2>
        <p><strong>${esc(l.late)}</strong> ${esc(l.onTime)}</p>
        ${moneyChart(fc.money)}
      </article>
      <article class="card">
        <h2>🧾 ${esc(t('fc.leaks'))}</h2>
        <p>${esc(fc.leaks.total ? t('fc.leaksLine', { amount: money(fc.leaks.perMonth), weeks: leakWeeks === 1 ? t('fc.leaksWeeks1') : t('fc.leaksWeeksN', { n: leakWeeks }) }) : t('fc.leaksNone'))}</p>
        ${subscriptionsHtml()}
        ${fc.leaks.total ? `<ul class="bars">${E.LEAKS.filter((k) => fc.leaks.byKind[k]).map((k) => `<li><span>${esc(t(`leak.${k}`))}</span>
          <span class="bar"><span style="width:${(fc.leaks.byKind[k] / fc.leaks.total) * 100}%"></span></span><strong>${money(fc.leaks.byKind[k])}</strong></li>`).join('')}</ul>` : ''}
      </article>
      <article class="card">
        <h2>🧭 ${esc(t('fc.coping'))}</h2>
        ${cp.offered ? `<p><strong>${esc(cp.alone >= cp.asked ? t('fc.alone', { n: cp.alone, total: cp.offered }) : t('fc.asked', { n: cp.asked, total: cp.offered }))}</strong></p>` : ''}
        <p>${esc(t(`styleNote.${cp.style}`))}</p>
      </article>
      <article class="card">
        <h2>🔀 ${esc(t('fc.adaptive'))}</h2>
        ${fc.adapted.length ? `<ul class="plain">${fc.adapted.map((a) => `<li>${esc(tx(a.text))}</li>`).join('')}</ul>` : `<p>${esc(t('fc.adaptiveNone'))}</p>`}
      </article>
    </div>
    <p class="fine">${esc(t('fc.rules'))}</p>
    ${cta(`<button class="btn primary big" data-action="to-plan">${esc(t('fc.plan'))} →</button>`)}
  </section>`;
}

function subscriptionsHtml() {
  const subs = E.activeSubscriptions(s);
  if (!subs.length) return '';
  const year = subs.reduce((a, x) => a + x.yearly, 0);
  return `<p><strong>${esc(t('fc.subs'))}:</strong> ${subs.map((x) => `${esc(tx(x.label))} (${esc(t('fc.subsMonth', { amount: money(x.monthly) }))})`).join(', ')}. ${esc(t('fc.subsYear', { amount: money(year) }))}</p>`;
}

function supportName(id) {
  return tx(content.support[id]?.name, { short: inst().short });
}

function planSteps(fc) {
  return fc.steps.map((st) => {
    let key = `step.${st.cause}`;
    if (st.cause === 'deadlines' && !setup.laptop) key = 'step.deadlinesLaptop';
    return t(key, { week: st.week, s0: supportName(st.support[0]), s1: supportName(st.support[1] || st.support[0]) });
  });
}

function familySummary(fc) {
  const b = fc.budget;
  const essentials = b.lines.filter((x) => ['food', 'transport', 'data', 'other'].includes(x.id)).reduce((a, x) => a + x.amount, 0);
  const weeks = fc.risk.weeks.join(lang === 'zu' ? ' no-' : ' and ');
  return [
    t('family.intro', { inst: tx(inst().name) }),
    t('family.risk', { weeks, causes: fc.risk.causes.map((c) => t(`cause.${c}`)).join(lang === 'zu' ? ', ' : ' and ') }),
    t('family.needs', { amount: money(essentials) }),
    t('family.buffer', { amount: money(b.buffer) }),
    t('family.late'),
    setup.family_needs ? t('family.ask') : t('family.askNoNeeds', { weeks }),
    t('family.footer'),
  ];
}

function planText(fc) {
  const h = riskHeadline(fc);
  return [
    `${t('plan.tag')} · ${t('app.title')}`,
    `${h.weeks} ${h.cause}`,
    '',
    ...planSteps(fc).map((x) => `• ${x}`),
    '',
    t('plan.buffer', { amount: money(fc.budget.buffer) }),
    '',
    `${t('plan.contacts')}:`,
    ...fc.services.slice(0, 6).map((id) => `• ${supportName(id)}${content.support[id].contacts?.[0] ? `: ${tx(content.support[id].contacts[0].label)}` : ''}`),
  ].join('\n');
}

function renderPlan() {
  const fc = E.semesterForecast(content, s);
  const h = riskHeadline(fc);
  const b = fc.budget;
  const forLine = t('plan.for', { inst: inst().short, course: label(content.courses, setup.course), housing: label(content.housing, setup.housing), funding: label(content.funding, setup.funding) });
  return `<section class="screen plan">
    <header class="plan-head">
      <p class="tag">${esc(t('plan.tag'))}</p>
      <h1>${esc(h.weeks)}</h1>
      <p class="lead">${esc(h.cause)} ${esc(t('fc.pattern', { style: t(`style.${fc.coping.style}`) }))}</p>
      <p class="fine">${esc(forLine)}</p>
    </header>
    ${aiState === 'loading' ? `<div class="card ai"><p class="fine">${esc(t('plan.aiLoading'))}</p></div>` : ''}
    ${aiText ? `<div class="card ai"><h2>✨ ${esc(t('plan.ai'))}</h2><p>${esc(aiText)}</p><p class="fine">${esc(t('plan.aiNote'))}</p></div>` : ''}
    <div class="plan-grid">
      <article class="card">
        <h2>✅ ${esc(t('plan.steps'))}</h2>
        <ol class="plan-steps">${planSteps(fc).map((x) => `<li>${esc(x)}</li>`).join('')}</ol>
        <p class="buffer">🛟 ${esc(t('plan.buffer', { amount: money(b.buffer) }))}</p>
      </article>
      <article class="card">
        <h2>💰 ${esc(t('plan.budget'))}</h2>
        <ul class="budget">
          <li class="in"><span>${esc(t('budget.income'))}</span><strong>${money(b.income)}</strong></li>
          ${b.lines.map((x) => `<li><span>${esc(t(`budget.${x.id}`))}</span><span>${money(x.amount)}</span></li>`).join('')}
        </ul>
        ${b.gap ? `<p class="nudge warn">${esc(t('plan.gap', { gap: money(b.gap) }))}</p>` : ''}
        <p class="fine">${esc(t('examples'))}</p>
      </article>
      <article class="card">
        <h2>⏰ ${esc(t('plan.late'))}</h2>
        <ul class="plain">${fc.playbook.map((p) => `<li>${esc(tx(p.text))}</li>`).join('')}</ul>
      </article>
      <article class="card">
        <h2>📅 ${esc(t('plan.dates'))}</h2>
        <ul class="dates">${content.plan.dates.map((d) => `<li><strong>${esc(tx(d.when))}</strong><span>${esc(tx(d.what))}</span></li>`).join('')}</ul>
      </article>
      <article class="card wide">
        <h2>📞 ${esc(t('plan.contacts'))}</h2>
        <ul class="contact-list">${fc.services.map((id) => `<li><strong>${esc(supportName(id))}</strong>
          ${content.support[id].contacts?.length ? `<div class="contacts">${content.support[id].contacts.map(contactLink).join('')}</div>` : `<span class="fine">${esc(tx(content.support[id].reach, { short: inst().short }))}</span>`}</li>`).join('')}</ul>
      </article>
      <article class="card wide family">
        <h2>👪 ${esc(t('family.title'))}</h2>
        ${familySummary(fc).map((p) => `<p>${esc(p)}</p>`).join('')}
      </article>
    </div>
    <div class="actions">
      <button class="btn primary big" data-action="save-image">📥 ${esc(t('plan.save'))}</button>
      <a class="btn big whatsapp" href="https://wa.me/?text=${encodeURIComponent(planText(fc))}" target="_blank" rel="noopener">💬 ${esc(t('plan.share'))}</a>
      <a class="btn big" href="https://wa.me/?text=${encodeURIComponent(familySummary(fc).join('\n\n'))}" target="_blank" rel="noopener">👪 ${esc(t('plan.family'))}</a>
    </div>
    <div class="actions secondary">
      <button class="btn" data-action="replay">↺ ${esc(t('plan.replay'))}</button>
      <button class="btn ghost" data-action="new-setup">${esc(t('plan.newSetup'))}</button>
    </div>
    <p class="fine center">${esc(t('plan.privacy'))} ${esc(t('examples'))}</p>
  </section>`;
}

// Optional: AI writes the forecast in words when online (served by serve.py).
async function requestAi() {
  if (aiState !== 'idle' || !navigator.onLine) return;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 30000);
  try {
    const health = await fetch('api/health').then((r) => (r.ok ? r.json() : null)).catch(() => null);
    if (!health?.ai) { aiState = 'off'; return; }
    aiState = 'loading';
    render();
    const fc = E.semesterForecast(content, s);
    const payload = {
      lang,
      institution: inst().short,
      course: setup.course,
      housing: setup.housing,
      funding: setup.funding,
      chapter: 'First semester',
      riskWeeks: fc.risk.top.map((r) => ({ week: r.week, cause: r.cause })),
      copingStyle: fc.coping.style,
      copingCounts: fc.coping.counts,
      moneyRunsOutIfLate: fc.money.lateFlow.runOut,
      moneyRunsOutOnTime: fc.money.onTime.runOut,
      allowanceWeeksLate: fc.money.late,
      spendingLeaksPerMonth: fc.leaks.perMonth,
      emergencyBufferTarget: fc.budget.buffer,
      plan: planSteps(fc),
      services: fc.services.map((id) => ({ name: supportName(id), contacts: (content.support[id].contacts || []).map((c) => tx(c.label)) })),
    };
    const res = await fetch('api/plan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: ctrl.signal });
    const data = res.ok ? await res.json() : null;
    aiText = typeof data?.text === 'string' && data.text.trim() ? data.text.trim() : null;
  } catch {
    aiText = null;
  } finally {
    clearTimeout(timer);
    aiState = 'done';
    if (s?.phase === 'plan') render();
  }
}

// Draw the plan onto a canvas so it can be saved or shared as an image.
function wrap(ctx, text, maxWidth) {
  const words = String(text).split(' ');
  const lines = [];
  let line = '';
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxWidth && line) { lines.push(line); line = w; } else line = test;
  }
  if (line) lines.push(line);
  return lines;
}

async function savePlanImage() {
  const fc = E.semesterForecast(content, s);
  const h = riskHeadline(fc);
  const canvas = document.createElement('canvas');
  const W = 1080; const H = 1350; const M = 72;
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#f6f3ec'; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#12355b'; ctx.fillRect(0, 0, W, 210);
  ctx.fillStyle = '#f2a93b'; ctx.font = '700 30px system-ui, sans-serif'; ctx.fillText(t('plan.tag').toUpperCase(), M, 80);
  ctx.fillStyle = '#ffffff'; ctx.font = '800 54px system-ui, sans-serif';
  wrap(ctx, h.weeks, W - 2 * M).slice(0, 2).forEach((l, i) => ctx.fillText(l, M, 145 + i * 60));
  let y = 270;
  const block = (title, lines, size = 32) => {
    ctx.fillStyle = '#8a5300'; ctx.font = '800 26px system-ui, sans-serif'; ctx.fillText(title.toUpperCase(), M, y); y += 46;
    ctx.fillStyle = '#17202e'; ctx.font = `500 ${size}px system-ui, sans-serif`;
    for (const text of lines) {
      for (const l of wrap(ctx, text, W - 2 * M)) { if (y > H - 110) return; ctx.fillText(l, M, y); y += size + 12; }
      y += 8;
    }
    y += 22;
  };
  block(t('fc.tag'), [h.cause, t('fc.pattern', { style: t(`style.${fc.coping.style}`) })]);
  block(t('plan.steps'), planSteps(fc).map((x) => `• ${x}`));
  block(t('plan.budget'), [t('plan.buffer', { amount: money(fc.budget.buffer) })]);
  block(t('plan.contacts'), fc.services.slice(0, 5).map((id) => `• ${supportName(id)}${content.support[id].contacts?.[0] ? ` · ${tx(content.support[id].contacts[0].label)}` : ''}`), 28);
  ctx.fillStyle = '#5a6272'; ctx.font = '500 24px system-ui, sans-serif';
  ctx.fillText(`${t('app.title')} · ${tx(inst().name)} · ${t('family.footer').replace(/^.*?\. /, '')}`, M, H - 50);
  const blob = await new Promise((r) => canvas.toBlob(r, 'image/png'));
  const file = new File([blob], 'first-year-survival-plan.png', { type: 'image/png' });
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: t('plan.tag') }); return; } catch { /* fall back to download */ }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = file.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

// ---------- render ----------

function render() {
  renderTopbar();
  let html = '';
  let withHud = false;
  if (screen === 'intro') html = renderIntro();
  else if (screen === 'setup') html = renderSetup();
  else if (screen === 'mf') html = renderMoneyForecast();
  else if (overlay === 'help') { html = renderHelp(); withHud = true; }
  else {
    withHud = !['forecast', 'plan'].includes(s.phase);
    html = {
      dash: renderDash, event: renderEvent, outcome: renderOutcome, support: renderSupport, friday: renderFriday,
      tests: renderTests, results: renderResults, forecast: renderForecast, plan: renderPlan,
    }[s.phase]();
  }
  app.dataset.screen = screen === 'game' ? s.phase : screen;
  app.innerHTML = (withHud ? hud() : '') + html;
  window.scrollTo({ top: 0 });
  app.querySelector('h1')?.focus({ preventScroll: true });
  if (screen === 'game' && s.phase === 'plan') requestAi();
}

function go(next) {
  s = next;
  save();
  render();
}

// ---------- events ----------

document.addEventListener('click', (e) => {
  if (!e.target.closest('.lang-menu')) setLangMenu(false);
});

document.addEventListener('click', async (e) => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const { action, id } = el.dataset;
  switch (action) {
    case 'lang-toggle': setLangMenu(el.getAttribute('aria-expanded') !== 'true'); return;
    case 'lang-pick':
      setLangMenu(false);
      if (id !== lang) { await setLang(id); render(); }
      topRight.querySelector('.lang-btn')?.focus();
      return;
    case 'home': screen = 'intro'; introStep = 0; overlay = null; render(); return;
    case 'intro-next': introStep += 1; render(); return;
    case 'intro-back': introStep = Math.max(0, introStep - 1); render(); return;
    case 'resume': screen = 'game'; render(); return;
    case 'start-setup': setup = { institution: 'up' }; setupStep = 1; screen = 'setup'; render(); return;
    case 'setup-back':
      if (setupStep === 0) { screen = 'intro'; introStep = 2; } else setupStep -= 1;
      render();
      return;
    case 'pick': {
      const raw = el.dataset.value;
      setup[el.dataset.key] = raw === 'true' ? true : raw === 'false' ? false : raw;
      if (el.dataset.key === 'funding' || el.dataset.key === 'housing') delete setup.monthlyIncome;
      if (setupStep < SETUP_STEPS.length - 1) setupStep += 1;
      else screen = 'mf';
      render();
      return;
    }
    case 'preset': setup.monthlyIncome = Number(el.dataset.value); render(); return;
    case 'money-next': {
      const v = Number(document.getElementById('income')?.value);
      setup.monthlyIncome = Number.isFinite(v) && v >= 0 ? Math.round(v) : E.defaultMonthly(content, setup);
      setupStep += 1;
      render();
      return;
    }
    case 'begin': aiText = null; aiState = 'idle'; screen = 'game'; go(E.newGame(content, setup)); return;
    case 'open-week': go(E.openWeek(s)); return;
    case 'choose': go(E.choose(content, s, id)); return;
    case 'advance': go(E.advance(content, s)); return;
    case 'friday': go(E.friday(content, s, id)); return;
    case 'habit': go(E.setHabit(content, s, id)); return;
    case 'food': overlay = null; go(E.seekFood(content, s)); return;
    case 'help': overlay = 'help'; render(); return;
    case 'close-help': overlay = null; render(); return;
    case 'tests-done': go(E.testsDone(content, s)); return;
    case 'to-forecast': go({ ...s, phase: 'forecast' }); return;
    case 'to-plan': go({ ...s, phase: 'plan' }); return;
    case 'save-image': savePlanImage(); return;
    case 'replay': aiText = null; aiState = 'idle'; go(E.newGame(content, setup)); return;
    case 'new-setup': s = null; store.del(SAVE_KEY); setup = { institution: 'up' }; setupStep = 1; screen = 'setup'; render(); return;
    default:
  }
});

document.addEventListener('keydown', (e) => {
  if (e.target.closest('.lang-menu')) {
    if (e.key === 'Escape') { setLangMenu(false); topRight.querySelector('.lang-btn').focus(); }
    if (['ArrowDown', 'ArrowUp'].includes(e.key)) {
      e.preventDefault();
      const opts = [...topRight.querySelectorAll('.lang-opt')];
      if (topRight.querySelector('.lang-pop').hidden) { setLangMenu(true); return; }
      const i = opts.indexOf(document.activeElement);
      opts[(i + (e.key === 'ArrowDown' ? 1 : opts.length - 1)) % opts.length].focus();
    }
    return;
  }
  if (e.target.matches('input')) {
    if (e.key === 'Enter') document.querySelector('[data-action=money-next]')?.click();
    return;
  }
  if (screen === 'game' && ['event', 'friday'].includes(s?.phase) && /^[1-9]$/.test(e.key)) {
    app.querySelectorAll('[data-action=choose], [data-action=friday]')[Number(e.key) - 1]?.click();
  }
});

document.addEventListener('input', (e) => {
  if (e.target.id === 'income') {
    document.querySelectorAll('[data-action=preset]').forEach((c) => c.classList.toggle('on', Number(c.dataset.value) === Number(e.target.value)));
  }
});

// ---------- boot ----------

async function boot() {
  try {
    [content, fallback] = await Promise.all([getJson('content/up.json'), getJson('i18n/en.json')]);
    strings = fallback;
    const saved = store.get(LANG_KEY) || (navigator.language || '').slice(0, 2);
    if (saved !== 'en') await setLang(saved);
    const prev = store.get(SAVE_KEY);
    if (prev?.s?.v === 1) { setup = prev.setup; s = prev.s; }
    render();
  } catch (err) {
    app.innerHTML = `<p class="loading">Could not load the game. Check your connection and refresh.</p>`;
    console.error(err);
  }
}

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}

boot();
